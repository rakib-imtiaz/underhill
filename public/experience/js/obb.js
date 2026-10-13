// Oriented boxes for the explode checks: a tight box per mesh from a PCA of its vertices, and a
// correct local → world transform (three's OBB.applyMatrix4 assumes a box centred on the origin).
import * as THREE from 'three';
import { OBB } from 'three/addons/math/OBB.js';

export { OBB };

function jacobiEigen(a) {
  // symmetric 3×3 → eigenvectors (columns of v)
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const m = a.map((r) => r.slice());
  for (let sweep = 0; sweep < 24; sweep++) {
    let p = 0, q = 1, max = Math.abs(m[0][1]);
    if (Math.abs(m[0][2]) > max) { p = 0; q = 2; max = Math.abs(m[0][2]); }
    if (Math.abs(m[1][2]) > max) { p = 1; q = 2; max = Math.abs(m[1][2]); }
    if (max < 1e-12) break;
    const theta = (m[q][q] - m[p][p]) / (2 * m[p][q]);
    const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
    const c = 1 / Math.sqrt(t * t + 1), s = t * c;
    for (let k = 0; k < 3; k++) {
      const mkp = m[k][p], mkq = m[k][q];
      m[k][p] = c * mkp - s * mkq; m[k][q] = s * mkp + c * mkq;
    }
    for (let k = 0; k < 3; k++) {
      const mpk = m[p][k], mqk = m[q][k];
      m[p][k] = c * mpk - s * mqk; m[q][k] = s * mpk + c * mqk;
    }
    for (let k = 0; k < 3; k++) {
      const vkp = v[k][p], vkq = v[k][q];
      v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
    }
  }
  return v;
}

/** Tight local-space OBB of a geometry (optionally under an instance matrix). */
export function localOBB(geo, im = null) {
  const pos = geo.attributes.position;
  const step = Math.max(1, Math.floor(pos.count / 1500));
  const pts = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += step) { v.fromBufferAttribute(pos, i); if (im) v.applyMatrix4(im); pts.push(v.clone()); }
  const mean = new THREE.Vector3();
  for (const p of pts) mean.add(p);
  mean.multiplyScalar(1 / pts.length);
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) {
    const d = [p.x - mean.x, p.y - mean.y, p.z - mean.z];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j];
  }
  const E = jacobiEigen(C);
  const axes = [0, 1, 2].map((k) => new THREE.Vector3(E[0][k], E[1][k], E[2][k]).normalize());
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { const d = p.dot(axes[k]); if (d < min[k]) min[k] = d; if (d > max[k]) max[k] = d; }
  const center = new THREE.Vector3();
  for (let k = 0; k < 3; k++) center.addScaledVector(axes[k], (min[k] + max[k]) / 2);
  // shrink a hair so parts that merely touch at an assembled seam do not count as overlapping
  const half = new THREE.Vector3((max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2).multiplyScalar(0.94);
  const rot = new THREE.Matrix3().set(axes[0].x, axes[1].x, axes[2].x, axes[0].y, axes[1].y, axes[2].y, axes[0].z, axes[1].z, axes[2].z);
  return new OBB(center, half, rot);
}

// note: three's OBB.applyMatrix4 assumes the box is centred on the local origin (it only adds the
// translation to the centre and post-multiplies the rotation), so transform boxes ourselves.
const _m3 = new THREE.Matrix3(); const _s = new THREE.Vector3();
export function toWorld(out, local, m) {
  const e = m.elements;
  const sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]);
  _m3.setFromMatrix4(m);
  const r = _m3.elements;
  r[0] /= sx; r[1] /= sx; r[2] /= sx; r[3] /= sy; r[4] /= sy; r[5] /= sy; r[6] /= sz; r[7] /= sz; r[8] /= sz;
  out.center.copy(local.center).applyMatrix4(m);
  out.rotation.multiplyMatrices(_m3, local.rotation);
  // scale each local box axis by the matrix scale along it
  const le = local.rotation.elements;
  for (let k = 0; k < 3; k++) {
    _s.set(le[k * 3] * sx, le[k * 3 + 1] * sy, le[k * 3 + 2] * sz);
    out.halfSize.setComponent(k, local.halfSize.getComponent(k) * _s.length());
  }
  return out;
}

