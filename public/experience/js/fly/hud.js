// Fly mode: the flight display (DOM). Telemetry, the heading tape, battery / RTK / wind, position,
// the mode chip, warnings and toasts, the pre-flight checklist, the photo roll and the projected
// place tags. Written at ~10 Hz by the page (the tags every frame); text only, no layout reads.
import { sceneToUtm, sceneToLatLon, grp, fmtLat, fmtLon, ELEV0 } from './geo.js';

const $ = (id) => document.getElementById(id);
const pad2 = (n) => String(Math.floor(n)).padStart(2, '0');
export const mmss = (s) => `${pad2(s / 60)}:${pad2(s % 60)}`;
const CARD = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const cardinal = (deg) => CARD[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];

export class Hud {
  constructor({ onTag, onRollOpen }) {
    this.el = {};
    for (const id of ['t-agl', 't-asl', 't-hs', 't-vs', 't-dist', 't-ft', 't-pos1', 't-pos2', 't-hdg', 'compass-tape', 'compass-home',
      't-batt', 'batt-fill', 't-rem', 't-rtk', 't-rtkp', 't-sats', 't-wind', 'rtk', 'batt', 'mode-chip', 'warn', 'toasts', 'checklist',
      'tags', 'roll-list', 'roll-count', 'btn-roll', 'lidar-stats', 'mission-chip', 'zoom-v', 'range-card',
      // phones: the bar and the strip (fly.html .ptop / .ptele); absent elements are simply skipped
      'p-mode', 'p-st', 'ptop-st', 'p-agl', 'p-hs', 'p-dist', 'p-homec', 'p-batt', 'p-battc', 'p-asl', 'p-vs', 'p-ft', 'p-hdg', 'p-rem', 'p-wind',
      'p-gnss', 'p-pos', 'roll-count-p']) this.el[id] = $(id);
    this.posMode = 0;
    $('t-pos')?.addEventListener('click', () => { this.posMode = 1 - this.posMode; this.last = null; });
    this.onTag = onTag;
    this.buildTape();
    this.toastQ = [];
    this.tagEls = new Map();
    this.cache = {};
  }

  /** Write text only when it changed (cheap, and no layout thrash). */
  set(id, v) { if (this.cache[id] !== v) { this.cache[id] = v; const e = this.el[id]; if (e) e.textContent = v; } }

  buildTape() {
    const t = this.el['compass-tape']; if (!t) return;
    // −180 … 540° so any heading has 180° either side; 4 px per degree
    let html = '';
    for (let d = -180; d <= 540; d += 5) {
      const h = ((d % 360) + 360) % 360;
      const major = h % 15 === 0, card = h % 45 === 0;
      const lab = h % 90 === 0 ? 'NESW'[h / 90] : card ? ['NE', 'SE', 'SW', 'NW'][(h - 45) / 90] : major ? String(h) : '';
      html += `<span class="tk${major ? ' tk--m' : ''}${card ? ' tk--c' : ''}" style="left:${(d + 180) * 4}px">${lab ? `<em>${lab}</em>` : ''}</span>`;
    }
    t.innerHTML = html;
  }

  compass(heading, homeBearing) {
    const t = this.el['compass-tape'];
    if (t) t.style.transform = `translateX(${(-(heading + 180) * 4).toFixed(1)}px)`;
    this.set('t-hdg', `${String(Math.round(heading) % 360).padStart(3, '0')}°`);
    this.set('p-hdg', `${this.cache['t-hdg']} ${cardinal(heading)}`);
    const hm = this.el['compass-home'];
    if (hm) {
      let rel = ((homeBearing - heading + 540) % 360) - 180;
      const vis = homeBearing !== null && Math.abs(rel) < 60;
      hm.style.opacity = vis ? '1' : '0';
      hm.style.transform = `translateX(${(rel * 4).toFixed(1)}px)`;
    }
  }

  /** The 10 Hz readouts. */
  update(sim, o) {
    const p = sim.pos;
    this.set('t-agl', sim.agl.toFixed(1));
    this.set('t-asl', (o.elev0 ?? ELEV0 + p.y).toFixed(1));
    this.set('t-hs', sim.speedH.toFixed(1));
    const vs = sim.vel.y;
    this.set('t-vs', `${vs >= 0.05 ? '+' : vs <= -0.05 ? '−' : ''}${Math.abs(vs).toFixed(1)}`);
    this.set('t-dist', sim.distHome.toFixed(0));
    this.set('t-ft', mmss(sim.flightTime));
    // position: UTM 11N or latitude / longitude
    if (o.real) {
      this.set('t-pos1', this.posMode ? fmtLat(o.real.lat) : `E ${grp(o.real.E, 2)}`);
      this.set('t-pos2', this.posMode ? fmtLon(o.real.lon) : `N ${grp(o.real.N, 2)} · ${o.real.zone}N`);
    } else if (this.posMode) {
      const ll = sceneToLatLon(p.x, p.z);
      this.set('t-pos1', fmtLat(ll.lat)); this.set('t-pos2', fmtLon(ll.lon));
    } else {
      const u = sceneToUtm(p.x, p.z);
      this.set('t-pos1', `E ${grp(u.E, 2)}`); this.set('t-pos2', `N ${grp(u.N, 2)}`);
    }
    // battery
    const b = sim.battery;
    this.set('t-batt', `${Math.ceil(b)}%`);
    this.set('t-rem', sim.rotor > 0.25 ? mmss(sim.remaining) : '12:00');
    if (this.el['batt-fill']) this.el['batt-fill'].style.transform = `scaleX(${(b / 100).toFixed(3)})`;
    this.el.batt?.classList.toggle('is-low', b <= 25);
    this.el.batt?.classList.toggle('is-crit', b <= 15);
    // RTK
    const k = sim.rtk;
    const st = k.state === 'fix' ? 'RTK FIX' : k.state === 'float' ? 'RTK FLOAT' : k.state === 'acquiring' ? 'GNSS' : 'RTK —';
    this.set('t-rtk', st);
    this.set('t-rtkp', k.state === 'off' ? '' : k.state === 'acquiring' ? 'searching' : `H ${(k.h * 100).toFixed(1)} · V ${(k.v * 100).toFixed(1)} cm`);
    this.set('t-sats', `${k.sats} sats`);
    if (this.el.rtk) this.el.rtk.dataset.state = k.state;
    this.set('t-wind', `Wind ${sim.windSpeed.toFixed(1)} m/s ${cardinal(sim.windFrom)}`);
    this.set('mode-chip', o.modeText);
    // phones: the bar says one short thing (an automatic flight while there is one, else the positioning);
    // the line under it: altitude, speed, distance home (once away), battery; the rest on a tap
    const auto = { rth: 'Returning home', landing: 'Landing', takeoff: 'Taking off', goto: 'Flying to the point', preflight: 'Pre-flight check' }[sim.mode]
      || (sim.mode === 'mission' ? `Mission ${Math.round((sim.auto?.progress || 0) * 100)}%` : '');
    this.set('p-st', auto || (k.state === 'acquiring' ? 'GNSS · searching' : st));
    const ps = auto ? (sim.mode === 'rth' || sim.mode === 'landing' ? 'auto' : 'busy') : k.state;
    if (this.el['ptop-st'] && this.el['ptop-st'].dataset.state !== ps) this.el['ptop-st'].dataset.state = ps;
    this.set('p-mode', o.modeText);
    this.set('p-agl', this.cache['t-agl']);
    this.set('p-hs', this.cache['t-hs']);
    this.set('p-dist', this.cache['t-dist']);
    if (this.el['p-homec']) { const away = sim.distHome >= 1; if (this.el['p-homec'].hidden === away) this.el['p-homec'].hidden = !away; }
    this.set('p-batt', String(Math.ceil(b)));
    this.el['p-battc']?.classList.toggle('is-low', b <= 25);
    this.el['p-battc']?.classList.toggle('is-crit', b <= 15);
    this.set('p-asl', `${this.cache['t-asl']} m`);
    this.set('p-vs', `${this.cache['t-vs']} m/s`);
    this.set('p-ft', this.cache['t-ft']);
    this.set('p-rem', this.cache['t-rem']);
    this.set('p-wind', `${sim.windSpeed.toFixed(1)} m/s ${cardinal(sim.windFrom)}`);
    this.set('p-gnss', k.state === 'off' ? '—' : `${st} · ${k.sats} sats${this.cache['t-rtkp'] ? ` · ${this.cache['t-rtkp']}` : ''}`);
    this.set('p-pos', `${this.cache['t-pos1']} · ${this.cache['t-pos2']}`);
  }

  /** Warnings, most urgent first: [{ key, text, level: 'warn' | 'crit' }]. */
  warnings(list) {
    const e = this.el.warn; if (!e) return;
    const top = list[0];
    const sig = top ? `${top.key}|${top.text}` : '';
    if (sig === this.warnSig) return;
    this.warnSig = sig;
    e.textContent = top ? top.text : '';
    e.dataset.level = top ? top.level : '';
    e.classList.toggle('is-on', !!top);
  }

  toast(text, { kind = 'info', ms = 2600 } = {}) {
    const box = this.el.toasts; if (!box) return;
    const t = document.createElement('div');
    t.className = `toast toast--${kind}`;
    t.textContent = text;
    box.appendChild(t);
    while (box.children.length > 3) box.firstChild.remove();
    requestAnimationFrame(() => t.classList.add('is-in'));
    setTimeout(() => { t.classList.remove('is-in'); t.classList.add('is-out'); setTimeout(() => t.remove(), 400); }, ms);
  }

  checklist(sim, show) {
    const c = this.el.checklist; if (!c) return;
    c.classList.toggle('is-on', show);
    if (!show) return;
    const k = sim.checks, r = sim.rtk;
    const set = (id, ok, text) => { const li = c.querySelector(`[data-ck="${id}"]`); if (!li) return; li.classList.toggle('is-ok', ok); const v = li.querySelector('b'); if (v && v.textContent !== text) v.textContent = text; };
    set('power', k.power, k.power ? 'On' : 'Powering');
    set('arms', k.arms, k.arms ? 'Locked' : 'Unfolding');
    set('props', k.props, k.props ? 'Secure' : 'Checking');
    set('battery', k.battery, k.battery ? `${Math.round(sim.battery)}%` : 'Checking');
    set('compass', k.compass, k.compass ? 'OK' : 'Calibrating');
    set('rtk', k.rtk, r.state === 'fix' ? `FIX · ${r.sats} sats` : r.state === 'float' ? `FLOAT · ${r.sats} sats` : `Acquiring · ${r.sats}`);
  }

  /** Projected place tags: items [{ id, name, sub, x, y, on, far }] in CSS px. */
  tags(items) {
    const box = this.el.tags; if (!box) return;
    for (const it of items) {
      let e = this.tagEls.get(it.id);
      if (!e) {
        e = document.createElement('button');
        e.type = 'button'; e.className = `ptag ptag--${it.kind || 'vp'}`;
        e.innerHTML = `<span class="ptag__k"></span><span class="ptag__t"></span><span class="ptag__leg"></span><span class="ptag__dot"></span>`;
        e.querySelector('.ptag__k').textContent = it.sub || '';
        e.querySelector('.ptag__t').textContent = it.name;
        e.setAttribute('aria-label', `Fly to ${it.name}`);
        e.addEventListener('click', (ev) => { ev.stopPropagation(); this.onTag?.(it.id); });
        box.appendChild(e);
        this.tagEls.set(it.id, e);
      }
      e.style.visibility = it.on ? 'visible' : 'hidden';
      if (it.on) {
        e.style.transform = `translate(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px)`;
        e.style.opacity = String(it.alpha ?? 1);
        e.querySelector('.ptag__k').textContent = it.sub || '';
      }
    }
  }

  addPhoto(photo, onOpen) {
    const list = this.el['roll-list']; if (!list) return;
    const li = document.createElement('li');
    li.className = 'roll__item';
    const m = photo.meta;
    li.innerHTML = `<button type="button" class="roll__thumb" aria-label="Download ${m.name}"><img alt="" width="180" height="120"></button>
      <div class="roll__meta"><b>${m.name}</b><span>${m.utm}</span><span>${m.latlon}</span><span>${m.agl} · ${m.hdg}</span><span>${m.time}</span></div>
      <button type="button" class="roll__dl btn small">Download</button>`;
    list.prepend(li);
    photo.ready.then(() => {
      li.querySelector('img').src = photo.url;
      const thumb = this.el['btn-roll']?.querySelector('img');
      if (thumb) { thumb.src = photo.url; this.el['btn-roll'].classList.add('has-photo'); }
    });
    const dl = () => onOpen?.(photo);
    li.querySelector('.roll__dl').addEventListener('click', dl);
    li.querySelector('.roll__thumb').addEventListener('click', dl);
    this.set('roll-count', String(list.children.length));
    this.set('roll-count-p', String(list.children.length));
  }
}
