// Fly mode: the 2D map layers, drawn by one function for both the corner minimap (north up, centred on
// the drone) and the full-screen Map view (over the orthographic 3D render).
//
//   base     the flying area (±650 m): the ground shader's own colours under a hillshade, 5 m contours,
//            the creek, the access track and every near tree, computed once
//   ortho    a top-down daylight render of the area (the "orthomosaic"), revealed under each photo's
//            footprint as photos are taken (a clip per footprint, drawn once into the reveal layer)
//   overlay  geofence, parcel, GCPs, viewpoints, home, mission area and route, footprints, the drone
//            with its camera's view cone, a go-to target
import { parcelCorners } from '../field.js';
import { ground, groundColorAt, creekZ, TRACK } from './terrain.js';
import { GEOFENCE } from './world.js';

export const HALF = 650;
const N = 384;                 // base raster (1300 m → 3.4 m / px)

export class MapLayers {
  constructor(world) {
    this.world = world;
    this.base = document.createElement('canvas'); this.base.width = this.base.height = N;
    this.reveal = document.createElement('canvas'); this.reveal.width = this.reveal.height = 1024;
    this.ortho = null;
    this.footprints = [];
    this.buildBase();
  }

  buildBase() {
    const g = this.base.getContext('2d');
    const img = g.createImageData(N, N);
    const H = new Float32Array((N + 1) * (N + 1));
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) H[j * (N + 1) + i] = ground(-HALF + (i / N) * 2 * HALF, -HALF + (j / N) * 2 * HALF);
    let lo = Infinity, hi = -Infinity;
    for (const h of H) { lo = Math.min(lo, h); hi = Math.max(hi, h); }
    const cell = (2 * HALF) / N;
    const L = [-0.5, 0.7, -0.5]; const ln = Math.hypot(...L);
    const srgb = (v) => 255 * Math.min(1, v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const h = H[j * (N + 1) + i], hx = H[j * (N + 1) + i + 1], hz = H[(j + 1) * (N + 1) + i];
      const nx = -(hx - h) / cell, nz = -(hz - h) / cell, ny = 1, nn = Math.hypot(nx, ny, nz);
      const shade = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / (nn * ln));
      const x = -HALF + (i + 0.5) * cell, z = -HALF + (j + 0.5) * cell;
      const c = groundColorAt(x, z);
      const k = (0.55 + 1.5 * shade) * 1.6;
      const step = 5, lvl = (v) => Math.floor(v / step);
      const line = lvl(h) !== lvl(hx) || lvl(h) !== lvl(hz);
      const lc = line ? 0.78 : 1;
      const p = (j * N + i) * 4;
      img.data[p] = srgb(c[0] * k) * lc; img.data[p + 1] = srgb(c[1] * k) * lc; img.data[p + 2] = srgb(c[2] * k) * lc; img.data[p + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const P = (x, z) => [(x + HALF) / (2 * HALF) * N, (z + HALF) / (2 * HALF) * N];
    // the creek and the track
    g.strokeStyle = 'rgba(70, 120, 150, 0.95)'; g.lineWidth = 2;
    g.beginPath(); for (let x = -HALF; x <= HALF; x += 5) { const [px, pz] = P(x, creekZ(x)); if (x === -HALF) g.moveTo(px, pz); else g.lineTo(px, pz); } g.stroke();
    g.strokeStyle = 'rgba(205, 192, 168, 0.95)'; g.lineWidth = 1.4;
    g.beginPath(); TRACK.forEach(([x, z], i) => { const [px, pz] = P(x, z); if (i) g.lineTo(px, pz); else g.moveTo(px, pz); }); g.stroke();
    // trees as small dark dots
    g.fillStyle = 'rgba(10, 22, 12, 0.8)';
    for (const t of this.world.forest.trees) { const [px, pz] = P(t.x, t.z); g.beginPath(); g.arc(px, pz, Math.max(0.7, t.R / cell), 0, Math.PI * 2); g.fill(); }
    this.elev = [lo, hi];
  }

  /** The top-down daylight render (a canvas covering ±650 m), used for the reveal. */
  setOrtho(canvas) { this.ortho = canvas; }

  /** A photo was taken: its footprint reveals the orthophoto beneath it. */
  addFootprint(corners) {
    this.footprints.push(corners);
    if (this.footprints.length > 400) this.footprints.shift();
    if (!this.ortho) return;
    const g = this.reveal.getContext('2d'), S = this.reveal.width;
    g.save();
    g.beginPath();
    corners.forEach(([x, , z], i) => { const px = (x + HALF) / (2 * HALF) * S, pz = (z + HALF) / (2 * HALF) * S; if (i) g.lineTo(px, pz); else g.moveTo(px, pz); });
    g.closePath(); g.clip();
    g.drawImage(this.ortho, 0, 0, S, S);
    g.restore();
  }

  /**
   * Draw. view = { cx, cz, scale (px / m), w, h (CSS px) }. o = { base, drone {x, z, heading, cone},
   * home, viewpoints, gcps, mission {area corners, route [[x,z]...], progress, shots}, plan (corners),
   * target {x, z}, labels, fence, dpr }.
   */
  draw(ctx, view, o) {
    const { cx, cz, scale, w, h } = view;
    const X = (x) => (x - cx) * scale + w / 2, Y = (z) => (z - cz) * scale + h / 2;
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    if (o.base) {
      const s = 2 * HALF * scale;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.base, X(-HALF), Y(-HALF), s, s);
      ctx.drawImage(this.reveal, X(-HALF), Y(-HALF), s, s);
    }
    const lw = o.small ? 1 : 1.5;
    // geofence
    if (o.fence !== false) {
      ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255, 138, 61, 0.7)'; ctx.lineWidth = lw;
      ctx.strokeRect(X(-GEOFENCE), Y(-GEOFENCE), 2 * GEOFENCE * scale, 2 * GEOFENCE * scale);
      ctx.setLineDash([]);
    }
    // the staked parcel
    const pc = parcelCorners();
    ctx.strokeStyle = 'rgba(255, 170, 90, 0.85)'; ctx.lineWidth = lw;
    ctx.beginPath(); pc.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Y(z)) : ctx.moveTo(X(x), Y(z)))); ctx.closePath(); ctx.stroke();
    // footprints
    if (this.footprints.length) {
      ctx.strokeStyle = 'rgba(159, 227, 255, 0.55)'; ctx.lineWidth = o.small ? 0.6 : 1;
      ctx.beginPath();
      for (const c of this.footprints.slice(-120)) {
        ctx.moveTo(X(c[0][0]), Y(c[0][2]));
        for (let i = 1; i < 4; i++) ctx.lineTo(X(c[i][0]), Y(c[i][2]));
        ctx.closePath();
      }
      ctx.stroke();
    }
    // mission: area, route (flown part brighter), shot marks
    const m = o.mission;
    if (m) {
      ctx.setLineDash([6, 4]); ctx.strokeStyle = 'rgba(125, 255, 196, 0.9)'; ctx.lineWidth = lw;
      ctx.beginPath(); m.area.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Y(z)) : ctx.moveTo(X(x), Y(z)))); ctx.closePath(); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(125, 255, 196, 0.55)'; ctx.lineWidth = o.small ? 0.8 : 1.2;
      ctx.beginPath(); m.route.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Y(z)) : ctx.moveTo(X(x), Y(z)))); ctx.stroke();
      if (!o.small && m.route.length) {
        ctx.fillStyle = '#7dffc4'; ctx.beginPath(); ctx.arc(X(m.route[0][0]), Y(m.route[0][1]), 4, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (o.plan) {
      ctx.fillStyle = 'rgba(125, 255, 196, 0.12)'; ctx.strokeStyle = '#7dffc4'; ctx.lineWidth = 2;
      ctx.beginPath(); o.plan.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Y(z)) : ctx.moveTo(X(x), Y(z)))); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (o.planTaps) for (const [x, z] of o.planTaps) { ctx.beginPath(); ctx.arc(X(x), Y(z), 5, 0, Math.PI * 2); ctx.stroke(); }
    }
    // GCPs
    if (o.gcps) for (const t of o.gcps) {
      const s = Math.max(3, (o.small ? 2.2 : 4));
      ctx.fillStyle = '#f4f4f0'; ctx.fillRect(X(t.x) - s, Y(t.z) - s, 2 * s, 2 * s);
      ctx.fillStyle = '#111'; ctx.fillRect(X(t.x) - s, Y(t.z) - s, s, s); ctx.fillRect(X(t.x), Y(t.z), s, s);
    }
    // viewpoints
    if (o.viewpoints) {
      ctx.font = `${o.small ? 9 : 11}px "Plex Mono", ui-monospace, monospace`;
      for (const v of o.viewpoints) {
        const x = X(v.mark.x), y = Y(v.mark.z);
        ctx.fillStyle = '#5cc0f5'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.closePath(); ctx.fill(); ctx.stroke();
        if (o.labels) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; const tw = ctx.measureText(v.name).width; ctx.fillRect(x + 7, y - 8, tw + 6, 15); ctx.fillStyle = '#e9edf0'; ctx.fillText(v.name, x + 10, y + 3); }
      }
    }
    // home
    if (o.home) {
      const x = X(o.home.x), y = Y(o.home.z), r = o.small ? 5 : 8;
      ctx.fillStyle = '#ff8a3d'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0a1b2e'; ctx.font = `700 ${o.small ? 7 : 10}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', x, y + 0.5);
      ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    }
    // go-to target
    if (o.target) {
      const x = X(o.target.x), y = Y(o.target.z);
      ctx.strokeStyle = '#ffd25a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, o.small ? 4 : 8, 0, Math.PI * 2); ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y); ctx.moveTo(x, y - 12); ctx.lineTo(x, y + 12); ctx.stroke();
    }
    // the drone: its camera's view cone and an arrow
    const d = o.drone;
    if (d) {
      const x = X(d.x), y = Y(d.z);
      if (d.cone) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.13)';
        ctx.beginPath(); ctx.moveTo(x, y); d.cone.forEach(([cx2, cz2]) => ctx.lineTo(X(cx2), Y(cz2))); ctx.closePath(); ctx.fill();
      }
      const a = d.heading * Math.PI / 180, s = o.small ? 6 : 10;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#0a1b2e'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, s * 0.8); ctx.lineTo(0, s * 0.4); ctx.lineTo(-s * 0.7, s * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
}
