/* Device quality tier for Home's "Runs smoothly on this device" badge and the film prefetch.
   Ported from drafts/film-fly-gear/showcase-v2/js/quality.js (detection and the badge only; the frame
   governor and the per-tier render knobs belong to the 3D pages). Same storage keys ('uh-quality',
   sessionStorage 'uh-gpu') and the same ?q= override, so the site and the 3D pages agree. */
/* eslint-disable */

export type Tier = 'lite' | 'balanced' | 'high';
export type Quality = Readonly<{ tier: Tier; reason: string; override: boolean }>;
type Gpu = { webgl2: boolean; maxTex: number; renderer: string; vendor: string };

const TIERS: Tier[] = ['lite', 'balanced', 'high'];
const LABEL: Record<Tier, string> = { lite: 'Lite', balanced: 'Balanced', high: 'High' };
const STORE_KEY = 'uh-quality';
const GPU_KEY = 'uh-gpu';
const DOWNGRADE_TTL = 7 * 24 * 3600 * 1000;


const make = (tier: Tier, reason: string, override: boolean): Quality => Object.freeze({ tier, reason, override });


const rank = (t: Tier) => TIERS.indexOf(t);

let gpuMemo: Gpu | null | undefined; // undefined = not probed yet; null = no WebGL at all

/* ---------------------------------------------------------------------------- storage */
function defaultStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
}
function readSaved(store: Storage | null): { tier: Tier; ts: number; by: 'user' | 'governor' } | null {
  if (!store) return null;
  try {
    const v = JSON.parse(store.getItem(STORE_KEY) || 'null');
    if (!v || !TIERS.includes(v.tier)) return null;
    const by = v.by === 'user' ? 'user' : 'governor';     // unknown → treated as a downgrade (expires)
    if (by === 'governor' && !(Date.now() - (Number(v.ts) || 0) < DOWNGRADE_TTL)) { store.removeItem(STORE_KEY); return null; }
    return { tier: v.tier, ts: Number(v.ts) || 0, by };
  } catch (e) { return null; }
}

/* ------------------------------------------------------------------------------ GPU probe */
function probeGpu(allowContext: boolean): Gpu | null | undefined {
  if (gpuMemo !== undefined) return gpuMemo;
  try {
    const cached = sessionStorage.getItem(GPU_KEY);
    if (cached) return (gpuMemo = JSON.parse(cached));
  } catch (e) { /* no sessionStorage */ }
  if (!allowContext || typeof document === 'undefined') return undefined;
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  let info: Gpu | null = null;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const attrs: WebGLContextAttributes = { antialias: false, depth: false, stencil: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false };
    gl = c.getContext('webgl2', attrs) as WebGL2RenderingContext | null;
    const webgl2 = !!gl;
    if (!gl) gl = (c.getContext('webgl', attrs) || c.getContext('experimental-webgl', attrs)) as WebGLRenderingContext | null;
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

function adrenoNumber(r: string) {
  const m = /adreno[^0-9x]*(\d{3})/i.exec(r);
  return m ? Number(m[1]) : 0;
}

function mm(q: string) { try { return matchMedia(q).matches; } catch (e) { return false; } }

/** A short GPU name for the reason string: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 …)" → "NVIDIA GeForce RTX 3060". */
function gpuName(r: string) {
  let s = r || '';
  const m = /^ANGLE \((.*)\)$/.exec(s);
  if (m) { const parts = m[1].split(', '); s = parts.length > 1 ? parts[1] : parts[0]; }
  s = s.replace(/ANGLE Metal Renderer:\s*/i, '').replace(/\s*(Direct3D\d*|vs_\d|ps_\d|\(0x[0-9a-f]+\)|OpenGL|\/PCIe).*$/i, '').trim();
  return s.slice(0, 48) || 'unknown GPU';
}

/** Auto tier from the device signals. */
function autoTier(allowContext: boolean): { tier: Tier; reason: string } {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
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
  const done = (tier: Tier, why: string) => ({ tier, reason: `auto: ${kind}, ${why}` });

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
  let tier: Tier, why: string;
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
export function detectQuality(opts: { search?: string; storage?: Storage | null; probe?: boolean } = {}): Quality {
  const search = opts.search ?? (typeof location !== 'undefined' ? location.search : '');
  const store = opts.storage === undefined ? defaultStorage() : opts.storage;
  const allowContext = opts.probe !== false;
  let qp: string | null = null;
  try { qp = new URLSearchParams(search).get('q'); } catch (e) { /* no URL */ }
  qp = qp ? qp.toLowerCase() : qp;

  let result: Quality;
  if (qp && (TIERS as string[]).includes(qp)) {
    result = make(qp as Tier, `forced by ?q=${qp}`, true);
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
  return result;
}


export function qualityBadge(q: Quality | null): string {
  const tier = q && TIERS.includes(q.tier) ? q.tier : 'balanced';
  if (q && q.override) return `Quality set by you · ${LABEL[tier]}`;
  return {
    lite: 'Light and fast on this device · Lite',
    balanced: 'Smooth on this device · Balanced',
    high: 'Full detail on this device · High',
  }[tier];
}

