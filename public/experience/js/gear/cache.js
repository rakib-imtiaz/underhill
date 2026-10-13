// Underhill v2 — gear playground: builds gear models on demand and keeps the last few.
//
//   const cache = new GearCache({ Q, mobile });
//   const entry = await cache.load(gearEntry(id), { onStage })   // { id, inst, staged, labels, box, buildMs }
//   cache.evict(keepId)        // disposes the least recently used models over Q.modelBudget
//
// Each entry wraps the adapter instance (js/adapters/*) in the film's StagedExplode, resolves its label
// anchors with labels.js, and measures its rest bounding box (for the camera fit). A model that is
// evicted is disposed (geometries, materials, textures), so its shader programs are released too.
import * as THREE from 'three';
import { StagedExplode } from '../explode.js';
import { resolveAnchor } from '../labels.js';

/** Yield to the browser so a loader can paint (MessageChannel: not throttled in a hidden tab). */
export const nextTick = () => new Promise((res) => { const ch = new MessageChannel(); ch.port1.onmessage = () => res(); ch.port2.postMessage(0); });

export class GearCache {
  constructor({ Q, mobile }) {
    this.Q = Q;
    this.mobile = mobile;
    this.budget = Math.max(1, Q.modelBudget | 0);
    this.map = new Map();          // id → entry
    this.pending = new Map();      // id → Promise<entry>
    this.clock = 0;
    this.active = null;            // the id on stage (never evicted)
  }

  has(id) { return this.map.has(id); }

  load(gear, { onStage = () => {} } = {}) {
    const id = gear.id;
    if (this.map.has(id)) { const e = this.map.get(id); e.used = ++this.clock; return Promise.resolve(e); }
    if (this.pending.has(id)) return this.pending.get(id);
    const p = (async () => {
      onStage('Loading the model code');
      const mod = await gear.load();
      onStage('Building the geometry');
      await nextTick();
      const t0 = performance.now();
      const inst = await mod.default.create({ mobile: this.mobile, q: this.Q });
      gear.setup?.(inst, THREE);
      inst.root.updateMatrixWorld(true);
      onStage('Staging the exploded view');
      await nextTick();
      const staged = new StagedExplode(inst);
      const specs = gear.labels || inst.labels || [];
      const labels = specs.map((spec) => {
        const a = resolveAnchor(inst.root, spec);
        if (!a) { console.warn(`[gear] ${id}: label "${spec.id}" has no node "${spec.node}"`); return null; }
        return { ...spec, obj: a.obj, node: a.node, local: a.local };
      }).filter(Boolean);
      // the rest box (visible meshes only), for framing
      const box = new THREE.Box3();
      inst.root.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.visible && !o.userData.showcaseOwned) box.expandByObject(o, false); });
      const entry = { id, inst, staged, labels, box, buildMs: Math.round(performance.now() - t0), used: ++this.clock, rigDone: false };
      this.map.set(id, entry);
      this.pending.delete(id);
      return entry;
    })();
    p.catch(() => this.pending.delete(id));
    this.pending.set(id, p);
    return p;
  }

  /** Dispose the least recently used models until the cache fits its budget (never `keep`). */
  evict(keep = this.active) {
    while (this.map.size > this.budget) {
      const victims = [...this.map.values()].filter((e) => e.id !== keep).sort((a, b) => a.used - b.used);
      if (!victims.length) break;
      const v = victims[0];
      this.map.delete(v.id);
      try { v.rig?.dispose?.(); } catch (e) { /* best effort */ }
      try { v.inst.dispose(); } catch (e) { console.warn('[gear] dispose failed', e); }
    }
  }
}
