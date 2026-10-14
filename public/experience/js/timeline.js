// The storyboard. Everything spatial is a pure function of `u`, the scroll position measured in
// screen-heights (0 … U). Camera keys are authored as orbit parameters around a target and are
// framed by subject radius, so they hold their composition at any aspect ratio.
import * as THREE from 'three';
import { FIELD, heightAt, groundAt, stripState, STRIPS_END } from './field.js';

export const U = 57.6;
/** Act II cut: the studio gives way to the survey site under a dip to black. */
export const FCUT = 27.3;

/* Act II timings (u) that several systems share */
/** The total station's reflectorless profile: 24 hops along one line, then the section stands up. */
export const SWEEP = [34.85, 36.45];
export const RISE = [36.5, 37.1];
/** The slow-motion pre-flight on the pad, then the climb-out to the first strip. */
export const HERO = {
  cut: 37.93,                  // camera cut to the pad, under a short dip
  unfold: [38.2, 39.3],        // the arms swing out and lock (a small settle follows)
  leds: [39.5, 0.15, 0.09],    // first motor ring on, gap to the next, flicker-in time
  cal: [40.3, 41.35],          // gimbal calibration sweep
  checks: [40.5, 40.85, 41.2], // IMU aligned · RTK fixed · LiDAR ready
  // (re-timed 2026-10-13 for real-world pace: the take-off is now its own move, from the "Check, then
  // fly" stop to a new "Climb to survey height" stop (43.3), played as one ~9.5 s shot at an even
  // rate in u: spin-up ~1.2 s, off the pad ~1.5 s, a ~1 s hover at 2 m, a ~4 s eased climb-out)
  // (2026-10-13, second pass: the hold at 2 m is shorter (~0.7 s) and the climb-out starts sooner and
  // ends later, so the drone is nearly still for a moment only, and alive then: main.js adds the
  // hover's drift and bob on the clock. It reaches the corner just before the stop and holds there,
  // scanning, while the stop dwells; the strips start soon after the stop)
  spin: [41.36, 41.55],        // rotors spin up (the real speed ramps over ~1 s on the clock, main.js)
  lift: [41.6, 41.98],         // off the pad to a 2 m hover
  hover: [41.98, 42.12],       // a short hold at 2 m
  transit: [42.12, 43.22],     // climb (eased in and out) and out to the start of the first strip
  beam: [43.16, 43.28],        // the LiDAR switches on at the parcel edge
};
/** The "Climb to survey height" stop: the drone holds at the parcel corner, its scanner on. */
export const F4C = 43.3;
/** The strips. */
export const CAPTURE = [43.34, 46.68];
/**
 * Authored pace (seconds per unit of u) for the field's flight, used by the stepper and by autoplay
 * for any move inside these ranges instead of their usual 3–5 s: the take-off at real-world speeds
 * (spin-up ~1.2 s, a hold at 2 m, a ~4 s eased climb-out: 9.5 s from "Check, then fly" to "Climb to
 * survey height"), the strips at one steady ~16 m/s across both moves that fly them (one strip and
 * its turn ~3.8 s), then the run to the hold and the model at a quicker pace (2.6 s/u since
 * 2026-10-13, was 2.0: the camera now holds the drone to the end of the last strip before it climbs
 * to the plan view, so the climb is steeper: at 2.6 the camera's top speed in that move is 36 m/s,
 * under the 40 m/s it reached before at 2.0).
 */
export const PACE = [[41.3, F4C, 4.75], [F4C, 46.68, 4.6], [46.68, 48.85, 2.6]];
/** seconds per u at u inside PACE, or 0 */
export function paceAt(u) { for (const [a, b, k] of PACE) if (u >= a - 1e-6 && u <= b + 1e-6) return k; return 0; }
/** The drone's run at the lens; the planet is cut in behind it when it fills the frame. */
export const APPROACH = [50.7, 51.75];
/** Act III cut: the site gives way to the planet (78 % of the way through the approach). */
export const GCUT = 51.52;

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const win = (u, a, b) => clamp01((u - a) / (b - a));
export const smooth = (t) => t * t * (3 - 2 * t);
export const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const sw = (u, a, b) => smoother(win(u, a, b));
const EASE = {
  inOut: smoother,
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOutSoft: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
};

// station centres (keep in sync with stage.js)
const DX = -4.5, GX = 0, TX = 4.5;

/* ------------------------------------------------------------------ captions and still frames */
export const BEATS = [
  { id: 'title', chapter: 'title', u0: 0, u1: 1.5, still: 0.25 },
  { id: 'd1', chapter: 'drone', u0: 1.5, u1: 3.2, still: 2.45, kicker: '01 — From above · The survey drone', title: 'What is actually there?',
    short: 'The drone answers it from the air.',
    copy: 'Every site begins as that question. The survey drone answers it from the air, millions of measured points at a time.' },
  // one stop for the exploded drone, resting once every part is out (the gimbal camera arrives last)
  { id: 'd2', chapter: 'drone', u0: 3.2, u1: 7.0, still: 5.95, kicker: '01 — From above · The survey drone', title: 'Taken apart, in order',
    short: 'Top camera first, then covers, arms and gear.',
    copy: 'The top camera lifts away first. The covers, arms, motors and propellers follow, then the landing gear, and the gimbal camera last. Each part leaves along the joint that holds it.' },
  { id: 'd4', chapter: 'drone', u0: 7.0, u1: 8.2, still: 7.85, kicker: '01 — From above · The survey drone', title: 'Spin up. Lift off.',
    short: 'Four motors spin up; it climbs clear of the pad.',
    copy: 'Four brushless motors come up to speed. The props blur, and the drone climbs clear of the pad.' },
  { id: 'd5', chapter: 'drone', u0: 8.2, u1: 10.2, still: 9.75, kicker: '01 — From above · The survey drone', title: 'Every return is a point',
    short: 'Each return is a measured point. These spell the mark.',
    copy: 'The payload tips down and sweeps its laser over the pad. Every return is a measured point; here they write the Underhill mark. Fly a whole site and it becomes millions.' },
  { id: 'g1', chapter: 'gnss', u0: 10.2, u1: 12.5, still: 11.85, capDelay: 0.85, kicker: '02 — From the sky · The GNSS base station', title: 'Points need an anchor',
    short: 'The base station ties points to the earth.',
    copy: 'Points from the air float until something ties them to the earth. The base station stands over a known mark and listens to the satellites overhead.' },
  { id: 'g2', chapter: 'gnss', u0: 12.5, u1: 15.6, still: 14.65, kicker: '02 — From the sky · The GNSS base station', title: 'Stacked on one axis',
    short: 'Dome, pole and radio, plumb over the mark.',
    copy: 'Dome, pole, radio and tripod share a single vertical line, so the antenna sits exactly plumb over the mark.' },
  { id: 'g3', chapter: 'gnss', u0: 15.6, u1: 17.8, still: 16.95, kicker: '02 — From the sky · The GNSS base station', title: 'Listening, then speaking',
    short: 'Signals in from orbit, corrections out by radio.',
    copy: 'Signals arrive from orbit. The radio passes corrections to every rover on site, and metres of error shrink to a centimetre.' },
  { id: 't1', chapter: 'ts', u0: 17.8, u1: 19.8, still: 19.15, capDelay: 0.8, kicker: '03 — Along a line of sight · The total station', title: 'When a centimetre is too much',
    short: 'Two angles and a distance, to the millimetre.',
    copy: 'Where things get built, the total station takes over. It measures two angles and a distance, to the millimetre.' },
  { id: 't2', chapter: 'ts', u0: 19.8, u1: 23.0, still: 22.0, kicker: '03 — Along a line of sight · The total station', title: 'From handle to spike',
    short: 'Optics forward, tribrach down, legs apart.',
    copy: 'The instrument lifts off its tribrach, the optics come forward, and the tripod legs telescope apart.' },
  { id: 't3', chapter: 'ts', u0: 23.0, u1: 25.6, still: 24.75, kicker: '03 — Along a line of sight · The total station', title: 'One pulse, one point',
    short: 'A pulse to the prism and back: distance known.',
    copy: 'It swings onto a prism across the site. A pulse of light goes out and comes back, and the distance is known.' },
  { id: 'end', chapter: 'end', u0: 25.6, u1: 27.3, still: 26.5, kicker: 'Three instruments', title: 'Three ways to fix a point',
    short: 'From above, from the sky, along a line of sight.',
    copy: 'From above, from the sky, along a line of sight. Now put them to work on a real site.' },
  // ACT II: in the field
  { id: 'f1', chapter: 'field', u0: 27.3, u1: 30.2, still: 29.7, capDelay: 0.8, kicker: '04 — In the field', title: 'One site, three instruments',
    short: 'Before any earth moves, the crew measures it.',
    copy: 'A valley that needs a road. Before anyone moves earth, the crew sets up on the terrace and measures the ground.' },
  { id: 'f2', chapter: 'field', u0: 30.2, u1: 32.4, still: 31.75, kicker: '04 — In the field · Control', title: 'Start from a known point',
    short: 'The base station fixes the mark from orbit.',
    copy: 'The base station sits plumb over the control mark and fixes it from the satellites. Every other measurement hangs off this one.' },
  { id: 'f3', chapter: 'field', u0: 32.4, u1: 34.8, still: 34.3, kicker: '04 — In the field · Measure', title: 'Measure what matters',
    short: 'Two angles and a distance fix point PT-114.',
    copy: 'From the control, the total station turns onto a prism on the far slope: two angles and a distance fix point PT-114.' },
  { id: 'f3b', chapter: 'field', u0: 34.8, u1: HERO.cut, still: 37.45, kicker: '04 — In the field · Profile', title: 'A line through the ground',
    short: '24 points up the slope, stood up as a section.',
    copy: 'Then, without a prism: 24 points, hop by hop, along one straight line up the slope. Stood on edge, they are the ground in section.' },
  { id: 'f4a', chapter: 'field', u0: HERO.cut, u1: 40.25, still: 40.15, kicker: '04 — In the field · Pre-flight', title: 'Unfold. Wake up.',
    short: 'The arms lock out; the rings light one by one.',
    copy: 'The arms swing out and lock. One by one, the rings under the motors light.' },
  { id: 'f4b', chapter: 'field', u0: 40.25, u1: 42.3, still: 41.3, kicker: '04 — In the field · Pre-flight', title: 'Check, then fly',
    short: 'Gimbal level, IMU, RTK and LiDAR ready: lift-off.',
    copy: 'The gimbal sweeps its range and settles level. IMU aligned, RTK fixed, LiDAR ready: the rotors spin up and it lifts off.' },
  // (a stop of its own since 2026-10-13: the take-off used to be squeezed with two and a half strips
  // into one 5 s move; its moves are timed by PACE, below)
  { id: 'f4c', chapter: 'field', u0: 42.3, u1: 43.7, still: F4C, kicker: '04 — In the field · Take-off', title: 'Climb to survey height',
    short: 'A hover at two metres, then out to the parcel.',
    copy: 'It holds a moment at two metres, then climbs to survey height and runs out to the corner of the parcel. On the first flight line, the scanner switches on.' },
  { id: 'f4', chapter: 'field', u0: 43.7, u1: 46.9, still: 45.36, kicker: '04 — In the field · Capture', title: 'Then capture everything else',
    short: 'Strip by strip, the drone scans the parcel.',
    copy: 'The parcel is staked. Strip by strip the drone scans it, and every return lands on the same control.' },
  { id: 'f5', chapter: 'field', u0: 46.9, u1: 49.3, still: 48.85, kicker: '04 — In the field · Model', title: 'From points to a surface',
    short: 'The cloud resolves into contours and a model.',
    copy: 'The cloud resolves into contours and a ground model. Now the road can be designed on ground that is known.' },
  { id: 'f6', chapter: 'field', u0: 49.3, u1: GCUT, still: 50.4, kicker: '04 — In the field', title: 'Measured first. Built right.',
    short: 'One mark, one line, one surface: a road begins.',
    copy: 'One control mark, one measured line, one scanned surface. That is how a road begins.' },
  // ACT III: the bigger picture
  { id: 'w1', chapter: 'world', u0: GCUT, u1: 53.6, still: 53.1, capDelay: 0.6, kicker: '05 — The bigger picture', title: 'One valley, one frame',
    short: 'The whole site: one point in a global frame.',
    copy: 'Pull back far enough and the whole site is a single point, fixed in the same frame as every other survey on Earth.' },
  { id: 'w2', chapter: 'world', u0: 53.6, u1: 55.6, still: 55.25, kicker: '05 — The bigger picture', title: 'Held up by satellites',
    short: 'Their signals tie this hillside to the world.',
    copy: 'Navigation satellites are always overhead. Their signals are what tie a hillside in British Columbia to the rest of the world.' },
  { id: 'w3', chapter: 'world', u0: 55.6, u1: 57.6, still: 57.3, kicker: 'Ground truth', title: 'Measured, everywhere.',
    short: 'Measured first. Underhill, since 1913.',
    copy: 'From above, from the sky, along a line of sight. Underhill has measured the ground this way, for the people who build on it, since 1913.' },
];

// chapter intertitles, shown over a dip to black while the camera travels between stations
export const INTERTITLES = [
  { id: 'gnss', n: '02', t: 'From the sky', s: 'The GNSS base station', u0: 10.2, u1: 10.95 },   // gone before the scene comes back from black
  { id: 'ts', n: '03', t: 'Along a line of sight', s: 'The total station', u0: 17.75, u1: 18.45 },
  { id: 'field', n: '04', t: 'In the field', s: 'Now put them to work', u0: 26.95, u1: 27.95 },
  // Act III has no card: the drone flies out of the frame and the planet is already behind it
  { id: 'world', n: '05', t: 'The bigger picture', s: 'From one valley to the planet', u0: null, u1: null },
];

/* ------------------------------------------------------------------------- Act II geometry */
const D2R = Math.PI / 180;
const TS_HEAD = FIELD.stations.ts.clone().add(new THREE.Vector3(0, 1.1, 0));
export const PRISM_GLASS = FIELD.prism.clone().add(new THREE.Vector3(0, 1.55, 0));
/** Alidade yaw / telescope tilt (degrees) that put the total station's line of sight on the prism. */
export const TS_AIM = (() => {
  const d = PRISM_GLASS.clone().sub(TS_HEAD);
  return { yaw: Math.atan2(d.x, d.z) / D2R, tilt: Math.atan2(d.y, Math.hypot(d.x, d.z)) / D2R };
})();
/** A shot past an instrument toward an anchor: instrument large in the foreground, anchor beyond. */
function pastInstrument(head, anchor, side, back, lift, aim, aimLift) {
  const u = anchor.clone().sub(head).setY(0).normalize();
  const camDir = u.clone().negate().applyAxisAngle(new THREE.Vector3(0, 1, 0), side * D2R);
  const cam = head.clone().addScaledVector(camDir, back).add(new THREE.Vector3(0, lift, 0));
  const tgt = head.clone().addScaledVector(u, aim).add(new THREE.Vector3(0, aimLift, 0));
  const v = cam.clone().sub(tgt); const d = v.length();
  return { tgt: tgt.toArray(), az: Math.atan2(v.x, v.z) / D2R, el: Math.asin(v.y / d) / D2R, d };
}
const M1 = pastInstrument(TS_HEAD, PRISM_GLASS, 30, 2.4, 0.35, 6, 0.05);
const M2 = pastInstrument(TS_HEAD, PRISM_GLASS, 22, 2.0, 0.3, 9, 0.0);
// telephoto down the line of sight: the prism small and lit, the instrument just out of frame
const M3 = (() => {
  const u = PRISM_GLASS.clone().sub(TS_HEAD).normalize();
  const side = new THREE.Vector3().crossVectors(u, new THREE.Vector3(0, 1, 0)).normalize();
  const cam = TS_HEAD.clone().addScaledVector(u, -1.2).addScaledVector(side, 0.55).add(new THREE.Vector3(0, 0.32, 0));
  const tgt = PRISM_GLASS.clone().lerp(TS_HEAD, 0.25);
  const v = cam.clone().sub(tgt); const d = v.length();
  return { tgt: tgt.toArray(), az: Math.atan2(v.x, v.z) / D2R, el: Math.asin(v.y / d) / D2R, d };
})();
/* The profile the total station measures in reflectorless mode: 24 points equally spaced on one
   straight line that runs up the far slope (from the valley floor towards the skyline), each one
   exactly on the rendered ground. Every point is in clear sight of the instrument. */
export const PROFILE_LINE = FIELD.profile;
const PROFILE_MID = new THREE.Vector3(3, -0.5, -54);
let _profile = null;
/** The measured points (built on first use, after the terrain exists, so they sit on its mesh). */
export function profilePoints() {
  if (_profile) return _profile;
  const { a, b, n } = PROFILE_LINE;
  _profile = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1); const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
    _profile.push(new THREE.Vector3(x, groundAt(x, z), z));
  }
  return _profile;
}
/**
 * Where the laser is during the profile, as a hop from point to point: each slot slews quickly onto
 * the next point (the beam dims while it moves), then dwells while the distance is measured.
 * @returns {{ pos: Vector3, measured: number, beam: number }} measured = points recorded so far (continuous)
 */
const HOP_SLEW = 0.36;
/** The profile's label is anchored on this point (and shows once it has been measured). */
export const PROFILE_TAG_I = 17;
export const PROFILE_TAG_U = SWEEP[0] + ((PROFILE_TAG_I + HOP_SLEW + 0.1) / FIELD.profile.n) * (SWEEP[1] - SWEEP[0]);
export function profileHop(u, out = { pos: new THREE.Vector3(), measured: 0, beam: 1 }) {
  const P = profilePoints(), N = P.length;
  const f = win(u, SWEEP[0], SWEEP[1]) * N;
  const k = Math.min(N - 1, Math.floor(f)), w = f >= N ? 1 : f - k;
  const m = k === 0 ? 1 : smoother(Math.min(1, w / HOP_SLEW));
  out.pos.copy(P[Math.max(0, k - 1)]).lerp(P[k], m);
  out.pos.y += 0.02;
  out.measured = k + smooth(win(w, HOP_SLEW, HOP_SLEW + 0.1));
  out.beam = k === 0 ? 1 : 1 - 0.75 * Math.min(smooth(win(w, 0, 0.06)), 1 - smooth(win(w, HOP_SLEW - 0.05, HOP_SLEW)));
  return out;
}
function aimAt(P) {
  const d = P.clone().sub(TS_HEAD);
  // unwrap around the prism bearing: the profile straddles due south, where atan2 jumps by 360°
  const raw = Math.atan2(d.x, d.z) / D2R;
  const yaw = TS_AIM.yaw + ((((raw - TS_AIM.yaw) % 360) + 540) % 360 - 180);
  return { yaw, tilt: Math.atan2(d.y, Math.hypot(d.x, d.z)) / D2R };
}
const _hop = { pos: new THREE.Vector3(), measured: 0, beam: 1 };

// the drone pad, and where the drone holds after the strips: the centre of the closing shot
const DPX = FIELD.stations.drone.x, DPZ = FIELD.stations.drone.z;
export const HOLD = new THREE.Vector3(1.5, 6.0, -14);
const CLOSE = { tgt: HOLD.toArray(), az: 9, el: 1.5, d: 44 };
/** The closing camera (it does not move while the drone flies at it). */
export const CLOSE_CAM = new THREE.Vector3(
  Math.sin(CLOSE.az * D2R) * Math.cos(CLOSE.el * D2R), Math.sin(CLOSE.el * D2R), Math.cos(CLOSE.az * D2R) * Math.cos(CLOSE.el * D2R),
).multiplyScalar(CLOSE.d).add(HOLD);
// a camera key can follow the drone: its target is then a function of u
const _dt = { pos: new THREE.Vector3(), heading: 0, pitch: 0, scanning: false, flying: false };
const droneTgt = (dy) => (u) => { fieldDrone(u, _dt); return [_dt.pos.x, _dt.pos.y + dy, _dt.pos.z]; };
/** The drone's path averaged over the last 2·lag of u (a pure box filter): a target that trails it by
 *  about `lag` and rounds off its turns, for a camera that follows with a lag instead of in lockstep. */
const _tr = new THREE.Vector3();
function trailAt(u, lag) {
  _tr.set(0, 0, 0);
  const n = 7;
  for (let i = 0; i < n; i++) { fieldDrone(u - (2 * lag * i) / (n - 1), _dt); _tr.add(_dt.pos); }
  return _tr.multiplyScalar(1 / n);
}
const droneTrail = (dy, lag) => (u) => { const p = trailAt(u, lag); return [p.x, p.y + dy, p.z]; };
/** Over the drone (the corner hold and the mapping flight): a point `dy` below it, `ahead` metres on
 *  along the first strip. It sits mostly on the drone and a quarter of the way back along its path
 *  (trailAt): the turns at the strip ends are rounded off, but the drone, flying away from or toward
 *  the lens on alternate strips, no longer runs a few metres ahead of the frame or into its bottom. */
const overTgt = (dy, ahead = 0) => (u) => {
  const p = trailAt(u, 0.04), h = typeof dy === 'function' ? dy(u) : dy;
  fieldDrone(u, _dt); p.lerp(_dt.pos, 0.72);
  return [p.x + ahead * Math.cos(0.07), p.y + h, p.z + ahead * Math.sin(0.07)];
};
/** The corner hold's aim: near the drone while it climbs out (aimed lower, the climbing drone left the
 *  top of the frame), easing down below it as it arrives, so its fan reaches the ground in frame. */
const holdDy = (u) => -1 - 4.5 * smooth(win(u, 42.7, F4C));
/** The plan view's target: over the drone (as the mapping shot has it) until the last strip is nearly
 *  flown, then eased over to the plan's centre `c` while the camera climbs. */
const toPlan = (c) => (u) => {
  const w = smooth(win(u, 46.2, 47.74)), p = overTgt(-3.8)(u);
  return [p[0] + (c[0] - p[0]) * w, p[1] + (c[1] - p[1]) * w, p[2] + (c[2] - p[2]) * w];
};
// the profile: behind and above the instrument, the line climbing the far slope in frame
// (low enough that the instrument stepping round from point to point stays in the corner of frame)
const M4 = pastInstrument(TS_HEAD, PROFILE_MID, -26, 3.3, 0.8, 46, -3.4);
const M5 = pastInstrument(TS_HEAD, PROFILE_MID, -22, 2.9, 0.75, 46, -3.1);
// the section, square-on: the camera swings out to look across the line, the dusk glow behind it
const sideOn = (az, el, d) => ({ tgt: [3, 9.2, -54], az, el, d });
// (far enough back that the profile's information card fits in the sky above the section)
const SIDE1 = sideOn(57, 4, 51), SIDE2 = sideOn(53, 5, 47.5);

export function beatAt(u) {
  for (const b of BEATS) if (u < b.u1) return b;
  return BEATS[BEATS.length - 1];
}

/* ------------------------------------------------------------------------------- camera keys */
// tgt: look-at point. az/el: orbit angles in degrees (az 0 = in front, +Z). r: radius to keep in the
// safe frame (metres) — or d: explicit distance. frame: 'wide' | 'labels' (labels reserve side
// columns). portrait: overrides for tall screens. ease: easing of the segment that ENDS at this key.
const CAM = [
  // title: low, wide, the drone in silhouette; lights come up
  // (tall screens: the drone is the hero of the title, large under the title block)
  { u: 0.0, tgt: [DX, 0.17, 0], az: -22, el: 2.5, r: 1.05, fill: 0.92, fov: 28, frame: 'wide', portrait: { fill: 1.04 } },   // (phones: about 85 % of the width)
  { u: 1.5, tgt: [DX, 0.16, 0], az: -31, el: 4, r: 0.74, fill: 0.92, fov: 30, frame: 'wide', portrait: { fill: 1.0 } },
  // 01 drone — low hero, slow push
  { u: 2.6, tgt: [DX, 0.17, 0], az: -38, el: 2.5, r: 0.58, fov: 30, frame: 'wide', ease: 'inOutSoft' },
  // rise to a three-quarter view for the exploded view
  { u: 3.4, tgt: [DX, 0.22, 0], az: 30, el: 22, r: 0.56, fov: 30, frame: 'labels' },
  { u: 5.5, tgt: [DX, 0.3, 0], az: 46, el: 25, r: 0.7, fov: 30, frame: 'labels', ease: 'inOutSoft' },
  { u: 6.25, tgt: [DX, 0.3, 0], az: 58, el: 27, r: 0.7, fov: 30, frame: 'labels', ease: 'linear' },
  // reassembled, low again
  { u: 7.0, tgt: [DX, 0.17, 0], az: 18, el: 8, r: 0.74, fov: 30, frame: 'wide' },
  // lift-off: the camera stays low and lets the drone rise through frame
  { u: 7.95, tgt: [DX, 0.5, 0], az: 12, el: 3, r: 0.62, fov: 30, frame: 'wide' },
  // close push-in on the payload as it tips down…
  { u: 8.5, tgt: [DX, 0.43, 0.1], az: 50, el: -2, d: 0.5, fov: 30, frame: 'wide', portrait: { d: 0.75 } },
  // …then the camera eases back and tilts down to watch the returns land on the ground
  // (fitted to the drone and the patch of floor its pulses land on)
  // the mark being written: the camera rises over the pad until the mark reads, and holds
  { u: 8.95, tgt: [DX, 0.2, 0.12], az: 58, el: 24, r: 0.9, fill: 1.0, hit: true, fov: 32, frame: 'wide', ease: 'inOutSoft' },
  { u: 9.3, tgt: [DX, 0.18, 0.08], az: 46, el: 36, r: 0.9, fill: 1.0, hit: true, fov: 32, frame: 'wide', ease: 'linear' },
  { u: 9.7, tgt: [DX, 0.16, 0.04], az: 36, el: 46, r: 0.9, fill: 1.0, hit: true, fov: 32, frame: 'wide', ease: 'inOutSoft' },
  { u: 9.86, tgt: [DX, 0.16, 0.02], az: 36, el: 44, r: 0.9, fill: 1.0, hit: true, fov: 32, frame: 'wide' },
  // the mark fades: in on the drone as it settles, before the chapter's dip
  { u: 10.0, tgt: [DX, 0.3, 0], az: 34, el: 26, r: 0.9, fov: 32, frame: 'wide', ease: 'out' },
  // 02 GNSS — truck right to a low hero angle
  { u: 11.1, tgt: [GX, 0.62, 0], az: 20, el: -5, r: 0.56, fov: 30, frame: 'wide' },
  { u: 12.2, tgt: [GX, 0.62, 0], az: 27, el: -3, r: 0.54, fov: 30, frame: 'wide', ease: 'inOutSoft' },
  { u: 12.8, tgt: [GX, 0.66, 0], az: 36, el: 11, r: 0.7, fov: 30, frame: 'labels' },
  { u: 14.5, tgt: [GX, 0.78, 0], az: 50, el: 13, r: 0.84, fov: 30, frame: 'labels', ease: 'inOutSoft' },
  { u: 15.1, tgt: [GX, 0.78, 0], az: 58, el: 14, r: 0.84, fov: 30, frame: 'labels', ease: 'linear' },
  { u: 15.7, tgt: [GX, 0.62, 0], az: 30, el: 6, r: 0.64, fov: 30, frame: 'wide' },
  // push in on the dome; rings rise
  { u: 16.3, tgt: [GX, 1.2, 0], az: 16, el: -9, d: 1.2, fov: 30, frame: 'wide', portrait: { d: 1.8 } },
  { u: 17.3, tgt: [GX, 1.32, 0], az: 8, el: -11, d: 1.45, fov: 32, frame: 'wide', ease: 'inOutSoft', portrait: { d: 2.1 } },
  // 03 total station — truck right, low hero
  { u: 18.4, tgt: [TX, 0.66, 0], az: -22, el: -2, r: 0.7, fov: 30, frame: 'wide' },
  { u: 19.4, tgt: [TX, 0.66, 0], az: -28, el: 0, r: 0.67, fov: 30, frame: 'wide', ease: 'inOutSoft' },
  // exploded view: orbit round to the rear-right so the display on the back comes into view
  { u: 20.0, tgt: [TX, 0.84, 0], az: 30, el: 11, r: 0.84, fov: 30, frame: 'labels' },
  { u: 21.7, tgt: [TX, 1.06, 0], az: 72, el: 10, r: 1.0, fov: 30, frame: 'labels', ease: 'inOutSoft' },
  { u: 22.45, tgt: [TX, 1.06, 0], az: 132, el: 11, r: 1.0, fov: 30, frame: 'labels', ease: 'linear' },
  { u: 23.15, tgt: [TX, 0.8, 0], az: 58, el: 8, r: 0.72, fov: 30, frame: 'wide' },
  // over the shoulder: behind the eyepiece, looking down the line of sight
  { u: 23.75, tgt: [TX + 0.03, 1.12, -0.02], az: -24, el: 12, d: 0.8, fov: 30, frame: 'wide' },
  { u: 24.4, tgt: [TX + 1.19, 1.37, -3.29], az: -23.2, el: -0.8, d: 4.42, fov: 30, frame: 'wide', ease: 'inOutSoft' },
  { u: 25.1, tgt: [TX + 1.25, 1.39, -3.4], az: -22.8, el: -0.6, d: 4.15, fov: 30, frame: 'wide', ease: 'inOutSoft' },
  { u: 25.6, tgt: [TX + 1.27, 1.4, -3.45], az: -22.6, el: -0.5, d: 4.0, fov: 30, frame: 'wide', ease: 'linear' },
  // — dip to black; the three are gathered into one shot —
  // (phones: the three stand on a diagonal in depth, main.js FINALE_PHONE, seen from the front and
  // above, so they stack up the tall frame large and clear of each other instead of in a small row)
  { u: 25.601, tgt: [0, 0.58, 0], az: -7, el: 4, r: 1.55, fov: 30, frame: 'wide', ease: 'linear', portrait: { az: 50, el: 8, r: 1.35, fov: 40 }, phone: { az: 6, el: 30, fov: 34 } },
  { u: 26.7, tgt: [0, 0.5, 0], az: 0, el: 5, r: 1.78, fov: 30, frame: 'wide', ease: 'inOutSoft', portrait: { az: 58, el: 9, r: 1.5, fov: 40 }, phone: { az: 12, el: 31, fov: 34 } },
  { u: FCUT, tgt: [0, 0.49, 0], az: 3, el: 5.5, r: 1.82, fov: 30, frame: 'wide', ease: 'linear', portrait: { az: 61, el: 10, r: 1.54, fov: 40 }, phone: { az: 15, el: 32, fov: 34 } },
  // ===== ACT II: in the field (cut under black) =====
  // establishing: behind the crew on the terrace, the valley and the evening glow beyond
  { u: FCUT + 0.001, tgt: [-2.4, -2.0, -15], az: 10, el: 8, d: 28, fov: 32, ease: 'linear', pd: 1.35 },
  { u: 28.7, tgt: [-2.2, -1.2, -11], az: 12, el: 8.5, d: 23, fov: 32, ease: 'inOutSoft', pd: 1.35 },
  { u: 30.0, tgt: [-1.6, -0.5, -7.5], az: 15, el: 9, d: 17.5, fov: 32, ease: 'linear', pd: 1.35 },
  // control: the base station plumb over the mark
  // (fitted to the base station, which fills the frame)
  { u: 30.75, tgt: [0, 0.6, 0], az: 34, el: 14, r: 0.6, fill: 0.93, fov: 30, portrait: { fill: 0.9 } },
  { u: 32.1, tgt: [0, 0.74, 0], az: 26, el: 9, r: 0.6, fill: 0.93, fov: 30, ease: 'inOutSoft', portrait: { fill: 0.9 } },
  // measure: past the total station toward the prism, then down the line of sight
  { u: 32.75, ...M1, fov: 32, pd: 1.25 },
  { u: 33.55, ...M2, fov: 30, ease: 'inOutSoft', pd: 1.25 },
  { u: 34.5, ...M3, fov: 20, ease: 'inOutSoft', pd: 1.0 },
  // the profile: hop by hop up the far slope, seen past the instrument
  { u: 35.0, ...M4, fov: 34, pd: 1.3 },
  { u: SWEEP[1], ...M5, fov: 33, ease: 'linear', pd: 1.3 },
  // the section stands up: swing out to look square-on across it
  // (tall screens: from the south, wider, so the section climbs away up the screen and fits across it)
  { u: 37.2, ...SIDE1, fov: 30, pd: 1.55, portrait: { tgt: [2, 6.5, -53], az: 2, el: 11, d: 82, fov: 50, pd: 1 } },
  { u: HERO.cut - 0.03, ...SIDE2, fov: 30, ease: 'linear', pd: 1.55, portrait: { tgt: [2, 6.5, -53], az: -2, el: 12, d: 78, fov: 50, pd: 1 } },
  // — a short dip to black: the drone on its pad, a slow push-in through the pre-flight —
  // (the pre-flight is fitted to the drone, folded or not, so it always fills the frame)
  { u: HERO.cut, tgt: [DPX, 0.32, DPZ], az: 30, el: 6, r: 0.6, fill: 0.96, fov: 30, ease: 'linear', portrait: { fill: 0.84 } },
  { u: 39.4, tgt: [DPX, 0.32, DPZ], az: 21, el: 9, r: 0.6, fill: 0.95, fov: 30, ease: 'inOutSoft', portrait: { fill: 0.88 } },
  { u: 40.3, tgt: [DPX, 0.27, DPZ], az: 12, el: 7, r: 0.6, fill: 0.9, fov: 30, ease: 'inOutSoft' },
  // front-on and low for the gimbal's calibration sweep
  { u: 41.35, tgt: [DPX, 0.17, DPZ], az: 5, el: 4, r: 0.6, fill: 0.92, fov: 30, ease: 'inOutSoft' },
  { u: HERO.lift[0], tgt: [DPX, 0.38, DPZ], az: 7, el: 3, r: 0.6, fill: 0.9, fov: 30, portrait: { fill: 0.82 } },
  // lift-off: a low camera that tilts up after it and settles on the hover. The camera follows the
  // drone a beat late (droneTrail: its path averaged over the last stretch of u), so the two never
  // move in lockstep: the drone leads, the camera catches up
  { u: HERO.lift[1] + 0.06, tgt: droneTrail(0.1, 0.04), az: 12, el: -18, d: 5.2, fov: 32, pd: 1.3, ease: 'inOutSoft' },
  // chase it out over the valley as it climbs, and settle behind and above it at the parcel's far
  // corner, looking down the first flight line (the parcel ahead and to the right): close enough that
  // the drone reads as a drone, with the scanner's fan and swath under it
  // (2026-10-13, second pass: this key is the "Climb to survey height" stop itself, so the camera
  // arrives with the stop instead of halting at 43.16 while the drone was still flying in, and leaves
  // it with the next move; higher and further back, so the scanner's fan reaches the ground in frame)
  { u: F4C, tgt: overTgt(holdDy, 1.5), az: -60, el: 60, d: 12.5, fov: 44, pd: 1.25, ease: 'inOutSoft', portrait: { d: 12, fov: 52 } },
  // then crane up to the high oblique while the strips are flown: high enough that the staked
  // rectangle never foreshortens into a spike, and turned so the fan is seen across, not edge-on
  // (tall screens look along the parcel instead, so its long side runs up the screen)
  // (the parcel sits left of centre: the right quarter of the frame is kept for the information card)
  // (2026-10-13: the camera used to watch the strips from 66 m, where the drone was a dot. It now
  // rides behind and above the drone, a beat late, looking down the flight line past it: the drone
  // reads as a drone at the top of the frame, its fan falls onto the parcel, the scanned strips on
  // one side and the open ground still to fly on the other. One eased segment from the chase at the
  // parcel corner to this key at the capture stop, and one on up to the plan view, so no key inside a
  // move stops the camera dead: it used to stop and restart at 43.48 and 44.25)
  // (2026-10-13, second pass: from behind at 32° the ground under the drone, where the returns are born,
  // was always below the frame: the fan ran out of the bottom and the cloud seemed to fill in on its
  // own. Now the camera looks down over the drone's shoulder, ~8 m above and ~3 m behind it: the drone
  // reads from above (arms, rotor discs), its fan falls onto the swath just below it, the new returns
  // light up on the line and the scanned strips stretch away behind)
  { u: 45.36, tgt: overTgt(-3.8), az: -78, el: 76, d: 12.4, fov: 44, pd: 1.3, ease: 'inOutSoft', portrait: { el: 78, d: 12, fov: 52, pd: 1 } },
  // model: up to a plan view, the way the contours are drawn on a survey sheet
  // (its target stays on the drone until the last strip is nearly flown, then eases over to the plan's
  // centre: the camera used to start for the centre at once and lost the drone, and the last strip's
  // returns, off the bottom of the frame)
  { u: 47.75, tgt: toPlan([11, -3, -32]), az: 0, el: 74, d: 70, fov: 32, pd: 1.6, portrait: { tgt: toPlan([4, -3, -32]), az: 90, el: 74, d: 106, fov: 46, pd: 1 } },
  { u: 49.25, tgt: [11, -3, -32], az: -4, el: 79, d: 68, fov: 32, ease: 'linear', pd: 1.6, portrait: { tgt: [4, -3, -32], az: 86, el: 79, d: 102, fov: 46, pd: 1 } },
  // closing: behind the crew, the drone holding at the centre of frame over the valley. The camera
  // then stays put while the drone flies at it (same pose on every screen: no portrait distance)
  { u: 50.3, ...CLOSE, fov: 32 },
  { u: GCUT, ...CLOSE, fov: 32, ease: 'linear' },
  // ===== ACT III: the planet, cut in behind the drone. Unit globe, the site faces +Z, lat 50.7 N =====
  // high above the site, looking straight down: the site sits where the drone came from (frame centre)
  { u: GCUT + 0.001, tgt: [0, 0.7738, 0.6334], az: 0, el: 50.73, d: 1.35, fov: 30, ease: 'linear', pd: 1.25 },
  { u: 53.5, tgt: [0, 0.43, 0.35], az: -8, el: 38, d: 2.5, fov: 30, ease: 'inOutSoft', pd: 1.45 },
  { u: 55.4, tgt: [0, 0.3, 0], az: 14, el: 25, d: 5.6, fov: 30, pd: 1.5 },
  { u: U, tgt: [0, 0.25, 0], az: 24, el: 23, d: 6.0, fov: 30, ease: 'linear', pd: 1.5 },
];

const GLOBE_KEY = CAM.findIndex((k) => k.u > GCUT);
/** (review tooling: the camera keys, read-only by convention) */
export const CAMERA_KEYS = CAM;

// safe-frame fractions (share of the picture the subject radius may fill), per layout
const FRAMES = {
  landscape: { wide: [0.86, 0.84], labels: [0.5, 0.86] },
  portrait: { wide: [0.92, 0.7], labels: [0.9, 0.5] },
};
// Fitted framing: the share of the stage (the free area between the UI bands, see main.js) that the
// subject's projected outline fills, as [width, height]; whichever binds first wins. Tall screens
// fill the width (phones: an instrument at about 80 % of it), wide screens leave the sides for the
// information cards (and, in an exploded view, for the label columns).
const FILL = {
  landscape: { wide: [0.6, 0.86], labels: [0.54, 0.9] },
  tall: { wide: [0.82, 0.86], labels: [0.86, 0.86] },
  // phones (2026-10-14): an exploded view names one part at a time (no dots, no columns) and spreads
  // less, so the assembly is framed as large as the picture allows
  phone: { wide: [0.82, 0.86], labels: [0.9, 0.9] },
};

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

function resolveKey(k, portrait, phone) {
  // (phones: the portrait overrides, then their own where a key has them)
  if (phone && k.phone) return { ...k, ...k.portrait, ...k.phone };
  return portrait && k.portrait ? { ...k, ...k.portrait } : k;
}

/** Distance that fits radius r into the given share of the frame. */
function fitDistance(r, fovV, aspect, fw, fh) {
  const tv = Math.tan(THREE.MathUtils.degToRad(fovV) / 2);
  const th = tv * aspect;
  return r / Math.min(fw * th, fh * tv);
}

/**
 * Perspective fit of a point set: the distance at which every point falls inside the given share of
 * the frame, and the centre (the subject's middle in the camera's plane) to aim at.
 * @param {Vector3[]} pts  world points of the subject
 * @param {Vector3} back   unit vector from the target toward the camera
 */
const _rt = new THREE.Vector3(), _up = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Vector3();
function fitPoints(pts, aim, back, fovV, aspect, fw, fh, out) {
  _rt.set(0, 1, 0).cross(back).normalize();          // camera right
  _up.copy(back).cross(_rt).normalize();              // camera up
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) {
    _q.copy(p).sub(aim);
    const x = _q.dot(_rt), y = _q.dot(_up);
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  _c.copy(aim).addScaledVector(_rt, cx).addScaledVector(_up, cy);
  const tv = Math.tan(THREE.MathUtils.degToRad(fovV) / 2), th = tv * aspect;
  let d = 0.05;
  for (const p of pts) {
    _q.copy(p).sub(_c);
    const x = Math.abs(_q.dot(_rt)), y = Math.abs(_q.dot(_up)), z = _q.dot(back);
    d = Math.max(d, z + x / (fw * th), z + y / (fh * tv), z + 0.12);
  }
  out.center.copy(_c);
  out.dist = d;
  return out;
}

const _a = new THREE.Vector3(); const _b = new THREE.Vector3(); const _back = new THREE.Vector3();
const _fit = { center: new THREE.Vector3(), dist: 1 };

/**
 * Camera state at u for a stage (the area the subject is framed into) of the given aspect.
 * @param {object} [opts]
 * @param {boolean} [opts.tall]       a tall screen (phones, tablets in portrait): portrait keys and fills
 * @param {boolean} [opts.phone]      a phone (tall and under 600 px): its own keys and fills where set
 * @param {function} [opts.subject]   (u, key) => world points of the subject to fit (keys with `r`)
 * @returns {{ pos: Vector3, tgt: Vector3, fov: number }}
 */
export function cameraAt(u, aspect, out = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 30 }, opts = {}) {
  const portrait = opts.tall ?? aspect < 0.8;
  const phone = portrait && !!opts.phone;
  const frames = portrait ? FRAMES.portrait : FRAMES.landscape;
  const fills = phone ? FILL.phone : portrait ? FILL.tall : FILL.landscape;
  // the Act III cut is a hard cut: never interpolate across it
  let i = u >= GCUT ? GLOBE_KEY : 0;
  while (i < CAM.length - 2 && u > CAM[i + 1].u) i++;
  const k0 = resolveKey(CAM[i], portrait, phone), k1 = resolveKey(CAM[i + 1], portrait, phone);
  const t = (EASE[k1.ease || 'inOut'])(win(u, k0.u, k1.u));
  const fovMul = portrait ? 1.2 : 1;
  const ownFov = (k) => (k.portrait?.fov || (phone && k.phone?.fov) ? 1 : fovMul);   // (an override's fov is as given)
  const fov0 = k0.fov * ownFov(k0), fov1 = k1.fov * ownFov(k1);
  const fov = fov0 + (fov1 - fov0) * t;
  const az = THREE.MathUtils.degToRad(k0.az + (k1.az - k0.az) * t);
  const el = THREE.MathUtils.degToRad(k0.el + (k1.el - k0.el) * t);
  _back.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  const tgtOf = (k) => V(typeof k.tgt === 'function' ? k.tgt(u) : k.tgt);
  // a key with r frames its subject: when the subject's outline is known, it is fitted (and centred)
  // in the stage at the current camera angle; a larger r is a looser, establishing frame
  const fitted = (k) => {
    if (k.r === undefined || !opts.subject) return null;
    const pts = opts.subject(u, k);   // each key its own subject (e.g. with or without the pulses' landing)
    if (!pts?.length) return null;
    const [fw, fh] = fills[k.frame || 'wide'];
    // (tall screens keep every fitted shot near full: an exploded view has dots, not label columns)
    const tight = phone && k.frame === 'labels' ? 1 : k.fill ?? THREE.MathUtils.clamp(0.62 / k.r, 0.92, 1);
    fitPoints(pts, tgtOf(k), _back, fov, aspect, fw * tight, fh * tight, _fit);
    return { d: _fit.dist, c: _fit.center.clone() };
  };
  const dist = (k, f) => {
    if (k.d !== undefined) return k.d * (portrait ? (k.pd ?? 1) : 1);
    const [fw, fh] = frames[k.frame || 'wide'];
    // tall screens: the sphere fit is width-bound, give wide subjects (props, legs) some air
    return fitDistance(k.r * (portrait && !k.portrait ? 1.12 : 1), f, aspect, fw, fh);
  };
  const f0 = fitted(k0), f1 = fitted(k1);
  const d0 = f0 ? f0.d : dist(k0, fov), d1 = f1 ? f1.d : dist(k1, fov);
  const d = Math.exp(Math.log(d0) + (Math.log(d1) - Math.log(d0)) * t);   // dolly in log space
  out.tgt.copy(_a.copy(f0 ? f0.c : tgtOf(k0))).lerp(_b.copy(f1 ? f1.c : tgtOf(k1)), t);
  out.pos.copy(_back).multiplyScalar(d).add(out.tgt);
  // never under the floor (Act II: never under the terrain)
  if (u < GCUT) {
    const ground = u >= FCUT ? heightAt(out.pos.x, out.pos.z) + 0.35 : 0.06;
    if (out.pos.y < ground) out.pos.y = ground;
  }
  out.fov = fov;
  return out;
}

/* ------------------------------------------------------------------------------- scene state */
export const CH = {
  drone: { explode: [3.4, 5.5, 6.25, 7.0], labels: [3.3, 7.05] },
  gnss: { explode: [12.8, 14.5, 15.1, 15.7], labels: [12.7, 15.75] },
  ts: { explode: [20.0, 21.7, 22.45, 23.15], labels: [19.9, 23.2] },
};

function explodeT(u, [a, b, c, d]) {
  if (u <= a || u >= d) return 0;
  if (u < b) return (u - a) / (b - a);
  if (u <= c) return 1;
  return 1 - (u - c) / (d - c);
}

/** 1 outside [a, d]; eases down to `floor` over [a, b], holds, and back up over [c, d]. */
function dip(u, a, b, c, d, floor = 0) {
  const k = smoother(win(u, a, b)) * (1 - smoother(win(u, c, d)));
  return 1 - (1 - floor) * k;
}

/* ------------------------------------------------------------------------- Act II: the drone */
const _ss = { pos: new THREE.Vector3(), heading: 0, strip: 0, f: 0, scanning: false };
const S0 = stripState(0, { pos: new THREE.Vector3() }).pos.clone();
const S1 = stripState(1, { pos: new THREE.Vector3() }).pos.clone();
const H_STRIP0 = stripState(0, { pos: new THREE.Vector3() }).heading;
const H_STRIP1 = stripState(1, { pos: new THREE.Vector3() }).heading;
const H_PAD = Math.PI / 2;                       // parked with its nose toward the crew (+Z)
/** 0..1 → 0..1 at an even rate, easing up over the first and down over the last 8 % (C1). (Was 4 %:
 *  the drone reached strip speed in 0.6 s, a 28 m/s² kick the chasing camera passed on.) */
function easeRun(t, r = 0.08) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const A = 1 - r, P = (x) => (x < r ? x / 2 - (r / (2 * Math.PI)) * Math.sin((Math.PI * x) / r) : r / 2 + (x - r));
  return t <= 1 - r ? P(t) / A : 1 - P(1 - t) / A;
}
/** Capture progress at u: the eased run, ending as the last strip ends (STRIPS_END). The drone, the
 *  swath and the returns (field.js) all read this one value, so the cloud is born under the scan. */
const captureAt = (u) => easeRun(win(u, CAPTURE[0], CAPTURE[1])) * STRIPS_END;
const LIFT_Y = 2.0;                                // the hover after lift-off (m)
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const towards = (a, b) => Math.atan2(b.z - a.z, b.x - a.x);
const H_OUT = towards(FIELD.stations.drone, S0);
const H_HOLD = towards(S1, HOLD);
const H_CAM = towards(HOLD, CLOSE_CAM);
// the run at the lens, in the closing camera's frame: along its view axis, rising over it at the end
const AX = HOLD.clone().sub(CLOSE_CAM); const D0 = AX.length(); AX.normalize();
const UPC = new THREE.Vector3(0, 1, 0).addScaledVector(AX, -AX.y).normalize();

/**
 * The drone's flight in Act II, pure in u: parked on the pad through the pre-flight, a slow lift-off,
 * the climb-out to the first strip, the strips, a hold over the valley, then the run at the lens.
 * heading: radians, nose along (cos h, sin h) in x/z. pitch: + = nose down.
 */
export function fieldDrone(u, out = { pos: new THREE.Vector3(), heading: H_PAD, pitch: 0, scanning: false, flying: false }) {
  const pad = FIELD.stations.drone;
  out.scanning = false; out.pitch = 0; out.flying = true;
  if (u < HERO.lift[0]) { out.pos.copy(pad); out.heading = H_PAD; out.flying = false; }
  else if (u < HERO.hover[1]) {
    // slow and deliberate: it eases off the pad to 2 m and holds there a moment, breathing a few cm
    const t = win(u, HERO.lift[0], HERO.lift[1]), h = win(u, HERO.hover[0], HERO.hover[1]);
    out.pos.copy(pad).setY(LIFT_Y * smoother(t) + 0.05 * Math.sin(Math.PI * h) * Math.sin(Math.PI * 2 * h + 0.6));
    out.heading = H_PAD;
  } else if (u < HERO.transit[1]) {
    // climb first, then out; it turns its nose to the parcel, then onto the first strip. Both eased in
    // and out, the horizontal run on a gentler curve (peak 1.5× its mean, about 18 m/s over ~50 m)
    // (the climb on a cubic, not a quintic: it is under way within a few tenths of a second of the
    // hold instead of creeping off it, peak ~2.5 m/s)
    const t = win(u, HERO.transit[0], HERO.transit[1]);
    const th = smooth(win(t, 0.12, 1)), tv = smooth(Math.min(1, t * 1.35));
    out.pos.set(pad.x + (S0.x - pad.x) * th, LIFT_Y + (S0.y - LIFT_Y) * tv, pad.z + (S0.z - pad.z) * th);
    out.heading = H_PAD + wrapPi(H_OUT - H_PAD) * smoother(win(t, 0, 0.35)) + wrapPi(H_STRIP0 - H_OUT) * smoother(win(t, 0.7, 1));
    out.pitch = 0.16 * Math.sin(Math.PI * t);
  } else if (u < CAPTURE[0]) { out.pos.copy(S0); out.heading = H_STRIP0; out.scanning = true; }   // the scanner switches on
  else if (u < CAPTURE[1]) {
    // (the run eases up to strip speed off the hold at the parcel corner, and down onto the last
    // strip's end, where the flight to the hold starts from rest: no velocity step at either end)
    stripState(captureAt(u), _ss);
    out.pos.copy(_ss.pos); out.heading = _ss.heading; out.scanning = _ss.scanning; out.pitch = 0.08;
  } else if (u < 47.6) {
    // off the last strip to the hold over the valley
    const t = smoother(win(u, CAPTURE[1], 47.6));
    out.pos.copy(S1).lerp(HOLD, t);
    out.heading = H_STRIP1 + wrapPi(H_HOLD - H_STRIP1) * smoother(win(t, 0, 0.3));
    out.pitch = 0.14 * Math.sin(Math.PI * t);
  } else if (u < APPROACH[0]) {
    // hold; then turn to face the camera
    out.pos.copy(HOLD);
    out.heading = H_HOLD + wrapPi(H_CAM - H_HOLD) * smoother(win(u, 50.3, APPROACH[0]));
  } else {
    // at the lens: distance falls in log space (the drone grows at an even rate on screen), with a
    // final push that carries it past; it rises over the camera before anything nears the lens
    const s = win(u, APPROACH[0], APPROACH[1]);
    const dist = D0 * Math.pow(0.35 / D0, s) - 1.6 * Math.pow(s, 6);
    const off = -0.09 * smooth(win(s, 0, 0.4)) + 0.75 * smooth(win(s, 0.74, 0.95));
    out.pos.copy(CLOSE_CAM).addScaledVector(AX, dist).addScaledVector(UPC, off);
    out.heading = H_CAM;
    out.pitch = 0.2 * smooth(win(s, 0, 0.25)) * (1 - smooth(win(s, 0.55, 0.75))) - 0.45 * smooth(win(s, 0.74, 0.9));
  }
  return out;
}
/** 0 → 1 through the run at the lens. */
export const approachAt = (u) => win(u, APPROACH[0], APPROACH[1]);

/* Pre-flight motion, pure in u */
const keyed = (keys, t) => {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) { const [t0, v0] = keys[i - 1], [t1, v1] = keys[i]; return v0 + (v1 - v0) * smoother((t - t0) / (t1 - t0)); }
  }
  return keys[keys.length - 1][1];
};
// gimbal calibration (degrees): yaw to both stops, pitch down and up, a roll check, then level
const CAL = {
  yaw: [[0, 0], [0.2, 38], [0.5, -38], [0.72, 0], [0.8, -4], [0.9, 0]],
  pitch: [[0, 0], [0.12, 0], [0.3, 40], [0.52, -18], [0.72, 0], [0.82, 3], [0.92, 0]],
  roll: [[0, 0], [0.35, 0], [0.45, 9], [0.58, -9], [0.7, 0]],
};
/** Arm fold (1 = folded for transport), with a small settle as the arms lock. */
function foldAt(u) {
  const base = 1 - smoother(win(u, HERO.unfold[0], HERO.unfold[1]));
  return base - 0.04 * Math.sin(Math.PI * win(u, HERO.unfold[1] - 0.12, HERO.unfold[1] + 0.25));
}
/** Motor ring i: off, a short power-on flicker, then steady. */
const FLICKER = [0.85, 0.12, 0.65, 0.25, 1];
function ringAt(u, i) {
  const [t0, gap, ramp] = HERO.leds;
  const t = win(u, t0 + gap * i, t0 + gap * i + ramp);
  return t <= 0 ? 0 : t >= 1 ? 1 : FLICKER[Math.min(4, Math.floor(t * 5))];
}
const RING_ORDER = ['fl', 'fr', 'rr', 'rl'];   // round the drone, starting front-left

const bell = (u, a, b, c, d) => sw(u, a, b) * (1 - sw(u, c, d));

/** Total station aim in the field: onto the prism, a slew to the profile start, then the hops. */
function fieldAim(u) {
  if (u < 34.55) return { yaw: 28 + (TS_AIM.yaw - 28) * sw(u, 32.55, 33.2), tilt: TS_AIM.tilt * sw(u, 32.9, 33.3) };
  if (u < SWEEP[0]) {
    const p0 = aimAt(profilePoints()[0]);
    const k = sw(u, 34.55, SWEEP[0]);
    return { yaw: TS_AIM.yaw + (p0.yaw - TS_AIM.yaw) * k, tilt: TS_AIM.tilt + (p0.tilt - TS_AIM.tilt) * k };
  }
  return aimAt(profileHop(u, _hop).pos);
}

/** Everything except the camera, as a pure function of u. */
export function sceneAt(u) {
  const CUT = 25.6;
  const inGlobe = u >= GCUT;
  const inField = u >= FCUT;
  const after = u >= CUT && !inField;
  const finale = after ? sw(u, CUT, 26.2) : 0;
  // Act II: the crew's work lights, slightly lower than the studio keys so the dusk reads; the
  // drone's comes up a little for its pre-flight close-ups
  const work = inField ? 0.34 : 0;
  const heroKey = inField ? 0.34 + 0.16 * bell(u, HERO.cut - 0.05, HERO.cut + 0.2, HERO.lift[1], HERO.transit[0] + 0.3) : 0;
  const focus = {
    // (the title: rim light at full and a soft key, so the drone reads as the hero under the title)
    drone: inField ? heroKey : Math.max((0.3 + 0.7 * sw(u, 0.35, 1.45)) * (1 - sw(u, 10.1, 10.9)), finale),
    gnss: inField ? work : Math.max(sw(u, 9.9, 10.9) * (1 - sw(u, 17.7, 18.5)), finale),
    ts: inField ? work : (after ? finale : (u >= CUT ? 0 : sw(u, 17.6, 18.4))),
    rimFloor: { drone: 1.0 * (1 - sw(u, 1.2, 2.0)) },
  };
  const hoverUp = sw(u, 7.25, 7.85), hoverDown = sw(u, 10.05, 10.6);
  // while the laser writes the mark on the pad the drone climbs higher, so the mark reads clear of it
  const writeUp = sw(u, 8.3, 8.95);
  const cal = win(u, HERO.cal[0], HERO.cal[1]);
  const drone = {
    explode: explodeT(u, CH.drone.explode),
    // the rotors turn only while it flies: in the studio from the moment it is whole again, just
    // before it lifts (7.25), until it is back on the pad (10.6, under the chapter's dip); main.js ramps
    // the real speed to this over about a second. Parked, exploded or on the ground they are still.
    spin: inField ? win(u, HERO.spin[0], HERO.spin[1]) : win(u, 7.0, 7.05) * (1 - win(u, 10.55, 10.6)),
    hover: (0.4 + 0.55 * writeUp) * hoverUp * (1 - hoverDown),
    // Act II: level for the calibration sweep, straight down (nadir) for the strips, level again for the run home
    gimbal: inField ? keyed(CAL.pitch, cal) + 85 * sw(u, 42.75, 43.15) * (1 - sw(u, CAPTURE[1], CAPTURE[1] + 0.45))
      : 52 * sw(u, 7.95, 8.35) * (1 - sw(u, 9.65, 10.0)),
    gimbalYaw: inField ? keyed(CAL.yaw, cal) : 0,
    gimbalRoll: inField ? keyed(CAL.roll, cal) : 0,
    fold: inField ? foldAt(u) : 0,
    // props parked along the arms until they spin up
    park: inField && u < HERO.spin[0],
    // nav LEDs and motor rings: the studio look (LEDs 0.6, rings dark), dark on the site until power-on
    leds: inField ? Object.fromEntries(RING_ORDER.map((k, i) => [k, ringAt(u, i)])) : null,
    // the laser writes Underhill's mark on the pad (logotrace.js): written 8.5 → 9.6, then it holds
    pulse: u < 8.5 ? -1 : win(u, 8.5, 9.6),
    pulsePersist: u < 8.5 ? 0 : 1 - sw(u, 9.8, 9.92),
    labels: win(u, CH.drone.labels[0], CH.drone.labels[0] + 0.1) * (1 - win(u, CH.drone.labels[1] - 0.1, CH.drone.labels[1])),
  };
  const gnss = {
    explode: explodeT(u, CH.gnss.explode),
    rings: inField ? bell(u, 30.65, 31.05, 32.0, 32.4) : sw(u, 16.2, 16.6) * (1 - sw(u, 17.4, 17.9)),
    labels: win(u, CH.gnss.labels[0], CH.gnss.labels[0] + 0.1) * (1 - win(u, CH.gnss.labels[1] - 0.1, CH.gnss.labels[1])),
  };
  const travel = sw(u, 23.9, 24.35);
  const aim = inField ? fieldAim(u) : null;
  const ts = {
    explode: explodeT(u, CH.ts.explode),
    yaw: inField ? aim.yaw : after ? 28 : 28 + 132 * sw(u, 22.95, 23.7),
    tilt: inField ? aim.tilt : after ? 0 : 4.2 * sw(u, 23.4, 23.85),
    laser: {
      travel: u < 23.9 ? 0 : (u < 24.35 ? travel : 1),
      lit: sw(u, 24.32, 24.42) * (1 + 0.9 * (1 - sw(u, 24.42, 24.9))),
      visible: after || inField ? 0 : sw(u, 22.9, 23.1),
      beam: 1 - sw(u, 25.15, 25.5),
    },
    labels: win(u, CH.ts.labels[0], CH.ts.labels[0] + 0.1) * (1 - win(u, CH.ts.labels[1] - 0.1, CH.ts.labels[1])),
  };
  let labelsFor = null;
  if (drone.labels > 0) labelsFor = 'drone';
  else if (gnss.labels > 0) labelsFor = 'gnss';
  else if (ts.labels > 0) labelsFor = 'ts';
  const hop = profileHop(u, _hop);
  const N = PROFILE_LINE.n;
  const sweeping = u >= SWEEP[0] && u < SWEEP[1] + 0.02;
  const app = approachAt(u);
  const f = {
    on: inField ? 1 : 0,
    boundary: sw(u, 42.55, 43.2),
    capture: captureAt(u),   // (the drone's own eased run: the swath stays under it)
    cloud: (u >= CAPTURE[0] ? 1 : 0) * (1 - 0.72 * sw(u, 47.0, 47.8)),
    contours: win(u, 47.35, 48.75),
    model: sw(u, 47.55, 48.55),
    // the scanner: on from the parcel edge to the end of the last strip
    scan: u >= HERO.beam[0] && u < CAPTURE[1] ? 1 - sw(u, CAPTURE[1] - 0.06, CAPTURE[1]) : 0,
    scanReach: win(u, HERO.beam[0], HERO.beam[1]),
    section: {
      shown: u < SWEEP[0] ? 0 : hop.measured,
      draw: Math.max(0, Math.min(1, (hop.measured - 1) / (N - 1))),
      rise: sw(u, RISE[0], RISE[1]),
      alpha: (u >= SWEEP[0] ? 1 : 0) * (1 - sw(u, 37.72, 37.88)),
    },
    laser: {
      travel: u < 33.35 ? 0 : u < 33.8 ? sw(u, 33.35, 33.8) : 1,
      lit: u < 33.78 ? 0 : sw(u, 33.78, 33.86) * (1 + 0.9 * (1 - sw(u, 33.86, 34.3))) * (1 - 0.6 * sw(u, 34.5, 35.0)),
      visible: inField ? sw(u, 32.4, 32.65) : 0,
      // on to the prism, off for the slew, then hop by hop (dim while it moves), then off
      beam: u < 34.5 ? 1 : u < SWEEP[0] ? 1 - sw(u, 34.45, 34.6)
        : u < SWEEP[1] ? sw(u, SWEEP[0], SWEEP[0] + 0.04) * hop.beam : 1 - sw(u, SWEEP[1], SWEEP[1] + 0.1),
      end: sweeping || u >= SWEEP[1] ? hop.pos : null,
    },
    cpReadout: bell(u, 31.0, 31.2, 32.15, 32.4),
    ptReadout: bell(u, 33.9, 34.05, 34.5, 34.7),
    // pre-flight checks beside the drone
    checks: HERO.checks.map((c) => sw(u, c, c + 0.08)),
    checkPanel: bell(u, HERO.cal[0] + 0.02, HERO.cal[0] + 0.15, HERO.lift[0] + 0.05, HERO.lift[0] + 0.25),
    tags: {
      cp: bell(u, 30.35, 30.65, 32.15, 32.4),
      prism: bell(u, 32.55, 32.85, 33.8, 34.0),
      // the label sits on the line at its 18th point, and appears once the laser has measured it
      profile: bell(u, PROFILE_TAG_U, PROFILE_TAG_U + 0.15, 37.6, 37.78),
      sectionEnds: bell(u, RISE[1] - 0.15, RISE[1] + 0.05, 37.6, 37.78),
      uav: bell(u, CAPTURE[0] + 0.05, CAPTURE[0] + 0.3, CAPTURE[1] - 0.2, CAPTURE[1]),
      boundary: bell(u, 43.0, 43.3, 44.0, 44.3),
      contours: bell(u, 48.3, 48.6, 49.3, 49.6),
      crew: bell(u, 49.95, 50.35, 50.5, 50.75),
    },
  };
  const g = {
    on: inGlobe ? 1 : 0,
    alpha: 1,
    rings: sw(u, GCUT, GCUT + 0.12),
    // the site marker flares as the drone clears the frame, then settles
    flare: inGlobe ? 1 - sw(u, GCUT + 0.15, GCUT + 0.7) : 0,
    reach: sw(u, 52.1, 52.9),
    sats: sw(u, 53.3, 54.3),
    links: sw(u, 54.0, 54.9),
    drift: (u - GCUT) * 0.035,
    siteTag: bell(u, 52.05, 52.35, 55.55, 55.85),
    satTag: bell(u, 54.3, 54.6, 55.55, 55.85),
  };
  return {
    u, focus, drone, gnss, ts, labelsFor, field: f, inField: inField && !inGlobe, globe: g,
    layout: inGlobe ? 'globe' : inField ? 'field' : after ? 'finale' : 'studio',
    // the drone is drawn over the planet until it has left the frame
    droneOverlay: inGlobe && app < 0.97,
    droneFlying: (inField && !inGlobe && u >= HERO.lift[0]) || (inGlobe && app < 0.97),
    // radial motion smear as the drone fills the frame and passes the lens
    smear: smooth(win(app, 0.68, 0.79)) * (1 - smooth(win(app, 0.85, 0.96))),
    title: 1 - sw(u, 0.5, 1.05),
    finaleLayout: after,
    fade: dip(u, CUT - 0.22, CUT - 0.04, CUT + 0.04, CUT + 0.3)
      * dip(u, 10.15, 10.45, 10.8, 11.15, 0.0)
      * dip(u, 17.7, 17.98, 18.3, 18.62, 0.0)
      * dip(u, 26.9, 27.15, 27.75, 28.15, 0.0)
      * dip(u, 37.72, HERO.cut - 0.03, HERO.cut + 0.03, HERO.cut + 0.25, 0.0),
    intertitles: INTERTITLES.map((it) => (it.u0 === null ? 0 : sw(u, it.u0 + 0.12, it.u0 + 0.32) * (1 - sw(u, it.u1 - 0.3, it.u1 - 0.08)))),
    finale: after ? sw(u, 26.1, 26.5) * (1 - sw(u, 26.85, 27.05)) : 0,
    readout: sw(u, 24.4, 24.55) * (1 - sw(u, 25.15, 25.4)),
    chapter: u < 1.5 ? 'title' : u < 10.15 ? 'drone' : u < 17.75 ? 'gnss' : u < 25.6 ? 'ts' : u < 26.95 ? 'end' : u < GCUT ? 'field' : 'world',
  };
}

/** Which models must be resident at u (current chapter + the next, all three for the finale). */
export function neededAt(u) {
  const s = new Set();
  if (u < 11.5 || u > 24.5) s.add('drone');
  if ((u > 7.5 && u < 19.5) || u > 24.5) s.add('gnss');
  if (u > 15 || u > 24.5) s.add('ts');
  return s;
}

export const CHAPTER_START = { drone: 1.5, gnss: 10.2, ts: 17.8, end: 25.6, field: 27.0, world: 51.85 };
