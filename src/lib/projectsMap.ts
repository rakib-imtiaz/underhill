/* ==========================================================================
   projectsMap.ts — the maths half of the static site's js/projects-map.js.

   Everything here is unchanged in behaviour from the source: the Lambert
   azimuthal equal-area projection centred on 60N 100W, the land-cell snap for
   pin display, the Canada framing pass and the raster draw. Only the DOM
   wiring has moved out — that now lives in components/ProjectsMap.tsx.

   PROJECT NAMES are real, taken from the underhill.ca harvest. Summaries are
   only present where the harvest actually captured body copy; the rest carry
   no description rather than an invented one. COORDINATES are indicative
   placements from each project's stated place name, not surveyed positions.
   ========================================================================== */
import { MASK, MASK_W, MASK_H, MASK_STEP, maskAt } from "../three/landmask.js";

export const CATS = [
  "Infrastructure",
  "Construction",
  "Energy",
  "Mining",
  "First Nations",
  "Environment",
] as const;

export type Project = {
  title: string;
  lat: number;
  lon: number;
  cat: string;
  region: string;
  summary?: string;
};

/* [title, lat, lon, category, region, summary?] — as in the source file */
type Row = [string, number, number, string, string, string?];

const ROWS: Row[] = [
  ["Broadway Subway Project", 49.2634, -123.12, "Infrastructure", "Vancouver, BC"],
  ["Fraser River Tunnel Project", 49.17, -122.9, "Infrastructure", "Delta, BC"],
  ["Canada Line Transit Survey", 49.25, -123.116, "Infrastructure", "Vancouver, BC"],
  ["Pattullo Bridge Replacement", 49.201, -122.893, "Infrastructure", "New Westminster, BC"],
  ["Capilano–Seymour Water Tunnel", 49.36, -123.11, "Infrastructure", "North Vancouver, BC"],
  ["Second Narrows Water Tunnel", 49.296, -123.023, "Infrastructure", "Burnaby, BC"],
  ["DP World Centerm Terminal", 49.286, -123.079, "Infrastructure", "Vancouver, BC"],
  ["Vancouver Fraser Port Authority", 49.289, -123.093, "Infrastructure", "Vancouver, BC"],
  ["Coquitlam GIS Infrastructure Survey", 49.284, -122.793, "Infrastructure", "Coquitlam, BC"],
  ["BC Rail Tunnel Surveying", 55.13, -121.0, "Infrastructure", "Tumbler Ridge, BC"],
  ["Robert Campbell Bridge Monitoring", 60.718, -135.04, "Infrastructure", "Whitehorse, YT"],
  ["Erik Nielsen Whitehorse International Airport", 60.7096, -135.068, "Infrastructure", "Whitehorse, YT"],
  ["Airport Obstacle Limitation Surveys", 58.42, -130.0, "Infrastructure", "Northern BC"],

  ["BC Place Roof Replacement Surveying", 49.2768, -123.112, "Construction", "Vancouver, BC",
    "Underhill provided surveying and 3D scanning for BC Place's retractable roof — the largest cable-supported stadium roof in the world."],
  ["Surveying for the 2010 Vancouver–Whistler Olympics", 50.1163, -122.9574, "Construction", "Whistler, BC",
    "Underhill supported Olympic infrastructure with surveying for venues, transportation, and GPS positioning from Hope to Whistler."],
  ["Lord Strathcona Elementary 3D Laser Scanning", 49.279, -123.087, "Construction", "Vancouver, BC",
    "Underhill scanned four heritage buildings at Vancouver's oldest school, delivering 2D elevations and a 3D Webshare model for design use."],
  ["Nares River Bridge Construction Surveying", 60.167, -134.7, "Construction", "Carcross, YT",
    "Underhill provided full surveying services for the new Nares River Bridge in Carcross, Yukon — supporting topographic, pillar, and girder layout."],
  ["Whistle Bend Continuing Care Facility", 60.75, -135.09, "Construction", "Whitehorse, YT",
    "Underhill supported PCL with complete surveying services for a $150M continuing care facility in Whitehorse, from site prep to final layout."],
  ["River's Reach II Condo Development", 60.728, -135.05, "Construction", "Whitehorse, YT",
    "Underhill supported Northern Vision's condo development with ground surveys, utility locates, layout, and legal registration from 2017 to 2019."],
  ["Science World Seismic Upgrade", 49.2733, -123.1036, "Construction", "Vancouver, BC"],
  ["Vancouver General Hospital", 49.262, -123.123, "Construction", "Vancouver, BC"],
  ["Burnaby Hospital Redevelopment", 49.248, -122.98, "Construction", "Burnaby, BC"],
  ["The Village on False Creek", 49.272, -123.105, "Construction", "Vancouver, BC"],
  ["Deloitte Summit 3D Scanning", 49.286, -123.116, "Construction", "Vancouver, BC"],
  ["CBC Building Redevelopment", 49.279, -123.112, "Construction", "Vancouver, BC"],
  ["King Edward Village", 49.249, -123.101, "Construction", "Vancouver, BC"],
  ["North Vancouver School District", 49.32, -123.07, "Construction", "North Vancouver, BC"],
  ["Brookside Housing Development", 60.74, -135.12, "Construction", "Whitehorse, YT"],
  ["Langford Heights Business Park", 48.45, -123.5, "Construction", "Langford, BC"],

  ["Site C Hydroelectric Dam Monitoring", 56.18, -120.92, "Energy", "Fort St. John, BC"],
  ["Site C Large-Scale UAV Mapping", 56.16, -120.87, "Energy", "Fort St. John, BC"],
  ["Peace Canyon Water Spillway Monitoring", 56.01, -122.19, "Energy", "Hudson's Hope, BC"],
  ["Neptune Bulk Terminals", 49.311, -123.05, "Energy", "North Vancouver, BC"],
  ["Westshore Terminals, Roberts Bank", 49.057, -123.16, "Energy", "Delta, BC"],
  ["Parkland Burnaby Refinery 3D Scanning", 49.287, -122.953, "Energy", "Burnaby, BC"],
  ["BC Hydro GIS Conversion", 49.25, -123.0, "Energy", "British Columbia"],

  ["Eagle Gold Mine Construction Surveying", 63.91, -135.75, "Mining", "Mayo, YT"],
  ["Minto Mine Surveying", 62.6, -137.24, "Mining", "Central Yukon"],
  ["Ruby Creek Mineral Lease Survey", 59.58, -133.7, "Mining", "Atlin, BC"],

  ["Nunavut Land Claim Survey", 63.75, -68.52, "First Nations", "Nunavut"],
  ["Sahtu Land Claim Boundary Survey", 65.28, -126.85, "First Nations", "Northwest Territories"],
  ["Gwich'in Comprehensive Agreement Survey", 68.36, -133.72, "First Nations", "Inuvik, NWT"],
  ["Inuvialuit Final Agreement Boundary Survey", 69.44, -133.03, "First Nations", "Northwest Territories"],
  ["Vuntut Gwitchin First Nation Settlement", 67.57, -139.83, "First Nations", "Old Crow, YT"],
  ["Maa-nulth First Nations Legal Surveying", 49.0, -125.3, "First Nations", "Vancouver Island, BC"],
  ["CYFN Land Claim Surveys", 61.4, -135.5, "First Nations", "Yukon"],

  ["Tay River Drone Mapping", 62.23, -133.35, "Environment", "Faro, YT"],
  ["Dawson City Flood Mapping", 64.06, -139.43, "Environment", "Dawson City, YT"],
  ["Nunavut Harbour Surveys", 66.14, -65.72, "Environment", "Nunavut"],
  ["North Fraser Harbour Mapping", 49.205, -123.05, "Environment", "Vancouver, BC"],
  ["ICIS Cadastral Data Modernization", 53.7, -124.0, "Environment", "British Columbia"],
];

export const PROJECTS: Project[] = ROWS.map(([title, lat, lon, cat, region, summary]) => ({
  title,
  lat,
  lon,
  cat,
  region,
  summary,
}));

/* ------------------------------------------------- Lambert azimuthal EA */
const RAD = Math.PI / 180;
const LAT0 = 60 * RAD;
const LON0 = -100 * RAD;
const S_LAT0 = Math.sin(LAT0);
const C_LAT0 = Math.cos(LAT0);

export type XY = { x: number; y: number };
export type LatLon = { lat: number; lon: number };

export function project(lat: number, lon: number): XY | null {
  const p = lat * RAD;
  const l = lon * RAD - LON0;
  const cp = Math.cos(p), sp = Math.sin(p), cl = Math.cos(l);
  const denom = 1 + S_LAT0 * sp + C_LAT0 * cp * cl;
  if (denom <= 1e-9) return null;
  const k = Math.sqrt(2 / denom);
  return { x: k * cp * Math.sin(l), y: k * (C_LAT0 * sp - S_LAT0 * cp * cl) };
}

export function unproject(x: number, y: number): LatLon | null {
  const r = Math.hypot(x, y);
  if (r < 1e-9) return { lat: LAT0 / RAD, lon: LON0 / RAD };
  if (r > 2) return null; // outside the hemisphere disc
  const c = 2 * Math.asin(r / 2);
  const sc = Math.sin(c), cc = Math.cos(c);
  const lat = Math.asin(cc * S_LAT0 + (y * sc * C_LAT0) / r);
  const lon = LON0 + Math.atan2(x * sc, r * C_LAT0 * cc - y * S_LAT0 * sc);
  return { lat: lat / RAD, lon: lon / RAD };
}

/**
 * Snap a pin to the nearest land cell for DISPLAY only.
 * At 110m resolution a genuinely coastal site — southern Vancouver Island,
 * say — can fall in a cell the raster calls water, which renders as a pin
 * floating in the sea. Searches outward in rings and gives up gracefully.
 */
export function pinLatLon(lat: number, lon: number): LatLon {
  if (maskAt(lat, lon) & 1) return { lat, lon };
  const st = MASK_STEP;
  for (let r = 1; r <= 6; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring only
        const la = lat + dy * st, lo = lon + dx * st;
        if (la > 89 || la < -89) continue;
        if (maskAt(la, lo) & 1) return { lat: la, lon: lo };
      }
    }
  }
  return { lat, lon };
}

export type Frame = { x0: number; x1: number; y0: number; y1: number };

/* fit the frame to Canada's own extent, with room for context around it */
export function canadaFrame(): Frame {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let row = 0; row < MASK_H; row++) {
    const lat = 90 - (row + 0.5) * MASK_STEP;
    for (let col = 0; col < MASK_W; col++) {
      if (!(MASK[row * MASK_W + col] & 2)) continue;
      const lon = -180 + (col + 0.5) * MASK_STEP;
      const q = project(lat, lon);
      if (!q) continue;
      if (q.x < x0) x0 = q.x;
      if (q.x > x1) x1 = q.x;
      if (q.y < y0) y0 = q.y;
      if (q.y > y1) y1 = q.y;
    }
  }
  const padX = (x1 - x0) * 0.1, padY = (y1 - y0) * 0.1;
  return { x0: x0 - padX, x1: x1 + padX, y0: y0 - padY, y1: y1 + padY };
}

/* -------------------------------------------------------------- render */
export const W = 1200;
export const H = 840;

export type View = { s: number; cx: number; cy: number };

/**
 * @param w,h backing-store size. The CSS box drives this: on a phone the
 *   stage is portrait, and stretching a fixed 1200x840 render into it would
 *   squash the projection, so the raster is drawn at the real aspect instead.
 */
export function drawMap(
  canvas: HTMLCanvasElement,
  frame: Frame,
  w = W,
  h = H
): View {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { s: 1, cx: 0, cy: 0 };
  const img = ctx.createImageData(w, h);
  const d = img.data;

  const spanX = frame.x1 - frame.x0, spanY = frame.y1 - frame.y0;
  /* one scale for both axes so the projection is never distorted */
  const s = Math.min(w / spanX, h / spanY);
  const cx = (frame.x0 + frame.x1) / 2, cy = (frame.y0 + frame.y1) / 2;

  const OCEAN = [7, 13, 22], LAND = [18, 32, 44], CA = [22, 52, 62];
  const COAST = [43, 111, 134], CA_COAST = [92, 196, 224], VOID = [4, 6, 11];

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      const wx = cx + (px - w / 2) / s;
      const wy = cy - (py - h / 2) / s; // screen Y is down
      const g = unproject(wx, wy);
      let c = VOID;
      if (g) {
        const m = maskAt(g.lat, g.lon);
        if (m & 1) {
          const ca = (m & 2) !== 0;
          /* coastline = land cell with any ocean 4-neighbour */
          const st = MASK_STEP;
          const coast =
            !(maskAt(g.lat + st, g.lon) & 1) || !(maskAt(g.lat - st, g.lon) & 1) ||
            !(maskAt(g.lat, g.lon + st) & 1) || !(maskAt(g.lat, g.lon - st) & 1);
          c = coast ? (ca ? CA_COAST : COAST) : ca ? CA : LAND;
        } else {
          c = OCEAN;
        }
      }
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  /* graticule over the top */
  ctx.strokeStyle = "rgba(0,130,202,0.16)";
  ctx.lineWidth = 1;
  const toPx = (lat: number, lon: number): [number, number] | null => {
    const q = project(lat, lon);
    if (!q) return null;
    return [w / 2 + (q.x - cx) * s, h / 2 - (q.y - cy) * s];
  };
  for (let lat = 40; lat <= 80; lat += 10) {
    ctx.beginPath();
    let started = false;
    for (let lon = -170; lon <= -30; lon += 2) {
      const p = toPx(lat, lon);
      if (!p) { started = false; continue; }
      if (!started) { ctx.moveTo(p[0], p[1]); started = true; } else ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
  }
  for (let lon = -170; lon <= -30; lon += 20) {
    ctx.beginPath();
    let started = false;
    for (let lat = 35; lat <= 84; lat += 1) {
      const p = toPx(lat, lon);
      if (!p) { started = false; continue; }
      if (!started) { ctx.moveTo(p[0], p[1]); started = true; } else ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
  }
  return { s, cx, cy };
}
