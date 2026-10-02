/**
 * Ground-level effects. Everything that touches the ground is draped on H(x,z), and everything
 * that leaves the instrument starts at a real anchor on it.
 */
import * as THREE from 'three'
import { groundToWorld } from './geo'
import { H, POND } from './terrainField'
import { buildFatLine, buildMarkers, type Polyline } from './lines'
import { buildMonument, type Kit } from './instrument'
import { SCAN_RANGE } from './terrain'

/* ---------------- FIELD: survey waves rolling out across the ground ---------------- */
/**
 * A polar surface draped on the terrain around the instrument. Soft glowing wave bands roll
 * outward from the tripod, each with a gentle wobble so they read as waves, not drawn circles.
 */
export function buildRipples() {
  const RINGS = 90, SEG = 360, RMAX = 90
  const pos: number[] = [], rad: number[] = [], ang: number[] = [], idx: number[] = []
  const tmp = [0, 0, 0]
  for (let i = 0; i <= RINGS; i++) {
    const r = 1.2 + (RMAX - 1.2) * Math.pow(i / RINGS, 1.3)
    for (let j = 0; j < SEG; j++) {
      const a = (j / SEG) * Math.PI * 2
      const x = Math.sin(a) * r, z = Math.cos(a) * r
      // over the pond the waves ride on the water, not down in its basin
      groundToWorld(x, z, Math.max(H(x, z), POND.level) + 0.05 + r * 0.002, tmp, 0)
      pos.push(tmp[0], tmp[1], tmp[2]); rad.push(r); ang.push(a)
    }
  }
  for (let i = 0; i < RINGS; i++) for (let j = 0; j < SEG; j++) {
    const a = i * SEG + j, b = i * SEG + ((j + 1) % SEG), c = a + SEG, d = b + SEG
    idx.push(a, c, b, b, c, d)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('aR', new THREE.Float32BufferAttribute(rad, 1))
  geo.setAttribute('aAng', new THREE.Float32BufferAttribute(ang, 1))
  geo.setIndex(idx)
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uAmp: { value: 0 }, uPond: { value: new THREE.Vector4(POND.x, POND.z, POND.rx, POND.rz) } },
    vertexShader: /* glsl */ `
      attribute float aR;
      attribute float aAng;
      varying vec2 vP;
      varying float vR;
      varying float vAng;
      varying float vDist;
      void main() {
        vR = aR; vAng = aAng; vP = position.xz;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDist = length(mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uAmp;
      uniform vec4 uPond;
      varying vec2 vP;
      varying float vR;
      varying float vAng;
      varying float vDist;
      void main() {
        // over the pond the waves soften into faint ripples on the water
        vec2 pe = (vP - uPond.xy) / uPond.zw;
        float onWater = 1.0 - smoothstep(1.2, 3.2, dot(pe, pe));
        // a gentle wobble in each band, drifting slowly, so the waves never read as drawn circles
        float wob = (sin(vAng * 3.0 + uTime * 0.35) * 0.9 + sin(vAng * 7.0 - uTime * 0.5 + vR * 0.08) * 0.45) * smoothstep(4.0, 30.0, vR);
        float spacing = 7.5 + vR * 0.06;                        // bands spread a little as they travel
        float ph = fract((vR + wob - uTime * 3.2) / spacing);   // 0 → 1 across one wave
        // a soft crest with a long trailing glow behind it, like a swell passing through the ground
        float d = ph - 0.5;
        float core = exp(-pow(d / (0.018 + vDist * 0.0004), 2.0));
        float glow = exp(-pow(d / 0.11, 2.0)) * 0.35;
        float band = core + glow;
        float fade = smoothstep(2.5, 9.0, vR) * (1.0 - smoothstep(45.0, 88.0, vR));
        float a = band * fade * uAmp * smoothstep(3.0, 11.0, vDist) * (1.0 - 0.8 * onWater); // never a shard right under the camera
        gl_FragColor = vec4(vec3(0.28, 0.66, 1.0) * a * 0.75, 1.0);
      }
    `,
  })
  const mesh = new THREE.Mesh(geo, material)
  mesh.frustumCulled = false
  mesh.renderOrder = 3
  mesh.name = 'surveyWaves'
  return { mesh, material }
}

/* ---------------- scan fan: rays from the telescope to where they hit the ground ---------------- */
export const FAN_SAMPLES = 64
export function buildFan() {
  const n = FAN_SAMPLES
  const pos = new Float32Array((n + 2) * 3) // apex, n hits, top ray end
  const aR = new Float32Array(n + 2)
  for (let i = 0; i < n; i++) aR[i + 1] = i / (n - 1)
  aR[n + 1] = 1
  const idx: number[] = []
  for (let i = 1; i < n; i++) idx.push(0, i, i + 1)
  idx.push(0, n, n + 1)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aR', new THREE.BufferAttribute(aR, 1))
  geo.setIndex(idx)
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uAmp: { value: 0 } },
    vertexShader: 'attribute float aR; varying float vR; void main(){ vR = aR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uAmp;
      varying float vR;
      void main() {
        float a = uAmp * (0.09 + 0.34 * pow(1.0 - vR, 2.5));
        gl_FragColor = vec4(vec3(0.55, 0.92, 1.0) * a, 1.0);
      }
    `,
  })
  const mesh = new THREE.Mesh(geo, material)
  mesh.frustumCulled = false
  mesh.renderOrder = 5
  mesh.name = 'scanFan'
  const hitLine = buildFatLine([], { width: 2.4, color: '#bff6ff', additive: true }, n - 1)
  hitLine.mesh.name = 'scanHitLine'

  const tmp = [0, 0, 0]
  /** re-profile the fan for yaw θ from the emitter at (ex, ey, ez); allocation-free */
  const update = (theta: number, ex: number, ey: number, ez: number) => {
    const s = Math.sin(theta), c = Math.cos(theta)
    pos[0] = ex; pos[1] = ey; pos[2] = ez
    let maxSlope = -Infinity
    let px = 0, py = 0, pz = 0, pv = 0
    for (let i = 0; i < n; i++) {
      const r = 0.7 + (SCAN_RANGE - 0.7) * Math.pow(i / (n - 1), 1.7)
      const x = ex + s * r, z = ez + c * r
      const h = H(x, z) + 0.12
      const slope = (h - ey) / r
      let vis = 1, y = h
      if (slope >= maxSlope) maxSlope = slope
      else { vis = 0; y = ey + maxSlope * r } // shadowed: this ray grazes the last ridge
      groundToWorld(x, z, y, tmp, 0)
      pos[(i + 1) * 3] = tmp[0]; pos[(i + 1) * 3 + 1] = tmp[1]; pos[(i + 1) * 3 + 2] = tmp[2]
      if (i > 0) hitLine.setSegment(i - 1, px, py, pz, tmp[0], tmp[1], tmp[2], (i - 1) / (n - 1), i / (n - 1), vis * pv * (1 - i / n) * 0.9 + 0.1 * vis * pv)
      px = tmp[0]; py = tmp[1]; pz = tmp[2]; pv = vis
    }
    // upper edge of the fan: just above horizontal
    const r = SCAN_RANGE
    pos[(n + 1) * 3] = ex + s * r; pos[(n + 1) * 3 + 1] = ey + Math.tan(0.03) * r; pos[(n + 1) * 3 + 2] = ez + c * r
    geo.attributes.position.needsUpdate = true
    hitLine.commit()
  }
  return { mesh, material, hitLine, update }
}

/* ---------------- UAV lidar swath: a curtain from the pod to a draped line across the track ---------------- */
export const SWATH_SAMPLES = 24
export function buildSwath() {
  const n = SWATH_SAMPLES
  const pos = new Float32Array((n + 1) * 3)
  const aR = new Float32Array(n + 1)
  for (let i = 0; i < n; i++) aR[i + 1] = Math.abs(i / (n - 1) - 0.5) * 2
  const idx: number[] = []
  for (let i = 1; i < n; i++) idx.push(0, i, i + 1)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aR', new THREE.BufferAttribute(aR, 1))
  geo.setIndex(idx)
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uAmp: { value: 0 } },
    vertexShader: 'attribute float aR; varying float vR; void main(){ vR = aR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float uAmp; varying float vR; void main(){ float a = uAmp * (0.13 - 0.09 * vR); gl_FragColor = vec4(vec3(0.5, 0.85, 1.0) * a, 1.0); }',
  })
  const mesh = new THREE.Mesh(geo, material)
  mesh.frustumCulled = false
  mesh.renderOrder = 5
  mesh.name = 'uavSwath'
  const line = buildFatLine([], { width: 3, color: '#ffffff', additive: true }, n - 1)
  line.mesh.name = 'uavScanLine'
  const tmp = [0, 0, 0]
  /** apex = lidar pod; the line runs across the track (heading yaw), half-width w */
  const update = (ax: number, ay: number, az: number, yaw: number, w: number) => {
    pos[0] = ax; pos[1] = ay; pos[2] = az
    const cx = Math.cos(yaw), cz = -Math.sin(yaw) // across-track (right of the heading)
    let px = 0, py = 0, pz = 0
    for (let i = 0; i < n; i++) {
      const o = (i / (n - 1) - 0.5) * 2 * w
      const x = ax + cx * o, z = az + cz * o
      groundToWorld(x, z, H(x, z) + 0.3, tmp, 0)
      pos[(i + 1) * 3] = tmp[0]; pos[(i + 1) * 3 + 1] = tmp[1]; pos[(i + 1) * 3 + 2] = tmp[2]
      if (i > 0) line.setSegment(i - 1, px, py, pz, tmp[0], tmp[1], tmp[2], 0, 1)
      px = tmp[0]; py = tmp[1]; pz = tmp[2]
    }
    geo.attributes.position.needsUpdate = true
    line.commit()
  }
  return { mesh, material, line, update }
}

/* ---------------- EDM beam ---------------- */
export function buildBeam() {
  const line = buildFatLine([], { width: 2.2, color: '#ff4a2e', additive: true, pulse: 2.2, pulseSpeed: 0.9 }, 1)
  line.mesh.name = 'edmBeam'
  const glowPos = new Float32Array(3)
  const glow = buildMarkers(glowPos, { size: 22, color: '#ff5a36' })
  return { line, glow }
}

/* ---------------- survey drawing: parcels, grid, monuments ---------------- */
export const CORNERS: [number, number][] = [
  [-52, 32], [-6, 46], [41, 38], [64, -8], [49, -54], [3, -72], [-42, -47], [-61, -6], [15, -13],
]
const PARCELS: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 0], // boundary of the holding
  [1, 8, 5], // lot line splitting west from east
  [8, 3], // lot line splitting NE from SE
]

function drape(a: [number, number], b: [number, number], lift: number, out: number[]) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const steps = Math.max(2, Math.ceil(len / 1.5))
  const tmp = [0, 0, 0]
  for (let s = out.length ? 1 : 0; s <= steps; s++) {
    const t = s / steps
    const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t
    groundToWorld(x, z, H(x, z) + lift, tmp, 0)
    out.push(tmp[0], tmp[1], tmp[2])
  }
}

export function buildDrawing(kit: Kit) {
  const parcelLines: Polyline[] = PARCELS.map((ids, i) => {
    const pts: number[] = []
    for (let k = 0; k < ids.length - 1; k++) drape(CORNERS[ids[k]], CORNERS[ids[k + 1]], 0.3, pts)
    // parametrise by arc length so the pen moves at constant speed
    const n = pts.length / 3, t = new Float32Array(n)
    for (let j = 1; j < n; j++) t[j] = t[j - 1] + Math.hypot(pts[j * 3] - pts[j * 3 - 3], pts[j * 3 + 1] - pts[j * 3 - 2], pts[j * 3 + 2] - pts[j * 3 - 1])
    for (let j = 0; j < n; j++) t[j] /= t[n - 1]
    return { pts, t, id: i }
  })
  const parcels = buildFatLine(parcelLines, { width: 2.2, color: '#e9f7ff', alpha: 0.95, stagger: 0.9, headGlow: 1.6 })
  parcels.mesh.name = 'parcels'

  const grid: Polyline[] = []
  const EXT = 275, STEP = 25
  for (let v = -EXT; v <= EXT; v += STEP) {
    for (const axis of [0, 1]) {
      const pts: number[] = []
      const tmp = [0, 0, 0]
      const t: number[] = []
      for (let u = -EXT; u <= EXT; u += 5) {
        const x = axis ? v : u, z = axis ? u : v
        groundToWorld(x, z, H(x, z) + 0.2, tmp, 0)
        pts.push(tmp[0], tmp[1], tmp[2])
        t.push(Math.min(1, Math.hypot(x, z) / EXT))
      }
      grid.push({ pts, t, id: 0 })
    }
  }
  const gridLines = buildFatLine(grid, { width: 1, color: '#5fc8e6', alpha: 0.42, additive: true, headGlow: 0.8 })
  gridLines.material.uniforms.uCount.value = 1
  gridLines.material.uniforms.uFadeT.value = 1
  gridLines.mesh.name = 'grid'

  const monuments = CORNERS.map(([x, z]) => {
    const g = H(x, z)
    const clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(g - 0.004))
    const m = buildMonument(kit, clip)
    m.group.position.set(x, g, z)
    m.group.rotation.y = (x * 13.1 + z * 7.3) % Math.PI
    return { ...m, ground: g }
  })
  const haloPos = new Float32Array(CORNERS.length * 3)
  const halos = buildMarkers(haloPos, { size: 20, color: '#4fc0ff', ring: 1 })
  return { parcels, gridLines, monuments, halos, haloPos }
}
