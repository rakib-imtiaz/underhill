// Underhill v2 — gear rig: Trimble R12i GNSS (the model is the GNSS antenna on a base tripod, so the
// mission is a base / rover job): set up over CP-01's nail with the laser plummet, level the antenna
// with a vial (the pole and antenna tilt with the bubble), wait for RTK (skyplot, signal rings, LED
// blink), store a check shot, then stake out PIN-07 with the rover to inside 2 cm (a hot / cold game
// on the diorama ground) and drive the lath.
import * as THREE from 'three';
import { toSurvey, CP01 } from '../studio.js';

const DEG = Math.PI / 180;
const HEAD_Y = 0.6;                                  // the tripod head (the levelling pivot)
const START = new THREE.Vector3(0.36, 0, 0.27);      // where the tripod is put down, off the nail
const TILT0 = { x: 2.6, z: -1.8 };                   // degrees, before levelling
const VIAL_K = 9;                                    // vial units per degree of tilt
const SHOW = 2.2;                                    // the antenna's visible lean per degree
const PIN = new THREE.Vector3(1.55, 0, -1.25);       // PIN-07, the design point (lot corner)
const ROVER0 = new THREE.Vector3(0.62, 0, 0.92);
const fmtCoord = (v) => { const [i, f] = v.toFixed(3).split('.'); return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}.${f}`; };

export default {
  async create(ctx) {
    const { studio, entry, orbit, tags } = ctx;
    const inst = entry.inst, root = inst.root;
    const P = studio.p;
    // level pivot: the receiver, pole and antenna tilt about the tripod head (identity at rest, so the
    // staged explode and the label anchors are unchanged)
    let pivot = root.getObjectByName('gear:level-pivot');
    if (!pivot) {
      pivot = new THREE.Group(); pivot.name = 'gear:level-pivot';
      root.add(pivot);
      for (const id of ['receiver-unit', 'range-pole', 'gnss-antenna']) { const n = root.getObjectByName(id); if (n) pivot.add(n); }
    }
    const dome = root.getObjectByName('gnss-antenna');
    const leds = [];
    root.traverse((o) => { const m = o.material; if (m && /led/.test(m.name || '') && !leds.includes(m)) leds.push(m); });
    const ledBase = leds.map((m) => m.emissiveIntensity);

    const S = {
      off: START.clone(), tilt: { ...TILT0 }, tiltShown: { ...TILT0 }, rtk: 0, rover: ROVER0.clone(),
      stored: null, staked: null, sats: 0, drive: -1, clock: 0, fix: null,
    };
    const H = new THREE.Vector3(0, HEAD_Y, 0), q = new THREE.Quaternion(), e = new THREE.Euler();
    const applyTilt = () => {
      e.set(S.tiltShown.z * DEG * SHOW, 0, -S.tiltShown.x * DEG * SHOW);   // exaggerated so a few degrees read
      q.setFromEuler(e);
      pivot.quaternion.copy(q);
      pivot.position.copy(H).sub(H.clone().applyQuaternion(q));
      studio.contact.dirty = true;
    };
    const placeTripod = () => {
      studio.holder.position.set(S.off.x, 0, S.off.z);
      P.plummetDot.position.set(S.off.x, 0.007, S.off.z);
      P.plumbLine.position.set(S.off.x, 0, S.off.z);
      const on = S.off.length() < 0.0015;
      P.plummetDot.material.color.setRGB(on ? 0.4 : 4, on ? 4 : 0.5, on ? 1.2 : 0.3);
      studio.contact.dirty = true;
    };
    const placeRover = () => {
      P.rover.position.set(S.rover.x, 0, S.rover.z);
      const d = S.rover.distanceTo(PIN);
      const dir = PIN.clone().sub(S.rover);
      P.arrow.visible = S.cur === 'stake' && d > 0.02;
      P.arrow.position.set(S.rover.x + dir.x * 0, 0.012, S.rover.z);
      P.arrow.position.addScaledVector(dir.normalize(), 0.22);
      P.arrow.rotation.y = Math.atan2(-dir.x, -dir.z);
      const hot = THREE.MathUtils.clamp(1 - d / 1.2, 0, 1);
      P.arrow.material.color.setRGB(1.4 - hot * 1.0, 0.75 + hot * 0.5, 0.25 + hot * 0.3);
      P.ringMat.color.setRGB(d < 0.02 ? 0.45 : 0.36, d < 0.02 ? 1.6 : 0.75, d < 0.02 ? 0.8 : 0.96);
    };
    const groundDrag = (onDelta) => {
      let last = null;
      return (ev) => {
        if (ev.type === 'down') { last = studio.groundPoint(ev.x, ev.y); return true; }
        if (ev.type === 'move' && last) {
          const p = studio.groundPoint(ev.x, ev.y);
          if (p) { onDelta(p.x - last.x, p.z - last.z); last = p; }
          return true;
        }
        if (ev.type === 'up') { last = null; onDelta(0, 0, true); return true; }
        return true;
      };
    };

    const rig = {
      widgetOptions(step) { return step.id === 'store' ? { label: 'Hold to measure' } : {}; },

      enter(step, w, api) {
        S.cur = step.id;
        const base = { plummetDot: true, plumbLine: step.id === 'setup' };
        if (step.id === 'setup') {
          studio.setProps(base);
          S.off.copy(START); placeTripod();
          tags.show('cp01', new THREE.Vector3(0, 0, 0), 'CP-01', 'Control nail');
          orbit.flyTo({ target: [0.2, 0.3, 0.14], dist: orbit.home.dist * 1.3, az: 34, el: 34 });
          const tryDone = (release) => {
            const d = S.off.length();
            if (d < (release ? 0.012 : 0.003)) { S.off.set(0, 0, 0); placeTripod(); w.set(0, 0); api.done(`Centred on CP-01, ${release ? '0.4 mm' : '0.2 mm'} off the nail.`); return true; }
            return false;
          };
          const move = (dx, dz, up) => {
            if (up) { tryDone(true); return; }
            const d = S.off.length();
            const k = d < 0.06 ? 0.3 : 1;
            S.off.x = THREE.MathUtils.clamp(S.off.x + dx * k, -1, 1);
            S.off.z = THREE.MathUtils.clamp(S.off.z + dz * k, -1, 1);
            placeTripod(); w.set(-S.off.x, -S.off.z);
            tryDone(false);
          };
          w.set(-S.off.x, -S.off.z);
          w.onDrag = (dx, dz) => move(dx, dz);
          w.onRelease = () => move(0, 0, true);
          api.setCapture(groundDrag(move));
          return true;
        }
        if (step.id === 'level') {
          studio.setProps(base);
          S.off.set(0, 0, 0); placeTripod();
          tags.show('cp01', new THREE.Vector3(0, 0, 0), 'CP-01', 'Control nail');
          orbit.flyTo({ target: [0, 0.8, 0], dist: orbit.home.dist * 0.82, az: 30, el: 14 });
          w.set(S.tilt.x * VIAL_K, S.tilt.z * VIAL_K);
          w.onChange = (x, y) => { S.tilt.x = x / VIAL_K; S.tilt.z = y / VIAL_K; };
          w.onRelease = (x, y) => {
            if (Math.hypot(x, y) <= 6) { S.tilt.x = S.tilt.z = 0; w.set(0, 0); api.done('Level. The antenna is plumb over the nail.'); }
          };
          return true;
        }
        if (step.id === 'rtk') {
          studio.setProps({ plummetDot: false });
          S.rtk = 0; S.rtkForce = false;
          orbit.flyTo({ target: [0, 1.05, 0], dist: orbit.home.dist * 1.2, az: 22, el: 12 });
          return true;
        }
        if (step.id === 'store') {
          studio.setProps({});
          orbit.flyTo({ target: [0, 0.55, 0], dist: orbit.home.dist, az: 30, el: 14 });
          tags.show('cp01', new THREE.Vector3(0, 0, 0), 'CP-01', 'Control nail');
          w.onDone = () => {
            // a check shot on the nail: the antenna height comes off, the published CP-01 is the truth
            const got = { E: CP01.E + 0.003, N: CP01.N - 0.006, El: CP01.El + 0.008 };
            S.stored = got;
            api.status(`<span class="mc__coords">E ${fmtCoord(got.E)} · N ${fmtCoord(got.N)} · El ${fmtCoord(got.El)}</span>`);
            api.done('Stored. ΔH 0.7 cm, ΔV 0.8 cm from CP-01: inside tolerance.');
          };
          return true;
        }
        if (step.id === 'stake') {
          studio.setProps({ rover: true, ring: true, arrow: true });
          P.ring.position.set(PIN.x, 0.006, PIN.z);
          S.rover.copy(ROVER0); S.staked = null; S.drive = -1;
          placeRover();
          tags.show('pin', PIN, 'PIN-07', 'Lot corner (design)');
          tags.show('cp01', new THREE.Vector3(0, 0, 0), 'CP-01', 'Base');
          orbit.flyTo({ target: [1.05, 0.25, -0.2], dist: orbit.home.dist * 1.55, az: 66, el: 40 });
          const d0 = () => S.rover.distanceTo(PIN);
          w.set(S.rover.x - PIN.x, S.rover.z - PIN.z);
          const check = (release) => {
            const d = d0();
            if (release && d < 0.02) {
              S.staked = { d, at: S.rover.clone() };
              S.drive = 0;
              P.arrow.visible = false;
              api.done(`Within 2 cm (${(d * 100).toFixed(1)} cm). Pin driven, lath set.`);
            }
          };
          const move = (dx, dz, up) => {
            if (S.staked) return;
            if (up) { check(true); return; }
            const k = THREE.MathUtils.clamp(d0() / 0.45, 0.1, 1);
            S.rover.x = THREE.MathUtils.clamp(S.rover.x + dx * k, -3.5, 3.5);
            S.rover.z = THREE.MathUtils.clamp(S.rover.z + dz * k, -3.5, 3.5);
            placeRover(); w.set(S.rover.x - PIN.x, S.rover.z - PIN.z);
            studio.contact.dirty = true;
          };
          w.onDrag = (dx, dz) => move(dx, dz);
          w.onRelease = () => move(0, 0, true);
          api.setCapture(groundDrag(move));
          return true;
        }
        return false;
      },

      update(dt, step, api) {
        S.clock += dt;
        // ease the antenna's tilt toward the bubble
        const k = 1 - Math.exp(-dt * (ctx.reduced ? 60 : 14));
        S.tiltShown.x += (S.tilt.x - S.tiltShown.x) * k;
        S.tiltShown.z += (S.tilt.z - S.tiltShown.z) * k;
        if (Math.abs(S.tiltShown.x - S.tilt.x) + Math.abs(S.tiltShown.z - S.tilt.z) > 1e-4 || pivot.quaternion.w < 1) applyTilt();
        if (step.id === 'rtk') {
          S.rtk = S.rtkForce ? 1 : Math.min(1, api.stepTime() / (step.seconds || 6));
          api.widget?.set(S.rtk);
          const fixed = S.rtk >= 0.8;
          leds.forEach((m, i) => { m.emissiveIntensity = ledBase[i] * (fixed ? 1.3 : (Math.sin(S.clock * 9) > 0 ? 1.3 : 0.25)); });
          // corrections arrive from Float on: the signal rings rise off the dome
          studio.rings.update(dome, THREE.MathUtils.smoothstep(S.rtk, 0.4, 0.55) * (1 - THREE.MathUtils.smoothstep(S.rtk, 0.9, 1)), S.clock, orbit.camera.position.y);
          if (S.rtk >= 1 && !api.widget?._done) {
            const wd = api.widget; wd._done = true;
            S.fix = { sats: wd.sats, h: wd.h, v: wd.v };
            api.done(`RTK fixed: ${wd.sats} satellites, H ${(wd.h * 100).toFixed(1)} cm, V ${(wd.v * 100).toFixed(1)} cm.`);
          }
        } else if (studio.rings.group.visible) studio.rings.update(null, 0, 0);
        if (step.id === 'stake' && S.drive >= 0 && S.drive < 1) {
          // drive the lath in beside the pin; the rover steps back
          S.drive = Math.min(1, S.drive + dt / (ctx.reduced ? 0.01 : 0.7));
          const a = S.staked.at;
          P.stakeLath.visible = true;
          P.stakeLath.position.set(a.x + 0.05, (1 - THREE.MathUtils.smoothstep(S.drive, 0, 1)) * 0.45, a.z + 0.03);
          S.rover.set(a.x + 0.34 * S.drive, 0, a.z + 0.36 * S.drive);
          placeRover();
          studio.contact.dirty = true;
        }
      },

      act(step, w, api) {
        if (step.id === 'setup') { S.off.set(0.004, 0, -0.003); w.onRelease(); }
        else if (step.id === 'level') { w.set(0, 0); w.onRelease(0, 0); }
        else if (step.id === 'rtk') { S.rtkForce = true; }
        else if (step.id === 'store') { w.finish(); }
        else if (step.id === 'stake') { S.rover.set(PIN.x + 0.009, 0, PIN.z - 0.008); placeRover(); w.set(S.rover.x - PIN.x, S.rover.z - PIN.z); w.onRelease(); }
      },

      // the RTK step completes in update() once the widget reaches 1: let act() push the clock there
      leave(step) {
        if (step.id === 'rtk') { studio.rings.update(null, 0, 0); leds.forEach((m, i) => { m.emissiveIntensity = ledBase[i]; }); }
        if (step.id === 'setup') tags.hide('cp01');
      },

      result() {
        const fix = S.fix || { sats: 31, h: 0.008, v: 0.015 };
        const pinS = toSurvey(PIN);
        const st = S.staked ? toSurvey(S.staked.at) : null;
        return {
          title: 'Base set, corner staked',
          rows: [
            ['Base', 'CP-01 · UTM 11N · El 412.000'],
            ['RTK', `Fixed · ${fix.sats} sats · H ${(fix.h * 100).toFixed(1)} cm · V ${(fix.v * 100).toFixed(1)} cm`],
            ['Check shot', S.stored ? `E ${fmtCoord(S.stored.E)} · N ${fmtCoord(S.stored.N)}` : '—'],
            ['PIN-07 design', `E ${fmtCoord(pinS.E)} · N ${fmtCoord(pinS.N)}`],
            ['As staked', st ? `E ${fmtCoord(st.E)} · N ${fmtCoord(st.N)} · ${(S.staked.d * 100).toFixed(1)} cm off` : '—'],
          ],
          note: 'Next on a real job: store the as-staked point, flag the lath, and move to the next corner.',
        };
      },

      reset() {
        S.tilt = { ...TILT0 }; S.tiltShown = { x: 0, z: 0 }; S.cur = null;
        pivot.quaternion.identity(); pivot.position.set(0, 0, 0);
        studio.holder.position.set(0, 0, 0);
        leds.forEach((m, i) => { m.emissiveIntensity = ledBase[i]; });
        studio.rings.update(null, 0, 0);
        studio.setProps({});
        tags.clear();
        S.off.copy(START); S.rover.copy(ROVER0); S.staked = null; S.stored = null; S.drive = -1; S.fix = null;
        studio.contact.dirty = true;
      },

      /** Mission start: the tripod is put down off the nail, the antenna leaning. */
      begin() {
        S.tilt = { ...TILT0 }; S.tiltShown = { ...TILT0 }; applyTilt();
        S.off.copy(START); placeTripod();
      },

      dispose() { this.reset(); },
    };
    return rig;
  },
};

