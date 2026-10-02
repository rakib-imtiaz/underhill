/* ==========================================================================
   three/terrain.js — Home flagship scene.

   Eight chapters, following the approved hero storyboard:

     0 IDLE        living data surface — the valley, breathing
     1 ENGAGE      cursor/scroll initiates the scan: ripples + EDM beam
     2 INSTRUMENT  macro on the total station
     3 CAPTURE     the sweep paints the point cloud
     4 RESOLVE     plan view — contours and cadastral parcels
     5 PULL BACK   the landscape curves into the Earth
     6 REACH       the globe stabilises — national context
     7 FOCUS       zoom to Canada, Underhill's six offices light up

   The survey site and the country are the same place at two scales: the
   terrain patch is tangent to the globe at 54N 122W, central BC, so the
   pull-back is a real continuation rather than a cut.

   Scroll scrubs ONE 0..1 progress scalar; every spatial state is a pure
   function of it. Continuous motion (breathing, aurora, sweep rotation,
   ripples, handheld camera, orbit damping) lives only in tickMotion() on
   its own clock and never encodes narrative.
   ========================================================================== */
import * as THREE from "three";
import {
  SceneBase, studioEnv, lightRig, radialSprite,
  clamp01, smoothstep, window01, easeOutBack, chapterFade, fitDistance, rnd,
  DEBUG_FRAME,
} from "./core.js";
import { skyDome, starfield, horizonHaze, makePost } from "./atmos.js";
import { makeKit, buildTotalStation, layoutAssembly } from "./instrument.js";
import { buildGlobe, GLOBE_R } from "./globe.js";

/* ------------------------------------------------------- heightfield */
/* PERF: 110x110 = 12.1k points (was 150² = 22.5k). The sprites are additive
   and capped at 16px, so the density loss is invisible on screen while the
   vertex + fill-rate load nearly halves. */
const AREA = 30, GRID = 110;                 // 110x110 = 12.1k points
const LAT = 10;                              // noise lattice resolution
const STATION = { x: 5.2, z: 2.4, h: 1.05 }; // flattened instrument pad
const PRISM = { x: -2.6, z: -3.4 };          // EDM target
const FOG_COLOR = 0x070c14;
/* dense enough that the sampled area dissolves into atmosphere rather than
   ending on a visible rectangle edge */
const FOG_DENSITY = 0.036;

function lattice(ix, iz) {
  return rnd(ix * 73.31 + iz * 191.7);
}
function noise2(x, z) {
  const fx = x * LAT, fz = z * LAT;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const tx = smoothstep(fx - ix), tz = smoothstep(fz - iz);
  const a = lattice(ix, iz), b = lattice(ix + 1, iz);
  const c = lattice(ix, iz + 1), d = lattice(ix + 1, iz + 1);
  return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * tz;
}
export function terrainH(x, z) {
  let h = noise2(x * 0.055 + 3.7, z * 0.055 + 9.1) * 1.9
        + noise2(x * 0.16 + 8.2, z * 0.16 + 1.3) * 0.7;
  /* signature peak — the mountain the monuments sit on */
  const dx = x + 7.5, dz = z + 5.0;
  h += 2.6 * Math.exp(-(dx * dx + dz * dz) / 26);
  const dx2 = x - 8.0, dz2 = z + 7.0;
  h += 1.4 * Math.exp(-(dx2 * dx2 + dz2 * dz2) / 14);
  h = 0.25 + h; // never below the blueprint grid plane
  /* survey station: ground is cleared flat — the pad sits on real ground */
  const sx = x - STATION.x, sz = z - STATION.z;
  const sd = Math.sqrt(sx * sx + sz * sz);
  if (sd < 3.2) {
    const k = smoothstep(clamp01((sd - 1.6) / 1.6));
    h = STATION.h * (1 - k) + h * k;
  }
  return h;
}

/* ---------------------------------------------------------- chapters
   Camera keys are direction + subject radius; distance is solved per frame
   from the real aspect, never hand-tuned. `roll` keeps consecutive shots
   from feeling like the same setup. */
const CHAPTERS = [
  /* 0 IDLE — down on the deck, valley filling the frame, aurora above the
     ridge line. Deliberately tight: at radius 13 the sampled square's far
     edge sat in shot and read as a cut-off plane. */
  { dir: [0.38, 0.20, 1.00], target: [0, 1.70, 0], radius: 10.2, pad: 1.00, roll: 0 },
  /* 1 ENGAGE — in on the station as the ripples go out */
  { dir: [0.55, 0.28, 0.95], target: [STATION.x - 1.2, STATION.h + 0.6, STATION.z - 0.6], radius: 6.6, pad: 1.10, roll: 0.022 },
  /* 2 INSTRUMENT — macro */
  { dir: [0.75, 0.32, 0.60], target: [STATION.x, STATION.h + 1.1, STATION.z], radius: 2.1, pad: 1.25, roll: -0.014 },
  /* 3 CAPTURE — raised, watching the sweep paint the valley */
  { dir: [0.62, 0.62, 0.48], target: [STATION.x - 2.0, STATION.h + 0.4, STATION.z - 1.0], radius: 9.5, pad: 1.06, roll: -0.026 },
  /* 4 RESOLVE — plan view, the drawing */
  { dir: [0.03, 1.00, 0.03], target: [0, 0.5, 0], radius: 12.0, pad: 1.02, roll: 0 },
  /* 5 PULL BACK — rising and swung off-axis so the curvature reads */
  { dir: [0.30, 0.60, 0.74], target: [0, -12, 0], radius: 36.0, pad: 1.05, roll: 0.012 },
  /* 6 REACH — the whole Earth, still down the anchor axis. Swinging round
     to a generic three-quarter here showed an empty Pacific: the globe is
     oriented with BC at +Y, so North America is only in shot from above. */
  { dir: [0.12, 0.84, 0.52], target: [0, -GLOBE_R, 0], radius: 100.0, pad: 1.06, roll: 0 },
  /* 7 FOCUS — back down onto Canada */
  { dir: [0.16, 0.86, 0.48], target: [0, -2, 0], radius: 30.0, pad: 1.05, roll: 0 },
];
const N_CH = CHAPTERS.length;
const PHASES = ["IDLE", "ENGAGE", "INSTRUMENT", "CAPTURE", "RESOLVE", "PULL BACK", "REACH", "FOCUS"];

/* PORTRAIT COMPOSITION (phones / tablets held upright).
   fitDistance() fits the subject to the NARROWER field of view. In a tall
   frame that is the horizontal one, so every shot backs off until the
   instrument is a speck -- except the globe legs, whose subject radius is so
   large the planet overruns the frame instead. Each chapter therefore gets
   its own portrait framing: subject in the upper ~55% of the frame, caption
   in the clear band below. `pitch` tilts the camera down to lift the subject.
   Merged once here so apply() stays allocation-free. */
const PORTRAIT_OVERRIDES = [
  /* 0 IDLE */       { radius: 6.6,  target: [0, 1.4, 0],                                        pitch: -0.17 },
  /* 1 ENGAGE */     { radius: 3.6,  target: [STATION.x - 0.7, STATION.h + 0.9, STATION.z - 0.3],  pitch: -0.12 },
  /* 2 INSTRUMENT */ { dir: [0.62, 0.26, 0.74], radius: 1.22, target: [STATION.x, STATION.h + 1.02, STATION.z], pad: 1.08, pitch: -0.07 },
  /* 3 CAPTURE */    { radius: 6.6,  target: [STATION.x - 1.6, STATION.h + 0.6, STATION.z - 0.8],  pitch: -0.14 },
  /* 4 RESOLVE */    { dir: [0.42, 0.60, 0.68], target: [STATION.x - 1.6, 0.7, STATION.z - 1.2], radius: 8.4, pad: 1.0, pitch: -0.10 }, // portrait: three-quarter aerial of the drawing draped on the ground, not the flat plan
  /* 5 PULL BACK */  { radius: 25.0,                                                              pitch: -0.14 },
  /* 6 REACH */      { dir: [0.04, 0.93, 0.37], radius: 50.0, pad: 1.0,                           pitch: 0.03 },  // Canada centred in the clear band, offices readable
  /* 7 FOCUS */      { radius: 68.0, target: [0, -GLOBE_R * 0.5, 0], pad: 1.0,                    pitch: -0.21 },
];
const PORTRAIT = CHAPTERS.map((c, i) => ({ pitch: -0.13, ...c, ...PORTRAIT_OVERRIDES[i] }));
CHAPTERS.forEach((c) => { if (c.pitch === undefined) c.pitch = 0; });

/* Stepped (checkpoint) mode: one swipe = one chapter; the scene plays the
   authored camera path between two anchors on the clock instead of the
   finger. Every frame the user can rest on is an anchor frame. */
const STEP_MS = 1250;

/* dwell easing: park on each key, then move decisively between them */
function legEase(t) {
  const k = clamp01((t - 0.14) / 0.72);
  return k * k * k * (k * (k * 6 - 15) + 10); // smootherstep
}

/* cadastral parcels — closed polygons in XZ, draped onto the surface */
const PARCELS = [
  [[-13, -11], [-3, -12.5], [-1.5, -3.5], [-11, -2]],
  [[-1.5, -3.5], [-3, -12.5], [7, -13], [8.5, -4.5]],
  [[-11, -2], [-1.5, -3.5], [-0.5, 7], [-10, 9]],
  [[-0.5, 7], [-1.5, -3.5], [8.5, -4.5], [9.5, 6.5]],
  [[-10, 9], [-0.5, 7], [1.0, 13], [-9, 13.5]],
];

export class TerrainScene extends SceneBase {
  /* read by SceneBase's constructor — this scene installs an EffectComposer,
     so the main target must not also pay for MSAA */
  static usesPost = true;

  build() {
    /* the shot has to hold both a 2 m instrument and a 90-unit planet */
    this.camera.near = 0.1;
    this.camera.far = 1600;
    this.camera.updateProjectionMatrix();

    /* Phones pay for every one of these points and for every bloom tap, and
       they have a fraction of the fill rate. Scale the scene to the device
       rather than shipping the desktop budget everywhere. */
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    this.small = this.coarse || Math.min(window.innerWidth, window.innerHeight) < 700;
    this.grid = this.small ? 104 : GRID;     // phones: 104² = 10.8k points (88² read as a halftone up close)
    /* frame caps read by SceneBase.start() — see the adaptive cap there.
       Emergency thermal budget: never above 40 fps active / 24 fps idle. */
    this.idleFps = this.small ? 20 : 24;
    this.activeFps = this.small ? 32 : 40;
    /* Checkpoint mode for touch devices and anything tablet-width or below.
       Desktop keeps the free scrub. A step is ~1 s of motion, so the active
       cap can afford a touch more on phones without changing the idle cost. */
    this.stepped = this.coarse || window.innerWidth <= 1024;
    if (this.stepped) { this.idleFps = 24; this.activeFps = 48; }  // a step is ~1 s; it must be smooth

    const env = studioEnv(this.renderer);
    this.scene.environment = env;
    this.scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);

    /* atmosphere first — it defines what everything else sits against */
    this.sky = skyDome(this.scene, 700);
    this.stars = starfield(this.scene, this.small ? 420 : 800, 600);
    this.haze = horizonHaze(this.scene, { width: 320, height: 64, y: 5, z: -98 });

    lightRig(this.scene, {
      keyPos: [10, 14, 8], rimPos: [-12, 9, -10], target: [0, 1, 0],
    });
    this.fillLight = new THREE.PointLight(0xdfeeff, 0, 9, 1.8);
    this.fillLight.name = "portraitFill";
    this.scene.add(this.fillLight);

    const kit = makeKit(env);
    this.kit = kit;

    /* everything at human scale lives in one group so the globe chapters
       can retire it in a single step once it is sub-pixel anyway */
    this.props = new THREE.Group();
    this.props.name = "surveyProps";
    this.scene.add(this.props);

    this.buildPoints();
    this.buildGrid();
    this.buildContours();
    this.buildParcels();
    this.buildRipples();
    this.buildMonuments(kit);
    this.buildStation(kit);
    this.buildPrism(kit);
    this.buildBeam();
    this.buildScanFan();
    this.buildHotspots();

    /* Coast-weighted cell sampling (globe.js) — every sample now lands on
       land, so 90k buys what 230k rejection samples did before, and the
       shorelines stay crisp. Phones go lower still: the landmask texture
       on the ocean sphere carries the continents there.
       PERF: 24k land points (was 42k) — these are ADDITIVE sprites fed
       through bloom, so every point is also fill rate in the bloom mips. */
    this.globe = buildGlobe(this.scene, { landPoints: this.small ? 12000 : 24000 });
    /* tangent at the anchor: globe centre sits one radius below the valley */
    this.globe.group.position.set(0, -GLOBE_R, 0);

    /* cinematic grade — bloom carries the additive point clouds.
       dprCap is the dynamic-resolution CEILING (core.js renders below it
       whenever the GPU falls behind); 1.25 is indistinguishable from 1.5
       once the grade pass adds grain, and it is ~30% fewer pixels. */
    /* Stepped devices render at native density (capped at 2x): the phone
       viewport is small, the scene only runs hot for ~1 s per step, and at
       0.85x a 3x retina screen showed every ring and edge as a pixel stair. */
    this.dprCap = this.stepped ? 2.0 : (this.small ? 0.85 : 1.0);
    const post = makePost(this.renderer, this.scene, this.camera, {
      bloomStrength: 0.50, bloomRadius: 0.55, bloomThreshold: 0.66,
    });
    this.composer = post.composer;
    this.bloom = post.bloom;
    this.grade = post.grade;

    this.wireDom();
  }

  /* -------------------------------------------------------------- DOM */
  wireDom() {
    this.chaptersEls = Array.from(document.querySelectorAll(".journey .chapter"));
    this.railEls = Array.from(document.querySelectorAll(".journey .rail button"));
    this.cue = document.querySelector(".journey .scroll-cue");
    this.reticle = document.querySelector(".journey .reticle");
    this.readoutN = document.querySelector(".journey [data-readout='n']");
    this.readoutE = document.querySelector(".journey [data-readout='e']");
    this.readoutZ = document.querySelector(".journey [data-readout='z']");
    this.hudPhase = document.querySelector(".journey [data-readout='phase']");
    this.tip = document.querySelector(".journey .hotspot-tip");

    this.pointer = { x: 0, y: 0, px: 0, py: 0, inside: false };
    this.engage = 0;            // cursor engagement — drives the scan ripples
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.pickTick = 0;

    const stage = this.host;
    this.listen(stage, "pointermove", (e) => {
      const r = stage.getBoundingClientRect();
      this.pointer.px = e.clientX - r.left;
      this.pointer.py = e.clientY - r.top;
      this.pointer.x = (this.pointer.px / r.width) * 2 - 1;
      this.pointer.y = (this.pointer.py / r.height) * 2 - 1;
      this.pointer.inside = true;
      this.pointerMoved = true;   // wakes the frame cap to ACTIVE_FPS
      if (this.reticle) {
        this.reticle.style.transform =
          `translate(${this.pointer.px}px, ${this.pointer.py}px)`;
      }
    });
    this.listen(stage, "pointerleave", () => {
      this.pointer.inside = false;
      if (this.tip) this.tip.classList.remove("on");
    });

    /* Drag to orbit — additive over the solved camera, springs back to the
       scroll-authored framing so progress stays the source of truth.

       On touch the page scroll matters far more than the orbit, so a touch
       drag only claims the gesture once it is clearly horizontal. A mouse
       drag claims it immediately. */
    this.orbit = 0; this.orbitVel = 0; this.dragging = false;
    this.lastX = 0; this.downX = 0; this.downY = 0; this.claimed = false;
    this.listen(stage, "pointerdown", (e) => {
      this.dragging = true;
      this.touch = e.pointerType === "touch";
      this.claimed = !this.touch;
      this.lastX = this.downX = e.clientX;
      this.downY = e.clientY;
      if (this.claimed) stage.classList.add("dragging");
    });
    this.listen(window, "pointermove", (e) => {
      if (!this.dragging) return;
      if (!this.claimed) {
        const dx = Math.abs(e.clientX - this.downX);
        const dy = Math.abs(e.clientY - this.downY);
        if (dy > 10 && dy > dx) { this.dragging = false; return; } // it's a scroll
        if (dx < 12 || dx <= dy) return;                           // undecided
        this.claimed = true;
        this.lastX = e.clientX;
        stage.classList.add("dragging");
      }
      this.orbitVel += (e.clientX - this.lastX) * 0.00042;
      this.lastX = e.clientX;
    }, { passive: true });
    const endDrag = () => {
      this.dragging = false; this.claimed = false;
      stage.classList.remove("dragging");
    };
    this.listen(window, "pointerup", endDrag);
    this.listen(window, "pointercancel", endDrag);

    /* rail dots jump to a chapter; arrow keys step through */
    this.railEls.forEach((btn, k) => {
      this.listen(btn, "click", () => this.scrollToChapter(k));
    });
    stage.setAttribute("tabindex", "0");
    this.listen(stage, "keydown", (e) => {
      const cur = Math.round(clamp01(this.progress) * (N_CH - 1));
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        this.scrollToChapter(Math.min(N_CH - 1, cur + 1)); e.preventDefault();
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        this.scrollToChapter(Math.max(0, cur - 1)); e.preventDefault();
      }
    });

    /* scroll driver — SUPPRESSED under ?frame= and reduced-motion.
       Stepped devices get the checkpoint engine instead. */
    this.track = document.querySelector(".journey-track");
    /* the stepped layout/caption CSS applies whenever the device is stepped,
       including ?frame= review shots (the engine itself stays off there) */
    if (this.stepped) document.querySelector(".journey")?.classList.add("stepped");
    if (this.stepped && !this.reduced && DEBUG_FRAME === null) {
      this.wireStepping(stage);
    } else if (!this.reduced && DEBUG_FRAME === null && this.track) {
      this.scrollDriver = () => {
        const r = this.track.getBoundingClientRect();
        const vh = window.innerHeight;
        const p = clamp01(-r.top / Math.max(1, r.height - vh));
        this.apply(p);
      };
      this.listen(window, "scroll", this.scrollDriver, { passive: true });
      this.scrollDriver();
    }
  }

  /* ------------------------------------------------ checkpoint engine */
  wireStepping(stage) {
    const journey = document.querySelector(".journey");
    if (journey) journey.classList.add("stepped");
    this.chapter = 0;
    this.stepAnim = 0;
    this.apply(0);
    this.setCaption(0);

    /* The stepped hero is the first thing on the page, so "engaged" is
       simply "the page is at the top". Below that the page scrolls
       natively; touch-action is flipped on scroll so the browser knows
       which mode the NEXT gesture starts in. */
    const engaged = () => window.scrollY <= 4;
    const syncTouchAction = () => { stage.style.touchAction = engaged() ? "none" : "pan-y"; };
    syncTouchAction();
    this.listen(window, "scroll", syncTouchAction, { passive: true });

    const step = (dir) => {
      if (this.stepAnim) return;                       // mid-step: swallow
      const k = this.chapter + dir;
      if (k > N_CH - 1) { this.exitDown(journey); return; }
      if (k < 0) return;
      this.stepTo(k);
    };

    /* touch: vertical swipes step, horizontal drags still orbit (pointer
       handlers above). Non-passive so the vertical pan never reaches the
       browser while engaged. */
    let y0 = null, x0 = 0;
    this.listen(stage, "touchstart", (e) => {
      if (!engaged()) return;
      y0 = e.touches[0].clientY; x0 = e.touches[0].clientX;
    }, { passive: true });
    this.listen(stage, "touchmove", (e) => {
      if (y0 === null || !engaged()) return;
      const dy = e.touches[0].clientY - y0;
      const dx = e.touches[0].clientX - x0;
      if (Math.abs(dx) > Math.abs(dy)) return;
      e.preventDefault();
      if (Math.abs(dy) > 36) { step(dy < 0 ? 1 : -1); y0 = null; }
    }, { passive: false });
    const endTouch = () => { y0 = null; };
    this.listen(stage, "touchend", endTouch);
    this.listen(stage, "touchcancel", endTouch);

    /* wheel / trackpad (tablets with a keyboard, narrow desktop windows):
       one step per burst */
    let wheelLock = 0;
    this.listen(stage, "wheel", (e) => {
      if (!engaged()) return;
      e.preventDefault();
      const now = performance.now();
      if (now < wheelLock || Math.abs(e.deltaY) < 8) return;
      wheelLock = now + 700;
      step(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
  }

  /** animate progress to chapter k along the authored path */
  stepTo(k) {
    k = Math.max(0, Math.min(N_CH - 1, Math.round(k)));
    if (this.stepAnim) cancelAnimationFrame(this.stepAnim);
    const from = this.progress;
    const to = k / (N_CH - 1);
    const legs = Math.max(1, Math.abs(k - this.chapter));
    const dur = Math.min(2200, STEP_MS * Math.pow(legs, 0.6));
    this.chapter = k;
    this.setCaption(-1);                              // hard cut out
    const t0 = performance.now();
    const tick = (now) => {
      const u = Math.min(1, (now - t0) / dur);
      /* linear in p: legEase() inside apply() already shapes each leg
         (dwell at both anchors, decisive move between) */
      this.apply(from + (to - from) * u);
      this.pointerMoved = true;                       // keep the cap active
      if (u < 1) { this.stepAnim = requestAnimationFrame(tick); return; }
      this.stepAnim = 0;
      this.setCaption(k);
    };
    this.stepAnim = requestAnimationFrame(tick);
  }

  /** stepped captions: class-driven so CSS owns the timing; -1 hides all */
  setCaption(k) {
    if (!this.chaptersEls) return;
    this.chaptersEls.forEach((el, i) => el.classList.toggle("on", i === k));
  }

  /** last chapter, swipe on: hand the page back to native scrolling */
  exitDown(journey) {
    const el = journey || this.host;
    const top = window.scrollY + el.getBoundingClientRect().bottom;
    this.host.style.touchAction = "pan-y";
    window.scrollTo({ top, behavior: "smooth" });
  }

  scrollToChapter(k) {
    if (this.stepped) { this.stepTo(k); return; }
    if (!this.track) return;
    const r = this.track.getBoundingClientRect();
    const span = Math.max(1, this.track.offsetHeight - window.innerHeight);
    const top = window.scrollY + r.top + (k / (N_CH - 1)) * span;
    window.scrollTo({ top, behavior: this.reduced ? "auto" : "smooth" });
  }

  /* -------------------------------------------------------- point cloud
     Breathing, scan-sweep highlight, planetary curvature and fog all live
     in the shader so apply() stays a handful of cheap uniform writes. */
  buildPoints() {
    const n = this.grid;
    const pos = new Float32Array(n * n * 3);
    const col = new Float32Array(n * n * 3);
    const seed = new Float32Array(n * n);
    const ang = new Float32Array(n * n);
    const cLow = new THREE.Color(0x123a5c).convertSRGBToLinear();
    const cMid = new THREE.Color(0x0082ca).convertSRGBToLinear();
    const cHigh = new THREE.Color(0x8fd8f2).convertSRGBToLinear();
    const cPeak = new THREE.Color(0xe7ff89).convertSRGBToLinear();
    const tmp = new THREE.Color();
    let i = 0;
    for (let gz = 0; gz < n; gz++) {
      for (let gx = 0; gx < n; gx++, i++) {
        const x = (gx / (n - 1) - 0.5) * AREA;
        const z = (gz / (n - 1) - 0.5) * AREA;
        const y = terrainH(x, z);
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
        const t = clamp01((y - 0.25) / 3.4);
        if (t < 0.5) tmp.lerpColors(cLow, cMid, t * 2);
        else tmp.lerpColors(cMid, cHigh, (t - 0.5) * 2);
        if (t > 0.96) tmp.lerp(cPeak, (t - 0.96) / 0.04 * 0.6);
        col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
        seed[i] = rnd(i * 1.618);
        /* bearing from the station — drives the scan-sweep highlight */
        ang[i] = Math.atan2(z - STATION.z, x - STATION.x);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    geo.setAttribute("aAngle", new THREE.BufferAttribute(ang, 1));
    geo.computeBoundingSphere();
    /* the cloud is re-projected onto a sphere at the far end of the scroll,
       so it must never be frustum-culled against its flat bounds */
    geo.boundingSphere.radius = AREA * 2;

    this.pointUniforms = {
      uSize: { value: 2.1 },
      uSizeMul: { value: 1.0 },   // portrait: the camera is closer, sprites must shrink to stay a scan, not bokeh
      uSizeMax: { value: 16.0 },  // portrait 10 px; desktop keeps its 16 px cap
      uGlow: { value: 0.9 },
      uBreath: { value: 0 },
      uIdleT: { value: 0 },
      uIdle: { value: 1 },
      uScanAngle: { value: 0 },
      uScanMix: { value: 0 },
      uCurve: { value: 0 },
      uPatch: { value: 1 },
      uFeather: { value: 0 },
      uGlobeR: { value: GLOBE_R },
      uFogColor: { value: new THREE.Color(FOG_COLOR) },
      uFogDensity: { value: FOG_DENSITY },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.pointUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute vec3 aColor;
        attribute float aSeed;
        attribute float aAngle;
        uniform float uSize, uSizeMul, uSizeMax, uGlow, uBreath;
        uniform float uIdleT, uIdle;
        uniform float uScanAngle, uScanMix;
        uniform float uCurve, uGlobeR, uPatch, uFeather;
        varying vec3 vColor;
        varying float vA;
        varying float vDepth;
        const float TAU = 6.28318530718;

        void main() {
          vec3 p = position;

          /* IDLE: the surface breathes — a slow swell, strongest on the
             high ground, so the valley reads as living data not a still */
          float lift = smoothstep(0.25, 3.2, p.y);
          p.y += sin(p.x * 0.32 + uBreath) * cos(p.z * 0.27 - uBreath * 0.75)
                 * (0.05 + 0.10 * lift);

          /* PULL BACK: the plane wraps onto the planet it is tangent to.
             Flat (x,z) -> spherical cap of radius uGlobeR centred at -R.Y;
             height rides the local normal so relief survives the wrap.
             Relief is also compressed as we leave, so the sampled area
             settles ONTO the surface instead of hovering above it as a slab. */
          float radial = length(position.xz);
          if (uCurve > 0.0001) {
            float h = p.y * (1.0 - uCurve * 0.55);
            vec2 xz = p.xz;
            float r = length(xz);
            if (r > 0.0001) {
              float a = r / uGlobeR;
              vec2 dir = xz / r;
              float s = sin(a), c = cos(a);
              vec3 base = vec3(dir.x * uGlobeR * s,
                               uGlobeR * c - uGlobeR,
                               dir.y * uGlobeR * s);
              vec3 nrm = normalize(vec3(base.x, base.y + uGlobeR, base.z));
              p = mix(p, base + nrm * h, uCurve);
            }
          }
          /* the sampled area is a SQUARE; at planet scale that edge is the
             single most artificial thing in frame, so feather it to a disc.
             Driven on its own window, EARLIER than the curve, so the corners
             are already gone the first time the shot rises high enough to
             see them. */
          float edge = mix(1.0, smoothstep(14.6, 9.5, radial), uFeather);

          /* CAPTURE: a comet tail trailing the sweep's current bearing */
          float behind = mod(uScanAngle - aAngle, TAU);
          float sweep = exp(-behind * 2.6) * uScanMix;

          /* IDLE: a survey line walks the site on repeat — the surface is
             being re-measured, not sitting still. Reads as a soft band of
             brighter, larger returns travelling across the ground. */
          float m = mod(uIdleT, 46.0) - 23.0;
          float idle = exp(-pow((position.x - m) * 0.30, 2.0)) * uIdle;

          vColor = aColor * uGlow
                 + vec3(0.55, 0.95, 0.42) * sweep * 1.35
                 + vec3(0.42, 0.72, 0.95) * idle * 0.85;
          vA = edge * uPatch;

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vDepth = -mv.z;
          /* capped: an uncapped sprite is ~70px wide in the close chapters,
             and 22.5k of those is pure overdraw on an integrated GPU */
          gl_PointSize = min((uSize + sweep * 1.6 + idle * 0.9) * uSizeMul * (140.0 / -mv.z), uSizeMax);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        varying vec3 vColor;
        varying float vA;
        varying float vDepth;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.12, d) * vA;
          /* exponential-squared fog, matched to scene.fog for the meshes.
             Additive blending: fade toward zero rather than toward grey. */
          float f = 1.0 - exp(-pow(uFogDensity * vDepth, 2.0));
          vec3 col = mix(vColor, uFogColor, f * 0.65);
          gl_FragColor = vec4(col, a * (1.0 - f * 0.85));
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.name = "pointCloud";
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  /* blueprint survey grid under the terrain */
  buildGrid() {
    const step = 2, half = AREA / 2;
    const verts = [];
    for (let v = -half; v <= half; v += step) {
      verts.push(-half, 0.02, v, half, 0.02, v);
      verts.push(v, 0.02, -half, v, 0.02, half);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    /* depthWrite MUST stay false on every overlay line: at opacity 0 they are
       invisible but would still write depth and punch holes in the additive
       point cloud drawn behind them. */
    this.gridMat = new THREE.LineBasicMaterial({
      color: 0x0082ca, transparent: true, opacity: 0, depthWrite: false,
    });
    const grid = new THREE.LineSegments(geo, this.gridMat);
    grid.name = "blueprintGrid";
    this.props.add(grid);

    /* Floor catches the light pool. Deliberately far wider than the sampled
       area: at AREA the disc silhouette cut a hard arc across the sky. */
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(AREA * 3.5, 48), // matte dark disc — 48 segments are plenty at this roughness
      new THREE.MeshStandardMaterial({
        color: 0x0b0f16, roughness: 0.98, metalness: 0,
        transparent: true, opacity: 1,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    floor.name = "floor";
    this.floor = floor;
    this.floorMat = floor.material;
    this.props.add(floor);

    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 26),
      new THREE.MeshBasicMaterial({
        map: radialSprite("rgba(0,130,202,0.20)"), transparent: true,
        depthWrite: false, toneMapped: false, fog: false,
      })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.0;
    pool.name = "lightPool";
    this.poolMat = pool.material;
    this.props.add(pool);
  }

  /* contour rings draped ON the terrain surface around the main peak */
  buildContours() {
    this.contourMats = [];
    const cx = -7.5, cz = -5.0;
    [1.6, 2.8, 4.0, 5.2, 6.4].forEach((r, k) => {
      const pts = [];
      const SEG = 96;
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * Math.PI * 2;
        const x = cx + Math.cos(a) * r;
        const z = cz + Math.sin(a) * r;
        pts.push(new THREE.Vector3(x, terrainH(x, z) + 0.045, z));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color: k === 2 ? 0xe7ff89 : 0x8fd8f2, transparent: true, opacity: 0,
        toneMapped: false, fog: false, depthWrite: false,
      });
      this.contourMats.push(mat);
      const loop = new THREE.Line(geo, mat);
      loop.name = `contour${k}`;
      this.props.add(loop);
    });
  }

  /* cadastral parcel boundaries — the deliverable the scan resolves into.
     Each edge is subdivided so the line drapes the real surface. */
  buildParcels() {
    this.parcelMat = new THREE.LineBasicMaterial({
      color: 0x9fe8ff, transparent: true, opacity: 0, toneMapped: false,
      fog: false, depthWrite: false,
    });
    const group = new THREE.Group();
    group.name = "cadastralParcels";
    PARCELS.forEach((poly, k) => {
      const pts = [];
      for (let i = 0; i < poly.length; i++) {
        const [ax, az] = poly[i];
        const [bx, bz] = poly[(i + 1) % poly.length];
        const SEG = 14;
        for (let s = 0; s < SEG; s++) {
          const u = s / SEG;
          const x = ax + (bx - ax) * u;
          const z = az + (bz - az) * u;
          pts.push(new THREE.Vector3(x, terrainH(x, z) + 0.07, z));
        }
      }
      pts.push(pts[0].clone());
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts), this.parcelMat
      );
      line.name = `parcel${k + 1}`;
      group.add(line);
    });
    this.props.add(group);
  }

  /* ground ripples radiating from the station — the reference's "cursor
     engage, scan initiated". Radius and fade are pure functions of a
     continuous phase, so they belong to tickMotion, not to progress. */
  buildRipples() {
    const g = new THREE.Group();
    g.name = "scanRipples";
    g.position.set(STATION.x, STATION.h + 0.03, STATION.z);
    this.rippleMats = [];
    const ringGeo = new THREE.RingGeometry(0.93, 1.0, 64); // soft glow ring — 64 segments are indistinguishable from 96
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uPhase: { value: i / 4 },
          uOpacity: { value: 0 },
        },
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, fog: false,
        vertexShader: /* glsl */`
          uniform float uTime, uPhase;
          varying float vF;
          void main() {
            float t = fract(uTime * 0.32 + uPhase);
            vF = 1.0 - t;
            vec3 p = position * (0.6 + t * 9.5);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: /* glsl */`
          uniform float uOpacity;
          varying float vF;
          void main() {
            gl_FragColor = vec4(vec3(0.60, 0.92, 1.0), vF * vF * uOpacity);
          }`,
      });
      this.rippleMats.push(mat);
      const m = new THREE.Mesh(ringGeo, mat);
      m.name = `scanRipples.${i}`;
      m.rotation.x = -Math.PI / 2;
      g.add(m);
    }
    this.ripples = g;
    this.props.add(g);
  }

  /* brass survey monuments — each an assembly: stem DRIVEN INTO the ground,
     disk seated on the stem, crosshair inlaid in the disk. Nothing floats. */
  buildMonuments(kit) {
    this.monuments = [];
    const spots = [[-7.5, -5.0], [8.0, -7.0], [-3.0, 6.5]];
    spots.forEach(([x, z], idx) => {
      const y = terrainH(x, z);
      const g = new THREE.Group();
      g.name = `monument${idx + 1}`;
      g.position.set(x, y - 0.02, z);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.34, 10), kit.steelBrushed);
      stem.name = `monument${idx + 1}.stem`;
      stem.position.y = 0.09; // bottom end buried 0.08 into the terrain
      const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.025, 20), kit.brass);
      disk.name = `monument${idx + 1}.disk`;
      disk.position.y = 0.27; // seated on the stem top
      const cxM = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.006, 0.016), kit.paintSatin);
      cxM.name = `monument${idx + 1}.crossX`;
      cxM.position.y = 0.284;
      const czM = cxM.clone();
      czM.name = `monument${idx + 1}.crossZ`;
      czM.rotation.y = Math.PI / 2;
      g.add(stem, disk, cxM, czM);
      g.scale.setScalar(0.001);
      this.props.add(g);
      this.monuments.push(g);
    });
  }

  /* total station on its flattened station pad */
  buildStation(kit) {
    const { root, parts } = buildTotalStation(kit);
    root.position.set(STATION.x, STATION.h, STATION.z);
    root.rotation.y = -0.6;
    this.props.add(root);
    this.station = root;
    this.stationParts = parts;
    /* head datum: where the telescope actually sits, in world space */
    this.headY = STATION.h + 1.02 + 0.35;
    /* contact shadow under the pad */
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.0, 2.0),
      new THREE.MeshBasicMaterial({
        map: radialSprite("rgba(0,0,0,0.5)"), transparent: true,
        depthWrite: false, fog: false,
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(STATION.x, STATION.h + 0.055, STATION.z);
    shadow.name = "stationContactShadow";
    this.props.add(shadow);
  }

  /* prism target — pole DRIVEN INTO the ground, prism housing clamped on,
     reflector face aimed back at the station. The EDM needs a target. */
  buildPrism(kit) {
    const y = terrainH(PRISM.x, PRISM.z);
    const g = new THREE.Group();
    g.name = "prismTarget";
    g.position.set(PRISM.x, y, PRISM.z);
    /* aim the reflector face at the instrument */
    g.rotation.y = Math.atan2(STATION.x - PRISM.x, STATION.z - PRISM.z);

    /* Sized to READ at the ENGAGE framing: at survey-accurate proportions the
       pole was a 28 mm stick 9 m from camera and rendered as a stray hairline
       with a beam ending in mid-air. */
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 14), kit.aluAnodised);
    pole.name = "prismTarget.pole";
    pole.position.y = 0.66;   // lower end buried 0.09 below the surface
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 10), kit.steelBrushed);
    tip.name = "prismTarget.groundTip";
    tip.position.y = -0.06;
    tip.rotation.x = Math.PI;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.09, 14), kit.paintBlue);
    collar.name = "prismTarget.collar";
    collar.position.y = 1.28;
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.23, 0.12), kit.paintSatin);
    housing.name = "prismTarget.housing";
    housing.position.set(0, 1.40, 0);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.03, 6), kit.glassish);
    face.name = "prismTarget.reflector";
    face.rotation.x = Math.PI / 2;
    face.position.set(0, 1.40, 0.072);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.10, 0.011, 8, 28), kit.limeGlow);
    ring.name = "prismTarget.ring";
    ring.position.set(0, 1.40, 0.078);

    g.add(pole, tip, collar, housing, face, ring);
    g.scale.setScalar(0.001);
    this.prism = g;
    this.prismRing = ring;
    /* world-space point the beam terminates on */
    this.prismHit = new THREE.Vector3(PRISM.x, y + 1.40, PRISM.z);
    this.props.add(g);
  }

  /* EDM beam — a taper from the telescope to the prism face, connected at
     BOTH ends, with a pulse that runs the line on its own clock. */
  buildBeam() {
    const from = new THREE.Vector3(STATION.x, this.headY, STATION.z);
    const to = this.prismHit;
    const len = from.distanceTo(to);
    this.beamLength = len;

    const g = new THREE.Group();
    g.name = "edmBeam";
    g.position.copy(from);
    g.lookAt(to);                       // local +Z now points at the prism

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.016, len, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xe7ff89, transparent: true, opacity: 0, toneMapped: false,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        side: THREE.DoubleSide,
      })
    );
    beam.name = "edmBeam.shaft";
    beam.rotation.x = Math.PI / 2;      // cylinder Y -> local Z
    beam.position.z = len / 2;
    this.beamMat = beam.material;

    const pulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 10, 8),
      new THREE.MeshBasicMaterial({
        color: 0xf4ffd0, transparent: true, opacity: 0, toneMapped: false,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      })
    );
    pulse.name = "edmBeam.pulse";
    this.beamPulse = pulse;
    this.beamPulseMat = pulse.material;

    g.add(beam, pulse);
    this.beam = g;
    this.props.add(g);
  }

  /* rotating scan fan — emitted AT the instrument head, touching the ground.
     Connected at both ends: telescope -> terrain. */
  buildScanFan() {
    const g = new THREE.Group();
    g.name = "scanFan";
    const headY = this.headY;
    g.position.set(STATION.x, headY, STATION.z);
    const geo = new THREE.BufferGeometry();
    /* triangle fan from the head down/out to the ground */
    const R = 8.5;
    const verts = new Float32Array([
      0, 0, 0,
      R, -headY + 0.35, 0.75,
      R, -headY + 0.35, -0.75,
    ]);
    geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    this.fanMat = new THREE.MeshBasicMaterial({
      color: 0xe7ff89, transparent: true, opacity: 0.0,
      side: THREE.DoubleSide, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
    });
    const fan = new THREE.Mesh(geo, this.fanMat);
    fan.name = "scanFan.blade";
    g.add(fan);
    /* bright leading edge */
    const edgeGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(R, -headY + 0.35, 0),
    ]);
    this.fanEdgeMat = new THREE.LineBasicMaterial({
      color: 0xe7ff89, transparent: true, opacity: 0.0, toneMapped: false,
      fog: false, depthWrite: false,
    });
    g.add(new THREE.Line(edgeGeo, this.fanEdgeMat));
    this.scanFan = g;
    this.props.add(g);
  }

  /* invisible pick targets for the hover HUD */
  buildHotspots() {
    const mk = (name, label, detail, pos, radius) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 8, 6),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      m.name = name;
      m.position.copy(pos);
      m.userData = { label, detail };
      this.props.add(m);
      return m;
    };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    this.hotspots = [
      mk("hs.station", "TOTAL STATION",
        `SETUP ${STATION.x.toFixed(1)}E / ${STATION.z.toFixed(1)}N · HI 1.55 m`,
        V(STATION.x, STATION.h + 1.3, STATION.z), 1.0),
      mk("hs.prism", "PRISM TARGET",
        `SLOPE DIST ${this.beamLength.toFixed(3)} m · CONST −30 mm`,
        this.prismHit.clone(), 0.7),
    ];
    const spots = [[-7.5, -5.0], [8.0, -7.0], [-3.0, 6.5]];
    spots.forEach(([x, z], i) => {
      const y = terrainH(x, z);
      this.hotspots.push(mk(`hs.mon${i + 1}`, `CONTROL MONUMENT ${i + 1}`,
        `ELEV ${(y * 100).toFixed(2)} m · BRASS CAP · ORDER 2`,
        V(x, y + 0.28, z), 0.6));
    });
  }

  /* -------------------------------------------------- pure choreography */
  apply(p) {
    this.progress = p;

    /* 1. camera FIRST — everything downstream reads the current camera */
    const sp = clamp01(p) * (N_CH - 1);
    const i = Math.min(Math.floor(sp), N_CH - 2);
    const t = legEase(sp - i);
    const usePortrait = this.stepped && this.camera.aspect < 0.95;
    const CH = usePortrait ? PORTRAIT : CHAPTERS;
    const A = CH[i], B = CH[i + 1];
    /* scalar lerp only: apply() runs on EVERY scroll event, so closures,
       arrays and Vector3s allocated here are pure GC churn (CPU heat) */
    const dx = A.dir[0] + (B.dir[0] - A.dir[0]) * t;
    const dy = A.dir[1] + (B.dir[1] - A.dir[1]) * t;
    const dz = A.dir[2] + (B.dir[2] - A.dir[2]) * t;
    const tx = A.target[0] + (B.target[0] - A.target[0]) * t;
    const ty = A.target[1] + (B.target[1] - A.target[1]) * t;
    const tz = A.target[2] + (B.target[2] - A.target[2]) * t;
    const radius = A.radius + (B.radius - A.radius) * t;
    const pad = A.pad + (B.pad - A.pad) * t;
    const d = fitDistance(this.camera, radius, pad);
    const dl = Math.hypot(dx, dy, dz);
    if (!this.baseCamPos) {
      this.baseCamPos = new THREE.Vector3();
      this.baseTarget = new THREE.Vector3();
    }
    this.baseCamPos.set(tx + (dx / dl) * d, ty + (dy / dl) * d, tz + (dz / dl) * d);
    this.baseTarget.set(tx, ty, tz);
    this.baseRoll = A.roll + (B.roll - A.roll) * t;
    /* Portrait framing: on a phone the caption sits over the bottom half of
       the frame, so pitch the camera down a touch to lift the subject into
       the clear upper part rather than letting the scrim bury it. Pure
       function of aspect, so it stays deterministic under ?frame=. */
    this.pitchOffset = usePortrait
      ? A.pitch + (B.pitch - A.pitch) * t
      : (this.camera.aspect < 0.95 ? -0.13 : 0);
    this.camera.position.copy(this.baseCamPos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.baseTarget);
    this.camera.rotateZ(this.baseRoll);
    if (this.pitchOffset) this.camera.rotateX(this.pitchOffset);
    /* parallax must not shove a 300-unit orbit shot around like a 6-unit one */
    this.parallaxScale = clamp01(1 - window01(p, 0.60, 0.74));

    /* 2. the planet the valley sits on */
    const curve = window01(p, 0.58, 0.74);
    const inSpace = window01(p, 0.60, 0.78);
    this.pointUniforms.uCurve.value = curve;
    this.pointUniforms.uGlow.value = 0.9 + 0.45 * window01(p, 0.40, 0.52);
    this.pointUniforms.uScanMix.value =
      window01(p, 0.36, 0.44) * (1 - window01(p, 0.52, 0.58));
    /* the idle survey line belongs to the opening; it stands down once the
       instrument itself takes over the measuring */
    this.pointUniforms.uIdle.value = 1 - window01(p, 0.10, 0.26);
    /* fog is a valley-floor effect; it cannot survive orbit */
    const fogK = 1 - window01(p, 0.56, 0.70);
    /* portrait shots sit closer AND look down more, so the same fog that
       reads as valley haze on desktop turns the plan view black */
    const fogMul = usePortrait ? 0.5 : 1.0;
    if (this.haze) this.haze.group.visible = !usePortrait;
    /* portrait fill: a soft light riding just off the camera lifts the
       instrument out of silhouette for the macro chapter */
    if (this.fillLight) {
      const macro = window01(p, 0.19, 0.27) * (1 - window01(p, 0.33, 0.42));
      this.fillLight.intensity = usePortrait ? 22 * macro : 0;
      if (this.fillLight.intensity > 0) {
        this.fillLight.position.copy(this.camera.position);
        this.fillLight.position.y += 0.9;
        this.fillLight.position.x += 0.6;
      }
    }
    this.pointUniforms.uFogDensity.value = FOG_DENSITY * fogK * fogMul;
    this.scene.fog.density = FOG_DENSITY * fogK * fogMul;
    this.pointUniforms.uSizeMul.value = usePortrait ? 0.7 : 1.0;
    this.pointUniforms.uSizeMax.value = usePortrait ? 10.0 : 16.0;

    /* the sampled area recedes to a marker once the planet carries the frame,
       then comes back up as the shot returns to BC */
    this.pointUniforms.uPatch.value =
      1 - 0.72 * window01(p, 0.70, 0.86) + 0.34 * window01(p, 0.90, 1.0);
    this.pointUniforms.uFeather.value = window01(p, 0.50, 0.62);

    /* The globe has to be ON SCREEN before the ground leaves, or the leg
       between RESOLVE and REACH plays against an empty black frame. */
    const G = this.globe;
    /* The globe is 42k additive points plus a body, an atmosphere shell, a
       graticule and six arcs — the most expensive object in the scene. Its
       earliest fade-in starts at p=0.56, so for the first HALF of the scroll
       every one of those pixels was being blended at zero opacity. Cull the
       group outright and skip the uniform writes with it. */
    const globeLive = p > 0.55;
    G.group.visible = globeLive;
    if (!globeLive) {
      this.endDrift = 0;
    } else {
      G.uniforms.uOpacity.value = window01(p, 0.56, 0.70);
      G.bodyUniforms.uOpacity.value = 0.95 * window01(p, 0.57, 0.71);
      G.atmoUniforms.uOpacity.value = 0.85 * window01(p, 0.58, 0.73);
      /* the graticule carries the empty ocean quadrants in the closing frame,
         so it strengthens rather than staying at its arrival level */
      G.gratMat.opacity = 0.20 * window01(p, 0.62, 0.78)
                        + 0.16 * window01(p, 0.88, 1.0);
      /* portrait: the REACH anchor IS the 'national footprint' frame, so
         Canada is lit and the office markers are up by the time it lands */
      const hi = usePortrait ? window01(p, 0.76, 0.85) : window01(p, 0.84, 0.96);
      G.uniforms.uHighlight.value = hi;
      G.bodyUniforms.uHighlight.value = hi;
      G.markerUniforms.uOpacity.value = usePortrait ? window01(p, 0.79, 0.86) : window01(p, 0.88, 0.97);
      G.beamMat.opacity = 0.45 * window01(p, 0.90, 1.0);
      const gp = usePortrait ? window01(p, 0.80, 0.90) : window01(p, 0.88, 1.0);
      G.pulseMats.forEach((m) => { m.uniforms.uOpacity.value = 0.55 * gp; });
      /* the closing beat: arcs draw out to the six offices */
      const arcDraw = window01(p, 0.90, 1.0);
      G.arcMats.forEach((m) => {
        m.uniforms.uDraw.value = arcDraw;
        m.uniforms.uOpacity.value = window01(p, 0.89, 0.95);
      });
      /* how much slow orbital drift the final frame gets (see tickMotion) */
      this.endDrift = window01(p, 0.92, 1.0);
    }

    /* 3. everything at human scale retires once it is sub-pixel */
    const groundK = 1 - window01(p, 0.55, 0.66);
    this.props.visible = groundK > 0.01;
    this.floorMat.opacity = groundK;
    this.poolMat.opacity = groundK;

    /* monuments settle with overshoot (nothing stops instantly) */
    this.monuments.forEach((m, k) => {
      const s = Math.max(0.001, easeOutBack(window01(p, 0.16 + k * 0.03, 0.28 + k * 0.03)));
      m.scale.setScalar(s);
    });

    /* total station is SEATED from the first frame — a hovering instrument
       reads as broken, so no airborne assembly state here */
    layoutAssembly(this.stationParts, 1, 0.42, 0.72);

    /* prism plants itself before the beam needs a target */
    const prismIn = easeOutBack(window01(p, 0.04, 0.12));
    this.prism.scale.setScalar(Math.max(0.001, prismIn));
    this.prismRing.visible = prismIn > 0.02;

    /* 4. ENGAGE: beam fires, ripples go out. The beam MUST be out before the
       INSTRUMENT macro at p=2/7 — from that camera it points away from the
       lens and reads as a flagpole stuck in the tripod. */
    const beamOn = window01(p, 0.09, 0.15) * (1 - window01(p, 0.17, 0.24));
    this.beamMat.opacity = 0.55 * beamOn * groundK;
    this.beamPulseMat.opacity = 0.9 * beamOn * groundK;
    this.rippleBase = window01(p, 0.06, 0.14)
      * (1 - (usePortrait ? window01(p, 0.17, 0.25) : window01(p, 0.28, 0.40)));

    /* 5. CAPTURE: the sweep */
    /* fully out before the RESOLVE plan view at p=4/7, where a lit sweep
       wedge sitting over the finished drawing reads as leftover geometry */
    const fanOn = window01(p, 0.34, 0.42) * (1 - window01(p, 0.46, 0.54));
    this.fanMat.opacity = 0.13 * fanOn;
    this.fanEdgeMat.opacity = 0.65 * fanOn;

    /* 6. RESOLVE: the drawing assembles, then fades as we leave the ground */
    this.gridMat.opacity = 0.34 * window01(p, 0.44, 0.53) * groundK;
    this.contourMats.forEach((m, k) => {
      m.opacity = (m.color.getHex() === 0xe7ff89 ? 0.85 : 0.5) *
        window01(p, 0.46 + k * 0.014, 0.55 + k * 0.014) * groundK;
    });
    this.parcelMat.opacity = 0.72 * window01(p, 0.48, 0.57) * groundK;

    /* 7. atmosphere follows the altitude — sky at ground level, space above */
    this.sky.uniforms.uAurora.value =
      (0.95 - 0.45 * window01(p, 0.10, 0.40)) * (1 - inSpace);
    this.sky.uniforms.uHorizon.value = 1 - 0.95 * window01(p, 0.55, 0.78);
    const starsGround = 1 - 0.5 * window01(p, 0.20, 0.45);
    this.stars.uniforms.uOpacity.value = starsGround * (1 - inSpace) + 1.0 * inSpace;
    this.haze.mat.opacity = 0.9 * (1 - window01(p, 0.55, 0.74));

    if (this.bloom) {
      /* pulled back at the very end: the survey patch, the scan pulse and the
         markers all stack in one place there and were blowing out to a white
         smear instead of reading as terrain */
      this.bloom.strength = 0.50 + 0.24 * window01(p, 0.34, 0.46)
                                 + 0.15 * window01(p, 0.70, 0.86)
                                 - 0.22 * window01(p, 0.90, 1.0);
    }
    if (this.grade) {
      /* tighten the vignette on the macro, open it back up in orbit */
      this.grade.uniforms.uVignette.value = Math.min(usePortrait ? 0.95 : 9,
        0.85 + 0.35 * window01(p, 0.14, 0.30) - 0.30 * window01(p, 0.62, 0.82));
    }

    /* 8. DOM captions — updated INSIDE apply() so ?frame= seeks are correct.
       hold/ramp are tuned so only ONE chapter is ever on screen. */
    if (this.chaptersEls && this.chaptersEls.length) {
      /* stepped mode: captions are class-driven (setCaption) -- cut out at
         step start, fade in on arrival -- never a half-faded ghost */
      if (this.stepped && DEBUG_FRAME !== null) this.setCaption(Math.round(sp));
      if (!this.stepped) this.chaptersEls.forEach((el, k) => {
        const f = chapterFade(sp, k, 0.30, 0.20);
        el.style.opacity = f.toFixed(3);
        el.style.setProperty("--enter", (1 - f).toFixed(3));
        el.style.visibility = f > 0.01 ? "visible" : "hidden";
      });
      const active = Math.round(sp);
      this.railEls.forEach((el, k) => {
        el.classList.toggle("on", active === k);
        el.setAttribute("aria-current", active === k ? "true" : "false");
      });
      if (this.cue) this.cue.style.opacity = p < 0.03 ? "1" : "0";
      if (this.hudPhase) this.hudPhase.textContent = PHASES[active] || "";
    }
  }

  /* ---------------------------------------------- continuous motion only */
  tickMotion(dt, time) {
    /* atmosphere + surface life */
    this.sky.uniforms.uTime.value = time;
    this.stars.uniforms.uTime.value = time;
    this.pointUniforms.uBreath.value = time * 0.55;
    this.pointUniforms.uIdleT.value = time * 3.4;
    this.pointUniforms.uSize.value = 2.1 + Math.sin(time * 1.4) * 0.18;
    if (this.grade) this.grade.uniforms.uTime.value = time;
    /* thermal relief: when the dynamic-resolution governor has stepped the
       scale down this far the GPU is already behind — bloom (a 5-mip stack
       of fullscreen blurs) is the most expensive pass in the chain, so drop
       it until there is headroom again. The scene reads fine without it
       because every emitter is already additive. */
    if (this.bloom) this.bloom.enabled = this.qualityScale >= 0.7;

    /* globe life — nothing to animate while the group is culled */
    const G = this.globe;
    if (G.group.visible) {
      G.uniforms.uTime.value = time;
      G.markerUniforms.uTime.value = time;
      G.pulseMats.forEach((m) => { m.uniforms.uTime.value = time; });
      G.arcMats.forEach((m) => { m.uniforms.uTime.value = time; });
    }

    /* cursor engagement — the reference's "cursor activates the scan" */
    const want = this.pointer.inside ? 1 : 0;
    this.engage += (want - this.engage) * Math.min(1, dt * 3.2);
    const rip = (this.rippleBase || 0) * (0.35 + 0.65 * this.engage);
    this.rippleMats.forEach((m) => {
      m.uniforms.uTime.value = time;
      m.uniforms.uOpacity.value = 1.05 * rip;
    });

    /* scan fan rotates; feed its bearing to the point cloud so the sweep
       highlight and the blade are the same event */
    if (this.scanFan) {
      this.scanFan.rotation.y -= dt * 0.85;
      this.pointUniforms.uScanAngle.value = -this.scanFan.rotation.y;
    }

    /* EDM pulse runs the beam */
    if (this.beamPulse && this.beamMat.opacity > 0.001) {
      const u = (time * 0.55) % 1;
      this.beamPulse.position.z = u * this.beamLength;
      this.beamPulseMat.opacity = this.beamMat.opacity * 1.6 * (1 - u) * (1 - u);
    }

    /* damped drag-orbit that springs back to the authored framing */
    this.orbit += this.orbitVel;
    this.orbitVel *= Math.pow(0.02, dt);
    if (!this.dragging) this.orbit *= Math.pow(0.28, dt);

    /* camera: solved base + orbit + pointer parallax + handheld drift */
    if (this.baseCamPos) {
      const t = this.baseTarget;
      /* scratch vectors — no per-frame allocation in the hot loop */
      const off = (this._camOff || (this._camOff = new THREE.Vector3()))
        .copy(this.baseCamPos).sub(t);
      /* the final frame drifts slowly so it reads as a live view rather than
         a screenshot; continuous, so ?frame= seeks stay deterministic */
      const drift = (this.endDrift || 0) * time * 0.035;
      const az = this.orbit + drift;
      if (Math.abs(az) > 1e-5) {
        off.applyAxisAngle(this._yUp || (this._yUp = new THREE.Vector3(0, 1, 0)), az);
      }
      /* no parallax on touch: the pointer stays wherever the last tap landed,
         which reads as the camera being stuck off-axis */
      const s = this.coarse ? 0 : (this.parallaxScale === undefined ? 1 : this.parallaxScale);
      const px = this.pointer.x * 0.55 * s, py = -this.pointer.y * 0.32 * s;
      /* handheld: two incommensurate frequencies so it never loops visibly */
      const hx = (Math.sin(time * 0.37) * 0.055 + Math.sin(time * 0.91) * 0.022) * s;
      const hy = (Math.cos(time * 0.29) * 0.045 + Math.sin(time * 1.13) * 0.017) * s;
      this.camera.position.set(t.x + off.x + px + hx, t.y + off.y + py + hy, t.z + off.z);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(t);
      this.camera.rotateZ(this.baseRoll + Math.sin(time * 0.23) * 0.004);
      if (this.pitchOffset) this.camera.rotateX(this.pitchOffset);
    }

    /* hover pick + coordinate readout, throttled, ground chapters only */
    this.pickTick += dt;
    if (this.pickTick > 0.06 && this.pointer.inside && this.props.visible) {
      this.pickTick = 0;
      this.updatePick();
    }
  }

  /** raycast for the hover HUD — hotspots first, then the ground plane */
  updatePick() {
    this.ndc.set(this.pointer.x, -this.pointer.y);
    this.ray.setFromCamera(this.ndc, this.camera);

    const hit = this.ray.intersectObjects(this.hotspots, false)[0];
    if (this.tip) {
      if (hit) {
        this.tip.querySelector(".t").textContent = hit.object.userData.label;
        this.tip.querySelector(".d").textContent = hit.object.userData.detail;
        this.tip.style.transform =
          `translate(${this.pointer.px + 34}px, ${this.pointer.py - 10}px)`;
        this.tip.classList.add("on");
      } else {
        this.tip.classList.remove("on");
      }
    }

    /* ground coordinate under the cursor — reads like a real data collector */
    if (this.readoutN && this.floor) {
      const g = this.ray.intersectObject(this.floor, false)[0];
      if (g) {
        const x = g.point.x, z = g.point.z;
        this.readoutE.textContent = (491000 + x * 10).toFixed(2);
        this.readoutN.textContent = (5459000 + -z * 10).toFixed(2);
        this.readoutZ.textContent = (terrainH(x, z) * 100).toFixed(2);
      }
    }
  }
}
