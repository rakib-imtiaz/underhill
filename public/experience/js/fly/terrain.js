// Fly mode: the land, beyond what the film needed. field.js is imported as it is; everything here
// works on fly's own Field instance or adds new meshes.
//
//   noise      one tileable 256² RGBA value-noise texture (4 frequencies), sampled by the ground,
//              sky, water and impostor shaders and, on the CPU, by the LiDAR's colours
//   creek      a creek along the valley floor (z ≈ −31 low line): its centre line, a channel carved
//              into this page's copy of the terrain (mesh + the heights groundAt() reads), its level
//   farHeight  the land out to 6 km: the site's own smooth height continued, fading in a flood plain,
//              the river and mountains rising on both sides of the valley; equal to groundAt() at the
//              site's edge
//   FarTerrain a coarse LOD grid (cells growing from ~12 m to ~1 km) with a hole for the site, stitched
//              to the site terrain's own edge vertices (no seam, no crack)
//   ground     the height under any point: the site mesh inside ±170 m, the far grid's own triangles
//              outside (exact, so the drone and the LiDAR sit on what is drawn)
//   material   the ground detail shader shared by the site and the far grid (macro colour, dry grass,
//              dirt, slope rock, damp valley floor, the gravel access track, micro variation)
import * as THREE from 'three';
import { heightAt, groundAt, TERRAIN } from '../field.js';

const E = 170;                 // the site terrain's half size
export const WORLD = 6000;     // the far grid's half size
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ------------------------------------------------------------------- value noise (CPU) */
function hash(i, j) { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** −1..1 fractal value noise (the field's own, for continuity). */
export function fbm(x, z, oct = 5) {
  let s = 0, a = 0.5, f = 1;
  for (let o = 0; o < oct; o++) { s += a * (vnoise(x * f, z * f) * 2 - 1); f *= 2.03; a *= 0.5; }
  return s;
}

/* -------------------------------------------------------------- the noise texture */
export const NOISE = { N: 256, ch: null, tex: null };
function tileFbm(N, seed, octs) {
  const out = new Float32Array(N * N);
  let s = seed >>> 0; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  let tot = 0;
  for (const [cells, amp] of octs) {
    const lat = new Float32Array(cells * cells); for (let i = 0; i < lat.length; i++) lat[i] = r();
    for (let y = 0; y < N; y++) {
      const fy = (y / N) * cells, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
      const r0 = (y0 % cells) * cells, r1 = ((y0 + 1) % cells) * cells;
      for (let x = 0; x < N; x++) {
        const fx = (x / N) * cells, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
        const c0 = x0 % cells, c1 = (x0 + 1) % cells;
        const top = lat[r0 + c0] + (lat[r0 + c1] - lat[r0 + c0]) * sx, bot = lat[r1 + c0] + (lat[r1 + c1] - lat[r1 + c0]) * sx;
        out[y * N + x] += amp * (top + (bot - top) * sy);
      }
    }
    tot += amp;
  }
  // stretch to 0..1
  let lo = Infinity, hi = -Infinity; for (const v of out) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo);
  return out;
}
export function makeNoise(aniso = 4) {
  if (NOISE.tex) return NOISE.tex;
  const N = NOISE.N;
  NOISE.ch = [
    tileFbm(N, 11, [[4, 1], [8, 0.5], [16, 0.25]]),             // r: macro
    tileFbm(N, 23, [[8, 1], [16, 0.55], [32, 0.3]]),             // g: meso
    tileFbm(N, 37, [[32, 1], [64, 0.6], [128, 0.35]]),           // b: micro
    tileFbm(N, 53, [[6, 1], [12, 0.6], [24, 0.3], [48, 0.15]]),  // a: patches
  ];
  const d = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) for (let c = 0; c < 4; c++) d[i * 4 + c] = Math.round(NOISE.ch[c][i] * 255);
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = aniso;
  t.needsUpdate = true;
  NOISE.tex = t;
  return t;
}
/** Sample a channel at texture coordinates (u, v) (1 = one tile), bilinear, wrapping. */
export function noiseAt(c, u, v) {
  const N = NOISE.N, ch = NOISE.ch[c];
  const x = (u - Math.floor(u)) * N - 0.5, y = (v - Math.floor(v)) * N - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const X0 = (x0 + N) % N, X1 = (x0 + 1 + N) % N, Y0 = (y0 + N) % N, Y1 = (y0 + 1 + N) % N;
  const a = ch[Y0 * N + X0], b = ch[Y0 * N + X1], cc = ch[Y1 * N + X0], dd = ch[Y1 * N + X1];
  return a + (b - a) * fx + (cc - a) * fy + (a - b - cc + dd) * fx * fy;
}

/* ------------------------------------------------------------------------- the creek */
/** z of the creek's centre line at x (the valley floor's low line, meandering wider far out). */
export function creekZ(x) {
  const far = smooth(450, 1600, Math.abs(x));      // near the site it keeps to the film's low line
  return -31 + 2.2 * Math.sin(x * 0.031 + 0.4) + 1.2 * Math.sin(x * 0.083) + far * (70 * Math.sin(x * 0.0017 + 1.1) + 25 * Math.sin(x * 0.0049));
}
const CW = 3.6, CDEPTH = 1.15;          // the site channel's half width and depth
/** The water surface at x: in the site 0.5 m under the original ground, far out 0.4 m over the flood plain. */
export function waterLevel(x) {
  const zc = creekZ(x);
  const site = heightAt(x, zc) - 0.5;
  const far = heightAt(x, zc) + 0.2 - 0.004 * x + 0.4;
  return site + (far - site) * smooth(170, 330, Math.abs(x));
}
/** Half width of the water ribbon at x. */
export const waterHalfWidth = (x) => 4.6 + 9 * smooth(170, 400, Math.abs(x));

/**
 * Carve the creek into this page's terrain (its geometry and TERRAIN.heights, which groundAt()
 * reads), and give the terrain the damp-ground attribute the ground shader uses.
 */
export function carveCreek(field) {
  const geo = field.terrain.geometry, pos = geo.attributes.position, H = TERRAIN.heights;
  const wet = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const d = Math.abs(z - creekZ(x));
    if (d < CW) {
      const p = 1 - (d / CW) * (d / CW);
      const y = pos.getY(i) - CDEPTH * p;
      pos.setY(i, y); H[i] = y;
    }
    wet[i] = (1 - smooth(2.5, 18, d)) * 0.85 + (1 - smooth(-7, -3.5, pos.getY(i))) * 0.25;
  }
  pos.needsUpdate = true;
  geo.setAttribute('aWet', new THREE.BufferAttribute(wet, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
}

/* ------------------------------------------------------------------- the far land */
/** The site's smooth height without its finest ripples (a coarse grid would alias them into a washboard;
 *  the ground shader carries that detail instead). The same value noise as field.js, so this subtracts exactly. */
function baseHeight(x, z, r) {
  return heightAt(x, z) - 0.35 * fbm(x * 0.11, z * 0.11, 3) - 2.6 * fbm(x * 0.018, z * 0.018) * smooth(500, 1400, r) * 0.7;
}
/** Height of the land anywhere (smooth); equals groundAt() on the site's edge. */
export function farHeight(x, z) {
  const ax = Math.abs(x), az = Math.abs(z), r = Math.max(ax, az);
  let h = baseHeight(x, z, r);
  if (r < 260) {
    // the rendered mesh differs a little from the smooth function: carry that difference across the edge
    const ex = clamp(x, -E + 0.001, E - 0.001), ez = clamp(z, -E + 0.001, E - 0.001);
    h += (groundAt(ex, ez) - baseHeight(ex, ez, E)) * (1 - smooth(E, 260, r));
  }
  const w = smooth(E, 330, r);                     // far features fade in outside the site
  if (w <= 0) return h;
  const zc = creekZ(x), dc = Math.abs(z - zc);
  const floor = heightAt(x, zc);
  const plain = 1 - smooth(30, 110, dc);
  h += (floor + 0.2 - h) * plain * w;              // the flood plain
  h -= (1 - smooth(4, 14, dc)) * 1.6 * w;          // the river channel
  // mountains rising from the valley walls, ridged, highest a few km out
  const s = smooth(160, 2600, dc);
  const n = fbm(x * 0.0007 + 3.1, z * 0.0007 - 1.7, 4);
  const rg = 1 - Math.abs(fbm(x * 0.0019 + 7.3, z * 0.0019 + 2.9, 4));
  h += (Math.pow(s, 1.5) * (1250 + 520 * n) + 300 * s * s * rg * rg + 40 * s * fbm(x * 0.006, z * 0.006, 2)) * w;
  h += -0.004 * x * w;                             // the valley falls gently to the east
  return h;
}

/* ------------------------------------------------------------------- the far grid */
let GRID = null;   // { xs, n, h, inner }

function farCoords(tier) {
  // cell edges on the positive side, from the stitch ring out to WORLD; inside the hole a coarse step
  const out = tier === 'lite'
    ? [176, 200, 240, 290, 350, 420, 500, 600, 720, 870, 1050, 1300, 1600, 2000, 2500, 3200, 4200, 6000]
    : tier === 'balanced'
      ? [176, 188, 202, 220, 242, 268, 298, 332, 370, 412, 460, 515, 578, 650, 730, 820, 930, 1060, 1210, 1400, 1640, 1940, 2300, 2750, 3300, 4000, 4900, 6000]
      : [176, 186, 197, 209, 222, 236, 252, 270, 290, 312, 336, 362, 390, 420, 455, 495, 540, 590, 645, 705, 770, 845, 930, 1030, 1150, 1290, 1450, 1640, 1860, 2120, 2420, 2780, 3200, 3700, 4300, 5100, 6000];
  const step = tier === 'lite' ? 34 : tier === 'balanced' ? 22 : 16;
  const inner = []; const k = Math.ceil(352 / step); for (let i = 1; i < k; i++) inner.push(-176 + (352 * i) / k);
  return [...out.map((v) => -v).reverse(), ...inner, ...out];
}

export class FarTerrain {
  /**
   * @param {Field} field  fly's Field (already carved)
   * @param {object} Q     quality tier
   * @param {THREE.Material} material  the shared ground material
   */
  constructor(field, Q, material) {
    const xs = farCoords(Q.tier), n = xs.length;
    const S = 176;
    const nv = n * n;
    const seg = TERRAIN.seg;
    const site = field.terrain.geometry;
    const sp = site.attributes.position, sn = site.attributes.normal, sw = site.attributes.aWet;
    // the site's edge loop: north (iz 0, x →), east (ix seg, z →), south (iz seg, x ←), west (ix 0, z ←)
    const loop = [];
    for (let ix = 0; ix < seg; ix++) loop.push(ix);
    for (let iz = 0; iz < seg; iz++) loop.push(iz * (seg + 1) + seg);
    for (let ix = seg; ix > 0; ix--) loop.push(seg * (seg + 1) + ix);
    for (let iz = seg; iz > 0; iz--) loop.push(iz * (seg + 1));
    const pos = new Float32Array((nv + loop.length) * 3), wet = new Float32Array(nv + loop.length);
    const h = new Float32Array(nv);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = xs[i], z = xs[j], k = j * n + i;
      const y = Math.max(Math.abs(x), Math.abs(z)) < S - 1e-3 ? 0 : farHeight(x, z);
      h[k] = y;
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      const dc = Math.abs(z - creekZ(x));
      wet[k] = (1 - smooth(8, 70, dc)) * 0.7;
    }
    loop.forEach((vi, m) => {
      const k = nv + m;
      pos[k * 3] = sp.getX(vi); pos[k * 3 + 1] = sp.getY(vi); pos[k * 3 + 2] = sp.getZ(vi);
      wet[k] = sw ? sw.getX(vi) : 0;
    });
    const idx = [];
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cz = (xs[j] + xs[j + 1]) / 2;
      if (Math.abs(cx) < S && Math.abs(cz) < S) continue;          // the hole: the site and the stitch strip
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    // the stitch strip between the site's edge loop and the grid's ring at ±176 (a zipper by perimeter)
    const ringI = xs.map((v, i) => i).filter((i) => xs[i] >= -S - 1e-3 && xs[i] <= S + 1e-3);
    const i0 = ringI[0], i1 = ringI[ringI.length - 1];
    const ring = [];
    for (const i of ringI) ring.push(i0 * n + i);                                     // north, x →
    for (const j of ringI.slice(1)) ring.push(j * n + i1);                            // east, z →
    for (const i of ringI.slice(0, -1).reverse()) ring.push(i1 * n + i);              // south, x ←
    for (const j of ringI.slice(1, -1).reverse()) ring.push(j * n + i0);              // west, z ←
    const per = (x, z, a) => {      // perimeter parameter 0..1 on a square of half size a (same orientation)
      if (Math.abs(z + a) < 1e-3 && x < a - 1e-3) return (x + a) / (8 * a);
      if (Math.abs(x - a) < 1e-3 && z < a - 1e-3) return (2 * a + z + a) / (8 * a);
      if (Math.abs(z - a) < 1e-3 && x > -a + 1e-3) return (4 * a + a - x) / (8 * a);
      return (6 * a + a - z) / (8 * a);
    };
    const tI = loop.map((vi) => per(sp.getX(vi), sp.getZ(vi), E));
    const tO = ring.map((k) => per(pos[k * 3], pos[k * 3 + 2], S));
    const nI = loop.length, nO = ring.length;
    let a = 0, b = 0;
    const I = (m) => nv + (m % nI), O = (m) => ring[m % nO];
    const tAt = (arr, m, len) => arr[m % len] + Math.floor(m / len);
    while (a < nI || b < nO) {
      const ta = a < nI ? tAt(tI, a + 1, nI) : Infinity, tb = b < nO ? tAt(tO, b + 1, nO) : Infinity;
      if (ta <= tb) { idx.push(I(a), O(b), I(a + 1)); a++; } else { idx.push(I(a), O(b), O(b + 1)); b++; }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aWet', new THREE.BufferAttribute(wet, 1));
    geo.setIndex(idx);
    // every triangle faces up (the zipper's winding depends on which loop advanced)
    const ix = geo.index.array, P = pos;
    for (let t = 0; t < ix.length; t += 3) {
      const p0 = ix[t], p1 = ix[t + 1], p2 = ix[t + 2];
      const ux = P[p1 * 3] - P[p0 * 3], uz = P[p1 * 3 + 2] - P[p0 * 3 + 2], vx = P[p2 * 3] - P[p0 * 3], vz = P[p2 * 3 + 2] - P[p0 * 3 + 2];
      if (uz * vx - ux * vz < 0) { ix[t + 1] = p2; ix[t + 2] = p1; }
    }
    geo.computeVertexNormals();
    // the edge loop takes the site terrain's own normals: no lighting seam at the edge
    const nrm = geo.attributes.normal;
    loop.forEach((vi, m) => nrm.setXYZ(nv + m, sn.getX(vi), sn.getY(vi), sn.getZ(vi)));
    geo.computeBoundingSphere();
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.name = 'fly:far-terrain';
    this.mesh.receiveShadow = Q.shadows;
    this.mesh.frustumCulled = false;
    this.triangles = idx.length / 3;
    GRID = { xs: Float64Array.from(xs), n, h, inner: S };
  }
}

function cellOf(xs, v) {
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= v) lo = m; else hi = m; }
  return lo;
}

/** The ground height under any point: the site mesh, the stitch strip (smooth), or the far grid (exact). */
export function ground(x, z) {
  const ax = Math.abs(x), az = Math.abs(z);
  if (ax < E && az < E) return groundAt(x, z);
  if (!GRID || (ax < GRID.inner && az < GRID.inner)) return farHeight(x, z);
  const { xs, n, h } = GRID;
  x = clamp(x, -WORLD + 0.01, WORLD - 0.01); z = clamp(z, -WORLD + 0.01, WORLD - 0.01);
  const i = cellOf(xs, x), j = cellOf(xs, z);
  const fx = (x - xs[i]) / (xs[i + 1] - xs[i]), fz = (z - xs[j]) / (xs[j + 1] - xs[j]);
  const a = h[j * n + i], b = h[j * n + i + 1], c = h[(j + 1) * n + i], d = h[(j + 1) * n + i + 1];
  return fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
}

/* -------------------------------------------------------------- the access track */
// from the south-west edge of the flying area, down the back slope, to the truck and on to the pad
export const TRACK = [[-600, 250], [-420, 170], [-260, 95], [-150, 48], [-70, 22], [-28, 10], [-12.6, 5.7], [-5.6, 3.0]];
export const TRUCK = { x: -12.6, z: 5.7, yaw: Math.atan2(15.4, -4.3) };

/** Distance from (x, z) to the track's centre line. */
export function trackDist(x, z) {
  let best = Infinity;
  for (let i = 0; i < TRACK.length - 1; i++) {
    const [ax, az] = TRACK[i], [bx, bz] = TRACK[i + 1];
    const ux = bx - ax, uz = bz - az, t = clamp(((x - ax) * ux + (z - az) * uz) / (ux * ux + uz * uz), 0, 1);
    best = Math.min(best, Math.hypot(x - ax - ux * t, z - az - uz * t));
  }
  return best;
}

/* ------------------------------------------------------------ the ground material */
const GROUND_FS = /* glsl */`
  uniform sampler2D uNoise; uniform vec4 uTrack[8]; uniform float uTrackN; uniform vec4 uTrackBox;
  varying vec3 vWp; varying vec3 vWn; varying float vWet;
  vec3 flyGround(out float rockK) {
    vec2 p = vWp.xz;
    // macro colour from two rotated, unrelated scales: no visible tiling or lattice from altitude
    vec2 pa = mat2(0.866, 0.5, -0.5, 0.866) * p, pb = mat2(0.956, -0.292, 0.292, 0.956) * p;
    float nM = texture2D(uNoise, pa * (1.0 / 263.0) + 0.31).r * 0.62 + texture2D(uNoise, pb * (1.0 / 117.0) + 0.67).a * 0.38;
    float nP = texture2D(uNoise, p * (1.0 / 47.0)).a;
    float nS = texture2D(uNoise, p * (1.0 / 13.0)).g;
    float nF = texture2D(uNoise, p * (1.0 / 1.9)).b;
    // meadow: greens to yellowed grass, dry patches, dirt where it is worn
    vec3 meadow = mix(vec3(0.082, 0.15, 0.03), vec3(0.2, 0.205, 0.055), smoothstep(0.32, 0.78, nM));
    vec3 c = mix(meadow, vec3(0.31, 0.255, 0.115), smoothstep(0.58, 0.84, nM * 0.55 + nS * 0.45));
    c = mix(c, vec3(0.15, 0.105, 0.06), smoothstep(0.7, 0.85, nP) * 0.8);
    // rock and scree on steep faces, thinner grass high up
    float slope = 1.0 - clamp(vWn.y, 0.0, 1.0);
    rockK = smoothstep(0.2, 0.36, slope + (nS - 0.5) * 0.12);
    vec3 rock = mix(vec3(0.16, 0.155, 0.14), vec3(0.3, 0.29, 0.26), nF);
    c = mix(c, rock, rockK);
    c = mix(c, mix(rock, vec3(0.31, 0.255, 0.115), 0.4), smoothstep(170.0, 520.0, vWp.y) * 0.75);
    c = mix(c, c * vec3(0.55, 0.66, 0.52), clamp(vWet, 0.0, 1.0));     // damp valley floor
    // far slopes: closed conifer forest where the stand mask says so (the impostors stand on the same mask)
    float standM = smoothstep(0.44, 0.56, texture2D(uNoise, p * (1.0 / 870.0) + vec2(0.37, 0.11)).a);
    float forestK = smoothstep(420.0, 800.0, length(p)) * standM * (1.0 - smoothstep(620.0, 880.0, vWp.y)) * (1.0 - rockK * 0.6);
    c = mix(c, vec3(0.018, 0.036, 0.02) * (0.65 + 0.7 * nS), forestK);
    // the gravel access track, two darker wheel ruts
    float best = 1e5, lat = 0.0;
    if (p.x < uTrackBox.z && p.x > uTrackBox.x && p.y > uTrackBox.y && p.y < uTrackBox.w) {   // only near the track
      for (int i = 0; i < 8; i++) {
        if (float(i) >= uTrackN) break;
        vec4 s = uTrack[i]; vec2 ab = s.zw - s.xy;
        float t = clamp(dot(p - s.xy, ab) / dot(ab, ab), 0.0, 1.0);
        vec2 q = s.xy + ab * t; float dd = distance(p, q);
        if (dd < best) { best = dd; lat = dot(p - q, normalize(vec2(-ab.y, ab.x))); }
      }
    }
    float track = 1.0 - smoothstep(1.3, 1.9, best + (nF - 0.5) * 0.45 + (nS - 0.5) * 0.35);
    vec3 gravel = vec3(0.3, 0.26, 0.2) * (0.82 + 0.36 * nF);
    gravel *= 1.0 - 0.3 * (1.0 - smoothstep(0.12, 0.32, abs(abs(lat) - 0.8)));
    c = mix(c, gravel, track);
    rockK = max(rockK, track * 0.6);
    return c * (0.8 + 0.4 * nF);
  }
`;

/** The ground detail material, shared by the site terrain and the far grid (one program). */
export function makeGroundMaterial(noiseTex) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.97, metalness: 0, envMapIntensity: 0.2, name: 'fly-ground' });
  const tr = TRACK.slice(0, -1).map(([ax, az], i) => new THREE.Vector4(ax, az, TRACK[i + 1][0], TRACK[i + 1][1]));
  while (tr.length < 8) tr.push(new THREE.Vector4(1e5, 1e5, 1e5 + 1, 1e5));
  const xs = TRACK.map((p) => p[0]), zs = TRACK.map((p) => p[1]);
  const box = new THREE.Vector4(Math.min(...xs) - 4, Math.min(...zs) - 4, Math.max(...xs) + 4, Math.max(...zs) + 4);
  m.userData.uniforms = { uNoise: { value: noiseTex }, uTrack: { value: tr }, uTrackN: { value: TRACK.length - 1 }, uTrackBox: { value: box } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWet; varying float vWet; varying vec3 vWp; varying vec3 vWn;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vWn = normalize(mat3(modelMatrix) * objectNormal); vWet = aWet;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GROUND_FS)
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat flyRock; diffuseColor.rgb = flyGround(flyRock);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.8, flyRock);');
  };
  m.customProgramCacheKey = () => 'fly-ground-1';
  return m;
}

/** The ground's albedo at (x, z) on the CPU (approximate: macro, dry, dirt, damp, track), linear RGB. */
/** The far-forest stand mask (0..1), as the ground shader computes it. */
export function standMask(x, z) { return smooth(0.44, 0.56, noiseAt(3, x / 870 + 0.37, z / 870 + 0.11)); }

export function groundColorAt(x, z) {
  const ax = 0.866 * x + 0.5 * z, az = -0.5 * x + 0.866 * z, bx = 0.956 * x - 0.292 * z, bz = 0.292 * x + 0.956 * z;
  const nM = noiseAt(0, ax / 263 + 0.31, az / 263 + 0.31) * 0.62 + noiseAt(3, bx / 117 + 0.67, bz / 117 + 0.67) * 0.38, nP = noiseAt(3, x / 47, z / 47), nS = noiseAt(1, x / 13, z / 13), nF = noiseAt(2, x / 1.9, z / 1.9);
  const t = smooth(0.32, 0.78, nM);
  let r = 0.082 + (0.2 - 0.082) * t, g = 0.15 + (0.205 - 0.15) * t, b = 0.03 + (0.055 - 0.03) * t;
  const dr = smooth(0.58, 0.84, nM * 0.55 + nS * 0.45);
  r += (0.31 - r) * dr; g += (0.255 - g) * dr; b += (0.115 - b) * dr;
  const dt = smooth(0.7, 0.85, nP) * 0.8;
  r += (0.15 - r) * dt; g += (0.105 - g) * dt; b += (0.06 - b) * dt;
  const wet = (1 - smooth(2.5, 18, Math.abs(z - creekZ(x)))) * 0.85;
  r *= 1 - 0.45 * wet; g *= 1 - 0.34 * wet; b *= 1 - 0.48 * wet;
  const tr = 1 - smooth(1.3, 1.9, trackDist(x, z));
  r += (0.3 - r) * tr; g += (0.26 - g) * tr; b += (0.2 - b) * tr;
  const k = 0.8 + 0.4 * nF;
  return [r * k, g * k, b * k];
}
