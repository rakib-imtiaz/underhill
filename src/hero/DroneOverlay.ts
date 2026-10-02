/**
 * The survey UAV as a real 3D model over an image plate. A quadcopter GLB (converted and meshopt-
 * compressed from the OBJ in github.com/rakib-imtiaz/drone) is rendered into a transparent canvas laid
 * over the plate, with an orthographic camera in plate pixels, so it can be placed at any plate point
 * and genuinely yaw to its heading, bank into turns, pitch forward in flight and spin its rotors.
 * Until the GLB arrives the procedural drone from the WebGL scene stands in. Lazy-loaded; renders
 * only while it is shown.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { buildDrone } from './engine/sensors'
import { makeEnvironment, makeKit } from './engine/instrument'

const VIEW_TILT = 0.62 // the plate looks down on the ground at about this angle (rad)

export type DronePose = { x: number; y: number; width: number; yaw: number; bank: number; pitch: number; spin: number; alpha: number; tilt?: number }

export class DroneOverlay {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.OrthographicCamera
  private tilt = new THREE.Group()
  private yaw = new THREE.Group()
  private body = new THREE.Group()
  private model = new THREE.Group() // normalised: 1 unit = tip-to-tip span, body centre at origin, front = −Z
  private props: THREE.Object3D[] = []
  private camPart: THREE.Object3D | null = null // the sensor / gimbal, for spec callouts
  private gearPin: THREE.Object3D | null = null // a fixed point on the landing gear (never the spinning blades)
  private size = ''
  private disposed = false

  constructor(canvas: HTMLCanvasElement, plateW: number, plateH: number) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: location.search.includes('frame=') })
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.scene.environment = makeEnvironment(this.renderer)
    // plate pixels, y down on screen
    this.camera = new THREE.OrthographicCamera(0, plateW, 0, -plateH, -4000, 4000)
    this.camera.position.set(0, 0, 2000)

    const key = new THREE.DirectionalLight(0xfff4e6, 2.6); key.position.set(-0.5, 1, 0.7)
    const rim = new THREE.DirectionalLight(0x8fd3ff, 3.4); rim.position.set(0.7, 0.4, -1)
    const top = new THREE.DirectionalLight(0xffffff, 1.4); top.position.set(0, 1, 0.2); this.scene.add(top)
    this.scene.add(key, rim, new THREE.HemisphereLight(0x9fc0dc, 0x05080d, 0.8))

    this.body.add(this.model)
    this.yaw.add(this.body)
    this.tilt.add(this.yaw)
    this.tilt.rotation.x = VIEW_TILT
    this.scene.add(this.tilt)

    this.useProcedural()
    this.loadModel()
  }

  /** stand-in while the GLB loads: the procedural drone from the WebGL scene */
  private useProcedural() {
    const d = buildDrone(makeKit())
    d.discMat.opacity = 0.1
    for (const disc of d.discs) disc.visible = true
    const g = new THREE.Group()
    d.root.position.y = -0.3
    g.add(d.root)
    g.scale.setScalar(1 / 0.84)
    this.model.add(g)
    this.props = d.props
  }

  private loadModel() {
    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    loader.load('/models/drone.glb', (gltf) => {
      if (this.disposed) return
      const root = gltf.scene
            // an enterprise survey drone: graphite shell, carbon arms and blades, gunmetal motors, orange nav lights
      const mat = {
        shell: new THREE.MeshPhysicalMaterial({ color: '#30353b', roughness: 0.42, metalness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.3 }),
        dark: new THREE.MeshStandardMaterial({ color: '#15181c', roughness: 0.55, metalness: 0.25 }),
        prop: new THREE.MeshStandardMaterial({ color: '#f4f6f8', roughness: 0.4, transparent: true, opacity: 0.92 }), // solid white blades, readable as they turn
        glass: new THREE.MeshPhysicalMaterial({ color: '#0a141b', roughness: 0.04, metalness: 0.5, clearcoat: 1 }),
        metal: new THREE.MeshStandardMaterial({ color: '#6b737b', roughness: 0.28, metalness: 0.95 }),
        light: new THREE.MeshBasicMaterial({ color: '#ff7a2a' }),
      }
      const discMat = new THREE.MeshBasicMaterial({ color: '#e8eef3', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide })
      const cam = new THREE.Vector3()
      let camN = 0
      const props: THREE.Mesh[] = []
      root.updateMatrixWorld(true)
      root.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        const n = m.name.toLowerCase()
        m.material = n.includes('propeller') ? mat.prop
          : n.includes('lens') ? mat.glass
          : n.includes('green_light') ? mat.light
          : n.includes('camera') || n.includes('computer') || n.includes('wires') || n.includes('battery') ? mat.dark
          : n.includes('lathe') ? mat.metal
          : mat.shell
        if (n.includes('propeller')) props.push(m)
        if ((n.includes('camera') || n.includes('lens')) && !this.camPart) this.camPart = m
        if (n.includes('camera') || n.includes('lens')) {
          m.geometry.computeBoundingBox()
          const c = m.geometry.boundingBox!.getCenter(new THREE.Vector3())
          m.localToWorld(c); cam.add(c); camN++
        }
      })
      // normalise: body centre at the origin, span 1 unit
      const box = new THREE.Box3().setFromObject(root)
      const centre = box.getCenter(new THREE.Vector3()), dim = box.getSize(new THREE.Vector3())
      const span = Math.max(dim.x, dim.z)
      root.position.sub(centre)
      const wrap = new THREE.Group()
      wrap.add(root)
      wrap.scale.setScalar(1 / span)
      // face the camera gimbal forward (−Z)
      if (camN) {
        cam.divideScalar(camN).sub(centre)
        wrap.rotation.y = Math.atan2(cam.x, cam.z) + Math.PI
      }
      // each propeller spins about its own hub: re-centre its geometry on its bounding-box centre
      for (const p of props) {
        p.geometry.computeBoundingBox()
        const c = p.geometry.boundingBox!.getCenter(new THREE.Vector3())
        p.geometry.translate(-c.x, -c.y, -c.z)
        p.position.add(c)
        // a faint disc where the blades blur at speed
        const bb = p.geometry.boundingBox!, r = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2
        const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 40), discMat)
        disc.rotation.x = -Math.PI / 2
        p.add(disc)
      }
      // the landing gear's callout point, taken from the airframe alone (blades excluded) and fixed to it
      props.forEach((p) => { p.visible = false })
      wrap.updateMatrixWorld(true)
      const frame = new THREE.Box3().setFromObject(wrap)
      props.forEach((p) => { p.visible = true })
      const pin = new THREE.Object3D()
      pin.position.set(frame.min.x + (frame.max.x - frame.min.x) * 0.62, frame.min.y + (frame.max.y - frame.min.y) * 0.14, (frame.min.z + frame.max.z) / 2)
      const inv = new THREE.Matrix4().copy(wrap.matrixWorld).invert()
      pin.position.applyMatrix4(inv)
      wrap.add(pin)
      this.gearPin = pin
      this.model.clear()
      this.model.add(wrap)
      this.props = props
    }, undefined, (e) => console.warn('[DroneOverlay] GLB failed, keeping the procedural drone:', e))
  }

  /** re-frame the orthographic camera (screen-space use: the view is the stage in CSS px) */
  setView(w: number, h: number) {
    if (this.camera.right === w && this.camera.bottom === -h) return
    this.camera.right = w; this.camera.bottom = -h
    this.camera.updateProjectionMatrix()
  }

  setSize(cssW: number, cssH: number, dpr: number) {
    const k = Math.min(dpr, 1400 / Math.max(cssW, 1)) // it only draws a small moving object
    const w = Math.max(2, Math.round(cssW * k)), h = Math.max(2, Math.round(cssH * k))
    if (`${w}x${h}` === this.size) return
    this.size = `${w}x${h}`
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(w, h, false)
  }

  render(p: DronePose) {
    this.tilt.position.set(p.x, -p.y, 0)
    this.tilt.rotation.x = p.tilt ?? VIEW_TILT // how far the view looks down on the UAV
    this.tilt.scale.setScalar(p.width)
    this.yaw.rotation.y = p.yaw
    this.body.rotation.set(p.pitch, 0, p.bank)
    this.props.forEach((pr, i) => { pr.rotation.y = (i % 2 ? 1 : -1) * p.spin })
    this.renderer.domElement.style.opacity = p.alpha.toFixed(3)
    this.renderer.render(this.scene, this.camera)
  }

  /** screen points (view px) of parts worth calling out, for the pose last rendered:
   *  the upper-right rotor, the sensor gimbal, and the lower right of the landing gear */
  anchors() {
    this.scene.updateMatrixWorld(true)
    const v = new THREE.Vector3()
    const toScreen = (o: THREE.Object3D) => { o.getWorldPosition(v); return { x: v.x, y: -v.y } }
    let rotor: { x: number; y: number } | null = null
    for (const p of this.props) { const q = toScreen(p); if (!rotor || q.x - q.y > rotor.x - rotor.y) rotor = q }
    const sensor = this.camPart ? toScreen(this.camPart) : null
    let gear: { x: number; y: number } | null = null
    if (this.gearPin) gear = toScreen(this.gearPin)
    else { const box = new THREE.Box3().setFromObject(this.model); gear = { x: box.min.x + (box.max.x - box.min.x) * 0.62, y: -(box.min.y + (box.max.y - box.min.y) * 0.14) } }
    return { rotor, sensor, gear }
  }

  dispose() {
    this.disposed = true
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose()
    })
    this.scene.environment?.dispose()
    this.renderer.dispose()
  }
}
