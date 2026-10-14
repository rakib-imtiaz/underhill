// Staged exploded view.
//
// The models' own explode moves every part at once. Here we call it at 1, read every transform that
// changed, reset it to 0, and then drive each part ourselves on its own delayed, eased window:
// outer covers first, internals after, small parts last (the per-model order lives in each adapter).
// The result is a pure function of t (0 = assembled, 1 = exploded), so it scrubs backward cleanly.
import * as THREE from 'three';
import { OBB, localOBB, toWorld } from './obb.js';

const EPS2 = 1e-12;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class StagedExplode {
  /**
   * @param {object} inst  adapter instance (root, explode, stageOf, unitKeyOf)
   * @param {object} [o]
   * @param {number} [o.step]      time between stage starts (before normalisation)
   * @param {number} [o.dur]       duration of one part's move, in stage steps
   * @param {number} [o.stagger]   offset between parts inside one stage, in stage steps
   * @param {number} [o.floorMargin] keep the exploded assembly this far above the floor
   */
  constructor(inst, { dur = 1.35, stagger = 0.22, floorMargin = 0.025 } = {}) {
    this.inst = inst;
    const root = inst.root;
    const objs = [];
    root.traverse((o) => objs.push(o));
    const snap = () => objs.map((o) => ({ p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }));

    inst.explode(0);
    const rest = snap();
    inst.explode(1);
    const exp = snap();
    inst.explode(0);
    objs.forEach((o, i) => { o.position.copy(rest[i].p); o.quaternion.copy(rest[i].q); o.scale.copy(rest[i].s); });

    this.movers = [];
    objs.forEach((o, i) => {
      const dp = rest[i].p.distanceToSquared(exp[i].p) > EPS2;
      const dq = 1 - Math.abs(rest[i].q.dot(exp[i].q)) > 1e-10;
      const ds = rest[i].s.distanceToSquared(exp[i].s) > EPS2;
      // an adapter may hold a part at rest when the model's own explode would drive it through a neighbour
      if ((dp || dq || ds) && !(inst.freeze && inst.freeze(o))) this.movers.push({ o, rest: rest[i], exp: exp[i], dp, dq, ds });
    });

    // group movers into units (a unit moves as one: e.g. all meshes of one part)
    const units = new Map();
    for (const m of this.movers) {
      const key = inst.unitKeyOf(m.o);
      if (!units.has(key)) units.set(key, { key, stage: inst.stageOf(m.o) ?? 0, movers: [], t0: 0, t1: 1 });
      const u = units.get(key);
      u.stage = Math.min(u.stage, inst.stageOf(m.o) ?? u.stage);
      u.movers.push(m);
    }
    this.units = [...units.values()];

    // parts the model's own explode leaves interlocked (touching both assembled and exploded) must
    // travel together, or a staggered schedule would pull them apart and slide them back through
    // each other. Cluster them and give each cluster one shared window.
    const clusterOf = this.clusterInterlocked(root);

    // schedule: stages start one step apart; clusters inside a stage are staggered; a move lasts `dur`
    const clusters = new Map();
    for (const u of this.units) {
      const c = clusterOf(u);
      const e = clusters.get(c) || clusters.set(c, { key: u.key, stage: u.stage, units: [] }).get(c);
      e.stage = Math.min(e.stage, u.stage);
      if (u.key < e.key) e.key = u.key;
      e.units.push(u);
    }
    // inside a stage, the part that travels farthest leaves first: it is the outer one, so nothing
    // behind it has to slide through it on the way out
    for (const c of clusters.values()) c.disp = Math.max(...c.units.map((u) => u.disp || 0));
    const list = [...clusters.values()].sort((a, b) => (a.stage - b.stage) || (b.disp - a.disp > 1e-4 ? 1 : a.disp - b.disp > 1e-4 ? -1 : a.key.localeCompare(b.key)));
    const stages = [...new Set(list.map((c) => c.stage))].sort((a, b) => a - b);
    const stageIndex = new Map(stages.map((s, i) => [s, i]));
    const count = new Map();
    for (const c of list) {
      const n = count.get(c.stage) || 0;
      count.set(c.stage, n + 1);
      const t0 = stageIndex.get(c.stage) + n * stagger;
      for (const u of c.units) { u.t0 = t0; u.t1 = t0 + dur; u.stage = c.stage; u.cluster = c; u.f = 1; }
    }
    this.clusters = list.length;
    const end = Math.max(1e-6, ...this.units.map((u) => u.t1));
    for (const u of this.units) { u.t0 /= end; u.t1 /= end; }

    // presentation lift: if the exploded assembly would sink through the floor, raise the whole
    // model first (before any part separates), so nothing passes through the ground.
    this.floorMargin = floorMargin;
    this.spread = 1;
    this.measureLift();
    this.t = 0;
  }

  /** The lift (and its phase) for the current spread: sampled over the whole explode. */
  measureLift() {
    const root = this.inst.root;
    this.lift = 0;
    this.liftPhase = 0;
    const box = new THREE.Box3();
    const saved = root.position.y;
    root.position.y = 0;
    root.updateMatrixWorld(true);
    const floor0 = box.setFromObject(root, false).min.y;
    let lowest = floor0;
    for (let i = 1; i <= 24; i++) {
      this.applyParts(i / 24);
      root.updateMatrixWorld(true);
      lowest = Math.min(lowest, box.setFromObject(root, false).min.y);
    }
    this.applyParts(0);
    root.position.y = saved;
    if (lowest < floor0 - 1e-4) {
      this.lift = floor0 - lowest + this.floorMargin;
      this.liftPhase = 0.12;          // first 12 % of the timeline is the lift
    }
  }

  /** How far apart the exploded view goes: 1 = the model's own explode; phones use a gentler one, so
   *  the assembly stays compact and reads as one object. Every move is shortened to s of itself.
   *  Two pieces that are clear of each other at full spread can end up touching at the shortened one
   *  (clearSpread): parts that sit one inside the other when assembled (a tripod leg's clamp collar
   *  round its lower tube) then move together, in one window, so the collar slides along the tube and
   *  never leaves it to come back; parts that were apart when assembled have their moves lengthened, a
   *  step at a time, until they clear. The lift is measured again for the new spread. */
  setSpread(s) {
    s = clamp01(s) || 1;
    if (Math.abs(s - this.spread) < 1e-4) return false;
    const t = this.t;
    this.spread = s;
    for (const u of this.units) {
      // (the model's own schedule, kept: a spread of 1 is exactly the explode as authored)
      if (u.t0o === undefined) { u.t0o = u.t0; u.t1o = u.t1; }
      u.t0 = u.t0o; u.t1 = u.t1o; u.f = s;
    }
    if (s < 1) this.clearSpread(s);
    this.measureLift();
    this.apply(t);
    return true;
  }

  /** Lengthen the moves of parts that a shortened explode leaves touching (see setSpread). */
  clearSpread(s) {
    const root = this.inst.root;
    if (!this.pieces) {
      // every solid piece of every moving unit, as a tight box in its mesh's space (as checkExplode does)
      const unitOf = new Map();
      for (const u of this.units) for (const m of u.movers) unitOf.set(m.o, u);
      const find = (o) => { for (let p = o; p && p !== root.parent; p = p.parent) if (unitOf.has(p)) return unitOf.get(p); return null; };
      this.pieces = [];
      root.traverse((o) => {
        if (!(o.isMesh || o.isInstancedMesh) || !o.visible || o.userData.showcaseOwned) return;
        if (o.material?.transparent && !o.material.alphaTest) return;
        const g = o.geometry;
        if (!g?.attributes?.position || g.attributes.position.count < 4) return;
        const unit = find(o);
        if (!unit) return;
        if (o.isInstancedMesh) {
          const im = new THREE.Matrix4();
          for (let i = 0; i < Math.min(o.count, 64); i++) { o.getMatrixAt(i, im); this.pieces.push({ mesh: o, unit, local: localOBB(g, im.clone()) }); }
        } else this.pieces.push({ mesh: o, unit, local: localOBB(g) });
      });
    }
    const P = this.pieces, N = P.length;
    const pose = (tp = 1) => {
      this.applyParts(tp);
      root.updateMatrixWorld(true);
      return P.map((p) => { const w = toWorld(new OBB(), p.local, p.mesh.matrixWorld); w.r = w.halfSize.length(); return w; });
    };
    const touch = (W, i, j) => W[i].center.distanceTo(W[j].center) < W[i].r + W[j].r && W[i].intersectsOBB(W[j], 1e-6);
    for (const u of this.units) u.f = 0;
    const rest = pose();
    for (const u of this.units) u.f = 1;
    const full = pose();
    for (const u of this.units) u.f = s;
    // pairs of pieces of different parts that touch when assembled
    const nested = [];
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const a = P[i].unit, b = P[j].unit;
      if (a !== b && !(a.cluster && a.cluster === b.cluster) && touch(rest, i, j)) nested.push([i, j]);
    }
    let path = [];
    for (let pass = 0; pass < 10; pass++) {
      const now = pose(), bump = new Set();
      path = [];
      for (let k = 1; k <= 48; k++) path.push(pose(k / 48));
      let synced = false;
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        const a = P[i].unit, b = P[j].unit;
        if (a === b || (a.cluster && a.cluster === b.cluster)) continue;
        if (!touch(now, i, j) || touch(full, i, j)) continue;
        if (touch(rest, i, j)) {
          // one inside the other when assembled: one window for both (the earlier one's)
          if (a.t0 !== b.t0 || a.t1 !== b.t1) {
            const [t0, t1] = a.t0 <= b.t0 ? [a.t0, a.t1] : [b.t0, b.t1];
            for (const v of [a, b]) for (const w of v.cluster ? v.cluster.units : [v]) { w.t0 = t0; w.t1 = t1; }
            synced = true;
          }
        } else { bump.add(a); bump.add(b); }
      }
      // (and along the way: a nested pair that comes apart and touches again before the end)
      for (const [i, j] of nested) {
        const a = P[i].unit, b = P[j].unit;
        if (a.t0 === b.t0 && a.t1 === b.t1) continue;
        let apart = false, back = false;
        for (let k = 1; k <= 48 && !back; k++) { const W = path[k - 1]; const c = touch(W, i, j); if (!c) apart = true; else if (apart) back = true; }
        if (!back) continue;
        const [t0, t1] = a.t0 <= b.t0 ? [a.t0, a.t1] : [b.t0, b.t1];
        for (const v of [a, b]) for (const w of v.cluster ? v.cluster.units : [v]) { w.t0 = t0; w.t1 = t1; }
        synced = true;
      }
      if (!bump.size && !synced) break;
      for (const u of bump) for (const v of u.cluster ? u.cluster.units : [u]) v.f = Math.min(1, v.f + (1 - s) * 0.2);
    }
    this.applyParts(0);
    root.updateMatrixWorld(true);
  }

  /** Union units whose pieces overlap both at rest and fully exploded. Returns unit → cluster id. */
  clusterInterlocked(root) {
    const unitOfMover = new Map();
    for (const u of this.units) for (const m of u.movers) unitOfMover.set(m.o, u);
    const unitOf = (o) => { for (let p = o; p && p !== root.parent; p = p.parent) if (unitOfMover.has(p)) return unitOfMover.get(p); return null; };
    const pieces = [];
    root.traverse((o) => {
      if (!(o.isMesh || o.isInstancedMesh) || !o.visible || o.userData.showcaseOwned) return;
      if (o.material?.transparent && !o.material.alphaTest) return;
      const g = o.geometry;
      if (!g?.attributes?.position || g.attributes.position.count < 4) return;
      const unit = unitOf(o);
      if (!unit) return;
      if (o.isInstancedMesh) {
        const im = new THREE.Matrix4();
        for (let i = 0; i < Math.min(o.count, 64); i++) { o.getMatrixAt(i, im); pieces.push({ mesh: o, unit, local: localOBB(g, im.clone()) }); }
      } else pieces.push({ mesh: o, unit, local: localOBB(g) });
    });
    const snap = (k) => {
      for (const u of this.units) for (const m of u.movers) {
        if (m.dp) m.o.position.lerpVectors(m.rest.p, m.exp.p, k);
        if (m.dq) m.o.quaternion.slerpQuaternions(m.rest.q, m.exp.q, k);
        if (m.ds) m.o.scale.lerpVectors(m.rest.s, m.exp.s, k);
      }
      root.updateMatrixWorld(true);
      return pieces.map((p) => { const w = toWorld(new OBB(), p.local, p.mesh.matrixWorld); w.r = w.halfSize.length(); return w; });
    };
    const wp = () => { const m = new Map(); for (const u of this.units) for (const mv of u.movers) m.set(mv, mv.o.getWorldPosition(new THREE.Vector3())); return m; };
    const A = snap(0); const P0 = wp();
    const B = snap(1); const P1 = wp();
    snap(0);
    for (const u of this.units) u.disp = Math.max(...u.movers.map((mv) => P0.get(mv).distanceTo(P1.get(mv))));
    const parent = new Map(this.units.map((u) => [u, u]));
    const find = (u) => { while (parent.get(u) !== u) { parent.set(u, parent.get(parent.get(u))); u = parent.get(u); } return u; };
    const touch = (W, i, j) => W[i].center.distanceTo(W[j].center) < W[i].r + W[j].r && W[i].intersectsOBB(W[j], 1e-6);
    if (this.inst.together) {
      const groups = new Map();
      for (const u of this.units) {
        const g = this.inst.together(u.movers[0].o);
        if (g == null) continue;
        if (groups.has(g)) parent.set(find(u), find(groups.get(g))); else groups.set(g, u);
      }
    }
    for (let i = 0; i < pieces.length; i++) {
      for (let j = i + 1; j < pieces.length; j++) {
        const ui = pieces[i].unit, uj = pieces[j].unit;
        if (ui === uj || find(ui) === find(uj)) continue;
        if (touch(A, i, j) && touch(B, i, j)) parent.set(find(ui), find(uj));
      }
    }
    return (u) => find(u);
  }

  /** Map the public timeline (with lift phase) onto the parts' timeline. */
  partT(t) {
    if (!this.liftPhase) return t;
    return clamp01((t - this.liftPhase) / (1 - this.liftPhase));
  }

  /** Model-local lift (metres) at explode time t. */
  liftAt(t) {
    if (!this.lift) return 0;
    return this.lift * easeInOutCubic(clamp01(t / this.liftPhase));
  }

  applyParts(tp) {
    for (const u of this.units) {
      const k = easeInOutCubic(clamp01((tp - u.t0) / (u.t1 - u.t0))) * (u.f ?? 1);
      for (const m of u.movers) {
        if (m.dp) m.o.position.lerpVectors(m.rest.p, m.exp.p, k);
        if (m.dq) m.o.quaternion.slerpQuaternions(m.rest.q, m.exp.q, k);
        if (m.ds) m.o.scale.lerpVectors(m.rest.s, m.exp.s, k);
      }
    }
  }

  /** Set the staged explode to t (0..1). Returns the lift to add to the model's height. */
  apply(t) {
    this.t = t;
    this.applyParts(this.partT(t));
    return this.liftAt(t);
  }

  /** Public-timeline time at which an object (and everything above it) has finished moving. */
  settleTime(obj) {
    const movers = new Set(this.movers.map((m) => m.o));
    let end = -1;
    for (let o = obj; o && o !== this.inst.root.parent; o = o.parent) {
      if (!movers.has(o)) continue;
      const u = this.units.find((x) => x.movers.some((m) => m.o === o));
      if (u) end = Math.max(end, u.t1);
    }
    if (end < 0) return null;
    return this.liftPhase + end * (1 - this.liftPhase);
  }
}
