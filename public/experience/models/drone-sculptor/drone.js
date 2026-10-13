// Enterprise survey drone — procedural Three.js model.
// Units: metres. Y up, nose toward +Z, origin at the centre of the footprint, feet at y = 0.
//
//   import { createSurveyDrone } from './src/drone.js';
//   const drone = createSurveyDrone();      // THREE.Group
//   scene.add(drone);
//   drone.setExplode(t);                    // 0..1, exploded view like refs 17/18
//   drone.setArmFold(t);                    // 0..1, arm stow
//   drone.setRotorSpeed(radPerSec);         // rotor spin, advanced by drone.update(dt)
//   drone.update(dt);                       // call every frame
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ------------------------------------------------------------------ dimensions
export const DRONE_DIMENSIONS = Object.freeze({
  armY: 0.262,            // arm tube axis height
  motorX: 0.40,           // motor centre |x|
  motorZ: 0.28,           // motor centre |z|
  armRootX: 0.060, armRootZ: 0.100,
  bodyW: 0.150, bodyL: 0.240, bodyY0: 0.235, bodyY1: 0.392,
  propRadius: 0.265,      // 21-inch (533 mm) props, as on the M350 RTK
  legTop: [0.085, 0.236, 0.075], foot: [0.205, 0.03, 0.10],
});
const D = DRONE_DIMENSIONS;
const ARM_Y = D.armY;
const BODY_Y0 = D.bodyY0;
const UP = new THREE.Vector3(0, 1, 0);
const SLEEVE_X = 0.066; // sleeve centre / fold hinge along the arm
const TINY_MATERIALS = new Set(['lens-glass', 'chrome', 'led-white', 'led-red', 'beacon', 'thermal-glass', 'laser-window', 'seal-orange']);

// ------------------------------------------------------------------ geometry helpers
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3(1, 1, 1);

/** Bake a transform into a geometry. p: position, r: euler (rad), q: quaternion, s: scale */
function xf(geo, { p = [0, 0, 0], r = null, q = null, s = null } = {}) {
  if (q) _q.copy(q); else _q.setFromEuler(_e.set(...(r || [0, 0, 0])));
  _m.compose(new THREE.Vector3(...p), _q, s ? new THREE.Vector3(...s) : _s);
  geo.applyMatrix4(_m);
  return geo;
}
const cyl = (r1, r2, h, seg = 24, open = false) => new THREE.CylinderGeometry(r1, r2, h, seg, 1, open);
/** Cylinder spanning two points a -> b (radius ra at a, rb at b) */
function cylAB(a, b, ra, rb = ra, seg = 20, open = false) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const dir = B.clone().sub(A), len = dir.length();
  const g = cyl(rb, ra, len, seg, open);
  return xf(g, { p: A.clone().addScaledVector(dir, 0.5).toArray(), q: new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()) });
}
/** Lathe around Y from [radius, y] pairs (any vertical order; winding fixed for outward faces) */
function lathe(profile, seg = 32) {
  const pts = profile[0][1] > profile[profile.length - 1][1] ? [...profile].reverse() : profile;
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}
const rbox = (w, h, d, r = 0.004, seg = 3) =>
  new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
function roundedRectShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
/** Extrude a shape along +Z (z from -bevel to depth+bevel) */
function extrude(shape, depth, bevel = 0.0015, curveSegments = 10) {
  return new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments,
  });
}
/** Tube through points (CatmullRom) */
function tubeThrough(points, r, seg = 24, radial = 10) {
  const c = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(c, seg, r, radial, false);
}
/** Knurled sleeve along Y: star cross-section with `ribs` longitudinal ribs */
function knurl(rOuter, rInner, h, ribs = 18) {
  const g = new THREE.CylinderGeometry(1, 1, h, ribs * 4, 1, false);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
    const rr = Math.hypot(x, z);
    if (rr < 1e-6) continue;
    const a = Math.atan2(z, x);
    const rib = 0.5 + 0.5 * Math.cos(a * ribs);
    const r = rInner + (rOuter - rInner) * Math.pow(rib, 0.6);
    pos.setXYZ(i, Math.cos(a) * r, y, Math.sin(a) * r);
  }
  g.computeVertexNormals();
  return g;
}
/** Pancake outrunner bell: domed top, cooling grooves on the lower half (profile y goes down from 0) */
function motorProfile() {
  const p = [[0, 0], [0.024, 0], [0.028, -0.0015], [0.0305, -0.005], [0.0318, -0.01]];
  for (let i = 0; i < 5; i++) {
    const y = -0.0135 - i * 0.0026;
    p.push([0.0318, y], [0.0296, y - 0.0004], [0.0296, y - 0.0014], [0.0318, y - 0.0018]);
  }
  p.push([0.0318, -0.028], [0.0302, -0.0298], [0.022, -0.0305], [0, -0.0305]);
  return p;
}
/** Lean the thickness of a tower toward a fixed outer face x = xFace above y0 (k = remaining thickness at y1) */
function taperTower(geo, xFace, y0, y1, k) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = THREE.MathUtils.clamp((y - y0) / (y1 - y0), 0, 1);
    const f = 1 - (1 - k) * t;
    pos.setX(i, xFace - (xFace - pos.getX(i)) * f);
  }
  geo.computeVertexNormals();
  return geo;
}
/** Scale UVs so procedural textures keep a constant world size */
function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv; if (!uv) return geo;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}

// ------------------------------------------------------------------ propeller blade
/** One blade along +X from r0 to R, chord along Z, thin cambered section, twist. mirror flips handedness. */
function bladeGeometry(R, mirror = 1) {
  const NS = 30, NC = 8, r0 = 0.012;
  const chord = (t) => {
    const root = 0.02, max = 0.054, tip = 0.019;
    if (t < 0.22) return root + (max - root) * Math.sin((t / 0.22) * Math.PI / 2);
    return tip + (max - tip) * Math.pow(1 - (t - 0.22) / 0.78, 0.85);
  };
  const sweep = (t) => 0.006 * Math.sin(t * Math.PI) - 0.004 * t;
  const twist = (t) => THREE.MathUtils.degToRad(28 - 16 * t);
  const thick = (t) => 0.0045 * (1 - t) + 0.0012 * t;
  const verts = [], uvs = [], idx = [];
  for (let s = 0; s <= NS; s++) {
    const t = s / NS;
    const tipRound = t > 0.93 ? Math.sqrt(Math.max(0, 1 - ((t - 0.93) / 0.07) ** 2)) : 1;
    const c = chord(t) * Math.max(tipRound, 0.06);
    const x = r0 + (R - r0) * t;
    const tw = twist(t), th = thick(t);
    for (let side = 0; side < 2; side++) {
      for (let k = 0; k <= NC; k++) {
        const u = k / NC;
        const zc = (u - 0.35) * c + sweep(t);
        const bulge = Math.sin(u * Math.PI);
        const camber = bulge * (side === 0 ? th * 0.55 : -th * 0.3) + bulge * c * 0.035;
        verts.push(x, -zc * Math.sin(tw) + camber, zc * Math.cos(tw) * mirror);
        uvs.push(t, side === 0 ? u * 0.5 : 1 - u * 0.5);
      }
    }
  }
  const row = (NC + 1) * 2;
  for (let s = 0; s < NS; s++) {
    for (let side = 0; side < 2; side++) {
      for (let k = 0; k < NC; k++) {
        const a = s * row + side * (NC + 1) + k, b = a + 1, c2 = a + row, d2 = c2 + 1;
        const flip = (side === 0) !== (mirror < 0);
        if (flip) idx.push(a, c2, b, b, c2, d2); else idx.push(a, b, c2, b, d2, c2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ procedural textures (generated in code)
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Tileable value-noise fBm. octaves: [[cellsX, cellsY, amplitude], ...]; returns Float32Array in 0..1 */
function fbm(w, h, seed, octaves) {
  const out = new Float32Array(w * h), r = rng(seed);
  let total = 0;
  for (const [cx, cy, amp] of octaves) {
    const lat = new Float32Array(cx * cy);
    for (let i = 0; i < lat.length; i++) lat[i] = r();
    for (let y = 0; y < h; y++) {
      const fy = (y / h) * cy, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
      const r0 = (y0 % cy) * cx, r1 = ((y0 + 1) % cy) * cx;
      for (let x = 0; x < w; x++) {
        const fx = (x / w) * cx, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
        const c0 = x0 % cx, c1 = (x0 + 1) % cx;
        const top = lat[r0 + c0] + (lat[r0 + c1] - lat[r0 + c0]) * sx;
        const bot = lat[r1 + c0] + (lat[r1 + c1] - lat[r1 + c0]) * sx;
        out[y * w + x] += amp * (top + (bot - top) * sy);
      }
    }
    total += amp;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}
function dataTexture(w, h, fn, srgb = false) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) {
    const v = fn(x, y, y * w + x);
    const r = typeof v === 'number' ? v : v[0], g = typeof v === 'number' ? v : v[1], b = typeof v === 'number' ? v : v[2];
    data[i] = Math.max(0, Math.min(255, r * 255)); data[i + 1] = Math.max(0, Math.min(255, g * 255));
    data[i + 2] = Math.max(0, Math.min(255, b * 255)); data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
/** Shared-image clone with its own world-scale repeat (UVs are in metres for box-projected parts) */
const withRepeat = (tex, metres) => { const t = tex.clone(); t.repeat.set(1 / metres, 1 / metres); t.needsUpdate = true; return t; };

function createTextures() {
  const N = 512;
  // three independent fields: macro mottle (albedo), meso blotch (roughness), micro grain (height)
  const mottle = fbm(N, N, 11, [[4, 4, 1], [8, 8, 0.5], [16, 16, 0.25], [64, 64, 0.08]]);
  const blotch = fbm(N, N, 23, [[6, 6, 1], [24, 24, 0.55], [96, 96, 0.3]]);
  const grain = fbm(N, N, 37, [[64, 64, 1], [128, 128, 0.7], [256, 256, 0.5]]);
  const streak = fbm(N, N, 53, [[4, 128, 1], [8, 256, 0.6], [32, 512, 0.3]]);
  const T = {
    mottle: dataTexture(N, N, (x, y, i) => 0.86 + 0.14 * mottle[i], true),
    rough: dataTexture(N, N, (x, y, i) => 0.62 + 0.38 * blotch[i]),
    grain: dataTexture(N, N, (x, y, i) => grain[i]),
    brushed: dataTexture(N, N, (x, y, i) => 0.6 + 0.4 * streak[i]),
  };
  // handling scuffs: short thin low-roughness lines over the blotch field (gunmetal only)
  const scr = new Float32Array(N * N), rs = rng(97);
  for (let k = 0; k < 140; k++) {
    let x = rs() * N, y = rs() * N; const ang = rs() * Math.PI, len = 8 + rs() * 50, dx = Math.cos(ang), dy = Math.sin(ang);
    const depth = 0.25 + rs() * 0.35;
    for (let t = 0; t < len; t++) { const xi = ((Math.round(x + dx * t) % N) + N) % N, yi = ((Math.round(y + dy * t) % N) + N) % N; scr[yi * N + xi] = Math.max(scr[yi * N + xi], depth); }
  }
  T.roughScratched = dataTexture(N, N, (x, y, i) => (0.62 + 0.38 * blotch[i]) * (1 - scr[i]));

  // carbon tubes: 2x2 bias braid (diamond pattern along the tube), seamless in a 1024 tile
  const C = 1024, P = 64;
  const fib = fbm(C, C, 71, [[8, 256, 1], [16, 512, 0.5]]);
  const fib2 = fbm(C, C, 79, [[256, 8, 1], [512, 16, 0.5]]);
  const over = new Uint8Array(C * C), prof = new Float32Array(C * C), fibre = new Float32Array(C * C);
  for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
    const a = x + y, b = x - y + C, i = y * C + x;
    const ta = Math.floor(a / P), tb = Math.floor(b / P);
    const o = ((ta + tb) & 3) < 2;
    over[i] = o ? 1 : 0;
    prof[i] = Math.sin(Math.PI * (o ? (b % P) / P : (a % P) / P));
    fibre[i] = o ? fib[i] : fib2[i];
  }
  T.carbonAlbedo = dataTexture(C, C, (x, y, i) => {
    const v = (over[i] ? 0.2 : 0.115) * (0.62 + 0.45 * Math.pow(prof[i], 0.8)) * (0.85 + 0.3 * fibre[i]);
    return [v, v, v * 1.04];
  }, true);
  T.carbonRough = dataTexture(C, C, (x, y, i) => 0.5 + 0.28 * (1 - prof[i]) + (over[i] ? -0.06 : 0.04));
  T.carbonBump = dataTexture(C, C, (x, y, i) => 0.25 + 0.6 * Math.pow(prof[i], 0.6) + 0.15 * fibre[i]);

  // propeller blade atlas: u = span (root 0 -> tip 1), v = chord (top 0..0.5, bottom 0.5..1)
  // tip livery from refs 01/19: carbon | white band | black stripe | white tip
  const BW = 1024, BH = 256, Q = 22;
  const bf = fbm(BW, BH, 91, [[16, 4, 1], [128, 32, 0.4]]);
  const band = (t) => ((t > 0.905 && t < 0.935) || t > 0.952 ? 1 : t >= 0.935 && t <= 0.952 ? 2 : 0);
  const weave = (x, y) => ((Math.floor(x / Q) + Math.floor(y / (Q * 0.5))) & 1) === 0;
  T.bladeAlbedo = dataTexture(BW, BH, (x, y, i) => {
    const k = band(x / BW);
    if (k === 1) return [0.9, 0.9, 0.9];
    if (k === 2) return [0.03, 0.03, 0.03];
    const v = (weave(x, y) ? 0.17 : 0.13) * (0.85 + 0.3 * bf[i]);
    return [v, v, v * 1.03];
  }, true);
  T.bladeRough = dataTexture(BW, BH, (x, y, i) => (band(x / BW) === 0 ? 0.62 + 0.25 * bf[i] : 0.5));
  T.bladeBump = dataTexture(BW, BH, (x, y) => (band(x / BW) !== 0 ? 0.5 : weave(x, y) ? 0.62 : 0.4));
  for (const k of ['bladeAlbedo', 'bladeRough', 'bladeBump']) T[k].wrapS = THREE.ClampToEdgeWrapping;
  return T;
}

// ------------------------------------------------------------------ materials
function createMaterials() {
  const T = createTextures();
  /** noise-surfaced material: albedo mottle, independent roughness blotch, micro grain bump; repeats in metres */
  const surfaced = (Ctor, name, o, { mottle = 0.16, rough = 0.09, grain = 0.02, bump = 1.0, brushed = false, scratched = false, ao = true } = {}) => {
    const m = new Ctor({ name, ...o });
    m.map = withRepeat(T.mottle, mottle);
    m.roughnessMap = withRepeat(brushed ? T.brushed : scratched ? T.roughScratched : T.rough, rough);
    if (ao) { m.vertexColors = true; m.userData.vertexAO = true; }
    m.bumpMap = withRepeat(T.grain, grain); m.bumpScale = bump;
    m.roughness = Math.min(1, o.roughness / 0.81); // maps average ~0.81
    m.userData.boxUV = true;
    return m;
  };
  const std = (name, color, roughness, metalness = 0, extra = {}) =>
    Object.assign(new THREE.MeshStandardMaterial({ name, color, roughness, metalness }), extra);
  const phys = (name, o) => new THREE.MeshPhysicalMaterial({ name, ...o });
  const M = {
    gunmetal: surfaced(THREE.MeshPhysicalMaterial, 'gunmetal', { color: 0x4f5054, roughness: 0.4, metalness: 0.42, clearcoat: 0.2, clearcoatRoughness: 0.4 }, { mottle: 0.2, rough: 0.12, grain: 0.03, bump: 0.22, scratched: true }),
    carbon: phys('carbon-weave', { color: 0xffffff, map: T.carbonAlbedo, roughnessMap: T.carbonRough, bumpMap: T.carbonBump, bumpScale: 1.6, roughness: 0.62, metalness: 0.12, clearcoat: 0.75, clearcoatRoughness: 0.14 }),
    prop: std('prop-carbon', 0xffffff, 0.8, 0.05, { map: T.bladeAlbedo, roughnessMap: T.bladeRough, bumpMap: T.bladeBump, bumpScale: 0.8, side: THREE.DoubleSide }),
    plastic: surfaced(THREE.MeshStandardMaterial, 'black-plastic', { color: 0x222326, roughness: 0.56, metalness: 0.0 }, { mottle: 0.1, rough: 0.07, grain: 0.012, bump: 0.5 }),
    anodized: surfaced(THREE.MeshStandardMaterial, 'anodized-black', { color: 0x1b1c1f, roughness: 0.34, metalness: 0.7 }, { mottle: 0.12, rough: 0.04, grain: 0.01, bump: 0.25, brushed: true }),
    dome: surfaced(THREE.MeshStandardMaterial, 'dome-plastic', { color: 0x2f3033, roughness: 0.72, metalness: 0.0 }, { mottle: 0.08, rough: 0.06, grain: 0.03, bump: 0.8 }),
    housing: surfaced(THREE.MeshStandardMaterial, 'camera-housing', { color: 0x313236, roughness: 0.5, metalness: 0.22 }, { mottle: 0.1, rough: 0.07, grain: 0.015, bump: 0.5 }),
    battery: surfaced(THREE.MeshStandardMaterial, 'battery-shell', { color: 0x3a3b3f, roughness: 0.6, metalness: 0.04 }, { mottle: 0.14, rough: 0.09, grain: 0.02, bump: 0.5 }),
    rubber: surfaced(THREE.MeshStandardMaterial, 'rubber', { color: 0x141415, roughness: 0.88, metalness: 0.0 }, { mottle: 0.05, rough: 0.04, grain: 0.008, bump: 0.7 }),
    glass: phys('lens-glass', { color: 0x07080a, roughness: 0.05, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0.6, iridescenceIOR: 1.6, iridescenceThicknessRange: [180, 420] }),
    chrome: std('chrome', 0xb9babd, 0.22, 1.0),
    ledWhite: std('led-white', 0xffffff, 0.3, 0, { emissive: new THREE.Color(0xffffff), emissiveIntensity: 2.2 }),
    ledRed: std('led-red', 0xff2a1a, 0.3, 0, { emissive: new THREE.Color(0xff2a1a), emissiveIntensity: 2.0 }),
    beacon: std('beacon', 0xffb030, 0.3, 0, { emissive: new THREE.Color(0xffa020), emissiveIntensity: 1.2 }),
    seal: std('seal-orange', 0x5e2216, 0.6, 0),
    pcb: std('pcb', 0x1f4a35, 0.45, 0.1),
    brass: std('brass', 0xb08d4a, 0.35, 1.0),
    copper: std('copper-windings', 0xb4683a, 0.38, 0.9),
    thermal: phys('thermal-glass', { color: 0x1a1206, roughness: 0.1, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 }),
    laser: phys('laser-window', { color: 0x9a9ca2, roughness: 0.15, metalness: 0.6, clearcoat: 1 }),
  };
  Object.defineProperty(M, '_textures', { value: T, enumerable: false });
  return M;
}

/** Cheap locality bake: hemispherical occlusion (undersides darker) + lighter bevel crests (edge wear) as vertex colours */
function bakeVertexOcclusion(geo) {
  const n = geo.attributes.normal, col = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
    const edge = Math.min(1, (1 - Math.max(Math.abs(nx), Math.abs(ny), Math.abs(nz))) / 0.28);
    const hemi = 0.8 + 0.2 * (0.5 + 0.5 * ny);
    const c = Math.min(1, hemi * (0.95 + 0.1 * edge));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}
/** Box-project UVs in metres (part-local) so noise textures keep a constant world size */
function boxProjectUV(geo) {
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    e1.subVectors(b, a); e2.subVectors(c, a); e1.cross(e2);
    const ax = Math.abs(e1.x), ay = Math.abs(e1.y), az = Math.abs(e1.z);
    for (let k = 0; k < 3; k++) {
      const p = k === 0 ? a : k === 1 ? b : c;
      if (ax >= ay && ax >= az) uv.setXY(i + k, p.z, p.y);
      else if (ay >= az) uv.setXY(i + k, p.x, p.z);
      else uv.setXY(i + k, p.x, p.y);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

// ------------------------------------------------------------------ factory
export function createSurveyDrone(options = {}) {
  const opts = { explodeLift: 0.14, ...options };
  const M = createMaterials();
  const root = new THREE.Group();
  root.name = 'SurveyDrone';
  const assembly = new THREE.Group(); // lifted during explode so exploded parts stay above the floor
  assembly.name = 'assembly';
  root.add(assembly);

  const runtime = {
    nodes: { root, assembly }, meshes: {}, sockets: {}, colliders: {}, destructionGroups: {},
    explodeParts: [], rotors: [], arms: [], fasteners: [],
  };

  // part registry ---------------------------------------------------------
  const pending = new Map(); // group -> Map(material -> geometries[])
  function part(id, parent, pos = [0, 0, 0], explode = [0, 0, 0], { delay = 0, group = null, collider = null } = {}) {
    const g = new THREE.Group();
    g.name = id; g.position.set(...pos);
    g.userData.base = g.position.clone();
    g.userData.explode = new THREE.Vector3(...explode);
    g.userData.delay = delay;
    parent.add(g);
    runtime.nodes[id] = g;
    if (explode.some((v) => v !== 0)) runtime.explodeParts.push(g);
    if (group) (runtime.destructionGroups[group] ||= []).push(id);
    if (collider) runtime.colliders[id] = collider;
    return g;
  }
  function add(g, geo, mat) {
    if (!pending.has(g)) pending.set(g, new Map());
    const byMat = pending.get(g);
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat).push(geo);
    return geo;
  }
  function socket(g, id, pos) {
    const o = new THREE.Object3D(); o.name = `socket:${id}`; o.position.set(...pos); g.add(o);
    runtime.sockets[`${g.name}/${id}`] = o; return o;
  }
  const screwGeo = mergeGeometries([
    toNI(lathe([[0, 0.0016], [0.0022, 0.0016], [0.0027, 0.001], [0.0028, 0]], 14)),
    toNI(xf(cyl(0.0012, 0.0012, 0.008, 8), { p: [0, -0.004, 0] })),
  ]);
  bakeVertexOcclusion(screwGeo);
  /** instanced pan-head screws on a part; they back out along `axis` when exploded */
  function fasteners(g, list, axis = [0, 1, 0], backOut = 0.035) {
    const im = new THREE.InstancedMesh(screwGeo, M.anodized, list.length);
    im.name = `${g.name}:screws`;
    const ax = new THREE.Vector3(...axis).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, ax);
    list.forEach((p, i) => { _m.compose(new THREE.Vector3(...p), q, _s); im.setMatrixAt(i, _m); });
    im.castShadow = false; // fasteners are too small to matter in the shadow pass
    im.userData.axis = ax; im.userData.backOut = backOut;
    g.add(im);
    runtime.fasteners.push(im);
    return im;
  }

  // ====================================================================== FUSELAGE
  const body = part('body-core', assembly, [0, BODY_Y0, 0], [0, 0, 0],
    { group: 'fuselage', collider: { type: 'box', size: [D.bodyW, D.bodyY1 - BODY_Y0, D.bodyL] } });
  const AYL = ARM_Y - BODY_Y0; // arm axis in body-local y
  const armDirs = {};
  for (const [key, sx, sz] of [['fl', 1, 1], ['fr', -1, 1], ['rl', 1, -1], ['rr', -1, -1]]) {
    const dir = new THREE.Vector3((D.motorX - D.armRootX) * sx, 0, (D.motorZ - D.armRootZ) * sz).normalize();
    armDirs[key] = { dir, sx, sz, root: new THREE.Vector3(sx * D.armRootX, ARM_Y, sz * D.armRootZ) };
    socket(body, `arm-socket-${key}`, [sx * D.armRootX, AYL, sz * D.armRootZ]);
  }
  socket(body, 'gimbal-mount', [0, 0, 0]);
  socket(body, 'top-payload-mount', [0, D.bodyY1 - BODY_Y0, 0.01]);
  for (const sx of [1, -1]) socket(body, `leg-mount-${sx > 0 ? 'l' : 'r'}`, [sx * D.legTop[0], D.legTop[1] - BODY_Y0, D.legTop[2]]);

  // lower chassis / arm hub
  const chassis = part('body-chassis', body, [0, 0, 0], [0, 0, 0], { group: 'fuselage-chassis' });
  add(chassis, xf(rbox(0.158, 0.05, 0.236, 0.012), { p: [0, 0.027, 0] }), M.gunmetal);
  for (const k in armDirs) {
    const { dir, sx, sz } = armDirs[k];
    const at = (t) => [sx * D.armRootX + dir.x * t, AYL, sz * D.armRootZ + dir.z * t];
    add(chassis, cylAB(at(-0.01), at(0.041), 0.0205, 0.0195, 28), M.gunmetal);
    add(chassis, cylAB(at(0.036), at(0.0395), 0.0204, 0.0204, 28), M.seal);
  }
  add(chassis, xf(rbox(0.12, 0.006, 0.19, 0.003), { p: [0, 0.0, 0] }), M.plastic); // belly plate
  for (const x of [-0.025, 0.025]) {
    add(chassis, xf(cyl(0.007, 0.007, 0.004, 20), { p: [x, -0.004, 0.07] }), M.plastic);
    add(chassis, xf(cyl(0.0045, 0.0045, 0.002, 20), { p: [x, -0.0062, 0.07] }), M.glass);
  }
  for (const sx of [1, -1]) add(chassis, xf(rbox(0.036, 0.022, 0.05, 0.006), { p: [sx * 0.082, 0.004, 0.075] }), M.plastic); // leg mounts
  fasteners(chassis, [[-0.05, -0.002, -0.08], [0.05, -0.002, -0.08], [-0.05, -0.002, 0.03], [0.05, -0.002, 0.03]], [0, -1, 0]);

  // upper shell (side frames)
  const shell = part('body-shell', body, [0, 0, 0], [0, 0.02, 0], { delay: 0.05, group: 'fuselage-shell' });
  {
    // open side-frame ring (top plate, covers and batteries close it) so the exploded core is visible
    const ring = roundedRectShape(D.bodyW, D.bodyL - 0.016, 0.018);
    ring.holes.push(roundedRectShape(D.bodyW - 0.012, D.bodyL - 0.03, 0.012));
    add(shell, xf(extrude(ring, 0.108, 0.002, 8), { p: [0, 0.04, 0], r: [-Math.PI / 2, 0, 0] }), M.gunmetal);
    add(shell, xf(rbox(D.bodyW - 0.01, 0.004, D.bodyL - 0.03, 0.002), { p: [0, 0.044, 0] }), M.gunmetal); // floor
  }
  for (const sx of [1, -1]) {
    for (let i = 0; i < 6; i++) add(shell, xf(rbox(0.004, 0.016, 0.0028, 0.001), { p: [sx * 0.0745, 0.135, -0.04 - i * 0.0055] }), M.plastic); // vent slots
    add(shell, xf(rbox(0.003, 0.004, 0.012, 0.001), { p: [sx * 0.0748, 0.142, 0.07] }), M.plastic); // status window
  }
  add(shell, xf(rbox(D.bodyW + 0.001, 0.0016, D.bodyL - 0.03, 0.0006), { p: [0, 0.046, 0] }), M.plastic); // seam to chassis

  // front sensor cover
  const frontCover = part('body-front-cover', body, [0, 0, D.bodyL / 2 - 0.012], [0, 0.01, 0.09], { delay: 0.05, group: 'fuselage-front-cover' });
  {
    add(frontCover, xf(extrude(roundedRectShape(0.146, 0.122, 0.016), 0.008, 0.003), { p: [0, 0.093, 0] }), M.gunmetal);
    add(frontCover, xf(extrude(roundedRectShape(0.092, 0.112, 0.01), 0.002, 0.0015), { p: [0, 0.09, 0.0105] }), M.gunmetal); // raised centre panel
    for (const x of [-0.0475, 0.0475]) add(frontCover, xf(rbox(0.0014, 0.1, 0.002, 0.0005), { p: [x, 0.085, 0.0112] }), M.plastic); // panel seams
    add(frontCover, xf(rbox(0.09, 0.009, 0.006, 0.002), { p: [0, 0.028, 0.008] }), M.plastic); // chin recess
    const sy = 0.136; // sensor row height (body-local)
    const ring = (x, r, depth = 0.006) => {
      add(frontCover, xf(cyl(r + 0.0035, r + 0.0045, depth, 32), { p: [x, sy, 0.012], r: [Math.PI / 2, 0, 0] }), M.gunmetal);
      add(frontCover, xf(cyl(r, r, depth, 32), { p: [x, sy, 0.0135], r: [Math.PI / 2, 0, 0] }), M.plastic);
      add(frontCover, xf(new THREE.SphereGeometry(r * 0.82, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), { p: [x, sy, 0.0158], r: [Math.PI / 2, 0, 0], s: [1, 0.45, 1] }), M.glass);
    };
    ring(-0.055, 0.0085); ring(-0.012, 0.0125); ring(0.053, 0.0085);
    add(frontCover, xf(extrude(roundedRectShape(0.016, 0.032, 0.0079), 0.006, 0.0015, 12), { p: [0.019, sy, 0.0095] }), M.gunmetal);
    for (const dy of [-0.0075, 0.0075]) add(frontCover, xf(cyl(0.0052, 0.0052, 0.004, 24), { p: [0.019, sy + dy, 0.016], r: [Math.PI / 2, 0, 0] }), M.glass);
    fasteners(frontCover, [[-0.047, 0.076, 0.0125], [0.047, 0.076, 0.0125]], [0, 0, 1]);
  }

  // rear cover with vertical fin grille
  const rearCover = part('body-rear-cover', body, [0, 0, -D.bodyL / 2 + 0.012], [0, 0.01, -0.085], { delay: 0.05, group: 'fuselage-rear-cover' });
  {
    add(rearCover, xf(extrude(roundedRectShape(0.146, 0.122, 0.016), 0.008, 0.003), { p: [0, 0.093, 0], r: [0, Math.PI, 0] }), M.gunmetal);
    add(rearCover, xf(rbox(0.07, 0.07, 0.004, 0.003), { p: [0, 0.088, -0.012] }), M.plastic);
    for (let i = 0; i < 7; i++) add(rearCover, xf(rbox(0.004, 0.066, 0.008, 0.0015), { p: [-0.027 + i * 0.009, 0.088, -0.014] }), M.gunmetal);
    for (const x of [-0.055, 0.055]) {
      add(rearCover, xf(cyl(0.011, 0.012, 0.006, 28), { p: [x, 0.138, -0.012], r: [Math.PI / 2, 0, 0] }), M.gunmetal);
      add(rearCover, xf(cyl(0.0075, 0.0075, 0.004, 24), { p: [x, 0.138, -0.0145], r: [Math.PI / 2, 0, 0] }), M.glass);
    }
  }

  // top plate
  const topPlate = part('body-top-plate', body, [0, D.bodyY1 - BODY_Y0 - 0.008, 0], [0, 0.19, 0], { delay: 0.0, group: 'fuselage-top' });
  {
    add(topPlate, xf(rbox(0.142, 0.012, D.bodyL - 0.012, 0.005), { p: [0, 0.002, 0] }), M.gunmetal);
    for (let i = 0; i < 7; i++) add(topPlate, xf(rbox(0.0045, 0.004, 0.07, 0.0018), { p: [-0.027 + i * 0.009, 0.0075, -0.03] }), M.plastic);
    for (const x of [-0.03, 0.03]) add(topPlate, xf(rbox(0.032, 0.004, 0.014, 0.002), { p: [x, 0.0075, 0.045] }), M.plastic);
    add(topPlate, xf(cyl(0.009, 0.01, 0.004, 24), { p: [0, 0.009, 0.085] }), M.plastic);
    for (const sx of [1, -1]) add(topPlate, xf(rbox(0.012, 0.006, D.bodyL - 0.04, 0.0025), { p: [sx * 0.058, 0.0085, 0] }), M.gunmetal); // rails
    for (const x of [-0.045, 0.045]) add(topPlate, xf(rbox(0.012, 0.008, 0.01, 0.003), { p: [x, 0.011, 0.108] }), M.rubber); // bumper lugs
    add(topPlate, xf(rbox(0.082, 0.004, 0.074, 0.003), { p: [0, 0.009, 0.01] }), M.anodized); // payload mount plate

    add(topPlate, xf(new THREE.SphereGeometry(0.0075, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), { p: [0, 0.011, 0.085], s: [1, 0.6, 1] }), M.beacon);
    fasteners(topPlate, [[-0.062, 0.008, -0.1], [0.062, 0.008, -0.1], [-0.062, 0.008, 0.1], [0.062, 0.008, 0.1], [-0.062, 0.008, 0], [0.062, 0.008, 0]], [0, 1, 0]);
  }

  // side batteries
  for (const [side, sx] of [['l', 1], ['r', -1]]) {
    const bat = part(`body-battery-${side}`, body, [sx * 0.078, 0.092, -0.008], [sx * 0.095, 0.01, 0], { delay: 0.1, group: `battery-${side}` });
    add(bat, rbox(0.014, 0.086, 0.176, 0.005), M.battery);
    for (let i = 0; i < 4; i++) add(bat, xf(cyl(0.0017, 0.0017, 0.002, 12), { p: [sx * 0.0072, 0.022 - i * 0.0065, 0.076], r: [0, 0, Math.PI / 2] }), M.ledWhite);
    add(bat, xf(rbox(0.003, 0.008, 0.008, 0.0015), { p: [sx * 0.0072, 0.034, 0.076] }), M.plastic);
    socket(bat, 'battery-latch', [0, 0.03, 0.08]);
  }

  // internal electronics stack (visible only when exploded)
  const elec = part('body-electronics', body, [0, 0.05, 0], [0, 0.13, 0], { delay: 0.15, group: 'electronics' });
  for (let i = 0; i < 3; i++) {
    const y = i * 0.03;
    add(elec, xf(new THREE.BoxGeometry(0.112, 0.0025, 0.18), { p: [0, y, 0] }), M.pcb);
    for (const [x, z] of [[-0.05, -0.083], [0.05, -0.083], [-0.05, 0.083], [0.05, 0.083]]) add(elec, xf(cyl(0.0028, 0.0028, 0.03, 10), { p: [x, y + 0.015, z] }), M.brass);
    add(elec, xf(rbox(0.05, 0.008 + i * 0.002, 0.06, 0.002), { p: [-0.02 + i * 0.015, y + 0.006, -0.02 + i * 0.02] }), M.plastic);
    add(elec, xf(rbox(0.026, 0.004, 0.026, 0.001), { p: [0.03, y + 0.0035, 0.05 - i * 0.04] }), M.anodized);
  }

  // ====================================================================== ARMS + PODS + ROTORS
  const armLen = Math.hypot(D.motorX - D.armRootX, D.motorZ - D.armRootZ);
  for (const key of ['fl', 'fr', 'rl', 'rr']) {
    const { dir, sx, sz, root: rootPt } = armDirs[key];
    const isFront = sz > 0;
    const arm = part(`arm-${key}`, assembly, rootPt.toArray(), dir.clone().multiplyScalar(0.1).toArray(),
      { delay: 0.1, group: `arm-${key}`, collider: { type: 'capsule', radius: 0.02, length: armLen } });
    arm.rotation.y = Math.atan2(-dir.z, dir.x); // local +X along the arm
    // locking sleeve (floats back toward the body when exploded)
    const sleeve = part(`arm-${key}-sleeve`, arm, [SLEEVE_X, 0, 0], [-0.06, 0, 0], { delay: 0.1, group: `arm-${key}` });
    add(sleeve, xf(knurl(0.0225, 0.0207, 0.042, 20), { r: [0, 0, Math.PI / 2] }), M.plastic);
    add(sleeve, xf(cyl(0.0205, 0.021, 0.006, 32), { p: [-0.024, 0, 0], r: [0, 0, Math.PI / 2] }), M.plastic);
    add(sleeve, xf(cyl(0.017, 0.0198, 0.007, 32), { p: [0.0245, 0, 0], r: [0, 0, Math.PI / 2] }), M.plastic);
    // fold hinge (pivot at the sleeve centre)
    const hinge = part(`arm-${key}-hinge`, arm, [SLEEVE_X, 0, 0]);
    const L = armLen - SLEEVE_X; // hinge -> motor axis
    const tube = part(`arm-${key}-tube`, hinge, [0, 0, 0], [0, 0, 0], { group: `arm-${key}` });
    add(tube, xf(scaleUV(cyl(0.0135, 0.0135, L - 0.03, 32, true), 1, (L - 0.03) / (2 * Math.PI * 0.0135)), { p: [(L - 0.03) / 2 + 0.005, 0, 0], r: [0, 0, Math.PI / 2] }), M.carbon);
    add(tube, xf(knurl(0.0185, 0.0172, 0.024, 16), { p: [L - 0.06, 0, 0], r: [0, 0, Math.PI / 2] }), M.plastic);
    add(tube, xf(cyl(0.0165, 0.0175, 0.014, 28), { p: [L - 0.04, 0, 0], r: [0, 0, Math.PI / 2] }), M.plastic);

    // motor pod housing: arm clamp block inboard, mast (fin tower or dome) hanging BELOW the arm tip,
    // motor bell and propeller on TOP (as on the real M350: refs threequarter / front / detail-motor;
    // the sculpt's pod crop was an inverted photo, which had put the props under the motors)
    const pod = part(`motor-pod-${key}`, hinge, [L, 0, 0], [0.045, 0, 0], { delay: 0.25, group: `motor-pod-${key}` });
    add(pod, xf(rbox(0.044, 0.056, 0.046, 0.008), { p: [-0.008, 0.003, 0] }), M.plastic);
    add(pod, xf(rbox(0.026, 0.038, 0.05, 0.004), { p: [-0.032, 0.002, 0] }), M.plastic); // tube clamp block
    fasteners(pod, [[-0.032, -0.006, 0.025], [-0.032, 0.01, 0.025]], [0, 0, 1], 0.03);
    const POD_TOP = 0.031;
    socket(pod, 'motor-top', [0, POD_TOP, 0]);
    const mast = part(`mast-${key}`, pod, [0, 0, 0], [0, -0.065, 0], { delay: 0.35, group: `motor-pod-${key}` });
    if (isFront) {
      // thin antenna tower hanging under the arm tip: broad face (with LED) faces outward along the arm;
      // vertical rear edge, front edge tapers in toward a rounded foot 0.10 below the arm axis
      const g = -sx; // shape-x -> local z after the Y rotation below; +u points toward the world front
      const sh = new THREE.Shape();
      sh.moveTo(-0.017 * g, 0.025); sh.lineTo(0.018 * g, 0.025); sh.lineTo(0.018 * g, -0.032);
      sh.lineTo(0.004 * g, -0.088); sh.quadraticCurveTo(0.0005 * g, -0.1, -0.007 * g, -0.1);
      sh.quadraticCurveTo(-0.017 * g, -0.1, -0.017 * g, -0.088); sh.lineTo(-0.017 * g, 0.025);
      const tower = xf(extrude(sh, 0.024, 0.0025, 10), { p: [-0.004, 0, 0], r: [0, Math.PI / 2, 0] });
      taperTower(tower, 0.0225, -0.03, -0.1, 0.45); // inner face leans toward the flat LED face
      const yaw = { r: [0, -sx * THREE.MathUtils.degToRad(14), 0] }; // LED face turned slightly toward the nose (refs 01/07/11)
      add(mast, xf(tower, yaw), M.plastic);
      add(mast, xf(xf(rbox(0.003, 0.034, 0.015, 0.0012), { p: [0.0235, 0.0, 0] }), yaw), M.ledWhite);
      add(mast, xf(xf(rbox(0.002, 0.04, 0.021, 0.001), { p: [0.0225, 0.0, 0] }), yaw), M.anodized); // LED bezel
      socket(mast, 'nav-light', [0.026, 0, 0]);
    } else {
      add(mast, xf(cyl(0.012, 0.0125, 0.013, 24), { p: [0, -0.031, 0] }), M.anodized);
      add(mast, lathe([[0, -0.036], [0.0295, -0.036], [0.031, -0.039], [0.0275, -0.087], [0.026, -0.091], [0.022, -0.094], [0, -0.095]], 48), M.dome);
    }
    // motor: the bell stands on the pod top (its base flange and the light ring seated on the pod),
    // domed top up; motor-local y = 0 is the top of the bell
    const MOTOR_Y = POD_TOP + 0.0335;
    // (the base flange belongs to the stator side: when taken apart the bell lifts off the top and the
    // stator and its flange stay on the pod)
    const stator = part(`motor-${key}-stator`, pod, [0, MOTOR_Y, 0], [0, 0, 0], { delay: 0.35, group: `motor-pod-${key}` });
    add(stator, lathe([[0.006, -0.004], [0.0255, -0.004], [0.0262, -0.008], [0.0262, -0.021], [0.0255, -0.025], [0.006, -0.025]], 36), M.copper);
    add(stator, xf(cyl(0.008, 0.008, 0.026, 16), { p: [0, -0.014, 0] }), M.anodized);
    add(stator, xf(cyl(0.022, 0.022, 0.003, 32), { p: [0, -0.0315, 0] }), M.plastic); // base flange
    const motor = part(`motor-${key}`, pod, [0, MOTOR_Y, 0], [0, 0.06, 0], { delay: 0.35, group: `motor-pod-${key}` });
    add(motor, lathe(motorProfile(), 48), M.anodized);
    socket(motor, 'prop-adapter', [0, 0.001, 0]);
    // rotor (hub + 2 folding blades) on top of the bell
    const rotor = part(`rotor-${key}`, motor, [0, 0.0075, 0], [0, 0.05, 0], { delay: 0.4, group: `rotor-${key}` });
    const spinDir = sx * sz > 0 ? 1 : -1; // diagonal pairs counter-rotate
    add(rotor, lathe([[0, 0.004], [0.017, 0.004], [0.02, 0.002], [0.02, -0.003], [0.012, -0.0075], [0, -0.0075]], 32), M.plastic);
    const blades = [];
    for (const side of [1, -1]) {
      const pivot = new THREE.Group(); pivot.name = `rotor-${key}-blade${side > 0 ? 'A' : 'B'}`;
      pivot.position.set(side * 0.016, 0.0, 0); pivot.rotation.y = side > 0 ? 0 : Math.PI;
      rotor.add(pivot); runtime.nodes[pivot.name] = pivot;
      add(pivot, bladeGeometry(D.propRadius - 0.016, spinDir), M.prop);
      add(pivot, cyl(0.0085, 0.0085, 0.008, 24), M.plastic);
      add(pivot, cyl(0.0055, 0.0055, 0.0095, 20), M.chrome);
      blades.push(pivot);
    }
    runtime.rotors.push({ key, node: rotor, dir: spinDir, blades, angle: (key.charCodeAt(0) + key.charCodeAt(1)) * 0.7 });
    runtime.arms.push({ key, node: arm, hinge, sx, sz });
  }

  // ====================================================================== LANDING GEAR
  for (const [side, sx] of [['l', 1], ['r', -1]]) {
    const top = new THREE.Vector3(sx * D.legTop[0], D.legTop[1], D.legTop[2]);
    const foot = new THREE.Vector3(sx * D.foot[0], D.foot[1], D.foot[2]);
    const leg = part(`leg-${side}`, assembly, top.toArray(), [sx * 0.06, -0.06, 0.02],
      { delay: 0.1, group: `landing-gear-${side}`, collider: { type: 'capsule', radius: 0.012 } });
    const d = foot.clone().sub(top); const len = d.length(); const u = d.clone().normalize();
    const at = (t) => u.clone().multiplyScalar(t).toArray();
    add(leg, cylAB(at(-0.008), at(0.05), 0.0165, 0.0155, 28), M.plastic);
    add(leg, scaleUV(cylAB(at(0.045), at(len - 0.05), 0.0105, 0.0105, 28, true), 1, (len - 0.095) / (2 * Math.PI * 0.0105)), M.carbon);
    add(leg, cylAB(at(len - 0.065), at(len - 0.005), 0.0135, 0.0142, 28), M.plastic);
    const skid = part(`skid-${side}`, leg, d.toArray(), [0, -0.05, 0], { delay: 0.3, group: `landing-gear-${side}` });
    const sy = 0.0145 - foot.y; // skid axis in skid-local y
    add(skid, xf(rbox(0.03, 0.034, 0.04, 0.008), { p: [0, sy + 0.006, 0] }), M.plastic);
    add(skid, xf(scaleUV(cyl(0.0105, 0.0105, 0.19, 28, true), 1, 0.19 / (2 * Math.PI * 0.0105)), { p: [0, sy, -0.03], r: [Math.PI / 2, 0, 0] }), M.carbon);
    for (const [z, s] of [[0.062, 1], [-0.122, -1]]) {
      add(skid, xf(lathe([[0, 0], [0.0135, 0], [0.0145, 0.004], [0.0145, 0.024], [0.0125, 0.028], [0, 0.029]], 28), { p: [0, sy, z], r: [s * Math.PI / 2, 0, 0] }), M.rubber);
    }
  }

  // ====================================================================== GIMBAL PAYLOAD
  // A real 3-axis stack, as on the M350 RTK with a Zenmuse payload, every joint touching the next:
  //   belly → damper plate (flush on the belly plate) → 4 rubber dampers → lower damper plate →
  //   gimbal connector (quick release, red status LED) → YAW motor (axis vertical, at the top) →
  //   yaw arm, back over the camera and down behind it → ROLL motor (axis fore-aft, behind the
  //   camera, at the camera's centre height) → roll arm, a U round the back and both sides →
  //   PITCH motors (axis left-right, through the camera's centre) → camera block.
  // Each rotation is applied on its own node, whose origin is on that motor's axis, so a pose turns
  // parts about their real joints and nothing separates from its parent. Gimbal-local y = 0 is the
  // body's underside (the belly plate's bottom is at -0.003).
  // Envelope: anything carried on 'gimbal-camera' must stay within 0.060 m of its origin in the
  // y-z plane (the yaw arm is 0.064 above the pitch axis, the roll arm's rear bar 0.064 behind it) and
  // within ±0.0695 m across (the pitch motors' inner faces).
  const G_PITCH_Y = -0.134;     // pitch / roll centre, gimbal-local (world y 0.101 at rest)
  const G_YAW_Y = -0.054;       // yaw motor top = connector bottom
  const gimbal = part('gimbal-payload', assembly, [0, BODY_Y0, 0], [0, -0.015, 0], { delay: 0.15, group: 'gimbal' });
  const gFrame = part('gimbal-damper-frame', gimbal, [0, 0, 0], [0, -0.03, 0], { delay: 0.15, group: 'gimbal' });
  {
    add(gFrame, xf(rbox(0.112, 0.006, 0.086, 0.002), { p: [0, -0.0035, 0] }), M.anodized);      // upper plate, on the belly
    for (const [x, z] of [[0.042, 0.03], [-0.042, 0.03], [0.042, -0.03], [-0.042, -0.03]]) {
      add(gFrame, xf(lathe([[0, -0.0255], [0.0055, -0.0255], [0.0085, -0.0215], [0.0072, -0.016], [0.0085, -0.0105], [0.0055, -0.0065], [0, -0.0065]], 20), { p: [x, 0, z] }), M.rubber);
    }
    add(gFrame, xf(rbox(0.104, 0.005, 0.078, 0.002), { p: [0, -0.0275, 0] }), M.anodized);     // lower plate
    for (const sx of [1, -1]) add(gFrame, xf(rbox(0.004, 0.018, 0.05, 0.0015), { p: [sx * 0.052, -0.0165, 0] }), M.plastic); // travel stops
  }
  const gQR = part('gimbal-connector', gimbal, [0, -0.03, 0], [0, -0.06, 0], { delay: 0.2, group: 'gimbal' });
  add(gQR, lathe([[0, 0], [0.023, 0], [0.023, -0.009], [0.0205, -0.011], [0.0205, -0.019], [0.0185, -0.024], [0, -0.024]], 32), M.anodized);
  add(gQR, xf(cyl(0.0225, 0.0225, 0.0035, 32), { p: [0, -0.0145, 0] }), M.plastic);          // locking ring
  add(gQR, xf(cyl(0.0018, 0.0018, 0.002, 10), { p: [0, -0.0055, 0.0228], r: [Math.PI / 2, 0, 0] }), M.ledRed);
  // yaw: motor under the connector, the arm runs back over the camera and down behind it
  const gYaw = part('gimbal-yaw', gimbal, [0, G_YAW_Y, 0], [0, -0.085, 0], { delay: 0.22, group: 'gimbal' });
  const RY = G_PITCH_Y - G_YAW_Y; // roll / pitch centre in yaw-local y (-0.080)
  // (sub-groups only so each piece gets its own tight box in the explode's contact test; an L-shaped
  // single mesh boxes round the camera it frames and glues the stages together)
  {
    const motor = part('gimbal-yaw-motor', gYaw), arm = part('gimbal-yaw-arm', gYaw), drop = part('gimbal-yaw-drop', gYaw);
    add(motor, xf(cyl(0.0235, 0.0235, 0.0035, 32), { p: [0, -0.00225, 0] }), M.anodized);        // rotor cap
    add(motor, xf(cyl(0.0225, 0.0225, 0.0075, 32), { p: [0, -0.0072, 0] }), M.housing);         // stator can
    add(arm, xf(rbox(0.05, 0.009, 0.05, 0.004), { p: [0, -0.0115, -0.004] }), M.housing);      // hub block under the motor
    add(arm, xf(rbox(0.026, 0.009, 0.09, 0.004), { p: [0, -0.0115, -0.055] }), M.housing);      // arm, back over the camera
    // the arm down behind the camera: a cast plate that widens past the camera's sides before it
    // reaches the camera's top, so from the front the camera reads as hung in its yoke, not floating
    {
      const sh = new THREE.Shape(), T0 = -0.007, T1 = -0.033, B = RY - 0.024;
      // (wound counter-clockwise, as the other extruded outlines here)
      sh.moveTo(-0.054, B); sh.lineTo(0.054, B); sh.quadraticCurveTo(0.066, B, 0.066, B + 0.012);
      sh.lineTo(0.066, T1); sh.lineTo(0.025, T0); sh.lineTo(-0.025, T0); sh.lineTo(-0.066, T1);
      sh.lineTo(-0.066, B + 0.012); sh.quadraticCurveTo(-0.066, B, -0.054, B);
      add(drop, xf(extrude(sh, 0.008, 0.002, 6), { p: [0, 0, -0.098] }), M.housing);
    }
    add(drop, xf(cyl(0.02, 0.02, 0.01, 32), { p: [0, RY, -0.083], r: [Math.PI / 2, 0, 0] }), M.housing); // roll motor stator
    add(drop, xf(cyl(0.012, 0.012, 0.0015, 24), { p: [0, RY, -0.1008], r: [Math.PI / 2, 0, 0] }), M.anodized); // its end cap
  }
  // roll: rotor on the roll motor's front face, the U-shaped arm round the back and up both sides
  const gRoll = part('gimbal-roll', gYaw, [0, RY, 0], [0, 0, 0.07], { delay: 0.24, group: 'gimbal' });
  {
    const bar = part('gimbal-roll-bar', gRoll);
    add(bar, xf(cyl(0.019, 0.019, 0.006, 32), { p: [0, 0, -0.0745], r: [Math.PI / 2, 0, 0] }), M.anodized); // roll rotor
    add(bar, xf(rbox(0.155, 0.02, 0.008, 0.003), { p: [0, 0, -0.068] }), M.housing);               // rear bar
    for (const sx of [1, -1]) {
      const side = part(`gimbal-roll-${sx > 0 ? 'l' : 'r'}`, gRoll);
      add(side, xf(rbox(0.008, 0.02, 0.074, 0.003), { p: [sx * 0.0735, 0, -0.035] }), M.housing); // side arm
      // pitch motor (stator in the arm; the camera's side caps are the rotors)
      add(side, xf(cyl(0.021, 0.021, 0.011, 32), { p: [sx * 0.0755, 0, 0], r: [0, 0, Math.PI / 2] }), M.housing);
      add(side, xf(cyl(0.012, 0.012, 0.0015, 24), { p: [sx * 0.0815, 0, 0], r: [0, 0, Math.PI / 2] }), M.anodized);
    }
  }
  // pitch: the camera block turns about the pitch motors' axis, which runs through its centre
  const gCam = part('gimbal-camera', gRoll, [0, 0, 0], [0, -0.07, 0], { delay: 0.25, group: 'gimbal', collider: { type: 'box', size: [0.139, 0.085, 0.075] } });
  {
    add(gCam, rbox(0.095, 0.085, 0.075, 0.009, 4), M.housing);
    const rotors = part('gimbal-camera-rotors', gCam);   // (own group: a tight box for the explode's contact test)
    for (const sx of [1, -1]) {
      add(gCam, xf(cyl(0.024, 0.024, 0.02, 36), { p: [sx * 0.0575, 0, 0], r: [0, 0, Math.PI / 2] }), M.housing);
      add(rotors, xf(cyl(0.018, 0.018, 0.0025, 36), { p: [sx * 0.06775, 0, 0], r: [0, 0, Math.PI / 2] }), M.anodized); // pitch rotor, against the motor
    }
    const fz = 0.0375;
    const lens = (x, y, rOuter, rGlass, depth, glassMat) => {
      add(gCam, xf(cyl(rOuter, rOuter, depth, 40), { p: [x, y, fz + depth / 2 - 0.002], r: [Math.PI / 2, 0, 0] }), M.anodized);
      add(gCam, xf(cyl(rGlass + 0.002, rGlass + 0.002, 0.002, 40), { p: [x, y, fz + depth - 0.001], r: [Math.PI / 2, 0, 0] }), M.chrome);
      add(gCam, xf(new THREE.SphereGeometry(rGlass, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), { p: [x, y, fz + depth - 0.002], r: [Math.PI / 2, 0, 0], s: [1, 0.35, 1] }), glassMat);
    };
    lens(-0.017, -0.012, 0.024, 0.018, 0.008, M.glass);
    lens(0.026, -0.018, 0.0145, 0.0105, 0.006, M.thermal);
    lens(-0.012, 0.028, 0.0065, 0.0042, 0.004, M.glass);
    add(gCam, xf(rbox(0.028, 0.02, 0.006, 0.002), { p: [0.024, 0.022, fz + 0.001] }), M.anodized);
    add(gCam, xf(rbox(0.022, 0.015, 0.004, 0.0015), { p: [0.024, 0.022, fz + 0.003] }), M.laser);
    fasteners(gCam, [[-0.04, 0.034, fz], [0.04, 0.034, fz], [-0.04, -0.034, fz], [0.04, -0.034, fz]], [0, 0, 1], 0.03);
    socket(gCam, 'boresight', [-0.017, -0.012, fz + 0.01]);
  }

  // ====================================================================== TOP PAYLOAD
  const topP = part('top-payload', assembly, [0, D.bodyY1, 0.01], [0, 0.22, -0.17], { delay: 0.2, group: 'top-payload' });
  const spider = part('top-damper-spider', topP, [0, 0, 0], [0, 0.04, 0], { delay: 0.25, group: 'top-payload' });
  {
    for (const [x, z] of [[0.034, 0.03], [-0.034, 0.03], [0.034, -0.03], [-0.034, -0.03]]) {
      add(spider, xf(cyl(0.007, 0.008, 0.008, 16), { p: [x, 0.004, z] }), M.rubber);
      add(spider, tubeThrough([[x, 0.008, z], [x * 0.6, 0.014, z * 0.6], [0, 0.02, 0]], 0.0035, 12, 8), M.plastic);
    }
    add(spider, lathe([[0, 0.016], [0.018, 0.016], [0.018, 0.026], [0.0155, 0.028], [0.0155, 0.05], [0.0175, 0.052], [0.0175, 0.062], [0.013, 0.064], [0.012, 0.075], [0, 0.075]], 32), M.anodized);
    for (const [x, z] of [[0.05, 0.026], [-0.05, 0.026], [0.05, -0.026], [-0.05, -0.026]]) {
      add(spider, tubeThrough([[0, 0.044, 0], [x * 0.55, 0.05, z * 0.55], [x * 0.92, 0.055, z * 0.92]], 0.003, 12, 8), M.plastic);
      const tilt = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(x, 0.09, z).normalize());
      add(spider, xf(lathe([[0, -0.015], [0.007, -0.015], [0.0105, -0.01], [0.009, -0.005], [0.011, 0], [0.009, 0.005], [0.0105, 0.01], [0.007, 0.015], [0, 0.015]], 20), { p: [x, 0.058, z], q: tilt }), M.rubber);
    }
  }
  const head = part('top-camera-head', topP, [0, 0.1255, 0], [0, 0.07, 0], { delay: 0.3, group: 'top-payload' });
  {
    add(head, xf(cyl(0.011, 0.011, 0.028, 24), { p: [0, -0.04, 0] }), M.anodized);
    const oct = new THREE.Shape(); const hw = 0.029, hh = 0.0275, c = 0.009;
    oct.moveTo(-hw + c, -hh); oct.lineTo(hw - c, -hh); oct.lineTo(hw, -hh + c); oct.lineTo(hw, hh - c); oct.lineTo(hw - c, hh);
    oct.lineTo(-hw + c, hh); oct.lineTo(-hw, hh - c); oct.lineTo(-hw, -hh + c); oct.lineTo(-hw + c, -hh);
    add(head, xf(extrude(oct, 0.046, 0.003, 1), { p: [0, 0, -0.023] }), M.housing);
    add(head, xf(cyl(0.021, 0.022, 0.012, 40), { p: [0, 0, 0.03], r: [Math.PI / 2, 0, 0] }), M.anodized);
    add(head, xf(cyl(0.0175, 0.0175, 0.002, 40), { p: [0, 0, 0.0365], r: [Math.PI / 2, 0, 0] }), M.chrome);
    add(head, xf(new THREE.SphereGeometry(0.016, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), { p: [0, 0, 0.036], r: [Math.PI / 2, 0, 0], s: [1, 0.4, 1] }), M.glass);
    add(head, xf(cyl(0.0155, 0.0155, 0.016, 32), { p: [-0.037, 0, -0.002], r: [0, 0, Math.PI / 2] }), M.housing);
    add(head, xf(cyl(0.0165, 0.0165, 0.024, 32), { p: [0.041, 0, -0.002], r: [0, 0, Math.PI / 2] }), M.housing);
    add(head, xf(cyl(0.012, 0.012, 0.002, 32), { p: [0.054, 0, -0.002], r: [0, 0, Math.PI / 2] }), M.anodized);
    fasteners(head, [[-0.021, 0.02, 0.026], [0.021, 0.02, 0.026], [-0.021, -0.02, 0.026], [0.021, -0.02, 0.026]], [0, 0, 1], 0.025);
  }

  // ====================================================================== finalize: merge per part per material
  for (const [g, byMat] of pending) {
    for (const [mat, geos] of byMat) {
      const merged = mergeGeometries(geos.map(toNI), false);
      if (mat.userData.boxUV) boxProjectUV(merged);
      if (mat.userData.vertexAO) bakeVertexOcclusion(merged);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `${g.name}:${mat.name}`;
      mesh.castShadow = !TINY_MATERIALS.has(mat.name); mesh.receiveShadow = true;
      g.add(mesh);
      (runtime.meshes[g.name] ||= []).push(mesh);
    }
  }

  // ====================================================================== runtime API
  const smooth = (x) => x * x * (3 - 2 * x);
  let explodeT = 0, foldT = 0, rotorSpeed = 0;
  root.setExplode = (t) => {
    explodeT = THREE.MathUtils.clamp(t, 0, 1);
    for (const g of runtime.explodeParts) {
      const d = (g.userData.delay || 0) * 0.6;
      const k = smooth(THREE.MathUtils.clamp((explodeT - d) / (1 - d), 0, 1));
      g.position.copy(g.userData.base).addScaledVector(g.userData.explode, k);
    }
    const kf = smooth(THREE.MathUtils.clamp((explodeT - 0.3) / 0.7, 0, 1));
    for (const im of runtime.fasteners) im.position.copy(im.userData.axis).multiplyScalar(im.userData.backOut * kf);
    assembly.position.y = opts.explodeLift * smooth(explodeT);
  };
  // Transport fold: each arm swings about its hinge (the sleeve centre) round to the fuselage line
  // and down, the arm, pod, fin or dome, motor and folded prop all on the hinge. 22° of droop (8°
  // before 2026-10-14) lays the arms visibly down along the body, as the real arms stow, while the
  // lowest fin stays 4 cm off the ground (a straight-down fold, as on the M350, would put this
  // model's 0.32 m arm, hinged 0.26 m up, into the ground; folding back alongside the body is
  // blocked by the legs). Hosts that fold arms one at a time read these from runtime.fold.
  const FOLD_YAW = THREE.MathUtils.degToRad(62), FOLD_DROOP = THREE.MathUtils.degToRad(22);
  runtime.fold = { yaw: FOLD_YAW, droop: FOLD_DROOP };
  root.setArmFold = (t) => {
    foldT = THREE.MathUtils.clamp(t, 0, 1);
    const k = smooth(foldT);
    for (const a of runtime.arms) a.hinge.rotation.set(0, -a.sx * a.sz * FOLD_YAW * k, -FOLD_DROOP * k);
    applyRotorPose();
  };
  root.setRotorSpeed = (w) => { rotorSpeed = w; };
  function applyRotorPose() {
    // blades fold early in the stroke: park the hub across the arm, then swing both blades back along it
    const kb = smooth(THREE.MathUtils.clamp(foldT / 0.6, 0, 1));
    // Hub parked across the arm on the side that puts the blades' narrow leading-edge strips face to
    // face (the chord sits 30/70 about the pivot), and each blade swings back to 10° short of the arm
    // line: a slight V, as real folded props lie, so the two 50 mm chords never pass through each other
    // on pivots 32 mm apart.
    const TAU = Math.PI * 2, SPLAY = THREE.MathUtils.degToRad(10), F = Math.PI / 2 - SPLAY;
    for (const r of runtime.rotors) {
      const park = -r.dir * Math.PI / 2;
      const a = ((r.angle % TAU) + TAU) % TAU;
      let delta = park - a; delta = ((delta % TAU) + TAU) % TAU; if (delta > Math.PI) delta -= TAU;
      r.node.rotation.y = a + delta * kb;
      // set the whole Euler: a host that restores poses through quaternions (the showcase's staged
      // explode does) leaves blade B as (PI, 0, PI) — setting y alone would then fold B onto A
      r.blades[0].rotation.set(0, -r.dir * F * kb, r.blades[0].userData.droop || 0);
      r.blades[1].rotation.set(0, Math.PI + r.dir * F * kb, r.blades[1].userData.droop || 0);
    }
  }
  root.update = (dt) => {
    if (rotorSpeed === 0 || foldT > 0.001) return;
    for (const r of runtime.rotors) { r.angle += r.dir * rotorSpeed * dt; r.node.rotation.y = r.angle; }
  };
  root.setLights = (on = true) => { M.ledWhite.emissiveIntensity = on ? 2.2 : 0; M.beacon.emissiveIntensity = on ? 1.2 : 0; M.ledRed.emissiveIntensity = on ? 2 : 0; };
  // each axis on its own joint: yaw at the top (under the connector), roll behind the camera, pitch
  // through the camera's centre (pitch + = nose up; roll + = right side down, as seen from behind)
  // Mechanical stops, as a real gimbal has: roll ±15°, pitch 45° up / 120° down. Past them a corner
  // of the camera (or of fly's larger payloads, the P1 lens barrel) would reach the yaw arm. Checked
  // vertex-by-vertex, no part inside another, over yaw ±90°, pitch 45° up … 115° down and roll ±25°
  // asked (±15° given). The film rolls ±9° and pitches 18° up … 85° down; fly's level-keeping can ask
  // for more (its 25° bank and tilt limits on top of the stick).
  const ROLL_STOP = 15, PITCH_UP = 45, PITCH_DOWN = 120;
  root.setGimbal = (yawDeg = 0, pitchDeg = 0, rollDeg = 0) => {
    gYaw.rotation.set(0, THREE.MathUtils.degToRad(yawDeg), 0);
    gRoll.rotation.set(0, 0, THREE.MathUtils.degToRad(THREE.MathUtils.clamp(rollDeg, -ROLL_STOP, ROLL_STOP)));
    gCam.rotation.set(THREE.MathUtils.degToRad(-THREE.MathUtils.clamp(pitchDeg, -PITCH_DOWN, PITCH_UP)), 0, 0);
  };
  root.getState = () => ({ explode: explodeT, fold: foldT, rotorSpeed });
  root.dispose = () => {
    root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    for (const m of Object.values(M)) {
      if (!m.isMaterial) continue;
      for (const k of ['map', 'roughnessMap', 'metalnessMap', 'bumpMap', 'normalMap', 'aoMap']) m[k]?.dispose();
      m.dispose();
    }
    for (const t of Object.values(M._textures)) t.dispose();
  };
  for (const r of runtime.rotors) r.node.rotation.y = r.angle;

  root.userData.sculptRuntime = runtime;
  root.userData.materials = M;
  root.userData.dimensions = D;
  return root;
}

function toNI(g) {
  const out = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(out.attributes)) if (!['position', 'normal', 'uv'].includes(name)) out.deleteAttribute(name);
  if (!out.attributes.normal) out.computeVertexNormals();
  if (!out.attributes.uv) out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  out.clearGroups();
  return out;
}
