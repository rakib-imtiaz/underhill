// Fly Lab: fly mode's M350-class drone (js/fly/drone.js -> adapters/droneB.js -> the sculptor model),
// imported read-only, for the three.js scenarios (A, B, C's custom layer) and for D's glTF export.
import * as THREE from 'three';
import { FlyDrone } from '../../js/fly/drone.js';

export async function makeDrone(tier = 'balanced') {
  const d = await FlyDrone.create({ q: { tier }, shadows: false });
  d.setPayload('L2');
  return d;
}

const g0 = { pitch: -18, yaw: 0 };
/** Pose the drone from a lab pose { x, y, z, yaw, pitch, roll, rotor, dt, day }. */
export function poseDrone(d, p, clock) {
  d.night = 1 - (p.day ?? 1);
  d.pose({ pos: { x: p.x, y: p.y, z: p.z }, yaw: p.yaw, pitch: p.pitch || 0, roll: p.roll || 0, fold: 0, rotor: p.rotor ?? 1, gimbal: g0 }, p.dt || 1 / 60);
  d.leds(1, clock);
  d.group.updateMatrixWorld(true);
}

/**
 * A small studio environment for the drone's PBR materials (fly mode uses a painted env at 0.42):
 * a sky-to-ground gradient sphere through PMREM.
 */
export function droneEnv(renderer, day = 1) {
  const pm = new THREE.PMREMGenerator(renderer);
  const sc = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const top = new THREE.Color().setRGB(0.55, 0.68, 0.85).multiplyScalar(day ? 1 : 0.12);
  const mid = new THREE.Color().setRGB(0.85, 0.86, 0.86).multiplyScalar(day ? 1 : 0.1);
  const bot = new THREE.Color().setRGB(0.22, 0.22, 0.22).multiplyScalar(day ? 1 : 0.15);
  const col = [];
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 10;
    const c = y > 0 ? mid.clone().lerp(top, Math.pow(y, 0.6)) : mid.clone().lerp(bot, Math.pow(-y, 0.5));
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  sc.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const rt = pm.fromScene(sc, 0.02);
  pm.dispose(); geo.dispose();
  return rt.texture;
}
