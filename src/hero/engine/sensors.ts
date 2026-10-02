/**
 * The rest of the field kit, set up beside the total station:
 *   GNSS rover on a bipod · terrestrial laser scanner on its tripod · UAV lidar drone on its case.
 * Metres; every part is placed against the part it mounts on. Positions are on the flat set-up
 * area (H = 0 inside r < 9 m), so every foot sits at y = 0.
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { buildTripod, type Kit } from './instrument'
import { POND } from './terrainField'

export const GNSS_XZ = { x: -2.9, z: 1.2 }
export const SCANNER_XZ = { x: -4.9, z: 0.3 }
export const CASE_XZ = { x: -5.6, z: 2.9 }
export const SCANNER_MIRROR_Y = 1.135
export const CASE_TOP = 0.24

const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat)
  m.name = name
  m.position.set(x, y, z)
  return m
}
const cylY = (r0: number, r1: number, y0: number, y1: number, mat: THREE.Material, name: string, seg = 24, x = 0, z = 0) =>
  mesh(new THREE.CylinderGeometry(r1, r0, y1 - y0, seg), mat, name, x, (y0 + y1) / 2, z)
const cylX = (r: number, len: number, mat: THREE.Material, name: string, x: number, y: number, z: number, seg = 16) => {
  const m = mesh(new THREE.CylinderGeometry(r, r, len, seg), mat, name, x, y, z)
  m.rotation.z = Math.PI / 2
  return m
}
const rbox = (w: number, h: number, d: number, r: number, mat: THREE.Material, name: string, x = 0, y = 0, z = 0) =>
  mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat, name, x, y, z)
const box = (w: number, h: number, d: number, mat: THREE.Material, name: string, x = 0, y = 0, z = 0) =>
  mesh(new THREE.BoxGeometry(w, h, d), mat, name, x, y, z)
/** a round tube between two points */
function tube(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, name: string, seg = 10) {
  const len = a.distanceTo(b)
  const m = mesh(new THREE.CylinderGeometry(r, r, len, seg), mat, name)
  m.position.copy(a).add(b).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
  return m
}

function screenTexture(lines: string[], w = 320, h = 200, accent = '#4fc3ff') {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = '#0a1520'; g.fillRect(0, 0, w, h)
  g.fillStyle = '#0d2a40'; g.fillRect(0, 0, w, 34)
  g.fillStyle = accent
  g.font = '600 20px "IBM Plex Mono", ui-monospace, monospace'
  g.fillText(lines[0], 14, 24)
  g.fillStyle = '#d6ecf7'
  g.font = '500 24px "IBM Plex Mono", ui-monospace, monospace'
  lines.slice(1).forEach((l, i) => g.fillText(l, 14, 72 + i * 38))
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/* ---------------- GNSS rover on a bipod ---------------- */
export function buildGnss(kit: Kit) {
  const root = new THREE.Group(); root.name = 'gnssRover'
  root.add(cylY(0.002, 0.009, -0.015, 0.05, kit.metal, 'poleTip', 12))
  root.add(cylY(0.0125, 0.0125, 0.05, 2.0, kit.dark, 'pole', 18))
  for (let i = 0; i < 4; i++) root.add(cylY(0.0132, 0.0132, 0.3 + i * 0.4, 0.34 + i * 0.4, kit.brand, `band${i}`, 18))

  // bipod: collar on the pole, two legs to the ground behind it
  root.add(cylY(0.021, 0.021, 1.2, 1.27, kit.dark, 'bipodCollar', 18))
  for (const sx of [-1, 1]) {
    const top = new THREE.Vector3(sx * 0.018, 1.235, -0.012)
    const foot = new THREE.Vector3(sx * 0.42, 0, -0.55)
    root.add(tube(top, foot, 0.009, kit.metal, `bipodLeg${sx}`))
    root.add(cylY(0.004, 0.014, 0, 0.03, kit.rubber, `bipodFoot${sx}`, 10, foot.x, foot.z))
  }

  // controller on a bracket, screen toward the camera side (+Z)
  root.add(cylY(0.019, 0.019, 1.3, 1.36, kit.dark, 'bracketClamp', 16))
  root.add(box(0.016, 0.016, 0.07, kit.dark, 'bracketArm', 0, 1.33, 0.045))
  const ctl = new THREE.Group(); ctl.name = 'controller'
  ctl.position.set(0, 1.35, 0.09)
  ctl.rotation.x = -0.35
  ctl.add(rbox(0.19, 0.125, 0.024, 0.008, kit.dark, 'controllerBody'))
  const tex = screenTexture(['RTK FIXED  ● 28 SV', 'H  0.008 m', 'V  0.012 m'])
  const scr = mesh(new THREE.PlaneGeometry(0.16, 0.1), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), 'controllerScreen', 0, 0, 0.0125)
  ctl.add(scr)
  root.add(ctl)

  // antenna: thread adapter → body → radome
  root.add(cylY(0.014, 0.012, 2.0, 2.03, kit.dark, 'antennaAdapter', 16))
  root.add(cylY(0.09, 0.086, 2.03, 2.07, kit.dark, 'antennaBase', 40))
  root.add(cylY(0.0905, 0.0905, 2.058, 2.066, kit.brand, 'antennaRing', 40))
  const dome = mesh(new THREE.SphereGeometry(0.084, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), kit.shell, 'radome', 0, 2.07, 0)
  dome.scale.y = 0.5
  root.add(dome)
  const antenna = new THREE.Object3D(); antenna.position.set(0, 2.1, 0); root.add(antenna)
  root.position.set(GNSS_XZ.x, 0, GNSS_XZ.z)
  return { root, antenna, dispose: () => tex.dispose() }
}

/* ---------------- terrestrial laser scanner ---------------- */
export function buildScanner(kit: Kit) {
  const root = new THREE.Group(); root.name = 'laserScanner'
  const tripod = buildTripod(kit, 1.0, 0.46, 'scannerTripod')
  root.add(tripod.root)

  const body = new THREE.Group(); body.name = 'scannerBody' // yaws during the sweep
  body.add(cylY(0.066, 0.066, 1.0, 1.02, kit.dark, 'scannerBase', 32))
  body.add(rbox(0.17, 0.045, 0.125, 0.01, kit.shell, 'scannerBlock', 0, 1.042, 0)) // 1.02 → 1.065
  for (const sx of [-1, 1]) {
    body.add(rbox(0.048, 0.15, 0.125, 0.012, kit.shell, `scannerSide${sx}`, sx * 0.0615, 1.14, 0)) // 1.065 → 1.215, inner face ±0.0375
    body.add(box(0.05, 0.01, 0.127, kit.brand, `scannerStripe${sx}`, sx * 0.0615, 1.2, 0))
  }
  const disp = screenTexture(['SCAN 1/4 ● 2 MHz', '360° × 300°', 'RES 6 mm @10 m'], 256, 160)
  const scr = mesh(new THREE.PlaneGeometry(0.07, 0.044), new THREE.MeshBasicMaterial({ map: disp, toneMapped: false }), 'scannerScreen', 0.0862, 1.14, 0)
  scr.rotation.y = Math.PI / 2
  body.add(scr)

  // mirror drum between the side housings, spinning about X; laser exits from its centre
  const drum = new THREE.Group(); drum.name = 'mirrorDrum'
  drum.position.set(0, SCANNER_MIRROR_Y, 0)
  const cyl = mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.075, 32), kit.glass, 'drumGlass')
  cyl.rotation.z = Math.PI / 2
  drum.add(cyl)
  const mirror = box(0.07, 0.05, 0.002, kit.metal, 'mirror', 0, 0, 0)
  mirror.rotation.x = Math.PI / 4
  drum.add(mirror)
  body.add(drum)

  root.add(body)
  root.position.set(SCANNER_XZ.x, 0, SCANNER_XZ.z)
  return { root, body, drum, dispose: () => disp.dispose() }
}

/* ---------------- UAV (enterprise quad-X) with a gimbal-mounted lidar payload ---------------- */
export function buildDrone(kit: Kit) {
  // origin = bottom of the skids; front = −Z. Heights in comments are the mating faces.
  const root = new THREE.Group(); root.name = 'uav'
  const carbon = kit.dark, shell = kit.shell

  /* landing gear: skids 0 → 0.018, legs up into mounts under the belly plate (0.206) */
  for (const sx of [-1, 1]) {
    const skid = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.46, 12), carbon, `skid${sx}`, sx * 0.19, 0.009, 0)
    skid.rotation.x = Math.PI / 2
    root.add(skid)
    for (const sz of [-1, 1]) root.add(mesh(new THREE.SphereGeometry(0.011, 12, 8), kit.rubber, 'skidCap', sx * 0.19, 0.009, sz * 0.23))
    for (const sz of [-1, 1]) root.add(tube(new THREE.Vector3(sx * 0.19, 0.014, sz * 0.12), new THREE.Vector3(sx * 0.105, 0.192, sz * 0.07), 0.008, carbon, 'leg'))
    root.add(box(0.036, 0.016, 0.18, carbon, `legMount${sx}`, sx * 0.105, 0.198, 0)) // 0.190 → 0.206
    // landing-gear antenna blade on the rear leg
    root.add(tube(new THREE.Vector3(sx * 0.16, 0.07, 0.105), new THREE.Vector3(sx * 0.16, 0.135, 0.095), 0.0045, kit.rubber, 'antenna'))
  }

  /* fuselage stack */
  root.add(rbox(0.24, 0.012, 0.3, 0.004, carbon, 'bellyPlate', 0, 0.212)) // 0.206 → 0.218
  root.add(rbox(0.22, 0.07, 0.28, 0.02, carbon, 'fuselage', 0, 0.253)) // 0.218 → 0.288
  root.add(rbox(0.2, 0.02, 0.24, 0.01, shell, 'topCover', 0, 0.297)) // 0.287 → 0.307
  root.add(box(0.014, 0.021, 0.242, kit.brand, 'coverStripe', 0, 0.2975, 0))
  for (const sx of [-1, 1]) for (let v = 0; v < 3; v++) root.add(box(0.002, 0.006, 0.05, kit.rubber, 'vent', sx * 0.1105, 0.24 + v * 0.012, 0.04))
  // smart battery on top, charge gauge on its rear face
  root.add(rbox(0.12, 0.045, 0.17, 0.008, kit.metal, 'battery', 0, 0.329)) // 0.307 → 0.352
  root.add(box(0.1, 0.006, 0.02, kit.rubber, 'batteryLatch', 0, 0.355, -0.06))
  const gauge = new THREE.MeshBasicMaterial({ color: 0x4fc3ff, toneMapped: false })
  for (let i = 0; i < 4; i++) root.add(box(0.012, 0.005, 0.002, gauge, 'gaugeLed', -0.027 + i * 0.018, 0.33, 0.0855))
  // RTK antenna on a short mast at the rear
  root.add(cylY(0.005, 0.005, 0.307, 0.39, carbon, 'rtkMast', 10, 0, 0.1))
  root.add(cylY(0.032, 0.03, 0.39, 0.404, shell, 'rtkPuck', 24, 0, 0.1))
  // front: FPV camera between two obstacle-sensing stereo pairs
  const lens = (x: number, y: number, r: number, name: string) => {
    const l = mesh(new THREE.CylinderGeometry(r, r, 0.006, 16), kit.glass, name, x, y, -0.142)
    l.rotation.x = Math.PI / 2
    root.add(l)
  }
  for (const sx of [-1, 1]) { lens(sx * 0.07, 0.262, 0.007, 'stereoL'); lens(sx * 0.045, 0.262, 0.007, 'stereoR') }
  lens(0, 0.252, 0.012, 'fpvCamera')

  /* arms: folding hinge at r = 0.12, carbon tube to r = 0.40, finned motor at the tip */
  const props: THREE.Group[] = []
  const discs: THREE.Mesh[] = []
  const discMat = new THREE.MeshBasicMaterial({ color: 0x9fb4c4, transparent: true, opacity: 0, depthWrite: false })
  const led = (c: number) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false })
  const leds = [led(0xff3b30), led(0x34ff6a), led(0xffffff), led(0xffffff)]
  const bladeShape = new THREE.Shape()
  bladeShape.moveTo(0, -0.016); bladeShape.lineTo(0.05, -0.018); bladeShape.quadraticCurveTo(0.15, -0.012, 0.172, -0.002)
  bladeShape.lineTo(0.172, 0.004); bladeShape.quadraticCurveTo(0.12, 0.012, 0.05, 0.014); bladeShape.lineTo(0, 0.012)
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.003, bevelEnabled: false })
  bladeGeo.rotateX(-Math.PI / 2) // lie flat in XZ
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    const dx = Math.sin(a), dz = -Math.cos(a)
    const hinge = box(0.05, 0.036, 0.045, carbon, `armHinge${i}`, dx * 0.125, 0.262, dz * 0.125)
    hinge.rotation.y = -a
    root.add(hinge)
    root.add(tube(new THREE.Vector3(dx * 0.14, 0.262, dz * 0.14), new THREE.Vector3(dx * 0.4, 0.262, dz * 0.4), 0.013, carbon, `arm${i}`))
    const mx = dx * 0.4, mz = dz * 0.4
    root.add(cylY(0.024, 0.02, 0.232, 0.262, carbon, `motorMount${i}`, 16, mx, mz))
    root.add(cylY(0.03, 0.03, 0.262, 0.272, kit.dark, `stator${i}`, 24, mx, mz))
    root.add(cylY(0.031, 0.029, 0.272, 0.302, kit.metal, `motorBell${i}`, 24, mx, mz))
    const fins: THREE.BufferGeometry[] = []
    for (let f = 0; f < 10; f++) {
      const fa = (f / 10) * Math.PI * 2
      fins.push(new THREE.BoxGeometry(0.004, 0.026, 0.006).rotateY(-fa).translate(mx + Math.cos(fa) * 0.031, 0.287, mz + Math.sin(fa) * 0.031))
    }
    root.add(mesh(mergeGeometries(fins)!, kit.dark, `motorFins${i}`))
    root.add(cylY(0.013, 0.011, 0.302, 0.314, kit.dark, `propAdapter${i}`, 12, mx, mz))
    root.add(mesh(new THREE.SphereGeometry(0.008, 10, 8), leds[i], `navLight${i}`, mx, 0.226, mz))
    const prop = new THREE.Group(); prop.position.set(mx, 0.31, mz)
    for (const s of [0, Math.PI]) {
      const holder = new THREE.Group(); holder.rotation.y = s
      const blade = mesh(bladeGeo, kit.rubber, 'blade', 0.008, 0, 0)
      blade.rotation.x = 0.1 // blade pitch
      holder.add(blade)
      prop.add(holder)
    }
    props.push(prop)
    root.add(prop)
    const disc = mesh(new THREE.CircleGeometry(0.178, 40), discMat, `propDisc${i}`, mx, 0.311, mz)
    disc.rotation.x = -Math.PI / 2
    discs.push(disc)
    root.add(disc)
  }

  /* payload: damped mount → yaw motor → U-bracket → lidar + RGB camera, under the nose */
  const pz = -0.05
  root.add(box(0.07, 0.012, 0.07, carbon, 'gimbalPlate', 0, 0.2, pz)) // 0.194 → 0.206
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) root.add(mesh(new THREE.SphereGeometry(0.007, 10, 8), kit.rubber, 'damper', sx * 0.027, 0.188, pz + sz * 0.027))
  root.add(box(0.06, 0.006, 0.06, carbon, 'damperPlate', 0, 0.179, pz))
  root.add(cylY(0.02, 0.02, 0.158, 0.176, kit.metal, 'yawMotor', 20, 0, pz))
  root.add(box(0.11, 0.01, 0.024, carbon, 'bracketTop', 0, 0.153, pz)) // 0.148 → 0.158
  for (const sx of [-1, 1]) {
    root.add(box(0.01, 0.058, 0.024, carbon, `bracketArm${sx}`, sx * 0.05, 0.124, pz)) // 0.095 → 0.153
    root.add(cylX(0.009, 0.008, kit.metal, `rollPin${sx}`, sx * 0.0455, 0.127, pz))
  }
  root.add(rbox(0.082, 0.06, 0.07, 0.008, shell, 'lidarBody', 0, 0.127, pz)) // x ±0.041, y 0.097 → 0.157
  const win = mesh(new THREE.CircleGeometry(0.021, 32), kit.glass, 'lidarWindow', -0.013, 0.127, pz - 0.0355)
  win.rotation.y = Math.PI
  root.add(win)
  const ring = mesh(new THREE.RingGeometry(0.021, 0.025, 32), kit.dark, 'lidarBezel', -0.013, 0.127, pz - 0.0354)
  ring.rotation.y = Math.PI
  root.add(ring)
  const cam = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.008, 18), kit.glass, 'rgbCamera', 0.024, 0.127, pz - 0.038)
  cam.rotation.x = Math.PI / 2
  root.add(cam)
  const pod = new THREE.Object3D(); pod.position.set(-0.013, 0.127, pz - 0.036); root.add(pod)

  return { root, props, discs, discMat, pod }
}

/** Hard transport case the drone sits on before take-off. */
export function buildCase(kit: Kit) {
  const root = new THREE.Group(); root.name = 'droneCase'
  root.add(rbox(0.74, CASE_TOP, 0.54, 0.03, kit.dark, 'caseShell', 0, CASE_TOP / 2))
  root.add(box(0.745, 0.012, 0.545, kit.rubber, 'caseSeam', 0, CASE_TOP * 0.62))
  for (const sx of [-1, 1]) root.add(box(0.07, 0.04, 0.012, kit.brand, `latch${sx}`, sx * 0.2, CASE_TOP * 0.62, 0.274))
  root.add(box(0.2, 0.02, 0.03, kit.rubber, 'caseHandle', 0, CASE_TOP * 0.55, 0.285))
  root.position.set(CASE_XZ.x, 0, CASE_XZ.z)
  return { root }
}

/* ---------------- hydrographic survey boat (uncrewed catamaran) ---------------- */
/**
 * Twin hulls under a deck, electronics box, GNSS mast and thrusters. Origin = the waterline at
 * the boat's centre; everything below the waterline is clipped so it reads as floating.
 */
export function buildUsv(kit: Kit, waterline: THREE.Plane) {
  const root = new THREE.Group(); root.name = 'surveyBoat'
  const clip = (m: THREE.Material) => { const c = m.clone(); (c as THREE.MeshPhysicalMaterial).clippingPlanes = [waterline]; return c }
  const hullMat = clip(kit.shell), darkMat = clip(kit.dark), brandMat = clip(kit.brand)
  for (const sx of [-1, 1]) {
    const hull = mesh(new THREE.CapsuleGeometry(0.085, 0.92, 6, 18), hullMat, `hull${sx}`, sx * 0.24, 0.0, 0)
    hull.rotation.x = Math.PI / 2
    hull.scale.set(1, 1, 0.8)
    root.add(hull)
    root.add(box(0.02, 0.02, 0.9, brandMat, `hullStripe${sx}`, sx * 0.24 + sx * 0.07, 0.035, 0))
    // thruster pod at the stern
    const pod = mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.12, 14), darkMat, `thruster${sx}`, sx * 0.24, -0.04, 0.52)
    pod.rotation.x = Math.PI / 2
    root.add(pod)
    for (const sz of [-1, 1]) root.add(box(0.04, 0.09, 0.05, darkMat, 'strut', sx * 0.24, 0.1, sz * 0.3)) // hull → deck
  }
  root.add(rbox(0.56, 0.035, 0.78, 0.01, kit.dark, 'deck', 0, 0.162)) // 0.145 → 0.18
  root.add(rbox(0.3, 0.12, 0.34, 0.015, kit.shell, 'electronics', 0, 0.24, 0.05)) // 0.18 → 0.30
  root.add(box(0.302, 0.018, 0.342, kit.brand, 'boxStripe', 0, 0.27, 0.05))
  root.add(cylY(0.012, 0.012, 0.3, 0.62, kit.dark, 'mast', 12, 0, 0.12))
  root.add(cylY(0.05, 0.048, 0.62, 0.64, kit.dark, 'gnssBase', 24, 0, 0.12))
  const dome = mesh(new THREE.SphereGeometry(0.048, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), kit.shell, 'gnssDome', 0, 0.64, 0.12)
  dome.scale.y = 0.55
  root.add(dome)
  root.add(cylY(0.004, 0.004, 0.3, 0.52, kit.rubber, 'radioWhip', 8, 0.1, 0.18))
  root.add(mesh(new THREE.SphereGeometry(0.012, 10, 8), new THREE.MeshBasicMaterial({ color: 0x34ff6a, toneMapped: false }), 'navLight', 0, 0.31, -0.13))
  root.position.set(POND.x, POND.level, POND.z)
  root.rotation.y = 0.5
  return { root, clipMaterials: [hullMat, darkMat, brandMat] }
}
