// Underhill v2 — Fly mode (fly.html): fly the survey drone yourself over the film's valley site.
//
// One renderer, one scene: the field (field.js) + the site props (world.js) + the sculptor drone
// (drone.js on adapters/droneB.js). The flight model (flight.js) steps at a fixed 120 Hz; the page
// renders through the film's pipeline (post.js) in three views: Chase (a spring camera with drag to
// look), Gimbal (the payload camera, zoom, thermal, laser rangefinder, a picture-in-picture of the
// chase view on desktop) and Map (orthographic, tap to fly, mission planning). Photos, LiDAR and the
// mapping mission run in any view.
//
// URL: ?q=lite|balanced|high|auto  ?day=0|1  ?reduced=1  ?touch=1 (force the sticks)  ?view=chase|gimbal|map
//      ?payload=L2|P1|H20T  ?coach=0|1  ?mission=grid&cx=&cz=&w=&h=&alt=60&ov=80&rot=  ?debug=1 (window.__fly)
import * as THREE from 'three';
import { detectQuality, startGovernor, setQualityOverride, qualityBadge } from '../quality.js';
import { mountHeader } from '../header.js';
import { wireDaylightToggle, applyTheme } from '../theme.js';
import { Post } from '../post.js';
import { LaserShot } from '../effects.js';
import { FIELD } from '../field.js';
import { World, HOME, GEOFENCE, ALT_CAP, VLOS } from './world.js';
import { HALF as MAP_HALF } from './map2d.js';
import { FlyDrone, PAYLOADS, PAYLOAD_ORDER } from './drone.js';
import { SceneQuery, ground } from './query.js';
import { FlightSim } from './flight.js';
import { Lidar, LIDAR_MODES } from './lidar.js';
import { Passes } from './passes.js';
import { PhotoSystem } from './photo.js';
import { MapLayers } from './map2d.js';
import { planMission, rectFromCorners, MissionView, ALTS, OVERLAPS } from './mission.js';
import { Input, Gestures } from './input.js';
import { Sfx } from './audio.js';
import { Hud, mmss, cardinal } from './hud.js';
import { sceneToUtm, sceneToLatLon, grp, fmtLat, fmtLon, headingOf, ELEV0 } from './geo.js';
import { GOOGLE_MAPS_KEY, REAL_SITES } from './config.js';

const qs = new URLSearchParams(location.search);
const DEBUG = qs.get('debug') === '1';
if (DEBUG) {
  // the review harness reads these (a hidden iframe's console is not always visible to the tools)
  const errs = (window.__flyErrors = []);
  const keep = (kind, args) => errs.push(`${kind}: ${[...args].map((a) => (a && a.stack) || String(a)).join(' ').slice(0, 400)}`);
  for (const k of ['error', 'warn']) { const f = console[k].bind(console); console[k] = (...a) => { keep(k, a); f(...a); }; }
  addEventListener('error', (e) => keep('onerror', [e.message, e.filename, e.lineno]));
  addEventListener('unhandledrejection', (e) => keep('rejection', [e.reason]));
}
const REDUCED = qs.has('reduced') ? qs.get('reduced') !== '0' : matchMedia('(prefers-reduced-motion: reduce)').matches;
const TOUCH = qs.has('touch') ? qs.get('touch') !== '0' : matchMedia('(pointer: coarse)').matches;
const Q = detectQuality();
document.documentElement.dataset.quality = Q.tier;
const STEP = 1 / 120;
const DEG = Math.PI / 180;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapPi = (a) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
if (REDUCED) document.body.classList.add('is-reduced');
// iOS Safari pinch-zooms the page despite touch-action: none unless its gesture events are cancelled
for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
document.body.classList.toggle('has-sticks', TOUCH);
// Phones (portrait, under 600 px) get a calm flight display (2026-10-14): a quiet bar (exit, the flight
// state, settings) instead of the site header, one telemetry strip, the hold button as the one solid
// control before take-off, the sticks and one round button group once flying, everything else under ⋯.
// The sticks are on there whatever the pointer says (a phone is flown with its thumbs). body.is-phone
// scopes every rule (fly.css "phones: a calm flight display"); every other layout is untouched.
const PHONE_MQ = matchMedia('(max-width: 599.98px) and (orientation: portrait)');
const isPhone = () => document.body.classList.contains('is-phone');

/* ------------------------------------------------------------------------------ header */
const header = mountHeader($('uh-header'), { home: '/', join: false, progress: false, foot: 'Fly mode · Underhill Geomatics' });
{
  const box = header.head?.querySelector('.container');
  const title = document.createElement('span'); title.className = 'fly-title'; title.innerHTML = 'Fly <b>the drone</b>';
  box?.querySelector('.logo')?.after(title);
  const exit = document.createElement('a'); exit.className = 'fly-exit'; exit.href = '/'; exit.innerHTML = '<span>Exit</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  exit.setAttribute('aria-label', 'Exit fly mode');
  // settings live in the header (keeps the flight display small on phones)
  const more = document.createElement('button'); more.type = 'button'; more.className = 'fly-more'; more.id = 'btn-more';
  more.setAttribute('aria-label', 'Settings'); more.setAttribute('aria-expanded', 'false'); more.setAttribute('aria-controls', 'more-sheet');
  more.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/></svg>';
  box?.appendChild(more);
  box?.appendChild(exit);
}

/* ---------------------------------------------------------------------------- renderer */
const canvas = $('fly-canvas');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: DEBUG });
  if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 unavailable');
} catch (e) {
  $('fallback').hidden = false;
  $('fallback').textContent = 'Fly mode draws the site live with WebGL 2, which this browser or device cannot provide.';
  $('boot').hidden = true;
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, Q.dprCap));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = Q.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;     // drawn once per frame, before the main pass (not for the PIP / photos)
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); $('fallback').hidden = false; $('fallback').textContent = 'The graphics context was lost. Reload the page to fly again.'; });

const scene = new THREE.Scene();
const post = new Post(renderer, { mobile: TOUCH, q: Q });
const passes = new Passes(renderer);
const world = new World(renderer, scene, Q);
const query = new SceneQuery(world);
// near / far: the land runs out to 6 km and the ridgelines to 9 km
const chaseCam = new THREE.PerspectiveCamera(55, 1, 0.15, 10000);
const gimbalCam = new THREE.PerspectiveCamera(50, 1, 0.08, 10000);
gimbalCam.rotation.order = 'YXZ';
const mapCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2400);
mapCam.rotation.set(-Math.PI / 2, 0, 0);
const pipRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true });
pipRT.texture.generateMipmaps = false;

const hud = new Hud({ onTag: (id) => (id === 'home' ? sim?.rth('user') : flyToViewpoint(id)), onRollOpen: null });
// phones: no keyboard hints in the messages ("(or T)", "(P)")
{ const toast = hud.toast.bind(hud); hud.toast = (text, o) => toast(isPhone() ? text.replace(/ \((?:or )?[A-Z?]\)/g, '') : text, o); }
const sfx = new Sfx();
const lidar = new Lidar(scene, query, Q);
const photos = new PhotoSystem({ renderer, scene, passes });
const missionView = new MissionView(scene);
const map = new MapLayers(world);
lidar.setRange(map.elev[0] - 1, map.elev[1] + 3);   // the site's relief, plus tree tops
const rangeLaser = new LaserShot(scene);
rangeLaser.light.visible = false;
rangeLaser.target.visible = false;
// the beam starts a little ahead of the lens (from the gimbal camera itself, a beam 3 cm from the eye fills the view)
const rangeOrigin = new THREE.Object3D();
scene.add(rangeOrigin);

/* ------------------------------------------------------------------------- page state */
const S = {
  view: ['chase', 'gimbal', 'map'].includes(qs.get('view')) ? qs.get('view') : 'chase',
  lastFlightView: 'chase',
  thermal: 0,                   // 0 off, 1 white-hot, 2 ironbow
  day: 0, dayTarget: 0,
  chase: { yawOff: 0, elOff: 0, dist: 3.5, idle: 99, yawS: Math.PI, elS: 0.3, tgt: new THREE.Vector3(), init: false },
  mapV: { cx: 0, cz: -20, half: 120, follow: true },
  plan: null,               // mission plan in the map sheet
  planning: false, planTaps: [], planDrag: null,
  planAlt: Number(qs.get('alt')) && ALTS.includes(Number(qs.get('alt'))) ? Number(qs.get('alt')) : 60,
  planOv: qs.get('ov') === '70' ? 0.7 : 0.8,
  missionActive: false, missionShots: 0, missionTotal: 0,
  range: null,              // rangefinder shot { hit, t }
  target: null,             // go-to marker
  clock: 0, acc: 0,
  hudAt: 0, mapAt: 0, warnAt: 0, lastWarnKey: '',
  hold: { active: false, t: 0 },
  toastAt: {},
  frames: 0,
};
let drone = null;
let sim = null;
let input = null;
let governor = null;
let real = null;               // real-world mode (lazy)
let programsAfterWarm = 0;

/* ----------------------------------------------------------------------------- layout */
const view = { w: innerWidth, h: innerHeight };
function layout() {
  view.w = Math.max(1, innerWidth); view.h = Math.max(1, innerHeight);
  renderer.setSize(view.w, view.h, false);
  post.setSize(view.w, view.h);
  const portrait = view.h > view.w;
  document.body.classList.toggle('is-portrait', portrait);
  chaseCam.aspect = view.w / view.h;
  chaseCam.fov = portrait ? 64 : 52;
  chaseCam.updateProjectionMatrix();
  // the picture-in-picture of the chase view (desktop only)
  const pw = Math.round(clamp(view.w * 0.2, 220, 320)), ph = Math.round(pw * 9 / 16);
  S.pip = view.w >= 900 && !TOUCH ? { w: pw, h: ph } : null;
  if (S.pip) { const d = renderer.getPixelRatio(); pipRT.setSize(Math.round(pw * d), Math.round(ph * d)); }
  document.body.classList.toggle('is-compact', matchMedia('(max-width: 699px), (orientation: landscape) and (max-height: 520px)').matches);
  document.body.classList.toggle('is-phone', PHONE_MQ.matches);
  document.body.classList.toggle('has-sticks', TOUCH || PHONE_MQ.matches);
  sizeMinimap();
  const d = Math.min(2, devicePixelRatio || 1);
  const ov = $('map-overlay');
  ov.width = Math.round(view.w * d); ov.height = Math.round(view.h * d);
  S.mapAt = 0;
  S.mapOff = mapOffPx();
  const ht = document.querySelector(isPhone() ? '.ptele' : '.hud-top');
  S.hudTopBottom = ht ? ht.getBoundingClientRect().bottom : 0;
}
addEventListener('resize', () => layout());
function sizeMinimap() {
  const mm = $('minimap');
  const ms = Math.round(mm.getBoundingClientRect().width) || 120;
  const d = Math.min(2, devicePixelRatio || 1);
  mm.width = ms * d; mm.height = ms * d;
  S.mapAt = 0;
}

/* ------------------------------------------------------------------------- cameras */
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpSize = new THREE.Vector2();

function payloadFov() {
  const hf = PAYLOADS[drone?.payload || 'L2'].hfov * DEG;
  return { hf, zoom: sim ? sim.zoom : 1 };
}

function updateGimbalCam() {
  if (!drone) return;
  const sock = drone.socket;
  sock.updateWorldMatrix(true, false);
  sock.getWorldPosition(gimbalCam.position);
  // stabilised: the gimbal's world yaw and pitch, no roll
  const yaw = sim.yaw + sim.gimbal.yaw * DEG;
  gimbalCam.rotation.set(sim.gimbal.pitch * DEG, yaw + Math.PI, 0, 'YXZ');
  const { hf, zoom } = payloadFov();
  const a = view.w / view.h;
  const t = Math.tan(hf / 2) / zoom;
  gimbalCam.fov = 2 * Math.atan(a >= 1 ? t / a : t) / DEG;
  gimbalCam.aspect = a;
  gimbalCam.updateProjectionMatrix();
  gimbalCam.updateMatrixWorld();
}

function updateChaseCam(dt) {
  const c = S.chase, p = sim.pos;
  c.idle += dt;
  // drag-to-look returns to behind the drone after 3 s idle
  if (c.idle > 3) {
    const k = 1 - Math.exp(-dt / (REDUCED ? 1.2 : 0.7));
    c.yawOff += (0 - c.yawOff) * k; c.elOff += (0 - c.elOff) * k;
  }
  const behind = sim.yaw + Math.PI + c.yawOff;
  const parked = !sim.airborne;
  const elDes = clamp((parked ? 0.32 : 0.26) + c.elOff, -0.25, 1.4);
  const kA = 1 - Math.exp(-dt * (REDUCED ? 3 : 4.5));
  if (!c.init) { c.yawS = behind; c.elS = elDes; c.tgt.copy(p); c.init = true; }
  c.yawS += wrapPi(behind - c.yawS) * kA;
  c.elS += (elDes - c.elS) * kA;
  // the target lags a little behind a fast drone: a sense of speed
  tmpV.set(p.x, p.y + 0.3, p.z);
  c.tgt.lerp(tmpV, 1 - Math.exp(-dt * (REDUCED ? 14 : 9)));
  const sp = sim.speedH;
  const dist = c.dist * (1 + Math.min(0.45, sp / 40));
  const cp = chaseCam.position;
  cp.set(c.tgt.x + Math.sin(c.yawS) * Math.cos(c.elS) * dist, c.tgt.y + Math.sin(c.elS) * dist, c.tgt.z + Math.cos(c.yawS) * Math.cos(c.elS) * dist);
  const gmin = ground(cp.x, cp.z) + 0.45;
  if (cp.y < gmin) cp.y = gmin;
  // a little buffeting at speed (none under reduced motion)
  if (!REDUCED && sp > 6) {
    const a = 0.006 * (sp - 6);
    cp.x += a * Math.sin(S.clock * 23.1); cp.y += a * Math.sin(S.clock * 17.3 + 1); cp.z += a * Math.sin(S.clock * 19.7 + 2);
  }
  chaseCam.lookAt(c.tgt.x + sim.vel.x * 0.12, c.tgt.y, c.tgt.z + sim.vel.z * 0.12);
  chaseCam.updateMatrixWorld();
}

function updateMapCam(dt) {
  const m = S.mapV, a = view.w / view.h;
  if (m.follow && sim) {
    const k = 1 - Math.exp(-dt * 4);
    m.cx += (sim.pos.x - m.cx) * k; m.cz += (sim.pos.z - m.cz) * k;
  }
  m.cx = clamp(m.cx, -MAP_HALF, MAP_HALF); m.cz = clamp(m.cz, -MAP_HALF, MAP_HALF);
  mapCam.left = -m.half * a; mapCam.right = m.half * a; mapCam.top = m.half; mapCam.bottom = -m.half;
  const mc = mapCentre();
  mapCam.position.set(mc.x, 1500, mc.z);
  mapCam.near = 1; mapCam.far = 2400;
  mapCam.updateProjectionMatrix(); mapCam.updateMatrixWorld();
}
const mapScale = () => view.h / (2 * S.mapV.half);   // CSS px per metre in the Map view
// the side panel covers the right of the map on wide screens: the view's centre moves left of it
// (a right-hand panel on wide screens, a bottom sheet on tall ones): measured when the view opens
function mapOffPx() {
  const el = $('map-sheet');
  if (S.view !== 'map' || !el || el.offsetParent === null) return { x: 0, y: 0 };
  const r = el.getBoundingClientRect();
  if (r.left > view.w * 0.4) return { x: Math.min(260, (view.w - r.left) / 2), y: 0 };
  return { x: 0, y: Math.min(view.h * 0.3, (view.h - r.top) / 2) };
}
const mapCentre = () => { const o = S.mapOff || { x: 0, y: 0 }; return { x: S.mapV.cx + o.x / mapScale(), z: S.mapV.cz + o.y / mapScale() }; };
const mapToWorld = (x, y) => { const c = mapCentre(); return { x: c.x + (x - view.w / 2) / mapScale(), z: c.z + (y - view.h / 2) / mapScale() }; };

function activeCam() { return S.view === 'gimbal' ? gimbalCam : S.view === 'map' ? mapCam : chaseCam; }

/* ------------------------------------------------------------------------------ views */
function setView(v) {
  if (v === S.view) return;
  if (v === 'map' && real) { hud.toast('Map view uses the built-in site only'); return; }
  S.view = v;
  if (v !== 'map') S.lastFlightView = v;
  document.body.classList.remove('view-chase', 'view-gimbal', 'view-map');
  document.body.classList.add(`view-${v}`);
  $('btn-map').setAttribute('aria-pressed', String(v === 'map'));
  $('view-name').textContent = v === 'gimbal' ? 'Chase' : 'Gimbal';
  if (v === 'map') { S.mapV.follow = true; $('map-follow').setAttribute('aria-pressed', 'true'); S.mapAt = 0; $('map-sheet').classList.toggle('is-folded', S.missionActive); S.mapOff = mapOffPx(); }
  if (v !== 'map' && S.planning) endPlanning(false);
  syncSubbar();
}

/* ------------------------------------------------------------------------------ payloads */
function setPayload(id, { quiet = false } = {}) {
  if (!drone || !PAYLOADS[id]) return;
  drone.setPayload(id);
  $('payload-name').textContent = PAYLOADS[id].short;
  $('payload-name-c').textContent = PAYLOADS[id].short;
  if (id !== 'L2' && lidar.on) setLidar(false, { quiet: true });
  if (id !== 'H20T') { S.thermal = 0; }
  sim.zoom = Math.min(sim.zoom, id === 'H20T' ? 7 : 2);
  if (!quiet) hud.toast(`${PAYLOADS[id].name} · ${PAYLOADS[id].note}`);
  syncSubbar();
}
function cyclePayload() {
  const i = PAYLOAD_ORDER.indexOf(drone.payload);
  setPayload(PAYLOAD_ORDER[(i + 1) % PAYLOAD_ORDER.length]);
}

function setLidar(on, { quiet = false } = {}) {
  if (on && real) { hud.toast('LiDAR scans the built-in site only'); return; }
  if (on && drone.payload !== 'L2') setPayload('L2', { quiet: true });
  lidar.on = on;
  $('btn-lidar').setAttribute('aria-pressed', String(on));
  if (!quiet) hud.toast(on ? 'LiDAR on · L2 non-repetitive scan' : 'LiDAR off');
  syncSubbar();
}

function setThermal(m) {
  if (drone.payload !== 'H20T') { setPayload('H20T', { quiet: true }); }
  S.thermal = ((m % 3) + 3) % 3;
  $('thermal-name').textContent = ['Off', 'White hot', 'Ironbow'][S.thermal];
  if (S.thermal && S.view !== 'gimbal') setView('gimbal');
  syncSubbar();
}

function syncSubbar() {
  const g = S.view === 'gimbal';
  $('zoom').hidden = !g;
  $('btn-thermal').hidden = !(g && drone?.payload === 'H20T');
  $('thermal-name').textContent = ['Off', 'White hot', 'Ironbow'][S.thermal];
  $('lidar-stats').hidden = !lidar.on;
  $('range-card').hidden = !(g && S.range);
  document.body.classList.toggle('is-thermal', g && S.thermal > 0);
  document.body.classList.toggle('is-h20t', drone?.payload === 'H20T');
}

/* ------------------------------------------------------------------------------- photos */
let photoSeq = 0;
function photoMeta() {
  const p = sim.pos;
  const u = sceneToUtm(p.x, p.z), ll = sceneToLatLon(p.x, p.z);
  const id = String(++photoSeq).padStart(4, '0');
  const d = new Date();
  return {
    name: `UH_${drone.payload}_${id}`, file: `UH_${drone.payload}_${id}`,
    utm: `11N E ${grp(u.E, 2)} N ${grp(u.N, 2)}`,
    latlon: `${fmtLat(ll.lat)} ${fmtLon(ll.lon)}`,
    agl: `AGL ${sim.agl.toFixed(1)} m · ASL ${(ELEV0 + p.y).toFixed(1)} m`,
    hdg: `HDG ${String(Math.round(sim.heading)).padStart(3, '0')}° · gimbal ${Math.round(sim.gimbal.pitch)}°`,
    time: d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
  };
}

function takePhoto({ auto = false } = {}) {
  if (!drone) return null;
  updateGimbalCam();
  const pose = { position: gimbalCam.position.clone(), quaternion: gimbalCam.quaternion.clone(), hfov: PAYLOADS[drone.payload].hfov, zoom: sim.zoom };
  const th = drone.payload === 'H20T' ? S.thermal : 0;
  const meta = photoMeta();
  const ph = photos.capture(pose, {
    mode: th, exposure: renderer.toneMappingExposure, gain: thermalGain(), meta, payload: drone.payload,
    before: () => thermalScene(th > 0), after: () => thermalScene(false),
  });
  ph.then?.((photo) => {
    map.addFootprint(photo.corners);
    hud.addPhoto(photo, (pp) => photos.download(pp));
  });
  sfx.shutter();
  flash();
  if (!auto) hud.toast(`${meta.name} · ${PAYLOADS[drone.payload].short} · AGL ${sim.agl.toFixed(1)} m`, { ms: 1800 });
  return ph;
}
function flash() {
  const f = $('flash');
  f.classList.remove('is-on'); void f.offsetWidth; f.classList.add('is-on');
}

/* ---------------------------------------------------------------------- thermal helpers */
function thermalGain() { return 0.55 + 2.4 * (1 - S.day); }
function thermalScene(on) {
  world.sky.uniforms.uAmount.value = on ? 0.12 : 1;
  lidar.points.visible = !on && !real;
  world.update(S.clock, { thermal: on });
}

/* ---------------------------------------------------------------------- the rangefinder */
function rangeAt(x, y) {
  if (drone.payload !== 'H20T') { hud.toast('The laser rangefinder is on the H20T: switch payload (P)'); return; }
  updateGimbalCam();
  const ndc = new THREE.Vector2((x / view.w) * 2 - 1, -(y / view.h) * 2 + 1);
  const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, gimbalCam);
  const o = rc.ray.origin, d = rc.ray.direction;
  const hit = query.ray(o.x, o.y, o.z, d.x, d.y, d.z, 1200, { small: true });
  if (!hit) { hud.toast('No return: out of range (1 200 m)'); return; }
  drone.laserSocket.updateWorldMatrix(true, false);
  drone.laserSocket.getWorldPosition(tmpV);
  const slant = tmpV.distanceTo(tmpV2.set(hit.x, hit.y, hit.z));
  S.range = { hit, t: 0, slant, from: tmpV.clone() };
  const u = sceneToUtm(hit.x, hit.z);
  const what = { ground: 'Ground', tree: 'Tree', truck: 'Truck', prism: 'Prism', monument: 'CP-01', gcp: hit.id || 'GCP' }[hit.kind] || 'Target';
  $('range-card').innerHTML = `<span class="readout__k">Laser range · ${what}</span><span class="readout__v">${slant.toFixed(2)} m</span>`
    + `<span class="rc__l">E ${grp(u.E, 2)}  N ${grp(u.N, 2)}</span><span class="rc__l">El ${(ELEV0 + hit.y).toFixed(2)} m · H ${Math.hypot(hit.x - tmpV.x, hit.z - tmpV.z).toFixed(1)} m</span>`;
  sfx.beep('ok');
  syncSubbar();
}

function updateRange(dt) {
  const r = S.range;
  if (!r || !drone) { rangeLaser.group.visible = false; return; }
  r.t += dt;
  const travel = clamp(r.t / 0.35, 0, 1);
  const beam = r.t < 3 ? 1 : clamp(1 - (r.t - 3) / 0.6, 0, 1);
  rangeLaser.placeAt(tmpV.set(r.hit.x, r.hit.y, r.hit.z), r.hit.y, r.from);
  drone.laserSocket.updateWorldMatrix(true, false);
  drone.laserSocket.getWorldPosition(rangeOrigin.position);
  const ahead = S.view === 'gimbal' ? Math.min(2.5, r.slant * 0.25) : 0;
  tmpV2.set(r.hit.x, r.hit.y, r.hit.z).sub(rangeOrigin.position).normalize();
  rangeOrigin.position.addScaledVector(tmpV2, ahead);
  rangeOrigin.updateMatrixWorld();
  rangeLaser.update(rangeOrigin, travel, 0, beam > 0 ? 1 : 0, beam);
  rangeLaser.target.visible = false;
  const s = Math.max(0.05, r.slant * 0.01) * (S.view === 'gimbal' ? 1.4 : 1);
  rangeLaser.head.scale.setScalar(s);
  if (r.hit.kind === 'prism') world.prism.update(null, 0, beam, 1, 0);
  if (r.t > 12) { S.range = null; syncSubbar(); world.prism.update(null, 0, 0, 1, 0); }
}

/* ------------------------------------------------------------------------- go-to & views */
function pickGround(x, y, cam) {
  const ndc = new THREE.Vector2((x / view.w) * 2 - 1, -(y / view.h) * 2 + 1);
  const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, cam);
  const o = rc.ray.origin, d = rc.ray.direction;
  const h = query.ray(o.x, o.y, o.z, d.x, d.y, d.z, 3000);
  return h ? { x: h.x, z: h.z, y: h.y } : null;
}

function goTo(x, z, opts = {}) {
  if (Math.abs(x) > GEOFENCE || Math.abs(z) > GEOFENCE) { hud.toast('Outside the site boundary'); return; }
  if (!sim.airborne) { hud.toast(sim.mode === 'ready' ? 'Take off first (hold the button), then tap to fly there' : 'Finish the pre-flight check, then take off'); return; }
  if (sim.goTo(x, z, opts)) S.target = { x, z };
}

function flyToViewpoint(id) {
  const v = world.viewpoints.find((p) => p.id === id);
  if (!v) return;
  if (!sim.airborne) { hud.toast(`Take off first, then fly to ${v.name}`); return; }
  goTo(v.pos.x, v.pos.z, { y: v.pos.y, look: v.look, name: v.name });
}

/* ------------------------------------------------------------------------------ mission */
function setPlan(rect) {
  if (!rect || rect.w < 8 || rect.h < 8) { S.plan = null; missionView.set(null); renderPlanForm(); return; }
  S.planRect = rect;
  S.plan = planMission(rect, S.planAlt, S.planOv, sim ? sim.home.y : 0);
  missionView.set(S.plan);
  renderPlanForm();
}

function renderPlanForm() {
  const form = $('plan-form');
  form.hidden = !S.plan;
  $('plan-hint').hidden = !S.planning || !!S.plan;
  if (!S.plan) return;
  const p = S.plan;
  $('plan-stats').innerHTML = [
    ['GSD', `${p.gsd.toFixed(2)} cm/px`], ['Line spacing', `${p.spacing.toFixed(1)} m`], ['Photo every', `${p.photoEvery.toFixed(1)} m`],
    ['Lines', `${p.lines.length}`], ['Photos', `${p.photos}`], ['Area', `${(p.rect.w * p.rect.h / 10000).toFixed(2)} ha`],
    ['Speed', `${p.speed.toFixed(1)} m/s`], ['Time', mmss(p.time + 20)],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  for (const b of $('seg-alt').children) b.setAttribute('aria-pressed', String(Number(b.dataset.v) === S.planAlt));
  for (const b of $('seg-ov').children) b.setAttribute('aria-pressed', String(Number(b.dataset.v) === S.planOv));
}

function startPlanning() {
  S.planning = true; S.planTaps = []; S.planDrag = null;
  $('map-sheet').classList.remove('is-folded'); S.mapOff = mapOffPx();
  S.mapV.follow = false; $('map-follow').setAttribute('aria-pressed', 'false');
  document.body.classList.add('is-planning');
  $('btn-plan').textContent = 'Cancel drawing';
  renderPlanForm();
}
function endPlanning(keep = true) {
  S.planning = false; S.planTaps = []; S.planDrag = null;
  document.body.classList.remove('is-planning');
  $('btn-plan').textContent = S.plan ? 'Redraw the area' : 'Plan a mapping mission';
  if (!keep) renderPlanForm();
  renderPlanForm();
}

function flyMission() {
  if (!S.plan) { hud.toast('Draw an area on the map first'); return; }
  if (!sim.airborne) {
    if (sim.mode !== 'ready') { hud.toast('Finish the pre-flight check first'); return; }
    S.pendingMission = true;
    sim.takeOff();
    hud.toast('Taking off for the mission');
    return;
  }
  startMissionNow();
}
function startMissionNow() {
  S.pendingMission = false;
  if (drone.payload === 'H20T') setPayload('P1', { quiet: true });
  if (drone.payload === 'L2' && !lidar.on) setLidar(true, { quiet: true });
  const p = S.plan;
  if (sim.startMission({ lines: p.lines, y: p.y, photoEvery: p.photoEvery, speed: p.speed })) {
    S.missionActive = true; S.missionShots = 0; S.missionTotal = p.photos;
    $('mission-chip').hidden = false;
    hud.toast(`Mission: ${p.lines.length} lines, ${p.photos} photos at ${p.alt} m`);
    if (S.view === 'map') setView(S.lastFlightView);
  }
}

/* --------------------------------------------------------------------- sim events */
function toastOnce(key, text, ms = 2600, kind = 'info', every = 1.5) {
  const t = S.clock;
  if (S.toastAt[key] !== undefined && t - S.toastAt[key] < every) return;
  S.toastAt[key] = t;
  hud.toast(text, { ms, kind });
}
function onSim(type, d) {
  switch (type) {
    case 'toast': toastOnce(`t:${d}`, d); break;
    case 'preflight': hud.toast('Pre-flight check: powering on, unfolding the arms'); break;
    case 'rtk': hud.toast(d === 'fix' ? `RTK FIX · ${sim.rtk.sats} satellites · ±1 cm` : 'RTK FLOAT · converging'); break;
    case 'ready': hud.toast('Ready. Hold the button (or T) to take off', { ms: 3600, kind: 'ok' }); sfx.beep('ok'); break;
    case 'takeoff': hud.toast('Motors on · taking off'); break;
    case 'hover': hud.toast('Hovering at 1.5 m · you have control', { kind: 'ok' }); if (S.pendingMission) startMissionNow(); break;
    case 'landed': hud.toast(d.home < 1 ? 'Landed on the pad · motors stopped' : 'Landed · motors stopped', { kind: 'ok' }); S.target = null; break;
    case 'rth': hud.toast(d === 'battery' ? 'Low battery: returning home' : 'Returning home at 30 m', { kind: d === 'battery' ? 'warn' : 'info' }); S.target = null; stopMission(); break;
    case 'goto': hud.toast(d.name ? `Flying to ${d.name}` : 'Flying to the point'); break;
    case 'arrived': hud.toast(d.name ? `Arrived: ${d.name}` : 'Arrived · holding position', { kind: 'ok' }); S.target = null; break;
    case 'auto-cancel': hud.toast(d.kind === 'rth' ? 'Return home cancelled · you have control' : d.kind === 'mission' ? 'Mission paused · you have control' : 'Go-to cancelled · you have control'); S.target = null; if (d.kind === 'mission') stopMission(); break;
    case 'mission-start': break;
    case 'mission-run': hud.toast('On the first line · photos every ' + S.plan?.photoEvery.toFixed(1) + ' m'); break;
    case 'mission-photo': S.missionShots++; takePhoto({ auto: true }); break;
    case 'mission-complete': hud.toast(`Mission complete · ${S.missionShots} photos`, { kind: 'ok', ms: 4000 }); sfx.beep('ok'); stopMission(); break;
    case 'battery':
      if (d === 'low') { hud.toast('Battery 25% · plan to return', { kind: 'warn' }); sfx.beep('warn'); }
      if (d === 'land') { hud.toast('Battery critical · landing now', { kind: 'crit' }); sfx.beep('warn'); }
      break;
    case 'bump': toastOnce('bump', 'Obstacle contact · back off', 2000, 'warn', 2); break;
    default: break;
  }
}
function stopMission() {
  S.missionActive = false;
  setTimeout(() => { if (!S.missionActive) $('mission-chip').hidden = true; }, 2500);
}

/* ---------------------------------------------------------------------- warnings */
function warnings() {
  const w = sim.warn, out = [];
  if (w.fence) out.push({ key: 'fence', text: 'Site boundary · pushing back inside', level: 'crit' });
  if (w.altCap) out.push({ key: 'altcap', text: `Altitude limit ${ALT_CAP} m AGL (Transport Canada)`, level: 'crit' });
  if (w.obstacle) {
    const o = w.obstacle;
    const rel = wrapPi(Math.atan2(o.ux, o.uz) - sim.yaw) / DEG;
    const dir = Math.abs(rel) < 45 ? 'ahead' : Math.abs(rel) > 135 ? 'behind' : rel < 0 ? 'right' : 'left';
    out.push({ key: 'obs', text: `Obstacle ${o.d.toFixed(1)} m ${dir}${o.d < 2 ? ' · braking' : ''}`, level: o.d < 2 ? 'crit' : 'warn' });
  }
  if (w.below !== null && w.below !== undefined) out.push({ key: 'below', text: `Obstacle ${w.below.toFixed(1)} m below${w.below < 2 ? ' · slowing descent' : ''}`, level: w.below < 2 ? 'crit' : 'warn' });
  if (w.battery === 'critical') out.push({ key: 'batc', text: `Battery ${Math.ceil(sim.battery)}% · critical`, level: 'crit' });
  else if (w.battery === 'low') out.push({ key: 'batl', text: `Battery ${Math.ceil(sim.battery)}% · low`, level: 'warn' });
  if (w.boundary && !w.fence) out.push({ key: 'bnd', text: 'Approaching the flying-area boundary', level: 'warn' });
  if (w.vlos) out.push({ key: 'vlos', text: `Visual line of sight · ${sim.distHome.toFixed(0)} m from home (limit ${VLOS} m)`, level: 'warn' });
  if (w.alt && !w.altCap) out.push({ key: 'alt', text: `Approaching ${ALT_CAP} m AGL limit`, level: 'warn' });
  out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'crit' ? -1 : 1));
  const top = out[0];
  if (top && top.key !== S.lastWarnKey && S.clock - S.warnAt > 1.2) { sfx.beep('warn'); S.warnAt = S.clock; }
  S.lastWarnKey = top ? top.key : '';
  S.warnList = out;
  return out;
}

function modeText() {
  const base = sim.sport ? 'S-Sport' : 'P-GPS';
  switch (sim.mode) {
    case 'parked': return `${base} · Parked`;
    case 'preflight': return `${base} · Pre-flight`;
    case 'ready': return `${base} · Ready`;
    case 'spinup': return `${base} · Motors on`;
    case 'takeoff': return `${base} · Taking off`;
    case 'landing': return `${base} · Landing`;
    case 'rth': return `RTH · ${{ climb: 'Climbing', cruise: 'Returning', descend: 'Descending', land: 'Landing' }[sim.auto?.phase] || ''}`;
    case 'goto': return `Go to${sim.auto?.name ? ` · ${sim.auto.name}` : ''}`;
    case 'mission': return `Mission · ${Math.round((sim.auto?.progress || 0) * 100)}%`;
    default: return `${base} · ${sim.agl < 0.3 ? 'On ground' : 'Flying'}`;
  }
}

/* ------------------------------------------------------------------------ hold control */
function holdLabel() {
  if (sim.airborne) return sim.mode === 'landing' ? 'Landing…' : 'Hold to land';
  if (sim.mode === 'parked') return 'Pre-flight';
  if (sim.mode === 'preflight') return 'Checking…';
  if (sim.mode === 'spinup') return 'Motors on';
  return 'Hold to take off';
}
function holdStart() {
  if (!sim) return;
  if (sim.mode === 'parked') { sim.startPreflight(); return; }
  if (!sim.airborne && sim.mode !== 'ready') { const why = sim.takeoffBlock(); if (why) toastOnce('hold', why); return; }
  if (sim.mode === 'landing' || sim.mode === 'spinup') return;
  S.hold.active = true; S.hold.t = 0;
  document.body.classList.add('is-holding');
}
function holdEnd() {
  S.hold.active = false; S.hold.t = 0;
  document.body.classList.remove('is-holding');
  $('btn-hold').style.setProperty('--p', '0');
}
function holdStep(dt) {
  if (!S.hold.active) return;
  S.hold.t += dt;
  $('btn-hold').style.setProperty('--p', String(clamp(S.hold.t / 1.0, 0, 1)));
  if (S.hold.t >= 1.0) {
    holdEnd();
    if (sim.airborne) sim.land(); else sim.takeOff();
  }
}

/* ------------------------------------------------------------------------- the frame */
let lastNow = performance.now();
function frame(dt) {
  dt = Math.min(dt, 0.1);
  S.clock += dt; S.frames++;
  const ax = input.update(dt);
  // gimbal and zoom rates from keys / gamepad
  if (input.gimbalRate) sim.gimbal.tPitch = clamp(sim.gimbal.tPitch + input.gimbalRate * 60 * dt, -90, 30);
  if (input.zoomRate) sim.zoom = clamp(sim.zoom * Math.exp(input.zoomRate * 1.4 * dt), 1, drone.payload === 'H20T' ? 7 : 2);
  // fixed-step flight model
  S.acc += dt;
  let n = 0;
  while (S.acc >= STEP && n < 24) { sim.step(STEP, ax); S.acc -= STEP; n++; }
  if (n >= 24) S.acc = 0;
  holdStep(dt);
  // daylight ease (a light-only blend)
  if (S.day !== S.dayTarget) {
    const r = REDUCED ? 1 : dt / 0.8;
    S.day = S.dayTarget > S.day ? Math.min(S.dayTarget, S.day + r) : Math.max(S.dayTarget, S.day - r);
    const d = S.day * S.day * (3 - 2 * S.day);
    world.applyLight(d, sim.pos, sim.agl);
    renderer.toneMappingExposure = world.exposure;
    drone.night = 1 - d;
  } else if (Q.shadows) world.placeSun(sim.pos, sim.agl);
  // the drone
  drone.pose({ pos: sim.pos, yaw: sim.yaw, pitch: sim.pitch, roll: sim.roll, fold: sim.fold, rotor: sim.rotor, gimbal: sim.gimbal }, REDUCED ? dt * 0.5 : dt);
  drone.leds(sim.mode === 'parked' ? 0 : sim.power, S.clock);
  drone.group.updateMatrixWorld(true);
  world.update(S.clock);
  updateGimbalCam();
  updateChaseCam(dt);
  if (S.view === 'map') updateMapCam(dt);
  // LiDAR: from the payload, along the stabilised boresight
  if (lidar.on) {
    const f = tmpV.set(0, 0, -1).applyQuaternion(gimbalCam.quaternion);
    const r = tmpV2.set(1, 0, 0).applyQuaternion(gimbalCam.quaternion);
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(gimbalCam.quaternion);
    lidar.scan(dt, gimbalCam.position, f, r, u, Q.tier === 'lite' ? 1.5 : 2.5);
  } else lidar.fan.visible = false;
  updateRange(dt);
  sfx.rotor(sim.rotor);
  // HUD at ~10 Hz, place tags every frame
  S.hudAt -= dt;
  if (S.hudAt <= 0) { S.hudAt = 0.1; updateHud(); }
  updateTags();
  S.mapAt -= dt;
  if (S.mapAt <= 0) { S.mapAt = S.view === 'map' ? 1 / 30 : 0.12; drawMaps(); }
}

function updateHud() {
  // phones: the sticks and the button group show once the drone is in the air (fly.css)
  const flying = sim.airborne || sim.mode === 'takeoff';
  if (document.body.classList.contains('is-flying') !== flying) {
    document.body.classList.toggle('is-flying', flying);
    if (isPhone()) { S.hudTopBottom = $('ptele').getBoundingClientRect().bottom; if (flying) coachResume(); }
  }
  document.body.classList.toggle('is-rth', sim.mode === 'rth');
  const homeB = sim.distHome > 2 ? headingOf(sim.home.x - sim.pos.x, sim.home.z - sim.pos.z) : null;
  hud.compass(sim.heading, homeB);
  hud.update(sim, { modeText: modeText(), real: real ? real.hudPosition(sim.pos) : null, elev0: real ? real.elevation(sim.pos.y) : undefined });
  hud.warnings(warnings());
  hud.checklist(sim, sim.mode === 'preflight' || (sim.mode === 'ready' && sim.time < 9));
  const ht = holdLabel();
  if ($('hold-text').textContent !== ht) {
    $('hold-text').textContent = ht;
    $('btn-hold').setAttribute('aria-label', ht);
    $('btn-hold').classList.toggle('is-land', sim.airborne);
    $('btn-hold').classList.toggle('is-wait', sim.mode === 'preflight' || sim.mode === 'parked');
  }
  // gimbal slider
  const gp = sim.gimbal.pitch;
  $('gimbal-thumb').style.top = `${((30 - gp) / 120 * 100).toFixed(2)}%`;
  $('gimbal-v').textContent = `${Math.round(gp)}°`;
  $('gimbal-track').setAttribute('aria-valuenow', String(Math.round(gp)));
  $('zoom-v').textContent = `${sim.zoom.toFixed(1)}×`;
  if (lidar.on) {
    const s = lidar.stats;
    $('lidar-stats').innerHTML = `<span class="readout__k">LiDAR · ${LIDAR_MODES[lidar.mode]}</span><span class="readout__v">${grp(s.count, 0)} pts${s.count >= s.cap ? ' · cap' : ''}</span>`
      + `<span class="rc__l">${s.density.toFixed(0)} pts/m² · parcel ${(s.coverage * 100).toFixed(0)}%</span>`;
  }
  // phones: one extra telemetry line carries the payload's live figures
  {
    const ls = lidar.stats, pr = sim.auto?.progress ?? 1;
    const xt = lidar.on ? `${grp(ls.count, 0)} pts · ${ls.density.toFixed(0)}/m²`
      : (S.missionActive || sim.mode === 'mission') ? `Mission ${Math.round(pr * 100)}% · ${S.missionShots}/${S.missionTotal}`
        : drone.payload === 'H20T' ? `Zoom ${sim.zoom.toFixed(1)}×${S.thermal ? ' · thermal' : ''}` : PAYLOADS[drone.payload].note;
    const e = $('t-xtra'); if (e.textContent !== xt) e.textContent = xt;
  }
  if (S.missionActive || (sim.mode === 'mission')) {
    const pr = sim.auto?.progress ?? 1;
    $('mission-chip').innerHTML = `<span class="readout__k">Mission · ${S.plan ? S.plan.alt + ' m · GSD ' + S.plan.gsd.toFixed(2) + ' cm' : ''}</span><span class="readout__v">${Math.round(pr * 100)}%</span><span class="rc__l">${S.missionShots} / ${S.missionTotal} photos</span>`;
  }
}

const TAGS_TMP = new THREE.Vector3();
function updateTags() {
  const cam = activeCam();
  const items = [];
  const on = S.view !== 'map' && !S.thermal;
  const pts = world.viewpoints.map((v) => ({ id: v.id, name: v.name, sub: v.sub, p: v.mark, kind: 'vp' }));
  pts.push({ id: 'home', name: 'Home', sub: 'H', p: sim.home, kind: 'home' });
  for (const t of pts) {
    TAGS_TMP.copy(t.p);
    TAGS_TMP.y += t.kind === 'home' ? 0.6 : 0.3;
    const dist = TAGS_TMP.distanceTo(cam.position);
    TAGS_TMP.project(cam);
    const nearHome = t.kind === 'home' && sim.distHome < 8;
    const vis = on && !nearHome && TAGS_TMP.z < 1 && TAGS_TMP.z > -1 && Math.abs(TAGS_TMP.x) < 1.05 && Math.abs(TAGS_TMP.y) < 1.05 && dist > (t.kind === 'home' ? 4 : 6);
    const sub = `${t.kind === 'home' ? 'Home' : t.sub} · ${dist < 1000 ? dist.toFixed(0) + ' m' : (dist / 1000).toFixed(1) + ' km'}`;
    items.push({ id: t.id, d: dist, name: t.kind === 'home' ? 'H' : t.name, sub, kind: t.kind, on: vis, x: (TAGS_TMP.x * 0.5 + 0.5) * view.w, y: (-TAGS_TMP.y * 0.5 + 0.5) * view.h, alpha: clamp(1.3 - dist / 260, 0.35, 1) });
  }
  // keep tags off the top readouts, and off each other (the nearer one wins)
  const topY = S.hudTopBottom || 0;
  // …and off the side columns (minimap, buttons), where a half-cut tag reads badly
  const side = Math.max(70, view.w * 0.1);
  for (const it of items) if (it.on && (it.y < topY + 64 || it.x < side || it.x > view.w - side)) it.on = false;
  // phones: no place tags at all (the picture comes first; the map view names the places, and flies there)
  if (isPhone()) for (const it of items) it.on = false;
  const vis = items.filter((it) => it.on).sort((a, b) => a.d - b.d);
  for (let i = 0; i < vis.length; i++) for (let j = 0; j < i; j++) if (vis[j].on && Math.abs(vis[i].x - vis[j].x) < 90 && Math.abs(vis[i].y - vis[j].y) < 40) { vis[i].on = false; break; }
  hud.tags(items);
}

function droneCone() {
  // where the gimbal camera's view meets the ground, for the map's view cone
  const c = photos.footprint(gimbalCam);
  return c ? [[c[0][0], c[0][2]], [c[1][0], c[1][2]], [c[2][0], c[2][2]], [c[3][0], c[3][2]]] : null;
}

function mapState(small) {
  return {
    base: small, small, labels: !small, fence: true,
    drone: { x: sim.pos.x, z: sim.pos.z, heading: sim.heading, cone: small ? null : droneCone() },
    home: sim.home, viewpoints: world.viewpoints, gcps: world.gcps,
    mission: S.plan ? { area: S.plan.area, route: S.plan.route } : null,
    plan: S.planDrag ? S.planDrag : null, planTaps: S.planning ? S.planTaps : null,
    target: S.target,
  };
}

function drawMaps() {
  if (!sim || real) return;
  const mm = $('minimap');
  if (S.view !== 'map' && mm.offsetParent !== null) {
    const g = mm.getContext('2d'), d = mm.width / (mm.getBoundingClientRect().width || 120);
    const w = mm.width / d, h = mm.height / d;
    g.setTransform(d, 0, 0, d, 0, 0);
    const span = mm.classList.contains('is-big') ? 640 : document.body.classList.contains('is-compact') ? 420 : 560;   // metres across
    map.draw(g, { cx: sim.pos.x, cz: sim.pos.z, scale: w / span, w, h }, mapState(true));
  }
  if (S.view === 'map') {
    const ov = $('map-overlay'), g = ov.getContext('2d'), d = ov.width / view.w;
    g.setTransform(d, 0, 0, d, 0, 0);
    const mc = mapCentre();
    map.draw(g, { cx: mc.x, cz: mc.z, scale: mapScale(), w: view.w, h: view.h }, mapState(false));
  }
}

/* ------------------------------------------------------------------------------ render */
function postOpts(o = {}) {
  const d = S.day;
  return { time: S.clock, bloom: 0.45 * (1 - 0.55 * d), grain: (TOUCH ? 0.02 : 0.025) * (1 - 0.5 * d), vignette: 0.35 * (1 - 0.6 * d), ...o };
}

function render() {
  lidar.flush(renderer.getPixelRatio());
  // far-forest impostors: true size in pixels for the camera in use
  { const c = S.view === 'gimbal' ? gimbalCam : chaseCam; world.forest.farU.uScale.value = renderer.getDrawingBufferSize(tmpSize).y / (2 * Math.tan(c.fov * DEG / 2)); }
  if (real) real.update(activeCam());
  const v = S.view;
  // the drone's shadow map: every other frame (a one-frame lag nobody sees), none from straight above
  if (Q.shadows && v !== 'map' && (S.frames & 1) === 0) renderer.shadowMap.needsUpdate = true;
  if (v === 'map') {
    const f = scene.fog, d0 = f.density;
    f.density = 0;                                   // a top view sees through the haze (a uniform)
    // from straight above the sky, the far ridgelines and the billboard forest add nothing
    const skip = [world.sky.dome, ...world.sky.ridges, world.forest.far];
    for (const o of skip) o.visible = false;
    post.render(scene, mapCam, postOpts({ vignette: 0, grain: 0, bloom: 0.3 }));
    for (const o of skip) o.visible = true;
    f.density = d0;
  } else if (v === 'gimbal' && S.thermal > 0) {
    thermalScene(true);
    renderer.setRenderTarget(post.sceneRT); renderer.clear(); renderer.render(scene, gimbalCam);
    thermalScene(false);
    passes.run(post.sceneRT.texture, null, { mode: S.thermal, gain: thermalGain(), time: S.clock, w: view.w, h: view.h });
  } else {
    post.render(scene, v === 'gimbal' ? gimbalCam : chaseCam, postOpts());
  }
  // picture-in-picture: the chase view in a corner of the gimbal view (desktop)
  if (v === 'gimbal' && S.pip) {
    const p = S.pip, m = 16, bottom = 16;
    const asp = chaseCam.aspect; chaseCam.aspect = p.w / p.h; chaseCam.updateProjectionMatrix();
    renderer.setRenderTarget(pipRT); renderer.clear(); renderer.render(scene, chaseCam);
    chaseCam.aspect = asp; chaseCam.updateProjectionMatrix();
    passes.run(pipRT.texture, null, { mode: 0, exposure: renderer.toneMappingExposure, vignette: 0.2, frame: true, viewport: { x: view.w - p.w - m, y: bottom, w: p.w, h: p.h }, w: p.w, h: p.h });
  }
}

/* -------------------------------------------------------------------- shader warm-up */
// Everything that can appear later is shown for one compile and two real frames (depth programs are
// keyed by the previous draw's lights, hence two), through every pass: the HDR scene pass, the map's
// orthographic camera, thermal, the PIP and the photo / orthophoto finish into an 8-bit target.
async function warmUp() {
  const shown = [];
  const show = (o) => { if (o && !o.visible) { o.visible = true; shown.push(o); } };
  lidar.points.geometry.setDrawRange(0, 1);
  photos.fp.geometry.setDrawRange(0, 2);
  [lidar.points, lidar.fan, photos.fp, missionView.area, missionView.route, rangeLaser.group, rangeLaser.target, world.prism.group].forEach(show);
  drone.showAllPayloads(true); drone.showDiscs();
  renderer.setRenderTarget(post.sceneRT);
  try { await renderer.compileAsync(scene, chaseCam); } catch (e) { /* not supported: the draws below compile */ }
  renderer.setRenderTarget(null);
  for (let i = 0; i < 2; i++) { if (Q.shadows) renderer.shadowMap.needsUpdate = true; post.render(scene, chaseCam, postOpts()); }
  updateMapCam(0);
  post.render(scene, mapCam, postOpts());
  thermalScene(true); renderer.setRenderTarget(post.sceneRT); renderer.render(scene, gimbalCam); thermalScene(false);
  passes.run(post.sceneRT.texture, null, { mode: 1, w: view.w, h: view.h });
  renderer.setRenderTarget(pipRT); renderer.render(scene, chaseCam);
  passes.run(pipRT.texture, null, { mode: 0, frame: true, viewport: { x: 0, y: 0, w: 64, h: 36 }, w: 64, h: 36 });
  renderer.setRenderTarget(photos.hdr); renderer.render(scene, gimbalCam);
  passes.run(photos.hdr.texture, photos.ldr, { mode: 0, w: 512, h: 342 });
  passes.run(photos.hdr.texture, photos.ldr, { mode: 2, w: 512, h: 342 });
  renderer.setRenderTarget(null);
  for (const o of shown) o.visible = false;
  lidar.points.visible = true; photos.fp.visible = true;      // these two are always in the scene (empty ranges)
  lidar.points.geometry.setDrawRange(0, 0);
  photos.fp.geometry.setDrawRange(0, 0);
  world.prism.update(null, 0, 0, 1, 0);
  rangeLaser.target.visible = false;
  drone.showAllPayloads(false);
  drone.inst.spin(0, 0);
}

/** The orthophoto for the map's reveal: a top-down daylight render of the whole site. */
function renderOrtho() {
  const N = 1024;
  const hdr = new THREE.WebGLRenderTarget(N, N, { type: THREE.HalfFloatType, depthBuffer: true });
  const ldr = new THREE.WebGLRenderTarget(N, N, { type: THREE.UnsignedByteType, depthBuffer: false });
  const cam = new THREE.OrthographicCamera(-MAP_HALF, MAP_HALF, MAP_HALF, -MAP_HALF, 1, 2400);
  cam.position.set(0, 1500, 0); cam.rotation.set(-Math.PI / 2, 0, 0); cam.updateMatrixWorld();
  const f = scene.fog;
  const d0 = S.day;
  world.applyLight(1, sim.pos, 0);
  f.density = 0;
  drone.group.visible = false; lidar.points.visible = false; photos.fp.visible = false;
  renderer.setRenderTarget(hdr); renderer.clear(); renderer.render(scene, cam);
  passes.run(hdr.texture, ldr, { mode: 0, vignette: 0, w: N, h: N });
  const buf = new Uint8Array(N * N * 4);
  renderer.readRenderTargetPixels(ldr, 0, 0, N, N, buf);
  renderer.setRenderTarget(null);
  drone.group.visible = true; lidar.points.visible = true; photos.fp.visible = true;
  world.applyLight(d0 * d0 * (3 - 2 * d0), sim.pos, sim.agl);
  const c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) img.data.set(buf.subarray((N - 1 - y) * N * 4, (N - y) * N * 4), y * N * 4);
  g.putImageData(img, 0, 0);
  hdr.dispose(); ldr.dispose();
  map.setOrtho(c);
}

/* ---------------------------------------------------------------------------- UI wiring */
function wireUi() {
  const tap = (id, fn) => $(id).addEventListener('click', (e) => { fn(e); e.currentTarget.blur?.(); });
  tap('btn-photo', () => takePhoto());
  tap('btn-lidar', () => setLidar(!lidar.on));
  tap('btn-rth', () => { if (sim.mode === 'rth') sim.cancelAuto('RTH cancelled'); else sim.rth('user'); });
  tap('btn-view', () => setView(S.view === 'gimbal' ? 'chase' : 'gimbal'));
  tap('btn-map', () => setView(S.view === 'map' ? S.lastFlightView : 'map'));
  tap('btn-payload', () => cyclePayload());
  tap('btn-thermal', () => setThermal(S.thermal + 1));
  tap('zoom-in', () => { sim.zoom = clamp(sim.zoom * 1.5, 1, drone.payload === 'H20T' ? 7 : 2); });
  tap('zoom-out', () => { sim.zoom = clamp(sim.zoom / 1.5, 1, 7); });
  const sheet = (id, on) => { const el = $(id); el.hidden = !on; };
  tap('btn-more', () => { const on = $('more-sheet').hidden; sheet('more-sheet', on); $('btn-more').setAttribute('aria-expanded', String(on)); });
  tap('more-close', () => { sheet('more-sheet', false); $('btn-more').setAttribute('aria-expanded', 'false'); });
  tap('btn-roll', () => sheet('roll', $('roll').hidden));
  tap('roll-close', () => sheet('roll', false));
  tap('help-close', () => sheet('help', false));
  tap('tog-help', () => { sheet('help', true); sheet('more-sheet', false); });
  tap('tog-coach', () => { sheet('more-sheet', false); coach(true); });
  tap('tog-sport', () => toggleSport());
  tap('tog-sound', () => { sfx.setEnabled(!sfx.enabled); syncToggles(); });
  tap('tog-lidar-mode', () => { lidar.setMode(lidar.mode + 1); syncToggles(); });
  tap('t-pos', () => {});
  // quality
  const segQ = $('seg-quality');
  for (const t of ['auto', 'lite', 'balanced', 'high']) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = t[0].toUpperCase() + t.slice(1); b.dataset.v = t;
    b.addEventListener('click', () => {
      setQualityOverride(t);
      $('quality-note').textContent = `Saved: ${b.textContent}. Reload the page to apply.`;
      for (const x of segQ.children) x.setAttribute('aria-pressed', String(x === b));
    });
    segQ.appendChild(b);
  }
  for (const x of segQ.children) x.setAttribute('aria-pressed', String(Q.override ? x.dataset.v === Q.tier : x.dataset.v === 'auto'));
  $('quality-note').textContent = qualityBadge(Q);
  // world switch (only with a Google Maps key)
  if (GOOGLE_MAPS_KEY) {
    $('tog-world').hidden = false;
    tap('tog-world', () => toggleReal());
  }
  // map sheet: viewpoints, follow, zoom, mission planning
  const chips = $('vp-chips');
  for (const v of world.viewpoints) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip vp-chip';
    b.innerHTML = `<b>${v.name}</b><span class="chip__k">${v.sub}</span>`;
    b.addEventListener('click', () => { flyToViewpoint(v.id); if (sim.airborne) setView(S.lastFlightView); });
    chips.appendChild(b);
  }
  tap('map-fold', () => { const f = $('map-sheet').classList.toggle('is-folded'); $('map-fold').setAttribute('aria-expanded', String(!f)); S.mapOff = mapOffPx(); });
  tap('map-follow', () => { S.mapV.follow = !S.mapV.follow; $('map-follow').setAttribute('aria-pressed', String(S.mapV.follow)); });
  tap('map-zin', () => { S.mapV.half = clamp(S.mapV.half / 1.4, 15, MAP_HALF); });
  tap('map-zout', () => { S.mapV.half = clamp(S.mapV.half * 1.4, 15, MAP_HALF); });
  tap('btn-plan', () => (S.planning ? endPlanning(false) : startPlanning()));
  for (const [id, list, key, fmt] of [['seg-alt', ALTS, 'planAlt', (v) => `${v} m`], ['seg-ov', OVERLAPS, 'planOv', (v) => `${Math.round(v * 100)}%`]]) {
    for (const v of list) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = fmt(v); b.dataset.v = String(v);
      b.addEventListener('click', () => { S[key] = v; if (S.planRect) setPlan(S.planRect); });
      $(id).appendChild(b);
    }
  }
  tap('btn-fly-mission', () => flyMission());
  tap('btn-clear-mission', () => { S.planRect = null; setPlan(null); endPlanning(false); });
  // the gimbal slider
  const track = $('gimbal-track');
  const setFromY = (y) => { const r = track.getBoundingClientRect(); sim.gimbal.tPitch = clamp(30 - ((y - r.top) / r.height) * 120, -90, 30); };
  let gid = null;
  track.addEventListener('pointerdown', (e) => { gid = e.pointerId; track.setPointerCapture(e.pointerId); setFromY(e.clientY); e.preventDefault(); });
  track.addEventListener('pointermove', (e) => { if (e.pointerId === gid) setFromY(e.clientY); });
  for (const t of ['pointerup', 'pointercancel']) track.addEventListener(t, (e) => { if (e.pointerId === gid) gid = null; });
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') { sim.gimbal.tPitch = clamp(sim.gimbal.tPitch + 5, -90, 30); e.preventDefault(); e.stopPropagation(); }
    if (e.key === 'ArrowDown') { sim.gimbal.tPitch = clamp(sim.gimbal.tPitch - 5, -90, 30); e.preventDefault(); e.stopPropagation(); }
  });
  // the hold button
  const hb = $('btn-hold');
  hb.addEventListener('pointerdown', (e) => { e.preventDefault(); hb.setPointerCapture?.(e.pointerId); holdStart(); });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) hb.addEventListener(t, () => { if (S.hold.active) holdEnd(); });
  hb.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); holdStart(); } });
  hb.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') holdEnd(); });
  // the minimap: tap to fly there (or open the map on the ground)
  const mm = $('minimap');
  mm.addEventListener('click', (e) => {
    // phones: a tap opens the minimap larger (and a tap on the large one flies there); desktop: fly there
    const compact = document.body.classList.contains('is-compact');
    if (compact && !mm.classList.contains('is-big')) { mm.classList.add('is-big'); sizeMinimap(); return; }
    const r = mm.getBoundingClientRect();
    const span = mm.classList.contains('is-big') ? 640 : 560;
    const x = sim.pos.x + ((e.clientX - r.left) / r.width - 0.5) * span, z = sim.pos.z + ((e.clientY - r.top) / r.height - 0.5) * span;
    if (compact) { mm.classList.remove('is-big'); sizeMinimap(); }
    if (sim.airborne) goTo(x, z); else setView('map');
  });
  tap('btn-payload-c', () => cyclePayload());
  syncToggles();
  wirePhone();
}

/* ------------------------------------------------------- phones: the bar, the strip, the sheet */
// (2026-10-14) The bar's ⋯ opens the same settings sheet as the header's (drawn as a bottom sheet over a
// scrim there), with the day / night, payload and view rows on top. The strip opens its details in place.
function wirePhone() {
  const more = $('more-sheet'), roll = $('roll'), scrim = $('pscrim'), pm = $('ptop-more');
  const tap = (id, fn) => $(id).addEventListener('click', (e) => { fn(e); e.currentTarget.blur?.(); });
  // every way a sheet opens or closes (⋯, ✕, Esc, the help) goes through `hidden`: the scrim follows it
  const syncScrim = () => {
    scrim.hidden = more.hidden && roll.hidden;
    pm.setAttribute('aria-expanded', String(!more.hidden));
    if (!more.hidden) syncPhoneSheet();
  };
  for (const el of [more, roll]) new MutationObserver(syncScrim).observe(el, { attributes: true, attributeFilter: ['hidden'] });
  tap('ptop-more', () => { more.hidden = !more.hidden; roll.hidden = true; });
  scrim.addEventListener('click', () => { more.hidden = true; roll.hidden = true; });
  // the strip: altitude, speed, home, battery; a tap shows the rest under it
  tap('pstrip', () => {
    const det = $('pdet'), on = det.hidden;
    det.hidden = !on;
    $('pstrip').setAttribute('aria-expanded', String(on));
    S.hudTopBottom = $('ptele').getBoundingClientRect().bottom;
  });
  // the sheet's rows: day / night (the header's own switch does the work), payload, view
  for (const b of $('pseg-look').children) {
    b.addEventListener('click', () => { if (document.body.classList.contains('is-day') !== (b.dataset.day === '1')) header.daylight?.click(); syncPhoneSheet(); });
  }
  // (the switch may cross-fade the page: the rows follow the switch itself, not the click)
  if (header.daylight) new MutationObserver(syncPhoneSheet).observe(header.daylight, { attributes: true, attributeFilter: ['aria-pressed'] });
  const ps = $('pseg-payload');
  for (const id of PAYLOAD_ORDER) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pseg__b'; b.dataset.p = id; b.textContent = PAYLOADS[id].short;
    b.addEventListener('click', () => { setPayload(id); syncPhoneSheet(); });
    ps.appendChild(b);
  }
  for (const b of $('pseg-view').children) b.addEventListener('click', () => { setView(b.dataset.v); more.hidden = true; });
  tap('tog-roll', () => { more.hidden = true; roll.hidden = false; });
  // full screen, where the browser has it (not iPhone Safari)
  const root = document.documentElement, fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  if ((document.fullscreenEnabled || document.webkitFullscreenEnabled) && (root.requestFullscreen || root.webkitRequestFullscreen)) {
    const fs = $('tog-fs');
    fs.hidden = false;
    tap('tog-fs', () => {
      if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document)?.catch?.(() => {});
      else (root.requestFullscreen || root.webkitRequestFullscreen).call(root, { navigationUI: 'hide' })?.catch?.(() => {});
    });
    const sync = () => { const on = !!fsEl(); fs.setAttribute('aria-pressed', String(on)); fs.querySelector('b').textContent = on ? 'On' : 'Off'; };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
  }
  // turning into or out of the phone layout: the strip folds
  PHONE_MQ.addEventListener?.('change', () => { $('pdet').hidden = true; $('pstrip').setAttribute('aria-expanded', 'false'); });
}
function syncPhoneSheet() {
  const day = document.body.classList.contains('is-day');
  for (const b of $('pseg-look').children) b.setAttribute('aria-pressed', String((b.dataset.day === '1') === day));
  for (const b of $('pseg-payload').children) b.setAttribute('aria-pressed', String(b.dataset.p === drone?.payload));
  for (const b of $('pseg-view').children) b.setAttribute('aria-pressed', String(b.dataset.v === S.view));
}

function toggleSport() { sim.sport = !sim.sport; syncToggles(); hud.toast(sim.sport ? 'Sport mode · 21 m/s, obstacle sensing still on' : 'Normal mode · 15 m/s'); }
function syncToggles() {
  const t = (id, on, text) => { const b = $(id); b.setAttribute('aria-pressed', String(on)); if (text) b.querySelector('b').textContent = text; };
  t('tog-sport', !!sim?.sport, sim?.sport ? 'On · 21 m/s' : 'Off · 15 m/s');
  t('tog-sound', sfx.enabled, sfx.enabled ? 'On' : 'Off');
  $('lidar-mode-name').textContent = LIDAR_MODES[lidar.mode];
}

function onAction(a) {
  if (!sim) return;
  switch (a) {
    case 'photo': takePhoto(); break;
    case 'lidar': setLidar(!lidar.on); break;
    case 'rth': if (sim.mode === 'rth') sim.cancelAuto(); else sim.rth('user'); break;
    case 'map': setView(S.view === 'map' ? S.lastFlightView : 'map'); break;
    case 'view-chase': setView('chase'); break;
    case 'view-gimbal': setView('gimbal'); break;
    case 'view-map': setView('map'); break;
    case 'view-next': setView(S.view === 'chase' ? 'gimbal' : 'chase'); break;
    case 'payload': cyclePayload(); break;
    case 'sport': toggleSport(); break;
    case 'thermal': setThermal(S.thermal + 1); break;
    case 'lidar-mode': lidar.setMode(lidar.mode + 1); syncToggles(); hud.toast(`LiDAR colours: ${LIDAR_MODES[lidar.mode]}`); break;
    case 'roll': $('roll').hidden = !$('roll').hidden; break;
    case 'help': $('help').hidden = !$('help').hidden; break;
    case 'escape': for (const id of ['help', 'roll', 'more-sheet']) $(id).hidden = true; if (S.planning) endPlanning(false); break;
    case 'gamepad': hud.toast('Gamepad connected · Mode 2 sticks'); break;
    default: break;
  }
}

/* ------------------------------------------------------------------------- 3D gestures */
function wireGestures() {
  new Gestures(canvas, {
    down: () => { S.chase.idle = 0; },
    drag(dx, dy) {
      const v = S.view;
      if (v === 'chase') { S.chase.yawOff -= dx * 0.006; S.chase.elOff = clamp(S.chase.elOff + dy * 0.005, -0.5, 1.1); S.chase.idle = 0; }
      else if (v === 'gimbal') { sim.gimbal.tPitch = clamp(sim.gimbal.tPitch - dy * 0.15 / sim.zoom, -90, 30); sim.gimbal.tYaw = clamp(sim.gimbal.tYaw + dx * 0.15 / sim.zoom, -90, 90); }
      else if (S.planning && S.planDragStart) {
        const p = mapToWorld(S.planPointer.x += dx, S.planPointer.y += dy);
        const a = S.planDragStart;
        S.planDrag = [[a.x, a.z], [p.x, a.z], [p.x, p.z], [a.x, p.z]];
        S.mapAt = 0;
      } else { S.mapV.follow = false; $('map-follow').setAttribute('aria-pressed', 'false'); S.mapV.cx -= dx / mapScale(); S.mapV.cz -= dy / mapScale(); S.mapAt = 0; }
    },
    pinch(s) {
      if (S.view === 'gimbal') sim.zoom = clamp(sim.zoom * s, 1, drone.payload === 'H20T' ? 7 : 2);
      else if (S.view === 'map') S.mapV.half = clamp(S.mapV.half / s, 15, MAP_HALF);
      else S.chase.dist = clamp(S.chase.dist / s, 2.2, 16);
    },
    pan(dx, dy) { if (S.view === 'map' && !S.planning) { S.mapV.follow = false; S.mapV.cx -= dx / mapScale(); S.mapV.cz -= dy / mapScale(); } },
    wheel(dy) {
      const k = Math.exp(dy * 0.0012);
      if (S.view === 'gimbal') sim.zoom = clamp(sim.zoom / k, 1, drone.payload === 'H20T' ? 7 : 2);
      else if (S.view === 'map') S.mapV.half = clamp(S.mapV.half * k, 15, MAP_HALF);
      else S.chase.dist = clamp(S.chase.dist * k, 2.2, 16);
    },
    tap(x, y) {
      if (S.view === 'gimbal') rangeAt(x, y);
      else if (S.view === 'map' && S.planning && !S.planDrag) {
        const p = mapToWorld(x, y);
        S.planTaps.push([p.x, p.z]);
        if (S.planTaps.length === 4) { setPlan(rectFromCorners(S.planTaps)); endPlanning(); }
        S.mapAt = 0;
      }
    },
    doubletap(x, y) {
      if (S.view === 'map' && !S.planning) { const p = mapToWorld(x, y); goTo(p.x, p.z); }
      else if (S.view === 'chase') { const h = pickGround(x, y, chaseCam); if (h) goTo(h.x, h.z); }
      else if (S.view === 'gimbal') { sim.gimbal.tYaw = 0; }
    },
  });
  // plan mode: a drag on the map draws the area
  canvas.addEventListener('pointerdown', (e) => {
    if (S.view === 'map' && S.planning) { S.planDragStart = mapToWorld(e.clientX, e.clientY); S.planPointer = { x: e.clientX, y: e.clientY }; S.planDrag = null; }
  });
  canvas.addEventListener('pointerup', () => {
    if (S.view === 'map' && S.planning && S.planDrag) {
      const a = S.planDrag;
      setPlan(rectFromCorners([a[0], a[2]]));
      S.planDrag = null; S.planDragStart = null;
      endPlanning();
    } else S.planDragStart = null;
  });
}

/* ------------------------------------------------------------------------------- coach */
function coach(force = false) {
  let seen = null;
  try { seen = localStorage.getItem('uh-fly-coach'); } catch (e) { /* fine */ }
  if (!force && (seen || qs.get('coach') === '0') && qs.get('coach') !== '1') return;
  if (isPhone()) { phoneCoach(); return; }
  const steps = TOUCH ? [
    ['Left stick: climb and turn', 'stick-l'],
    ['Right stick: move', 'stick-r'],
    ['Tap the ground twice to fly there', null],
  ] : [
    ['Space / Shift climb and descend · Q / E turn', null],
    ['W A S D move · drag to look around', null],
    ['Double-click the ground to fly there · ? for every key', null],
  ];
  let i = 0;
  const el = $('coach'), ring = $('coach-ring');
  const show = () => {
    const [text, target] = steps[i];
    $('coach-step').textContent = `${i + 1} / ${steps.length}`;
    $('coach-text').textContent = text;
    $('coach-next').textContent = i === steps.length - 1 ? 'Fly' : 'Next';
    const t = target && $(target);
    if (t) { const r = t.getBoundingClientRect(); ring.hidden = false; ring.style.cssText = `left:${r.left - 8}px;top:${r.top - 8}px;width:${r.width + 16}px;height:${r.height + 16}px`; el.dataset.at = target; }
    else { ring.hidden = true; el.dataset.at = ''; }
  };
  const done = () => { el.hidden = true; try { localStorage.setItem('uh-fly-coach', '1'); } catch (e) { /* fine */ } };
  $('coach-next').onclick = () => { if (++i >= steps.length) done(); else show(); };
  $('coach-skip').onclick = done;
  el.hidden = false;
  show();
}

// Phones: the touch controls, each where it is (the card stands clear of what it describes, a ring
// around it). Before take-off only the hold button is there, so the tips for the sticks and the buttons
// wait for the take-off (coachResume, from updateHud) and pick up from there.
const PHONE_COACH = [
  ['When it turns blue, hold the button to take off', 'btn-hold', false],
  ['Left stick: climb and turn', 'stick-l', true],
  ['Right stick: fly forward, back and sideways', 'stick-r', true],
  ['Photo, LiDAR, view, map and return home', 'actions', true],
];
const coachState = { i: -1, steps: PHONE_COACH };
function phoneCoach() {
  const steps = sim?.airborne ? PHONE_COACH.slice(1) : PHONE_COACH;
  coachState.steps = steps; coachState.i = 0;
  $('coach').classList.add('is-phone-coach');
  $('coach-next').onclick = () => { if (++coachState.i >= steps.length) coachDone(); else coachShow(); };
  $('coach-skip').onclick = coachDone;
  coachShow();
}
function coachDone() {
  coachState.i = -1;
  $('coach').hidden = true;
  try { localStorage.setItem('uh-fly-coach', '1'); } catch (e) { /* fine */ }
}
function coachResume() {
  if (coachState.i < 0) return;
  // (taken off with the hold tip still up: that one is done)
  if (!coachState.steps[coachState.i][2] && ++coachState.i >= coachState.steps.length) { coachDone(); return; }
  setTimeout(coachShow, 60);   // (once the sticks are laid out)
}
function coachShow() {
  const { steps, i } = coachState;
  if (i < 0) return;
  const el = $('coach'), ring = $('coach-ring'), card = el.querySelector('.coach__card');
  const [text, target, air] = steps[i];
  // a tip for the sticks or the buttons, on the ground: it waits for the take-off
  if (air && !sim.airborne) { el.hidden = true; return; }
  $('coach-step').textContent = `${i + 1} / ${steps.length}`;
  $('coach-text').textContent = text;
  const next = steps[i + 1];
  $('coach-next').textContent = i === steps.length - 1 ? 'Fly' : next && next[2] && !sim.airborne ? 'Got it' : 'Next';
  el.hidden = false;
  // a bubble above what it describes (all of it is in the thumb zone), its arrow on that thing's centre;
  // never over the line under the bar. A thin ring marks the control.
  const r = $(target).getBoundingClientRect(), ch = card.offsetHeight, cw = card.offsetWidth;
  ring.hidden = false;
  ring.style.cssText = `left:${r.left - 4}px;top:${r.top - 4}px;width:${r.width + 8}px;height:${r.height + 8}px`;
  const cx = r.left + r.width / 2, left = clamp(cx - cw / 2, 12, view.w - 12 - cw);
  card.style.left = `${Math.round(left)}px`;
  // (held by its bottom edge, so a late web font that makes it taller grows it upwards, off the target)
  if (r.top - 18 - ch >= S.hudTopBottom + 12) { card.style.top = 'auto'; card.style.bottom = `${Math.round(view.h - r.top + 18)}px`; }
  else { card.style.bottom = 'auto'; card.style.top = `${Math.round(S.hudTopBottom + 12)}px`; }
  card.style.setProperty('--ax', `${Math.round(clamp(cx - left, 22, cw - 22))}px`);
  el.dataset.at = target;
}

/* --------------------------------------------------------------------------- real world */
async function toggleReal() {
  if (!GOOGLE_MAPS_KEY) return;
  if (real) { real.exit(); real = null; $('world-name').textContent = 'Site'; $('attrib').hidden = true; document.body.classList.remove('is-real'); hud.toast('Back on the built-in site'); return; }
  try {
    const { RealWorld } = await import('./realworld.js');
    const site = REAL_SITES[0];
    real = new RealWorld({ renderer, scene, world, sim, lidar, key: GOOGLE_MAPS_KEY, site, attribEl: $('attrib'), onToast: (t) => hud.toast(t) });
    await real.enter();
    $('world-name').textContent = site.name;
    document.body.classList.add('is-real');
    if (S.view === 'map') setView('chase');
  } catch (e) {
    real = null;
    hud.toast(`Real-world mode failed: ${e.message || e}`, { kind: 'crit', ms: 5000 });
  }
}

/* ------------------------------------------------------------------------------- boot */
function parseMissionParam() {
  if (qs.get('mission') !== 'grid') return;
  const n = (k, d) => (qs.has(k) && Number.isFinite(Number(qs.get(k))) ? Number(qs.get(k)) : d);
  const P = FIELD.parcel;
  const rect = { cx: n('cx', P.cx), cz: n('cz', P.cz), w: clamp(n('w', 2 * P.ha), 10, 300), h: clamp(n('h', 2 * P.hc), 10, 300), rot: n('rot', P.rot * 180 / Math.PI + 90) * DEG };
  if (rect.h > rect.w) { [rect.w, rect.h] = [rect.h, rect.w]; rect.rot += Math.PI / 2; }
  const alt = n('alt', 60); S.planAlt = ALTS.reduce((a, b) => (Math.abs(b - alt) < Math.abs(a - alt) ? b : a));
  setPlan(rect);
  $('btn-plan').textContent = 'Redraw the area';
  hud.toast(`Mission loaded: ${S.plan.lines.length} lines at ${S.plan.alt} m · open the map (M) to fly it`, { ms: 5000 });
}

async function boot() {
  const bootT = $('boot-t');
  bootT.textContent = 'Building the drone…';
  drone = await FlyDrone.create({ q: Q, shadows: Q.shadows });
  scene.add(drone.group);
  sim = new FlightSim({ query, home: HOME, emit: onSim });
  if (qs.has('payload') && PAYLOADS[qs.get('payload')]) drone.setPayload(qs.get('payload'));
  $('payload-name').textContent = PAYLOADS[drone.payload].short;
  $('payload-name-c').textContent = PAYLOADS[drone.payload].short;
  input = new Input({ stickL: $('stick-l'), stickR: $('stick-r'), onAction, onHold: (down) => (down ? holdStart() : holdEnd()), onActivity: () => { S.chase.idle = Math.min(S.chase.idle, 3); } });
  layout();
  // daylight: the header's pill, a light-only blend
  wireDaylightToggle(header.daylight, (isDay, { initial }) => {
    S.dayTarget = isDay ? 1 : 0;
    if (initial || REDUCED) { S.day = S.dayTarget; world.applyLight(S.day, sim.pos, 0); renderer.toneMappingExposure = world.exposure; drone.night = 1 - S.day; }
  });
  // first pose, then the warm-up
  frame(0);
  bootT.textContent = 'Compiling shaders…';
  await warmUp();
  renderOrtho();
  programsAfterWarm = renderer.info.programs.length;
  wireUi();
  wireGestures();
  setView(S.view === 'chase' ? 'chase' : S.view);
  document.body.classList.remove('view-chase'); document.body.classList.add(`view-${S.view}`);
  syncSubbar();
  parseMissionParam();
  render();
  document.body.classList.remove('is-booting');
  $('boot').hidden = true;
  coach();
  // the pre-flight check runs straight away: the arms unfold while the reader looks round
  setTimeout(() => sim.startPreflight(), DEBUG ? 0 : 600);
  if (!DEBUG || qs.get('loop') === '1') {
    requestAnimationFrame(tick);
    governor = startGovernor({ renderer, getDpr: () => renderer.getPixelRatio(), setDpr, onStep: governorStep, q: Q });
  }
}

function setDpr(v) {
  renderer.setPixelRatio(v);
  layout();
}
function governorStep(what) {
  if (what === 'streak-off') return post.setStreak(false);
  if (what === 'bloom-down') return post.bloomDown();
  return false;
}

let raf = 0;
function tick(now) {
  raf = requestAnimationFrame(tick);
  const interval = now - lastNow;
  lastNow = now;
  frame(interval / 1000);
  render();
  governor?.frame(interval);
}

/* --------------------------------------------------------------------------- debug harness */
if (DEBUG) {
  window.__fly = {
    THREE, Q, renderer, scene, world, query, lidar, photos, map, post, passes, cams: { chaseCam, gimbalCam, mapCam },
    get sim() { return sim; }, get drone() { return drone; }, get input() { return input; }, S, view, hud,
    /** Advance dt seconds with these stick axes ({lx, ly, rx, ry, gimbal, zoom}), as 1/60 s frames. */
    step(dt = 1 / 60, inp = {}) {
      input.override = inp;
      let left = dt;
      while (left > 1e-6) { const h = Math.min(1 / 60, left); frame(h); left -= h; }
      input.override = null;
      return this.state();
    },
    /** run(seconds, input | (t) => input | null) with an optional render every `renderEvery` frames.
     *  null = the real inputs (keyboard, sticks, gamepad) instead of synthetic axes. */
    run(sec, inp = {}, { renderEvery = 0 } = {}) {
      const n = Math.round(sec * 60);
      for (let i = 0; i < n; i++) {
        input.override = inp === null ? null : typeof inp === 'function' ? inp(i / 60) : inp;
        frame(1 / 60);
        if (renderEvery && i % renderEvery === 0) render();
      }
      input.override = null;
      return this.state();
    },
    render() { render(); drawMaps(); return true; },
    press(a) { onAction(a); return a; },
    hold(sec = 1.1) { holdStart(); for (let i = 0; i < Math.round(sec * 60); i++) frame(1 / 60); holdEnd(); return sim.mode; },
    setView, setPayload, setLidar, setThermal, takePhoto, rangeAt, goTo, flyToViewpoint, setPlan, flyMission, rectFromCorners, planMission,
    setDay(on) { S.dayTarget = on ? 1 : 0; S.day = S.dayTarget; world.applyLight(S.day, sim.pos, sim.agl); renderer.toneMappingExposure = world.exposure; drone.night = 1 - S.day; applyTheme(!!on); return on; },
    programs: () => renderer.info.programs.length,
    programsAfterWarm: () => programsAfterWarm,
    state() {
      return {
        mode: sim.mode, airborne: sim.airborne, pos: sim.pos.toArray().map((v) => +v.toFixed(2)), agl: +sim.agl.toFixed(2), speed: +sim.speedH.toFixed(2),
        heading: +sim.heading.toFixed(1), battery: +sim.battery.toFixed(1), rtk: `${sim.rtk.state} ${sim.rtk.sats}`, fold: +sim.fold.toFixed(2),
        view: S.view, payload: drone.payload, lidar: lidar.on ? lidar.stats : null, photos: photos.photos.length, warn: (S.warnList || []).map((w) => w.text),
        auto: sim.auto ? { kind: sim.auto.kind, phase: sim.auto.phase, progress: sim.auto.progress } : null, programs: renderer.info.programs.length,
      };
    },
    /** GPU-synced full-frame cost (frame + render), median over n frames, in the current view. */
    bench(n = 60) {
      const gl = renderer.getContext(), px = new Uint8Array(4), t = [];
      for (let i = 0; i < n; i++) {
        const t0 = performance.now();
        frame(1 / 60); render();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        t.push(performance.now() - t0);
      }
      t.sort((a, b) => a - b);
      renderer.info.autoReset = false; renderer.info.reset(); render();
      const calls = renderer.info.render.calls, tris = renderer.info.render.triangles;
      renderer.info.autoReset = true;
      return { view: S.view, tier: Q.tier, median: +t[n >> 1].toFixed(2), p90: +t[Math.floor(n * 0.9)].toFixed(2), calls, tris, dpr: renderer.getPixelRatio() };
    },
    layout,
    /** Share of the screen covered by HUD boxes outside the stick zones (a 4 px raster of their union). */
    hudCover() {
      const W = view.w, H = view.h, k = 4, nx = Math.ceil(W / k), ny = Math.ceil(H / k);
      const cov = new Uint8Array(nx * ny), stick = new Uint8Array(nx * ny);
      const mark = (arr, r) => { for (let y = Math.max(0, Math.floor(r.top / k)); y < Math.min(ny, Math.ceil(r.bottom / k)); y++) for (let x = Math.max(0, Math.floor(r.left / k)); x < Math.min(nx, Math.ceil(r.right / k)); x++) arr[y * nx + x] = 1; };
      const vis = (e) => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; let o = 1; for (let p = e; p && p !== document.body; p = p.parentElement) o *= Number(getComputedStyle(p).opacity); return o > 0.05 && e.getBoundingClientRect().width > 0; };
      const sel = '.tele,.stat,.compass__win,.compass__hdg,.mode-chip,.warn,.toast,.chip,.minimap,.readout,.zoom,.act,.gimbal,.hold,.last-photo';
      const boxes = [...document.querySelectorAll(sel)].filter(vis);
      for (const e of boxes) mark(cov, e.getBoundingClientRect());
      for (const e of document.querySelectorAll('.stick')) if (vis(e)) mark(stick, e.getBoundingClientRect());
      const count = () => { let c = 0, free = 0; for (let i = 0; i < cov.length; i++) { if (stick[i]) continue; free++; if (cov[i]) c++; } return c / free; };
      const hud = count();
      const head = document.querySelector('.site-head'); if (head) mark(cov, head.getBoundingClientRect());
      return { cover: +hud.toFixed(3), withHeader: +count().toFixed(3), boxes: boxes.length, w: W, h: H };
    },
    async checkRealModules() {
      // unit-check the real-world wiring without a key: modules load and objects construct (no network)
      const tiles = await import('3d-tiles-renderer');
      const plugins = await import('3d-tiles-renderer/plugins');
      const draco = await import('three/addons/loaders/DRACOLoader.js');
      const rw = await import('./realworld.js');
      const t = new tiles.TilesRenderer();
      const auth = new plugins.GoogleCloudAuthPlugin({ apiToken: 'TEST', autoRefreshToken: true });
      const out = { TilesRenderer: typeof tiles.TilesRenderer, GoogleCloudAuthPlugin: typeof plugins.GoogleCloudAuthPlugin, ReorientationPlugin: typeof plugins.ReorientationPlugin, GLTFExtensionsPlugin: typeof plugins.GLTFExtensionsPlugin, DRACOLoader: typeof draco.DRACOLoader, RealWorld: typeof rw.RealWorld, ellipsoid: !!t.ellipsoid, authName: auth.name };
      t.dispose();
      return out;
    },
  };
}

boot().catch((e) => {
  console.error(e);
  $('boot-t').textContent = 'Something went wrong while building the site. Reload to try again.';
});
