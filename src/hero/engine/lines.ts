/**
 * Screen-space fat lines with a per-vertex parameter t (0..1 along each polyline) so a single
 * material can do draw-on reveal, staggered starts, travelling pulses and radial fades.
 * Also: pixel-sized marker sprites (offices, monuments, site).
 */
import * as THREE from 'three'

export type Polyline = { pts: ArrayLike<number>; id?: number; t?: ArrayLike<number> } // pts = xyz triples

export type FatLineOpts = {
  width: number
  color: THREE.ColorRepresentation
  alpha?: number
  additive?: boolean
  pulse?: number // travelling pulse strength
  pulseSpeed?: number
  stagger?: number // reveal delay per polyline id (fraction of the window)
  headGlow?: number
  comet?: number // a bright head with a tail travelling along each polyline
  depthTest?: boolean
}

export type FatLine = {
  mesh: THREE.Mesh
  material: THREE.ShaderMaterial
  /** writable per-vertex views for dynamic lines (beam, fan hit line) */
  setSegment: (seg: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, ta: number, tb: number, alpha?: number) => void
  commit: () => void
}

export function buildFatLine(lines: Polyline[], opts: FatLineOpts, dynamicSegments = 0): FatLine {
  let segs = dynamicSegments
  if (!dynamicSegments) for (const l of lines) segs += l.pts.length / 3 - 1
  const V = segs * 4
  const start = new Float32Array(V * 3), end = new Float32Array(V * 3)
  const side = new Float32Array(V), isEnd = new Float32Array(V)
  const tAttr = new Float32Array(V), idAttr = new Float32Array(V), aAttr = new Float32Array(V).fill(1)
  const index = new Uint32Array(segs * 6)

  for (let s = 0; s < segs; s++) {
    const v = s * 4
    side[v] = -1; side[v + 1] = 1; side[v + 2] = -1; side[v + 3] = 1
    isEnd[v + 2] = 1; isEnd[v + 3] = 1
    index.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], s * 6)
  }

  const write = (s: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, ta: number, tb: number, id: number, al: number) => {
    for (let j = 0; j < 4; j++) {
      const v = (s * 4 + j) * 3
      start[v] = ax; start[v + 1] = ay; start[v + 2] = az
      end[v] = bx; end[v + 1] = by; end[v + 2] = bz
      tAttr[s * 4 + j] = j < 2 ? ta : tb
      idAttr[s * 4 + j] = id
      aAttr[s * 4 + j] = al
    }
  }

  if (!dynamicSegments) {
    let s = 0
    lines.forEach((l, li) => {
      const n = l.pts.length / 3
      for (let i = 0; i < n - 1; i++, s++) {
        const p = l.pts
        const ta = l.t ? l.t[i] : i / (n - 1), tb = l.t ? l.t[i + 1] : (i + 1) / (n - 1)
        write(s, p[i * 3], p[i * 3 + 1], p[i * 3 + 2], p[i * 3 + 3], p[i * 3 + 4], p[i * 3 + 5], ta, tb, l.id ?? li, 1)
      }
    })
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(start, 3))
  geo.setAttribute('aEndPos', new THREE.BufferAttribute(end, 3))
  geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1))
  geo.setAttribute('aIsEnd', new THREE.BufferAttribute(isEnd, 1))
  geo.setAttribute('aT', new THREE.BufferAttribute(tAttr, 1))
  geo.setAttribute('aId', new THREE.BufferAttribute(idAttr, 1))
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(aAttr, 1))
  geo.setIndex(new THREE.BufferAttribute(index, 1))

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: opts.depthTest ?? true,
    side: THREE.DoubleSide, // quads are built in screen space; their winding is not meaningful
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      uRes: { value: new THREE.Vector2(1, 1) },
      uWidth: { value: opts.width },
      uColor: { value: new THREE.Color(opts.color) },
      uAlpha: { value: opts.alpha ?? 1 },
      uReveal: { value: 1 },
      uStagger: { value: opts.stagger ?? 0 },
      uCount: { value: Math.max(1, lines.length) },
      uTime: { value: 0 },
      uPulse: { value: opts.pulse ?? 0 },
      uPulseSpeed: { value: opts.pulseSpeed ?? 0.5 },
      uHead: { value: opts.headGlow ?? 0 },
      uComet: { value: opts.comet ?? 0 },
      uFadeT: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aEndPos;
      attribute float aSide, aIsEnd, aT, aId, aAlpha;
      uniform vec2 uRes;
      uniform float uWidth;
      varying float vT;
      varying float vId;
      varying float vAlpha;
      void main() {
        vec4 a = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec4 b = projectionMatrix * modelViewMatrix * vec4(aEndPos, 1.0);
        // keep both ends in front of the near plane
        float eps = 1e-4;
        if (a.w < eps && b.w >= eps) a = mix(a, b, (eps - a.w) / (b.w - a.w));
        if (b.w < eps && a.w >= eps) b = mix(b, a, (eps - b.w) / (a.w - b.w));
        vec2 sa = a.xy / a.w, sb = b.xy / b.w;
        vec2 d = (sb - sa) * uRes;
        float len = length(d);
        vec2 dir = len > 1e-6 ? d / len : vec2(1.0, 0.0);
        vec2 nrm = vec2(-dir.y, dir.x);
        vec4 cur = aIsEnd > 0.5 ? b : a;
        cur.xy += nrm * aSide * uWidth / uRes * cur.w;
        vT = aT; vId = aId; vAlpha = aAlpha;
        gl_Position = cur;
        if (a.w < eps && b.w < eps) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uAlpha, uReveal, uStagger, uCount, uTime, uPulse, uPulseSpeed, uHead, uFadeT, uComet;
      varying float vT;
      varying float vId;
      varying float vAlpha;
      void main() {
        // each polyline reveals over its own sub-window of uReveal
        float span = 1.0 - uStagger * (uCount - 1.0) / uCount;
        float local = clamp((uReveal - vId * uStagger / uCount) / max(span, 1e-3), 0.0, 1.0);
        if (vT > local + 1e-4 || local <= 0.0) discard;
        float a = uAlpha * vAlpha * (1.0 - uFadeT * smoothstep(0.55, 1.0, vT));
        vec3 c = uColor;
        if (uHead > 0.0 && local < 1.0) c += uHead * exp(-(local - vT) * 40.0);
        if (uPulse > 0.0) {
          float ph = fract(uTime * uPulseSpeed + vId * 0.37);
          float p = exp(-pow((vT - ph) * 14.0, 2.0));
          c += uPulse * p * vec3(1.0, 0.95, 0.85);
          a = max(a, a + p * uPulse * 0.6);
        }
        if (uComet > 0.0 && local >= 1.0) {
          // light travelling out along the line: sharp head, long soft tail, each line on its own beat
          float ph = fract(uTime * uPulseSpeed + vId * 0.37) * 1.25;
          float dt = ph - vT;
          float tail = dt >= 0.0 ? exp(-dt * 7.0) : 0.0;
          float head = exp(-pow(dt * 70.0, 2.0));
          c += uComet * (tail * vec3(0.35, 0.7, 1.0) + head * vec3(0.9, 1.0, 0.55)); // lime head, like the markers
          a = max(a, (tail * 0.85 + head) * uComet * vAlpha);
        }
        gl_FragColor = vec4(c, a);
      }
    `,
  })

  const mesh = new THREE.Mesh(geo, material)
  mesh.frustumCulled = false
  mesh.renderOrder = 4

  return {
    mesh,
    material,
    setSegment: (s, ax, ay, az, bx, by, bz, ta, tb, alpha = 1) => write(s, ax, ay, az, bx, by, bz, ta, tb, 0, alpha),
    commit: () => {
      geo.attributes.position.needsUpdate = true
      geo.attributes.aEndPos.needsUpdate = true
      geo.attributes.aT.needsUpdate = true
      geo.attributes.aAlpha.needsUpdate = true
    },
  }
}

/* ---------------- markers ---------------- */
export type Markers = { points: THREE.Points; material: THREE.ShaderMaterial; positions: Float32Array; commit: () => void }

export function buildMarkers(positions: Float32Array, opts: { size: number; color: THREE.ColorRepresentation; ring?: number; stagger?: number }): Markers {
  const n = positions.length / 3
  const geo = new THREE.BufferGeometry()
  const ids = new Float32Array(n).map((_, i) => i)
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aId', new THREE.BufferAttribute(ids, 1))
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uSize: { value: opts.size },
      uColor: { value: new THREE.Color(opts.color) },
      uAppear: { value: 1 },
      uStagger: { value: opts.stagger ?? 0.5 },
      uCount: { value: n },
      uTime: { value: 0 },
      uRing: { value: opts.ring ?? 1 },
      uPx: { value: 1 },
      uPerAppear: { value: new Float32Array(16).fill(-1) },
    },
    vertexShader: /* glsl */ `
      attribute float aId;
      uniform float uSize, uAppear, uStagger, uCount, uPx;
      uniform float uPerAppear[16];
      varying float vA;
      varying float vId;
      void main() {
        float span = 1.0 - uStagger * (uCount - 1.0) / uCount;
        float a = clamp((uAppear - aId * uStagger / uCount) / max(span, 1e-3), 0.0, 1.0);
        int i = int(aId);
        if (i < 16 && uPerAppear[i] >= 0.0) a = uPerAppear[i];
        vA = a; vId = aId;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = a > 0.0 ? uSize * uPx * (0.6 + 0.4 * a) : 0.0;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime, uRing;
      varying float vA;
      varying float vId;
      void main() {
        if (vA <= 0.0) discard;
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c) * 2.0;             // 0 centre .. 1 edge
        float core = 1.0 - smoothstep(0.16, 0.24, d);
        float ring = (1.0 - smoothstep(0.035, 0.07, abs(d - 0.52))) * uRing;
        float ph = fract(uTime * 0.6 + vId * 0.27);
        float pulse = (1.0 - smoothstep(0.02, 0.08, abs(d - ph))) * (1.0 - ph) * uRing;
        float a = max(core, max(ring * 0.9, pulse * 0.8)) * vA;
        if (a < 0.01) discard;
        gl_FragColor = vec4(mix(uColor, vec3(1.0), core * 0.55), a);
      }
    `,
  })
  const points = new THREE.Points(geo, material)
  points.frustumCulled = false
  points.renderOrder = 6
  return { points, material, positions, commit: () => { geo.attributes.position.needsUpdate = true } }
}
