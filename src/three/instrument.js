/* ==========================================================================
   three/instrument.js — procedural survey total station.
   Components are ASSEMBLIES: every manufactured part is a named node at its
   real mounting datum, with modelled interfaces (bolts, clamps, axle, bosses).
   Nothing floats: feet are planted on a monument pad, the telescope is
   seated in a visible axle through both standards, the handle is bossed.
   ========================================================================== */
import * as THREE from "three";
import {
  SceneBase, studioEnv, lightRig, cyclorama, radialSprite,
  clamp01, window01, easeOutBack, fitDistance,
} from "./core.js";

/* ----------------------------------------------------------- material kit
   Created once per scene, shared, NEVER mutated per-part. */
export function makeKit(env) {
  const M = (o) =>
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.9, ...o });
  return {
    paintSatin: M({ color: 0x15171c, metalness: 0.15, roughness: 0.42 }),
    paintBlue: M({ color: 0x0069a3, metalness: 0.35, roughness: 0.38 }),
    steelBrushed: M({ color: 0xb9bec4, metalness: 1.0, roughness: 0.3 }),
    aluAnodised: M({ color: 0x8d949b, metalness: 0.9, roughness: 0.45 }),
    brass: M({ color: 0xb08d4f, metalness: 1.0, roughness: 0.34 }),
    rubber: M({ color: 0x141518, metalness: 0, roughness: 0.92 }),
    glassish: M({ color: 0xdfe8ea, metalness: 0, roughness: 0.08, transparent: true, opacity: 0.35 }),
    lensBlue: new THREE.MeshBasicMaterial({ color: 0x2fa8e0, toneMapped: false }),
    limeGlow: new THREE.MeshBasicMaterial({ color: 0xe7ff89, toneMapped: false }),
    concrete: M({ color: 0x22262d, metalness: 0.05, roughness: 0.95 }),
  };
}

/* small helper */
function mesh(geo, mat, name) {
  const m = new THREE.Mesh(geo, mat);
  if (name) m.name = name;
  return m;
}

/* ---------------------------------------------------------- the assembly
   Parts manifest (every part ships in the box and bolts on with hand tools):
   pad                       concrete monument pad — ground interface
   tripod.headPlate          plate the legs bolt to
   tripod.boltA/B/C          plate bolts (visible fasteners)
   tripod.legA/B/C.upperLeg  leg upper segment, top seated in plate slot
   tripod.legA/B/C.clamp     collar clamp around the upper leg
   tripod.legA/B/C.lowerLeg  telescoping lower segment (slides inside upper)
   tripod.legA/B/C.foot      rubber foot planted on the pad
   tribrach.baseRing         ring the instrument screws down through
   tribrach.screwA/B/C       levelling knobs seated in the ring
   tribrach.topPlate         instrument mounting plate
   alidade.body              main casting
   alidade.standardL/R       uprights carrying the telescope axle
   alidade.axle              transit axle through both standards
   alidade.display           emissive data screen on the body face
   alidade.battery           pack clipped to the right standard
   telescope.barrel          seated in the axle
   telescope.objective       glass + emissive reticle ring
   telescope.eyepiece        rear eyepiece
   telescope.handle          arch handle bossed onto both standards
   ========================================================================== */
export function buildTotalStation(kit) {
  const root = new THREE.Group();
  root.name = "totalStation";
  const parts = {};
  const add = (name, obj, at, parent = root) => {
    obj.name = name;
    obj.position.copy(at);
    parent.add(obj);
    parts[name] = obj;
    return obj;
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  /* ground interface: pad + contact shadow (nothing floats, nothing
     intersects the floor with a razor line) */
  const pad = add("pad", mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.05, 28), kit.concrete), V(0, 0.025, 0)); // PERF: was 40 segs

  const tripod = new THREE.Group();
  tripod.name = "tripod";
  root.add(tripod);

  const headY = 1.02;
  add("tripod.headPlate", mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.05, 3), kit.paintSatin), V(0, headY, 0), tripod);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    add(`tripod.bolt${"ABC"[i]}`,
      mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 6), kit.steelBrushed),
      V(Math.cos(a) * 0.1, headY + 0.032, Math.sin(a) * 0.1), tripod);
  }

  /* legs: pivot group at plate edge, splayed; feet planted on the pad */
  const tilt = 0.3;
  for (let i = 0; i < 3; i++) {
    const L = "ABC"[i];
    const yaw = (i / 3) * Math.PI * 2;
    const legPivot = new THREE.Group();
    legPivot.name = `tripod.leg${L}`;
    legPivot.position.set(0, headY - 0.01, 0);
    legPivot.rotation.y = yaw;
    tripod.add(legPivot);
    parts[`tripod.leg${L}`] = legPivot;

    const splay = new THREE.Group();
    splay.position.set(0.12, 0, 0);      // root seated at plate rim
    splay.rotation.z = tilt;             // splay outward
    legPivot.add(splay);

    const upper = mesh(new THREE.BoxGeometry(0.055, 0.6, 0.032), kit.aluAnodised, `tripod.leg${L}.upperLeg`);
    upper.position.set(0, -0.3, 0);
    splay.add(upper);

    const clamp = mesh(new THREE.BoxGeometry(0.075, 0.06, 0.05), kit.paintBlue, `tripod.leg${L}.clamp`);
    clamp.position.set(0, -0.52, 0);
    splay.add(clamp);

    /* lower leg telescopes INSIDE the upper — the mount is the overlap */
    const lower = mesh(new THREE.BoxGeometry(0.034, 0.52, 0.02), kit.steelBrushed, `tripod.leg${L}.lowerLeg`);
    lower.position.set(0, -0.76, 0);
    splay.add(lower);

    const foot = mesh(new THREE.ConeGeometry(0.035, 0.09, 12), kit.rubber, `tripod.leg${L}.foot`);
    foot.position.set(0, -1.045, 0);
    foot.rotation.x = Math.PI;
    splay.add(foot);
  }

  /* tribrach — the levelling interface between tripod and instrument */
  const tribrach = new THREE.Group();
  tribrach.name = "tribrach";
  root.add(tribrach);
  add("tribrach.baseRing", mesh(new THREE.CylinderGeometry(0.115, 0.125, 0.032, 24), kit.paintSatin), V(0, headY + 0.045, 0), tribrach); // PERF: was 32
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const knob = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.045, 12), kit.steelBrushed, `tribrach.screw${"ABC"[i]}`);
    knob.rotation.z = Math.PI / 2;
    knob.rotation.y = -a;
    add(`tribrach.screw${"ABC"[i]}`, knob, V(Math.cos(a) * 0.115, headY + 0.045, Math.sin(a) * 0.115), tribrach);
  }
  add("tribrach.topPlate", mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.022, 24), kit.paintBlue), V(0, headY + 0.072, 0), tribrach); // PERF: was 32

  /* alidade — the rotating body */
  const alidade = new THREE.Group();
  alidade.name = "alidade";
  root.add(alidade);
  const bodyY = headY + 0.19;
  add("alidade.body", mesh(new THREE.BoxGeometry(0.15, 0.2, 0.13), kit.paintSatin), V(0, bodyY, 0), alidade);
  add("alidade.standardL", mesh(new THREE.BoxGeometry(0.024, 0.15, 0.06), kit.paintSatin), V(-0.075, bodyY + 0.14, 0), alidade);
  add("alidade.standardR", mesh(new THREE.BoxGeometry(0.024, 0.15, 0.06), kit.paintSatin), V(0.075, bodyY + 0.14, 0), alidade);
  const axle = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.19, 16), kit.steelBrushed, "alidade.axle");
  axle.rotation.z = Math.PI / 2;
  add("alidade.axle", axle, V(0, bodyY + 0.16, 0), alidade);
  add("alidade.display", mesh(new THREE.BoxGeometry(0.1, 0.07, 0.008), kit.lensBlue), V(0, bodyY + 0.01, 0.068), alidade);
  add("alidade.battery", mesh(new THREE.BoxGeometry(0.03, 0.12, 0.08), kit.rubber), V(0.095, bodyY - 0.02, -0.02), alidade);
  /* brand pinstripe — unlit + untonemapped so it never blows out */
  add("alidade.pinstripe", mesh(new THREE.TorusGeometry(0.082, 0.004, 6, 28), kit.limeGlow), V(0, bodyY - 0.06, 0), alidade) // PERF: was (8,40)
    .rotation.x = Math.PI / 2;

  /* telescope — seated in the axle (its mount), never hovering */
  const telescope = new THREE.Group();
  telescope.name = "telescope";
  root.add(telescope);
  const barrel = mesh(new THREE.CylinderGeometry(0.034, 0.038, 0.21, 18), kit.paintBlue, "telescope.barrel"); // PERF: was 24
  barrel.rotation.x = Math.PI / 2;
  add("telescope.barrel", barrel, V(0, bodyY + 0.16, 0.01), telescope);
  add("telescope.objective", mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 24), kit.glassish), V(0, bodyY + 0.16, 0.118), telescope)
    .rotation.x = Math.PI / 2;
  const reticle = mesh(new THREE.TorusGeometry(0.02, 0.0035, 6, 18), kit.lensBlue, "telescope.reticle"); // PERF: was (8,24)
  add("telescope.reticle", reticle, V(0, bodyY + 0.16, 0.125), telescope);
  const eyepiece = mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.05, 16), kit.rubber, "telescope.eyepiece");
  eyepiece.rotation.x = Math.PI / 2;
  add("telescope.eyepiece", eyepiece, V(0, bodyY + 0.16, -0.115), telescope);
  /* handle: arch bossed onto BOTH standards */
  add("telescope.handleBar", mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.17, 12), kit.paintSatin), V(0, bodyY + 0.245, 0), telescope)
    .rotation.z = Math.PI / 2;
  add("telescope.handleBossL", mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.05, 12), kit.paintSatin), V(-0.075, bodyY + 0.215, 0), telescope);
  add("telescope.handleBossR", mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.05, 12), kit.paintSatin), V(0.075, bodyY + 0.215, 0), telescope);

  return { root, parts, pad };
}

/* ------------------------------------------- assembly animation windows
   Explode along ONE coherent axis (Y) with graduated gaps; each part slides
   DOWN into its seat with overshoot-and-settle (nothing stops instantly). */
const ASSEMBLY_ORDER = [
  "pad",
  "tripod.legA", "tripod.legB", "tripod.legC",
  "tribrach", "alidade", "telescope",
];
/* PERF: the name -> nodes lookup was rebuilt (object + 7 arrays) on EVERY
   apply() call, i.e. every scroll frame — pure GC churn. Cache it per
   parts manifest; the node set never changes after buildTotalStation. */
const _layoutGroups = new WeakMap();
export function layoutAssembly(parts, p, a = 0.3, b = 0.62) {
  let groups = _layoutGroups.get(parts);
  if (!groups) {
    groups = {
      pad: parts.pad ? [parts.pad] : [],
      "tripod.legA": [parts["tripod.legA"]],
      "tripod.legB": [parts["tripod.legB"]],
      "tripod.legC": [parts["tripod.legC"]],
      tribrach: [parts.tribrach],
      alidade: [parts.alidade],
      telescope: [parts.telescope],
    };
    _layoutGroups.set(parts, groups);
  }
  ASSEMBLY_ORDER.forEach((name, i) => {
    const nodes = groups[name] || [];
    const w0 = a + (i / ASSEMBLY_ORDER.length) * (b - a);
    const w1 = w0 + (b - a) * 0.35;
    const t = easeOutBack(window01(p, w0, Math.min(w1, b)));
    const lift = (ASSEMBLY_ORDER.length - i) * 0.55; // graduated gaps on the Y axis
    nodes.forEach((n) => {
      if (!n) return;
      if (n.userData.restY === undefined) n.userData.restY = n.position.y;
      n.position.y = n.userData.restY + (1 - t) * lift;
    });
  });
}

/* ============================================================ turntable
   Services-hub scene: the instrument on a spotlit plinth, slow auto-rotate,
   drag to spin (velocity + damping — nothing stops instantly). */
export class InstrumentScene extends SceneBase {
  build() {
    const env = studioEnv(this.renderer);
    this.scene.environment = env;
    cyclorama(this.scene);
    lightRig(this.scene, { keyPos: [3.2, 4.5, 2.6], rimPos: [-3.4, 3.2, -2.8], target: [0, 0.9, 0], keyI: 38, rimI: 85 });

    const kit = makeKit(env);
    this.kit = kit;
    const { root, parts } = buildTotalStation(kit);
    this.instrument = root;
    this.parts = parts;
    this.scene.add(root);

    /* floor: dark disc + light pool + contact shadow under the pad */
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(7, 32), // PERF: was 48
      new THREE.MeshStandardMaterial({ color: 0x11151c, roughness: 0.95, metalness: 0, envMapIntensity: 0.22 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.name = "floor";
    this.scene.add(floor);

    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.MeshBasicMaterial({
        map: radialSprite("rgba(0,130,202,0.16)"), transparent: true,
        depthWrite: false, toneMapped: false,
      })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.005;
    pool.name = "lightPool";
    this.scene.add(pool);

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.2),
      new THREE.MeshBasicMaterial({
        map: radialSprite("rgba(0,0,0,0.55)"), transparent: true, depthWrite: false,
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    shadow.name = "contactShadow";
    this.scene.add(shadow);

    /* interaction state (continuous clock only — never scroll state) */
    this.rotVel = 0;
    this.dragging = false;
    this.lastX = 0;
    const el = this.renderer.domElement;
    el.style.touchAction = "pan-y";
    el.addEventListener("pointerdown", (e) => {
      this.dragging = true; this.lastX = e.clientX;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      this.pointerMoved = true;   // wakes the frame cap to ACTIVE_FPS
      this.rotVel = (e.clientX - this.lastX) * 0.012;
      this.lastX = e.clientX;
    });
    el.addEventListener("pointerup", () => (this.dragging = false));
    el.addEventListener("pointercancel", () => (this.dragging = false));
  }

  /** pure: progress -> all spatial state */
  apply(p) {
    this.progress = p;
    /* camera solved FIRST (bug-catalog: one-frame-late) */
    const d = fitDistance(this.camera, 1.5, 1.08);
    this.camera.position.set(d * 0.55, 1.32, d * 0.8);
    this.camera.lookAt(0, 0.85, 0);
    layoutAssembly(this.parts, p, 0.0, 1.0);
  }

  /** continuous motion only */
  tickMotion(dt) {
    const auto = this.dragging ? 0 : 0.25;
    this.instrument.rotation.y += (auto + this.rotVel) * dt * 2.2;
    this.rotVel *= Math.pow(0.06, dt); // damped spin-down
  }
}
