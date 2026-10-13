// Fly mode: the L2 / Mapper+ LiDAR. A non-repetitive rosette (two Risley prisms turning at an
// irrational speed ratio, as Livox-based scanners do, 70° field of view) cast analytically against the
// heightfield, the tree cones and the truck (query.js). Returns go into a preallocated ring buffer of
// Q.lidarCap points: nothing is reallocated, and only the newly written range of each attribute is
// uploaded (BufferAttribute.addUpdateRange). Colour by elevation, intensity or RGB is a uniform, so
// switching it neither re-uploads nor compiles anything.
import * as THREE from 'three';
import { FIELD } from '../field.js';

const DEG = Math.PI / 180;
const FOV = 70;                 // degrees, circular
const RANGE = 250;              // m (L2: 450 m at 50 % reflectivity; kept short here)
const FAN = 64;                 // laser lines drawn from the payload
const SITE_N = 325, SITE_HALF = 650, SITE_CELL = 4;
export const LIDAR_MODES = ['Elevation', 'Intensity', 'RGB'];

export class Lidar {
  constructor(scene, query, Q) {
    this.query = query;
    this.cap = Q.lidarCap;
    this.rate = Math.round(this.cap / 15);           // rays per second: fills the buffer in ~15 s
    this.head = 0; this.count = 0; this.total = 0;
    this.t = 0;                                      // rosette clock
    this.carry = 0;
    this.on = false;
    this.mode = 0;
    this.dirtyFrom = -1; this.dirtyN = 0;

    const geo = new THREE.BufferGeometry();
    const mk = (n, Arr = Float32Array, norm = false) => { const a = new THREE.BufferAttribute(new Arr(this.cap * n), n, norm); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aPos = mk(3); this.aInfo = mk(2); this.aCol = mk(3, Uint8Array, true);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aInfo', this.aInfo);
    geo.setAttribute('aCol', this.aCol);
    geo.setDrawRange(0, 0);
    this.uniforms = { uMode: { value: 0 }, uPixel: { value: 1 }, uElev: { value: new THREE.Vector2(-9, 14) }, uSize: { value: 100 } };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        attribute vec2 aInfo; attribute vec3 aCol;
        uniform float uMode; uniform float uPixel; uniform vec2 uElev; uniform float uSize;
        varying vec3 vC;
        vec3 ramp(float t){ return clamp(vec3(1.5 - abs(4.0 * t - 3.0), 1.5 - abs(4.0 * t - 2.0), 1.5 - abs(4.0 * t - 1.0)), 0.0, 1.0); }
        void main(){
          float e = clamp((aInfo.x - uElev.x) / (uElev.y - uElev.x), 0.0, 1.0);
          vec3 cE = ramp(e); cE = cE * cE * 0.95;             // saturated: reads against the grass
          float i = aInfo.y;
          vec3 cI = mix(vec3(0.05, 0.06, 0.09), vec3(1.0, 0.97, 0.9), pow(i, 0.8));
          vec3 cR = aCol * aCol * 1.4;                    // stored in display space: back to linear
          vC = uMode < 0.5 ? cE : uMode < 1.5 ? cI : cR;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          mv.xyz -= normalize(mv.xyz) * 0.06;             // a hair toward the eye: never buried in the ground
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uPixel * clamp(uSize / -mv.z, 2.0, 5.0);
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vC;
        void main(){ vec2 c = gl_PointCoord - 0.5; float r = dot(c, c); if (r > 0.25) discard; gl_FragColor = vec4(r > 0.12 ? vC * 0.35 : vC, 1.0); }`,   // a dark rim
      fog: false,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.name = 'fly:lidar-cloud';
    scene.add(this.points);

    // the fan: FAN laser lines from the emitter to their returns, fading with age
    const fg = new THREE.BufferGeometry();
    this.fanPos = new THREE.BufferAttribute(new Float32Array(FAN * 2 * 3), 3); this.fanPos.setUsage(THREE.DynamicDrawUsage);
    this.fanA = new THREE.BufferAttribute(new Float32Array(FAN * 2), 1); this.fanA.setUsage(THREE.DynamicDrawUsage);
    fg.setAttribute('position', this.fanPos); fg.setAttribute('aA', this.fanA);
    this.fanU = { uColor: { value: new THREE.Color(0x56ffb0) }, uAlpha: { value: 1 } };
    this.fan = new THREE.LineSegments(fg, new THREE.ShaderMaterial({
      uniforms: this.fanU,
      vertexShader: 'attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uAlpha; varying float vA; void main(){ gl_FragColor = vec4(uColor * vA * uAlpha, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    this.fan.frustumCulled = false;
    this.fan.visible = false;
    this.fan.name = 'fly:lidar-fan';
    scene.add(this.fan);
    this.fanHead = 0;

    // coverage of the staked parcel (1 m cells) and of the site (2 m cells), for the counters
    const P = FIELD.parcel;
    this.pc = { cx: P.cx, cz: P.cz, c: Math.cos(P.rot), s: Math.sin(P.rot), na: Math.round(2 * P.ha), nb: Math.round(2 * P.hc), ha: P.ha, hc: P.hc };
    this.parcelHits = new Uint16Array(this.pc.na * this.pc.nb);
    this.parcelCovered = 0;
    this.siteHits = new Uint8Array(SITE_N * SITE_N);   // 4 m cells over the flying area
    this.eMin = Infinity; this.eMax = -Infinity;
    this.siteCovered = 0;
    this._d = new THREE.Vector3();
  }

  /** The elevation colour ramp's range (scene metres): the site's own relief. */
  setRange(lo, hi) { this.uniforms.uElev.value.set(lo, hi); }

  setMode(m) { this.mode = ((m % 3) + 3) % 3; this.uniforms.uMode.value = this.mode; }

  clear() {
    this.head = 0; this.count = 0; this.total = 0; this.eMin = Infinity; this.eMax = -Infinity;
    this.points.geometry.setDrawRange(0, 0);
    this.parcelHits.fill(0); this.parcelCovered = 0;
    this.siteHits.fill(0); this.siteCovered = 0;
  }

  /**
   * Scan for dt seconds from an emitter: o (world position), f / r / u (unit forward = boresight,
   * right, up). budgetMs caps the time spent this call (the rest carries over to the next frame).
   */
  scan(dt, o, f, r, u, budgetMs = 2.5) {
    if (!this.on) { this.fan.visible = false; return 0; }
    this.carry += dt * this.rate;
    let n = Math.floor(this.carry);
    this.carry -= n;
    const t0 = performance.now();
    const R = Math.tan(FOV / 2 * DEG);
    // two prisms at an irrational speed ratio: the petals precess and never repeat (a Livox rosette),
    // fast enough that a second of returns fills the field of view
    const w1 = 2 * Math.PI * 61.7, w2 = 2 * Math.PI * 38.13;
    const step = 1 / this.rate;
    const fanEvery = Math.max(1, Math.floor(n / 16));
    let done = 0;
    const d = this._d;
    for (let i = 0; i < n; i++) {
      if ((i & 15) === 15 && performance.now() - t0 > budgetMs) { this.carry += n - i; break; }
      this.t += step;
      const a = this.t;
      const px = 0.5 * R * (Math.cos(w1 * a) + Math.cos(w2 * a));
      const py = 0.5 * R * (Math.sin(w1 * a) - Math.sin(w2 * a));
      d.set(f.x + r.x * px + u.x * py, f.y + r.y * px + u.y * py, f.z + r.z * px + u.z * py).normalize();
      const h = this.query.ray(o.x, o.y, o.z, d.x, d.y, d.z, RANGE);
      done++;
      if (i % fanEvery === 0) this.fanLine(o, d, h);
      if (!h) continue;
      this.write(h);
    }
    this.fadeFan(dt);
    this.fan.visible = true;
    return done;
  }

  write(h) {
    const i = this.head;
    // a centimetre or two of ranging noise, like a real return
    const nz = (Math.random() - 0.5) * 0.03;
    this.aPos.array[i * 3] = h.x; this.aPos.array[i * 3 + 1] = h.y + nz; this.aPos.array[i * 3 + 2] = h.z;
    this.aInfo.array[i * 2] = h.y; this.aInfo.array[i * 2 + 1] = h.intensity;
    const enc = (v) => Math.max(0, Math.min(255, Math.round(Math.sqrt(Math.max(0, v)) * 255)));
    this.aCol.array[i * 3] = enc(h.r); this.aCol.array[i * 3 + 1] = enc(h.g); this.aCol.array[i * 3 + 2] = enc(h.b);
    if (this.dirtyFrom < 0) { this.dirtyFrom = i; this.dirtyN = 0; }
    this.dirtyN = Math.min(this.cap, this.dirtyN + 1);
    this.head = (i + 1) % this.cap;
    this.count = Math.min(this.cap, this.count + 1);
    this.total++;
    if (h.y < this.eMin) this.eMin = h.y;
    if (h.y > this.eMax) this.eMax = h.y;
    // coverage
    const sx = Math.floor((h.x + SITE_HALF) / SITE_CELL), sz = Math.floor((h.z + SITE_HALF) / SITE_CELL);
    if (sx >= 0 && sz >= 0 && sx < SITE_N && sz < SITE_N) { const k = sz * SITE_N + sx; if (this.siteHits[k] === 0) this.siteCovered++; if (this.siteHits[k] < 255) this.siteHits[k]++; }
    const P = this.pc, dx = h.x - P.cx, dz = h.z - P.cz;
    const la = dx * P.c + dz * P.s, lb = -dx * P.s + dz * P.c;
    if (Math.abs(la) < P.ha && Math.abs(lb) < P.hc && (h.kind === 'ground' || h.kind === 'gcp')) {
      const ia = Math.floor(la + P.ha), ib = Math.floor(lb + P.hc), k = ib * P.na + ia;
      if (this.parcelHits[k] === 0) this.parcelCovered++;
      if (this.parcelHits[k] < 65535) this.parcelHits[k]++;
    }
  }

  fanLine(o, d, h) {
    const k = this.fanHead; this.fanHead = (k + 1) % FAN;
    const end = h ? h.t : 40;
    const a = this.fanPos.array;
    a[k * 6] = o.x; a[k * 6 + 1] = o.y; a[k * 6 + 2] = o.z;
    a[k * 6 + 3] = o.x + d.x * end; a[k * 6 + 4] = o.y + d.y * end; a[k * 6 + 5] = o.z + d.z * end;
    this.fanA.array[k * 2] = h ? 0.05 : 0.02; this.fanA.array[k * 2 + 1] = h ? 0.55 : 0.0;
  }

  fadeFan(dt) {
    const a = this.fanA.array, k = Math.exp(-dt / 0.12);
    for (let i = 0; i < a.length; i++) a[i] *= k;
    this.fanPos.needsUpdate = true; this.fanA.needsUpdate = true;
  }

  /** Upload what changed since the last call (call once per frame, before rendering). */
  flush(pixel) {
    this.uniforms.uPixel.value = pixel;
    // colour by the cloud's own elevation extent (a uniform: recolours every point, uploads nothing)
    if (this.eMax > this.eMin) { const e = this.uniforms.uElev.value; e.x += (this.eMin - 0.5 - e.x) * 0.2; e.y += (Math.max(this.eMin + 6, this.eMax + 0.5) - e.y) * 0.2; }
    this.points.geometry.setDrawRange(0, this.count);
    if (this.dirtyFrom < 0) return;
    const from = this.dirtyFrom, n = this.dirtyN;
    for (const [attr, size] of [[this.aPos, 3], [this.aInfo, 2], [this.aCol, 3]]) {
      if (from + n <= this.cap) attr.addUpdateRange(from * size, n * size);
      else { attr.addUpdateRange(from * size, (this.cap - from) * size); attr.addUpdateRange(0, (from + n - this.cap) * size); }
      attr.needsUpdate = true;
    }
    this.dirtyFrom = -1; this.dirtyN = 0;
  }

  get stats() {
    const area = this.siteCovered * SITE_CELL * SITE_CELL;
    return {
      count: this.count, total: this.total, cap: this.cap,
      density: area > 0 ? this.total / area : 0,
      coverage: this.parcelCovered / (this.pc.na * this.pc.nb),
    };
  }
}
