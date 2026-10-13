// Fly Lab: the local OpenStreetMap extract (data/metrotown-osm.geojson) as 2.5D prisms in the lab
// frame, with a grid index and an exact ray / prism intersection. Scenario A builds its city from it;
// every scenario uses it as the reference ("does the engine's geometry agree with OSM?"), and C uses
// the same maths on its own vector-tile buildings.
import { toLab } from './geo.js';

export const DATA_URL = new URL('../data/metrotown-osm.geojson', import.meta.url).href;

// default heights when a building has neither height nor building:levels
const DEFAULT_H = { house: 7, detached: 7, semidetached_house: 7, terrace: 8, garage: 3, garages: 3, shed: 3, roof: 5, carport: 3, kiosk: 3,
  apartments: 12, residential: 10, retail: 7, commercial: 12, office: 14, school: 9, church: 10, industrial: 8, warehouse: 8, train_station: 12, transportation: 8, hospital: 16, parking: 9 };
export const heightOf = (p) => p.h || DEFAULT_H[p.b] || 8;

const CELL = 25;

/** Rings of [lon, lat] -> rings of [x, z] (open: the closing point dropped). */
export function ringsToLab(coords) {
  return coords.map((r) => { const o = r.map(([lo, la]) => toLab(lo, la)); if (o.length > 1) { const a = o[0], b = o[o.length - 1]; if (a[0] === b[0] && a[1] === b[1]) o.pop(); } return o; });
}

export class OsmCity {
  static async load(url = DATA_URL) {
    const res = await fetch(url);
    const fc = await res.json();
    return new OsmCity(fc);
  }

  /** Build prisms from features of the shape { properties: { h, minH, ... }, rings: [[x, z]...][] }. */
  static fromPrisms(list) { const c = new OsmCity({ features: [], meta: {} }); c.prisms = []; c.grid = new Map(); for (const p of list) c.addPrism(p); return c; }

  constructor(fc) {
    this.meta = fc.meta || {};
    this.features = fc.features;
    this.prisms = [];
    this.roads = [];
    this.areas = [];
    this.rails = [];
    this.grid = new Map();
    for (const f of fc.features) {
      const p = f.properties;
      if (p.k === 'building' || p.k === 'part') {
        if (p.hasParts) continue; // drawn by its parts
        const rings = ringsToLab(f.geometry.coordinates);
        if (!rings[0] || rings[0].length < 3) continue;
        this.addPrism({ rings, h: heightOf(p), minH: p.minH || 0, props: p });
      } else if (p.k === 'road') {
        this.roads.push({ pts: f.geometry.coordinates.map(([lo, la]) => toLab(lo, la)), props: p });
      } else if (p.k === 'rail') {
        this.rails.push({ pts: f.geometry.coordinates.map(([lo, la]) => toLab(lo, la)), props: p });
      } else if (f.geometry.type === 'Polygon') {
        this.areas.push({ rings: ringsToLab(f.geometry.coordinates), props: p });
      }
    }
  }

  addPrism(pr) {
    const r = pr.rings[0];
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    pr.box = [x0, z0, x1, z1];
    pr.i = this.prisms.length;
    this.prisms.push(pr);
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) {
      for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
        const k = gx + ',' + gz; let a = this.grid.get(k); if (!a) this.grid.set(k, (a = [])); a.push(pr);
      }
    }
  }

  /** Is the point inside a building? Returns the prism or null. */
  inside(x, y, z) {
    const a = this.grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
    if (!a) return null;
    for (const p of a) {
      if (y < p.minH || y > p.h) continue;
      if (x < p.box[0] || x > p.box[2] || z < p.box[1] || z > p.box[3]) continue;
      if (inPoly(x, z, p.rings)) return p;
    }
    return null;
  }

  /**
   * First building hit along a ray (o, unit d) within max: { dist, prism, normal } or null.
   * Walks the grid cells along the ray (2D DDA) and tests each prism once: wall segments, roof, floor.
   */
  raycast(o, d, max = 1000) {
    const seen = new Set();
    let best = null;
    const test = (p) => {
      if (seen.has(p.i)) return; seen.add(p.i);
      const hit = rayPrism(o, d, p, best ? best.dist : max);
      if (hit) best = hit;
    };
    // DDA over the xz grid
    const hx = d.x, hz = d.z, hl = Math.hypot(hx, hz);
    let gx = Math.floor(o.x / CELL), gz = Math.floor(o.z / CELL);
    const visit = () => { const a = this.grid.get(gx + ',' + gz); if (a) for (const p of a) test(p); };
    if (hl < 1e-9) { visit(); return best; }
    const sx = Math.sign(hx), sz = Math.sign(hz);
    const tdx = hx !== 0 ? Math.abs(CELL / hx) : Infinity, tdz = hz !== 0 ? Math.abs(CELL / hz) : Infinity;
    let tmx = hx !== 0 ? ((sx > 0 ? (gx + 1) * CELL - o.x : o.x - gx * CELL) / Math.abs(hx)) : Infinity;
    let tmz = hz !== 0 ? ((sz > 0 ? (gz + 1) * CELL - o.z : o.z - gz * CELL) / Math.abs(hz)) : Infinity;
    let t = 0;
    for (let n = 0; n < 400 && t <= max; n++) {
      visit();
      if (best && best.dist <= Math.min(tmx, tmz)) break; // nothing further can be nearer
      if (tmx < tmz) { t = tmx; tmx += tdx; gx += sx; } else { t = tmz; tmz += tdz; gz += sz; }
    }
    return best;
  }
}

export function inPoly(x, z, rings) {
  let c = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const xi = r[i][0], zi = r[i][1], xj = r[j][0], zj = r[j][1];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
    }
  }
  return c;
}

function rayPrism(o, d, p, max) {
  let best = null;
  // walls
  for (const r of p.rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const ax = r[j][0], az = r[j][1], bx = r[i][0], bz = r[i][1];
      const ex = bx - ax, ez = bz - az;
      const den = d.x * ez - d.z * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((ax - o.x) * ez - (az - o.z) * ex) / den;
      if (t < 0 || t > max || (best && t >= best.dist)) continue;
      const u = ((ax - o.x) * d.z - (az - o.z) * d.x) / den;
      if (u < 0 || u > 1) continue;
      const y = o.y + d.y * t;
      if (y < p.minH || y > p.h) continue;
      const nl = Math.hypot(ez, ex) || 1;
      best = { dist: t, prism: p, normal: { x: ez / nl, y: 0, z: -ex / nl } };
    }
  }
  // roof and floor (horizontal caps)
  for (const [yc, ny] of [[p.h, 1], [p.minH, -1]]) {
    if (Math.abs(d.y) < 1e-9 || (ny < 0 && p.minH <= 0)) continue;
    const t = (yc - o.y) / d.y;
    if (t < 0 || t > max || (best && t >= best.dist)) continue;
    const x = o.x + d.x * t, z = o.z + d.z * t;
    if (x < p.box[0] || x > p.box[2] || z < p.box[1] || z > p.box[3]) continue;
    if (inPoly(x, z, p.rings)) best = { dist: t, prism: p, normal: { x: 0, y: ny, z: 0 } };
  }
  return best;
}
