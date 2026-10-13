// Scenario A: a city from the local OpenStreetMap extract, built in three.js at load time.
//   buildings  extruded footprints (OSM height or levels x 3.2 m), coloured by type and height, a
//              facade shader for window grids / glass curtain walls (lit windows at night), darker
//              parapet caps, a crown box on the towers; chunked 200 m for culling and raycasts
//   ground     a wide plane, parks / pitches / plazas, roads as ribbons by class with dashed centre
//              lines, the elevated SkyTrain guideway with its columns, trees in the parks
//   filler     low instanced blocks outside the OSM extract (not OSM: just so the city does not end
//              in a cliff before the fog)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { inPoly } from './osm.js';

const CHUNK = 200;
const hash1 = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; };
const rng = (seed) => { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) ^ Math.imul(s ^ (s >>> 13), 3266489917)) >>> 0) / 4294967296; };

const PAL = {
  house: ['#d9cbb4', '#c9b9a0', '#e3dccf', '#b7a58c', '#a7b3b8', '#c4c9c1', '#d6c2a6', '#9fa89a'],
  mid: ['#cfc8bc', '#b9b2a6', '#a89f91', '#c8c3ba', '#9c8f80', '#bfb6a5', '#8d8f91', '#d4d0c8', '#b08f78'],
  tower: ['#8ea6b4', '#7f97a3', '#9fb3ba', '#a7b6bd', '#6f8794', '#b8c3c6', '#8a9aa0', '#c9cfd1'],
  retail: ['#d8d8d4', '#c9cbc9', '#e0ddd5', '#bfc4c6', '#cdc6b8'],
  roof: { house: ['#5b5550', '#6a625a', '#4d4f52', '#76695c'], mid: ['#7d7f80', '#8a8a86', '#6e7174'], tower: ['#55595c', '#626669'], retail: ['#a3a6a7', '#b4b5b2', '#8f9394'] },
};
const HOUSEY = new Set(['house', 'detached', 'semidetached_house', 'terrace', 'bungalow', 'garage', 'garages', 'shed', 'hut', 'cabin']);
const RETAILY = new Set(['retail', 'commercial', 'supermarket', 'industrial', 'warehouse', 'train_station', 'transportation', 'parking', 'school', 'hospital', 'civic', 'public', 'church']);

function styleOf(p, h, area) {
  if (h > 45) return 2;
  if (HOUSEY.has(p.b) || (h <= 10 && area < 400 && !RETAILY.has(p.b))) return 0;
  if (RETAILY.has(p.b) && h <= 20) return 3;
  return 1;
}
const STYLE_NAME = ['house', 'mid', 'tower', 'retail'];

// --------------------------------------------------------------------------------- the material
export function makeBuildingMaterial() {
  const uniforms = { uNight: { value: 0 } };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = uniforms.uNight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aFac; attribute vec4 aB; varying vec2 vFac; varying vec4 vB; varying float vY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFac = aFac; vB = aB; vY = position.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNight; varying vec2 vFac; varying vec4 vB; varying float vY;
        float hh(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float gWin; float gCap; float gLit; vec3 gLitCol;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        gWin = 0.0; gCap = 0.0; gLit = 0.0; gLitCol = vec3(1.0, 0.72, 0.42);
        if (vFac.x >= 0.0) {
          float seed = vB.x; float st = vB.y; float fh = vB.z; float H = vB.w;
          float fl = floor(vFac.y / fh); float fy = fract(vFac.y / fh);
          float colW = st > 1.5 && st < 2.5 ? 1.55 : (st < 0.5 ? 3.3 : 2.9);
          float ci = floor(vFac.x / colW); float fx = fract(vFac.x / colW);
          float w;
          if (st > 1.5 && st < 2.5) {        // tower: glass curtain wall, thin spandrels and mullions
            w = step(0.16, fy) * step(fy, 0.94) * step(0.05, fx) * step(fx, 0.95);
          } else if (st > 2.5) {             // retail: shop glazing on the ground floor, panels above
            w = fl < 0.5 ? step(0.08, fy) * step(fy, 0.82) * step(0.06, fx) * step(fx, 0.94) : step(0.45, fy) * step(fy, 0.7) * step(0.3, fx) * step(fx, 0.7) * 0.6;
          } else {                           // punched windows
            w = step(0.32, fy) * step(fy, 0.82) * step(0.22, fx) * step(fx, 0.78);
          }
          gCap = step(H - 1.1, vY);
          w *= 1.0 - gCap;
          w *= step(0.6, vFac.y);
          gWin = w;
          float r = hh(vec3(ci, fl, seed * 97.0));
          float litFrac = st > 1.5 && st < 2.5 ? 0.3 : (st > 2.5 ? 0.45 : 0.24);
          gLit = step(1.0 - litFrac, r) * w * (0.35 + 0.65 * hh(vec3(ci * 1.7, fl * 0.3, seed)));
          gLitCol = mix(vec3(1.0, 0.7, 0.4), vec3(0.85, 0.9, 1.0), step(0.75, hh(vec3(fl, ci, seed))));
          float gt = fract(seed * 3.7);
          vec3 tint = gt < 0.35 ? vec3(0.07, 0.1, 0.14) : gt < 0.6 ? vec3(0.06, 0.12, 0.12) : gt < 0.8 ? vec3(0.11, 0.1, 0.085) : vec3(0.1, 0.105, 0.115);
          vec3 glassDay = mix(tint, tint * 1.9 + 0.02, r * 0.55);
          vec3 glass = mix(glassDay, vec3(0.012, 0.014, 0.02), uNight);
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, w);
          diffuseColor.rgb *= mix(1.0, 0.68, gCap);
          // a little weathering: darker towards the ground
          diffuseColor.rgb *= 0.86 + 0.14 * smoothstep(0.0, 8.0, vFac.y);
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.08, gWin);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.55, gWin * (1.0 - uNight));')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += gLitCol * gLit * uNight * 0.75;');
  };
  mat.userData.uniforms = uniforms;
  return mat;
}

// ------------------------------------------------------------------------------ building geometry
function ringArea(r) { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return s / 2; }

function buildPrism(pr, out) {
  const p = pr.props, h = pr.h, minH = pr.minH;
  const outer = pr.rings[0];
  const area = Math.abs(ringArea(outer));
  const st = styleOf(p, h, area);
  const seed = hash1(p.id || String(pr.i));
  const pal = PAL[STYLE_NAME[st]];
  let col = new THREE.Color(pal[Math.floor(seed * pal.length)]);
  if (p.col && /^#?[0-9a-f]{6}$/i.test(p.col)) col = new THREE.Color(p.col.startsWith('#') ? p.col : '#' + p.col);
  else if (p.col && /^[a-z]+$/i.test(p.col)) { try { col = new THREE.Color(p.col.toLowerCase()); } catch { /* keep */ } }
  // slight per-building variation
  col.offsetHSL(0, 0, (seed - 0.5) * 0.06);
  const rpal = PAL.roof[STYLE_NAME[st]];
  const roofCol = new THREE.Color(rpal[Math.floor(seed * 7.3 % 1 * rpal.length)]);
  const fh = st === 2 ? 3.1 : st === 3 ? 4.2 : 3.0;
  const B = [seed, st, fh, h];
  const P = out.pos, N = out.nor, C = out.col, F = out.fac, BB = out.bb;
  const tri = (a, b, c, n, cl, fa, fb, fc) => {
    P.push(...a, ...b, ...c); N.push(...n, ...n, ...n); C.push(cl.r, cl.g, cl.b, cl.r, cl.g, cl.b, cl.r, cl.g, cl.b);
    F.push(...fa, ...fb, ...fc); BB.push(...B, ...B, ...B);
  };
  // walls
  pr.rings.forEach((r, ri) => {
    const ccw = ringArea(r) > 0;
    const flip = (ri === 0) !== ccw; // outward for the outer ring, into the courtyard for holes
    let u = 0;
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
      if (L < 0.01) continue;
      // outward normal for a CCW (x, z) ring is (dz, -dx)
      let nx = dz / L, nz = -dx / L; if (flip) { nx = -nx; nz = -nz; }
      const a0 = [a[0], minH, a[1]], b0 = [b[0], minH, b[1]], b1 = [b[0], h, b[1]], a1 = [a[0], h, a[1]];
      const fa0 = [u, minH], fb0 = [u + L, minH], fb1 = [u + L, h], fa1 = [u, h];
      // winding: geometric normal of (a0, b1, b0) is (dz, 0, -dx) * H
      const n = [nx, 0, nz];
      if ((dz * nx - dx * nz) > 0) { tri(a0, b1, b0, n, col, fa0, fb1, fb0); tri(a0, a1, b1, n, col, fa0, fa1, fb1); }
      else { tri(a0, b0, b1, n, col, fa0, fb0, fb1); tri(a0, b1, a1, n, col, fa0, fb1, fa1); }
      u += L;
    }
  });
  // roof (and floor for floating parts)
  const contour = outer.map(([x, z]) => new THREE.Vector2(x, z));
  const holes = pr.rings.slice(1).map((r) => r.map(([x, z]) => new THREE.Vector2(x, z)));
  let faces = [];
  try { faces = THREE.ShapeUtils.triangulateShape(contour, holes); } catch { faces = []; }
  const all = [...contour, ...holes.flat()];
  const NR = [-1, -1];
  for (const [i, j, k] of faces) {
    const A = all[i], Bv = all[j], Cv = all[k];
    const up = (Bv.y - A.y) * (Cv.x - A.x) - (Bv.x - A.x) * (Cv.y - A.y) > 0;
    const v = (q) => [q.x, h, q.y];
    if (up) tri(v(A), v(Bv), v(Cv), [0, 1, 0], roofCol, NR, NR, NR); else tri(v(A), v(Cv), v(Bv), [0, 1, 0], roofCol, NR, NR, NR);
    if (minH > 0.5) { const w = (q) => [q.x, minH, q.y]; if (up) tri(w(A), w(Cv), w(Bv), [0, -1, 0], col, NR, NR, NR); else tri(w(A), w(Bv), w(Cv), [0, -1, 0], col, NR, NR, NR); }
  }
  return { st, area, seed, roofCol };
}

function geoFrom(out) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(out.nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
  g.setAttribute('aFac', new THREE.Float32BufferAttribute(out.fac, 2));
  g.setAttribute('aB', new THREE.Float32BufferAttribute(out.bb, 4));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

// ------------------------------------------------------------------------------------- the city
export function buildCity(osm, { shadows = true } = {}) {
  const group = new THREE.Group(); group.name = 'lab:city';
  const stats = { buildings: 0, tris: 0, roads: 0, trees: 0 };
  const bMat = makeBuildingMaterial();
  // buildings by chunk
  const chunks = new Map();
  const crowns = [];
  for (const pr of osm.prisms) {
    const cx = (pr.box[0] + pr.box[2]) / 2, cz = (pr.box[1] + pr.box[3]) / 2;
    const k = Math.floor(cx / CHUNK) + ',' + Math.floor(cz / CHUNK);
    let o = chunks.get(k); if (!o) chunks.set(k, (o = { pos: [], nor: [], col: [], fac: [], bb: [] }));
    const info = buildPrism(pr, o);
    stats.buildings++;
    if (info.st === 2 && pr.minH < 1) {
      // a mechanical crown on the towers' roofs
      const w = Math.min(pr.box[2] - pr.box[0], pr.box[3] - pr.box[1]);
      if (inPoly(cx, cz, pr.rings) && w > 12) crowns.push({ x: cx, z: cz, y: pr.h, s: Math.min(14, w * 0.38), hh: 3 + info.seed * 4, c: info.roofCol });
    }
  }
  const bMeshes = [];
  for (const [k, o] of chunks) {
    const m = new THREE.Mesh(geoFrom(o), bMat);
    m.name = 'lab:buildings:' + k; m.userData.kind = 'building';
    m.castShadow = shadows; m.receiveShadow = shadows;
    group.add(m); bMeshes.push(m);
    stats.tris += o.pos.length / 9;
  }
  if (crowns.length) {
    const cg = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const cm = new THREE.InstancedMesh(cg, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), crowns.length);
    const M = new THREE.Matrix4();
    crowns.forEach((c, i) => { M.compose(new THREE.Vector3(c.x, c.y, c.z), new THREE.Quaternion(), new THREE.Vector3(c.s, c.hh, c.s * 0.8)); cm.setMatrixAt(i, M); cm.setColorAt(i, c.c.clone().multiplyScalar(1.15)); });
    cm.castShadow = shadows; cm.userData.kind = 'building'; cm.name = 'lab:crowns';
    group.add(cm); bMeshes.push(cm);
  }

  // ground plane
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x8c9682, roughness: 0.95 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000).rotateX(-Math.PI / 2), groundMat);
  ground.receiveShadow = shadows; ground.name = 'lab:ground'; ground.userData.kind = 'ground';
  group.add(ground);

  // areas: parks, pitches, plazas, water
  const areaCols = { green: '#6e8b4c', pitch: '#7fa05a', wood: '#4d6b3a', plaza: '#b4ada1', water: '#4f7590' };
  const areaGeos = {};
  for (const a of osm.areas) {
    const k = a.props.k; if (!areaCols[k]) continue;
    const contour = a.rings[0].map(([x, z]) => new THREE.Vector2(x, z));
    const holes = a.rings.slice(1).map((r) => r.map(([x, z]) => new THREE.Vector2(x, z)));
    let faces; try { faces = THREE.ShapeUtils.triangulateShape(contour, holes); } catch { continue; }
    const all = [...contour, ...holes.flat()];
    const y = k === 'plaza' ? 0.05 : k === 'pitch' ? 0.035 : 0.025;
    const arr = (areaGeos[k] ||= []);
    for (const [i, j, l] of faces) {
      const A = all[i], Bv = all[j], Cv = all[l];
      const up = (Bv.y - A.y) * (Cv.x - A.x) - (Bv.x - A.x) * (Cv.y - A.y) > 0;
      const tri = up ? [A, Bv, Cv] : [A, Cv, Bv];
      for (const q of tri) arr.push(q.x, y, q.y);
    }
  }
  for (const [k, arr] of Object.entries(areaGeos)) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: areaCols[k], roughness: k === 'water' ? 0.2 : 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    m.receiveShadow = shadows; m.userData.kind = 'ground'; m.name = 'lab:area:' + k;
    group.add(m);
  }

  // roads
  const W = { motorway: 22, trunk: 20, primary: 19, primary_link: 8, secondary: 14, secondary_link: 7, tertiary: 11, tertiary_link: 6, residential: 8.5, unclassified: 8, living_street: 6, service: 5, pedestrian: 6, footway: 2.4, path: 2, cycleway: 2.5, track: 3, services: 6 };
  const car = new Set(['motorway', 'trunk', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'residential', 'unclassified', 'living_street', 'service', 'services']);
  const roadA = [], walkA = [], lineA = [];
  const ribbon = (pts, w, y, arr, caps) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 0.05) continue;
      const nx = -dz / L * w / 2, nz = dx / L * w / 2;
      // two triangles facing up
      arr.push(ax + nx, y, az + nz, bx + nx, y, bz + nz, ax - nx, y, az - nz);
      arr.push(bx + nx, y, bz + nz, bx - nx, y, bz - nz, ax - nx, y, az - nz);
    }
    if (caps) for (const [x, z] of pts) { const n = 10; for (let k = 0; k < n; k++) { const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2; arr.push(x, y, z, x + Math.cos(a1) * w / 2, y, z + Math.sin(a1) * w / 2, x + Math.cos(a0) * w / 2, y, z + Math.sin(a0) * w / 2); } }
  };
  for (const r of osm.roads) {
    const hw = r.props.hw; const w = (r.props.lanes ? Math.max(W[hw] || 6, r.props.lanes * 3.4) : W[hw]) || 0;
    if (!w) continue;
    if (car.has(hw)) {
      ribbon(r.pts, w, 0.07, roadA, true);
      if (['primary', 'secondary', 'tertiary', 'trunk'].includes(hw)) {
        // dashed centre line: 3 m dash, 6 m gap
        for (let i = 0; i < r.pts.length - 1; i++) {
          const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1]; const L = Math.hypot(bx - ax, bz - az);
          for (let s = 0; s + 3 < L; s += 9) { const t0 = s / L, t1 = (s + 3) / L; ribbon([[ax + (bx - ax) * t0, az + (bz - az) * t0], [ax + (bx - ax) * t1, az + (bz - az) * t1]], 0.18, 0.09, lineA, false); }
        }
      }
    } else ribbon(r.pts, w, 0.055, walkA, false);
    stats.roads++;
  }
  const mk = (arr, mat, name) => { if (!arr.length) return null; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); const n = new Float32Array(arr.length); for (let i = 1; i < n.length; i += 3) n[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(n, 3)); const m = new THREE.Mesh(g, mat); m.receiveShadow = shadows; m.name = name; m.userData.kind = 'ground'; group.add(m); return m; };
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x3b3e42, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const walkMat = new THREE.MeshStandardMaterial({ color: 0xa8a39a, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1.5, polygonOffsetUnits: -3 });
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xe8e2c8, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  mk(walkA, walkMat, 'lab:paths'); const roads = mk(roadA, roadMat, 'lab:roads'); mk(lineA, lineMat, 'lab:lines');

  // the SkyTrain guideway (OSM: railway=subway, bridge=yes)
  const guide = [];
  const cols = [];
  for (const r of osm.rails) {
    if (!r.props.bridge) continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1]; const L = Math.hypot(bx - ax, bz - az); if (L < 0.1) continue;
      const g = new THREE.BoxGeometry(L + 0.6, 1.5, 5.2); g.rotateY(-Math.atan2(bz - az, bx - ax)); g.translate((ax + bx) / 2, 8.2, (az + bz) / 2);
      guide.push(g);
    }
    let acc = 0;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1]; const L = Math.hypot(bx - ax, bz - az);
      while (acc < L) { const t = acc / L; cols.push([ax + (bx - ax) * t, az + (bz - az) * t]); acc += 28; }
      acc -= L;
    }
  }
  const concrete = new THREE.MeshStandardMaterial({ color: 0xc9c6bf, roughness: 0.85 });
  if (guide.length) {
    const gm = new THREE.Mesh(mergeGeometries(guide), concrete); gm.castShadow = shadows; gm.receiveShadow = shadows; gm.userData.kind = 'other'; gm.name = 'lab:guideway'; group.add(gm);
    const cg = new THREE.CylinderGeometry(0.85, 1.0, 7.5, 10).translate(0, 3.75, 0);
    const cm = new THREE.InstancedMesh(cg, concrete, cols.length); const M = new THREE.Matrix4();
    cols.forEach(([x, z], i) => { M.makeTranslation(x, 0, z); cm.setMatrixAt(i, M); });
    cm.castShadow = shadows; cm.userData.kind = 'other'; cm.name = 'lab:columns'; group.add(cm);
  }

  // trees: in parks and woods, and along residential streets
  const treePts = [];
  const R = rng(4242);
  for (const a of osm.areas) {
    if (!['green', 'wood'].includes(a.props.k)) continue;
    const r0 = a.rings[0]; let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of r0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const area = Math.abs(ringArea(r0)); const n = Math.min(900, Math.floor(area / (a.props.k === 'wood' ? 45 : 140)));
    for (let i = 0, tries = 0; i < n && tries < n * 4; tries++) {
      const x = x0 + (x1 - x0) * R(), z = z0 + (z1 - z0) * R();
      if (!inPoly(x, z, a.rings) || osm.inside(x, 1, z)) continue;
      treePts.push([x, z, a.props.k === 'wood' ? 1 : R()]); i++;
    }
  }
  for (const r of osm.roads) {
    if (!['residential', 'tertiary', 'secondary'].includes(r.props.hw)) continue;
    const off = (W[r.props.hw] || 8) / 2 + 2.2;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1]; const L = Math.hypot(bx - ax, bz - az); if (L < 4) continue;
      const nx = -(bz - az) / L, nz = (bx - ax) / L;
      for (let s = 5; s < L - 3; s += 13) for (const side of [1, -1]) {
        const x = ax + (bx - ax) * s / L + nx * off * side, z = az + (bz - az) * s / L + nz * off * side;
        if (osm.inside(x, 1, z) || R() < 0.25) continue;
        treePts.push([x, z, 0.2 + R() * 0.3]);
      }
    }
  }
  if (treePts.length) {
    const trunk = new THREE.CylinderGeometry(0.16, 0.22, 3, 6).translate(0, 1.5, 0);
    const crownD = new THREE.IcosahedronGeometry(2.6, 1).scale(1, 0.85, 1).translate(0, 4.6, 0);
    const crownC = new THREE.ConeGeometry(2.1, 7, 8).translate(0, 6, 0);
    const paint = (g0, c) => { const g = g0.index ? g0.toNonIndexed() : g0; const n = g.attributes.position.count; const a = new Float32Array(n * 3); const col = new THREE.Color(c); for (let i = 0; i < n; i++) col.toArray(a, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
    const decid = mergeGeometries([paint(trunk.clone(), 0x5a4636), paint(crownD, 0xffffff)]);
    const conif = mergeGeometries([paint(trunk.clone(), 0x5a4636), paint(crownC, 0xffffff)]);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    const conifPts = treePts.filter((t) => t[2] > 0.72), decPts = treePts.filter((t) => t[2] <= 0.72);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), V = new THREE.Vector3(), C = new THREE.Color();
    for (const [geo, pts, base] of [[decid, decPts, [0x4f7a35, 0x5d8a3c, 0x6b8f3f, 0x45683a]], [conif, conifPts, [0x2f5232, 0x355c36, 0x3d6640]]]) {
      if (!pts.length) continue;
      const im = new THREE.InstancedMesh(geo, mat, pts.length);
      pts.forEach(([x, z, k], i) => {
        const s = 0.75 + R() * 0.7; Q.setFromAxisAngle(V.set(0, 1, 0), R() * 6.28);
        M.compose(V.set(x, 0, z), Q, S.set(s, s * (0.9 + R() * 0.3), s)); im.setMatrixAt(i, M);
        im.setColorAt(i, C.set(base[Math.floor(R() * base.length)]).offsetHSL(0, 0, (R() - 0.5) * 0.06));
      });
      im.castShadow = shadows; im.receiveShadow = false; im.userData.kind = 'other'; im.name = 'lab:trees'; group.add(im);
    }
    stats.trees = treePts.length;
  }

  // filler blocks outside the OSM extract (not OSM data)
  const fill = [];
  const FR = rng(77);
  for (let x = -2600; x <= 2600; x += 46) for (let z = -2600; z <= 2600; z += 46) {
    if (x > -540 && x < 740 && z > -810 && z < 455) continue; // the OSM extract (bbox in the lab frame)
    if (Math.abs(x % 230) < 46 || Math.abs(z % 230) < 46) continue; // streets
    if (FR() < 0.25) continue;
    const d = Math.hypot(x, z) / 2600;
    const tall = FR() < 0.035 * (1 - d) ? 30 + FR() * 70 : 0;
    fill.push([x + (FR() - 0.5) * 10, z + (FR() - 0.5) * 10, 14 + FR() * 22, 14 + FR() * 22, tall || 5 + FR() * FR() * 18]);
  }
  if (fill.length) {
    const fg = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const fm = new THREE.InstancedMesh(fg, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), fill.length);
    const M = new THREE.Matrix4(), C = new THREE.Color();
    const fpal = [...PAL.house, ...PAL.mid];
    fill.forEach(([x, z, sx, sz, h], i) => { M.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(sx, h, sz)); fm.setMatrixAt(i, M); fm.setColorAt(i, C.set(fpal[Math.floor(FR() * fpal.length)])); });
    fm.userData.kind = 'filler'; fm.name = 'lab:filler'; fm.receiveShadow = false; fm.castShadow = false;
    group.add(fm);
  }

  return { group, bMeshes, bMat, roadMat, groundMat, stats, roads };
}
