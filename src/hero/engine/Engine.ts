/**
 * HeroEngine — owns the WebGL renderer, the scene graph and the render loop.
 *
 *  apply(p)   pure: progress → every spatial/narrative state. No allocation, no clock.
 *  loop       ambient motion only (rotor spin, hover bob, water shimmer, pulses, drift), adaptive cap.
 *  seek(p)    synchronous apply + render, for ?frame= review and reduced motion.
 */
import * as THREE from 'three'
import {
  CONTROL_POINT, HEAD_Y, KEYS_TABLET_TALL, KEYS_TABLET_WIDE, KEYS_TALL, KEYS_WIDE, PHASES, TARGET_POINT, BOUNDARY,
  bell, chapterAt, chapterPos, effects, newFX, solveCamera, sstep, type CamState, type FX, type Key,
} from './choreo'
import { GLOBE_CENTER, NORTH_SITES, OFFICES, R, SITE, groundToLatLon, latLonToWorld, toUTM, type UTM } from './geo'
import { POND } from './terrainField'
import { deviceTier } from '../device'
import { buildLandMask, type LandMask } from './landMask'
import { buildTerrain, type Terrain } from './terrain'
import { buildAnchorRings, buildTerrainLines, type TerrainLines } from './terrainLines'
import { buildSky } from './sky'
import { buildGlobe, buildNetwork, GLOBE_SINK } from './globe'
import { buildScanPatch, type ScanPatch } from './scanPatch'
import { buildInstrument, makeEnvironment, makeKit, type Instrument } from './instrument'
import { buildRipples, buildSwath } from './overlays'
import { buildCase, buildDrone, buildGnss, buildUsv, GNSS_XZ } from './sensors'
import { dronePose, newPose, HOVER, LEGS, SWATH_HALF } from './flight'
import { buildMarkers } from './lines'
import { buildCaptureLayer, buildControlPoint, buildMeasurement, buildModel, buildPortal, buildSetupRing, buildWater } from './site'

export type Quality = 'high' | 'mid' | 'low'

type Pt = { x: number; y: number; a: number }
export type FrameState = {
  p: number
  sp: number
  chapter: number
  phase: string
  alt: number
  /** scene labels: 0 control point, 1 measured point, 2 GNSS, 3 total station, 4 UAV, 5 boat, 6.. contour values */
  tags: Pt[]
  regions: Pt[]
  offices: Pt[]
  /** REACH: the northern project sites */
  sites: Pt[]
  /** the survey site on the planet (where the aerial photo lands in CAPTURE → REGION) */
  site: Pt
}

export type EngineOptions = {
  quality: Quality
  frozenTime?: number | null // fixed ambient clock (review frames, reduced motion)
  onFrame?: (s: FrameState) => void
  onFirstFrame?: () => void
}

const DENSITY: Record<Quality, number> = { high: 0.72, mid: 0.45, low: 0.24 }
const MASK_W: Record<Quality, number> = { high: 2048, mid: 2048, low: 1024 }
const CAPTURE_SPACING: Record<Quality, number> = { high: 1.4, mid: 1.8, low: 2.4 }

/* scratch (module-level so the progress function never allocates) */
const _v = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _v3 = new THREE.Vector3()
const _ndc = new THREE.Vector2()
const _lightDir = new THREE.Vector3()

const yawTo = (p: THREE.Vector3) => Math.atan2(p.x, p.z)
const pitchTo = (p: THREE.Vector3, y: number) => Math.atan2(p.y + y - HEAD_Y, Math.hypot(p.x, p.z))
/** shortest-way angle interpolation */
const lerpAngle = (a: number, b: number, t: number) => a + ((((b - a) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI) * t

export class HeroEngine {
  readonly canvas: HTMLCanvasElement
  /** static label texts the DOM layer needs (measured coordinates, contour values) */
  readonly coordsText: string[]
  readonly contourTexts: string[]
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(38, 1, 0.05, 1e7)
  private keys: Key[] = KEYS_WIDE
  private portrait = false
  private tablet = false
  /** the phone composition (caption band below, small markers); a portrait tablet keeps its caption on top */
  private get phoneTall() { return this.portrait && !this.tablet }

  private mask: LandMask
  private terrain: Terrain
  private sky: ReturnType<typeof buildSky>
  private globe: ReturnType<typeof buildGlobe>
  private net: ReturnType<typeof buildNetwork>
  private patch: ScanPatch
  private kit = makeKit()
  private kitFade = makeKit() // the crew's other kit fades in for METHODS
  private fadeMats: THREE.Material[] = []
  private env: THREE.Texture
  private inst: Instrument
  private ground = new THREE.Group()
  private gnss: ReturnType<typeof buildGnss>
  private drone: ReturnType<typeof buildDrone>
  private droneCase: ReturnType<typeof buildCase>
  private usv: ReturnType<typeof buildUsv>
  private water: ReturnType<typeof buildWater>
  private swath: ReturnType<typeof buildSwath>
  private droneHalo: ReturnType<typeof buildMarkers>
  private setup: ReturnType<typeof buildSetupRing>
  private lines: TerrainLines
  private controlRings = buildAnchorRings(CONTROL_POINT, '#ff8a3d')
  private targetRings = buildAnchorRings(TARGET_POINT, '#7fd0ff', 30, 14)
  private lineGround: boolean
  private portal: ReturnType<typeof buildPortal>
  private waves = buildRipples()
  private control: ReturnType<typeof buildControlPoint>
  private measure: ReturnType<typeof buildMeasurement>
  private capture: ReturnType<typeof buildCaptureLayer>
  private model: ReturnType<typeof buildModel>
  private pose = newPose()
  private regionAnchors = [latLonToWorld(54.5, -125), latLonToWorld(63.4, -135.5), latLonToWorld(64.2, -119.5), latLonToWorld(66.5, -96)]

  private yawCP = yawTo(CONTROL_POINT)
  private yawT = yawTo(TARGET_POINT)
  private pitchCP = pitchTo(CONTROL_POINT, 0.3)
  private pitchT = pitchTo(TARGET_POINT, 0.25)

  private cam: CamState = { alt: 0, dist: 0, planet: 0 }
  private fx: FX = newFX()
  readonly state: FrameState

  /* progress + interaction */
  private pTarget = 0
  private pCur = 0
  private orbit = 0
  private orbitVel = 0
  private dragging = false
  private lastPoke = -1e9

  /* loop */
  private raf = 0
  private running = false
  private visible = true
  private pageVisible = true
  private time = 0
  private lastNow = 0
  private acc = 0
  private frozenTime: number | null
  private cssW = 1
  private cssH = 1

  /* quality governor */
  private maxDpr: number
  private minDpr: number
  private dprScale = 1
  private govFrames = 0
  private govTime = 0
  private govGood = 0

  private onFrame?: (s: FrameState) => void
  private disposed = false

  constructor(private host: HTMLElement, opts: EngineOptions) {
    this.onFrame = opts.onFrame
    this.frozenTime = opts.frozenTime ?? null
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'sh-canvas'
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: this.frozenTime !== null, // lets review tooling read the canvas
    })
    this.renderer.setClearColor(0x05080d, 1)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.localClippingEnabled = true
    const coarse = matchMedia('(pointer: coarse)').matches
    this.maxDpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 1.75)
    this.minDpr = this.maxDpr >= 1.5 ? 1 : Math.max(0.85, this.maxDpr * 0.85)
    host.appendChild(this.canvas)

    /* ---- world ---- */
    this.mask = buildLandMask(MASK_W[opts.quality])
    this.terrain = buildTerrain(DENSITY[opts.quality], this.mask.isLand)
    // the ground is the point cloud; the scan-line ground is an opt-in experiment (?ground=lines)
    this.lineGround = new URLSearchParams(location.search).get('ground') === 'lines'
    {
      const u = this.terrain.material.uniforms
      this.lines = buildTerrainLines({ uTime: u.uTime, uFlow: u.uFlow, uFocus: u.uFocus, uFog: u.uFog, uFogDensity: u.uFogDensity,
        uFogColor: u.uFogColor, uRing: u.uRing, uRingCol: u.uRingCol, uPond: u.uPond })
    }
    this.sky = buildSky()
    this.globe = buildGlobe(this.mask.texture)
    this.net = buildNetwork()
    this.patch = buildScanPatch()
    this.env = makeEnvironment(this.renderer)
    this.scene.environment = this.env

    /* ---- the total station, its display showing the observation to the target ---- */
    const tH = Math.hypot(TARGET_POINT.x, TARGET_POINT.z), tV = TARGET_POINT.y + 0.25 - HEAD_Y
    const sd = Math.hypot(tH, tV)
    const dms = (d: number) => `${Math.floor(d)}°${String(Math.floor((d % 1) * 60)).padStart(2, '0')}'${String(Math.floor((((d % 1) * 60) % 1) * 60)).padStart(2, '0')}"`
    const ha = ((this.yawT * 180) / Math.PI + 540) % 360
    const va = 90 - (Math.atan2(tV, tH) * 180) / Math.PI
    this.inst = buildInstrument(this.kit, [`SD ${sd.toFixed(3)} m`, `HA ${dms(ha)}`, `VA ${dms(va)}`])

    /* ---- the measured point's real coordinates (for the MEASURE label) ---- */
    const ll: [number, number] = [0, 0]
    groundToLatLon(TARGET_POINT.x, TARGET_POINT.z, ll)
    const utm: UTM = { zone: 0, band: '', e: 0, n: 0 }
    toUTM(ll[0], ll[1], utm)
    const g3 = (v: number) => { const [i, f] = v.toFixed(2).split('.'); return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}.${f}` }
    this.coordsText = [`N ${g3(utm.n)}`, `E ${g3(utm.e)}`, `Z ${(SITE.elev + TARGET_POINT.y).toFixed(2)}`]

    /* ---- the crew's other kit (fades in for METHODS) ---- */
    this.gnss = buildGnss(this.kitFade)
    this.drone = buildDrone(this.kitFade)
    this.droneCase = buildCase(this.kitFade)
    this.usv = buildUsv(this.kitFade, new THREE.Plane(new THREE.Vector3(0, 1, 0), -(POND.level - 0.005)))
    const fade = new Set<THREE.Material>()
    for (const g of [this.gnss.root, this.drone.root, this.droneCase.root, this.usv.root]) {
      g.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined
        if (m && m !== this.drone.discMat) fade.add(m)
      })
    }
    fade.forEach((m) => { m.transparent = true })
    this.fadeMats = [...fade]

    /* ---- the survey ---- */
    this.water = buildWater()
    this.swath = buildSwath()
    this.droneHalo = buildMarkers(new Float32Array(3), { size: 40, color: '#ffffff', ring: 1 })
    this.setup = buildSetupRing()
    this.portal = buildPortal()
    this.control = buildControlPoint()
    this.measure = buildMeasurement()
    this.capture = buildCaptureLayer(CAPTURE_SPACING[opts.quality])
    this.model = buildModel()
    this.contourTexts = this.model.labels.map((l) => l.text)

    const tu = this.terrain.material.uniforms
    ;(tu.uQuad.value as THREE.Vector2[]).forEach((v, i) => v.set(BOUNDARY[i][0], BOUNDARY[i][1]))
    ;(tu.uLegs.value as THREE.Vector4[]).forEach((v, i) => v.set(...LEGS[i]))
    tu.uSwath.value = SWATH_HALF
    ;(tu.uRingCol.value as THREE.Color[])[1].set('#ff9a55') // the control point keeps the instrument's orange
    const cu = this.capture.material.uniforms
    ;(cu.uLegs.value as THREE.Vector4[]).forEach((v, i) => v.set(...LEGS[i]))
    cu.uSwath.value = SWATH_HALF

    /* ---- lights for the hardware (points and overlays are unlit) ---- */
    const key = new THREE.DirectionalLight(0xfff1e0, 2.4); key.position.set(-3, 4, 3)
    const rim = new THREE.DirectionalLight(0x9fd0ff, 1.8); rim.position.set(3, 2.5, -3)
    const fill = new THREE.HemisphereLight(0x8fb0cc, 0x1a1512, 0.6)
    this.scene.add(key, rim, fill)

    this.ground.add(
      this.inst.root, this.gnss.root, this.drone.root, this.droneCase.root, this.usv.root,
      this.water.points, this.swath.mesh, this.swath.line.mesh, this.droneHalo.points,
      this.setup.ring.mesh, this.setup.mark.points, this.portal.mesh, this.waves.mesh,
      this.control.marker.points, this.control.stem.mesh,
      this.measure.beam.mesh, this.measure.hit.points,
      this.capture.points, this.model.minorLines.mesh, this.model.majorLines.mesh,
      this.model.boundaryData.mesh, this.model.boundaryLegal.mesh,
    )
    this.scene.add(this.patch.points)
    this.scene.add(this.sky.mesh, this.globe.mesh, this.terrain.points, this.lines.depth, this.lines.lines, this.controlRings.lines, this.targetRings.lines, this.ground,
      this.net.arcLines.mesh, this.net.offices.points, this.net.siteMarker.points, this.net.projects.points)

    this.state = {
      p: 0, sp: 0, chapter: 0, phase: PHASES[0], alt: 0,
      tags: Array.from({ length: 6 + this.model.labels.length }, () => ({ x: 0, y: 0, a: 0 })),
      regions: this.regionAnchors.map(() => ({ x: 0, y: 0, a: 0 })),
      offices: OFFICES.map(() => ({ x: 0, y: 0, a: 0 })),
      sites: NORTH_SITES.map(() => ({ x: 0, y: 0, a: 0 })),
      site: { x: 0, y: 0, a: 0 },
    }

    /* ---- settled first frame, even in a hidden tab ---- */
    this.resize()
    if (this.frozenTime !== null) { this.time = this.frozenTime; this.ambient(0) } // shaders get the frozen clock too
    this.apply(this.pCur)
    this.render()
    opts.onFirstFrame?.()
    this.lastNow = performance.now()
  }

  /* ================= public API ================= */

  setPortrait(portrait: boolean) {
    const tablet = deviceTier() === 'tablet'
    if (portrait === this.portrait && tablet === this.tablet) return
    this.portrait = portrait
    this.tablet = tablet
    this.keys = tablet ? (portrait ? KEYS_TABLET_TALL : KEYS_TABLET_WIDE) : portrait ? KEYS_TALL : KEYS_WIDE
    // phones: globe markers are small, so neighbouring offices don't merge into one blob
    this.net.offices.material.uniforms.uSize.value = this.phoneTall ? 20 : tablet && portrait ? 28 : 34
    this.net.projects.material.uniforms.uSize.value = this.phoneTall ? 20 : tablet && portrait ? 26 : 30
    this.resize()
    this.invalidate()
  }

  setProgress(p: number, immediate = false) {
    this.pTarget = Math.min(1, Math.max(0, p))
    if (immediate) this.pCur = this.pTarget
    this.poke()
  }
  get progress() { return this.pCur }

  seek(p: number) {
    this.pTarget = this.pCur = Math.min(1, Math.max(0, p))
    this.orbit = this.orbitVel = 0
    this.apply(this.pCur)
    this.render()
  }

  poke() { this.lastPoke = performance.now() }
  setPointer(_nx: number, _ny: number, _inside: boolean) { this.poke() }
  dragBy(dxPx: number) {
    this.dragging = true
    const d = (-dxPx / Math.max(this.cssW, 1)) * Math.PI * 1.25
    this.orbit += d
    this.orbitVel = d * 45
    this.clampOrbit()
    this.poke()
  }
  dragEnd() { this.dragging = false; this.poke() }

  setVisible(v: boolean) { this.visible = v; this.updateRunning() }
  /** image plates cover the whole frame: keep the clock and DOM callbacks running, skip the GL draw */
  setSkipGL(v: boolean) { this.skipGL = v }
  private skipGL = false
  setPageVisible(v: boolean) { this.pageVisible = v; this.updateRunning() }
  start() { if (this.frozenTime === null) { this.running = false; this.updateRunning(true) } }

  resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight)
    this.cssW = w; this.cssH = h
    this.renderer.setPixelRatio(this.maxDpr * this.dprScale)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    if (this.phoneTall) this.camera.setViewOffset(w, h, 0, h * 0.14, w, h) // subject high, caption band below
    else this.camera.clearViewOffset()
    this.camera.updateProjectionMatrix()
    const buf = this.renderer.getDrawingBufferSize(_ndc)
    const dpr = this.renderer.getPixelRatio()
    const lines = [this.setup.ring, this.control.stem, this.measure.beam, this.swath.line, this.net.arcLines,
      this.model.minorLines, this.model.majorLines, this.model.boundaryData, this.model.boundaryLegal]
    const widths = [2, 1.4, 2.4, 2.4, this.phoneTall ? 1.6 : 2, 1, 1.8, 2, 2.2] // arcs: hairlines on phones
    lines.forEach((l, i) => { l.material.uniforms.uRes.value.set(buf.x, buf.y); l.material.uniforms.uWidth.value = widths[i] * dpr })
    for (const m of this.markers()) m.material.uniforms.uPx.value = dpr
    this.water.material.uniforms.uPx.value = buf.y / (2 * Math.tan((this.camera.fov * Math.PI) / 360))
    this.terrain.material.uniforms.uMaxPx.value = 3.8 * dpr
    this.invalidate()
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.running = false
    const mats = new Set<THREE.Material>()
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((x) => mats.add(x)); else if (mat) mats.add(mat)
    })
    mats.forEach((m) => {
      for (const v of Object.values(m as unknown as Record<string, unknown>)) if (v instanceof THREE.Texture) v.dispose()
      m.dispose()
    })
    Object.values(this.kit).forEach((m) => m.dispose())
    Object.values(this.kitFade).forEach((m) => m.dispose())
    this.inst.dispose()
    this.gnss.dispose()
    this.mask.dispose()
    this.env.dispose()
    this.renderer.renderLists.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.canvas.remove()
  }

  /* ================= progress → state (pure) ================= */

  apply(p: number) {
    const fx = this.fx
    const sp = chapterPos(p)
    // ambient drift: a slow bounded orbit on the planet in REACH (separate clock)
    const drift = sstep(6.6, 7, sp) * 0.12 * Math.sin(this.time * 0.045)
    // 1. camera FIRST — everything below reads it
    solveCamera(this.camera, this.keys, sp, this.orbit + drift, this.cam)
    const alt = this.cam.alt
    effects(sp, alt, fx)
    const camH = this.camera

    /* sky */
    const su = this.sky.material.uniforms
    su.uProjInv.value.copy(camH.projectionMatrixInverse)
    su.uCamRot.value.setFromMatrix4(camH.matrixWorld)
    _v.copy(camH.position).sub(GLOBE_CENTER)
    const rc = _v.length()
    su.uUp.value.copy(_v).divideScalar(rc)
    su.uDip.value = Math.acos(Math.min(1, R / Math.max(rc, R)))
    su.uSpace.value = fx.space
    su.uPx.value = (2 * Math.tan((camH.fov * Math.PI) / 360)) / Math.max(1, this.renderer.getDrawingBufferSize(_ndc).y)

    /* globe */
    const gu = this.globe.material.uniforms
    this.globe.mesh.visible = fx.globe > 0.001
    if (this.globe.mesh.visible) {
      gu.uProjInv.value.copy(camH.projectionMatrixInverse)
      gu.uCamRot.value.copy(su.uCamRot.value)
      gu.uViewRot.value.copy(su.uCamRot.value).transpose()
      gu.uProj.value.copy(camH.projectionMatrix)
      const cx = GLOBE_CENTER.x - camH.position.x, cy = GLOBE_CENTER.y - camH.position.y, cz = GLOBE_CENTER.z - camH.position.z
      const rs = R - GLOBE_SINK
      const cl = Math.sqrt(cx * cx + cy * cy + cz * cz)
      gu.uC.value.set(cx, cy, cz)
      gu.uC2.value = (cl - rs) * (cl + rs)
      gu.uAlpha.value = fx.globe
      gu.uSpace.value = fx.space
      gu.uRegion.value = fx.region
      _lightDir.set(-0.5, 0.6, 0.62).applyQuaternion(camH.quaternion).normalize()
      gu.uLight.value.copy(_lightDir)
    }

    /* CAPTURE → REGION: the site as a point cloud, sized to the view, bending onto the planet as we climb */
    {
      const pu = this.patch.material.uniforms
      const a = sstep(5.24, 5.36, sp) * (1 - sstep(5.66, 5.8, sp))
      this.patch.points.visible = a > 0.001
      if (a > 0.001) {
        const dist = camH.position.length()
        // the patch grows more slowly than the camera climbs: it recedes, bends over and the planet opens round it
        const span = 2.4 * 600 * Math.pow(Math.max(600, dist) / 600, 0.8)
        pu.uSpan.value = span
        pu.uRelief.value = 1 - 0.8 * sstep(8e4, 2.5e6, span)
        pu.uAlpha.value = a * (1 - 0.55 * sstep(5.56, 5.7, sp))
        pu.uFeather.value = sstep(5.36, 5.52, sp)
        pu.uScanMix.value = 0 // no scanner in this shot: a sweep with no source reads as a glitch
        pu.uGlow.value = 1.5 + 0.5 * sstep(5.26, 5.36, sp)
        const hpx = this.renderer.getDrawingBufferSize(_ndc).y
        pu.uFocal.value = hpx / (2 * Math.tan((camH.fov * Math.PI) / 360))
        pu.uPx.value = this.renderer.getPixelRatio()
      }
    }

    /* UAV: pose is a pure function of sp (flight.ts) */
    const pose = dronePose(sp, this.pose)

    /* terrain */
    const tu = this.terrain.material.uniforms
    this.terrain.points.visible = fx.terrainAlpha > 0.001
    // scan lines on the ground; they hand over to the point cloud as the camera rises for the capture
    const lg = this.lineGround ? fx.human * (1 - sstep(3.0, 3.3, sp)) : 0
    this.lines.lines.visible = this.lines.depth.visible = lg > 0.001
    this.lines.material.uniforms.uLineAlpha.value = lg
    // concentric rings draped on the hill around the control point and the observed point
    const onLines = this.lineGround ? 1 : 0 // the draped hairline rings belong to the line ground
    const ctrlA = fx.control * (1 - fx.aim * 0.75) * (1 - sstep(2.95, 3.15, sp)) * fx.human * onLines, tgtA = fx.hit * (1 - sstep(2.35, 2.6, sp)) * fx.human * onLines
    this.controlRings.lines.visible = ctrlA > 0.001
    this.controlRings.material.uniforms.uAlpha.value = ctrlA
    this.targetRings.lines.visible = tgtA > 0.001
    this.targetRings.material.uniforms.uAlpha.value = tgtA
    tu.uAlpha.value = fx.terrainAlpha * (1 - 0.93 * lg) // the dots stay as a fine texture under the lines
    tu.uPx.value = this.renderer.getDrawingBufferSize(_ndc).y / (2 * Math.tan((camH.fov * Math.PI) / 360))
    tu.uFog.value = fx.fog
    tu.uFogDensity.value = 1 / (15000 * (1 + alt / 1500))
    tu.uLegProg.value.set(pose.legProg[0], pose.legProg[1], pose.legProg[2])
    tu.uUav.value = pose.lidar
    tu.uCaptureDim.value = fx.captureDim
    tu.uFlow.value = fx.flow * fx.human
    tu.uFocus.value = fx.focus * fx.human
    {
      // survey rings in the scan points: set-up, control, observed point, then the kit
      const rg = tu.uRing.value as THREE.Vector4[]
      const cp = CONTROL_POINT, tp = TARGET_POINT
      rg[0].set(0, 0, 2.4, 0) // FIELD uses the survey waves instead of dotted rings
      rg[1].set(cp.x, cp.z, 7, fx.control * (1 - fx.aim * 0.7))
      rg[2].set(tp.x, tp.z, 4, fx.hit * (1 - sstep(2.35, 2.6, sp)))
      const kitRing = fx.methodLabels > 0 ? fx.methodLabels : bell(sp, 2.55, 2.8, 3.1, 3.25)
      rg[3].set(GNSS_XZ.x, GNSS_XZ.z, 0.55, kitRing)
      rg[4].set(HOVER.x, HOVER.z, 0.6, kitRing * 0.8)
      rg[5].set(POND.x, POND.z, 1.1, kitRing * 0.8) // around the pond: the water itself carries no points
      for (const v of rg) v.w *= fx.human
    }

    /* human-scale world */
    const human = fx.human > 0.001
    this.ground.visible = human
    if (!human) { // the site's own lines live outside the ground group: keep them off the planet views too
      const md = this.model
      md.boundaryData.mesh.visible = md.boundaryLegal.mesh.visible = md.minorLines.mesh.visible = md.majorLines.mesh.visible = false
    }
    if (human) {
      // total station: on the control point, then turned onto the target
      this.inst.body.rotation.y = lerpAngle(this.yawCP, this.yawT, fx.aim)
      this.inst.telescope.rotation.x = -(this.pitchCP + (this.pitchT - this.pitchCP) * fx.aim)
      this.inst.root.updateMatrixWorld(true)

      // FIELD: set-up mark
      this.setup.ring.mesh.visible = this.setup.mark.points.visible = fx.setup > 0.001
      this.setup.ring.material.uniforms.uAlpha.value = 0.9 * fx.setup
      this.setup.mark.material.uniforms.uAppear.value = fx.setup
      this.portal.mesh.visible = fx.portal > 0.001
      this.portal.material.uniforms.uAlpha.value = fx.portal
      this.waves.mesh.visible = fx.portal > 0.001
      this.waves.material.uniforms.uAmp.value = fx.portal

      // CONTROL: the known point
      this.control.marker.points.visible = this.control.stem.mesh.visible = fx.control > 0.001
      this.control.marker.material.uniforms.uAppear.value = fx.control
      this.control.stem.material.uniforms.uAlpha.value = 0.85 * fx.control
      this.control.stem.material.uniforms.uReveal.value = fx.control

      // MEASURE: the beam leaves the objective glass and ends exactly on the target point
      const beamOn = fx.beam > 0.001
      this.measure.beam.mesh.visible = beamOn
      if (beamOn) {
        this.inst.objective.getWorldPosition(_v)
        const t = this.measure.point
        this.measure.beam.setSegment(0, _v.x, _v.y, _v.z, t.x, t.y, t.z, 0, 1)
        this.measure.beam.commit()
        this.measure.beam.material.uniforms.uAlpha.value = fx.beam
        this.measure.beam.material.uniforms.uReveal.value = fx.beamReach
      }
      // the observed point keeps its light as data
      this.measure.hit.points.visible = fx.hit > 0.001
      this.measure.hit.material.uniforms.uAppear.value = fx.hit
      this.measure.hit.material.uniforms.uRing.value = 1 - sstep(2.3, 2.7, sp)

      // METHODS: the rest of the kit
      const kit = fx.kit
      for (const m of this.fadeMats) m.opacity = kit
      for (const g of [this.gnss.root, this.droneCase.root, this.usv.root]) g.visible = kit > 0.001
      this.drone.root.visible = kit > 0.001
      const dr = this.drone.root
      dr.position.set(pose.x, pose.y + Math.sin(this.time * 1.9) * 0.05 * pose.flying, pose.z)
      dr.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ')
      this.drone.discMat.opacity = 0.22 * pose.rotor * kit
      for (const d of this.drone.discs) d.visible = pose.rotor > 0.05
      this.usv.root.position.y = POND.level + Math.sin(this.time * 1.3) * 0.012
      this.water.material.uniforms.uAlpha.value = 0.25 + 0.75 * kit // the pond stays quiet until METHODS
      this.usv.root.rotation.z = Math.sin(this.time * 0.9) * 0.02
      dr.updateMatrixWorld(true)

      // CAPTURE: lidar swath under the drone, dense returns inside the parcel
      const swathOn = pose.lidar > 0
      this.swath.mesh.visible = this.swath.line.mesh.visible = swathOn
      if (swathOn) {
        this.drone.pod.getWorldPosition(_v)
        this.swath.update(_v.x, _v.y, _v.z, pose.yaw, SWATH_HALF)
        this.swath.material.uniforms.uAmp.value = 1
      }
      const camToDrone = camH.position.distanceTo(dr.position)
      this.droneHalo.points.visible = pose.flying > 0.02 && camToDrone > 60 && sp > 3.2
      this.droneHalo.positions[0] = pose.x; this.droneHalo.positions[1] = pose.y + 0.4; this.droneHalo.positions[2] = pose.z
      this.droneHalo.commit()
      this.droneHalo.material.uniforms.uAppear.value = sstep(60, 120, camToDrone) * (1 - sstep(3.93, 3.99, sp)) // gone before CAPTURE rests

      const cu = this.capture.material.uniforms
      cu.uLegProg.value.copy(tu.uLegProg.value)
      cu.uPx.value = tu.uPx.value
      cu.uAlpha.value = 1 - 0.7 * fx.captureDim
      this.capture.points.visible = pose.legProg[0] > 0

      // MODEL: the same ground resolves into contours inside the same boundary
      const md = this.model
      md.boundaryData.mesh.visible = human && fx.boundary > 0 && fx.captureDim < 1
      md.boundaryData.material.uniforms.uReveal.value = fx.boundary
      md.boundaryData.material.uniforms.uAlpha.value = 1 - fx.captureDim
      md.boundaryLegal.mesh.visible = human && fx.captureDim > 0
      md.boundaryLegal.material.uniforms.uAlpha.value = fx.captureDim
      md.minorLines.mesh.visible = md.majorLines.mesh.visible = human && fx.contours > 0
      md.minorLines.material.uniforms.uReveal.value = fx.contours
      md.majorLines.material.uniforms.uReveal.value = fx.contours
    }

    /* network */
    const net = this.net
    net.siteMarker.points.visible = fx.site > 0.001 && !this.phoneTall // phones: the offices tell the story
    net.siteMarker.material.uniforms.uAppear.value = fx.site
    net.offices.points.visible = fx.offices > 0
    const per = net.offices.material.uniforms.uPerAppear.value as Float32Array
    const no = OFFICES.length
    for (let r = 0; r < no; r++) per[net.officeOrder[r]] = Math.min(1, Math.max(0, (fx.offices - (r / no) * 0.5) / 0.5))
    net.arcLines.mesh.visible = fx.arcs > 0
    net.projects.points.visible = fx.arcs > 0.35
    net.projects.material.uniforms.uAppear.value = sstep(0.35, 1, fx.arcs)
    net.arcLines.material.uniforms.uReveal.value = fx.arcs

    /* DOM-facing state, projected with the same camera */
    const s = this.state
    s.p = p; s.sp = sp; s.chapter = chapterAt(sp); s.phase = PHASES[s.chapter]; s.alt = alt
    const tags = s.tags
    this.project(this.control.labelAnchor, tags[0]); tags[0].a *= fx.controlLabel * fx.human
    this.project(this.measure.labelAnchor, tags[1]); tags[1].a *= fx.coords * fx.human
    const m = fx.methodLabels * fx.human
    this.gnss.antenna.getWorldPosition(_v); this.project(_v, tags[2]); tags[2].a *= m
    _v.set(0, 1.72, 0); this.project(_v, tags[3]); tags[3].a *= m
    _v.set(pose.x, pose.y + 0.4, pose.z); this.project(_v, tags[4]); tags[4].a *= Math.max(m, fx.flightLabel)
    _v.set(this.usv.root.position.x, POND.level + 0.7, this.usv.root.position.z); this.project(_v, tags[5]); tags[5].a *= m
    this.model.labels.forEach((l, i) => { this.project(l.pos, tags[6 + i]); tags[6 + i].a *= fx.contourLabels * fx.human })
    for (let i = 0; i < 4; i++) {
      const g = s.regions[i]
      this.project(this.regionAnchors[i], g)
      g.a *= fx.regionLabels * (1 - sstep(6.2, 6.5, sp)) * this.facing(this.regionAnchors[i])
    }
    for (let i = 0; i < no; i++) {
      const o = s.offices[i]
      _v2.fromArray(net.officePos, i * 3)
      this.project(_v2, o)
      o.a *= fx.officeLabels * this.facing(_v2)
    }
    _v2.fromArray(net.sitePos, 0); this.project(_v2, s.site)
    for (let i = 0; i < s.sites.length; i++) {
      const o = s.sites[i]
      _v2.fromArray(net.projectPos, i * 3)
      this.project(_v2, o)
      o.a *= sstep(0.55, 1, fx.arcs) * this.facing(_v2)
    }
  }

  /* ================= internals ================= */

  private markers() {
    return [this.setup.mark, this.control.marker, this.measure.hit, this.droneHalo, this.net.offices, this.net.siteMarker, this.net.projects]
  }

  /** 1 when a point on the globe faces the camera, 0 behind the limb */
  private facing(p: THREE.Vector3) {
    _v3.subVectors(p, GLOBE_CENTER).normalize()
    const dx = this.camera.position.x - p.x, dy = this.camera.position.y - p.y, dz = this.camera.position.z - p.z
    const l = Math.hypot(dx, dy, dz) || 1
    return sstep(0.02, 0.15, (_v3.x * dx + _v3.y * dy + _v3.z * dz) / l)
  }

  private project(v: THREE.Vector3, out: Pt) {
    _v3.copy(v).project(this.camera)
    out.x = (_v3.x * 0.5 + 0.5) * this.cssW
    out.y = (-_v3.y * 0.5 + 0.5) * this.cssH
    out.a = _v3.z < 1 && _v3.z > -1 && Math.abs(_v3.x) < 1.05 && Math.abs(_v3.y) < 1.05 ? 1 : 0
  }

  private clampOrbit() {
    if (this.cam.planet < 0.5) this.orbit = Math.max(-0.7, Math.min(0.7, this.orbit))
  }

  private invalidate() {
    if (!this.running) { this.apply(this.pCur); this.render() }
  }

  private updateRunning(force = false) {
    const should = this.visible && this.pageVisible && this.frozenTime === null && !this.disposed
    if (should && (!this.running || force)) {
      this.running = true
      this.lastNow = performance.now()
      this.acc = 0
      cancelAnimationFrame(this.raf)
      this.raf = requestAnimationFrame(this.tick)
    } else if (!should && this.running) {
      this.running = false
      cancelAnimationFrame(this.raf)
    }
  }

  private tick = (now: number) => {
    if (!this.running) return
    this.raf = requestAnimationFrame(this.tick)
    const delta = Math.min(250, now - this.lastNow)
    this.lastNow = now
    const busy = now - this.lastPoke < 700 || this.dragging || Math.abs(this.pTarget - this.pCur) > 1e-4 || Math.abs(this.orbit) > 1e-4
    const interval = 1000 / (busy ? 50 : 30)
    this.acc += delta
    if (this.acc < interval) return
    const dt = Math.min(this.acc, 100) / 1000
    this.acc = Math.min(this.acc - interval, interval)

    this.time += dt
    const k = 1 - Math.exp(-dt / 0.1)
    this.pCur += (this.pTarget - this.pCur) * k
    if (Math.abs(this.pTarget - this.pCur) < 2e-5) this.pCur = this.pTarget
    if (!this.dragging) {
      const home = this.cam.planet > 0.5 ? Math.round(this.orbit / (Math.PI * 2)) * Math.PI * 2 : 0
      this.springOrbit(home, dt)
    } else this.orbitVel *= Math.exp(-dt / 0.08)

    this.ambient(dt)
    this.apply(this.pCur)
    this.render()
    this.govern(dt, interval)
  }

  private springOrbit(home: number, dt: number) {
    const w = 5.5
    const x = this.orbit - home
    const a = -w * w * x - 2 * w * this.orbitVel
    this.orbitVel += a * dt
    this.orbit += this.orbitVel * dt
    if (Math.abs(this.orbit - home) < 1e-4 && Math.abs(this.orbitVel) < 1e-3) { this.orbit = 0; this.orbitVel = 0 }
    this.clampOrbit()
  }

  private ambient(dt: number) {
    const t = this.time
    const spin = this.pose.rotor * dt * 70
    for (let i = 0; i < 4; i++) this.drone.props[i].rotation.y += i % 2 ? spin : -spin
    this.terrain.material.uniforms.uTime.value = t
    this.sky.material.uniforms.uTime.value = t
    this.globe.material.uniforms.uTime.value = t
    this.patch.material.uniforms.uBreath.value = t * 0.55
    this.patch.material.uniforms.uScanAngle.value = t * 0.85
    this.water.material.uniforms.uTime.value = t
    this.portal.material.uniforms.uTime.value = t
    this.waves.material.uniforms.uTime.value = t
    this.controlRings.material.uniforms.uTime.value = t
    this.targetRings.material.uniforms.uTime.value = t
    for (const l of [this.measure.beam, this.net.arcLines, this.model.majorLines]) l.material.uniforms.uTime.value = t
    for (const m of this.markers()) m.material.uniforms.uTime.value = t
  }

  private render() {
    if (!this.skipGL) this.renderer.render(this.scene, this.camera)
    this.onFrame?.(this.state)
  }

  private govern(dt: number, interval: number) {
    this.govFrames++
    this.govTime += dt
    if (this.govTime < 1.5) return
    const fps = this.govFrames / this.govTime
    const target = 1000 / interval
    this.govFrames = 0; this.govTime = 0
    if (fps < target * 0.8 && this.dprScale * this.maxDpr > this.minDpr + 1e-3) {
      this.dprScale = Math.max(this.minDpr / this.maxDpr, this.dprScale - 0.1)
      this.govGood = 0
      this.resize()
    } else if (fps > target * 0.95) {
      if (++this.govGood >= 3 && this.dprScale < 1) { this.dprScale = Math.min(1, this.dprScale + 0.05); this.govGood = 0; this.resize() }
    } else this.govGood = 0
  }
}
