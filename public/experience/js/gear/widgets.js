// Underhill v2 — gear playground: the small interactive instruments inside a mission's step card.
// Plain DOM / SVG, no three.js. Every widget returns { el, kind, …api } and accepts pointer, touch and
// keyboard input; drags use pointer capture. Sizes come from CSS (css/gear.css, .gw-*).
//
//   vial()      circular level vial: drag the bubble into the ring          { x, y } px from centre
//   dials()     electronic bubble + two foot-screw dials (A·B and C)         { x, y } arc-seconds
//   plummet()   the video plummet: drag the nail into the crosshair          onDrag(dx, dz) metres
//   skyplot()   satellites, fix state, precision; set(k) 0..1
//   hold()      press-and-hold button with a ring; update(dt) fills it
//   bullseye()  stake-out view: rover dot, arrow, auto zoom                  onDrag(dx, dz) metres
//   readout()   rows of key / value (aim readouts, compute table, tracking) with an optional button
//   taps()      a chip per target (tap here or on the model)
//   swipe()     drag up a track to push something home                      0..1
//   rotate()    drag round a ring; one full turn                             degrees turned
//   grid()      mini map: drag a box over the parcel, altitude and overlap chips
import { CP01 } from './studio.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

/** Relative drag on an element: fn({ dx, dy, x, y, type }) with pointer capture. */
function dragOn(el, fn) {
  let id = null, lx = 0, ly = 0;
  el.addEventListener('pointerdown', (e) => {
    if (id !== null) return;
    id = e.pointerId; lx = e.clientX; ly = e.clientY;
    try { el.setPointerCapture(id); } catch (err) { /* synthetic */ }
    const r = el.getBoundingClientRect();
    fn({ type: 'down', dx: 0, dy: 0, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height });
    e.preventDefault();
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const r = el.getBoundingClientRect();
    fn({ type: 'move', dx: e.clientX - lx, dy: e.clientY - ly, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height });
    lx = e.clientX; ly = e.clientY;
  });
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    const r = el.getBoundingClientRect();
    fn({ type: 'up', dx: 0, dy: 0, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height });
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.style.touchAction = 'none';
}
function keys(el, map) {
  el.tabIndex = 0;
  el.addEventListener('keydown', (e) => { const f = map[e.key]; if (f) { e.preventDefault(); f(e); } });
}

/* ------------------------------------------------------------------------------ vial */
export function vial({ label = 'Level vial' } = {}) {
  const el = h('div', 'gw gw-vial');
  const s = svgEl('svg', { viewBox: '-50 -50 100 100', role: 'slider', 'aria-label': label });
  s.append(
    svgEl('circle', { class: 'gw-vial__glass', r: 46 }),
    svgEl('circle', { class: 'gw-vial__ring', r: 13 }),
    svgEl('circle', { class: 'gw-line', r: 30, 'stroke-dasharray': '2 4' }),
    svgEl('path', { class: 'gw-line', d: 'M0 -46v8M0 38v8M-46 0h8M38 0h8' }),
  );
  const bub = svgEl('circle', { class: 'gw-vial__bubble', r: 9.5 });
  const shine = svgEl('circle', { class: 'gw-vial__shine', r: 3, cx: -3, cy: -3 });
  const g = svgEl('g'); g.append(bub, shine);
  s.append(g);
  el.append(s);
  const w = { el, kind: 'vial', x: 0, y: 0, ring: 13, onChange: null, onRelease: null, dragging: false };
  const draw = () => { g.setAttribute('transform', `translate(${w.x.toFixed(2)} ${w.y.toFixed(2)})`); s.setAttribute('aria-valuetext', `${Math.hypot(w.x, w.y).toFixed(0)} from centre`); };
  w.set = (x, y) => { const r = Math.hypot(x, y), m = 36; if (r > m) { x *= m / r; y *= m / r; } w.x = x; w.y = y; draw(); };
  w.dist = () => Math.hypot(w.x, w.y);
  dragOn(s, (e) => {
    const k = 100 / e.w;          // svg units per css px
    if (e.type === 'down') w.dragging = true;
    if (e.type === 'move') { w.set(w.x + e.dx * k, w.y + e.dy * k); w.onChange?.(w.x, w.y, true); }
    if (e.type === 'up') { w.dragging = false; w.onRelease?.(w.x, w.y); }
  });
  keys(s, {
    ArrowLeft: () => { w.set(w.x - 2, w.y); w.onChange?.(w.x, w.y, false); w.onRelease?.(w.x, w.y); },
    ArrowRight: () => { w.set(w.x + 2, w.y); w.onChange?.(w.x, w.y, false); w.onRelease?.(w.x, w.y); },
    ArrowUp: () => { w.set(w.x, w.y - 2); w.onChange?.(w.x, w.y, false); w.onRelease?.(w.x, w.y); },
    ArrowDown: () => { w.set(w.x, w.y + 2); w.onChange?.(w.x, w.y, false); w.onRelease?.(w.x, w.y); },
  });
  draw();
  return w;
}

/* ----------------------------------------------------------------------------- dials */
const arcsec = (v) => { const s = Math.round(Math.abs(v)); const m = Math.floor(s / 60); return `${v < 0 ? '−' : '+'}${m ? m + '′' : ''}${String(s % 60).padStart(m ? 2 : 1, '0')}″`; };
export function dials() {
  const el = h('div', 'gw gw-dials');
  const disp = svgEl('svg', { viewBox: '-50 -50 100 100', class: 'gw-dials__disp', 'aria-hidden': 'true' });
  disp.append(svgEl('circle', { class: 'gw-vial__glass', r: 46 }), svgEl('circle', { class: 'gw-vial__ring', r: 9 }), svgEl('path', { class: 'gw-line', d: 'M0 -46v92M-46 0h92' }));
  const dot = svgEl('circle', { class: 'gw-vial__bubble', r: 6 });
  disp.append(dot);
  const read = h('div', 'gw-dials__read', '<span>X <b data-x></b></span><span>Y <b data-y></b></span>');
  const row = h('div', 'gw-dials__row');
  const mk = (label, axis) => {
    const d = h('div', 'gw-dial');
    d.innerHTML = `<svg viewBox="-30 -30 60 60" aria-hidden="true"><circle class="gw-dial__knob" r="26"/><g class="gw-dial__grip">${Array.from({ length: 16 }, (_, i) => `<path d="M0 -26v7" transform="rotate(${i * 22.5})"/>`).join('')}</g><circle class="gw-dial__cap" r="9"/></svg><span>${label}</span>`;
    d.setAttribute('role', 'slider'); d.setAttribute('aria-label', `Foot screw ${label}`);
    row.append(d);
    return d;
  };
  const dA = mk('A·B', 'x'), dC = mk('C', 'y');
  el.append(disp, read, row);
  const w = { el, kind: 'dials', x: 0, y: 0, turnA: 0, turnC: 0, onChange: null, onRelease: null };
  const draw = () => {
    const k = 40 / 180;
    const px = clamp(w.x * k, -40, 40), py = clamp(-w.y * k, -40, 40);
    dot.setAttribute('cx', px.toFixed(2)); dot.setAttribute('cy', py.toFixed(2));
    read.querySelector('[data-x]').textContent = arcsec(w.x);
    read.querySelector('[data-y]').textContent = arcsec(w.y);
    dA.querySelector('.gw-dial__grip').setAttribute('transform', `rotate(${w.turnA.toFixed(1)})`);
    dC.querySelector('.gw-dial__grip').setAttribute('transform', `rotate(${w.turnC.toFixed(1)})`);
    dA.setAttribute('aria-valuetext', arcsec(w.x)); dC.setAttribute('aria-valuetext', arcsec(w.y));
  };
  w.set = (x, y) => { w.x = x; w.y = y; draw(); };
  const turn = (axis, deg) => {
    // 1° of knob turn moves the bubble 1.1″ (both screws for A·B)
    if (axis === 'x') { w.turnA += deg; w.x -= deg * 1.1; } else { w.turnC += deg; w.y -= deg * 1.1; }
    draw(); w.onChange?.(w.x, w.y);
  };
  for (const [d, axis] of [[dA, 'x'], [dC, 'y']]) {
    dragOn(d, (e) => { if (e.type === 'move') turn(axis, (e.dx - e.dy) * 1.25); if (e.type === 'up') w.onRelease?.(w.x, w.y); });
    keys(d, { ArrowLeft: () => { turn(axis, -6); w.onRelease?.(w.x, w.y); }, ArrowRight: () => { turn(axis, 6); w.onRelease?.(w.x, w.y); }, ArrowDown: () => { turn(axis, -6); w.onRelease?.(w.x, w.y); }, ArrowUp: () => { turn(axis, 6); w.onRelease?.(w.x, w.y); } });
  }
  draw();
  return w;
}

/* --------------------------------------------------------------------------- plummet */
export function plummet() {
  const el = h('div', 'gw gw-plummet');
  const s = svgEl('svg', { viewBox: '-50 -50 100 100', role: 'img', 'aria-label': 'Laser plummet view' });
  s.append(svgEl('circle', { class: 'gw-plummet__bg', r: 46 }));
  const nail = svgEl('g', { class: 'gw-plummet__nail' });
  nail.append(svgEl('circle', { r: 9, class: 'gw-plummet__paint' }), svgEl('circle', { r: 2.6, class: 'gw-plummet__head' }));
  s.append(nail);
  s.append(svgEl('path', { class: 'gw-plummet__cross', d: 'M0 -46v38M0 8v38M-46 0h38M8 0h38' }), svgEl('circle', { class: 'gw-plummet__dot', r: 2 }));
  const scale = h('span', 'gw-plummet__scale', '');
  el.append(s, scale);
  const w = { el, kind: 'plummet', dx: 0.3, dz: 0.2, onDrag: null, onRelease: null };
  w.range = () => clamp(Math.hypot(w.dx, w.dz) * 1.8, 0.02, 0.6);
  w.set = (dx, dz) => {
    // dx, dz = nail minus plumb point (metres); north (−z) is up in the view
    w.dx = dx; w.dz = dz;
    const k = 42 / w.range();
    nail.setAttribute('transform', `translate(${clamp(dx * k, -60, 60).toFixed(2)} ${clamp(dz * k, -60, 60).toFixed(2)})`);
    const d = Math.hypot(dx, dz);
    scale.textContent = d < 0.001 ? 'On the nail' : `${(d * 100).toFixed(d < 0.1 ? 1 : 0)} cm off`;
  };
  dragOn(s, (e) => {
    if (e.type === 'move') { const k = w.range() / (42 * e.w / 100); w.onDrag?.(-e.dx * k, -e.dy * k); }
    if (e.type === 'up') w.onRelease?.();
  });
  keys(s, { ArrowLeft: () => w.onDrag?.(0.005, 0), ArrowRight: () => w.onDrag?.(-0.005, 0), ArrowUp: () => w.onDrag?.(0, 0.005), ArrowDown: () => w.onDrag?.(0, -0.005), Enter: () => w.onRelease?.() });
  w.set(w.dx, w.dz);
  return w;
}

/* --------------------------------------------------------------------------- skyplot */
const CONST = [['GPS', 'gw-c-gps'], ['GLONASS', 'gw-c-glo'], ['Galileo', 'gw-c-gal'], ['BeiDou', 'gw-c-bds']];
export function skyplot({ seed = 7, target = 31 } = {}) {
  const el = h('div', 'gw gw-sky');
  const s = svgEl('svg', { viewBox: '-50 -50 100 100', role: 'img', 'aria-label': 'Satellite sky plot' });
  s.append(svgEl('circle', { class: 'gw-line', r: 46 }), svgEl('circle', { class: 'gw-line', r: 31, 'stroke-dasharray': '2 3' }), svgEl('circle', { class: 'gw-line', r: 15, 'stroke-dasharray': '2 3' }), svgEl('path', { class: 'gw-line', d: 'M0 -46v92M-46 0h92' }));
  const n = svgEl('text', { x: 0, y: -38, class: 'gw-sky__n' }); n.textContent = 'N'; s.append(n);
  let r = seed;
  const rand = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  const sats = [];
  for (let i = 0; i < 36; i++) {
    const az = rand() * Math.PI * 2, elv = 8 + Math.pow(rand(), 0.7) * 80;
    const rad = 46 * (1 - elv / 90);
    const c = CONST[i % 4];
    const g = svgEl('circle', { cx: (Math.sin(az) * rad).toFixed(1), cy: (-Math.cos(az) * rad).toFixed(1), r: 3.1, class: `gw-sky__sat ${c[1]}` });
    g.style.opacity = '0';
    s.append(g);
    sats.push({ g, at: rand() });
  }
  sats.sort((a, b) => a.at - b.at);
  const info = h('div', 'gw-sky__info', '<b data-state>Searching</b><span data-sats>0 sats</span><span data-prec>H — · V —</span>');
  el.append(s, info);
  const w = { el, kind: 'skyplot', k: 0, target, state: 'Searching', h: Infinity, v: Infinity, sats: 0 };
  w.set = (k) => {
    w.k = clamp(k, 0, 1);
    const count = Math.round(target * Math.min(1, w.k / 0.6) ** 0.8);
    sats.forEach((x, i) => { x.g.style.opacity = i < count ? '1' : '0'; });
    let state, H, V;
    if (w.k < 0.18) { state = 'Searching'; H = V = Infinity; }
    else if (w.k < 0.45) { state = 'Autonomous'; H = 2.4 - (w.k - 0.18) * 3; V = H * 1.7; }
    else if (w.k < 0.8) { state = 'RTK float'; const t = (w.k - 0.45) / 0.35; H = 0.32 * (1 - t) + 0.06 * t; V = H * 1.8; }
    else { state = 'RTK fixed'; const t = Math.min(1, (w.k - 0.8) / 0.2); H = 0.022 * (1 - t) + 0.008 * t; V = 0.035 * (1 - t) + 0.015 * t; }
    w.state = state; w.h = H; w.v = V; w.sats = count;
    const fmt = (m) => (!isFinite(m) ? '—' : m >= 1 ? `${m.toFixed(1)} m` : `${(m * 100).toFixed(1)} cm`);
    info.querySelector('[data-state]').textContent = state;
    info.querySelector('[data-sats]').textContent = `${count} sats`;
    info.querySelector('[data-prec]').textContent = `H ${fmt(H)} · V ${fmt(V)}`;
    el.dataset.state = state.startsWith('RTK fixed') ? 'fix' : state.startsWith('RTK') ? 'float' : 'auto';
  };
  w.set(0);
  return w;
}

/* ------------------------------------------------------------------------------ hold */
export function hold({ label = 'Hold to measure', seconds = 1.2 } = {}) {
  const el = h('div', 'gw gw-hold');
  const b = h('button', 'gw-hold__btn');
  b.type = 'button';
  b.innerHTML = `<svg viewBox="-50 -50 100 100" aria-hidden="true"><circle class="gw-hold__track" r="44"/><circle class="gw-hold__fill" r="44" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90)"/></svg><span class="gw-hold__label">${label}</span>`;
  el.append(b);
  const fill = b.querySelector('.gw-hold__fill');
  const w = { el, kind: 'hold', holding: false, progress: 0, seconds, onDone: null, onProgress: null, done: false };
  const set = (v) => { w.progress = clamp(v, 0, 1); fill.setAttribute('stroke-dasharray', `${(w.progress * 100).toFixed(1)} 100`); };
  const down = (e) => { if (w.done) return; w.holding = true; b.classList.add('is-holding'); e?.preventDefault?.(); };
  const up = () => { w.holding = false; b.classList.remove('is-holding'); };
  b.addEventListener('pointerdown', (e) => { try { b.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ } down(e); });
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
  b.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) down(e); });
  b.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') up(); });
  b.addEventListener('contextmenu', (e) => e.preventDefault());
  w.update = (dt) => {
    if (w.done) return;
    if (w.holding) set(w.progress + dt / w.seconds);
    else if (w.progress > 0) set(w.progress - dt * 1.5);
    w.onProgress?.(w.progress, w.holding);
    if (w.progress >= 1) { w.done = true; w.holding = false; b.classList.remove('is-holding'); b.classList.add('is-done'); w.onDone?.(); }
  };
  w.finish = () => { set(1); w.update(0); };
  w.setLabel = (t) => { b.querySelector('.gw-hold__label').textContent = t; };
  return w;
}

/* -------------------------------------------------------------------------- bullseye */
export function bullseye({ name = 'PIN-07' } = {}) {
  const el = h('div', 'gw gw-bull');
  const s = svgEl('svg', { viewBox: '-50 -50 100 100', role: 'img', 'aria-label': `Stake-out view to ${name}` });
  s.append(svgEl('circle', { class: 'gw-line', r: 46 }), svgEl('circle', { class: 'gw-line', r: 23, 'stroke-dasharray': '2 3' }), svgEl('circle', { class: 'gw-bull__tol', r: 4 }), svgEl('path', { class: 'gw-line', d: 'M0 -46v92M-46 0h92' }));
  const nn = svgEl('text', { x: 0, y: -38, class: 'gw-sky__n' }); nn.textContent = 'N'; s.append(nn);
  const arrow = svgEl('line', { class: 'gw-bull__arrow', x1: 0, y1: 0, x2: 0, y2: 0 });
  const dot = svgEl('circle', { class: 'gw-bull__rover', r: 4.5 });
  s.append(arrow, dot);
  const read = h('div', 'gw-bull__read', '<b data-go>—</b><span data-dist>—</span>');
  el.append(s, read);
  const w = { el, kind: 'bullseye', dx: 1, dz: 1, onDrag: null, onRelease: null };
  w.range = () => clamp(Math.hypot(w.dx, w.dz) * 1.6, 0.06, 3);
  w.set = (dx, dz) => {
    // dx, dz = rover minus design point (metres). The view is north-up, centred on the design point.
    w.dx = dx; w.dz = dz;
    const k = 42 / w.range();
    const x = clamp(dx * k, -46, 46), y = clamp(dz * k, -46, 46);
    dot.setAttribute('cx', x.toFixed(2)); dot.setAttribute('cy', y.toFixed(2));
    arrow.setAttribute('x1', x.toFixed(2)); arrow.setAttribute('y1', y.toFixed(2));
    arrow.setAttribute('x2', (x * 0.25).toFixed(2)); arrow.setAttribute('y2', (y * 0.25).toFixed(2));
    const d = Math.hypot(dx, dz);
    const go = [];
    if (Math.abs(dz) >= 0.005) go.push(`${dz > 0 ? 'N' : 'S'} ${Math.abs(dz) < 1 ? (Math.abs(dz) * 100).toFixed(1) + ' cm' : Math.abs(dz).toFixed(2) + ' m'}`);
    if (Math.abs(dx) >= 0.005) go.push(`${dx < 0 ? 'E' : 'W'} ${Math.abs(dx) < 1 ? (Math.abs(dx) * 100).toFixed(1) + ' cm' : Math.abs(dx).toFixed(2) + ' m'}`);
    read.querySelector('[data-go]').textContent = go.length ? `Go ${go.join(' · ')}` : 'On the point';
    read.querySelector('[data-dist]').textContent = d < 1 ? `${(d * 100).toFixed(1)} cm to go` : `${d.toFixed(2)} m to go`;
    el.dataset.heat = d < 0.02 ? 'hot' : d < 0.15 ? 'warm' : d < 0.6 ? 'mild' : 'cold';
  };
  dragOn(s, (e) => {
    if (e.type === 'move') { const k = w.range() / (42 * e.w / 100); w.onDrag?.(e.dx * k, e.dy * k); }
    if (e.type === 'up') w.onRelease?.();
  });
  keys(s, { ArrowLeft: () => { w.onDrag?.(-0.004, 0); w.onRelease?.(); }, ArrowRight: () => { w.onDrag?.(0.004, 0); w.onRelease?.(); }, ArrowUp: () => { w.onDrag?.(0, -0.004); w.onRelease?.(); }, ArrowDown: () => { w.onDrag?.(0, 0.004); w.onRelease?.(); } });
  w.set(w.dx, w.dz);
  return w;
}

/* --------------------------------------------------------------------------- readout */
export function readout({ rows = [], button = null, cls = '' } = {}) {
  const el = h('div', `gw gw-read ${cls}`);
  const dl = h('dl', 'gw-read__rows');
  el.append(dl);
  let btn = null;
  if (button) { btn = h('button', 'gw-read__btn', button); btn.type = 'button'; el.append(btn); }
  const w = { el, kind: 'readout', btn, onButton: null };
  w.rows = (list) => { dl.innerHTML = list.map(([k, v, c]) => `<div${c ? ` class="${c}"` : ''}><dt>${k}</dt><dd>${v}</dd></div>`).join(''); };
  w.enable = (on) => { if (btn) btn.disabled = !on; };
  w.label = (t) => { if (btn) btn.textContent = t; };
  btn?.addEventListener('click', () => w.onButton?.());
  w.rows(rows);
  return w;
}

/* ------------------------------------------------------------------------------ taps */
export function taps({ items = [] } = {}) {
  const el = h('div', 'gw gw-taps');
  const w = { el, kind: 'taps', onTap: null, done: new Set() };
  for (const it of items) {
    const b = h('button', 'gw-taps__chip', `<i aria-hidden="true"></i>${it.label}`);
    b.type = 'button'; b.dataset.id = it.id;
    b.addEventListener('click', () => w.onTap?.(it.id));
    el.append(b);
  }
  w.mark = (id) => { w.done.add(id); const b = el.querySelector(`[data-id="${id}"]`); if (b) { b.classList.add('is-done'); b.disabled = true; } };
  return w;
}

/* ----------------------------------------------------------------------------- swipe */
export function swipe({ label = 'Swipe up' } = {}) {
  const el = h('div', 'gw gw-swipe');
  const track = h('div', 'gw-swipe__track', `<span class="gw-swipe__fill"></span><span class="gw-swipe__thumb" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 19V6M6.5 11.5 12 6l5.5 5.5"/></svg></span>`);
  track.setAttribute('role', 'slider'); track.setAttribute('aria-label', label);
  el.append(track, h('span', 'gw-swipe__label', label));
  const w = { el, kind: 'swipe', v: 0, onChange: null, onRelease: null, locked: false };
  const draw = () => { track.style.setProperty('--v', w.v.toFixed(3)); track.setAttribute('aria-valuenow', String(Math.round(w.v * 100))); };
  w.set = (v) => { w.v = clamp(v, 0, 1); draw(); };
  dragOn(track, (e) => {
    if (w.locked) return;
    if (e.type === 'move') { w.set(w.v - e.dy / (e.h * 0.72)); w.onChange?.(w.v); }
    if (e.type === 'up') w.onRelease?.(w.v);
  });
  keys(track, { ArrowUp: () => { if (!w.locked) { w.set(w.v + 0.25); w.onChange?.(w.v); w.onRelease?.(w.v); } } });
  draw();
  return w;
}

/* ---------------------------------------------------------------------------- rotate */
export function rotate({ label = 'Turn a full circle' } = {}) {
  const el = h('div', 'gw gw-rot');
  const s = svgEl('svg', { viewBox: '-50 -50 100 100', role: 'slider', 'aria-label': label });
  s.append(svgEl('circle', { class: 'gw-rot__track', r: 38 }));
  const arc = svgEl('circle', { class: 'gw-rot__arc', r: 38, pathLength: 100, 'stroke-dasharray': '0 100', transform: 'rotate(-90)' });
  const knob = svgEl('circle', { class: 'gw-rot__knob', r: 8, cx: 0, cy: -38 });
  const pct = svgEl('text', { class: 'gw-rot__pct', x: 0, y: 5 }); pct.textContent = '0°';
  s.append(arc, knob, pct);
  el.append(s);
  const w = { el, kind: 'rotate', turned: 0, last: null, onChange: null };
  const draw = () => {
    const a = (w.turned * Math.PI) / 180;
    knob.setAttribute('cx', (Math.sin(a) * 38).toFixed(2)); knob.setAttribute('cy', (-Math.cos(a) * 38).toFixed(2));
    arc.setAttribute('stroke-dasharray', `${clamp(Math.abs(w.turned) / 3.6, 0, 100).toFixed(1)} 100`);
    arc.setAttribute('transform', w.turned < 0 ? 'rotate(-90) scale(1 -1)' : 'rotate(-90)');
    pct.textContent = `${Math.min(360, Math.round(Math.abs(w.turned)))}°`;
  };
  w.add = (deg) => { w.turned = clamp(w.turned + deg, -400, 400); draw(); w.onChange?.(w.turned); };
  dragOn(s, (e) => {
    const x = e.x - e.w / 2, y = e.y - e.h / 2;
    const ang = (Math.atan2(x, -y) * 180) / Math.PI;
    if (e.type === 'down') { w.last = ang; return; }
    if (e.type === 'move' && w.last !== null && Math.hypot(x, y) > e.w * 0.12) {
      let d = ang - w.last; if (d > 180) d -= 360; if (d < -180) d += 360;
      w.last = ang;
      // only one direction counts (the first one taken)
      if (Math.abs(w.turned) < 1 || Math.sign(d) === Math.sign(w.turned)) w.add(d);
    }
    if (e.type === 'up') w.last = null;
  });
  keys(s, { ArrowRight: () => w.add(30), ArrowLeft: () => w.add(-30) });
  draw();
  return w;
}

/* ------------------------------------------------------------------------------ grid */
// The P1-style camera fly mode plans with (js/fly/mission.js): 35 mm lens, 35.9 × 24 mm sensor,
// 8192 px across the track. Kept in step with fly's planMission so the numbers match after the hand-off.
export const P1 = { f: 35, sw: 35.9, sh: 24.0, px: 8192 };
export const ALTS = [40, 60, 80, 100];
export function planGrid({ w, h, alt, ov }) {
  const across = (alt * P1.sw) / P1.f, along = (alt * P1.sh) / P1.f;
  const spacingMax = across * (1 - ov), photoEvery = along * (1 - ov);
  const n = Math.min(40, Math.max(2, Math.ceil(h / spacingMax) + 1));
  const spacing = h / (n - 1);
  const gsd = (alt * 100 * (P1.sw / P1.px)) / P1.f;
  const speed = Math.min(12, photoEvery / 1.6);
  const perLine = Math.floor(w / photoEvery + 1e-6) + 1;
  const length = n * w + (n - 1) * spacing;
  return { lines: n, spacing, gsd, speed, photos: perLine * n, length, time: length / speed, area: (w * h) / 10000 };
}
/** The fly-mode site around the drone pad, for the mini map: the staked parcel and home. */
export const SITE = {
  parcel: { cx: 4, cz: -32, ha: 26, hc: 15, rot: 0.07 },        // js/field.js FIELD.parcel
  home: [-3.4, 2.1],                                             // js/fly/world.js HOME
  view: { x0: -46, x1: 56, z0: -66, z1: 10 },                    // the map's window (scene metres)
};
export function grid() {
  const el = h('div', 'gw gw-grid');
  const { x0, x1, z0, z1 } = SITE.view;
  const W = x1 - x0, H = z1 - z0;
  const s = svgEl('svg', { viewBox: `${x0} ${z0} ${W} ${H}`, class: 'gw-grid__map', role: 'application', 'aria-label': 'Mission area on the site map; drag the box, or its corner to resize' });
  // background: a 10 m grid, the staked parcel and the home pad
  const bg = svgEl('g', { class: 'gw-grid__bg' });
  for (let x = Math.ceil(x0 / 10) * 10; x <= x1; x += 10) bg.append(svgEl('path', { d: `M${x} ${z0}V${z1}` }));
  for (let z = Math.ceil(z0 / 10) * 10; z <= z1; z += 10) bg.append(svgEl('path', { d: `M${x0} ${z}H${x1}` }));
  s.append(bg);
  const P = SITE.parcel, c = Math.cos(P.rot), sn = Math.sin(P.rot);
  const pc = [[-P.ha, -P.hc], [P.ha, -P.hc], [P.ha, P.hc], [-P.ha, P.hc]].map(([a, b]) => [P.cx + a * c - b * sn, P.cz + a * sn + b * c]);
  s.append(svgEl('path', { class: 'gw-grid__parcel', d: `M${pc.map((p) => p.join(' ')).join('L')}Z` }));
  const home = svgEl('g', { class: 'gw-grid__home', transform: `translate(${SITE.home[0]} ${SITE.home[1]})` });
  home.append(svgEl('circle', { r: 3.2 }), svgEl('path', { d: 'M-1.2 -1.6v3.2M1.2 -1.6v3.2M-1.2 0h2.4' }));
  s.append(home);
  const lines = svgEl('path', { class: 'gw-grid__lines' });
  const box = svgEl('rect', { class: 'gw-grid__box' });
  const handle = svgEl('circle', { class: 'gw-grid__handle', r: 3.6 });
  s.append(lines, box, handle);
  const ctrls = h('div', 'gw-grid__ctrls');
  ctrls.innerHTML = `<div class="gw-seg" role="radiogroup" aria-label="Altitude">${ALTS.map((a) => `<button type="button" role="radio" data-alt="${a}">${a} m</button>`).join('')}</div>
    <div class="gw-seg" role="radiogroup" aria-label="Overlap"><button type="button" role="radio" data-ov="0.7">70 %</button><button type="button" role="radio" data-ov="0.8">80 %</button></div>
    <dl class="gw-grid__out"><div><dt>GSD</dt><dd data-gsd></dd></div><div><dt>Time</dt><dd data-time></dd></div><div><dt>Lines</dt><dd data-lines></dd></div><div><dt>Photos</dt><dd data-photos></dd></div></dl>`;
  el.append(s, ctrls);
  const w = { el, kind: 'grid', v: { cx: P.cx, cz: P.cz, w: 2 * P.ha + 4, h: 2 * P.hc + 4, alt: 60, ov: 0.8 }, plan: null, onChange: null, touched: false };
  const draw = () => {
    const v = w.v;
    box.setAttribute('x', (v.cx - v.w / 2).toFixed(1)); box.setAttribute('y', (v.cz - v.h / 2).toFixed(1));
    box.setAttribute('width', v.w.toFixed(1)); box.setAttribute('height', v.h.toFixed(1));
    handle.setAttribute('cx', (v.cx + v.w / 2).toFixed(1)); handle.setAttribute('cy', (v.cz + v.h / 2).toFixed(1));
    const p = (w.plan = planGrid(v));
    let d = '';
    for (let i = 0; i < p.lines; i++) {
      const z = v.cz - v.h / 2 + i * p.spacing;
      const a = i % 2 ? v.cx + v.w / 2 : v.cx - v.w / 2, b = i % 2 ? v.cx - v.w / 2 : v.cx + v.w / 2;
      d += `${i ? 'L' : 'M'}${a.toFixed(1)} ${z.toFixed(1)}L${b.toFixed(1)} ${z.toFixed(1)}`;
    }
    lines.setAttribute('d', d);
    const mm = Math.floor(p.time / 60), ss = Math.round(p.time % 60);
    ctrls.querySelector('[data-gsd]').textContent = `${p.gsd.toFixed(2)} cm/px`;
    ctrls.querySelector('[data-time]').textContent = `${mm}:${String(ss).padStart(2, '0')}`;
    ctrls.querySelector('[data-lines]').textContent = String(p.lines);
    ctrls.querySelector('[data-photos]').textContent = String(p.photos);
    for (const b of ctrls.querySelectorAll('[data-alt]')) b.setAttribute('aria-checked', String(Number(b.dataset.alt) === v.alt));
    for (const b of ctrls.querySelectorAll('[data-ov]')) b.setAttribute('aria-checked', String(Number(b.dataset.ov) === v.ov));
    w.onChange?.(v, p);
  };
  w.set = (o) => { Object.assign(w.v, o); draw(); };
  // drag: the corner handle resizes, anywhere else moves the box
  let mode = null;
  dragOn(s, (e) => {
    const k = W / e.w;    // map metres per css px (the svg keeps its aspect: width-driven)
    const mx = x0 + e.x * k, mz = z0 + e.y * (H / e.h);
    const v = w.v;
    if (e.type === 'down') {
      const hx = v.cx + v.w / 2, hz = v.cz + v.h / 2;
      mode = Math.hypot(mx - hx, mz - hz) < 7 ? 'size' : 'move';
      w.touched = true;
      return;
    }
    if (e.type === 'move' && mode) {
      if (mode === 'move') {
        v.cx = clamp(v.cx + e.dx * k, x0 + v.w / 2, x1 - v.w / 2);
        v.cz = clamp(v.cz + e.dy * (H / e.h), z0 + v.h / 2, z1 - v.h / 2);
      } else {
        const l = v.cx - v.w / 2, t = v.cz - v.h / 2;
        const r = clamp(mx, l + 12, x1), b = clamp(mz, t + 12, z1);
        v.w = r - l; v.h = b - t; v.cx = l + v.w / 2; v.cz = t + v.h / 2;
      }
      draw();
    }
    if (e.type === 'up') mode = null;
  });
  keys(s, {
    ArrowLeft: () => w.set({ cx: clamp(w.v.cx - 2, x0 + w.v.w / 2, x1 - w.v.w / 2) }), ArrowRight: () => w.set({ cx: clamp(w.v.cx + 2, x0 + w.v.w / 2, x1 - w.v.w / 2) }),
    ArrowUp: () => w.set({ cz: clamp(w.v.cz - 2, z0 + w.v.h / 2, z1 - w.v.h / 2) }), ArrowDown: () => w.set({ cz: clamp(w.v.cz + 2, z0 + w.v.h / 2, z1 - w.v.h / 2) }),
  });
  ctrls.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.alt) w.set({ alt: Number(b.dataset.alt) });
    if (b.dataset.ov) w.set({ ov: Number(b.dataset.ov) });
    w.touched = true;
  });
  draw();
  return w;
}

/** The fly-mode hand-off URL for a planned grid (fly.html parses ?mission=grid&cx&cz&w&h&alt&ov&rot). */
export function flyHref(v, base = './fly.html') {
  // lines run east–west in the mini map: rot 90° in fly's convention (bearing of the lines about +y)
  const q = new URLSearchParams({ mission: 'grid', cx: v.cx.toFixed(1), cz: v.cz.toFixed(1), w: v.w.toFixed(1), h: v.h.toFixed(1), alt: String(v.alt), ov: String(Math.round(v.ov * 100)), rot: '90' });
  return `${base}?${q}`;
}

/** Survey coordinates as the controller shows them. */
export const fmtE = (E) => E.toFixed(3);
export const fmtN = (N) => N.toFixed(3);
export const fmtEl = (El) => El.toFixed(3);
export { CP01 };
