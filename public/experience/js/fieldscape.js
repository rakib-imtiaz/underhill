// Act II scenery: the film's survey site as a real place (a BC mountain valley), still procedural.
// Built only when the film asks for it (new Field(scene, { scenery: true })); fly mode builds its own.
//
//   noise     one tileable 256² RGBA value-noise texture, shared by every shader here
//   creek     a creek along the valley floor's low line, carved into the site mesh before anything
//             samples groundAt()
//   ground    one terrain material (site + far land): macro colour (green meadow, dry grass, damp
//             floor, dirt, rock and scree by slope, forest stands far out), the crew's gravel pad and
//             the access track, micro detail with a bump from the same noise, and baked lighting:
//             per-vertex sun / moon visibility (relief and tree shadows) and ambient occlusion
//   far land  a ring of land from the site's edge out to ~1.2 km, stitched to the site's own edge
//             vertices, rising into forested mountainsides
//   ridges    two hazy mountain rings beyond it (the far one snow-capped), atmospheric perspective
//             computed for their distance with the same horizon colour the fog uses
//   sky       gradient, sun glow and clouds by day; deep blue, stars, moon and an afterglow by night
//   forest    four conifer variants (spruce, fir, lodgepole pine, young tree) built as jagged layered
//             tiers with lit / shaded sides, in stands; a low-detail copy on the far land and point
//             impostors beyond
//   rocks     boulders along the creek and on the slopes
//   water     the creek's surface: sky reflection by Fresnel, ripples, a sun / moon glint
//   lath      a real survey lath: pine, painted top, marker writing, flagging tape knot and tails
// Every look change between day and night is a uniform: switching compiles nothing.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt, groundAt, FIELD } from './field.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lin = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ------------------------------------------------------------------------- the light */
// The key light is field.sun: the moon by night, the sun by day (field.look() blends them).
export const SUN_DIR = new THREE.Vector3(-0.78, 0.58, 0.1).normalize();     // afternoon, from the west
export const MOON_DIR = new THREE.Vector3(0.7, 0.42, 0.15).normalize();     // from the east, raking
export const LOOK = {
  night: { zenith: lin(0.004, 0.008, 0.026), horizon: lin(0.034, 0.05, 0.092), glow: lin(0.11, 0.065, 0.04), fog: [25, 1500],
    key: lin(0.55, 0.68, 1.0), keyI: 2.1, skyTop: lin(0.3, 0.4, 0.68), skyBot: lin(0.03, 0.035, 0.04), skyI: 0.95 },
  day: { zenith: lin(0.075, 0.2, 0.52), horizon: lin(0.5, 0.6, 0.72), glow: lin(0, 0, 0), fog: [40, 2300],
    key: lin(1.0, 0.93, 0.82), keyI: 3.4, skyTop: lin(0.62, 0.74, 0.95), skyBot: lin(0.2, 0.18, 0.13), skyI: 1.25 },
};

/* ------------------------------------------------------------------- value noise (CPU) */
function hash(i, j) { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z, oct = 5) {
  let s = 0, a = 0.5, f = 1;
  for (let o = 0; o < oct; o++) { s += a * (vnoise(x * f, z * f) * 2 - 1); f *= 2.03; a *= 0.5; }
  return s;
}

/* ------------------------------------------------------------------- noise texture */
const NOISE = { N: 256, ch: null, tex: null };
function tileFbm(N, seed, octs) {
  const out = new Float32Array(N * N);
  const r = rng(seed);
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
  }
  let lo = Infinity, hi = -Infinity; for (const v of out) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo);
  return out;
}
export function makeNoise(aniso = 4) {
  if (NOISE.tex) return NOISE.tex;
  const N = NOISE.N;
  NOISE.ch = [
    tileFbm(N, 11, [[4, 1], [8, 0.5], [16, 0.25]]),
    tileFbm(N, 23, [[8, 1], [16, 0.55], [32, 0.3]]),
    tileFbm(N, 37, [[32, 1], [64, 0.6], [128, 0.35]]),
    tileFbm(N, 53, [[6, 1], [12, 0.6], [24, 0.3], [48, 0.15]]),
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
function noiseAt(c, u, v) {
  const N = NOISE.N, ch = NOISE.ch[c];
  const x = (u - Math.floor(u)) * N - 0.5, y = (v - Math.floor(v)) * N - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const X0 = (x0 + N) % N, X1 = (x0 + 1 + N) % N, Y0 = (y0 + N) % N, Y1 = (y0 + 1 + N) % N;
  const a = ch[Y0 * N + X0], b = ch[Y0 * N + X1], cc = ch[Y1 * N + X0], dd = ch[Y1 * N + X1];
  return a + (b - a) * fx + (cc - a) * fy + (a - b - cc + dd) * fx * fy;
}
/** The far-forest stand mask (as the ground shader computes it). */
const standMask = (x, z) => smooth(0.42, 0.58, noiseAt(3, x / 410 + 0.37, z / 410 + 0.11));

/* ------------------------------------------------------------------------- the creek */
/** The creek is off: no water, no carved channel, no damp banks, nothing lined up along it (it read
 *  as a road across the site and the survey). Its centre line stays as the valley's axis for the
 *  mountains. true brings it all back. */
export const CREEK = false;
/** z of the creek's centre line at x (the valley floor's low line, z ≈ −31, meandering). */
export function creekZ(x) { return -31 + 2.4 * Math.sin(x * 0.029 + 0.4) + 1.3 * Math.sin(x * 0.077) + 9 * smooth(150, 700, Math.abs(x)) * Math.sin(x * 0.006 + 1.0); }
const CW = 2.3, CDEPTH = 0.55;
const carve = (x, z) => { if (!CREEK) return 0; const d = Math.abs(z - creekZ(x)); return d < CW ? CDEPTH * (1 - (d / CW) * (d / CW)) : 0; };
/** The water surface at x (follows the valley floor). */
export const waterLevel = (x) => heightAt(x, creekZ(x)) - 0.22;

/** Carve the creek into the site mesh (positions + TERRAIN.heights) and give it the damp attribute. */
export function carveSite(geo, heights) {
  const pos = geo.attributes.position;
  const wet = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const k = carve(x, z);
    if (k > 0) { const y = pos.getY(i) - k; pos.setY(i, y); heights[i] = y; }
    const d = Math.abs(z - creekZ(x));
    wet[i] = (CREEK ? (1 - smooth(3, 17, d)) * 0.85 : 0) + (1 - smooth(-6.5, -3, pos.getY(i))) * 0.3;
  }
  geo.setAttribute('aWet', new THREE.BufferAttribute(wet, 1));
}

/* ------------------------------------------------------------------- the access track */
export const TRACK = [[-420, 270], [-260, 170], [-165, 112], [-100, 70], [-55, 38], [-26, 17], [-12, 7.5], [-6.2, 3.6]];
export function trackDist(x, z) {
  let best = Infinity;
  for (let i = 0; i < TRACK.length - 1; i++) {
    const [ax, az] = TRACK[i], [bx, bz] = TRACK[i + 1];
    const ux = bx - ax, uz = bz - az, t = clamp(((x - ax) * ux + (z - az) * uz) / (ux * ux + uz * uz), 0, 1);
    best = Math.min(best, Math.hypot(x - ax - ux * t, z - az - uz * t));
  }
  return best;
}
// the crew's gravel pad
const PAD = { x: -0.3, z: 1.5, r: 3.7 };

/* ------------------------------------------------------------------- the far land */
const E = 170;            // the site terrain's half size (TERRAIN.size / 2; not read here: field.js imports this module)
/** Mountains rising from the valley walls (0 at the site). */
function mountain(x, z) {
  const dc = Math.abs(z - creekZ(x));
  const s = smooth(150, 1150, dc);
  if (s <= 0) return 0;
  const n = fbm(x * 0.0021 + 3.1, z * 0.0021 - 1.7, 4);
  const rg = 1 - Math.abs(fbm(x * 0.0047 + 7.3, z * 0.0047 + 2.9, 4));
  return Math.pow(s, 1.3) * (190 + 80 * n) + 70 * s * rg * rg + 14 * s * fbm(x * 0.013, z * 0.013, 3);
}

export class FarLand {
  constructor(field, Q, material) {
    const site = field.terrain.geometry, sp = site.attributes.position, sn = site.attributes.normal, sw = site.attributes.aWet;
    const loop = [];
    for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), z = sp.getZ(i); if (Math.abs(Math.abs(x) - E) < 1e-3 || Math.abs(Math.abs(z) - E) < 1e-3) loop.push(i); }
    const ang = (i) => Math.atan2(sp.getZ(i), sp.getX(i));
    loop.sort((a, b) => ang(a) - ang(b));
    const K = loop.length;
    const J = Q.tier === 'lite' ? 13 : Q.tier === 'balanced' ? 17 : 21;
    const DMAX = 1060, P = 2.1;
    const Dj = (j) => DMAX * Math.pow(j / J, P);
    const nv = K * (J + 1);
    const pos = new Float32Array(nv * 3), wet = new Float32Array(nv), light = new Float32Array(nv * 3).fill(1);
    const eR = new Float32Array(K), eA = new Float32Array(K), corr = new Float32Array(K);
    for (let k = 0; k < K; k++) {
      const vi = loop[k], ex = sp.getX(vi), ez = sp.getZ(vi), ey = sp.getY(vi);
      eR[k] = Math.hypot(ex, ez); eA[k] = Math.atan2(ez, ex);
      corr[k] = ey - (heightAt(ex, ez) - carve(ex, ez));
      const nx = ex / eR[k], nz = ez / eR[k];
      for (let j = 0; j <= J; j++) {
        const m = j * K + k, D = Dj(j);
        if (j === 0) { pos[m * 3] = ex; pos[m * 3 + 1] = ey; pos[m * 3 + 2] = ez; wet[m] = sw ? sw.getX(vi) : 0; continue; }
        const x = ex + nx * D, z = ez + nz * D;
        let y = heightAt(x, z) - carve(x, z) + corr[k] * (1 - smooth(0, 90, D)) + mountain(x, z) * smooth(0, 160, D);
        y -= 0.0025 * x * smooth(0, 200, D);     // the valley falls gently to the east
        pos[m * 3] = x; pos[m * 3 + 1] = y; pos[m * 3 + 2] = z;
        const dc = Math.abs(z - creekZ(x));
        wet[m] = CREEK ? (1 - smooth(3, 40, dc)) * 0.7 : 0;
      }
    }
    const idx = [];
    for (let j = 0; j < J; j++) for (let k = 0; k < K; k++) {
      const k1 = (k + 1) % K;
      const a = j * K + k, b = j * K + k1, c = (j + 1) * K + k, d = (j + 1) * K + k1;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aWet', new THREE.BufferAttribute(wet, 1));
    geo.setAttribute('aLight', new THREE.BufferAttribute(light, 3));
    geo.setIndex(idx);
    const ix = geo.index.array;
    for (let t = 0; t < ix.length; t += 3) {
      const p0 = ix[t], p1 = ix[t + 1], p2 = ix[t + 2];
      const ux = pos[p1 * 3] - pos[p0 * 3], uz = pos[p1 * 3 + 2] - pos[p0 * 3 + 2], vx = pos[p2 * 3] - pos[p0 * 3], vz = pos[p2 * 3 + 2] - pos[p0 * 3 + 2];
      if (uz * vx - ux * vz < 0) { ix[t + 1] = p2; ix[t + 2] = p1; }
    }
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal;
    loop.forEach((vi, k) => nrm.setXYZ(k, sn.getX(vi), sn.getY(vi), sn.getZ(vi)));
    // a little ambient occlusion in the folds (concave ground is darker): from the normal's tilt and the
    // height relative to the ring's neighbours
    for (let j = 1; j <= J; j++) for (let k = 0; k < K; k++) {
      const m = j * K + k;
      const up = nrm.getY(m);
      light[m * 3 + 2] = 0.7 + 0.3 * up;
    }
    geo.computeBoundingSphere();
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.name = 'field:far-land';
    this.mesh.receiveShadow = field.terrain.receiveShadow;
    this.mesh.frustumCulled = false;
    this.grid = { K, J, eR, eA, DMAX, P, pos };
  }

  /** Height of the far land mesh (bilinear in its ray / row parameters; close to its triangles). */
  heightAt(x, z) {
    const { K, J, eR, eA, DMAX, P, pos } = this.grid;
    const a = Math.atan2(z, x);
    let lo = 0, hi = K;
    while (lo < hi) { const m = (lo + hi) >> 1; if (eA[m] <= a) lo = m + 1; else hi = m; }
    const k0 = (lo - 1 + K) % K, k1 = lo % K;
    let span = eA[k1] - eA[k0]; if (span <= 0) span += Math.PI * 2;
    let da = a - eA[k0]; if (da < 0) da += Math.PI * 2;
    const fk = clamp(da / span, 0, 1);
    const r = Math.hypot(x, z), er = eR[k0] + (eR[k1] - eR[k0]) * fk;
    const D = clamp(r - er, 0, DMAX);
    const jf = J * Math.pow(D / DMAX, 1 / P), j0 = Math.min(J - 1, Math.floor(jf)), fj = jf - j0;
    const y = (j, k) => pos[(j * K + k) * 3 + 1];
    return (y(j0, k0) * (1 - fk) + y(j0, k1) * fk) * (1 - fj) + (y(j0 + 1, k0) * (1 - fk) + y(j0 + 1, k1) * fk) * fj;
  }
}

/* ------------------------------------------------------------- the ground material */
const GROUND_FS = /* glsl */`
  uniform sampler2D uNoise; uniform float uDay; uniform vec4 uParcel; uniform float uRot; uniform float uModel; uniform vec2 uHR;
  uniform vec4 uTrack[8]; uniform vec4 uTrackBox; uniform vec3 uPad;
  varying vec3 vWp; varying vec3 vWn; varying float vWet; varying vec3 vLight;
  float gH; float gRock; float gSunVis; float gAO; float gFar;
  vec3 gHypso(float t){
    vec3 a = vec3(0.05, 0.25, 0.32), b = vec3(0.22, 0.42, 0.22), c = vec3(0.62, 0.5, 0.2), d = vec3(0.6, 0.25, 0.12);
    return t < 0.33 ? mix(a, b, t / 0.33) : t < 0.66 ? mix(b, c, (t - 0.33) / 0.33) : mix(c, d, (t - 0.66) / 0.34);
  }
  vec3 groundAlbedo(){
    vec2 p = vWp.xz;
    float dist = distance(vWp, cameraPosition);
    gFar = smoothstep(40.0, 220.0, dist);
    vec2 pa = mat2(0.866, 0.5, -0.5, 0.866) * p, pb = mat2(0.956, -0.292, 0.292, 0.956) * p;
    // one RGBA fetch per scale (four in all): macro, meso, fine, micro
    vec4 tM = texture2D(uNoise, pa * (1.0 / 230.0) + 0.31);
    vec4 tS = texture2D(uNoise, pb * (1.0 / 11.0));
    vec4 tF = texture2D(uNoise, pa * (1.0 / 2.3));
    vec4 tX = texture2D(uNoise, p * (1.0 / 0.53));
    float nM = tM.r * 0.6 + tM.a * 0.4;
    float nP = tS.a * 0.35 + tM.g * 0.65;
    float nS = tS.g;
    float nF = tF.b;
    float nX = tX.b;
    float nG = tX.g * 0.5 + tF.a * 0.5;
    float slope = 1.0 - clamp(vWn.y, 0.0, 1.0);
    // meadow: lush green where it is damp or shaded, dry golden grass on the rest
    float dry = smoothstep(0.36, 0.72, nM * 0.72 + nS * 0.28 + vWp.y * 0.012 - vWet * 0.4);
    vec3 green = mix(vec3(0.026, 0.05, 0.016), vec3(0.058, 0.086, 0.026), nS);
    vec3 golden = mix(vec3(0.17, 0.13, 0.055), vec3(0.3, 0.24, 0.12), nF * 0.6 + nS * 0.4);
    vec3 c = mix(green, golden, dry);
    // grass tufts and the darker gaps between them, up close (averaged out with distance)
    c *= mix(0.68 + 0.64 * nX, 1.0, gFar);
    c *= 0.85 + 0.3 * nF;
    // bare dirt
    float dirtK = smoothstep(0.7, 0.85, nP * 0.7 + nS * 0.3);
    c = mix(c, vec3(0.14, 0.1, 0.064) * (0.75 + 0.5 * nF), dirtK * 0.8);
    // rock and scree on the steep ground
    gRock = smoothstep(0.26, 0.44, slope + (nS - 0.5) * 0.18);
    vec3 rock = mix(vec3(0.12, 0.115, 0.105), vec3(0.26, 0.25, 0.23), nF * 0.65 + nX * 0.35);
    c = mix(c, rock, gRock);
    // the damp valley floor
    c = mix(c, c * vec3(0.55, 0.72, 0.55), clamp(vWet, 0.0, 1.0));
    // far out: closed conifer forest on the mountainsides, thinning toward the bare upper slopes
    float stand = 0.0;
    if (dot(p, p) > 33000.0) stand = smoothstep(0.42, 0.58, textureLod(uNoise, p * (1.0 / 410.0) + vec2(0.37, 0.11), 0.0).a);
    float forestK = smoothstep(185.0, 320.0, length(p)) * mix(stand, 1.0, smoothstep(60.0, 160.0, vWp.y) * 0.65) * (1.0 - smoothstep(250.0, 330.0, vWp.y)) * (1.0 - gRock * 0.6);
    c = mix(c, vec3(0.014, 0.027, 0.017) * (0.65 + 0.7 * nS), forestK);
    c = mix(c, mix(rock, vec3(0.24, 0.22, 0.17), 0.5), smoothstep(250.0, 340.0, vWp.y) * 0.75);
    // the crew's gravel pad and the access track
    float r = length(vec2((vWp.x - uPad.x) * 0.8, (vWp.z - uPad.y) * 1.25));
    float pad = (1.0 - smoothstep(uPad.z - 1.2, uPad.z + 0.6, r + (nS - 0.5) * 2.0 + (nF - 0.5) * 0.9)) * (0.55 + 0.45 * smoothstep(0.3, 0.6, nX + nF * 0.3));
    float best = 1e5, lat = 0.0;
    if (p.x > uTrackBox.x && p.x < uTrackBox.z && p.y > uTrackBox.y && p.y < uTrackBox.w) {
      for (int i = 0; i < 7; i++) {
        vec4 s = uTrack[i]; vec2 ab = s.zw - s.xy;
        float t = clamp(dot(p - s.xy, ab) / dot(ab, ab), 0.0, 1.0);
        vec2 q = s.xy + ab * t; float dd = distance(p, q);
        if (dd < best) { best = dd; lat = dot(p - q, normalize(vec2(-ab.y, ab.x))); }
      }
    }
    float track = 1.0 - smoothstep(1.35, 1.95, best + (nF - 0.5) * 0.5 + (nS - 0.5) * 0.4);
    float ruts = 1.0 - smoothstep(0.12, 0.34, abs(abs(lat) - 0.78));
    float grav = max(pad, track);
    vec3 gravel = mix(vec3(0.115, 0.1, 0.08), vec3(0.2, 0.188, 0.165), nF) * (0.84 + 0.3 * nG * (1.0 - gFar)) * (0.92 + 0.16 * nX);
    gravel *= 1.0 - 0.28 * ruts * track;
    // a grassy crown between the ruts
    gravel = mix(gravel, c, track * (1.0 - smoothstep(0.25, 0.5, abs(lat))) * 0.55 * (1.0 - pad));
    c = mix(c, gravel, grav);
    gRock = max(gRock, grav * 0.7);
    // relief for the bump (metres): clumps, stones, undulation
    gH = (nX * 0.05 + nF * 0.09) * (1.0 - gFar) + nS * 0.3 + gRock * nF * 0.18;
    gH -= grav * nX * 0.02;
    // the model: hypsometric tint inside the staked parcel
    vec2 q = p - uParcel.xy; float cs = cos(uRot), sn = sin(uRot);
    vec2 pl = vec2(q.x * cs + q.y * sn, -q.x * sn + q.y * cs);
    float ex = uParcel.z - abs(pl.x), ey = uParcel.w - abs(pl.y);
    float inP = clamp(min(ex / max(fwidth(ex), 1e-3), ey / max(fwidth(ey), 1e-3)) + 0.5, 0.0, 1.0);
    c = mix(c, gHypso(clamp((vWp.y - uHR.x) / (uHR.y - uHR.x), 0.0, 1.0)) * 0.5, inP * uModel * 0.8);
    // baked light: sun / moon visibility (relief + trees) and ambient occlusion
    gSunVis = mix(vLight.x, vLight.y, uDay);
    gAO = vLight.z;
    return c;
  }
`;

/** The ground material shared by the site terrain and the far land (one program). */
export function makeGroundMaterial(noiseTex, { hmin, hmax }) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0, envMapIntensity: 0.12, name: 'field-ground' });
  const tr = TRACK.slice(0, -1).map(([ax, az], i) => new THREE.Vector4(ax, az, TRACK[i + 1][0], TRACK[i + 1][1]));
  while (tr.length < 8) tr.push(new THREE.Vector4(1e5, 1e5, 1e5 + 1, 1e5));
  const xs = TRACK.map((p) => p[0]), zs = TRACK.map((p) => p[1]);
  const P = FIELD.parcel;
  m.userData.uniforms = {
    uNoise: { value: noiseTex }, uDay: { value: 0 }, uModel: { value: 0 },
    uParcel: { value: new THREE.Vector4(P.cx, P.cz, P.ha, P.hc) }, uRot: { value: P.rot }, uHR: { value: new THREE.Vector2(hmin, hmax) },
    uTrack: { value: tr }, uTrackBox: { value: new THREE.Vector4(Math.min(...xs) - 4, Math.min(...zs) - 4, Math.max(...xs) + 4, Math.max(...zs) + 4) },
    uPad: { value: new THREE.Vector3(PAD.x, PAD.z, PAD.r) },
  };
  const lights = THREE.ShaderChunk.lights_fragment_begin.replace(
    'getDirectionalLightInfo( directionalLight, directLight );',
    'getDirectionalLightInfo( directionalLight, directLight ); directLight.color *= gSunVis;');
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWet; attribute vec3 aLight; varying float vWet; varying vec3 vWp; varying vec3 vWn; varying vec3 vLight;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vWn = normalize(mat3(modelMatrix) * objectNormal); vWet = aWet; vLight = aLight;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GROUND_FS)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = groundAlbedo();')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.86, gRock);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // bump from the ground's own relief (metres): exact surface gradient from screen derivatives
          vec3 sp = -vViewPosition; vec3 dpx = dFdx(sp), dpy = dFdy(sp);
          float hx = dFdx(gH), hy = dFdy(gH);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          vec3 grad = sign(det) * (hx * r1 + hy * r2);
          normal = normalize(abs(det) * normal - grad * (1.0 - 0.6 * gFar));
        }`)
      .replace('#include <lights_fragment_begin>', lights)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= gAO; reflectedLight.indirectSpecular *= gAO;');
  };
  m.customProgramCacheKey = () => 'field-ground-1';
  return m;
}

/* -------------------------------------------------------------------- baked light */
/**
 * Per-vertex light for the site: visibility of the moon (x) and the sun (y), relief and tree
 * shadows, and ambient occlusion (z), from a regular height raster of the rendered mesh.
 */
export function bakeLight(geo, trees) {
  const C = 1.5, N = Math.ceil((2 * E) / C) + 1;
  const H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = groundAt(-E + i * C, -E + j * C);
  const hAt = (x, z) => {
    const gx = clamp((x + E) / C, 0, N - 1.001), gz = clamp((z + E) / C, 0, N - 1.001);
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
    const a = H[j * N + i], b = H[j * N + i + 1], c = H[(j + 1) * N + i], d = H[(j + 1) * N + i + 1];
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  };
  // tree shade rasters (1 m): shadow of each crown along each light, and a darker floor under it
  const TC = 1, TN = Math.ceil((2 * E) / TC) + 1;
  const sh = [new Float32Array(TN * TN).fill(1), new Float32Array(TN * TN).fill(1)];
  const ao = new Float32Array(TN * TN).fill(1);
  const lights = [MOON_DIR, SUN_DIR];
  const splat = (arr, cx, cz, ux, uz, len, wid, dark) => {
    // an ellipse: along (ux, uz) half length len, across half width wid
    const R = Math.max(len, wid);
    const i0 = Math.max(0, Math.floor((cx - R + E) / TC)), i1 = Math.min(TN - 1, Math.ceil((cx + R + E) / TC));
    const j0 = Math.max(0, Math.floor((cz - R + E) / TC)), j1 = Math.min(TN - 1, Math.ceil((cz + R + E) / TC));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = -E + i * TC - cx, dz = -E + j * TC - cz;
      const a = (dx * ux + dz * uz) / len, b = (-dx * uz + dz * ux) / wid;
      const q = a * a + b * b;
      if (q < 1) { const k = arr === ao ? 1 - dark * (1 - q) : 1 - dark * smooth(1, 0.35, q); const m = j * TN + i; arr[m] = Math.min(arr[m], k); }
    }
  };
  for (const t of trees) {
    if (Math.abs(t.x) > E || Math.abs(t.z) > E) continue;
    splat(ao, t.x, t.z, 1, 0, t.R * 1.7, t.R * 1.7, 0.45);
    lights.forEach((L, li) => {
      const lx = L.x, lz = L.z, lh = Math.hypot(lx, lz), tanE = L.y / lh;
      const ux = -lx / lh, uz = -lz / lh;
      const mid = (t.y0 + t.y1) * 0.5 / tanE, len = Math.max(t.R, (t.y1 - t.y0) * 0.5 / tanE);
      splat(sh[li], t.x + ux * mid, t.z + uz * mid, ux, uz, len, t.R * 0.95, 0.72);
    });
  }
  const tAt = (arr, x, z) => {
    const gx = clamp((x + E) / TC, 0, TN - 1.001), gz = clamp((z + E) / TC, 0, TN - 1.001);
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
    return (arr[j * TN + i] * (1 - fx) + arr[j * TN + i + 1] * fx) * (1 - fz) + (arr[(j + 1) * TN + i] * (1 - fx) + arr[(j + 1) * TN + i + 1] * fx) * fz;
  };
  const pos = geo.attributes.position;
  const out = new Float32Array(pos.count * 3);
  const steps = [1.2, 2.5, 4, 6, 9, 13, 18, 25, 34, 46, 62, 84, 110];
  const aoSteps = [1.5, 3.5, 7, 13, 24, 40];
  const dirs = 8;
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v), z = pos.getZ(v), y = pos.getY(v) + 0.15;
    lights.forEach((L, li) => {
      const lh = Math.hypot(L.x, L.z), tanE = L.y / lh, ux = L.x / lh, uz = L.z / lh;
      let hor = -10;
      for (const s of steps) hor = Math.max(hor, (hAt(x + ux * s, z + uz * s) - y) / s);
      const vis = 1 - smooth(tanE - 0.1, tanE + 0.05, hor);
      out[v * 3 + li] = vis * tAt(sh[li], x, z);
    });
    let occ = 0;
    for (let k = 0; k < dirs; k++) {
      const a = (k / dirs) * Math.PI * 2, ux = Math.cos(a), uz = Math.sin(a);
      let hor = 0;
      for (const s of aoSteps) hor = Math.max(hor, (hAt(x + ux * s, z + uz * s) - y) / s);
      occ += hor / Math.sqrt(1 + hor * hor);   // sin of the horizon angle
    }
    out[v * 3 + 2] = clamp(1 - 1.1 * occ / dirs, 0.35, 1) * tAt(ao, x, z);
  }
  geo.setAttribute('aLight', new THREE.BufferAttribute(out, 3));
}

/* -------------------------------------------------------------------------- the sky */
export function makeSky(noiseTex) {
  const uniforms = {
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
    uSun: { value: SUN_DIR.clone() }, uMoon: { value: MOON_DIR.clone() }, day: { value: 0 }, amount: { value: 1 },
    uTime: { value: 0 }, uNoise: { value: noiseTex },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: /* glsl */`
      uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGlow; uniform vec3 uSun; uniform vec3 uMoon;
      uniform float day; uniform float amount; uniform float uTime; uniform sampler2D uNoise;
      varying vec3 vD;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }
      void main(){
        vec3 d = normalize(vD); float y = d.y;
        float night = 1.0 - day;
        // the horizon colour is exactly the fog colour at y = 0 (the land fades into it with no seam)
        vec3 c = mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.9, y), 0.55));
        // a brighter band just over the horizon (haze by day, the last light by night)
        c += uHorizon * 0.35 * exp(-max(y, 0.0) * 14.0) * smoothstep(-0.02, 0.01, y);
        c = mix(uHorizon * 0.9, c, smoothstep(-0.06, 0.0, y));
        // the sun: a soft glow, a hot disc
        float sd = max(dot(d, uSun), 0.0);
        c += vec3(1.0, 0.9, 0.75) * (pow(sd, 7.0) * 0.18 + pow(sd, 120.0) * 0.6 + smoothstep(0.99955, 0.9997, sd) * 6.0) * day;
        // night: an afterglow low in the west, the moon, stars above the haze
        vec3 hz = normalize(vec3(d.x, 0.0, d.z) + 1e-5);
        float wv = max(dot(hz, normalize(vec3(-0.9, 0.0, -0.3))), 0.0);
        c += uGlow * pow(wv, 3.0) * exp(-max(y, 0.0) * 8.0) * night;
        float md = dot(d, uMoon);
        c += vec3(0.8, 0.85, 0.95) * (smoothstep(0.99972, 0.99982, md) * 3.0 + pow(max(md, 0.0), 300.0) * 0.25 + pow(max(md, 0.0), 14.0) * 0.03) * night;
        float st = 0.0;
        if (night > 0.01 && y > 0.06) {
          vec2 g = floor(vec2(atan(d.z, d.x) * 460.0, asin(clamp(y, -1.0, 1.0)) * 460.0));
          float r = h21(g);
          st = step(0.9962, r) * smoothstep(0.06, 0.45, y) * (0.25 + 0.75 * pow(h21(g + 7.0), 3.0));
        }
        // clouds: a high layer, sparse, brighter at their tops toward the light
        float cov = 0.0, shade = 0.0;
        if (y > 0.0) {
          vec2 cu = d.xz / (y + 0.12) * 0.3 + vec2(uTime * 0.004, uTime * 0.0015);
          float n = texture2D(uNoise, cu * 0.13).r * 0.6 + texture2D(uNoise, cu * 0.55 + 0.37).g * 0.28 + texture2D(uNoise, cu * 1.9).b * 0.12;
          cov = smoothstep(0.54, 0.78, n) * smoothstep(0.0, 0.18, y) * (1.0 - smoothstep(0.65, 0.95, y) * 0.6);
          shade = smoothstep(0.54, 0.9, n);
        }
        c += vec3(0.8, 0.86, 1.0) * st * 0.5 * night * (1.0 - cov);
        vec3 cday = mix(vec3(0.96, 0.97, 1.0), vec3(0.62, 0.66, 0.74), shade * 0.7) * mix(1.0, 1.25, pow(sd, 3.0));
        vec3 cnight = mix(uHorizon * 1.6 + vec3(0.01, 0.012, 0.018), uZenith * 0.7, shade) + vec3(0.04, 0.045, 0.06) * pow(max(md, 0.0), 8.0);
        c = mix(c, mix(cnight, cday, day), cov * mix(0.75, 0.8, day));
        gl_FragColor = vec4(c * amount, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  sky.name = 'field:sky';
  return sky;
}

/* --------------------------------------------------------------------- the ridges */
const RINGS = [
  { R: 1330, base: 150, amp: 250, seed: 2.3, snow: 1e5 },
  { R: 1560, base: 300, amp: 330, seed: 5.9, snow: 575 },
];
export function makeRidges(noiseTex) {
  return RINGS.map((rg, k) => {
    const n = 420, pos = [], top = [], crest = [], fn = [], idx = [];
    const crestAt = (i) => {
      const a = (i / n) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const t = 0.5 + 0.5 * fbm(ca * 2.2 + rg.seed, sa * 2.2 - rg.seed, 5);
      const peaks = Math.pow(1 - Math.abs(fbm(ca * 4.2 + rg.seed * 2, sa * 4.2, 4)), 1.7);
      return rg.base + rg.amp * (0.55 * t + 0.5 * peaks) + 9 * fbm(ca * 60 + rg.seed, sa * 60, 2);
    };
    const ds = (rg.R * Math.PI * 2) / n;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const h = crestAt(i), slope = (crestAt(i + 1) - crestAt(i - 1)) / (2 * ds);
      // a fake normal: the face turned toward the valley, tilted with the crest's slope
      const tx = -sa, tz = ca;
      const nx = -ca * 0.9 + tx * clamp(-slope * 1.4, -1.3, 1.3), ny = 0.55, nz = -sa * 0.9 + tz * clamp(-slope * 1.4, -1.3, 1.3);
      const L = Math.hypot(nx, ny, nz);
      for (const y of [-60, h]) { pos.push(ca * rg.R, y, sa * rg.R); crest.push(h); fn.push(nx / L, ny / L, nz / L); }
      top.push(0, 1);
      if (i < n) { const q = i * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aCrest', new THREE.Float32BufferAttribute(crest, 1));
    g.setAttribute('aN', new THREE.Float32BufferAttribute(fn, 3));
    g.setIndex(idx);
    const u = {
      uNoise: { value: noiseTex }, uHorizon: { value: new THREE.Color() }, uRock: { value: new THREE.Color() },
      uSun: { value: new THREE.Vector3() }, uLit: { value: 1 }, uAmb: { value: 0.3 }, uHaze: { value: 0.5 },
      uSnowY: { value: rg.snow }, uSnow: { value: new THREE.Color() }, uRim: { value: new THREE.Color() },
    };
    const m = new THREE.ShaderMaterial({
      uniforms: u, side: THREE.DoubleSide, fog: false,
      vertexShader: /* glsl */`
        attribute float aCrest; attribute vec3 aN; varying float vY; varying float vC; varying vec3 vN; varying vec2 vA;
        void main(){ vY = position.y; vC = aCrest; vN = aN; vA = vec2(atan(position.z, position.x) * length(position.xz), position.y);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uNoise; uniform vec3 uHorizon; uniform vec3 uRock; uniform vec3 uSun; uniform float uLit; uniform float uAmb;
        uniform float uHaze; uniform float uSnowY; uniform vec3 uSnow; uniform vec3 uRim;
        varying float vY; varying float vC; varying vec3 vN; varying vec2 vA;
        void main(){
          // gullies and ribs running down the faces, forest low down
          float g = texture2D(uNoise, vec2(vA.x / 420.0, vA.y / 260.0)).g * 0.55 + texture2D(uNoise, vec2(vA.x / 130.0, vA.y / 60.0)).b * 0.3 + texture2D(uNoise, vec2(vA.x / 900.0, vA.y / 900.0)).r * 0.15;
          vec3 n = normalize(vN + vec3(0.0, 0.0, 0.0));
          float lit = clamp(dot(n, uSun) + (g - 0.5) * 0.5, 0.0, 1.0) * uLit + uAmb;
          float t = clamp(vY / max(vC, 1.0), 0.0, 1.0);
          vec3 rock = uRock * (0.7 + 0.6 * g) * mix(0.75, 1.1, t);
          float sn = smoothstep(uSnowY - 30.0 + (g - 0.5) * 140.0, uSnowY + 10.0 + (g - 0.5) * 140.0, vY);
          vec3 col = mix(rock, uSnow, sn) * lit;
          col += uRim * smoothstep(vC - 6.0, vC, vY);
          // atmospheric perspective: hazier toward the base (denser, lower air)
          float haze = clamp(uHaze + (1.0 - uHaze) * pow(1.0 - t, 2.5) * 0.55, 0.0, 1.0);
          gl_FragColor = vec4(mix(col, uHorizon, haze), 1.0);
        }`,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = -5;
    mesh.name = `field:ridge-${k}`;
    mesh.userData = { u, R: rg.R };
    return mesh;
  });
}

/* -------------------------------------------------------------------------- the trees */
const SPECIES = [
  // Engelmann spruce: broad, dense, blue-green, drooping tiers to near the ground
  { w: 0.36, tiers: 10, crownBase: 0.07, rMax: 0.21, pow: 0.95, droop: 0.32, trunk: 0.022, col: [0.03, 0.055, 0.036], tip: [0.07, 0.1, 0.06] },
  // subalpine fir: a narrow spire
  { w: 0.28, tiers: 12, crownBase: 0.06, rMax: 0.13, pow: 1.05, droop: 0.22, trunk: 0.018, col: [0.026, 0.05, 0.03], tip: [0.06, 0.09, 0.05] },
  // lodgepole pine: a bare trunk, a short rounded crown, yellower
  { w: 0.22, tiers: 6, crownBase: 0.5, rMax: 0.15, pow: 0.55, droop: 0.12, trunk: 0.02, col: [0.04, 0.06, 0.026], tip: [0.09, 0.11, 0.05] },
  // young tree: bushy, light
  { w: 0.14, tiers: 7, crownBase: 0.04, rMax: 0.3, pow: 0.9, droop: 0.25, trunk: 0.02, col: [0.04, 0.07, 0.03], tip: [0.1, 0.13, 0.06] },
];
/** One conifer, unit height, base at y = 0: jagged layered tiers (star-shaped skirts) with foliage
 *  normals (lit / shaded sides read like a crown, not a cone) and baked inner darkening. */
function conifer(sp, r, { tierScale = 1, m = 7, under = true }) {
  const T = Math.max(3, Math.round(sp.tiers * tierScale));
  const P = [], N = [], C = [];
  const push = (p, n, c) => { P.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]); C.push(c[0], c[1], c[2]); };
  const col = (k, base) => [base[0] * k, base[1] * k, base[2] * k];
  const tipC = sp.tip, inC = sp.col;
  // trunk (5 sides)
  const tr = sp.trunk, th = sp.crownBase + 0.12, bark = [0.06, 0.04, 0.028];
  for (let s = 0; s < 5; s++) {
    const a0 = (s / 5) * Math.PI * 2, a1 = ((s + 1) / 5) * Math.PI * 2;
    const p00 = [Math.cos(a0) * tr, 0, Math.sin(a0) * tr], p10 = [Math.cos(a1) * tr, 0, Math.sin(a1) * tr];
    const p01 = [Math.cos(a0) * tr * 0.6, th, Math.sin(a0) * tr * 0.6], p11 = [Math.cos(a1) * tr * 0.6, th, Math.sin(a1) * tr * 0.6];
    const n0 = [Math.cos(a0), 0, Math.sin(a0)], n1 = [Math.cos(a1), 0, Math.sin(a1)];
    push(p00, n0, bark); push(p01, n0, bark); push(p10, n1, bark);
    push(p10, n1, bark); push(p01, n0, bark); push(p11, n1, bark);
  }
  const span = (1 - sp.crownBase);
  for (let i = 0; i < T; i++) {
    const f = i / T;
    const y0 = sp.crownBase + span * Math.pow(f, 0.92);
    const hT = (span / T) * 2.1 * (1 - f * 0.35);
    const prof = Math.pow(Math.max(0, 1 - (y0 - sp.crownBase) / span), sp.pow);
    const rr = sp.rMax * (0.12 + 0.88 * prof) * (0.86 + 0.28 * r());
    const rot = r() * Math.PI * 2, M = m * 2;
    const ring = [];
    for (let q = 0; q < M; q++) {
      const a = rot + (q / M) * Math.PI * 2 + (r() - 0.5) * 0.25;
      const tip = q % 2 === 0;
      const rad = tip ? rr * (0.82 + 0.36 * r()) : rr * (0.42 + 0.15 * r());
      const y = y0 - (tip ? sp.droop * rad : sp.droop * rad * 0.3) + (r() - 0.5) * 0.012;
      ring.push({ p: [Math.cos(a) * rad, y, Math.sin(a) * rad], a, tip });
    }
    const apex = [0, y0 + hT, 0], low = [0, y0 - sp.droop * rr * 0.1 + 0.004, 0];
    // lower tiers sit in the crown's shade
    const shadeK = 0.55 + 0.45 * Math.pow(f, 0.6);
    const nOf = (v) => { const ca = Math.cos(v.a), sa = Math.sin(v.a); const k = v.tip ? [ca, 0.42, sa] : [ca * 0.6, 0.6, sa * 0.6]; const L = Math.hypot(...k); return [k[0] / L, k[1] / L, k[2] / L]; };
    const cOf = (v) => (v.tip ? col(shadeK * (0.9 + 0.2 * r()), tipC) : col(shadeK * 0.75, inC));
    for (let q = 0; q < M; q++) {
      const v0 = ring[q], v1 = ring[(q + 1) % M];
      push(apex, [0, 1, 0], col(shadeK * 0.8, inC)); push(v1.p, nOf(v1), cOf(v1)); push(v0.p, nOf(v0), cOf(v0));
      if (under && i < 3) { push(low, [0, -1, 0], col(0.3, inC)); push(v0.p, nOf(v0), col(0.5 * shadeK, inC)); push(v1.p, nOf(v1), col(0.5 * shadeK, inC)); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return g;
}

const FOREST = {
  lite: { near: 170, mid: 300, far: 2000, rocks: 45, m: 5, tier: 0.62, rockDetail: 1, under: false },
  balanced: { near: 430, mid: 800, far: 5200, rocks: 90, m: 7, tier: 1, rockDetail: 2 },
  high: { near: 600, mid: 1000, far: 8000, rocks: 140, m: 7, tier: 1.1, rockDetail: 2 },
};

/**
 * The forest: near conifers on the site (detailed), mid conifers on the far land (low detail),
 * impostor points beyond. `blocked(x, z)` keeps the story's ground open.
 */
export class Forest {
  constructor(Q, farLand, noiseTex, blocked) {
    const C = FOREST[Q.tier] || FOREST.balanced;
    const r = rng(91);
    this.group = new THREE.Group(); this.group.name = 'field:forest';
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.92, metalness: 0, envMapIntensity: 0.1, name: 'field-conifer' });
    this.material = mat;
    const near = SPECIES.map((sp) => conifer(sp, rng(17 + sp.tiers), { tierScale: C.tier, m: C.m, under: C.under !== false }));
    const mid = SPECIES.map((sp) => conifer(sp, rng(29 + sp.tiers), { tierScale: 0.45, m: 5, under: false }));
    this.trees = [];
    const pick = () => { let p = r(), i = 0; for (; i < SPECIES.length - 1; i++) { if (p < SPECIES[i].w) break; p -= SPECIES[i].w; } return i; };
    const lists = { near: SPECIES.map(() => []), mid: SPECIES.map(() => []) };
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const place = (kind, x, z, g) => {
      const vi = pick(), sp = SPECIES[vi];
      // BC conifers: 10–24 m; the young ones 3–7 m
      const H = vi === 3 ? 3 + r() * 4 : 10 + Math.pow(r(), 0.8) * 14;
      const wide = 0.85 + r() * 0.3;
      e.set((r() - 0.5) * 0.07, r() * Math.PI * 2, (r() - 0.5) * 0.07); q.setFromEuler(e);
      m4.compose(p.set(x, g - 0.25, z), q, s.set(H * wide, H, H * wide));
      const k = 0.8 + r() * 0.4, hue = (r() - 0.5) * 0.12;
      lists[kind][vi].push({ m: m4.clone(), c: new THREE.Color(k * (1 + hue), k, k * (1 - hue * 0.6)) });
      if (kind === 'near') this.trees.push({ x, z, y0: H * (sp.crownBase + 0.05), y1: H * 0.95, R: H * sp.rMax * wide });   // heights above the ground
    };
    // near: on the site, in stands (more on the slopes and the far side), sparse in the meadow
    for (let n = 0; n < C.near * 60 && this.trees.length < C.near; n++) {
      const x = (r() - 0.5) * 2 * (E - 3), z = (r() - 0.5) * 2 * (E - 3);
      if (blocked(x, z)) continue;
      const stand = clamp((fbm(x * 0.022 + 9, z * 0.022 - 4, 3) + 0.05) * 3.2, 0, 1);
      const side = smooth(-45, -95, z) * 0.5 + smooth(40, 90, z) * 0.4 + smooth(70, 140, Math.abs(x)) * 0.3;
      if (r() > 0.035 + 0.95 * stand * (0.45 + side)) continue;
      place('near', x, z, groundAt(x, z));
    }
    // mid: the far land out to 620 m
    let nm = 0;
    for (let n = 0; n < C.mid * 40 && nm < C.mid; n++) {
      const x = (r() - 0.5) * 1240, z = (r() - 0.5) * 1240;
      if (Math.max(Math.abs(x), Math.abs(z)) < E + 2 || Math.hypot(x, z) > 620) continue;
      if ((CREEK && Math.abs(z - creekZ(x)) < 9) || trackDist(x, z) < 5) continue;
      const g = farLand.heightAt(x, z);
      if (g > 250) continue;
      const stand = standMask(x, z), wall = smooth(60, 200, Math.abs(z - creekZ(x)));
      if (r() > 0.04 + 0.9 * stand * (0.35 + 0.65 * wall)) continue;
      place('mid', x, z, g); nm++;
    }
    const mesh = (geo, L, name) => {
      const im = new THREE.InstancedMesh(geo, mat, Math.max(1, L.length));
      L.forEach((t, j) => { im.setMatrixAt(j, t.m); im.setColorAt(j, t.c); });
      im.count = L.length;
      im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      im.name = name;
      this.group.add(im);
      return im;
    };
    this.meshes = [...near.map((g, i) => mesh(g, lists.near[i], `field:trees-${i}`)), ...mid.map((g, i) => mesh(g, lists.mid[i], `field:trees-mid-${i}`))];
    this.buildFar(C.far, r, farLand, noiseTex);
  }

  /** Far-forest impostors: conifer silhouettes as points on the far land's stands, 560 m–1.25 km. */
  buildFar(count, r, farLand, noiseTex) {
    const pos = [], size = [], tint = [];
    for (let n = 0; n < count * 30 && size.length < count; n++) {
      const a = r() * Math.PI * 2, d = 560 + Math.pow(r(), 1.2) * 650;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.abs(z - creekZ(x)) < 25) continue;
      const g = farLand.heightAt(x, z);
      if (g > 280 + 40 * fbm(x * 0.004, z * 0.004, 2)) continue;     // the tree line
      const st = Math.max(standMask(x, z), smooth(60, 160, g) * 0.65);
      if (r() > st) continue;
      const h = 12 + r() * 14;
      pos.push(x, g + h * 0.42 - 0.6, z); size.push(h); tint.push(0.75 + r() * 0.5);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
    geo.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 1));
    this.farU = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uLight: { value: new THREE.Color(1, 1, 1) }, uAmb: { value: new THREE.Color(0.3, 0.3, 0.3) }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uScale: { value: 400 } }]);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.farU, fog: true,
      vertexShader: /* glsl */`
        #include <common>
        #include <fog_pars_vertex>
        attribute float aSize; attribute float aTint; uniform float uScale; uniform vec3 uSun; varying float vT; varying float vSide;
        void main(){
          vT = aTint;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = clamp(uScale * aSize / -mvPosition.z, 1.5, 40.0);
          vSide = (viewMatrix * vec4(uSun, 0.0)).x;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <common>
        #include <fog_pars_fragment>
        uniform vec3 uLight; uniform vec3 uAmb; varying float vT; varying float vSide;
        void main(){
          vec2 c = gl_PointCoord;
          float y = c.y;                                   // 0 = tip, 1 = base
          float tiers = fract(y * 7.0 + vT * 3.0);
          float w = (y - 0.03) * 0.36 * (0.72 + 0.4 * tiers);
          float dx = c.x - 0.5;
          if (y < 0.03 || y > 0.94 || abs(dx) > w) discard;
          float side = clamp(dx / max(w, 1e-3) * sign(vSide) * 0.5 + 0.5, 0.0, 1.0);
          vec3 base = vec3(0.028, 0.05, 0.03) * vT;
          gl_FragColor = vec4(base * (uAmb + uLight * side * (0.6 + 0.4 * tiers)), 1.0);
          #include <fog_fragment>
        }`,
    });
    this.far = new THREE.Points(geo, mat);
    this.far.frustumCulled = false;
    this.far.name = 'field:far-forest';
    this.group.add(this.far);
  }
}

/* ------------------------------------------------------------------------- boulders */
export function makeRocks(Q, blocked, farLand) {
  const C = FOREST[Q.tier] || FOREST.balanced;
  const base = new THREE.IcosahedronGeometry(1, C.rockDetail);
  const pa = base.attributes.position;
  // one lumpy, flattened stone: displaced by noise, the same displacement for shared corners
  const col = new Float32Array(pa.count * 3);
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
    const k = 0.8 + 0.28 * fbm(x * 1.7 + 3, z * 1.7 + y * 1.3, 3) + 0.1 * fbm(x * 5 + y * 3, z * 5, 2);
    pa.setXYZ(i, x * k * 1.1, (y < 0 ? y * 0.5 : y * 0.72) * k, z * k * 0.95);
    const lichen = smooth(0.15, 0.4, fbm(x * 4 + 11, z * 4 + y * 2, 2)) * smooth(-0.2, 0.6, y);
    const dark = 0.75 + 0.35 * (0.5 + 0.5 * fbm(x * 9, y * 9 + z * 3, 2));
    col[i * 3] = (0.2 + 0.12 * lichen) * dark; col[i * 3 + 1] = (0.19 + 0.13 * lichen) * dark; col[i * 3 + 2] = (0.17 + 0.06 * lichen) * dark;
  }
  base.setAttribute('color', new THREE.BufferAttribute(col, 3));
  base.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.88, metalness: 0, envMapIntensity: 0.15, name: 'field-rock' });
  const list = [];
  const r = rng(404);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  for (let n = 0; n < C.rocks * 60 && list.length < C.rocks; n++) {
    const kind = r();
    let x, z;
    if (kind < 0.4) { if (!CREEK) continue; x = (r() - 0.5) * 2 * (E - 4); z = creekZ(x) + (r() < 0.5 ? -1 : 1) * (3.2 + r() * 8); }
    else { x = (r() - 0.5) * 2 * (E - 4); z = (r() - 0.5) * 2 * (E - 4); }
    if (blocked(x, z, true)) continue;
    const slope = Math.abs(groundAt(x + 1, z) - groundAt(x - 1, z)) + Math.abs(groundAt(x, z + 1) - groundAt(x, z - 1));
    if (kind >= 0.4 && r() > 0.25 + slope * 0.8) continue;
    const sc = 0.25 + Math.pow(r(), 2.6) * 1.6;
    const g = groundAt(x, z);
    e.set((r() - 0.5) * 0.5, r() * 6.28, (r() - 0.5) * 0.5); q.setFromEuler(e);
    m.compose(p.set(x, g - sc * 0.22, z), q, s.set(sc * (0.8 + r() * 0.5), sc * (0.7 + r() * 0.4), sc * (0.8 + r() * 0.5)));
    const k = 0.75 + r() * 0.45;
    list.push({ m: m.clone(), c: new THREE.Color(k, k * (0.96 + r() * 0.06), k * (0.92 + r() * 0.06)) });
  }
  const im = new THREE.InstancedMesh(base, mat, Math.max(1, list.length));
  list.forEach((t, j) => { im.setMatrixAt(j, t.m); im.setColorAt(j, t.c); });
  im.count = list.length;
  im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
  im.computeBoundingSphere();
  im.name = 'field:boulders';
  return im;
}

/* -------------------------------------------------------------------------- the creek */
export function makeWater(noiseTex, farLand) {
  const xs = [];
  for (let x = -560; x <= 560; x += Math.abs(x) < E ? 1.5 : 6) xs.push(x);
  const pos = [], side = [], idx = [];
  xs.forEach((x, i) => {
    const zc = creekZ(x);
    const w = 1.95 + 1.0 * smooth(E, 400, Math.abs(x));
    // inside the site the surface follows the carved channel; outside, the far land's floor
    const yl = Math.abs(x) < E - 2 ? waterLevel(x) : Math.min(waterLevel(x), farLand.heightAt(x, zc) + 0.25);
    const dzdx = (creekZ(x + 0.5) - creekZ(x - 0.5)), L = Math.hypot(1, dzdx), nx = -dzdx / L, nz = 1 / L;
    for (const sgn of [-1, 1]) { pos.push(x + nx * w * sgn, yl, zc + nz * w * sgn); side.push(sgn); }
    if (i < xs.length - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setIndex(idx);
  const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uHorizon: { value: new THREE.Color() }, uZenith: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0, 1, 0) },
    uKey: { value: new THREE.Color() }, uDay: { value: 0 }, uTime: { value: 0 },
  }]);
  u.uNoise = { value: noiseTex };
  const m = new THREE.ShaderMaterial({
    uniforms: u, fog: true, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      attribute float aSide; varying vec3 vWp; varying float vS;
      void main(){
        vS = aSide;
        vec4 wp = modelMatrix * vec4(position, 1.0); vWp = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uSun; uniform vec3 uKey; uniform float uDay; uniform float uTime; uniform sampler2D uNoise;
      varying vec3 vWp; varying float vS;
      void main(){
        vec3 V = normalize(cameraPosition - vWp);
        vec2 p = vWp.xz;
        float n1 = texture2D(uNoise, p * 0.21 + vec2(uTime * 0.06, 0.0)).b;
        float n2 = texture2D(uNoise, p * vec2(0.55, 0.9) - vec2(uTime * 0.11, uTime * 0.02)).g;
        vec3 N = normalize(vec3((n1 - 0.5) * 0.35 + (n2 - 0.5) * 0.25, 1.0, (n2 - 0.5) * 0.3));
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 R = reflect(-V, N);
        vec3 sky = mix(uHorizon, uZenith, smoothstep(0.0, 0.7, R.y));
        vec3 deep = mix(vec3(0.006, 0.01, 0.012), vec3(0.045, 0.06, 0.05), uDay);
        // shallow, stony edges show the bed
        float edge = smoothstep(0.55, 0.98, abs(vS));
        deep = mix(deep, vec3(0.05, 0.045, 0.035) * (0.4 + 0.6 * uDay), edge * 0.7);
        vec3 col = mix(deep, sky, fres * (1.0 - edge * 0.4));
        col += uKey * pow(max(dot(R, uSun), 0.0), 300.0) * 2.5;
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.name = 'field:creek';
  mesh.userData.u = u;
  return mesh;
}

/* ------------------------------------------------------------------------- the lath */
let lathTexCache = null;
function lathTexture(size) {
  if (lathTexCache) return lathTexCache;
  const W = 32, H = Math.min(1024, size);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  // raw pine: pale, with darker grain lines along the length and a knot or two
  g.fillStyle = '#c9ab7c'; g.fillRect(0, 0, W, H);
  const r = rng(5);
  for (let i = 0; i < 26; i++) {
    const x = r() * W; g.strokeStyle = `rgba(${120 + r() * 40},${85 + r() * 30},${50 + r() * 20},${0.18 + r() * 0.25})`; g.lineWidth = 0.6 + r() * 1.4;
    g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= H; y += 32) g.lineTo(x + Math.sin(y * 0.01 + i) * 1.5, y); g.stroke();
  }
  for (let k = 0; k < 2; k++) { const y = H * (0.3 + 0.4 * r()); g.fillStyle = 'rgba(110,70,35,0.55)'; g.beginPath(); g.ellipse(W * (0.3 + 0.4 * r()), y, 3, 7, 0, 0, Math.PI * 2); g.fill(); }
  // fluorescent orange paint on the top (the top of the texture is the top of the lath)
  const top = H * 0.11;
  g.fillStyle = '#ff5a14'; g.fillRect(0, 0, W, top);
  g.fillStyle = 'rgba(255,90,20,0.6)'; for (let x = 0; x < W; x += 2) g.fillRect(x, top, 2, 2 + r() * 6);
  // marker writing, lengthwise
  g.save(); g.translate(W * 0.62, H * 0.2); g.rotate(Math.PI / 2);
  g.fillStyle = 'rgba(25,25,35,0.85)'; g.font = `bold ${Math.round(W * 0.62)}px Arial`; g.fillText('CP-01  412.00', 0, 0);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  lathTexCache = t;
  return t;
}
/**
 * A survey lath (1 × 1/4 in pine stake, 38 × 9 mm), its foot in the ground at y = 0: painted top,
 * marker writing, and fluorescent flagging tape tied below the top with two tails.
 */
export function makeLath({ height = 1.2, texSize = 512, tape = 0xff4f1a, glow = 0.18 } = {}) {
  const g = new THREE.Group();
  const tex = lathTexture(texSize);
  const wood = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0, name: 'field-lath' });
  const edge = new THREE.MeshStandardMaterial({ color: 0xb79566, roughness: 0.85, metalness: 0, name: 'field-lath-edge' });
  const geo = new THREE.BoxGeometry(0.038, height, 0.0095).translate(0, height / 2 - 0.05, 0);
  const lath = new THREE.Mesh(geo, [edge, edge, edge, edge, wood, wood]);
  g.add(lath);
  const tapeMat = new THREE.MeshStandardMaterial({ color: tape, roughness: 0.55, metalness: 0, emissive: tape, emissiveIntensity: glow, side: THREE.DoubleSide, name: 'field-tape' });
  // the knot: a band round the lath
  const ky = height - 0.05 - height * 0.16;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.043, 0.024, 0.014), tapeMat);
  band.position.y = ky; g.add(band);
  // two tails, twisting and hanging off in the breeze
  const tail = (len, ang, seed) => {
    const pg = new THREE.PlaneGeometry(0.024, len, 1, 10).translate(0, -len / 2, 0);
    const pp = pg.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const y = -pp.getY(i) / len, x = pp.getX(i);
      const tw = y * (2.2 + seed);
      pp.setXYZ(i, x * Math.cos(tw) + 0.06 * y * y + 0.012 * Math.sin(y * 9 + seed), -y * len * 0.92, x * Math.sin(tw) + 0.03 * Math.sin(y * 6 + seed));
    }
    pg.computeVertexNormals();
    const m = new THREE.Mesh(pg, tapeMat);
    m.position.set(0.02, ky, 0.004); m.rotation.y = ang;
    return m;
  };
  g.add(tail(0.3, 0.5, 0.3), tail(0.24, 1.3, 1.1));
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
