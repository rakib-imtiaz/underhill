// Fly mode: the drone. The film's sculptor M350-class drone (adapters/droneB.js), used as it is, with
// local additions as child objects (drone.js itself is not edited):
//   - an RTK module: a small grey dome on the top-payload mount (the top camera head is hidden)
//   - three gimbal payloads, switched by visibility: Zenmuse L2 LiDAR, P1 45 MP mapping camera, and
//     H20T zoom / thermal / laser rangefinder (the model's own gimbal camera is H20T-like)
//   - an optical socket per payload (the FPV camera and the LiDAR emitter ride on it)
//   - a strobe on the top beacon, nav LEDs and motor rings through the adapter's leds()
import * as THREE from 'three';
import droneB from '../adapters/droneB.js';

export const PAYLOADS = {
  L2: { id: 'L2', name: 'Zenmuse L2', kind: 'LiDAR', short: 'L2 LiDAR', hfov: 70, note: 'LiDAR + 20 MP RGB' },
  P1: { id: 'P1', name: 'Zenmuse P1', kind: 'Camera', short: 'P1 45 MP', hfov: 54.3, note: '45 MP full frame, 35 mm' },
  H20T: { id: 'H20T', name: 'Zenmuse H20T', kind: 'Zoom / thermal', short: 'H20T', hfov: 66, note: 'Zoom, thermal, laser rangefinder' },
};
export const PAYLOAD_ORDER = ['L2', 'P1', 'H20T'];

const ARMS = ['fl', 'fr', 'rl', 'rr'];

/** Give a geometry the white vertex colours the model's 'surfaced' materials expect (they multiply by vColor). */
function withColor(geo, v = 0.92) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new Float32Array(g.attributes.position.count * 3).fill(v);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

export class FlyDrone {
  /** @returns {Promise<FlyDrone>} */
  static async create({ q, shadows }) {
    const inst = await droneB.create({ mobile: q.tier !== 'high', q });
    return new FlyDrone(inst, { shadows });
  }

  constructor(inst, { shadows }) {
    this.inst = inst;
    this.group = new THREE.Group();
    this.group.name = 'fly:drone';
    this.group.rotation.order = 'YXZ';
    this.group.add(inst.root);
    const rt = inst.root.userData.sculptRuntime;
    const M = inst.root.userData.materials;
    this.M = M;
    this.rt = rt;

    // ---- RTK module on the top-payload mount (the top camera head goes)
    rt.nodes['top-camera-head'].visible = false;
    const top = rt.nodes['top-payload'];
    const rtk = new THREE.Group(); rtk.name = 'fly:rtk-module';
    const domeGeo = withColor(new THREE.LatheGeometry([[0, 0], [0.046, 0], [0.05, 0.006], [0.05, 0.016], [0.044, 0.03], [0.03, 0.041], [0, 0.046]].map(([r, y]) => new THREE.Vector2(r, y)), 36));
    const dome = new THREE.Mesh(domeGeo, new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.55, metalness: 0.05, name: 'rtk-dome' }));
    dome.position.y = 0.074;
    const base = new THREE.Mesh(withColor(new THREE.CylinderGeometry(0.052, 0.054, 0.012, 36)), M.anodized);
    base.position.y = 0.068;
    const stem = new THREE.Mesh(withColor(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 16)), M.anodized);
    stem.position.y = 0.055;
    rtk.add(dome, base, stem);
    top.add(rtk);

    // ---- payloads under the gimbal: the model's own camera is the H20T look
    const gCam = rt.nodes['gimbal-camera'];
    this.gCam = gCam;
    const own = gCam.children.filter((o) => o.isMesh || o.isInstancedMesh);
    // (the model's gimbal yoke carries them: yaw motor and arm, roll motor and the U-shaped roll arm
    // with the pitch motors. Each body is sized to turn inside it: within 0.060 m of the pitch axis
    // in the y-z plane, and side caps reach out to the model's pitch rotors, x = ±0.0665 … ±0.069,
    // which stay on for every payload.)
    const caps = (half) => [1, -1].map((sx) => new THREE.Mesh(withColor(new THREE.CylinderGeometry(0.017, 0.017, 0.0665 - half, 32).rotateZ(Math.PI / 2).translate(sx * (0.0665 + half) / 2, 0, 0)), M.anodized));
    // L2: a squarer housing with the big round LiDAR window and a small RGB lens
    const l2 = new THREE.Group(); l2.name = 'fly:payload-L2';
    l2.add(...caps(0.055));
    l2.add(new THREE.Mesh(withColor(new THREE.BoxGeometry(0.11, 0.082, 0.082).translate(0, -0.002, 0)), M.housing));
    l2.add(new THREE.Mesh(withColor(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 40).rotateX(Math.PI / 2).translate(-0.012, -0.004, 0.045)), M.anodized));
    l2.add(new THREE.Mesh(withColor(new THREE.CylinderGeometry(0.025, 0.025, 0.003, 40).rotateX(Math.PI / 2).translate(-0.012, -0.004, 0.049)), M.glass));
    l2.add(new THREE.Mesh(withColor(new THREE.CylinderGeometry(0.009, 0.009, 0.006, 24).rotateX(Math.PI / 2).translate(0.036, 0.024, 0.044)), M.anodized));
    l2.add(new THREE.Mesh(withColor(new THREE.CylinderGeometry(0.0065, 0.0065, 0.002, 24).rotateX(Math.PI / 2).translate(0.036, 0.024, 0.0475)), M.glass));
    // P1: a compact full-frame body with a 35 mm lens barrel
    const p1 = new THREE.Group(); p1.name = 'fly:payload-P1';
    p1.add(...caps(0.054));
    p1.add(new THREE.Mesh(withColor(new THREE.BoxGeometry(0.108, 0.08, 0.076).translate(0, -0.002, -0.004)), M.housing));
    p1.add(new THREE.Mesh(withColor(new THREE.CylinderGeometry(0.029, 0.031, 0.04, 40).rotateX(Math.PI / 2).translate(0, -0.006, 0.054)), M.anodized));
    p1.add(new THREE.Mesh(withColor(new THREE.CylinderGeometry(0.023, 0.023, 0.003, 40).rotateX(Math.PI / 2).translate(0, -0.006, 0.0745)), M.glass));
    for (const g of [l2, p1]) { g.visible = false; gCam.add(g); }
    // optical sockets (FPV camera / LiDAR emitter), in the gimbal camera's frame (+Z = boresight)
    const sock = (x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); gCam.add(o); return o; };
    this.payloads = {
      H20T: { show: own, socket: rt.sockets['gimbal-camera/boresight'], laser: sock(0.024, 0.022, 0.05) },
      L2: { show: [l2], socket: sock(-0.012, -0.004, 0.056), laser: sock(-0.012, -0.004, 0.056) },
      P1: { show: [p1], socket: sock(0, -0.006, 0.08), laser: sock(0, -0.006, 0.08) },
    };
    this.payload = 'H20T';
    this.setPayload('L2');

    // ---- lights: nav LEDs / motor rings via the adapter, a strobe on the top beacon
    this.power = 0;           // 0..1 how many arms are lit (pre-flight power-on runs it up)
    this.night = 1;
    if (!shadows) inst.root.traverse((o) => { if (o.isMesh || o.isInstancedMesh) o.castShadow = false; });
    else inst.root.traverse((o) => { if (o.isMesh && o.material?.transparent) o.castShadow = false; });
    this.rotor = 0;
    this.leds(0, 0);
  }

  /** Visible payload: 'L2' | 'P1' | 'H20T'. */
  setPayload(id) {
    if (!this.payloads[id]) return;
    for (const [k, p] of Object.entries(this.payloads)) for (const o of p.show) o.visible = k === id;
    this.payload = id;
  }

  /** Show every payload at once (shader warm-up only). */
  showAllPayloads(on) {
    for (const [k, p] of Object.entries(this.payloads)) for (const o of p.show) o.visible = on || k === this.payload;
  }

  get socket() { return this.payloads[this.payload].socket; }
  get laserSocket() { return this.payloads[this.payload].laser; }

  /** Nav LEDs and motor rings: `power` 0..1 lights the arms one by one; `t` the clock (strobe). */
  leds(power, t = 0) {
    this.power = power;
    const lv = {};
    ARMS.forEach((id, i) => { lv[id] = Math.min(1, Math.max(0, power * 4 - i)); });
    const navK = 0.55 + 0.45 * this.night;
    for (const id of ARMS) lv[id] *= 1;
    this.inst.leds(power > 0 ? Object.fromEntries(ARMS.map((id) => [id, lv[id] * navK])) : { fl: 0, fr: 0, rl: 0, rr: 0 });
    // anti-collision strobe: a double flash every 1.2 s once powered
    const ph = (t % 1.2) / 1.2;
    const flash = power >= 1 ? ((ph < 0.04 || (ph > 0.1 && ph < 0.14)) ? 1 : 0) : 0;
    this.M.beacon.emissiveIntensity = power > 0 ? 0.6 + flash * (4 + 6 * this.night) : 0;
    this.M.ledRed.emissiveIntensity = power > 0 ? 2 : 0;
  }

  /**
   * Pose for this frame. `s` = the flight state: pos, yaw, pitch, roll (rad), fold 0..1, rotor 0..1,
   * gimbal { pitch (deg, DJI: −90 down … +30 up), yaw (deg, relative to the nose) }.
   */
  pose(s, dt) {
    const g = this.group;
    g.position.set(s.pos.x, s.pos.y, s.pos.z);
    g.rotation.set(s.pitch, s.yaw, s.roll);
    // the gimbal is stabilised: it holds its world pitch and stays level while the body tilts
    this.inst.pose({ gimbalPitch: -(s.gimbal.pitch) - THREE.MathUtils.radToDeg(s.pitch), gimbalYaw: s.gimbal.yaw, gimbalRoll: -THREE.MathUtils.radToDeg(s.roll), fold: s.fold });
    this.rotor = s.rotor;
    this.inst.spin(dt, s.rotor);
  }

  /** Discs visible regardless of speed (warm-up), then restored by the next spin(). */
  showDiscs() { this.inst.spin(0, 1); }
}
