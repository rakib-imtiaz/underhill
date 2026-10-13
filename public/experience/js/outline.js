// A model's outline for framing and for keeping overlays clear of it.
//
// Of all its visible meshes' own box corners (a much tighter outline than one box round the whole
// model: thin legs and masts leave the space between them free), the one furthest out in each of 48
// directions. The projected convex hull of these is the model's silhouette, to within a sliver. It
// is cached until the model's pose signature (entry.sig, set by main.js each frame) or its placement
// changes, so a standing instrument costs a few dozen points a frame.
//
// The outline is a pure function of the pose: anything that turns on its own clock is kept out of it.
// A node with `userData.outlinePts` (points in its parent's axes, relative to the node's own position:
// e.g. a rotor's parked blades) stands in for everything under it, whatever the node's own rotation,
// so a spinning rotor never makes the outline (and the camera fitted to it) shake; meshes with
// `userData.outlineSkip` (a rotor's blur disc) are left out.
import * as THREE from 'three';

/** the corners of every visible mesh's own box: a much tighter outline of a model than one box
 *  round all of it (thin legs and masts leave the space between them free) */
const _m = new THREE.Box3(), _p = new THREE.Vector3();
export function meshPoints(obj) {
  if (!obj) return [];
  const pts = [];
  obj.updateMatrixWorld(true);
  const visit = (o) => {
    if (!o.visible) return;
    const stand = o.userData.outlinePts;
    if (stand && o.parent) {
      // a stand-in, fixed in the parent's frame: whatever turns under this node does not move it
      for (const q of stand) pts.push(_p.copy(q).add(o.position).applyMatrix4(o.parent.matrixWorld).clone());
      return;
    }
    if (o.isMesh && o.material?.visible !== false && !o.userData.outlineSkip) {
      if (o.isInstancedMesh) {
        if (!o.boundingBox) o.computeBoundingBox();
        _m.copy(o.boundingBox);
      } else {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        _m.copy(o.geometry.boundingBox);
      }
      if (!_m.isEmpty()) {
        for (let i = 0; i < 8; i++) {
          _p.set(i & 1 ? _m.max.x : _m.min.x, i & 2 ? _m.max.y : _m.min.y, i & 4 ? _m.max.z : _m.min.z);
          pts.push(_p.clone().applyMatrix4(o.matrixWorld));
        }
      }
    }
    for (const c of o.children) visit(c);
  };
  visit(obj);
  return pts;
}
/** 48 directions spread evenly over the sphere (Fibonacci) */
const DIRS = Array.from({ length: 48 }, (_, i) => {
  const y = 1 - (2 * (i + 0.5)) / 48, r = Math.sqrt(1 - y * y), a = i * Math.PI * (3 - Math.sqrt(5));
  return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
});
/** The outline of a model root as it stands now (uncached): of its mesh-box corners, the one furthest
 *  out in each of 48 directions. `force`: count the root even while it is hidden. */
export function outlinePoints(obj, { force = false } = {}) {
  if (!obj) return [];
  const was = obj.visible;
  if (force) obj.visible = true;
  const all = meshPoints(obj), pick = new Set();
  obj.visible = was;
  for (const d of DIRS) {
    let best = -Infinity, bi = -1;
    for (let i = 0; i < all.length; i++) { const v = all[i]; const t = v.x * d.x + v.y * d.y + v.z * d.z; if (t > best) { best = t; bi = i; } }
    if (bi >= 0) pick.add(bi);
  }
  return [...pick].map((i) => all[i]);
}
/**
 * A model's outline for the cards to avoid: of all its mesh-box corners, the one furthest out in each
 * of 48 directions (the projected hull of these is the model's silhouette, to within a sliver).
 * Cached until the model's pose signature or placement changes, so a standing instrument costs a
 * few dozen projections a frame instead of thousands of corners.
 */
const _outline = new WeakMap();
export function outlineOf(entry) {
  const obj = entry?.inst.root;
  if (!obj) return [];
  obj.updateMatrixWorld(true);
  const e = obj.matrixWorld.elements;
  const sig = `${entry.sig}|${obj.visible ? 1 : 0}|${e[12].toFixed(3)},${e[13].toFixed(3)},${e[14].toFixed(3)},${e[0].toFixed(3)},${e[2].toFixed(3)},${e[9].toFixed(3)}`;
  const c = _outline.get(obj);
  if (c && c.sig === sig) return c.pts;
  const pts = outlinePoints(obj);
  _outline.set(obj, { sig, pts });
  return pts;
}
