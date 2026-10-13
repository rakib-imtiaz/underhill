// Underhill v2 — adaptive quality: a device tier picked at load, and a live governor that trims the
// pixel ratio (then the post effects) when frames run slow. Plain module, no three.js dependency;
// every page (landing badge, film, fly, gear) uses it.
//
// ─── API ────────────────────────────────────────────────────────────────────────────────────────
//
// detectQuality(opts?) → Q   (a frozen object)
//   Q = { tier: 'lite'|'balanced'|'high', reason: string, override: boolean,
//         dprCap, msaa, shadows, bloomLevels, streak, dust, terrainSeg, trees, cloudSpacing, stars,
//         planetSeg, texSize, aniso, preload, modelBudget, lidarCap }
//   Precedence: ?q=lite|balanced|high (override: true) → ?q=auto (ignores anything saved) →
//   localStorage 'uh-quality' {tier, ts, by}: by 'user' (setQualityOverride; override: true) or
//   by 'governor' (a one-tier downgrade saved after slow frames; it expires after 7 days and never
//   raises the tier above auto) → auto detection.
//   Auto inputs: navigator.deviceMemory, hardwareConcurrency, (pointer: coarse), screen size ×
//   devicePixelRatio, navigator.connection.saveData, WebGL2, MAX_TEXTURE_SIZE and the unmasked GPU
//   renderer (WEBGL_debug_renderer_info). The GPU is probed once on a throwaway 1×1 canvas whose
//   context is lost straight after; the result is memoised (and kept in sessionStorage 'uh-gpu').
//   opts: { search?: string (default location.search), storage?: Storage|null (default
//           localStorage), probe?: boolean (default true; false = no WebGL context, use the cached
//           probe if any, else CPU/screen heuristics only — for a landing page that must not touch
//           WebGL) }
//
//   Knobs per tier                lite    balanced  high
//     dprCap (max pixel ratio)    1.0     1.25      1.75
//     msaa (HDR target samples)   0       0         4
//     shadows (shadow maps)       false   false     true
//     bloomLevels                 2       3         4
//     streak (anamorphic flare)   false   true      true
//     dust (motes per station)    60      110       220
//     terrainSeg                  120     170       250
//     trees                       120     220       420
//     cloudSpacing (m)            0.55    0.42      0.30
//     stars                       500     900       1800
//     planetSeg                   64      96        160
//     texSize (canvas textures)   512     512       1024
//     aniso                       1       4         8
//     preload (idle model builds) false   false     true
//     modelBudget                 2       3         3
//     lidarCap (points)           30000   80000     160000
//
// setQualityOverride(tierOrAuto) → boolean
//   'lite'|'balanced'|'high' saves the user's choice; 'auto' clears any saved choice or downgrade.
//   Takes effect on the next detectQuality() (geometry-level knobs: reload the page).
//
// startGovernor({ renderer, getDpr, setDpr, onStep, cap?, floor?, q? }) → { frame(dtMs), stop(), state() }
//   Call frame(dtMs) once per rendered frame with the frame interval in ms (rAF timestamp delta).
//   - p75 of the frame times over 2 s windows.
//   - p75 > 22 ms: pixel ratio × 0.85 (floor 0.75); once at the floor: onStep('streak-off'), then
//     onStep('bloom-down') (repeated while onStep returns anything but false).
//   - p75 < 12 ms — or locked to the display's refresh with no dropped frames, so a 60 Hz screen can
//     recover too — sustained for 10 s: pixel ratio ÷ 0.85, up to the cap. Streak and bloom stay off.
//   - Hysteresis: nothing happens between 12 and 22 ms; each step restarts the measurement; a step
//     up that is followed by a slow window doubles the wait before the next step up (to 80 s max).
//   - Ignores the first 3 s, frames while the tab is hidden and the first second after it returns,
//     and any interval over 1 s (a stall restarts the window).
//   - At the floor and still not fast for 10 s: saves a one-tier downgrade ('uh-quality', by
//     'governor') for the next load. Not when the tier was forced (q.override) or already lite.
//   canApply?: () => boolean — steps are only taken while it returns true (the film: only at rest
//   between moves, never mid-move); a slow window seen meanwhile is acted on at the next rest.
//   upAfterDown?: boolean (default true) — false: after any step down, never step up again this session.
//   maxSteps?: number (default unlimited) — stop the governor after this many pixel-ratio steps.
//   getDpr / setDpr default to renderer.getPixelRatio / setPixelRatio; cap defaults to getDpr() at
//   start; q defaults to the last detectQuality() result.
//
// qualityBadge(q) → string, e.g. "Smooth on this device · Balanced"
//
// QUALITY_TIERS — the frozen knob table ({ lite, balanced, high }, each a full Q-shaped object), for
//   modules constructed without a Q:  const Q = opts.q || QUALITY_TIERS[mobile ? 'balanced' : 'high']
//   (balanced is exactly the film's old phone settings, high its old desktop settings).
// ────────────────────────────────────────────────────────────────────────────────────────────────

const TIERS = ['lite', 'balanced', 'high'];
const LABEL = { lite: 'Lite', balanced: 'Balanced', high: 'High' };
const STORE_KEY = 'uh-quality';
const GPU_KEY = 'uh-gpu';
const DOWNGRADE_TTL = 7 * 24 * 3600 * 1000;

const KNOBS = {
  lite: {
    dprCap: 1.0, msaa: 0, shadows: false, bloomLevels: 2, streak: false, dust: 60, terrainSeg: 120, trees: 120,
    cloudSpacing: 0.55, stars: 500, planetSeg: 64, texSize: 512, aniso: 1, preload: false, modelBudget: 2, lidarCap: 30000,
  },
  balanced: {
    dprCap: 1.25, msaa: 0, shadows: false, bloomLevels: 3, streak: true, dust: 110, terrainSeg: 170, trees: 220,
    cloudSpacing: 0.42, stars: 900, planetSeg: 96, texSize: 512, aniso: 4, preload: false, modelBudget: 3, lidarCap: 80000,
  },
  high: {
    dprCap: 1.75, msaa: 4, shadows: true, bloomLevels: 4, streak: true, dust: 220, terrainSeg: 250, trees: 420,
    cloudSpacing: 0.30, stars: 1800, planetSeg: 160, texSize: 1024, aniso: 8, preload: true, modelBudget: 3, lidarCap: 160000,
  },
};

const make = (tier, reason, override) => Object.freeze({ tier, reason, override, ...KNOBS[tier] });

export const QUALITY_TIERS = Object.freeze({
  lite: make('lite', 'preset', false),
  balanced: make('balanced', 'preset', false),
  high: make('high', 'preset', false),
});

const rank = (t) => TIERS.indexOf(t);
const lower = (t) => TIERS[Math.max(0, rank(t) - 1)];

let lastQ = null;          // the last detectQuality() result (the governor's default q)
let gpuMemo;               // undefined = not probed yet; null = no WebGL at all

/* ---------------------------------------------------------------------------- storage */
function defaultStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
}
function readSaved(store) {
  if (!store) return null;
  try {
    const v = JSON.parse(store.getItem(STORE_KEY));
    if (!v || !TIERS.includes(v.tier)) return null;
    const by = v.by === 'user' ? 'user' : 'governor';     // unknown → treated as a downgrade (expires)
    if (by === 'governor' && !(Date.now() - (Number(v.ts) || 0) < DOWNGRADE_TTL)) { store.removeItem(STORE_KEY); return null; }
    return { tier: v.tier, ts: Number(v.ts) || 0, by };
  } catch (e) { return null; }
}
function writeSaved(store, v) {
  if (!store) return false;
  try { if (v) store.setItem(STORE_KEY, JSON.stringify(v)); else store.removeItem(STORE_KEY); return true; } catch (e) { return false; }
}

/* ------------------------------------------------------------------------------ GPU probe */
function probeGpu(allowContext) {
  if (gpuMemo !== undefined) return gpuMemo;
  try {
    const cached = sessionStorage.getItem(GPU_KEY);
    if (cached) return (gpuMemo = JSON.parse(cached));
  } catch (e) { /* no sessionStorage */ }
  if (!allowContext || typeof document === 'undefined') return undefined;
  let gl = null, info = null;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const attrs = { antialias: false, depth: false, stencil: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false };
    gl = c.getContext('webgl2', attrs);
    const webgl2 = !!gl;
    if (!gl) gl = c.getContext('webgl', attrs) || c.getContext('experimental-webgl', attrs);
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      info = {
        webgl2,
        maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE) | 0,
        renderer: String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || ''),
        vendor: String((ext && gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)) || gl.getParameter(gl.VENDOR) || ''),
      };
    }
  } catch (e) { info = null; }
  finally {
    try { gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch (e) { /* already gone */ }
  }
  gpuMemo = info;
  try { sessionStorage.setItem(GPU_KEY, JSON.stringify(info)); } catch (e) { /* fine */ }
  return info;
}

/* ------------------------------------------------------------------------ classification */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|lavapipe|microsoft basic render|basic render driver|software rasterizer|mesa offscreen/i;
const OLD_MALI = /mali-?(?:4\d\d|t\d+|g3\d{1,2}|g5\d{1,2}|g7[12])\b/i;
const POWERVR = /powervr|\bsgx\b|rogue|imagination/i;
const OLD_INTEL = /intel.*(?:hd graphics [2-4]\d{3}\b|gma)|videocore/i;
const STRONG_DESKTOP = /geforce (?:gtx (?:9[6-9]0|10[6-9]0|16[5-9]0)|rtx)|quadro (?:rtx|p[3-6]\d{3})|nvidia (?:rtx|a\d{2,4}\b|l\d{1,2}\b|titan)|rtx a\d{3,4}|titan|radeon (?:rx ?(?:[5-9]\d{2,3}|vega)|pro (?:w|vega)|vii)|intel.*arc|\barc\(tm\)|apple m\d/i;
const DISCRETE = /geforce|quadro|nvidia|radeon (?:rx|pro)|\barc\b|arc\(tm\)/i;
const STRONG_MOBILE = /immortalis/i;
// iPhones on A16 or later (14 Pro / 15 / 16 / 17 and Air families), by their CSS screen size
const IPHONE_A16_PLUS = [[393, 852], [430, 932], [402, 874], [440, 956], [420, 912]];

function adrenoNumber(r) {
  const m = /adreno[^0-9x]*(\d{3})/i.exec(r);
  return m ? Number(m[1]) : 0;
}

function mm(q) { try { return matchMedia(q).matches; } catch (e) { return false; } }

/** A short GPU name for the reason string: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 …)" → "NVIDIA GeForce RTX 3060". */
function gpuName(r) {
  let s = r || '';
  const m = /^ANGLE \((.*)\)$/.exec(s);
  if (m) { const parts = m[1].split(', '); s = parts.length > 1 ? parts[1] : parts[0]; }
  s = s.replace(/ANGLE Metal Renderer:\s*/i, '').replace(/\s*(Direct3D\d*|vs_\d|ps_\d|\(0x[0-9a-f]+\)|OpenGL|\/PCIe).*$/i, '').trim();
  return s.slice(0, 48) || 'unknown GPU';
}

/** Auto tier from the device signals. */
function autoTier(allowContext) {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const mem = Number(nav.deviceMemory) || 0;                 // GB, Chromium only (0 = unknown)
  const cores = Number(nav.hardwareConcurrency) || 0;
  const saveData = !!(nav.connection && nav.connection.saveData);
  const coarse = mm('(pointer: coarse)');
  const dpr = (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1;
  const sw = (typeof screen !== 'undefined' && screen.width) || 0, sh = (typeof screen !== 'undefined' && screen.height) || 0;
  const shortSide = Math.min(sw, sh), longSide = Math.max(sw, sh);
  const physPx = sw * sh * dpr * dpr;
  const phone = coarse && shortSide > 0 && shortSide < 600;
  const tablet = coarse && !phone && shortSide < 1200;
  const touchFirst = phone || tablet;
  const gpu = probeGpu(allowContext);
  const r = gpu?.renderer || '';
  const short = gpuName(r);
  const kind = phone ? 'phone' : tablet ? 'tablet' : 'desktop';
  const done = (tier, why) => ({ tier, reason: `auto: ${kind}, ${why}` });

  // hard floors first
  if (saveData) return done('lite', 'data saver on');
  if (gpu === null) return done('lite', 'no WebGL');
  if (gpu && !gpu.webgl2) return done('lite', 'no WebGL 2');
  if (SOFTWARE.test(r)) return done('lite', `software renderer (${(SOFTWARE.exec(r) || [''])[0]})`);
  if (OLD_MALI.test(r) || POWERVR.test(r) || OLD_INTEL.test(r)) return done('lite', `older GPU (${short})`);
  const adreno = adrenoNumber(r);
  if (adreno && adreno < 600) return done('lite', `older GPU (${short})`);
  if (mem && mem <= 2) return done('lite', `${mem} GB memory`);
  if (cores && cores <= 2) return done('lite', `${cores} CPU cores`);
  if (gpu && gpu.maxTex && gpu.maxTex < 4096) return done('lite', `max texture ${gpu.maxTex}`);

  if (touchFirst) {
    // phones and tablets: balanced unless clearly strong
    const appleGpu = /apple/i.test(r) || (!r && /iP(hone|ad|od)/.test(nav.userAgent || ''));
    const strongIphone = phone && appleGpu && IPHONE_A16_PLUS.some(([a, b]) => shortSide === a && longSide === b);
    const strong = adreno >= 700 || STRONG_MOBILE.test(r) || strongIphone;
    if (strong && !(mem && mem <= 4)) return done('high', `strong GPU (${strongIphone ? 'Apple A16-class' : short})`);
    return done('balanced', gpu ? short : 'GPU not probed');
  }

  // desktops and laptops
  if ((mem && mem <= 4) || (cores && cores <= 4)) return done('balanced', `${mem ? mem + ' GB, ' : ''}${cores || '?'} cores`);
  let tier, why;
  if (STRONG_DESKTOP.test(r)) { tier = 'high'; why = `strong GPU (${short})`; }
  else if (/^apple gpu$/i.test(r) || /apple gpu/i.test(r)) { tier = cores >= 8 ? 'high' : 'balanced'; why = `Apple GPU, ${cores || '?'} cores`; }
  else if (/intel|radeon\(tm\) graphics|radeon graphics|vega \d|mali|adreno|powervr/i.test(r)) { tier = 'balanced'; why = `integrated GPU (${short})`; }
  else if (!r) { tier = cores >= 8 ? 'high' : 'balanced'; why = `GPU not probed, ${cores || '?'} cores`; }
  else { tier = cores >= 8 ? 'high' : 'balanced'; why = `GPU ${short}, ${cores || '?'} cores`; }
  // a very large screen (4K / 5K at 2×) wants a discrete GPU for the high tier
  if (tier === 'high' && physPx > 9e6 && !DISCRETE.test(r)) { tier = 'balanced'; why += ', very high-res screen'; }
  return done(tier, why);
}

/* ------------------------------------------------------------------------------- public */
export function detectQuality(opts = {}) {
  const search = opts.search ?? (typeof location !== 'undefined' ? location.search : '');
  const store = opts.storage === undefined ? defaultStorage() : opts.storage;
  const allowContext = opts.probe !== false;
  let qp = null;
  try { qp = new URLSearchParams(search).get('q'); } catch (e) { /* no URL */ }
  qp = qp ? qp.toLowerCase() : qp;

  let result;
  if (TIERS.includes(qp)) {
    result = make(qp, `forced by ?q=${qp}`, true);
  } else {
    const saved = qp === 'auto' ? null : readSaved(store);
    if (saved && saved.by === 'user') {
      result = make(saved.tier, `your choice (${LABEL[saved.tier]})`, true);
    } else {
      const auto = autoTier(allowContext);
      if (saved && saved.by === 'governor' && rank(saved.tier) < rank(auto.tier)) {
        const days = Math.max(0, Math.round((Date.now() - saved.ts) / 86400000));
        result = make(saved.tier, `${auto.reason}; stepped down to ${LABEL[saved.tier]} after slow frames ${days ? days + ' d' : 'earlier today'}`, false);
      } else {
        result = make(auto.tier, auto.reason + (qp === 'auto' ? ' (?q=auto)' : ''), false);
      }
    }
  }
  lastQ = result;
  return result;
}

export function setQualityOverride(tierOrAuto) {
  const t = String(tierOrAuto || '').toLowerCase();
  const store = defaultStorage();
  if (t === 'auto') return writeSaved(store, null);
  if (!TIERS.includes(t)) return false;
  return writeSaved(store, { tier: t, ts: Date.now(), by: 'user' });
}

export function qualityBadge(q) {
  const tier = q && TIERS.includes(q.tier) ? q.tier : 'balanced';
  if (q && q.override) return `Quality set by you · ${LABEL[tier]}`;
  return {
    lite: 'Light and fast on this device · Lite',
    balanced: 'Smooth on this device · Balanced',
    high: 'Full detail on this device · High',
  }[tier];
}

/* ----------------------------------------------------------------------------- governor */
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
function percentile(arr, p) {
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1) + 0.5)))];
}

export function startGovernor({ renderer, getDpr, setDpr, onStep, cap, floor = 0.75, q, canApply, upAfterDown = true, maxSteps = Infinity } = {}) {
  // canApply(): optional gate. A step (a pixel-ratio change re-allocates the post targets; a visible
  // hitch) is only taken while it returns true, e.g. while the film rests between moves; until then
  // the decision waits. upAfterDown: false = once stepped down, never step back up this session (no
  // oscillation between two pixel ratios).
  const gate = canApply || (() => true);
  let wentDown = false, pendingSlow = 0, steps = 0;
  const get = getDpr || (() => (renderer && renderer.getPixelRatio ? renderer.getPixelRatio() : 1));
  const set = setDpr || ((v) => { if (renderer && renderer.setPixelRatio) renderer.setPixelRatio(v); });
  const step = onStep || (() => false);
  const CAP = cap ?? get();
  const FLOOR = Math.min(floor, CAP);
  const WINDOW = 2000, SLOW = 22, FAST = 12, WARMUP = 3000, AFTER_HIDDEN = 1000, SAVE_AFTER = 10000, SETTLE = 400;
  const EPS = 1e-3;

  let ignoreUntil = now() + WARMUP;
  let win = [], winStart = 0;
  let fastSince = 0;            // start of the current run of fast windows (0 = none)
  let floorSince = 0;           // when the pixel ratio reached the floor (0 = not there)
  let upWait = 10000;           // sustained-fast time needed for a step up (doubles after a bounce)
  let lastUpAt = -Infinity;
  let streakOff = false, bloomDone = false, saved = false, stopped = false;
  const log = [];

  const reset = () => { win = []; winStart = 0; };
  const onVis = () => {
    reset(); fastSince = 0;
    if (!document.hidden) ignoreUntil = Math.max(ignoreUntil, now() + AFTER_HIDDEN);
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);

  const record = (what, extra) => { log.push({ t: Math.round(now()), what, ...extra }); if (log.length > 40) log.shift(); };

  function evaluate(p75, locked, t) {
    const dpr = get();
    // not now (e.g. mid-move): remember a slow window and act on it at the next rest
    if (!gate()) { if (p75 > SLOW) { fastSince = 0; pendingSlow = Math.max(pendingSlow, p75); } return; }
    if (pendingSlow) { p75 = Math.max(p75, pendingSlow); locked = false; pendingSlow = 0; }
    if (p75 > SLOW) {
      wentDown = true;
      fastSince = 0;
      if (t - lastUpAt < WINDOW * 3) upWait = Math.min(upWait * 2, 80000);   // bounced straight back: wait longer next time
      if (dpr > FLOOR + EPS) {
        const v = Math.max(FLOOR, Math.round(dpr * 0.85 * 100) / 100);
        set(v); record('dpr-down', { dpr: v, p75 });
        ignoreUntil = t + SETTLE;
        if (++steps >= maxSteps) stopped = true;   // (the film: one quiet step at a rest, then never again)
      } else if (!streakOff) {
        streakOff = true; step('streak-off'); record('streak-off', { p75 });
      } else if (!bloomDone) {
        if (step('bloom-down') === false) bloomDone = true; else record('bloom-down', { p75 });
      }
    } else if (p75 < FAST || locked) {
      if (!fastSince) fastSince = t - WINDOW;     // this window already counts
      if (t - fastSince >= upWait && dpr < CAP - EPS && (upAfterDown || !wentDown)) {
        const v = Math.min(CAP, Math.round((dpr / 0.85) * 100) / 100);
        set(v); record('dpr-up', { dpr: v, p75 });
        lastUpAt = t; fastSince = 0;
        ignoreUntil = t + SETTLE;
      }
    } else {
      fastSince = 0;
    }
    // at the floor and still not fast for 10 s: the next load starts one tier lower
    const atFloor = get() <= FLOOR + EPS;
    if (!atFloor) floorSince = 0;
    else if (!floorSince) floorSince = t;
    if (atFloor && !saved && !(p75 < FAST || locked) && t - floorSince >= SAVE_AFTER) {
      saved = true;
      const qq = q || lastQ;
      if (qq && !qq.override && qq.tier !== 'lite') {
        const store = defaultStorage();
        const cur = readSaved(store);
        if (!(cur && cur.by === 'user')) {
          writeSaved(store, { tier: lower(qq.tier), ts: Date.now(), by: 'governor' });
          record('saved-downgrade', { tier: lower(qq.tier) });
        }
      }
    }
  }

  function frame(dtMs) {
    if (stopped || (typeof document !== 'undefined' && document.hidden)) return;
    const t = now();
    if (!(dtMs > 0) || dtMs > 1000) { reset(); return; }   // a stall or a pause: start the window over
    if (t < ignoreUntil) return;
    if (!winStart) winStart = t;
    win.push(dtMs);
    if (t - winStart < WINDOW || win.length < 8) return;
    const p75 = percentile(win, 0.75), p10 = percentile(win, 0.1);
    // locked to the display: every frame at the refresh interval (no drops), at 57 Hz or faster
    const locked = p10 <= 17.6 && p75 <= p10 * 1.15;
    reset();
    evaluate(p75, locked, t);
  }

  function stop() {
    stopped = true;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
  }

  const state = () => ({ dpr: get(), cap: CAP, floor: FLOOR, streakOff, bloomDone, saved, upWait, log: log.slice() });
  return { frame, stop, state };
}
