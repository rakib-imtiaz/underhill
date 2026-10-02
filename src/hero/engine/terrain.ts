/**
 * Terrain as a laser-scan point cloud.
 *
 * Points are laid out the way a static scanner records them: concentric rings around the
 * instrument, spacing growing with range (there is even the scanner's blind spot under the
 * tripod). The same ring pattern keeps going out to 400 km with a log-polar falloff, and every
 * point sits on the true sphere — so when the camera leaves the ground the cloud physically curves
 * over the planet instead of being swapped for it.
 */
import * as THREE from 'three'
import { groundToWorld, groundToLatLon } from './geo'
import { H, POND, mulberry32, spacingAt } from './terrainField'

export const SCAN_RANGE = 360
const R_MAX = 400_000

export type Terrain = {
  points: THREE.Points
  material: THREE.ShaderMaterial
  count: number
}

export function buildTerrain(density: number, isLand: (lat: number, lon: number) => boolean): Terrain {
  const rnd = mulberry32(7)
  const k = 1 / Math.sqrt(density)
  const ll: [number, number] = [0, 0]

  // pass 1: count rings so the buffers are allocated exactly once
  let count = 0
  for (let r = 0.42; r < R_MAX; r += spacingAt(r) * k) count += Math.max(8, Math.round((2 * Math.PI * r) / (spacingAt(r) * k)))

  const pos = new Float32Array(count * 3)
  const polar = new Float32Array(count * 2)
  const info = new Float32Array(count * 3)
  let n = 0
  for (let r = 0.42; r < R_MAX; ) {
    const s = spacingAt(r) * k
    const ring = Math.max(8, Math.round((2 * Math.PI * r) / s))
    const phase = rnd() * Math.PI * 2
    for (let j = 0; j < ring; j++) {
      const phi = phase + ((j + (rnd() - 0.5) * 0.7) / ring) * Math.PI * 2
      const rr = r + (rnd() - 0.5) * 1.1 * s // enough radial jitter that the scan rings don't read as a pattern from above
      const x = rr * Math.sin(phi), z = rr * Math.cos(phi)
      if (rr > 120_000) {
        groundToLatLon(x, z, ll)
        if (!isLand(ll[0], ll[1])) continue
      }
      const h = H(x, z)
      groundToWorld(x, z, h, pos, n * 3)
      polar[n * 2] = rr
      polar[n * 2 + 1] = Math.atan2(x, z)
      info[n * 3] = s * 0.92
      info[n * 3 + 1] = rnd()
      info[n * 3 + 2] = h
      n++
    }
    r += s
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, n * 3), 3))
  geo.setAttribute('aPolar', new THREE.BufferAttribute(polar.subarray(0, n * 2), 2))
  geo.setAttribute('aInfo', new THREE.BufferAttribute(info.subarray(0, n * 3), 3))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), R_MAX * 1.05)

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    uniforms: {
      uTime: { value: 0 },
      uPx: { value: 800 },
      uMaxPx: { value: 3.2 },
      uAlpha: { value: 1 },
      uFog: { value: 1 },
      uFogDensity: { value: 1 / 8500 },
      uFogColor: { value: new THREE.Color(0.16, 0.21, 0.26) },
      uPond: { value: new THREE.Vector4(POND.x, POND.z, POND.rx, POND.rz) },
      uQuad: { value: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()] },
      uLegs: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
      uLegProg: { value: new THREE.Vector3() },
      uSwath: { value: 50 },
      uUav: { value: 0 },
      uCaptureDim: { value: 0 },
      uFlow: { value: 0 },
      uFocus: { value: 0 },
      uRing: { value: [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector4(0, 0, 1, 0)) },
      uRingCol: { value: [0, 1, 2, 3, 4, 5].map(() => new THREE.Color(0.42, 0.82, 1.0)) },
    },
    vertexShader: /* glsl */ `
      attribute vec2 aPolar;
      attribute vec3 aInfo;
      uniform float uTime, uPx, uMaxPx, uAlpha, uFog, uFogDensity, uSwath, uUav, uCaptureDim, uFlow, uFocus;
      uniform vec4 uRing[6];
      uniform vec3 uRingCol[6];
      uniform vec3 uFogColor;
      uniform vec4 uPond;
      uniform vec2 uQuad[4];
      uniform vec4 uLegs[3];
      uniform vec3 uLegProg;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vSize;

      float hsh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hsh(i), hsh(i + vec2(1, 0)), f.x), mix(hsh(i + vec2(0, 1)), hsh(i + vec2(1, 1)), f.x), f.y);
      }
      float side(vec2 p, vec2 a, vec2 b) { vec2 e = b - a, q = p - a; return e.x * q.y - e.y * q.x; }
      /** 1 inside the (convex, counter-clockwise) survey parcel */
      float inQuad(vec2 p) {
        float s0 = side(p, uQuad[0], uQuad[1]), s1 = side(p, uQuad[1], uQuad[2]);
        float s2 = side(p, uQuad[2], uQuad[3]), s3 = side(p, uQuad[3], uQuad[0]);
        return (s0 >= 0.0 && s1 >= 0.0 && s2 >= 0.0 && s3 >= 0.0) || (s0 <= 0.0 && s1 <= 0.0 && s2 <= 0.0 && s3 <= 0.0) ? 1.0 : 0.0;
      }

      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float dist = length(mv.xyz);
        float r = aPolar.x;
        float seed = aInfo.y;
        float h = aInfo.z;

        // the site before capture: quiet blue-grey dots, lifting slightly with elevation
        float te = clamp((h + 25.0) / 160.0, 0.0, 1.0) * 0.7 + clamp(h / 2400.0, 0.0, 1.0) * 0.3;
        // stronger elevation contrast so valley walls and ridgelines read in the establishing shots
        float rise = clamp(h / 70.0, 0.0, 1.0);
        vec3 col = mix(vec3(0.17, 0.27, 0.4), vec3(0.55, 0.72, 0.9), max(te, rise)) * (0.62 + 0.38 * seed);

        // captured: points under the UAV's lidar strips, inside the parcel, turn Underhill blue
        float inside = inQuad(position.xz);
        float painted = 0.0, head = 0.0;
        for (int i = 0; i < 3; i++) {
          vec2 a = uLegs[i].xy, b = uLegs[i].zw, ab = b - a;
          float len2 = max(dot(ab, ab), 1.0);
          float t = dot(position.xz - a, ab) / len2;
          float across = length(position.xz - (a + ab * clamp(t, 0.0, 1.0)));
          float prog = uLegProg[i];
          float strip = step(0.0, t) * step(t, prog) * (1.0 - smoothstep(uSwath * 0.9, uSwath, across));
          painted = max(painted, strip);
          head = max(head, strip * exp(-max((prog - t) * sqrt(len2), 0.0) / 8.0) * uUav * step(prog, 0.999));
        }
        painted *= inside;
        vec3 captured = vec3(0.16, 0.56, 1.0) * (0.8 + 0.3 * seed);
        col = mix(col, captured, painted * (1.0 - 0.55 * uCaptureDim));
        col += head * inside * vec3(0.7, 0.9, 1.0);

        // survey rings, drawn in the scan points themselves: around the set-up (FIELD), the control
        // point (CONTROL), the observed point (MEASURE) and each piece of kit (METHODS).
        // uRing[i] = (x, z, scale m, strength); fine static rings plus one ripple travelling out.
        float ringGlow = 0.0;
        vec3 ringCol = vec3(0.0);
        for (int i = 0; i < 6; i++) {
          vec4 c = uRing[i];
          if (c.w > 0.001) {
            float d = length(position.xz - c.xy) / c.z;
            float w = 0.07 + 0.012 * dist / c.z;               // keep the ring a few points wide at any range
            float stat = 0.0;
            for (int j = 0; j < 3; j++) {
              float R = 1.0 + float(j) * 1.15 + float(j * j) * 0.2;
              float breathe = 0.65 + 0.35 * sin(uTime * 0.8 - float(j) * 1.3 + float(i));
              stat += (1.0 - smoothstep(0.0, w, abs(d - R))) * breathe;
            }
            float rp = fract(uTime * 0.28 + float(i) * 0.37);
            float ripple = (1.0 - smoothstep(0.0, w * 1.4, abs(d - (0.4 + rp * 4.4)))) * sin(rp * 3.14159);
            float g = (stat * 0.8 + ripple) * c.w * (1.0 - smoothstep(4.2, 5.2, d));
            ringGlow += g;
            ringCol += uRingCol[i] * g;
          }
        }
        col = mix(col, ringCol / max(ringGlow, 1e-4), clamp(ringGlow, 0.0, 1.0) * 0.85);



        // METHODS: everything beyond the crew's working area recedes, so the kit reads
        col *= 1.0 - 0.62 * uFocus * smoothstep(14.0, 60.0, r);
        // haze
        float f = 1.0 - exp(-pow(dist * uFogDensity, 1.25));
        col = mix(col, uFogColor, f * uFog);

        float size = aInfo.x * uPx / max(-mv.z, 1e-3);
        // sub-pixel points contribute by area, so coverage stays even
        float a = uAlpha * min(pow(size, 1.4), 1.0);
        // long-range returns bloom into soft splats so ridgelines read
        float far = smoothstep(1200.0, 6000.0, dist) * (1.0 - smoothstep(4.0e4, 1.2e5, dist));
        float cap = uMaxPx * (1.0 + 2.0 * far);
        if (size > uMaxPx) a *= mix(0.75, 0.4, far);

        // light moving over the hills, so the landscape is never still:
        //   waves   broad bands of light travelling sideways across the ridges (~10 s across the view)
        //   climb   soft scan bands rising up the slopes, one every 5 s
        //   drift   slow patches of brighter ground under it all, and a faint per-point twinkle
        if (uFlow > 0.001) {
          float hills = smoothstep(25.0, 110.0, r) * (1.0 - smoothstep(9000.0, 20000.0, r)) * (1.0 - 0.8 * far);
          float phi = aPolar.y;
          float waves = pow(0.5 + 0.5 * sin(phi * 5.0 - uTime * 0.55 + r * 0.0012), 5.0);
          float cx = fract(h / 22.0 - uTime * 0.2);
          float climb = exp(-pow((cx - 0.5) / 0.09, 2.0)) * smoothstep(4.0, 30.0, h);
          vec2 q = position.xz / 160.0;
          float drift = smoothstep(0.2, 0.6, vnoise(q + vec2(uTime * 0.12, uTime * 0.05)) * vnoise(q * 2.1 - vec2(uTime * 0.08, -uTime * 0.1)));
          float twinkle = 0.5 + 0.5 * sin(uTime * (1.5 + seed * 2.5) + seed * 60.0);
          float lit = hills * uFlow * ((waves * 0.75 + climb * 0.6) * (0.4 + 0.6 * rise) + drift * 0.3 + twinkle * 0.12);
          col += vec3(0.32, 0.7, 1.0) * lit * 1.2;
          a *= 1.0 + lit * 1.1; // faint far returns need a little more presence to carry the light
        }
        a *= 1.0 + clamp(ringGlow, 0.0, 1.0) * 1.6;
        vSize = clamp(size, 1.0, cap) * (1.0 + clamp(ringGlow, 0.0, 1.0) * 0.9);
        // fewer points near the camera: the foreground stays calm in the close shots
        a *= smoothstep(1.2, 7.0, dist);
        // no points on the pond's surface (the water layer draws there)
        vec2 pe = (position.xz - uPond.xy) / uPond.zw;
        a *= step(1.0, dot(pe, pe));
        // soften the outer edge of the cloud so it never ends on a hard circle
        a *= 1.0 - smoothstep(180000.0, 395000.0, r);
        gl_PointSize = vSize;
        vColor = col;
        vAlpha = a;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      varying float vSize;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = vAlpha * (1.0 - smoothstep(0.5 - 0.9 / vSize, 0.5, d) * smoothstep(1.0, 3.0, vSize));
        if (a < 0.02) discard;
        gl_FragColor = vec4(vColor, a);
      }
    `,
  })

  const points = new THREE.Points(geo, material)
  points.frustumCulled = false
  points.renderOrder = 1
  points.name = 'terrain'
  return { points, material, count: n }
}
