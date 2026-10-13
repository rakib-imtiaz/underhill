// Act II set: a survey site at blue hour, built entirely in code.
//
//   terrain   a valley heightfield with a flat terrace where the crew sets up (terrace height = 0, so
//             the instruments stand exactly as they do in the studio)
//   sky       gradient dome with a warm horizon glow and faint stars; far ridgelines for depth
//   monument  the control mark the GNSS base stands over (concrete post, brass cap, flagged lath)
//   parcel    the staked boundary the drone will fly: straight lines stake to stake, draped on the ground
//   cloud     LiDAR returns inside the parcel, revealed strip by strip as the drone passes
//   scan      the drone's LiDAR: a fan of laser lines from the payload and a glowing swath on the ground
//   section   the total station's profile: 24 points on one straight line, then the ground's cross-section
//   contours  the model: 0.5 m contour lines (index every 2.5 m) resolved from the same surface
//
// Everything reads from one height function. Anything that must sit ON the ground (points, lines,
// stakes, the swath) samples groundAt(), the exact height of the rendered terrain mesh, so it never
// floats above or sinks under the triangles between grid vertices.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { QUALITY_TIERS } from './quality.js';
import * as SC from './fieldscape.js';

/* ---------------------------------------------------------------------------- the ground */
function hash(i, j) {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z);
  const fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z, oct = 5) {
  let s = 0, a = 0.5, f = 1;
  for (let o = 0; o < oct; o++) { s += a * (vnoise(x * f, z * f) * 2 - 1); f *= 2.03; a *= 0.5; }
  return s;
}
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Terrain height (m) at world x, z. The terrace around the set-up is flat at y = 0. */
export function heightAt(x, z) {
  // cross-valley profile: terrace near z ≈ 0, valley floor at z ≈ -30, far slope rising beyond
  const floor = -6.5 * Math.exp(-Math.pow((z + 31) / 15, 2));
  const far = 9 * smoothstep(-46, -125, z);
  const back = 5 * smoothstep(12, 60, z);
  const along = 1.6 * Math.sin(x * 0.021 + 0.6) + 0.9 * Math.sin(x * 0.047 - z * 0.012);
  let h = floor + far + back + along * smoothstep(-6, -24, z) + 2.6 * fbm(x * 0.018, z * 0.018) + 0.35 * fbm(x * 0.11, z * 0.11, 3);
  // the terrace: flatten smoothly to y = 0 around the crew
  const r = Math.hypot(x - 0.3, (z - 1.2) * 1.15);
  const k = 1 - smoothstep(5, 21, r);
  h = h * (1 - k);
  return h;
}

/** Elevation shown in readouts: a believable datum for a valley site. */
export const ELEV0 = 412.0;

/* The rendered terrain is a warped grid (denser near the site) of flat triangles. heightAt() is the
   smooth function the grid vertices were sampled from; between vertices the mesh differs from it by
   up to a few decimetres. groundAt() returns the height of the mesh itself, so lines and points
   built from it lie exactly on what is drawn. */
export const TERRAIN = { size: 340, seg: 250, warp: 1.85, heights: null };
const warpG = (g) => { const h = TERRAIN.size / 2; return Math.sign(g) * Math.pow(Math.abs(g) / h, TERRAIN.warp) * h; };
const unwarpG = (w) => { const h = TERRAIN.size / 2; return Math.sign(w) * Math.pow(Math.abs(w) / h, 1 / TERRAIN.warp) * h; };
function vertexHeight(ix, iz) {
  if (TERRAIN.heights) return TERRAIN.heights[iz * (TERRAIN.seg + 1) + ix];
  const cell = TERRAIN.size / TERRAIN.seg, h = TERRAIN.size / 2;
  return heightAt(warpG(ix * cell - h), warpG(iz * cell - h));
}
/** Height (m) of the rendered terrain mesh at world x, z (same triangulation as PlaneGeometry). */
export function groundAt(x, z) {
  const n = TERRAIN.seg, cell = TERRAIN.size / n, half = TERRAIN.size / 2;
  const gx = Math.min(n - 1e-6, Math.max(0, (unwarpG(x) + half) / cell));
  const gz = Math.min(n - 1e-6, Math.max(0, (unwarpG(z) + half) / cell));
  const ix = Math.floor(gx), iz = Math.floor(gz);
  const x0 = warpG(ix * cell - half), x1 = warpG((ix + 1) * cell - half);
  const z0 = warpG(iz * cell - half), z1 = warpG((iz + 1) * cell - half);
  const fx = (x - x0) / (x1 - x0), fz = (z - z0) / (z1 - z0);
  const h00 = vertexHeight(ix, iz), h10 = vertexHeight(ix + 1, iz), h01 = vertexHeight(ix, iz + 1), h11 = vertexHeight(ix + 1, iz + 1);
  // each cell is split along its (ix, iz+1)–(ix+1, iz) diagonal
  return fx + fz <= 1 ? h00 + (h10 - h00) * fx + (h01 - h00) * fz : h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
}

/* ----------------------------------------------------------------------------- layout */
export const FIELD = {
  // where the crew stands (station group positions on the terrace)
  stations: {
    gnss: new THREE.Vector3(0, 0, 0),
    ts: new THREE.Vector3(2.6, 0, 1.3),
    drone: new THREE.Vector3(-3.4, 0, 2.1),
  },
  // the measured point on the far slope (prism)
  prism: (() => { const x = 7.5, z = -43; return new THREE.Vector3(x, heightAt(x, z), z); })(),
  // the parcel: centre, along-axis (x) and across-axis (z) half sizes, small rotation
  parcel: { cx: 4, cz: -32, ha: 26, hc: 15, rot: 0.07 },
  flightY: 9.5,             // drone altitude for the strips (absolute: 10–16 m above the parcel)
  // the total station's profile: a straight line up the far slope, 24 points (x, z of its ends)
  profile: { a: [-8, -38], b: [14, -70], n: 24 },
  strips: 4,
};

/** Parcel-local (along, across) → world (x, z). */
export function parcelToWorld(a, b) {
  const p = FIELD.parcel; const c = Math.cos(p.rot), s = Math.sin(p.rot);
  return [p.cx + a * c - b * s, p.cz + a * s + b * c];
}
function worldToParcel(x, z) {
  const p = FIELD.parcel; const c = Math.cos(p.rot), s = Math.sin(p.rot);
  const dx = x - p.cx, dz = z - p.cz;
  return [dx * c + dz * s, -dx * s + dz * c];
}

/** Parcel corners (world x, z): a staked rectangle, square corners, the stakes exactly at its vertices. */
export function parcelCorners() {
  const p = FIELD.parcel;
  return [[-p.ha, -p.hc], [p.ha, -p.hc], [p.ha, p.hc], [-p.ha, p.hc]].map(([a, b]) => parcelToWorld(a, b));
}
/** Is world (x, z) inside the parcel? */
export function inParcel(x, z) {
  const [a, b] = worldToParcel(x, z);
  return Math.abs(a) <= FIELD.parcel.ha && Math.abs(b) <= FIELD.parcel.hc;
}
/**
 * Clip the world segment A→B (x, z) to the parcel (Liang–Barsky in parcel space).
 * @returns {[number, number] | null} the parameter range kept, or null if it lies outside
 */
export function clipToParcel(ax, az, bx, bz) {
  const P = FIELD.parcel;
  const [a0, b0] = worldToParcel(ax, az), [a1, b1] = worldToParcel(bx, bz);
  let t0 = 0, t1 = 1;
  const da = a1 - a0, db = b1 - b0;
  for (const [p, q] of [[-da, a0 + P.ha], [da, P.ha - a0], [-db, b0 + P.hc], [db, P.hc - b0]]) {
    if (Math.abs(p) < 1e-9) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return t1 - t0 > 1e-4 ? [t0, t1] : null;
}

/**
 * The strips the drone flies. Capture progress q ∈ [0, 1] covers every strip and the turns between
 * them; returns the drone's world position and heading, and which strip / along-fraction it is on.
 */
const TURN = 0.18;   // share of each strip slot spent turning onto the next line
/** Capture progress at which the last strip is flown to its end (there is no turn after it): the run
 *  is timed to end here, so the drone does not stop dead at the end of the last strip and wait there.
 *  (Written as the cloud's own reveal of the last return, so the two agree exactly.) */
export const STRIPS_END = (FIELD.strips - 1 + 1 * (1 - TURN)) / FIELD.strips;
export function stripState(q, out = { pos: new THREE.Vector3(), heading: 0, strip: 0, f: 0, scanning: false }) {
  const N = FIELD.strips, P = FIELD.parcel;
  const slot = Math.min(N - 1e-6, Math.max(0, q) * N);
  const i = Math.floor(slot), w = slot - i;
  const lane = (k) => -P.hc + (k + 0.5) * (2 * P.hc / N);
  const dir = i % 2 === 0 ? 1 : -1;
  const a0 = -P.ha * dir, a1 = P.ha * dir;
  let a, b, heading;
  if (w <= 1 - TURN || i === N - 1) {
    const f = Math.min(1, w / (1 - TURN));
    a = a0 + (a1 - a0) * f; b = lane(i);
    heading = dir > 0 ? 0 : Math.PI;
    out.f = f; out.scanning = true;
  } else {
    // a half-loop onto the next lane
    const t = (w - (1 - TURN)) / TURN;
    const r = (lane(i + 1) - lane(i)) / 2;
    const ang = Math.PI * t;
    a = a1 + dir * Math.sin(ang) * r * 0.9; b = lane(i) + r - Math.cos(ang) * r;
    heading = (dir > 0 ? 0 : Math.PI) + dir * ang;
    out.f = 1; out.scanning = false;
  }
  const [x, z] = parcelToWorld(a, b);
  out.pos.set(x, FIELD.flightY, z);
  out.heading = heading + P.rot;      // 0 = facing parcel +along
  out.strip = i;
  return out;
}

/** Ground kept clear of trees around the profile line, between it and the camera that looks
 *  square-on at its cross-section (on the line's north-east side), and on the slope behind it, so
 *  the section stands against open ground. */
function inProfileView(x, z) {
  const { a, b } = FIELD.profile;
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
  const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;          // along the line, and its normal (north-east)
  const s = (x - a[0]) * ux + (z - a[1]) * uz, n = (x - a[0]) * nx + (z - a[1]) * nz;
  return s > -10 && s < L + 10 && n > -30 && n < 34;
}

/** Where the field act's cameras pass (x, z; sampled from timeline.cameraAt over u 27.3–51.5, landscape
 *  and tall, de-duplicated at 5 m). Scenery trees keep 14 m clear of them, so none fills the lens.
 *  Re-sample if the field's camera keys move (review/field-real/harness.html; the take-off and strips
 *  were re-sampled in review/autoplay/dev/campath-41-49.json). */
const CAMERA_PATH = [[2,12],[3,6],[3,1],[8,3],[13,1],[18,-1],[24,-4],[30,-8],[35,-13],[39,-17],[42,-21],[45,-26],[14,-23],[-2,4],[-5,0],[-7,-8],[-9,-16],[-9,-22],[-4,-26],[1,-26],[9,-25],[21,-19],[24,-15],[29,-1],[28,4],[24,12],[21,16],[16,15],[13,11],[13,6],[11,-5],[11,-10],[11,-15],[8,13],[8,21],[8,27],[4,18],[3,23],[4,-8],[-5,-19],[1,-20],[9,-20],[29,-16],[46,-14],[54,-16],[59,-20],[51,-20],[40,-29],[35,-31],[30,-31],[25,-31],[33,-24],[43,-6],[43,2],[41,9],[38,16],[33,22],[27,25],[22,28],[14,30],
  // (2026-10-13, autoplay pass: the re-timed take-off and the closer chase over the strips, u 41.3–48.9)
  [-10,-3],[-13,-8],[-15,-13],[-18,-17],[-20,-22],[-23,-28],[-25,-33],[-22,-37],[-17,-37],[-12,-37],[-7,-36],[-2,-36],[3,-36],[10,-36],[16,-36],[21,-36],[19,-30],[14,-30],[9,-31],[-18,-27],[-13,-27],[20,-24],[25,-22],[16,-16],[5,-17],[-2,-11],[-2,9],[-7,4],[-23,-18],[-26,-23],[-28,-28],[-30,-32],[-2,-30],[-10,-32],[-2,-5],[17,-9]];
const nearCamera = (x, z, r = 14) => CAMERA_PATH.some(([cx, cz]) => (x - cx) ** 2 + (z - cz) ** 2 < r * r);

/** The slope behind the profile (seen through its cross-section): tall scenery trees stay off it. */
function behindProfile(x, z) {
  const { a, b } = FIELD.profile;
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
  const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
  const s = (x - a[0]) * ux + (z - a[1]) * uz, n = (x - a[0]) * nx + (z - a[1]) * nz;
  return s > -18 && s < L + 18 && n > -80 && n < 0;
}

/* ---------------------------------------------------------------------------- textures */
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------------------- class */
export class Field {
  /**
   * @param {THREE.Scene} scene
   * @param {object} opts
   * @param {boolean} [opts.mobile]  legacy: without `q`, true = the balanced tier, false = high
   * @param {object}  [opts.q]       a quality tier from quality.js (detectQuality())
   * @param {boolean} [opts.scenery] the film's real-place scenery (fieldscape.js): ground material, creek,
   *                                 far land, ridges, sky, forest, boulders, laths. Without it (fly mode)
   *                                 the set is the plain one, which fly dresses itself.
   */
  constructor(scene, { mobile, q, scenery = false } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'field';
    this.group.visible = false;
    scene.add(this.group);
    this.mobile = mobile;
    this.scenery = !!scenery;
    this.q = q || QUALITY_TIERS[mobile ? 'balanced' : 'high'];
    this.lowDetail = this.q.tier !== 'high';   // the knobs the tier table does not name (contours, fan, profile)
    TERRAIN.seg = this.q.terrainSeg;     // before anything samples groundAt()
    if (!this.scenery) this.buildSky();
    this.buildTerrain();
    if (!this.scenery) this.buildRidges();
    this.buildMonument();
    this.buildPad();
    this.buildParcel();
    this.buildCloud();
    this.buildContours();
    this.buildScan();
    if (!this.scenery) this.buildTrees();
    this.buildLights();
    if (this.scenery) this.buildScenery();
  }

  /* the real place (fieldscape.js): everything around the story's props */
  buildScenery() {
    const Q = this.q;
    this.noise = SC.makeNoise(Q.aniso);
    const [hmin, hmax] = this.contourRange;
    this.groundMat = SC.makeGroundMaterial(this.noise, { hmin, hmax });
    this.terrain.material.dispose();
    this.terrain.material = this.groundMat;
    this.terrain.geometry.deleteAttribute('color');
    this.farLand = new SC.FarLand(this, Q, this.groundMat);
    this.group.add(this.farLand.mesh);
    // the sky and the distance (field.sky / field.skyMat / field.ridges keep their meaning for daylight.js)
    this.sky = SC.makeSky(this.noise);
    this.skyMat = this.sky.material;
    this.group.add(this.sky);
    this.ridges = [];
    this.ridgeMeshes = SC.makeRidges(this.noise);
    for (const m of this.ridgeMeshes) this.group.add(m);
    // what keeps the story's ground open: the parcel, the cross-section's view, the crew's terrace, the
    // near valley wall the opening looks across, the creek and the track
    const P = FIELD.parcel;
    const blocked = (x, z, rock = false) => {
      const [a, b] = worldToParcel(x, z);
      if (Math.abs(a) < P.ha + (rock ? 3 : 8) && Math.abs(b) < P.hc + (rock ? 3 : 8)) return true;
      if (inProfileView(x, z)) return true;
      if (!rock && behindProfile(x, z)) return true;
      if (!rock && nearCamera(x, z)) return true;
      if (Math.hypot(x, z - 1) < (rock ? 11 : 22)) return true;
      if (!rock && z > -20 && z < 8 && Math.abs(x) < 60) return true;
      if (SC.CREEK && Math.abs(z - SC.creekZ(x)) < (rock ? 3.4 : 6)) return true;
      if (SC.trackDist(x, z) < (rock ? 2.6 : 4.5)) return true;
      return false;
    };
    this.forest = new SC.Forest(Q, this.farLand, this.noise, blocked);
    this.trees = this.forest.group;
    this.group.add(this.forest.group);
    this.rocks = SC.makeRocks(Q, blocked, this.farLand);
    this.group.add(this.rocks);
    this.water = SC.makeWater(this.noise, this.farLand);
    this.water.visible = SC.CREEK;
    this.group.add(this.water);
    // relief and tree shadows, ambient occlusion: baked once into the site's vertices
    SC.bakeLight(this.terrain.geometry, this.forest.trees);
    this._look = { hor: new THREE.Color(), dir: new THREE.Vector3(), c: new THREE.Color() };
    this._on = 0;
  }

  /**
   * The field's look for daylight d (0 night … 1 day), applied after daylight.js each frame in the
   * field: horizon / fog / background as one colour, the key light (moon → sun), the sky light, the
   * sky, ridges, impostors and water. Uniforms and light colours only: nothing compiles.
   */
  look(d) {
    if (!this.scenery) return;
    const N = SC.LOOK.night, D = SC.LOOK.day, k = this._look, scene = this.group.parent;
    const mix = (a, b) => a + (b - a) * d;
    const hor = k.hor.copy(N.horizon).lerp(D.horizon, d);
    if (scene.fog) { scene.fog.color.copy(hor); scene.fog.near = mix(N.fog[0], D.fog[0]); scene.fog.far = mix(N.fog[1], D.fog[1]); }
    if (scene.background?.isColor) scene.background.copy(hor);
    const su = this.skyMat.uniforms;
    su.uZenith.value.copy(N.zenith).lerp(D.zenith, d); su.uHorizon.value.copy(hor); su.uGlow.value.copy(N.glow).lerp(D.glow, d); su.day.value = d;
    const dir = k.dir.copy(SC.MOON_DIR).lerp(SC.SUN_DIR, d).normalize();
    this.sun.position.copy(dir).multiplyScalar(200);
    this.sun.color.copy(N.key).lerp(D.key, d);
    this.sun.intensity = mix(N.keyI, D.keyI) * this._on;
    this.skyLight.color.copy(N.skyTop).lerp(D.skyTop, d);
    this.skyLight.groundColor.copy(N.skyBot).lerp(D.skyBot, d);
    this.skyLight.intensity = mix(N.skyI, D.skyI) * this._on;
    this.groundMat.userData.uniforms.uDay.value = d;
    const lin = (r, g, b) => k.c.setRGB(r, g, b, THREE.LinearSRGBColorSpace);
    this.ridgeMeshes.forEach((m, i) => {
      const u = m.userData.u;
      u.uHorizon.value.copy(hor); u.uSun.value.copy(dir);
      u.uRock.value.copy(lin(0.008, 0.012, 0.022)).lerp(lin(0.075, 0.09, 0.1), d);
      u.uSnow.value.copy(lin(0.05, 0.065, 0.11)).lerp(lin(0.62, 0.66, 0.72), d);
      u.uRim.value.copy(hor).multiplyScalar(0.35 * (1 - d));
      u.uLit.value = mix(0.6, 1.25, d); u.uAmb.value = mix(0.35, 0.4, d);
      u.uHaze.value = i === 0 ? mix(0.35, 0.55, d) : mix(0.5, 0.72, d);
    });
    const fu = this.forest.farU;
    fu.uLight.value.copy(this.sun.color).multiplyScalar(this.sun.intensity * 0.9);
    fu.uAmb.value.copy(this.skyLight.color).multiplyScalar(this.skyLight.intensity * 0.45);
    fu.uSun.value.copy(dir);
    const wu = this.water.userData.u;
    wu.uHorizon.value.copy(hor); wu.uZenith.value.copy(su.uZenith.value); wu.uSun.value.copy(dir);
    wu.uKey.value.copy(this.sun.color).multiplyScalar(this.sun.intensity * 0.5); wu.uDay.value = d;
  }

  /* sky dome: navy zenith, teal band, warm glow low in the west, faint stars */
  buildSky() {
    this.sunDir = new THREE.Vector3(-0.55, 0.07, -0.83).normalize();
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { sun: { value: this.sunDir }, amount: { value: 1 }, day: { value: 0 } },   // day: the daylight mode (daylight.js)
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
      fragmentShader: /* glsl */`
        uniform vec3 sun; uniform float amount; uniform float day; varying vec3 vD;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }
        void main(){
          vec3 d = normalize(vD);
          float y = d.y;
          vec3 zenith = vec3(0.012, 0.022, 0.055);
          vec3 band = vec3(0.05, 0.11, 0.17);
          vec3 low = vec3(0.10, 0.12, 0.15);
          vec3 c = mix(low, band, smoothstep(-0.02, 0.12, y));
          c = mix(c, zenith, smoothstep(0.1, 0.6, y));
          float s = max(0.0, dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(sun.x, 0.0, sun.z))));
          float glow = pow(s, 6.0) * exp(-max(y, 0.0) * 9.0);
          c += vec3(1.0, 0.45, 0.18) * glow * 0.55 + vec3(1.0, 0.7, 0.45) * pow(s, 40.0) * exp(-max(y, 0.0) * 30.0) * 0.6;
          // stars, only high in the sky
          vec2 g = floor(vec2(atan(d.z, d.x) * 380.0, asin(clamp(y, -1.0, 1.0)) * 380.0));
          float st = step(0.9965, h21(g)) * smoothstep(0.25, 0.7, y) * (0.4 + 0.6 * h21(g + 7.0));
          c += vec3(0.75, 0.85, 1.0) * st * 0.45;
          // daylight: a clear sky, pale at the horizon and deep blue overhead, no stars, a white sun
          vec3 dayC = mix(vec3(0.62, 0.74, 0.86), vec3(0.36, 0.55, 0.82), smoothstep(-0.02, 0.2, y));
          dayC = mix(dayC, vec3(0.13, 0.3, 0.66), smoothstep(0.2, 0.8, y));
          dayC += vec3(1.0, 0.95, 0.85) * pow(s, 60.0) * exp(-max(y, 0.0) * 12.0) * 0.5;
          c = mix(c, dayC, day);
          c *= smoothstep(-0.35, 0.0, y) * 0.85 + 0.15;
          gl_FragColor = vec4(c * amount, 1.0);
        }`,
    });
    this.skyMat = mat;
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.group.add(this.sky);
  }

  buildTerrain() {
    const { size, seg } = TERRAIN;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const heights = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      // denser near the site: compress the grid toward the centre
      const sx = warpG(x), sz = warpG(z);
      const h = heightAt(sx, sz);
      heights[i] = h;
      pos.setXYZ(i, sx, h, sz);
      // dry grass on the flats, darker earth in the gullies, a little rock on steep ground
      const n = fbm(sx * 0.07, sz * 0.07, 3);
      const g = 0.5 + 0.5 * n;
      col[i * 3] = 0.2 + 0.06 * g; col[i * 3 + 1] = 0.19 + 0.06 * g; col[i * 3 + 2] = 0.15 + 0.03 * g;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    TERRAIN.heights = heights;            // groundAt() now reads the mesh's own vertices
    if (this.scenery) SC.carveSite(geo, heights);   // the creek, before anything samples groundAt()
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, envMapIntensity: 0.15 });
    this.terrainUniforms = { uLines: { value: 1 }, uModel: { value: 0 }, uParcel: { value: new THREE.Vector4(FIELD.parcel.cx, FIELD.parcel.cz, FIELD.parcel.ha, FIELD.parcel.hc) }, uRot: { value: FIELD.parcel.rot } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.terrainUniforms);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vWp; uniform float uLines; uniform float uModel; uniform vec4 uParcel; uniform float uRot;
        vec3 hypso(float t){ // low → high: deep teal, green, ochre, rust
          vec3 a = vec3(0.05, 0.25, 0.32), b = vec3(0.22, 0.42, 0.22), c = vec3(0.62, 0.5, 0.2), d = vec3(0.6, 0.25, 0.12);
          return t < 0.33 ? mix(a, b, t / 0.33) : t < 0.66 ? mix(b, c, (t - 0.33) / 0.33) : mix(c, d, (t - 0.66) / 0.34);
        }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          // faint 1 m contour lines over the whole landscape: the site already reads as a survey
          float e = vWp.y;
          // lines sit at half-metre offsets: the crew's terrace is exactly y = 0, and a contour lying
          // on a flat would flood the whole terrace instead of drawing a line
          float el = e + 0.5;
          float fw = max(fwidth(el), 1e-4);
          float toInt = 0.5 - abs(fract(el) - 0.5);
          float line = 1.0 - smoothstep(0.0, fw * 1.3, toInt);
          float dist = length(vWp.xz - cameraPosition.xz);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.9 + 0.035, line * uLines * 0.5 * smoothstep(220.0, 30.0, dist));
          // the model: hypsometric tint inside the parcel
          vec2 q = vWp.xz - uParcel.xy; float cs = cos(uRot), sn = sin(uRot);
          vec2 pl = vec2(q.x * cs + q.y * sn, -q.x * sn + q.y * cs);
          // a crisp, antialiased edge exactly on the staked boundary
          float ex = uParcel.z - abs(pl.x), ey = uParcel.w - abs(pl.y);
          float inP = clamp(min(ex / max(fwidth(ex), 1e-3), ey / max(fwidth(ey), 1e-3)) + 0.5, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, hypso(clamp((e + 7.5) / 11.0, 0.0, 1.0)) * 0.7, inP * uModel * 0.85);`);
    };
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = this.q.shadows;
    this.terrain.name = 'field:terrain';
    this.group.add(this.terrain);
  }

  /* three rings of distant ridgelines, darker and bluer with distance */
  buildRidges() {
    const mk = (radius, hBase, hAmp, seed, color) => {
      const n = 200, pos = [], idx = [];
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const h = hBase + hAmp * (0.5 + 0.5 * fbm(Math.cos(a) * 3 + seed, Math.sin(a) * 3 - seed, 4));
        pos.push(Math.cos(a) * radius, -30, Math.sin(a) * radius, Math.cos(a) * radius, h, Math.sin(a) * radius);
        if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      const m = new THREE.MeshBasicMaterial({ color, fog: false, side: THREE.DoubleSide, depthWrite: true });
      const mesh = new THREE.Mesh(g, m);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      return mesh;
    };
    this.ridges = [mk(420, 18, 46, 1.7, 0x0d1520), mk(560, 30, 70, 4.2, 0x0a111b), mk(720, 50, 90, 7.9, 0x080d16)];
  }

  /* the control mark: concrete post, brass cap with a cross, and a lath with flagging tape */
  buildMonument() {
    const g = new THREE.Group(); g.name = 'field:monument';
    const concrete = new THREE.MeshStandardMaterial({ color: 0x8c8a84, roughness: 0.9 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a14a, roughness: 0.32, metalness: 0.9 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.07, 28), concrete);
    post.position.y = 0.012; g.add(post);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.047, 0.012, 32), brass);
    cap.position.y = 0.052; g.add(cap);
    const engr = new THREE.MeshStandardMaterial({ color: 0x5a4418, roughness: 0.5, metalness: 0.6 });
    for (const r of [0, Math.PI / 2]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.002, 0.004), engr); l.position.y = 0.0585; l.rotation.y = r; g.add(l); }
    // lath with flagging tape, beside the mark
    if (this.scenery) {
      const l = SC.makeLath({ height: 1.0, texSize: this.q.texSize, glow: 0.05 });
      l.position.set(0.62, 0, -0.36); l.rotation.set(0.03, -0.5, 0.035); g.add(l);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.monument = g; this.group.add(g);
      return;
    }
    const wood = new THREE.MeshStandardMaterial({ color: 0x9c7a4c, roughness: 0.85 });
    const lath = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.6, 0.009), wood);
    lath.position.set(0.62, 0.3, -0.36); lath.rotation.z = 0.04; g.add(lath);
    const tape = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.6, emissive: 0x3a0e00, side: THREE.DoubleSide });
    const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.13, 1, 6), tape);
    const rp = ribbon.geometry.attributes.position;
    for (let i = 0; i < rp.count; i++) { const y = rp.getY(i); rp.setX(i, rp.getX(i) + 0.02 * Math.sin((y + 0.1) * 13)); rp.setZ(i, 0.015 * Math.sin((y + 0.1) * 9)); }
    ribbon.geometry.computeVertexNormals();
    ribbon.position.set(0.63, 0.53, -0.35); ribbon.rotation.set(0, 0.6, 0.25); g.add(ribbon);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.monument = g;
    this.group.add(g);
  }

  /* a folding landing mat for the drone (a real crew never lands in the dust) */
  buildPad() {
    const tex = canvasTex(512, 512, (c, w) => {
      c.fillStyle = '#23272c'; c.beginPath(); c.arc(w / 2, w / 2, w / 2 - 2, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#ff7a28'; c.lineWidth = 14; c.beginPath(); c.arc(w / 2, w / 2, w / 2 - 22, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#e8e6df'; c.font = 'bold 230px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', w / 2, w / 2 + 8);
    });
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.8, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
    pad.receiveShadow = true;
    pad.position.y = 0.004;
    this.pad = pad;
    this.group.add(pad);
  }

  /* staked boundary + a glowing line draped over the ground, drawn on progressively. Each side is a
     straight line in plan from stake to stake; it is draped by sampling the mesh every 0.4 m along
     that line, and every corner vertex is exactly a stake position (no curves, no overshoot). */
  buildParcel() {
    const corners = parcelCorners();
    const pts = [], lineT = [];
    const sides = corners.map(([x0, z0], k) => { const [x1, z1] = corners[(k + 1) % 4]; return Math.hypot(x1 - x0, z1 - z0); });
    const total = sides.reduce((a, b) => a + b, 0);
    this.cornerT = [];
    let run = 0;
    for (let k = 0; k < 4; k++) {
      const [x0, z0] = corners[k], [x1, z1] = corners[(k + 1) % 4];
      const n = Math.ceil(sides[k] / 0.4);
      this.cornerT.push(run / total);
      for (let i = 0; i < n; i++) {
        const t = i / n; const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        pts.push(new THREE.Vector3(x, groundAt(x, z) + 0.05, z)); lineT.push((run + sides[k] * t) / total);
      }
      run += sides[k];
    }
    pts.push(pts[0].clone()); lineT.push(1);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    geo.setAttribute('lineT', new THREE.BufferAttribute(new Float32Array(lineT), 1));
    this.boundaryMat = new THREE.ShaderMaterial({
      uniforms: { draw: { value: 0 }, alpha: { value: 1 } },
      vertexShader: 'attribute float lineT; varying float vT; void main(){ vT = lineT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float draw; uniform float alpha; varying float vT; void main(){ if (vT > draw) discard; gl_FragColor = vec4(vec3(1.0, 0.62, 0.25) * 2.2 * alpha, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.boundary = new THREE.Line(geo, this.boundaryMat);
    this.boundary.frustumCulled = false;
    this.group.add(this.boundary);
    // corner stakes: lath + orange flagging, the same kit as the control mark
    const wood = new THREE.MeshStandardMaterial({ color: 0x9c7a4c, roughness: 0.85 });
    const tape = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.6, emissive: 0xff3a00, emissiveIntensity: 0.6, side: THREE.DoubleSide });
    // one shared lath geometry: every stake is the same upright 1.3 m lath, its foot 5 cm into the ground
    const lathGeo = new THREE.BoxGeometry(0.05, 1.3, 0.015).translate(0, 0.6, 0);
    const ribGeo = new THREE.PlaneGeometry(0.06, 0.4);
    this.stakes = corners.map(([x, z], i) => {
      const s = new THREE.Group();
      if (this.scenery) {
        const l = SC.makeLath({ height: 1.35, texSize: this.q.texSize, glow: 0.35 });
        l.rotation.set(0.02 * (i % 2 ? 1 : -1), i * 1.3, 0.025); s.add(l);
      } else {
        s.add(new THREE.Mesh(lathGeo, wood));
        const rib = new THREE.Mesh(ribGeo, tape); rib.position.set(0.04, 1.08, 0); rib.rotation.set(0, 0.5, 0.3); s.add(rib);
      }
      s.position.set(x, groundAt(x, z), z);
      s.scale.set(1, 0.0001, 1);
      s.visible = false;
      this.group.add(s);
      return s;
    });
  }

  /* LiDAR returns inside the parcel: a jittered grid, clipped exactly to the boundary (the rows on
     the boundary carry no jitter across it, so the edges are straight), each point knowing when
     the swath reaches it */
  buildCloud() {
    const P = FIELD.parcel, N = FIELD.strips;
    const target = this.q.cloudSpacing;
    const na = Math.round((2 * P.ha) / target), nb = Math.round((2 * P.hc) / target);
    const sa = (2 * P.ha) / na, sb = (2 * P.hc) / nb;
    const pos = [], reveal = [], elev = [];
    let seed = 3;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i <= na; i++) {
      for (let j = 0; j <= nb; j++) {
        const a = -P.ha + i * sa, b = -P.hc + j * sb;
        // jitter shrinks to nothing on the boundary rows, so no point ever leaves the parcel
        const ka = Math.min(1, (P.ha - Math.abs(a)) / sa), kb = Math.min(1, (P.hc - Math.abs(b)) / sb);
        const ja = a + (rnd() - 0.5) * sa * 0.9 * ka, jb = b + (rnd() - 0.5) * sb * 0.9 * kb;
        if (Math.abs(ja) > P.ha + 1e-6 || Math.abs(jb) > P.hc + 1e-6) continue;
        const [x, z] = parcelToWorld(ja, jb);
        const y = groundAt(x, z) + 0.03;
        // the strip that covers this lane and how far along it the drone is when it passes
        const lane = Math.min(N - 1, Math.floor((jb + P.hc) / (2 * P.hc / N)));
        const dir = lane % 2 === 0 ? 1 : -1;
        const f = (ja * dir + P.ha) / (2 * P.ha);
        const q = (lane + f * (1 - TURN)) / N;            // capture progress at which it is scanned
        pos.push(x, y, z); reveal.push(q); elev.push(y);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('reveal', new THREE.Float32BufferAttribute(reveal, 1));
    geo.setAttribute('elev', new THREE.Float32BufferAttribute(elev, 1));
    this.cloudMat = new THREE.ShaderMaterial({
      // (flash: how long, in capture progress, a new return glows; 0.014 ≈ the last 3.5 m of the strip
      // behind the swath, so a short bright wake trails the scan line)
      uniforms: { q: { value: 0 }, alpha: { value: 1 }, pixel: { value: 1 }, flash: { value: 0.014 } },
      vertexShader: /* glsl */`
        attribute float reveal; attribute float elev; uniform float q; uniform float pixel; uniform float flash;
        varying vec3 vC; varying float vA;
        vec3 ramp(float t){ // classic LiDAR elevation colour: blue → cyan → green → yellow → red
          return clamp(vec3(1.5 - abs(4.0 * t - 3.0), 1.5 - abs(4.0 * t - 2.0), 1.5 - abs(4.0 * t - 1.0)), 0.0, 1.0);
        }
        void main(){
          float since = q - reveal;
          vA = step(0.0, since);
          float hot = vA * exp(-since / flash);
          // (just born, a return is lit in the laser's own green, then settles into its elevation colour)
          vC = mix(ramp(clamp((elev + 7.0) / 11.0, 0.0, 1.0)), vec3(0.55, 1.0, 0.78), 0.5 * hot) * (0.75 + 1.8 * hot);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = pixel * clamp(110.0 / -mv.z, 1.4, 5.0) * (1.0 + 0.6 * hot);
        }`,
      fragmentShader: /* glsl */`
        uniform float alpha; varying vec3 vC; varying float vA;
        void main(){ if (vA < 0.5) discard; vec2 c = gl_PointCoord - 0.5; if (dot(c, c) > 0.25) discard; gl_FragColor = vec4(vC * alpha, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.cloud = new THREE.Points(geo, this.cloudMat);
    this.cloud.frustumCulled = false;
    this.cloud.name = 'field:cloud';
    this.cloudCount = reveal.length;
    this.cloudReveal = Float32Array.from(reveal).sort();   // for returnsAt()
    this.group.add(this.cloud);
  }

  /* contours by marching squares over the parcel, drawn on from the low ground up */
  buildContours() {
    const P = FIELD.parcel, cell = this.lowDetail ? 0.7 : 0.45, interval = 0.5;
    const na = Math.ceil((2 * P.ha) / cell), nb = Math.ceil((2 * P.hc) / cell);
    const H = new Float32Array((na + 1) * (nb + 1));
    for (let i = 0; i <= na; i++) for (let j = 0; j <= nb; j++) {
      const [x, z] = parcelToWorld(-P.ha + i * cell, -P.hc + j * cell);
      H[i * (nb + 1) + j] = groundAt(x, z);
    }
    let hmin = Infinity, hmax = -Infinity;
    for (const h of H) { hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); }
    this.contourRange = [hmin, hmax];   // the model's relief (scene metres), for the info card
    const seg = [], lvl = [], idx = [];
    const at = (i, j) => H[i * (nb + 1) + j];
    // contours of the mesh itself, laid on it (not on the smooth function between its vertices)
    const P2W = (a, b) => { const [x, z] = parcelToWorld(a, b); return [x, groundAt(x, z) + 0.05, z]; };
    for (let lev = Math.ceil(hmin / interval) * interval; lev <= hmax; lev += interval) {
      const index = Math.abs(Math.round(lev / 2.5) * 2.5 - lev) < 1e-3;
      for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++) {
        const v = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
        const c = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
        const cross = [];
        for (let e = 0; e < 4; e++) {
          const a = v[e], b = v[(e + 1) % 4];
          if ((a < lev) !== (b < lev)) {
            const t = (lev - a) / (b - a);
            const A = c[e], B = c[(e + 1) % 4];
            cross.push([-P.ha + (A[0] + (B[0] - A[0]) * t) * cell, -P.hc + (A[1] + (B[1] - A[1]) * t) * cell]);
          }
        }
        for (let k = 0; k + 1 < cross.length; k += 2) {
          seg.push(...P2W(cross[k][0], cross[k][1]), ...P2W(cross[k + 1][0], cross[k + 1][1]));
          lvl.push(lev, lev); idx.push(index ? 1 : 0, index ? 1 : 0);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    geo.setAttribute('level', new THREE.Float32BufferAttribute(lvl, 1));
    geo.setAttribute('isIndex', new THREE.Float32BufferAttribute(idx, 1));
    this.contourMat = new THREE.ShaderMaterial({
      uniforms: { draw: { value: 0 }, hmin: { value: hmin }, hmax: { value: hmax }, alpha: { value: 1 } },
      vertexShader: 'attribute float level; attribute float isIndex; varying float vL; varying float vI; void main(){ vL = level; vI = isIndex; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */`
        uniform float draw; uniform float hmin; uniform float hmax; uniform float alpha; varying float vL; varying float vI;
        void main(){
          float t = (vL - hmin) / (hmax - hmin);
          float a = smoothstep(t - 0.02, t + 0.06, draw);
          if (a < 0.01) discard;
          vec3 c = mix(vec3(0.85, 0.92, 1.0) * 0.3, vec3(1.0, 0.93, 0.8) * 0.85, vI);
          gl_FragColor = vec4(c * a * alpha, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.contours = new THREE.LineSegments(geo, this.contourMat);
    this.contours.frustumCulled = false;
    this.group.add(this.contours);
    this.hRange = [hmin, hmax];
    // where to put a few elevation tags: index contours, spread across the parcel
    this.contourTags = [];
    for (const [a, b] of [[-14, -6], [6, 3], [18, 10], [-4, 11]]) {
      const [x, z] = parcelToWorld(a, b);
      const h = groundAt(x, z);
      const lev = Math.round(h / 2.5) * 2.5;
      this.contourTags.push({ pos: new THREE.Vector3(x, h + 0.3, z), text: `${(ELEV0 + lev).toFixed(1)} m` });
    }
  }

  /* The drone's LiDAR, out of the payload under the gimbal: a thin translucent sheet of laser light
     across the flight line down to the ground, a few crisp beams in it with pulses running down them,
     a bright scan line sweeping across it (the scan mirror), a glint at the laser window, and the swath
     where it lands: a bright core and a soft glow, with a hot spot where the sweep hits. The returns
     (buildCloud) are born on that line. Over the parcel it is at full strength; past its edge (the hold
     at the first corner, the turns) it dims, since only the parcel is recorded. Nothing solid, and all
     built here, at load: a few dozen vertices are rewritten per frame, no program is compiled later.
     The shaders write premultiplied colour (rgb·a, a): added light at night, drawn over the ground in
     daylight (setScanDay, called from daylight.js); blending is GL state, so one program serves both. */
  buildScan() {
    const N = this.lowDetail ? 14 : 24;    // beams in the fan
    const M = this.lowDetail ? 28 : 40;    // samples across the swath (sheet, core, glow)
    this.scanN = N; this.scanM = M;
    this.scanColor = new THREE.Color(0x56ffb0);      // the drone's laser green (same as the studio pulses)
    this.scanDayColor = new THREE.Color(0x0069a3);   // daylight: Underhill blue (daylight.js GLOW_DAY.blue)
    const u = {
      uColor: { value: this.scanColor.clone() }, uAlpha: { value: 0 }, uReach: { value: 1 }, uTime: { value: 0 },
      uSweep: { value: 0.5 }, uDay: { value: 0 }, uPixel: { value: 1 },
    };
    this.scanU = u;
    const mat = (vs, fs, extra = {}) => new THREE.ShaderMaterial({
      uniforms: u, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, ...extra,
    });
    // (shared: the colour and how much of it. Night: light added to the dusk, free to bloom. Day: a deep
    // blue drawn over the ground, more of it (a faint light on a dark ground needs less than a pigment
    // on a bright one), never more than nearly opaque)
    const HEAD = /* glsl */`
      uniform vec3 uColor; uniform float uAlpha; uniform float uReach; uniform float uTime; uniform float uSweep; uniform float uDay;
      vec4 outC(float a){ a = clamp(a * uAlpha * mix(1.0, 2.4, uDay), 0.0, mix(4.0, 0.92, uDay)); return vec4(uColor * a, min(a, 1.0) * uDay); }
      float sweepAt(float s){ return exp(-pow((s - uSweep) * 9.0, 2.0)); }`;
    // beams: line i runs from the payload (t = 0) to its ground point (t = 1); s = its place across the swath
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
    const ft = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) ft.set([0, i / (N - 1), 1, i / (N - 1)], i * 4);
    fg.setAttribute('fan', new THREE.BufferAttribute(ft, 2));
    fg.setAttribute('ins', new THREE.BufferAttribute(new Float32Array(N * 2), 1));
    const VS_FAN = 'attribute vec2 fan; attribute float ins; varying vec2 vF; varying float vI; void main(){ vF = fan; vI = ins; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
    this.fan = new THREE.LineSegments(fg, mat(VS_FAN, HEAD + /* glsl */`
      varying vec2 vF; varying float vI;
      void main(){
        if (vF.x > uReach) discard;                       // switching on: the beams grow down from the payload
        // faint beams, brighter toward the ground and where the mirror is, with short pulses running down
        float pulse = pow(max(0.0, sin((vF.x * 4.0 - uTime * 3.0 + vF.y * 2.3) * 6.2832)), 24.0);
        float a = (0.07 + 0.12 * vF.x) * (0.4 + 0.9 * sweepAt(vF.y)) + pulse * 0.45;
        gl_FragColor = outC(a * mix(0.4, 1.0, vI));
      }`));
    // the sheet: a strip of triangles between the payload and the swath (the apex repeated per sample)
    const sh = new THREE.BufferGeometry();
    sh.setAttribute('position', new THREE.BufferAttribute(new Float32Array(M * 2 * 3), 3));
    const st = new Float32Array(M * 4);
    for (let i = 0; i < M; i++) st.set([0, i / (M - 1), 1, i / (M - 1)], i * 4);
    sh.setAttribute('fan', new THREE.BufferAttribute(st, 2));
    sh.setAttribute('ins', new THREE.BufferAttribute(new Float32Array(M * 2), 1));
    const si = []; for (let i = 0; i < M - 1; i++) { const k = i * 2; si.push(k, k + 1, k + 3, k, k + 3, k + 2); }
    sh.setIndex(si);
    this.fanSheet = new THREE.Mesh(sh, mat(VS_FAN, HEAD + /* glsl */`
      varying vec2 vF; varying float vI;
      void main(){
        if (vF.x > uReach) discard;
        // a faint curtain, soft at its two edges, and the scan line: a bright band sweeping across it
        float edge = smoothstep(0.0, 0.06, vF.y) * smoothstep(1.0, 0.94, vF.y);
        float a = (0.009 + 0.021 * vF.x) * edge + 0.2 * sweepAt(vF.y) * (0.3 + 0.7 * vF.x);
        gl_FragColor = outC(a * mix(0.4, 1.0, vI));
      }`, { side: THREE.DoubleSide }));
    // swath: the line where the fan meets the ground (bright core, hot where the sweep hits) and a
    // narrow soft glow either side of it along the track
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(M * 3), 3));
    const ss = new Float32Array(M); for (let i = 0; i < M; i++) ss[i] = i / (M - 1);
    sg.setAttribute('s', new THREE.BufferAttribute(ss, 1));
    sg.setAttribute('ins', new THREE.BufferAttribute(new Float32Array(M), 1));
    this.swath = new THREE.Line(sg, mat(
      'attribute float s; attribute float ins; varying float vS; varying float vI; void main(){ vS = s; vI = ins; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      HEAD + 'varying float vS; varying float vI; void main(){ gl_FragColor = outC((2.2 + 3.0 * sweepAt(vS)) * mix(0.3, 1.0, vI) * step(0.999, uReach)); }'));
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(M * 2 * 3), 3));
    const side = new Float32Array(M * 2), gs = new Float32Array(M * 2);
    for (let i = 0; i < M; i++) { side[i * 2] = -1; side[i * 2 + 1] = 1; gs[i * 2] = gs[i * 2 + 1] = i / (M - 1); }
    gg.setAttribute('side', new THREE.BufferAttribute(side, 1));
    gg.setAttribute('s', new THREE.BufferAttribute(gs, 1));
    gg.setAttribute('ins', new THREE.BufferAttribute(new Float32Array(M * 2), 1));
    const idx = []; for (let i = 0; i < M - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    gg.setIndex(idx);
    this.swathGlow = new THREE.Mesh(gg, mat(
      'attribute float side; attribute float s; attribute float ins; varying float vS; varying float vX; varying float vI; void main(){ vS = side; vX = s; vI = ins; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      HEAD + 'varying float vS; varying float vX; varying float vI; void main(){ float a = exp(-vS * vS * 5.0) * (0.5 + 1.1 * sweepAt(vX)); gl_FragColor = outC(a * mix(0.3, 1.0, vI) * step(0.999, uReach)); }',
      { side: THREE.DoubleSide }));
    // the laser window: a small glint at the payload, so the eye finds where the fan comes from
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    this.scanEmitter = new THREE.Points(eg, mat(
      'uniform float uPixel; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uPixel * clamp(90.0 / -mv.z, 5.0, 16.0); }',
      HEAD + 'void main(){ vec2 c = gl_PointCoord - 0.5; float r = dot(c, c) * 4.0; if (r > 1.0) discard; gl_FragColor = outC((exp(-r * 6.0) * 2.6 + 0.25 * (1.0 - r)) * uReach); }'));
    this.scanParts = [this.fanSheet, this.fan, this.swathGlow, this.swath, this.scanEmitter];
    for (const o of this.scanParts) { o.frustumCulled = false; o.visible = false; this.group.add(o); }
    this._scanA = new THREE.Vector3(); this._scanB = new THREE.Vector3();
  }

  /** Daylight (daylight.js): the scan drawn in deep blue over the bright ground instead of added light. */
  setScanDay(day) {
    const u = this.scanU;
    u.uDay.value = day ? 1 : 0;
    u.uColor.value.copy(day ? this.scanDayColor : this.scanColor);
    // (GL blend state only: no program changes)
    for (const o of this.scanParts) o.material.blendDst = day ? THREE.OneMinusSrcAlphaFactor : THREE.OneFactor;
  }

  /** 1 inside the parcel, falling to 0 over 0.6 m across its edge (the scan is recorded inside only). */
  scanInside(x, z) {
    const [a, b] = worldToParcel(x, z), P = FIELD.parcel;
    const d = Math.min(P.ha - Math.abs(a), P.hc - Math.abs(b));
    return Math.min(1, Math.max(0, (d + 0.3) / 0.6));
  }

  /**
   * Lay the scan for this frame. `payload` is the payload's world position, `heading` the drone's
   * flight direction (radians, (cos h, sin h) in x/z). The swath is one lane wide (adjacent swaths just
   * meet), across the flight line under the payload, on the ground wherever the drone is.
   */
  layScan(payload, heading) {
    const w = (2 * FIELD.parcel.hc / FIELD.strips) * 0.5;          // half a lane
    const rx = -Math.sin(heading), rz = Math.cos(heading);         // across the flight line
    const fx = Math.cos(heading), fz = Math.sin(heading);          // along it
    const ax = payload.x - rx * w, az = payload.z - rz * w, bx = payload.x + rx * w, bz = payload.z + rz * w;
    const N = this.scanN, M = this.scanM, A = this._scanA;
    const at = (t) => { const x = ax + (bx - ax) * t, z = az + (bz - az) * t; return A.set(x, groundAt(x, z) + 0.05, z); };
    const fp = this.fan.geometry.attributes.position, fi = this.fan.geometry.attributes.ins;
    for (let i = 0; i < N; i++) {
      at(i / (N - 1));
      const k = this.scanInside(A.x, A.z);
      fp.setXYZ(i * 2, payload.x, payload.y, payload.z);
      fp.setXYZ(i * 2 + 1, A.x, A.y, A.z);
      fi.setX(i * 2, k); fi.setX(i * 2 + 1, k);
    }
    const hp = this.fanSheet.geometry.attributes.position, hi = this.fanSheet.geometry.attributes.ins;
    const sp = this.swath.geometry.attributes.position, si = this.swath.geometry.attributes.ins;
    const gp = this.swathGlow.geometry.attributes.position, gi = this.swathGlow.geometry.attributes.ins;
    for (let i = 0; i < M; i++) {
      at(i / (M - 1));
      const k = this.scanInside(A.x, A.z);
      hp.setXYZ(i * 2, payload.x, payload.y, payload.z);
      hp.setXYZ(i * 2 + 1, A.x, A.y, A.z);
      hi.setX(i * 2, k); hi.setX(i * 2 + 1, k);
      sp.setXYZ(i, A.x, A.y, A.z); si.setX(i, k);
      // the glow is 0.7 m wide along the track
      for (const s of [-1, 1]) {
        const x = A.x + fx * 0.35 * s, z = A.z + fz * 0.35 * s, j = i * 2 + (s > 0 ? 1 : 0);
        gp.setXYZ(j, x, groundAt(x, z) + 0.04, z); gi.setX(j, k);
      }
    }
    for (const a of [fp, fi, hp, hi, sp, si, gp, gi]) a.needsUpdate = true;
    const ep = this.scanEmitter.geometry.attributes.position;
    ep.setXYZ(0, payload.x, payload.y, payload.z); ep.needsUpdate = true;
    return true;
  }

  /* sparse conifers on the hills: scale cues and a ragged skyline (instanced, one draw call) */
  buildTrees() {
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.09, 0.13, 1.2, 6).translate(0, 0.6, 0);
    parts.push(trunk);
    for (const [y, r, h] of [[0.9, 1.25, 2.4], [2.2, 0.95, 2.1], [3.4, 0.62, 1.8]]) parts.push(new THREE.ConeGeometry(r, h, 7).translate(0, y + h / 2, 0));
    const geo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
    const P = FIELD.parcel;
    const mats = [];
    let seed = 91;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const sc = new THREE.Vector3();
    for (let n = 0; n < 3000 && mats.length < this.q.trees; n++) {
      const x = (rnd() - 0.5) * 300, z = (rnd() - 0.5) * 300;
      const [a, b] = worldToParcel(x, z);
      if (Math.abs(a) < P.ha + 8 && Math.abs(b) < P.hc + 8) continue;           // keep the parcel clear
      if (inProfileView(x, z)) continue;                                        // and the cross-section in view
      if (Math.hypot(x, z - 1) < 22) continue;                                  // and the crew's terrace
      if (z > -20 && z < 8 && Math.abs(x) < 60) continue;                       // the near valley wall stays open
      const cluster = 0.5 + 0.5 * fbm(x * 0.03 + 9, z * 0.03 - 4, 3);
      if (rnd() > cluster * 1.25) continue;                                     // grow in stands, not a lawn
      const s = 0.8 + rnd() * 0.9;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28);
      m.compose(new THREE.Vector3(x, groundAt(x, z) - 0.1, z), q, sc.set(s, s * (0.85 + rnd() * 0.5), s));
      mats.push(m.clone());
    }
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x1c271c, roughness: 1, metalness: 0 }), mats.length);
    mats.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.name = 'field:trees';
    this.trees = im;
    this.group.add(im);
  }

  /**
   * The total station's reflectorless profile: N points on one straight line across the far slope,
   * each exactly on the ground. When the sweep is done the line stands up as a cross-section: a faint
   * vertical plane rises along it, on which the ground's own profile (true scale, lifted clear of the
   * hill) is drawn as an elevation curve over a horizontal datum, with a 1 m elevation grid, a tick at
   * every measured point and a thin leader from each point on the ground up to its place on the curve.
   * All of it is placed by one uniform (uLift), so the rise scrubs backward exactly.
   */
  buildProfile(points) {
    const N = points.length, M = this.lowDetail ? 90 : 160;
    const A = points[0], B = points[N - 1];
    const samples = [];
    for (let j = 0; j < M; j++) {
      const t = j / (M - 1); const x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t;
      samples.push({ x, z, g: groundAt(x, z), t });
    }
    let hmin = Infinity, hmax = -Infinity;
    for (const p of samples) { hmin = Math.min(hmin, p.g); hmax = Math.max(hmax, p.g); }
    // full lift: the datum (hmin - 1 m) ends half a metre above the highest ground on the line
    this.sectionLift = hmax - hmin + 1.5;
    this.sectionPoints = points;
    this.sectionRange = [hmin, hmax];
    const red = new THREE.Color(1.0, 0.36, 0.2);
    const u = this.secU = {
      uColor: { value: red }, uLift: { value: 0 }, uHmin: { value: hmin }, uHp: { value: hmax - hmin + 2.6 },
      uN: { value: N }, uShown: { value: 0 }, uDraw: { value: 0 }, uRise: { value: 0 }, uAlpha: { value: 0 },
      uTrace: { value: 0 }, uPixel: { value: 1 },
    };
    const add = (o) => { o.frustumCulled = false; o.visible = false; this.group.add(o); return o; };
    const mat = (vs, fs, extra = {}) => new THREE.ShaderMaterial({ uniforms: u, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, ...extra });

    // the plane: a vertical strip from the (lifted) datum up uHp metres, shaded in the fragment shader
    const cp = new Float32Array(M * 2 * 3), cs = new Float32Array(M * 2 * 2), ci = [];
    samples.forEach((p, j) => { cp.set([p.x, p.g, p.z, p.x, p.g, p.z], j * 6); cs.set([p.t, 0, p.t, 1], j * 4); });
    for (let j = 0; j < M - 1; j++) { const k = j * 2; ci.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(cp, 3));
    cg.setAttribute('sv', new THREE.BufferAttribute(cs, 2));
    cg.setIndex(ci);
    this.secPlane = add(new THREE.Mesh(cg, mat(/* glsl */`
      attribute vec2 sv; uniform float uLift; uniform float uHmin; uniform float uHp;
      varying float vY; varying float vG; varying vec2 vSV;
      void main(){
        float datum = uHmin - 1.0 + uLift;
        vY = datum + uHp * sv.y; vG = position.y; vSV = sv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position.x, vY, position.z, 1.0);
      }`, /* glsl */`
      uniform vec3 uColor; uniform float uLift; uniform float uHmin; uniform float uN; uniform float uAlpha;
      varying float vY; varying float vG; varying vec2 vSV;
      float lineAA(float v, float w){ float d = abs(fract(v + 0.5) - 0.5) / max(fwidth(v), 1e-4); return 1.0 - smoothstep(0.0, w, d); }
      void main(){
        // the earth in section: fill, grid and ticks only BELOW the curve (above it the sheet used to
        // carry a faint fill and the whole grid up to the top, which read as a tinted glass pane over
        // the trees and sky); above the curve nothing is drawn but the curve itself (a separate line)
        float d = vY - (vG + uLift);                       // above (+) or below (-) the elevation curve
        float below = 1.0 - smoothstep(-fwidth(vY), fwidth(vY), d);
        float e = vY - uLift;                              // the true elevation this height stands for
        float grid = lineAA(e, 1.0) * 0.04 + lineAA(e / 5.0, 1.2) * 0.06;
        float tick = lineAA(vSV.x * (uN - 1.0), 1.0) * 0.3;
        float datum = (1.0 - smoothstep(0.0, 2.0 * fwidth(vY), vY - (uHmin - 1.0 + uLift))) * 0.45;
        float edge = smoothstep(0.0, 0.025, vSV.x) * smoothstep(1.0, 0.975, vSV.x);
        // a little denser just under the cut line, fading with depth: it reads as ground, not a pane
        float fill = 0.05 + 0.05 * exp(-max(0.0, -d) * 0.6);
        float a = below * (fill + grid + tick) * edge + datum;
        gl_FragColor = vec4(uColor * a * uAlpha, 1.0);
      }`, { side: THREE.DoubleSide })));

    // the elevation curve (the ground line, lifted) and the measured trace on the ground
    const lp = new Float32Array(M * 3), lt = new Float32Array(M);
    samples.forEach((p, j) => { lp.set([p.x, p.g, p.z], j * 3); lt[j] = p.t; });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
    lg.setAttribute('lt', new THREE.BufferAttribute(lt, 1));
    this.secCurve = add(new THREE.Line(lg, mat(
      'uniform float uLift; void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position.x, position.y + uLift, position.z, 1.0); }',
      'uniform vec3 uColor; uniform float uAlpha; uniform float uRise; void main(){ gl_FragColor = vec4(uColor * 3.0 * uAlpha * smoothstep(0.0, 0.25, uRise), 1.0); }')));
    this.secTrace = add(new THREE.Line(lg, mat(
      'attribute float lt; varying float vT; void main(){ vT = lt; gl_Position = projectionMatrix * modelViewMatrix * vec4(position.x, position.y + 0.04, position.z, 1.0); }',
      'uniform vec3 uColor; uniform float uDraw; uniform float uTrace; varying float vT; void main(){ if (vT > uDraw) discard; gl_FragColor = vec4(uColor * 0.95 * uTrace, 1.0); }')));

    // measured points: on the ground (sec 0) and their copies on the curve (sec 1)
    const pp = new Float32Array(N * 2 * 3), pi = new Float32Array(N * 2), ps = new Float32Array(N * 2);
    points.forEach((p, i) => { pp.set([p.x, p.y, p.z, p.x, p.y, p.z], i * 6); pi[i * 2] = pi[i * 2 + 1] = i; ps[i * 2 + 1] = 1; });
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    pg.setAttribute('idx', new THREE.BufferAttribute(pi, 1));
    pg.setAttribute('sec', new THREE.BufferAttribute(ps, 1));
    this.secDots = add(new THREE.Points(pg, mat(/* glsl */`
      attribute float idx; attribute float sec; uniform float uShown; uniform float uLift; uniform float uRise; uniform float uPixel;
      varying float vA; varying float vHot;
      void main(){
        vA = clamp((uShown - idx) * 4.0, 0.0, 1.0);
        vHot = vA * exp(-max(0.0, uShown - idx - 1.0) * 2.2) * (1.0 - sec) * (1.0 - uRise);
        vA *= mix(1.0, smoothstep(0.0, 0.3, uRise), sec);
        vec4 mv = modelViewMatrix * vec4(position.x, position.y + (sec > 0.5 ? uLift : 0.05), position.z, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uPixel * clamp(110.0 / -mv.z, 2.5, 7.0) * (1.0 + 1.4 * vHot) * (sec > 0.5 ? 0.85 : 1.0);
      }`, /* glsl */`
      uniform vec3 uColor; uniform float uAlpha; varying float vA; varying float vHot;
      void main(){ if (vA < 0.01) discard; vec2 c = gl_PointCoord - 0.5; if (dot(c, c) > 0.25) discard;
        gl_FragColor = vec4(uColor * (2.2 + 5.0 * vHot) * vA * uAlpha, 1.0); }`)));

    // leaders: each ground point up to its point on the curve, dashed
    const qp = new Float32Array(N * 2 * 3), qs = new Float32Array(N * 2);
    points.forEach((p, i) => { qp.set([p.x, p.y, p.z, p.x, p.y, p.z], i * 6); qs[i * 2 + 1] = 1; });
    const qg = new THREE.BufferGeometry();
    qg.setAttribute('position', new THREE.BufferAttribute(qp, 3));
    qg.setAttribute('sec', new THREE.BufferAttribute(qs, 1));
    this.secLeaders = add(new THREE.LineSegments(qg, mat(
      'attribute float sec; uniform float uLift; varying float vY; void main(){ vec3 p = vec3(position.x, position.y + 0.05 + sec * (uLift - 0.05), position.z); vY = p.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
      'uniform vec3 uColor; uniform float uAlpha; uniform float uRise; varying float vY; void main(){ if (fract(vY * 2.5) > 0.55) discard; gl_FragColor = vec4(uColor * 0.5 * uAlpha * smoothstep(0.05, 0.4, uRise), 1.0); }')));
  }

  /** How many LiDAR returns are drawn at capture progress q (the cloud shows a return once q reaches it). */
  returnsAt(q) {
    const r = this.cloudReveal; let lo = 0, hi = r.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (r[m] <= q) lo = m + 1; else hi = m; }
    return lo;
  }

  /** World position of measured point i: on the ground, or (sec) on the section curve at the current lift. */
  sectionAnchor(i, sec, out = new THREE.Vector3()) {
    const p = this.sectionPoints[i];
    return out.set(p.x, p.y + (sec ? this.secU.uLift.value : 0.05), p.z);
  }

  buildLights() {
    // low sun from the west, raking across the valley from the side so the relief reads; no shadows
    // (the crew's work lights cast those). The sky's glow sits behind the valley.
    this.sun = new THREE.DirectionalLight(0xffb27a, 0);
    this.sun.position.set(-0.9, 0.2, -0.32).normalize().multiplyScalar(200);
    this.group.add(this.sun);
    this.skyLight = new THREE.HemisphereLight(0x5f86b3, 0x1c1812, 0);
    this.group.add(this.skyLight);
  }

  /** Per-frame state (all scroll-driven; `clock` only drives the scanner's pulses). */
  update(s, drone, pixel, clock = 0) {
    this.sun.intensity = 2.6 * s.on;
    this._on = s.on;
    if (this.scenery) {
      this.groundMat.userData.uniforms.uModel.value = s.model;
      this.skyMat.uniforms.uTime.value = clock;
      this.water.userData.u.uTime.value = clock;
      // the model is bare earth: the creek's water drains away under the surface as it fades in, so
      // the carved channel reads in the elevation tint instead of a dark band across the sheet
      const k = s.model * s.model * (3 - 2 * s.model);
      this.water.position.y = -3 * k;
      this.water.visible = SC.CREEK && k < 0.999;
    }
    this.skyLight.intensity = 1.0 * s.on;
    this.terrainUniforms.uModel.value = s.model;
    this.terrainUniforms.uLines.value = 1 - 0.5 * s.model;
    this.boundaryMat.uniforms.draw.value = s.boundary;
    this.boundaryMat.uniforms.alpha.value = 0.6 + 0.4 * (1 - s.model * 0.5);
    // each stake goes in as the line reaches its corner; all four end the same size, upright
    this.stakes.forEach((st, i) => {
      const k = Math.min(1, Math.max(0, (s.boundary - this.cornerT[i]) / 0.05));
      st.visible = k > 0.001;
      st.scale.set(1, Math.max(0.0001, k * k * (3 - 2 * k)), 1);
    });
    // the profile and its cross-section
    if (this.secU) {
      const sec = s.section, u = this.secU;
      u.uShown.value = sec.shown; u.uDraw.value = sec.draw; u.uRise.value = sec.rise;
      u.uLift.value = this.sectionLift * sec.rise; u.uAlpha.value = sec.alpha; u.uTrace.value = sec.alpha * (1 - 0.45 * sec.rise);
      u.uPixel.value = pixel;
      this.secDots.visible = sec.alpha > 0.002 && sec.shown > 0;
      this.secTrace.visible = this.secDots.visible && sec.draw > 0;
      this.secPlane.visible = this.secCurve.visible = this.secLeaders.visible = sec.alpha > 0.002 && sec.rise > 0.001;
    }
    this.cloudMat.uniforms.q.value = s.capture;
    this.cloudMat.uniforms.alpha.value = s.cloud;
    this.cloudMat.uniforms.pixel.value = pixel;
    this.cloud.visible = s.cloud > 0.002 && s.capture > 0;
    this.contourMat.uniforms.draw.value = s.contours;
    this.contours.visible = s.contours > 0.001;
    // the LiDAR: a fan from the payload to a swath across the flight line, from the parcel corner to the
    // end of the last strip (through the turns too, dimmed off the parcel: it never blinks off and on)
    let scan = s.scan > 0.001 && drone && drone.payload;
    if (scan) scan = this.layScan(drone.payload, drone.heading);
    for (const o of this.scanParts) o.visible = !!scan;
    if (scan) {
      const u = this.scanU;
      u.uAlpha.value = Math.min(1, s.scan * 1.5);
      u.uReach.value = s.scanReach;
      u.uTime.value = clock;
      u.uPixel.value = pixel;
      // the scan mirror: across and back about 1.6 times a second, easing at each end (on the clock, so
      // it keeps sweeping while the film holds on a stop)
      u.uSweep.value = 0.5 - 0.5 * Math.cos(clock * Math.PI * 1.6);
    }
  }
}
