/**
 * An image plate rebuilt as a real 3D point cloud from its depth map, so the transitions into and out
 * of a plate happen in the plate's own world instead of a different one.
 *
 * Every sample of the image becomes a point, pushed out along its camera ray to the distance its depth
 * map gives (white near, black far; the sky sits on a far shell). Seen from the identity pose the cloud
 * reproduces the image exactly, so the plate can cross-fade to it with no seam; moving the camera gives
 * true parallax. `scan` blends each point's colour to the plate's aligned LiDAR twin; `assemble` < 1
 * scatters the points out along random directions.
 *
 * Lazy-loaded (it brings three.js with it) and rendered on demand by PlateStage, into a canvas that
 * sits inside the plate's own box, so it shares the plate's cover-fit and camera push.
 */
import * as THREE from 'three'

export type CloudParams = {
  alpha: number // overall opacity
  assemble: number // 1 = every point in place, 0 = fully scattered
  scan: number // 0 = photo colours, 1 = scan colours
  push: number // camera travel along the view axis in scene units (+ = forward into the image)
  rise: number // camera height offset
  yaw: number // camera turn (radians)
}

const FOV = 50 // assumed vertical field of view of the generated image
const NEAR = 3, FAR = 120, SKY = 420

export class DepthCloud {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private material: THREE.ShaderMaterial
  private cols: number
  private last = ''
  ready = false

  constructor(canvas: HTMLCanvasElement, urls: { photo: string; scan: string; depth: string }, aspect: number, step = 4, onReady?: () => void) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: location.search.includes('frame=') /* review captures */ })
    this.renderer.setClearColor(0x000000, 0)
    this.camera = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 2000)

    // one point per `step` plate pixels (on a 2560-wide plate)
    const cols = Math.round(2560 / step), rows = Math.round(cols / aspect)
    this.cols = cols
    const uv = new Float32Array(cols * rows * 2)
    const rnd = new Float32Array(cols * rows * 4)
    let s = 7
    const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
    for (let y = 0, i = 0; y < rows; y++) for (let x = 0; x < cols; x++, i++) {
      uv[i * 2] = (x + 0.5) / cols
      uv[i * 2 + 1] = (y + 0.5) / rows
      rnd[i * 4] = r() * 2 - 1; rnd[i * 4 + 1] = r() * 2 - 1; rnd[i * 4 + 2] = r() * 2 - 1; rnd[i * 4 + 3] = r()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cols * rows * 3), 3)) // unused; positions come from uv + depth
    geo.setAttribute('aUv', new THREE.BufferAttribute(uv, 2))
    geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), SKY * 2)

    const loader = new THREE.TextureLoader()
    let pending = 3
    const done = () => { if (--pending === 0) { this.ready = true; this.last = ''; onReady?.() } }
    const tex = (url: string) => {
      const t = loader.load(url, done, undefined, () => console.warn('[DepthCloud] failed to load', url))
      t.colorSpace = THREE.SRGBColorSpace
      t.minFilter = THREE.LinearFilter
      t.generateMipmaps = false
      return t
    }
    const depth = tex(urls.depth)
    depth.colorSpace = THREE.NoColorSpace
    const tanH = Math.tan((FOV * Math.PI) / 360)

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: true,
      uniforms: {
        uPhoto: { value: tex(urls.photo) },
        uScan: { value: tex(urls.scan) },
        uDepth: { value: depth },
        uTan: { value: new THREE.Vector2(tanH * aspect, tanH) },
        uAlpha: { value: 1 },
        uAssemble: { value: 1 },
        uScanMix: { value: 0 },
        uCellPx: { value: 2 },
      },
      vertexShader: /* glsl */ `
        attribute vec2 aUv;
        attribute vec4 aRnd;
        uniform sampler2D uPhoto, uScan, uDepth;
        uniform vec2 uTan;
        uniform float uAssemble, uScanMix, uCellPx;
        varying vec3 vCol;
        varying float vA;
        varying float vNear;
        const float NEAR = ${NEAR.toFixed(1)}, FAR = ${FAR.toFixed(1)}, SKY = ${SKY.toFixed(1)};
        void main() {
          vec2 st = vec2(aUv.x, 1.0 - aUv.y);
          float d = texture2D(uDepth, st).r;
          bool sky = d < 0.035;
          // inverse-depth mapping: white = NEAR, black = FAR; the sky on a far shell
          float dist = sky ? SKY : 1.0 / (d * (1.0 / NEAR - 1.0 / FAR) + 1.0 / FAR);
          vec3 ray = vec3((aUv.x * 2.0 - 1.0) * uTan.x, (1.0 - aUv.y * 2.0) * uTan.y, -1.0);
          vec3 p = ray * dist;
          // scatter: points leave along their own direction, rising a little, further for far points
          float k = 1.0 - uAssemble;
          p += (aRnd.xyz * vec3(1.0, 0.6, 1.0) + vec3(0.0, 0.3, 0.0)) * k * (1.5 + dist * 0.12);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          // at the identity pose a point covers its own sample cell; closer than that it grows
          gl_PointSize = clamp(uCellPx * 1.35 * dist / max(-mv.z, 0.05), 1.0, 10.0) * mix(1.0, 0.8, k);
          vNear = smoothstep(0.8, 2.2, -mv.z);
          vec3 photo = texture2D(uPhoto, st).rgb;
          vec3 scan = texture2D(uScan, st).rgb;
          // the scan twin is dark away from its lines: keep a little of the photo's form under it
          vec3 scanCol = scan * 1.25 + photo * vec3(0.05, 0.08, 0.14);
          vCol = mix(photo, scanCol, uScanMix);
          vA = sky ? mix(1.0, 0.0, k) : 1.0 - k * aRnd.w * 0.8;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uAlpha, uAssemble;
        varying vec3 vCol;
        varying float vA;
        varying float vNear;
        void main() {
          // square cells tile the image seamlessly when assembled; scattered points round off
          vec2 c = gl_PointCoord - 0.5;
          if (uAssemble < 0.98 && dot(c, c) > 0.25) discard;
          gl_FragColor = vec4(vCol, vA * uAlpha * vNear);
          #include <colorspace_fragment>
        }
      `,
    })
    const pts = new THREE.Points(geo, this.material)
    pts.frustumCulled = false
    this.scene.add(pts)
  }

  private size = ''
  setSize(cssW: number, cssH: number, dpr: number) {
    // cap the backing store: the cloud only ever plays in motion
    const k = Math.min(dpr, 2400 / Math.max(cssW, 1))
    const w = Math.max(2, Math.round(cssW * k)), h = Math.max(2, Math.round(cssH * k))
    if (`${w}x${h}` === this.size) return
    this.size = `${w}x${h}`
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(w, h, false)
    this.material.uniforms.uCellPx.value = w / this.cols
    this.last = ''
  }

  render(p: CloudParams) {
    if (!this.ready) return
    const key = `${p.alpha.toFixed(3)}|${p.assemble.toFixed(3)}|${p.scan.toFixed(3)}|${p.push.toFixed(3)}|${p.rise.toFixed(3)}|${p.yaw.toFixed(4)}`
    if (key === this.last) return // nothing moved: keep the last frame
    this.last = key
    const u = this.material.uniforms
    u.uAlpha.value = p.alpha
    u.uAssemble.value = p.assemble
    u.uScanMix.value = p.scan
    this.camera.position.set(0, p.rise, -p.push)
    this.camera.rotation.set(0, p.yaw, 0)
    this.camera.updateMatrixWorld()
    this.renderer.render(this.scene, this.camera)
  }

  clear() {
    if (this.last === 'clear') return
    this.last = 'clear'
    this.renderer.clear()
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Points
      m.geometry?.dispose()
    })
    for (const v of Object.values(this.material.uniforms)) if (v.value instanceof THREE.Texture) v.value.dispose()
    this.material.dispose()
    this.renderer.dispose()
  }
}
