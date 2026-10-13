// The drone's laser writes the Underhill mark on the floor of the pad, point by point.
//
// The mark is Underhill's window (media/REV-UG-Horozontal-RGB.png): the square plate, the thick U
// inside it and the crosshair, traced as their outlines. Coordinates are the PNG's pixels (measured
// from the artwork), resampled into evenly spaced points along each outline. As `trace` runs 0 → 1
// the beam walks the outlines in drawing order and every point it reaches stays lit, so by the end
// of the beat the mark glows, complete and legible, on the ground. In daylight the points are a dark
// blue instead (a glow does not read on a white floor).
import * as THREE from 'three';

// outlines in PNG pixels (x right, y down); each is a closed polyline unless `open`
const PLATE = [[71, 37], [339, 37], [339, 246], [71, 246]];
const U = [[101, 37], [131, 37], [131, 186], [279, 186], [279, 37], [309, 37], [309, 216], [101, 216]];
const CROSS_H = { open: true, pts: [[149, 111], [262, 111]] };
const CROSS_V = { open: true, pts: [[205, 56], [205, 168]] };
const PATHS = [{ pts: PLATE }, { pts: U }, CROSS_H, CROSS_V];
const CX = 205, CY = 141.5, PX_W = 268;   // the plate's centre and width (px)

/** Even points along each outline (spacing in px): the same step all the way round, corners included. */
function samplePaths(step) {
  const out = [];
  for (const p of PATHS) {
    const pts = p.open ? p.pts : [...p.pts, p.pts[0]];
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = cum[cum.length - 1], n = Math.max(1, Math.round(L / step));
    for (let k = 0; k < (p.open ? n + 1 : n); k++) {
      const t = (k * L) / n;
      let j = 1; while (j < cum.length - 1 && cum[j] < t) j++;
      const f = (t - cum[j - 1]) / Math.max(1e-9, cum[j] - cum[j - 1]);
      out.push([pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * f, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * f]);
    }
  }
  return out;
}

const UP = new THREE.Vector3(0, 1, 0);
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3();

export class LogoTrace {
  /**
   * @param {THREE.Scene} scene
   * @param {object} o
   * @param {THREE.Vector3} o.centre  the mark's centre on the floor (world)
   * @param {number} o.width          the plate's width on the floor (m)
   * @param {number} o.az             the reading direction: the mark's top points away from a camera at this azimuth (deg)
   */
  constructor(scene, { centre, width = 0.66, az = 35, spacing = 0.013 } = {}) {
    const s = width / PX_W;
    const a = THREE.MathUtils.degToRad(az);
    // on the floor: image right → screen right, image up → away from the camera
    const right = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
    const away = new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a));
    this.points = samplePaths(spacing / s).map(([x, y]) => centre.clone().addScaledVector(right, (x - CX) * s).addScaledVector(away, (CY - y) * s).setY(0.0016));
    this.corners = PLATE.map(([x, y]) => centre.clone().addScaledVector(right, (x - CX) * s).addScaledVector(away, (CY - y) * s).setY(0));
    const N = (this.count = this.points.length);

    this.night = new THREE.Color(0x52ffb4).multiplyScalar(2.6);   // a green glow that blooms
    this.dayCol = new THREE.Color(0x0a4f7c);                       // dark blue on the bright floor
    const dg = new THREE.CircleGeometry(spacing * 0.36, 12).rotateX(-Math.PI / 2);
    this.dots = new THREE.InstancedMesh(dg, new THREE.MeshBasicMaterial({ color: this.night.clone(), transparent: true, depthWrite: false, toneMapped: false }), N);
    this.dots.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    this.dots.frustumCulled = false;
    this.dots.renderOrder = 2;
    for (let i = 0; i < N; i++) { tmpM.makeScale(0, 0, 0); this.dots.setMatrixAt(i, tmpM); }
    // the beam from the lens to the point being written, and a spark where it lands
    const bg = new THREE.CylinderGeometry(0.0008, 0.0008, 1, 6, 1, true).translate(0, 0.5, 0);
    this.beam = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x56ffb0).multiplyScalar(9), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.beam.frustumCulled = false;
    this.spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xc8ffe6, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    this.spark.scale.setScalar(0.05);
    this.group = new THREE.Group();
    this.group.name = 'fx:logo';
    this.group.add(this.dots, this.beam, this.spark);
    this.group.visible = false;
    scene.add(this.group);
    this.origin = new THREE.Vector3();
    this.lastN = -1; this.lastA = -1;
  }

  /**
   * @param {THREE.Object3D|null} socket  the payload's optical-axis socket
   * @param {number} trace    0..1 how much of the mark has been written (<= 0: none)
   * @param {number} persist  0..1 how visible the written points are
   * @param {number} day      0..1 daylight
   */
  update(socket, trace, persist, day = 0) {
    const on = socket && trace > 0 && persist > 0.001;
    this.group.visible = !!on;
    if (!on) return;
    const N = this.count, f = THREE.MathUtils.clamp(trace, 0, 1) * N;
    const n = Math.min(N, Math.floor(f));
    // the newest points flash as they are written, then settle
    for (let i = 0; i < N; i++) {
      if (i >= n) { tmpM.makeScale(0, 0, 0); this.dots.setMatrixAt(i, tmpM); continue; }
      const age = (f - i) / 24;   // in points
      const b = 1 + 1.6 * Math.exp(-age * 3);
      tmpM.compose(this.points[i], tmpQ.identity(), tmpS.setScalar(1 + 0.6 * Math.exp(-age * 4)));
      this.dots.setMatrixAt(i, tmpM);
      this.dots.instanceColor.setXYZ(i, b, b, b);
    }
    this.lastN = n;
    this.dots.instanceMatrix.needsUpdate = true; this.dots.instanceColor.needsUpdate = true;
    this.dots.material.color.copy(this.night).lerp(this.dayCol, day);
    this.dots.material.opacity = persist;

    // the beam: only while writing
    const writing = trace > 0 && trace < 1 && n < N;
    this.beam.visible = this.spark.visible = writing;
    if (writing) {
      socket.updateWorldMatrix(true, false);
      socket.getWorldPosition(this.origin);
      const head = this.points[Math.min(N - 1, n)];
      tmpV.subVectors(head, this.origin);
      const len = tmpV.length();
      tmpQ.setFromUnitVectors(UP, tmpV.normalize());
      this.beam.position.copy(this.origin); this.beam.quaternion.copy(tmpQ); this.beam.scale.set(1, len, 1);
      this.spark.position.copy(head).setY(0.004);
    }
  }
}

function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(150,255,210,0.55)'); r.addColorStop(1, 'rgba(80,255,170,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
