/* ==========================================================================
   three/atmos.js — atmosphere + cinematic grade.

   Everything here is procedural (no asset files) and additive to the
   make_3d_website contract: no continuous motion is stored as narrative
   state, and every helper renders correctly on the settled first frame.

   · skyDome()     graded sky with a horizon glow and a slow aurora band
   · starfield()   parallaxed star shell, twinkles on its own clock
   · horizonHaze() soft additive band that separates terrain from sky
   · makePost()    EffectComposer: bloom -> tonemap/sRGB -> vignette+grain+CA
   ========================================================================== */
import * as THREE from "three";
/* In the static site these came from a CDN importmap; under Vite `three` is a
   real dependency, so the post-processing passes resolve from the package. */
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/* ------------------------------------------------------------------ sky
   A BackSide sphere with an analytic gradient: near-black zenith, deep
   navy body, brand-blue horizon bloom, plus two aurora ribbons that drift
   on uTime. Sits outside fog and outside tone mapping. */
export function skyDome(scene, radius = 160) {
  const uniforms = {
    uTime: { value: 0 },
    uAurora: { value: 0.85 },   // ribbon intensity, driven by chapter
    uHorizon: { value: 1.0 },   // horizon glow intensity
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uTime, uAurora, uHorizon;
      varying vec3 vDir;

      /* cheap value noise — deterministic, no textures */
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
                   mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
      }
      /* 3 octaves, not 4: this runs for EVERY sky pixel (the dome fills the
         frame), and the 4th octave is invisible under bloom + grain */
      float fbm(vec2 p){
        float v = 0.0, a = 0.5;
        for (int k = 0; k < 3; k++) { v += a * vnoise(p); p *= 2.02; a *= 0.5; }
        return v;
      }

      void main() {
        float h = vDir.y;                       // -1 nadir .. +1 zenith
        float up = clamp(h, 0.0, 1.0);

        /* base vertical grade — a NIGHT sky. Everything here is deliberately
           low-key: the point cloud and the aurora are the only bright things
           in frame, and bloom amplifies whatever this pass emits. */
        vec3 zenith  = vec3(0.004, 0.008, 0.017);
        vec3 midSky  = vec3(0.010, 0.022, 0.042);
        vec3 horizon = vec3(0.022, 0.062, 0.108);
        vec3 below   = vec3(0.002, 0.004, 0.008);

        vec3 col = mix(midSky, zenith, pow(up, 0.55));
        float hb = exp(-abs(h) * 11.0);         // tight band at the horizon
        col = mix(col, horizon, hb * 0.85 * uHorizon);
        col = mix(col, below, clamp(-h * 3.0, 0.0, 1.0));

        /* directional bloom toward the key light azimuth (+x/+z) */
        float az = clamp(dot(normalize(vec3(vDir.x, 0.0, vDir.z)),
                             normalize(vec3(0.75, 0.0, 0.66))), 0.0, 1.0);
        col += vec3(0.00, 0.040, 0.075) * pow(az, 4.0) * exp(-abs(h) * 7.0) * uHorizon;

        /* aurora — narrow, structured curtains rather than a broad wash.
           The vertical streaking is what makes it read as an aurora.
           Early-out when the chapter has faded the aurora to zero (all
           space chapters): this branch is UNIFORM, so the whole warp skips
           9 noise evaluations per pixel — the dome fills the frame. */
        if (uAurora > 0.001) {
          float ang = atan(vDir.z, vDir.x);
          float band1 = exp(-pow((h - 0.26) * 7.5, 2.0));
          float band2 = exp(-pow((h - 0.44) * 9.5, 2.0));
          float n1 = fbm(vec2(ang * 3.2 + uTime * 0.035, h * 1.2 - uTime * 0.020));
          float n2 = fbm(vec2(ang * 5.0 - uTime * 0.026, h * 1.6 + uTime * 0.014));
          /* curtain striations: high-frequency in azimuth, smooth in height */
          float curt = 0.55 + 0.45 * fbm(vec2(ang * 14.0, h * 0.8 + uTime * 0.03));
          vec3 auroraA = vec3(0.16, 0.78, 0.55);   // teal-green
          vec3 auroraB = vec3(0.26, 0.48, 0.88);   // cool blue
          col += auroraA * band1 * smoothstep(0.52, 0.86, n1) * curt * 0.42 * uAurora;
          col += auroraB * band2 * smoothstep(0.60, 0.94, n2) * curt * 0.22 * uAurora;
        }

        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  /* PERF: the dome is a smooth analytic gradient — 24x16 segments shade
     identically to 40x24 but rasterize ~40% fewer triangles */
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), mat);
  dome.name = "skyDome";
  dome.frustumCulled = false;
  scene.add(dome);
  return { dome, uniforms };
}

/* ----------------------------------------------------------- starfield
   Points on a shell just inside the dome. Deterministic placement; the
   only time-varying term is a per-star twinkle phase. */
export function starfield(scene, count = 900, radius = 140) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const mag = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    /* golden-angle spiral -> even coverage without clumping */
    const t = (i + 0.5) / count;
    const y = 1 - t * 1.55;                 // bias to the upper hemisphere
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * 2.399963229728653;
    pos[i * 3] = Math.cos(a) * r * radius;
    pos[i * 3 + 1] = y * radius;
    pos[i * 3 + 2] = Math.sin(a) * r * radius;
    seed[i] = ((Math.sin(i * 127.1) * 43758.5453) % 1 + 1) % 1;
    mag[i] = 0.35 + seed[i] * 0.65;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  geo.setAttribute("aMag", new THREE.BufferAttribute(mag, 1));

  const uniforms = { uTime: { value: 0 }, uOpacity: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aSeed;
      attribute float aMag;
      uniform float uTime;
      varying float vA;
      void main() {
        float tw = 0.72 + 0.28 * sin(uTime * (0.5 + aSeed * 1.6) + aSeed * 31.4);
        vA = aMag * tw;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (0.7 + aMag * 1.9);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uOpacity;
      varying float vA;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        if (length(c) > 0.5) discard;
        gl_FragColor = vec4(vec3(0.82, 0.90, 1.0), vA * uOpacity);
      }`,
  });
  const stars = new THREE.Points(geo, mat);
  stars.name = "starfield";
  stars.frustumCulled = false;
  scene.add(stars);
  return { stars, uniforms };
}

/* --------------------------------------------------------- horizon haze
   A wide additive billboard sitting at the far edge of the terrain. Gives
   the point cloud something to dissolve INTO instead of hard black. */
export function horizonHaze(scene, { width = 300, height = 60, y = 6, z = -95 } = {}) {
  const c = document.createElement("canvas");
  c.width = 8; c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0.00, "rgba(0,130,202,0.00)");
  g.addColorStop(0.16, "rgba(0,130,202,0.30)");
  g.addColorStop(0.36, "rgba(28,120,170,0.16)");
  g.addColorStop(1.00, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 128);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.9,
  });
  const group = new THREE.Group();
  group.name = "horizonHaze";
  /* four quads boxing the scene so the haze reads from every chapter angle */
  [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach((rot, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    m.name = `horizonHaze.${i}`;
    m.position.set(Math.sin(rot) * -z, y, Math.cos(rot) * z);
    m.rotation.y = rot;
    group.add(m);
  });
  scene.add(group);
  return { group, mat };
}

/* ---------------------------------------------------- cinematic grade
   Final pass: vignette, animated film grain, edge chromatic aberration and
   a gentle S-curve. Runs after OutputPass, i.e. in display space, so the
   numbers below mean what they look like. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 1.0 },
    uGrain: { value: 0.032 },
    uAberration: { value: 0.0016 },
    uContrast: { value: 1.055 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uAberration, uContrast;
    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;
      vec2 d = uv - 0.5;
      float r2 = dot(d, d);

      /* chromatic aberration grows toward the frame edge */
      float k = uAberration * r2 * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + d * k).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - d * k).b;

      /* S-curve around mid grey */
      col = clamp((col - 0.5) * uContrast + 0.5, 0.0, 1.0);

      /* vignette */
      float vig = smoothstep(0.92, 0.16, r2 * 1.9);
      col *= mix(1.0, vig, uVignette);

      /* grain — animated, slightly stronger in the shadows */
      float n = fract(sin(dot(uv * vec2(1024.0, 768.0) + uTime * 37.0,
                              vec2(12.9898, 78.233))) * 43758.5453);
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      col += (n - 0.5) * uGrain * (1.25 - luma);

      gl_FragColor = vec4(col, 1.0);
    }`,
};

/**
 * Install the post chain on a SceneBase-derived scene.
 * Returns { composer, bloom, grade } — assign composer to scene.composer.
 */
export function makePost(renderer, scene, camera, {
  samples = 0,
  bloomStrength = 0.62, bloomRadius = 0.55, bloomThreshold = 0.52,
} = {}) {
  const size = new THREE.Vector2();
  renderer.getSize(size);

  /* MSAA lives on the composer's own target: the main canvas has
     antialias:false under a post chain (see core.js), so without this every
     hard edge -- the instrument, the ridge lines -- ships aliased. */
  const rt = samples > 0
    ? new THREE.WebGLRenderTarget(1, 1, { samples, type: THREE.HalfFloatType })
    : undefined;
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));

  /* Bloom is the fill-rate hog of this chain (a 5-mip stack of separable
     blurs at drawing-buffer resolution). Run its internal targets at HALF
     the size the composer reports: the composer feeds every pass the full
     buffer size via setSize(), so intercept it. At strength ~0.6 the softer
     kernel is indistinguishable, and it quarters the most expensive pass. */
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(Math.max(1, size.x / 2), Math.max(1, size.y / 2)),
    bloomStrength, bloomRadius, bloomThreshold
  );
  const bloomSetSize = bloom.setSize.bind(bloom);
  bloom.setSize = (w, h) => bloomSetSize(Math.round(w / 2), Math.round(h / 2));
  composer.addPass(bloom);

  composer.addPass(new OutputPass());

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  return { composer, bloom, grade };
}
