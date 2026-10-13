// Fly mode: the flight model. Simple, stable and a little fun: a P-mode (GPS / RTK position hold)
// multirotor flown by velocity commands, stepped at a fixed 120 Hz by the page's accumulator.
//
// Sticks (Mode 2, each −1..1): lx yaw (right = clockwise), ly throttle (up = climb), rx roll (right =
// slide right), ry pitch (up = forward). Velocity targets: 15 m/s horizontal (Sport 21), climb 6,
// descend 5, yaw 100 °/s; acceleration-limited with drag, the body tilting with acceleration and
// speed (max 25°). Gusts nudge it; RTK holds it when the sticks are released (with a small settle).
//
// Safety layers on every command: the geofence (warn 150 m, push back past 160 m), the 120 m AGL cap,
// obstacle sensing (warn under 5 m, brake under 2 m, horizontally and below), battery (warn 25 %,
// return home at 15 %, land at 8 %). Autopilots: take-off, land, return-to-home, go-to and the mapping
// mission. Any stick input cancels an autopilot. No three.js maths beyond Vector3 storage.
import * as THREE from 'three';
import { ground } from './query.js';
import { GEOFENCE, ALT_CAP, VLOS } from './world.js';

const DEG = Math.PI / 180;
const G = 9.81;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapPi = (a) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// a seeded random source (the sim must replay identically in the debug harness)
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }

export const LIMITS = { vH: 15, vSport: 21, vUp: 6, vDown: 5, yawRate: 100, tilt: 25, rthAlt: 30, rthSpeed: 12, gotoSpeed: 10, battery: 12 * 60 };

const AUTO = new Set(['rth', 'goto', 'mission']);

export class FlightSim {
  /**
   * @param {object} o
   * @param {SceneQuery} o.query
   * @param {THREE.Vector3} o.home   the pad
   * @param {(type:string, data?:any)=>void} o.emit
   */
  constructor({ query, home, emit = () => {}, ground: groundFn = ground }) {
    this.query = query;
    this.ground = groundFn;
    this.emit = emit;
    this.homePad = home.clone();
    this.below = (x, z, y) => (this.query ? this.query.below(x, z, y) : this.ground(x, z));
    this.reset();
  }

  reset() {
    this.r = rng(7);
    this.time = 0;
    this.pos = new THREE.Vector3(this.homePad.x, this.ground(this.homePad.x, this.homePad.z) + 0.004, this.homePad.z);
    this.vel = new THREE.Vector3();
    this.acc = new THREE.Vector3();
    this.yaw = Math.PI;                     // nose to the north (−z), toward the valley
    this.yawRate = 0;
    this.pitch = 0; this.roll = 0;
    this.home = this.pos.clone();
    this.mode = 'parked';                   // parked → preflight → ready → spinup → takeoff → flying ⇄ auto → landing → ready
    this.airborne = false;
    this.rotor = 0; this.rotorTarget = 0;
    this.fold = 1;
    this.power = 0;
    this.preT = -1;
    this.checks = { power: false, arms: false, props: false, battery: false, compass: false, rtk: false };
    this.rtk = { state: 'off', sats: 0, satTarget: 30 + Math.floor(this.r() * 5), h: 9.9, v: 9.9, t: 0, nextWobble: 0 };
    this.battery = 100; this.drain = 100 / LIMITS.battery; this.flightTime = 0;
    this.batteryFlags = { low: false, rth: false, land: false };
    this.gimbal = { pitch: 0, yaw: 0, tPitch: -15, tYaw: 0 };
    this.zoom = 1;
    this.sport = false;
    this.hold = null; this.holdY = null;
    this.auto = null;
    this.landIntent = 0;
    // wind: mean from the WNW, 3 m/s, plus gusts (an Ornstein–Uhlenbeck process)
    const wFrom = 292 * DEG, w = 3.0;
    this.wind = { mx: -Math.sin(wFrom) * w, mz: Math.cos(wFrom) * w, gx: 0, gz: 0, ex: -Math.sin(wFrom) * w, ez: Math.cos(wFrom) * w };
    this.warn = { obstacle: null, below: null, boundary: false, fence: false, alt: false, altCap: false, battery: null };
    this.clear = 8;
    this.agl = 0; this.aglEff = 0;
  }

  /* --------------------------------------------------------------------- commands */
  startPreflight() {
    if (this.mode !== 'parked') return false;
    this.mode = 'preflight'; this.preT = 0;
    this.rtk.state = 'acquiring'; this.rtk.t = 0;
    this.emit('preflight');
    return true;
  }

  /** Why take-off is not possible now (null when it is). */
  takeoffBlock() {
    if (this.mode === 'parked') return 'Run the pre-flight check first';
    if (this.mode === 'preflight') return this.rtk.state !== 'fix' && this.checks.compass ? 'Waiting for RTK fix' : 'Pre-flight check running';
    if (this.mode !== 'ready') return this.airborne ? 'Already flying' : 'Not ready';
    if (this.battery < 20) return 'Battery too low to take off';
    return null;
  }

  takeOff() {
    const why = this.takeoffBlock();
    if (why) { this.emit('toast', why); return false; }
    this.mode = 'spinup'; this.spinT = 0;
    this.rotorTarget = 1;
    this.home.set(this.pos.x, this.pos.y, this.pos.z);
    this.gimbal.tPitch = -12;
    this.emit('takeoff');
    return true;
  }

  land() {
    if (!this.airborne) return false;
    this.auto = null;
    this.mode = 'landing';
    this.hold = { x: this.pos.x, z: this.pos.z };
    this.emit('toast', 'Landing');
    return true;
  }

  rth(reason = 'user') {
    if (!this.airborne) { this.emit('toast', 'Return to home needs the drone in the air'); return false; }
    const dHome = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
    const gH = this.ground(this.home.x, this.home.z);
    const alt = Math.min(Math.max(this.pos.y, gH + LIMITS.rthAlt), this.ground(this.pos.x, this.pos.z) + ALT_CAP - 1);
    this.auto = { kind: 'rth', phase: dHome < 15 ? 'descend' : 'climb', alt, reason };
    this.mode = 'rth';
    this.hold = null; this.holdY = null;
    this.emit('rth', reason);
    return true;
  }

  /**
   * Fly to (x, z) at ASL height y (default: hold the current height, at least 5 m above ground),
   * facing `look` (a point) at the end, with the gimbal at `gimbal` degrees.
   */
  goTo(x, z, { y = null, look = null, gimbal = null, name = null, speed = LIMITS.gotoSpeed } = {}) {
    if (!this.airborne) { this.emit('toast', 'Take off first, then tap to fly there'); return false; }
    x = clamp(x, -GEOFENCE + 2, GEOFENCE - 2); z = clamp(z, -GEOFENCE + 2, GEOFENCE - 2);
    const gT = this.ground(x, z);
    const ty = y === null ? Math.max(this.pos.y, gT + 5) : Math.max(y, gT + 2);
    this.auto = { kind: 'goto', x, z, y: Math.min(ty, gT + ALT_CAP - 1), look, gimbal, name, speed };
    this.mode = 'goto';
    this.hold = null; this.holdY = null;
    this.emit('goto', this.auto);
    return true;
  }

  /**
   * Fly a mapping mission. m = { lines: [[{x,z},{x,z}], …] (in flying order), y (ASL), photoEvery (m),
   * speed (m/s on the lines) }.
   */
  startMission(m) {
    if (!this.airborne) { this.emit('toast', 'Take off first, then start the mission'); return false; }
    // the route: line, connector, line, …
    const segs = [];
    m.lines.forEach((ln, i) => {
      if (i > 0) segs.push({ a: m.lines[i - 1][1], b: ln[0], line: false });
      segs.push({ a: ln[0], b: ln[1], line: true, index: i });
    });
    let L = 0;
    for (const s of segs) { s.len = Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z); s.u0 = L; L += s.len; }
    this.auto = { kind: 'mission', m, segs, total: L, u: 0, phase: 'transit', nextShot: 0, seg: 0, shots: 0, progress: 0 };
    this.mode = 'mission';
    this.hold = null; this.holdY = null;
    this.gimbal.tPitch = -90; this.gimbal.tYaw = 0;
    this.emit('mission-start', this.auto);
    return true;
  }

  cancelAuto(why = 'Stick input: autopilot cancelled') {
    if (!this.auto) return;
    const kind = this.auto.kind;
    this.auto = null;
    this.mode = 'flying';
    this.hold = null; this.holdY = null;
    this.emit('auto-cancel', { kind, why });
  }

  /* -------------------------------------------------------------------- the step */
  /** Advance by dt seconds (the page calls this at a fixed 1/120 s). */
  step(dt, inp) {
    this.time += dt;
    this.stepPreflight(dt);
    this.stepRtk(dt);
    const p = this.pos, v = this.vel;
    const gnd = this.ground(p.x, p.z);
    this.agl = p.y - gnd;
    const under = this.below(p.x, p.z, p.y);
    this.aglEff = p.y - under;

    const stick = Math.max(Math.abs(inp.lx), Math.abs(inp.ly), Math.abs(inp.rx), Math.abs(inp.ry));
    if (stick > 0.25 && AUTO.has(this.mode)) this.cancelAuto();

    // ---- gimbal (slews at 120 °/s) and zoom
    const gs = 120 * dt;
    this.gimbal.tPitch = clamp(this.gimbal.tPitch, -90, 30);
    this.gimbal.tYaw = clamp(this.gimbal.tYaw, -90, 90);
    this.gimbal.pitch += clamp(this.gimbal.tPitch - this.gimbal.pitch, -gs, gs);
    this.gimbal.yaw += clamp(this.gimbal.tYaw - this.gimbal.yaw, -gs, gs);

    // ---- rotor spin (eases toward its target)
    this.rotor += (this.rotorTarget - this.rotor) * (1 - Math.exp(-dt / 0.35));
    if (Math.abs(this.rotor - this.rotorTarget) < 0.003) this.rotor = this.rotorTarget;

    // ---- command: desired world velocity and yaw rate
    let vdx = 0, vdz = 0, vdy = 0, yawCmd = 0, kH = 2.2, aMax = this.sport ? 9 : 6.5, yawTo = null;
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    switch (this.mode) {
      case 'flying': {
        const vmax = this.sport ? LIMITS.vSport : LIMITS.vH;
        const fwd = inp.ry * vmax, right = inp.rx * vmax;
        vdx = sinY * fwd - cosY * right;
        vdz = cosY * fwd + sinY * right;
        vdy = inp.ly > 0 ? inp.ly * LIMITS.vUp : inp.ly * LIMITS.vDown;
        yawCmd = -inp.lx * LIMITS.yawRate * DEG;
        // RTK position hold when the right stick is centred
        if (Math.abs(inp.rx) < 0.03 && Math.abs(inp.ry) < 0.03) {
          if (!this.hold && Math.hypot(v.x, v.z) < 0.5) this.hold = { x: p.x, z: p.z };
          if (this.hold) {
            const ex = this.hold.x - p.x, ez = this.hold.z - p.z, d = Math.hypot(ex, ez);
            const k = d > 1e-6 ? Math.min(1.5, d * 0.9) / d : 0;
            vdx = ex * k; vdz = ez * k;
          }
        } else this.hold = null;
        // altitude hold when the left stick is centred vertically
        if (Math.abs(inp.ly) < 0.03) {
          if (this.holdY === null && Math.abs(v.y) < 0.3) this.holdY = p.y;
          if (this.holdY !== null) vdy = clamp((this.holdY - p.y) * 1.2, -1, 1);
        } else this.holdY = null;
        // near the ground with the stick held down: land (as the real aircraft does)
        if (this.aglEff < 0.6 && inp.ly < -0.5) { this.landIntent += dt; if (this.landIntent > 0.6) { this.mode = 'landing'; this.hold = { x: p.x, z: p.z }; this.emit('toast', 'Landing'); } }
        else this.landIntent = 0;
        break;
      }
      case 'spinup':
        this.spinT += dt;
        if (this.spinT > 0.9) { this.mode = 'takeoff'; this.airborne = true; this.emit('airborne'); }
        break;
      case 'takeoff': {
        vdy = this.agl < 1.5 ? 1.3 : 0;
        if (this.agl >= 1.45) { this.mode = 'flying'; this.holdY = p.y; this.hold = { x: p.x, z: p.z }; this.emit('hover'); }
        const ex = this.home.x - p.x, ez = this.home.z - p.z; vdx = ex; vdz = ez;
        break;
      }
      case 'landing': {
        const h = this.hold || { x: p.x, z: p.z };
        vdx = clamp((h.x - p.x) * 1.2, -2, 2); vdz = clamp((h.z - p.z) * 1.2, -2, 2);
        vdy = this.aglEff > 3 ? -2.0 : this.aglEff > 0.8 ? -0.9 : -0.5;
        break;
      }
      case 'rth': {
        const a = this.auto;
        const ex = this.home.x - p.x, ez = this.home.z - p.z, d = Math.hypot(ex, ez);
        if (a.phase === 'climb') {
          vdy = clamp((a.alt - p.y) * 1.5, -LIMITS.vDown, LIMITS.vUp);
          if (Math.abs(a.alt - p.y) < 0.6) a.phase = 'cruise';
          yawTo = Math.atan2(ex, ez);
        } else if (a.phase === 'cruise') {
          const sp = Math.min(LIMITS.rthSpeed, Math.sqrt(2 * 2.2 * d), d * 1.1 + 0.15);
          vdx = d > 1e-6 ? ex / d * sp : 0; vdz = d > 1e-6 ? ez / d * sp : 0;
          vdy = clamp((a.alt - p.y) * 1.2, -2, 3);
          if (d > 3) yawTo = Math.atan2(ex, ez);
          if (d < 0.5 && Math.hypot(v.x, v.z) < 0.5) a.phase = 'descend';
        } else {
          // precision landing on the pad
          vdx = clamp(ex * 1.4, -2, 2); vdz = clamp(ez * 1.4, -2, 2);
          vdy = this.aglEff > 6 ? -3 : this.aglEff > 1 ? -1.0 : -0.5;
          a.phase = this.aglEff > 6 ? 'descend' : 'land';
        }
        break;
      }
      case 'goto': {
        const a = this.auto;
        const ex = a.x - p.x, ez = a.z - p.z, d = Math.hypot(ex, ez);
        const sp = Math.min(a.speed, Math.sqrt(2 * 2.0 * d), d * 1.1 + 0.1);
        vdx = d > 1e-6 ? ex / d * sp : 0; vdz = d > 1e-6 ? ez / d * sp : 0;
        // keep 5 m over the ground ahead while in transit
        let gAhead = this.ground(p.x, p.z);
        if (d > 2) for (const k of [8, 16, 24]) { const t = Math.min(1, k / d); gAhead = Math.max(gAhead, this.ground(p.x + ex * t, p.z + ez * t)); }
        const ty = Math.max(a.y, d > 4 ? gAhead + 5 : -Infinity);
        vdy = clamp((ty - p.y) * 1.2, -LIMITS.vDown, LIMITS.vUp);
        if (d > 4) yawTo = Math.atan2(ex, ez);
        else if (a.look) yawTo = Math.atan2(a.look.x - p.x, a.look.z - p.z);
        if (a.look && d < 12) {
          const dx = a.look.x - p.x, dz = a.look.z - p.z, dy = a.look.y - p.y;
          this.gimbal.tPitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)) / DEG, -90, 30);
        } else if (a.gimbal !== null && d < 12) this.gimbal.tPitch = a.gimbal;
        const yawOk = yawTo === null || Math.abs(wrapPi(yawTo - this.yaw)) < 4 * DEG;
        if (d < 0.4 && Math.abs(ty - p.y) < 0.4 && Math.hypot(v.x, v.z) < 0.35 && yawOk) {
          this.auto = null; this.mode = 'flying'; this.hold = { x: p.x, z: p.z }; this.holdY = p.y;
          this.emit('arrived', a);
        }
        break;
      }
      case 'mission': this.missionCommand(dt, (x, y, z, yt) => { vdx = x; vdy = y; vdz = z; yawTo = yt; }); break;
      default: break;   // parked / preflight / ready / landed: on the ground
    }

    // yaw: an autopilot steers toward yawTo at up to 90 °/s
    if (yawTo !== null) yawCmd = clamp(wrapPi(yawTo - this.yaw) * 2.5, -90 * DEG, 90 * DEG);

    // ---- safety layers
    const landingNow = this.mode === 'landing' || (this.mode === 'rth' && this.auto?.phase === 'land');
    const flyingish = this.airborne && this.mode !== 'landing' && this.mode !== 'spinup';
    this.warn.boundary = Math.max(Math.abs(p.x), Math.abs(p.z)) > GEOFENCE - 40;
    this.warn.vlos = this.airborne && Math.hypot(p.x - this.home.x, p.z - this.home.z) > VLOS;
    this.warn.fence = false;
    if (flyingish) {
      for (const ax of ['x', 'z']) {
        const q = p[ax], over = Math.abs(q) - GEOFENCE;
        // brake so it stops at the fence (v² = 2 a d), then nudge back from beyond it
        const s0 = Math.sign(q) || 1, room = Math.max(0, GEOFENCE - Math.abs(q)), vmax = Math.sqrt(2 * 4.5 * room);
        if (ax === 'x' && vdx * s0 > vmax) vdx = s0 * vmax;
        if (ax === 'z' && vdz * s0 > vmax) vdz = s0 * vmax;
        if (over > 0) {
          this.warn.fence = true;
          const s = Math.sign(q);
          if (ax === 'x') { if (vdx * s > 0) vdx = 0; vdx -= s * Math.min(4, 1 + over * 1.5); }
          else { if (vdz * s > 0) vdz = 0; vdz -= s * Math.min(4, 1 + over * 1.5); }
          this.hold = null;
        }
      }
      // altitude cap
      this.warn.alt = this.agl > ALT_CAP - 6;
      this.warn.altCap = this.agl > ALT_CAP - 1.5;
      if (vdy > 0) vdy = Math.min(vdy, Math.max(0, (ALT_CAP - this.agl) * 1.2));
      if (this.agl > ALT_CAP + 0.5) vdy = Math.min(vdy, -0.6);
      if (this.holdY !== null && this.holdY - gnd > ALT_CAP) this.holdY = gnd + ALT_CAP;
      // obstacle sensing ahead (along the commanded motion, or the current one)
      let ux = vdx, uz = vdz, um = Math.hypot(ux, uz);
      if (um < 0.4) { ux = v.x; uz = v.z; um = Math.hypot(ux, uz); }
      if (um > 0.4 && this.query) {
        ux /= um; uz /= um;
        // look far enough ahead to stop from the current speed (v² / 2a), at least 8 m
        const look = Math.max(8, Math.min(30, this.speedH * this.speedH / (2 * 7) + 4));
        const c = this.query.clearance(p.x, p.y, p.z, ux, uz, look);
        this.clear = c;
        this.warn.obstacle = c < 5 ? { d: c, ux, uz } : null;
        const along = vdx * ux + vdz * uz;
        // the fastest approach that can still stop 2 m short with a hard brake (7.5 m/s²)
        // (aimed a metre further out: the velocity loop lags about a metre at these speeds)
        const allowed = Math.sqrt(2 * 7.5 * Math.max(0, c - 3.1)) * 0.85;
        if (along > allowed) { const cut = along - allowed; vdx -= ux * cut; vdz -= uz * cut; aMax = 10; kH = 3.2; }
        if (AUTO.has(this.mode) && c < 4) vdy = Math.max(vdy, 2.5);   // an autopilot climbs over
      } else { this.warn.obstacle = null; this.clear = 8; }
      // below: terrain or a tree crown
      this.warn.below = this.aglEff < 5 && v.y < -0.6 ? this.aglEff : null;
      if (this.aglEff < 2 && vdy < 0 && this.mode !== 'takeoff') vdy = Math.max(vdy, this.mode === 'flying' ? -0.7 : -1.0);
      if (this.aglEff < 0.6 && !landingNow && this.mode !== 'takeoff' && !(this.mode === 'flying' && inp.ly < -0.5)) vdy = Math.max(vdy, (0.6 - this.aglEff) * 2);
    } else {
      this.warn.obstacle = null; this.warn.below = null; this.warn.alt = this.warn.altCap = false;
    }

    // ---- dynamics
    if (this.airborne) {
      // gusts (Ornstein–Uhlenbeck, τ 2.5 s, σ 1.4 m/s); the flight controller learns the wind in ~1.2 s
      const w = this.wind, tau = 2.5, sig = 1.4;
      w.gx += (-w.gx / tau) * dt + sig * Math.sqrt(2 * dt / tau) * gauss(this.r);
      w.gz += (-w.gz / tau) * dt + sig * Math.sqrt(2 * dt / tau) * gauss(this.r);
      const wx = w.mx + w.gx, wz = w.mz + w.gz;
      w.ex += (wx - w.ex) * dt / 1.2; w.ez += (wz - w.ez) * dt / 1.2;
      const gk = this.agl < 2 ? this.agl / 2 : 1;          // calm in ground effect
      let ax = (vdx - v.x) * kH, az = (vdz - v.z) * kH;
      const am = Math.hypot(ax, az);
      if (am > aMax) { ax *= aMax / am; az *= aMax / am; }
      this.acc.set(ax, 0, az);
      v.x += (ax + 0.9 * (wx - w.ex) * gk) * dt;
      v.z += (az + 0.9 * (wz - w.ez) * gk) * dt;
      const ay = clamp((vdy - v.y) * 3.2, -7, 7);
      v.y += ay * dt;
      this.yawRate += (yawCmd - this.yawRate) * Math.min(1, dt * 8);
      this.yaw = wrapPi(this.yaw + this.yawRate * dt);
      p.addScaledVector(v, dt);
      // clamps: the terrain (and tree crowns) under it, trees and the truck around it
      const g2 = this.ground(p.x, p.z);
      if (p.y < g2) { p.y = g2; if (v.y < 0) v.y = 0; }
      if (this.query && this.query.pushOut(p)) { v.multiplyScalar(0.5); this.emit('bump'); }
      // touchdown
      if (landingNow && p.y - this.below(p.x, p.z, p.y + 0.01) <= 0.02 && v.y <= 0.05) this.touchdown();
      // body tilt from acceleration + drag (stabilised camera unaffected)
      const dragK = 0.2;
      const fx = ax + dragK * (v.x - wx), fz = az + dragK * (v.z - wz);   // into the wind when hovering
      const aFwd = fx * sinY + fz * cosY, aRight = -fx * cosY + fz * sinY;
      const maxT = LIMITS.tilt * DEG;
      const tp = clamp(Math.atan2(aFwd, G), -maxT, maxT), tr = clamp(Math.atan2(aRight, G), -maxT, maxT);
      const k = 1 - Math.exp(-dt / 0.12);
      this.pitch += (tp - this.pitch) * k; this.roll += (tr - this.roll) * k;
      this.flightTime += dt;
    } else {
      v.set(0, 0, 0); this.acc.set(0, 0, 0); this.yawRate = 0;
      this.pitch *= 0.9; this.roll *= 0.9;
      p.y = this.ground(p.x, p.z) + 0.004;
    }

    // ---- battery
    if (this.rotor > 0.25) {
      const sp = Math.hypot(v.x, v.z);
      const load = 0.82 + 0.18 * Math.pow(Math.min(1.4, sp / 15), 1.5) + 0.12 * Math.max(0, v.y) / 6 + (this.sport ? 0.08 : 0);
      const rate = (100 / LIMITS.battery) * load;
      this.drain += (rate - this.drain) * Math.min(1, dt / 3);
      this.battery = Math.max(0, this.battery - rate * dt);
      this.stepBattery();
    }
  }

  touchdown() {
    const p = this.pos;
    p.y = this.below(p.x, p.z, p.y + 0.01);
    this.vel.set(0, 0, 0);
    this.airborne = false;
    this.auto = null;
    this.mode = 'ready';
    this.rotorTarget = 0;
    this.hold = null; this.holdY = null;
    this.pitch = 0; this.roll = 0;
    this.emit('landed', { home: Math.hypot(p.x - this.home.x, p.z - this.home.z) });
  }

  stepBattery() {
    const b = this.battery, f = this.batteryFlags;
    this.warn.battery = b <= 25 ? (b <= 15 ? 'critical' : 'low') : null;
    if (b <= 25 && !f.low) { f.low = true; this.emit('battery', 'low'); }
    if (b <= 15 && !f.rth && this.airborne) { f.rth = true; if (this.mode !== 'landing' && this.mode !== 'rth') this.rth('battery'); this.emit('battery', 'rth'); }
    if (b <= 8 && !f.land && this.airborne) { f.land = true; this.land(); this.emit('battery', 'land'); }
  }

  /** The mapping mission's command (transit to the first line, then the lawnmower at line speed). */
  missionCommand(dt, out) {
    const a = this.auto, m = a.m, p = this.pos, v = this.vel;
    const segs = a.segs;
    if (a.phase === 'transit') {
      const s0 = segs[0];
      const ex = s0.a.x - p.x, ez = s0.a.z - p.z, d = Math.hypot(ex, ez);
      // climb before crossing if far below the mission height
      const climbFirst = m.y - p.y > 8 && d > 10;
      const sp = climbFirst ? 0 : Math.min(LIMITS.gotoSpeed, Math.sqrt(2 * 2.0 * d), d * 1.1 + 0.1);
      const vy = clamp((m.y - p.y) * 1.2, -LIMITS.vDown, LIMITS.vUp);
      const lineYaw = Math.atan2(s0.b.x - s0.a.x, s0.b.z - s0.a.z);
      out(d > 1e-6 ? ex / d * sp : 0, vy, d > 1e-6 ? ez / d * sp : 0, d > 4 ? Math.atan2(ex, ez) : lineYaw);
      if (d < 1.0 && Math.abs(m.y - p.y) < 0.8 && Math.abs(wrapPi(lineYaw - this.yaw)) < 8 * DEG) { a.phase = 'run'; a.u = 0; this.emit('mission-run', a); }
      return;
    }
    if (a.phase === 'done') { out(0, 0, 0, null); return; }
    // the carrot runs along the route at line speed while the drone keeps up
    let si = 0; while (si < segs.length - 1 && a.u > segs[si].u0 + segs[si].len) si++;
    const s = segs[si];
    const f = s.len > 1e-6 ? clamp((a.u - s.u0) / s.len, 0, 1) : 1;
    const cx = s.a.x + (s.b.x - s.a.x) * f, cz = s.a.z + (s.b.z - s.a.z) * f;
    const lag = Math.hypot(cx - p.x, cz - p.z);
    const speed = s.line ? m.speed : Math.min(m.speed, 6);
    a.u = Math.min(a.total, a.u + speed * dt * (lag < 2.5 ? 1 : lag < 5 ? 0.4 : 0));
    const ux = s.len > 1e-6 ? (s.b.x - s.a.x) / s.len : 0, uz = s.len > 1e-6 ? (s.b.z - s.a.z) / s.len : 0;
    const ff = a.u < a.total ? speed : 0;
    const vx = ux * ff + clamp((cx - p.x) * 1.4, -4, 4), vz = uz * ff + clamp((cz - p.z) * 1.4, -4, 4);
    const vy = clamp((m.y - p.y) * 1.2, -2, 2);
    const nx = segs[si + 1];
    out(vx, vy, vz, s.line ? Math.atan2(ux, uz) : nx ? Math.atan2(nx.b.x - nx.a.x, nx.b.z - nx.a.z) : null);
    a.seg = si;
    // photos: every photoEvery metres of the drone's own progress along the line it is on (or has just
    // left: the drone runs a little behind the carrot, so the last still of a line can fall on the turn)
    if (s.line && a.lineIndex !== s.index) {
      if (a.curLine && a.nextShot <= a.curLine.len + 0.05) this.missionShot(a, a.curLine.len);   // finish the old line
      a.curLine = s; a.lineIndex = s.index; a.nextShot = 0;
    }
    const L = a.curLine;
    if (L && a.nextShot <= L.len + 0.05) {
      const lx = (L.b.x - L.a.x) / L.len, lz = (L.b.z - L.a.z) / L.len;
      const along = (p.x - L.a.x) * lx + (p.z - L.a.z) * lz;
      if (along >= a.nextShot - 0.3) this.missionShot(a, along);
    }
    a.progress = a.total > 0 ? a.u / a.total : 1;
    const end = segs[segs.length - 1].b;
    if (a.u >= a.total && Math.hypot(end.x - p.x, end.z - p.z) < 1.2) {
      if (a.curLine && a.nextShot <= a.curLine.len + 0.05) this.missionShot(a, a.curLine.len);
      a.phase = 'done'; a.progress = 1;
      this.auto = null; this.mode = 'flying'; this.hold = { x: p.x, z: p.z }; this.holdY = p.y;
      this.emit('mission-complete', a);
    }
  }

  missionShot(a, along) {
    a.nextShot += a.m.photoEvery;
    a.shots++;
    this.emit('mission-photo', { line: a.lineIndex, along, shot: a.shots });
  }

  /* ------------------------------------------------------------- pre-flight and RTK */
  stepPreflight(dt) {
    if (this.mode !== 'preflight') return;
    const t = (this.preT += dt);
    const c = this.checks;
    this.power = clamp(t / 0.8, 0, 1);
    if (!c.power && t > 0.8) { c.power = true; this.emit('check', 'power'); }
    // the arms swing out over 1.8 s and settle as they lock
    const u = clamp((t - 0.4) / 1.8, 0, 1);
    this.fold = 1 - smooth01(u) + (u > 0.85 ? 0.035 * Math.sin((u - 0.85) / 0.15 * Math.PI) : 0);
    this.fold = clamp(this.fold, 0, 1);
    if (!c.arms && t > 2.2) { c.arms = true; this.fold = 0; this.emit('check', 'arms'); }
    if (!c.props && t > 2.7) { c.props = true; this.emit('check', 'props'); }
    if (!c.battery && t > 3.1) { c.battery = true; this.emit('check', 'battery'); }
    // compass / IMU: a gimbal calibration sweep
    if (t > 3.1 && t < 4.4) { const k = (t - 3.1) / 1.3; this.gimbal.tPitch = k < 0.45 ? -90 : k < 0.8 ? 25 : -15; }
    if (!c.compass && t > 4.4) { c.compass = true; this.emit('check', 'compass'); }
    if (!c.rtk && this.rtk.state === 'fix') { c.rtk = true; this.emit('check', 'rtk'); }
    if (c.power && c.arms && c.props && c.battery && c.compass && c.rtk) { this.mode = 'ready'; this.emit('ready'); }
  }

  stepRtk(dt) {
    const k = this.rtk;
    if (k.state === 'off') return;
    k.t += dt;
    const r = this.r;
    if (k.state === 'acquiring') {
      k.sats = Math.min(17, Math.floor(k.t * 9));
      k.h = 2.5 - k.t; k.v = 4 - k.t * 1.5;
      if (k.t > 1.7) { k.state = 'float'; k.t = 0; this.emit('rtk', 'float'); }
    } else if (k.state === 'float') {
      k.sats = Math.min(26, 17 + Math.floor(k.t * 2.5));
      k.h = 0.32 - 0.04 * k.t; k.v = 0.5 - 0.06 * k.t;
      if (k.t > 4.0) { k.state = 'fix'; k.t = 0; this.emit('rtk', 'fix'); }
    } else {
      if (k.sats < k.satTarget && k.t > (k.sats - 25) * 0.35) k.sats++;
      if (k.t > k.nextWobble && k.sats >= k.satTarget - 1) {
        k.nextWobble = k.t + 3 + r() * 4;
        k.sats = clamp(k.sats + (r() < 0.5 ? -1 : 1), 28, 34);
      }
      k.h = 0.0105 + 0.002 * Math.sin(k.t * 0.37) + 0.0008 * Math.sin(k.t * 1.9);
      k.v = 0.0165 + 0.003 * Math.sin(k.t * 0.29 + 1) + 0.001 * Math.sin(k.t * 2.3);
    }
  }

  /* -------------------------------------------------------------------- readouts */
  /** Compass heading (deg, 0 = north) of the nose. Scene: nose = (sin yaw, cos yaw) in (x, z); north = −z. */
  get heading() { return ((Math.PI - this.yaw) / DEG % 360 + 360) % 360; }
  get speedH() { return Math.hypot(this.vel.x, this.vel.z); }
  get distHome() { return Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z); }
  /** Remaining flight time (s) at the current drain. */
  get remaining() { return this.battery / Math.max(1e-3, this.drain); }
  get windSpeed() { return Math.hypot(this.wind.mx + this.wind.gx, this.wind.mz + this.wind.gz); }
  get windFrom() { const x = this.wind.mx + this.wind.gx, z = this.wind.mz + this.wind.gz; return ((Math.atan2(-x, z) / DEG) % 360 + 360) % 360; }
}
