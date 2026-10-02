/**
 * Sky dome as a fullscreen pass: blue-hour gradient with horizon haze, a sparse starfield and a
 * faint aurora for ambient life. Blends to open space as the camera climbs. Horizon dips with
 * altitude so it stays glued to the curved ground.
 */
import * as THREE from 'three'

export const HAZE = new THREE.Color(0.16, 0.21, 0.26)

export const fullscreenTriangle = () => {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
  return g
}

export const RAY_VERT = /* glsl */ `
  varying vec2 vNdc;
  void main() { vNdc = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }
`
export const RAY_DIR = /* glsl */ `
  uniform mat4 uProjInv;
  uniform mat3 uCamRot;
  vec3 rayDir(vec2 ndc) {
    vec4 v = uProjInv * vec4(ndc, 1.0, 1.0);
    return normalize(uCamRot * normalize(v.xyz / v.w));
  }
`

export function buildSky() {
  const material = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uProjInv: { value: new THREE.Matrix4() },
      uCamRot: { value: new THREE.Matrix3() },
      uUp: { value: new THREE.Vector3(0, 1, 0) },
      uDip: { value: 0 },
      uSpace: { value: 0 },
      uTime: { value: 0 },
      uHaze: { value: HAZE.clone() },
      uPx: { value: 0.001 },
    },
    vertexShader: RAY_VERT,
    fragmentShader: /* glsl */ `
      ${RAY_DIR}
      uniform vec3 uUp, uHaze;
      uniform float uDip, uSpace, uTime, uPx;
      varying vec2 vNdc;

      float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      vec3 hash33(vec3 p) {
        p = fract(p * vec3(0.1031, 0.1030, 0.0973));
        p += dot(p, p.yxz + 33.33);
        return fract((p.xxy + p.yxx) * p.zyx);
      }
      float stars(vec3 d, float scale, float density) {
        vec3 p = d * scale;
        vec3 c = floor(p);
        float h = hash13(c);
        if (h < 1.0 - density) return 0.0;
        vec3 s = c + 0.2 + 0.6 * hash33(c);
        float px = uPx * scale;                  // one pixel in cell units
        float r = length(p - s);
        float b = 1.0 - smoothstep(0.0, max(px * 1.3, 0.02), r);
        float tw = 0.75 + 0.25 * sin(uTime * (1.3 + h * 3.0) + h * 40.0);
        return b * tw * (0.35 + 0.65 * fract(h * 91.7));
      }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        float a = hash13(vec3(i, 1.0)), b = hash13(vec3(i + vec2(1, 0), 1.0));
        float c = hash13(vec3(i + vec2(0, 1), 1.0)), e = hash13(vec3(i + vec2(1, 1), 1.0));
        return mix(mix(a, b, f.x), mix(c, e, f.x), f.y); }

      void main() {
        vec3 d = rayDir(vNdc);
        float e = dot(d, uUp) + sin(uDip);       // elevation above the (dipped) horizon

        // ---- ground-level blue hour ----
        vec3 zen = vec3(0.020, 0.038, 0.074);
        vec3 mid = vec3(0.055, 0.092, 0.135);
        vec3 hor = uHaze;
        vec3 west = normalize(vec3(-1.0, 0.0, 0.25));
        vec3 dh = normalize(d - uUp * dot(d, uUp) + 1e-5);
        float glow = pow(max(dot(dh, west), 0.0), 3.0);
        hor += vec3(0.035, 0.05, 0.07) * glow; // a cool lift, not a warm band
        vec3 g = mix(hor, mid, smoothstep(0.0, 0.2, e));
        g = mix(g, zen, smoothstep(0.16, 0.85, e));
        g += vec3(0.02, 0.03, 0.045) * glow * exp(-max(e, 0.0) * 14.0);
        // faint aurora curtains low in the north
        float az = atan(d.x, -d.z);
        float band = smoothstep(0.05, 0.2, e) * (1.0 - smoothstep(0.32, 0.6, e)) * smoothstep(-0.2, 0.7, dot(dh, vec3(0.0, 0.0, -1.0)));
        float cur = n2(vec2(az * 7.0 + uTime * 0.05, uTime * 0.03)) * n2(vec2(az * 19.0 - uTime * 0.08, 2.0));
        g += vec3(0.05, 0.19, 0.15) * band * cur * 0.55;
        g += vec3(0.85, 0.9, 1.0) * stars(d, 150.0, 0.018) * smoothstep(0.03, 0.3, e) * 0.9;
        // below the horizon: dark ground haze between the scan points
        vec3 below = mix(uHaze * 0.85, vec3(0.035, 0.05, 0.065), smoothstep(0.0, 0.3, -e));
        g = e < 0.0 ? mix(below, g, smoothstep(-0.004, 0.0, e)) : g;

        // ---- space ----
        vec3 s = vec3(0.008, 0.012, 0.02);
        vec3 gal = normalize(vec3(0.35, 0.55, -0.76));
        float mw = exp(-pow(dot(d, gal) / 0.2, 2.0));
        s += vec3(0.05, 0.055, 0.075) * mw * (0.5 + 0.5 * n2(d.xy * 9.0 + d.z * 5.0));
        s += vec3(0.9, 0.94, 1.0) * stars(d, 180.0, 0.05 + 0.05 * mw);
        s += vec3(1.0) * stars(d * 1.7 + 3.1, 90.0, 0.012) * 1.2;

        gl_FragColor = vec4(mix(g, s, uSpace), 1.0);
      }
    `,
  })
  const mesh = new THREE.Mesh(fullscreenTriangle(), material)
  mesh.frustumCulled = false
  mesh.renderOrder = -100
  mesh.name = 'sky'
  return { mesh, material }
}
