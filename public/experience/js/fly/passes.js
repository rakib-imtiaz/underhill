// Fly mode: the full-screen passes the shared film pipeline (post.js) does not cover, one shader for
// all of them so it is compiled once at start (once per kind of target: the screen, and an 8-bit
// render target for photos):
//   mode 0  finish: exposure, ACES filmic (three's fit), sRGB, a light vignette, an optional frame line
//           (the picture-in-picture, photos, the minimap's orthophoto)
//   mode 1  thermal, white-hot     mode 2  thermal, ironbow      (the H20T's palettes)
// Thermal reads the scene's HDR luminance as "temperature", at the radiometric camera's 640×512 grid,
// with a little sensor noise.
import * as THREE from 'three';

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const FS = /* glsl */`
  uniform sampler2D tSrc; uniform float uMode; uniform float uExposure; uniform float uVignette;
  uniform float uGain; uniform float uTime; uniform vec2 uRes; uniform float uFrame; uniform vec2 uAspect;
  varying vec2 vUv;
  vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
  vec3 aces(vec3 c){
    const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
    const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
    c *= uExposure / 0.6; c = IN * c; c = RRTAndODTFit(c); c = OUT * c; return clamp(c, 0.0, 1.0);
  }
  vec3 srgb(vec3 c){ return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
  float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  vec3 ironbow(float t){
    vec3 c0 = vec3(0.0, 0.0, 0.02), c1 = vec3(0.17, 0.0, 0.42), c2 = vec3(0.62, 0.05, 0.47), c3 = vec3(0.92, 0.32, 0.06), c4 = vec3(1.0, 0.75, 0.1), c5 = vec3(1.0, 1.0, 0.86);
    return t < 0.2 ? mix(c0, c1, t / 0.2) : t < 0.4 ? mix(c1, c2, (t - 0.2) / 0.2) : t < 0.65 ? mix(c2, c3, (t - 0.4) / 0.25) : t < 0.85 ? mix(c3, c4, (t - 0.65) / 0.2) : mix(c4, c5, (t - 0.85) / 0.15);
  }
  void main(){
    vec2 uv = vUv;
    vec3 outc;
    if (uMode < 0.5) {
      vec3 c = texture2D(tSrc, uv).rgb;
      vec2 d = (uv - 0.5) * uAspect;
      c *= mix(1.0, smoothstep(1.2, 0.3, length(d) / length(uAspect * 0.5)), uVignette);
      outc = srgb(aces(c));
    } else {
      // the radiometric core's grid (640 × 512), stretched over the picture
      vec2 g = vec2(640.0, 512.0);
      uv = (floor(uv * g) + 0.5) / g;
      vec3 c = texture2D(tSrc, uv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722)) * uGain;
      float t = clamp(log2(1.0 + l * 6.0) / log2(7.0), 0.0, 1.0);
      t = clamp(t + (hash(floor(uv * g) + fract(uTime) * 311.0) - 0.5) * 0.035, 0.0, 1.0);
      vec3 pal = uMode < 1.5 ? vec3(t) : ironbow(t);
      vec2 d = (vUv - 0.5) * uAspect;
      pal *= mix(1.0, smoothstep(1.25, 0.35, length(d) / length(uAspect * 0.5)), 0.5);
      outc = pal;   // palettes are designed in display space
    }
    // a thin frame line (the picture-in-picture)
    if (uFrame > 0.5) {
      vec2 px = vUv * uRes;
      if (px.x < 1.5 || px.y < 1.5 || px.x > uRes.x - 1.5 || px.y > uRes.y - 1.5) outc = vec3(0.92, 0.95, 0.97);
    }
    gl_FragColor = vec4(outc, 1.0);
  }`;

export class Passes {
  constructor(renderer) {
    this.renderer = renderer;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.uniforms = {
      tSrc: { value: null }, uMode: { value: 0 }, uExposure: { value: 1 }, uVignette: { value: 0.35 },
      uGain: { value: 1 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uFrame: { value: 0 },
      uAspect: { value: new THREE.Vector2(1, 1) },
    };
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: this.uniforms, depthTest: false, depthWrite: false, toneMapped: false });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
  }

  /**
   * Draw `tex` through the pass into `target` (null = the canvas). `viewport` (CSS px, y from the
   * bottom) limits it to a rectangle of the canvas (scissored).
   */
  run(tex, target, { mode = 0, exposure = 1, vignette = 0.35, gain = 1, time = 0, frame = false, viewport = null, w = 1, h = 1 } = {}) {
    const r = this.renderer, u = this.uniforms;
    u.tSrc.value = tex; u.uMode.value = mode; u.uExposure.value = exposure; u.uVignette.value = vignette;
    u.uGain.value = gain; u.uTime.value = time; u.uFrame.value = frame ? 1 : 0;
    const dpr = target ? 1 : r.getPixelRatio();
    u.uRes.value.set(Math.max(1, w * dpr), Math.max(1, h * dpr));
    u.uAspect.value.set(w >= h ? w / h : 1, w >= h ? 1 : h / w);
    r.setRenderTarget(target);
    if (viewport) {
      r.setViewport(viewport.x, viewport.y, viewport.w, viewport.h);
      r.setScissor(viewport.x, viewport.y, viewport.w, viewport.h);
      r.setScissorTest(true);
    }
    const ac = r.autoClear; r.autoClear = false;
    r.render(this.quad, this.cam);
    r.autoClear = ac;
    if (viewport) {
      r.setScissorTest(false);
      const s = r.getSize(new THREE.Vector2());
      r.setViewport(0, 0, s.x, s.y);
    }
  }
}
