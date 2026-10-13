// Underhill v2 — gear playground registry: one entry per kit id (js/kit-data.js), saying how the gear
// page loads, frames, labels and plays each piece of kit.
//
// ─── How to add a new gear model (for the sculptor agents) ─────────────────────────────────────
//  1. Sculpt the model (threejs-object-sculptor) from references/gear/<id>/ and write an adapter in
//     js/adapters/<id>.js with the same shape as the film's adapters (see js/adapters/common.js):
//        export default { key, async create({ mobile, q }) {
//          return { root,                       // THREE.Group, metres, +Y up, feet on y = 0, front +Z
//                   explode(t),                 // the model's own explode, 0..1 (StagedExplode stages it)
//                   stageOf(obj), unitKeyOf(obj),   // explode order / grouping (ruleOf helps)
//                   labels: [{ id, text, short, node, dir }],   // parts to name (labels.js)
//                   pose(state), spin(dt, s), sockets: {}, dispose() } } }
//     freeze(obj) / together(obj) / onExplode(t) are optional, as in the film's adapters.
//  2. In the entry below, set   load: () => import('../adapters/<id>.js')
//     and tune `framing` if the automatic fit is off (az / el in degrees, fit = margin).
//  3. In js/kit-data.js set the entry's status to 'ready' (the landing then shows "3D model ready").
//  That is all: the page builds it, warms its shaders, gives it Inspect (orbit, staged explode,
//  labels, field notes) and plays its mission from js/gear/missions.js with the generic runner
//  (bubble, hold, wait, tap-the-part, rotate ring, info). Optional extras:
//   - `rig: () => import('./rigs/<id>.js')` for real mission behaviour (see rigs/gnss.js);
//   - `setup(inst, THREE)` to dress the model once after it is built (see m350-mapper's Mapper+);
//   - `diorama` to choose the props round it (studio.js setProps keys);
//   - `labels` to override the adapter's label list.
// ────────────────────────────────────────────────────────────────────────────────────────────────
//
// Entry shape:
//   { load: () => Promise<adapter module> | null,   null = model in production
//     rig?: () => Promise<rig module>,               interactive mission behaviour
//     framing?: { az, el, fit, dy, min, max },       camera home: azimuth / elevation (deg), fit margin,
//                                                    target lift (m, added to the box centre), zoom limits
//                                                    as multiples of the home distance
//     labels?: [label spec] | null,                  null = the adapter's own labels
//     missionId: string,                             key into js/gear/missions.js (default: the id)
//     diorama?: { …props on/off (studio.js setProps) },
//     setup?(inst, THREE) }
import { KIT, kitById } from '../kit-data.js';

const DEFAULT_FRAMING = { az: 32, el: 14, fit: 1.12, dy: 0, min: 0.42, max: 2.6 };

/** The YellowScan Mapper+ on the Skyport, in place of the sculptor drone's gimbal camera. */
function dressMapperPlus(inst, THREE) {
  const root = inst.root;
  const cam = root.getObjectByName('gimbal-camera');
  const qr = root.getObjectByName('gimbal-connector');
  if (!qr || root.getObjectByName('gear:mapper')) return;
  if (cam) cam.visible = false;
  const g = new THREE.Group();
  g.name = 'gear:mapper';
  const black = new THREE.MeshStandardMaterial({ name: 'mapper-black', color: 0x17191c, roughness: 0.42, metalness: 0.35 });
  const yellow = new THREE.MeshStandardMaterial({ name: 'mapper-yellow', color: 0xf2c200, roughness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ name: 'mapper-window', color: 0x0b0f14, roughness: 0.05, metalness: 0.9, emissive: 0x16324a, emissiveIntensity: 0.6 });
  const ring = new THREE.MeshStandardMaterial({ name: 'mapper-skyport', color: 0x8c939b, roughness: 0.3, metalness: 0.8 });
  // 150 L (along the nose, z) × 104 W × 123 H mm
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.104, 0.123, 0.15), black);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.1055, 0.022, 0.1515), yellow); band.position.y = 0.034;
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.05), glass); win.position.set(0, -0.022, 0.0752);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.011, 24), glass); lens.position.set(0.034, 0.028, 0.0753);
  const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.014, 28), ring); mount.position.y = 0.068;
  for (const m of [body, band, mount]) { m.castShadow = true; m.receiveShadow = true; }
  g.add(body, band, win, lens, mount);
  g.position.set(0, -0.0875, 0.004);     // hangs from the connector: top at its bottom face
  qr.add(g);
  inst.mapper = { group: g, rest: g.position.clone(), materials: [black, yellow, glass, ring] };
  const dispose0 = inst.dispose;
  inst.dispose = () => {
    for (const m of g.children) m.geometry.dispose();
    for (const m of inst.mapper.materials) m.dispose();
    dispose0();
  };
}

const ENTRIES = {
  'm350-mapper': {
    load: () => import('../adapters/droneB.js'),
    rig: () => import('./rigs/drone.js'),
    framing: { az: 34, el: 24, fit: 1.22, dy: 0.02 },
    labels: [
      { id: 'lidar', text: 'YellowScan Mapper+ LiDAR', short: 'Mapper+', node: 'gear:mapper', dir: [0.3, -0.2, 1] },
      { id: 'battery', text: 'TB65 hot-swap battery', short: 'Battery', node: 'body-battery-l', dir: [1, 0.3, 0.3] },
      { id: 'arm', text: 'Folding carbon arm', short: 'Carbon arm', node: 'arm-fl-tube', dir: [0, 1, 0.4] },
      { id: 'fin', text: 'Antenna fin with nav LED', short: 'Antenna fin', node: 'mast-fl', dir: [1, 0.3, 0.6] },
      { id: 'prop', text: 'Folding propeller', short: 'Propeller', node: 'rotor-fl', deep: true, span: 0.6 },
      { id: 'motor', text: 'Brushless motor', short: 'Motor', node: 'motor-fl', dir: [0.6, -0.2, 1] },
      { id: 'gear', text: 'Landing gear', short: 'Landing leg', node: 'leg-l', dir: [1, 0.1, 0.5] },
      { id: 'topcam', text: 'FPV camera on damper mount', short: 'FPV camera', node: 'top-camera-head', dir: [0.3, 0.3, 1] },
      { id: 'fc', text: 'Flight-controller stack', short: 'Controller', node: 'body-electronics', dir: [0.4, 1, 0.6] },
    ],
    diorama: { nail: false, pad: true },
    setup: dressMapperPlus,
  },
  'r12i-tsc7': {
    load: () => import('../adapters/gnssB.js'),
    rig: () => import('./rigs/gnss.js'),
    framing: { az: 26, el: 12, fit: 1.1, dy: -0.02 },
    labels: null,
    diorama: {},
  },
  's7-robotic': {
    load: () => import('../adapters/totalStation.js'),
    rig: () => import('./rigs/ts.js'),
    framing: { az: 38, el: 13, fit: 1.1, dy: -0.02 },
    labels: null,
    diorama: { backsight: true },
  },
};

/** The registry entry for a kit id (every kit id has one; awaiting gear have load: null). */
export function gearEntry(id) {
  const kit = kitById(id);
  if (!kit) return null;
  const e = ENTRIES[id] || {};
  return {
    id,
    kit,
    load: e.load || null,
    rig: e.rig || null,
    framing: { ...DEFAULT_FRAMING, ...(e.framing || {}) },
    labels: e.labels || null,
    missionId: e.missionId || id,
    diorama: e.diorama || {},
    setup: e.setup || null,
    // ready = a model to load AND kit-data says so (the landing reads the same flag)
    ready: !!e.load && kit.status === 'ready',
  };
}

export const GEAR_IDS = KIT.map((k) => k.id);
export const READY_IDS = GEAR_IDS.filter((id) => gearEntry(id).ready);
