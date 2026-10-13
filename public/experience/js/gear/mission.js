// Underhill v2 — gear playground: the mission runner. It plays a mission script (js/gear/missions.js)
// as a compact step card: a progress dot row, the instruction, the step's widget, "What the crew
// does", success feedback, Next, and a result card at the end ("Try another gear").
//
//   const run = new MissionRunner({ host, studio, orbit, onExit, onTryAnother, onRestart, reduced });
//   run.start({ gear, mission, rig })     rig = the gear's rig instance or null (generic behaviour)
//   run.update(dt)                        once per frame (sim time: widgets, waits, holds, the rig)
//   run.act()                             complete the current step synthetically ("Do it for me")
//   run.next() / run.exit()
//   run.state() → { index, id, done, finished, count }
//
// Rig contract (js/gear/rigs/*.js; every hook optional):
//   enter(step, widget, api) → true when the rig drives the step's completion itself
//                              (it calls api.done(text?)); otherwise the generic behaviour for the
//                              step's interaction completes it and calls rig.progress(step, k)
//   progress(step, k, extra)   0..1 progress of a generic step (move the 3D with it)
//   update(dt, step, api)      every frame while the mission runs
//   act(step, widget, api)     finish the step synthetically (only for steps the rig drives)
//   tap(hit, step, api, point) a tap on the 3D view during the step (hit = studio.pick result)
//   leave(step)                the step is over (Next)
//   result() → { title, rows: [[k, v]], note?, ctas?: [{ label, href, primary }] }
//   reset()                    back to the Inspect pose (exit / restart)
// api = { done(text?), status(html), widget, studio, orbit, setCapture(fn), stepTime() }
import * as W from './widgets.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DEFAULT_WIDGET = { 'drag-bubble': 'vial', hold: 'hold', wait: 'progress', gesture: 'rotate', 'tap-target': 'taps', aim: 'aim', info: 'none' };

/** Build a step's widget by kind. */
function makeWidget(step, o = {}) {
  const kind = step.widget || DEFAULT_WIDGET[step.interaction] || 'none';
  switch (kind) {
    case 'vial': return W.vial();
    case 'dials': return W.dials();
    case 'plummet': return W.plummet();
    case 'skyplot': return W.skyplot({ seed: 3 + (step.id.length * 7), target: 28 + ((step.id.charCodeAt(0) * 5) % 7) });
    case 'hold': return W.hold({ label: o.label || 'Hold to measure', seconds: step.seconds || 1.2 });
    case 'bullseye': return W.bullseye();
    case 'reticle': return W.readout({ rows: [['HA', '—'], ['VA', '—'], ['Off target', '—']], button: o.button || 'Set', cls: 'gw-reticle' });
    case 'compute': return W.readout({ rows: [], button: 'Store the point', cls: 'gw-compute' });
    case 'track': return W.readout({ rows: [['Autolock', 'Off'], ['Stakes', '0']], button: 'Start Autolock', cls: 'gw-track' });
    case 'taps': return W.taps({ items: o.items || Array.from({ length: step.count || 1 }, (_, i) => ({ id: String(i), label: step.count > 1 ? `Part ${i + 1}` : 'Tap the part' })) });
    case 'swipe': return W.swipe({ label: 'Swipe up' });
    case 'rotate': return W.rotate();
    case 'grid': return W.grid();
    case 'progress': return W.readout({ rows: [['Progress', '0 %']], cls: 'gw-progress' });
    case 'aim': return W.readout({ rows: [['Aim', 'Drag on the view']], cls: 'gw-aim' });
    default: return null;
  }
}

export class MissionRunner {
  constructor({ host, studio, orbit, onExit = () => {}, onTryAnother = () => {}, onRestart = () => {}, onChange = () => {}, reduced = false }) {
    this.host = host;
    this.studio = studio;
    this.orbit = orbit;
    this.onExit = onExit;
    this.onTryAnother = onTryAnother;
    this.onRestart = onRestart;
    this.onChange = onChange;
    this.reduced = reduced;
    this.active = false;
    this.i = 0;
    this.done = false;
    this.finished = false;
    this.t = 0;
    this.log = [];
  }

  start({ gear, mission, rig }) {
    this.gear = gear; this.mission = mission; this.rig = rig;
    this.active = true; this.finished = false;
    this.results = [];
    this.go(0);
  }

  /* ----------------------------------------------------------------------- card markup */
  go(i) {
    this.leaveStep();
    this.i = i; this.done = false; this.t = 0; this.gen = {};
    const m = this.mission, step = m.steps[i];
    this.step = step;
    const host = this.host;
    host.hidden = false;
    host.className = `mc mc--${step.widget || DEFAULT_WIDGET[step.interaction] || 'none'}`;
    host.innerHTML = `
      <div class="mc__top">
        <span class="mc__kick">Step ${i + 1} of ${m.steps.length}</span>
        <ol class="mc__dots" aria-hidden="true">${m.steps.map((s, k) => `<li class="${k < i ? 'is-past' : k === i ? 'is-now' : ''}"></li>`).join('')}</ol>
        <button type="button" class="mc__x" aria-label="Leave the mission"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>
      <div class="mc__body">
        <div class="mc__text">
          <h3 class="mc__title">${esc(step.title)}</h3>
          <p class="mc__ins" aria-live="polite">${esc(step.instruction)}</p>
          <p class="mc__status" hidden></p>
          <p class="mc__crew"><b>What the crew does</b> ${esc(step.crewNote)}</p>
        </div>
        <div class="mc__widget"></div>
      </div>
      <div class="mc__acts">
        <button type="button" class="mc__auto">Do it for me</button>
        <button type="button" class="btn small mc__next" disabled>${i === m.steps.length - 1 ? 'Finish' : 'Next'}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button>
      </div>`;
    host.querySelector('.mc__x').addEventListener('click', () => this.exit());
    host.querySelector('.mc__auto').addEventListener('click', () => this.act());
    host.querySelector('.mc__next').addEventListener('click', () => this.next());
    const w = (this.widget = makeWidget(step, this.rig?.widgetOptions?.(step) || {}));
    if (w) host.querySelector('.mc__widget').append(w.el);
    else host.querySelector('.mc__widget').remove();
    this.api = {
      done: (text) => this.complete(text),
      status: (html) => { const el = host.querySelector('.mc__status'); if (!el) return; el.hidden = !html; el.innerHTML = html || ''; },
      widget: w, studio: this.studio, orbit: this.orbit,
      setCapture: (fn) => { this.orbit.capture = fn; },
      stepTime: () => this.t,
      result: (row) => this.results.push(row),
    };
    this.orbit.capture = null;
    this.orbit.onTap = (p) => this.tap(p);
    this.rigDrives = !!(this.rig?.enter?.(step, w, this.api));
    if (!this.rigDrives) this.genericEnter(step, w);
    this.onChange(this.state());
  }

  leaveStep() {
    if (this.step && this.active) { try { this.rig?.leave?.(this.step); } catch (e) { console.warn(e); } }
    this.orbit.capture = null;
    this.orbit.onTap = null;
  }

  complete(text) {
    if (this.done) return;
    this.done = true;
    const host = this.host;
    host.classList.add('is-done');
    const ins = host.querySelector('.mc__ins');
    ins.innerHTML = `<svg class="mc__tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 10 17.5 19 7"/></svg>${esc(text || this.step.successText)}`;
    const next = host.querySelector('.mc__next');
    next.disabled = false;
    host.querySelector('.mc__auto').hidden = true;
    this.log.push({ step: this.step.id, t: +this.t.toFixed(2) });
    this.onChange(this.state());
  }

  next() {
    if (!this.done) return;
    if (this.i < this.mission.steps.length - 1) this.go(this.i + 1);
    else this.finish();
  }

  finish() {
    this.leaveStep();
    this.finished = true;
    const r = this.rig?.result?.() || { title: 'Mission complete', rows: this.mission.steps.map((s) => [s.title, '✓']) };
    const host = this.host;
    host.className = 'mc mc--result';
    const ctas = r.ctas || [];
    host.innerHTML = `
      <div class="mc__top">
        <span class="mc__kick">Mission complete</span>
        <ol class="mc__dots" aria-hidden="true">${this.mission.steps.map(() => '<li class="is-past"></li>').join('')}</ol>
        <button type="button" class="mc__x" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>
      <h3 class="mc__title">${esc(r.title)}</h3>
      <dl class="mc__result">${r.rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      ${r.note ? `<p class="mc__crew">${esc(r.note)}</p>` : ''}
      <div class="mc__acts mc__acts--end">
        ${ctas.map((c) => `<a class="btn small${c.primary ? '' : ' btn--ghost'} mc__cta" href="${esc(c.href)}">${esc(c.label)}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg></a>`).join('')}
        <button type="button" class="btn small${ctas.some((c) => c.primary) ? ' btn--ghost' : ''} mc__another">Try another gear</button>
        <button type="button" class="mc__again">Run it again</button>
      </div>`;
    host.querySelector('.mc__x').addEventListener('click', () => this.exit());
    host.querySelector('.mc__another').addEventListener('click', () => this.onTryAnother());
    host.querySelector('.mc__again').addEventListener('click', () => this.onRestart());
    this.resultData = r;
    this.onChange(this.state());
  }

  exit() {
    this.leaveStep();
    this.active = false;
    this.step = null;
    try { this.rig?.reset?.(); } catch (e) { console.warn(e); }
    this.host.hidden = true;
    this.host.innerHTML = '';
    this.onExit();
  }

  /** Stop without the exit callback (gear switch). */
  stop() {
    if (!this.active) return;
    this.leaveStep();
    this.active = false;
    this.step = null;
    try { this.rig?.reset?.(); } catch (e) { console.warn(e); }
    this.host.hidden = true;
    this.host.innerHTML = '';
  }

  state() {
    return { active: this.active, index: this.i, id: this.step?.id ?? null, done: this.done, finished: this.finished, count: this.mission?.steps.length ?? 0 };
  }

  /* --------------------------------------------------------------------------- per frame */
  update(dt) {
    if (!this.active || this.finished || !this.step) return;
    this.t += dt;
    const w = this.widget, step = this.step;
    if (w?.kind === 'hold') w.update(dt);
    this.rig?.update?.(dt, step, this.api);
    if (!this.rigDrives) this.genericUpdate(dt, step, w);
  }

  tap(p) {
    if (!this.active || this.done || !this.step) return;
    const hit = this.studio.pick(p.x, p.y);
    if (this.rigDrives && this.rig?.tap) { this.rig.tap(hit, this.step, this.api, p); return; }
    if (!this.rigDrives && this.step.interaction === 'tap-target') this.genericTap(hit);
  }

  /** Finish the current step synthetically (the "Do it for me" button and the debug harness). */
  act() {
    if (!this.active || this.finished) return false;
    if (this.done) return true;
    const step = this.step, w = this.widget;
    if (this.rigDrives && this.rig?.act) { this.rig.act(step, w, this.api); return true; }
    this.genericAct(step, w);
    return true;
  }

  /* ----------------------------------------------------------- generic behaviour (no rig) */
  genericEnter(step, w) {
    const g = this.gen;
    const rig = this.rig;
    const prog = (k, extra) => rig?.progress?.(step, Math.max(0, Math.min(1, k)), extra);
    switch (step.interaction) {
      case 'drag-bubble': {
        if (w?.kind === 'vial') {
          w.set(22, -15); g.d0 = w.dist();
          w.onChange = () => prog(1 - w.dist() / g.d0);
          w.onRelease = () => { if (w.dist() <= w.ring - 3) { w.set(0, 0); prog(1); this.complete(); } };
        } else if (w?.kind === 'dials') {
          w.set(130, -95); g.d0 = Math.hypot(130, 95);
          w.onChange = () => prog(1 - Math.hypot(w.x, w.y) / g.d0);
          w.onRelease = () => { if (Math.abs(w.x) <= 10 && Math.abs(w.y) <= 10) { prog(1); this.complete(); } };
        }
        break;
      }
      case 'hold': if (w?.kind === 'hold') { w.onProgress = (k) => prog(k); w.onDone = () => this.complete(); } break;
      case 'gesture': if (w?.kind === 'rotate') w.onChange = (deg) => { prog(Math.abs(deg) / 360); if (Math.abs(deg) >= 360) this.complete(); }; break;
      case 'tap-target': {
        g.count = step.count || 1; g.n = 0;
        if (w?.kind === 'taps') w.onTap = (id) => { if (!w.done.has(id)) { w.mark(id); this.genericCount(); } };
        break;
      }
      case 'aim': {
        g.aim = 0;
        this.api.setCapture((e) => {
          if (e.type === 'move') { g.aim += Math.hypot(e.dx, e.dy); prog(g.aim / 420); if (w) w.rows([['Aim', `${Math.min(100, Math.round((g.aim / 420) * 100))} %`]]); if (g.aim >= 420) this.complete(); }
          return true;
        });
        break;
      }
      case 'info': default: {
        // nothing to do but read: Next is available at once
        if (step.interaction === 'info') this.complete(step.successText);
        break;
      }
    }
  }

  genericCount() {
    const g = this.gen;
    g.n++;
    this.rig?.progress?.(this.step, g.n / g.count);
    if (g.n >= g.count) this.complete();
  }

  genericTap(hit) {
    const step = this.step;
    if (!hit) return;
    if (step.target) {
      const re = new RegExp(step.target);
      let ok = false;
      for (let o = hit.object; o; o = o.parent) if (re.test(o.name)) { ok = true; break; }
      if (!ok) return;
    }
    const w = this.widget;
    if (w?.kind === 'taps') { const next = [...w.el.querySelectorAll('.gw-taps__chip:not(.is-done)')][0]; if (next) w.mark(next.dataset.id); }
    this.genericCount();
  }

  genericUpdate(dt, step, w) {
    if (this.done) return;
    if (step.interaction === 'wait') {
      const k = Math.min(1, this.t / (step.seconds || 4));
      if (w?.kind === 'skyplot') w.set(k);
      else if (w?.kind === 'readout') w.rows([['Progress', `${Math.round(k * 100)} %`]]);
      this.rig?.progress?.(step, k);
      if (k >= 1) this.complete();
    }
  }

  genericAct(step, w) {
    switch (step.interaction) {
      case 'drag-bubble': if (w?.kind === 'vial') { w.set(0, 0); } else if (w?.kind === 'dials') w.set(0, 0); this.rig?.progress?.(step, 1); this.complete(); break;
      case 'hold': if (w?.kind === 'hold') w.finish(); else this.complete(); break;
      case 'gesture': if (w?.kind === 'rotate') { w.add(360 - Math.abs(w.turned)); } else this.complete(); break;
      case 'tap-target': { const g = this.gen; while (!this.done && g.n < g.count) { if (w?.kind === 'taps') { const nx = [...w.el.querySelectorAll('.gw-taps__chip:not(.is-done)')][0]; if (nx) w.mark(nx.dataset.id); } this.genericCount(); } break; }
      case 'wait': this.t = (step.seconds || 4) + 0.01; this.genericUpdate(0, step, w); break;
      case 'aim': this.rig?.progress?.(step, 1); this.complete(); break;
      default: this.complete();
    }
  }
}
