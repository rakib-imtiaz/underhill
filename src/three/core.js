/* ==========================================================================
   three/core.js — scene base implementing the make_3d_website contract:
   · one settled frame rendered on construction, even when document.hidden
   · ?frame=<0..1> synchronous seek hook (window.__scene.seek), suppresses scroll
   · scroll drives a PURE function of progress; continuous motion on its own clock
   · DPR capped <= 1.75; rendering paused off-viewport and when hidden
   · prefers-reduced-motion shows the FINISHED scene (seek(1)), sections unpin
   · WebGL-unavailable fallback markup stays in the DOM until the scene boots
   ========================================================================== */
import * as THREE from "three";

/* ------------------------------------------------------------ debug hook */
const q = new URLSearchParams(location.search).get("frame");
export const DEBUG_FRAME = q === null ? null : Math.min(1, Math.max(0, Number(q) || 0));

export function registerDebugRenderer(scene) {
  window.__scene = {
    /* lets dispose() know whether the global still belongs to this instance */
    __owner: scene,
    seek: (p) => scene.seek(p),
    frame: (p) => scene.seek(p),
    view: (name) => scene.setView && scene.setView(name),
    stats: () => scene.renderer.info,
    /* review harness: inspect what is actually on screen at a given frame */
    graph: () => scene.scene,
    cam: () => scene.camera,
    lit: () => {
      const out = [];
      scene.scene.traverse((o) => {
        const m = o.material;
        if (!m || !o.visible) return;
        const op = Array.isArray(m) ? m[0].opacity : m.opacity;
        if (op > 0.004) out.push({ name: o.name || o.type, type: o.type, opacity: +op.toFixed(3) });
      });
      return out;
    },
    /* shot-sink substitute (no dev server): downloads a PNG of the canvas.
       Works under ?frame= because preserveDrawingBuffer is enabled there. */
    shot: (name = "frame.png") => {
      const a = document.createElement("a");
      a.download = name;
      a.href = scene.renderer.domElement.toDataURL("image/png");
      a.click();
    },
  };
  if (DEBUG_FRAME !== null) scene.seek(DEBUG_FRAME);
}

/* ------------------------------------------------------------ math utils */
export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
/** monotone 0..1 ramp across [a,b] — clamps at 1 and NEVER comes back down */
export const window01 = (p, a, b) => clamp01((p - a) / (b - a));
/** per-chapter DOM caption presence */
export const chapterFade = (sp, k, hold = 0.14, ramp = 0.38) =>
  clamp01(1 - Math.max(Math.abs(sp - k) - hold, 0) / ramp);

/** deterministic seeded random — never bare Math.random() */
export const rnd = (n) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** distance that fits a sphere of `radius` in BOTH axes at this aspect */
export function fitDistance(cam, radius, pad = 1.15) {
  const vFov = (cam.fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * cam.aspect);
  return (radius * pad) / Math.sin(Math.min(vFov, hFov) / 2);
}

/* ------------------------------------------------- environment (PMREM) */
/** painted equirect canvas -> PMREM. Uses fromEquirectangular (NOT fromScene:
    fromScene is ~25x slower under software rendering). */
export function studioEnv(renderer) {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 512;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.0, "#0a0e14");
  g.addColorStop(0.42, "#23303e");
  g.addColorStop(1.0, "#04060a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 512);
  const box = (x, y, w, h, a, col = "255,255,255") => {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, Math.max(w, h));
    rg.addColorStop(0, `rgba(${col},${a})`);
    rg.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = rg;
    ctx.fillRect(x - w, y - h, w * 2, h * 2);
  };
  box(300, 150, 190, 90, 0.95);                    // key softbox
  box(760, 190, 130, 70, 0.5, "159,216,232");      // cool fill
  box(520, 70, 260, 40, 0.4, "120,190,235");       // brand-blue top strip -> rim signature
  box(120, 400, 200, 60, 0.12, "231,255,137");     // faint lime floor bounce
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(t).texture;
  pmrem.dispose();
  t.dispose();
  return env;
}

/* ------------------------------------------------------- three-light rig */
export function lightRig(scene, { keyPos, rimPos, target = [0, 0, 0], keyI = 70, rimI = 110 }) {
  const key = new THREE.SpotLight(0xfff2e2, keyI, 0, 0.55, 0.45, 1.5);
  key.position.set(...keyPos);
  const rim = new THREE.SpotLight(0x9fd8e8, rimI, 0, 0.65, 0.5, 1.6);
  rim.position.set(...rimPos);
  const fill = new THREE.HemisphereLight(0x2a3644, 0x07080c, 0.55);
  const tgt = new THREE.Object3D();
  tgt.position.set(...target);
  scene.add(tgt);
  key.target = tgt; rim.target = tgt;
  scene.add(key, rim, fill);
  return { key, rim, fill };
}

/** dark cyclorama — the set is part of the render */
export function cyclorama(scene) {
  const c = document.createElement("canvas");
  c.width = 16; c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#0d1420");
  g.addColorStop(0.55, "#0b0f16");
  g.addColorStop(1, "#05070b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const cyc = new THREE.Mesh(
    new THREE.SphereGeometry(90, 32, 16),
    new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, toneMapped: false })
  );
  cyc.name = "cyclorama";
  scene.add(cyc);
  return cyc;
}

/** radial-gradient sprite texture (contact shadows / light pools) */
export function radialSprite(rgbaInner, rgbaOuter = "rgba(0,0,0,0)") {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, rgbaInner);
  g.addColorStop(1, rgbaOuter);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

/* ============================================================ SceneBase */
export class SceneBase {
  /**
   * @param host element that wraps the canvas (also observed for visibility)
   */
  constructor(host) {
    this.host = host;
    this.progress = 0;
    this.visible = true;
    this.raf = 0;
    /* React port: every listener/observer registers its own teardown here so
       the component that owns the canvas can dispose the scene on unmount. */
    this._cleanups = [];
    this.disposed = false;
    this.clock = new THREE.Clock();
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* MSAA on the main target is wasted under a post chain: the composer
       renders into its own render target and resolves it again. Scenes that
       install post declare `static usesPost = true` (terrain.js). */
    this.usesPost = this.constructor.usesPost === true;
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.usesPost,
      alpha: false,
      powerPreference: "high-performance",
      // ONLY under ?frame= — costs memory, but toDataURL() returns black
      // without it once the compositor has consumed the buffer.
      preserveDrawingBuffer: DEBUG_FRAME !== null,
    });
    /* Dynamic resolution: dprCap is the pixel-ratio CEILING (scenes with a
       post chain lower it — see terrain.js), qualityScale is stepped down/up
       by _tuneQuality() from measured frame times so an integrated GPU is
       not pinned at 100% just to hold vsync. Applied in applyPixelRatio(). */
    this.dprCap = 1.0;
    this.qualityScale = 1;
    this._perf = { ema: 16.7, cooldown: 0 };
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = false; // contact-shadow sprites instead
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);

    /* set by subclasses that opt into post-processing (see atmos.js) */
    this.composer = null;

    this.build();
    host.prepend(this.renderer.domElement);
    this.resize();

    /* SETTLED FIRST FRAME — must render even when document.hidden, so a
       review screenshot or background-tab load never sees a blank canvas. */
    this.apply(this.reduced ? 1 : (DEBUG_FRAME ?? 0));
    this.renderFrame();

    /* scene booted -> hide the always-present fallback markup */
    host.classList.add("scene-live");

    this.observe();
    registerDebugRenderer(this);
    if (DEBUG_FRAME === null) this.start();
  }

  /* subclasses override */
  build() {}
  apply(_p) {}
  tickMotion(_dt, _t) {}

  /** single render call — routed through the composer when one is installed,
      so seek(), resize() and the rAF loop all share one code path */
  renderFrame() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /** synchronous seek — no rAF involved */
  seek(p) {
    this.apply(p);
    this.renderFrame();
  }

  setVisible(v) {
    const was = this.visible;
    this.visible = v;
    if (v && !was && DEBUG_FRAME === null) this.start();
  }

  start() {
    cancelAnimationFrame(this.raf);
    if (this.reduced) {
      /* reduced motion: the FINISHED scene is already rendered by the
         constructor's settled frame — no animation loop at all */
      this.renderFrame();
      return;
    }
    this.clock.getDelta();
    /* ADAPTIVE FRAME CAP. Rendering on every rAF pins an integrated GPU at
       ~100% purely to hold vsync, and nothing in this scene needs 60 Hz: the
       motion is drift and breathing. Render fast only while the user is
       actually driving it (scroll progress changed, or the pointer moved),
       then fall back to an idle rate. This is the single biggest saving
       available and it is invisible in normal use. */
    const IDLE_FPS = this.idleFps || 24;
    const ACTIVE_FPS = this.activeFps || 40;
    const ACTIVE_HOLD = 0.4;                    // seconds of "fast" after input
    let sinceRender = 0;
    let lastP = this.progress;
    let activeFor = ACTIVE_HOLD;
    /* ignore startup jank in the quality governor */
    this._perf.ema = 1000 / ACTIVE_FPS;
    this._perf.cooldown = performance.now() + 2500;
    const loop = () => {
      this.raf = 0;
      if (!this.visible || document.hidden) return; // pause off-viewport / hidden
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      sinceRender += dt;
      if (this.progress !== lastP || this.pointerMoved) {
        lastP = this.progress;
        this.pointerMoved = false;
        activeFor = ACTIVE_HOLD;
      }
      activeFor = Math.max(0, activeFor - dt);
      const targetFps = activeFor > 0 ? ACTIVE_FPS : IDLE_FPS;
      if (sinceRender < 1 / targetFps) return;   // skip the frame entirely
      /* tickMotion gets the REAL elapsed time, not the rAF delta, so drift
         and breathing run at the same wall-clock speed at any cap */
      this.tickMotion(sinceRender, this.clock.elapsedTime);
      this.renderFrame();
      this._tuneQuality(sinceRender, targetFps);
      sinceRender = 0;
    };
    this.raf = requestAnimationFrame(loop);
  }

  /**
   * Dynamic-resolution governor. Tracks an EMA of frame time; when the GPU
   * cannot hold ~50 fps the render scale steps down (floor 0.55), and when
   * there is vsync headroom it steps back up. Hysteresis + cooldowns stop
   * hunting. Inert under ?frame= — review frames must stay deterministic.
   */
  _tuneQuality(dt, targetFps = 50) {
    if (DEBUG_FRAME !== null) return;
    const p = this._perf;
    /* thresholds are RELATIVE to the current cap. With a fixed 21 ms trigger
       a 30 fps cap (33 ms/frame) would read as permanent overload and grind
       the render scale down to the floor for no reason. */
    const budget = 1000 / targetFps;
    p.ema += (dt * 1000 - p.ema) * 0.06;
    const now = performance.now();
    if (now < p.cooldown) return;
    if (p.ema > budget * 1.26 && this.qualityScale > 0.55) {
      this.qualityScale = Math.max(0.55, this.qualityScale * 0.85);
      this.applyPixelRatio();
      p.cooldown = now + 1500;
    } else if (p.ema < budget * 1.04 && this.qualityScale < 1) {
      this.qualityScale = Math.min(1, this.qualityScale * 1.12);
      this.applyPixelRatio();
      p.cooldown = now + 3000;
    }
  }

  /** register a teardown callback (see dispose) */
  onCleanup(fn) {
    this._cleanups.push(fn);
  }

  /** addEventListener + matching teardown in one call */
  listen(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this.onCleanup(() => target.removeEventListener(type, fn, opts));
  }

  observe() {
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        ([e]) => this.setVisible(e.isIntersecting),
        { rootMargin: "300px" }
      );
      io.observe(this.host);
      this.onCleanup(() => io.disconnect());
    }
    this.listen(document, "visibilitychange", () => {
      if (!document.hidden) this.setVisible(true);
    });
    /* debounced: dragging a window edge fires resize dozens of times a
       second, and each one re-allocates every composer render target */
    this.listen(window, "resize", () => {
      if (this._resizeT) clearTimeout(this._resizeT);
      this._resizeT = setTimeout(() => {
        this._resizeT = 0;
        if (!this.disposed) this.resize();
      }, 120);
    });
  }

  /**
   * Tear the scene down completely — React owns the canvas element's
   * lifetime, so unmounting must release the GPU context and every listener.
   */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.visible = false;
    this._cleanups.forEach((fn) => { try { fn(); } catch (e) { /* keep going */ } });
    this._cleanups.length = 0;

    /* geometry + materials + textures held by the graph */
    const seen = new Set();
    const killMat = (m) => {
      if (!m || seen.has(m)) return;
      seen.add(m);
      for (const k in m) {
        const v = m[k];
        if (v && v.isTexture) v.dispose();
      }
      if (m.uniforms) {
        for (const k in m.uniforms) {
          const v = m.uniforms[k] && m.uniforms[k].value;
          if (v && v.isTexture) v.dispose();
        }
      }
      m.dispose();
    };
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const m = o.material;
      if (Array.isArray(m)) m.forEach(killMat); else killMat(m);
    });
    this.scene.clear();
    if (this.scene.environment && this.scene.environment.dispose) {
      this.scene.environment.dispose();
    }
    if (this.composer) {
      if (this.composer.renderTarget1) this.composer.renderTarget1.dispose();
      if (this.composer.renderTarget2) this.composer.renderTarget2.dispose();
      (this.composer.passes || []).forEach((p) => p.dispose && p.dispose());
      this.composer = null;
    }

    const canvas = this.renderer.domElement;
    this.renderer.dispose();
    /* without this a remount (React StrictMode, route change) can exhaust the
       browser's WebGL context budget */
    const ctx = this.renderer.getContext && this.renderer.getContext();
    const lose = ctx && ctx.getExtension && ctx.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    this.host.classList.remove("scene-live");

    if (window.__scene && window.__scene.__owner === this) delete window.__scene;
  }

  /** pixel ratio = min(devicePixelRatio, dprCap) x qualityScale, pushed into
      both the renderer and the composer (which tracks its own copy) */
  applyPixelRatio() {
    const pr = Math.max(0.6,
      Math.min(window.devicePixelRatio || 1, this.dprCap) * this.qualityScale);
    this.renderer.setPixelRatio(pr);
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      if (this.composer.setPixelRatio) this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
    }
  }

  resize() {
    this.applyPixelRatio();
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    if (this.onResize) this.onResize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    /* re-render after resize so the settled frame is never stale */
    this.apply(this.progress);
    this.renderFrame();
  }
}

/* ------------------------------------------------- WebGL support check */
export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext &&
      (c.getContext("webgl2") || c.getContext("webgl")));
  } catch (e) {
    return false;
  }
}

/**
 * Boot helper: if WebGL is unavailable, leave the fallback markup visible
 * (and unpin scroll choreography). Otherwise construct the scene.
 */
export function boot(host, SceneClass, onScene) {
  const journey = host.closest(".journey");
  if (!webglAvailable()) {
    if (journey) journey.classList.add("static");
    return null;
  }
  const scene = new SceneClass(host);
  if (scene.reduced && journey) journey.classList.add("static");
  if (onScene) onScene(scene);
  return scene;
}
