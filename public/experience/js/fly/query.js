// Fly mode: analytic scene queries, no three.js raycaster (the terrain is a heightfield and the trees
// are instanced cones, so both are cheaper to intersect in closed form).
//
//   rayTerrain(o, d, tMax)            ray-march + bisection against groundAt() (the rendered mesh)
//   SceneQuery.ray(o, d, tMax)        nearest hit over terrain, trees, the truck, the prism and CP-01,
//                                     with what was hit and a LiDAR intensity / colour for it
//   SceneQuery.clearance(...)         obstacle distance along a horizontal direction (obstacle sensing)
//   SceneQuery.below(x, z)            the highest surface under a point (terrain or a tree crown)
//   SceneQuery.pushOut(p)             keeps the drone out of trees and the truck
//
// Trees: each of forest.js's conifers is one cone (its crown envelope) over a trunk.
import * as THREE from 'three';
import { PRISM_GLASS } from './world.js';
import { ground as landGround, groundColorAt, fbm, WORLD } from './terrain.js';

const HALF = 650, SIZE = 2 * HALF;          // the tree grid covers the flying area
function hash(i, j) { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); }
export { fbm };

/** Ground height anywhere (the site mesh, then the far land's own triangles: terrain.js). */
export const ground = landGround;

/**
 * First intersection of the ray o + t d (d normalised) with the terrain, t ≤ tMax; Infinity if none.
 * March with a step proportional to the height above ground (safe for slopes under ~60°), then bisect.
 */
export function rayTerrain(ox, oy, oz, dx, dy, dz, tMax = 300) {
  let t = 0, prevT = 0;
  let h = oy - ground(ox, oz);
  if (h <= 0) return 0;
  for (let i = 0; i < 160 && t < tMax; i++) {
    prevT = t;
    const step = Math.max(0.2, h * 0.55 / Math.max(0.35, Math.hypot(dx, dz) + Math.max(0, -dy)));
    t = Math.min(tMax, t + step);
    const x = ox + dx * t, z = oz + dz * t;
    if (x < -WORLD || x > WORLD || z < -WORLD || z > WORLD) return Infinity;
    h = oy + dy * t - ground(x, z);
    if (h <= 0) {
      let a = prevT, b = t;
      for (let k = 0; k < 14; k++) {
        const m = (a + b) * 0.5;
        if (oy + dy * m - ground(ox + dx * m, oz + dz * m) > 0) a = m; else b = m;
      }
      return b;
    }
    if (t >= tMax) break;
  }
  return Infinity;
}

const CELL = 10, NC = Math.ceil(SIZE / CELL);

export class SceneQuery {
  /**
   * @param {object} world  World (fly/world.js): forest.trees, gcps, truckPose
   */
  constructor(world) {
    this.world = world;
    this.trees = world.forest.trees;
    this.grid = Array.from({ length: NC * NC }, () => []);
    this.trees.forEach((t, i) => {
      const x0 = Math.floor((t.x - t.R + HALF) / CELL), x1 = Math.floor((t.x + t.R + HALF) / CELL);
      const z0 = Math.floor((t.z - t.R + HALF) / CELL), z1 = Math.floor((t.z + t.R + HALF) / CELL);
      for (let a = Math.max(0, x0); a <= Math.min(NC - 1, x1); a++) for (let b = Math.max(0, z0); b <= Math.min(NC - 1, z1); b++) this.grid[b * NC + a].push(i);
    });
    // the truck as one oriented box (its local frame: +Z nose), slightly generous
    const tp = world.truckPose;
    this.truck = { x: tp.x, z: tp.z, y0: tp.y, y1: tp.y + 2.0, c: Math.cos(tp.yaw), s: Math.sin(tp.yaw), hw: 1.0, hl: 2.95 };
    this.gcps = world.gcps;
    this._seen = new Int32Array(this.trees.length);
    this._stamp = 1;
  }

  treesNear(x, z, r, fn) {
    const st = ++this._stamp;
    const x0 = Math.max(0, Math.floor((x - r + HALF) / CELL)), x1 = Math.min(NC - 1, Math.floor((x + r + HALF) / CELL));
    const z0 = Math.max(0, Math.floor((z - r + HALF) / CELL)), z1 = Math.min(NC - 1, Math.floor((z + r + HALF) / CELL));
    for (let a = x0; a <= x1; a++) for (let b = z0; b <= z1; b++) {
      for (const i of this.grid[b * NC + a]) { if (this._seen[i] === st) continue; this._seen[i] = st; if (fn(this.trees[i], i) === true) return; }
    }
  }

  /** Crown radius of tree t at height y (0 outside the crown; the trunk radius under it). */
  static radiusAt(t, y) {
    if (y < t.g || y > t.y1) return 0;
    if (y < t.y0) return t.rt;
    return t.R * (t.y1 - y) / (t.y1 - t.y0);
  }

  /** Ray vs one tree: nearest t in [0, tMax] or Infinity (bounding cylinder, then march inside it). */
  rayTree(t, ox, oy, oz, dx, dy, dz, tMax) {
    // 2D circle intersection with the crown's base radius
    const fx = ox - t.x, fz = oz - t.z;
    const a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - t.R * t.R;
    let t0, t1;
    if (a < 1e-9) { if (c > 0) return Infinity; t0 = 0; t1 = tMax; }
    else {
      const disc = b * b - 4 * a * c;
      if (disc < 0) return Infinity;
      const sq = Math.sqrt(disc);
      t0 = (-b - sq) / (2 * a); t1 = (-b + sq) / (2 * a);
    }
    t0 = Math.max(0, t0); t1 = Math.min(tMax, t1);
    if (t0 > t1) return Infinity;
    const N = 10;
    let prev = t0;
    for (let k = 0; k <= N; k++) {
      const tt = t0 + (t1 - t0) * (k / N);
      const x = ox + dx * tt - t.x, y = oy + dy * tt, z = oz + dz * tt - t.z;
      const r = SceneQuery.radiusAt(t, y);
      if (r > 0 && x * x + z * z <= r * r) {
        // refine between the previous outside sample and this one
        let lo = prev, hi = tt;
        for (let i = 0; i < 6; i++) {
          const m = (lo + hi) / 2; const mx = ox + dx * m - t.x, my = oy + dy * m, mz = oz + dz * m - t.z;
          const rr = SceneQuery.radiusAt(t, my);
          if (rr > 0 && mx * mx + mz * mz <= rr * rr) hi = m; else lo = m;
        }
        return hi;
      }
      prev = tt;
    }
    return Infinity;
  }

  /** Ray vs the truck box (slab test in its frame). */
  rayTruck(ox, oy, oz, dx, dy, dz, tMax) {
    const T = this.truck;
    const rx = ox - T.x, rz = oz - T.z;
    // world → truck local: local x = rx*c - rz*s, local z = rx*s + rz*c (inverse of the yaw used to place it)
    const lx = rx * T.c - rz * T.s, lz = rx * T.s + rz * T.c;
    const ldx = dx * T.c - dz * T.s, ldz = dx * T.s + dz * T.c;
    let t0 = 0, t1 = tMax;
    for (const [o, d, lo, hi] of [[lx, ldx, -T.hw, T.hw], [oy, dy, T.y0, T.y1], [lz, ldz, -T.hl, T.hl]]) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return Infinity; continue; }
      let a = (lo - o) / d, b = (hi - o) / d;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) return Infinity;
    }
    return t0;
  }

  /**
   * Nearest hit along a ray. Returns null or { t, x, y, z, kind, intensity, r, g, b, id? }.
   * opts.small: include the prism and CP-01 (the rangefinder wants them; the LiDAR does not).
   */
  ray(ox, oy, oz, dx, dy, dz, tMax = 300, opts = {}) {
    let best = rayTerrain(ox, oy, oz, dx, dy, dz, tMax), kind = 'ground', ti = -1;
    const reach = Math.min(best, tMax);
    // trees along the ray's ground track up to the terrain hit
    const ex = ox + dx * (Number.isFinite(reach) ? reach : tMax), ez = oz + dz * (Number.isFinite(reach) ? reach : tMax);
    const span = Math.hypot(ex - ox, ez - oz);
    const steps = Math.max(1, Math.ceil(span / CELL));
    const st = ++this._stamp;
    for (let k = 0; k <= steps; k++) {
      const cx = ox + (ex - ox) * (k / steps), cz = oz + (ez - oz) * (k / steps);
      const a0 = Math.floor((cx + HALF) / CELL), b0 = Math.floor((cz + HALF) / CELL);
      for (let a = a0 - 1; a <= a0 + 1; a++) for (let b = b0 - 1; b <= b0 + 1; b++) {
        if (a < 0 || b < 0 || a >= NC || b >= NC) continue;
        for (const i of this.grid[b * NC + a]) {
          if (this._seen[i] === st) continue; this._seen[i] = st;
          const tt = this.rayTree(this.trees[i], ox, oy, oz, dx, dy, dz, Math.min(best, tMax));
          if (tt < best) { best = tt; kind = 'tree'; ti = i; }
        }
      }
    }
    const tt = this.rayTruck(ox, oy, oz, dx, dy, dz, Math.min(best, tMax));
    if (tt < best) { best = tt; kind = 'truck'; }
    let id = null;
    if (opts.small) {
      // the prism (a 7 cm sphere round the glass) and its pole, CP-01's cap
      const sph = (cx, cy, cz, r) => {
        const fx = ox - cx, fy = oy - cy, fz = oz - cz;
        const b = fx * dx + fy * dy + fz * dz, c = fx * fx + fy * fy + fz * fz - r * r, disc = b * b - c;
        if (disc < 0) return Infinity; const t0 = -b - Math.sqrt(disc); return t0 >= 0 ? t0 : Infinity;
      };
      const tp = sph(PRISM_GLASS.x, PRISM_GLASS.y, PRISM_GLASS.z, 0.09);
      if (tp < best) { best = tp; kind = 'prism'; id = 'Prism'; }
      const tc = sph(0, 0.05, 0, 0.1);
      if (tc < best) { best = tc; kind = 'monument'; id = 'CP-01'; }
    }
    if (!(best <= tMax)) return null;
    const x = ox + dx * best, y = oy + dy * best, z = oz + dz * best;
    const hit = { t: best, x, y, z, kind, id, intensity: 0.5, r: 0.3, g: 0.3, b: 0.3 };
    this.shade(hit, ti);
    return hit;
  }

  /** LiDAR intensity and an RGB colour (linear) for a hit. */
  shade(h, ti) {
    if (h.kind === 'tree') {
      const k = 0.7 + 0.3 * hash(ti, 3);
      h.intensity = 0.22 + 0.12 * k; h.r = 0.05 * k; h.g = 0.085 * k; h.b = 0.05 * k;
      return;
    }
    if (h.kind === 'truck') {
      const T = this.truck;
      const rx = h.x - T.x, rz = h.z - T.z;
      const lx = rx * T.c - rz * T.s;
      const side = Math.abs(Math.abs(lx) - T.hw) < 0.05;
      const ly = h.y - T.y0;
      const stripe = side && ly > 0.78 && ly < 0.96;
      h.intensity = stripe ? 0.92 : 0.55; h.r = stripe ? 0.85 : 0.02; h.g = stripe ? 0.87 : 0.04; h.b = stripe ? 0.9 : 0.1;
      return;
    }
    if (h.kind === 'prism' || h.kind === 'monument') { h.intensity = 1; h.r = h.g = h.b = 0.9; return; }
    // ground: a ground control target? (checker: retro-reflective white vs matte black)
    for (const g of this.gcps) {
      const dx = h.x - g.x, dz = h.z - g.z;
      if (Math.abs(dx) > 0.75 || Math.abs(dz) > 0.75) continue;
      const ca = Math.cos(g.a), sa = Math.sin(g.a);
      const lx = dx * ca - dz * sa, lz = dx * sa + dz * ca;
      if (Math.abs(lx) <= 0.5 && Math.abs(lz) <= 0.5) {
        const white = (lx < 0) !== (lz < 0);
        h.intensity = white ? 0.98 : 0.06; h.r = h.g = h.b = white ? 0.85 : 0.012; h.kind = 'gcp'; h.id = g.id;
        return;
      }
    }
    // the ground shader's own albedo (terrain.js), lifted toward a daylight look
    const [r, g, b] = groundColorAt(h.x, h.z);
    h.r = r * 2.2; h.g = g * 2.2; h.b = b * 2.2;
    const lum = 0.3 * r + 0.6 * g + 0.1 * b;
    h.intensity = Math.min(1, 0.22 + lum * 2.2 + 0.08 * hash(Math.floor(h.x * 3), Math.floor(h.z * 3)));
  }

  /** The highest surface (terrain or a tree crown) under (x, z) at or below height y. */
  below(x, z, y = Infinity) {
    let top = ground(x, z);
    this.treesNear(x, z, 1.5, (t) => {
      const rho = Math.hypot(x - t.x, z - t.z);
      if (rho >= t.R) return;
      const ys = t.y1 - (rho / t.R) * (t.y1 - t.y0);
      if (ys <= y + 0.01 && ys > top) top = ys;
    });
    return top;
  }

  /**
   * Distance to the nearest obstacle ahead along horizontal direction (ux, uz) from a drone at
   * (x, y, z), within maxD. The drone is ~0.5 m in radius and ~0.4 m tall.
   */
  clearance(x, y, z, ux, uz, maxD = 8) {
    let best = maxD;
    // terrain rising above the drone's belly
    for (let d = 0.6; d <= maxD; d += 0.6) {
      if (ground(x + ux * d, z + uz * d) > y + 0.05) { best = Math.min(best, d - 0.5); break; }
    }
    // tree crowns and trunks at the drone's height
    this.treesNear(x, z, maxD + 2, (t) => {
      const r = Math.max(SceneQuery.radiusAt(t, y), SceneQuery.radiusAt(t, y + 0.35));
      if (r <= 0) return;
      const rx = t.x - x, rz = t.z - z;
      const along = rx * ux + rz * uz;
      if (along < -r) return;
      const lat = Math.abs(rx * uz - rz * ux);
      const R = r + 0.55;
      if (lat > R) return;
      const d = along - Math.sqrt(R * R - lat * lat);
      if (d < best) best = Math.max(0, d);
    });
    // the truck
    const T = this.truck;
    if (y < T.y1 + 0.3) {
      const tt = this.rayTruck(x, Math.max(T.y0 + 0.5, y), z, ux, 0, uz, maxD + 0.6);
      if (tt - 0.6 < best) best = Math.max(0, tt - 0.6);
    }
    return best;
  }

  /** Keep a point out of tree crowns and the truck (returns true if it moved). */
  pushOut(p) {
    let moved = false;
    this.treesNear(p.x, p.z, 2, (t) => {
      const r = SceneQuery.radiusAt(t, p.y) + 0.45;
      if (r <= 0.45 && (p.y > t.y1 || p.y < t.g)) return;
      const dx = p.x - t.x, dz = p.z - t.z, d = Math.hypot(dx, dz);
      if (d < r) { const k = d > 1e-4 ? r / d : 0; p.x = t.x + (d > 1e-4 ? dx * k : r); p.z = t.z + (d > 1e-4 ? dz * k : 0); moved = true; }
    });
    const T = this.truck;
    if (p.y < T.y1 + 0.2) {
      const rx = p.x - T.x, rz = p.z - T.z;
      const lx = rx * T.c - rz * T.s, lz = rx * T.s + rz * T.c;
      const hw = T.hw + 0.5, hl = T.hl + 0.5;
      if (Math.abs(lx) < hw && Math.abs(lz) < hl) {
        // out through the nearest side, or up if that is closer
        const ox = hw - Math.abs(lx), oz = hl - Math.abs(lz), oy = T.y1 + 0.25 - p.y;
        if (oy < ox && oy < oz) p.y = T.y1 + 0.25;
        else {
          let nx = lx, nz = lz;
          if (ox < oz) nx = Math.sign(lx || 1) * hw; else nz = Math.sign(lz || 1) * hl;
          p.x = T.x + nx * T.c + nz * T.s; p.z = T.z - nx * T.s + nz * T.c;
        }
        moved = true;
      }
    }
    return moved;
  }
}
