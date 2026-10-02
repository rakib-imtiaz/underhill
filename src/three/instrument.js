/* ==========================================================================
   three/instrument.js — procedural robotic total station (Leica TS-series
   form) on a wooden surveyor's tripod.

   v2 — rebuilt from scratch. The v1 model was a stack of sharp boxes in
   near-black paint; under the scene's rim-heavy rig it rendered as a
   silhouette with no readable form. This build spends its polygons on the
   things that make a total station recognisable at a glance:

     · the U-shaped yoke — two rounded standards carrying the telescope on a
       visible trunnion axle, with a carrying handle arched between them
     · a tilted colour display + keypad on the front face of the alidade
     · a fat telescope with a sunshade, focus ring and objective glass
     · a triangular tribrach with three vertical foot screws and a bubble
     · a wooden tripod: two parallel slats per leg, clamp brackets, steel
       shoes with foot-step plates

   Everything is chamfered (ExtrudeGeometry with bevel) rather than boxed —
   chamfers are what catch the rim light and read as machined castings.

   Contract (consumed by terrain.js and InstrumentScene):
     buildTotalStation(kit) -> { root, parts, pad }
     parts: pad, tripod.legA/B/C, tribrach, alidade, telescope  (group nodes)
     telescope (trunnion) axis at y = 1.02 + 0.35 = 1.37
   ========================================================================== */
import * as THREE from "three";
import {
  SceneBase, studioEnv, lightRig, cyclorama, radialSprite,
  clamp01, window01, easeOutBack, fitDistance,
} from "./core.js";

/* ----------------------------------------------------------- material kit
   Created once per scene, shared, NEVER mutated per-part. Albedos are
   lifted well clear of black: a dark object in a dark scene has to carry
   its own mid-tones or the rim light is the only thing that survives. */
export function makeKit(env) {
  const M = (o) =>
    new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 1.5, ...o });
  return {
    /* castings + paint */
    paintSatin: M({ color: 0x2b2f37, metalness: 0.20, roughness: 0.46, clearcoat: 0.25, clearcoatRoughness: 0.5 }),
    paintDark:  M({ color: 0x1c1f26, metalness: 0.25, roughness: 0.50 }),
    paintBlue:  M({ color: 0x0f7fc2, metalness: 0.30, roughness: 0.40, clearcoat: 0.4, clearcoatRoughness: 0.35 }),
    /* metals */
    steelBrushed: M({ color: 0xc4c9cf, metalness: 1.0, roughness: 0.32 }),
    aluAnodised:  M({ color: 0x9aa1a8, metalness: 0.9,  roughness: 0.42 }),
    brass:        M({ color: 0xb08d4f, metalness: 1.0,  roughness: 0.34 }),
    /* soft parts */
    rubber:  M({ color: 0x1a1c20, metalness: 0, roughness: 0.92 }),
    wood:    M({ color: 0xa8763f, metalness: 0, roughness: 0.78 }),
    keyCap:  M({ color: 0x3a3f48, metalness: 0.05, roughness: 0.6 }),
    /* optics + emissives (unlit, untonemapped so they never blow out) */
    glassish: M({ color: 0xdfe8ea, metalness: 0, roughness: 0.06, transparent: true, opacity: 0.4 }),
    lensBlue: new THREE.MeshBasicMaterial({ color: 0x2fa8e0, toneMapped: false }),
    screen:   new THREE.MeshBasicMaterial({ color: 0x0c3a55, toneMapped: false }),
    laserRed: new THREE.MeshBasicMaterial({ color: 0xff3b2f, toneMapped: false }),
    limeGlow: new THREE.MeshBasicMaterial({ color: 0xe7ff89, toneMapped: false }),
    concrete: M({ color: 0x262a31, metalness: 0.05, roughness: 0.95 }),
  };
}

/* ------------------------------------------------------------- helpers */
function mesh(geo, mat, name) {
  const m = new THREE.Mesh(geo, mat);
  if (name) m.name = name;
  return m;
}

/** box with chamfered edges, centred on the origin (w along X, h along Y,
    d along Z). Bevel is the single biggest realism lever on hard-surface
    parts: it is where the rim light lands. */
export function chamferBox(w, h, d, r = 0.004, seg = 2) {
  const s = new THREE.Shape();
  const x = w / 2 - r, y = h / 2 - r;
  s.moveTo(-x, -y - r);
  s.lineTo(x, -y - r);  s.quadraticCurveTo(x + r, -y - r, x + r, -y);
  s.lineTo(x + r, y);   s.quadraticCurveTo(x + r, y + r, x, y + r);
  s.lineTo(-x, y + r);  s.quadraticCurveTo(-x - r, y + r, -x - r, y);
  s.lineTo(-x - r, -y); s.quadraticCurveTo(-x - r, -y - r, -x, -y - r);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: d - r * 2, bevelEnabled: true, bevelThickness: r, bevelSize: r,
    bevelSegments: seg, curveSegments: 4,
  });
  g.translate(0, 0, -(d - r * 2) / 2);
  return g;
}

/** knurled knob: smooth core + instanced ribs around it (one draw call) */
export function knurledKnob(rad, len, mat, name, teeth = 16) {
  const g = new THREE.Group();
  g.name = name;
  g.add(mesh(new THREE.CylinderGeometry(rad, rad, len, 20), mat));
  const rib = new THREE.InstancedMesh(
    new THREE.BoxGeometry(rad * 0.16, len * 0.86, rad * 0.22), mat, teeth
  );
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    p.set(Math.cos(a) * rad, 0, Math.sin(a) * rad);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
    rib.setMatrixAt(i, m4.compose(p, q, s));
  }
  rib.instanceMatrix.needsUpdate = true;
  g.add(rib);
  return g;
}

/** rounded-triangle plate (tribrach casting), extruded along Y */
function triPlate(rOuter, h, corner, mat, name) {
  const s = new THREE.Shape();
  const pts = [];
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i / 3) * Math.PI * 2;
    pts.push(new THREE.Vector2(Math.cos(a) * rOuter, Math.sin(a) * rOuter));
  }
  /* round the corners by cutting each one back and bridging with a curve */
  for (let i = 0; i < 3; i++) {
    const p = pts[i], prev = pts[(i + 2) % 3], next = pts[(i + 1) % 3];
    const a = prev.clone().sub(p).normalize().multiplyScalar(corner).add(p);
    const b = next.clone().sub(p).normalize().multiplyScalar(corner).add(p);
    if (i === 0) s.moveTo(a.x, a.y); else s.lineTo(a.x, a.y);
    s.quadraticCurveTo(p.x, p.y, b.x, b.y);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 6 });
  g.rotateX(-Math.PI / 2);   // extrude along +Y
  g.translate(0, -h / 2, 0);
  const m = mesh(g, mat, name);
  return m;
}

/* ---------------------------------------------------------- the assembly */
export function buildTotalStation(kit) {
  const root = new THREE.Group();
  root.name = "totalStation";
  const parts = {};
  const add = (name, obj, at, parent = root) => {
    obj.name = name;
    if (at) obj.position.copy(at);
    parent.add(obj);
    parts[name] = obj;
    return obj;
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  /* ----------------------------------------------------------- datums */
  const HEAD_Y = 1.02;            // top of the tripod head casting
  const AXIS_Y = HEAD_Y + 0.35;   // trunnion (telescope) axis — terrain.js depends on this

  /* ------------------------------------------------------ ground / pad */
  const pad = add("pad", mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.05, 28), kit.concrete), V(0, 0.025, 0));

  /* ------------------------------------------------------------ tripod
     Wooden GST-style: cast head, three legs each made of two parallel
     hardwood slats with an aluminium inner leg sliding between them,
     clamp bracket at the overlap, steel shoe + foot-step at the ground. */
  const tripod = new THREE.Group();
  tripod.name = "tripod";
  root.add(tripod);

  const head = mesh(new THREE.CylinderGeometry(0.125, 0.14, 0.045, 24), kit.paintDark, "tripod.head");
  head.position.y = HEAD_Y - 0.0225;
  tripod.add(head);
  /* central fixing screw (the 5/8" stud the tribrach clamps onto) */
  const stud = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 12), kit.steelBrushed, "tripod.stud");
  stud.position.y = HEAD_Y + 0.02;
  tripod.add(stud);

  const SPLAY = 0.30;
  for (let i = 0; i < 3; i++) {
    const L = "ABC"[i];
    const yaw = (i / 3) * Math.PI * 2;

    /* hinge lug on the head rim + through-bolt */
    const lug = mesh(chamferBox(0.06, 0.05, 0.075, 0.005), kit.paintDark, `tripod.lug${L}`);
    lug.position.set(Math.cos(yaw) * 0.14, HEAD_Y - 0.03, Math.sin(yaw) * 0.14);
    lug.rotation.y = -yaw;
    tripod.add(lug);
    const bolt = mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.095, 10), kit.steelBrushed);
    bolt.rotation.x = Math.PI / 2;
    bolt.position.set(Math.cos(yaw) * 0.147, HEAD_Y - 0.032, Math.sin(yaw) * 0.147);
    bolt.rotation.y = -yaw;
    tripod.add(bolt);

    /* leg pivot at the lug, splayed outward */
    const legPivot = new THREE.Group();
    legPivot.name = `tripod.leg${L}`;
    legPivot.position.set(Math.cos(yaw) * 0.14, HEAD_Y - 0.032, Math.sin(yaw) * 0.14);
    legPivot.rotation.y = -yaw;
    tripod.add(legPivot);
    parts[`tripod.leg${L}`] = legPivot;

    const splay = new THREE.Group();
    splay.rotation.z = SPLAY;    // +Z rotation swings the leg bottom to +X = outward
    legPivot.add(splay);

    /* two parallel wooden slats */
    const UPPER = 0.64;
    for (const side of [-1, 1]) {
      const slat = mesh(chamferBox(0.024, UPPER, 0.03, 0.004), kit.wood, `tripod.leg${L}.slat`);
      slat.position.set(0, -UPPER / 2, side * 0.034);
      splay.add(slat);
    }
    /* top spacer block between the slats, at the hinge */
    const spacer = mesh(new THREE.BoxGeometry(0.03, 0.06, 0.04), kit.paintDark);
    spacer.position.set(0, -0.03, 0);
    splay.add(spacer);

    /* clamp bracket at the bottom of the upper leg + wing screw */
    const clamp = mesh(chamferBox(0.05, 0.075, 0.1, 0.006), kit.paintBlue, `tripod.leg${L}.clamp`);
    clamp.position.set(0, -UPPER + 0.045, 0);
    splay.add(clamp);
    const wing = knurledKnob(0.016, 0.02, kit.steelBrushed, `tripod.leg${L}.wing`, 10);
    wing.rotation.z = Math.PI / 2;
    wing.position.set(0.036, -UPPER + 0.045, 0);
    splay.add(wing);

    /* aluminium inner leg sliding between the slats, extended */
    const LOWER = 0.50;
    const inner = mesh(chamferBox(0.02, LOWER, 0.048, 0.003), kit.aluAnodised, `tripod.leg${L}.lowerLeg`);
    inner.position.set(0, -UPPER - LOWER / 2 + 0.12, 0);
    splay.add(inner);

    /* steel shoe + foot-step plate */
    const shoeY = -UPPER - LOWER + 0.12;
    const shoe = mesh(new THREE.ConeGeometry(0.03, 0.11, 12), kit.steelBrushed, `tripod.leg${L}.foot`);
    shoe.rotation.x = Math.PI;
    shoe.position.set(0, shoeY - 0.04, 0);
    splay.add(shoe);
    const step = mesh(chamferBox(0.06, 0.008, 0.07, 0.002), kit.steelBrushed);
    step.position.set(0.028, shoeY + 0.03, 0);
    splay.add(step);
  }

  /* ----------------------------------------------------------- tribrach
     GDF-style: triangular casting, three vertical foot screws at the
     corners, circular bubble on one face, locking ring on top. */
  const tribrach = new THREE.Group();
  tribrach.name = "tribrach";
  root.add(tribrach);
  parts.tribrach = tribrach;
  const TRI_Y = HEAD_Y + 0.03;
  /* NB: Group.add() returns the GROUP — position the child before adding */
  const triBase = triPlate(0.105, 0.026, 0.03, kit.paintSatin, "tribrach.base");
  triBase.position.set(0, TRI_Y, 0);
  tribrach.add(triBase);
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i / 3) * Math.PI * 2;
    const screw = knurledKnob(0.02, 0.04, kit.paintDark, `tribrach.screw${"ABC"[i]}`, 14);
    screw.position.set(Math.cos(a) * 0.078, TRI_Y + 0.03, Math.sin(a) * 0.078);
    tribrach.add(screw);
    const cap = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.004, 14), kit.steelBrushed);
    cap.position.set(Math.cos(a) * 0.078, TRI_Y + 0.052, Math.sin(a) * 0.078);
    tribrach.add(cap);
  }
  /* upper plate + locking ring */
  const upper = mesh(new THREE.CylinderGeometry(0.088, 0.092, 0.03, 28), kit.paintSatin, "tribrach.upper");
  upper.position.y = TRI_Y + 0.055;
  tribrach.add(upper);
  const lockRing = mesh(new THREE.TorusGeometry(0.086, 0.006, 6, 32), kit.aluAnodised, "tribrach.lock");
  lockRing.rotation.x = Math.PI / 2;
  lockRing.position.y = TRI_Y + 0.072;
  tribrach.add(lockRing);
  /* circular bubble level */
  const bub = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.014, 14), kit.paintDark, "tribrach.bubbleCup");
  bub.position.set(0.048, TRI_Y + 0.075, -0.052);
  tribrach.add(bub);
  const vial = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.006, 14), kit.glassish);
  vial.position.set(0.048, TRI_Y + 0.085, -0.052);
  tribrach.add(vial);
  const bubble = mesh(new THREE.SphereGeometry(0.005, 8, 6), kit.limeGlow);
  bubble.position.set(0.048, TRI_Y + 0.086, -0.052);
  tribrach.add(bubble);

  /* ----------------------------------------------------------- alidade
     The rotating body: turntable, main casting with the tilted display,
     two rounded standards carrying the trunnion axle, drive knobs,
     battery door, handle bossed onto both standards. */
  const alidade = new THREE.Group();
  alidade.name = "alidade";
  root.add(alidade);
  parts.alidade = alidade;
  const BASE_Y = TRI_Y + 0.088;        // turntable sits on the tribrach
  const turntable = mesh(new THREE.CylinderGeometry(0.09, 0.092, 0.036, 32), kit.paintDark, "alidade.turntable");
  turntable.position.y = BASE_Y;
  alidade.add(turntable);
  /* brand pinstripe around the turntable */
  const stripe = mesh(new THREE.TorusGeometry(0.092, 0.0035, 6, 40), kit.limeGlow, "alidade.pinstripe");
  stripe.rotation.x = Math.PI / 2;
  stripe.position.y = BASE_Y + 0.006;
  alidade.add(stripe);

  const BODY_H = 0.15, BODY_Y = BASE_Y + 0.018 + BODY_H / 2;
  const body = mesh(chamferBox(0.2, BODY_H, 0.15, 0.012, 3), kit.paintSatin, "alidade.body");
  body.position.y = BODY_Y;
  alidade.add(body);

  /* standards: rounded uprights either side of the telescope */
  const STD_X = 0.088, STD_W = 0.04, STD_D = 0.11;
  for (const side of [-1, 1]) {
    const nm = side < 0 ? "L" : "R";
    const post = mesh(chamferBox(STD_W, AXIS_Y - (BODY_Y + BODY_H / 2) + 0.01, STD_D, 0.008, 3), kit.paintSatin, `alidade.standard${nm}`);
    post.position.set(side * STD_X, (BODY_Y + BODY_H / 2 + AXIS_Y) / 2 - 0.005, 0);
    alidade.add(post);
    /* rounded top around the axle */
    const cap = mesh(new THREE.CylinderGeometry(STD_D / 2, STD_D / 2, STD_W, 24, 1, false, 0, Math.PI), kit.paintSatin);
    cap.rotation.z = Math.PI / 2;
    cap.rotation.y = Math.PI / 2;
    cap.position.set(side * STD_X, AXIS_Y, 0);
    alidade.add(cap);
    /* trunnion end cap */
    const tc = mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.014, 20), kit.paintDark, `alidade.trunnion${nm}`);
    tc.rotation.z = Math.PI / 2;
    tc.position.set(side * (STD_X + STD_W / 2 + 0.006), AXIS_Y, 0);
    alidade.add(tc);
    const tcRing = mesh(new THREE.TorusGeometry(0.03, 0.003, 6, 24), kit.aluAnodised);
    tcRing.rotation.y = Math.PI / 2;
    tcRing.position.set(side * (STD_X + STD_W / 2 + 0.013), AXIS_Y, 0);
    alidade.add(tcRing);
  }
  /* vertical fine-drive knob on the right trunnion, horizontal drive on the body */
  const vDrive = knurledKnob(0.014, 0.024, kit.paintDark, "alidade.vDrive", 12);
  vDrive.rotation.z = Math.PI / 2;
  vDrive.position.set(STD_X + STD_W / 2 + 0.03, AXIS_Y - 0.045, 0.035);
  alidade.add(vDrive);
  const hDrive = knurledKnob(0.014, 0.024, kit.paintDark, "alidade.hDrive", 12);
  hDrive.rotation.z = Math.PI / 2;
  hDrive.position.set(0.112, BODY_Y - 0.03, 0.035);
  alidade.add(hDrive);

  /* tilted display + keypad on the front face */
  const panel = new THREE.Group();
  panel.name = "alidade.display";
  panel.position.set(0, BODY_Y + 0.005, 0.075);
  panel.rotation.x = -0.28;
  alidade.add(panel);
  panel.add(mesh(chamferBox(0.15, 0.115, 0.014, 0.005), kit.paintDark));
  const scr = mesh(new THREE.PlaneGeometry(0.122, 0.058), kit.screen);
  scr.position.set(0, 0.022, 0.0075);
  panel.add(scr);
  /* screen content: a horizon line + a couple of readout bars */
  const bar = (w, y, mat) => { const b = mesh(new THREE.PlaneGeometry(w, 0.004), mat); b.position.set(-0.061 + w / 2 + 0.006, y, 0.0078); panel.add(b); };
  bar(0.05, 0.036, kit.lensBlue); bar(0.08, 0.026, kit.limeGlow); bar(0.035, 0.016, kit.lensBlue);
  const keys = new THREE.InstancedMesh(chamferBox(0.014, 0.009, 0.005, 0.0015, 1), kit.keyCap, 12);
  {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    let k = 0;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      p.set(-0.03 + c * 0.02, -0.02 - r * 0.014, 0.0095);
      keys.setMatrixAt(k++, m4.compose(p, q, s));
    }
    keys.instanceMatrix.needsUpdate = true;
  }
  keys.name = "alidade.keypad";
  panel.add(keys);

  /* battery door on the left flank, with a latch */
  const door = mesh(chamferBox(0.012, 0.1, 0.09, 0.004), kit.paintDark, "alidade.battery");
  door.position.set(-0.105, BODY_Y, -0.01);
  alidade.add(door);
  const latch = mesh(new THREE.BoxGeometry(0.006, 0.02, 0.012), kit.aluAnodised);
  latch.position.set(-0.113, BODY_Y + 0.03, -0.01);
  alidade.add(latch);

  /* carrying handle: arch bossed onto both standards */
  const arch = new THREE.CatmullRomCurve3([
    V(-STD_X, AXIS_Y + 0.06, 0), V(-STD_X + 0.01, AXIS_Y + 0.135, 0),
    V(-0.045, AXIS_Y + 0.17, 0), V(0, AXIS_Y + 0.178, 0), V(0.045, AXIS_Y + 0.17, 0),
    V(STD_X - 0.01, AXIS_Y + 0.135, 0), V(STD_X, AXIS_Y + 0.06, 0),
  ]);
  const handle = mesh(new THREE.TubeGeometry(arch, 28, 0.011, 10, false), kit.paintSatin, "alidade.handle");
  alidade.add(handle);
  for (const side of [-1, 1]) {
    const boss = mesh(new THREE.CylinderGeometry(0.016, 0.019, 0.03, 14), kit.paintDark);
    boss.position.set(side * STD_X, AXIS_Y + 0.07, 0);
    alidade.add(boss);
  }
  /* brand accent: small red dot on the handle crown (laser-class marker) */
  const dot = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.003, 10), kit.laserRed);
  dot.position.set(0, AXIS_Y + 0.19, 0);
  alidade.add(dot);

  /* ---------------------------------------------------------- telescope
     Seated ON the trunnion axle between the standards. */
  const telescope = new THREE.Group();
  telescope.name = "telescope";
  root.add(telescope);
  parts.telescope = telescope;
  const axle = mesh(new THREE.CylinderGeometry(0.02, 0.02, STD_X * 2 + 0.02, 16), kit.steelBrushed, "telescope.axle");
  axle.rotation.z = Math.PI / 2;
  axle.position.y = AXIS_Y;
  telescope.add(axle);
  /* trunnion housing the barrel clamps into */
  const hub = mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.09, 28), kit.paintSatin, "telescope.hub");
  hub.rotation.z = Math.PI / 2;
  hub.position.y = AXIS_Y;
  telescope.add(hub);
  const BARREL_L = 0.25;
  const barrel = mesh(new THREE.CylinderGeometry(0.038, 0.04, BARREL_L, 28), kit.paintSatin, "telescope.barrel");
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, AXIS_Y, 0.02);
  telescope.add(barrel);
  /* blue accent band + focus ring */
  const band = mesh(new THREE.CylinderGeometry(0.0405, 0.0405, 0.03, 28), kit.paintBlue, "telescope.band");
  band.rotation.x = Math.PI / 2;
  band.position.set(0, AXIS_Y, 0.075);
  telescope.add(band);
  const focus = knurledKnob(0.042, 0.026, kit.paintDark, "telescope.focus", 22);
  focus.rotation.x = Math.PI / 2;
  focus.position.set(0, AXIS_Y, -0.06);
  telescope.add(focus);
  /* sunshade + objective glass + EDM laser dot */
  const shade = mesh(new THREE.CylinderGeometry(0.046, 0.043, 0.04, 28, 1, true), kit.paintDark, "telescope.sunshade");
  shade.material = kit.paintDark.clone(); shade.material.side = THREE.DoubleSide;
  shade.rotation.x = Math.PI / 2;
  shade.position.set(0, AXIS_Y, BARREL_L / 2 + 0.02 + 0.012);
  telescope.add(shade);
  const objective = mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.008, 28), kit.glassish, "telescope.objective");
  objective.rotation.x = Math.PI / 2;
  objective.position.set(0, AXIS_Y, BARREL_L / 2 + 0.02);
  telescope.add(objective);
  const reticle = mesh(new THREE.TorusGeometry(0.024, 0.0025, 6, 24), kit.lensBlue, "telescope.reticle");
  reticle.position.set(0, AXIS_Y, BARREL_L / 2 + 0.026);
  telescope.add(reticle);
  const laser = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.004, 8), kit.laserRed, "telescope.edm");
  laser.rotation.x = Math.PI / 2;
  laser.position.set(0, AXIS_Y, BARREL_L / 2 + 0.027);
  telescope.add(laser);
  /* eyepiece: taper + rubber cup */
  const eye = mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.05, 20), kit.paintDark, "telescope.eyepiece");
  eye.rotation.x = Math.PI / 2;
  eye.position.set(0, AXIS_Y, -BARREL_L / 2 + 0.02 - 0.02);
  telescope.add(eye);
  const cup = mesh(new THREE.TorusGeometry(0.017, 0.006, 8, 20), kit.rubber);
  cup.position.set(0, AXIS_Y, -BARREL_L / 2 + 0.02 - 0.047);
  telescope.add(cup);
  /* open sight on top of the barrel */
  const sight = mesh(chamferBox(0.014, 0.018, 0.03, 0.002), kit.paintDark, "telescope.sight");
  sight.position.set(0, AXIS_Y + 0.046, 0.06);
  telescope.add(sight);

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
