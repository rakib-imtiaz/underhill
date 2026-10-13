// Fly mode: settings the site owner fills in.
//
// GOOGLE_MAPS_KEY: a Google Maps Platform API key with the **Map Tiles API** enabled (Photorealistic
// 3D Tiles). While it is empty the "World: Site / Real" switch stays hidden and the real-world code
// (js/fly/realworld.js and the vendored 3d-tiles-renderer) is never loaded. See README.md, "Fly mode:
// real-world sites", for the steps (enable the API, restrict the key to your domain).
export const GOOGLE_MAPS_KEY = '';

// Real Underhill sites for the real-world mode. lat / lon in degrees (WGS84), the take-off point.
// geoid: the geoid undulation N (m, CGG2013-ish, approximate) there, to turn the tiles' ellipsoidal
// heights into the HUD's elevations (H = h − N). zone: the UTM zone the HUD prints.
// Checked 2026-10-09 against OpenStreetMap (Nominatim); the brief's numbers were a few hundred
// metres off, noted per site.
export const REAL_SITES = [
  {
    id: 'burnaby', name: 'Underhill HQ, Burnaby',
    // 301-8337 Eastlake Drive, Burnaby BC V5A 4W2 (OSM way 551580567). Brief: 49.2585, -122.9285 (~480 m W).
    lat: 49.2598, lon: -122.9222, zone: 10, geoid: -17,
  },
  {
    id: 'site-c', name: 'Site C dam, Peace River',
    // John Horgan Dam (Site C), OSM way 409910469 centre. Brief: 56.195, -120.91 (~400 m NE).
    lat: 56.1931, lon: -120.9151, zone: 10, geoid: -15,
  },
  {
    id: 'whitehorse', name: 'Whitehorse office',
    // 4081 4th Ave, Whitehorse YT (north end of 4th Ave, by Ogilvie St). Brief: 60.7197, -135.0523 (~600 m SE, the downtown core).
    lat: 60.7232, lon: -135.0603, zone: 8, geoid: 7,
  },
];
