/** Underhill's offices and the northern project sites: plain data, no three.js. */
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
