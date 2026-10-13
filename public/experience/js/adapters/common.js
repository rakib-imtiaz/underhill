// Shared helpers for the five model adapters.
//
// Every adapter turns one finished model module into the same small interface:
//   { key, object, build, root, explode(t), stageOf(obj), unitKeyOf(obj), labels[], lift,
//     pose(state), spin(dt, speed01), sockets{}, dispose() }
// The page never calls a model's own API directly; it only talks to adapters.
import * as THREE from 'three';

/** First match of a list of [RegExp, value] rules against a name; `fallback` otherwise. */
export function ruleOf(rules, name, fallback = null) {
  for (const [re, v] of rules) if (re.test(name)) return v;
  return fallback;
}

/**
 * Multiply the emissive response of LED-like materials so they clear the bloom threshold.
 * The models tune their LEDs for a plain tone-mapped canvas; this page renders in HDR first,
 * so small LEDs need a little more energy to read as light sources rather than paint.
 */
export function boostEmissive(root, test, factor) {
  const seen = new Set();
  root.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      if (!m || seen.has(m) || !test(m, o)) continue;
      seen.add(m);
      if (m.emissiveIntensity !== undefined) m.emissiveIntensity *= factor;
      else if (m.color) m.color.multiplyScalar(factor);
    }
  });
}

/** A translucent disc that stands in for a spinning rotor (fades in with speed). */
export function makeRotorDisc(radius, inner = 0.02) {
  // A real prop blur: a dark, semi-transparent disc, densest toward the tips (where the blades sweep
  // the most area per turn), and even all the way round (bands that turn with the rotor strobe against
  // the frame rate). No white or orange streaks. u = radius (hub → tip), v = angle round the disc.
  const W = 128, H = 64;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const ang = (y / H) * Math.PI * 2;
    const ghost = 1 + 0 * ang;   // (rotationally even: angular ghost bands strobe against the frame rate)
    for (let x = 0; x < W; x++) {
      const r = x / (W - 1);
      const radial = Math.min(1, r / 0.12) * (0.35 + 0.65 * r) * (1 - Math.pow(Math.max(0, (r - 0.93) / 0.07), 2));
      const tip = r > 0.86 && r < 0.9 ? 0.18 : 0;        // a faint tip-marking ring
      const i = (y * W + x) * 4;
      const v = 40 + 70 * tip;
      img.data[i] = v; img.data[i + 1] = v + 3; img.data[i + 2] = v + 8;
      img.data[i + 3] = Math.round(255 * Math.min(1, radial * ghost));
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapT = THREE.RepeatWrapping;
  const geo = new THREE.RingGeometry(inner, radius, 64, 1);
  const pos = geo.attributes.position; const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const r = Math.hypot(x, y);
    let a = Math.atan2(y, x) / (Math.PI * 2); if (a < 0) a += 1;
    uv.setXY(i, (r - inner) / (radius - inner), a);
  }
  // (the seam: RingGeometry's first and last angular vertices coincide; their v of 0 and ~1 make one
  // thin wrong-way triangle strip, invisible at this alpha)
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
  });
  const disc = new THREE.Mesh(geo, mat);
  disc.name = 'showcase:rotor-disc';
  disc.castShadow = false; disc.receiveShadow = false;
  disc.userData.noShadow = true;
  disc.userData.showcaseOwned = true;
  return disc;
}

/**
 * A motor's light ring: a thin glowing band round the foot of the bell, seated on the pod. `radius`
 * is the bell's radius at its foot; the band sits flush on it, 0.4 mm proud. Colour is set per frame by the
 * adapter (dark light-pipe when off, cool white when on).
 */
const RING_GEO = new Map();
export function makeMotorRing(radius, height) {
  const key = `${radius}|${height}`;
  if (!RING_GEO.has(key)) RING_GEO.set(key, new THREE.CylinderGeometry(radius + 0.0004, radius + 0.0004, height, 40, 1, true).translate(0, height / 2, 0));
  const mat = new THREE.MeshBasicMaterial({ color: 0x0b0d10, toneMapped: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(RING_GEO.get(key), mat);
  ring.name = 'showcase:motor-ring';
  ring.userData.showcaseOwned = true;
  ring.userData.noShadow = true;
  ring.userData.lit = new THREE.Color(0.55, 0.95, 1.6).multiplyScalar(2.4);   // HDR: clears the bloom threshold
  ring.userData.dark = new THREE.Color(0x0b0d10);
  ring.castShadow = false;
  return ring;
}

/** The rotor angle that lays a two-blade prop along its arm, given the prop's own yaw on the rotor. */
export const parkAngle = (propYaw) => -propYaw;

/** Dispose geometries / materials / textures under `root` that the page created itself. */
export function disposeOwned(root) {
  root.traverse((o) => {
    if (!o.userData?.showcaseOwned) return;
    o.geometry?.dispose();
    const m = o.material;
    if (m) { m.map?.dispose(); m.dispose(); }
  });
}

/** Generic deep dispose (used when a model offers no dispose of its own). */
export function disposeDeep(root) {
  const seen = new Set();
  root.traverse((o) => {
    if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      for (const v of Object.values(m)) if (v && v.isTexture && !seen.has(v)) { seen.add(v); v.dispose(); }
      m.dispose();
    }
  });
}

/** Lerp helper for angles in degrees. */
export const DEG = Math.PI / 180;
