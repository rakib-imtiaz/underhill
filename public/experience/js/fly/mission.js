// Fly mode: the mapping mission. An area (an oriented rectangle) is covered by a lawnmower of flight
// lines planned from a P1-like camera (35 mm lens on a 35.9 × 24 mm, 8192 × 5460 px sensor, the long
// side across the track): line spacing from the side overlap, the trigger distance from the front
// overlap, the GSD from the height. Heights are relative to the take-off point (as DJI Pilot plans).
import * as THREE from 'three';
import { ground } from './query.js';

export const P1 = { f: 35, sw: 35.9, sh: 24.0, px: 8192, py: 5460 };
export const ALTS = [40, 60, 80, 100];
export const OVERLAPS = [0.7, 0.8];
const MAX_LINES = 40;

/**
 * @param {{cx:number, cz:number, w:number, h:number, rot:number}} r  centre, size along / across the
 *   lines (m) and the lines' bearing in the scene (rad, about +y)
 * @param {number} alt  height above the take-off point (m)
 * @param {number} overlap  front and side overlap (0.7 | 0.8)
 * @param {number} homeY  the take-off point's scene height
 */
export function planMission(r, alt, overlap, homeY = 0) {
  const across = alt * P1.sw / P1.f, along = alt * P1.sh / P1.f;
  const spacingMax = across * (1 - overlap), photoEvery = along * (1 - overlap);
  const n = Math.min(MAX_LINES, Math.max(2, Math.ceil(r.h / spacingMax) + 1));
  const spacing = r.h / (n - 1);
  const gsd = alt * 100 * (P1.sw / P1.px) / P1.f;           // cm / px
  const c = Math.cos(r.rot), s = Math.sin(r.rot);
  const W = (a, b) => ({ x: r.cx + a * s + b * c, z: r.cz + a * c - b * s });   // a along the lines (bearing rot), b across
  const lines = [];
  for (let i = 0; i < n; i++) {
    const b = -r.h / 2 + i * spacing, dir = i % 2 === 0 ? 1 : -1;
    lines.push([W(-dir * r.w / 2, b), W(dir * r.w / 2, b)]);
  }
  const speed = Math.min(12, photoEvery / 1.6);               // ≥ 1.6 s between stills
  const perLine = Math.floor(r.w / photoEvery + 1e-6) + 1;
  const length = n * r.w + (n - 1) * spacing;
  const area = [W(-r.w / 2, -r.h / 2), W(r.w / 2, -r.h / 2), W(r.w / 2, r.h / 2), W(-r.w / 2, r.h / 2)].map((p) => [p.x, p.z]);
  return {
    rect: { ...r }, alt, overlap, y: homeY + alt, lines, photoEvery, spacing, spacingMax, gsd, speed,
    photos: perLine * n, length, time: length / speed, area, footprint: [across, along],
    route: lines.flatMap(([a, b]) => [[a.x, a.z], [b.x, b.z]]),
  };
}

/** An oriented rectangle from 2 drag corners (axis-aligned) or from 4 taps (their bounding box along the first edge). */
export function rectFromCorners(pts) {
  if (pts.length === 2) {
    const [[x0, z0], [x1, z1]] = pts;
    const w = Math.abs(x1 - x0), h = Math.abs(z1 - z0);
    // lines along the longer side
    return w >= h ? { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w, h, rot: Math.PI / 2 } : { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: h, h: w, rot: 0 };
  }
  const [a, b] = pts;
  const rot = Math.atan2(b[0] - a[0], b[1] - a[1]);
  const c = Math.cos(rot), s = Math.sin(rot);
  let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
  for (const [x, z] of pts) {
    const al = x * s + z * c, ac = x * c - z * s;
    amin = Math.min(amin, al); amax = Math.max(amax, al); bmin = Math.min(bmin, ac); bmax = Math.max(bmax, ac);
  }
  const am = (amin + amax) / 2, bm = (bmin + bmax) / 2;
  const r = { cx: am * s + bm * c, cz: am * c - bm * s, w: amax - amin, h: bmax - bmin, rot };
  if (r.h > r.w) { [r.w, r.h] = [r.h, r.w]; r.rot += Math.PI / 2; }
  return r;
}

/** 3D: the area draped on the ground (dashed look via a faint line) and the route at flight height. */
export class MissionView {
  constructor(scene) {
    const ag = new THREE.BufferGeometry();
    this.areaPos = new THREE.BufferAttribute(new Float32Array(4 * 16 * 3 + 3), 3); this.areaPos.setUsage(THREE.DynamicDrawUsage);
    ag.setAttribute('position', this.areaPos);
    this.area = new THREE.Line(ag, new THREE.LineBasicMaterial({ color: 0x7dffc4, transparent: true, opacity: 0.85, depthWrite: false }));
    const rg = new THREE.BufferGeometry();
    this.routePos = new THREE.BufferAttribute(new Float32Array(MAX_LINES * 2 * 3), 3); this.routePos.setUsage(THREE.DynamicDrawUsage);
    rg.setAttribute('position', this.routePos);
    this.route = new THREE.Line(rg, new THREE.LineBasicMaterial({ color: 0x7dffc4, transparent: true, opacity: 0.4, depthWrite: false }));
    for (const o of [this.area, this.route]) { o.frustumCulled = false; o.visible = false; o.renderOrder = 3; scene.add(o); }
    this.area.name = 'fly:mission-area'; this.route.name = 'fly:mission-route';
  }

  set(plan) {
    if (!plan) { this.area.visible = this.route.visible = false; return; }
    const a = this.areaPos.array; let k = 0;
    for (let e = 0; e < 4; e++) {
      const [x0, z0] = plan.area[e], [x1, z1] = plan.area[(e + 1) % 4];
      for (let i = 0; i < 16; i++) { const t = i / 16, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; a[k++] = x; a[k++] = ground(x, z) + 0.08; a[k++] = z; }
    }
    a[k++] = a[0]; a[k++] = a[1]; a[k++] = a[2];
    this.areaPos.needsUpdate = true;
    this.area.geometry.setDrawRange(0, 65);
    const r = this.routePos.array; k = 0;
    for (const [x, z] of plan.route) { r[k++] = x; r[k++] = plan.y; r[k++] = z; }
    this.routePos.needsUpdate = true;
    this.route.geometry.setDrawRange(0, plan.route.length);
    this.area.visible = this.route.visible = true;
  }
}
