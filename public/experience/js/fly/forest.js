// Fly mode: trees and rocks. Replaces the film's single instanced conifer.
//
//   near     four low-poly conifer variants (spruce, fir, lodgepole pine, young tree), one InstancedMesh
//            each with a per-instance tint, grown in stands on the valley walls and sparse in the meadow,
//            inside the flying area (±600 m); counts per quality tier
//   far      far-forest impostors: one Points draw of conifer silhouettes on the far slopes out to
//            ~4 km, sized by distance, lit and fogged like everything else
//   boulders instanced rough icosahedra along the creek and on the slopes
// Each near tree is also a record { x, z, g, y0, y1, R, rt } for the analytic queries (query.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ground, creekZ, trackDist, fbm, standMask } from './terrain.js';
import { FIELD } from '../field.js';

const COUNTS = {
  lite: { trees: 700, far: 5000, rocks: 50 },
  balanced: { trees: 1500, far: 10000, rocks: 120 },
  high: { trees: 3000, far: 18000, rocks: 240 },
};

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** The variants: geometry (unit size, base at y = 0) and the crown envelope for queries (in the same units). */
function variants(seg) {
  const ni = (g) => (g.index ? g.toNonIndexed() : g);
  const cone = (r, h, y, s = seg) => ni(new THREE.ConeGeometry(r, h, s).translate(0, y + h / 2, 0));
  const trunk = (r, h) => ni(new THREE.CylinderGeometry(r * 0.75, r, h, 5).translate(0, h / 2, 0));
  return [
    // Engelmann spruce: three stacked tiers, broad
    { geo: mergeGeometries([trunk(0.13, 1.2), cone(1.3, 2.5, 0.8), cone(1.0, 2.2, 2.1), cone(0.65, 1.9, 3.3)]), y0: 0.8, y1: 5.2, R: 1.3, rt: 0.13, w: 0.38, tint: [0.9, 1.0, 0.95] },
    // subalpine fir: tall and narrow
    { geo: mergeGeometries([trunk(0.11, 1.0), cone(0.9, 2.4, 0.7), cone(0.72, 2.2, 2.0), cone(0.52, 2.1, 3.3), cone(0.32, 1.7, 4.6)]), y0: 0.7, y1: 6.3, R: 0.92, rt: 0.11, w: 0.27, tint: [0.82, 0.98, 1.05] },
    // lodgepole pine: a bare trunk and a short, rounder crown
    { geo: mergeGeometries([trunk(0.12, 3.0), cone(1.05, 1.7, 2.6, Math.max(5, seg - 1)), cone(0.85, 1.6, 3.6, Math.max(5, seg - 1)), cone(0.45, 1.1, 4.7, 5)]), y0: 2.6, y1: 5.8, R: 1.05, rt: 0.12, w: 0.2, tint: [1.12, 1.05, 0.78] },
    // young tree
    { geo: mergeGeometries([trunk(0.06, 0.4), cone(0.7, 2.1, 0.3)]), y0: 0.3, y1: 2.4, R: 0.72, rt: 0.06, w: 0.15, tint: [1.0, 1.1, 0.9] },
  ];
}

export class Forest {
  constructor(scene, Q, { truck }) {
    const C = COUNTS[Q.tier] || COUNTS.balanced;
    const V = variants(Q.tier === 'high' ? 6 : 5);
    const r = rng(91);
    const P = FIELD.parcel;
    const pc = Math.cos(P.rot), ps = Math.sin(P.rot);
    const inParcel = (x, z, m) => { const dx = x - P.cx, dz = z - P.cz; const a = dx * pc + dz * ps, b = -dx * ps + dz * pc; return Math.abs(a) < P.ha + m && Math.abs(b) < P.hc + m; };
    const blocked = (x, z) => {
      if (inParcel(x, z, 8)) return true;
      if (Math.hypot(x - 0.3, (z - 1.2) * 1.15) < 26) return true;                       // the crew's terrace
      if (Math.hypot(x - truck.x, z - truck.z) < 9) return true;
      if (trackDist(x, z) < 4.5) return true;
      if (Math.abs(z - creekZ(x)) < 6.5) return true;
      return false;
    };
    // where trees grow: stands on the valley walls, sparse in the meadow
    const density = (x, z) => {
      const dc = Math.abs(z - creekZ(x));
      // stands: a noise mask, thresholded so the budget goes into patches of closed forest
      const stand = Math.min(1, Math.max(0, (fbm(x * 0.0085 + 9, z * 0.0085 - 4, 3) - 0.06) * 4.5));
      const wall = Math.min(1, Math.max(0, (dc - 40) / 120));
      return 0.012 + 0.988 * stand * (0.45 + 0.55 * wall);
    };
    const lists = V.map(() => []);
    this.trees = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    for (let n = 0; n < C.trees * 40 && this.trees.length < C.trees; n++) {
      const x = (r() - 0.5) * 1200, z = (r() - 0.5) * 1200;
      if (blocked(x, z) || r() > density(x, z)) continue;
      const g = ground(x, z);
      if (g > 160) continue;
      // pick a variant by weight
      let pick = r(), vi = 0;
      for (; vi < V.length - 1; vi++) { if (pick < V[vi].w) break; pick -= V[vi].w; }
      const v = V[vi];
      // BC conifers: 10–25 m (the young ones 3–7 m)
      const sc = vi === 3 ? 1.4 + r() * 1.6 : 2.0 + r() * 2.2, sy = sc * (0.85 + r() * 0.35);
      q.setFromAxisAngle(up, r() * 6.28);
      m.compose(p.set(x, g - 0.1, z), q, s.set(sc, sy, sc));
      const k = 0.78 + r() * 0.42;
      col.setRGB(v.tint[0] * k, v.tint[1] * k, v.tint[2] * k);
      lists[vi].push({ m: m.clone(), c: col.clone() });
      this.trees.push({ x, z, g: g - 0.1, y0: g - 0.1 + v.y0 * sy, y1: g - 0.1 + v.y1 * sy, R: v.R * sc * 1.05, rt: v.rt * sc });
    }
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.026, 0.05, 0.026, THREE.LinearSRGBColorSpace), roughness: 0.95, metalness: 0, name: 'fly-conifer' });
    this.meshes = V.map((v, i) => {
      const L = lists[i];
      const im = new THREE.InstancedMesh(v.geo, mat, Math.max(1, L.length));
      L.forEach((t, j) => { im.setMatrixAt(j, t.m); im.setColorAt(j, t.c); });
      im.count = L.length;
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      im.name = `fly:trees-${i}`;
      scene.add(im);
      return im;
    });
    this.buildFar(scene, C.far, r);
    this.buildRocks(scene, C.rocks, r, blocked);
  }

  /** Far-forest impostors on the far slopes (one Points draw). */
  buildFar(scene, count, r) {
    const pos = [], size = [], tint = [];
    for (let n = 0; n < count * 30 && size.length < count; n++) {
      const a = r() * Math.PI * 2, d = 560 + Math.pow(r(), 1.3) * 3600;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const g = ground(x, z);
      const dc = Math.abs(z - creekZ(x));
      if (dc < 80 || g > 700 + 200 * fbm(x * 0.002, z * 0.002, 2)) continue;   // not on the river, not above the tree line
      if (standMask(x, z) < 0.5 && r() > 0.06) continue;                       // on the ground shader's forest stands
      const h = 16 + r() * 16;
      pos.push(x, g + h * 0.42, z); size.push(h); tint.push(0.75 + r() * 0.5);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
    geo.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 1));
    this.farU = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uLight: { value: new THREE.Color(1, 1, 1) }, uScale: { value: 400 } }]);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.farU, fog: true, transparent: false,
      vertexShader: /* glsl */`
        #include <common>
        #include <fog_pars_vertex>
        attribute float aSize; attribute float aTint; uniform float uScale; varying float vT;
        void main(){
          vT = aTint;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = clamp(uScale * aSize / -mvPosition.z, 1.5, 28.0);
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <common>
        #include <fog_pars_fragment>
        uniform vec3 uLight; varying float vT;
        void main(){
          vec2 c = gl_PointCoord;                       // y grows downward: the tip is at the top
          float w = (c.y - 0.04) * 0.42;
          if (c.y < 0.04 || c.y > 0.92 || abs(c.x - 0.5) > w) discard;
          gl_FragColor = vec4(vec3(0.026, 0.05, 0.026) * vT * uLight, 1.0);
          #include <fog_fragment>
        }`,
    });
    this.far = new THREE.Points(geo, mat);
    this.far.frustumCulled = false;
    this.far.name = 'fly:far-forest';
    scene.add(this.far);
  }

  buildRocks(scene, count, r, blocked) {
    const base = new THREE.IcosahedronGeometry(1, 0);
    const pa = base.attributes.position;
    // jitter each corner by a hash of its position (the faces share corners by position, not by index)
    for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i); const h = Math.sin(x * 12.99 + y * 78.23 + z * 37.71) * 43758.5453; const k = 0.78 + 0.4 * (h - Math.floor(h)); pa.setXYZ(i, x * k, y * k * 0.72, z * k); }
    base.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.2, 0.19, 0.17, THREE.LinearSRGBColorSpace), roughness: 0.92, metalness: 0, flatShading: true, name: 'fly-rock' });
    const list = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    for (let n = 0; n < count * 40 && list.length < count; n++) {
      const nearCreek = r() < 0.45;
      const x = (r() - 0.5) * 700;
      const z = nearCreek ? creekZ(x) + (r() < 0.5 ? -1 : 1) * (4.5 + r() * 9) : (r() - 0.5) * 700;
      if (!nearCreek && blocked(x, z)) continue;
      if (inSite(x, z)) continue;
      const sc = 0.35 + Math.pow(r(), 2.2) * 1.5;
      const g = ground(x, z);
      e.set(r() * 0.5, r() * 6.28, r() * 0.5); q.setFromEuler(e);
      m.compose(p.set(x, g - sc * 0.25, z), q, s.set(sc * (0.8 + r() * 0.6), sc, sc * (0.8 + r() * 0.6)));
      const k = 0.75 + r() * 0.5;
      list.push({ m: m.clone(), c: new THREE.Color(k, k * (0.97 + r() * 0.06), k * 0.95) });
    }
    const im = new THREE.InstancedMesh(base, mat, Math.max(1, list.length));
    list.forEach((t, j) => { im.setMatrixAt(j, t.m); im.setColorAt(j, t.c); });
    im.count = list.length;
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    im.receiveShadow = true;
    im.name = 'fly:boulders';
    scene.add(im);
    this.rocks = im;
  }

  /** Light-only: the far impostors' light level (they are unlit silhouettes). */
  setLight(c) { this.farU.uLight.value.copy(c); }

  get all() { return [...this.meshes, this.far, this.rocks]; }
}

// boulders keep off the crew's terrace and the landing area
function inSite(x, z) { return Math.hypot(x - 0.3, (z - 1.2) * 1.15) < 24; }
