// The information cards: which beat each belongs to, what it says, what its leader points at, and
// what it must keep clear of. Facts are either Underhill's own (from underhill.ca, as the React
// site's cards quote them) or read from the scene itself (coordinates, profile, capture, model).
//
// Scene coordinates: the control mark CP-01 is the site at 50.73° N 117.83° W, in UTM zone 11N on
// NAD83(CSRS) (computed on GRS80: E 441 422.273, N 5 620 129.047), heights on CGVD2013. Scene axes:
// +x east, −z north, +y up, metres, origin on CP-01 at elevation ELEV0.
//
// No card sits on an exploded view: those keep their part labels. Every window below ends before
// its chapter's labels begin and starts after they end.
import * as THREE from 'three';
import { outlineOf } from './outline.js';

export const CP = { E: 441422.273, N: 5620129.047 };
/** survey-style digit grouping, as Underhill's cards print it: 5 620 129.047 */
export const grp = (v, d = 3) => {
  const [i, f] = Math.abs(v).toFixed(d).split('.');
  return (v < 0 ? '−' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (f ? `.${f}` : '');
};

// slots, in fractions of the picture (the card's (ax, ay) point sits at (x, y)) or px from the pin
const NEAR = [
  { pin: true, dx: 90, dy: -30, ax: 0, ay: 1 },
  { pin: true, dx: -90, dy: -30, ax: 1, ay: 1 },
  { pin: true, dx: 90, dy: 30, ax: 0, ay: 0 },
  { pin: true, dx: -90, dy: 30, ax: 1, ay: 0 },
];
const GRID = [
  { x: 0.97, y: 0.05, ax: 1, ay: 0 }, { x: 0.03, y: 0.05, ax: 0, ay: 0 },
  { x: 0.97, y: 0.5, ax: 1, ay: 0.5 }, { x: 0.03, y: 0.5, ax: 0, ay: 0.5 },
  { x: 0.97, y: 0.95, ax: 1, ay: 1 }, { x: 0.03, y: 0.95, ax: 0, ay: 1 },
  { x: 0.5, y: 0.05, ax: 0.5, ay: 0 }, { x: 0.5, y: 0.95, ax: 0.5, ay: 1 },
  { x: 0.78, y: 0.05, ax: 0.5, ay: 0 }, { x: 0.22, y: 0.05, ax: 0.5, ay: 0 },
  { x: 0.78, y: 0.95, ax: 0.5, ay: 1 }, { x: 0.22, y: 0.95, ax: 0.5, ay: 1 },
];
const SIDE_R = [{ x: 0.72, y: 0.2, ax: 0, ay: 0 }, { x: 0.7, y: 0.5, ax: 0, ay: 0.5 }];
const SIDE_L = [{ x: 0.28, y: 0.2, ax: 1, ay: 0 }, { x: 0.3, y: 0.5, ax: 1, ay: 0.5 }];

const _box = new THREE.Box3();
/** the top centre of an object's world box: a pin on top of it, so its leader rises clear */
function topOf(obj, out) {
  if (!obj) return null;
  _box.setFromObject(obj, false);
  if (_box.isEmpty()) return null;
  return _box.getCenter(out).setY(_box.max.y);
}
/** the planet's disc as seen: a ring of points round the globe's limb, facing the camera. A sphere
 *  of radius R seen from distance d subtends asin(R / d), wider than its centre section, so the ring
 *  through the centre has radius R·d / √(d² − R²). */
const _n = new THREE.Vector3(), _t = new THREE.Vector3(), _b = new THREE.Vector3();
function discOf(centre, R, camera) {
  const d = Math.max(R * 1.02, camera.position.distanceTo(centre));
  const radius = (R * d) / Math.sqrt(d * d - R * R);
  _n.copy(camera.position).sub(centre).normalize();
  _t.set(0, 1, 0).cross(_n);
  if (_t.lengthSq() < 1e-6) _t.set(1, 0, 0);
  _t.normalize(); _b.copy(_n).cross(_t);
  const pts = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    pts.push(centre.clone().addScaledVector(_t, Math.cos(a) * radius).addScaledVector(_b, Math.sin(a) * radius));
  }
  return pts;
}
/** a small box around a point (radius r, metres) */
function around(p, r) {
  const pts = [];
  for (let i = 0; i < 8; i++) pts.push(new THREE.Vector3(p.x + (i & 1 ? r : -r), p.y + (i & 2 ? r : -r), p.z + (i & 4 ? r : -r)));
  return pts;
}

/**
 * @param {object} c   the scene: { TL, FIELD, ELEV0, SITE, field, globe, models, droneFlight, groundAt, parcelToWorld, slope }
 * @returns {object[]} card specs for Cards.add
 */
export function cardSpecs(c) {
  const { TL, FIELD, ELEV0, SITE, field, globe, models, droneFlight, groundAt, parcelToWorld, camera, logo } = c;
  // the planet (unit sphere at the origin) is the subject of the Act III cards
  // Act III: the site and its rings must stay clear; the planet behind it is a backdrop, kept clear
  // when there is room (the camera starts close enough that the planet fills the frame)
  const planet = () => [
    around(globe.siteWorldPos(new THREE.Vector3()), 0.17),
    Object.assign(discOf(new THREE.Vector3(0, 0, 0), 1.045, camera), { soft: true }),   // the atmosphere's rim
  ];
  const root = (k) => models.active(k)?.inst.root || null;
  const socket = (k, name, out) => { const e = models.active(k); return e?.inst.sockets[name] ? e.inst.sockets[name].getWorldPosition(out) : null; };
  const crew = () => ['drone', 'gnss', 'ts'].map((k) => outlineOf(models.active(k))).filter((s) => s.length);
  // where the drone's pulses land on the studio floor (the payload's axis, down to y = 0)
  const pulseLanding = () => {
    const o = socket('drone', 'payload', new THREE.Vector3());
    if (!o) return [];
    // the beam and the mark it writes on the pad
    return [o, ...logo.corners];
  };

  // the profile, from the measured points themselves
  const P = field.sectionPoints, NP = P.length;
  const lineLen = Math.hypot(P[NP - 1].x - P[0].x, P[NP - 1].z - P[0].z);
  const z0 = ELEV0 + P[0].y, z1 = ELEV0 + P[NP - 1].y;
  // the parcel
  const PA = FIELD.parcel, along = 2 * PA.ha, across = 2 * PA.hc;
  const parcelShape = () => {
    const pts = [];
    for (const [a, b] of [[-PA.ha, -PA.hc], [PA.ha, -PA.hc], [PA.ha, PA.hc], [-PA.ha, PA.hc]]) {
      const [x, z] = parcelToWorld(a, b); const y = groundAt(x, z);
      pts.push(new THREE.Vector3(x, y, z), new THREE.Vector3(x, y + 1.2, z));
    }
    return pts;
  };
  const [hLo, hHi] = field.contourRange;
  const pt114 = () => ({ N: CP.N - TL.PRISM_GLASS.z, E: CP.E + TL.PRISM_GLASS.x, Z: ELEV0 + TL.PRISM_GLASS.y });

  return [
    /* ---------------------------------------------------------------- studio: beauty shots */
    {
      id: 'drone', u: [1.75, 3.2], title: 'Survey drone',
      purpose: 'Carries a laser scanner over the site to map the ground from the air.',
      rows: ['RTK GNSS on board: every point lands a few cm from true', 'Underhill flies the DJI M350 RTK'],
      pin: (s, o) => topOf(root('drone'), o),
      subject: () => [outlineOf(models.active('drone'))],
      slots: [...SIDE_R, ...SIDE_L, ...NEAR, ...GRID],
    },
    {
      id: 'sensor', u: [8.95, 10.0], title: 'LiDAR scanner',
      purpose: 'Fires laser pulses at the ground; every return becomes one measured 3D point.',
      rows: ['Several returns per pulse: it reaches the ground under trees', 'YellowScan Mapper+ or Zenmuse L2 payloads'],
      pin: (s, o) => socket('drone', 'payload', o),
      // the drone and the patch of floor its pulses land on (the card keeps clear of both)
      subject: () => [outlineOf(models.active('drone')), pulseLanding()],
      slots: [...SIDE_R, ...SIDE_L, ...NEAR, ...GRID],
    },
    {
      id: 'gnss', u: [11.2, 12.55], title: 'GNSS base station',
      purpose: 'Stands over a known mark and radios corrections, so every rover and drone on site agrees to about 2 cm.',
      rows: ['RTK corrections by radio or NTRIP', 'Underhill runs Trimble R10 bases'],
      pin: (s, o) => socket('gnss', 'dome', o),
      subject: () => [outlineOf(models.active('gnss'))],
      slots: [...SIDE_R, ...SIDE_L, ...NEAR, ...GRID],
    },
    {
      id: 'ts', u: [18.75, 19.8], title: 'Robotic total station',
      purpose: 'Measures two angles and a distance to a prism: millimetre work for stake-out and as-builts.',
      rows: ['Robotic: it tracks the prism, so one person can survey', 'Underhill uses the Trimble S7 and SX10'],
      pin: (s, o) => topOf(root('ts'), o),
      subject: () => [outlineOf(models.active('ts'))],
      slots: [...SIDE_R, ...SIDE_L, ...NEAR, ...GRID],
    },

    /* --------------------------------------------------------------------- Act II: the field */
    {
      id: 'control', u: [30.4, 32.35], title: 'Control point CP-01',
      purpose: 'The known position every other measurement on this site hangs off.',
      rows: [`N ${grp(CP.N)} · E ${grp(CP.E)}`, 'NAD83(CSRS) · UTM 11N · heights CGVD2013'],
      pin: (s, o) => o.copy(FIELD.stations.gnss).setY(groundAt(FIELD.stations.gnss.x, FIELD.stations.gnss.z) + 0.06),
      subject: () => crew(),
      slots: [...NEAR, ...SIDE_R, ...SIDE_L, ...GRID],
    },
    {
      id: 'observe', u: [33.9, 34.8], title: 'Measured point PT-114', coords: true,
      purpose: 'A point on the far slope, fixed from CP-01 by two angles and a distance.',
      rows: () => { const p = pt114(); return [`N ${grp(p.N, 2)} · E ${grp(p.E, 2)}`, `Elevation ${grp(p.Z, 2)} m · distance ${c.slope().toFixed(3)} m`]; },
      pin: (s, o) => o.copy(TL.PRISM_GLASS),
      subject: () => [...crew(), around(TL.PRISM_GLASS, 0.9)],
      slots: [...NEAR, ...GRID],
    },
    {
      id: 'profile', u: [TL.PROFILE_TAG_U, 37.75], title: 'Ground profile',
      purpose: 'Shots along one line, no prism needed: how steeply the slope rises where the road will go.',
      rows: [`${NP} points over ${lineLen.toFixed(1)} m · ${(lineLen / (NP - 1)).toFixed(2)} m apart`, `Rises ${z0.toFixed(1)} → ${z1.toFixed(1)} m · mean grade ${Math.round(((z1 - z0) / lineLen) * 100)} %`],
      // on the ground while the points are measured; on the section's curve once it stands up
      pin: (s, o) => field.sectionAnchor(TL.PROFILE_TAG_I, s.field.section.rise > 0.02, o),
      // the section as drawn: the lifted curve, the shaded ground under it down to the datum, and the
      // leaders to the measured points (the plane above the curve is barely lit, and not counted)
      subject: (s) => {
        const lift = field.secU.uLift.value, datum = field.sectionRange[0] - 1 + lift;
        const sec = [];
        for (let i = 0; i < NP; i += 2) sec.push(new THREE.Vector3(P[i].x, P[i].y + lift + 0.4, P[i].z), new THREE.Vector3(P[i].x, datum - 0.3, P[i].z), P[i]);
        sec.push(new THREE.Vector3(P[NP - 1].x, P[NP - 1].y + lift + 0.4, P[NP - 1].z), P[NP - 1]);
        return s.field.section.rise > 0.02 ? [sec] : [P.filter((_, i) => i <= Math.ceil(s.field.section.shown)), ...crew()];
      },
      // (the top-left slot hugs the safe edge: as the section finishes rising its left end reaches x ~ 0.2)
      slots: [{ x: 0.5, y: 0.02, ax: 0.5, ay: 0 }, { x: 0.97, y: 0.05, ax: 1, ay: 0 }, { x: 0.005, y: 0.05, ax: 0, ay: 0 }, ...NEAR, ...GRID],
    },
    {
      id: 'capture', u: [44.35, 46.6], title: 'LiDAR mapping flight',
      purpose: 'Parallel strips that overlap, so the scans cover the whole parcel with no gaps.',
      rows: (s) => {
        const q = s.field.capture, n = field.returnsAt(q);
        const strip = Math.min(FIELD.strips, Math.floor(q * FIELD.strips) + 1);
        return [`${FIELD.strips} strips ${(across / FIELD.strips).toFixed(1)} m apart · ${((along * across) / 10000).toFixed(2)} ha parcel`,
          `Strip ${strip} of ${FIELD.strips} · ${Math.round((n / field.cloudCount) * 100)} % covered`];
      },
      pin: (s, o) => o.copy(droneFlight.pos),
      subject: () => [parcelShape(), around(droneFlight.pos, 1.2)],
      // top right: the drone turns at the right end of each strip, through the middle of the right
      // edge, so a card there would have to dodge it (three jumps in a second); up here it never does
      slots: [{ x: 0.97, y: 0.02, ax: 1, ay: 0 }, { x: 0.97, y: 0.45, ax: 1, ay: 0.5 }, ...GRID],
    },
    {
      id: 'model', u: [47.6, 49.25], title: 'Topographic model',
      purpose: 'The deliverable: a bare-earth surface with contours, ready for the engineers to design the road on.',
      rows: ['Contours every 0.5 m, index every 2.5 m', `Elevations ${(ELEV0 + hLo).toFixed(1)} – ${(ELEV0 + hHi).toFixed(1)} m (CGVD2013)`],
      pin: (s, o) => { const [x, z] = parcelToWorld(-PA.ha * 0.62, -PA.hc * 0.35); return o.set(x, groundAt(x, z) + 0.05, z); },
      subject: () => [parcelShape()],
      slots: [{ x: 0.97, y: 0.45, ax: 1, ay: 0.5 }, ...GRID],   // the right of the frame is kept clear for it
    },

    /* ------------------------------------------------------------------- Act III: the planet */
    {
      id: 'site', u: [52.15, 53.55], title: 'The site, on the globe',
      purpose: 'The same coordinates place this valley in the frame every survey on Earth shares.',
      rows: [`${SITE.lat.toFixed(2)}° N · ${Math.abs(SITE.lon).toFixed(2)}° W · British Columbia`, `Elevation ${ELEV0.toFixed(0)} m · CGVD2013`],
      line: `${SITE.lat.toFixed(2)}° N · ${Math.abs(SITE.lon).toFixed(2)}° W · BC`,
      pin: (s, o) => globe.siteWorldPos(o),
      subject: () => planet(),
      slots: [...SIDE_R, ...NEAR, ...SIDE_L, ...GRID],
    },
    {
      id: 'coverage', u: [54.2, 55.6], title: 'Positioning satellites',
      purpose: 'The constellation the base station listens to; four or more in view give a fix.',
      rows: () => ['24 satellites in 6 orbital planes, as GPS flies', `${globe.linked ?? 0} in view of the site now`],
      line: () => `${globe.linked ?? 0} satellites in view · four give a fix`,
      pin: (s, o) => (globe.linkedSat ? globe.linkedSat.sp.getWorldPosition(o) : null),
      subject: () => planet(),
      slots: [...NEAR, ...GRID],
    },
    {
      id: 'heritage', u: [55.85, TL.U + 0.3], title: 'Underhill, since 1913',
      purpose: 'Measuring the ground for Western and Northern Canada for more than a century.',
      rows: ['BC · Yukon · Northwest Territories · Nunavut', 'Vancouver · Vancouver Island · Kamloops · Whitehorse'],
      line: 'Since 1913 · BC, Yukon, NWT and Nunavut',
      subject: () => planet(),
      slots: [{ x: 0.97, y: 0.05, ax: 1, ay: 0 }, ...GRID],
    },
  ];
}
