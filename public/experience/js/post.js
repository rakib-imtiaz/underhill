// Film finish: the scene renders into a linear HDR target (MSAA on desktop), a small dual-filter
// bloom picks up only what is brighter than white (LEDs, lasers, hot speculars), and one composite
// pass applies exposure, ACES filmic tone mapping, sRGB output, a vignette and fine film grain.
// The quality tier (quality.js) sets the MSAA samples, the bloom levels and the streak; the live
// governor can switch the streak off (setStreak) and drop bloom levels (bloomDown) at run time —
// neither compiles a shader program (the passes are skipped, the streak's weight is a uniform).
import * as THREE from 'three';
import { QUALITY_TIERS } from './quality.js';

const FS_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const PREFILTER = /* glsl */`
  uniform sampler2D tSrc; uniform vec2 texel; uniform float threshold; uniform float knee;
  varying vec2 vUv;
  vec3 tap(vec2 o, out float w) {
    vec3 c = min(texture2D(tSrc, vUv + texel * o).rgb, vec3(12.0));
    w = 1.0 / (1.0 + max(c.r, max(c.g, c.b)));
    return c * w;
  }
  void main() {
    // 4-tap box with a Karis average (each tap weighted by 1 / (1 + its brightness)): one very bright
    // pixel (a specular glint, an aliased edge of an LED) cannot flare the whole bloom for a frame;
    // an evenly bright area (the LED's face) blooms as before
    float w0, w1, w2, w3;
    vec3 c = tap(vec2(-0.5, -0.5), w0) + tap(vec2(0.5, -0.5), w1) + tap(vec2(-0.5, 0.5), w2) + tap(vec2(0.5, 0.5), w3);
    c /= max(w0 + w1 + w2 + w3, 1e-4);
    float br = max(c.r, max(c.g, c.b));
    float soft = clamp(br - threshold + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 1e-4);
    float w = max(soft, br - threshold) / max(br, 1e-4);
    gl_FragColor = vec4(min(c * w, vec3(12.0)), 1.0);
  }
`;

const DOWN = /* glsl */`
  uniform sampler2D tSrc; uniform vec2 texel; varying vec2 vUv;
  void main() {
    vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
    s += texture2D(tSrc, vUv + texel * vec2(-1.0, -1.0)).rgb;
    s += texture2D(tSrc, vUv + texel * vec2( 1.0, -1.0)).rgb;
    s += texture2D(tSrc, vUv + texel * vec2(-1.0,  1.0)).rgb;
    s += texture2D(tSrc, vUv + texel * vec2( 1.0,  1.0)).rgb;
    gl_FragColor = vec4(s / 8.0, 1.0);
  }
`;

const UP = /* glsl */`
  uniform sampler2D tSrc; uniform vec2 texel; uniform float weight; varying vec2 vUv;
  void main() {
    vec3 s = vec3(0.0);
    s += texture2D(tSrc, vUv + texel * vec2(-2.0, 0.0)).rgb;
    s += texture2D(tSrc, vUv + texel * vec2( 2.0, 0.0)).rgb;
    s += texture2D(tSrc, vUv + texel * vec2(0.0, -2.0)).rgb;
    s += texture2D(tSrc, vUv + texel * vec2(0.0,  2.0)).rgb;
    s += texture2D(tSrc, vUv + texel * vec2(-1.0, -1.0)).rgb * 2.0;
    s += texture2D(tSrc, vUv + texel * vec2( 1.0, -1.0)).rgb * 2.0;
    s += texture2D(tSrc, vUv + texel * vec2(-1.0,  1.0)).rgb * 2.0;
    s += texture2D(tSrc, vUv + texel * vec2( 1.0,  1.0)).rgb * 2.0;
    gl_FragColor = vec4(s / 12.0 * weight, 1.0);
  }
`;

const STREAK = /* glsl */`
  uniform sampler2D tSrc; uniform vec2 texel; uniform float stepPx; varying vec2 vUv;
  void main() {
    vec3 s = texture2D(tSrc, vUv).rgb * 0.2;
    for (int i = 1; i <= 4; i++) {
      float w = 0.2 * exp(-float(i * i) / 7.0) * 1.6;
      vec2 o = vec2(texel.x * stepPx * float(i), 0.0);
      s += (texture2D(tSrc, vUv + o).rgb + texture2D(tSrc, vUv - o).rgb) * w;
    }
    gl_FragColor = vec4(s, 1.0);
  }
`;

const COMPOSITE = /* glsl */`
  uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tStreak; uniform float streak;
  uniform float bloom; uniform float vignette; uniform float grain; uniform float time; uniform float aspect;
  uniform vec2 resolution; uniform float fade; uniform float smear; uniform vec3 fadeCol; uniform float fxaa;
  varying vec2 vUv;
  float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  vec3 lit(vec2 uv) { return texture2D(tScene, uv).rgb + texture2D(tBloom, uv).rgb * bloom; }
  // luma as the eye will see it after tone mapping (HDR compressed to 0..1), for edge detection
  float lum(vec3 c) { float l = dot(c, vec3(0.299, 0.587, 0.114)); return l / (1.0 + l); }
  // FXAA (the compact 5-tap form) on the scene, for the tiers that draw without MSAA: edges and thin
  // lines are blended along their direction, so they slide instead of stepping pixel to pixel while the
  // camera moves. In the composite itself: no extra pass and no extra target.
  vec3 sceneAA(vec2 uv) {
    vec3 m = texture2D(tScene, uv).rgb;
    if (fxaa < 0.5) return m;
    vec2 px = 1.0 / resolution;
    vec3 nw = texture2D(tScene, uv + vec2(-1.0, -1.0) * px).rgb, ne = texture2D(tScene, uv + vec2(1.0, -1.0) * px).rgb;
    vec3 sw = texture2D(tScene, uv + vec2(-1.0, 1.0) * px).rgb, se = texture2D(tScene, uv + vec2(1.0, 1.0) * px).rgb;
    float lNW = lum(nw), lNE = lum(ne), lSW = lum(sw), lSE = lum(se), lM = lum(m);
    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
    // no edge here: leave the pixel alone. (A soft threshold: a hard one switched a faint line's pixels
    // between filtered and not from one frame to the next as it slid, a flicker of its own.)
    float th = max(0.03, lMax * 0.1);
    float edge = smoothstep(th * 0.5, th * 1.5, lMax - lMin);
    if (edge <= 0.0) return m;
    vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
    float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
    float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
    dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * px;
    vec3 a = 0.5 * (texture2D(tScene, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tScene, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
    vec3 b = a * 0.5 + 0.25 * (texture2D(tScene, uv - dir * 0.5).rgb + texture2D(tScene, uv + dir * 0.5).rgb);
    float lB = lum(b);
    return mix(m, (lB < lMin || lB > lMax) ? a : b, edge);
  }
  void main() {
    vec3 c;
    if (smear > 0.001) {
      // radial motion smear toward the centre: something passing the lens at speed
      vec2 dir = vUv - 0.5; float wsum = 0.0; c = vec3(0.0);
      for (int i = 0; i < 12; i++) {
        float t = float(i) / 11.0; float w = 1.0 - 0.7 * t;
        c += lit(0.5 + dir * (1.0 - t * smear * 0.3)) * w; wsum += w;
      }
      c /= wsum;
    } else {
      c = sceneAA(vUv) + texture2D(tBloom, vUv).rgb * bloom;
    }
    // anamorphic streak: a faint, cool horizontal flare on the brightest sources
    c += texture2D(tStreak, vUv).rgb * streak * vec3(0.7, 0.9, 1.2);
    // optical vignette in linear light (a lens falls off before the film responds)
    vec2 d = (vUv - 0.5) * vec2(aspect, 1.0);
    float r = length(d) / length(vec2(aspect, 1.0) * 0.5);
    c *= mix(1.0, smoothstep(1.15, 0.28, r), vignette);
    c = mix(fadeCol, c, fade);   // the dip between chapters: to black, or to white in daylight
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    // grain in display space, strongest in the mid-tones, animated per frame
    float l = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
    float n = hash(floor(vUv * resolution) + fract(time) * 917.0) - 0.5;
    gl_FragColor.rgb += n * grain * (0.35 + 0.65 * (1.0 - abs(l - 0.45) * 1.6));
  }
`;

export class Post {
  constructor(renderer, { mobile, q } = {}) {
    this.renderer = renderer;
    this.mobile = mobile;
    const Q = q || QUALITY_TIERS[mobile ? 'balanced' : 'high'];
    this.levels = Q.bloomLevels;    // half → 1/16 res (4 levels)
    this.activeLevels = this.levels;
    this.streakOn = Q.streak;
    const hdr = { type: THREE.HalfFloatType, depthBuffer: true, samples: Q.msaa };
    this.sceneRT = new THREE.WebGLRenderTarget(4, 4, hdr);
    this.bloomRTs = [];
    for (let i = 0; i < this.levels; i++) {
      const t = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
      t.texture.generateMipmaps = false;
      this.bloomRTs.push(t);
    }
    this.streakRTs = [0, 1].map(() => {
      const t = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
      t.texture.generateMipmaps = false;
      return t;
    });
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    const mk = (fs, uniforms, extra = {}) => new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, ...extra });
    this.prefilter = mk(PREFILTER, { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 2.2 }, knee: { value: 0.9 } });
    this.down = mk(DOWN, { tSrc: { value: null }, texel: { value: new THREE.Vector2() } });
    this.up = mk(UP, { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, weight: { value: 1 } }, { blending: THREE.AdditiveBlending, transparent: true });
    this.streak = mk(STREAK, { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, stepPx: { value: 2 } });
    this.composite = mk(COMPOSITE, {
      tScene: { value: this.sceneRT.texture }, tBloom: { value: this.bloomRTs[0].texture },
      tStreak: { value: this.streakRTs[0].texture }, streak: { value: this.streakOn ? 0.12 : 0 },
      bloom: { value: 0.55 }, vignette: { value: 0.55 }, grain: { value: 0.035 }, time: { value: 0 },
      aspect: { value: 1 }, resolution: { value: new THREE.Vector2(1, 1) }, fade: { value: 1 }, smear: { value: 0 }, fadeCol: { value: new THREE.Color(0, 0, 0) },
      // FXAA where the scene is drawn without MSAA (lite, balanced); a uniform, so switching it compiles nothing
      fxaa: { value: Q.msaa ? 0 : 1 },
    });
    this.composite.toneMapped = true;
  }

  /** Streak on or off (the governor's 'streak-off'); true when it changed. */
  setStreak(on) {
    on = !!on;
    if (on === this.streakOn) return false;
    this.streakOn = on;
    this.composite.uniforms.streak.value = on ? 0.12 : 0;
    return true;
  }

  /** One bloom level fewer (the governor's 'bloom-down'); false when already at one level. */
  bloomDown() {
    if (this.activeLevels <= 1) return false;
    this.activeLevels--;
    return true;
  }

  setSize(w, h) {
    const dpr = this.renderer.getPixelRatio();
    const W = Math.max(2, Math.floor(w * dpr)), H = Math.max(2, Math.floor(h * dpr));
    this.sceneRT.setSize(W, H);
    let bw = W >> 1, bh = H >> 1;
    for (const t of this.bloomRTs) { t.setSize(Math.max(2, bw), Math.max(2, bh)); bw >>= 1; bh >>= 1; }
    for (const t of this.streakRTs) t.setSize(Math.max(2, W >> 2), Math.max(2, H >> 3));
    this.composite.uniforms.aspect.value = w / h;
    this.composite.uniforms.resolution.value.set(W, H);
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quad, this.cam);
  }

  /**
   * @param {object} o
   * @param {function} [o.after] draws more into the HDR target after the scene (e.g. an overlay pass)
   * @param {number} [o.smear] 0..1 radial motion smear
   */
  render(scene, camera, { time = 0, bloom = 0.55, grain = 0.035, vignette = 0.55, fade = 1, smear = 0, fadeLevel = 0, streakScale = 1, after = null } = {}) {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);
    if (after) after(r);

    // bloom chain
    const src = this.sceneRT.texture;
    const b = this.bloomRTs, n = this.activeLevels;   // the governor may run fewer levels than allocated
    this.prefilter.uniforms.tSrc.value = src;
    this.prefilter.uniforms.texel.value.set(1 / this.sceneRT.width, 1 / this.sceneRT.height);
    this.pass(this.prefilter, b[0]);
    for (let i = 1; i < n; i++) {
      this.down.uniforms.tSrc.value = b[i - 1].texture;
      this.down.uniforms.texel.value.set(1 / b[i - 1].width, 1 / b[i - 1].height);
      this.pass(this.down, b[i]);
    }
    const ac = r.autoClear; r.autoClear = false;
    for (let i = n - 1; i > 0; i--) {
      this.up.uniforms.tSrc.value = b[i].texture;
      this.up.uniforms.texel.value.set(1 / b[i].width, 1 / b[i].height);
      this.up.uniforms.weight.value = 1.0;
      this.pass(this.up, b[i - 1]);
    }
    r.autoClear = ac;

    // streak: three widening horizontal passes from the quarter-res bloom level (skipped when off:
    // the composite's streak weight is 0 then)
    if (this.streakOn) {
      const [sa, sb] = this.streakRTs;
      let from = b[Math.min(1, n - 1)];
      let to = sa;
      for (const stepPx of [1.5, 4.5, 13.5]) {
        this.streak.uniforms.tSrc.value = from.texture;
        this.streak.uniforms.texel.value.set(1 / to.width, 1 / to.height);
        this.streak.uniforms.stepPx.value = stepPx;
        this.pass(this.streak, to);
        from = to; to = to === sa ? sb : sa;
      }
      this.composite.uniforms.tStreak.value = from.texture;
    }

    const u = this.composite.uniforms;
    u.streak.value = this.streakOn ? 0.12 * streakScale : 0;
    u.bloom.value = bloom; u.grain.value = grain; u.vignette.value = vignette; u.time.value = time; u.fade.value = fade; u.smear.value = smear; u.fadeCol.value.setScalar(fadeLevel);
    this.pass(this.composite, null);
  }

  dispose() {
    this.sceneRT.dispose();
    for (const t of [...this.bloomRTs, ...this.streakRTs]) t.dispose();
    for (const m of [this.prefilter, this.down, this.up, this.streak, this.composite]) m.dispose();
    this.quad.geometry.dispose();
  }
}
