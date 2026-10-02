/**
 * Choreography: progress p ∈ [0,1] → chapter position → camera + effect state.
 *
 * Eight chapters, one idea each (see NOTES.md). The first frame of every chapter is a finished,
 * still composition; the transition to the next chapter holds, performs one action, then settles.
 * Everything here is a pure function of p (plus the explicit orbit offset) and allocates nothing per
 * call — scratch vectors live at module scope.
 */
import * as THREE from 'three'
import { GLOBE_CENTER, R, latLonToDir, latLonToWorld } from './geo'
import { H } from './terrainField'

export * from './timeline'
import { win, sstep, bell, moveEase } from './timeline'

/* ---------------- site anchors, derived from the terrain itself ---------------- */
const D2R = Math.PI / 180

/** highest terrain point in a sector (az measured from +Z/south toward +X/east; 180 = north) */
function hilltop(az0: number, az1: number, r0: number, r1: number) {
  let best = { x: 0, z: 0, h: -Infinity }
  for (let az = az0; az <= az1; az += 1.5) for (let r = r0; r <= r1; r += 4) {
    const x = Math.sin(az * D2R) * r, z = Math.cos(az * D2R) * r, h = H(x, z)
    if (h > best.h) best = { x, z, h }
  }
  return new THREE.Vector3(best.x, best.h, best.z)
}

export const HEAD_Y = 1.53 // telescope axle height above the pad
/** CONTROL: a known point on a hilltop NNE of the set-up */
export const CONTROL_POINT = hilltop(118, 150, 150, 260) // on the east valley wall
/** MEASURE: the observed terrain point, up-valley (NNW); it becomes the project node later */
export const TARGET_POINT = hilltop(212, 240, 150, 260) // on the west valley wall

/** CAPTURE / MODEL: the surveyed parcel — a quad along the valley axis that contains the target */
const AX = Math.sin(0.35), AZ = -Math.cos(0.35) // valley axis (NNE)
const CX = -AZ, CZ = AX
export const BOUNDARY_CENTER = new THREE.Vector3(TARGET_POINT.x * 0.55, 0, TARGET_POINT.z * 0.7)
BOUNDARY_CENTER.y = H(BOUNDARY_CENTER.x, BOUNDARY_CENTER.z)
export const BOUNDARY_HALF = { along: 170, across: 125 }
/** corners (x, z), counter-clockwise, slightly skewed so it reads as a real parcel, not a square */
export const BOUNDARY: [number, number][] = [
  [-1, -1, -0.06], [1, -1, 0.04], [1, 1, -0.03], [-1, 1, 0.08],
].map(([a, c, skew]) => [
  BOUNDARY_CENTER.x + AX * a * BOUNDARY_HALF.along + CX * (c * BOUNDARY_HALF.across + skew * 120),
  BOUNDARY_CENTER.z + AZ * a * BOUNDARY_HALF.along + CZ * (c * BOUNDARY_HALF.across + skew * 120),
])
export const VALLEY_AXIS = { ax: AX, az: AZ, cx: CX, cz: CZ }

/* ---------------- camera keyframes ---------------- */
export type Key = {
  target: THREE.Vector3
  dir: THREE.Vector3 // unit, target → camera
  dist: number
  up: THREE.Vector3
  roll: number // degrees
  fov: number
  /** keep at least this many metres of subject width in frame at any aspect ratio */
  fitW?: number
}

const azEl = (az: number, el: number) =>
  new THREE.Vector3(Math.sin(az * D2R) * Math.cos(el * D2R), Math.sin(el * D2R), Math.cos(az * D2R) * Math.cos(el * D2R))
const Y = new THREE.Vector3(0, 1, 0)
const POLE = latLonToDir(90, 0)
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const k = (target: THREE.Vector3, dir: THREE.Vector3, dist: number, up: THREE.Vector3, roll = 0, fov = 38, extra: Partial<Key> = {}): Key =>
  ({ target, dir: dir.normalize(), dist, up: up.clone().normalize(), roll, fov, ...extra })

function tiltedGlobeDir(lat: number, lon: number, tiltDeg: number) {
  const n = latLonToDir(lat, lon)
  const south = latLonToDir(lat - 1, lon).sub(n).normalize()
  return n.multiplyScalar(Math.cos(tiltDeg * D2R)).addScaledVector(south, Math.sin(tiltDeg * D2R)).normalize()
}

/**
 * A shot past the instrument toward an anchor: the camera sits behind and to one side of the
 * total station, so the instrument is large in the foreground and the anchor reads beyond it.
 * `side` rotates the camera around the instrument (deg), `back` is its distance from the head.
 */
function pastInstrument(anchor: THREE.Vector3, side: number, back: number, lift: number, aim: number, aimLift: number) {
  const head = V(0, HEAD_Y, 0)
  const u = V(anchor.x, 0, anchor.z).normalize()
  const camDir = u.clone().negate().applyAxisAngle(Y, side * D2R)
  const cam = head.clone().addScaledVector(camDir, back).add(V(0, lift, 0))
  const target = head.clone().addScaledVector(u, aim).add(V(0, aimLift, 0))
  const d = cam.clone().sub(target)
  return { target, dir: d.clone().normalize(), dist: d.length() }
}

const control = pastInstrument(CONTROL_POINT, 38, 2.2, 0.3, 3.2, 0.3)
const measure = pastInstrument(TARGET_POINT, 30, 2.3, 0.3, 5.5, 0.6)
// portrait: solved numerically so the instrument sits above the caption band with the anchor beyond it
const controlTall = pastInstrument(CONTROL_POINT, -6, 4.8, 0.2, 20, 0.5)
const measureTall = pastInstrument(TARGET_POINT, -6, 4.8, 0.2, 20, 0.5)
const B = BOUNDARY_CENTER

/** Landscape (desktop) keyframes: the resting frame of each chapter. */
export const KEYS_WIDE: Key[] = [
  /* 0 FIELD    */ k(V(0, 2.2, -4), azEl(10, 8), 19, Y, 0, 36),
  /* 1 CONTROL  */ k(control.target, control.dir, control.dist, Y, 0, 40),
  /* 2 MEASURE  */ k(measure.target, measure.dir, measure.dist, Y, 0, 40),
  /* 3 METHODS  */ k(V(1.2, 1.6, 1.3), azEl(-4, 7), 10, Y, 0, 40, { fitW: 13 }),
  /* 4 CAPTURE  */ k(V(B.x + AX * 55, B.y, B.z + AZ * 55), azEl(-16, 33), 640, Y, 0, 40),
  /* 5 MODEL    */ k(V(B.x + AX * 70, B.y, B.z + AZ * 70), azEl(-8, 50), 660, Y, 0, 40),
  /* 6 REGION   */ k(latLonToWorld(58.5, -124), tiltedGlobeDir(58.5, -124, 12), 5.2e6, POLE, 0, 38),
  /* 7 REACH    */ k(GLOBE_CENTER.clone().addScaledVector(POLE, 0.28 * R), latLonToDir(52, -104), 3.2 * R, POLE, 0, 36),
]

/** Portrait (phones) keyframes: composed separately — subject high, caption band below. */
export const KEYS_TALL: Key[] = [
  k(V(0, 2.4, -4), azEl(10, 7), 20, Y, 0, 52),
  k(controlTall.target, controlTall.dir, controlTall.dist, Y, 0, 52),
  k(measureTall.target, measureTall.dir, measureTall.dist, Y, 0, 52),
  k(V(2.5, 1, 2), azEl(-105, 4), 11, Y, 0, 54), // solved: the kit stacks in depth in a tall frame
  k(V(B.x, B.y, B.z), azEl(-12, 42), 960, Y, 0, 52),
  k(V(B.x, B.y, B.z), azEl(-6, 60), 960, Y, 0, 52),
  k(latLonToWorld(59, -125), tiltedGlobeDir(59, -125, 10), 8.2e6, POLE, 0, 50),
  k(latLonToWorld(62, -108), latLonToDir(52, -108), 1.3e7, POLE, 0, 48) // phones: a close-up on the North, the network large,
]

/** a planet shot aimed above the globe's centre, the aim offset across the frame (globe radii) to seat it beside the caption */
function globeAim(lift: number, dir: THREE.Vector3, sx: number, sy: number) {
  const right = new THREE.Vector3().crossVectors(POLE, dir).normalize()
  const up = new THREE.Vector3().crossVectors(dir, right)
  return GLOBE_CENTER.clone().addScaledVector(POLE, lift * R).addScaledVector(right, sx * R).addScaledVector(up, sy * R)
}

/**
 * Tablets (4:3 / 3:4): the caption sits top-left under the 76 px site header, so REGION and REACH are
 * solved for the space below and beside it. The ground chapters keep their base shots (plates cover them).
 */
export const KEYS_TABLET_WIDE: Key[] = [
  ...KEYS_WIDE.slice(0, 6),
  k(latLonToWorld(61.6, -123), tiltedGlobeDir(61.6, -123, 12), 5.4e6, POLE, 0, 38), // the region clear of the header
  k(globeAim(0.28, latLonToDir(52, -104), -0.45, -0.06), latLonToDir(52, -104), 3.59 * R, POLE, 0, 36), // whole planet, right of the caption
]
export const KEYS_TABLET_TALL: Key[] = [
  ...KEYS_TALL.slice(0, 6),
  k(latLonToWorld(65.5, -110), tiltedGlobeDir(65.5, -110, 13), 8.6e6, POLE, 0, 38), // width-bound: BC to Baffin, under the caption
  // the planet rises under the caption, the North large enough to name every site
  k(globeAim(0.28, latLonToDir(43, -106), 0, 0.46), latLonToDir(43, -106), 2.95 * R, POLE, 0, 36),
]

/* ---------------- camera solve ---------------- */
const _dir = new THREE.Vector3()
const _up = new THREE.Vector3()
const _t = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _pos = new THREE.Vector3()
const _right = new THREE.Vector3()

function slerpUnit(a: THREE.Vector3, b: THREE.Vector3, t: number, out: THREE.Vector3) {
  const d = Math.min(1, Math.max(-1, a.dot(b)))
  const th = Math.acos(d)
  if (th < 1e-5) return out.copy(a).lerp(b, t).normalize()
  const s = Math.sin(th)
  return out.copy(a).multiplyScalar(Math.sin((1 - t) * th) / s).addScaledVector(b, Math.sin(t * th) / s).normalize()
}

export type CamState = { alt: number; dist: number; planet: number }

/** distance that keeps `fitW` metres across the frame at this aspect */
function fitDist(key: Key, aspect: number) {
  if (!key.fitW) return key.dist
  const hfov = 2 * Math.atan(Math.tan((key.fov * D2R) / 2) * aspect)
  return Math.max(key.dist, key.fitW / 2 / Math.tan(hfov / 2))
}

/**
 * Solve the camera for chapter position sp. `orbit` (radians) is the interactive offset layered
 * on top of the authored shot. Returns altitude above the sphere for everything downstream.
 */
export function solveCamera(cam: THREE.PerspectiveCamera, keys: Key[], sp: number, orbit: number, out: CamState) {
  const i = Math.min(keys.length - 2, Math.floor(sp))
  const f = sp - i
  const m = moveEase(f, i)
  const A = keys[i], Bk = keys[i + 1]

  // distance moves geometrically; the target follows the *linear* distance change, so a pull
  // back from metres to megametres doesn't drag the aim point across the planet at ground level
  const dA = fitDist(A, cam.aspect), dB = fitDist(Bk, cam.aspect)
  const dist = Math.exp(Math.log(dA) + (Math.log(dB) - Math.log(dA)) * m)
  const w = Math.abs(dB - dA) < 1e-6 * dA ? m : (dist - dA) / (dB - dA)
  _t.copy(A.target).lerp(Bk.target, w)
  slerpUnit(A.dir, Bk.dir, m, _dir)
  slerpUnit(A.up, Bk.up, m, _up)
  const roll = (A.roll + (Bk.roll - A.roll) * m) * D2R
  cam.fov = A.fov + (Bk.fov - A.fov) * m

  _pos.copy(_t).addScaledVector(_dir, dist)

  // interactive orbit: around the target on the ground, around the planet's axis in space
  const planet = sstep(5.2, 5.9, sp)
  if (orbit !== 0) {
    if (planet > 0.5) {
      _q.setFromAxisAngle(POLE, orbit)
      _pos.sub(GLOBE_CENTER).applyQuaternion(_q).add(GLOBE_CENTER)
      _t.sub(GLOBE_CENTER).applyQuaternion(_q).add(GLOBE_CENTER)
      _up.applyQuaternion(_q)
    } else {
      _q.setFromAxisAngle(Y, orbit)
      _pos.sub(_t).applyQuaternion(_q).add(_t)
    }
  }

  // never below ground on the ground
  if (sp < 5.2) {
    const g = H(_pos.x, _pos.z) + 1.2
    if (_pos.y < g) _pos.y = g
  }

  _dir.subVectors(_pos, _t).normalize()
  _right.crossVectors(_up, _dir)
  if (_right.lengthSq() < 1e-10) _right.set(1, 0, 0)
  _right.normalize()
  _up.crossVectors(_dir, _right).normalize()
  if (roll !== 0) _up.applyAxisAngle(_dir, roll)

  cam.position.copy(_pos)
  cam.up.copy(_up)
  cam.lookAt(_t)

  const alt = _pos.distanceTo(GLOBE_CENTER) - R
  cam.near = Math.max(0.04, Math.min(dist * 0.03, Math.max(alt, 1) * 0.5))
  cam.far = Math.max(dist * 40, 1.4e6)
  cam.updateProjectionMatrix()
  cam.updateMatrixWorld()

  out.alt = alt
  out.dist = dist
  out.planet = planet
  return out
}

/* ---------------- effect windows (chapter units sp) ---------------- */
export type FX = {
  setup: number // orange set-up ring under the tripod
  portal: number // glowing survey rings pulsing out from the instrument (FIELD)
  flow: number // light flowing along the distant ridgelines (ground chapters)
  focus: number // METHODS: the far terrain steps back so the kit reads
  flightLabel: number // CAPTURE: the UAV's tag while it flies the strips
  control: number; controlLabel: number
  aim: number // 0 = total station on the control point, 1 = on the target
  beam: number; beamReach: number; hit: number; coords: number
  kit: number; methodLabels: number
  boundary: number; capture: number; captureDim: number
  contours: number; contourLabels: number
  human: number; terrainAlpha: number; globe: number; space: number; fog: number
  site: number; region: number; regionLabels: number; offices: number; officeLabels: number; arcs: number; drift: number
}

export const newFX = (): FX => ({
  setup: 0, portal: 0, flow: 0, focus: 0, flightLabel: 0, control: 0, controlLabel: 0, aim: 0, beam: 0, beamReach: 0, hit: 0, coords: 0,
  kit: 0, methodLabels: 0, boundary: 0, capture: 0, captureDim: 0, contours: 0, contourLabels: 0,
  human: 1, terrainAlpha: 1, globe: 0, space: 0, fog: 1,
  site: 0, region: 0, regionLabels: 0, offices: 0, officeLabels: 0, arcs: 0, drift: 0,
})

/** Windows are listed in NOTES.md — keep the two in sync. UAV timing lives in flight.ts. */
export function effects(sp: number, alt: number, fx: FX) {
  // FIELD — the instrument stands over a marked point
  fx.setup = 1 - sstep(3.2, 3.6, sp)
  fx.portal = 1 - sstep(0.35, 0.9, sp)
  fx.flow = 1 - sstep(0.4, 0.9, sp) // the opening only: later chapters keep the hills calm so their subject reads
  fx.focus = bell(sp, 2.3, 2.75, 3.05, 3.25)
  fx.flightLabel = bell(sp, 3.36, 3.44, 3.9, 3.97)
  // CONTROL — a known point appears on the hilltop; the instrument is aimed at it
  fx.control = sstep(0.3, 0.7, sp) * (1 - sstep(3.3, 3.7, sp))
  fx.controlLabel = bell(sp, 0.72, 0.9, 1.25, 1.45)
  // MEASURE — turn from control to target, fire, the point lights and keeps its coordinates
  fx.aim = sstep(1.22, 1.5, sp)
  fx.beam = bell(sp, 1.5, 1.52, 2.22, 2.45)
  fx.beamReach = sstep(1.52, 1.72, sp)
  fx.hit = sstep(1.7, 1.78, sp)
  fx.coords = bell(sp, 1.76, 1.88, 2.22, 2.4)
  // METHODS — the camera swings round and the rest of the crew's kit is revealed
  fx.kit = sstep(2.25, 2.6, sp)
  fx.methodLabels = bell(sp, 2.78, 2.92, 3.18, 3.35)
  // CAPTURE — the parcel is bounded, flown and filled with points
  fx.boundary = win(sp, 3.18, 3.34)
  fx.capture = win(sp, 3.36, 3.96) // strip progress lives in flight.ts; this is the fill fraction
  // MODEL — the same points resolve into contours inside the same boundary
  fx.captureDim = sstep(4.25, 4.7, sp)
  fx.contours = win(sp, 4.25, 4.8)
  fx.contourLabels = bell(sp, 4.78, 4.92, 5.18, 5.35)
  // altitude-driven
  // past MODEL the ground chapters are over (their photos covered them): the pull-out to the planet shows only
  // the planet, never the old procedural ground
  const ground = 1 - sstep(5.0, 5.08, sp)
  fx.human = (1 - sstep(900, 2600, alt)) * ground
  fx.space = sstep(4000, 140_000, alt)
  fx.fog = 1 - sstep(300, 20_000, alt)
  // leaving the site the point cloud holds the view; the planet comes up under it as it bends over
  fx.globe = sstep(2500, 30_000, alt) * (sp > 5 && sp < 6 ? sstep(5.46, 5.64, sp) : 1)
  fx.terrainAlpha = (1 - sstep(600_000, 2_400_000, alt)) * ground
  // REGION — the site becomes a node among Underhill's offices; REACH — the planet
  fx.site = sstep(5.2, 5.6, sp)
  fx.region = sstep(5.35, 5.8, sp)
  fx.regionLabels = sstep(5.75, 5.92, sp)
  fx.offices = win(sp, 5.45, 5.85)
  fx.officeLabels = bell(sp, 5.78, 5.92, 6.25, 6.45)
  fx.arcs = win(sp, 6.25, 6.8)
  fx.drift = sstep(6.6, 7, sp)
  return fx
}
