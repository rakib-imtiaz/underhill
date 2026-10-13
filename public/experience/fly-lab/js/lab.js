// Fly Lab: the harness every scenario shares. The engine-specific page supplies an adapter; this file
// owns the rest, so the four scenarios are tested the same way:
//   - the panel (scenario, key field, "Run tests", the test list with pass / fail and measured values)
//   - the frame loop: requestAnimationFrame when the tab is visible, a worker clock when it is hidden
//     (a hidden tab never runs rAF; numbers measured that way are flagged in the panel)
//   - free flight: WASD, Q / E yaw, Space / Shift climb / descend, mouse-drag look, touch sticks, a
//     chase camera (fly mode's spring camera, simplified); collision through adapter.probe()
//   - the eight tests and the result store (localStorage, read by the hub)
//
// Adapter (per scenario):
//   id, title, engine, data, needsKey?: { store, label, placeholder, help }
//   async init({ host, key, probe, lab }) -> { mode: 'full' | 'nokey' | 'fallback', note }
//   contentReady?: Promise (first real map content on screen), settled?: () => Promise
//   setDrone(pose), setCamera({ pos, target, fov }), render(), sync(), readLuma()
//   ground(x, z) -> lab y of the ground
//   probe(o, d, max) -> distance to an obstacle along unit d, or Infinity      (collision)
//   raycast(o, d, max) -> { dist, kind: 'building' | 'ground' | 'other' } | null (LiDAR)
//   setDaylight(d) -> { support: 'full' | 'partial' | 'none', note }
//   attribution() -> { el, required: [strings], note, status? }
//   canvas, sizeCategory?(url) -> category name or null
import { routePose, ROUTE_SECONDS, PAD, LAND, COLLIDE, LIDAR, VIEWPOINT, PLACE, TOWERS, ROUTE_LENGTH_M } from './geo.js';
import { OsmCity } from './osm.js';

export const TESTS = [
  { id: 'load', name: 'Load time to first frame' },
  { id: 'frames', name: 'Frame time · scripted 20 s flight' },
  { id: 'size', name: 'Download size' },
  { id: 'collide', name: 'Building collision' },
  { id: 'lidar', name: 'LiDAR raycast on buildings' },
  { id: 'daynight', name: 'Day / night lighting' },
  { id: 'mobile', name: 'Phone viewport (390 px)' },
  { id: 'attrib', name: 'Attribution shown' },
];
const STATUS_TEXT = { pending: 'Not run', running: 'Running', pass: 'Pass', fail: 'Fail', partial: 'Partial', blocked: 'Needs key', skip: 'Skipped' };

const qs = new URLSearchParams(location.search);
export const PROBE = qs.has('probe');
const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : NaN; };
const fmtMs = (v) => (v >= 100 ? v.toFixed(0) : v.toFixed(1)) + ' ms';
const fmtMB = (b) => (b / 1048576).toFixed(b > 10485760 ? 1 : 2) + ' MB';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nextTask = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });

try { performance.setResourceTimingBufferSize(20000); } catch { /* ignore */ }

// ------------------------------------------------------------------------------------------- flight
class Flight {
  constructor() { this.reset(PAD.x, 0, PAD.z, Math.atan2(-1, 1)); }
  reset(x, y, z, yaw) {
    this.pos = { x, y, z }; this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = yaw; this.yawRate = 0; this.pitch = 0; this.roll = 0;
    this.airborne = y > 0.2; this.rotor = this.airborne ? 1 : 0; this.blocked = false; this.minGap = Infinity;
  }
  get speedH() { return Math.hypot(this.vel.x, this.vel.z); }
  /** inp: { fwd, right, up, turn } in -1..1 */
  step(dt, inp, env) {
    const vmax = inp.sport ? 21 : 15;
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    if (!this.airborne && inp.up > 0.3) { this.airborne = true; }
    this.rotor += ((this.airborne ? 1 : 0) - this.rotor) * (1 - Math.exp(-dt * 3));
    if (!this.airborne) { this.vel.x = this.vel.y = this.vel.z = 0; this.pitch *= 0.9; this.roll *= 0.9; return; }
    // velocity targets (fly mode: forward = (sin yaw, cos yaw), right = (-cos yaw, sin yaw))
    const tvx = sinY * inp.fwd * vmax - cosY * inp.right * vmax;
    const tvz = cosY * inp.fwd * vmax + sinY * inp.right * vmax;
    const tvy = inp.up * (inp.up > 0 ? 6 : 5);
    const k = 1 - Math.exp(-dt / 0.55), ky = 1 - Math.exp(-dt / 0.3);
    const ax = (tvx - this.vel.x) * k / dt, az = (tvz - this.vel.z) * k / dt;
    this.vel.x += (tvx - this.vel.x) * k; this.vel.z += (tvz - this.vel.z) * k; this.vel.y += (tvy - this.vel.y) * ky;
    this.yawRate += (inp.turn * 1.5 - this.yawRate) * (1 - Math.exp(-dt / 0.15));
    this.yaw = wrapPi(this.yaw + this.yawRate * dt);
    // tilt from the acceleration (body frame), capped at 25 deg
    const af = ax * sinY + az * cosY, ar = -ax * cosY + az * sinY;
    this.pitch += (clamp(af / 9.81, -0.44, 0.44) - this.pitch) * (1 - Math.exp(-dt / 0.12));
    this.roll += (clamp(-ar / 9.81, -0.44, 0.44) - this.roll) * (1 - Math.exp(-dt / 0.12));
    // obstacle braking + hard stop: probe along the horizontal velocity
    const sp = this.speedH;
    this.blocked = false;
    if (sp > 0.05 && env.probe) {
      const d = { x: this.vel.x / sp, y: 0, z: this.vel.z / sp };
      const MARGIN = 1.5, BRAKE = 9;
      const look = sp * sp / (2 * BRAKE) + sp * dt + MARGIN + 1;
      const o = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
      const hit = env.probe(o, d, look);
      if (hit < look) {
        this.minGap = Math.min(this.minGap, hit);
        const allowed = Math.sqrt(2 * BRAKE * Math.max(0, hit - MARGIN));
        if (sp > allowed) { const s = allowed / sp; this.vel.x *= s; this.vel.z *= s; this.blocked = true; }
        // never step past the margin
        const stepL = Math.hypot(this.vel.x, this.vel.z) * dt;
        if (stepL > Math.max(0, hit - MARGIN)) { const s = Math.max(0, hit - MARGIN) / (stepL || 1); this.vel.x *= s; this.vel.z *= s; this.blocked = true; }
      }
    }
    this.pos.x += this.vel.x * dt; this.pos.y += this.vel.y * dt; this.pos.z += this.vel.z * dt;
    const g = env.ground ? env.ground(this.pos.x, this.pos.z) : 0;
    if (this.pos.y < g) { this.pos.y = g; if (this.vel.y < 0) this.vel.y = 0; if (inp.up < -0.3 && sp < 1) this.airborne = false; }
    if (this.pos.y > 400) { this.pos.y = 400; this.vel.y = Math.min(0, this.vel.y); }
  }
}

// -------------------------------------------------------------------------------------------- input
class Input {
  constructor(el) {
    this.keys = new Set(); this.look = { dx: 0, dy: 0 }; this.stick = { l: { x: 0, y: 0 }, r: { x: 0, y: 0 } };
    addEventListener('keydown', (e) => { if (e.target.closest?.('input,textarea')) return; this.keys.add(e.code); if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    let drag = null;
    el.addEventListener('pointerdown', (e) => { if (e.button !== 0 || e.target.closest('.lab-ui')) return; drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; el.setPointerCapture?.(e.pointerId); });
    el.addEventListener('pointermove', (e) => { if (!drag || e.pointerId !== drag.id) return; this.look.dx += e.clientX - drag.x; this.look.dy += e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; });
    const end = () => { drag = null; };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }
  bindStick(el, side) {
    const knob = el.querySelector('i');
    let id = null, cx = 0, cy = 0;
    const R = () => el.clientWidth * 0.36;
    el.addEventListener('pointerdown', (e) => { id = e.pointerId; const r = el.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; el.setPointerCapture(e.pointerId); move(e); e.preventDefault(); });
    const move = (e) => { if (e.pointerId !== id) return; let x = (e.clientX - cx) / R(), y = (e.clientY - cy) / R(); const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } this.stick[side] = { x, y: -y }; knob.style.transform = `translate(${x * R()}px, ${-(-y) * R()}px)`; };
    el.addEventListener('pointermove', move);
    const up = (e) => { if (e.pointerId !== id) return; id = null; this.stick[side] = { x: 0, y: 0 }; knob.style.transform = ''; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  read() {
    const k = this.keys, b = (c) => (k.has(c) ? 1 : 0);
    const L = this.stick.l, Rr = this.stick.r;
    return {
      fwd: clamp(b('KeyW') - b('KeyS') + Rr.y, -1, 1), right: clamp(b('KeyD') - b('KeyA') + Rr.x, -1, 1),
      up: clamp(b('Space') - b('ShiftLeft') - b('ShiftRight') + L.y, -1, 1), turn: clamp(b('KeyQ') - b('KeyE') - L.x, -1, 1),
      sport: k.has('KeyF'),
    };
  }
  active() { const i = this.read(); return Math.abs(i.fwd) + Math.abs(i.right) + Math.abs(i.up) + Math.abs(i.turn) > 0.05; }
}

// -------------------------------------------------------------------------------------- the clock
// A hidden tab never runs requestAnimationFrame and throttles timers to 1 Hz; a dedicated worker's
// setInterval keeps ticking, so it drives frames while the tab is hidden.
function workerClock(ms) {
  const src = `let h=null;onmessage=(e)=>{clearInterval(h);if(e.data>0)h=setInterval(()=>postMessage(0),e.data)}`;
  const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  w.postMessage(ms);
  return w;
}

// ---------------------------------------------------------------------------------------------- Lab
export class Lab {
  constructor(adapter) {
    this.a = adapter;
    this.flight = new Flight();
    this.chase = { yawOff: 0, elOff: 0, idle: 99, yawS: 0, elS: 0.3, tgt: { x: PAD.x, y: 0.3, z: PAD.z }, init: false, dist: adapter.chaseDist || 7 };
    this.results = {};
    this.mode = 'idle';      // idle | fly | script | test
    this.day = 1;
    this.clock = 0;
    this.frames = 0;
    this.lastT = performance.now();
    this.scriptT = 0;
    this.measure = null;
    window.__lab = this;
  }

  // ------------------------------------------------------------------------------------- UI
  buildUI() {
    const a = this.a;
    document.body.classList.add('lab-page');
    if (PROBE) document.body.classList.add('is-probe');
    const ui = document.createElement('div');
    ui.className = 'lab-ui-root';
    ui.innerHTML = `
      <aside class="lab-panel lab-ui" id="lab-panel" data-open="${matchMedia('(max-width: 700px)').matches ? 'false' : 'true'}">
        <header class="lab-panel__head">
          <a class="lab-back" href="./">&larr; Fly Lab</a>
          <button type="button" class="lab-fold" id="lab-fold" aria-expanded="true" aria-controls="lab-body"><span class="lab-fold__sum" id="lab-sum">Tests</span><b aria-hidden="true">&#9662;</b></button>
        </header>
        <div class="lab-panel__body" id="lab-body">
          <p class="lab-kicker">Scenario ${esc(a.id)}</p>
          <h1 class="lab-title">${esc(a.title)}</h1>
          <p class="lab-sub">${a.engine}</p>
          <div class="lab-status" id="lab-status"><span class="chip" data-s="pending">Starting</span><span id="lab-mode"></span></div>
          ${a.needsKey ? `<form class="lab-key" id="lab-key" autocomplete="off">
            <label for="lab-key-in">${esc(a.needsKey.label)}</label>
            <div class="lab-key__row"><input id="lab-key-in" type="password" spellcheck="false" placeholder="${esc(a.needsKey.placeholder)}"><button type="submit" class="lab-btn small">Save</button><button type="button" class="lab-btn small ghost" id="lab-key-clear">Clear</button></div>
            <p class="lab-key__help">${a.needsKey.help}</p>
          </form>` : ''}
          <div class="lab-actions">
            <button type="button" class="lab-btn" id="lab-run">Run tests</button>
            <button type="button" class="lab-btn ghost" id="lab-day" aria-pressed="false">Night</button>
            <button type="button" class="lab-btn ghost" id="lab-reset">Reset</button>
          </div>
          <ol class="lab-tests" id="lab-tests">
            ${TESTS.map((t) => `<li data-id="${t.id}" data-s="pending"><i class="dot" aria-hidden="true"></i><span class="t">${t.name}</span><span class="st">${STATUS_TEXT.pending}</span><b class="v"></b><small class="d"></small></li>`).join('')}
          </ol>
          <p class="lab-env" id="lab-env"></p>
          <p class="lab-data">${a.data}</p>
        </div>
      </aside>
      <div class="lab-readout lab-ui" id="lab-readout" aria-live="off"></div>
      <p class="lab-hint" id="lab-hint"><b>W A S D</b> move · <b>Q E</b> turn · <b>Space / Shift</b> climb, descend · <b>drag</b> look · <b>F</b> sport</p>
      <div class="lab-stick lab-stick--l lab-ui" id="stick-l" aria-label="Left stick: climb and turn"><i></i><span>Climb · turn</span></div>
      <div class="lab-stick lab-stick--r lab-ui" id="stick-r" aria-label="Right stick: move"><i></i><span>Move</span></div>
      <div class="lab-toast" id="lab-toast" role="status" hidden></div>`;
    document.body.appendChild(ui);
    this.$ = (id) => document.getElementById(id);
    this.$('lab-fold').addEventListener('click', () => this.togglePanel());
    this.$('lab-run').addEventListener('click', () => this.runAll());
    this.$('lab-day').addEventListener('click', () => this.setDay(this.day > 0.5 ? 0 : 1));
    this.$('lab-reset').addEventListener('click', () => { this.mode = 'idle'; this.flight.reset(PAD.x, 0, PAD.z, Math.atan2(-1, 1)); this.chase.init = false; });
    if (a.needsKey) {
      const inp = this.$('lab-key-in');
      inp.value = this.key() ? '••••••••' : '';
      this.$('lab-key').addEventListener('submit', (e) => { e.preventDefault(); const v = inp.value.trim(); if (!v || v.startsWith('••')) return; try { localStorage.setItem(a.needsKey.store, v); } catch { /* ignore */ } location.reload(); });
      this.$('lab-key-clear').addEventListener('click', () => { try { localStorage.removeItem(a.needsKey.store); } catch { /* ignore */ } location.reload(); });
    }
    this.input = new Input(document.getElementById('stage'));
    this.input.bindStick(this.$('stick-l'), 'l');
    this.input.bindStick(this.$('stick-r'), 'r');
    this.syncPanelState();
  }
  togglePanel(open) {
    const p = this.$('lab-panel');
    const o = open ?? p.dataset.open !== 'true';
    p.dataset.open = String(o);
    this.$('lab-fold').setAttribute('aria-expanded', String(o));
  }
  syncPanelState() { const p = this.$('lab-panel'); this.$('lab-fold').setAttribute('aria-expanded', p.dataset.open); }
  key() { if (!this.a.needsKey) return null; try { return localStorage.getItem(this.a.needsKey.store) || null; } catch { return null; } }
  toast(msg, ms = 3200) { const t = this.$('lab-toast'); t.textContent = msg; t.hidden = false; clearTimeout(this._tt); this._tt = setTimeout(() => { t.hidden = true; }, ms); }
  setStatus(s, text) { const c = this.$('lab-status').querySelector('.chip'); c.dataset.s = s; c.textContent = text; }

  set(id, r) {
    this.results[id] = { ...r, at: Date.now() };
    const li = this.$('lab-tests').querySelector(`[data-id="${id}"]`);
    if (li) {
      li.dataset.s = r.status;
      li.querySelector('.st').textContent = STATUS_TEXT[r.status] || r.status;
      li.querySelector('.v').innerHTML = r.value ? esc(r.value) + (r.hidden ? ' <em class="hid" title="Measured in a hidden browser tab (no requestAnimationFrame); confirm in a visible tab">hidden tab</em>' : '') : '';
      li.querySelector('.d').textContent = r.detail || '';
    }
    const done = Object.values(this.results).filter((x) => !['pending', 'running'].includes(x.status));
    const pass = done.filter((x) => x.status === 'pass').length;
    this.$('lab-sum').textContent = `Tests ${pass}/${TESTS.length} pass`;
  }

  save() {
    const rec = {
      id: this.a.id, title: this.a.title, at: new Date().toISOString(), mode: this.info?.mode, modeNote: this.info?.note,
      env: this.env(), tests: this.results,
    };
    try { localStorage.setItem('flylab:v1:result:' + this.a.id, JSON.stringify(rec)); } catch { /* ignore */ }
    this.$('lab-env').textContent = `Saved ${rec.at.slice(0, 16).replace('T', ' ')} · ${rec.env.hidden ? 'hidden tab' : 'visible tab'} · ${rec.env.w}×${rec.env.h} @${rec.env.dpr} · ${rec.env.gpu}`;
    return rec;
  }
  env() {
    let gpu = 'unknown GPU';
    try { const c = document.createElement('canvas').getContext('webgl'); const e = c.getExtension('WEBGL_debug_renderer_info'); gpu = e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER); } catch { /* ignore */ }
    gpu = String(gpu).replace(/^ANGLE \((.*)\)$/, '$1').replace(/ Direct3D.*$/, '').slice(0, 80);
    return { hidden: document.hidden, w: innerWidth, h: innerHeight, dpr: Math.round(devicePixelRatio * 100) / 100, gpu, ua: navigator.userAgent.replace(/.*(Chrome\/[\d.]+).*/, '$1') };
  }

  // ------------------------------------------------------------------------------------ boot
  async boot() {
    this.buildUI();
    const t0 = performance.now();
    const host = document.getElementById('stage');
    // the reference data: every scenario cross-checks against the same OSM extract
    this.osmP = OsmCity.load().then((c) => (this.osm = c)).catch(() => null);
    let info;
    try {
      info = await this.a.init({ host, key: this.key(), probe: PROBE, lab: this });
    } catch (err) {
      console.error(err);
      this.setStatus('fail', 'Failed to start');
      this.set('load', { status: 'fail', value: 'did not start', detail: String(err?.message || err).slice(0, 160) });
      this.save();
      return;
    }
    this.info = info;
    this.$('lab-mode').textContent = info.note || '';
    // first frame
    this.applyChase(1 / 60, true);
    this.pushPose();
    const tR = performance.now();
    this.a.render();
    this.a.sync?.();
    const tFirst = performance.now();
    this.firstRenderMs = tFirst - tR;
    this.loadMs = { first: tFirst, init: tFirst - t0 };
    if (info.mode === 'nokey') this.setStatus('blocked', 'Needs key'); else this.setStatus('pass', info.mode === 'fallback' ? 'Works (fallback)' : 'Works');
    this.startLoop();
    if (PROBE) return this.probeReport();
    // content (first tiles) time, when the engine has one
    const content = this.a.contentReady ? await Promise.race([this.a.contentReady.then(() => performance.now()), new Promise((r) => setTimeout(() => r(null), 45000))]) : tFirst;
    this.loadMs.content = content;
    this.recordLoad();
    if (qs.has('autorun')) this.runAll();
  }

  recordLoad() {
    const L = this.loadMs, hidden = document.hidden || this.hiddenSeen;
    const first = L.first / 1000, content = L.content ? L.content / 1000 : null;
    const key = this.info.mode === 'nokey';
    const worst = content ?? first;
    const status = key ? 'blocked' : content === null ? 'fail' : worst <= 3 ? 'pass' : worst <= 6 ? 'partial' : 'fail';
    this.set('load', {
      status, hidden,
      value: `first frame ${first.toFixed(2)} s` + (this.a.contentReady ? (content ? ` · map content ${content.toFixed(2)} s` : ' · no map content') : ''),
      detail: (key ? 'Without a key only the engine and the drone load. ' : '') + 'From navigation start. Pass ≤ 3 s, partial ≤ 6 s.',
      ms: { first: L.first, content: L.content || null },
    });
    this.save();
  }

  // ------------------------------------------------------------------------------------ loop
  startLoop() {
    this.hiddenSeen = document.hidden;
    const frame = () => this.tick();
    const raf = () => { if (!document.hidden && !this.busy) frame(); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    // hidden: a worker clock at ~30 Hz keeps the scene (and tile streaming) alive
    this.worker = workerClock(33);
    this.worker.onmessage = () => { if (document.hidden && !this.busy) { this.hiddenSeen = true; frame(); } };
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.hiddenSeen = true; });
  }

  tick(fixedDt) {
    const now = performance.now();
    const dt = fixedDt ?? clamp((now - this.lastT) / 1000, 0.001, 0.05);
    this.lastT = now;
    this.clock += dt;
    if (this.mode === 'idle' || this.mode === 'fly') {
      const inp = this.input.read();
      if (this.input.active()) this.mode = 'fly';
      this.flight.step(dt, inp, this.env3());
    }
    const L = this.input.look;
    if (L.dx || L.dy) { this.chase.yawOff -= L.dx * 0.006; this.chase.elOff = clamp(this.chase.elOff + L.dy * 0.004, -0.5, 1.2); L.dx = L.dy = 0; this.chase.idle = 0; }
    this.applyChase(dt);
    this.pushPose(dt);
    this.a.render();
    this.frames++;
    if (this.frames % 6 === 0) this.readout();
  }

  env3() { return { probe: (o, d, m) => this.a.probe(o, d, m), ground: (x, z) => this.a.ground(x, z) }; }

  pushPose(dt = 1 / 60) {
    const f = this.flight;
    this.a.setDrone({ x: f.pos.x, y: f.pos.y, z: f.pos.z, yaw: f.yaw, pitch: f.pitch, roll: f.roll, rotor: f.rotor, dt, day: this.day });
    this.a.setCamera(this.cam);
  }

  applyChase(dt, snap = false) {
    const c = this.chase, f = this.flight;
    c.idle += dt;
    if (c.idle > 3) { const k = 1 - Math.exp(-dt / 0.7); c.yawOff += (0 - c.yawOff) * k; c.elOff += (0 - c.elOff) * k; }
    const behind = f.yaw + Math.PI + c.yawOff;
    const el = clamp((f.airborne ? 0.26 : 0.32) + c.elOff, -0.25, 1.4);
    const kA = snap ? 1 : 1 - Math.exp(-dt * 4.5);
    if (!c.init || snap) { c.yawS = behind; c.elS = el; c.tgt = { x: f.pos.x, y: f.pos.y + 0.3, z: f.pos.z }; c.init = true; }
    c.yawS += wrapPi(behind - c.yawS) * kA;
    c.elS += (el - c.elS) * kA;
    const kt = snap ? 1 : 1 - Math.exp(-dt * 9);
    c.tgt.x += (f.pos.x - c.tgt.x) * kt; c.tgt.y += (f.pos.y + 0.3 - c.tgt.y) * kt; c.tgt.z += (f.pos.z - c.tgt.z) * kt;
    const dist = c.dist * (1 + Math.min(0.45, f.speedH / 40));
    const pos = { x: c.tgt.x + Math.sin(c.yawS) * Math.cos(c.elS) * dist, y: c.tgt.y + Math.sin(c.elS) * dist, z: c.tgt.z + Math.cos(c.yawS) * Math.cos(c.elS) * dist };
    const g = this.a.ground(pos.x, pos.z) + 0.5;
    if (pos.y < g) pos.y = g;
    this.cam = this.camOverride || { pos, target: { x: c.tgt.x + f.vel.x * 0.12, y: c.tgt.y, z: c.tgt.z + f.vel.z * 0.12 }, fov: 55 };
  }

  /** Dev / screenshots: hold the camera at a fixed view (null to release). */
  view(x, y, z, tx, ty, tz, fov = 55) { this.camOverride = x === null || x === undefined ? null : { pos: { x, y, z }, target: { x: tx, y: ty, z: tz }, fov }; }
  /** Dev / screenshots: put the drone somewhere, hovering. */
  place(x, y, z, yaw = 0) { this.mode = 'idle'; this.flight.reset(x, y, z, yaw); this.flight.airborne = y > 0.2; this.flight.rotor = this.flight.airborne ? 1 : 0; this.chase.init = false; }

  readout() {
    const f = this.flight;
    const hdg = ((180 - f.yaw / DEG) % 360 + 360) % 360; // compass: 0 = north
    const m = this.mode === 'script' || this.mode === 'test' ? (this.phase || this.mode) : f.airborne ? 'flying' : 'on the pad';
    this.$('lab-readout').innerHTML = `<span><i>ALT</i>${f.pos.y.toFixed(1)} m</span><span><i>SPD</i>${(this.mode === 'script' ? this.scriptSpeed || 0 : f.speedH).toFixed(1)} m/s</span><span><i>HDG</i>${hdg.toFixed(0).padStart(3, '0')}°</span><span class="ph">${esc(m)}</span>`;
  }

  setDay(d) {
    this.day = d;
    const r = this.a.setDaylight(d);
    this.$('lab-day').textContent = d > 0.5 ? 'Night' : 'Day';
    this.$('lab-day').setAttribute('aria-pressed', String(d < 0.5));
    return r;
  }

  // ----------------------------------------------------------------------------------- tests
  async runAll() {
    if (this.mode === 'test' || this.mode === 'script') return;
    const btn = this.$('lab-run'); btn.disabled = true; btn.textContent = 'Running…';
    this.togglePanel(true);
    try {
      if (!this.results.load) this.recordLoad();
      for (const t of ['frames', 'size', 'collide', 'lidar', 'daynight', 'mobile', 'attrib']) {
        this.set(t, { status: 'running', value: '' });
        try { await this['test_' + t](); } catch (err) { console.error(err); this.set(t, { status: 'fail', value: 'error', detail: String(err?.message || err).slice(0, 160) }); }
        this.save();
        await nextTask();
      }
    } finally {
      this.mode = 'idle'; btn.disabled = false; btn.textContent = 'Run tests again';
      this.flight.reset(LAND.x, 0, LAND.z, 0); this.chase.init = false;
      this.save();
      this.toast('Tests done. Results saved in this browser; the hub shows them.');
    }
  }

  /** Run n frames back to back (as fast as the engine allows), yielding to the browser between them. */
  async pump(n, each) {
    this.busy = true;
    try {
      for (let i = 0; i < n; i++) {
        const t0 = performance.now();
        if (each) each(i);
        this.applyChase(1 / 60);
        this.pushPose(1 / 60);
        this.a.render();
        this.a.sync?.();
        const t1 = performance.now();
        if (this.measure) this.measure.push(t1 - t0);
        this.frames++;
        if (i % 6 === 0) this.readout();
        if (!document.hidden) await new Promise((r) => requestAnimationFrame(r)); else await nextTask();
      }
    } finally { this.busy = false; }
  }

  async test_frames() {
    this.mode = 'script';
    const N = Math.round(ROUTE_SECONDS * 60);
    const work = []; const intervals = []; let last = null;
    this.measure = work;
    const hidden0 = document.hidden;
    this.flight.reset(PAD.x, 0, PAD.z, routePose(0).yaw); this.chase.init = false;
    await this.pump(N, (i) => {
      const t = i / 60;
      const p = routePose(t);
      this.phase = 'route · ' + p.phase; this.scriptSpeed = p.speed;
      const f = this.flight;
      f.pos = { x: p.x, y: p.y, z: p.z }; f.yaw = p.yaw; f.airborne = p.y > 0.05 || t < 1; f.rotor = t < ROUTE_SECONDS - 0.5 ? 1 : 0;
      f.vel = { x: Math.sin(p.yaw) * p.speed, y: 0, z: Math.cos(p.yaw) * p.speed };
      f.pitch = p.phase === 'between towers' || p.phase === 'orbit' ? 0.12 : 0; f.roll = p.phase === 'orbit' ? -0.14 : 0;
      const now = performance.now(); if (last !== null && !document.hidden) intervals.push(now - last); last = now;
    });
    this.measure = null;
    const hidden = hidden0 || document.hidden;
    const med = median(work), p95 = pct(work, 0.95);
    const status = this.info.mode === 'nokey' ? 'blocked' : p95 <= 16.7 ? 'pass' : p95 <= 33.4 ? 'partial' : 'fail';
    const iv = intervals.length > 30 ? ` · display ${fmtMs(median(intervals))} / p95 ${fmtMs(pct(intervals, 0.95))}` : '';
    this.set('frames', {
      status, hidden,
      value: `median ${fmtMs(med)} · p95 ${fmtMs(p95)}${iv}`,
      detail: `${work.length} frames of the ${ROUTE_LENGTH_M.toFixed(0)} m route (take-off, between Hyatt Place and MetroPlace, orbit, landing), fixed 1/60 s steps, each frame GPU-synced. Pass: p95 ≤ 16.7 ms (60 fps); partial ≤ 33 ms.` + (this.info.mode === 'nokey' ? ' Without a key there is no city to draw, so this number is not comparable.' : ''),
      ms: { median: med, p95, n: work.length, displayMedian: intervals.length ? median(intervals) : null },
    });
  }

  async test_size() {
    const entries = performance.getEntriesByType('resource');
    const nav = performance.getEntriesByType('navigation')[0];
    const cats = {};
    let total = 0, unknown = 0;
    const add = (cat, b) => { cats[cat] = (cats[cat] || 0) + b; total += b; };
    if (nav) add('page', nav.encodedBodySize || nav.transferSize || 0);
    for (const e of entries) {
      const u = e.name;
      if (u.startsWith('blob:') || u.startsWith('data:')) continue;
      const b = e.encodedBodySize || e.transferSize || 0;
      if (!b) { unknown++; continue; }
      const c0 = this.a.sizeCategory ? this.a.sizeCategory(u) : undefined;
      const cat = c0 === undefined ? defaultCategory(u) : c0;
      if (cat === null) continue; // not part of this scenario (the lab's reference data)
      add(cat, b);
    }
    const parts = Object.entries(cats).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${fmtMB(v)}`).join(' · ');
    const key = this.info.mode === 'nokey';
    const status = key ? 'partial' : total <= 8 * 1048576 ? 'pass' : total <= 25 * 1048576 ? 'partial' : 'fail';
    this.set('size', {
      status, value: `${fmtMB(total)} total`,
      detail: `${parts}. Compressed bytes over the wire for this visit (includes tiles streamed during the route; cached files still count by their size).${unknown ? ` ${unknown} cross-origin files reported no size.` : ''}${key ? ' Without a key the map data is missing, so the real total is higher.' : ''} Pass ≤ 8 MB, partial ≤ 25 MB.`,
      bytes: { total, cats },
    });
  }

  async test_collide() {
    this.mode = 'test';
    const C = COLLIDE;
    const f = this.flight;
    f.reset(C.x, this.a.ground(C.x, C.z) + C.y, C.z, C.yaw);
    f.airborne = true; f.rotor = 1;
    this.chase.init = false; this.phase = 'collision test';
    const start = { ...f.pos };
    // where OSM says the wall is, straight ahead
    await this.osmP;
    const dir = { x: Math.sin(C.yaw), y: 0, z: Math.cos(C.yaw) };
    const osmWall = this.osm ? this.osm.raycast({ x: start.x, y: C.y, z: start.z }, dir, 300)?.dist ?? null : null;
    // engine probe cost
    const pc = []; for (let i = 0; i < 5; i++) { const t0 = performance.now(); this.a.probe(f.pos, dir, 200); pc.push(performance.now() - t0); }
    let maxSp = 0, stoppedAt = null;
    const env = this.env3();
    await this.pump(8 * 60, (i) => {
      f.step(1 / 60, { fwd: 1, right: 0, up: 0, turn: 0 }, env);
      maxSp = Math.max(maxSp, f.speedH);
      if (stoppedAt === null && i > 60 && f.speedH < 0.3) stoppedAt = i / 60;
    });
    const travelled = Math.hypot(f.pos.x - start.x, f.pos.z - start.z);
    const gap = this.a.probe(f.pos, dir, 200);
    const into = osmWall !== null ? travelled - osmWall : null;
    const inside = this.osm?.inside(f.pos.x, C.y, f.pos.z);
    const key = this.info.mode === 'nokey';
    let status, value;
    if (key && !isFinite(gap)) { status = 'blocked'; value = 'no buildings without a key'; }
    else if (stoppedAt !== null && isFinite(gap) && gap > 0.3 && !(into > 3)) { status = 'pass'; value = `stopped ${gap.toFixed(1)} m from the wall`; }
    else if (stoppedAt !== null) { status = 'partial'; value = `stopped, gap ${isFinite(gap) ? gap.toFixed(1) + ' m' : '?'}`; }
    else { status = 'fail'; value = 'flew on (no stop)'; }
    this.set('collide', {
      status, value,
      detail: `Full forward stick at ${C.target} from ${osmWall !== null ? osmWall.toFixed(0) + ' m out (OSM wall distance)' : 'about 45 m'}, 40 m up. Top speed ${maxSp.toFixed(1)} m/s; stopped after ${stoppedAt !== null ? stoppedAt.toFixed(1) + ' s' : '—'}; travelled ${travelled.toFixed(1)} m${into !== null ? ` (${into > 0 ? into.toFixed(1) + ' m past' : (-into).toFixed(1) + ' m short of'} the OSM wall)` : ''}${inside ? ', ended INSIDE the OSM footprint' : ''}. Obstacle probe ${fmtMs(median(pc))} per call.`,
      m: { gap, travelled, osmWall, maxSp, probeMs: median(pc) },
    });
  }

  async test_lidar() {
    this.mode = 'test'; this.phase = 'LiDAR test';
    const P = LIDAR, f = this.flight;
    f.reset(P.x, this.a.ground(P.x, P.z) + P.y, P.z, P.yaw); f.airborne = true; f.rotor = 1; this.chase.init = false;
    await this.pump(30);
    await this.osmP;
    const o = { x: f.pos.x, y: f.pos.y - 0.25, z: f.pos.z };
    const rays = [];
    for (let i = 0; i < 64; i++) { const a = P.yaw + (-50 + 100 * i / 63) * DEG; rays.push({ x: Math.sin(a), y: 0, z: Math.cos(a) }); }
    for (let i = 0; i < 32; i++) { const a = P.yaw + (-40 + 80 * (i % 8) / 7) * DEG, e = (-12 - 14 * Math.floor(i / 8)) * DEG; rays.push({ x: Math.sin(a) * Math.cos(e), y: Math.sin(e), z: Math.cos(a) * Math.cos(e) }); }
    let bld = 0, gnd = 0, miss = 0; const dev = []; const t0 = performance.now();
    for (const d of rays) {
      const h = this.a.raycast(o, d, 400);
      if (!h) { miss++; continue; }
      if (h.kind === 'building') {
        bld++;
        const ref = this.osm?.raycast({ x: o.x, y: P.y - 0.25, z: o.z }, d, 400);
        if (ref) dev.push(Math.abs(ref.dist - h.dist));
      } else if (h.kind === 'ground') gnd++; else miss++;
    }
    const per = (performance.now() - t0) / rays.length;
    await this.pump(2);
    const md = dev.length ? median(dev) : null;
    const key = this.info.mode === 'nokey';
    const kind = this.a.raycastKind || 'mesh';
    const status = key && bld === 0 ? 'blocked' : bld < 8 ? 'fail' : (md !== null && md > 4) || kind === '2.5D' ? 'partial' : 'pass';
    this.set('lidar', {
      status,
      value: `${bld}/${rays.length} rays hit buildings · ${per < 1 ? per.toFixed(3) : per.toFixed(1)} ms/ray`,
      detail: `From a hover in the gap at 40 m: 64 level rays over ±50° towards Hyatt Place + 32 rays sloping down. Ground hits ${gnd}, misses ${miss}. ${md !== null ? `Median distance difference to the OSM footprints ${md.toFixed(2)} m (n = ${dev.length}). ` : ''}${this.a.raycastNote || ''}`,
      m: { bld, gnd, miss, perRayMs: per, medDevM: md },
    });
  }

  async test_daynight() {
    this.mode = 'test'; this.phase = 'day / night';
    const V = VIEWPOINT;
    const g = this.a.ground(V.x, V.z);
    const cam = { pos: { x: V.x, y: V.y + g, z: V.z }, target: { x: V.tx, y: V.ty + g, z: V.tz }, fov: 55 };
    const shoot = async (d) => {
      this.setDay(d);
      for (let i = 0; i < 4; i++) { this.a.setCamera(cam); this.a.render(); await nextTask(); }
      this.a.setCamera(cam); this.a.render();
      return this.a.readLuma();
    };
    const day0 = this.day;
    const lDay = await shoot(1);
    const lNight = await shoot(0);
    const sup = this.a.setDaylight(0);
    this.setDay(day0);
    const ratio = lNight / Math.max(1e-4, lDay);
    const key = this.info.mode === 'nokey';
    const status = sup.support === 'none' ? 'fail' : sup.support === 'partial' ? 'partial' : ratio < 0.6 ? 'pass' : 'partial';
    this.set('daynight', {
      status, value: `${sup.support === 'full' ? 'full' : sup.support} · brightness ${lDay.toFixed(2)} → ${lNight.toFixed(2)}`,
      detail: `${sup.note} Mean frame brightness from the same viewpoint, day then night.${key ? ' (No key: sky and drone only.)' : ''}`,
      m: { lDay, lNight },
    });
  }

  async test_mobile() {
    const url = location.pathname + '?probe=1';
    const fr = document.createElement('iframe');
    fr.className = 'lab-probe-frame';
    fr.setAttribute('aria-hidden', 'true'); fr.tabIndex = -1;
    fr.style.cssText = 'position:fixed;left:-2000px;top:0;width:390px;height:844px;border:0;opacity:0;pointer-events:none;';
    const res = await new Promise((resolve) => {
      const to = setTimeout(() => resolve({ timeout: true }), 30000);
      const on = (e) => { if (e.source === fr.contentWindow && e.data?.type === 'flylab-probe') { clearTimeout(to); removeEventListener('message', on); resolve(e.data); } };
      addEventListener('message', on);
      fr.src = url;
      document.body.appendChild(fr);
    });
    fr.remove();
    if (res.timeout) { this.set('mobile', { status: 'fail', value: 'probe page did not report', detail: 'The 390 × 844 copy of this page did not boot within 30 s.' }); return; }
    const ok = res.checks.filter((c) => c.ok).length;
    this.set('mobile', {
      status: ok === res.checks.length ? 'pass' : ok >= res.checks.length - 1 ? 'partial' : 'fail',
      value: `${ok}/${res.checks.length} checks at 390 × 844`,
      detail: res.checks.map((c) => `${c.ok ? '✓' : '✗'} ${c.name}${c.v ? ' (' + c.v + ')' : ''}`).join(' · ') + '. Layout sanity in a 390 px frame (the probe copy skips remote map data); touch feel needs a real phone.',
      checks: res.checks,
    });
  }

  async probeReport() {
    // runs inside the 390 x 844 iframe
    await new Promise((r) => setTimeout(r, 300));
    this.a.render();
    const W = innerWidth, H = innerHeight;
    const checks = [];
    const vis = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' ? r : null; };
    checks.push({ name: 'viewport 390 px', ok: W === 390, v: `${W}×${H}` });
    const sw = document.documentElement.scrollWidth;
    checks.push({ name: 'no sideways scroll', ok: sw <= W + 1, v: `scrollWidth ${sw}` });
    const cr = vis(this.a.canvas);
    checks.push({ name: '3D view fills the width', ok: !!cr && cr.width >= W - 1 && cr.height >= H * 0.6, v: cr ? `${Math.round(cr.width)}×${Math.round(cr.height)}` : 'no canvas' });
    const pr = vis(this.$('lab-panel'));
    const cover = pr ? (Math.min(pr.bottom, H) - Math.max(pr.top, 0)) * (Math.min(pr.right, W) - Math.max(pr.left, 0)) / (W * H) : 0;
    checks.push({ name: 'test panel folded', ok: cover < 0.2, v: `${Math.round(cover * 100)}% of screen` });
    const s1 = vis(this.$('stick-l')), s2 = vis(this.$('stick-r'));
    checks.push({ name: 'touch sticks', ok: !!(s1 && s2 && s1.width >= 88 && s2.width >= 88), v: s1 ? `${Math.round(s1.width)} px` : 'hidden' });
    const at = this.a.attribution();
    const ar = vis(at.el);
    checks.push({ name: 'attribution on screen', ok: !!ar && ar.left >= 0 && ar.right <= W + 1 && ar.bottom <= H + 1, v: ar ? `${Math.round(ar.width)}×${Math.round(ar.height)} px` : 'missing' });
    parent.postMessage({ type: 'flylab-probe', checks }, '*');
  }

  async test_attrib() {
    const at = this.a.attribution();
    const el = at.el;
    const r = el?.getBoundingClientRect();
    const visible = !!r && r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && r.left >= -1;
    const text = (el?.innerText || '') + ' ' + (el?.getAttribute?.('aria-label') || '');
    const missing = at.required.filter((s) => !text.includes(s));
    let onTop = false;
    if (visible) { const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); onTop = !!hit && (hit === el || el.contains(hit)); }
    let status = at.status || (visible && !missing.length && onTop ? 'pass' : visible && missing.length < at.required.length ? 'partial' : 'fail');
    if (status === 'pass' && at.partialOnly) status = 'partial';
    this.set('attrib', {
      status, value: at.status === 'blocked' ? 'nothing to attribute yet (needs key)' : visible ? (missing.length ? `missing: ${missing.join(', ')}` : `shows ${at.required.join(' · ')}`) : 'not visible',
      detail: `${at.note || ''} Checked: on screen, not covered, contains the required text.${onTop ? '' : visible ? ' Something covers its centre.' : ''}`,
    });
  }
}

function defaultCategory(u) {
  const url = new URL(u, location.href);
  const p = url.pathname;
  if (url.origin === location.origin) {
    if (p.includes('/fly-lab/data/')) return 'map data';
    if (p.includes('/vendor/three/')) return 'three.js';
    if (p.includes('/vendor/3d-tiles-renderer/')) return 'tiles library';
    if (p.includes('/js/fly/') || p.includes('/js/adapters/') || p.includes('/models/')) return 'drone';
    if (p.includes('/vendor/fonts/')) return 'fonts';
    return 'lab page';
  }
  return 'remote';
}

export async function startLab(adapter) {
  const lab = new Lab(adapter);
  await lab.boot();
  return lab;
}

export { PLACE, TOWERS, PAD, LAND };
