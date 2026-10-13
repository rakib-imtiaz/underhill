// Underhill v2 — gear playground: the 3D half of the page (loaded on demand by js/gear/main.js the
// first time a gear with a model is shown, so model-in-production pages never pull in three.js).
//
// Owns the studio (renderer + diorama), the orbit controller, the model cache, labels, point tags,
// the telescope picture-in-picture, the mission runner and the frame loop. Inspect = orbit + staged
// explode + labels; Operate = the gear's mission (rigs/*.js, or the generic runner).
//
// Rendering is on demand: a frame is drawn when the camera, daylight, explode, labels or a mission
// move; idle Inspect draws nothing. The live governor (quality.js) trims the pixel ratio when frames
// run slow. Programs are compiled by studio.warm() before a gear is shown (loader on top).
import * as THREE from 'three';
import { startGovernor } from '../quality.js';
import { Labels } from '../labels.js';
import { Studio } from './studio.js';
import { Orbit } from './orbit.js';
import { GearCache, nextTick } from './cache.js';
import { MissionRunner } from './mission.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class View3D {
  /**
   * @param {object} dom   { stage, canvas, labels, leaders, tags, pip, loader, mission }
   * @param {object} o     { Q, mobile, reduced, debug, onStage(text), onMode(mode), onMission(state), onTryAnother(), safeArea() }
   */
  constructor(dom, o) {
    this.dom = dom;
    this.o = o;
    this.Q = o.Q;
    this.reduced = o.reduced;
    this.studio = new Studio(dom.canvas, { Q: o.Q, reduced: o.reduced, keepBuffer: !!o.debug });
    this.renderer = this.studio.renderer;
    this.camera = this.studio.camera;
    this.orbit = new Orbit(this.camera, dom.canvas, { reduced: o.reduced });
    this.orbit.onInteract = () => { this.dirty = true; };
    this.cache = new GearCache({ Q: o.Q, mobile: o.mobile });
    this.labels = new Labels(dom.labels, dom.leaders);
    this.labels.onChange = () => { this.dirty = true; o.onLabelsChange?.(); };
    this.mode = 'inspect';
    this.explode = 0; this.explodeGoal = null; this.explodeApplied = -1;
    this.labelsOn = true;
    this.labelPage = 0;
    this.dotsMode = false;
    this.gear = null; this.entry = null;
    this.dirty = true;
    this.clock = 0;
    this.loadSeq = 0;
    this.tagEls = new Map();
    this.pipOn = false;
    this.runner = new MissionRunner({
      host: dom.mission, studio: this.studio, orbit: this.orbit, reduced: o.reduced,
      onExit: () => this.setMode('inspect'),
      onTryAnother: () => o.onTryAnother?.(),
      onRestart: () => this.setMode('operate', { restart: true }),
      onChange: (st) => { this.dirty = true; o.onMission?.(st); this.layout(); },
    });
    this.governor = startGovernor({ renderer: this.renderer, q: o.Q, onStep: () => false });
    this.bindTags();
    this.pip = {
      show: (on, label = '') => {
        this.pipOn = !!on;
        dom.pip.hidden = !on;
        if (label) dom.pip.querySelector('.gx-pip__label').textContent = `Telescope · ${label}`;
        this.placePip();
        this.dirty = true;
      },
      setState: (s) => { dom.pip.dataset.state = s; },
    };
    addEventListener('resize', () => this.layout());
    this.layout();
    this.running = false;
  }

  /* --------------------------------------------------------------------------- layout */
  layout() {
    const c = this.dom.canvas;
    const r = this.dom.stage.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    const safe = this.o.safeArea?.(r) || { x: 0, y: 0, w, h };
    this.safe = safe;
    this.studio.setView(w, h, safe);
    c.style.width = `${w}px`; c.style.height = `${h}px`;
    this.dotsMode = w < 700 || w / h < 0.9;
    // a narrow stage (the rail and the notes beside it) names parts by their short names
    const short = w < 1100;
    if (short !== this.shortLabels) { this.shortLabels = short; this.dom.labels.classList.toggle('is-short', short); this.labels.invalidate(); this.labels.set(null, []); }
    if (this.entry) this.frame(false);
    this.placePip();
    this.dirty = true;
    if (!this.running) this.renderNow();
  }

  placePip() {
    if (!this.pipOn) { this.studio.pip = null; return; }
    const s = this.safe || { x: 0, y: 0, w: this.studio.size.w, h: this.studio.size.h };
    const size = Math.round(Math.max(116, Math.min(220, Math.min(s.w, s.h) * 0.38)));
    const x = Math.round(s.x + s.w - size - 10), y = Math.round(s.y + 10);
    this.studio.pip = { x, y, w: size, h: size };
    Object.assign(this.dom.pip.style, { left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${size}px` });
  }

  /** Camera home for the current model, fitted to the free part of the stage. */
  frame(instant) {
    const e = this.entry, f = this.gear.framing;
    const box = e.box.clone();
    const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    const r = Math.max(size.y * 0.5, Math.hypot(size.x, size.z) * 0.5);
    const dist = this.studio.fitDistance(r, f.fit);
    this.orbit.setFraming({ target: [ctr.x, ctr.y + (f.dy || 0), ctr.z], dist, az: f.az, el: f.el, min: dist * f.min, max: dist * f.max }, { instant, keep: !instant });
  }

  /* ----------------------------------------------------------------------------- gear */
  /** Load (or reuse), warm and show a gear. Resolves when it is on stage. */
  async show(gear) {
    const seq = ++this.loadSeq;
    this.runner.stop();
    if (this.mode === 'operate') this.mode = 'inspect';
    this.o.onMode?.('inspect');
    const cached = this.cache.has(gear.id);
    const loader = this.dom.loader;
    if (!cached) { loader.hidden = false; loader.dataset.state = 'build'; }
    this.o.onStage?.('Loading the model');
    let entry;
    try {
      entry = await this.cache.load(gear, { onStage: (t) => { if (seq === this.loadSeq) this.o.onStage?.(t); } });
    } catch (err) {
      console.error(err);
      if (seq === this.loadSeq) { loader.dataset.state = 'error'; this.o.onStage?.('The model could not be built on this device.'); }
      throw err;
    }
    if (seq !== this.loadSeq) return;                     // another gear was picked meanwhile
    // swap: the old model out (it stays cached), the new one in
    if (this.entry && this.entry.rig) this.entry.rig.reset?.();
    this.gear = gear; this.entry = entry;
    this.cache.active = gear.id;
    entry.staged.apply(0); entry.inst.root.position.y = 0; entry.inst.onExplode?.(0);
    this.explode = 0; this.explodeGoal = null; this.explodeApplied = 0;
    this.studio.attach(entry);
    this.studio.setProps(gear.diorama);
    this.labels.set(gear.id, entry.labels);
    this.labels.highlight = null;
    this.labelPage = 0;
    this.clearTags();
    this.frame(true);
    if (!entry.warm) {
      loader.hidden = false; loader.dataset.state = 'warm';
      this.o.onStage?.('Compiling shaders');
      await nextTick();
      if (seq !== this.loadSeq) return;
      // the rig's props and poses are prepared now, so the mission compiles nothing later
      if (gear.rig && !entry.rig) entry.rig = await this.makeRig(gear, entry);
      await this.studio.warm([], { sync: !!this.o.debug || document.hidden });
      if (seq !== this.loadSeq) return;
      entry.warm = true;
      entry.programs = this.studio.programs();
    }
    this.cache.evict(gear.id);
    this.dirty = true;
    this.renderNow();
    loader.hidden = true;
    this.o.onStage?.('');
    this.start();
    return entry;
  }

  async makeRig(gear, entry) {
    const mod = await gear.rig();
    return mod.default.create({ studio: this.studio, entry, orbit: this.orbit, tags: this.tags, pip: this.pip, gear, Q: this.Q, reduced: this.reduced, THREE });
  }

  /* ----------------------------------------------------------------------------- modes */
  async setMode(mode, { restart = false } = {}) {
    if (!this.entry) return;
    if (mode === 'operate') {
      const e = this.entry;
      this.mode = 'operate';
      this.explodeGoal = null; this.setExplode(0);
      this.labels.set(null, []); this.labels.invalidate();
      if (this.runner.active) this.runner.stop();
      if (this.gear.rig && !e.rig) e.rig = await this.makeRig(this.gear, e);
      e.rig?.reset?.();
      e.rig?.begin?.();
      const mission = this.o.mission(this.gear.missionId);
      this.o.onMode?.('operate');
      this.runner.start({ gear: this.gear, mission, rig: e.rig || null });
      this.layout();
    } else {
      if (this.runner.active) this.runner.stop();
      this.mode = 'inspect';
      this.entry.rig?.reset?.();
      this.entry.staged.apply(this.explode); this.explodeApplied = this.explode;
      this.labels.invalidate(); this.labels.set(this.gear.id, this.entry.labels);
      this.clearTags();
      this.pip.show(false);
      this.o.onMode?.('inspect');
      this.layout();
      this.orbit.reset();
    }
    this.dirty = true;
  }

  /* --------------------------------------------------------------------------- explode */
  setExplode(t, { animate = false } = {}) {
    t = Math.min(1, Math.max(0, t));
    if (animate && !this.reduced) { this.explodeGoal = t; }
    else { this.explodeGoal = null; this.explode = t; }
    this.dirty = true;
  }
  applyExplode() {
    const e = this.entry;
    if (!e || this.explodeApplied === this.explode) return;
    const lift = e.staged.apply(this.explode);
    e.inst.onExplode?.(this.explode);
    e.inst.root.position.y = lift;
    this.explodeApplied = this.explode;
    this.studio.contact.dirty = true;
  }

  /* ----------------------------------------------------------------------------- tags */
  bindTags() {
    const layer = this.dom.tags;
    this.tags = {
      show: (id, pos, code, name) => {
        let t = this.tagEls.get(id);
        if (!t) {
          const el = document.createElement('div');
          el.className = 'gx-tag';
          el.innerHTML = `<span class="gx-tag__box"><b class="gx-tag__k"></b><span class="gx-tag__t"></span></span><i class="gx-tag__leg"></i>`;
          layer.append(el);
          t = { el, pos: new THREE.Vector3() };
          this.tagEls.set(id, t);
        }
        t.pos.copy(pos);
        t.el.querySelector('.gx-tag__k').textContent = code;
        t.el.querySelector('.gx-tag__t').textContent = name || '';
        t.el.hidden = false;
        this.dirty = true;
      },
      hide: (id) => { const t = this.tagEls.get(id); if (t) t.el.hidden = true; },
      clear: () => this.clearTags(),
    };
  }
  clearTags() { for (const t of this.tagEls.values()) t.el.remove(); this.tagEls.clear(); }
  placeTags() {
    const p = {};
    for (const t of this.tagEls.values()) {
      if (t.el.hidden) continue;
      this.studio.project(t.pos, p);
      const on = p.front && p.x > -40 && p.x < this.studio.size.w + 40 && p.y > -40 && p.y < this.studio.size.h + 40;
      t.el.style.visibility = on ? 'visible' : 'hidden';
      t.el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
    }
  }

  /* ---------------------------------------------------------------------------- labels */
  /** Phones: labels as numbered dots, three at a time (a page); the chips pick the page. */
  labelPages() { return Math.max(1, Math.ceil((this.entry?.labels.length || 0) / 3)); }
  showLabel(id) {
    const i = this.entry.labels.findIndex((l) => l.id === id);
    if (i < 0) return;
    this.labelPage = Math.floor(i / 3);
    this.labels.highlight = this.labels.highlight === id ? null : id;
    this.dirty = true;
  }
  updateLabels() {
    if (this.mode !== 'inspect' || !this.labelsOn || !this.entry) {
      if (this.labels.items.size) { this.labels.set(null, []); this.labels.invalidate(); }
      return;
    }
    this.labels.set(this.gear.id, this.entry.labels);
    const alpha = new Map();
    const dots = this.dotsMode;
    this.entry.labels.forEach((l, i) => alpha.set(l.id, !dots || Math.floor(i / 3) === this.labelPage ? 1 : 0));
    const s = this.safe, size = this.studio.size;
    const root = this.entry.inst.root;
    const box = new THREE.Box3().setFromObject(root, false);
    const subject = box.getCenter(new THREE.Vector3());
    this.labels.update(this.camera, { w: size.w, h: size.h, bandTop: s.y + 6, bandBottom: s.y + s.h - 6 }, alpha, {
      mode: dots ? 'dots' : 'columns', subject, root, occlusion: true, forceOcclusion: !this.running,
      colTop: s.y + 24, colBottom: s.y + s.h - 24,
    });
  }

  /* ------------------------------------------------------------------------------- loop */
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      const drew = this.step(dt);
      if (drew) this.governor.frame(dt * 1000);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  stop() { this.running = false; }

  /** Advance everything by dt seconds; draw if anything changed. Returns true when it drew. */
  step(dt) {
    this.clock += dt;
    let need = this.dirty;
    if (this.orbit.update(dt)) need = true;
    if (this.studio.updateDay(dt)) need = true;
    if (this.explodeGoal != null) {
      const sp = dt / 1.6;
      this.explode = this.explodeGoal > this.explode ? Math.min(this.explodeGoal, this.explode + sp) : Math.max(this.explodeGoal, this.explode - sp);
      if (this.explode === this.explodeGoal) this.explodeGoal = null;
      this.o.onExplode?.(this.explode);
      need = true;
    }
    if (this.runner.active && !this.runner.finished) { this.runner.update(dt); need = true; }
    if (!need || !this.entry) return false;
    this.renderNow();
    return true;
  }

  renderNow() {
    if (!this.entry) { this.studio.render(); return; }
    if (this.mode === 'inspect') this.applyExplode();
    this.studio.render();
    this.updateLabels();
    this.placeTags();
    this.dirty = false;
  }

  /* --------------------------------------------------------------------------- review */
  /** GPU-synced frame cost: n frames, each followed by a 1-pixel readback. */
  bench(n = 60) {
    const gl = this.renderer.getContext();
    const px = new Uint8Array(4);
    const t = [];
    for (let i = 0; i < n; i++) {
      this.orbit.goal.az += 1.5; this.orbit.snap();
      const t0 = performance.now();
      this.studio.contact.dirty = true;
      this.renderNow();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      t.push(performance.now() - t0);
    }
    t.sort((a, b) => a - b);
    const q = (p) => +t[Math.min(t.length - 1, Math.floor(p * (t.length - 1)))].toFixed(2);
    return { n, median: q(0.5), p90: q(0.9), min: q(0), max: q(1), dpr: this.renderer.getPixelRatio(), tri: this.renderer.info.render.triangles, calls: this.renderer.info.render.calls };
  }
}

export { esc };
