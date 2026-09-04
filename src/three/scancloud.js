/* ==========================================================================
   three/scancloud.js — embedded "reality capture" point-cloud viewer.
   A procedural laser scan of an industrial building: points lie ON real
   surfaces (walls, gable roof, slab) with deterministic scan-noise jitter;
   openings (doors, windows) are actually absent from the cloud, like a scan.
   Drag to orbit; slow auto-rotate on the continuous clock.
   ========================================================================== */
import * as THREE from "three";
import {
  SceneBase, studioEnv, lightRig, cyclorama, radialSprite,
  clamp01, window01, fitDistance, rnd,
} from "./core.js";

const W = 11, H = 4.6, D = 6.5, ROOF = 2.2; // building dimensions (m-ish)

function opening(x, y, z, face) {
  /* door + window cut-outs on the +z face and one window on +x */
  if (face === "front") {
    if (Math.abs(x) < 1.1 && y < 2.6) return true;                    // door
    if (Math.abs(Math.abs(x) - 3.4) < 0.8 && y > 1.6 && y < 3.0) return true; // windows
  }
  if (face === "side") {
    if (Math.abs(z) < 0.9 && y > 1.8 && y < 3.2) return true;         // side window
  }
  return false;
}

function buildScanPoints() {
  const pts = [];
  const cols = [];
  const seeds = [];
  const cWall = new THREE.Color(0x0082ca).convertSRGBToLinear();
  const cRoof = new THREE.Color(0x67c4ea).convertSRGBToLinear();
  const cGround = new THREE.Color(0x14324e).convertSRGBToLinear();
  const cEdge = new THREE.Color(0xe7ff89).convertSRGBToLinear();
  const tmp = new THREE.Color();
  let n = 0;
  const push = (x, y, z, c, density = 1) => {
    /* deterministic scan noise — a scan is never perfectly on-surface */
    const jx = (rnd(n * 3.1) - 0.5) * 0.03;
    const jy = (rnd(n * 5.7) - 0.5) * 0.03;
    const jz = (rnd(n * 7.3) - 0.5) * 0.03;
    pts.push(x + jx, y + jy, z + jz);
    tmp.copy(c);
    if (rnd(n * 11.1) > 0.985) tmp.copy(cEdge); // sparse lime returns (reflectors)
    cols.push(tmp.r, tmp.g, tmp.b);
    seeds.push(rnd(n * 1.618));
    n++;
  };

  /* PERF (AMD-GPU thermal fix): STEP 0.12 -> 0.16 cuts building/roof points
     to ~56% (~19k -> ~11k total); a laser scan still reads dense at 16 cm. */
  const STEP = 0.16;
  /* four walls */
  for (let x = -W / 2; x <= W / 2; x += STEP) {
    for (let y = 0; y <= H; y += STEP) {
      if (!opening(x, y, 0, "front")) push(x, y, D / 2, cWall);
      push(x, y, -D / 2, cWall);
    }
  }
  for (let z = -D / 2; z <= D / 2; z += STEP) {
    for (let y = 0; y <= H; y += STEP) {
      if (!opening(0, y, z, "side")) push(W / 2, y, z, cWall);
      push(-W / 2, y, z, cWall);
    }
  }
  /* gable ends (triangles on ±x) */
  for (let z = -D / 2; z <= D / 2; z += STEP) {
    const gy = H + ROOF * (1 - Math.abs(z) / (D / 2));
    for (let y = H; y <= gy; y += STEP) {
      push(W / 2, y, z, cWall);
      push(-W / 2, y, z, cWall);
    }
  }
  /* roof planes */
  for (let x = -W / 2; x <= W / 2; x += STEP) {
    for (let z = -D / 2; z <= D / 2; z += STEP) {
      const y = H + ROOF * (1 - Math.abs(z) / (D / 2));
      push(x, y, z, cRoof);
    }
  }
  /* ground slab + sparse surroundings */
  for (let x = -W / 2 - 3; x <= W / 2 + 3; x += 0.34) {   // PERF: was 0.28
    for (let z = -D / 2 - 3; z <= D / 2 + 3; z += 0.34) { // ground is backdrop
      if (rnd((x + 40) * 13.7 + (z + 40) * 7.1) > 0.55) push(x, 0, z, cGround);
    }
  }
  return { pts: new Float32Array(pts), cols: new Float32Array(cols), seeds: new Float32Array(seeds) };
}

export class ScanCloudScene extends SceneBase {
  build() {
    const env = studioEnv(this.renderer);
    this.scene.environment = env;
    cyclorama(this.scene);
    lightRig(this.scene, { keyPos: [8, 10, 7], rimPos: [-8, 7, -7], target: [0, 2, 0] });

    const { pts, cols, seeds } = buildScanPoints();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pts, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(cols, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    geo.computeBoundingSphere();

    this.uniforms = {
      uAssemble: { value: 0 },
      /* PERF: 1.9 -> 1.6 — additive points with depthWrite off are pure
         fill-rate; size and count trade off against each other */
      uSize: { value: 1.6 },
      uGlow: { value: 1.0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute vec3 aColor;
        attribute float aSeed;
        uniform float uAssemble;
        uniform float uSize;
        uniform float uGlow;
        varying vec3 vColor;
        varying float vA;
        void main() {
          float stagger = 0.5;
          float t = clamp((uAssemble - aSeed * stagger) / (1.0 - stagger), 0.0, 1.0);
          t = 1.0 - pow(1.0 - t, 3.0);
          vColor = aColor * uGlow;
          vA = t;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          /* PERF: cap 14 -> 10 px. At the cap each point is 100px^2 instead
             of 196px^2 of additive blending — the close-up fill-rate spike
             is what cooked the GPU during drag-orbit. */
          gl_PointSize = min(uSize * (140.0 / -mv.z) * (0.4 + 0.6 * t), 10.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vColor;
        varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.12, d) * vA;
          gl_FragColor = vec4(vColor, a);
        }`,
    });
    this.cloud = new THREE.Points(geo, mat);
    this.cloud.name = "scanCloud";
    this.group = new THREE.Group();
    this.group.add(this.cloud);
    this.scene.add(this.group);

    /* ground shadow pool so the slab reads as seated, not floating */
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 24),
      new THREE.MeshBasicMaterial({
        map: radialSprite("rgba(0,130,202,0.16)"), transparent: true,
        depthWrite: false, toneMapped: false,
      })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = -0.02;
    pool.name = "lightPool";
    this.scene.add(pool);

    /* drag to orbit */
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

  apply(p) {
    this.progress = p;
    /* camera first */
    const d = fitDistance(this.camera, 8.2, 1.05);
    this.camera.position.set(d * 0.62, 4.4, d * 0.72);
    this.camera.lookAt(0, 1.9, 0);
    this.uniforms.uAssemble.value = window01(p, 0.0, 0.55);
    this.uniforms.uGlow.value = 0.9 + 0.35 * window01(p, 0.7, 1.0);
  }

  tickMotion(dt) {
    const auto = this.dragging ? 0 : 0.22;
    this.group.rotation.y += (auto + this.rotVel) * dt * 2.0;
    this.rotVel *= Math.pow(0.06, dt);
  }
}
