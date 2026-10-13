// Signature effects, one per instrument. Each is a pure function of a scroll-driven phase (so it
// scrubs backward cleanly and renders deterministically under ?frame=), plus an optional clock for
// the continuous shimmer. Lights are HDR (> 1.0) so the bloom pass picks them up.
import * as THREE from 'three';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function glowTexture(inner = [255, 255, 255], outer = [255, 255, 255]) {
  const S = 128; const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  rg.addColorStop(0, `rgba(${inner},1)`); rg.addColorStop(0.18, `rgba(${outer},0.55)`);
  rg.addColorStop(0.5, `rgba(${outer},0.12)`); rg.addColorStop(1, `rgba(${outer},0)`);
  g.fillStyle = rg; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const tmpV = new THREE.Vector3(); const tmpQ = new THREE.Quaternion(); const tmpM = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0); const ONE = new THREE.Vector3(1, 1, 1);

/* ------------------------------------------------------------------------------------------ */
/** Drone: a short burst of laser pulses from the payload's optical axis to the ground. */
export class PulseBurst {
  constructor(scene, { count = 18 } = {}) {
    this.count = count;
    const green = new THREE.Color(0x56ffb0);
    // streak: a thin cylinder along +Y, 1 unit long (scaled per pulse)
    const sg = new THREE.CylinderGeometry(0.0007, 0.0007, 1, 5, 1, true).translate(0, 0.5, 0);
    this.streaks = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({
      color: green.clone().multiplyScalar(14), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }), count);
    this.streaks.frustumCulled = false;
    this.streaks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    // ground returns: small discs that flash on impact and decay to a persistent faint point
    const dg = new THREE.CircleGeometry(0.0075, 18).rotateX(-Math.PI / 2);
    this.dots = new THREE.InstancedMesh(dg, new THREE.MeshBasicMaterial({
      color: green.clone().multiplyScalar(6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }), count);
    this.dots.frustumCulled = false;
    this.dots.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    // aperture flash at the lens
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([220, 255, 235], [80, 255, 170]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    this.flash.scale.setScalar(0.06);
    this.group = new THREE.Group();
    this.group.name = 'fx:pulses';
    this.group.add(this.streaks, this.dots, this.flash);
    this.group.visible = false;
    scene.add(this.group);
    this.origin = new THREE.Vector3(); this.dir = new THREE.Vector3();
  }

  /**
   * @param {THREE.Object3D|null} socket  payload optical-axis socket (world transform used)
   * @param {number} phase  0..1 through the burst window (scroll-driven); <0 or >1 hides streaks
   * @param {number} persist 0..1 visibility of the measured points after the burst
   */
  update(socket, phase, persist) {
    const on = socket && ((phase > 0 && phase <= 1) || persist > 0.001);
    this.group.visible = !!on;
    if (!on) return;
    socket.updateWorldMatrix(true, false);
    socket.getWorldPosition(this.origin);
    this.dir.set(0, 0, 1).transformDirection(socket.matrixWorld);   // optical axis = socket +Z
    const right = new THREE.Vector3().crossVectors(this.dir, UP).normalize();
    const N = this.count;
    const flight = 0.07;                   // fraction of the window one pulse is in the air
    let flash = 0;
    for (let i = 0; i < N; i++) {
      // a left-to-right scan: each pulse leaves a little later, sweeping ±14° across the axis
      const a = THREE.MathUtils.degToRad(-14 + 28 * (i / (N - 1)));
      const d = this.dir.clone().addScaledVector(right, Math.tan(a)).normalize();
      // ground hit (y = 0 plane); if the axis points up, cap the range
      const range = d.y < -0.02 ? (-this.origin.y / d.y) : 3;
      const hit = this.origin.clone().addScaledVector(d, range);
      const t0 = 0.08 + (i / N) * 0.62;
      const k = (phase - t0) / flight;      // 0..1 while in flight
      // streak: 0.09 m long, travels from the lens to the ground
      const len = Math.min(0.035, range);
      if (k > 0 && k < 1) {
        const headDist = k * range;
        const tailDist = Math.max(0, headDist - len);
        tmpV.copy(this.origin).addScaledVector(d, tailDist);
        tmpQ.setFromUnitVectors(UP, d);
        tmpM.compose(tmpV, tmpQ, new THREE.Vector3(1, Math.max(0.001, headDist - tailDist), 1));
        this.streaks.setMatrixAt(i, tmpM);
        this.streaks.instanceColor.setXYZ(i, 1, 1, 1);
        flash = Math.max(flash, 1 - k);
      } else {
        tmpM.makeScale(0, 0, 0);
        this.streaks.setMatrixAt(i, tmpM);
        this.streaks.instanceColor.setXYZ(i, 0, 0, 0);
      }
      // return dot: flashes at impact, settles to a faint persistent point
      const since = phase - (t0 + flight);
      let dot = 0;
      if (since > 0) dot = 0.55 + 1.6 * Math.exp(-since * 26);
      dot *= persist;
      tmpM.compose(hit.setY(0.0012), tmpQ.identity(), ONE.clone().multiplyScalar(since > 0 ? 1 + 1.6 * Math.exp(-since * 20) : 0.0001));
      this.dots.setMatrixAt(i, tmpM);
      this.dots.instanceColor.setXYZ(i, dot, dot, dot);
    }
    this.streaks.instanceMatrix.needsUpdate = true; this.streaks.instanceColor.needsUpdate = true;
    this.dots.instanceMatrix.needsUpdate = true; this.dots.instanceColor.needsUpdate = true;
    this.flash.position.copy(this.origin).addScaledVector(this.dir, 0.004);
    this.flash.material.opacity = phase > 0 && phase < 1 ? 0.25 + 0.75 * flash : 0;
  }
}

/* ------------------------------------------------------------------------------------------ */
/** GNSS: soft signal rings rising from the dome. Continuous phase from the clock, envelope from scroll. */
export class SignalRings {
  constructor(scene, { count = 4 } = {}) {
    this.count = count;
    this.rings = [];
    this.group = new THREE.Group();
    this.group.name = 'fx:rings';
    const geo = new THREE.RingGeometry(0.974, 1, 128, 1).rotateX(-Math.PI / 2);
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: new THREE.Color(0x8fdcff).multiplyScalar(1.7), transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      }));
      m.frustumCulled = false;
      this.rings.push(m); this.group.add(m);
    }
    // a faint halo on the dome crown
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([220, 245, 255], [90, 190, 255]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    this.halo.scale.setScalar(0.32);
    this.group.add(this.halo);
    this.group.visible = false;
    scene.add(this.group);
    this.top = new THREE.Vector3();
    this.box = new THREE.Box3();
  }

  /** @param {THREE.Object3D|null} dome  antenna node; @param {number} env 0..1; @param {number} clock seconds */
  update(dome, env, clock, camY = -10) {
    const on = dome && env > 0.001;
    this.group.visible = !!on;
    if (!on) return;
    this.box.setFromObject(dome, false);
    this.box.getCenter(this.top); this.top.y = this.box.max.y;
    const r0 = (this.box.max.x - this.box.min.x) * 0.5;
    for (let i = 0; i < this.count; i++) {
      const ph = (clock * 0.32 + i / this.count) % 1;      // rises over ~3.1 s
      const m = this.rings[i];
      m.position.copy(this.top).setY(this.top.y + 0.015 + ph * 0.62);
      const r = r0 * (0.8 + ph * 3.4);
      m.scale.set(r, 1, r);
      // fade in quickly, thin out as it widens
      // a ring seen exactly edge-on collapses to a broken sub-pixel line: fade it through eye level
      const edge = smooth(0.012, 0.07, Math.abs(m.position.y - camY));
      m.material.opacity = env * edge * Math.sin(Math.PI * Math.min(1, ph * 1.4)) * Math.pow(1 - ph, 1.6) * 0.75;
    }
    this.halo.position.copy(this.top).setY(this.top.y + 0.01);
    this.halo.material.opacity = 0.16 * env;
  }
}

/* ------------------------------------------------------------------------------------------ */
/** Total station: a red laser beam from the objective to a prism target that lights up on arrival. */
export class LaserShot {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'fx:laser';
    const red = new THREE.Color(0xff2a1a);
    const bg = new THREE.CylinderGeometry(0.0012, 0.0012, 1, 6, 1, true).translate(0, 0.5, 0);
    this.beam = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: red.clone().multiplyScalar(10), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.beam.frustumCulled = false;
    // soft sheath around the core so the beam reads at a distance
    const sg = new THREE.CylinderGeometry(0.006, 0.006, 1, 10, 1, true).translate(0, 0.5, 0);
    this.sheath = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: red.clone().multiplyScalar(0.9), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.sheath.frustumCulled = false;
    this.head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([255, 230, 220], [255, 60, 40]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    this.head.scale.setScalar(0.07);
    this.group.add(this.beam, this.sheath, this.head);

    // the prism target on its pole (a survey reflector), built here because it belongs to the effect
    this.target = new THREE.Group();
    this.target.name = 'fx:prism-target';
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 16).translate(0, 0.5, 0),
      new THREE.MeshStandardMaterial({ color: 0x9a9a94, roughness: 0.6, metalness: 0.2 }));
    const bands = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.1, 16),
      new THREE.MeshStandardMaterial({ color: 0xc8361e, roughness: 0.5 }));
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.03, 32).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xe0a420, roughness: 0.45, metalness: 0.1 }));
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.031, 32),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.05, metalness: 0.9, emissive: 0xff5040, emissiveIntensity: 0 }));
    this.glass = glass;
    this.pole = pole; this.bands = bands; this.housing = housing;
    this.target.add(pole, bands, housing, glass);
    this.spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([255, 245, 235], [255, 80, 50]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    this.spark.scale.setScalar(0.45);
    // the glow light lives at scene level: if it rode on the prism (whose visibility toggles) the
    // scene's light count would change and every material in view would recompile mid-scroll
    this.light = new THREE.PointLight(0xff4a30, 0, 2.2, 2);
    this.light.name = 'fx:prism-light';
    this.target.add(this.spark);
    scene.add(this.group, this.target, this.light);
    this.group.visible = false;
    this.origin = new THREE.Vector3(); this.dir = new THREE.Vector3(); this.end = new THREE.Vector3();
    this.distance = 0;
  }

  /**
   * Place the target once the instrument is aimed. `aimSocket` is the line-of-sight socket at the
   * final pose; `range` is the slant distance to the prism.
   */
  place(aimSocket, range) {
    aimSocket.updateWorldMatrix(true, false);
    aimSocket.getWorldPosition(this.origin);
    this.dir.set(0, 0, 1).transformDirection(aimSocket.matrixWorld);
    this.end.copy(this.origin).addScaledVector(this.dir, range);
    this.distance = range;
    this.placeEnd(0);
  }

  /** Put the prism glass at `point` (world), its pole standing on ground height `groundY`. */
  placeAt(point, groundY, from) {
    this.end.copy(point);
    this.dir.copy(point).sub(from).normalize();
    this.distance = point.distanceTo(from);
    this.placeEnd(groundY);
  }

  placeEnd(groundY) {
    const h = this.end.y - groundY;
    this.target.position.set(this.end.x, groundY, this.end.z);
    this.pole.scale.y = h - 0.045;
    this.bands.position.y = h * 0.55;
    // the prism faces the instrument
    const face = Math.atan2(-this.dir.x, -this.dir.z);
    this.housing.position.y = h; this.housing.rotation.y = face;
    this.glass.position.set(Math.sin(face) * 0.0152, h, Math.cos(face) * 0.0152); this.glass.rotation.y = face;
    this.spark.position.y = h;
    this.light.position.set(this.target.position.x + Math.sin(face) * 0.3, groundY + h, this.target.position.z + Math.cos(face) * 0.3);
  }

  /**
   * @param {THREE.Object3D|null} socket  live line-of-sight socket
   * @param {number} travel 0..1 beam head progress from the objective to the prism
   * @param {number} lit    0..1 how lit the prism is (arrival flash + glow)
   * @param {number} visible 0..1 visibility of the prism target
   * @param {number} beam    0..1 visibility of the beam itself
   */
  update(socket, travel, lit, visible, beam = 1) {
    this.target.visible = visible > 0.001;
    const on = socket && travel > 0 && visible > 0.001 && beam > 0.001;
    this.group.visible = !!on;
    this.glass.material.emissiveIntensity = 6 * lit;
    this.spark.material.opacity = lit * visible;
    this.spark.scale.setScalar(0.3 + 0.35 * lit);
    this.light.intensity = 0.6 * lit * visible;
    if (!on) return;
    socket.updateWorldMatrix(true, false);
    socket.getWorldPosition(tmpV);
    const to = this.end.clone();
    const full = tmpV.distanceTo(to);
    const len = Math.max(0.001, full * travel);
    const d = to.sub(tmpV).normalize();
    tmpQ.setFromUnitVectors(UP, d);
    for (const m of [this.beam, this.sheath]) {
      m.position.copy(tmpV); m.quaternion.copy(tmpQ); m.scale.set(1, len, 1);
    }
    this.sheath.material.opacity = 0.55 * visible * beam;
    this.beam.material.opacity = visible * beam;
    this.head.position.copy(tmpV).addScaledVector(d, len);
    this.head.material.opacity = (travel < 1 ? visible : visible * 0.5) * beam;
    this.head.scale.setScalar(travel < 1 ? 0.07 : 0.04);
  }
}

/* ------------------------------------------------------------------------------------------ */
/** Dust in the key light: slow-settling motes, visible only inside the spot cone. */
export class DustMotes {
  constructor(group, keyLight, { count = 240, size = 1.7 } = {}) {
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const pos = new Float32Array(count * 3); const ph = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rnd() - 0.5) * size; pos[i * 3 + 1] = rnd() * 1.9 + 0.05; pos[i * 3 + 2] = (rnd() - 0.5) * size;
      ph[i] = rnd();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
    const kp = keyLight.position, kt = keyLight.target.position;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 }, amount: { value: 0 }, pixel: { value: 1 },
        keyPos: { value: kp.clone() }, keyDir: { value: kt.clone().sub(kp).normalize() },
        cosOuter: { value: Math.cos(keyLight.angle) }, cosInner: { value: Math.cos(keyLight.angle * (1 - keyLight.penumbra)) },
      },
      vertexShader: /* glsl */`
        attribute float phase; uniform float time; uniform float pixel; uniform vec3 keyPos; uniform vec3 keyDir;
        uniform float cosOuter; uniform float cosInner; varying float vLit;
        void main() {
          vec3 p = position;
          // settle slowly and drift sideways on a smooth, per-mote path (no jitter)
          float y = mod(p.y - time * (0.006 + 0.01 * phase), 1.95);
          p.y = y + 0.05;
          p.x += 0.05 * sin(time * 0.11 + phase * 31.0) + 0.02 * sin(time * 0.31 + phase * 7.0);
          p.z += 0.05 * cos(time * 0.09 + phase * 17.0);
          vec3 d = normalize(p - keyPos);
          // (a mote fades out at the floor and in at the top as it wraps round, instead of popping)
          float wrap = smoothstep(0.0, 0.08, y) * smoothstep(1.95, 1.8, y);
          vLit = smoothstep(cosOuter, cosInner, dot(d, keyDir)) * (0.35 + 0.65 * fract(phase * 7.13)) * wrap;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          // never smaller than 2.5 px: a sub-pixel point snaps from pixel to pixel as it drifts (and as
          // the camera moves) and twinkles; a smaller mote is drawn at 2.5 px and dimmer instead
          float sz = pixel * (1.2 + 2.2 * fract(phase * 3.7)) * (2.2 / max(0.3, -mv.z));
          float px = max(sz, 2.5 * pixel);
          vLit *= (sz * sz) / (px * px);
          gl_PointSize = px;
        }`,
      fragmentShader: /* glsl */`
        uniform float amount; varying float vLit;
        void main() {
          vec2 c = gl_PointCoord - 0.5; float r = dot(c, c);
          float a = smoothstep(0.25, 0.0, r);
          gl_FragColor = vec4(vec3(1.0, 0.9, 0.78) * a * vLit * amount, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.name = 'fx:dust';
    group.add(this.points);
  }

  update(clock, amount, pixel) {
    this.mat.uniforms.time.value = clock;
    this.mat.uniforms.amount.value = amount;
    this.mat.uniforms.pixel.value = pixel;
    this.points.visible = amount > 0.002;
  }
}

/* ------------------------------------------------------------------------------------------ */
/**
 * The title's overhead spotlight, made visible: a soft shaft of light falling onto the subject, faked
 * with a camera-facing trapezoid and a painted gradient (bright at the floor, gone by ~1.5 m up, soft
 * at the sides), drawn additively. A MeshBasicMaterial with a map: the same program as the contact
 * shadows' planes, so it adds no shader to warm.
 */
export class LightShaft {
  constructor(scene, { height = 1.55, top = 0.16, bottom = 0.86 } = {}) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256;
    const g = c.getContext('2d');
    const img = g.createImageData(64, 256);
    // (canvas row 0 is the top of the shaft: the texture is flipped onto the plane)
    for (let y = 0; y < 256; y++) {
      const up = Math.pow(y / 255, 1.7);                      // gone at the top, strongest at the floor
      for (let x = 0; x < 64; x++) {
        const t = Math.abs(x / 63 - 0.5) * 2;                 // 0 centre → 1 edge
        const side = Math.pow(Math.max(0, 1 - t * t), 1.6);   // soft, fresnel-like edges
        const a = side * up;
        const i = (y * 64 + x) * 4;
        img.data[i] = 255; img.data[i + 1] = 244; img.data[i + 2] = 226; img.data[i + 3] = Math.round(255 * Math.min(1, a));
      }
    }
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.BufferGeometry();
    // a trapezoid in the local x/y plane: y 0 (floor) to 1 (top), narrow at the top
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-bottom / 2, 0, 0, bottom / 2, 0, 0, top / 2, 1, 0, -top / 2, 1, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: tex, color: new THREE.Color(1.1, 1.0, 0.92), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
    }));
    this.mesh.name = 'fx:shaft';
    this.mesh.frustumCulled = false;
    this.mesh.scale.y = height;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** @param {THREE.Vector3} floor the pool's centre on the floor (world); @param {number} a 0..1 */
  update(floor, camPos, a) {
    this.mesh.visible = a > 0.002;
    if (!this.mesh.visible) return;
    this.mesh.position.copy(floor);
    this.mesh.rotation.set(0, Math.atan2(camPos.x - floor.x, camPos.z - floor.z), 0);   // faces the camera
    this.mesh.material.opacity = a;
  }
}

export { smooth, clamp01 };
