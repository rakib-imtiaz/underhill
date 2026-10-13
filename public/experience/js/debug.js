// Review instrument (dev only, loaded on demand from window.__scene.checkExplode):
// samples the staged explode and reports any part that passes through another part or the floor.
//
// Every mesh (and every instance of an InstancedMesh) gets a tight oriented box from a PCA of its
// vertices. A pair of pieces belonging to different moving units is flagged when they
//   · were apart, touch, then come apart again (one travelled through the other), or
//   · are apart at both ends of the explode but touch somewhere in between, or
//   · were apart when assembled but end up overlapping when exploded.
// Pairs that start in contact (assembled) and separate are normal and not reported.
import * as THREE from 'three';
import { OBB, localOBB, toWorld } from './obb.js';

export function checkExplode(entry, { samples = 90 } = {}) {
  const { inst, staged } = entry;
  const root = inst.root;
  const moverSet = new Map();
  for (const u of staged.units) for (const m of u.movers) moverSet.set(m.o, u.key);
  const unitOf = (o) => { for (let p = o; p && p !== root.parent; p = p.parent) if (moverSet.has(p)) return moverSet.get(p); return 'static'; };

  // pieces
  const pieces = [];
  root.traverse((o) => {
    if (!(o.isMesh || o.isInstancedMesh) || !o.visible || o.userData.showcaseOwned) return;
    if (o.material?.transparent && !o.material.alphaTest) return;
    const g = o.geometry;
    if (!g?.attributes?.position || g.attributes.position.count < 4) return;
    const unit = unitOf(o);
    if (o.isInstancedMesh) {
      const im = new THREE.Matrix4();
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, im); pieces.push({ mesh: o, unit, name: `${o.name}#${i}`, local: localOBB(g, im.clone()) }); }
    } else pieces.push({ mesh: o, unit, name: o.name, local: localOBB(g) });
  });

  const savedT = staged.t; const savedY = root.position.y;
  const N = pieces.length;
  const state = new Map();   // pairKey → array of booleans over time
  const floorHits = [];
  const world = pieces.map(() => new OBB());
  const radius = new Float32Array(N);
  for (let si = 0; si <= samples; si++) {
    const t = si / samples;
    root.position.y = staged.apply(t);
    root.updateMatrixWorld(true);
    for (let i = 0; i < N; i++) {
      toWorld(world[i], pieces[i].local, pieces[i].mesh.matrixWorld);
      radius[i] = world[i].halfSize.length();
    }
    // floor: lowest box corner in world space (station origin is y = 0)
    const base = root.parent ? root.parent.getWorldPosition(new THREE.Vector3()).y : 0;
    for (let i = 0; i < N; i++) {
      const o = world[i]; const r = o.rotation.elements;
      const low = o.center.y - (Math.abs(r[1]) * o.halfSize.x + Math.abs(r[4]) * o.halfSize.y + Math.abs(r[7]) * o.halfSize.z);
      if (low < base - 0.004) floorHits.push({ piece: pieces[i].name, t: +t.toFixed(3), depth: +(base - low).toFixed(4) });
    }
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        if (pieces[i].unit === pieces[j].unit) continue;
        const dc = world[i].center.distanceTo(world[j].center);
        let hit = false;
        if (dc < radius[i] + radius[j]) hit = world[i].intersectsOBB(world[j], 1e-6);
        const key = i * N + j;
        let arr = state.get(key);
        if (!arr) { if (!hit) continue; arr = new Array(si).fill(false); state.set(key, arr); }
        arr.push(hit);
      }
    }
    // pairs that were tracked but skipped this round (no hit and no array yet) are fine; pad the rest
    for (const arr of state.values()) if (arr.length < si + 1) arr.push(false);
  }
  staged.apply(savedT); root.position.y = savedY; root.updateMatrixWorld(true);

  const issues = [];
  for (const [key, arr] of state) {
    const i = Math.floor(key / N), j = key % N;
    const a0 = arr[0], a1 = arr[arr.length - 1];
    // runs of contact
    const runs = []; let start = -1;
    arr.forEach((h, k) => { if (h && start < 0) start = k; if (!h && start >= 0) { runs.push([start, k - 1]); start = -1; } });
    if (start >= 0) runs.push([start, arr.length - 1]);
    let type = null;
    if (!a0 && !a1 && runs.length) type = 'touches mid-flight';
    else if (a0 && runs.length > 1) type = 're-contact after separating';
    else if (!a0 && a1) type = 'ends overlapping';
    if (type) issues.push({ a: pieces[i].name, b: pieces[j].name, units: [pieces[i].unit, pieces[j].unit], type, at: runs.map(([x, y]) => [+(x / samples).toFixed(3), +(y / samples).toFixed(3)]) });
  }
  const floor = floorHits.length ? floorHits.reduce((m, f) => (f.depth > m.depth ? f : m), floorHits[0]) : null;
  return { model: entry.key, pieces: N, units: staged.units.length, lift: +staged.lift.toFixed(3), issues, floorWorst: floor, floorCount: floorHits.length };
}
