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
    const arm = () => new THREE.Mesh(withColor(new THREE.BoxGeometry(0.018, 0.05, 0.022).translate(0, 0.068, -0.004)), M.housing);
    const yawMotor = () => new THREE.Mesh(withColor(new THREE.CylinderGeometry(0.016, 0.016, 0.018, 28).translate(0, 0.0925, 0)), M.anodized);
    // L2: a squarer housing with the big round LiDAR window and a small RGB lens
    const l2 = new THREE.Group(); l2.name = 'fly:payload-L2';
    l2.add(arm(), yawMotor());
    l2.add(new THREE.Mesh(withColor(new THREE.BoxGeometry(0.118, 0.1, 0.11).translate(0, -0.004, 0)), M.housing));
    l2.add(new THREE.Mesh(withColor(new THREE.CylinderGeometry(0.047, 0.047, 0.012, 40).rotateX(Math.PI / 2).translate(-0.012, -0.006, 0.058)), M.anodized));
    l2.add(new THREE.Mesh(withColor(new THREE.CylinderGeometry(0.04, 0.04, 0.004, 40).rotateX(Math.PI / 2).translate(-0.012, -0.006, 0.0645)), M.glass));
    l2.add(new THREE.Mesh(withColor(new THREE.CylinderGeometry(0.011, 0.011, 0.01, 24).rotateX(Math.PI / 2).translate(0.042, 0.028, 0.059)), M.anodized));
    l2.add(new THREE.Mesh(withColor(new THREE.CylinderGeometry(0.008, 0.008, 0.003, 24).rotateX(Math.PI / 2).translate(0.042, 0.028, 0.064)), M.glass));
    // P1: a compact full-frame body with a 35 mm lens barrel
    const p1 = new THREE.Group(); p1.name = 'fly:payload-P1';
    p1.add(arm(), yawMotor());
    p1.add(new THREE.Mesh(withColor(new THREE.BoxGeometry(0.112, 0.092, 0.084).translate(0, -0.004, -0.004)), M.housing));
    p1.add(new THREE.Mesh(withColor(new THREE.CylinderGeometry(0.034, 0.036, 0.058, 40).rotateX(Math.PI / 2).translate(0, -0.006, 0.066)), M.anodized));
    p1.add(new THREE.Mesh(withColor(new THREE.CylinderGeometry(0.027, 0.027, 0.004, 40).rotateX(Math.PI / 2).translate(0, -0.006, 0.096)), M.glass));
    for (const g of [l2, p1]) { g.visible = false; gCam.add(g); }
    // optical sockets (FPV camera / LiDAR emitter), in the gimbal camera's frame (+Z = boresight)
    const sock = (x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); gCam.add(o); return o; };
    this.payloads = {
      H20T: { show: own, socket: rt.sockets['gimbal-camera/boresight'], laser: sock(0.024, 0.022, 0.05) },
      L2: { show: [l2], socket: sock(-0.012, -0.006, 0.072), laser: sock(-0.012, -0.006, 0.072) },
      P1: { show: [p1], socket: sock(0, -0.006, 0.1), laser: sock(0, -0.006, 0.1) },
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
