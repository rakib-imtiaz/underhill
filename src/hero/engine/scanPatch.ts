/**
 * CAPTURE → REGION: the survey site as a LiDAR point cloud that stays pinned to the ground while the
 * camera climbs to space. Its size follows the camera, so it always fills the view, and every point is
 * placed on the real sphere (radius R, centre (0,-R,0)), so as it grows it bends over the curve of the
 * planet and settles into it as the region. Round additive points, coloured by height, with a scan
 * sweep trailing round the site (after the hero scene of the Underhill reality-capture site).
 */
import * as THREE from 'three'
import { R } from './geo'

const GRID = 150
const LAT = 10

const rnd = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v) }
const sm = (t: number) => t * t * (3 - 2 * t)
const lattice = (ix: number, iz: number) => rnd(ix * 73.31 + iz * 191.7)
function noise2(x: number, z: number) {
  const fx = x * LAT, fz = z * LAT
  const ix = Math.floor(fx), iz = Math.floor(fz)
  const tx = sm(fx - ix), tz = sm(fz - iz)
  const a = lattice(ix, iz), b = lattice(ix + 1, iz), c = lattice(ix, iz + 1), d = lattice(ix + 1, iz + 1)
  return a + (b - a) * tx + (c + (d - c) * tx - (a + (b - a) * tx)) * tz
}
/** relief on a 30-unit square (as the reference scene): rolling hills plus two summits */
function height(x: number, z: number) {
  let h = noise2(x * 0.055 + 3.7, z * 0.055 + 9.1) * 1.9 + noise2(x * 0.16 + 8.2, z * 0.16 + 1.3) * 0.7
  const dx = x + 7.5, dz = z + 5.0
  h += 2.6 * Math.exp(-(dx * dx + dz * dz) / 26)
  const dx2 = x - 8.0, dz2 = z + 7.0
  h += 1.4 * Math.exp(-(dx2 * dx2 + dz2 * dz2) / 14)
  return 0.25 + h
}

export type ScanPatch = { points: THREE.Points; material: THREE.ShaderMaterial }

export function buildScanPatch(): ScanPatch {
  const n = GRID, count = n * n, AREA = 30
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), seed = new Float32Array(count), ang = new Float32Array(count)
  const cLow = new THREE.Color(0x123a5c).convertSRGBToLinear()
  const cMid = new THREE.Color(0x0082ca).convertSRGBToLinear()
  const cHigh = new THREE.Color(0x8fd8f2).convertSRGBToLinear()
  const cPeak = new THREE.Color(0xe7ff89).convertSRGBToLinear()
  const tmp = new THREE.Color()
  let i = 0
  for (let gz = 0; gz < n; gz++) for (let gx = 0; gx < n; gx++, i++) {
    const u = gx / (n - 1) - 0.5, v = gz / (n - 1) - 0.5
    const y = height(u * AREA, v * AREA)
    // unit patch: x,z in [-0.5, 0.5], y = relief in the same units (the patch is 1 unit across)
    pos[i * 3] = u; pos[i * 3 + 1] = y / AREA; pos[i * 3 + 2] = v
    const t = Math.min(1, Math.max(0, (y - 0.25) / 3.4))
    if (t < 0.5) tmp.lerpColors(cLow, cMid, t * 2); else tmp.lerpColors(cMid, cHigh, (t - 0.5) * 2)
    if (t > 0.96) tmp.lerp(cPeak, ((t - 0.96) / 0.04) * 0.6)
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b
    seed[i] = rnd(i * 1.618)
    ang[i] = Math.atan2(v, u)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
  geo.setAttribute('aAngle', new THREE.BufferAttribute(ang, 1))

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uSpan: { value: 1000 }, // metres across the patch
      uRelief: { value: 1 }, // relief exaggeration
      uR: { value: R },
      uAlpha: { value: 0 },
      uFeather: { value: 0 },
      uSize: { value: 2.1 },
      uPx: { value: 1 }, // drawing-buffer px per CSS px
      uFocal: { value: 1000 }, // px per unit at distance 1
      uBreath: { value: 0 },
      uScanAngle: { value: 0 },
      uScanMix: { value: 0 },
      uGlow: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aSeed;
      attribute float aAngle;
      uniform float uSpan, uRelief, uR, uFeather, uSize, uPx, uFocal, uBreath, uScanAngle, uScanMix, uGlow, uAlpha;
      varying vec3 vColor;
      varying float vA;
      const float TAU = 6.28318530718;
      void main() {
        vec2 xz = position.xz * uSpan;
        float h = position.y * uSpan * uRelief;
        h += sin(position.x * 9.6 + uBreath) * cos(position.z * 8.1 - uBreath * 0.75) * uSpan * 0.002;
        // onto the sphere: arc length along the surface = distance on the patch (exact at any size)
        float r = length(xz);
        vec3 p = vec3(xz.x, h, xz.y);
        if (r > 1e-3) {
          float a = r / uR;
          vec2 dir = xz / r;
          float s = sin(a), hv = sin(a * 0.5);
          vec3 nrm = vec3(dir.x * s, cos(a), dir.y * s);
          // (uR·cos a − uR) written as −2uR·sin²(a/2): no cancellation at small a
          p = vec3(dir.x * uR * s, -2.0 * uR * hv * hv, dir.y * uR * s) + nrm * h;
        }
        float radial = length(position.xz) * 2.0;   // 0 centre .. 1 edge midpoints
        float edge = mix(1.0 - smoothstep(0.86, 1.0, max(abs(position.x), abs(position.z)) * 2.0), 1.0 - smoothstep(0.55, 0.95, radial), uFeather);
        float behind = mod(uScanAngle - aAngle, TAU);
        float sweep = exp(-behind * 2.6) * smoothstep(0.0, 0.06, behind) * uScanMix; // soft leading edge
        vColor = aColor * uGlow + vec3(0.55, 0.95, 0.42) * sweep * 0.9;
        vA = edge * uAlpha;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        // one grid step on screen, whatever the patch's size: dots stay dense and round
        float step = uSpan / ${GRID - 1}.0;
        gl_PointSize = clamp((uSize + sweep * 0.9) / 2.1 * 0.95 * step * uFocal / -mv.z, 1.4 * uPx, 16.0 * uPx);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vA;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.12, d) * vA;
        if (a < 0.003) discard;
        gl_FragColor = vec4(vColor, a);
      }
    `,
  })
  const points = new THREE.Points(geo, material)
  points.frustumCulled = false
  points.renderOrder = 8
  points.visible = false
  points.name = 'scanPatch'
  return { points, material }
}
