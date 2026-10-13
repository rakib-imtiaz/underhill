// Ground Truth — orchestrator.
// One WebGL renderer, one scene with three stations. Scroll position u (in screen heights) drives
// every spatial state through timeline.js; a separate clock drives rotor spin, signal rings and grain.
//
// Review hooks: ?frame=<0..1> renders that moment synchronously (no scroll, no rAF dependence);
// window.__scene exposes seek / stats / bench / checkExplode. Other params: ?reduced=1, ?mobile=1,
// ?lb=0|1 (letterbox, landscape only), ?q=lite|balanced|high|auto (quality tier, js/quality.js).
//
// Quality: every cost knob comes from the device tier Q (quality.js), passed to each module through its
// constructor options; MOBILE only decides layout (portrait framing, caption card, grain size). A live
// governor trims the pixel ratio, then the streak and a bloom level, when frames run slow.
import * as THREE from 'three';
import { Stage, STATIONS, RIM } from './stage.js';
import { Post } from './post.js';
import { Models } from './models.js';
import { Labels } from './labels.js';
import { SignalRings, LaserShot, DustMotes, LightShaft } from './effects.js';
import * as TL from './timeline.js';
import { Field, FIELD, ELEV0, groundAt, parcelToWorld } from './field.js';
import { Globe, SITE } from './globe.js';
import { Cards } from './cards.js';
import { cardSpecs } from './cardspecs.js';
import { setProgress } from './header.js';
import { outlineOf, outlinePoints } from './outline.js';
import { Daylight, savedDaylight, saveDaylight } from './daylight.js';
import { LogoTrace } from './logotrace.js';
import { detectQuality, startGovernor } from './quality.js';
import { applyTheme } from './theme.js';

const bootProgress = (pct, msg) => window.__boot?.(pct, msg);   // the boot screen's progress (film.html)
bootProgress(18, 'Setting up the studio…');
const q = new URLSearchParams(location.search);
const DEBUG_FRAME = q.has('frame') ? THREE.MathUtils.clamp(Number(q.get('frame')) || 0, 0, 1) : null;
const REDUCED = q.has('reduced') ? q.get('reduced') !== '0' : matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOBILE = q.has('mobile') ? q.get('mobile') !== '0'
  : (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820) || Math.min(innerWidth, innerHeight) < 520;
// the device's quality tier (?q= overrides): every cost knob below reads Q, never MOBILE
const Q = detectQuality();
document.documentElement.dataset.quality = Q.tier;
// one build per instrument, and the pipeline that made it (shown under each in the finale)
const BUILDS = { drone: 'B', gnss: 'B', ts: 'A' };
// the finale's tags: what each instrument is for (one plain line under its name)
const TAG_LINES = { drone: 'LiDAR + photo from the air', gnss: 'Centimetre position from orbit', ts: 'Angles and distance, to the millimetre' };
const TARGET_RANGE = 7.2;     // slant distance to the prism, metres

const $ = (s) => document.querySelector(s);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

if (REDUCED) { document.documentElement.classList.add('is-reduced'); document.body.classList.add('is-reduced'); }
if (DEBUG_FRAME !== null) document.body.classList.add('is-frame');   // review captures: no CSS fades

/* --------------------------------------------------------------------------------- renderer */
const canvas = $('#stage');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, alpha: false, powerPreference: 'high-performance',
    preserveDrawingBuffer: DEBUG_FRAME !== null || q.has('shots'),
  });
  if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 unavailable');
} catch (e) {
  document.body.classList.add('no-webgl');
  $('#fallback-msg').textContent = 'This film is drawn live with WebGL 2, which this browser or device cannot provide. Here is the text version.';
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, Q.dprCap));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const STUDIO_ENV = 0.55, FIELD_ENV = 0.42;   // the studio's environment light (stage.js), raised under the title on tall screens
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = Q.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = true;
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  document.body.classList.remove('is-ready');
  $('#fallback-msg').textContent = 'The graphics context was lost. Reload the page to continue.';
});

const stage = new Stage(renderer, { mobile: MOBILE, q: Q });
const scene = stage.scene;
const post = new Post(renderer, { mobile: MOBILE, q: Q });
const camera = new THREE.PerspectiveCamera(30, 1, 0.03, 60);
const field = new Field(scene, { mobile: MOBILE, q: Q, scenery: true });
field.buildProfile(TL.profilePoints());   // after the terrain exists: the points sit on its mesh
const globe = new Globe(scene, { mobile: MOBILE, q: Q });
field.monument.position.copy(FIELD.stations.gnss);
field.pad.position.set(FIELD.stations.drone.x, FIELD.stations.drone.y + 0.004, FIELD.stations.drone.z);
// the drone's laser writes Underhill's mark on the pad, to be read from the camera at its rest (az 36)
const LOGO_AZ = 36;
const fx = {
  logo: new LogoTrace(scene, { centre: STATIONS.drone.clone().add(new THREE.Vector3(Math.sin(THREE.MathUtils.degToRad(LOGO_AZ)), 0, Math.cos(THREE.MathUtils.degToRad(LOGO_AZ))).multiplyScalar(0.03)), az: LOGO_AZ, width: 0.9 }),
  rings: new SignalRings(scene),
  laser: new LaserShot(scene),
  shaft: new LightShaft(scene),
};
// the title's overhead spotlight: the drone's key light swings from its front-left stand to straight
// overhead while the title is up (a light position and cone: uniforms only), with a visible shaft
const KEY_HOME = stage.stations.drone.keyLight.position.clone();
const KEY_TOP = new THREE.Vector3(-0.1, 3.3, 0.2);
const _shaftAt = new THREE.Vector3(), _keyDir = new THREE.Vector3();
let spotWas = -1;
const labels = new Labels($('#labels'), $('#leaders'));
const dust = Object.fromEntries(Object.entries(stage.stations).map(([k, st]) => [k, new DustMotes(st.keyRig, st.keyLight, { count: Q.dust })]));
const intertitleEls = [...document.querySelectorAll('.intertitle')];
// daylight mode (daylight.js): blended over every frame after it is posed; the switch is in the header
const daylight = new Daylight({ stage, field, globe });
let dayFrame = 0;
// Act II prism: placed once, independent of which total station build is resident
const fieldLaser = new LaserShot(scene);
fieldLaser.placeAt(TL.PRISM_GLASS, groundAt(FIELD.prism.x, FIELD.prism.z), FIELD.stations.ts.clone().add(new THREE.Vector3(0, 1.1, 0)));
fieldLaser.light.visible = false;   // only part of the field's light set
const droneFlight = { pos: new THREE.Vector3(), heading: Math.PI / 2, pitch: 0, scanning: false, flying: false, payload: new THREE.Vector3() };

// The Act III cut happens behind the drone: it keeps flying at the lens in an overlay pass drawn over
// the planet, with its own camera (the closing field camera) and the field's exact light set, so no
// new shader programs are needed. Everything it needs is put on this layer.
const OV = 6;
const ovCam = new THREE.PerspectiveCamera(30, 1, 0.02, 200);
ovCam.layers.set(OV);
const ovState = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 30 };
function enableOverlayLayer() {
  scene.traverse((o) => { if (o.isLight) o.layers.enable(OV); });
  stage.stations.drone.model?.root.traverse((o) => o.layers.enable(OV));
}

// the film keeps all three instruments resident (the field and the finale show them together), so its
// budget never drops below 3; Q.modelBudget (2 on lite) matters where builds swap (the gear page)
const models = new Models(stage, { mobile: MOBILE, q: Q, defaults: BUILDS, budget: Math.max(3, Q.modelBudget) });
models.onChange = (object, entry) => {
  keyOutlines.clear();          // the fitted keys' outlines belong to the old build
  if (object === 'ts') placeLaserTarget(entry);
  enableOverlayLayer();
  warmShaders();
  labels.invalidate();          // force the label set to rebuild against the new build
  needsRender = true;
};

/* ----------------------------------------------------------------------------------- layout */
const HEAD_H = 76;   // Underhill's header height (--uh-head-h)
const PIXEL_BUDGET = { lite: 1.1e6, balanced: 1.8e6, high: 3.2e6 };   // drawn pixels per frame, by tier
let dprLimit = Infinity;   // set by the governor's steps
let cards = null;
const view = { w: 1, h: 1, portrait: false, bandTop: 0, bandBottom: 0, colTop: 0, colBottom: 0 };
let letterbox = q.has('lb') ? q.get('lb') !== '0' : (store.get('gt.letterbox') ?? null);
let vhPx = innerHeight;

// Viewport heights. The UI lives in the small viewport (100svh: a mobile browser's toolbars out) and
// the canvas fills the large one (100lvh), so neither moves nor resizes when a toolbar collapses.
const probe = (css) => {
  const d = document.createElement('div');
  d.setAttribute('aria-hidden', 'true');
  d.style.cssText = `position:fixed;left:0;top:0;width:0;visibility:hidden;pointer-events:none;${css}`;
  document.body.appendChild(d);
  return d;
};
const probeS = probe('height:100vh;height:100svh'), probeL = probe('height:100vh;height:100lvh');
const probeSafe = probe('height:0;padding-bottom:env(safe-area-inset-bottom,0px)');

function layout() {
  const W = innerWidth;
  const hs = probeS.offsetHeight || innerHeight;
  const hl = Math.max(hs, probeL.offsetHeight || innerHeight);
  const safeB = probeSafe.offsetHeight || 0;
  vhPx = hs;
  const portrait = W / hs < 0.8 || W < 760;
  const tablet = portrait && W >= 600;
  // letterbox bars are a landscape option: tall screens are always full-bleed
  // (by default only where there is height to spare: a short window, 585 px say, gives the picture
  // the whole height, so the drone still fits under the title)
  const lb = !portrait && (letterbox ?? hs >= 720);
  document.body.classList.toggle('no-letterbox', !lb);
  document.body.classList.toggle('is-portrait', portrait);
  document.body.classList.toggle('is-tablet', tablet);
  $('#lb-toggle').setAttribute('aria-pressed', String(lb));
  let barT = 0, barB = 0;
  if (lb) {
    const b = Math.round(THREE.MathUtils.clamp(hs * 0.15, 118, 150)); barT = b; barB = b;
    // the bottom bar always fits its tallest caption (a title that wraps at an odd window size must
    // never be pushed off the bottom edge): measured, plus the bar's own padding and some air
    let capMax = 0;
    for (const el of captionEls.values()) capMax = Math.max(capMax, el.offsetHeight);
    barB = Math.max(barB, Math.ceil(capMax) + 34 + 18);
  }
  const picTop = barT, picH = lb ? Math.max(120, hs - barT - barB) : hl;
  // the caption card's reserved height on tall screens (kicker, title and one line; tablets: two)
  const capH = portrait ? (tablet ? 128 : 92) : 0;
  const root = document.documentElement.style;
  root.setProperty('--pic-top', `${picTop}px`);
  root.setProperty('--pic-h', `${picH}px`);
  root.setProperty('--bar-top', `${lb ? barT : 0}px`);
  root.setProperty('--bar-bot', `${lb ? barB : 0}px`);
  root.setProperty('--cap-h', `${capH}px`);
  // the pixel ratio: the tier's cap, the governor's limit, and a pixel budget per tier, so a very wide
  // window (2000 px and up) does not ask an integrated GPU for 2+ megapixels a frame
  const budget = PIXEL_BUDGET[Q.tier] || PIXEL_BUDGET.balanced;
  const dpr = Math.max(0.75, Math.min(devicePixelRatio || 1, Q.dprCap, dprLimit, Math.sqrt(budget / Math.max(1, W * picH))));
  if (Math.abs(renderer.getPixelRatio() - dpr) > 1e-3) renderer.setPixelRatio(dpr);
  renderer.setSize(W, picH, false);
  post.setSize(W, picH);
  // the chapter rail has its own band under the header: nothing is placed above its bottom edge
  const railBottom = HEAD_H + (portrait ? 14 : THREE.MathUtils.clamp(hs * 0.024, 10, 22)) + 16;
  root.setProperty('--rail-bottom', `${railBottom}px`);
  const top = railBottom + 10 - picTop;                       // picture px
  const capTop = hs - capH - 10 - safeB - picTop;             // the caption card's top edge (portrait)
  // the stage: the free area the subject is framed into (main camera, see frameCamera)
  let stage;
  if (lb) stage = { x0: 0, y0: 0, x1: W, y1: picH };
  else if (portrait) stage = { x0: 0, y0: top, x1: W, y1: capTop - 10 };
  else stage = { x0: 0, y0: top, x1: W, y1: hs - 214 - picTop };
  Object.assign(view, { w: W, h: picH, hs, portrait, tablet, picTop, stage, capTop });
  view.bandTop = lb ? 10 : top; view.bandBottom = lb ? picH - 10 : stage.y1;
  view.colTop = lb ? Math.max(picH * 0.07, 10) : top + 4; view.colBottom = lb ? picH * 0.93 : stage.y1 - 8;
  // the title: the title block at the top, the drone framed between it and the scroll cue, never
  // behind the text (the stage eases to the regular one as the title fades)
  const sub = $('.title-card__sub');
  const tb = sub.offsetTop + sub.offsetHeight;
  view.titleStage = { x0: 0, y0: tb + 18, x1: W, y1: Math.min(picH, hs - picTop) - 64 - safeB - 10 };
  cards?.invalidate();
  // scroll track: one section per beat, heights in px from the stable viewport height
  for (const el of trackSections) el.style.height = `${(Number(el.dataset.u1) - Number(el.dataset.u0) + (el.dataset.last ? 1 : 0)) * vhPx}px`;
  needsRender = true;
}

/** The stage at u: the title frames the drone under the title block. */
function stageAt(u) {
  const st = view.stage, t = view.titleStage;
  // (it eases out only once the title has gone, so the drone never rises behind the text)
  if (!t || u >= 1.6) return st;
  const k = THREE.MathUtils.smoothstep(u, 1.0, 1.6);
  return { x0: st.x0, x1: st.x1, y0: t.y0 + (st.y0 - t.y0) * k, y1: t.y1 + (st.y1 - t.y1) * k };
}

/** Frame a camera into a stage rectangle of the picture (the rest of the picture extends around it). */
function frameCamera(cam, st, fov, near, far) {
  const sw = Math.max(1, st.x1 - st.x0), sh = Math.max(1, st.y1 - st.y0);
  cam.fov = fov; cam.near = near; cam.far = far; cam.aspect = sw / sh;
  cam.setViewOffset(sw, sh, -st.x0, -st.y0, view.w, view.h);   // also updates the projection
}

// What a fitted studio shot frames: the instrument of the chapter (all three in the finale), switched
// in the middle of each dip to black. A pulse shot also frames the floor its pulses land on.
// A fitted key frames its subject as it stands AT THAT KEY, not as it stands this frame: between two
// keys the camera then glides from one fixed framing to the next. (Fitted to the live pose, the camera
// was dragged by every part in motion: a 100 px lurch in four frames as the top payload flew off in the
// explode, and a shake of up to 300 px a frame while the rotors turned, their boxes swinging the fit.)
// The outline at a key is read once (the model is posed at the key's u, measured, and put back) and
// kept until a model is rebuilt or the stations change layout.
const keyOutlines = new Map();
const _keyFlight = { pos: new THREE.Vector3(), heading: Math.PI / 2, pitch: 0, scanning: false, flying: false };
function outlineAtKey(name, entry, ku, hit) {
  const id = `${name}|${entry.key}|${ku}|${stage.layout}|${hit ? 1 : 0}`;
  let pts = keyOutlines.get(id);
  if (pts) return pts;
  const now = lastState;
  poseModel(name, entry, TL.sceneAt(ku), _keyFlight);
  pts = outlinePoints(entry.inst.root, { force: true });
  if (hit && name === 'drone') pts = pts.concat(pulseFloor());
  if (now) poseModel(name, entry, now, droneFlight);   // back to this frame's pose
  entry.inst.root.updateMatrixWorld(true);
  keyOutlines.set(id, pts);
  return pts;
}
function fitSubject(u, key) {
  // (Act II: the control shot frames the base station, the pre-flight the drone, on tall screens)
  const names = u < 10.62 ? ['drone'] : u < 18.14 ? ['gnss'] : u < 25.6 ? ['ts'] : u < TL.FCUT ? ['drone', 'gnss', 'ts']
    : u >= 30.2 && u < 32.6 ? ['gnss'] : u >= TL.HERO.cut && u < TL.HERO.lift[1] ? ['drone'] : null;
  if (!names) return null;
  const pts = [];
  for (const n of names) { const e = models.active(n); if (!e) return null; for (const q of outlineAtKey(n, e, key.u, key.hit)) pts.push(q); }
  return pts;
}
function pulseFloor() {
  const so = models.active('drone')?.inst.sockets.payload;
  if (!so) return [];
  so.updateWorldMatrix(true, false);
  const o = so.getWorldPosition(new THREE.Vector3());
  const d = new THREE.Vector3(0, 0, 1).transformDirection(so.matrixWorld);
  if (d.y > -0.05) return [o];
  // the mark the laser writes on the pad, whole (the shot frames where it will be, from the start)
  return [o, ...fx.logo.corners];
}

// Calm overlays: the caption card and the information cards fade while the camera is moving and come
// back when it holds, so the animation itself is always readable. Motion is the camera's travel per
// screen-height of scroll, relative to its distance from what it looks at (a pure function of u).
const _m0 = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 30 }, _m1 = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 30 };
function cameraMotion(u) {
  const st = view.stage, asp = (st.x1 - st.x0) / Math.max(1, st.y1 - st.y0);
  TL.cameraAt(Math.max(0, u - 0.06), asp, _m0, { tall: view.portrait });
  TL.cameraAt(Math.min(TL.U, u + 0.06), asp, _m1, { tall: view.portrait });
  const d = Math.max(0.05, _m0.pos.distanceTo(_m0.tgt));
  return (_m0.pos.distanceTo(_m1.pos) + _m0.tgt.distanceTo(_m1.tgt)) / d / 0.12;
}
function calmAt(u) {
  if (REDUCED) return 1;
  return 1 - THREE.MathUtils.smoothstep(cameraMotion(u), CALM[0], CALM[1]);
}
const CALM = [1.1, 2.4];

/* ------------------------------------------------------------------------- captions + track */
const captionEls = new Map();
const trackSections = [];
for (const b of TL.BEATS) {
  const sec = document.createElement('section');
  sec.className = 'beat'; sec.id = `beat-${b.id}`;
  sec.dataset.u0 = b.u0; sec.dataset.u1 = b.u1;
  if (b === TL.BEATS[TL.BEATS.length - 1]) sec.dataset.last = '1';
  if (b.title) {
    sec.innerHTML = `<div class="beat__text"><h2></h2><p></p></div>`;
    sec.querySelector('h2').textContent = `${b.kicker}: ${b.title}`;
    sec.querySelector('p').textContent = b.copy;
    const c = document.createElement('div');
    c.className = 'caption';
    c.innerHTML = '<p class="caption__kicker"></p><h2 class="caption__title"></h2><p class="caption__copy"></p><p class="caption__line"></p>';
    c.querySelector('.caption__kicker').textContent = b.kicker;
    c.querySelector('.caption__title').textContent = b.title;
    c.querySelector('.caption__copy').textContent = b.copy;
    c.querySelector('.caption__line').textContent = b.short || '';   // phones: one short line
    $('#captions').insertBefore(c, $('#cap-extra'));
    captionEls.set(b.id, c);
  }
  $('#track').appendChild(sec);
  trackSections.push(sec);
}

/* ------------------------------------------------------------------------------ HUD wiring */
const railBtns = [...document.querySelectorAll('.rail__ticks button')];
for (const btn of railBtns) {
  // a click on the rail jumps (briskly) to the chapter's first resting beat
  btn.addEventListener('click', () => stepTo(stopIndexAtOrAfter(TL.CHAPTER_START[btn.dataset.go] + 0.02), { jump: true }));
}
// the rail counts the five chapters; the title belongs to the first, the three-instrument close to the third
const RAIL = { title: -1, drone: 0, gnss: 1, ts: 2, end: 2, field: 3, world: 4 };
const RAIL_NAMES = ['Drone', 'GNSS base', 'Total station', 'In the field', 'The world'];
let railAt = -2;   // (not a chapter: the first update always writes the rail)
function updateRail(chapter) {
  const k = RAIL[chapter] ?? 0;
  if (k === railAt) return;
  railAt = k;
  // the title is the intro: "00" and no chapter until Act 01 starts
  $('#rail-num').textContent = String(k + 1).padStart(2, '0');
  $('#rail-name').textContent = k >= 0 ? RAIL_NAMES[k] : '';
  $('#rail').classList.toggle('is-intro', k < 0);
  railBtns.forEach((b, i) => b.setAttribute('aria-current', i === k ? 'step' : 'false'));
}
$('#lb-toggle').addEventListener('click', () => {
  letterbox = !document.body.classList.contains('no-letterbox') ? false : true;
  store.set('gt.letterbox', letterbox);
  layout();
});

/* ------------------------------------------------------------------------ shader warm-up */
// three.js compiles a material's program the first time it is drawn with a given light set. Done
// mid-scroll that is a visible stall (seconds, for 80+ programs), so programs are prepared ahead
// of time with the non-blocking compileAsync (KHR_parallel_shader_compile), for the studio light set
// whenever a model arrives, and once for the field's and the planet's light sets as soon as all three
// are resident. (The drone's overlay over the planet reuses the field's light set: nothing new.)
let fieldWarm = false;
function warmShaders() {
  // programs depend on the render target (linear HDR here, not the tone-mapped screen), so compile
  // against the same target the scene is really drawn into
  const compile = () => {
    const prevRT = renderer.getRenderTarget();
    renderer.setRenderTarget(post.sceneRT);
    const p = renderer.compileAsync ? renderer.compileAsync(scene, camera) : (renderer.compile(scene, camera), Promise.resolve());
    renderer.setRenderTarget(prevRT);
    return p.catch(() => {});
  };
  // Depth programs: the contact shadows and the key lights' shadow maps draw the models with depth
  // materials that compileAsync does not prepare, one variant per kind of mesh (instanced or not, map /
  // alpha test). Draw both once here with every station and every part of every model shown (some
  // parts, like the screws below the high tier, only appear later), then restore and redraw for real.
  // (the frame is drawn through a camera that sees nothing, so only the shadow maps are drawn: the
  // parts shown for this are not compiled for the main pass, which they never reach that way)
  const depthCam = new THREE.PerspectiveCamera(1, 1, 0.01, 0.02);
  depthCam.position.set(0, -500, 0); depthCam.lookAt(0, -1000, 0); depthCam.updateMatrixWorld();
  const warmDepth = () => {
    const shown = [];
    for (const st of Object.values(stage.stations)) st.group.traverse((o) => { if (!o.visible) { o.visible = true; shown.push(o); } });
    for (const st of Object.values(stage.stations)) st.contact.render();
    if (renderer.shadowMap.enabled) {
      // three draws the shadow maps before it sets up the frame's lights, so a depth program's key
      // carries the light counts of the previous draw: right after a contact pass (no lights on its
      // layer) or after a full frame. Two frames compile both variants.
      const prevRT = renderer.getRenderTarget();
      renderer.setRenderTarget(post.sceneRT);
      for (let i = 0; i < 2; i++) {
        for (const st of Object.values(stage.stations)) if (st.keyLight.castShadow) st.keyLight.shadow.needsUpdate = true;
        renderer.render(scene, depthCam);
      }
      renderer.setRenderTarget(prevRT);
    }
    for (const o of shown) o.visible = false;
    for (const key of Object.keys(stage.stations)) stage.markDirty(key);
    needsRender = true;
  };
  const run = () => {
    compile();
    if (fieldWarm || !models.active('drone') || !models.active('gnss') || !models.active('ts')) return;
    fieldWarm = true;
    const prev = stage.layout;
    const lit = [fx.laser.light.visible, fieldLaser.light.visible];
    const globeOn = globe.group.visible;
    if (prev !== 'studio' && prev !== 'finale') {
      // opened part-way down the page: the studio's light set has not been seen yet
      stage.setLayout('studio', FIELD.stations);
      field.group.visible = false; globe.group.visible = false;
      fx.laser.light.visible = true; fieldLaser.light.visible = false;
      compile();
    }
    warmDepth();                     // the studio's (or the finale's) depth passes
    stage.setLayout('field', FIELD.stations);
    field.group.visible = true;
    fx.laser.light.visible = false; fieldLaser.light.visible = true;
    compile();
    warmDepth();
    // and the planet's (its own light set and no fog), so the Act III cut compiles nothing either
    stage.setLayout('globe', FIELD.stations);
    field.group.visible = false; globe.group.visible = true;
    fx.laser.light.visible = true; fieldLaser.light.visible = false;
    compile();
    stage.setLayout(prev, FIELD.stations);
    field.group.visible = prev === 'field';
    globe.group.visible = globeOn;
    [fx.laser.light.visible, fieldLaser.light.visible] = lit;
  };
  (window.requestIdleCallback || ((f) => setTimeout(f, 300)))(run, { timeout: 1500 });
}

/* ------------------------------------------------------------------------------- the laser */
function placeLaserTarget(entry) {
  const { inst, staged } = entry;
  const wasFinale = stage.finale;
  stage.setLayout(false);          // the prism belongs to the chapter layout
  // pose the instrument at its final aim, read the line of sight, then let the timeline take over
  staged.apply(0);
  inst.root.position.y = 0;
  inst.pose({ yaw: 160, tilt: 4.2 });
  inst.root.updateMatrixWorld(true);
  fx.laser.place(inst.sockets.objective, TARGET_RANGE);
  stage.setLayout(!!wasFinale);
  entry.sig = '';
}

/* ---------------------------------------------------------------------------- per-frame state */
const tmpV = new THREE.Vector3();
const camState = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 30 };
const rotor = { speed: 0 };
let needsRender = true;
let lastState = null;

function stationState(key, s) {
  if (key === 'drone') {
    const d = s.drone;
    return { explode: d.explode, hover: d.hover, pose: { gimbalPitch: d.gimbal, gimbalYaw: d.gimbalYaw, gimbalRoll: d.gimbalRoll, fold: d.fold } };
  }
  if (key === 'gnss') return { explode: s.gnss.explode, hover: 0, pose: {} };
  return { explode: s.ts.explode, hover: 0, pose: { yaw: s.ts.yaw, tilt: s.ts.tilt } };
}

/** Pose one instrument as the timeline has it in state `s` (explode, lift, hover, flight, pose). */
function poseModel(key, entry, s, flight) {
  const st = stationState(key, s);
  const lift = entry.staged.apply(st.explode);
  entry.inst.onExplode?.(st.explode);
  const root = entry.inst.root;
  if (key === 'drone' && (s.inField || s.droneOverlay)) {
    // Act II: the drone flies its mission (and, past the Act III cut, out of the frame over the
    // planet); the station (pad, work light, contact shadow) stays put
    TL.fieldDrone(s.u, flight);
    root.position.copy(flight.pos).sub(stage.stations.drone.group.position);
    root.rotation.order = 'YXZ';
    root.rotation.set(flight.pitch, Math.PI / 2 - flight.heading, 0);
  } else {
    root.position.set(0, lift + st.hover, 0);
    root.rotation.set(0, 0, 0);
  }
  entry.inst.pose(st.pose);
  return st;
}

function apply(u, dt, clock, { instant = false } = {}) {
  const s = TL.sceneAt(u);
  lastState = s;

  // layout (chapter stations or the gathered finale) and lights
  if (stage.layout !== s.layout) {
    stage.setLayout(s.layout, FIELD.stations);
    // keep the light count fixed inside a layout: toggling a light per frame recompiles every shader
    fx.laser.light.visible = !s.inField;
    fieldLaser.light.visible = s.inField;
  }
  field.group.visible = s.inField;
  globe.update(s.globe, REDUCED ? 1.3 : clock, renderer.getPixelRatio());
  // tall screens: under the title the drone is the whole picture, so its key comes up further (light
  // intensities only: no new shaders)
  // and the dark airframe gets more of its surroundings and a stronger rim
  const titleK = view.portrait ? 1 - THREE.MathUtils.smoothstep(u, 1.0, 1.6) : 0;
  stage.setFocus({ drone: Math.min(1, s.focus.drone + 0.7 * titleK), gnss: s.focus.gnss, ts: s.focus.ts, rimFloor: 0 });
  const rf = s.focus.rimFloor.drone;
  if (rf > 0) stage.stations.drone.rim.intensity = Math.max(stage.stations.drone.rim.intensity, RIM * rf);
  stage.stations.drone.rim.intensity *= 1 + 0.6 * titleK;
  // (written every frame: daylight.js scales it)
  stage.scene.environmentIntensity = stage.layout === 'field' ? FIELD_ENV : STUDIO_ENV * (1 + 1.2 * titleK);
  renderer.toneMappingExposure = 1 + 0.45 * titleK;   // (a uniform: no new shaders)

  // stations
  for (const key of Object.keys(STATIONS)) {
    const entry = models.active(key);
    if (!entry) continue;
    // a chapter in the studio shows its own instrument only: a neighbour standing in the dark (or, in
    // daylight, plainly visible behind the subject) is hidden, so it never clutters the shot.
    // (the model root only: the station's lights stay, so the light set and the shaders do not change)
    const shown = s.layout !== 'studio' || stage.stations[key].focus > 0.004;
    if (entry.inst.root.visible !== shown) { entry.inst.root.visible = shown; stage.markDirty(key); }
    const st = poseModel(key, entry, s, droneFlight);
    const root = entry.inst.root;
    if (key === 'drone') entry.inst.leds?.(s.drone.leds);
    // shadows only matter near the station: a drone far up the valley re-renders them once, on leaving
    const near = key !== 'drone' || root.position.lengthSq() < 9;
    const sig = `${st.explode.toFixed(4)}|${root.position.y.toFixed(4)}|${JSON.stringify(st.pose)}|${JSON.stringify(key === 'drone' ? s.drone.leds : 0)}`;
    if (sig !== entry.sig) { if (near || entry.wasNear) stage.markDirty(key); entry.sig = sig; }
    entry.wasNear = near;
  }
  // camera: after the stations are posed, so a fitted shot frames this frame's pose
  const st = stageAt(u);
  TL.cameraAt(u, (st.x1 - st.x0) / Math.max(1, st.y1 - st.y0), camState, { tall: view.portrait, subject: fitSubject });
  camera.position.copy(camState.pos);
  // a camera on a dolly is never perfectly still: a few millimetres of slow drift (off when reduced)
  // (locked off while the drone flies at the lens, where a few centimetres would swing it across frame)
  const lock = 1 - THREE.MathUtils.smoothstep(TL.approachAt(u), 0.3, 0.6);
  const drift = (cam, cs) => {
    if (REDUCED) return;
    const a = 0.0022 * cs.pos.distanceTo(cs.tgt) * lock;
    cam.position.x += a * (Math.sin(clock * 0.37) + 0.5 * Math.sin(clock * 0.83 + 1.3));
    cam.position.y += a * 0.7 * (Math.sin(clock * 0.29 + 2.1) + 0.5 * Math.sin(clock * 0.71));
  };
  drift(camera, camState);
  camera.lookAt(camState.tgt);
  const far = u >= TL.GCUT ? 200 : u >= TL.FCUT ? 1700 : 60, near = u >= TL.GCUT ? 0.004 : u >= TL.FCUT ? 0.05 : 0.03;
  frameCamera(camera, st, camState.fov, near, far);
  if (s.droneOverlay) {
    // the closing field camera, held where it was at the cut
    const so = view.stage;
    TL.cameraAt(TL.GCUT - 1e-4, (so.x1 - so.x0) / Math.max(1, so.y1 - so.y0), ovState, { tall: view.portrait });
    ovCam.position.copy(ovState.pos); drift(ovCam, ovState); ovCam.lookAt(ovState.tgt);
    frameCamera(ovCam, so, ovState.fov, ovCam.near, ovCam.far);
    ovCam.updateMatrixWorld();
  }
  stage.aimRigs(camState.pos);
  camera.updateMatrixWorld();

  // rotors: the scroll sets the target (parked 0, flying 1); the speed ramps to it on the clock, about
  // a second up and a little less down, so they spin up and wind down the same way whatever the scroll
  const droneEntry = models.active('drone');
  if (droneEntry) {
    const target = s.drone.spin;
    const rate = target > rotor.speed ? 1 / 1.0 : 1 / 0.8;
    rotor.speed = instant ? target : rotor.speed + THREE.MathUtils.clamp(target - rotor.speed, -rate * dt, rate * dt);
    if (Math.abs(rotor.speed - target) < 0.002) rotor.speed = target;
    // parked props are stowed while the arms are folded, and return to their modelled angle as they unfold
    // (they stay stowed until the arms are nearly down, clear of the hull)
    droneEntry.inst.spin(REDUCED || DEBUG_FRAME !== null || instant ? 0 : dt, rotor.speed, s.drone.park ? THREE.MathUtils.smoothstep(s.drone.fold, 0.05, 0.4) : null);
    // spinning props only change the pad's shadows while the drone is close to them
    if (rotor.speed > 0.02 && !REDUCED && droneEntry.inst.root.position.lengthSq() < 2.5) stage.markDirty('drone');
  }

  // effects
  fx.logo.update(droneEntry?.inst.sockets.payload || null, s.drone.pulse, s.drone.pulsePersist, daylight.d);
  const gnssEntry = models.active('gnss');
  fx.rings.update(gnssEntry?.inst.sockets.dome || null, s.gnss.rings, clock, camera.position.y);
  const tsEntry = models.active('ts');
  fx.laser.update(tsEntry?.inst.sockets.objective || null, s.ts.laser.travel, tsEntry ? s.ts.laser.lit : 0, tsEntry ? s.ts.laser.visible : 0, s.ts.laser.beam);
  const fl = s.field.laser;
  // the profile: the beam follows the laser's hops from point to point; otherwise it rests on the prism
  if (fl.end) fieldLaser.end.copy(fl.end); else fieldLaser.end.copy(TL.PRISM_GLASS);
  fieldLaser.update(tsEntry?.inst.sockets.objective || null, fl.travel, tsEntry ? fl.lit : 0, s.inField ? fl.visible : 0, fl.beam);
  if (s.inField) {
    let flying = null;
    if (droneEntry && droneFlight.flying) {
      // the scan fan starts at the payload: its world position for this frame
      stage.stations.drone.group.updateMatrixWorld(true);
      droneEntry.inst.sockets.payload.getWorldPosition(droneFlight.payload);
      flying = droneFlight;
    }
    field.update(s.field, flying, renderer.getPixelRatio(), REDUCED ? 1.3 : clock);
  }

  for (const [k, d] of Object.entries(dust)) d.update(REDUCED ? 3.0 : clock, s.inField ? 0 : s.focus[k] * (s.finaleLayout ? 0.25 : 0.6) * (1 - 0.8 * daylight.d), renderer.getPixelRatio());
  daylight.apply(dayFrame++);
  titleSpot(u);
  if (s.inField) field.look(daylight.d);   // the field's horizon / fog / key light / sky (field.js, after daylight)

  updateLabels(s, instant ? 0 : dt);
  updateDom(s);
}

const _labelBox = new THREE.Box3(), _labelC = new THREE.Vector3(), _corner = new THREE.Vector3();
/** The title's spotlight (after daylight, which sets the keys' cones): fades as the camera moves in. */
function titleSpot(u) {
  const spot = u >= 1.8 ? 0 : 1 - THREE.MathUtils.smoothstep(u, 0.95, 1.75);
  const st = stage.stations.drone, kl = st.keyLight, night = 1 - daylight.d;
  if (spot !== spotWas) {
    kl.position.lerpVectors(KEY_HOME, KEY_TOP, spot);
    st.shadowDirty = true; spotWas = spot;
    const dm = dust.drone.mat.uniforms;
    dm.keyPos.value.copy(kl.position); dm.keyDir.value.copy(_keyDir.copy(kl.target.position).sub(kl.position).normalize());
  }
  if (spot <= 0) { fx.shaft.update(null, null, 0); return; }
  kl.intensity += (110 * (1 - 0.7 * daylight.d) - kl.intensity) * spot;
  kl.angle += (17 * Math.PI / 180 - kl.angle) * spot * night;
  kl.penumbra += (0.95 - kl.penumbra) * spot;
  st.rim.intensity = Math.max(st.rim.intensity, RIM * 1.15 * spot * (1 - 0.45 * daylight.d));
  // motes in the beam, and the shaft itself (night only: on the bright studio it would only grey it)
  const dm = dust.drone.mat.uniforms;
  dm.amount.value = Math.max(dm.amount.value, 0.9 * spot * night);
  dust.drone.points.visible = dm.amount.value > 0.002;
  st.group.getWorldPosition(_shaftAt);
  fx.shaft.update(_shaftAt, camera.position, 0.3 * spot * night);
}

function updateLabels(s, dt = 0) {
  const key = s.labelsFor;
  const entry = key ? models.active(key) : null;
  if (!entry) { labels.set(null, []); return; }
  labels.set(entry.key, entry.labels);
  const gate = s[key].labels;
  const t = s[key].explode;
  const alpha = new Map();
  // tall screens: numbered dots, at most 3 parts at a time, in step with the explode (each part's
  // dot leaves just before the third part after it arrives)
  const dots = view.portrait;
  const L = entry.labels;
  L.forEach((l, i) => {
    let a = THREE.MathUtils.smoothstep(t, l.arrive - 0.035, l.arrive + 0.06);
    if (dots && i + 3 < L.length) { const nx = L[i + 3].arrive; a *= 1 - THREE.MathUtils.smoothstep(t, nx - 0.07, nx - 0.04); }
    alpha.set(l.id, a * gate);
  });
  const box = _labelBox.setFromObject(entry.inst.root, false);
  const subject = box.getCenter(_labelC);
  // projected box of the subject (for the portrait label bands)
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < 8; i++) {
    const c = _corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
    const y = (-c.y * 0.5 + 0.5) * view.h; minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    const x = (c.x * 0.5 + 0.5) * view.w; minX = Math.min(minX, x); maxX = Math.max(maxX, x);
  }
  labels.update(camera, view, alpha, {
    mode: dots ? 'dots' : 'columns',
    subject, subjectBox: { minY, maxY, minX, maxX }, root: entry.inst.root, occlusion: true,
    forceOcclusion: DEBUG_FRAME !== null || REDUCED, dt: REDUCED ? 0 : dt,
    bandTop: view.bandTop, bandBottom: view.bandBottom, colTop: view.colTop, colBottom: view.colBottom,
  });
}

const tagEls = [...document.querySelectorAll('.tag')];
for (const el of tagEls) el.querySelector('.tag__b').textContent = TAG_LINES[el.dataset.station] || '';
for (const el of tagEls) el.addEventListener('click', () => toggleFinale(el.dataset.station));
const readoutEl = $('#readout');
function project(v) {
  tmpV.copy(v).project(camera);
  return { x: (tmpV.x * 0.5 + 0.5) * view.w, y: (-tmpV.y * 0.5 + 0.5) * view.h, z: tmpV.z };
}

/* ---------------------------------------------------------------- Act II readouts and tags */
const fieldTagEls = new Map();
function fieldTag(id, html, cls = '') {
  let el = fieldTagEls.get(id);
  if (!el) {
    el = document.createElement('div');
    el.className = `ftag ${cls}`;
    el.innerHTML = html;
    $('#ftags').appendChild(el);
    fieldTagEls.set(id, el);
  }
  return el;
}
/** A survey-style annotation: point id over a plain name, a leader line down to a ring on the anchor. */
const callout = (code, name) => `<span class="ftag__k">${code}</span><span class="ftag__t">${name}</span><b class="ftag__leg"></b><i class="ftag__dot"></i>`;
function placeTag(el, world, a, dx = 0, dy = 0) {
  if (el.classList.contains('ftag') && !el.classList.contains('readout') && !el.classList.contains('ftag--plain')) { dx = 0; dy = 0; }
  el.style.opacity = a.toFixed(3);
  el.style.visibility = a > 0.002 ? 'visible' : 'hidden';
  if (a <= 0.002) return;
  const p = project(world);
  if (p.z > 1) { el.style.visibility = 'hidden'; return; }
  el._px = p.x + dx; el._py = p.y + dy;   // where it was put (the cards keep clear of it)
  el.style.transform = `translate3d(${el._px.toFixed(1)}px, ${el._py.toFixed(1)}px, 0)`;
}
/** A readout at a fixed place in the picture (fractions of its width and height). */
function placeFixed(el, a, fx, fy) {
  el.style.opacity = a.toFixed(3);
  el.style.visibility = a > 0.002 ? 'visible' : 'hidden';
  if (a <= 0.002) return;
  el._px = view.w * fx; el._py = view.h * fy;
  el.style.transform = `translate3d(${el._px.toFixed(1)}px, ${el._py.toFixed(1)}px, 0)`;
}
const W = new THREE.Vector3();
// tall screens: the pre-flight checklist is not a second panel over the picture; its live state is
// the caption card's last line (one overlay at a time)
let fieldLine = null;
function updateFieldDom(s) {
  const f = s.field, t = f.tags, on = s.inField;
  fieldLine = null;
  // (the control mark, the observed point, the profile, the capture, the model, the site and the
  // satellites are told by the information cards: see cardspecs.js)
  placeTag(fieldTag('t-prism', callout('PT-114', 'Reflector on the far slope')), TL.PRISM_GLASS, on ? t.prism : 0);
  const corners = field.stakes.map((st) => st.position);
  placeTag(fieldTag('t-bnd', callout('Parcel A', 'Staked boundary'), 'ftag--orange'), W.copy(corners[3]).setY(corners[3].y + 1.3), on ? t.boundary : 0);
  // the profile: the elevation at each end of the section (the card tells the rest)
  const NP = TL.PROFILE_LINE.n;
  for (const [i, id, dx] of [[0, 't-sec-a', -10], [NP - 1, 't-sec-b', 10]]) {
    const el = fieldTag(id, '<span></span>', 'ftag--plain ftag--sec');
    if (on && t.sectionEnds > 0.002) el.firstChild.textContent = `${(ELEV0 + field.sectionPoints[i].y).toFixed(1)} m`;
    // beside each end of the curve; on a narrow screen above it, so the far end never runs off the edge
    el.classList.toggle('is-end', dx > 0);
    // (near a screen edge the figure goes above its point instead of beside it, so it is never cut off)
    const anchor = field.sectionAnchor(i, true, W), px = project(anchor).x;
    const above = view.portrait || px < 110 || px > view.w - 110;
    el.classList.toggle('is-above', above);
    const inFrame = px > 8 && px < view.w - 8;   // an end that runs out of the frame keeps no figure
    placeTag(el, anchor, on && inFrame ? t.sectionEnds : 0, above ? 0 : dx, above ? -8 : 0);
  }
  // pre-flight checks: a readout in the clear sky at the top left of the close-ups
  const ck = fieldTag('ro-uav', '', 'readout ftag--ro ftag--checks');
  if (on && f.checkPanel > 0.002) {
    const rows = [['IMU', 'aligned'], ['RTK', 'fixed'], ['LiDAR', 'ready']];
    const key = f.checks.map((c) => (c > 0.5 ? 1 : 0)).join('');
    if (ck.dataset.key !== key) {
      ck.dataset.key = key;
      ck.innerHTML = '<span class="readout__k">UAV-01 · Pre-flight</span>' + rows.map(([k, v], i) => (f.checks[i] > 0.5
        ? `<span class="ck is-ok"><b>${k}</b> ${v}</span>` : `<span class="ck"><b>${k}</b> checking</span>`)).join('');
    }
    if (view.portrait) fieldLine = { text: 'Pre-flight · ' + rows.map(([k], i) => `${k} ${f.checks[i] > 0.5 ? '✓' : '…'}`).join(' · '), a: f.checkPanel, accent: '#7dffc4' };
  }
  // (clear of the HUD bar, which sits over the picture on phones)
  placeFixed(ck, on && !view.portrait ? f.checkPanel : 0, view.portrait ? 0.05 : 0.07, view.portrait ? Math.max(0.07, (view.bandTop + 12) / view.h) : 0.15);
  field.contourTags.forEach((c, i) => placeTag(fieldTag(`t-c${i}`, `<span>${c.text}</span>`, 'ftag--plain'), c.pos, on ? t.contours : 0));
  const crew = [['drone', 'UAV-01', 'Survey drone'], ['gnss', 'Base · CP-01', 'GNSS base station'], ['ts', 'TS-1', 'Total station']];
  for (const [k, code, name] of crew) {
    // the drone is not on its pad any more: its tag rides on it where it holds over the valley
    const at = k === 'drone' ? W.copy(droneFlight.pos).setY(droneFlight.pos.y + 0.45) : W.copy(FIELD.stations[k]).setY(1.25);
    // the base station and the total station stand close in this shot: the total station's tag stands taller
    // (only the drone's tag: it is the subject of the closing shot; the base station's and the total
    // station's would collide at this distance)
    const crewA = on && models.active(k) && k === 'drone' ? t.crew : 0;
    placeTag(fieldTag(`t-${k}`, callout(code, name), k === 'ts' ? 'ftag--tall' : ''), at, crewA);
  }
}

/* ------------------------------------------------------- the caption card (tall screens only) */
// One overlay at a time: kicker, title and one line. In an exploded view the line is the legend of
// the parts in view (numbered chips; a tap highlights the part's dot); while an information card is
// up, it is that card's facts. The card fades with its captions, and while the camera is moving.
const capEl = $('#captions'), legendEl = $('#cap-legend'), factsEl = $('#cap-facts');
let legendKey = '';
// the finale on tall screens: a numbered dot under each instrument, the names as chips in the card
let finaleLegend = null, finaleHi = null;
const FINALE_SHORT = { drone: 'Drone', gnss: 'GNSS base', ts: 'Total station' };
function toggleFinale(id) { finaleHi = finaleHi === id ? null : id; legendKey = ''; needsRender = true; }
function updateCaptionCard(capA) {
  if (!view.portrait) { capEl.style.removeProperty('--calm'); capEl.style.removeProperty('--extra'); capEl.style.visibility = ''; return; }
  let legend = labels.inView(), hi = labels.highlight, toggle = (id) => labels.toggle(id);
  if (!legend.length && finaleLegend) { legend = finaleLegend; hi = finaleHi; toggle = toggleFinale; }
  const facts = cards.line || fieldLine;
  let extra = 0;
  if (legend.length) {
    const key = legend.map((l) => l.id).join(',') + '|' + hi;
    if (key !== legendKey) {
      legendKey = key;
      legendEl.textContent = '';
      for (const l of legend) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'chip';
        b.setAttribute('aria-pressed', String(hi === l.id));
        b.innerHTML = '<b></b><span></span>';
        b.firstChild.textContent = String(l.n); b.lastChild.textContent = l.text;
        b.addEventListener('click', () => toggle(l.id));
        legendEl.appendChild(b);
      }
    }
    extra = Math.max(...legend.map((l) => l.a));
    legendEl.style.visibility = 'visible'; factsEl.style.visibility = 'hidden';
  } else {
    if (legendKey) { legendKey = ''; legendEl.textContent = ''; }
    legendEl.style.visibility = 'hidden';
    if (facts) {
      if (factsEl.textContent !== facts.text) factsEl.textContent = facts.text;
      factsEl.style.setProperty('--pl-accent', facts.accent || 'var(--sh-accent-soft)');
      factsEl.style.visibility = 'visible';
      extra = facts.a;
    } else factsEl.style.visibility = 'hidden';
  }
  extra = Math.min(1, extra);
  const show = Math.max(capA, extra) * frameCalm;
  capEl.style.setProperty('--extra', extra.toFixed(3));
  capEl.style.setProperty('--calm', show.toFixed(3));
  capEl.style.visibility = show > 0.01 ? 'visible' : 'hidden';
}
labels.onChange = () => { legendKey = ''; needsRender = true; };

/* ------------------------------------------------------------- the end-cards (the last stop) */
// "Fly the drone yourself", "Try the kit" and "Back to Underhill": they come up as the film settles on
// its last stop and stay while the page scrolls on past it. Landscape: in the bottom bar beside the
// caption; portrait: one row just above the caption card (inside the phones' UI budget).
const END_U = TL.BEATS[TL.BEATS.length - 1].still;
const endEl = $('#endcards');
let endShown = -1;
function updateEndcards(u) {
  if (!endEl) return;
  const a = Math.round(THREE.MathUtils.smoothstep(u, END_U - 0.32, END_U - 0.04) * 1000) / 1000;
  if (a === endShown) return;
  endShown = a;
  endEl.style.opacity = String(a);
  endEl.style.visibility = a > 0.01 ? 'visible' : 'hidden';
  endEl.style.translate = `0 ${((1 - a) * 10).toFixed(1)}px`;
  const live = a > 0.5;
  endEl.inert = !live;
  endEl.setAttribute('aria-hidden', String(!live));
}
$('#scroll-cue').addEventListener('click', () => stepBy(1));

/* ------------------------------------------------------------------ Underhill information cards */
/** The slant distance the total station reads to PT-114 (from its own optics when it is resident). */
function slopeToPrism() {
  const tsE = models.active('ts');
  if (!tsE) return fieldLaser.distance;
  return tsE.inst.sockets.objective.getWorldPosition(new THREE.Vector3()).distanceTo(TL.PRISM_GLASS);
}
cards = new Cards($('#ucards'), $('#uleads'));
for (const spec of cardSpecs({ TL, FIELD, ELEV0, SITE, field, globe, models, droneFlight, groundAt, parcelToWorld, camera, slope: slopeToPrism, logo: fx.logo })) cards.add(spec);
document.fonts?.ready.then(() => { cards.invalidate(); layout(); needsRender = true; });
/** Everything a card must keep clear of: the HTML labels, tags and readouts now on screen. */
const OBSTACLE_SEL = '#ftags > *, #labels > .label, #tags > .tag, #readout, #endcards';
// A tag's box relative to the point it was placed on depends only on its own size and CSS anchor, so
// it is measured once (again when its text or class changes) and rebuilt from the placed point each
// frame: no forced layout per frame. Elements placed elsewhere are measured directly.
function cardObstacles() {
  const pic = view.picTop || 0, out = [];
  for (const el of document.querySelectorAll(OBSTACLE_SEL)) {
    if (el.style.visibility === 'hidden' || !(Number(el.style.opacity || 0) > 0.04)) continue;
    if (el._px === undefined) {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) out.push({ x0: r.left, y0: r.top - pic, x1: r.right, y1: r.bottom - pic });
      continue;
    }
    const key = `${el.className}|${el.textContent}|${view.w}`;
    if (el._geomKey !== key) {
      const r = el.getBoundingClientRect();
      el._geom = { ox: r.left - el._px, oy: r.top - pic - el._py, w: r.width, h: r.height };
      el._geomKey = key;
    }
    const g = el._geom;
    if (g.w && g.h) out.push({ x0: el._px + g.ox, y0: el._py + g.oy, x1: el._px + g.ox + g.w, y1: el._py + g.oy + g.h });
  }
  return out;
}
function updateCards(s) {
  if (!cards.anyAt(s.u) && !cards.items.some((it) => it.el.style.visibility === 'visible' || it.g.style.visibility === 'visible')) { cards.line = null; return; }
  cards.update(s.u, s, { camera, view, obstacles: cardObstacles, calm: frameCalm });
}

let frameCalm = 1, capOffWas = null;
function updateDom(s) {
  const u = s.u;
  // (and they make way while the drone flies at the lens: it fills the frame on its way past)
  const pass = THREE.MathUtils.smoothstep(TL.approachAt(u), 0.3, 0.55) * (1 - THREE.MathUtils.smoothstep(u, TL.APPROACH[1], TL.APPROACH[1] + 0.35));
  // at a rest stop nothing is ever left half-faded: the stop's caption, cards and labels are full
  // (a smooth weight, 1 at the stop and 0 from 0.12 away: overlays ease to full as a move settles,
  // never pop)
  let rest = STOPS[0], restD = Infinity;
  for (const x of STOPS) { const d = Math.abs(u - x); if (d < restD) { restD = d; rest = x; } }
  const restW = 1 - THREE.MathUtils.smoothstep(restD, 0.03, 0.12);
  frameCalm = Math.max(calmAt(u), restW) * (1 - pass);
  $('#title-card').style.opacity = s.title.toFixed(3);
  $('#title-card').style.visibility = s.title > 0.001 ? 'visible' : 'hidden';
  $('#finale-card').style.opacity = s.finale.toFixed(3);
  intertitleEls.forEach((el, i) => {
    const a = s.intertitles[i];
    el.style.opacity = a.toFixed(3);
    el.style.visibility = a > 0.002 ? 'visible' : 'hidden';
    el.style.transform = `translateY(${((1 - a) * 10).toFixed(1)}px)`;
  });
  // the header's progress line follows the real scroll; review captures do not scroll, so set it here
  if (DEBUG_FRAME !== null) setProgress(u / TL.U);
  updateRail(s.chapter);

  // the scroll cue: with the title, gone as the film starts
  const cue = $('#scroll-cue');
  cue.style.opacity = s.title.toFixed(3);
  cue.style.visibility = s.title > 0.02 ? 'visible' : 'hidden';

  // captions crossfade (reduced motion: hard cuts between stills)
  const cur = TL.beatAt(u);
  let capA = 0;
  for (const b of TL.BEATS) {
    const el = captionEls.get(b.id);
    if (!el) continue;
    let a;
    if (REDUCED) a = b === cur ? 1 : 0;
    // (one caption hands over to the next at the beat boundary with no empty gap, and their texts
    // never overlap)
    else { const d0 = b.u0 + (b.capDelay || 0); a = THREE.MathUtils.smoothstep(u, d0, d0 + 0.14) * (1 - THREE.MathUtils.smoothstep(u, b.u1 - 0.14, b.u1)); }
    if (b !== TL.BEATS[0] && Math.abs(b.still - rest) < 1e-6) a = Math.max(a, restW);   // its own rest: fully up
    capA = Math.max(capA, a);
    el.style.opacity = a.toFixed(3);
    el.style.visibility = a > 0.002 ? 'visible' : 'hidden';
    el.style.transform = view.portrait || document.body.classList.contains('no-letterbox')
      ? `translateY(${((1 - a) * 8).toFixed(1)}px)` : `translateY(calc(-50% + ${((1 - a) * 8).toFixed(1)}px))`;
  }

  // no caption up (the title): the bottom legibility shade goes too, so it never veils the subject
  const capOff = capA < 0.02 && endShown <= 0.01;
  if (capOff !== capOffWas) { capOffWas = capOff; document.body.classList.toggle('cap-off', capOff); }

  // loader: something the current chapter needs is still being built
  const want = ['drone', 'gnss', 'ts'].includes(s.chapter) ? s.chapter : null;
  const loading = want && (models.isLoading(want) || !models.active(want));
  $('#loader').classList.toggle('is-on', !!loading && document.body.classList.contains('is-ready'));

  // laser readout next to the prism
  const ro = s.readout * (models.active('ts') ? 1 : 0);
  readoutEl.style.opacity = ro.toFixed(3);
  if (ro > 0.001) {
    const p = project(fx.laser.end);
    $('#readout-v').textContent = `${fx.laser.distance.toFixed(3)} m`;
    readoutEl.style.transform = `translate3d(${(p.x + 26).toFixed(1)}px, ${(p.y - 38).toFixed(1)}px, 0)`;
  }

  updateFieldDom(s);
  updateCards(s);
  finaleLegend = view.portrait && s.finale > 0.01
    ? tagEls.filter((el) => models.active(el.dataset.station)).map((el) => ({ id: el.dataset.station, n: el.querySelector('.tag__n').textContent, text: FINALE_SHORT[el.dataset.station], a: s.finale }))
    : null;
  if (!finaleLegend) finaleHi = null;
  updateCaptionCard(capA);
  updateEndcards(u);

  // finale: a tag under each instrument
  for (const el of tagEls) {
    const k = el.dataset.station;
    const a = s.finale * (models.active(k) ? 1 : 0);
    el.style.opacity = a.toFixed(3);
    if (a > 0.001) {
      const p = project(tmpV.copy(stage.stations[k].group.position).add(new THREE.Vector3(0, 0, 0.62)));
      // (tall screens: a numbered dot on the floor in front of the instrument; its name is a chip)
      el.style.transform = view.portrait ? `translate3d(calc(${p.x.toFixed(1)}px - 50%), calc(${p.y.toFixed(1)}px - 50%), 0)`
        : `translate3d(calc(${p.x.toFixed(1)}px - 50%), ${(p.y + 6).toFixed(1)}px, 0)`;
    }
    el.classList.toggle('is-on', view.portrait && finaleHi === k);
    el.style.pointerEvents = view.portrait && a > 0.3 ? 'auto' : 'none';
  }
}

/** The drone over the planet: drawn into the same HDR target, depth cleared, with the field's light set. */
function renderDroneOverlay(r) {
  const saved = [];
  const set = (o, v) => { saved.push([o, o.visible]); o.visible = v; };
  set(globe.group, false); set(field.group, true);
  for (const st of Object.values(stage.stations)) { set(st.group, true); set(st.rim, false); set(st.kick, false); set(st.keyLight, true); }
  set(stage.hemi, false); set(fx.laser.light, false); set(fieldLaser.light, true);
  const bg = scene.background, fog = scene.fog;
  scene.background = null; scene.fog = stage._fog || fog;
  const ac = r.autoClear; r.autoClear = false;
  r.clearDepth();
  r.render(scene, ovCam);
  r.autoClear = ac;
  scene.background = bg; scene.fog = fog;
  for (let i = saved.length - 1; i >= 0; i--) saved[i][0].visible = saved[i][1];
}

function render(clock) {
  stage.updateShadows();
  post.render(scene, camera, daylight.post({
    fade: lastState ? lastState.fade : 1,
    time: REDUCED ? 0.37 : clock,
    grain: MOBILE ? 0.03 : 0.036,
    vignette: 0.6,
    bloom: 0.36,
    smear: lastState && !REDUCED ? lastState.smear : 0,
    after: lastState?.droneOverlay && models.active('drone') ? renderDroneOverlay : null,
  }));
}

/* ------------------------------------------------------------------------------ scroll + loop */
let uTarget = 0, uShown = 0;
function readScroll() {
  const raw = THREE.MathUtils.clamp(scrollY / vhPx, 0, TL.U);
  uTarget = REDUCED ? TL.beatAt(raw).still : raw;
}
addEventListener('scroll', () => { readScroll(); needsRender = true; }, { passive: true });

/* ---------------------------------------------------------------------- checkpoints (stepper) */
// Underhill's hero navigation: every beat's resting frame is a stop. One wheel tick, swipe, arrow
// key or click plays the move to the next stop as one timed shot (3 to 5 s) and rests there;
// backward goes to the previous stop. A gesture during a move is queued (the move speeds up and
// still plays in full, then the queued one plays), never stacked into a jump. The rail jumps
// briskly. The page's own scroll position carries u (the scrollbar and everything that reads scroll
// keep working), and past the last stop the page scrolls natively, so the film never traps the
// reader. Reduced motion cuts between stops; ?frame= (review) turns the stepper off.
const STOPS = TL.BEATS.map((b, i) => (i === 0 ? 0 : b.still));
const LAST_STOP = STOPS.length - 1;
let step = null, queued = null;
const uNow = () => scrollY / vhPx;
function stopIndexAtOrAfter(u) { const i = STOPS.findIndex((s) => s >= u - 1e-3); return i < 0 ? LAST_STOP : i; }
/** where a gesture counts from: the stop being travelled to, or the stops either side of here */
function nextStop(dir) {
  if (step) return step.k + dir;
  const u = uNow();
  if (dir > 0) { const i = STOPS.findIndex((s) => s > u + 0.02); return i < 0 ? LAST_STOP + 1 : i; }
  for (let i = LAST_STOP; i >= 0; i--) if (STOPS[i] < u - 0.02) return i;
  return -1;
}
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function stepTo(k, { jump = false, speed = 1 } = {}) {
  k = Math.max(0, Math.min(LAST_STOP, k));
  // (a gesture mid-move queues the next stop and hurries this move along; the speed eases up, so the
  // camera's velocity never jumps)
  if (step && !jump) { if (k !== step.k) { queued = k; step.speedTo = Math.max(step.speedTo, 1.7); } return; }
  const a = uNow(), b = STOPS[k];
  queued = null;
  if (Math.abs(b - a) < 1e-3) { step = null; return; }
  if (REDUCED) { step = null; window.scrollTo({ top: b * vhPx, behavior: 'instant' }); return; }
  const n = Math.abs(stopIndexAtOrAfter(b) - stopIndexAtOrAfter(a));
  const dur = jump ? Math.min(2.2, 0.9 + 0.25 * n) : Math.min(5, Math.max(3, 2.2 + 0.9 * Math.abs(b - a)));
  step = { k, a, b, t: 0, dur, speed, speedTo: speed };
  needsRender = true;
}
function stepBy(dir) { const k = nextStop(dir); if (k >= 0 && k <= LAST_STOP) stepTo(k); }
/** advance the running move (from the frame loop) */
function stepFrame(dt) {
  if (!step) return;
  step.speed += (step.speedTo - step.speed) * (1 - Math.exp(-dt / 0.35));
  step.t = Math.min(1, step.t + (dt / step.dur) * step.speed);
  const u = step.a + (step.b - step.a) * easeInOut(step.t);
  window.scrollTo({ top: u * vhPx, behavior: 'instant' });
  uTarget = u;
  if (step.t >= 1) {
    const q = queued; step = null; queued = null;
    if (q !== null) stepTo(q, { speed: 1.3 });
  }
}
const stepperOn = () => DEBUG_FRAME === null && !window.__intro?.playing && !document.querySelector('.site-head.menu-open');
/** does a gesture in this direction belong to the film? (past the last stop it is the page's) */
function engaged(dir) {
  if (!stepperOn()) return false;
  if (step) return true;
  const u = uNow();
  if (u > STOPS[LAST_STOP] + 0.02) return false;            // below the film: the page scrolls on
  if (dir > 0 && u >= STOPS[LAST_STOP] - 0.02) return false; // at the last stop: hand over to the page
  if (dir < 0 && u <= STOPS[0] + 0.001) return false;
  return true;
}
// wheel / trackpad: one gesture, one step; the inertia tail of a gesture is ignored
let wheelAcc = 0, lastWheel = 0, wheelBlocked = false;
addEventListener('wheel', (e) => {
  if (e.ctrlKey) return;
  const dir = Math.sign(e.deltaY);
  if (!dir || !engaged(dir)) return;
  e.preventDefault();
  const now = performance.now(), gap = now - lastWheel;
  lastWheel = now;
  if (wheelBlocked && gap < 180) return;
  wheelBlocked = false;
  if (gap > 220) wheelAcc = 0;
  wheelAcc += e.deltaY;
  if (Math.abs(wheelAcc) > 36) { wheelAcc = 0; wheelBlocked = true; stepBy(dir); }
}, { passive: false });
// touch: a swipe up (or left) is the next stop, down (or right) the previous; one step per swipe
let tx0 = 0, ty0 = 0, tFired = false, tKind = 'none';
addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1) { tKind = 'native'; return; }
  tx0 = e.touches[0].clientX; ty0 = e.touches[0].clientY; tFired = false; tKind = 'none';
}, { passive: true });
addEventListener('touchmove', (e) => {
  if (e.touches.length !== 1 || tKind === 'native') return;
  const dx = e.touches[0].clientX - tx0, dy = e.touches[0].clientY - ty0;
  const d = Math.abs(dx) > Math.abs(dy) ? dx : dy, dir = d < 0 ? 1 : -1;
  if (tKind === 'none') {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    tKind = !e.target.closest?.('.mnav') && engaged(dir) ? 'step' : 'native';
    if (tKind === 'native') return;
  }
  if (e.cancelable) e.preventDefault();
  if (!tFired && Math.abs(d) > 40) { tFired = true; stepBy(dir); }
}, { passive: false });
addEventListener('touchend', () => { tKind = 'none'; }, { passive: true });
addEventListener('touchcancel', () => { tKind = 'none'; }, { passive: true });
// keys: arrows, Page Up / Down, Space (Shift+Space back); Home / End jump. Esc stays with the menu and the intro.
addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  if (e.key === 'Home' || e.key === 'End') {
    if (!stepperOn() || uNow() > STOPS[LAST_STOP] + 0.02) return;
    e.preventDefault(); stepTo(e.key === 'Home' ? 0 : LAST_STOP, { jump: true }); return;
  }
  const next = ['ArrowDown', 'ArrowRight', 'PageDown'].includes(e.key) || (e.key === ' ' && !e.shiftKey);
  const prev = ['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key) || (e.key === ' ' && e.shiftKey);
  if (!next && !prev) return;
  if (e.key === ' ' && t && t.tagName === 'BUTTON') return;   // a focused button keeps Space
  const dir = next ? 1 : -1;
  if (!engaged(dir)) return;
  e.preventDefault();
  stepBy(dir);
});
addEventListener('intro:leave', () => { readScroll(); needsRender = true; });
let resizeT = 0;
addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { layout(); readScroll(); }, 80); });

function ensureModels(u) {
  for (const obj of TL.neededAt(u)) {
    const sel = models.selected[obj];
    const active = models.active(obj);
    if (!active || active.build !== sel) models.ensure(obj).then(() => { needsRender = true; });
  }
}

let clock = 0, last = performance.now(), raf = 0;
const frameTimes = [];
let governor = null;   // started in boot() (not for ?frame= captures)
function tick(now) {
  raf = requestAnimationFrame(tick);
  const intervalMs = now - last;
  const dt = Math.min(0.05, Math.max(0, intervalMs / 1000));
  last = now;
  if (!REDUCED) clock += dt;
  const k = REDUCED ? 1 : 1 - Math.exp(-dt / 0.085);       // scroll scrub smoothing
  if (daylight.step(REDUCED ? 1 : dt)) needsRender = true;
  stepFrame(dt);
  const before = uShown;
  uShown += (uTarget - uShown) * k;
  if (Math.abs(uTarget - uShown) < 1e-4) uShown = uTarget;
  const moving = uShown !== before || needsRender || rotor.speed > 0.001 || lastState?.gnss.rings > 0;
  ensureModels(uShown);
  if (window.__intro?.playing) {
    // Underhill's intro covers the page: keep the opening shot ready underneath, but do not spend
    // the GPU on a picture nobody sees (it redraws only when a model arrives)
    if (needsRender) { apply(uShown, dt, clock); render(clock); needsRender = false; }
    return;
  }
  if (!REDUCED || moving) {
    const t0 = performance.now();
    apply(uShown, dt, clock);
    render(clock);
    frameTimes.push(performance.now() - t0);
    if (frameTimes.length > 120) frameTimes.shift();
    governor?.frame(intervalMs);   // the real frame time (CPU + GPU back-pressure), not just the JS cost
    needsRender = false;
  }
}

/* ------------------------------------------------------------------------------ daylight switch */
// The header's sun / moon switch. The 3D eases over 0.8 s; the page's own colours cross-fade with
// it through a view transition where there is one (instant under reduced motion).
const dayBtn = $('#daylight');
function setDaylight(on, { instant = false } = {}) {
  const swap = () => {
    applyTheme(on);   // body.is-day, color-scheme, aria-pressed on the pill (theme.js)
    labels.invalidate?.(); cards?.invalidate?.();
  };
  daylight.set(on, instant || REDUCED);
  if (!instant && !REDUCED && document.startViewTransition && !document.hidden) document.startViewTransition(swap);
  else swap();
  needsRender = true;
}
// (?day=1 / ?day=0 overrides the remembered choice, for review)
const qDay = new URLSearchParams(location.search).get('day');
setDaylight(qDay !== null ? qDay === '1' : savedDaylight(), { instant: true });
dayBtn?.addEventListener('click', () => { const on = !document.body.classList.contains('is-day'); saveDaylight(on); setDaylight(on); });

/* ------------------------------------------------------------------------------------- boot */
async function boot() {
  layout();
  readScroll();
  uShown = uTarget;
  // settle one empty frame immediately (renders even in a hidden tab)
  apply(uShown, 0, 0, { instant: true });
  render(0);

  const first = DEBUG_FRAME !== null ? DEBUG_FRAME * TL.U : uShown;
  // real steps: each instrument the opening needs, then the shaders, then the first frame
  const BOOT_MSG = { drone: 'Building the survey drone…', gnss: 'Calibrating the GNSS base…', ts: 'Levelling the total station…' };
  // every instrument, not only the opening's: a model built mid-film is a 0.5–1 s freeze (the GNSS
  // base used to be built at u 7.5, right on the lift-off). The review frames keep the old behaviour.
  // (?preroll=0: the old lazy behaviour, kept for A/B measurements)
  const PREROLL = DEBUG_FRAME === null && q.get('preroll') !== '0';
  const need = PREROLL ? ['drone', 'gnss', 'ts'] : [...TL.neededAt(first)];
  bootProgress(26, BOOT_MSG[need[0]] || 'Building the instruments…');
  let built = 0;
  await Promise.all(need.map((o) => models.ensure(o).then(() => {
    built++;
    const next = need.find((n) => !models.active(n));
    bootProgress(26 + 52 * (built / need.length), next ? BOOT_MSG[next] : 'Warming up the lasers…');
  })));
  bootProgress(80, 'Warming up the lasers…');
  if (PREROLL) await preroll();
  if (DEBUG_FRAME !== null) {
    await seek(DEBUG_FRAME);
  } else {
    apply(uShown, 0, 0, { instant: true });
    render(0);
  }
  bootProgress(100, 'Ready');
  document.body.classList.remove('is-booting');
  document.body.classList.add('is-ready');
  if (DEBUG_FRAME === null) {
    raf = requestAnimationFrame(tick);
    // (a step re-allocates the post targets: only ever taken while the film rests between moves, and
    // once it has stepped down it stays down for the session: no pixel-ratio oscillation mid-move)
    governor = startGovernor({ renderer, getDpr: () => renderer.getPixelRatio(), setDpr, onStep: governorStep, q: Q,
      canApply: () => !step && Math.abs(uTarget - uShown) < 1e-3, upAfterDown: false, maxSteps: 1 });
    // high tier: build the other instruments while the reader is still on the opening
    if (Q.preload) {
      const idle = window.requestIdleCallback || ((f) => setTimeout(f, 600));
      idle(() => models.ensure('gnss').then(() => idle(() => models.ensure('ts'))), { timeout: 2500 });
    }
  }
}

/**
 * Pre-roll, under the boot screen: draw one frame of every chapter (studio, finale, field, planet, the
 * drone's overlay over the planet), each with its own light set, so every texture and geometry is on
 * the GPU, every program (and its shadow / depth variants) is compiled and every material has seen
 * every light set before the reader gets there. Then the opening is drawn again. Each frame yields to
 * the browser, so the progress bar keeps moving.
 */
async function preroll() {
  const US = [2.45, 5.2, 7.6, 8.7, 9.75, 11.85, 14.65, 16.95, 19.15, 22, 24.75, 26.5, 28.4, 29.7, 31.75, 34.3, 37.45, 40.15, 41.3, 43.5, 45.36, 48.85, 50.4, 51.2, 52.0, 53.1, 55.25, 57.3];
  // (yield to the browser between frames; a MessageChannel, not a timer: timers are clamped to 1 s in a
  // background tab, which would stretch the pre-roll to half a minute)
  const tick = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
  // the daylight floor is swapped in later: upload it now too
  if (daylight.dayFloor) renderer.initTexture(daylight.dayFloor);
  const msgs = [[0, 'Warming up the lasers…'], [0.4, 'Laying out the valley…'], [0.8, 'Lining up the satellites…']];
  for (let i = 0; i < US.length; i++) {
    const k = i / US.length;
    bootProgress(80 + 18 * k, msgs.filter((m) => k >= m[0]).pop()[1]);
    rotor.speed = TL.sceneAt(US[i]).drone.spin;
    apply(US[i], 1 / 60, 1.3, { instant: true });
    render(1.3);
    await tick();
  }
  rotor.speed = 0;
  // every fitted camera key's outline (each is its model posed at the key, measured once), per layout
  const st = view.stage, asp = (st.x1 - st.x0) / Math.max(1, st.y1 - st.y0), cam = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 30 };
  for (const [a, b] of [[0, 25.6], [25.6, TL.FCUT], [TL.FCUT, TL.GCUT]]) {
    apply(a + 0.01, 1 / 60, 1.3, { instant: true });
    for (let u = a; u < b; u += 0.05) TL.cameraAt(u, asp, cam, { tall: view.portrait, subject: fitSubject });
  }
}

/* ------------------------------------------------------------------- live quality governor */
// quality.js measures the frame interval; it trims the pixel ratio first, then the post effects
function setDpr(v) {
  dprLimit = v;
  renderer.setPixelRatio(v);                       // resizes the drawing buffer at the same CSS size
  const s = renderer.getSize(new THREE.Vector2());
  post.setSize(s.x, s.y);
  needsRender = true;
}
function governorStep(what) {
  needsRender = true;
  if (what === 'streak-off') return post.setStreak(false);
  if (what === 'bloom-down') return post.bloomDown();
  return false;
}

/* --------------------------------------------------------------------------- review hooks */
async function seek(p, opts = {}) {
  const u = THREE.MathUtils.clamp(p, 0, 1) * TL.U;
  await Promise.all([...TL.neededAt(u)].map((o) => models.ensure(o)));
  uTarget = uShown = u;
  const clk = opts.clock ?? 1.3;
  rotor.speed = TL.sceneAt(u).drone.spin;
  apply(u, 1 / 60, clk, { instant: true });
  // a second pass so throttled things (occlusion, shadows) settle against this exact state
  apply(u, 0, clk, { instant: true });
  render(clk);
  document.documentElement.dataset.frameReady = String(p);
  return { u, beat: TL.beatAt(u).id, builds: { ...models.selected } };
}

window.__scene = {
  seek,
  seekU: (u, o) => seek(u / TL.U, o),
  u: () => uShown,
  U: TL.U,
  stats: () => ({
    calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
    programs: renderer.info.programs?.length, pixelRatio: renderer.getPixelRatio(), tier: Q.tier,
    size: renderer.getSize(new THREE.Vector2()).toArray(),
    cpuFrameMs: frameTimes.length ? +(frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length).toFixed(2) : null,
    models: [...models.cache.values()].map((e) => ({ key: e.key, buildMs: e.buildMs, units: e.staged.units.length, lift: +e.staged.lift.toFixed(3) })),
    jsHeapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
  }),
  /** Average full frame cost (state + shadows + post), forced to finish on the GPU each frame. */
  async bench(p = 0.2, n = 60) {
    await seek(p);
    const gl = renderer.getContext(); const px = new Uint8Array(4);
    const u = p * TL.U; const times = [];
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      stage.markDirty('drone'); stage.markDirty('gnss'); stage.markDirty('ts');
      apply(u, 1 / 60, 1.3 + i / 60, { instant: true });
      render(1.3 + i / 60);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    // one more frame with the counters accumulating across every pass (shadows, contact, post)
    renderer.info.autoReset = false; renderer.info.reset();
    apply(u, 1 / 60, 1.3, { instant: true }); render(1.3);
    const calls = renderer.info.render.calls, tris = renderer.info.render.triangles;
    renderer.info.autoReset = true;
    return { p, median: +times[n >> 1].toFixed(2), p90: +times[Math.floor(n * 0.9)].toFixed(2), calls, tris };
  },
  /** Main scene pass only (the HDR render, no shadows, no post), synced on the GPU each time. */
  async benchMain(p = 0.7, n = 40) {
    await seek(p);
    const gl = renderer.getContext(); const px = new Uint8Array(4); const times = [];
    for (let i = 0; i < n; i++) {
      renderer.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const t0 = performance.now();
      renderer.setRenderTarget(post.sceneRT); renderer.clear(); renderer.render(scene, camera);
      if (lastState?.droneOverlay) renderDroneOverlay(renderer);
      renderer.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    render(1.3);
    return { u: +(p * TL.U).toFixed(2), median: +times[n >> 1].toFixed(2), p90: +times[Math.floor(n * 0.9)].toFixed(2), calls: renderer.info.render.calls };
  },
  /** Sample the staged explode of the active build and report pass-through / floor problems. */
  async checkExplode(object, opts) {
    const { checkExplode } = await import('./debug.js');
    const entry = models.active(object) || await models.ensure(object);
    return checkExplode(entry, opts);
  },
  models, stage, camera, renderer, labels, fx, TL, THREE, post, field, ovCam, droneFlight, cards, globe, daylight, setDaylight,
  quality: Q, governor: () => governor?.state() ?? null, setDpr, governorStep,
  view, outlineOf, stageAt, FIELD, calmAt, state: () => lastState,
  applyAt: (u) => apply(u, 1 / 60, 1.3, { instant: true }),
  renderNow: (c = 1.3) => render(c),
  // (review: restart the frame loop, e.g. after replacing requestAnimationFrame in a hidden tab)
  kick: () => { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(tick); },
  stepper: () => ({ stops: STOPS, step: step && { k: step.k, t: +step.t.toFixed(3), dur: step.dur, speed: step.speed }, queued }),
};

boot().catch((e) => {
  console.error(e);
  $('#fallback-msg').textContent = `The scene failed to start: ${e.message}`;
  document.body.classList.add('no-webgl');
});
