// Underhill v2 — the gear playground (gear.html?g=<id>). The page shell: header, picker (a rail grouped
// by category on desktop; a chip carousel and a bottom sheet on phones), routing (?g= and &mode=,
// history.replaceState), Field notes, the model-in-production view ("How the crew uses it"), the
// quality control, and the debug harness. The 3D half (js/gear/view3d.js) is imported the first time
// a gear with a model is shown, so a page for a gear awaiting its model never loads three.js.
//
// URL: ?g=<kit id>  &mode=inspect|operate  ?q=lite|balanced|high|auto  ?day=0|1  ?reduced=1
//      ?debug=1 → window.__gear (select / mode / step / render / act / next / run / bench / programs)
import { detectQuality, setQualityOverride, qualityBadge } from '../quality.js';
import { mountHeader } from '../header.js';
import { wireDaylightToggle } from '../theme.js';
import { KIT, CATEGORIES, GEAR_ICONS, gearPhotoSrc, serviceUrl } from '../kit-data.js';
import { gearEntry, GEAR_IDS, READY_IDS } from './registry.js';
import { missionFor } from './missions.js';
import { factsFor } from './facts.js';
import { diagramSvg } from './diagrams.js';

const qs = new URLSearchParams(location.search);
const DEBUG = qs.get('debug') === '1';
const REDUCED = qs.has('reduced') ? qs.get('reduced') !== '0' : matchMedia('(prefers-reduced-motion: reduce)').matches;
const Q = detectQuality();
document.documentElement.dataset.quality = Q.tier;
if (REDUCED) document.body.classList.add('is-reduced');
const MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 520;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GROUPS = [['core', 'Core'], ['reality-capture', 'Reality capture'], ['water', 'Water'], ['precision', 'Precision'], ['extras', 'Extras']];
const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
if (DEBUG) {
  window.__gearErrors = [];
  addEventListener('error', (e) => window.__gearErrors.push(String(e.message || e)));
  addEventListener('unhandledrejection', (e) => window.__gearErrors.push(String(e.reason?.message || e.reason)));
  const ce = console.error.bind(console);
  console.error = (...a) => { window.__gearErrors.push(a.map(String).join(' ')); ce(...a); };
}

/* ----------------------------------------------------------------------------- header */
const header = mountHeader($('uh-header'), {
  home: '/',
  links: [
    { label: 'Experience', href: './film.html' },
    { label: 'Fly', href: './fly.html' },
    { label: 'The Kit', href: './gear.html' },
  ],
  join: false, progress: false,
  foot: 'The Kit · Underhill Geomatics',
});
{
  const box = header.head?.querySelector('.container');
  const title = document.createElement('span'); title.className = 'gx-htitle'; title.innerHTML = 'The Kit <b>playground</b>';
  box?.querySelector('.logo')?.after(title);
  for (const a of header.head?.querySelectorAll('#nav-list a, #mnav-list a') || []) if (a.getAttribute('href') === './gear.html') a.setAttribute('aria-current', 'page');
  const more = document.createElement('button'); more.type = 'button'; more.className = 'gx-more'; more.id = 'btn-settings';
  more.setAttribute('aria-label', 'Settings'); more.setAttribute('aria-expanded', 'false'); more.setAttribute('aria-controls', 'settings');
  more.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/></svg>';
  box?.querySelector('.daylight')?.after(more);
}
let view = null;            // View3D, once loaded
wireDaylightToggle(header.daylight, (isDay, { initial }) => { view?.studio.setDay(isDay, { instant: initial || REDUCED }); if (view) view.dirty = true; });

/* --------------------------------------------------------------------------- settings */
{
  const panel = $('settings'), btn = $('btn-settings');
  const LABEL = { lite: 'Lite', balanced: 'Balanced', high: 'High' };
  const fromUrl = /^forced by \?q=/.test(Q.reason);
  const current = Q.override ? Q.tier : 'auto';
  panel.querySelector('[data-now]').textContent = qualityBadge(Q);
  panel.querySelector('[data-why]').textContent = fromUrl ? `Set by ?q=${Q.tier} in the address` : Q.reason.replace(/^auto: /, 'Auto: ');
  for (const input of panel.querySelectorAll('input[name="gq"]')) {
    input.checked = input.value === current;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      setQualityOverride(input.value);
      const url = new URL(location.href); url.searchParams.delete('q'); location.replace(url.href);
    });
  }
  panel.querySelector('[data-tier]').textContent = LABEL[Q.tier];
  let open = false;
  const set = (on) => { open = on; panel.hidden = !on; btn?.setAttribute('aria-expanded', String(on)); if (on) panel.querySelector('input:checked')?.focus({ preventScroll: true }); };
  btn?.addEventListener('click', () => set(!open));
  panel.querySelector('[data-close]').addEventListener('click', () => set(false));
  addEventListener('keydown', (e) => { if (open && e.key === 'Escape') { set(false); btn?.focus(); } });
  addEventListener('pointerdown', (e) => { if (open && !panel.contains(e.target) && !btn?.contains(e.target)) set(false); }, true);
}

/* ----------------------------------------------------------------------------- picker */
const thumb = (k) => {
  const src = gearPhotoSrc(k);
  return src ? `<img src="${esc(src)}" alt="" width="96" height="72" decoding="async">`
    : `<svg viewBox="0 0 24 24" aria-hidden="true">${GEAR_ICONS[k.icon] || ''}</svg>`;
};
const statusChip = (ready) => (ready ? '<span class="pk-st is-ready">3D ready</span>' : '<span class="pk-st">Model in production</span>');
function buildPicker() {
  const list = $('rail-list');
  list.innerHTML = GROUPS.map(([g, label]) => {
    const items = KIT.filter((k) => k.group === g);
    if (!items.length) return '';
    return `<section class="pk-group" aria-labelledby="pk-${g}"><h2 class="pk-group__t" id="pk-${g}">${label}</h2><ul>${items.map((k) => {
      const ready = gearEntry(k.id).ready;
      return `<li><a class="pk${ready ? ' is-ready' : ''}" href="?g=${encodeURIComponent(k.id)}" data-id="${esc(k.id)}">
        <span class="pk__thumb${gearPhotoSrc(k) ? ' has-photo' : ''}">${thumb(k)}</span>
        <span class="pk__body"><span class="pk__name">${esc(k.short)}</span><span class="pk__meta">${esc(CATEGORIES[k.category] || k.category)}</span>${statusChip(ready)}</span>
      </a></li>`;
    }).join('')}</ul></section>`;
  }).join('');
  $('rail-count').textContent = String(KIT.length);
  const strip = $('strip-list');
  strip.innerHTML = KIT.map((k) => {
    const ready = gearEntry(k.id).ready;
    return `<li><a class="sc${ready ? ' is-ready' : ''}" href="?g=${encodeURIComponent(k.id)}" data-id="${esc(k.id)}" aria-label="${esc(k.name)}: ${ready ? '3D ready' : 'model in production'}">
      <span class="sc__thumb">${thumb(k)}</span><span class="sc__name">${esc(k.short)}</span><span class="sc__st">${ready ? '3D' : 'Soon'}</span></a></li>`;
  }).join('');
  for (const a of document.querySelectorAll('.pk, .sc')) {
    a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      setSheet(false);
      select(a.dataset.id);
    });
  }
}

let sheetOpen = false;
function setSheet(on) {
  sheetOpen = !!on;
  document.body.classList.toggle('is-sheet', sheetOpen);
  $('rail').setAttribute('aria-hidden', String(!sheetOpen && isPhoneLayout()));
  if (sheetOpen) $('rail').querySelector('.pk[aria-current="true"]')?.focus({ preventScroll: false });
  view && (view.dirty = true);
}
const isPhoneLayout = () => innerWidth < 1080;
$('btn-all').addEventListener('click', () => setSheet(true));
$('rail-close').addEventListener('click', () => setSheet(false));
$('scrim').addEventListener('click', () => { setSheet(false); if (isPhoneLayout()) { document.body.classList.remove('is-notes'); view?.layout(); } });
$('gear-name').addEventListener('click', () => { if (isPhoneLayout()) setSheet(!sheetOpen); else $('rail').querySelector('.pk[aria-current="true"]')?.focus(); });
addEventListener('keydown', (e) => { if (sheetOpen && e.key === 'Escape') setSheet(false); });

/* ------------------------------------------------------------------------- field notes */
function notesHtml(kit, { heading = true } = {}) {
  const f = factsFor(kit.id) || { what: kit.line, specs: [] };
  return `
    ${heading ? `<p class="nt__kick">Field notes</p><h2 class="nt__title">${esc(kit.name)}</h2>` : ''}
    <p class="nt__what">${esc(f.what)}</p>
    <dl class="nt__specs">${f.specs.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    <p class="nt__svc"><span>Underhill service</span><a href="${esc(serviceUrl(kit))}" target="_blank" rel="noopener">${esc(kit.service.label)} ${ARROW}</a></p>
    ${f.project ? `<p class="nt__proj"><span>Underhill uses it at…</span>${esc(f.project.text)} <a href="${esc(f.project.href)}" target="_blank" rel="noopener">${esc(f.project.label)}</a></p>` : ''}
    ${f.assumed ? `<p class="nt__note">${esc(f.assumed)}</p>` : ''}`;
}

/* -------------------------------------------------------------------- awaiting a model */
function awaitHtml(kit, i) {
  const m = missionFor(kit.id);
  const photo = gearPhotoSrc(kit);
  const media = photo
    ? `<img src="${esc(photo)}" alt="${esc(kit.name)}" width="1200" height="900" decoding="async">`
    : `<div class="bp" role="img" aria-label="${esc(kit.name)}: drawing, photo to come">
        <span class="bp__fig" aria-hidden="true">Fig. ${String(i + 1).padStart(2, '0')}</span><span class="bp__id" aria-hidden="true">${esc(kit.id)}</span>
        <svg class="bp__icon" viewBox="0 0 24 24" aria-hidden="true">${GEAR_ICONS[kit.icon] || ''}</svg>
        <span class="bp__note" aria-hidden="true">Model in production</span><span class="bp__scale" aria-hidden="true"><i></i>0.5 m</span></div>`;
  const others = READY_IDS.map((id) => KIT.find((k) => k.id === id)).filter(Boolean);
  return `
    <div class="aw__head">
      <p class="aw__kick">${esc(CATEGORIES[kit.category] || kit.category)} · ${esc(GROUPS.find(([g]) => g === kit.group)?.[1] || '')}</p>
      <h1 class="aw__title">${esc(kit.name)}</h1>
      <p class="aw__status"><i aria-hidden="true"></i>3D model in production — coming soon</p>
      <p class="aw__line">${esc(kit.line)}</p>
    </div>
    <div class="aw__grid">
      <figure class="aw__media">${media}<figcaption>${photo ? 'Photo stand-in until the gear references arrive' : 'Blueprint placeholder · photo and 3D model to come'}</figcaption></figure>
      <section class="aw__notes nt" aria-label="Field notes">${notesHtml(kit, { heading: false })}</section>
    </div>
    ${m ? `<section class="aw__how" aria-labelledby="aw-how">
      <p class="aw__kick">How the crew uses it</p>
      <h2 class="aw__h2" id="aw-how">${esc(m.title)}</h2>
      <p class="aw__sum">${esc(m.summary)} The interactive version switches on when the model lands.</p>
      <ol class="aw__steps">${m.steps.map((s, k) => `<li class="aw-step">
        <div class="aw-step__dia">${diagramSvg(s.diagram)}</div>
        <div class="aw-step__txt"><span class="aw-step__n">${String(k + 1).padStart(2, '0')}</span><h3>${esc(s.title)}</h3><p>${esc(s.instruction)}</p><p class="aw-step__crew"><b>What the crew does</b> ${esc(s.crewNote)}</p></div>
      </li>`).join('')}</ol>
    </section>` : ''}
    <section class="aw__try" aria-label="Gear with a 3D model">
      <p class="aw__kick">Try one that's ready</p>
      <div class="aw__tryrow">${others.map((k) => `<a class="aw-try" href="?g=${encodeURIComponent(k.id)}" data-id="${esc(k.id)}"><span class="pk__thumb"><svg viewBox="0 0 24 24" aria-hidden="true">${GEAR_ICONS[k.icon] || ''}</svg></span><span>${esc(k.short)}</span>${ARROW}</a>`).join('')}</div>
    </section>`;
}

/* --------------------------------------------------------------------------- safe area */
/** The part of the stage not covered by the page's overlays (the camera centres on it). */
function safeArea(stageRect) {
  const r = stageRect;
  let top = 0, bottom = r.height, left = 0, right = r.width;
  for (const el of document.querySelectorAll('[data-cover]')) {
    if (el.hidden || el.offsetParent === null || getComputedStyle(el).visibility === 'hidden') continue;
    const b = el.getBoundingClientRect();
    if (b.width < 2 || b.height < 2) continue;
    if (b.right <= r.left + 1 || b.left >= r.right - 1 || b.bottom <= r.top + 1 || b.top >= r.bottom - 1) continue;   // not over the stage
    const side = el.dataset.cover === 'auto' ? (b.width > r.width * 0.55 ? 'bottom' : b.left + b.width / 2 > r.left + r.width / 2 ? 'right' : 'left') : el.dataset.cover;
    if (side === 'top') top = Math.max(top, b.bottom - r.top);
    else if (side === 'bottom') bottom = Math.min(bottom, b.top - r.top);
    else if (side === 'left') left = Math.max(left, b.right - r.left);
    else if (side === 'right') right = Math.min(right, b.left - r.left);
  }
  const h = Math.max(80, bottom - top), w = Math.max(80, right - left);
  return { x: left, y: top, w, h };
}

/* --------------------------------------------------------------------------- selection */
let current = null;          // registry gear
let mode = 'inspect';
let viewModule = null;
function setUrl() {
  const u = new URL(location.href);
  u.searchParams.set('g', current.id);
  if (mode === 'operate') u.searchParams.set('mode', 'operate'); else u.searchParams.delete('mode');
  history.replaceState(null, '', u.pathname + u.search + u.hash);
}

async function ensureView() {
  if (view) return view;
  viewModule ||= await import('./view3d.js');
  try {
    view = new viewModule.View3D({
      stage: $('stage'), canvas: $('gx-canvas'), labels: $('labels'), leaders: $('leaders'), tags: $('tags'),
      pip: $('pip'), loader: $('loader'), mission: $('mission'),
    }, {
      Q, mobile: MOBILE, reduced: REDUCED, debug: DEBUG,
      mission: (id) => missionFor(id),
      safeArea,
      onStage: (t) => { $('loader-t').textContent = t || ''; },
      onMode: (m) => setModeUi(m),
      onMission: (st) => { document.body.classList.toggle('is-result', !!st.finished); },
      onTryAnother: () => tryAnother(),
      onExplode: (t) => { $('explode').value = String(Math.round(t * 100)); $('btn-explode').setAttribute('aria-pressed', String(t > 0.5)); },
      onLabelsChange: () => renderChips(),
    });
  } catch (err) {
    console.warn('[gear] no WebGL 2', err);
    document.body.classList.add('no-webgl');
    throw err;
  }
  view.studio.setDay(document.body.classList.contains('is-day'), { instant: true });
  return view;
}

async function select(id, { mode: wantMode = 'inspect' } = {}) {
  const g = gearEntry(id) || gearEntry(GEAR_IDS[0]);
  current = g;
  mode = 'inspect';
  for (const a of document.querySelectorAll('.pk, .sc')) a.setAttribute('aria-current', String(a.dataset.id === g.id));
  document.querySelector(`.sc[data-id="${CSS.escape(g.id)}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: REDUCED ? 'auto' : 'smooth' });
  $('gear-name-t').textContent = g.kit.short;
  $('gear-name-c').textContent = CATEGORIES[g.kit.category] || '';
  document.title = `${g.kit.name} — The Kit — Underhill Geomatics`;
  document.body.classList.toggle('is-await', !g.ready);
  document.body.classList.toggle('is-ready-gear', g.ready);
  $('notes').innerHTML = notesHtml(g.kit);
  setUrl();
  if (!g.ready) {
    view?.runner.stop();
    view?.stop();
    const aw = $('await');
    aw.innerHTML = awaitHtml(g.kit, KIT.findIndex((k) => k.id === g.id));
    aw.hidden = false;
    aw.scrollTop = 0;
    for (const a of aw.querySelectorAll('.aw-try')) a.addEventListener('click', (e) => { e.preventDefault(); select(a.dataset.id); });
    setModeUi('inspect');
    return;
  }
  $('await').hidden = true;
  setModeUi('inspect');
  try {
    const v = await ensureView();
    v.layout();
    await v.show(g);
    if (current !== g) return;
    renderChips();
    if (wantMode === 'operate') await setMode('operate');
  } catch (err) {
    if (document.body.classList.contains('no-webgl')) showNoWebgl(g);
  }
}

function showNoWebgl(g) {
  const aw = $('await');
  aw.innerHTML = `<div class="aw__head"><h1 class="aw__title">${esc(g.kit.name)}</h1><p class="aw__status"><i aria-hidden="true"></i>This browser cannot draw the 3D model (WebGL 2)</p></div>` + awaitHtml(g.kit, 0).replace(/^[\s\S]*?<div class="aw__grid">/, '<div class="aw__grid">');
  aw.hidden = false;
}

async function setMode(m) {
  if (!current?.ready || !view) return;
  mode = m;
  setUrl();
  await view.setMode(m);
}
function setModeUi(m) {
  mode = m;
  document.body.classList.toggle('is-operate', m === 'operate');
  document.body.classList.toggle('is-inspect', m !== 'operate');
  if (m !== 'operate') document.body.classList.remove('is-result');
  $('tab-inspect').setAttribute('aria-selected', String(m !== 'operate'));
  $('tab-operate').setAttribute('aria-selected', String(m === 'operate'));
  if (current) setUrl();
  view?.layout();
}
$('tab-inspect').addEventListener('click', () => setMode('inspect'));
$('tab-operate').addEventListener('click', () => setMode('operate'));

function tryAnother() {
  if (isPhoneLayout()) { setMode('inspect'); setSheet(true); return; }
  const i = READY_IDS.indexOf(current?.id);
  select(READY_IDS[(i + 1) % READY_IDS.length]);
}

/* ------------------------------------------------------------------------ inspect tools */
$('explode').addEventListener('input', (e) => view?.setExplode(Number(e.target.value) / 100));
$('btn-explode').addEventListener('click', () => {
  if (!view) return;
  const to = view.explode > 0.5 ? 0 : 1;
  view.setExplode(to, { animate: true });
  if (REDUCED) { $('explode').value = String(to * 100); $('btn-explode').setAttribute('aria-pressed', String(to > 0.5)); }
});
$('btn-labels').addEventListener('click', () => {
  if (!view) return;
  view.labelsOn = !view.labelsOn;
  $('btn-labels').setAttribute('aria-pressed', String(view.labelsOn));
  document.body.classList.toggle('no-labels', !view.labelsOn);
  view.dirty = true;
});
$('btn-notes').addEventListener('click', () => {
  const on = !document.body.classList.contains('is-notes');
  document.body.classList.toggle('is-notes', on);
  $('btn-notes').setAttribute('aria-expanded', String(on));
  view?.layout();
});
$('notes-close').addEventListener('click', () => { document.body.classList.remove('is-notes'); $('btn-notes').setAttribute('aria-expanded', 'false'); view?.layout(); });
$('btn-reset').addEventListener('click', () => { view?.orbit.reset(); if (view) view.dirty = true; });

/** Phones: a chip per label; three dots show at a time (the chip's page), a tap names the part. */
function renderChips() {
  const box = $('chips');
  if (!view?.entry || mode !== 'inspect') { box.innerHTML = ''; return; }
  const L = view.entry.labels;
  box.innerHTML = L.map((l, i) => `<button type="button" class="chip${view.labels.highlight === l.id ? ' is-on' : ''}${Math.floor(i / 3) === view.labelPage ? ' is-page' : ''}" data-id="${esc(l.id)}"><b>${i + 1}</b>${esc(l.short || l.text)}</button>`).join('');
  for (const b of box.querySelectorAll('.chip')) b.addEventListener('click', () => { view.showLabel(b.dataset.id); renderChips(); });
}

/* -------------------------------------------------------------------------------- boot */
buildPicker();
if (innerWidth >= 1080) { document.body.classList.add('is-notes'); $('btn-notes').setAttribute('aria-expanded', 'true'); }
const startId = GEAR_IDS.includes(qs.get('g')) ? qs.get('g') : (READY_IDS[0] || GEAR_IDS[0]);
const ready = select(startId, { mode: qs.get('mode') === 'operate' ? 'operate' : 'inspect' });
addEventListener('resize', () => { if (!isPhoneLayout() && sheetOpen) setSheet(false); });

/* --------------------------------------------------------------------------- debug harness */
if (DEBUG) {
  const wait = async (fn, max = 400) => { for (let i = 0; i < max && !fn(); i++) view.step(0.05); return fn(); };
  window.__gear = {
    Q, ready,
    get view() { return view; },
    select: (id, o) => select(id, o),
    mode: (m) => setMode(m),
    step: (dt = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) view?.step(dt); return view?.runner.state(); },
    render: () => { view?.layout(); view?.renderNow(); },
    act: () => view?.runner.act(),
    next: () => view?.runner.next(),
    state: () => ({ gear: current?.id, mode, mission: view?.runner.state(), programs: view?.studio.programs() }),
    programs: () => view?.studio.programs(),
    setDay: (on) => { document.body.classList.toggle('is-day', !!on); view?.studio.setDay(!!on, { instant: true }); if (view) view.dirty = true; },
    explode: (t) => { view?.setExplode(t); view?.step(0); },
    bench: (n) => view?.bench(n),
    errors: () => window.__gearErrors.slice(),
    /** Play a ready gear's mission end to end with synthetic input; returns a step log. */
    run: async (id) => {
      await select(id);
      view.step(0.05);
      const p0 = view.studio.programs();
      await setMode('operate');
      const log = [];
      const run = view.runner;
      for (let guard = 0; guard < 12 && !run.finished; guard++) {
        const st = run.state();
        const t0 = run.t;
        run.act();
        await wait(() => run.done);
        log.push({ step: st.id, done: run.done, simS: +(run.t - t0).toFixed(2), programs: view.studio.programs(), text: $('mission').querySelector('.mc__ins')?.textContent.trim() });
        run.next();
        view.step(0.05);
      }
      const p1 = view.studio.programs();
      return { id, finished: run.finished, programsBefore: p0, programsAfter: p1, steps: log, result: run.resultData, errors: window.__gearErrors.slice() };
    },
  };
}
