// Underhill v2 — gear rig: the robotic total station (the existing total-station model, styled like
// an S7). Level it with two foot-screw dials (the tribrach tilts, exaggerated, with the electronic
// bubble), sight BS-02 and then PR-1 through a telescope picture-in-picture (drag to turn the alidade
// and tilt the telescope: setPose({ alidadeYaw, telescopeTilt })), fire the EDM (effects.js LaserShot),
// compute the point, then Autolock: the prism pole walks a stake line and the instrument tracks it.
import * as THREE from 'three';
import { CP01, SPOTS, PRISM_GLASS_Y, BS_GLASS_Y, toSurvey } from '../studio.js';

const DEG = Math.PI / 180;
const TRUNNION_Y = 1.102;                       // the model's tilt-axis height (TOTAL_STATION_PARAMS)
const HR = PRISM_GLASS_Y;                       // the prism height on the pole (to the glass centre)
const LEVEL0 = { x: 130, y: -95 };              // arc-seconds before levelling
const EXAG = (40 / 3600) * DEG;                 // the tribrach's visible tilt per arc-second (×40)
const RAW0 = 57.296;                            // the horizontal circle's arbitrary zero before the backsight
const LINE = [new THREE.Vector3(SPOTS.prism[0], 0, SPOTS.prism[1]), new THREE.Vector3(-0.5, 0, -4.15)];
const STAKES = 6;

const norm360 = (a) => ((a % 360) + 360) % 360;
export const dms = (deg) => {
  const s = Math.round(norm360(deg) * 3600);
  const d = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return `${d}°${String(m).padStart(2, '0')}′${String(x).padStart(2, '0')}″`;
};
const fmtCoord = (v) => { const [i, f] = v.toFixed(3).split('.'); return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}.${f}`; };
const bearingOf = (dx, dz) => norm360(Math.atan2(dx, -dz) / DEG);    // clockwise from north (−Z)

export default {
  async create(ctx) {
    const { studio, entry, orbit, tags, pip } = ctx;
    const inst = entry.inst, root = inst.root, ud = root.userData;
    const P = studio.p;
    const tribrach = root.getObjectByName('tribrach');
    const screws = ['A', 'B', 'C'].map((l) => root.getObjectByName(`levelScrew${l}`));
    const socket = ud.sockets.lineOfSight;
    const laser = studio.laser;
    const T = new THREE.Vector3(0, TRUNNION_Y, 0);
    const tmp = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

    const aimOf = (g) => { const d = g.clone().sub(T); return { yaw: Math.atan2(d.x, d.z) / DEG, tilt: Math.atan2(d.y, Math.hypot(d.x, d.z)) / DEG, d }; };
    const BS = studio.backsightGlass(new THREE.Vector3());
    const PR = studio.prismGlass(new THREE.Vector3());
    const bsAz = bearingOf(BS.x, BS.z);

    const S = {
      level: { ...LEVEL0 }, yaw: 28, tilt: 0, goalYaw: 28, goalTilt: 0, bsSet: false, meas: null, point: null,
      edm: 0, beam: 0, lit: 0, clock: 0, track: -1, stakes: 0, cur: null, target: null, locked: false,
    };
    const pose = () => ud.setPose({ alidadeYaw: S.yaw, telescopeTilt: THREE.MathUtils.clamp(S.tilt, -30, 30) });
    const applyLevel = () => {
      if (tribrach) { tribrach.rotation.z = -S.level.x * EXAG; tribrach.rotation.x = S.level.y * EXAG; }
      studio.contact.dirty = true;
    };
    /** The telescope's pointing error to a world point, in degrees. */
    const errTo = (g) => {
      socket.updateWorldMatrix(true, false);
      const o = socket.getWorldPosition(new THREE.Vector3());
      const dir = new THREE.Vector3(0, 0, 1).transformDirection(socket.matrixWorld);
      return dir.angleTo(g.clone().sub(o)) / DEG;
    };
    const circleReading = () => (S.bsSet ? norm360(bsAz + (bearingOf(Math.sin(S.yaw * DEG), Math.cos(S.yaw * DEG)) - bearingOf(BS.x - 0, BS.z - 0))) : norm360(RAW0 + bearingOf(Math.sin(S.yaw * DEG), Math.cos(S.yaw * DEG))));
    const zenith = () => 90 - S.tilt;
    const syncPip = () => {
      socket.updateWorldMatrix(true, false);
      socket.getWorldPosition(studio.pipCam.position);
      socket.getWorldQuaternion(tmpQ);
      studio.pipCam.quaternion.copy(tmpQ).multiply(flip);
      studio.pipCam.updateMatrixWorld();
    };
    const aimRows = (w, label) => {
      const e = S.target ? errTo(S.target) : 0;
      w.rows([
        ['HA', dms(circleReading())],
        ['VA', dms(zenith())],
        [label, e < 0.02 ? 'On' : `${e >= 1 ? e.toFixed(1) + '°' : (e * 60).toFixed(1) + '′'}`, e < 0.12 ? 'is-ok' : ''],
      ]);
      w.enable(e < 0.12);
      pip.setState?.(e < 0.12 ? 'on' : e < 1.2 ? 'near' : 'far');
      return e;
    };
    const aimCapture = (w) => (ev) => {
      if (ev.type !== 'move') return true;
      const e = S.target ? errTo(S.target) : 10;
      const k = e < 0.6 ? 0.025 : e < 4 ? 0.07 : 0.22;
      S.yaw -= ev.dx * k;
      S.tilt = THREE.MathUtils.clamp(S.tilt - ev.dy * k, -30, 30);
      pose(); syncPip(); aimRows(w, S.cur === 'backsight' ? 'To BS-02' : 'To PR-1');
      return true;
    };

    const rig = {
      widgetOptions(step) {
        if (step.id === 'backsight') return { button: 'Set backsight' };
        if (step.id === 'foresight') return { button: 'Lock on PR-1' };
        if (step.id === 'edm') return { label: 'Hold to measure' };
        return {};
      },

      enter(step, w, api) {
        S.cur = step.id;
        pip.show(false);
        if (step.id === 'level') {
          studio.setProps({ backsight: true });
          orbit.flyTo({ target: [0, 0.98, 0], dist: orbit.home.dist * 0.5, az: 36, el: 22 });
          w.set(S.level.x, S.level.y);
          w.onChange = (x, y) => {
            S.level.x = x; S.level.y = y; applyLevel();
            if (screws[0]) { screws[0].rotation.y = w.turnA * DEG * 3; screws[1].rotation.y = -w.turnA * DEG * 3; screws[2].rotation.y = w.turnC * DEG * 3; }
          };
          w.onRelease = (x, y) => {
            if (Math.abs(x) <= 10 && Math.abs(y) <= 10) { S.level = { x: 0, y: 0 }; w.set(0, 0); applyLevel(); api.done(`Level: X ${Math.abs(Math.round(x))}″, Y ${Math.abs(Math.round(y))}″ before the compensator.`); }
          };
          return true;
        }
        if (step.id === 'backsight' || step.id === 'foresight') {
          const bs = step.id === 'backsight';
          studio.setProps({ backsight: true });
          S.target = bs ? BS : PR;
          const d = S.target.clone().setY(0).normalize();
          orbit.flyTo({ target: [d.x * 0.6, 1.0, d.z * 0.6], dist: orbit.home.dist * 0.95, az: Math.atan2(-d.x, -d.z) / DEG + (bs ? 14 : -14), el: 12 });
          tags.show(bs ? 'bs' : 'pr', bs ? BS.clone().setY(BS_GLASS_Y + 0.22) : PR.clone().setY(PRISM_GLASS_Y + 0.2), bs ? 'BS-02' : 'PR-1', bs ? 'Backsight · known' : '360 prism');
          pip.show(true, bs ? 'BS-02' : 'PR-1');
          syncPip(); aimRows(w, bs ? 'To BS-02' : 'To PR-1');
          api.setCapture(aimCapture(w));
          w.onButton = () => {
            if (errTo(S.target) >= 0.12) return;
            if (bs) { S.bsSet = true; api.status(`<span class="mc__coords">BS-02 azimuth ${dms(bsAz)} from coordinates</span>`); api.done(`Backsight set on BS-02 · Az ${dms(bsAz)}.`); }
            else { S.locked = true; api.done('Locked on PR-1.'); }
            w.enable(false);
          };
          return true;
        }
        if (step.id === 'edm') {
          studio.setProps({ backsight: true });
          S.target = PR;
          const a = aimOf(PR); S.yaw = a.yaw; S.tilt = a.tilt; pose();
          pip.show(true, 'PR-1'); pip.setState?.('on'); syncPip();
          orbit.flyTo({ target: [1.2, 1.0, -1.35], dist: orbit.home.dist * 1.55, az: 52, el: 15 });
          tags.show('pr', PR.clone().setY(PRISM_GLASS_Y + 0.2), 'PR-1', '360 prism');
          socket.updateWorldMatrix(true, false);
          laser.placeAt(PR, 0, socket.getWorldPosition(new THREE.Vector3()));
          laser.spark.position.set(0, 0, 0);
          S.edm = 0; S.lit = 0; S.beam = 0;
          w.onProgress = (k, holding) => { S.edm = k; S.beam = holding || k > 0 ? 1 : 0; };
          w.onDone = () => {
            const d = PR.clone().sub(T);
            const sd = d.length(), va = 90 - Math.atan2(d.y, Math.hypot(d.x, d.z)) / DEG, ha = bearingOf(d.x, d.z);
            S.meas = { sd, va, ha };
            api.status(`<span class="mc__coords">SD ${sd.toFixed(3)} m · HA ${dms(ha)} · VA ${dms(va)}</span>`);
            api.done(`Measured PR-1: ${sd.toFixed(3)} m.`);
            S.lit = 1;
          };
          return true;
        }
        if (step.id === 'compute') {
          studio.setProps({ backsight: true });
          orbit.flyTo({ target: [1.2, 0.9, -1.35], dist: orbit.home.dist * 1.55, az: 52, el: 18 });
          const m = S.meas || (() => { const d = PR.clone().sub(T); return { sd: d.length(), va: 90 - Math.atan2(d.y, Math.hypot(d.x, d.z)) / DEG, ha: bearingOf(d.x, d.z) }; })();
          const hd = m.sd * Math.sin(m.va * DEG), dv = m.sd * Math.cos(m.va * DEG);
          const dE = hd * Math.sin(m.ha * DEG), dN = hd * Math.cos(m.ha * DEG);
          const pt = { E: CP01.E + dE, N: CP01.N + dN, El: CP01.El + TRUNNION_Y + dv - HR };
          S.point = pt;
          w.rows([
            ['HD = SD·sin VA', `${hd.toFixed(3)} m`],
            ['ΔE, ΔN', `${dE >= 0 ? '+' : '−'}${Math.abs(dE).toFixed(3)}, ${dN >= 0 ? '+' : '−'}${Math.abs(dN).toFixed(3)}`],
            ['ΔEl = SD·cos VA + HI − HR', `${(dv + TRUNNION_Y - HR).toFixed(3)} m`],
            ['PR-1 E', fmtCoord(pt.E), 'is-ok'],
            ['PR-1 N', fmtCoord(pt.N), 'is-ok'],
            ['PR-1 El', fmtCoord(pt.El), 'is-ok'],
          ]);
          w.onButton = () => { api.done(`PR-1 stored: E ${fmtCoord(pt.E)}, N ${fmtCoord(pt.N)}.`); w.enable(false); };
          return true;
        }
        if (step.id === 'robotic') {
          studio.setProps({ backsight: true, stakeLine: true, stubs: true });
          S.track = -1; S.stakes = 0;
          for (const s of P.stubs) s.visible = false;
          P.stakeLine.geometry.setDrawRange(0, 0);
          orbit.flyTo({ target: [1.0, 0.75, -2.1], dist: orbit.home.dist * 1.85, az: 32, el: 30 });
          pip.show(true, 'PR-1'); pip.setState?.('on');
          tags.show('line', LINE[1].clone().setY(0.4), 'Line A', 'Stake line');
          w.onButton = () => { if (S.track < 0) { S.track = 0; w.enable(false); w.label('Tracking…'); } };
          return true;
        }
        return false;
      },

      update(dt, step, api) {
        S.clock += dt;
        const w = api.widget;
        if (step.id === 'backsight' || step.id === 'foresight') { syncPip(); }
        if (step.id === 'edm') {
          syncPip();
          if (S.lit > 0) S.lit = Math.max(0.35, S.lit - dt * 0.8);
          const travel = THREE.MathUtils.clamp(S.edm * 1.25, 0, 1);
          laser.update(socket, travel, S.edm >= 1 ? S.lit : 0, 1, S.beam);
        }
        if (step.id === 'robotic') {
          syncPip();
          if (S.track >= 0 && S.track < 1) {
            S.track = Math.min(1, S.track + dt / (ctx.reduced ? 2 : (step.seconds || 8)));
            const p = LINE[0].clone().lerp(LINE[1], S.track);
            const bob = ctx.reduced ? 0 : Math.abs(Math.sin(S.clock * 6)) * 0.02;
            P.prism.position.set(p.x, bob, p.z);
            const glass = new THREE.Vector3(p.x, PRISM_GLASS_Y + bob, p.z);
            // Autolock: the alidade and the telescope follow the prism with a small lag
            const a = aimOf(glass);
            let dy = a.yaw - S.yaw; while (dy > 180) dy -= 360; while (dy < -180) dy += 360;
            const k = 1 - Math.exp(-dt * 18);
            S.yaw += dy * k; S.tilt += (a.tilt - S.tilt) * k; pose();
            socket.updateWorldMatrix(true, false);
            laser.placeAt(glass, 0, socket.getWorldPosition(tmp));
            laser.spark.position.set(0, 0, 0);
            laser.update(socket, 1, 0.25, 1, 0.3);
            // a stake every 1 / STAKES of the line; the line draws behind the pole
            const n = Math.min(STAKES, Math.floor(S.track * STAKES + 1e-6));
            while (S.stakes < n) {
              const sp = LINE[0].clone().lerp(LINE[1], (S.stakes + 1) / STAKES);
              const st = P.stubs[S.stakes]; st.visible = true; st.position.set(sp.x + 0.06, 0, sp.z + 0.04); st.rotation.y = S.stakes * 0.7;
              S.stakes++;
            }
            const pos = P.stakeLine.geometry.attributes.position;
            const segs = 24;
            const upto = Math.max(2, Math.round(S.track * segs) + 1);
            for (let i = 0; i < upto; i++) { const q = LINE[0].clone().lerp(LINE[1], Math.min(S.track, i / segs)); pos.setXYZ(i, q.x, 0.012, q.z); }
            pos.needsUpdate = true;
            P.stakeLine.geometry.setDrawRange(0, upto);
            P.stakeLine.computeLineDistances();
            studio.contact.dirty = true;
            w?.rows([['Autolock', 'On · tracking', 'is-ok'], ['Stakes', `${S.stakes} of ${STAKES}`], ['HA', dms(circleReading())]]);
            if (S.track >= 1) {
              laser.update(null, 0, 0, 0, 0);
              api.done(`Tracked the whole line: ${STAKES} stakes set.`);
            }
          }
        }
      },

      act(step, w, api) {
        if (step.id === 'level') { w.set(4, -3); S.level = { x: 4, y: -3 }; applyLevel(); w.onRelease(4, -3); }
        else if (step.id === 'backsight' || step.id === 'foresight') {
          const a = aimOf(S.target); S.yaw = a.yaw; S.tilt = a.tilt; pose(); syncPip(); aimRows(w, ''); w.onButton();
        } else if (step.id === 'edm') { w.finish(); }
        else if (step.id === 'compute') { w.onButton(); }
        else if (step.id === 'robotic') { if (S.track < 0) w.onButton(); S.track = Math.max(S.track, 0.999); }
      },

      leave(step) {
        pip.show(false);
        if (step.id === 'edm') laser.update(null, 0, 0, 0, 0);
        if (step.id === 'backsight') tags.hide('bs');
      },

      result() {
        const m = S.meas, pt = S.point;
        return {
          title: 'Point measured, line staked',
          rows: [
            ['Station', `CP-01 · HI ${TRUNNION_Y.toFixed(3)} m · level`],
            ['Backsight', `BS-02 · Az ${dms(bsAz)}`],
            ['PR-1 measured', m ? `SD ${m.sd.toFixed(3)} m · HA ${dms(m.ha)} · VA ${dms(m.va)}` : '—'],
            ['PR-1', pt ? `E ${fmtCoord(pt.E)} · N ${fmtCoord(pt.N)} · El ${fmtCoord(pt.El)}` : '—'],
            ['Robotic', `${S.stakes} stakes on line A, one person`],
          ],
          note: 'Before packing up the crew re-checks the backsight and logs the closure.',
        };
      },

      reset() {
        pip.show(false);
        laser.update(null, 0, 0, 0, 0);
        S.level = { ...LEVEL0 }; S.bsSet = false; S.meas = null; S.point = null; S.track = -1; S.stakes = 0; S.locked = false; S.cur = null;
        if (tribrach) tribrach.rotation.set(0, 0, 0);
        for (const s of screws) if (s) s.rotation.y = 0;
        S.yaw = 28; S.tilt = 0; pose();
        P.prism.position.set(SPOTS.prism[0], 0, SPOTS.prism[1]);
        for (const s of P.stubs) s.visible = false;
        P.stakeLine.geometry.setDrawRange(0, 0);
        studio.setProps(ctx.gear.diorama);
        tags.clear();
        studio.contact.dirty = true;
      },

      /** Mission start: the instrument off level, pointing at nothing in particular. */
      begin() {
        S.level = { ...LEVEL0 }; applyLevel();
        S.yaw = 96; S.tilt = -4; pose();
        S.bsSet = false;
      },

      dispose() { this.reset(); },
    };
    return rig;
  },
};
