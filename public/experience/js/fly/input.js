// Fly mode: input. Keyboard, two virtual sticks (Mode 2, multi-touch, self-centring, dead zone and expo),
// the Gamepad API (standard mapping) and pointer gestures on the 3D view (drag, pinch, wheel, tap,
// double-tap). Everything is combined into four stick axes each frame; discrete actions are callbacks.
//
// Keyboard: W/S forward/back, A/D slide, Q/E yaw, Space up, Shift down, ↑/↓ or ] / [ gimbal,
// Z/X zoom out/in, C photo, L LiDAR, H return home, T (hold) take off / land, M map, 1/2/3 views,
// P payload, F sport, I thermal, K LiDAR colours, ? help, Esc close.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const DEAD = 0.08, EXPO = 0.35;
export const shape = (v) => {
  const a = Math.abs(v);
  if (a < DEAD) return 0;
  const t = (a - DEAD) / (1 - DEAD);
  return Math.sign(v) * (EXPO * t * t * t + (1 - EXPO) * t);
};

const AXIS_KEYS = {
  KeyW: ['ry', 1], KeyS: ['ry', -1], KeyD: ['rx', 1], KeyA: ['rx', -1],
  KeyE: ['lx', 1], KeyQ: ['lx', -1], Space: ['ly', 1], ShiftLeft: ['ly', -1], ShiftRight: ['ly', -1],
};
const ACTION_KEYS = {
  KeyC: 'photo', KeyL: 'lidar', KeyH: 'rth', KeyM: 'map', Digit1: 'view-chase', Digit2: 'view-gimbal', Digit3: 'view-map',
  KeyP: 'payload', KeyF: 'sport', KeyI: 'thermal', KeyK: 'lidar-mode', Escape: 'escape', KeyV: 'view-next', KeyO: 'roll',
};

class Stick {
  constructor(el, onChange) {
    this.el = el; this.knob = el.querySelector('.stick__knob');
    this.x = 0; this.y = 0; this.id = null;
    this.onChange = onChange;
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, (e) => this.up(e));
  }
  down(e) {
    if (this.id !== null) return;
    e.preventDefault();
    this.id = e.pointerId;
    try { this.el.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
    this.el.classList.add('is-active');
    this.move(e);
  }
  move(e) {
    if (e.pointerId !== this.id) return;
    e.preventDefault();
    const r = this.el.getBoundingClientRect();
    const R = r.width / 2 - 8;
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const m = Math.hypot(dx, dy);
    if (m > R) { dx *= R / m; dy *= R / m; }
    this.x = dx / R; this.y = -dy / R;
    this.knob.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    this.onChange?.();
  }
  up(e) {
    if (e.pointerId !== this.id) return;
    this.id = null; this.x = 0; this.y = 0;
    this.knob.style.transform = '';
    this.el.classList.remove('is-active');
    this.onChange?.();
  }
}

export class Input {
  /**
   * @param {object} o
   * @param {HTMLElement} [o.stickL]  @param {HTMLElement} [o.stickR]
   * @param {(name:string, e?:any)=>void} o.onAction
   * @param {(down:boolean)=>void} o.onHold  T key down / up (hold to take off / land)
   */
  constructor({ stickL, stickR, onAction, onHold, onActivity }) {
    this.onAction = onAction; this.onHold = onHold; this.onActivity = onActivity || (() => {});
    this.keys = new Set();
    this.k = { lx: 0, ly: 0, rx: 0, ry: 0 };      // keyboard axes, ramped
    this.axes = { lx: 0, ly: 0, rx: 0, ry: 0 };
    this.gimbalRate = 0; this.zoomRate = 0;
    this.override = null;                         // the debug harness drives the axes directly
    this.sticks = { l: stickL ? new Stick(stickL, () => this.onActivity()) : null, r: stickR ? new Stick(stickR, () => this.onActivity()) : null };
    this.pad = { prev: [], connected: false };
    addEventListener('keydown', (e) => this.keyDown(e));
    addEventListener('keyup', (e) => this.keyUp(e));
    addEventListener('blur', () => { this.keys.clear(); this.onHold?.(false); });
    addEventListener('gamepadconnected', () => { this.pad.connected = true; this.onAction('gamepad'); });
    addEventListener('gamepaddisconnected', () => { this.pad.connected = false; });
  }

  typing(e) { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); }

  keyDown(e) {
    if (this.typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    const code = e.code;
    if (code === 'Space' || code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) { if (AXIS_KEYS[code] || /Arrow|Bracket|KeyZ|KeyX/.test(code)) this.keys.add(code); return; }
    this.keys.add(code);
    this.onActivity();
    if (code === 'KeyT') { this.onHold?.(true); return; }
    if (e.key === '?' || (code === 'Slash' && e.shiftKey)) { this.onAction('help'); return; }
    const a = ACTION_KEYS[code];
    if (a) this.onAction(a, e);
  }

  keyUp(e) {
    this.keys.delete(e.code);
    if (e.code === 'KeyT') this.onHold?.(false);
  }

  /** Combine every source into this.axes (each −1..1). */
  update(dt) {
    if (this.override) {
      Object.assign(this.axes, { lx: 0, ly: 0, rx: 0, ry: 0 }, this.override);
      this.gimbalRate = this.override.gimbal || 0; this.zoomRate = this.override.zoom || 0;
      return this.axes;
    }
    // keyboard: digital keys ramp in over ~0.15 s and out a little faster
    const tgt = { lx: 0, ly: 0, rx: 0, ry: 0 };
    for (const c of this.keys) { const a = AXIS_KEYS[c]; if (a) tgt[a[0]] += a[1]; }
    for (const ax of Object.keys(tgt)) {
      const t = clamp(tgt[ax], -1, 1), cur = this.k[ax];
      const rate = Math.abs(t) > Math.abs(cur) ? 7 : 10;
      this.k[ax] = cur + clamp(t - cur, -rate * dt, rate * dt);
    }
    const out = { ...this.k };
    // virtual sticks
    const L = this.sticks.l, R = this.sticks.r;
    if (L) { out.lx += shape(L.x); out.ly += shape(L.y); }
    if (R) { out.rx += shape(R.x); out.ry += shape(R.y); }
    // gamepad (standard mapping: axes 0/1 left stick, 2/3 right stick; up is negative)
    let gim = 0, zoom = 0;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && [...pads].find((p) => p && p.connected);
    if (gp) {
      const ax = (i) => { const v = gp.axes[i] || 0; return Math.abs(v) < 0.12 ? 0 : shape(v); };
      out.lx += ax(0); out.ly += -ax(1); out.rx += ax(2); out.ry += -ax(3);
      const b = (i) => gp.buttons[i]?.value || 0, pressed = (i) => !!gp.buttons[i]?.pressed;
      gim += b(7) - b(6);                       // RT up, LT down
      zoom += (pressed(5) ? 1 : 0) - (pressed(4) ? 1 : 0);
      const edge = (i, name) => { const p = pressed(i); if (p && !this.pad.prev[i]) { this.onAction(name); this.onActivity(); } this.pad.prev[i] = p; };
      edge(0, 'photo'); edge(1, 'rth'); edge(2, 'lidar'); edge(3, 'view-next'); edge(8, 'map'); edge(12, 'payload'); edge(13, 'thermal');
      const st = pressed(9); if (st !== !!this.pad.prev[9]) this.onHold?.(st); this.pad.prev[9] = st;
      if (Math.abs(out.lx) + Math.abs(out.ly) + Math.abs(out.rx) + Math.abs(out.ry) > 0.2) this.onActivity();
    }
    for (const a of ['ArrowUp', 'BracketRight']) if (this.keys.has(a)) gim += 1;
    for (const a of ['ArrowDown', 'BracketLeft']) if (this.keys.has(a)) gim -= 1;
    if (this.keys.has('KeyX')) zoom += 1;
    if (this.keys.has('KeyZ')) zoom -= 1;
    for (const ax of Object.keys(out)) out[ax] = clamp(out[ax], -1, 1);
    Object.assign(this.axes, out);
    this.gimbalRate = clamp(gim, -1, 1); this.zoomRate = clamp(zoom, -1, 1);
    return this.axes;
  }
}

/**
 * Pointer gestures on an element: drag (one pointer), pinch + pan (two), wheel, tap, double-tap.
 * handlers: { drag(dx, dy, e), pinch(scale, cx, cy), pan(dx, dy), wheel(dy, e), tap(x, y, e),
 * doubletap(x, y, e), down(e), up(e) }; coordinates are client px.
 */
export class Gestures {
  constructor(el, h) {
    this.el = el; this.h = h;
    this.pts = new Map();
    this.lastTap = { t: 0, x: 0, y: 0 };
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    for (const t of ['pointerup', 'pointercancel']) el.addEventListener(t, (e) => this.up(e));
    el.addEventListener('wheel', (e) => { e.preventDefault(); h.wheel?.(e.deltaY * (e.deltaMode === 1 ? 33 : 1), e); }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { this.el.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
    this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });
    if (this.pts.size === 2) this.pinch0 = this.pinchState();
    this.h.down?.(e);
  }
  pinchState() {
    const [a, b] = [...this.pts.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }
  move(e) {
    const p = this.pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (this.pts.size === 1) this.h.drag?.(dx, dy, e);
    else if (this.pts.size === 2 && this.pinch0) {
      const s = this.pinchState();
      if (this.pinch0.d > 0) this.h.pinch?.(s.d / this.pinch0.d, s.cx, s.cy);
      this.h.pan?.(s.cx - this.pinch0.cx, s.cy - this.pinch0.cy);
      this.pinch0 = s;
    }
  }
  up(e) {
    const p = this.pts.get(e.pointerId);
    if (!p) return;
    this.pts.delete(e.pointerId);
    if (this.pts.size < 2) this.pinch0 = null;
    const moved = Math.hypot(e.clientX - p.x0, e.clientY - p.y0);
    const now = performance.now();
    if (e.type === 'pointerup' && moved < 9 && now - p.t0 < 350 && this.pts.size === 0) {
      const lt = this.lastTap;
      if (now - lt.t < 330 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 30) {
        this.lastTap = { t: 0, x: 0, y: 0 };
        this.h.doubletap?.(e.clientX, e.clientY, e);
      } else {
        this.lastTap = { t: now, x: e.clientX, y: e.clientY };
        this.h.tap?.(e.clientX, e.clientY, e);
      }
    }
    this.h.up?.(e);
  }
}
