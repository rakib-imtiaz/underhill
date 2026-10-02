/**
 * Image plates hold the resting frames of the ground chapters (FIELD → MODEL); the WebGL camera
 * flies the moves between them (see the timeline below). Generated artwork is the background; the
 * live layers on top (fog, scan reveals, beacon, beam, rings, cut-outs, strip wipes, labels) are
 * DOM/SVG. The WebGL scene is only needed for REGION and REACH (the globe).
 *
 *   FIELD    photo valley, drifting fog, an ambient scan wave revealing the aligned LiDAR twin;
 *            the camera pushes in toward the instrument and cuts through to…
 *   CONTROL  over the instrument's shoulder; an orange beacon rises on a hilltop across the lake
 *   MEASURE  the same view; a beam draws from the telescope to a point on the far slope, which keeps
 *            its light and its coordinates; then the world dissolves into its scan (the instrument
 *            stays put) and cross-fades to…
 *   METHODS  the scan-world bay with the kit placed on it: GNSS, total station, UAV, survey boat
 *   CAPTURE  empty parcel → the UAV flies three strips, the captured plate revealed under it
 *   MODEL    the captured parcel resolves into contours with a sweep; then the globe takes over
 *
 * Each scene is laid out in its own plate pixels inside one box scaled to cover the stage, so
 * every overlay lines up with the artwork at any viewport size. All state is a pure function of
 * chapter position `sp` plus an ambient clock. `update()` returns how much of the frame the plates
 * cover (1 = the WebGL draw can be skipped).
 */
import { deviceTier } from './device'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { DepthCloud } from './DepthCloud'
import type { DroneOverlay } from './DroneOverlay'

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const win = (x: number, a: number, b: number) => clamp01((x - a) / (b - a))
const sstep = (a: number, b: number, x: number) => { const t = win(x, a, b); return t * t * (3 - 2 * t) }
const bell = (x: number, a: number, b: number, c: number, d: number) => sstep(a, b, x) * (1 - sstep(c, d, x))
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
type P = { x: number; y: number }

/* ---------------- scene sizes, focus points and anchors (plate pixels) ---------------- */
const SMALL = { w: 1672, h: 941 }
const LARGE = { w: 2560, h: 1440 }

// the instrument is part of this plate: `feet` is the survey mark between the tripod's feet, `head` its top
const FIELD = { size: { w: 1550, h: 1015 }, focus: { x: 480, y: 620 }, feet: { x: 300, y: 874 }, // the survey mark, on open ground just clear of the front legs head: { x: 398, y: 392 },
  pin: { x: 380, y: 512 }, // the leader starts on the instrument's display
  card: { x: 520, y: 560 } } // where the instrument card sits

const CONTROL = {
  size: LARGE,
  focus: { x: 1150, y: 720 },
  scope: { x: 660, y: 585 }, // the telescope, where the beam leaves the instrument
  base: { x: 620, y: 930 }, // the tribrach: the scan dissolve starts here
  hill: { x: 1760, y: 624 }, // on the slope just below the ridge (the ridge crosses ~570 here) // control point on the rounded hilltop across the lake
  target: { x: 1236, y: 752 }, // on the slope below the ridge (which runs ~705–720 here) // the observed point on the far slope
  // the instrument itself, cut from the plate (where photo and scan agree), laid over the beam so the
  // beam leaves the telescope behind the body instead of being drawn across it
  cut: { x: 197, y: 395, w: 781, h: 1045 },
}

// METHODS: the real photo with the kit in it; hovering reveals its aligned LiDAR twin
const METHODS = {
  size: { w: 1547, h: 1017 },
  focus: { x: 760, y: 560 },
  gnss: { x: 178, y: 830, h: 305 }, // feet, and height to the antenna
  station: { x: 627, y: 800, h: 290 },
  drone: { x: 1133, y: 320, w: 180 },
  boat: { x: 1335, y: 735, w: 200 },
}
// CAPTURE (chapter 5 rest): the real aerial photo; hovering reveals its LiDAR twin
// the drone painted out of both aerial plates; the 3D UAV takes off from where it hovered
const AERIAL = { size: { w: 1672, h: 941 }, focus: { x: 836, y: 470 }, drone: { x: 558, y: 222 } }

// CAPTURE / MODEL parcel corners: top-left, top-right, bottom-right, bottom-left (all three plates share them)
const Q_WIDE: [number, number][] = [[330, 520], [1000, 548], [1100, 872], [110, 822]] // on the aerial plate's hills
// phones see ~420 plate px of width: a smaller parcel that fits the view (centred on x ≈ 620)
const Q_TALL: [number, number][] = [[478, 330], [764, 338], [786, 548], [450, 540]] // above the phone caption band
const CAPTURE = { size: SMALL, focus: { x: 834, y: 600 } }

/* ---------------- tablets, ch4-5 (METHODS, CAPTURE / MODEL): 3:4 and 4:3 framing ---------------- */
// portrait tablets see 650–760 plate px of the aerial plate: a mid-size parcel on the hills, centred in that view
const CH45_Q_TALL: [number, number][] = [[318, 482], [768, 498], [826, 772], [266, 746]]
const CH45_FOCUS: Record<'methods' | 'aerial' | 'capture', { wide: P; tall: P }> = {
  methods: { wide: METHODS.focus, tall: { x: 410, y: 560 } },
  aerial: { wide: { x: 640, y: 470 }, tall: { x: 546, y: 470 } }, // landscape: the whole wide parcel, clear of the left edge
  capture: { wide: { x: 640, y: 600 }, tall: { x: 546, y: 600 } },
}
/** portrait METHODS sees half the kit: hold on the ground pair (a), glide to the air + water pair (b), hold, glide back (s) */
const CH45_PAN = { a: 410, b: 1250, hold: 7, glide: 3.5 }
const CH45_BOW = { x: 1250, y: 668 } // landscape: the Water card's pin, on the boat's bow (its leader then clears the hull)
/** where the aerial UAV hovers before the cinematic (the plate's own drone is painted out): on tablets it hovers
 *  clear of the caption, which a long stepped move shows before the cinematic starts */
const CH45_HOVER = { wide: { x: 820, y: 360 }, tall: { x: 560, y: 330 } }
/** tablet framing counts as portrait below this aspect (a 4:3 plate cropped narrower than this loses the parcel's ends) */
const ch45Tall = (w: number, h: number) => w / Math.max(1, h) < 1.15

/* ---------------- timeline (chapter units, matching choreo.ts) ---------------- */
// Plates hold every resting frame; the WebGL camera flies the moves between them. A scene fades
// out into the 3D world as the move starts and the next plate fades in as it lands:
//   0→1  field photo → its own depth cloud (same picture, now points), which takes its scan colours,
//        pushes into the valley and scatters; the control image's depth cloud assembles out of the
//        dark and settles into the exact shot → control plate. No procedural 3D world in between.
//   1→2  same plate (same camera): the measurement plays on the image
//   2→3  plate → its depth cloud, which turns to scan, pushes into the valley and scatters; the
//        methods plate fades in out of the dark
//   3→4  the camera rises toward the UAV and pushes into the methods plate as it goes dark; the
//        aerial capture plate is scanned in top to bottom by a glowing line as the camera settles onto it
//   4→5  same camera: the contour sweep plays on the image
//   5→6  plate → 3D pull-out to the globe (REGION/REACH stay 3D)
const T = {
  fieldPush: [0.0, 0.3], fieldOut: [0.1, 0.18],
  controlIn: [0.76, 0.84], controlSettle: [0.7, 1.0], controlOut: [2.44, 2.56],
  beacon: [0.8, 0.98, 1.95, 2.2], beaconTag: [0.75, 0.9, 1.3, 1.45],
  beam: [1.52, 1.72, 2.0, 2.05], hit: [1.7, 1.78], coords: [1.76, 1.88, 2.0, 2.1],
  methodsIn: [2.2, 2.46], methodsOut: [3.3, 3.32], kit: [2.52, 2.7], kitTags: [2.86, 3.0, 3.02, 3.1],
  // CAPTURE + MODEL (one chapter, rests at 5): aerial photo scans in, turns to its LiDAR twin, the UAV
  // comes alive, a survey boundary draws, and the UAV maps the parcel pass by pass on the blue land
  captureIn: [3.1, 3.3], blue: [3.55, 4.0], live: [3.85, 4.0], bound: [3.88, 4.0], approach: [4.39, 4.46],
  model: [4.52, 4.95], modelTag: [4.9, 4.97, 5.1, 5.2], out: [5.28, 5.38],
  // CAPTURE → REGION: the aerial photo shrinks to a tile and flies to the site's place on the planet

  // cards: [on, off] in chapter units; each chapter's cards arrive one after another
  cHeritage: [-1, 0.2], cStation: [-1, 0.2], cControl: [0.88, 1.4], cLicensed: [0.9, 1.4],
  cObserve: [1.8, 2.1], cLidar: [3.42, 3.98], cModel: [4.97, 5.2],
} as const

/** projective map of the unit square onto the parcel quad (so strips and sweeps follow the perspective) */
const makeH = (Q: [number, number][]) => {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = Q
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3
  const den = dx1 * dy2 - dx2 * dy1
  const g = (dx3 * dy2 - dx2 * dy3) / den, h = (dx1 * dy3 - dx3 * dy1) / den
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0
  const d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0
  return (u: number, v: number): [number, number] => {
    const w = g * u + h * v + 1
    return [(a * u + b * v + c) / w, (d * u + e * v + f) / w]
  }
}
/** the parcel map in use (wide screens / phones); swapped by PlateStage when the layout changes */
let H = makeH(Q_WIDE)
let parcelTall = false
let parcelT45 = false // tablet portrait: CH45_Q_TALL (parcelTall is the phone parcel only)
let parcelKey = 'wide'
let hover = AERIAL.drone // the aerial UAV's hover point (CH45_HOVER on tablets)
/** the UAV's size on the aerial plate, relative to the wide layout (the parcel it maps is smaller) */
const droneK = () => (parcelTall ? 0.5 : parcelT45 ? 0.8 : 1)
const STRIPS = 3
const WIPE = [0.2, 0.74] as const // FIELD → CONTROL scan pass
const XF = [2.06, 2.56] as const // MEASURE → METHODS: push through the measured point, focus onto the kit
const inOutE = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const LIFT = 3.03, LAND = 3.34 // the UAV's flight from the METHODS photo to the aerial scene
/** the CAPTURE cinematic: push in on the UAV in slow motion and orbit it top to underside, follow its
 *  LiDAR ray down to the ground, track it into the first pass, then pull back as it maps at full speed */
const CINE = { zin: [4.0, 4.12], show: [4.06, 4.4], hold: [4.13, 4.33], ray: [4.45, 4.53], zout: [4.61, 4.76], slow: [4.0, 4.1, 4.58, 4.72] } as const
const HOLD_AT = 0.42 // orbit fraction where it pauses: the sensor gimbal faces us, three-quarter on
const AERIAL_TILT = 0.3 // the aerial photo looks out toward the horizon: the UAV is seen from only a little above
const PROP = 38 // propeller speed (rad/s): quick, but slow enough per frame that the blades stay visible
const pct = (uv: [number, number][], grow = 0) =>
  `polygon(${uv.map(([u0, v0]) => { const u = -grow + u0 * (1 + 2 * grow), v = -grow + v0 * (1 + 2 * grow); const [x, y] = H(u, v); return `${((x / SMALL.w) * 100).toFixed(2)}% ${((y / SMALL.h) * 100).toFixed(2)}%` }).join(', ')})`
const edge = (out: [number, number][], a: [number, number], b: [number, number], n = 8) => {
  for (let i = 0; i <= n; i++) out.push([a[0] + (b[0] - a[0]) * (i / n), a[1] + (b[1] - a[1]) * (i / n)])
}
const EMPTY = 'polygon(0 0, 0 0, 0 0)'

/** captured region after flight fraction t (serpentine strips); a little past the traced corners so the
 *  plate's own parcel edge is covered, and the whole captured plate once the flight is done */
function capturedPolygon(t: number, grow = 0.05): string {
  if (t <= 0) return EMPTY
  if (t >= 1) return 'none'
  const k = Math.min(STRIPS - 1, Math.floor(t * STRIPS))
  const p = t >= 1 ? 1 : t * STRIPS - k
  const v0 = k / STRIPS, v1 = (k + 1) / STRIPS
  const uv: [number, number][] = []
  if (k % 2 === 0) {
    edge(uv, [0, 0], [1, 0]); edge(uv, [1, 0], [1, v0]); edge(uv, [1, v0], [p, v0], 5)
    edge(uv, [p, v0], [p, v1], 3); edge(uv, [p, v1], [0, v1], 5); edge(uv, [0, v1], [0, 0])
  } else {
    const q = 1 - p
    edge(uv, [0, 0], [1, 0]); edge(uv, [1, 0], [1, v1]); edge(uv, [1, v1], [q, v1], 5)
    edge(uv, [q, v1], [q, v0], 3); edge(uv, [q, v0], [0, v0], 5); edge(uv, [0, v0], [0, 0])
  }
  return pct(uv, grow)
}
/**
 * UAV survey flight at flight fraction t: three passes joined by half-loop turns just outside the
 * parcel, flown at an even cruising speed (the turns join the passes with a continuous tangent, so the
 * UAV never stops). Only the whole flight eases in and out. Returns the ground point under the UAV, the
 * swath edges while it is on a pass, and the reveal fraction for the strips flown so far.
 */
const PASS = 1, TURN = 0.36 // relative path lengths (turn ≈ half-loop of the strip spacing)
const FLIGHT_LEN = STRIPS * PASS + (STRIPS - 1) * TURN
const LOOP = 0.075 // how far the turns swing outside the parcel (u)
function flightAt(t: number) {
  const tc = Math.min(1, Math.max(0, t))
  let x = (0.72 * tc + 0.28 * (1 - Math.cos(Math.PI * tc)) / 2) * FLIGHT_LEN // gentle ease at both ends only
  for (let k = 0; k < STRIPS; k++) {
    const dir = k % 2 === 0 ? 1 : -1
    const vc = (k + 0.5) / STRIPS
    if (x <= PASS || k === STRIPS - 1) {
      const q = Math.min(1, x / PASS)
      const u = dir > 0 ? q : 1 - q
      // edge: 1 mid-pass, easing to 0 at both ends, so the swath light never lingers on the parcel edge
      const edge = Math.min(1, Math.min(q, 1 - q) / 0.07)
      return { u, v: vc, onPass: q > 0 && q < 1, edge, reveal: (k + q) / STRIPS, k, e0: H(u, k / STRIPS), e1: H(u, (k + 1) / STRIPS) }
    }
    x -= PASS
    if (x <= TURN) {
      const q = x / TURN, a = Math.PI * q
      const edge = dir > 0 ? 1 : 0
      const u = edge + dir * LOOP * Math.sin(a)
      const v = vc + ((1 - Math.cos(a)) / 2) / STRIPS
      const g = H(edge, v)
      return { u, v, onPass: false, edge: 0, reveal: (k + 1) / STRIPS, k, e0: g, e1: g }
    }
    x -= TURN
  }
  return { u: 1, v: 1, onPass: false, edge: 0, reveal: 1, k: STRIPS - 1, e0: H(1, 1), e1: H(1, 1) }
}

/** a scene label in plate pixels */
const Tag = forwardRef<HTMLDivElement, { lines: string[]; accent?: string; className?: string }>(function Tag({ lines, accent, className }, ref) {
  return (
    <div ref={ref} className={`pl-tag${className ? ` ${className}` : ''}`} style={accent ? { borderLeftColor: accent } : undefined}>
      {lines.map((l, i) => <span key={i}>{l}</span>)}
    </div>
  )
})
function placeTag(el: HTMLDivElement | null, x: number, y: number, a: number, left = false) {
  if (!el) return
  el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)${left ? ' translateX(-100%)' : ''}`
  el.style.opacity = a.toFixed(3)
  el.style.visibility = a > 0.01 ? 'visible' : 'hidden'
}
function show(el: HTMLElement | SVGElement | null, a: number) {
  if (!el) return
  el.style.opacity = a.toFixed(3)
  el.style.visibility = a > 0.001 ? 'visible' : 'hidden'
}
/** pulse rings: each ellipse runs outward on its own phase */
function pulse(g: SVGGElement | null, time: number, r0: number, r1: number, flat: number, period: number, a: number) {
  if (!g) return
  const rings = g.querySelectorAll<SVGEllipseElement>('ellipse[data-p]')
  const per = Math.max(1, rings.length / 3) // ring groups of three share a phase set
  rings.forEach((el, i) => {
    const q = ((time / period) + (i % 3) / 3 + Math.floor(i / 3) * 0.17 / per) % 1
    const rr = r0 + q * (r1 - r0)
    el.setAttribute('rx', rr.toFixed(3)); el.setAttribute('ry', (rr * flat).toFixed(3))
    el.style.opacity = (Math.sin(Math.PI * q) * a).toFixed(3)
  })
}
const Rings = forwardRef<SVGGElement, { at: P; n?: number; color: string; width?: number }>(function Rings({ at, n = 3, color, width = 2 }, ref) {
  return (
    <g ref={ref}>
      {Array.from({ length: n }, (_, i) => <ellipse key={i} data-p="" cx={at.x} cy={at.y} rx={1} ry={1} fill="none" stroke={color} strokeWidth={width} />)}
    </g>
  )
})


/**
 * An information card: a title with an accent tick, an optional kicker, and rows that reveal one
 * after another (CSS transitions keyed on `.is-in`). Every fact on a card comes from underhill.ca
 * or from the survey standards the scene depicts (see CARDS below).
 */
type CardData = { title: string; kicker?: string; rows: string[]; accent?: string }
const Card = forwardRef<HTMLDivElement, CardData & { className?: string; lead?: 'left' | 'down'; delay?: number }>(function Card({ title, kicker, rows, accent, className, lead, delay = 0 }, ref) {
  return (
    <div ref={ref} className={`pl-card${className ? ` ${className}` : ''}${lead ? ` pl-lead-${lead}` : ''}`} style={{ ...(accent ? { ['--pl-accent' as string]: accent } : {}), ['--d' as string]: `${delay}s` }}>
      <div className="pl-card-title">{title}</div>
      {kicker && <div className="pl-card-kicker">{kicker}</div>}
      {rows.map((r, i) => <div key={i} className="pl-card-row" style={{ ['--i' as string]: i }}>{r}</div>)}
    </div>
  )
})
/** px at the top of the hero that a host page's fixed header covers (`--sh-clear-top` on the root) */
let clearCache: { el: Element | null; w: number; v: number } = { el: null, w: -1, v: 0 }
function clearTop(root: HTMLElement) {
  if (clearCache.el !== root || clearCache.w !== innerWidth) {
    clearCache = { el: root, w: innerWidth, v: parseFloat(getComputedStyle(root).getPropertyValue('--sh-clear-top')) || 0 }
  }
  return clearCache.v
}
/** the iPad / tablet tier (see device.ts): chapter blocks branch on it for their tablet framing */
export const isTabletTier = () => deviceTier() === 'tablet'
/** phones: full-screen CSS blur re-rasterises a screen-sized layer every frame, so it's skipped there */
let blurOkCache: boolean | null = null
const blurPx = (px: number) => ((blurOkCache ??= deviceTier() !== 'phone') && px > 0.01 ? `blur(${px.toFixed(2)}px)` : '')
/** the depth point clouds are retired (both draw at alpha 0); kept switchable, off so their images never load */
const DEPTH_CLOUDS = false
/** place a card at plate px (x, y) — `anchor` picks which corner sits there — and switch it on/off */
function placeCard(el: HTMLDivElement | null, x: number, y: number, on: boolean, anchor: 'tl' | 'bl' | 'tr' | 'br' = 'tl') {
  if (!el) return
  const tx = anchor === 'tr' || anchor === 'br' ? ' translateX(-100%)' : ''
  const ty = anchor === 'bl' || anchor === 'br' ? ' translateY(-100%)' : ''
  el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)${tx}${ty}`
  if (el.classList.contains('is-in') !== on) el.classList.toggle('is-in', on)
}

/* the survey UAV's spec callouts (CAPTURE cinematic). Figures are typical of a survey-grade LiDAR UAV
   and are placeholders until confirmed against Underhill's own fleet */
const SPEC_KEYS = ['rotor', 'sensor', 'gear'] as const
const SPEC_OFFSET: Record<(typeof SPEC_KEYS)[number], [number, number]> = { rotor: [1, -1], sensor: [-1, 1], gear: [1, 1] }

/* tablets (ch4-5): cards keep clear of the chapter's caption, which on a stepped tablet is already up while
   the UAV is still flying (a long step shows the next caption early) */
type Box45 = { l: number; t: number; r: number; b: number }
const grow45 = (a: Box45, p: number): Box45 => ({ l: a.l - p, t: a.t - p, r: a.r + p, b: a.b + p })
/** caption `i` (one per resting chapter) in hero-root px, whether or not it is showing yet */
function ch45Caption(root: HTMLElement, i: number): Box45 | null {
  const c = root.closest('.sh-root')?.querySelectorAll<HTMLElement>('.sh-caption')[i]
  if (!c || !c.offsetHeight) return null
  const r = c.getBoundingClientRect(), R = root.getBoundingClientRect()
  return { l: r.left - R.left, t: r.top - R.top, r: r.right - R.left, b: r.bottom - R.top }
}
/** a plate card that would overlap the caption steps down below it (k: plate px per screen px) */
function ch45Clear(el: HTMLElement | null, cap: Box45 | null, root: HTMLElement, k: number) {
  if (!el || !cap) return
  const R = root.getBoundingClientRect(), r = el.getBoundingClientRect(), c = grow45(cap, 16)
  const l = r.left - R.left, t = r.top - R.top
  if (l > c.r || l + r.width < c.l || t > c.b || t + r.height < c.t) return
  el.style.transform += ` translateY(${((c.b - t) * k).toFixed(1)}px)`
}
/** the first slot round a pin (its preferred side first) where a w×h card is on screen and clear of `avoid`;
 *  failing that, the slot that overlaps least */
function ch45Slot(at: P, w: number, h: number, [px, py]: [number, number], off: number, view: Box45, avoid: Box45[]): P {
  const sides: [number, number][] = [[px, py], [px, 0], [0, py], [px, -py], [-px, py], [-px, 0], [0, -py], [-px, -py]]
  let best = { x: 0, y: 0 }, bestHit = Infinity
  for (const [sx, sy] of sides) {
    let x = sx > 0 ? at.x + off : sx < 0 ? at.x - off - w : at.x - w / 2
    let y = sy > 0 ? at.y + off * 0.6 : sy < 0 ? at.y - off * 0.6 - h : at.y - h / 2
    x = Math.min(view.r - w, Math.max(view.l, x)); y = Math.min(view.b - h, Math.max(view.t, y))
    let hit = 0
    for (const a of avoid) hit += Math.max(0, Math.min(x + w, a.r) - Math.max(x, a.l)) * Math.max(0, Math.min(y + h, a.b) - Math.max(y, a.t))
    if (hit === 0) return { x, y }
    if (hit < bestHit) { bestHit = hit; best = { x, y } }
  }
  return best
}
const SPECS: CardData[] = [
  { title: 'Airframe', kicker: 'Survey UAV · quad-rotor', rows: ['RTK GNSS positioning', 'Flown by Advanced RPAS pilots', 'Transport Canada certified'] },
  { title: 'Sensor', kicker: 'LiDAR + RGB camera', rows: ['Stabilised 3-axis gimbal', 'Hundreds of thousands of pts / s', 'Reads ground through canopy'] },
  { title: 'Deliverables', kicker: 'From one flight', rows: ['Classified point cloud', 'Bare-earth DEM · contours', 'Orthomosaic'] },
]

/* ---------------- card copy: facts from underhill.ca and the standards shown ---------------- */
const CARDS = {
  heritage: { title: '1913 — 2026', kicker: 'Surveying Western & Northern Canada', rows: ['British Columbia · Yukon', 'Northwest Territories · Nunavut', 'Vancouver · Vancouver Island · Kamloops · Whitehorse'] },
  station: { title: 'Robotic total station', kicker: 'Topographic surveying', rows: ['Precise elevation & feature data', 'Ties into the control network', 'Works alongside GNSS, SLAM & aerial'] },
  control: { title: 'Control point', kicker: 'Known position', rows: ['Horizontal · NAD83(CSRS)', 'Projection · UTM zone 10N', 'Heights · CGVD2013'], accent: '#ff8a3d' },
  licensed: { title: 'Licensed surveyors', kicker: 'Legal & geodetic surveys', rows: ['Canada Lands Surveyors · CLS', 'BC Land Surveyors · BCLS', 'Geomatics Engineers · P.Eng.'] },
  observe: { title: 'One observation', kicker: 'From a known station', rows: ['Horizontal & vertical angle', 'Slope distance', '→ northing · easting · elevation'] },
  gnss: { title: 'Ground', kicker: 'GNSS', rows: ['Satellite positioning', 'Tied to the control network'] },
  robotic: { title: 'Total station', kicker: 'Robotic', rows: ['Detailed point collection', 'Complex terrain, high accuracy'] },
  air: { title: 'Air', kicker: 'RPAS / UAV', rows: ['Transport Canada certified', 'UAV surveying since 2012'] },
  water: { title: 'Water', kicker: 'Hydrographic', rows: ['Unmanned vessels & sonar', 'Western & Northern Canada'] },
  lidar: { title: 'Aerial LiDAR', kicker: 'Reality capture', rows: ['Zenmuse L2 · YellowScan Mapper+', 'Trinity F90+ · DJI M400 / M300', 'Survey-grade, rapid turnaround'] },
  model: { title: 'Topographic model', kicker: 'Deliverable', rows: ['Contours · 2 m minor / 10 m major', 'Complete 3D digital model', 'For planning, design & development'], accent: '#ff8a3d' },
} satisfies Record<string, CardData>

export type PlateHandle = { update: (sp: number, site?: { x: number; y: number; a: number }) => number; layout: () => void }
type Props = { enabled: boolean; coords: string[]; onReady?: () => void }
/** portrait framing: the slice of each plate a phone shows */
const TALL_FOCUS: Record<'field' | 'control' | 'methods' | 'aerial' | 'capture', P> = {
  field: { x: 470, y: 560 }, // the instrument and the valley behind it
  control: { x: 1480, y: 700 }, // the hilltop beacon (pans to the instrument for MEASURE)
  methods: { x: 700, y: 560 }, // pans across the kit
  aerial: { x: 640, y: 470 }, // the drone over the hills
  capture: { x: 834, y: 600 }, // the parcel
}
/** phones: fraction of the screen height a plate fills from the top (0 = cover the whole screen) */
const TALL_BAND: Record<'field' | 'control' | 'methods' | 'aerial' | 'capture', number> = { field: 0, control: 0, methods: 0, aerial: 0, capture: 0 } // full-bleed everywhere: phones pan instead
/** tablets in portrait see ~1000 px of a plate's width: FIELD keeps the instrument left of centre;
 *  CONTROL holds the beacon with the instrument's edge as foreground, then pans to the beam for MEASURE */
const CH13_TAB_TALL = { field: { x: 470, y: 560 }, control: { x: 1380, y: 720 }, measure: { x: 950, y: 720 } }
type SceneKey = 'field' | 'control' | 'methods' | 'aerial' | 'capture'
const KEYS: SceneKey[] = ['field', 'control', 'methods', 'aerial', 'capture']
const SCENES: Record<SceneKey, { size: { w: number; h: number }; focus: P }> = {
  field: FIELD, control: CONTROL, methods: METHODS, aerial: AERIAL, capture: CAPTURE,
}

const PlateStage = forwardRef<PlateHandle, Props>(function PlateStage({ enabled, coords, onReady }, ref) {
  const sceneField = useRef<HTMLDivElement>(null), sceneControl = useRef<HTMLDivElement>(null)
  const sceneMethods = useRef<HTMLDivElement>(null), sceneCapture = useRef<HTMLDivElement>(null), sceneAerial = useRef<HTMLDivElement>(null)
  const boxField = useRef<HTMLDivElement>(null), boxControl = useRef<HTMLDivElement>(null)
  const boxMethods = useRef<HTMLDivElement>(null), boxCapture = useRef<HTMLDivElement>(null), boxAerial = useRef<HTMLDivElement>(null)
  const scene = { field: sceneField, control: sceneControl, methods: sceneMethods, aerial: sceneAerial, capture: sceneCapture }
  const box = { field: boxField, control: boxControl, methods: boxMethods, aerial: boxAerial, capture: boxCapture }


  const fieldScan = useRef<HTMLImageElement>(null), fog = useRef<HTMLImageElement>(null)
  const controlScan = useRef<HTMLImageElement>(null), beacon = useRef<SVGGElement>(null), beaconRings = useRef<SVGGElement>(null)
  const beaconTag = useRef<HTMLDivElement>(null), beam = useRef<SVGLineElement>(null), hit = useRef<SVGGElement>(null)
  const hitRings = useRef<SVGGElement>(null), coordsTag = useRef<HTMLDivElement>(null), ctrlInst = useRef<HTMLImageElement>(null)
  const kit = useRef<HTMLDivElement>(null), kitRings = useRef<SVGGElement>(null), wake = useRef<SVGGElement>(null)
  const tagGnss = useRef<HTMLDivElement>(null), tagStation = useRef<HTMLDivElement>(null)
  const tagAir = useRef<HTMLDivElement>(null), tagWater = useRef<HTMLDivElement>(null)
  const aerialScan = useRef<HTMLImageElement>(null) // the LiDAR twin the aerial scene fades into
  const mapped = useRef<HTMLImageElement>(null), bound = useRef<SVGPolygonElement>(null), sweep = useRef<SVGLineElement>(null)
  const drone = useRef<HTMLImageElement>(null), fan = useRef<SVGPolygonElement>(null)
  const droneTag = useRef<HTMLDivElement>(null), modelTag = useRef<HTMLDivElement>(null)
  const cHeritage = useRef<HTMLDivElement>(null), cStation = useRef<HTMLDivElement>(null), cLicensed = useRef<HTMLDivElement>(null)
  const cObserve = useRef<HTMLDivElement>(null), cLidar = useRef<HTMLDivElement>(null)

  const t0 = useRef(performance.now())
  const aerialPanX = useRef(AERIAL.drone.x) // phones: the camera follows the UAV
  const ch45At = useRef(-1) // portrait tablets: when the METHODS pan started (s), -1 while the scene is away
  /** cards that point at something: the card, its scene and the plate point it describes */
  const M0 = METHODS
  const LEADS: { card: React.RefObject<HTMLDivElement | null>; scene: SceneKey; at: P }[] = [
    { card: cStation, scene: 'field', at: FIELD.pin },
    { card: beaconTag, scene: 'control', at: { x: CONTROL.hill.x, y: CONTROL.hill.y - 230 } }, // the top of the beacon
    { card: coordsTag, scene: 'control', at: CONTROL.target },
    { card: cObserve, scene: 'control', at: CONTROL.scope },
    { card: tagGnss, scene: 'methods', at: { x: M0.gnss.x, y: M0.gnss.y - M0.gnss.h + 20 } },
    { card: tagStation, scene: 'methods', at: { x: M0.station.x, y: M0.station.y - M0.station.h + 30 } },
    { card: tagAir, scene: 'methods', at: { x: M0.drone.x, y: M0.drone.y - 20 } },
    { card: tagWater, scene: 'methods', at: { x: M0.boat.x, y: M0.boat.y - M0.boat.w * 0.28 } },
    { card: cLidar, scene: 'aerial', at: { x: AERIAL.drone.x, y: AERIAL.drone.y + 10 } },
    { card: modelTag, scene: 'aerial', at: (() => { const [x, y] = H(0.42, 0.3); return { x, y } })() },
  ]
  const bases = useRef<Record<SceneKey, string>>({ field: '', control: '', methods: '', aerial: '', capture: '' })
  const baseN = useRef<Partial<Record<SceneKey, { x: number; y: number; s: number }>>>({})
  const propAngle = useRef(0), lastT = useRef(0)
  const specCards = useRef<(HTMLDivElement | null)[]>([]), specLeads = useRef<SVGSVGElement>(null)
  const specPos = useRef<({ x: number; y: number } | null)[]>([]) // a card stays put once it's up
  const cloudScene = useRef<HTMLDivElement>(null), cloudBox = useRef<HTMLDivElement>(null), cloudCanvas = useRef<HTMLCanvasElement>(null)
  const cloud = useRef<DepthCloud | null>(null)
  const fCloudScene = useRef<HTMLDivElement>(null), fCloudBox = useRef<HTMLDivElement>(null), fCloudCanvas = useRef<HTMLCanvasElement>(null)
  const fCloud = useRef<DepthCloud | null>(null)
  const voidRef = useRef<HTMLDivElement>(null)
  const captureScan = useRef<HTMLDivElement>(null)
  const wipeLine = useRef<HTMLDivElement>(null)
  const droneCanvas = useRef<HTMLCanvasElement>(null)
  const flyCanvas = useRef<HTMLCanvasElement>(null), flyDrone = useRef<DroneOverlay | null>(null)
  const methodsClean = useRef<HTMLImageElement>(null)
  const drone3d = useRef<DroneOverlay | null>(null)
  // the real UAV model over the MODEL plate (three.js comes with it, so it loads on demand)
  // its model waits until the opening plates are in (the intro film and chapter 1 get the bandwidth first)
  const earlyPlates = useRef<{ done: Promise<void>; resolve: () => void } | null>(null)
  if (!earlyPlates.current) { let resolve = () => {}; earlyPlates.current = { done: new Promise<void>((r) => { resolve = r }), resolve } }
  useEffect(() => {
    if (!enabled) return
    let gone = false
    earlyPlates.current!.done.then(() => import('./DroneOverlay')).then(({ DroneOverlay }) => {
      if (gone || !droneCanvas.current) return
      drone3d.current = new DroneOverlay(droneCanvas.current, AERIAL.size.w, AERIAL.size.h)
      // the UAV that leaves the METHODS photo and flies to the aerial scene, in screen space
      if (flyCanvas.current) flyDrone.current = new DroneOverlay(flyCanvas.current, 100, 100)
    }).catch((e) => console.warn('[PlateStage] 3D drone unavailable, using the cut-out:', e))
    return () => { gone = true; drone3d.current?.dispose(); drone3d.current = null; flyDrone.current?.dispose(); flyDrone.current = null }
  }, [enabled])
  const rootRef = useRef<HTMLDivElement>(null)
  const leadLayer = useRef<SVGSVGElement>(null)
  const cloudCss = useRef({ w: 0, h: 0 })
  // the control plate as a depth point cloud (three.js comes with it, so it loads on demand)
  useEffect(() => {
    if (!enabled || !DEPTH_CLOUDS || !cloudCanvas.current) return
    let gone = false
    import('./DepthCloud').then(({ DepthCloud }) => {
      if (gone || !cloudCanvas.current) return
      cloud.current = new DepthCloud(cloudCanvas.current, { photo: '/plates/control_photo.webp', scan: '/plates/control_scan.webp', depth: '/plates/control_depth.jpg' },
        CONTROL.size.w / CONTROL.size.h, 4, () => onReady?.())
      if (fCloudCanvas.current) fCloud.current = new DepthCloud(fCloudCanvas.current, { photo: '/plates/field_photo.webp', scan: '/plates/field_scan.webp', depth: '/plates/field_depth.jpg' },
        FIELD.size.w / FIELD.size.h, 4, () => onReady?.())
      const { w, h } = cloudCss.current
      if (w) cloud.current.setSize(w, h, Math.min(deviceTier() === 'phone' ? 1.25 : 1.5, devicePixelRatio || 1))
    }).catch((e) => console.warn('[PlateStage] depth cloud unavailable:', e))
    return () => { gone = true; cloud.current?.dispose(); cloud.current = null; fCloud.current?.dispose(); fCloud.current = null }
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  // a scene only takes over once its images have loaded; until then the WebGL scene shows
  const ready = useRef<Record<SceneKey, boolean>>({ field: false, control: false, methods: false, aerial: false, capture: false })
  useEffect(() => {
    if (!enabled) return
    const loaded = (i: HTMLImageElement) => (i.complete
      ? (i.naturalWidth > 0 ? Promise.resolve() : Promise.reject(new Error(i.src)))
      : new Promise<void>((res, rej) => { i.addEventListener('load', () => res(), { once: true }); i.addEventListener('error', () => rej(new Error(i.src)), { once: true }) }))
    // decoding first avoids a hitch, but decode() never settles in a background tab: cap it
    const settle = (i: HTMLImageElement) => loaded(i).then(() => Promise.race([i.decode().catch(() => {}), new Promise((res) => setTimeout(res, 1500))]))
    // one scene at a time, in chapter order: the opening plate gets the whole connection, and each later
    // plate (held back in data-src) is in long before anyone can step to it
    let gone = false
    ;(async () => {
      for (const key of KEYS) {
        if (gone) return
        const imgs = [...(scene[key].current?.querySelectorAll('img') ?? [])]
        for (const i of imgs) if (i.dataset.src && !i.getAttribute('src')) i.src = i.dataset.src
        await Promise.all(imgs.map(settle))
          .then(() => { ready.current[key] = true; onReady?.() })
          .catch((e) => console.warn(`[PlateStage] ${key} plate failed to load, keeping the WebGL scene:`, e))
        if (key === 'control') earlyPlates.current?.resolve()
      }
      earlyPlates.current?.resolve()
    })()
    return () => { gone = true }
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps -- refs and onReady are read once

  // fit the plates to the stage ourselves (and again on every size change), so they never sit at raw size
  useEffect(() => {
    const el = rootRef.current
    if (!enabled || !el) return
    const ro = new ResizeObserver(() => KEYS.forEach((k) => fit(k)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  /** scale a scene's plate box to cover the stage, keeping its focus point on screen */
  const fit = (key: SceneKey, focusOverride?: P) => {
    const outer = scene[key].current, b = box[key].current
    if (!outer || !b) return
    const { size } = SCENES[key]
    // portrait screens see a narrow slice of each plate: aim it at the chapter's subject
    const tall = outer.clientWidth / Math.max(1, outer.clientHeight) < 0.8
    // tablets: each chapter group frames its own keys for 3:4 / 4:3 (landscape keeps the desktop framing)
    let tabFocus: P | undefined
    if (isTabletTier()) {
      if (key === 'field' || key === 'control') tabFocus = tall ? CH13_TAB_TALL[key] : SCENES[key].focus
      else tabFocus = CH45_FOCUS[key][ch45Tall(outer.clientWidth, outer.clientHeight) ? 'tall' : 'wide']
    }
    const focus = focusOverride ?? tabFocus ?? (tall ? TALL_FOCUS[key] : SCENES[key].focus)
    const W = outer.clientWidth, Ht = outer.clientHeight
    // phones: some plates sit in the upper part of the screen (the caption band below) so more of them fits
    const band = tall ? TALL_BAND[key] : 0
    const s = Math.max(W / size.w, (band || 1) * Ht / size.h)
    b.style.maskImage = b.style.webkitMaskImage = band ? 'linear-gradient(to bottom, transparent 0%, #000 12%, #000 80%, transparent 100%)' : ''
    outer.style.background = band ? '#04070c' : '' // nothing behind shows through under a banded plate
    const left = Math.min(0, Math.max(W - size.w * s, W / 2 - focus.x * s))
    const top = Math.min(0, Math.max(Ht - size.h * s, Ht / 2 - focus.y * s))
    const topB = band ? Ht * (0.76 - band) : top // banded: the plate sits just above the caption band
    bases.current[key] = `translate(${left.toFixed(1)}px, ${topB.toFixed(1)}px) scale(${s.toFixed(5)})`
    baseN.current[key] = { x: left, y: topB, s }
    b.style.transform = bases.current[key]
    // the page's poster is the opening plate: frame it exactly like the plate, so the hand-over can't jump
    if (key === 'field') {
      const poster = rootRef.current?.parentElement?.querySelector<HTMLImageElement>('.sh-poster img')
      if (poster) Object.assign(poster.style, {
        position: 'absolute', maxWidth: 'none', objectFit: 'fill', objectPosition: '0 0',
        left: `${left.toFixed(1)}px`, top: `${top.toFixed(1)}px`, width: `${(size.w * s).toFixed(1)}px`, height: `${(size.h * s).toFixed(1)}px`,
      })
    }
    b.style.setProperty('--pl-k', (1 / s).toFixed(4)) // labels keep one screen size on every plate
  }
  /** a camera push: scale the plate about a point */
  const push = (key: SceneKey, at: P, k: number) => {
    const b = box[key].current
    if (b) b.style.transform = `${bases.current[key]} translate(${at.x}px, ${at.y}px) scale(${k.toFixed(4)}) translate(${-at.x}px, ${-at.y}px)`
  }
  const radialMask = (el: HTMLImageElement | null, size: { w: number; h: number }, at: P, gradient: string) => {
    if (!el) return
    const pos = `${((at.x / size.w) * 100).toFixed(2)}% ${((at.y / size.h) * 100).toFixed(2)}%`
    const m = gradient.split('@').join(pos)
    el.style.maskImage = m
    el.style.webkitMaskImage = m
  }

  useImperativeHandle(ref, () => ({
    layout() {
      KEYS.forEach((k) => fit(k))
      const outer = cloudScene.current, b = cloudBox.current
      if (outer && b) {
        const s = Math.max(outer.clientWidth / CONTROL.size.w, outer.clientHeight / CONTROL.size.h)
        cloudCss.current = { w: CONTROL.size.w * s, h: CONTROL.size.h * s }
        cloud.current?.setSize(cloudCss.current.w, cloudCss.current.h, Math.min(deviceTier() === 'phone' ? 1.25 : 1.5, devicePixelRatio || 1))
      }
    },
    update(sp: number, _site?: { x: number; y: number; a: number }) {
      if (!enabled) return 0
      const time = (performance.now() - t0.current) / 1000
      const slow = bell(sp, CINE.slow[0], CINE.slow[1], CINE.slow[2], CINE.slow[3])
      {
        const dt = Math.min(0.1, Math.max(0, time - lastT.current)); lastT.current = time
        propAngle.current += dt * PROP * (1 - 0.9 * slow) // slow motion: the blades become visible
        if (location.search.includes('frame=')) propAngle.current = time * PROP * (1 - 0.9 * slow)
      }
      const rd = ready.current
      for (const k of KEYS) if (!bases.current[k]) fit(k) // never draw a plate unfitted

      // phones see a narrow slice of each plate: the camera pans to what matters
      const rootEl = rootRef.current
      const tallNow = !!rootEl && rootEl.clientWidth / Math.max(1, rootEl.clientHeight) < 0.8
      const tab45 = isTabletTier(), t45Tall = tab45 && !!rootEl && ch45Tall(rootEl.clientWidth, rootEl.clientHeight)
      const pk = tallNow && !tab45 ? 'phone' : t45Tall ? 't45' : tab45 ? 'tab' : 'wide'
      if (pk !== parcelKey) {
        parcelKey = pk; parcelTall = pk === 'phone'; parcelT45 = pk === 't45'
        const q = parcelTall ? Q_TALL : parcelT45 ? CH45_Q_TALL : Q_WIDE
        H = makeH(q)
        bound.current?.setAttribute('points', q.map(([x, y]) => `${x},${y}`).join(' '))
        const at = LEADS.find((l) => l.card === modelTag)?.at
        // tablet landscape: the model card sits right of the parcel, so its pin moves toward that side
        if (at) { const [x, y] = H(tab45 && !t45Tall ? 0.74 : 0.42, 0.3); at.x = x; at.y = y }
        hover = pk === 't45' ? CH45_HOVER.tall : pk === 'tab' ? CH45_HOVER.wide : AERIAL.drone
        const lidarAt = LEADS.find((l) => l.card === cLidar)?.at
        if (lidarAt) { lidarAt.x = hover.x; lidarAt.y = hover.y + 10 }
      }
      if (tallNow) {
        const ph = 0.5 - 0.5 * Math.cos((time * Math.PI * 2) / 16)
        // CONTROL: pans between the instrument and the hilltop beacon; MEASURE: the instrument and its beam
        const pc = 0.5 - 0.5 * Math.cos((time * Math.PI * 2) / 12)
        // tablets hold one framed shot on the beacon, then make one pan to the instrument as the measurement starts
        const tc = CH13_TAB_TALL
        if (isTabletTier()) fit('control', { x: tc.control.x + (tc.measure.x - tc.control.x) * sstep(1.2, 1.55, sp), y: tc.control.y })
        else fit('control', { x: (840 + (1600 - 840) * pc) + (900 - (840 + (1600 - 840) * pc)) * sstep(1.25, 1.6, sp), y: 700 })
        if (!tab45) fit('methods', { x: 330 + (1330 - 330) * ph, y: 560 }) // tablets: framed in their own blocks below
        if (!tab45) fit('aerial', { x: aerialPanX.current, y: 480 })
      }

      /* ---------- scene alphas: each new scene fades in on top of the last ---------- */
      // FIELD → CONTROL: the camera pushes into the valley while one scan line sweeps across the frame,
      // revealing the control shot behind it (already settling); no particles, no gap
      const wipe = inOutE(win(sp, WIPE[0], WIPE[1]))
      const aField = rd.field && rd.control ? (sp < WIPE[1] + 0.01 ? 1 : 0) : rd.field ? 1 - sstep(T.fieldOut[0], T.fieldOut[1], sp) : 0
      const aControl = rd.control ? (sp > WIPE[0] ? 1 : 0) * (1 - sstep(T.controlOut[0], T.controlOut[1], sp)) : 0
      if (sceneControl.current) sceneControl.current.style.clipPath = wipe > 0 && wipe < 1 ? `inset(0 ${((1 - wipe) * 100).toFixed(2)}% 0 0)` : ''
      if (wipeLine.current) {
        wipeLine.current.style.left = `${(wipe * 100).toFixed(2)}%`
        wipeLine.current.style.opacity = wipe > 0 && wipe < 1 ? (Math.min(1, Math.min(wipe, 1 - wipe) * 12)).toFixed(3) : '0'
      }
      const aMethods = rd.methods ? sstep(T.methodsIn[0], T.methodsIn[1], sp) * (1 - sstep(T.methodsOut[0], T.methodsOut[1], sp)) : 0
      const aAerial = rd.aerial ? sstep(T.captureIn[0], T.captureIn[1], sp) * (1 - sstep(T.out[0], T.out[1], sp)) : 0
      // the parcel scene only carries MODEL now: it fades in over the aerial photo
      const aCapture = 0 // the parcel plates are retired: the model is built on the aerial scene
      show(sceneField.current, aField)
      show(sceneControl.current, aControl)
      show(sceneMethods.current, aMethods)
      show(sceneAerial.current, aAerial)
      show(sceneCapture.current, aCapture)

      /* ---------- the field plate's depth cloud: the photo becomes points and scatters ---------- */
      const sizeTo = (c: DepthCloud, outer: HTMLDivElement | null, size: { w: number; h: number }) => {
        if (!outer) return
        const k = Math.max(outer.clientWidth / size.w, outer.clientHeight / size.h)
        c.setSize(size.w * k, size.h * k, Math.min(deviceTier() === 'phone' ? 1.25 : 1.5, devicePixelRatio || 1))
      }
      {
        const c = fCloud.current
        const a = 0 // replaced by the scan-line pass
        const on = a > 0.001 && !!c?.ready
        show(fCloudScene.current, on ? 1 : 0)
        if (on && c) {
          sizeTo(c, fCloudScene.current, FIELD.size)
          const k = 1 + 0.16 * Math.pow(win(sp, T.fieldPush[0], T.fieldPush[1]), 2) // same push as the plate
          const at = { x: FIELD.feet.x, y: FIELD.feet.y - 180 }
          if (fCloudBox.current) fCloudBox.current.style.transform = `${bases.current.field} translate(${at.x}px, ${at.y}px) scale(${k.toFixed(4)}) translate(${-at.x}px, ${-at.y}px)`
          const go = win(sp, 0.16, 0.48)
          c.render({
            alpha: a,
            assemble: 1 - easeOut(win(sp, 0.26, 0.48)),
            scan: easeOut(win(sp, 0.14, 0.32)),
            push: 2.2 * go * go, rise: 0.7 * go * go, yaw: -0.05 * go * go,
          })
        }
      }
      // between the images of a move the old procedural world stays out of sight: a dark void
      const voidA = 0
      // CAPTURE → REGION: the aerial view hands over to the engine's point cloud of the site, which the
      // camera then carries up onto the planet
      show(voidRef.current, voidA)

      /* ---------- the control plate's depth cloud: arriving from FIELD, leaving toward METHODS ---------- */
      {
        const c = cloud.current
        let a = 0, assemble = 1, scan = 0, pushZ = 0, rise = 0, yaw = 0
        if (false) { // (retired) the control cloud assembling from FIELD
          a = sstep(0.26, 0.36, sp) * (1 - sstep(0.84, 0.89, sp))
          assemble = easeOut(win(sp, 0.3, 0.7))
          const land = easeOut(win(sp, 0.3, 0.8))
          pushZ = -6 * (1 - land); rise = 1.2 * (1 - land); yaw = -0.1 * (1 - land)
        } else if (false) { // (retired) the control cloud scattering toward METHODS // becomes its scan, pushes into the valley and scatters
          a = sstep(2.0, 2.06, sp) * (1 - sstep(2.38, 2.52, sp))
          scan = easeOut(win(sp, 2.06, 2.26))
          const go = win(sp, 2.1, 2.62)
          pushZ = 2.2 * go * go; rise = 0.7 * go * go; yaw = 0.06 * go * go
          assemble = 1 - easeOut(win(sp, 2.22, 2.5))
        }
        const on = a > 0.001 && !!c?.ready
        show(cloudScene.current, on ? 1 : 0)
        if (on && c) {
          // size the backing store to the cloud's on-screen size (cheap no-op when unchanged)
          const outer = cloudScene.current
          if (outer) {
            const s = Math.max(outer.clientWidth / CONTROL.size.w, outer.clientHeight / CONTROL.size.h)
            c.setSize(CONTROL.size.w * s, CONTROL.size.h * s, Math.min(deviceTier() === 'phone' ? 1.25 : 1.5, devicePixelRatio || 1))
          }
          // the cloud shares the control plate's framing and settle push, so the hand-over is seamless
          if (cloudBox.current) cloudBox.current.style.transform = `${bases.current.control} translate(${CONTROL.scope.x}px, ${CONTROL.scope.y}px) scale(${(1.06 - 0.06 * easeOut(win(sp, T.controlSettle[0], T.controlSettle[1]))).toFixed(4)}) translate(${-CONTROL.scope.x}px, ${-CONTROL.scope.y}px)`
          c.render({ alpha: a, assemble, scan, push: pushZ, rise, yaw })
        }
      }

      /* ---------- FIELD ---------- */
      if (aField > 0) {
        // a steady push toward the valley, continuing through the scan pass
        push('field', { x: 900, y: 520 }, 1 + 0.22 * inOutE(win(sp, 0.02, WIPE[1])))
        const ph = (time % 7) / 7
        const waveR = 4 + easeOut(ph) * 150
        const waveA = Math.sin(Math.PI * Math.min(1, ph * 1.1)) * (1 - sstep(0.02, 0.08, sp))
        const band = `radial-gradient(ellipse ${waveR.toFixed(2)}% ${(waveR * 0.62).toFixed(2)}% at @, transparent 70%, rgba(0,0,0,${(0.9 * waveA).toFixed(3)}) 92%, transparent 100%)`
        radialMask(fieldScan.current, FIELD.size, FIELD.feet, band)
        if (fog.current) fog.current.style.transform = `translate(${(Math.sin(time * 0.05) * 38 - 20).toFixed(1)}px, ${(Math.sin(time * 0.037) * 6).toFixed(1)}px) scale(1.08)`
        const stationOn = sp > T.cStation[0] && sp < T.cStation[1]
        placeCard(cStation.current, FIELD.card.x, FIELD.card.y, stationOn)
      }
      if (cHeritage.current) { const on = aField > 0 && sp < T.cHeritage[1]; if (cHeritage.current.classList.contains('is-in') !== on) cHeritage.current.classList.toggle('is-in', on) }

      /* ---------- CONTROL / MEASURE ---------- */
      if (aControl > 0) {
        const go = win(sp, XF[0], XF[1]), goE = go * go * (3 - 2 * go)
        if (go > 0) push('control', CONTROL.target, 1 + 0.3 * goE) // leaves by pushing into the measured point
        else push('control', CONTROL.scope, 1.12 - 0.12 * easeOut(win(sp, WIPE[0], 1.0))) // arrives mid-move and settles
        if (boxControl.current) boxControl.current.style.filter = go > 0.15 ? blurPx(6 * sstep(0.15, 0.9, go)) : ''
        // the beacon: a line of light rising from the hilltop, with orange rings on the ground
        const bA = bell(sp, T.beacon[0], T.beacon[1], T.beacon[2], T.beacon[3])
        const rise = easeOut(win(sp, T.beacon[0], T.beacon[1] + 0.1))
        show(beacon.current, bA)
        beacon.current?.querySelector('line')?.setAttribute('y1', (CONTROL.hill.y - 230 * rise).toFixed(1))
        pulse(beaconRings.current, time, 10, 150, 0.22, 2.8, bA)
        // tablets: the beacon sits near the right edge, so its card hangs to its left, level with the beacon's top
        // (lower in portrait, below the caption); offsets are screen px (kc = plate px per screen px)
        // desktop too: hung above-right, the card sat over the beacon's top and hid its own leader
        const tab = isTabletTier() || deviceTier() === 'desktop', kc = 1 / (baseN.current.control?.s || 1)
        if (tab) placeCard(beaconTag.current, CONTROL.hill.x - 34 * kc, CONTROL.hill.y - 230 - (tallNow ? 20 : 70) * kc, sp > T.cControl[0] && sp < T.cControl[1], 'tr')
        else placeCard(beaconTag.current, CONTROL.hill.x + 22, CONTROL.hill.y - 236, sp > T.cControl[0] && sp < T.cControl[1], 'bl')
        placeCard(cLicensed.current, 1020, 930, sp > T.cLicensed[0] && sp < T.cLicensed[1])
        placeCard(cObserve.current, 1020, 930, sp > T.cObserve[0] && sp < T.cObserve[1])
        // the measurement: the beam draws from the telescope to the target, which keeps its light
        const beamA = bell(sp, T.beam[0], T.beam[1] - 0.18, T.beam[2], T.beam[3])
        const reach = easeOut(win(sp, T.beam[0], T.beam[1]))
        if (beam.current) {
          const len = Math.hypot(CONTROL.target.x - CONTROL.scope.x, CONTROL.target.y - CONTROL.scope.y)
          beam.current.style.strokeDasharray = `${len}`
          beam.current.style.strokeDashoffset = `${(len * (1 - reach)).toFixed(1)}`
          show(beam.current, beamA)
        }
        // the body occludes the beam only while the beam is on; before the scan dissolve it steps aside
        show(ctrlInst.current, sstep(1.4, 1.5, sp) * (1 - sstep(2.02, 2.06, sp)))
        const hitA = sstep(T.hit[0], T.hit[1], sp) * (1 - sstep(2.0, 2.05, sp))
        show(hit.current, hitA)
        pulse(hitRings.current, time, 6, 90, 0.3, 2.2, hitA)
        // tablets in portrait: no room right of the point, so the card stands above it on a short vertical leader
        if (tab && tallNow) placeCard(coordsTag.current, CONTROL.target.x - 90 * kc, CONTROL.target.y - 56 * kc, sp > T.coords[0] + 0.04 && sp < T.coords[3] - 0.08, 'bl')
        else placeCard(coordsTag.current, CONTROL.target.x + 30, CONTROL.target.y - 26, sp > T.coords[0] + 0.04 && sp < T.coords[3] - 0.08, 'bl')
      }

      /* ---------- METHODS ---------- */
      if (aMethods > 0) {
        const up = win(sp, 3.0, 3.3), upE = inOutE(up) // the camera rises after the UAV
        // portrait tablets see half the kit: hold on the ground pair, glide to the air + water pair, hold, glide back;
        // each pair's cards show only while the camera holds on it. Leaving, the camera finds the UAV as it lifts.
        let mFocus: P = METHODS.focus, pairOn = [true, true]
        if (t45Tall) {
          const { a, b, hold, glide } = CH45_PAN, per = 2 * (hold + glide)
          if (ch45At.current < 0) ch45At.current = time - (sp > 3.02 ? hold + glide : 0) // back from CAPTURE: start on the UAV's side
          const q = (time - ch45At.current) % per
          const pan = q < hold ? 0 : q < hold + glide ? inOutE((q - hold) / glide) : q < 2 * hold + glide ? 1 : 1 - inOutE((q - 2 * hold - glide) / glide)
          const x = a + (b - a) * pan
          mFocus = { x: x + (METHODS.drone.x - x) * sstep(3.0, 3.2, sp), y: CH45_FOCUS.methods.tall.y }
          fit('methods', mFocus)
          pairOn = [q > 0.2 && q < hold - 0.45, q > hold + glide + 0.2 && q < 2 * hold + glide - 0.45]
        }
        if (up > 0) push('methods', METHODS.drone, 1 + 0.3 * upE)
        else push('methods', mFocus, 1.14 - 0.14 * easeOut(win(sp, T.methodsIn[0], 2.95)))
        if (methodsClean.current) methodsClean.current.style.opacity = sp >= LIFT && flyDrone.current ? '1' : '0'
        const focusIn = 1 - easeOut(win(sp, T.methodsIn[0], 2.62)) // arrives soft and racks into focus
        if (boxMethods.current) boxMethods.current.style.filter = up > 0 ? blurPx(upE * 6) : focusIn > 0.01 ? blurPx(6 * focusIn) : ''
        const kA = easeOut(win(sp, T.kit[0], T.kit[1]))
        show(kit.current, kA)
        pulse(kitRings.current, time, 0.3, 1, 1, 3.4, 0.75 * kA)
        const M = METHODS
        pulse(wake.current, time, 50, 210, 0.22, 3.4, 0.6 * kA)
        // the four cards arrive one after another: ground, station, air, water
        const on = (i: number) => sp > T.kitTags[0] + i * 0.03 && sp < T.kitTags[2]
        const airLead = LEADS.find((l) => l.card === tagAir), waterLead = LEADS.find((l) => l.card === tagWater)
        if (tab45 && rootEl) {
          // tablets: the cards sit beside or over their kit, below the caption (offsets in screen px, kc → plate px)
          const kc = 1 / (baseN.current.methods?.s || 1)
          const gPin = { x: M.gnss.x, y: M.gnss.y - M.gnss.h + 20 }, sPin = { x: M.station.x, y: M.station.y - M.station.h + 30 }
          const wPin = { x: M.boat.x, y: M.boat.y - M.boat.w * 0.28 }
          if (t45Tall) {
            placeCard(tagGnss.current, gPin.x - 20 * kc, gPin.y - 50 * kc, on(0) && pairOn[0], 'bl')
            placeCard(tagStation.current, sPin.x + 110 * kc, sPin.y - 50 * kc, on(1) && pairOn[0], 'br')
            placeCard(tagAir.current, M.drone.x + 100 * kc, M.drone.y - 30 * kc, on(2) && pairOn[1], 'tl')
            placeCard(tagWater.current, wPin.x + 130 * kc, wPin.y - 40 * kc, on(3) && pairOn[1], 'br')
          } else {
            placeCard(tagGnss.current, gPin.x + 38 * kc, gPin.y - 54 * kc, on(0), 'tl')
            placeCard(tagStation.current, sPin.x + 40 * kc, sPin.y - 54 * kc, on(1), 'tl')
            placeCard(tagAir.current, M.drone.x - 60 * kc, M.drone.y + 58 * kc, on(2), 'tl') // under the UAV: the caption owns the sky
            placeCard(tagWater.current, CH45_BOW.x - 40 * kc, CH45_BOW.y + 36 * kc, on(3), 'tr')
          }
          // landscape: the Air card hangs below the UAV and the Water card sits off the bow, so their pins move there
          if (airLead) airLead.at.y = t45Tall ? M.drone.y - 20 : M.drone.y + 16
          if (waterLead) Object.assign(waterLead.at, t45Tall ? wPin : CH45_BOW)
          const bm = boxMethods.current?.getBoundingClientRect(), cap = ch45Caption(rootEl, 3)
          if (bm) for (const el of [tagGnss.current, tagStation.current, tagAir.current, tagWater.current]) ch45Clear(el, cap, rootEl, M.size.w / bm.width)
        } else {
          placeCard(tagGnss.current, M.gnss.x + 60, M.gnss.y - M.gnss.h - 10, on(0), 'bl')
          placeCard(tagStation.current, M.station.x + 60, M.station.y - M.station.h - 10, on(1), 'bl')
          placeCard(tagAir.current, M.drone.x - 150, M.drone.y - 70, on(2), 'br')
          placeCard(tagWater.current, M.boat.x - 110, M.boat.y - M.boat.w * 0.45, on(3), 'br')
          if (airLead) airLead.at.y = M.drone.y - 20
          if (waterLead) Object.assign(waterLead.at, { x: M.boat.x, y: M.boat.y - M.boat.w * 0.28 })
        }
      } else ch45At.current = -1

      /* ---------- CAPTURE / MODEL ---------- */
      let cineOn = false
      {
        // arrival: a scan line sweeps down the frame revealing the aerial view, the camera settling onto it
        // arrival: the aerial view dissolves in over the rising camera, soft at first, settling onto the UAV
        const ln = captureScan.current
        if (ln && ln.style.opacity !== '0') ln.style.opacity = '0'
        const soft = 1 - easeOut(win(sp, T.captureIn[0], 3.4))
        if (boxAerial.current) boxAerial.current.style.filter = soft > 0.01 && sp < 3.5 ? blurPx(6 * soft) : ''
        if (aAerial > 0) {
          push('aerial', hover, 1.18 - 0.18 * easeOut(win(sp, T.captureIn[0], 3.55)))
          const lidarOn = sp > T.cLidar[0] && sp < (tab45 ? 3.82 : T.cLidar[1])
          const ba = boxAerial.current?.getBoundingClientRect()
          if (tab45 && rootEl && ba) {
            // tablets step 3 → 5 in one long move whose caption shows early (~3.87): the card is gone by then.
            // It hangs under the UAV on a short vertical leader.
            const kc = 1 / (baseN.current.aerial?.s || 1)
            placeCard(cLidar.current, hover.x - 40 * kc, hover.y + 60 * kc, lidarOn)
            ch45Clear(cLidar.current, ch45Caption(rootEl, 4), rootEl, AERIAL.size.w / ba.width)
          } else placeCard(cLidar.current, AERIAL.drone.x + 90, AERIAL.drone.y + 70, lidarOn)
        }
      }
      if (aAerial > 0) {
        // the land slowly turns into its LiDAR twin (kept a little dim: the mapped strips light up on it)
        const blue = sstep(T.blue[0], T.blue[1], sp)
        if (aerialScan.current) { aerialScan.current.style.opacity = blue.toFixed(3); aerialScan.current.style.filter = 'brightness(0.62) saturate(0.9)' }
        // the survey boundary draws itself
        if (bound.current) {
          bound.current.style.strokeDashoffset = (1 - easeOut(win(sp, T.bound[0], T.bound[1]))).toFixed(4)
          bound.current.style.opacity = sstep(T.bound[0], T.bound[0] + 0.02, sp).toFixed(3)
        }
        // survey passes flown back and forth, joined by half-loop turns
        const s = Math.pow(win(sp, T.model[0], T.model[1]), 1.6) // starts in slow motion, ends at full speed
        const f = flightAt(s)
        if (mapped.current) mapped.current.style.clipPath = capturedPolygon(Math.min(0.9999, f.reveal), 0) // never "none": only the parcel lights up
        const [ax0, ay0] = f.e0, [ax1, ay1] = f.e1
        const g = H(f.u, f.v)
        // perspective: the UAV is smaller over the far strips
        const pa = H(f.u, f.v - 0.5 / STRIPS), pb = H(f.u, f.v + 0.5 / STRIPS)
        const scale = Math.min(1.15, Math.max(0.8, 0.55 + Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) / 300))
        // hovering where the photo's drone was → comes alive → glides to the first pass → maps → settles
        const live = sstep(T.live[0], T.live[1], sp)
        const approach = sstep(T.approach[0], T.approach[1], sp)
        const settle = sstep(T.model[1], T.model[1] + 0.08, sp)
        const leave = sstep(5.12, 5.3, sp)
        const hx = hover.x, hy = hover.y - 14 * live
        // at rest it parks: beside the corner on wide screens, just above the parcel (inside the view) on phones
        // (portrait tablets: just inside the end of the last pass, so it stays in the narrower view)
        const park = parcelTall ? H(0.78, -0.35) : parcelT45 ? [g[0] - 30, g[1]] : [g[0] + 40, g[1] - 30]
        let dx = g[0] + (park[0] - g[0]) * settle, dy = g[1] - 110 * scale * (parcelT45 ? 0.8 : 1) + (parcelTall ? (park[1] - g[1]) * settle : -30 * settle)
        dx = hx + (dx - hx) * approach; dy = hy + (dy - hy) * approach
        dx += leave * 300; dy += Math.sin(time * 1.6) * 2.5 * live - leave * 340
        // phones: follow the UAV, then frame the finished parcel (a pure function of sp: no lag at rest)
        aerialPanX.current = dx + (618 - dx) * sstep(T.model[1] - 0.06, T.model[1] + 0.04, sp)
        if (parcelTall) placeCard(modelTag.current, H(0, 1)[0] - 10, H(0, 1)[1] + 95, sp > T.cModel[0] && sp < T.cModel[1]) // phones: under the parcel
        const w = (86 + (120 * scale - 86) * approach) * droneK() // phones and portrait tablets: the parcel is smaller, so is the UAV
        // heading from the path tangent (facing the viewer while hovering), bank from turn rate
        const headingAt = (tt: number) => {
          const c = Math.min(0.996, Math.max(0.004, tt))
          const a = flightAt(c - 0.003), b = flightAt(c + 0.003)
          const qa = H(a.u, a.v), qb = H(b.u, b.v)
          return Math.atan2(-(qb[0] - qa[0]), -(qb[1] - qa[1]) * 1.8)
        }
        const hd0 = headingAt(0)
        const hdRaw = headingAt(s)
        const facing = 0 // hovering: nose away from the viewer, out over the land it is about to map
        const blend = approach // turn from facing to the path heading as it glides in
        const dAng = Math.atan2(Math.sin((s > 0 ? hdRaw : hd0) - facing), Math.cos((s > 0 ? hdRaw : hd0) - facing))
        const hd = facing + dAng * blend
        let turn = headingAt(s + 0.012) - hdRaw
        turn = Math.atan2(Math.sin(turn), Math.cos(turn))
        const bank = Math.max(-0.3, Math.min(0.3, turn * 1.2)) * (1 - settle) * approach
        const flying = f.onPass
        const d3 = drone3d.current, cv = droneCanvas.current
        const droneA = 1 - leave
        if (d3 && cv) {
          const b = boxAerial.current?.getBoundingClientRect()
          if (b) d3.setSize(b.width, b.height, Math.min(deviceTier() === 'phone' ? 1.25 : 1.5, devicePixelRatio || 1))
          // propellers spin up as it comes alive (they idle slowly before)
          d3.render({ x: dx, y: dy, width: w, yaw: hd, bank, pitch: -0.16 * approach * (1 - settle), spin: propAngle.current, alpha: droneA, tilt: AERIAL_TILT })
          cv.style.visibility = droneA > 0.001 && (sp >= LAND || !flyDrone.current) ? 'visible' : 'hidden'
          if (drone.current) drone.current.style.opacity = '0'
        } else if (drone.current) {
          drone.current.style.width = `${(w * 1.9).toFixed(1)}px`
          drone.current.style.transform = `translate(${(dx - w * 0.95).toFixed(1)}px, ${(dy - w * 0.25).toFixed(1)}px) rotate(${((bank * 180) / Math.PI).toFixed(2)}deg)`
          drone.current.style.opacity = droneA.toFixed(3)
        }
        // the ray: drops from the UAV to the ground in slow motion, then rides the pass
        const drop = easeOut(win(sp, CINE.ray[0], CINE.ray[1]))
        const rayA = sstep(CINE.ray[0], CINE.ray[0] + 0.02, sp) * (1 - sstep(4.52, 4.6, sp))
        const bx0 = dx + (ax0 - dx) * drop, by0 = dy + 8 + (ay0 - dy - 8) * drop
        const bx1 = dx + (ax1 - dx) * drop, by1 = dy + 8 + (ay1 - dy - 8) * drop
        const fanA = Math.max(flying ? 0.75 * f.edge : 0, 0.75 * rayA)
        if (fan.current) {
          fan.current.setAttribute('points', `${dx},${dy + 8} ${bx0},${by0} ${bx1},${by1}`)
          fan.current.style.opacity = fanA.toFixed(3)
        }
        if (sweep.current) {
          const l = sweep.current
          l.setAttribute('x1', `${bx0}`); l.setAttribute('y1', `${by0}`); l.setAttribute('x2', `${bx1}`); l.setAttribute('y2', `${by1}`)
          l.style.opacity = Math.max(flying ? 0.95 * f.edge : 0, 0.95 * rayA * sstep(0.6, 1, drop)).toFixed(3)
        }

        // ---- the camera: push in on the UAV, follow its ray to the ground, track it, pull back ----
        const kIn = sstep(CINE.zin[0], CINE.zin[1], sp), kOut = sstep(CINE.zout[0], CINE.zout[1], sp)
        cineOn = kIn > 0 && kOut < 1
        if (cineOn) {
          const bA = boxAerial.current, root = rootRef.current, bn = baseN.current.aerial
          if (bA && root && bn) {
            const W = root.clientWidth, Hh = root.clientHeight
            const toGround = sstep(CINE.ray[0], CINE.ray[1], sp)
            const gx = (ax0 + ax1) / 2, gy = (ay0 + ay1) / 2
            const fx = dx + (dx * 0.45 + gx * 0.55 - dx) * toGround, fy = dy + (dy * 0.45 + gy * 0.55 - dy) * toGround
            const kz = 1 + 2.1 * kIn - 0.55 * sstep(CINE.show[1] - 0.01, T.approach[1], sp) - 0.45 * toGround
            const k = kz + (1 - kz) * kOut
            const cen = kIn * (1 - kOut)
            const S = bn.s * k
            const cx = bn.x + fx * bn.s + (W / 2 - (bn.x + fx * bn.s)) * cen
            // (tablets: a touch lower, so the UAV stays clear of the caption, which is already up, as the camera tips toward the ground)
            const cy = bn.y + fy * bn.s + (Hh * (tab45 ? 0.5 : 0.45) - (bn.y + fy * bn.s)) * cen
            // orbit: the camera circles the UAV, so the land behind slides past (parallax)
            // round to the three-quarter view, hold while the specs are read, then on round
            const e3 = (t: number) => t * t * (3 - 2 * t)
            const orbE = sp < CINE.hold[0] ? HOLD_AT * e3(win(sp, CINE.show[0], CINE.hold[0]))
              : sp < CINE.hold[1] ? HOLD_AT
                : HOLD_AT + (1 - HOLD_AT) * e3(win(sp, CINE.hold[1], CINE.show[1]))
            // (the land slides one way during the orbit and settles back as the camera reframes for the glide)
            const drift = -W * 0.4 * (orbE - sstep(CINE.show[1], T.approach[1], sp))
            const clampX = (v: number) => Math.min(0, Math.max(W - AERIAL.size.w * S, v))
            const tx = clampX(cx - fx * S + drift), txUav = clampX(cx - fx * S) // the UAV stays put in the frame
            const ty = Math.min(0, Math.max(Hh - AERIAL.size.h * S, cy - fy * S))
            bA.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${S.toFixed(5)})`
            // shallow depth of field while it's all about the UAV
            const dof = sstep(4.03, 4.12, sp) * (1 - sstep(CINE.show[1] - 0.02, T.approach[1], sp))
            bA.style.filter = dof > 0.01 ? `${blurPx(4 * dof)} brightness(${(1 - 0.25 * dof).toFixed(3)})`.trim() : ''
            // the UAV itself is drawn sharp in screen space, orbited from above to underneath
            const fd = flyDrone.current, fc = flyCanvas.current
            if (fd && fc) {
              fd.setView(W, Hh)
              fd.setSize(W, Hh, Math.min(deviceTier() === 'phone' ? 1.25 : 1.5, devicePixelRatio || 1))
              // the UAV holds level; the camera goes once round it, rising a little over the top of the arc
              const tilt = AERIAL_TILT + 0.22 * Math.sin(Math.PI * orbE)
              // phones: the parcel-scaled UAV would be a speck in the close-up; while it's the subject it fills ~60% of the
              // width, and settles back to its flying size as the camera follows the ray down
              const phoneCine = deviceTier() === 'phone'
              const showK = kIn * (1 - sstep(CINE.show[1] - 0.01, T.approach[1], sp))
              const uw = w * S * (phoneCine ? 1 + (Math.max(1, (W * 0.6) / (w * S)) - 1) * showK : 1)
              fd.render({ x: txUav + dx * S, y: ty + dy * S, width: uw, yaw: hd + Math.PI * 2 * orbE, bank, pitch: -0.16 * approach * (1 - settle),
                spin: propAngle.current, alpha: droneA, tilt })
              fc.style.visibility = 'visible'
              if (cv) cv.style.visibility = 'hidden'
              // spec callouts while the orbit holds: pin on the part, an elbow, the card
              const specOn = sp > CINE.hold[0] + 0.005 && sp < CINE.hold[1] - 0.012
              const an = specOn ? fd.anchors() : null
              const tall = W / Math.max(1, Hh) < 0.8
              // tablets: each card takes the first free slot round its pin, clear of the UAV, the caption (already up on a
              // stepped tablet), the header and the cards placed before it; once up it stays put
              const ur = uw * 0.5, ux = txUav + dx * S, uy = ty + dy * S
              const avoid45: Box45[] = []
              if (tab45) {
                avoid45.push({ l: ux - ur - 12, t: uy - ur * 0.7 - 12, r: ux + ur + 12, b: uy + ur * 0.7 + 12 })
                const cap = ch45Caption(root, 4)
                if (cap) avoid45.push(grow45(cap, 18))
              }
              SPEC_KEYS.forEach((key, i) => {
                const card = specCards.current[i], g = specLeads.current?.children[i] as SVGGElement | undefined
                const at = an?.[key]
                const on = !!at && specOn
                if (card && card.classList.contains('is-in') !== on) card.classList.toggle('is-in', on)
                if (g && g.classList.contains('is-in') !== on) g.classList.toggle('is-in', on)
                if (!on || !card || !g || !at) { specPos.current[i] = null; return }
                const cw = card.offsetWidth, ch = card.offsetHeight, m = 16
                const off = tall ? 26 : 70
                const [ox0, oy0] = SPEC_OFFSET[key]
                const oy = tall && !tab45 && key === 'gear' ? 5.5 : oy0 // phones: the two lower cards stagger instead of colliding
                let held = specPos.current[i]
                if (!held && tab45) {
                  const view = { l: m, t: Math.max(m + 40, clearTop(root)), r: W - m, b: Hh - 28 }
                  held = specPos.current[i] = ch45Slot(at, cw, ch, [ox0, oy0], t45Tall ? 40 : 56, view, avoid45)
                } else if (!held && phoneCine) {
                  // phones: Airframe above the UAV on the right; Sensor and Deliverables side by side under it
                  // (stacked if the screen is too narrow for both)
                  const top = uy - ur * 0.72 - 16, under = uy + ur * 0.72 + 18
                  const sensorW = specCards.current[1]?.offsetWidth ?? cw
                  const pair = sensorW + cw + 3 * m <= W
                  const y = key === 'rotor' ? Math.max(clearTop(root), top - ch)
                    : key === 'sensor' || pair ? under : under + (specCards.current[1]?.offsetHeight ?? ch) + 10
                  const x = key === 'sensor' ? m : W - m - cw
                  held = specPos.current[i] = { x, y }
                } else if (!held) {
                  let x = at.x + ox0 * off - (ox0 < 0 ? cw : 0), y = at.y + oy * off - (oy < 0 ? ch : 0)
                  x = Math.min(W - m - cw, Math.max(m, x)); y = Math.min(Hh - m - ch, Math.max(m + 40, clearTop(root), y))
                  held = specPos.current[i] = { x, y }
                }
                const { x, y } = held
                if (tab45) avoid45.push({ l: x - 14, t: y - 14, r: x + cw + 14, b: y + ch + 14 })
                card.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
                // the leader joins the card's side nearer the pin (on tablets the slot may be on the other side)
                const ox = tab45 ? (x + cw / 2 >= at.x ? 1 : -1) : ox0
                const px = ox < 0 ? x + cw : x, py = y + Math.min(22, ch / 2)
                const line = g.firstElementChild as SVGPolylineElement
                line.setAttribute('points', `${at.x.toFixed(1)},${at.y.toFixed(1)} ${(px - Math.sign(ox) * 18).toFixed(1)},${py.toFixed(1)} ${px.toFixed(1)},${py.toFixed(1)}`)
                for (const dot of g.querySelectorAll('circle')) { dot.setAttribute('cx', at.x.toFixed(1)); dot.setAttribute('cy', at.y.toFixed(1)) }
              })
            }
          }
        }
        if (!cineOn) {
          specCards.current.forEach((c) => c?.classList.contains('is-in') && c.classList.remove('is-in'))
          specPos.current = []
          for (const g of specLeads.current?.children ?? []) if (g.classList.contains('is-in')) g.classList.remove('is-in')
          if (sp > 3.9 && sp < 4.8 && boxAerial.current?.style.filter) boxAerial.current.style.filter = ''
        }
        const tagA = sstep(T.approach[0], T.approach[1], sp) * (1 - sstep(4.94, 4.99, sp)) * (cineOn ? kOut : 1)
        const tagLeft = dx > (parcelT45 ? CH45_FOCUS.aerial.tall.x : AERIAL.focus.x + 120) // the side of the view with room
        placeTag(droneTag.current, dx + (tagLeft ? -70 : 70), dy - 70, tagA, tagLeft)
        const line = droneTag.current?.lastElementChild
        if (line) line.textContent = s >= 1 ? 'Parcel mapped' : `LiDAR · pass ${f.k + 1} / ${STRIPS}`
        const [mx, my] = H(0.5, 0)
        const modelOn = sp > T.cModel[0] && sp < T.cModel[1]
        if (tab45 && rootEl) {
          // tablets: landscape puts the card right of the parcel (the caption owns the top left), portrait over its left end
          const kc = 1 / (baseN.current.aerial?.s || 1)
          if (parcelT45) placeCard(modelTag.current, H(0, 0)[0], H(0, 0)[1] - 30 * kc, modelOn, 'bl')
          else placeCard(modelTag.current, H(1, 0)[0] - 60 * kc, H(1, 0)[1] - 24 * kc, modelOn, 'bl')
          const ba = boxAerial.current?.getBoundingClientRect()
          if (ba && !cineOn) ch45Clear(modelTag.current, ch45Caption(rootEl, 4), rootEl, AERIAL.size.w / ba.width)
        } else if (!parcelTall) placeCard(modelTag.current, mx - 120, my - 50, modelOn, 'bl')
      }

      /* ---------- METHODS → CAPTURE: the photo's UAV lifts off and flies to the aerial scene ---------- */
      {
        const fd = flyDrone.current, fc = flyCanvas.current, root0 = rootRef.current
        const on = !!fd && !!fc && !!root0 && rd.methods && sp >= LIFT && sp < LAND
        if (fc && !cineOn) fc.style.visibility = on ? 'visible' : 'hidden'
        if (on && fd && fc && root0) {
          const R = root0.getBoundingClientRect()
          fd.setView(R.width, R.height)
          fd.setSize(R.width, R.height, Math.min(deviceTier() === 'phone' ? 1.25 : 1.5, devicePixelRatio || 1))
          const bm = boxMethods.current!.getBoundingClientRect(), km = bm.width / METHODS.size.w
          const ba = boxAerial.current!.getBoundingClientRect(), ka = ba.width / AERIAL.size.w
          const sx = bm.left - R.left + METHODS.drone.x * km, sy = bm.top - R.top + METHODS.drone.y * km, sw = METHODS.drone.w * 0.78 * km
          const ex = ba.left - R.left + hover.x * ka, ey = ba.top - R.top + hover.y * ka, ew = 86 * ka * droneK()
          // one continuous glide: a gentle climb off the spot, then an eased move to where the aerial UAV hovers
          const t = win(sp, LIFT, LAND), e = t * t * t * (t * (t * 6 - 15) + 10), arc = Math.sin(Math.PI * t)
          const climb = sstep(0, 0.35, t) * (1 - e) * sw * 0.25
          const x = sx + (ex - sx) * e, y = sy + (ey - sy) * e - climb - arc * R.height * 0.03
          const dir = Math.sign(ex - sx) || 1
          // eye level like the photo's drone at lift-off, easing to the aerial scene's slightly-above view as it arrives;
          // only a slight lean into the move, as a real aircraft does
          fd.render({ x, y, width: sw * Math.pow(ew / sw, e), yaw: Math.PI * (1 - e), // turns to face out over the land as it goes
            bank: -dir * 0.08 * arc, pitch: -0.12 * arc, spin: propAngle.current, alpha: 1, tilt: 0.08 + (AERIAL_TILT - 0.08) * e })
        }
      }

      // on load the opening plate may still be decoding: keep the WebGL scene out of sight (the poster, which
      // is the same image, shows through) rather than flash a different world first
      // keep every card and label fully on screen, whatever the viewport crops off the plate
      const root = rootRef.current
      if (root) {
        const R = root.getBoundingClientRect(), m = 16
        // phones: keep cards out of the header and the caption band at the bottom
        // (tablets have no caption band: their cards only keep clear of the small print at the bottom)
        const tabTier = isTabletTier()
        const tall = !tabTier && R.width / Math.max(1, R.height) < 0.8
        // a host page's fixed header over the hero sets --sh-clear-top: cards stay below it
        const mTop = Math.max(tall ? 96 : m, clearTop(root)), mBot = tall ? R.height * 0.4 : tabTier ? 80 : m
        for (const el of root.querySelectorAll<HTMLElement>('.pl-card.is-in:not(.pl-card-fixed), .pl-tag')) {
          // only in the scene on screen, and cards even while their fade-in delay is running
          const scene = el.closest<HTMLElement>('.pl-scene')
          if (!scene || scene.style.visibility !== 'visible') continue
          if (el.classList.contains('pl-tag') && el.style.visibility === 'hidden') continue
          const r = el.getBoundingClientRect()
          const dx = r.left < R.left + m ? R.left + m - r.left : r.right > R.right - m ? R.right - m - r.right : 0
          const dy = r.top < R.top + mTop ? R.top + mTop - r.top : r.bottom > R.bottom - mBot ? R.bottom - mBot - r.bottom : 0
          if (dx || dy) {
            const k = parseFloat(getComputedStyle(el).getPropertyValue('--pl-k')) || 1 // plate px per screen px
            el.style.transform += ` translate(${(dx * k).toFixed(1)}px, ${(dy * k).toFixed(1)}px)`
          }
        }
      }
      // leaders: pin on the target → one elbow → the card's nearest side (drawn after the clamp above)
      const layer = leadLayer.current
      if (layer && root) {
        const R = root.getBoundingClientRect()
        LEADS.forEach((l, i) => {
          const g = layer.children[i] as SVGGElement | undefined
          const card = l.card.current
          if (!g || !card) return
          const sc = scene[l.scene].current, bx = box[l.scene].current
          const on = !!sc && sc.style.visibility === 'visible' && card.classList.contains('is-in') && getComputedStyle(card).display !== 'none'
          if (g.classList.contains('is-in') !== on) g.classList.toggle('is-in', on)
          g.style.opacity = sc ? sc.style.opacity || '0' : '0'
          if (!on || !bx) return
          g.style.setProperty('--d', card.style.getPropertyValue('--d') || '0s')
          const b = bx.getBoundingClientRect(), k = b.width / SCENES[l.scene].size.w
          const ax = b.left + l.at.x * k - R.left, ay = b.top + l.at.y * k - R.top
          // the thing a card describes is cropped out of view (phones): the card and its leader step aside
          const out = ax < 8 || ax > R.width - 8 || ay < 8 || ay > R.height - 8
          const cr0 = card.getBoundingClientRect()
          const under = ax + R.left >= cr0.left - 6 && ax + R.left <= cr0.right + 6 && ay + R.top >= cr0.top - 6 && ay + R.top <= cr0.bottom + 6
          card.style.visibility = out ? 'hidden' : ''
          if (out) { g.classList.remove('is-in'); return }
          if (under) { g.classList.remove('is-in'); return }
          const c = card.getBoundingClientRect()
          const cl = c.left - R.left, cr = c.right - R.left, ct = c.top - R.top, cb = c.bottom - R.top
          // right-angle route: straight up/down from the pin, then straight across into the card's side
          // (or straight into its top/bottom edge when the pin sits under or over it)
          let pts: string
          if (ax >= cl + 12 && ax <= cr - 12) pts = `${ax},${ay} ${ax},${ay > cb ? cb : ct}`
          else {
            const sx = ax < cl ? cl : cr
            const yj = Math.min(cb - 16, Math.max(ct + 16, ay)) // join height on the card's side
            pts = `${ax},${ay} ${ax},${yj} ${sx},${yj}`
          }
          const line = g.firstElementChild as SVGPolylineElement
          line.setAttribute('points', pts)
          for (const dot of g.querySelectorAll('circle')) { dot.setAttribute('cx', ax.toFixed(1)); dot.setAttribute('cy', ay.toFixed(1)) }
        })
      }
      const waiting = !rd.field && sp < T.fieldOut[1] ? 1 : 0
      return Math.max(aField, aControl, aMethods, aAerial, aCapture, waiting, voidA)
    },
  }), [enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!enabled) return null
  const M = METHODS
  const boxStyle = (s: { w: number; h: number }) => ({ width: s.w, height: s.h })
  // rings centred on each tripod's footprint and spreading out past its feet across the rock
  const kitRingItems: [P, number][] = [[{ x: 186, y: 846 }, 170], [{ x: 630, y: 796 }, 230]]
  // tripod legs, head → foot: the rings pass behind them
  const LEGS_2D: [number, number, number, number][] = [
    [175, 665, 97, 815], [174, 665, 174, 832], [192, 665, 275, 866],
    [618, 590, 540, 776], [630, 590, 635, 806], [645, 590, 720, 794],
  ]
  return (
    <div ref={rootRef} className="pl-root" aria-hidden="true">
      <div ref={voidRef} className="pl-scene pl-void" />
      {/* the field plate as a depth cloud (transitions only), under the plate it replaces */}
      <div ref={fCloudScene} className="pl-scene">
        <div ref={fCloudBox} className="pl-box" style={boxStyle(FIELD.size)}>
          <canvas ref={fCloudCanvas} className="pl-img" />
        </div>
      </div>
      <Card ref={cHeritage} {...CARDS.heritage} className="pl-card-fixed" delay={0.3} />
      {/* FIELD */}
      <div ref={sceneField} className="pl-scene">
        <div ref={boxField} className="pl-box" style={boxStyle(FIELD.size)}>
          <img className="pl-img" src="/plates/field_photo.webp" alt="" decoding="async" />
          <img ref={fieldScan} className="pl-img pl-mask" src="/plates/field_scan.webp" alt="" decoding="async" />
          <img ref={fog} className="pl-img pl-fog" src="/plates/field_fog.webp" alt="" decoding="async" />
          <svg className="pl-svg" viewBox={`0 0 ${FIELD.size.w} ${FIELD.size.h}`}>
            <defs><radialGradient id="pl-contact"><stop offset="0" stopColor="#000" stopOpacity="0.75" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient></defs>
          </svg>
          <Card ref={cStation} {...CARDS.station} delay={0.9} />
        </div>
      </div>

      {/* the control plate as a depth cloud (transitions only) */}
      <div ref={cloudScene} className="pl-scene">
        <div ref={cloudBox} className="pl-box" style={boxStyle(CONTROL.size)}>
          <canvas ref={cloudCanvas} className="pl-img" />
        </div>
      </div>

      {/* CONTROL + MEASURE */}
      <div ref={sceneControl} className="pl-scene">
        <div ref={boxControl} className="pl-box" style={boxStyle(CONTROL.size)}>
          <img className="pl-img" data-src="/plates/control_photo.webp" alt="" decoding="async" />
          <img ref={controlScan} className="pl-img pl-mask" data-src="/plates/control_scan.webp" alt="" decoding="async" />
          <svg className="pl-svg" viewBox={`0 0 ${CONTROL.size.w} ${CONTROL.size.h}`}>
            <g ref={beacon} style={{ visibility: 'hidden' }}>
              <mask id="pl-ridge" maskUnits="userSpaceOnUse" x={0} y={0} width={CONTROL.size.w} height={CONTROL.size.h}>
                {/* only the hillside: the rings never draw into the sky above the ridge */}
                <polygon points="1440,660 1560,626 1660,592 1760,572 1840,542 1900,522 1980,508 2560,480 2560,1440 1440,1440" fill="#fff" />
              </mask>
              <g mask="url(#pl-ridge)"><Rings ref={beaconRings} at={CONTROL.hill} color="#ff8a3d" width={2.4} /></g>
              <line x1={CONTROL.hill.x} y1={CONTROL.hill.y} x2={CONTROL.hill.x} y2={CONTROL.hill.y} stroke="#ff9a55" strokeWidth={3} style={{ filter: 'drop-shadow(0 0 6px #ff8a3d)' }} />
              <circle cx={CONTROL.hill.x} cy={CONTROL.hill.y} r={9} fill="#ffb27a" style={{ filter: 'drop-shadow(0 0 10px #ff8a3d)' }} />
            </g>
            <line ref={beam} x1={CONTROL.scope.x} y1={CONTROL.scope.y} x2={CONTROL.target.x} y2={CONTROL.target.y}
              stroke="#8fd8ff" strokeWidth={3.5} strokeLinecap="round" style={{ visibility: 'hidden', filter: 'drop-shadow(0 0 8px #1686e0) drop-shadow(0 0 3px #bfeaff)' }} />
            <g ref={hit} style={{ visibility: 'hidden' }}>
              <mask id="pl-ridge2" maskUnits="userSpaceOnUse" x={0} y={0} width={CONTROL.size.w} height={CONTROL.size.h}>
                <polygon points="1000,760 1080,745 1120,735 1160,722 1200,715 1240,705 1280,700 1320,708 1360,690 1440,676 1440,1440 1000,1440" fill="#fff" />
              </mask>
              <g mask="url(#pl-ridge2)"><Rings ref={hitRings} at={CONTROL.target} color="#7fd0ff" width={2} /></g>
              <circle cx={CONTROL.target.x} cy={CONTROL.target.y} r={7} fill="#e6f7ff" style={{ filter: 'drop-shadow(0 0 10px #5cc0f5)' }} />
            </g>
          </svg>
          <img ref={ctrlInst} className="pl-cut" data-src="/plates/control_instrument.webp" alt="" decoding="async"
            style={{ left: CONTROL.cut.x, top: CONTROL.cut.y, width: CONTROL.cut.w, height: CONTROL.cut.h, filter: 'none', visibility: 'hidden' }} />
          <Card ref={beaconTag} {...CARDS.control} />
          <Card ref={coordsTag} title="Observed point" kicker="Scene coordinates" rows={coords.length ? coords : ['N 5 652 882.17', 'E 414 913.84', 'Z 466.69']} accent="#7fd0ff" className="pl-card-coords" />
          <Card ref={cLicensed} {...CARDS.licensed} delay={0.7} className="is-secondary" />
          <Card ref={cObserve} {...CARDS.observe} accent="#7fd0ff" className="is-secondary" />
        </div>
      </div>

      {/* METHODS */}
      <div ref={sceneMethods} className="pl-scene">
        <div ref={boxMethods} className="pl-box" style={boxStyle(METHODS.size)}>
          <img className="pl-img" data-src="/plates/methods_photo.webp" alt="" decoding="async" />
          <img ref={methodsClean} className="pl-img" data-src="/plates/methods_photo_clean.webp" alt="" decoding="async" style={{ opacity: 0 }} />
          <div ref={kit} style={{ position: 'absolute', inset: 0, visibility: 'hidden' }}>
            <svg className="pl-svg" viewBox={`0 0 ${M.size.w} ${M.size.h}`}>
              <mask id="pl-legs" maskUnits="userSpaceOnUse" x={0} y={0} width={M.size.w} height={M.size.h}>
                <rect width={M.size.w} height={M.size.h} fill="#fff" />
                {LEGS_2D.map(([x1, y1, x2, y2], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#000" strokeWidth={15} strokeLinecap="round" />)}
              </mask>
              <g ref={kitRings} mask="url(#pl-legs)">
                {/* rings drawn in unit space and scaled per item, so one pulse drives all of them */}
                {kitRingItems.map(([p, R], i) => (
                  <g key={i} transform={`translate(${p.x} ${p.y}) scale(${R} ${R * 0.22})`}>
                    {[0, 1, 2].map((j) => <ellipse key={j} data-p="" cx={0} cy={0} rx={1} ry={1} fill="none" stroke="#5cc0f5" strokeWidth={2.2} vectorEffect="non-scaling-stroke" />)}
                  </g>
                ))}
              </g>
              {/* wake: rings spread across the water from the waterline; the hull hides the part behind it */}
              <mask id="pl-hull" maskUnits="userSpaceOnUse" x={0} y={0} width={M.size.w} height={M.size.h}>
                <rect width={M.size.w} height={M.size.h} fill="#fff" />
                <polygon points="1236,672 1252,640 1300,612 1335,618 1382,660 1442,698 1434,726 1400,742 1300,740 1244,708" fill="#000" />
              </mask>
              <g mask="url(#pl-hull)">
                <Rings ref={wake} at={{ x: 1336, y: 736 }} n={3} color="#5cc0f5" width={2} />
              </g>
            </svg>
          </div>
          <Card ref={tagGnss} {...CARDS.gnss} className="pl-ch45" />
          <Card ref={tagStation} {...CARDS.robotic} delay={0.35} className="pl-ch45" />
          <Card ref={tagAir} {...CARDS.air} delay={0.7} className="pl-ch45" />
          <Card ref={tagWater} {...CARDS.water} delay={1.05} className="pl-ch45" />
        </div>
      </div>

      {/* CAPTURE + MODEL: the aerial photo turns to LiDAR and the UAV maps the parcel */}
      <div ref={sceneAerial} className="pl-scene">
        <div ref={boxAerial} className="pl-box" style={boxStyle(AERIAL.size)}>
          <img className="pl-img" data-src="/plates/aerial_photo_clean.webp" alt="" decoding="async" />
          <img ref={aerialScan} className="pl-img" data-src="/plates/aerial_scan_clean.webp" alt="" decoding="async" style={{ opacity: 0 }} />
          <img ref={mapped} className="pl-img pl-mapped" data-src="/plates/aerial_scan_clean.webp" alt="" decoding="async" style={{ clipPath: EMPTY }} />
          <svg className="pl-svg" viewBox={`0 0 ${AERIAL.size.w} ${AERIAL.size.h}`}>
            <defs>
              <linearGradient id="pl-beam" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#e6f7ff" stopOpacity="0.8" />
                <stop offset="1" stopColor="#5cc0f5" stopOpacity="0.28" />
              </linearGradient>
            </defs>
            <polygon ref={bound} points="330,520 1000,548 1100,872 110,822" pathLength={1} fill="none" stroke="#ff8a3d" strokeWidth={3} strokeLinejoin="round"
              style={{ strokeDasharray: 1, strokeDashoffset: 1, opacity: 0, filter: 'drop-shadow(0 0 6px rgba(255,138,61,0.7))' }} />
            <polygon ref={fan} points="0,0 0,0 0,0" fill="url(#pl-beam)" style={{ mixBlendMode: 'screen', opacity: 0 }} />
            <line ref={sweep} stroke="#f2fbff" strokeWidth={4} strokeLinecap="round" style={{ opacity: 0, filter: 'drop-shadow(0 0 8px #5cc0f5) drop-shadow(0 0 3px #bfeaff)' }} />
          </svg>
          <img ref={drone} className="pl-cut pl-drone" data-src="/plates/drone.webp" alt="" decoding="async" />
          <canvas ref={droneCanvas} className="pl-img" style={{ visibility: 'hidden', pointerEvents: 'none' }} />
          <Tag ref={droneTag} lines={['Air', 'LiDAR']} />
          <Card ref={cLidar} {...CARDS.lidar} className="pl-ch45" />
          <Card ref={modelTag} {...CARDS.model} className="pl-ch45" />
        </div>
      </div>
      <div ref={captureScan} className="pl-scanline" />
      <div ref={wipeLine} className="pl-wipeline" />
      <canvas ref={flyCanvas} className="pl-img" style={{ visibility: 'hidden', pointerEvents: 'none', zIndex: 5 }} />
      {/* the UAV's spec callouts (screen space) */}
      <svg ref={specLeads} className="pl-leads pl-spec-leads">
        {SPEC_KEYS.map((k) => (
          <g key={k} className="pl-lead">
            <polyline points="0,0 0,0" pathLength={1} />
            <circle className="pl-lead-ring" r={4} />
            <circle r={3.6} />
          </g>
        ))}
      </svg>
      {SPECS.map((c, i) => <Card key={i} ref={(el) => { specCards.current[i] = el }} {...c} className="pl-card-spec" delay={0.15 + i * 0.35} />)}
      {/* leaders from each card to what it describes (screen space, above every scene) */}
      <svg ref={leadLayer} className="pl-leads">
        {LEADS.map((_, i) => (
          <g key={i} className="pl-lead">
            <polyline points="0,0 0,0" pathLength={1} />
            <circle className="pl-lead-ring" r={4} />
            <circle r={3.6} />
          </g>
        ))}
      </svg>
    </div>
  )
})

export default PlateStage
