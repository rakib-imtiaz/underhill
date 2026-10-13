// Fly Lab: the shared place, frame and route. No three.js here, so every engine (three.js, MapLibre,
// Cesium) can use it, and node can check it.
//
// Lab frame ("ENU-lab"): metres from ORIGIN on the local tangent plane, +x east, +y up, +z SOUTH
// (three.js convention, the same as fly mode's real-world code: -z is north). y = 0 is the ground at
// the take-off pad; each engine adds its own ground height there.

export const PLACE = {
  name: 'Metrotown, Burnaby, BC',
  // The middle of the gap between Hyatt Place (48 storeys) and MetroPlace (46 storeys), Kingsborough /
  // Beresford area, 1 km south-west of Metrotown SkyTrain's north side. Checked against the OSM data in
  // data/metrotown-osm.geojson (2026-10-13 snapshot). About 4.3 km west of Underhill's Burnaby HQ.
  lat: 49.2249, lon: -123.0034,
  geoid: -17, // approx. geoid undulation N (m) here: ellipsoid height h = H + N
  bbox: [-123.0105, 49.2210, -122.9935, 49.2320], // W S E N of the OSM extract
};

const DEG = Math.PI / 180;
const A = 6378137, E2 = 0.00669437999014;
const s0 = Math.sin(PLACE.lat * DEG);
const RN = A / Math.sqrt(1 - E2 * s0 * s0);
const RM = A * (1 - E2) / Math.pow(1 - E2 * s0 * s0, 1.5);
const KX = RN * Math.cos(PLACE.lat * DEG) * DEG; // metres per degree of longitude
const KY = RM * DEG;                              // metres per degree of latitude

/** [lon, lat] -> [x, z] in the lab frame. */
export function toLab(lon, lat) { return [(lon - PLACE.lon) * KX, -(lat - PLACE.lat) * KY]; }
/** lab x, z -> { lon, lat } */
export function toLonLat(x, z) { return { lon: PLACE.lon + x / KX, lat: PLACE.lat - z / KY }; }

// ------------------------------------------------------------------------------------------ route
// The same scripted 20 s flight in every scenario: take off from an open spot north of the gap, fly
// south-west between Hyatt Place and MetroPlace at 35 m, curve left into a climbing half-orbit round
// the south side of Hyatt Place (radius 58 m, 35 -> 70 m) and land on a second open spot east of it.
// Cruise speed about 20 m/s (the M350 manages 23 m/s): hurried but flyable.
export const PAD = { x: 20, z: -20 };    // take-off
export const LAND = { x: 110, z: 29 };   // landing
export const TOWERS = {
  hyatt: { name: 'Hyatt Place', x: 45.4, z: 29.2, h: 153.6 },
  metroplace: { name: 'MetroPlace', x: -46.8, z: -25.3, h: 147.2 },
};
export const ROUTE_SECONDS = 20;

const ORBIT = { cx: TOWERS.hyatt.x, cz: TOWERS.hyatt.z, r: 58 };

function buildRoute() {
  const gap = [-1, 2];
  const d = Math.hypot(gap[0] - PAD.x, gap[1] - PAD.z);
  const ux = (gap[0] - PAD.x) / d, uz = (gap[1] - PAD.z) / d;
  const pts = [];
  const push = (x, z, y) => pts.push({ x, z, y });
  // 0..20: straight run through the gap and 14 m on
  for (let i = 0; i <= 20; i++) { const t = i / 20; const L = (d + 14) * t; push(PAD.x + ux * L, PAD.z + uz * L, 35); }
  // 21..80: the orbit, entered where the run ends, turning left (decreasing atan2(z, x) in the lab
  // frame: west -> south -> east of the tower) until it points at the landing spot, climbing 35 -> 70 m
  const last = pts[pts.length - 1];
  const a0 = Math.atan2(last.z - ORBIT.cz, last.x - ORBIT.cx);
  let a1 = Math.atan2(LAND.z - ORBIT.cz, LAND.x - ORBIT.cx) + 0.35;
  while (a1 > a0) a1 -= 2 * Math.PI;
  const r0 = Math.hypot(last.x - ORBIT.cx, last.z - ORBIT.cz);
  for (let i = 1; i <= 60; i++) {
    const t = i / 60; const a = a0 + (a1 - a0) * t;
    const r = ORBIT.r + (r0 - ORBIT.r) * Math.max(0, 1 - t * 4);
    push(ORBIT.cx + r * Math.cos(a), ORBIT.cz + r * Math.sin(a), 35 + 35 * (0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, t * 1.6))));
  }
  // 81..: out to above the landing spot, descending to 12 m
  const e = pts[pts.length - 1];
  for (let i = 1; i <= 16; i++) { const t = i / 16; const s = t * t * (3 - 2 * t); push(e.x + (LAND.x - e.x) * s, e.z + (LAND.z - e.z) * s, e.y + (12 - e.y) * s); }
  // smooth: three passes of a [1 2 1] filter (keeps the ends)
  for (let k = 0; k < 3; k++) {
    const c = pts.map((p) => ({ ...p }));
    for (let i = 1; i < pts.length - 1; i++) for (const ax of ['x', 'y', 'z']) c[i][ax] = (pts[i - 1][ax] + 2 * pts[i][ax] + pts[i + 1][ax]) / 4;
    pts.splice(0, pts.length, ...c);
  }
  let L = 0; pts[0].s = 0;
  for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z); pts[i].s = L; }
  return { pts, L };
}
const ROUTE = buildRoute();
export const ROUTE_LENGTH_M = ROUTE.L;

const T_UP = 2, T_DOWN = 2.2; // vertical take-off and landing
const ease = (t) => t * t * (3 - 2 * t);

function along(s) {
  const P = ROUTE.pts;
  if (s <= 0) return P[0];
  if (s >= ROUTE.L) return P[P.length - 1];
  let lo = 0, hi = P.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m].s < s) lo = m; else hi = m; }
  const t = (s - P[lo].s) / (P[hi].s - P[lo].s || 1);
  return { x: P[lo].x + (P[hi].x - P[lo].x) * t, y: P[lo].y + (P[hi].y - P[lo].y) * t, z: P[lo].z + (P[hi].z - P[lo].z) * t };
}

/**
 * The drone's pose on the scripted route at time t (s): { x, y, z, yaw, phase, speed }.
 * yaw: radians, fly mode's convention: the nose points along (sin yaw, 0, cos yaw), so 0 = south (+z),
 * pi = north; the drone model takes it as rotation.y.
 */
export function routePose(t) {
  const T = ROUTE_SECONDS;
  const cruise = T - T_UP - T_DOWN;
  let p, phase;
  if (t < T_UP) {
    const s = ease(Math.max(0, t) / T_UP);
    p = { x: ROUTE.pts[0].x, z: ROUTE.pts[0].z, y: 35 * s }; phase = 'take-off';
  } else if (t < T_UP + cruise) {
    const u = (t - T_UP) / cruise;
    // slow in, slow out along the path
    const s = (u < 0.1 ? 5 * u * u : u > 0.9 ? 0.9 - 5 * (1 - u) * (1 - u) : u - 0.05) / 0.9 * ROUTE.L;
    p = along(s); phase = s < ROUTE.pts[21].s ? 'between towers' : s < ROUTE.pts[81].s ? 'orbit' : 'return';
  } else {
    const end = ROUTE.pts[ROUTE.pts.length - 1];
    const s = ease(Math.min(1, (t - T_UP - cruise) / T_DOWN));
    p = { x: end.x, z: end.z, y: end.y * (1 - s) }; phase = t >= T ? 'landed' : 'landing';
  }
  // heading: from the path direction a little ahead
  const tt = Math.min(T - T_DOWN - 0.05, Math.max(T_UP + 0.05, t));
  const a = routePosRaw(tt), b = routePosRaw(tt + 0.08);
  const yaw = Math.atan2(b.x - a.x, b.z - a.z);
  const q = routePosRaw(Math.max(0, t - 0.05)), r = routePosRaw(Math.min(T, t + 0.05));
  const speed = Math.hypot(r.x - q.x, r.y - q.y, r.z - q.z) / 0.1;
  return { ...p, yaw, phase, speed };
}
function routePosRaw(t) {
  const cruise = ROUTE_SECONDS - T_UP - T_DOWN;
  if (t < T_UP) return { x: ROUTE.pts[0].x, z: ROUTE.pts[0].z, y: 35 * ease(Math.max(0, t) / T_UP) };
  if (t < T_UP + cruise) {
    const u = (t - T_UP) / cruise;
    const s = (u < 0.1 ? 5 * u * u : u > 0.9 ? 0.9 - 5 * (1 - u) * (1 - u) : u - 0.05) / 0.9 * ROUTE.L;
    return along(s);
  }
  const end = ROUTE.pts[ROUTE.pts.length - 1];
  return { x: end.x, z: end.z, y: end.y * (1 - ease(Math.min(1, (t - T_UP - cruise) / T_DOWN))) };
}

// ---------------------------------------------------------------------------- test fixtures
// Collision test: start 70 m north-east of Hyatt Place at 40 m, nose at the tower, full forward stick.
export const COLLIDE = (() => {
  const h = TOWERS.hyatt, ang = Math.atan2(-1, 0.55); // from the tower towards the north-north-east
  const x = h.x + 75 * Math.cos(ang), z = h.z + 75 * Math.sin(ang);
  return { x, y: 40, z, yaw: Math.atan2(h.x - x, h.z - z), target: 'Hyatt Place' };
})();
// LiDAR test: a hover point in the gap at 40 m, the scanner looking at Hyatt Place.
export const LIDAR = (() => {
  const x = -4, z = 0, h = TOWERS.hyatt;
  return { x, y: 40, z, yaw: Math.atan2(h.x - x, h.z - z) };
})();
// Day/night comparison camera: south-west of the gap, looking at the towers.
export const VIEWPOINT = { x: -150, y: 60, z: 160, tx: 0, ty: 60, tz: 0 };
