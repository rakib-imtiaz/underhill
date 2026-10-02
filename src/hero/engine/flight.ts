/**
 * UAV flight plan — a pure function of chapter position sp.
 *   METHODS: lifts off its case and holds a hover beside the crew (the "air" in ground/air/water).
 *   CAPTURE: flies three lidar strips across the survey parcel; each strip fills the points under it.
 * After the last strip it holds a hover at the end of the parcel.
 */
import { H } from './terrainField'
import { CASE_XZ, CASE_TOP } from './sensors'
import { BOUNDARY_CENTER, BOUNDARY_HALF, VALLEY_AXIS } from './choreo'

const { ax, az, cx, cz } = VALLEY_AXIS
export const AGL = 60
export const HOVER = { x: 3.3, y: 3.7, z: 0.7 } // beside the crew, upper right of the METHODS frame
export const TAKEOFF = [2.3, 2.78] as const
export const FLIGHT = [3.36, 3.96] as const // the camera is already in place (choreo MOVE_WINDOWS)

/* three strips along the valley axis, across the parcel, alternating direction */
const L = BOUNDARY_HALF.along + 12
const lane = (BOUNDARY_HALF.across * 2) / 3
export const SWATH_HALF = lane / 2 + 8
const C = BOUNDARY_CENTER
const pt = (a: number, c: number): [number, number] => [C.x + ax * a + cx * c, C.z + az * a + cz * c]
const P: [number, number][] = [
  [HOVER.x, HOVER.z],
  pt(-L, -lane), pt(L, -lane),
  pt(L, 0), pt(-L, 0),
  pt(-L, lane), pt(L, lane),
]
/** lidar strips = segments 1, 3, 5 (the others are transits) */
export const STRIPS = [1, 3, 5]
export const LEGS: [number, number, number, number][] = STRIPS.map((i) => [P[i][0], P[i][1], P[i + 1][0], P[i + 1][1]])

const SEG = P.slice(0, -1).map((a, i) => Math.hypot(P[i + 1][0] - a[0], P[i + 1][1] - a[1]))
const TOTAL = SEG.reduce((s, v) => s + v, 0)
const STARTS = SEG.map((_, i) => SEG.slice(0, i).reduce((s, v) => s + v, 0))

export type Pose = {
  x: number; y: number; z: number
  yaw: number; pitch: number
  rotor: number // 0 idle → 1 full
  flying: number // 0 on the case → 1 airborne
  strip: number // strip being flown, −1 otherwise
  legProg: [number, number, number]
  lidar: number
}
export const newPose = (): Pose => ({ x: CASE_XZ.x, y: CASE_TOP, z: CASE_XZ.z, yaw: 0, pitch: 0, rotor: 0, flying: 0, strip: -1, legProg: [0, 0, 0], lidar: 0 })

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)
const smooth = (t: number) => t * t * (3 - 2 * t)

function at(s: number, out: [number, number]) {
  let k = 0
  s = Math.max(0, Math.min(TOTAL, s))
  while (k < SEG.length - 1 && s > SEG[k]) { s -= SEG[k]; k++ }
  const t = SEG[k] > 0 ? Math.min(1, s / SEG[k]) : 0
  out[0] = P[k][0] + (P[k + 1][0] - P[k][0]) * t
  out[1] = P[k][1] + (P[k + 1][1] - P[k][1]) * t
  return k
}
const _a: [number, number] = [0, 0]
const _b: [number, number] = [0, 0]

export function dronePose(sp: number, o: Pose) {
  const padY = H(CASE_XZ.x, CASE_XZ.z) + CASE_TOP
  o.rotor = clamp01((sp - (TAKEOFF[0] - 0.08)) / 0.08)

  if (sp < FLIGHT[0]) {
    // lift straight up off the case, then drift across to the hover point
    const span = TAKEOFF[1] - TAKEOFF[0]
    const up = smooth(clamp01((sp - TAKEOFF[0]) / (span * 0.55)))
    const across = smooth(clamp01((sp - TAKEOFF[0] - span * 0.35) / (span * 0.65)))
    o.x = CASE_XZ.x + (HOVER.x - CASE_XZ.x) * across
    o.z = CASE_XZ.z + (HOVER.z - CASE_XZ.z) * across
    o.y = padY + (HOVER.y - padY) * up
    o.yaw = 0
    o.pitch = -0.1 * Math.sin(Math.PI * across)
    o.flying = up
    o.strip = -1
    o.legProg[0] = o.legProg[1] = o.legProg[2] = 0
    o.lidar = 0
    return o
  }

  // survey flight
  const u = clamp01((sp - FLIGHT[0]) / (FLIGHT[1] - FLIGHT[0]))
  const s = smooth(u) * TOTAL
  const seg = at(s, _a)
  o.x = _a[0]; o.z = _a[1]
  const climb = smooth(clamp01(s / (SEG[0] * 0.6)))
  o.y = HOVER.y + (Math.max(H(o.x, o.z) + AGL, HOVER.y) - HOVER.y) * climb
  at(s - 25, _a); at(s + 25, _b)
  o.yaw = Math.atan2(-(_b[0] - _a[0]), -(_b[1] - _a[1])) * smooth(clamp01(s / 20))
  o.pitch = u > 0 && u < 1 ? -0.14 : 0
  o.flying = 1
  o.strip = -1
  for (let i = 0; i < STRIPS.length; i++) {
    const k = STRIPS[i]
    o.legProg[i] = clamp01((s - STARTS[k]) / SEG[k])
    if (seg === k && u > 0 && u < 1) o.strip = i
  }
  o.lidar = o.strip >= 0 ? 1 : 0
  return o
}
