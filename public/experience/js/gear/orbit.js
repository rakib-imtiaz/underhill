// Underhill v2 — gear playground: a small damped orbit controller (no OrbitControls vendored).
//
//   const orbit = new Orbit(camera, canvas, { reduced });
//   orbit.setFraming({ target: [x, y, z], dist, az, el, min, max }, { instant });   // az / el in degrees
//   orbit.flyTo({ target?, dist?, az?, el? })      // ease to a view (keeps the framing as "home")
//   orbit.update(dt) → true while it is still moving (call once per frame, then render)
//   orbit.capture = (e) => bool | null             // a mission step can take single-pointer drags:
//                                                  // e = { type: 'down'|'move'|'up', x, y, dx, dy, id }
//                                                  // return true to consume (no orbiting)
//   orbit.onTap = ({ x, y }) => {}                 // a tap (pointer up without a drag)
//   orbit.enabled = false                          // ignore input entirely
//
// Input: one pointer drags to orbit (az / el), two pointers pinch to zoom, the wheel zooms, a double
// tap (or double click) resets to the framing, arrow keys orbit and +/- zoom when the canvas has focus.
// Elevation is kept between 3° and 82°; the distance between the framing's min and max.
import * as THREE from 'three';

const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Orbit {
  constructor(camera, el, { reduced = false } = {}) {
    this.camera = camera;
    this.el = el;
    this.reduced = reduced;
    this.enabled = true;
    this.capture = null;
    this.onTap = null;
    this.onInteract = null;          // any user input (pauses idle things, marks the frame dirty)
    this.home = { target: new THREE.Vector3(0, 0.6, 0), dist: 3, az: 35, el: 16 };
    this.min = 1; this.max = 8;
    this.cur = { target: new THREE.Vector3(0, 0.6, 0), dist: 3, az: 35, el: 16 };
    this.goal = { target: new THREE.Vector3(0, 0.6, 0), dist: 3, az: 35, el: 16 };
    this.vel = { az: 0, el: 0 };
    this.pointers = new Map();
    this.pinch0 = 0; this.dist0 = 0;
    this.lastTap = { t: 0, x: 0, y: 0 };
    this.dragging = false;
    this.captured = false;
    this.bind();
    this.apply();
  }

  bind() {
    const el = this.el;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e, true));
    el.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const k = e.deltaMode === 1 ? 16 : 1;
      this.zoom(Math.exp(e.deltaY * k * 0.0012));
      this.onInteract?.();
    }, { passive: false });
    el.addEventListener('dblclick', (e) => { if (this.enabled && !this.capture) { e.preventDefault(); this.reset(); } });
    el.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const k = e.key;
      if (k === 'ArrowLeft') this.goal.az += 8;
      else if (k === 'ArrowRight') this.goal.az -= 8;
      else if (k === 'ArrowUp') this.goal.el = clamp(this.goal.el + 5, 3, 82);
      else if (k === 'ArrowDown') this.goal.el = clamp(this.goal.el - 5, 3, 82);
      else if (k === '+' || k === '=') this.zoom(0.88);
      else if (k === '-' || k === '_') this.zoom(1.14);
      else if (k === '0' || k === 'Home') this.reset();
      else return;
      e.preventDefault();
      this.onInteract?.();
    });
  }

  local(e) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  down(e) {
    if (!this.enabled) return;
    const p = this.local(e);
    try { this.el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
    this.pointers.set(e.pointerId, { x: p.x, y: p.y, x0: p.x, y0: p.y, t0: performance.now() });
    this.vel.az = this.vel.el = 0;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch0 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      this.dist0 = this.goal.dist;
      if (this.captured) { this.capture?.({ type: 'up', x: p.x, y: p.y, dx: 0, dy: 0, id: e.pointerId, cancel: true }); this.captured = false; }
    } else if (this.pointers.size === 1) {
      this.captured = !!(this.capture && this.capture({ type: 'down', x: p.x, y: p.y, dx: 0, dy: 0, id: e.pointerId }));
    }
    this.onInteract?.();
  }

  move(e) {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr || !this.enabled) return;
    const p = this.local(e);
    const dx = p.x - ptr.x, dy = p.y - ptr.y;
    ptr.x = p.x; ptr.y = p.y;
    if (Math.hypot(p.x - ptr.x0, p.y - ptr.y0) > 6) this.dragging = true;
    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      this.goal.dist = clamp(this.dist0 * (this.pinch0 / d), this.min, this.max);
    } else if (this.captured) {
      this.capture?.({ type: 'move', x: p.x, y: p.y, dx, dy, id: e.pointerId });
    } else {
      this.goal.az -= dx * 0.36;
      this.goal.el = clamp(this.goal.el + dy * 0.26, 3, 82);
      if (!this.reduced) { this.vel.az = -dx * 0.36 * 30; this.vel.el = dy * 0.26 * 30; }
    }
    this.onInteract?.();
  }

  up(e, cancel = false) {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    this.pointers.delete(e.pointerId);
    const p = this.local(e);
    const moved = Math.hypot(p.x - ptr.x0, p.y - ptr.y0);
    if (this.captured && this.pointers.size === 0) {
      this.capture?.({ type: 'up', x: p.x, y: p.y, dx: 0, dy: 0, id: e.pointerId, cancel });
      this.captured = false;
    }
    if (!cancel && moved < 8 && performance.now() - ptr.t0 < 500 && this.pointers.size === 0) {
      const now = performance.now();
      const dbl = now - this.lastTap.t < 320 && Math.hypot(p.x - this.lastTap.x, p.y - this.lastTap.y) < 24;
      this.lastTap = { t: dbl ? 0 : now, x: p.x, y: p.y };
      if (dbl && !this.capture) this.reset();
      else this.onTap?.({ x: p.x, y: p.y });
    }
    if (this.pointers.size === 0) this.dragging = false;
    if (this.pointers.size < 2) this.pinch0 = 0;
  }

  zoom(f) { this.goal.dist = clamp(this.goal.dist * f, this.min, this.max); }

  /** Set the home view (and go there). */
  setFraming({ target, dist, az, el, min, max }, { instant = false, keep = false } = {}) {
    const k = dist != null && this.home.dist ? dist / this.home.dist : 1;
    if (target) this.home.target.fromArray(target.isVector3 ? target.toArray() : target);
    if (dist != null) this.home.dist = dist;
    if (az != null) this.home.az = az;
    if (el != null) this.home.el = el;
    this.min = min ?? Math.min(this.home.dist * 0.45, this.min);
    this.max = max ?? Math.max(this.home.dist * 2.4, this.max);
    if (keep) {
      // a re-layout: keep the view the visitor chose, scaled to the new fit
      this.goal.dist = clamp(this.goal.dist * k, this.min, this.max);
      this.cur.dist = clamp(this.cur.dist * k, this.min, this.max);
      this.apply();
    } else this.reset({ instant });
  }

  reset({ instant = false } = {}) {
    this.flyTo(this.home, { instant });
  }

  /** Ease to a view. Missing fields keep their current goal. */
  flyTo({ target, dist, az, el } = {}, { instant = false } = {}) {
    if (target) this.goal.target.fromArray(target.isVector3 ? target.toArray() : target);
    if (dist != null) this.goal.dist = clamp(dist, this.min, this.max);
    if (az != null) {
      // take the short way round
      let a = az; while (a - this.goal.az > 180) a -= 360; while (a - this.goal.az < -180) a += 360;
      this.goal.az = a;
    }
    if (el != null) this.goal.el = clamp(el, 3, 82);
    this.vel.az = this.vel.el = 0;
    if (instant || this.reduced) this.snap();
  }

  snap() {
    this.cur.target.copy(this.goal.target);
    this.cur.dist = this.goal.dist; this.cur.az = this.goal.az; this.cur.el = this.goal.el;
    this.apply();
  }

  /** Advance the damping; returns true while the view is still moving. */
  update(dt) {
    dt = Math.min(dt, 0.1);
    if (this.pointers.size === 0 && (this.vel.az || this.vel.el)) {
      this.goal.az += this.vel.az * dt;
      this.goal.el = clamp(this.goal.el + this.vel.el * dt, 3, 82);
      const k = Math.exp(-dt * 6);
      this.vel.az *= k; this.vel.el *= k;
      if (Math.abs(this.vel.az) < 0.5 && Math.abs(this.vel.el) < 0.5) this.vel.az = this.vel.el = 0;
    }
    const k = 1 - Math.exp(-dt * (this.reduced ? 40 : 9));
    const c = this.cur, g = this.goal;
    const before = c.az + c.el * 7 + c.dist * 31 + c.target.x * 13 + c.target.y * 17 + c.target.z * 19;
    c.az += (g.az - c.az) * k;
    c.el += (g.el - c.el) * k;
    c.dist += (g.dist - c.dist) * k;
    c.target.lerp(g.target, k);
    const moving = Math.abs(g.az - c.az) > 0.01 || Math.abs(g.el - c.el) > 0.01 || Math.abs(g.dist - c.dist) > 0.0005 || c.target.distanceToSquared(g.target) > 1e-8 || !!(this.vel.az || this.vel.el);
    if (!moving) this.snap();
    else this.apply();
    const after = c.az + c.el * 7 + c.dist * 31 + c.target.x * 13 + c.target.y * 17 + c.target.z * 19;
    return moving || Math.abs(after - before) > 1e-6;
  }

  apply() {
    const c = this.cur;
    const az = c.az * DEG, el = c.el * DEG;
    this.camera.position.set(
      c.target.x + Math.sin(az) * Math.cos(el) * c.dist,
      c.target.y + Math.sin(el) * c.dist,
      c.target.z + Math.cos(az) * Math.cos(el) * c.dist,
    );
    this.camera.lookAt(c.target);
    this.camera.updateMatrixWorld();
  }
}
