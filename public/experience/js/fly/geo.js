// Fly mode: coordinates. Scene metres ↔ UTM 11N (NAD83(CSRS), GRS80) ↔ latitude / longitude.
//
// Scene axes (as the film, js/cardspecs.js): +x east, −z north, +y up, origin on control mark CP-01
// at E 441 422.273, N 5 620 129.047 (UTM zone 11N), elevation ELEV0 = 412 m (CGVD2013).
// No three.js dependency, so it also runs in Node for checks.

export const CP = { E: 441422.273, N: 5620129.047, zone: 11 };   // same values as cardspecs.js CP
export const ELEV0 = 412.0;                                         // same as field.js ELEV0

// GRS80 (NAD83(CSRS)); WGS84 differs by 0.1 mm in the flattening, irrelevant here
const A = 6378137.0, F = 1 / 298.257222101, K0 = 0.9996;
const E2 = F * (2 - F), EP2 = E2 / (1 - E2);
const DEG = Math.PI / 180;

/** Scene (x, z) → UTM 11N { E, N }. */
export function sceneToUtm(x, z) { return { E: CP.E + x, N: CP.N - z }; }
/** UTM 11N (E, N) → scene { x, z }. */
export function utmToScene(E, N) { return { x: E - CP.E, z: CP.N - N }; }

/** UTM (E, N, zone, northern hemisphere) → { lat, lon } in degrees (Snyder, USGS PP 1395, eq. 8-6..8-25). */
export function utmToLatLon(E, N, zone = CP.zone, north = true) {
  const x = E - 500000, y = north ? N : N - 10000000;
  const lon0 = ((zone - 1) * 6 - 180 + 3) * DEG;
  const M = y / K0;
  const mu = M / (A * (1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * E2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
    + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const s = Math.sin(phi1), c = Math.cos(phi1), t = Math.tan(phi1);
  const N1 = A / Math.sqrt(1 - E2 * s * s);
  const T1 = t * t, C1 = EP2 * c * c;
  const R1 = A * (1 - E2) / Math.pow(1 - E2 * s * s, 1.5);
  const D = x / (N1 * K0);
  const lat = phi1 - (N1 * t / R1) * (D * D / 2
    - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D ** 6 / 720);
  const lon = lon0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D ** 5 / 120) / c;
  return { lat: lat / DEG, lon: lon / DEG };
}

/** { lat, lon } (deg) → UTM { E, N, zone } (Snyder eq. 8-9..8-15). zone defaults to the standard one. */
export function latLonToUtm(lat, lon, zone = Math.floor((lon + 180) / 6) + 1) {
  const phi = lat * DEG, lam = lon * DEG;
  const lon0 = ((zone - 1) * 6 - 180 + 3) * DEG;
  const s = Math.sin(phi), c = Math.cos(phi), t = Math.tan(phi);
  const N = A / Math.sqrt(1 - E2 * s * s);
  const T = t * t, C = EP2 * c * c, Aa = c * (lam - lon0);
  const M = A * ((1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * E2 ** 3 / 256) * phi
    - (3 * E2 / 8 + 3 * E2 * E2 / 32 + 45 * E2 ** 3 / 1024) * Math.sin(2 * phi)
    + (15 * E2 * E2 / 256 + 45 * E2 ** 3 / 1024) * Math.sin(4 * phi)
    - (35 * E2 ** 3 / 3072) * Math.sin(6 * phi));
  const E = 500000 + K0 * N * (Aa + (1 - T + C) * Aa ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * EP2) * Aa ** 5 / 120);
  let Nn = K0 * (M + N * t * (Aa * Aa / 2 + (5 - T + 9 * C + 4 * C * C) * Aa ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * EP2) * Aa ** 6 / 720));
  if (lat < 0) Nn += 10000000;
  return { E, N: Nn, zone };
}

/** Scene (x, z) → { lat, lon } through UTM 11N. */
export function sceneToLatLon(x, z) { const u = sceneToUtm(x, z); return utmToLatLon(u.E, u.N, CP.zone); }

/** survey-style digit grouping (thin spaces), as the film's cards print it: 5 620 129.047 */
export const grp = (v, d = 3) => {
  const [i, f] = Math.abs(v).toFixed(d).split('.');
  return (v < 0 ? '−' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (f ? `.${f}` : '');
};

/** 50.7300123 → "50.730012° N" */
export function fmtLat(lat, d = 6) { return `${Math.abs(lat).toFixed(d)}° ${lat >= 0 ? 'N' : 'S'}`; }
export function fmtLon(lon, d = 6) { return `${Math.abs(lon).toFixed(d)}° ${lon >= 0 ? 'E' : 'W'}`; }

/** Compass heading (deg, 0 = north, clockwise) of a scene direction (dx, dz). */
export function headingOf(dx, dz) { const h = Math.atan2(dx, -dz) / DEG; return (h + 360) % 360; }
