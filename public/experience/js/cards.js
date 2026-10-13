// Underhill-style information cards, ported from the React site (src/hero/PlateStage.tsx: <Card>,
// the leader layer and its right-angle routing; styles from SurveyHero.css).
//
// A card is a dark translucent panel: a mono title with an accent tick, a small grey kicker, and
// 2–4 fact rows separated by hairlines. A leader runs from a ringed pin on the thing it describes to
// the card's nearest side.
//
// Unlike the original (which reveals cards on a timer at each checkpoint), visibility here is a pure
// function of the scroll position u, so cards fade with their beat and scrub backward cleanly. The
// Underhill reveal (the card settles, rows arrive one by one, the leader draws itself in) still plays,
// keyed on `.is-in` once a card is mostly in.
//
// Placement: each card lists candidate slots. The first slot whose rectangle stays clear of every
// obstacle wins: the subject (projected convex hulls of world points), the HTML labels and readouts
// on screen, the other cards and every card's pin. If no slot is clear, the one with the least
// overlap is used and the overlap is recorded in `cards.report` for review.
import * as THREE from 'three';

const SVGNS = 'http://www.w3.org/2000/svg';
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const FADE = 0.22;   // screen-heights of scroll for a card to fade in or out
const PIN_R = 14;    // px kept clear around every pin
/** phones: across the bottom or the top of the picture, else half-width beside the subject */
const CONDENSED_SLOTS = [
  { x: 0.5, y: 1, ax: 0.5, ay: 1, size: 'full' }, { x: 0.5, y: 0, ax: 0.5, ay: 0, size: 'full' },
  { x: 0, y: 1, ax: 0, ay: 1, size: 'half' }, { x: 1, y: 1, ax: 1, ay: 1, size: 'half' },
  { x: 0, y: 0, ax: 0, ay: 0, size: 'half' }, { x: 1, y: 0, ax: 1, ay: 0, size: 'half' },
  { x: 0, y: 0.5, ax: 0, ay: 0.5, size: 'half' }, { x: 1, y: 0.5, ax: 1, ay: 0.5, size: 'half' },
];

/* ------------------------------------------------------------------------- 2D geometry */
function hull(pts) {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const rectPoly = (r) => [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }];
/** Separating-axis test: does the axis-aligned rect r overlap the convex polygon poly? */
function rectHitsPoly(r, poly) {
  if (!poly.length) return false;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of poly) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  if (maxX <= r.x0 || minX >= r.x1 || maxY <= r.y0 || minY >= r.y1) return false;
  if (poly.length < 3) return true;
  const corners = rectPoly(r);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const nx = a.y - b.y, ny = b.x - a.x;
    let pmin = Infinity, pmax = -Infinity, rmin = Infinity, rmax = -Infinity;
    for (const p of poly) { const d = p.x * nx + p.y * ny; pmin = Math.min(pmin, d); pmax = Math.max(pmax, d); }
    for (const p of corners) { const d = p.x * nx + p.y * ny; rmin = Math.min(rmin, d); rmax = Math.max(rmax, d); }
    if (rmax <= pmin || rmin >= pmax) return false;
  }
  return true;
}
/** Length of the segment p0→p1 inside the convex polygon (Cyrus–Beck clip). */
function insideLen(p0, p1, poly) {
  if (poly.length < 3) return 0;
  let cx = 0, cy = 0;
  for (const p of poly) { cx += p.x; cy += p.y; }
  cx /= poly.length; cy /= poly.length;
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  let t0 = 0, t1 = 1;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    let nx = a.y - b.y, ny = b.x - a.x;
    if (nx * (cx - a.x) + ny * (cy - a.y) < 0) { nx = -nx; ny = -ny; }   // inward
    const num = nx * (p0.x - a.x) + ny * (p0.y - a.y), den = nx * dx + ny * dy;
    if (den === 0) { if (num < 0) return 0; continue; }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 >= t1) return 0;
  }
  return (t1 - t0) * Math.hypot(dx, dy);
}
/** How much of a leader (a polyline) runs over the subject, past the first 20 px from its pin (the
 *  pin itself sits on the subject). */
const routeCost = (pts, hulls) => {
  const p0 = pts[0], p1 = pts[1], L = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const k = L > 0 ? Math.min(1, 20 / L) : 0;
  const q = [{ x: p0.x + (p1.x - p0.x) * k, y: p0.y + (p1.y - p0.y) * k }, ...pts.slice(1)];
  let c = 0;
  for (let i = 0; i + 1 < q.length; i++) for (const h of hulls) c += insideLen(q[i], q[i + 1], h);
  return c;
};
/** Overlap score: area of r ∩ (bounding box of poly). Only used to rank slots that all overlap. */
function overlapArea(r, poly) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of poly) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  return Math.max(0, Math.min(r.x1, maxX) - Math.max(r.x0, minX)) * Math.max(0, Math.min(r.y1, maxY) - Math.max(r.y0, minY));
}

export class Cards {
  /**
   * @param {HTMLElement} layer   the cards' container (picture space)
   * @param {SVGSVGElement} svg   the leaders layer (picture space, under the cards)
   */
  constructor(layer, svg) {
    this.layer = layer;
    this.svg = svg;
    this.items = [];
    /** last frame's placement problems, for review: [{ id, u, overlap }] */
    this.report = [];
    this._v = new THREE.Vector3();
    this._c = new THREE.Vector3();
  }

  /**
   * @param {object} spec
   * @param {string} spec.id
   * @param {[number, number]} spec.u          scroll window (fades in at u0, out at u1)
   * @param {string} spec.title
   * @param {string} [spec.kicker]
   * @param {string[]|function} spec.rows       2–4 facts, or (state) => facts
   * @param {string|function} [spec.line]       the condensed line of facts on phones
   * @param {string} [spec.accent]              colour of the title's tick
   * @param {boolean} [spec.coords]             mono rows (coordinates)
   * @param {function} [spec.pin]               (state, out) => world point the leader starts on, or null
   * @param {function} [spec.subject]           (state) => array of shapes, each an array of world points
   *                                            (a shape with `soft: true` is a backdrop: avoided if possible)
   * @param {function} [spec.subjectCondensed]  the same on phones, where the subject fills the picture
   * @param {object[]} spec.slots               candidate places, tried in order (see slotRect)
   * @param {number} [spec.delay]               reveal delay, seconds
   */
  add(spec) {
    const el = document.createElement('div');
    el.className = `pl-card${spec.coords ? ' pl-card-coords' : ''}`;
    if (spec.accent) el.style.setProperty('--pl-accent', spec.accent);
    el.style.setProperty('--d', `${spec.delay ?? 0.1}s`);
    // title (what it is), purpose (what the crew uses it for), then one or two facts with units
    el.innerHTML = '<div class="pl-card-title"></div><div class="pl-card-kicker"></div><p class="pl-card-purpose"></p><div class="pl-card-rows"></div><div class="pl-card-line"></div>';
    el.querySelector('.pl-card-title').textContent = spec.title;
    const kick = el.querySelector('.pl-card-kicker');
    if (spec.kicker) kick.textContent = spec.kicker; else kick.remove();
    const purpose = el.querySelector('.pl-card-purpose');
    if (spec.purpose) purpose.textContent = spec.purpose; else purpose.remove();
    this.layer.appendChild(el);
    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('class', 'pl-lead');
    g.innerHTML = '<polyline points="0,0 0,0" pathLength="1"></polyline><circle class="pl-lead-ring" r="4"></circle><circle r="3.6"></circle>';
    this.svg.appendChild(g);
    const item = { spec, el, g, rowsEl: el.querySelector('.pl-card-rows'), lineEl: el.querySelector('.pl-card-line'), rowsKey: null, lineKey: null, size: null, sizeKey: '', a: 0, on: false };
    this.items.push(item);
    return item;
  }

  /** Forget measured sizes (fonts arrived, layout changed). */
  invalidate() { for (const it of this.items) { it.size = null; it.sizes = null; } }

  /** Alpha of a card at u: a pure function of the scroll position. */
  alpha(spec, u) { return smoothstep(spec.u[0], spec.u[0] + FADE, u) * (1 - smoothstep(spec.u[1] - FADE, spec.u[1], u)); }

  /** Is any card visible at u? (lets the caller skip collecting obstacles) */
  anyAt(u) { return this.items.some((it) => this.alpha(it.spec, u) > 0.002); }

  /** Project a world point to picture px; null behind the camera. */
  project(camera, view, w) {
    const c = this._c.copy(w).applyMatrix4(camera.matrixWorldInverse);
    if (c.z > -camera.near) return null;
    const v = this._v.copy(w).project(camera);
    return { x: (v.x * 0.5 + 0.5) * view.w, y: (-v.y * 0.5 + 0.5) * view.h };
  }

  setContent(it, s, condensed) {
    const rows = typeof it.spec.rows === 'function' ? it.spec.rows(s) : it.spec.rows;
    const key = rows.join('\n');
    if (key !== it.rowsKey) {
      it.rowsKey = key;
      it.rowsEl.textContent = '';
      rows.forEach((r, i) => {
        const d = document.createElement('div');
        d.className = 'pl-card-row';
        d.style.setProperty('--i', i);
        d.textContent = r;
        it.rowsEl.appendChild(d);
      });
      it.size = null;
    }
    // phones: the one line is the card's purpose (what it is for), or its facts if it has none
    const line = it.spec.line ? (typeof it.spec.line === 'function' ? it.spec.line(s) : it.spec.line)
      : it.spec.purpose ? `${it.spec.title}: ${it.spec.purpose}` : rows.slice(0, 2).join(' · ');
    if (line !== it.lineKey) { it.lineKey = line; it.lineEl.textContent = line; if (condensed) it.size = null; }
  }

  /**
   * A slot's rectangle. Slots are { x, y, ax, ay } in fractions of the picture (the card's point
   * (ax, ay) of its own box sits there), or { pin: true, dx, dy, ax, ay } in px from the pin.
   */
  slotRect(slot, size, view, pin) {
    let px, py;
    if (slot.pin) { if (!pin) return null; px = pin.x + slot.dx; py = pin.y + slot.dy; }
    else { px = slot.x * view.w; py = slot.y * view.h; }
    const x0 = px - (slot.ax ?? 0) * size.w, y0 = py - (slot.ay ?? 0) * size.h;
    return { x0, y0, x1: x0 + size.w, y1: y0 + size.h };
  }

  /**
   * @param {number} u
   * @param {object} s           the timeline state at u (passed to the specs' functions)
   * @param {object} ctx
   * @param {THREE.Camera} ctx.camera
   * @param {object} ctx.view    { w, h, portrait, bandTop, bandBottom }
   * @param {function} ctx.obstacles  () => rects { x0, y0, x1, y1 } of the HTML labels in the picture
   * @param {number} [ctx.calm]  0..1: floating cards fade while the camera is moving
   */
  update(u, s, ctx) {
    const { camera, view } = ctx;
    const condensed = view.portrait;
    this.report.length = 0;
    // active cards; phones show one (the most visible)
    let active = [];
    for (const it of this.items) { it.a = this.alpha(it.spec, u); if (it.a > 0.002) active.push(it); }
    if (condensed && active.length > 1) active = [active.reduce((b, it) => (it.a > b.a ? it : b))];
    for (const it of this.items) {
      if (active.includes(it)) continue;
      if (it.el.style.visibility !== 'hidden') { it.el.style.visibility = 'hidden'; it.el.style.opacity = '0'; }
      if (it.on) { it.on = false; it.el.classList.remove('is-in'); it.g.classList.remove('is-in'); }
      it.g.style.visibility = 'hidden';
      it.slotIdx = -1;   // the next time it shows, it looks for its place afresh
    }
    this.line = null;
    if (!active.length) return;
    const calm = ctx.calm ?? 1;

    if (condensed) {
      // Portrait screens have one overlay: the caption card. The most visible card's facts become its
      // last line (main.js reads this.line), and the card's ringed pin marks what they describe; no
      // floating card and no leader, so nothing crosses the subject.
      const it = active[0];
      it.el.style.visibility = 'hidden'; it.el.style.opacity = '0';
      this.setContent(it, s, true);
      this.line = { text: it.lineKey, a: it.a, accent: it.spec.accent || null };
      const w = it.spec.pin ? it.spec.pin(s, new THREE.Vector3()) : null;
      const p = w ? this.project(camera, view, w) : null;
      if (!p || p.y < view.bandTop || p.y > view.bandBottom) { it.g.style.visibility = 'hidden'; return; }
      it.g.firstElementChild.setAttribute('points', `${p.x.toFixed(1)},${p.y.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)}`);
      for (const dot of it.g.querySelectorAll('circle')) { dot.setAttribute('cx', p.x.toFixed(1)); dot.setAttribute('cy', p.y.toFixed(1)); }
      if (!it.on && it.a > 0.6) { it.on = true; it.g.classList.add('is-in'); }
      if (it.on && it.a < 0.35) { it.on = false; it.g.classList.remove('is-in'); }
      it.g.style.opacity = it.a.toFixed(3);
      it.g.style.visibility = 'visible';
      return;
    }

    const safe = { x0: 16, y0: view.bandTop + 6, x1: view.w - 16, y1: view.bandBottom - 6 };
    const hard = ctx.obstacles().map(rectPoly);
    const kinds = hard.map(() => 'label');   // what each obstacle is, for the review report
    // every active card's pin, and the subjects of every active card
    const pins = new Map();
    for (const it of active) {
      const w = it.spec.pin ? it.spec.pin(s, new THREE.Vector3()) : null;
      const p = w ? this.project(camera, view, w) : null;
      const onScreen = p && p.x > 4 && p.x < view.w - 4 && p.y > 4 && p.y < view.h - 4;
      pins.set(it, onScreen ? p : null);
      if (onScreen) { hard.push(rectPoly({ x0: p.x - PIN_R, y0: p.y - PIN_R, x1: p.x + PIN_R, y1: p.y + PIN_R })); kinds.push(`pin:${it.spec.id}`); }
      it.hulls = [];
      const subject = condensed && it.spec.subjectCondensed ? it.spec.subjectCondensed : it.spec.subject;
      for (const shape of (subject ? subject(s) : [])) {
        const pts = [];
        for (const wp of shape) { const q = this.project(camera, view, wp); if (q) pts.push(q); }
        if (!pts.length) continue;
        const h = hull(pts); h.soft = !!shape.soft;
        // a card keeps clear of the subject's whole bounding box (not only its silhouette): the
        // subject owns its frame. The leader's routing still reads the silhouette.
        let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
        for (const q of h) { bx0 = Math.min(bx0, q.x); by0 = Math.min(by0, q.y); bx1 = Math.max(bx1, q.x); by1 = Math.max(by1, q.y); }
        const box = h.soft ? h : rectPoly({ x0: bx0, y0: by0, x1: bx1, y1: by1 });
        box.soft = h.soft;
        hard.push(box); kinds.push(h.soft ? null : `subject:${it.spec.id}`);
        if (!h.soft) it.hulls.push(h);
      }
    }

    for (const it of active) {
      it.el.classList.toggle('is-condensed', condensed);
      this.setContent(it, s, condensed);
      // measured once per content and width. Phones have two widths: across the picture, or half of
      // it, to stand beside a subject that fills the picture's height
      const sizeKey = `${condensed}|${view.w}`;
      if (!it.sizes || it.size === null || it.sizeKey !== sizeKey) {
        it.el.style.visibility = 'hidden';
        const measure = (w) => { it.el.style.width = w; return { w: it.el.offsetWidth, h: it.el.offsetHeight, css: w }; };
        it.sizes = condensed
          ? { full: measure(`${Math.min(view.w - 32, 420)}px`), half: measure(`${Math.round(Math.min(view.w * 0.56, 240))}px`) }
          : { auto: measure('') };
        it.size = true;
        it.sizeKey = sizeKey;
      }
      const pin = pins.get(it);
      const slots = condensed ? CONDENSED_SLOTS : it.spec.slots.map((sl) => ({ ...sl, size: 'auto' }));
      const rate = (slot) => {
        const size = it.sizes[slot.size];
        let r = this.slotRect(slot, size, view, pin);
        if (!r) return null;
        // keep the card inside the safe area (Underhill's clamp)
        const dx = r.x0 < safe.x0 ? safe.x0 - r.x0 : r.x1 > safe.x1 ? safe.x1 - r.x1 : 0;
        const dy = r.y0 < safe.y0 ? safe.y0 - r.y0 : r.y1 > safe.y1 ? safe.y1 - r.y1 : 0;
        r = { x0: r.x0 + dx, y0: r.y0 + dy, x1: r.x1 + dx, y1: r.y1 + dy };
        const m = { x0: r.x0 - 6, y0: r.y0 - 6, x1: r.x1 + 6, y1: r.y1 + 6 };   // a little air
        // ranked with the air around the card; reported only where the card itself overlaps. A soft
        // obstacle (a backdrop, such as the planet behind the site) is avoided when there is room,
        // and never outranks a hard one
        let score = 0; const hits = [];
        hard.forEach((poly, k) => {
          if (!rectHitsPoly(m, poly)) return;
          if (poly.soft) { score += 1 + overlapArea(m, poly) * 1e-3; return; }
          score += 1e6 + overlapArea(m, poly);
          if (rectHitsPoly(r, poly)) hits.push(kinds[k]);
        });
        return { r, score, size, hits };
      };
      let best = null, bestScore = Infinity, bestSize = null, bestHits = null, bestIdx = -1;
      // hysteresis: a card that has a place keeps it while that place stays clear of every hard
      // obstacle. Searched afresh each frame, a moving camera made it hop between two slots that
      // took turns being the first clear one (the card jumping across the subject and back)
      const prev = it.slotIdx >= 0 && it.slotIdx < slots.length ? rate(slots[it.slotIdx]) : null;
      if (prev && prev.score < 2) { best = prev.r; bestScore = prev.score; bestSize = prev.size; bestHits = prev.hits; bestIdx = it.slotIdx; }
      else {
        for (let si = 0; si < slots.length; si++) {
          const q = rate(slots[si]);
          if (!q) continue;
          if (q.score < bestScore) { best = q.r; bestScore = q.score; bestSize = q.size; bestHits = q.hits; bestIdx = si; }
          if (q.score === 0) break;
        }
      }
      it.slotIdx = bestIdx;
      if (!best) { it.el.style.visibility = 'hidden'; it.g.style.visibility = 'hidden'; continue; }
      if (bestHits.length) this.report.push({ id: it.spec.id, u: +u.toFixed(3), with: bestHits });
      hard.push(rectPoly(best)); kinds.push(`card:${it.spec.id}`);

      if (it.el.style.width !== bestSize.css) it.el.style.width = bestSize.css;
      it.el.style.transform = `translate3d(${best.x0.toFixed(1)}px, ${best.y0.toFixed(1)}px, 0)`;
      it.el.style.opacity = (it.a * calm).toFixed(3);
      it.el.style.visibility = it.a * calm > 0.002 ? 'visible' : 'hidden';
      const on = it.on ? it.a > 0.35 : it.a > 0.6;
      if (on !== it.on) { it.on = on; it.el.classList.toggle('is-in', on); it.g.classList.toggle('is-in', on); }

      // leader: Underhill's right-angle route, straight up / down from the pin, then across into the
      // card's nearer side (or straight into its top / bottom edge when the pin sits under or over
      // it). When that vertical leg would run up the subject itself (a pin at the foot of a mast),
      // it goes across first instead: whichever route spends less of its length over the subject.
      if (!pin) { it.g.style.visibility = 'hidden'; continue; }
      const ax = pin.x, ay = pin.y, cl = best.x0, cr = best.x1, ct = best.y0, cb = best.y1;
      const P = (x, y) => ({ x, y });
      let route;
      if (ax >= cl + 12 && ax <= cr - 12) {
        // straight down / up into the card; if that drop runs through the subject, step aside to
        // the card's nearer corner first and drop clear of it
        const edge = ay > cb ? cb : ct;
        route = [P(ax, ay), P(ax, edge)];
        if (it.hulls.length) {
          let cost = routeCost(route, it.hulls);
          for (const bx of [cl + 14, cr - 14]) {
            const alt = [P(ax, ay), P(bx, ay), P(bx, edge)];
            const c2 = routeCost(alt, it.hulls);
            if (c2 < cost - 4) { route = alt; cost = c2; }
          }
        }
      } else {
        const sx = ax < cl ? cl : cr;
        const yj = Math.min(cb - 16, Math.max(ct + 16, ay));
        route = [P(ax, ay), P(ax, yj), P(sx, yj)];
        if (Math.abs(yj - ay) > 1 && it.hulls.length) {
          const bx = ax < cl ? cl - 22 : cr + 22;
          const across = [P(ax, ay), P(bx, ay), P(bx, yj), P(sx, yj)];
          if (routeCost(across, it.hulls) < routeCost(route, it.hulls) - 4) route = across;
        }
      }
      // phones: a leader that would still cut across the subject is left out (the card names it)
      if (condensed && it.hulls.length && routeCost(route, it.hulls) > 24) { it.g.style.visibility = 'hidden'; continue; }
      it.g.firstElementChild.setAttribute('points', route.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' '));
      for (const dot of it.g.querySelectorAll('circle')) { dot.setAttribute('cx', ax.toFixed(1)); dot.setAttribute('cy', ay.toFixed(1)); }
      it.g.style.setProperty('--d', it.el.style.getPropertyValue('--d') || '0s');
      it.g.style.opacity = (it.a * calm).toFixed(3);
      it.g.style.visibility = 'visible';
    }
  }
}
