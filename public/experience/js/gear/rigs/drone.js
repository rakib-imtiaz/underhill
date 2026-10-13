// Underhill v2 — gear rig: DJI M350 RTK + YellowScan Mapper+ (the sculptor drone, droneB adapter).
// Pre-flight as the crew does it: tap each arm to unfold and lock it (then the props unfold), swipe
// the Mapper+ onto the Skyport and twist it home, tap the TB65 slots to slide the batteries in (lights
// run through their check), turn the aircraft a full circle for the compass, wait for RTK FIX, then
// plan a grid on a mini map of the fly-mode site. The result card hands the plan to fly.html.
import * as THREE from 'three';
import { flyHref } from '../widgets.js';

const DEG = Math.PI / 180;
const ARMS = ['fl', 'fr', 'rl', 'rr'];
const ARM_LABEL = { fl: 'Front left', fr: 'Front right', rl: 'Rear left', rr: 'Rear right' };
const FOLD_YAW = 62 * DEG, FOLD_DROOP = 8 * DEG;          // drone.js setArmFold
const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export default {
  async create(ctx) {
    const { studio, entry, orbit, tags } = ctx;
    const inst = entry.inst, root = inst.root;
    const rt = root.userData.sculptRuntime;
    const arms = Object.fromEntries(rt.arms.map((a) => [a.key, a]));
    const mapper = inst.mapper;                              // registry.js dressMapperPlus
    const batUnits = entry.staged.units.filter((u) => /^body-battery-(l|r)$/.test(u.key));
    const top = root.getObjectByName('body-top-plate') || root;

    const S = {
      arm: { fl: 1, fr: 1, rl: 1, rr: 1 }, armGoal: { fl: 1, fr: 1, rl: 1, rr: 1 }, blade: 1, bladeGoal: 1,
      mapperV: 0, mapperGoal: null, bat: { l: 1, r: 1 }, batGoal: { l: 1, r: 1 }, power: 0, powerT: -1,
      yaw: 0, clock: 0, rtk: 0, rtkForce: false, fix: null, plan: null, cur: null, done: {},
    };

    const applyFold = () => {
      inst.pose({ fold: S.blade });
      for (const k of ARMS) {
        const a = arms[k]; if (!a) continue;
        const f = smooth(clamp01(S.arm[k]));
        a.hinge.rotation.set(0, -a.sx * a.sz * FOLD_YAW * f, -FOLD_DROOP * f);
      }
      studio.contact.dirty = true;
    };
    const applyMapper = () => {
      if (!mapper) return;
      const v = clamp01(S.mapperV);
      const slide = smooth(clamp01(v / 0.5)), lift = smooth(clamp01((v - 0.5) / 0.3)), twist = smooth(clamp01((v - 0.8) / 0.2));
      mapper.group.position.set(mapper.rest.x, mapper.rest.y - 0.029 * (1 - lift), mapper.rest.z + 0.2 * (1 - slide));
      mapper.group.rotation.y = -40 * DEG * (1 - twist);
      studio.contact.dirty = true;
    };
    const applyBatteries = () => {
      for (const u of batUnits) {
        const side = u.key.endsWith('-l') ? 'l' : 'r';
        const k = smooth(clamp01(S.bat[side]));
        for (const m of u.movers) if (m.dp) m.o.position.lerpVectors(m.rest.p, m.exp.p, k);
      }
      studio.contact.dirty = true;
    };
    const lights = (on) => {
      root.setLights(!!on);
      inst.leds(on ? { fl: on, fr: on, rl: on, rr: on } : { fl: 0, fr: 0, rl: 0, rr: 0 });
    };
    const armOf = (obj) => { for (let o = obj; o; o = o.parent) { const m = /^arm-(fl|fr|rl|rr)$/.exec(o.name); if (m) return m[1]; } return null; };
    const batOf = (obj) => { for (let o = obj; o; o = o.parent) { const m = /^body-battery-(l|r)$/.exec(o.name); if (m) return m[1]; } return null; };

    const rig = {
      widgetOptions(step) {
        if (step.id === 'unfold') return { items: ARMS.map((k) => ({ id: k, label: ARM_LABEL[k] })) };
        if (step.id === 'power') return { items: [{ id: 'l', label: 'Left TB65' }, { id: 'r', label: 'Right TB65' }] };
        return {};
      },

      enter(step, w, api) {
        S.cur = step.id;
        studio.setProps(ctx.gear.diorama);
        if (step.id === 'unfold') {
          orbit.flyTo({ target: [0, 0.2, 0], dist: orbit.home.dist * 1.05, az: 28, el: 52 });
          const unfold = (k) => {
            if (S.armGoal[k] === 0) return;
            S.armGoal[k] = 0; w.mark(k);
            if (ARMS.every((a) => S.armGoal[a] === 0)) S.bladeGoal = 0;
          };
          S.unfold = unfold;
          w.onTap = unfold;
          return true;
        }
        if (step.id === 'payload') {
          orbit.flyTo({ target: [0, 0.12, 0.08], dist: orbit.home.dist * 0.85, az: 62, el: 8 });
          tags.show('skyport', new THREE.Vector3(0, 0.2, 0.05), 'Skyport', 'Payload mount');
          w.set(S.mapperV);
          const set = (v) => { S.mapperV = v; applyMapper(); w.set(v); };
          const release = () => {
            if (S.mapperV >= 0.9) { S.mapperGoal = 1; w.locked = true; }
            else S.mapperGoal = 0;
          };
          w.onChange = (v) => { S.mapperGoal = null; set(v); };
          w.onRelease = release;
          let acc = 0;
          api.setCapture((ev) => {
            if (S.mapperGoal === 1) return true;
            if (ev.type === 'down') { acc = S.mapperV; S.mapperGoal = null; }
            if (ev.type === 'move') { acc = clamp01(acc - ev.dy / 260); set(acc); }
            if (ev.type === 'up') release();
            return true;
          });
          return true;
        }
        if (step.id === 'power') {
          orbit.flyTo({ target: [0, 0.3, 0], dist: orbit.home.dist * 0.95, az: 70, el: 26 });
          tags.hide('skyport');
          const slide = (side) => {
            if (S.batGoal[side] === 0) return;
            S.batGoal[side] = 0; w.mark(side);
            if (S.batGoal.l === 0 && S.batGoal.r === 0) S.powerT = 0;
          };
          S.slide = slide;
          w.onTap = slide;
          return true;
        }
        if (step.id === 'compass') {
          orbit.flyTo({ target: [0, 0.25, 0], dist: orbit.home.dist * 1.1, az: 26, el: 34 });
          const c = new THREE.Vector3();
          w.onChange = (deg) => {
            S.yaw = deg; studio.holder.rotation.y = deg * DEG; studio.contact.dirty = true;
            if (Math.abs(deg) >= 360 && !S.done.compass) {
              S.done.compass = true; S.yaw = 0; studio.holder.rotation.y = 0;
              api.done('Compass calibrated. Now nose down, the same again (the crew does both).');
            }
          };
          let last = null;
          api.setCapture((ev) => {
            studio.project(c.set(0, 0.25, 0), (S._p ||= {}));
            const a = Math.atan2(ev.x - S._p.x, -(ev.y - S._p.y)) / DEG;
            if (ev.type === 'down') { last = a; return true; }
            if (ev.type === 'move' && last !== null && Math.hypot(ev.x - S._p.x, ev.y - S._p.y) > 24) {
              let d = a - last; if (d > 180) d -= 360; if (d < -180) d += 360;
              last = a;
              if (!S.done.compass && (Math.abs(w.turned) < 1 || Math.sign(d) === Math.sign(w.turned))) w.add(d);
            }
            if (ev.type === 'up') last = null;
            return true;
          });
          return true;
        }
        if (step.id === 'rtk') {
          orbit.flyTo({ target: [0, 0.3, 0], dist: orbit.home.dist * 1.15, az: 20, el: 10 });
          S.rtk = 0; S.rtkForce = false;
          return true;
        }
        if (step.id === 'plan') {
          orbit.flyTo({ target: [0, 0.15, 0], dist: orbit.home.dist * 1.25, az: 24, el: 62 });
          const summary = (v, p) => {
            S.plan = { v: { ...v }, p };
            api.status(`<span class="mc__coords">${p.lines} lines · ${p.photos} photos · ${v.alt} m · ${Math.round(v.ov * 100)} % · ${(p.area).toFixed(2)} ha</span>`);
          };
          w.onChange = summary;
          summary(w.v, w.plan);
          api.done('Plan ready. Adjust it, or Finish to fly it.');
          return true;
        }
        return false;
      },

      tap(hit, step, api) {
        if (!hit) return;
        if (step.id === 'unfold') { const k = armOf(hit.object); if (k) S.unfold?.(k); }
        if (step.id === 'power') { const s = batOf(hit.object); if (s) S.slide?.(s); }
      },

      update(dt, step, api) {
        S.clock += dt;
        const sp = ctx.reduced ? 100 : 1;
        // arms, then the blades, ease toward their goals
        let moved = false;
        for (const k of ARMS) {
          if (S.arm[k] !== S.armGoal[k]) { S.arm[k] = S.armGoal[k] < S.arm[k] ? Math.max(S.armGoal[k], S.arm[k] - dt * 1.8 * sp) : Math.min(S.armGoal[k], S.arm[k] + dt * 1.8 * sp); moved = true; }
        }
        if (S.blade !== S.bladeGoal && ARMS.every((k) => S.arm[k] === 0)) { S.blade = Math.max(S.bladeGoal, S.blade - dt * 1.4 * sp); moved = true; }
        if (moved) applyFold();
        if (step.id === 'unfold' && !S.done.unfold && S.blade === 0 && ARMS.every((k) => S.arm[k] === 0)) {
          S.done.unfold = true; api.done('All four arms locked; props unfolded.');
        }
        if (S.mapperGoal != null && S.mapperV !== S.mapperGoal) {
          S.mapperV = S.mapperGoal > S.mapperV ? Math.min(S.mapperGoal, S.mapperV + dt * 2.5 * sp) : Math.max(S.mapperGoal, S.mapperV - dt * 2.5 * sp);
          applyMapper(); api.widget?.set?.(S.mapperV);
          if (step.id === 'payload' && S.mapperV === 1 && !S.done.payload) { S.done.payload = true; api.done('Click. The Mapper+ is locked on the Skyport.'); }
        }
        let bm = false;
        for (const s of ['l', 'r']) if (S.bat[s] !== S.batGoal[s]) { S.bat[s] = Math.max(S.batGoal[s], S.bat[s] - dt * 2.2 * sp); bm = true; }
        if (bm) applyBatteries();
        if (S.powerT >= 0 && S.powerT < 1) {
          // power-on check: the arm lights flicker on one by one
          S.powerT = Math.min(1, S.powerT + dt / (ctx.reduced ? 0.01 : 1.4));
          const lv = {};
          ARMS.forEach((k, i) => { const t = clamp01((S.powerT - i * 0.18) / 0.3); lv[k] = t >= 1 ? 1 : (Math.sin(S.clock * 40 + i) > 0 ? t : 0); });
          root.setLights(S.powerT > 0.1);
          inst.leds(lv);
          if (S.powerT >= 1 && step.id === 'power' && !S.done.power) { S.done.power = true; api.done('Both batteries in. Systems check OK.'); }
        }
        if (step.id === 'rtk') {
          S.rtk = S.rtkForce ? 1 : Math.min(1, api.stepTime() / (step.seconds || 5));
          api.widget?.set(S.rtk);
          studio.rings.update(top, Math.min(1, S.rtk * 3) * (1 - Math.max(0, S.rtk - 0.92) * 6), S.clock, orbit.camera.position.y);
          if (S.rtk >= 1 && !S.done.rtk) {
            S.done.rtk = true;
            const wd = api.widget; S.fix = { sats: wd.sats, h: wd.h, v: wd.v };
            api.done(`RTK FIX: ${wd.sats} satellites, H ${(wd.h * 100).toFixed(1)} cm.`);
          }
        } else if (studio.rings.group.visible) studio.rings.update(null, 0, 0);
      },

      act(step, w, api) {
        if (step.id === 'unfold') { for (const k of ARMS) S.unfold?.(k); }
        else if (step.id === 'payload') { S.mapperGoal = 1; w.locked = true; }
        else if (step.id === 'power') { S.slide?.('l'); S.slide?.('r'); }
        else if (step.id === 'compass') { w.add(360 - Math.abs(w.turned) + 0.5); }
        else if (step.id === 'rtk') S.rtkForce = true;
      },

      leave(step) {
        if (step.id === 'rtk') studio.rings.update(null, 0, 0);
        if (step.id === 'payload') tags.hide('skyport');
      },

      result() {
        const fix = S.fix || { sats: 32, h: 0.008 };
        const pl = S.plan;
        const rows = [
          ['Aircraft', 'M350 RTK + YellowScan Mapper+'],
          ['Pre-flight', 'Arms, payload, batteries, compass: OK'],
          ['RTK', `FIX · ${fix.sats} sats · H ${(fix.h * 100).toFixed(1)} cm`],
        ];
        let ctas = [];
        if (pl) {
          const mm = Math.floor(pl.p.time / 60), ss = Math.round(pl.p.time % 60);
          rows.push(['Grid', `${pl.p.lines} lines · ${pl.p.photos} photos · ${pl.v.alt} m · ${Math.round(pl.v.ov * 100)} %`]);
          rows.push(['GSD · time', `${pl.p.gsd.toFixed(2)} cm/px · ${mm}:${String(ss).padStart(2, '0')} on the lines`]);
          ctas = [{ label: 'Fly it for real', href: flyHref(pl.v), primary: true }];
        }
        return { title: 'Ready to fly', rows, note: 'Fly mode opens with this grid loaded: take off, open the map and fly the mission.', ctas };
      },

      reset() {
        S.arm = { fl: 0, fr: 0, rl: 0, rr: 0 }; S.armGoal = { ...S.arm }; S.blade = 0; S.bladeGoal = 0; applyFold();
        S.mapperV = 1; S.mapperGoal = null; applyMapper();
        S.bat = { l: 0, r: 0 }; S.batGoal = { l: 0, r: 0 }; applyBatteries();
        S.powerT = -1; lights(1);
        studio.holder.rotation.y = 0; S.yaw = 0;
        studio.rings.update(null, 0, 0);
        studio.setProps(ctx.gear.diorama);
        tags.clear();
        S.done = {}; S.fix = null; S.cur = null;
        studio.contact.dirty = true;
      },

      /** Mission start: out of the case: arms and props folded, batteries out, payload off, power off. */
      begin() {
        S.done = {}; S.plan = null; S.fix = null;
        S.arm = { fl: 1, fr: 1, rl: 1, rr: 1 }; S.armGoal = { ...S.arm }; S.blade = 1; S.bladeGoal = 1; applyFold();
        S.mapperV = 0; S.mapperGoal = null; applyMapper();
        S.bat = { l: 1, r: 1 }; S.batGoal = { l: 1, r: 1 }; applyBatteries();
        S.powerT = -1; lights(0);
        studio.holder.rotation.y = 0;
      },

      dispose() { this.reset(); },
    };
    return rig;
  },
};
