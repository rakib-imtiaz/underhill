/**
 * Deterministic heightfield H(x, z) in metres over the tangent plane (x east, z south).
 * The same function feeds the point cloud, the draped overlays, the scan fan profile,
 * the camera ground clamp and the cursor ray-march, so they can never disagree.
 */

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* Gradient-free value noise on an integer lattice with a quintic fade. */
const PERM = new Uint16Array(512)
const VALS = new Float32Array(256)
{
  const rnd = mulberry32(90210)
  const p = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]
  for (let i = 0; i < 256; i++) VALS[i] = rnd() * 2 - 1
}
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

export function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const X = xi & 255, Y = yi & 255
  const a = VALS[PERM[PERM[X] + Y]], b = VALS[PERM[PERM[X + 1] + Y]]
  const c = VALS[PERM[PERM[X] + Y + 1]], d = VALS[PERM[PERM[X + 1] + Y + 1]]
  const u = fade(xf), v = fade(yf)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

function fbm(x: number, y: number, oct: number) {
  let s = 0, amp = 0.5, f = 1
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f + i * 17.3, y * f - i * 9.1)
    f *= 2.03; amp *= 0.5
  }
  return s
}

function ridged(x: number, y: number, oct: number) {
  let s = 0, amp = 0.5, f = 1, w = 1
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(vnoise(x * f + i * 31.7, y * f + i * 5.3))
    n *= n
    s += n * amp * w
    w = Math.min(1, n * 1.6)
    f *= 2.07; amp *= 0.5
  }
  return s
}

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/* Valley axis runs NNE–SSW (the Columbia trench), offset so the site sits on a low terrace. */
const AX = Math.sin(0.35), AZ = -Math.cos(0.35)

function raw(x: number, z: number) {
  const r = Math.hypot(x, z)
  const along = x * AX + z * AZ
  const across = x * -AZ + z * AX + 35
  const aa = Math.abs(across)

  // valley floor + walls
  let h = 0.018 * Math.max(-900, Math.min(900, along)) + 58 * Math.pow(sstep(70, 460, aa), 1.25)
  // rolling hills and hummocks
  h += fbm(x / 150, z / 150, 4) * 16 + fbm(x / 38, z / 38, 3) * 2.2
  // side ridges
  h += ridged(x / 260, z / 260, 4) * 30 * sstep(120, 420, aa)
  // regional ranges: Selkirks / Monashees (reach ~2 km above the valley floor)
  const far = sstep(700, 7000, r)
  if (far > 0) {
    h += far * (ridged(x / 9000 + 3.1, z / 9000 - 1.7, 5) * 2300 - 350)
    h += far * fbm(x / 1800, z / 1800, 4) * 260
  }
  const vfar = sstep(60_000, 300_000, r)
  if (vfar > 0) h *= 1 - 0.55 * vfar // plateaux eastwards / lower relief at range
  return h
}

const H0 = raw(0, 0)

/** A small pond beside the set-up, for the hydrographic survey boat. Water surface at `level`. */
export const POND = { x: 6.4, z: 2.2, rx: 2.5, rz: 1.8, level: -0.28 }
/** 0 outside the pond ellipse … 1 at its centre-line edge (e = 1 is the shoreline) */
export const pondE = (x: number, z: number) => ((x - POND.x) / POND.rx) ** 2 + ((z - POND.z) / POND.rz) ** 2

/**
 * Terrain height (m) relative to the instrument pad. The set-up area is exactly flat inside r < 9 m,
 * except for the pond bowl.
 */
export function H(x: number, z: number) {
  const r = Math.hypot(x, z)
  const h = (raw(x, z) - H0) * sstep(9, 16, r)
  const bowl = 1 - sstep(0.7, 1.5, pondE(x, z))
  return h * (1 - bowl) + -0.55 * bowl
}

/** Local horizontal point spacing of the scan pattern at range r (metres), before quality scaling. */
export function spacingAt(r: number) {
  return 0.13 + 0.0072 * r + r * 0.0105 * sstep(700, 6000, r)
}
