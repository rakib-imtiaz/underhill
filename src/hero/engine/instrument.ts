/**
 * Procedural total station on a tripod, the prism pole, and survey monuments.
 *
 * Dimensions are in metres and every part is placed against the part it mounts on (the numbers
 * in comments are the mating faces). Assemblies are separate nodes:
 *   legs[3] · base (tribrach) · body (alidade, yaws) · telescope (pitches on the trunnion axle)
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/* ---------------- material kit (created once, never mutated per part) ---------------- */
export type Kit = ReturnType<typeof makeKit>
export function makeKit() {
  const std = (color: string, roughness: number, metalness = 0, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
    new THREE.MeshPhysicalMaterial({ color, roughness, metalness, ...extra })
  return {
    shell: std('#e8e5dd', 0.38, 0, { clearcoat: 0.35, clearcoatRoughness: 0.4 }),
    dark: std('#2a2e33', 0.5, 0.15),
    rubber: std('#141618', 0.85),
    accent: std('#ff6a1f', 0.42),
    brand: std('#0082ca', 0.38, 0.1), // Underhill blue
    metal: std('#aab2b8', 0.32, 0.92),
    brass: std('#b58f4c', 0.3, 0.9),
    leg: std('#c7973a', 0.55),
    concrete: std('#8e8b85', 0.92),
    glass: std('#0d1c24', 0.04, 0.3, { envMapIntensity: 1.8, clearcoat: 1, clearcoatRoughness: 0.02 }),
    prismGlass: std('#6f8a96', 0.05, 0.85, { envMapIntensity: 2.2 }),
    red: std('#c63a2c', 0.45),
    bubble: std('#9fe07a', 0.2, 0, { transmission: 0.3, transparent: true, opacity: 0.85 }),
  }
}

/** A dim studio environment painted on a canvas, prefiltered with PMREM. */
export function makeEnvironment(renderer: THREE.WebGLRenderer) {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, '#2b3a4a'); grad.addColorStop(0.48, '#4a5866'); grad.addColorStop(0.52, '#1a2027'); grad.addColorStop(1, '#07090b')
  g.fillStyle = grad; g.fillRect(0, 0, 512, 256)
  const box = (x: number, y: number, w: number, h: number, col: string) => {
    const rg = g.createRadialGradient(x + w / 2, y + h / 2, 2, x + w / 2, y + h / 2, Math.max(w, h) / 1.4)
    rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = rg; g.fillRect(x - w, y - h, w * 3, h * 3)
  }
  box(70, 40, 90, 40, 'rgba(255,240,220,0.95)') // key softbox
  box(330, 60, 60, 30, 'rgba(160,210,255,0.8)') // cool rim
  box(220, 100, 180, 18, 'rgba(255,150,90,0.35)') // warm horizon bounce
  const tex = new THREE.CanvasTexture(c)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.colorSpace = THREE.SRGBColorSpace
  const pm = new THREE.PMREMGenerator(renderer)
  const env = pm.fromEquirectangular(tex).texture
  tex.dispose(); pm.dispose()
  return env
}

/* ---------------- helpers ---------------- */
const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat)
  m.name = name
  m.position.set(x, y, z)
  return m
}
/** cylinder along Y between y0 and y1 */
const cylY = (r0: number, r1: number, y0: number, y1: number, mat: THREE.Material, name: string, seg = 24, x = 0, z = 0) =>
  mesh(new THREE.CylinderGeometry(r1, r0, y1 - y0, seg), mat, name, x, (y0 + y1) / 2, z)
/** cylinder along X centred at (x,y,z) */
const cylX = (r: number, len: number, mat: THREE.Material, name: string, x: number, y: number, z: number, seg = 20) => {
  const m = mesh(new THREE.CylinderGeometry(r, r, len, seg), mat, name, x, y, z)
  m.rotation.z = Math.PI / 2
  return m
}
/** cylinder along Z between z0 and z1 */
const cylZ = (r0: number, r1: number, z0: number, z1: number, mat: THREE.Material, name: string, seg = 28) => {
  const m = mesh(new THREE.CylinderGeometry(r1, r0, z1 - z0, seg), mat, name, 0, 0, (z0 + z1) / 2)
  m.rotation.x = Math.PI / 2
  return m
}
const rbox = (w: number, h: number, d: number, r: number, mat: THREE.Material, name: string, x = 0, y = 0, z = 0) =>
  mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat, name, x, y, z)
const box = (w: number, h: number, d: number, mat: THREE.Material, name: string, x = 0, y = 0, z = 0) =>
  mesh(new THREE.BoxGeometry(w, h, d), mat, name, x, y, z)

/** rounded equilateral-triangle plate lying in XZ, from y0 up to y1 */
function triPlate(radius: number, corner: number, y0: number, y1: number, mat: THREE.Material, name: string) {
  const s = new THREE.Shape()
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2
    const cx = Math.cos(a) * (radius - corner), cy = Math.sin(a) * (radius - corner)
    s.absarc(cx, cy, corner, a - Math.PI / 3, a + Math.PI / 3, false)
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2, curveSegments: 10 })
  geo.rotateX(-Math.PI / 2) // extrusion +Z → +Y
  geo.translate(0, y0, 0)
  return mesh(geo, mat, name)
}

/* ---------------- LCD texture ---------------- */
function lcdTexture(lines: string[]) {
  const c = document.createElement('canvas')
  c.width = 320; c.height = 160 // matches the 0.074 × 0.037 m glass (2:1)
  const g = c.getContext('2d')!
  g.fillStyle = '#0c1a16'; g.fillRect(0, 0, 320, 160)
  g.fillStyle = '#10362b'; g.fillRect(0, 0, 320, 26)
  g.fillStyle = '#7dffc8'
  g.font = '600 18px "IBM Plex Mono", ui-monospace, monospace'
  g.fillText('MEAS  ▮▮▮▯  P1', 12, 19)
  g.font = '500 24px "IBM Plex Mono", ui-monospace, monospace'
  lines.forEach((l, i) => g.fillText(l, 12, 60 + i * 34))
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/* ---------------- total station + tripod ---------------- */
export type Instrument = {
  root: THREE.Group
  legs: THREE.Group[]
  base: THREE.Group
  body: THREE.Group
  telescope: THREE.Group
  objective: THREE.Object3D // EDM exit pupil (centre of the objective glass)
  axleY: number
  headAnchor: THREE.Object3D
  dispose: () => void
}

/**
 * Surveyor's tripod. `top` is the height of the head plate's upper face; feet land on flat ground
 * (y = 0) at radius `footR`. Returns the head so callers can hang things from it.
 */
export function buildTripod(kit: Kit, top = 1.2, footR = 0.58, name = 'tripod') {
  const root = new THREE.Group(); root.name = name
  const head = new THREE.Group(); head.name = `${name}Head`
  head.add(cylY(0.088, 0.086, top - 0.035, top, kit.metal, 'headPlate', 36))
  head.add(cylY(0.012, 0.012, top - 0.12, top - 0.035, kit.metal, 'centreScrew', 12)) // hangs from the plate underside
  head.add(cylY(0.024, 0.024, top - 0.134, top - 0.11, kit.dark, 'centreScrewKnob', 18))
  root.add(head)

  const legs: THREE.Group[] = []
  const hingeY = top - 0.028
  for (let i = 0; i < 3; i++) {
    const th = (i / 3) * Math.PI * 2 + Math.PI / 6
    const radial = new THREE.Vector3(Math.cos(th), 0, Math.sin(th))
    const tangent = new THREE.Vector3(-Math.sin(th), 0, Math.cos(th))
    const hinge = radial.clone().multiplyScalar(0.105).setY(hingeY)
    const foot = radial.clone().multiplyScalar(footR)
    const L = hinge.distanceTo(foot)

    // lug on the head the leg pins to
    const lug = box(0.028, 0.03, 0.036, kit.metal, `lug${i}`)
    lug.position.copy(radial.clone().multiplyScalar(0.098).setY(hingeY))
    lug.rotation.y = -th
    head.add(lug)

    const leg = new THREE.Group(); leg.name = `leg${i}`
    const yAxis = hinge.clone().sub(foot).normalize() // local +Y points back up the leg
    const zAxis = new THREE.Vector3().crossVectors(tangent, yAxis).normalize()
    leg.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(tangent, yAxis, zAxis))
    leg.position.copy(hinge)

    leg.add(box(0.074, 0.05, 0.042, kit.dark, 'hingeBlock', 0, -0.012, 0))
    leg.add(cylX(0.006, 0.086, kit.metal, 'hingePin', 0, 0, 0, 10))
    const railLen = L * 0.6
    for (const sx of [-1, 1]) leg.add(box(0.02, railLen, 0.032, kit.leg, `rail${sx}`, sx * 0.026, -0.03 - railLen / 2, 0))
    const clampY = -0.03 - railLen
    leg.add(box(0.078, 0.068, 0.048, kit.dark, 'clamp', 0, clampY, 0))
    const knob = cylZ(0.011, 0.011, 0.024, 0.052, kit.accent, 'clampKnob', 16)
    knob.position.y = clampY
    leg.add(knob)
    const lowTop = clampY + 0.03, lowBot = -L * 0.925
    leg.add(box(0.026, lowTop - lowBot, 0.026, kit.leg, 'lowerLeg', 0, (lowTop + lowBot) / 2, 0))
    leg.add(cylY(0.013, 0.018, -L * 0.972, lowBot + 0.012, kit.metal, 'shoe', 16))
    leg.add(cylY(0.0015, 0.013, -L, -L * 0.972, kit.metal, 'spike', 12))
    leg.add(box(0.05, 0.008, 0.022, kit.metal, 'stepPedal', 0.035, -L * 0.955, 0))
    legs.push(leg)
    root.add(leg)
  }

  /* contact shadow so the tripod reads as standing, not hovering */
  const ao = mesh(new THREE.CircleGeometry(footR * 1.6, 48), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(0.0,0.0,0.0, 0.55 * pow(1.0 - clamp(d,0.0,1.0), 1.6)); }',
  }), 'contactShadow', 0, 0.004, 0)
  ao.rotation.x = -Math.PI / 2
  root.add(ao)
  return { root, head, legs }
}

export function buildInstrument(kit: Kit, readings: string[]): Instrument {
  const root = new THREE.Group(); root.name = 'instrument'

  /* tripod: head plate 1.165 → 1.200, legs on the pad */
  const tripod = buildTripod(kit, 1.2, 0.58, 'tripod')
  root.add(tripod.root)
  const legs = tripod.legs

  /* tribrach (levelling base): 1.200 → 1.285 */
  const base = new THREE.Group(); base.name = 'tribrach'
  base.add(triPlate(0.078, 0.018, 1.2, 1.21, kit.dark, 'basePlate'))
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2
    const x = Math.cos(a) * 0.056, z = -Math.sin(a) * 0.056
    base.add(cylY(0.0045, 0.0045, 1.21, 1.252, kit.metal, `footScrewShaft${i}`, 10, x, z))
    const k = cylY(0.0165, 0.0165, 1.214, 1.238, kit.dark, `footScrew${i}`, 22, x, z)
    base.add(k)
    const ridges: THREE.BufferGeometry[] = [] // knurling ridges on the knob, merged to one draw
    for (let r = 0; r < 12; r++) {
      const ang = (r / 12) * Math.PI * 2
      ridges.push(new THREE.BoxGeometry(0.003, 0.022, 0.003).translate(x + Math.cos(ang) * 0.0168, 1.226, z + Math.sin(ang) * 0.0168))
    }
    base.add(mesh(mergeGeometries(ridges) ?? ridges[0], kit.rubber, `knurl${i}`))
  }
  base.add(triPlate(0.074, 0.018, 1.244, 1.262, kit.shell, 'tribrachBody'))
  base.add(cylY(0.047, 0.045, 1.262, 1.285, kit.dark, 'lockingCollar', 32))
  const lever = box(0.032, 0.008, 0.012, kit.accent, 'lockLever', 0.058, 1.272, 0)
  base.add(lever)
  base.add(cylY(0.01, 0.01, 1.262, 1.268, kit.metal, 'bubbleHousing', 16, -0.028, 0.034))
  base.add(cylY(0.0072, 0.0072, 1.268, 1.2705, kit.bubble, 'bubbleVial', 16, -0.028, 0.034))
  root.add(base)

  /* alidade (rotating body): 1.285 → 1.655 */
  const body = new THREE.Group(); body.name = 'alidade'
  body.add(cylY(0.07, 0.068, 1.285, 1.315, kit.dark, 'rotatingBase', 36))
  body.add(rbox(0.17, 0.09, 0.13, 0.012, kit.shell, 'housing', 0, 1.36, 0)) // 1.315 → 1.405
  // operator face (-Z): display + keypad on a panel
  const panel = rbox(0.158, 0.072, 0.006, 0.002, kit.dark, 'facePanel', 0, 1.36, -0.066)
  body.add(panel)
  const lcd = lcdTexture(readings)
  const screen = mesh(new THREE.PlaneGeometry(0.074, 0.037), new THREE.MeshBasicMaterial({ map: lcd, toneMapped: false }), 'display', -0.032, 1.364, -0.0694)
  screen.rotation.y = Math.PI
  body.add(screen)
  body.add(box(0.082, 0.045, 0.0012, kit.rubber, 'displayBezel', -0.032, 1.364, -0.0685))
  const keys: THREE.BufferGeometry[] = []
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
    if (r === 0 && c === 2) continue
    keys.push(new THREE.BoxGeometry(0.013, 0.0085, 0.004).translate(0.028 + c * 0.017, 1.383 - r * 0.0125, -0.0703))
  }
  body.add(mesh(mergeGeometries(keys)!, kit.shell, 'keypad'))
  body.add(box(0.013, 0.0085, 0.004, kit.accent, 'keyEnter', 0.028 + 2 * 0.017, 1.383, -0.0703))
  // front face: second, smaller display
  const front = rbox(0.09, 0.04, 0.005, 0.002, kit.dark, 'frontPanel', 0, 1.36, 0.0665)
  body.add(front)
  // standards (uprights): 1.405 → 1.605, inner faces at x = ±0.055
  for (const sx of [-1, 1]) {
    body.add(rbox(0.03, 0.2, 0.11, 0.008, kit.shell, `standard${sx}`, sx * 0.07, 1.505, 0))
    body.add(box(0.0325, 0.012, 0.1125, kit.accent, `stripe${sx}`, sx * 0.07, 1.585, 0))
    body.add(cylX(0.02, 0.012, kit.dark, `bushing${sx}`, sx * 0.091, 1.53, 0)) // outer face 0.085 → 0.097
    body.add(box(0.018, 0.03, 0.022, kit.dark, `handlePost${sx}`, sx * 0.07, 1.62, 0)) // 1.605 → 1.635
  }
  body.add(cylX(0.011, 0.022, kit.dark, 'vTangentScrew', 0.096, 1.455, 0.025))
  body.add(cylX(0.013, 0.018, kit.accent, 'vClamp', -0.094, 1.46, -0.02))
  body.add(box(0.002, 0.075, 0.07, kit.dark, 'batteryDoor', -0.0862, 1.49, 0.005))
  body.add(rbox(0.17, 0.02, 0.028, 0.008, kit.dark, 'handle', 0, 1.645, 0)) // 1.635 → 1.655
  body.add(cylY(0.016, 0.016, 1.405, 1.414, kit.dark, 'hTangentBoss', 16, 0.06, 0.05))
  root.add(body)

  /* telescope on the trunnion axle, axle at y = 1.53 */
  const axleY = 1.53
  const telescope = new THREE.Group(); telescope.name = 'telescope'
  telescope.position.y = axleY
  telescope.add(cylX(0.016, 0.112, kit.metal, 'trunnionAxle', 0, 0, 0)) // ends inside both standards
  telescope.add(rbox(0.09, 0.1, 0.1, 0.012, kit.dark, 'telescopeHousing'))
  telescope.add(cylZ(0.034, 0.034, 0.045, 0.131, kit.shell, 'objectiveBarrel'))
  telescope.add(cylZ(0.0355, 0.0355, 0.06, 0.076, kit.rubber, 'focusRing'))
  telescope.add(cylZ(0.037, 0.037, 0.131, 0.14, kit.dark, 'objectiveRing'))
  const lens = mesh(new THREE.CircleGeometry(0.0295, 40), kit.glass, 'objectiveLens', 0, 0, 0.1385)
  telescope.add(lens)
  telescope.add(cylZ(0.018, 0.018, -0.095, -0.045, kit.dark, 'eyepiece'))
  telescope.add(cylZ(0.021, 0.022, -0.115, -0.095, kit.rubber, 'eyecup'))
  telescope.add(box(0.012, 0.012, 0.05, kit.accent, 'collimator', 0, 0.056, 0.005))
  const objective = new THREE.Object3D(); objective.name = 'edmExit'
  objective.position.set(0, 0, 0.139)
  telescope.add(objective)
  body.add(telescope)

  const headAnchor = new THREE.Object3D(); headAnchor.position.set(0, 1.5, 0)
  body.add(headAnchor)

  return {
    root, legs, base, body, telescope, objective, axleY, headAnchor,
    dispose: () => lcd.dispose(),
  }
}

/* ---------------- prism pole ---------------- */
export type Prism = { root: THREE.Group; head: THREE.Group; center: THREE.Object3D; faceOffset: number }

export function buildPrism(kit: Kit): Prism {
  const root = new THREE.Group(); root.name = 'prismPole'
  // pole: spike 0 → 0.02 below the surface is not modelled; the carbide tip meets the ground
  root.add(cylY(0.002, 0.009, -0.015, 0.05, kit.metal, 'poleTip', 12))
  root.add(cylY(0.0125, 0.0125, 0.05, 1.8, kit.metal, 'pole', 18))
  for (let i = 0; i < 5; i++) root.add(cylY(0.0132, 0.0132, 0.12 + i * 0.2, 0.22 + i * 0.2, kit.red, `band${i}`, 18))
  root.add(cylY(0.016, 0.016, 1.25, 1.29, kit.dark, 'bubbleClamp', 16))
  root.add(box(0.03, 0.022, 0.012, kit.dark, 'bubbleArm', 0.028, 1.27, 0))
  root.add(cylY(0.012, 0.012, 1.262, 1.279, kit.bubble, 'poleBubble', 14, 0.048, 0))
  root.add(cylY(0.014, 0.012, 1.8, 1.83, kit.dark, 'threadAdapter', 16))

  const head = new THREE.Group(); head.name = 'prismHead'
  head.position.y = 1.83
  head.add(box(0.1, 0.012, 0.03, kit.dark, 'yokeBase', 0, 0.006, 0)) // 1.830 → 1.842
  for (const sx of [-1, 1]) {
    head.add(box(0.008, 0.078, 0.026, kit.dark, `yokeArm${sx}`, sx * 0.046, 0.012 + 0.039, 0))
    head.add(cylX(0.006, 0.012, kit.metal, `pivot${sx}`, sx * 0.039, 0.05, 0, 10)) // arm inner face 0.042 → canister 0.036
  }
  const canister = new THREE.Group(); canister.position.y = 0.05; canister.name = 'prismCanister'
  canister.add(cylZ(0.036, 0.036, -0.016, 0.014, kit.accent, 'canisterShell', 36))
  canister.add(cylZ(0.037, 0.037, 0.012, 0.018, kit.dark, 'canisterBezel', 36))
  // corner-cube face: six facets meeting at the centre
  const facets = new THREE.ConeGeometry(0.029, 0.008, 6, 1, false)
  facets.rotateX(-Math.PI / 2)
  const cube = mesh(facets, kit.prismGlass, 'prismGlass', 0, 0, 0.0145)
  canister.add(cube)
  head.add(canister)
  root.add(head)

  const center = new THREE.Object3D(); center.name = 'prismCentre'
  center.position.set(0, 0.05, 0)
  head.add(center)
  return { root, head, center, faceOffset: 0.0185 }
}

/* ---------------- survey monument ---------------- */
export function buildMonument(kit: Kit, clip: THREE.Plane) {
  const g = new THREE.Group(); g.name = 'monument'
  const clipMat = (m: THREE.MeshPhysicalMaterial) => { const c = m.clone(); c.clippingPlanes = [clip]; return c }
  const concrete = clipMat(kit.concrete), brass = clipMat(kit.brass), accent = clipMat(kit.accent), metal = clipMat(kit.metal)
  g.add(cylY(0.075, 0.07, -0.7, 0.3, concrete, 'post', 20))
  g.add(cylY(0.052, 0.05, 0.3, 0.314, brass, 'brassCap', 24))
  g.add(cylY(0.006, 0.006, 0.314, 0.322, brass, 'capPunch', 8))
  g.add(box(0.035, 1.5, 0.035, metal, 'witnessStake', 0.26, 0.05, 0.02))
  g.add(box(0.037, 0.24, 0.037, accent, 'witnessFlag', 0.26, 0.68, 0.02))
  return { group: g, materials: [concrete, brass, accent, metal] }
}
