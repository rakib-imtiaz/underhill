// Adapter: Drone, Build B (threejs-object-sculptor), the default drone.
// Model: ../../models/drone-sculptor/drone.js, a copy of DRONE/threejs-object-sculptor/src/drone.js
// (since 2026-10-13 its motor pods are flipped: see SCULPT_LOG). An enterprise survey quad: square
// fuselage, four folding carbon arms with fin (front) and dome (rear) housings hanging under the arm
// tips, motors and 21-inch two-blade folding props on top of them, two splayed legs with T skids, a gimbal camera under the belly
// and a second camera on a damper mount on top.
import * as THREE from 'three';
import { createSurveyDrone, DRONE_DIMENSIONS } from '../../models/drone-sculptor/drone.js';
import { ruleOf, makeRotorDisc, makeMotorRing, disposeOwned } from './common.js';

const ARM_IDS = ['fl', 'fr', 'rl', 'rr'];
const DEG = Math.PI / 180;
const ROTOR_RAD_S = 30;   // flight speed of the rotors (the blur discs carry the rest)
// Rotor states, by speed01 (the host eases it over about a second): 0 = parked (blades still, in their
// rest pose, no disc); blades turning on their own up to BLADES_UNTIL, then the blur disc alone (blades
// drawn at one angle per frame strobe like a wagon wheel). On the way down, below SETTLE_AT each rotor
// brakes evenly onto its park angle, so a stopped prop always rests in the same clean pose.
const BLADES_UNTIL = 0.34, SETTLE_AT = 0.3;
const discAlpha = (s) => { const t = Math.min(1, Math.max(0, (s - 0.12) / 0.3)); return 0.42 * t * t * (3 - 2 * t); };

/**
 * A rigid propeller blade with a real airfoil: a closed, cambered NACA-style section lofted from root
 * to tip (16 % thick at the root, 7 % at the tip), chord 28 → 50 → 22 mm with a rounded tip, 14° → 5°
 * of twist. Span along +X from r0 to R; chord along Z; UVs follow the model's blade atlas (u = span,
 * v = top 0..0.5 / bottom 0.5..1). `mirror` = -1 for the counter-rotating pair.
 */
function airfoilBlade(R, mirror = 1) {
  const NS = 30, NC = 12, r0 = 0.014;
  const chordAt = (t) => (t < 0.25 ? 0.028 + 0.022 * Math.sin((t / 0.25) * Math.PI / 2) : 0.022 + 0.028 * Math.pow(1 - (t - 0.25) / 0.75, 0.8));
  const thickAt = (t) => 0.16 - 0.09 * t;
  const twistAt = (t) => (14 - 9 * t) * Math.PI / 180;
  const yt = (x, th) => 5 * th * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const pos = [], uv = [], idx = [];
  const ring = NC * 2;
  for (let s = 0; s <= NS; s++) {
    const t = s / NS;
    const tipRound = t > 0.92 ? Math.sqrt(Math.max(0.0025, 1 - ((t - 0.92) / 0.08) ** 2)) : 1;
    const c = chordAt(t) * tipRound, th = thickAt(t), tw = twistAt(t);
    const X = r0 + (R - r0) * t;
    const sweep = -0.004 * t;
    for (let k = 0; k < ring; k++) {
      // around the section: upper surface leading → trailing edge, then lower back to the leading edge
      const up = k < NC;
      const q = up ? k / (NC - 1) : 1 - (k - NC) / (NC - 1);
      const xc = 0.5 - 0.5 * Math.cos(q * Math.PI);          // cosine spacing: fine at the edges
      const camber = 0.025 * 4 * xc * (1 - xc);
      const y = (camber + (up ? 1 : -1) * yt(xc, th)) * c;
      const z = (xc - 0.3) * c + sweep;
      // twist about the span axis (leading edge up)
      const yy = y * Math.cos(tw) - z * Math.sin(tw);
      const zz = (y * Math.sin(tw) + z * Math.cos(tw)) * mirror;
      pos.push(X, yy, zz);
      uv.push(t, up ? q * 0.5 : 0.5 + (1 - q) * 0.5);
    }
  }
  for (let s = 0; s < NS; s++) {
    for (let k = 0; k < ring; k++) {
      const a = s * ring + k, b = s * ring + ((k + 1) % ring), c2 = a + ring, d2 = b + ring;
      if (mirror > 0) idx.push(a, c2, b, b, c2, d2); else idx.push(a, b, c2, b, d2, c2);
    }
  }
  // caps: root and tip
  const capRoot = pos.length / 3; pos.push(r0, 0, 0); uv.push(0, 0.25);
  const capTip = pos.length / 3; pos.push(R + 0.001, 0, 0); uv.push(1, 0.25);
  for (let k = 0; k < ring; k++) {
    const a = k, b = (k + 1) % ring, ta = NS * ring + k, tb = NS * ring + ((k + 1) % ring);
    if (mirror > 0) { idx.push(capRoot, a, b); idx.push(capTip, tb, ta); } else { idx.push(capRoot, b, a); idx.push(capTip, ta, tb); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// The disassembly, as the chapter's caption tells it: the top camera comes off first (it sits on
// the top plate, which could not lift through it), then the covers and the flight-controller stack,
// the batteries, each arm outward (arm, sleeve, pod, fin, prop, motor), the landing gear, and the
// gimbal camera last, from the bottom up. Within a stage the part that travels farthest leaves first
// (js/explode.js). Order checked with the explode checker (js/debug.js).
const STAGES = [
  [/^top-camera-head/, 0],
  [/^top-damper-spider/, 1],
  [/^top-payload/, 2],
  [/^body-top-plate/, 3],
  [/^body-(front|rear)-cover/, 4],
  [/^body-shell/, 4],
  [/^body-electronics/, 5],
  [/^body-battery-/, 6],
  [/^arm-(fl|fr|rl|rr)(:|$)/, 7],
  [/^arm-(fl|fr|rl|rr)-sleeve/, 8],
  [/^motor-pod-/, 9],
  [/^mast-/, 10],
  [/^rotor-/, 11],
  [/^motor-(fl|fr|rl|rr)(:|$)/, 12],
  [/^motor-(fl|fr|rl|rr)-stator/, 13],
  [/^leg-/, 14],
  [/^skid-/, 15],
  [/^gimbal-camera/, 16],
  [/^gimbal-connector/, 17],
  [/^gimbal-damper-frame/, 18],
  [/^gimbal-payload/, 19],
];

export default {
  key: 'droneB', object: 'drone', build: 'B',
  async create({ mobile, q }) {
    const low = q ? q.tier !== 'high' : mobile;   // below the high tier (or, without a tier, on phones)
    const root = createSurveyDrone();
    const rt = root.userData.sculptRuntime;
    root.setLights(true);
    // low detail: the 9 instanced screw sets only show once the model is taken apart (they back out of
    // their parts), so they are hidden at rest there; the electronics stack is inside the closed
    // fuselage and is hidden at rest everywhere (it only shows when exploded)
    const fasteners = rt.fasteners;
    const electronics = rt.nodes['body-electronics'];
    // the model has no rotor blur: a translucent disc per rotor fades in with speed. It hangs on the
    // motor bell (which does not turn), at the rotor's blade plane: a still disc whose geometry and
    // opacity are the same every frame at flight speed (a disc turning with the rotor shimmers at its rim)
    const discs = [];
    for (const id of ARM_IDS) {
      const d = makeRotorDisc(DRONE_DIMENSIONS.propRadius, 0.02);
      const rotorNode = rt.nodes['rotor-' + id];
      d.position.copy(rotorNode.position);   // the blade plane (pivots sit at rotor y = 0)
      d.visible = false;                     // until the rotors turn
      d.userData.outlineSkip = true;         // never part of the outline (it comes and goes with speed)
      rotorNode.parent.add(d);
      discs.push({ d, rotorNode });
    }
    // Per-arm lights, so they can come on one at a time in the field pre-flight: the front fins' nav
    // windows get their own copy of the shared white LED material, and every motor gets a light ring
    // round its base flange (it rides on the motor, which does not spin, so a plain ring is fine)
    const arms = {};
    for (const id of ARM_IDS) {
      const lens = root.getObjectByName(`mast-${id}:led-white`);
      let mat = null;
      if (lens) { mat = lens.material.clone(); mat.userData.showcaseOwned = true; lens.material = mat; }
      const ring = makeMotorRing(0.0222, 0.004);
      ring.position.y = -0.0335;
      rt.nodes[`motor-${id}-stator`].add(ring);   // seated on the pod with the base flange (same origin as the bell)
      arms[id] = { mat, base: mat?.emissiveIntensity ?? 0, ring };
    }
    // Propellers: matte black composite with a thin, subtle tip marking (the model's livery paints a
    // broad white tip band that read as a glowing streak under the key light), a slight droop at rest,
    // and parked at a natural three-quarter angle to the arm (never edge-on to the hero cameras).
    let propMat = null;
    root.traverse((o) => { if (!propMat && o.material?.name === 'prop-carbon') propMat = o.material; });
    if (propMat?.map?.image?.data && !propMat.userData.showcaseTips) {
      const { data, width: BW, height: BH } = propMat.map.image;
      // the whole blade is matte black composite (the model's carbon weave read as a light grey
      // check under the key light), with one thin grey band near the tip
      for (let x = 0; x < BW; x++) {
        const t = x / BW;
        const mark = t > 0.915 && t < 0.93;
        for (let y = 0; y < BH; y++) {
          const i = (y * BW + x) * 4;
          const v = mark ? 110 : 30 + ((x * 7 + y * 13) % 5);
          data[i] = data[i + 1] = v; data[i + 2] = v + 2;
        }
      }
      propMat.map.needsUpdate = true;
      // matte: an even, high roughness (the weave's roughness and bump maps stay bound, flattened,
      // so the program is unchanged)
      const rough = propMat.roughnessMap?.image?.data;
      if (rough) { const st = rough.length / (propMat.roughnessMap.image.width * propMat.roughnessMap.image.height); for (let i = 0; i < rough.length; i += st) for (let c = 0; c < Math.min(3, st); c++) rough[i + c] = 235; propMat.roughnessMap.needsUpdate = true; }
      propMat.roughness = 1.0; propMat.metalness = 0.0;
      propMat.bumpScale = 0.15;
      propMat.userData.showcaseTips = true;
    }
    // the blades themselves: a rigid airfoil (the model's own is a thin cambered sheet that read as a
    // flat fin), 2° of droop at rest, and both blades of each motor parked across the view (along the
    // drone's left-right axis, ±15° mirrored per motor), so each motor clearly shows two opposite blades
    const bladeGeo = new Map();
    const bladesOf = [];
    for (const r of rt.rotors || []) {
      for (const pv of r.blades) {
        pv.userData.droop = -2 * DEG;   // the model's applyRotorPose sets the whole Euler with it
        pv.rotation.z = -2 * DEG;
        pv.traverse((o) => {
          if (!o.isMesh || o.material !== propMat) return;
          o.geometry.computeBoundingBox();
          const R = o.geometry.boundingBox.max.x;
          const key = `${R.toFixed(4)}|${r.dir}`;
          if (!bladeGeo.has(key)) bladeGeo.set(key, airfoilBlade(R, r.dir));
          o.geometry.dispose();
          o.geometry = bladeGeo.get(key);
          bladesOf.push(o);
        });
      }
      const arm = (rt.arms || []).find((a) => a.key === r.key);
      const armYaw = arm ? arm.node.rotation.y : 0;
      const sx = arm?.sx ?? 1, sz = arm?.sz ?? 1;
      r.angle = -armYaw + sx * sz * 15 * DEG;
      r.park = r.angle;   // the rest pose a stopping rotor brakes onto (a two-blade prop repeats every π)
      r.w = 0; r.settle = false;
      r.node.rotation.y = r.angle;
    }
    // The outline's stand-in for each rotor (outline.js): the parked blades' box corners, in the motor's
    // axes and relative to the rotor's origin (so they ride the rotor when the explode lifts it off).
    // The framing and the cards read the props where they rest, so a turning rotor (or its blades
    // hiding at speed) never moves the outline. Used while the arms are out; folded, the real blades count.
    root.updateMatrixWorld(true);
    for (const r of rt.rotors || []) {
      const inv = r.node.parent.matrixWorld.clone().invert(), box = new THREE.Box3(), p = new THREE.Vector3(), pts = [];
      r.node.traverse((o) => {
        if (!o.isMesh || o.userData.showcaseOwned) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        box.copy(o.geometry.boundingBox);
        for (let i = 0; i < 8; i++) pts.push(p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(o.matrixWorld).applyMatrix4(inv).sub(r.node.position).clone());
      });
      r.standIn = pts;
      r.node.userData.outlinePts = pts;
    }
    // Specular anti-aliasing: the lens domes, the thermal window and the laser window were near-mirrors
    // (clearcoat roughness 0.02–0.05, the laser's 0). A key light's highlight on them is smaller than a
    // pixel: it lands on a pixel centre in one frame and not the next, a one-frame flash that the bloom
    // turns into a burst over the whole lens. A slightly broader highlight is pixel-sized and steady.
    // (uniforms only: no program changes)
    const MM = root.userData.materials || {};
    const floorRough = (m, rough, coat) => { if (!m) return; if (rough != null) m.roughness = Math.max(m.roughness, rough); if (coat != null && m.clearcoat > 0) m.clearcoatRoughness = Math.max(m.clearcoatRoughness || 0, coat); };
    floorRough(MM.glass, 0.16, 0.18);
    floorRough(MM.thermal, 0.16, 0.18);
    floorRough(MM.laser, 0.2, 0.22);
    floorRough(MM.chrome, 0.3, null);
    const gCam = rt.nodes['gimbal-camera'];
    let speed = 0, lastSpeed = 0, fold = 0;

    return {
      root,
      explode: (t) => root.setExplode(t),
      /** Called with the staged explode time each frame (the staged explode moves the parts itself). */
      onExplode(t) {
        const open = t > 0.001;
        if (electronics.visible !== open) electronics.visible = open;
        if (low) for (const f of fasteners) if (f.visible !== open) f.visible = open;
      },
      // the model also lifts its whole assembly as it explodes; the staged explode lifts the model
      // itself, only as far as the floor needs, so the model's own lift is held at rest
      // (the chassis screws are held too: they would back out into the gimbal's damper frame, which
      // stays on the airframe)
      freeze: (o) => o.name === 'assembly' || o.name === 'body-chassis:screws',
      stageOf: (o) => ruleOf(STAGES, o.name, 12),
      unitKeyOf: (o) => o.name,
      labels: [
        { id: 'top', text: 'Top cover plate', short: 'Top cover', node: 'body-top-plate', dir: [0.3, 1, 0.5] },
        { id: 'battery', text: 'Hot-swap battery', short: 'Battery', node: 'body-battery-l', dir: [1, 0.3, 0.3] },
        { id: 'fc', text: 'Flight-controller stack', short: 'Controller', node: 'body-electronics', dir: [0.4, 1, 0.6] },
        { id: 'arm', text: 'Folding carbon arm', short: 'Carbon arm', node: 'arm-fl-tube', dir: [0, 1, 0.4] },
        { id: 'fin', text: 'Antenna fin with nav LED', short: 'Antenna fin', node: 'mast-fl', dir: [1, 0.3, 0.6] },
        { id: 'prop', text: 'Folding propeller', short: 'Propeller', node: 'rotor-fl', deep: true, span: 0.6 },
        { id: 'motor', text: 'Brushless motor', short: 'Motor', node: 'motor-fl', dir: [0.6, -0.2, 1] },
        { id: 'gear', text: 'Landing gear', short: 'Landing leg', node: 'leg-l', dir: [1, 0.1, 0.5] },
        { id: 'topcam', text: 'Top camera on damper mount', short: 'Top camera', node: 'top-camera-head', dir: [0.3, 0.3, 1] },
        { id: 'gimbal', text: 'Gimbal camera', short: 'Gimbal cam', node: 'gimbal-camera', dir: [0.3, 0, 1] },
      ],
      sockets: { payload: rt.sockets['gimbal-camera/boresight'] },
      /** Pose, a pure function of the timeline: gimbal in degrees (+ pitch = nose-down), fold 0..1. */
      pose({ gimbalPitch = 0, gimbalYaw = 0, gimbalRoll = 0, fold: f = 0 } = {}) {
        root.setGimbal(gimbalYaw, -gimbalPitch);   // the model's pitch is + up
        gCam.rotation.z = gimbalRoll * DEG;
        fold = f;
        root.setArmFold(f);                        // parks and folds the blades with the arms
        // arms out: the parked props stand in for the rotors in the outline; folded, the blades count
        for (const r of rt.rotors || []) r.node.userData.outlinePts = f < 0.02 ? r.standIn : null;
      },
      /** Per-arm light levels { fl, fr, rl, rr } (0..1), or null for the studio look (nav on, rings dark). */
      leds(levels) {
        for (const id of ARM_IDS) {
          const a = arms[id];
          const nav = levels ? levels[id] : 1, ring = levels ? levels[id] : 0;
          if (a.mat) a.mat.emissiveIntensity = a.base * nav;
          a.ring.material.color.copy(a.ring.userData.lit).multiplyScalar(ring).add(a.ring.userData.dark);
        }
      },
      /**
       * Continuous rotor motion. speed01 = 0 (stopped) … 1 (flight); the host eases it (about a second
       * up or down). dt = 0 holds the rotors where they are (review frames, reduced motion). The model
       * parks its own blades while the arms are folded.
       */
      spin(dt, speed01) {
        const rising = speed01 > lastSpeed + 1e-5;
        speed = speed01; lastSpeed = speed01;
        if (dt > 0 && fold <= 0.001) {
          for (const r of rt.rotors || []) {
            if (rising || speed01 >= SETTLE_AT) {
              // driven: the rotor follows the commanded speed (eased, so a change of mind mid-stop is smooth)
              r.settle = false;
              r.w += (ROTOR_RAD_S * speed01 - r.w) * (1 - Math.exp(-dt / 0.12));
              r.angle += r.dir * r.w * dt;
            } else if (r.w > 1e-4) {
              // stopping: brake evenly onto the next park angle ahead (at least ~35° of runway)
              if (!r.settle) {
                const TAU = Math.PI * 2;
                let rem = ((r.dir * (r.park - r.angle)) % Math.PI + Math.PI) % Math.PI;
                if (rem < 0.6) rem += Math.PI;
                r.remain = rem; r.decel = (r.w * r.w) / (2 * rem); r.settle = true;
                r.angle = ((r.angle % TAU) + TAU) % TAU;
              }
              const w0 = r.w;
              r.w = Math.max(0, r.w - r.decel * dt);
              let step = 0.5 * (w0 + r.w) * dt;
              if (step >= r.remain || r.w <= 1e-4) { step = r.remain; r.w = 0; }
              r.remain -= step;
              r.angle += r.dir * step;
              if (r.w === 0) { r.settle = false; r.angle = r.park + Math.round((r.angle - r.park) / Math.PI) * Math.PI; }
            }
            r.node.rotation.y = r.angle;
          }
        }
        // the disc: still, the same every frame at flight speed; it fades in as the blades get fast
        const a = discAlpha(speed01);
        for (const { d, rotorNode } of discs) {
          d.visible = a > 0.004;
          d.material.opacity = a;
          d.position.copy(rotorNode.position);   // (rides the rotor when the explode lifts it)
        }
        // at speed the blades are a blur: drawing the geometry at one angle per frame strobes (a
        // wagon-wheel flicker), so above a third of flight speed only the disc is drawn
        const solid = speed01 < BLADES_UNTIL;
        for (const b of bladesOf) if (b.visible !== solid) b.visible = solid;
      },
      get spinning() { return speed > 0.02; },
      dispose() {
        disposeOwned(root);
        for (const id of ARM_IDS) arms[id].mat?.dispose();
        root.dispose();
      },
    };
  },
};
