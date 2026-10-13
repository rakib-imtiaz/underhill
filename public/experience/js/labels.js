// Part labels: HTML text in side columns with thin SVG leader lines to an anchor on each part.
// Layout runs every frame against the live camera, so labels follow the parts while they settle.
//  · columns mode (landscape): labels split left/right of the subject, sorted by anchor height,
//    then relaxed so they never overlap; leaders run horizontally out of the column, then diagonally.
//  · dots mode (tablets in portrait): no text in the picture and no leader lines at all. Each part
//    in view gets a numbered dot on its anchor; the names are a legend of numbered chips in the
//    caption card (main.js), and a tap on a chip or a dot shows that part's name beside its dot.
//  · spot mode (phones, 2026-10-14): one part at a time (main.js picks it and cycles): a small marker
//    on its anchor, one thin leader and its name in a pill, out to the side of the part away from the
//    subject's middle. A change of part fades the old name out and the new one in. A tap on the name
//    calls onSpotTap (main.js shows the next part).
// An anchor hidden behind another part keeps full-contrast text, with a dashed leader.
import * as THREE from 'three';

const SVGNS = 'http://www.w3.org/2000/svg';
const tmp = new THREE.Vector3();
const ray = new THREE.Raycaster();

/** Resolve a label spec against a model root into { obj, local } (anchor point in obj space). */
export function resolveAnchor(root, spec) {
  root.updateMatrixWorld(true);
  const node = root.getObjectByName(spec.node);
  if (!node) return null;
  // candidate meshes: under the node, optionally filtered by name
  const meshes = [];
  node.traverse((o) => {
    if (!(o.isMesh || o.isInstancedMesh) || o.userData.showcaseOwned) return;
    if (o !== node && !spec.deep && !spec.meshes && o.parent !== node && !o.isInstancedMesh) return;
    if (spec.meshes && !spec.meshes.test(o.name)) return;
    meshes.push(o);
  });
  if (!meshes.length) {
    // nothing to hit (e.g. the meshes were instanced onto an ancestor): use the node origin
    return { obj: node, node, local: new THREE.Vector3() };
  }
  if (spec.span) {
    // a point part-way along the longest reach of the geometry (e.g. mid-span of a blade)
    let best = null; let bestD = -1;
    const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
    for (const m of meshes) {
      const p = m.geometry.attributes.position;
      const im = new THREE.Matrix4();
      if (m.isInstancedMesh) m.getMatrixAt(0, im);
      const toNode = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld).multiply(im);
      for (let i = 0; i < p.count; i += 3) {
        tmp.fromBufferAttribute(p, i).applyMatrix4(toNode);
        const d = tmp.x * tmp.x + tmp.z * tmp.z;
        if (d > bestD) { bestD = d; best = tmp.clone(); }
      }
    }
    return { obj: node, node, local: best.multiplyScalar(spec.span) };
  }
  // surface anchor: cast from outside the part toward its centre along -dir
  const box = new THREE.Box3();
  for (const m of meshes) box.expandByObject(m, false);
  const c = box.getCenter(new THREE.Vector3());
  const dir = new THREE.Vector3(...(spec.dir || [0, 0.3, 1])).normalize();
  const from = c.clone().addScaledVector(dir, 2);
  ray.set(from, dir.clone().negate());
  ray.far = 4;
  const hits = ray.intersectObjects(meshes, false);
  const hitObj = hits[0]?.object || meshes[0];
  const p = hits[0]?.point || c;
  // pull 1 mm out of the surface so the anchor never z-fights inside it
  p.addScaledVector(dir, 0.001);
  // attach to the hit mesh's nearest node so it rides that part when it moves
  const obj = hits[0] ? (hitObj.isInstancedMesh ? node : hitObj) : node;
  return { obj, node, local: obj.worldToLocal(p.clone()) };
}

export class Labels {
  constructor(layer, svg) {
    this.layer = layer;
    this.svg = svg;
    this.items = new Map();     // id → { el, path, dot, side, … }
    this.frame = 0;
    // spot mode: one name, one leader, one marker (shared by every part)
    this.spotEl = document.createElement('button');
    this.spotEl.type = 'button';
    this.spotEl.className = 'spot';
    this.spotEl.tabIndex = -1;   // (the caption card's part line is the keyboard's way: main.js)
    this.spotEl.addEventListener('click', () => this.onSpotTap?.());
    layer.appendChild(this.spotEl);
    this.spotLead = document.createElementNS(SVGNS, 'polyline');
    this.spotLead.setAttribute('class', 'spot-lead');
    this.spotRing = document.createElementNS(SVGNS, 'circle');
    this.spotRing.setAttribute('class', 'spot-ring'); this.spotRing.setAttribute('r', '9');
    this.spotDot = document.createElementNS(SVGNS, 'circle');
    this.spotDot.setAttribute('class', 'spot-dot'); this.spotDot.setAttribute('r', '4');
    svg.append(this.spotLead, this.spotRing, this.spotDot);
    this.spot = { shown: null, k: 0, side: 0, w: 0, h: 0, on: true };
    this.spotInfo = null;   // { id, text, n, N, a } of the part named now (main.js: the caption line)
    this.hideSpot();
  }

  /** Install a new label set (model swap / chapter change). */
  set(key, list) {
    if (this.key === key) return;
    this.key = key;
    for (const it of this.items.values()) { it.el.remove(); it.path.remove(); it.dot.remove(); it.pin.remove(); }
    this.items.clear();
    this.highlight = null;
    list.forEach((l, i) => {
      const el = document.createElement('div');
      el.className = 'label';
      el.innerHTML = `<span class="label__idx">${String(i + 1).padStart(2, '0')}</span><span class="label__text"><span class="label__full"></span><span class="label__short"></span></span>`;
      el.querySelector('.label__full').textContent = l.text;
      el.querySelector('.label__short').textContent = l.short || l.text;
      this.layer.appendChild(el);
      const path = document.createElementNS(SVGNS, 'polyline');
      path.setAttribute('class', 'leader');
      const dot = document.createElementNS(SVGNS, 'circle');
      dot.setAttribute('class', 'leader-dot'); dot.setAttribute('r', '2.6');
      this.svg.append(path, dot);
      // the dot used in dots mode: the part's number, and its name shown on demand
      const pin = document.createElement('div');
      pin.className = 'label-dot';
      pin.innerHTML = `<b></b><span class="label-dot__name"></span>`;
      pin.firstChild.textContent = String(i + 1);
      pin.lastChild.textContent = l.short || l.text;
      pin.addEventListener('click', () => this.toggle(l.id));
      this.layer.appendChild(pin);
      this.items.set(l.id, { ...l, n: i + 1, el, path, dot, pin, side: 0, w: 0, h: 0, occluded: false, occVotes: 0, measured: false });
    });
  }

  clear() { this.set(null, []); }

  /** Dots mode: show (or hide again) one part's name beside its dot. */
  toggle(id) { this.highlight = this.highlight === id ? null : id; this.onChange?.(); }

  /** Dots mode: the parts now in view, in number order, for the legend. */
  inView() {
    const out = [];
    for (const it of this.items.values()) if (it.dotShown) out.push({ id: it.id, n: it.n, text: it.short || it.text, a: it.a });
    return out.sort((a, b) => a.n - b.n);
  }

  /** Mark the current set stale so the next set() call rebuilds (or clears) it. */
  invalidate() { this.key = Symbol('stale'); }

  /**
   * @param {THREE.Camera} camera
   * @param {object} view   { w, h } picture size in CSS px (the label layer has the same box)
   * @param {Map<string, number>} alpha  per-label visibility 0..1
   * @param {object} opt    { mode: 'columns'|'bands', subject: Vector3 (world centre), root, occlusion: bool }
   */
  update(camera, view, alpha, opt) {
    this.frame++;
    this.dt = opt.dt ?? 0;   // seconds since the last frame (0 = a still / review frame: no easing)
    const vis = [];
    // a label's arrival follows the explode, and during a move the explode runs through a label's
    // fade window in two or three frames: it popped on. Its alpha now eases over about a tenth of a
    // second on the clock (still frames and review frames: exact)
    const ka = this.dt > 0 ? 1 - Math.exp(-this.dt / 0.08) : 1;
    for (const it of this.items.values()) {
      const target = alpha.get(it.id) || 0;
      it.aS = ka >= 1 || it.aS === undefined ? target : it.aS + (target - it.aS) * ka;
      if (Math.abs(it.aS - target) < 0.004) it.aS = target;
      const a = it.aS;
      if (a <= 0.003 || !it.obj) { this.hide(it); continue; }
      it.obj.updateWorldMatrix(true, false);
      it.world = (it.world || new THREE.Vector3()).copy(it.local).applyMatrix4(it.obj.matrixWorld);
      tmp.copy(it.world).project(camera);
      if (tmp.z > 1) { this.hide(it); continue; }   // behind the camera: nothing sensible to point at
      it.sx = (tmp.x * 0.5 + 0.5) * view.w;
      it.sy = (-tmp.y * 0.5 + 0.5) * view.h;
      it.a = a;
      if (opt.mode === 'dots' || opt.mode === 'spot') { vis.push(it); continue; }
      if (!it.measured || it.modeMeasured !== opt.mode) {
        it.el.style.visibility = 'hidden'; it.el.style.opacity = '0';
        it.el.dataset.mode = opt.mode;
        it.w = it.el.offsetWidth; it.h = it.el.offsetHeight;
        it.measured = true; it.modeMeasured = opt.mode;
      }
      vis.push(it);
    }
    if (opt.mode !== 'spot' || !vis.length) this.hideSpot();
    if (!vis.length) return;
    if (opt.mode === 'dots') { this.layoutDots(vis, view); return; }
    if (opt.mode === 'spot') { this.layoutSpot(vis, view, opt); return; }
    for (const it of vis) this.hideDot(it);

    // occlusion: is something else in front of the anchor? A raycast through a whole model costs a
    // few ms, so it is spread out: one label per frame, round-robin (all of them for review frames),
    // never a burst of ten in one frame (that was a 20+ ms hitch every fourth frame)
    if (opt.occlusion && opt.root) {
      camera.getWorldPosition(tmp);
      ray.camera = camera;                       // sprites (LED halos) need it to raycast
      const n = vis.length, per = opt.forceOcclusion ? n : Math.min(n, 1);
      this.rr = ((this.rr || 0) + per) % Math.max(1, n);
      for (let j = 0; j < per; j++) {
        const it = vis[(this.rr + j) % n];
        const to = it.world.clone().sub(tmp); const dist = to.length();
        ray.set(tmp, to.normalize()); ray.far = dist + 0.01;
        const hit = ray.intersectObject(opt.root, true).find((h) => h.object.visible && !h.object.isSprite && !h.object.userData.showcaseOwned && h.object.material && !h.object.material.transparent);
        const occ = !!hit && hit.distance < dist - 0.012 && !isUnder(hit.object, it.node || it.obj);
        // hysteresis: an anchor near another part's silhouette used to flip solid ↔ dashed on every
        // check while the camera moved. A change now needs two checks in a row that agree (review
        // frames: at once)
        if (occ === it.occluded || opt.forceOcclusion) { it.occluded = occ; it.occVotes = 0; }
        else if (++it.occVotes >= 2) { it.occluded = occ; it.occVotes = 0; }
      }
    }

    const c = tmp.copy(opt.subject).project(camera);
    const cx = (c.x * 0.5 + 0.5) * view.w; const cy = (-c.y * 0.5 + 0.5) * view.h;
    if (opt.mode === 'bands') this.layoutBands(vis, view, cx, cy, opt);
    else this.layoutColumns(vis, view, cx, opt);
  }

  hideSpot() {
    this.spotInfo = null;
    if (!this.spot.on && this.spot.shown === null) return;
    this.spotEl.style.visibility = 'hidden'; this.spotEl.style.opacity = '0';
    for (const e of [this.spotLead, this.spotRing, this.spotDot]) e.style.visibility = 'hidden';
    this.spot.on = false; this.spot.shown = null; this.spot.k = 0;
  }

  /** Spot mode: the one part opt.spot (an id) named beside it; every other part unmarked. */
  layoutSpot(vis, view, opt) {
    for (const it of vis) {
      if (it.shown) { it.el.style.opacity = '0'; it.el.style.visibility = 'hidden'; it.path.style.opacity = '0'; it.dot.style.opacity = '0'; it.shown = false; }
      this.hideDot(it);
    }
    const S = this.spot, dt = this.dt;
    // the change of part: the name shown fades out (0.14 s), then the new one fades in (0.22 s)
    // (a still or review frame: at once)
    if (S.shown !== (opt.spot ?? null)) {
      if (dt > 0 && S.shown !== null && S.k > 0) S.k = Math.max(0, S.k - dt / 0.14);
      else S.k = 0;
      if (S.k <= 0) {
        S.shown = opt.spot ?? null;
        const it = S.shown !== null ? this.items.get(S.shown) : null;
        if (it) {
          this.spotEl.textContent = it.short || it.text;
          this.spotEl.style.visibility = 'hidden';
          S.w = this.spotEl.offsetWidth; S.h = this.spotEl.offsetHeight;
          S.side = 0;
        }
        if (dt <= 0) S.k = 1;
      }
    } else if (S.shown !== null) S.k = dt > 0 ? Math.min(1, S.k + dt / 0.22) : 1;
    const it = S.shown !== null ? vis.find((v) => v.id === S.shown) : null;
    const inBand = it && it.sy > view.bandTop + 6 && it.sy < view.bandBottom - 6 && it.sx > 6 && it.sx < view.w - 6;
    if (!inBand) {
      this.spotEl.style.visibility = 'hidden';
      for (const e of [this.spotLead, this.spotRing, this.spotDot]) e.style.visibility = 'hidden';
      S.on = false; this.spotInfo = null; this._spotRect = null;
      return;
    }
    const W = view.w, top = view.bandTop + 8, bottom = view.bandBottom - 8, M = 12;
    const ax = it.sx, ay = it.sy, w = S.w, h = S.h;
    // the side: away from the subject's middle (kept while there is room, so it never flips per frame)
    const box = opt.subjectBox, cx = box && Number.isFinite(box.minX) ? (box.minX + box.maxX) / 2 : W / 2;
    const fits = (side) => (side < 0 ? ax - 34 - w >= M : ax + 34 + w <= W - M);
    let side = S.side || (ax < cx ? -1 : 1);
    if (!fits(side) && fits(-side)) side = -side;
    S.side = side;
    let lx, ly, ex, ey, run;
    if (fits(side)) {
      // beside it, a little above: the leader rises out of the marker and runs level into the name
      lx = side < 0 ? ax - 34 - w : ax + 34;
      ly = Math.min(bottom - h, Math.max(top, ay - 22 - h / 2));
      ey = ly + h / 2; ex = side < 0 ? lx + w : lx; run = ex + (side < 0 ? 10 : -10);
    } else {
      // no room either side (a long name on a part near the middle): above it, or below it near the top
      lx = Math.min(W - M - w, Math.max(M, ax - w / 2));
      const above = ay - 40 - h >= top;
      ly = above ? ay - 40 - h : Math.min(bottom - h, ay + 40);
      ex = Math.min(lx + w - 14, Math.max(lx + 14, ax)); ey = above ? ly + h : ly; run = null;
    }
    const a = Math.min(1, it.a * 1.15) * S.k;
    this.spotEl.style.transform = `translate3d(${lx.toFixed(1)}px, ${ly.toFixed(1)}px, 0)`;
    this.spotEl.style.opacity = a.toFixed(3);
    this.spotEl.style.visibility = a > 0.01 ? 'visible' : 'hidden';
    this.spotEl.style.pointerEvents = a > 0.5 ? 'auto' : 'none';
    const pts = run === null ? [[ax, ay], [ex, ey]] : [[ax, ay], [run, ey], [ex, ey]];
    this.spotLead.setAttribute('points', pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '));
    for (const c of [this.spotRing, this.spotDot]) { c.setAttribute('cx', ax.toFixed(1)); c.setAttribute('cy', ay.toFixed(1)); }
    this.spotLead.style.opacity = a.toFixed(3); this.spotDot.style.opacity = a.toFixed(3); this.spotRing.style.opacity = (a * 0.55).toFixed(3);
    for (const e of [this.spotLead, this.spotRing, this.spotDot]) e.style.visibility = a > 0.01 ? 'visible' : 'hidden';
    S.on = true;
    this._spotRect = { x0: lx, y0: ly, x1: lx + w, y1: ly + h, ax, ay };
    this.spotInfo = { id: it.id, text: it.short || it.text, n: it.n, N: this.items.size, a: it.a };
  }

  hide(it) {
    if (it.shown) { it.el.style.opacity = '0'; it.el.style.visibility = 'hidden'; it.path.style.opacity = '0'; it.dot.style.opacity = '0'; it.shown = false; }
    this.hideDot(it);
  }
  hideDot(it) {
    if (!it.dotShown) return;
    it.pin.style.visibility = 'hidden'; it.pin.style.opacity = '0'; it.pin.classList.remove('is-on'); it.dotShown = false;
  }

  /** Dots mode: a numbered dot on each part in view; dots that would touch are pushed apart. */
  layoutDots(vis, view) {
    for (const it of vis) {
      // the text label and its leader are never shown in this mode
      if (it.shown) { it.el.style.opacity = '0'; it.el.style.visibility = 'hidden'; it.path.style.opacity = '0'; it.dot.style.opacity = '0'; it.shown = false; }
      it.dx = it.sx; it.dy = it.sy;
    }
    const MIN = 31;   // dot 22 px plus its ring: dots never touch
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
        const a = vis[i], b = vis[j];
        let ex = b.dx - a.dx, ey = b.dy - a.dy; let d = Math.hypot(ex, ey);
        if (d >= MIN) continue;
        if (d < 1e-3) { ex = 1; ey = 0; d = 1; }
        const push = (MIN - d) / 2;
        a.dx -= (ex / d) * push; a.dy -= (ey / d) * push; b.dx += (ex / d) * push; b.dy += (ey / d) * push;
      }
    }
    for (const it of vis) {
      const x = Math.min(view.w - 14, Math.max(14, it.dx)), y = Math.min(view.bandBottom - 14, Math.max(view.bandTop + 14, it.dy));
      it.pin.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      it.pin.style.opacity = String(Math.min(1, it.a * 1.2));
      it.pin.style.visibility = 'visible';
      it.pin.classList.toggle('is-on', this.highlight === it.id);
      it.pin.classList.toggle('is-left', x > view.w * 0.58);
      it.dotShown = true;
    }
  }

  layoutColumns(vis, view, cx, opt) {
    const W = view.w, H = view.h;
    const colW = Math.min(250, W * 0.2);
    const pad = Math.max(18, W * 0.035);
    // the columns hug the subject (short, tidy leaders): just outside its projected box, but never
    // closer to the screen edge than a label needs, nor further out than the old fixed columns
    const box = opt.subjectBox;
    const gapX = Math.max(44, W * 0.035);
    // (the widest label of the whole set, not of those on screen now: when the widest one faded out,
    // both columns used to shift sideways by the difference in one frame)
    let wl = 0;
    for (const it of this.items.values()) if (it.measured) wl = Math.max(wl, it.w);
    let leftEdge = pad + colW, rightEdge = W - pad - colW;
    if (box && Number.isFinite(box.minX)) {
      leftEdge = Math.max(pad + wl, Math.min(W * 0.5 - 40, box.minX - gapX));
      rightEdge = Math.min(W - pad - wl, Math.max(W * 0.5 + 40, box.maxX + gapX));
    }
    // side assignment with hysteresis, then balance the two columns
    for (const it of vis) {
      const s = it.sx < cx ? -1 : 1;
      if (!it.side || Math.abs(it.sx - cx) > W * 0.04) it.side = s;
    }
    const L = vis.filter((v) => v.side < 0), R = vis.filter((v) => v.side > 0);
    while (L.length - R.length > 1) { L.sort((a, b) => b.sx - a.sx); const m = L.shift(); m.side = 1; R.push(m); }
    while (R.length - L.length > 1) { R.sort((a, b) => a.sx - b.sx); const m = R.shift(); m.side = -1; L.push(m); }
    // a label that changes column (the camera swung its anchor across the subject) used to jump across
    // the picture in one frame; it fades out of its old place and in at the new one instead
    if (this.dt > 0) for (const it of vis) { if (it.shown && it.drawnSide && it.drawnSide !== it.side) { it.aS = 0; it.a = 0; } }
    for (const it of vis) it.drawnSide = it.side;
    const top = opt.colTop ?? H * 0.08, bottom = opt.colBottom ?? H * 0.92;
    for (const [list, side] of [[L, -1], [R, 1]]) {
      list.sort((a, b) => a.sy - b.sy);
      const ys = list.map((it) => it.sy);
      const gap = 10;
      // forward pass: push down; backward pass: pull up; clamp to the column
      for (let i = 0; i < list.length; i++) {
        const minY = i === 0 ? top + list[i].h / 2 : ys[i - 1] + (list[i - 1].h + list[i].h) / 2 + gap;
        ys[i] = Math.max(ys[i], minY);
      }
      for (let i = list.length - 1; i >= 0; i--) {
        const maxY = i === list.length - 1 ? bottom - list[i].h / 2 : ys[i + 1] - (list[i + 1].h + list[i].h) / 2 - gap;
        ys[i] = Math.min(ys[i], maxY);
      }
      // Each label sits at its anchor's height plus an offset that keeps the column from overlapping.
      // When two anchors pass each other the column's order swaps and both offsets jump by a label's
      // height: drawn as is, the two labels trade places in one frame. The offset glides instead
      // (about 0.1 s), while the label still follows its anchor exactly. (no clock: snap)
      const k = this.dt > 0 ? 1 - Math.exp(-this.dt / 0.1) : 1;
      list.forEach((it, i) => {
        const off = ys[i] - it.sy;
        if (k >= 1 || !it.shown || it.offY === undefined || it.offSide !== side) it.offY = off;
        else it.offY += (off - it.offY) * k;
        it.offSide = side;
        const y = Math.min(bottom - it.h / 2, Math.max(top + it.h / 2, it.sy + it.offY));
        const x0 = side < 0 ? leftEdge : rightEdge;            // column edge facing the subject
        const run = Math.min(34, W * 0.025);                   // short horizontal run toward the subject
        const start = x0 - side * 8;
        const elbow = x0 - side * (8 + run);
        const left = side < 0 ? leftEdge - it.w : rightEdge;
        this.place(it, left, y - it.h / 2, [[start, y], [elbow, y], [it.sx, it.sy]], side);
      });
    }
  }

  layoutBands(vis, view, cx, cy, opt) {
    const W = view.w, H = view.h;
    const T = vis.filter((v) => v.sy < cy), B = vis.filter((v) => v.sy >= cy);
    while (T.length - B.length > 1) { T.sort((a, b) => b.sy - a.sy); B.push(T.shift()); }
    while (B.length - T.length > 1) { B.sort((a, b) => a.sy - b.sy); T.push(B.shift()); }
    const pad = 12;
    for (const [list, band] of [[T, -1], [B, 1]]) {
      if (!list.length) continue;
      list.sort((a, b) => a.sx - b.sx);
      const perRow = Math.min(list.length, 3);
      const rows = Math.ceil(list.length / perRow);
      const cellW = (W - pad * 2) / perRow;
      const rowH = 30;
      // hug the subject: the band sits just outside its projected box (but inside the free area)
      const top = opt.subjectBox ? Math.max(opt.bandTop, opt.subjectBox.minY - rows * rowH - 16) : opt.bandTop;
      const bottom = opt.subjectBox ? Math.min(opt.bandBottom, opt.subjectBox.maxY + rows * rowH + 16) : opt.bandBottom;
      list.forEach((it, i) => {
        const row = Math.floor(i / perRow), col = i % perRow;
        // fill rows from the outside in so leaders from inner rows stay short
        const r = band < 0 ? row : rows - 1 - row;
        const y = band < 0 ? top + r * rowH : bottom - (rows - r) * rowH;
        const x = pad + col * cellW;
        const ax = x + cellW / 2;
        const ay = band < 0 ? y + it.h : y;
        this.place(it, x + (cellW - it.w) / 2, y, [[ax, ay + band * 2], [ax, ay + band * 10], [it.sx, it.sy]], band, true);
      });
    }
  }

  place(it, left, top, pts, side, centred = false) {
    const a = it.a;
    const occ = it.occluded;
    it.el.style.visibility = 'visible';
    it.el.style.opacity = String(Math.min(1, a * 1.15));
    const slide = (1 - Math.min(1, a * 1.3)) * 10 * (centred ? 0 : side);
    it.el.style.transform = `translate3d(${(left + slide).toFixed(1)}px, ${top.toFixed(1)}px, 0)`;
    it.el.classList.toggle('is-right', side > 0 && !centred);
    it.el.classList.toggle('is-occluded', occ);
    // leader grows from the label to the anchor as the label arrives
    const grow = Math.min(1, a * 1.25);
    const out = [pts[0]];
    let total = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); total += l; }
    let remain = total * grow;
    for (let i = 1; i < pts.length; i++) {
      if (remain <= 0) break;
      const l = seg[i - 1];
      if (remain >= l) { out.push(pts[i]); remain -= l; } else {
        const k = remain / l;
        out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]); remain = 0;
      }
    }
    it.path.setAttribute('points', out.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '));
    it.path.style.opacity = String(Math.min(1, a * 1.2));
    it.path.classList.toggle('is-occluded', occ);
    const last = pts[pts.length - 1];
    it.dot.setAttribute('cx', last[0].toFixed(1)); it.dot.setAttribute('cy', last[1].toFixed(1));
    it.dot.style.opacity = String(grow >= 0.999 ? 1 : 0);
    it.shown = true;
  }
}

function isUnder(obj, ancestor) {
  for (let o = obj; o; o = o.parent) if (o === ancestor) return true;
  // the anchor may be on a sibling mesh of the same node
  return obj.parent && ancestor.parent && obj.parent === ancestor.parent;
}
