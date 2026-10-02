/**
 * The ground as flowing scan lines. Each laser-scanner ring around the instrument is drawn as one
 * continuous hairline draped on the terrain, so from any ground-level view the land reads as
 * stacked waves; crests glow where the lines crowd at grazing angles. An invisible depth-only
 * surface underneath keeps far lines from showing through near hills.
 *
 * Used for the ground chapters (FIELD → METHODS). Seen from above the rings would read as a target,
 * so the aerial chapters keep the point cloud.
 */
import * as THREE from 'three'
import { groundToWorld } from './geo'
import { H } from './terrainField'

const R0 = 2.4
const R_MAX = 14_000
const GAP = 0.068 // ring spacing as a fraction of range: even on screen from the instrument
const SEG = 0.011 // segment length as a fraction of range
const DEPTH_SEGS = 768

export type TerrainLines = {
  lines: THREE.LineSegments
  depth: THREE.Mesh
  material: THREE.ShaderMaterial
}

/** ring radii shared by the lines and the depth surface */
function radii() {
  const out: number[] = []
  for (let r = R0; r < R_MAX; r += Math.max(0.3, r * GAP)) out.push(r)
  return out
}

/**
 * @param shared uniforms owned by the point-cloud material (clock, rings, flow, focus, haze, pond),
 *               passed by reference so the engine drives both grounds with one set of values
 */
export function buildTerrainLines(shared: Record<string, THREE.IUniform>): TerrainLines {
  const rs = radii()
  const pos: number[] = [], nrm: number[] = [], info: number[] = [], idx: number[] = []
  const t = [0, 0, 0]
  const e = 0.6
  let v = 0
  for (const r of rs) {
    const n = Math.min(2048, Math.max(96, Math.round((2 * Math.PI * r) / Math.max(0.28, r * SEG))))
    const start = v
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2
      const x = Math.sin(a) * r, z = Math.cos(a) * r
      const h = H(x, z)
      groundToWorld(x, z, h, t, 0)
      pos.push(t[0], t[1], t[2])
      // ground normal from the height field (the sphere's own curvature is negligible for shading)
      const hx = (H(x + e, z) - H(x - e, z)) / (2 * e), hz = (H(x, z + e) - H(x, z - e)) / (2 * e)
      const l = Math.hypot(hx, 1, hz)
      nrm.push(-hx / l, 1 / l, -hz / l)
      info.push(r, h, Math.atan2(x, z))
      idx.push(v, j === n - 1 ? start : v + 1)
      v++
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  geo.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 3))
  geo.setIndex(idx)
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R_MAX * 1.05)

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      ...shared,
      uLineAlpha: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aInfo;
      uniform float uTime, uFlow, uFocus, uFog, uFogDensity, uLineAlpha;
      uniform vec3 uFogColor;
      uniform vec4 uRing[6];
      uniform vec3 uRingCol[6];
      varying vec3 vCol;
      varying float vA;
      varying vec2 vG;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec4 mv = viewMatrix * wp;
        float dist = length(mv.xyz);
        float r = aInfo.x, h = aInfo.y, phi = aInfo.z;
        vG = position.xz;

        // deep blue lines, lifting toward ice-blue on the heights
        float rise = clamp(h / 90.0, 0.0, 1.0);
        vec3 col = mix(vec3(0.07, 0.17, 0.36), vec3(0.2, 0.42, 0.72), rise);
        // crest glow: where the surface turns edge-on to the camera the lines crowd and brighten
        vec3 V = normalize(cameraPosition - wp.xyz);
        float edge = 1.0 - abs(dot(normalize(normal), V));
        float crest = pow(edge, 5.0) * (1.0 - 0.6 * smoothstep(1500.0, 9000.0, dist)); // far ridges stay soft
        col += vec3(0.35, 0.62, 1.0) * crest * 1.1;

        // survey rings (shared with the point cloud): concentric glowing lines around each anchor
        float ringGlow = 0.0; vec3 ringCol = vec3(0.0);
        for (int i = 0; i < 6; i++) {
          vec4 c = uRing[i];
          if (c.w > 0.001) {
            float d = length(position.xz - c.xy) / c.z;
            float w = 0.06 + 0.01 * dist / c.z;
            float stat = 0.0;
            for (int j = 0; j < 3; j++) {
              float R = 1.0 + float(j) * 1.15 + float(j * j) * 0.2;
              stat += (1.0 - smoothstep(0.0, w, abs(d - R))) * (0.65 + 0.35 * sin(uTime * 0.8 - float(j) * 1.3 + float(i)));
            }
            float rp = fract(uTime * 0.28 + float(i) * 0.37);
            float ripple = (1.0 - smoothstep(0.0, w * 1.4, abs(d - (0.4 + rp * 4.4)))) * sin(rp * 3.14159);
            // a soft glow over the whole anchor area as well, so the lines there warm up
            float area = exp(-d * d * 0.35) * 0.25;
            float g = (stat * 0.8 + ripple + area) * c.w * (1.0 - smoothstep(4.2, 5.2, d));
            ringGlow += g; ringCol += uRingCol[i] * g;
          }
        }
        col += ringCol * 0.45;

        // FIELD: light travelling across the hills
        if (uFlow > 0.001) {
          float hills = smoothstep(20.0, 90.0, r) * (1.0 - smoothstep(9000.0, 20000.0, r));
          float waves = pow(0.5 + 0.5 * sin(phi * 5.0 - uTime * 0.55 + r * 0.0012), 5.0);
          float cx = fract(h / 22.0 - uTime * 0.2);
          float climb = exp(-pow((cx - 0.5) / 0.09, 2.0)) * smoothstep(4.0, 30.0, h);
          col += vec3(0.3, 0.68, 1.0) * hills * uFlow * (waves * 0.9 + climb * 0.6) * (0.35 + 0.65 * rise);
        }
        // METHODS: the far ground steps back so the kit reads
        col *= 1.0 - 0.7 * uFocus * smoothstep(14.0, 60.0, r);

        // haze: far lines sink into the blue-hour air instead of stopping
        float f = 1.0 - exp(-pow(dist * uFogDensity, 1.25));
        col = mix(col, uFogColor * 0.5, f * uFog);
        float a = uLineAlpha * (1.0 - 0.75 * f) * (1.0 - 0.35 * smoothstep(2500.0, 12000.0, dist));
        a *= 1.0 + clamp(ringGlow, 0.0, 1.0) * 0.8;
        a *= smoothstep(1.5, 9.0, dist);                   // calm right under the camera
        a *= 1.0 - smoothstep(6000.0, 13500.0, r);         // far hills fade out instead of turning to scribble
        a *= mix(0.22, 1.0, smoothstep(10.0, 38.0, r));     // the flat pad stays quiet: no record-groove circles
        vCol = col;
        vA = a;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec4 uPond;
      varying vec3 vCol;
      varying float vA;
      varying vec2 vG;
      void main() {
        vec2 pe = (vG - uPond.xy) / uPond.zw;
        if (dot(pe, pe) < 1.0) discard; // the water carries its own layer
        gl_FragColor = vec4(vCol * vA, 1.0);
      }
    `,
  })
  const lines = new THREE.LineSegments(geo, material)
  lines.frustumCulled = false
  lines.renderOrder = 2
  lines.name = 'terrainLines'

  /* depth-only surface just under the lines, so hills hide what is behind them */
  const dpos: number[] = [], didx: number[] = []
  rs.forEach((r, i) => {
    for (let j = 0; j < DEPTH_SEGS; j++) {
      const a = (j / DEPTH_SEGS) * Math.PI * 2
      const x = Math.sin(a) * r, z = Math.cos(a) * r
      groundToWorld(x, z, H(x, z) - Math.max(0.05, r * 0.006), t, 0)
      dpos.push(t[0], t[1], t[2])
      if (i > 0) {
        const p = (i - 1) * DEPTH_SEGS, q = i * DEPTH_SEGS, jn = (j + 1) % DEPTH_SEGS
        didx.push(p + j, q + j, p + jn, p + jn, q + j, q + jn)
      }
    }
  })
  const dgeo = new THREE.BufferGeometry()
  dgeo.setAttribute('position', new THREE.Float32BufferAttribute(dpos, 3))
  dgeo.setIndex(didx)
  dgeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R_MAX * 1.05)
  const depth = new THREE.Mesh(dgeo, new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }))
  depth.frustumCulled = false
  depth.renderOrder = 0
  depth.name = 'terrainDepth'

  return { lines, depth, material }
}

/**
 * Concentric hairline rings draped on the terrain around one anchor (the control point, the
 * observed point): the survey's rings of attention, with a ripple running outward.
 */
export function buildAnchorRings(center: THREE.Vector3, color: THREE.ColorRepresentation, rMax = 38, count = 18) {
  const pos: number[] = [], rad: number[] = [], idx: number[] = []
  const t = [0, 0, 0]
  const N = 180
  let v = 0
  for (let i = 1; i <= count; i++) {
    const r = rMax * Math.pow(i / count, 1.35)
    const start = v
    for (let j = 0; j < N; j++) {
      const a = (j / N) * Math.PI * 2
      const x = center.x + Math.sin(a) * r, z = center.z + Math.cos(a) * r
      groundToWorld(x, z, H(x, z) + 0.25, t, 0)
      pos.push(t[0], t[1], t[2])
      rad.push(r / rMax)
      idx.push(v, j === N - 1 ? start : v + 1)
      v++
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('aR', new THREE.Float32BufferAttribute(rad, 1))
  geo.setIndex(idx)
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */ `
      attribute float aR;
      varying float vR;
      void main() { vR = aR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uAlpha;
      uniform vec3 uColor;
      varying float vR;
      void main() {
        // brightest at the centre, a ripple travelling outward every few seconds, soft outer edge
        float core = mix(1.0, 0.28, smoothstep(0.0, 0.8, vR));
        float ph = fract(uTime * 0.22);
        float ripple = exp(-pow((vR - ph) / 0.07, 2.0)) * (1.0 - ph);
        float a = (core + ripple * 1.2) * (1.0 - smoothstep(0.8, 1.0, vR)) * uAlpha;
        gl_FragColor = vec4(uColor * a, 1.0);
      }
    `,
  })
  const lines = new THREE.LineSegments(geo, material)
  lines.frustumCulled = false
  lines.renderOrder = 3
  return { lines, material }
}
