/**
 * Geodesy for the scene.
 *
 * World frame = local tangent frame at the survey site, in metres:
 *   +X east, +Y up, +Z south (so north is -Z). The instrument stands at the origin.
 * The planet is a sphere of radius R centred at (0, -R, 0). Ground points are mapped onto that
 * sphere exactly (azimuthal-equidistant), so the valley *is* a patch of the globe — the pull back
 * never swaps one model for another.
 */
import * as THREE from 'three'

export const R = 6_371_000
export const SITE = { lat: 51.02, lon: -118.21, elev: 452 } // Columbia valley near Revelstoke, BC
export const GLOBE_CENTER = new THREE.Vector3(0, -R, 0)

const D2R = Math.PI / 180

/* ECEF unit basis of the local frame at the site (float64 in JS). */
const sφ = Math.sin(SITE.lat * D2R), cφ = Math.cos(SITE.lat * D2R)
const sλ = Math.sin(SITE.lon * D2R), cλ = Math.cos(SITE.lon * D2R)
const E = [-sλ, cλ, 0]
const N = [-sφ * cλ, -sφ * sλ, cφ]
const U = [cφ * cλ, cφ * sλ, sφ]

/** Matrix taking ECEF unit vectors into the local frame (rows = E, U, -N). */
export const ECEF_TO_LOCAL = new THREE.Matrix3().set(
  E[0], E[1], E[2],
  U[0], U[1], U[2],
  -N[0], -N[1], -N[2],
)
export const LOCAL_TO_ECEF = ECEF_TO_LOCAL.clone().transpose()

/** Unit normal (local frame) of a lat/lon on the sphere. */
export function latLonToDir(lat: number, lon: number, out = new THREE.Vector3()) {
  const a = lat * D2R, b = lon * D2R
  const x = Math.cos(a) * Math.cos(b), y = Math.cos(a) * Math.sin(b), z = Math.sin(a)
  return out.set(
    E[0] * x + E[1] * y + E[2] * z,
    U[0] * x + U[1] * y + U[2] * z,
    -(N[0] * x + N[1] * y + N[2] * z),
  )
}

/** Point on the sphere surface (+ altitude h, metres), local frame. */
export function latLonToWorld(lat: number, lon: number, h = 0, out = new THREE.Vector3()) {
  latLonToDir(lat, lon, out).multiplyScalar(R + h)
  out.y -= R
  return out
}

/** Local unit direction → lat/lon (degrees). Writes into `out` = [lat, lon]. */
export function dirToLatLon(dx: number, dy: number, dz: number, out: [number, number]) {
  // local → ECEF: v = E*dx + U*dy + N*(-dz)
  const x = E[0] * dx + U[0] * dy - N[0] * dz
  const y = E[1] * dx + U[1] * dy - N[1] * dz
  const z = E[2] * dx + U[2] * dy - N[2] * dz
  out[0] = Math.atan2(z, Math.hypot(x, y)) / D2R
  out[1] = Math.atan2(y, x) / D2R
  return out
}

/**
 * Tangent-plane (x east, z south, metres) + height h → exact position on the sphere.
 * Written to avoid catastrophic cancellation near the site (R ≈ 6.4e6).
 */
export function groundToWorld(x: number, z: number, h: number, out: Float32Array | number[], o: number) {
  const d = Math.hypot(x, z)
  if (d < 1e-9) { out[o] = 0; out[o + 1] = h; out[o + 2] = 0; return }
  const a = d / R
  const s = Math.sin(a), half = Math.sin(a / 2)
  const k = ((R + h) * s) / d
  out[o] = x * k
  out[o + 1] = h * Math.cos(a) - 2 * R * half * half
  out[o + 2] = z * k
}

/** Tangent-plane coordinates → lat/lon (degrees). */
export function groundToLatLon(x: number, z: number, out: [number, number]) {
  const d = Math.hypot(x, z)
  if (d < 1e-9) { out[0] = SITE.lat; out[1] = SITE.lon; return out }
  const a = d / R, s = Math.sin(a) / d
  return dirToLatLon(x * s, Math.cos(a), z * s, out)
}

/* ---------------- UTM (WGS84) for the HUD readout ---------------- */
const WA = 6378137, WF = 1 / 298.257223563
const E2 = WF * (2 - WF), EP2 = E2 / (1 - E2), K0 = 0.9996

export type UTM = { zone: number; band: string; e: number; n: number }
export function toUTM(lat: number, lon: number, out: UTM): UTM {
  const zone = Math.max(1, Math.min(60, Math.floor((lon + 180) / 6) + 1))
  const lon0 = ((zone - 1) * 6 - 180 + 3) * D2R
  const φ = lat * D2R, λ = lon * D2R
  const sinφ = Math.sin(φ), cosφ = Math.cos(φ), tanφ = Math.tan(φ)
  const n = WA / Math.sqrt(1 - E2 * sinφ * sinφ)
  const t = tanφ * tanφ, c = EP2 * cosφ * cosφ, a = cosφ * (λ - lon0)
  const m = WA * ((1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 ** 3) / 256) * φ
    - ((3 * E2) / 8 + (3 * E2 * E2) / 32 + (45 * E2 ** 3) / 1024) * Math.sin(2 * φ)
    + ((15 * E2 * E2) / 256 + (45 * E2 ** 3) / 1024) * Math.sin(4 * φ)
    - ((35 * E2 ** 3) / 3072) * Math.sin(6 * φ))
  out.e = K0 * n * (a + ((1 - t + c) * a ** 3) / 6 + ((5 - 18 * t + t * t + 72 * c - 58 * EP2) * a ** 5) / 120) + 500000
  out.n = K0 * (m + n * tanφ * (a * a / 2 + ((5 - t + 9 * c + 4 * c * c) * a ** 4) / 24
    + ((61 - 58 * t + t * t + 600 * c - 330 * EP2) * a ** 6) / 720))
  if (lat < 0) out.n += 10_000_000
  out.zone = zone
  out.band = 'CDEFGHJKLMNPQRSTUVWXX'[Math.max(0, Math.min(20, Math.floor((lat + 80) / 8)))]
  return out
}

/* ---------------- The network ---------------- */
export type Office = { name: string; lat: number; lon: number }
/** Underhill Geomatics offices (underhill.ca/contact-us). */
export const OFFICES: Office[] = [
  { name: 'Vancouver', lat: 49.283, lon: -123.121 },
  { name: 'Vancouver Island', lat: 49.687, lon: -124.994 }, // Courtenay
  { name: 'Kamloops', lat: 50.674, lon: -120.327 },
  { name: 'Whitehorse', lat: 60.721, lon: -135.057 },
]

/** Northern project sites the REACH arcs run to from the coast (approximate community locations). */
export const NORTH_SITES: Office[] = [
  { name: 'Inuvik', lat: 68.36, lon: -133.72 },
  { name: 'Yellowknife', lat: 62.45, lon: -114.37 },
  { name: 'Cambridge Bay', lat: 69.12, lon: -105.06 },
  { name: 'Resolute', lat: 74.7, lon: -94.83 },
  { name: 'Rankin Inlet', lat: 62.81, lon: -92.09 },
  { name: 'Pond Inlet', lat: 72.7, lon: -77.96 },
  { name: 'Iqaluit', lat: 63.75, lon: -68.52 },
]

/**
 * Service region: British Columbia, Yukon, Northwest Territories and Nunavut, as [lon, lat].
 * Edges that run over water are drawn out to sea on purpose — the land mask clips them — so only
 * the land borders (Alaska, Alberta, Saskatchewan/Manitoba at 60°N, Hudson Strait) need care.
 */
export const REGION: [number, number][] = [
  // Yukon–Alaska along 141°W, then the BC–Alaska panhandle boundary
  [-141, 84], [-141, 60.3], [-139.1, 60.35], [-137.6, 59.2], [-135.5, 59.8], [-134.3, 58.9],
  [-133.3, 58.4], [-131.8, 56.6], [-130.1, 56.1], [-130.0, 55.3], [-131.2, 54.6],
  // out around Haida Gwaii and Vancouver Island, back in along Juan de Fuca to the 49th
  [-136.5, 54.6], [-136.5, 48.3], [-123.25, 48.25], [-123.2, 48.9], [-123.3, 49.0],
  // 49th parallel east to the Rockies, then the BC–Alberta divide north to 120°W / 60°N
  [-114.06, 49.0], [-114.7, 49.9], [-115.6, 50.9], [-116.8, 51.7], [-118.5, 52.9], [-120.0, 53.8],
  [-120.0, 60.0],
  // 60°N east to Hudson Bay (Alberta, Saskatchewan, Manitoba lie south of it)
  [-94.8, 60.0],
  // through Hudson Bay and Hudson Strait, keeping Nunavik (Quebec) to the south
  [-84, 61.2], [-78.5, 62.95], [-72, 62.1], [-65, 60.6], [-57.5, 62],
  // the Canada–Greenland boundary: up the middle of Davis Strait and Baffin Bay, through Smith Sound,
  // Kane Basin, Kennedy Channel (Hans Island) and Robeson Channel — Greenland stays outside
  [-57.8, 66.5], [-60.5, 69], [-63.5, 72], [-67, 74.5], [-72.5, 76.3], [-73.4, 78.5], [-70.5, 79.5],
  [-66.5, 80.8], [-63.3, 81.5], [-60.8, 82.1], [-60, 84],
]
