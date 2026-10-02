/**
 * The survey itself, as scene elements that each mean exactly one thing:
 *   set-up ring     the point the instrument is centred over (FIELD)
 *   portal          a faint pool of light on the set-up pad (the rings are drawn in the scan points)
 *   control point   the known position on the hilltop (CONTROL)
 *   beam + hit      one observation: instrument → exact terrain point, which keeps its light (MEASURE)
 *   water           the pond the survey boat works on (METHODS)
 *   capture layer   dense returns inside the surveyed parcel, filled strip by strip (CAPTURE)
 *   contours        the same terrain resolved into 2 m / 10 m contours inside the same boundary (MODEL)
 *   boundary        the parcel edge: blue while it's data, orange once it's a surveyed boundary
 */
import * as THREE from 'three'
import { groundToWorld, SITE } from './geo'
import { H, POND, mulberry32 } from './terrainField'
import { buildFatLine, buildMarkers, type Polyline } from './lines'
import { BOUNDARY, BOUNDARY_CENTER, CONTROL_POINT, TARGET_POINT } from './choreo'

const draped = (x: number, z: number, lift: number, out: number[]) => {
  const t = [0, 0, 0]
  groundToWorld(x, z, H(x, z) + lift, t, 0)
  out.push(t[0], t[1], t[2])
}

function inQuad(x: number, z: number) {
  let pos = 0, neg = 0
  for (let i = 0; i < 4; i++) {
    const [ax, az] = BOUNDARY[i], [bx, bz] = BOUNDARY[(i + 1) % 4]
    const s = (bx - ax) * (z - az) - (bz - az) * (x - ax)
    if (s >= 0) pos++; else neg++
  }
  return pos === 4 || neg === 4
}

/* ---------------- FIELD: the set-up mark ---------------- */
export function buildSetupRing() {
  const pts: number[] = []
  for (let i = 0; i <= 72; i++) { const a = (i / 72) * Math.PI * 2; pts.push(Math.cos(a) * 0.9, 0.012, Math.sin(a) * 0.9) }
  const ring = buildFatLine([{ pts }], { width: 1.2, color: '#ff7a2f', alpha: 0.8, additive: true })
  ring.mesh.name = 'setupRing'
  const mark = buildMarkers(new Float32Array([0, 0.02, 0]), { size: 9, color: '#ff7a2f', ring: 0 })
  return { ring, mark }
}

/* ---------------- FIELD: the portal ---------------- */
/** Radius of the glow disc: it stays inside the exactly-flat pad (r < 9 m), so it can lie on a plane. */
export const PORTAL_R = 8.6
export function buildPortal() {
  const geo = new THREE.PlaneGeometry(PORTAL_R * 2, PORTAL_R * 2, 1, 1)
  geo.rotateX(-Math.PI / 2)
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uR: { value: PORTAL_R } },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uAlpha, uR;
      varying vec2 vP;
      const float TAU = 6.2831853;
            void main() {
        float r = length(vP);
        // a faint pool of light on the pad; the rings themselves are drawn in the scan points
        vec3 c = vec3(0.03, 0.16, 0.32) * exp(-r * r / 7.0) * (0.8 + 0.2 * sin(uTime * 0.8));
        c *= 1.0 - smoothstep(uR * 0.6, uR * 0.95, r);
        gl_FragColor = vec4(c * uAlpha, 1.0);
      }
    `,
  })
  const mesh = new THREE.Mesh(geo, material)
  mesh.position.y = 0.018
  mesh.renderOrder = 3
  mesh.name = 'portal'
  return { mesh, material }
}

/* ---------------- CONTROL: the known point ---------------- */
export const CONTROL_STEM = 34
export function buildControlPoint() {
  const c = CONTROL_POINT
  const marker = buildMarkers(new Float32Array([c.x, c.y + 0.3, c.z]), { size: 58, color: '#ff8a3d', ring: 1 })
  const stem = buildFatLine([{ pts: [c.x, c.y + 0.3, c.z, c.x, c.y + CONTROL_STEM, c.z] }], { width: 2.6, color: '#ff9a55', alpha: 0.95, additive: true, pulse: 1.4, pulseSpeed: 0.5 })
  stem.mesh.name = 'controlStem'
  return { marker, stem, labelAnchor: new THREE.Vector3(c.x, c.y + CONTROL_STEM, c.z) }
}

/* ---------------- MEASURE: one observation ---------------- */
export function buildMeasurement() {
  const t = TARGET_POINT
  const beam = buildFatLine([], { width: 2.4, color: '#1686e0', additive: true, pulse: 0.8, pulseSpeed: 0.7, headGlow: 1.2 }, 1)
  beam.mesh.name = 'measureBeam'
  const hit = buildMarkers(new Float32Array([t.x, t.y + 0.25, t.z]), { size: 30, color: '#7fd0ff', ring: 1 })
  return { beam, hit, point: new THREE.Vector3(t.x, t.y + 0.25, t.z), labelAnchor: new THREE.Vector3(t.x, t.y + 0.25, t.z) }
}

/* ---------------- METHODS: the pond's surface ---------------- */
export function buildWater() {
  const pos: number[] = []
  const rnd = mulberry32(31)
  for (let x = -POND.rx; x <= POND.rx; x += 0.13) for (let z = -POND.rz; z <= POND.rz; z += 0.13) {
    const jx = x + (rnd() - 0.5) * 0.08, jz = z + (rnd() - 0.5) * 0.08
    if ((jx / POND.rx) ** 2 + (jz / POND.rz) ** 2 > 0.98) continue
    pos.push(POND.x + jx, POND.level, POND.z + jz)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uAlpha: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform float uTime, uPx;
      varying float vB;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float w = sin(position.x * 3.1 + uTime * 1.3) * sin(position.z * 2.3 - uTime * 0.9);
        vB = 0.55 + 0.45 * w;
        gl_PointSize = clamp(0.1 * uPx / -mv.z, 1.0, 3.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: 'uniform float uAlpha; varying float vB; void main(){ gl_FragColor = vec4(mix(vec3(0.04,0.12,0.22), vec3(0.2,0.45,0.7), vB * vB), 0.7 * uAlpha); }',
  })
  const points = new THREE.Points(geo, material)
  points.name = 'pond'
  return { points, material }
}

/* ---------------- CAPTURE: dense returns inside the parcel ---------------- */
export function buildCaptureLayer(spacing: number) {
  const xs = BOUNDARY.map((b) => b[0]), zs = BOUNDARY.map((b) => b[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs)
  const rnd = mulberry32(55)
  const pos: number[] = []
  const tmp = [0, 0, 0]
  for (let x = x0; x <= x1; x += spacing) for (let z = z0; z <= z1; z += spacing) {
    const jx = x + (rnd() - 0.5) * spacing * 0.8, jz = z + (rnd() - 0.5) * spacing * 0.8
    if (!inQuad(jx, jz)) continue
    groundToWorld(jx, jz, H(jx, jz) + 0.08, tmp, 0)
    pos.push(tmp[0], tmp[1], tmp[2])
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uPx: { value: 800 }, uLegs: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
      uLegProg: { value: new THREE.Vector3() }, uSwath: { value: 50 }, uAlpha: { value: 1 }, uSize: { value: spacing * 0.8 },
    },
    vertexShader: /* glsl */ `
      uniform float uPx, uSwath, uAlpha, uSize;
      uniform vec4 uLegs[3];
      uniform vec3 uLegProg;
      varying float vA;
      void main() {
        float painted = 0.0;
        for (int i = 0; i < 3; i++) {
          vec2 a = uLegs[i].xy, b = uLegs[i].zw, ab = b - a;
          float t = dot(position.xz - a, ab) / max(dot(ab, ab), 1.0);
          float across = length(position.xz - (a + ab * clamp(t, 0.0, 1.0)));
          painted = max(painted, step(0.0, t) * step(t, uLegProg[i]) * (1.0 - smoothstep(uSwath * 0.9, uSwath, across)));
        }
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float size = uSize * uPx / -mv.z;
        vA = painted * uAlpha * min(size * size, 1.0);
        gl_PointSize = clamp(size, 1.0, 2.6);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: 'varying float vA; void main(){ if (vA < 0.01) discard; gl_FragColor = vec4(vec3(0.2, 0.6, 1.0) * vA, 1.0); }',
  })
  const points = new THREE.Points(geo, material)
  points.frustumCulled = false
  points.renderOrder = 2
  points.name = 'captureLayer'
  return { points, material, count: pos.length / 3 }
}

/* ---------------- MODEL: contours + boundary ---------------- */
export function buildModel() {
  const xs = BOUNDARY.map((b) => b[0]), zs = BOUNDARY.map((b) => b[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs)
  const G = 3
  const nx = Math.ceil((x1 - x0) / G), nz = Math.ceil((z1 - z0) / G)
  const hs = new Float32Array((nx + 1) * (nz + 1))
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) hs[j * (nx + 1) + i] = H(x0 + i * G, z0 + j * G)
  const maxR = Math.max(...BOUNDARY.map(([x, z]) => Math.hypot(x - BOUNDARY_CENTER.x, z - BOUNDARY_CENTER.z)))
  const minor: Polyline[] = [], major: Polyline[] = []
  let lo = Infinity, hi = -Infinity
  for (const v of hs) { lo = Math.min(lo, v); hi = Math.max(hi, v) }
  const STEP = 2
  // marching squares, one segment per cell crossing, clipped to the parcel
  for (let lev = Math.ceil(lo / STEP) * STEP; lev <= hi; lev += STEP) {
    const isMajor = Math.round(lev) % 10 === 0
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const c = [hs[j * (nx + 1) + i], hs[j * (nx + 1) + i + 1], hs[(j + 1) * (nx + 1) + i + 1], hs[(j + 1) * (nx + 1) + i]]
      const px = [x0 + i * G, x0 + (i + 1) * G, x0 + (i + 1) * G, x0 + i * G]
      const pz = [z0 + j * G, z0 + j * G, z0 + (j + 1) * G, z0 + (j + 1) * G]
      const cross: [number, number][] = []
      for (let e = 0; e < 4; e++) {
        const a = c[e], b = c[(e + 1) % 4]
        if ((a < lev) !== (b < lev)) {
          const t = (lev - a) / (b - a)
          cross.push([px[e] + (px[(e + 1) % 4] - px[e]) * t, pz[e] + (pz[(e + 1) % 4] - pz[e]) * t])
        }
      }
      for (let s = 0; s + 1 < cross.length; s += 2) {
        const [ax, az] = cross[s], [bx, bz] = cross[s + 1]
        if (!inQuad(ax, az) || !inQuad(bx, bz)) continue
        const pts: number[] = []
        draped(ax, az, 0.35, pts); draped(bx, bz, 0.35, pts)
        const ta = Math.hypot(ax - BOUNDARY_CENTER.x, az - BOUNDARY_CENTER.z) / maxR
        const tb = Math.hypot(bx - BOUNDARY_CENTER.x, bz - BOUNDARY_CENTER.z) / maxR
        ;(isMajor ? major : minor).push({ pts, t: [ta, tb], id: 0 })
      }
    }
  }
  const minorLines = buildFatLine(minor, { width: 1, color: '#bfe6ff', alpha: 0.55, additive: true })
  const majorLines = buildFatLine(major, { width: 1.8, color: '#ffffff', alpha: 0.9, additive: true, headGlow: 0.6 })
  minorLines.material.uniforms.uCount.value = 1
  majorLines.material.uniforms.uCount.value = 1
  minorLines.mesh.name = 'contoursMinor'
  majorLines.mesh.name = 'contoursMajor'

  // boundary, draped every 2 m; t runs around the perimeter so it draws like a pen
  const bpts: number[] = [], bt: number[] = []
  let per = 0
  const edges = BOUNDARY.map((a, i) => { const b = BOUNDARY[(i + 1) % 4]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); per += l; return l })
  let acc = 0
  BOUNDARY.forEach((a, i) => {
    const b = BOUNDARY[(i + 1) % 4], n = Math.ceil(edges[i] / 2)
    for (let s = i === 0 ? 0 : 1; s <= n; s++) {
      const f = s / n
      draped(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 0.6, bpts)
      bt.push((acc + edges[i] * f) / per)
    }
    acc += edges[i]
  })
  const boundaryData = buildFatLine([{ pts: bpts, t: bt }], { width: 2, color: '#3fb3ff', alpha: 1, additive: true, headGlow: 1.5 })
  const boundaryLegal = buildFatLine([{ pts: bpts, t: bt }], { width: 2.2, color: '#ff8a3d', alpha: 1 })
  boundaryData.mesh.name = 'boundaryData'
  boundaryLegal.mesh.name = 'boundaryLegal'

  // three contour labels on 10 m contours, spread across the parcel's centre line
  const labels: { pos: THREE.Vector3; text: string }[] = []
  const [a0, a1, a2, a3] = BOUNDARY
  // search across the valley (edge 0–1 → edge 3–2), where contours stack up on the walls
  const midL = [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2], midR = [(a3[0] + a2[0]) / 2, (a3[1] + a2[1]) / 2]
  let prev = H(midL[0], midL[1])
  for (let s = 1; s <= 200 && labels.length < 3; s++) {
    const f = s / 200
    const x = midL[0] + (midR[0] - midL[0]) * f, z = midL[1] + (midR[1] - midL[1]) * f
    const h = H(x, z)
    const lev = Math.floor(Math.max(h, prev) / 10) * 10
    if (Math.min(h, prev) < lev && f > 0.12 && f < 0.88 && !labels.some((l) => Math.hypot(l.pos.x - x, l.pos.z - z) < 45)) {
      const p = [0, 0, 0]; groundToWorld(x, z, lev + 0.6, p, 0)
      labels.push({ pos: new THREE.Vector3(p[0], p[1], p[2]), text: `${Math.round(SITE.elev + lev)}` })
    }
    prev = h
  }
  return { minorLines, majorLines, boundaryData, boundaryLegal, labels }
}
