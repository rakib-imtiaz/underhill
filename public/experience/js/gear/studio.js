// Underhill v2 — gear playground: the slim one-instrument studio (NOT the film's 9-light Stage).
//
// A small field diorama round the origin: a circular ground patch (gravel at the setup, grass beyond,
// vertex colours + a fine noise map) that fogs into a soft horizon (a sky dome whose horizon colour is
// the fog colour), a survey nail with pink paint (CP-01, the origin), an orange lath with flagging, a
// GCP checker target and a 360 prism on a pole a few metres off, plus the props the missions use
// (backsight prism, rover pole, staked lath, stake stubs and line, plummet laser, stake-out ring and
// arrow, landing mat). Every prop is built here at boot, so warm() compiles their programs with the
// gear's model before it is shown and nothing compiles mid-mission.
//
// Lights: a hemisphere fill, a warm key (DirectionalLight, the only shadow caster, high tier only), a
// cool rim that stays behind the subject from the camera's side, and the LaserShot's point light
// (always in the scene at intensity 0 when off, so the light count never changes). A contact shadow
// (depth from below, blurred) grounds the instrument on every tier. Day / night lerps colours and
// intensities only (uniforms): no new programs.
//
// Units: metres. +X east, −Z north, +Y up. The origin is CP-01: UTM 11N E 441422.273 N 5620129.047,
// elevation 412.000 (the film's site).
import * as THREE from 'three';
import { LaserShot, SignalRings } from '../effects.js';

export const CS_LAYER = 3;                       // the contact shadow camera sees only this layer
export const CP01 = Object.freeze({ E: 441422.273, N: 5620129.047, El: 412.0 });
/** Scene point → survey coordinates (UTM 11N metres, elevation). */
export const toSurvey = (p) => ({ E: CP01.E + p.x, N: CP01.N - p.z, El: CP01.El + p.y });

// where the diorama's props stand (world x, z)
export const SPOTS = Object.freeze({
  gcp: [-1.75, 1.15],
  lath: [-1.15, -1.55],
  prism: [2.6, -2.9],          // PR-1: the 360 prism on its pole (foresight)
  backsight: [-3.4, -3.0],     // BS-02: a prism on a tripod over known control
});
export const PRISM_H = 1.8;     // pole height to the prism's base
export const PRISM_GLASS_Y = PRISM_H + 0.038;
export const BS_GLASS_Y = 1.36;

const DAY = {
  top: 0x5d9ad4, mid: 0xdde8ef, bottom: 0xd2dbd8, glow: 0xfff1d6,
  hemiSky: 0xd5e8ff, hemiGround: 0x726650, hemi: 1.15,
  key: 0xfff2df, keyI: 3.1, rim: 0xffffff, rimI: 0.9, env: 0.85, exposure: 1.0,
};
const NIGHT = {
  top: 0x040b16, mid: 0x163049, bottom: 0x0b1724, glow: 0x5cc0f5,
  hemiSky: 0x36577d, hemiGround: 0x15140f, hemi: 0.62,
  key: 0xffd6a8, keyI: 2.5, rim: 0x8fd0ff, rimI: 1.9, env: 0.32, exposure: 1.05,
};

function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, g: c.getContext('2d') };
}
function tex(c, { srgb = true, repeat = 0, aniso = 1 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  t.anisotropy = aniso;
  return t;
}
let seed = 11;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
function hash(i, j) { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z) => vnoise(x, z) * 0.55 + vnoise(x * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, z * 4.3) * 0.15;

/* ------------------------------------------------------------------------- environment */
function paintedEnvironment(renderer) {
  const W = 512, H = 256;
  const { c, g } = canvas2d(W, H);
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#7f97b0'); grd.addColorStop(0.47, '#c9d4dc'); grd.addColorStop(0.5, '#9aa39a');
  grd.addColorStop(0.56, '#5d5a4f'); grd.addColorStop(1, '#2c2a25');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  const blob = (x, y, r, col) => { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); };
  blob(190, 62, 70, 'rgba(255,246,228,0.95)');   // the key's side of the sky
  blob(450, 90, 60, 'rgba(170,215,255,0.55)');   // the rim's side
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromEquirectangular(t).texture;
  pm.dispose(); t.dispose();
  return env;
}

/* ------------------------------------------------------------------------ the sky dome */
function skyDome() {
  const mat = new THREE.ShaderMaterial({
    name: 'gear-sky',
    uniforms: {
      top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bottom: { value: new THREE.Color() },
      glow: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0.5, 0.5, 0.6).normalize() },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 glow; uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 c = y > 0.0 ? mix(mid, top, pow(clamp(y / 0.55, 0.0, 1.0), 0.75)) : mix(mid, bottom, clamp(-y * 5.0, 0.0, 1.0));
        float s = max(dot(d, sunDir), 0.0);
        c += glow * (pow(s, 10.0) * 0.35 + pow(s, 120.0) * 0.4) * smoothstep(-0.05, 0.08, y);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), mat);
  m.name = 'gear:sky';
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

/* ---------------------------------------------------------------------- the ground patch */
function groundPatch(Q) {
  const R = 11, RINGS = Q.tier === 'lite' ? 30 : 44, SEG = Q.tier === 'lite' ? 96 : 140;
  const pos = [], col = [], uv = [], idx = [];
  const gravel = new THREE.Color(0x8a857b), gravelDark = new THREE.Color(0x5f5a52), grass = new THREE.Color(0x56603a), grassDry = new THREE.Color(0x8a8350);
  const tmp = new THREE.Color();
  pos.push(0, 0, 0); col.push(gravel.r, gravel.g, gravel.b); uv.push(0, 0);
  for (let i = 1; i <= RINGS; i++) {
    const r = R * Math.pow(i / RINGS, 1.6);
    for (let j = 0; j < SEG; j++) {
      const a = (j / SEG) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const n = fbm(x * 0.9 + 3, z * 0.9 - 2);
      const y = r > 4 ? (fbm(x * 0.35, z * 0.35) - 0.5) * 0.12 * Math.min(1, (r - 4) / 4) : 0;
      pos.push(x, y, z);
      uv.push(x, z);
      // gravel pad at the setup, grass beyond, a worn edge between
      const k = THREE.MathUtils.smoothstep(r + (n - 0.5) * 1.4, 1.7, 3.3);
      tmp.copy(gravel).lerp(gravelDark, Math.max(0, n - 0.45) * 1.2);
      const gr = grass.clone().lerp(grassDry, THREE.MathUtils.clamp(fbm(x * 0.4 - 7, z * 0.4 + 5) * 1.3 - 0.35, 0, 1));
      tmp.lerp(gr, k);
      const v = 0.9 + hash(Math.round(x * 9), Math.round(z * 9)) * 0.18;
      col.push(tmp.r * v, tmp.g * v, tmp.b * v);
    }
  }
  for (let j = 0; j < SEG; j++) idx.push(0, 1 + ((j + 1) % SEG), 1 + j);
  for (let i = 1; i < RINGS; i++) {
    const a0 = 1 + (i - 1) * SEG, b0 = 1 + i * SEG;
    for (let j = 0; j < SEG; j++) {
      const j1 = (j + 1) % SEG;
      idx.push(a0 + j, a0 + j1, b0 + j, a0 + j1, b0 + j1, b0 + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // fine speckle: tiled grey noise multiplied over the vertex colours
  const S = Math.min(512, Q.texSize);
  const { c, g: cx } = canvas2d(S, S);
  const img = cx.createImageData(S, S); const d = img.data;
  for (let i = 0; i < d.length; i += 4) { const v = 196 + rnd() * 59; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  cx.putImageData(img, 0, 0);
  for (let k = 0; k < S * 0.9; k++) { cx.fillStyle = `rgba(${rnd() < 0.5 ? '40,38,34' : '255,250,240'},${0.25 + rnd() * 0.3})`; const r = 0.6 + rnd() * 1.6; cx.beginPath(); cx.arc(rnd() * S, rnd() * S, r, 0, 7); cx.fill(); }
  const map = tex(c, { repeat: 1, aniso: Q.aniso });
  map.repeat.set(1.6, 1.6);
  const mat = new THREE.MeshStandardMaterial({ name: 'gear-ground', vertexColors: true, map, roughness: 0.96, metalness: 0 });
  const m = new THREE.Mesh(g, mat);
  m.name = 'gear:ground';
  m.receiveShadow = true;
  return m;
}

/* ----------------------------------------------------------------- decals and textures */
function decal(texture, size, { opacity = 1, blend = THREE.NormalBlending, y = 0.002 } = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity, depthWrite: false, blending: blend, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.position.y = y;
  m.renderOrder = 1;
  return m;
}
function blobTexture() {
  const { c, g } = canvas2d(128, 128);
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(0,0,0,0.55)'); rg.addColorStop(0.5, 'rgba(0,0,0,0.22)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  return tex(c);
}
function paintTexture() {
  const S = 256; const { c, g } = canvas2d(S, S);
  g.translate(S / 2, S / 2);
  g.strokeStyle = 'rgba(255,60,150,0.92)'; g.fillStyle = 'rgba(255,60,150,0.92)';
  g.lineWidth = 12; g.beginPath(); g.arc(0, 0, 70, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 9;
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) { g.save(); g.rotate(a); g.beginPath(); g.moveTo(0, -84); g.lineTo(0, -118); g.stroke(); g.restore(); }
  // overspray
  for (let i = 0; i < 260; i++) { const a = rnd() * 7, r = 64 + (rnd() - 0.5) * 26; g.globalAlpha = rnd() * 0.5; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, rnd() * 2.2, 0, 7); g.fill(); }
  return tex(c);
}
function checkerTexture() {
  const S = 256; const { c, g } = canvas2d(S, S);
  g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#121212'; g.fillRect(10, 10, S / 2 - 10, S / 2 - 10); g.fillRect(S / 2, S / 2, S / 2 - 10, S / 2 - 10);
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.strokeRect(2, 2, S - 4, S - 4);
  return tex(c);
}
function padTexture() {
  const S = 512; const { c, g } = canvas2d(S, S);
  g.translate(S / 2, S / 2);
  g.fillStyle = '#ef7d22'; g.beginPath(); g.arc(0, 0, 250, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1d5d9c'; g.beginPath(); g.arc(0, 0, 200, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 186, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#ffffff'; g.font = '700 220px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', 0, 10);
  return tex(c);
}

/* ------------------------------------------------------------------------------- props */
const STD = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });

function lathGroup(mats) {
  const g = new THREE.Group();
  const wood = new THREE.Mesh(new THREE.BoxGeometry(0.038, 1.2, 0.012).translate(0, 0.6, 0), mats.wood);
  const paint = new THREE.Mesh(new THREE.BoxGeometry(0.0395, 0.24, 0.0135).translate(0, 1.08, 0), mats.orange);
  const point = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 4).rotateX(Math.PI).translate(0, -0.03, 0), mats.wood);
  for (const m of [wood, paint, point]) { m.castShadow = true; m.receiveShadow = true; }
  g.add(wood, paint, point);
  // flagging: two ribbons tied below the top, curling in the breeze
  const ribbon = (len, phase) => {
    const geo = new THREE.PlaneGeometry(0.026, len, 1, 10).translate(0, -len / 2, 0);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = -p.getY(i) / len;
      p.setX(i, p.getX(i) + Math.sin(t * 3 + phase) * 0.018 * t + t * 0.05);
      p.setZ(i, p.getZ(i) + t * t * 0.07);
    }
    geo.computeVertexNormals();
    return geo;
  };
  const f1 = new THREE.Mesh(ribbon(0.36, 0), mats.flagPink); f1.position.set(0.02, 1.13, 0.004);
  const f2 = new THREE.Mesh(ribbon(0.3, 1.7), mats.flagOrange); f2.position.set(0.02, 1.12, -0.004); f2.rotation.y = 0.5;
  f1.castShadow = f2.castShadow = true;
  g.add(f1, f2);
  g.rotation.z = 0.035;
  return g;
}

function prism360(mats) {
  // a Leica-style 360 prism: six corner-cube faces between two caps, a yellow trim ring
  const g = new THREE.Group();
  const capGeo = new THREE.CylinderGeometry(0.036, 0.039, 0.012, 24);
  const top = new THREE.Mesh(capGeo, mats.darkGrey); top.position.y = 0.064;
  const bot = new THREE.Mesh(capGeo, mats.darkGrey); bot.position.y = 0.012; bot.rotation.x = Math.PI;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.0425, 0.0425, 0.046, 6), mats.prismGlass); ring.position.y = 0.038;
  const trim = new THREE.Mesh(new THREE.CylinderGeometry(0.0375, 0.0375, 0.005, 24), mats.yellow); trim.position.y = 0.073;
  const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 12), mats.darkGrey); stub.position.y = 0.083;
  for (const m of [top, bot, ring, trim, stub]) { m.castShadow = true; }
  g.add(top, bot, ring, trim, stub);
  return g;
}

function prismPole(mats) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, PRISM_H, 16).translate(0, PRISM_H / 2, 0), mats.alu);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0125, 0.05, 12).rotateX(Math.PI).translate(0, -0.02, 0), mats.steel);
  pole.castShadow = true;
  g.add(pole, tip);
  for (const y of [0.3, 0.6, 0.9, 1.2, 1.5]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0129, 0.0129, 0.05, 16), mats.red); b.position.y = y; g.add(b); }
  const bubble = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 16), mats.darkGrey); bubble.position.set(0.024, 1.3, 0);
  g.add(bubble);
  // bipod
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.26, 8).translate(0, -0.63, 0), mats.darkGrey);
    leg.position.set(0, 1.18, 0);
    leg.rotation.set(0.36, Math.PI + s * 0.55, 0, 'YXZ');   // hangs down, splayed back from the pole
    leg.castShadow = true;
    g.add(leg);
  }
  const p = prism360(mats); p.position.y = PRISM_H; g.add(p);
  g.userData.glassY = PRISM_GLASS_Y;
  return g;
}

function backsightTripod(mats) {
  const g = new THREE.Group();
  const headY = 1.24;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const foot = new THREE.Vector3(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42);
    const top = new THREE.Vector3(Math.cos(a) * 0.05, headY, Math.sin(a) * 0.05);
    const len = foot.distanceTo(top);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.011, len, 8).translate(0, -len / 2, 0), mats.yellow);
    leg.position.copy(top);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), foot.clone().sub(top).normalize());
    leg.castShadow = true;
    g.add(leg);
  }
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.022, 24), mats.darkGrey); head.position.y = headY + 0.01;
  const tri = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.03, 3), mats.charcoal); tri.position.y = headY + 0.036;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8), mats.darkGrey); post.position.y = headY + 0.08;
  const holder = new THREE.Group(); holder.position.y = BS_GLASS_Y;
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.034, 28).rotateX(Math.PI / 2), mats.yellow);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.033, 28), mats.prismGlass); glass.position.z = 0.0175;
  const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.01, 0.02), mats.charcoal); yoke.position.y = -0.05;
  holder.add(housing, glass, yoke);
  for (const m of [head, tri, post, housing]) m.castShadow = true;
  g.add(head, tri, post, holder);
  g.userData.holder = holder;
  return g;
}

function roverPole(mats) {
  // R12i on a 2 m carbon pole with the TSC7 on its bracket
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 1.95, 16).translate(0, 0.975, 0), mats.carbon);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0125, 0.05, 12).rotateX(Math.PI).translate(0, -0.02, 0), mats.steel);
  const body = new THREE.Mesh(new THREE.LatheGeometry([[0.0, 0], [0.056, 0.002], [0.0595, 0.012], [0.0595, 0.07]].map(([r, y]) => new THREE.Vector2(r, y)), 32), mats.r12Grey);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0598, 0.0598, 0.007, 32), mats.yellow); band.position.y = 0.0735;
  const dome = new THREE.Mesh(new THREE.LatheGeometry([[0.0596, 0], [0.059, 0.016], [0.052, 0.04], [0.036, 0.058], [0.0, 0.066]].map(([r, y]) => new THREE.Vector2(r, y)), 32), mats.offWhite);
  dome.position.y = 0.077;
  const head = new THREE.Group(); head.position.y = 1.95; head.add(body, band, dome);
  const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.14, 8).translate(0, -0.07, 0), mats.charcoal); whip.position.set(0.062, 0.02, 0); whip.rotation.z = -0.15; head.add(whip);
  const tsc = new THREE.Group(); tsc.position.set(0, 1.22, 0.07); tsc.rotation.x = -0.65;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.205, 0.042), mats.charcoal);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.11), mats.screen); screen.position.set(0, 0.035, 0.0215);
  const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.06), mats.keys); keys.position.set(0, -0.06, 0.0215);
  tsc.add(slab, screen, keys);
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.07), mats.darkGrey); bracket.position.set(0, 1.21, 0.035);
  const bubble = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 16), mats.darkGrey); bubble.position.set(0.024, 1.45, 0);
  for (const m of [pole, body, dome, slab, bracket]) m.castShadow = true;
  g.add(pole, tip, head, tsc, bracket, bubble);
  return g;
}

function stub(mats) {
  const g = new THREE.Group();
  const w = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.32, 0.012).translate(0, 0.16, 0), mats.wood);
  const p = new THREE.Mesh(new THREE.BoxGeometry(0.0315, 0.08, 0.0135).translate(0, 0.28, 0), mats.orange);
  w.castShadow = true;
  g.add(w, p);
  return g;
}

function arrowShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.2); s.lineTo(0.075, 0.08); s.lineTo(0.026, 0.08); s.lineTo(0.026, -0.12); s.lineTo(-0.026, -0.12); s.lineTo(-0.026, 0.08); s.lineTo(-0.075, 0.08); s.closePath();
  return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2);   // points along −Z (north) at rest
}

/* ---------------------------------------------------------------- the contact shadow */
// Depth of the layer-CS objects rendered from below with an orthographic camera, blurred twice, on a
// plane at the ground (ported from the film's stage.js, which keeps its own copy private).
class ContactShadow {
  constructor(renderer, scene, { size = 2.8, res = 256, height = 0.9, darkness = 1.15, opacity = 0.8 } = {}) {
    this.renderer = renderer; this.scene = scene;
    const opts = { type: THREE.UnsignedByteType };
    this.rt = new THREE.WebGLRenderTarget(res, res, opts);
    this.rtBlur = new THREE.WebGLRenderTarget(res, res, opts);
    this.rt.texture.generateMipmaps = this.rtBlur.texture.generateMipmaps = false;
    this.group = new THREE.Group();
    this.group.name = 'gear:contact-shadow';
    this.group.position.y = 0.0025;
    const planeGeo = new THREE.PlaneGeometry(size, size).rotateX(Math.PI / 2);
    this.plane = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ map: this.rt.texture, opacity, transparent: true, depthWrite: false, toneMapped: false }));
    this.plane.scale.y = -1;
    this.plane.renderOrder = 2;
    this.group.add(this.plane);
    this.blurPlane = new THREE.Mesh(planeGeo);
    this.blurPlane.visible = false;
    this.group.add(this.blurPlane);
    this.cam = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0, height);
    this.cam.rotation.x = Math.PI / 2;
    this.cam.layers.set(CS_LAYER);
    this.group.add(this.cam);
    const dm = new THREE.MeshDepthMaterial();
    dm.userData.darkness = { value: darkness };
    dm.onBeforeCompile = (shader) => {
      shader.uniforms.darkness = dm.userData.darkness;
      shader.fragmentShader = 'uniform float darkness;\n' + shader.fragmentShader.replace(
        'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
        'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );');
    };
    dm.depthTest = false; dm.depthWrite = false;
    this.depthMat = dm;
    const blurShader = (dir) => new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, h: { value: 1 / res } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float h; varying vec2 vUv;
        void main(){ vec4 s = vec4(0.0); vec2 d = ${dir};
          s += texture2D(tDiffuse, vUv - 4.0*h*d) * 0.051; s += texture2D(tDiffuse, vUv - 3.0*h*d) * 0.0918;
          s += texture2D(tDiffuse, vUv - 2.0*h*d) * 0.12245; s += texture2D(tDiffuse, vUv - 1.0*h*d) * 0.1531;
          s += texture2D(tDiffuse, vUv) * 0.1633;
          s += texture2D(tDiffuse, vUv + 1.0*h*d) * 0.1531; s += texture2D(tDiffuse, vUv + 2.0*h*d) * 0.12245;
          s += texture2D(tDiffuse, vUv + 3.0*h*d) * 0.0918; s += texture2D(tDiffuse, vUv + 4.0*h*d) * 0.051;
          gl_FragColor = s; }`,
      depthTest: false,
    });
    this.hBlur = blurShader('vec2(1.0, 0.0)');
    this.vBlur = blurShader('vec2(0.0, 1.0)');
    this.res = res;
    this.dirty = true;
  }
  blur(amount) {
    const r = this.renderer;
    this.blurPlane.visible = true;
    this.blurPlane.material = this.hBlur;
    this.hBlur.uniforms.tDiffuse.value = this.rt.texture; this.hBlur.uniforms.h.value = amount / this.res;
    r.setRenderTarget(this.rtBlur); r.render(this.blurPlane, this.cam);
    this.blurPlane.material = this.vBlur;
    this.vBlur.uniforms.tDiffuse.value = this.rtBlur.texture; this.vBlur.uniforms.h.value = amount / this.res;
    r.setRenderTarget(this.rt); r.render(this.blurPlane, this.cam);
    this.blurPlane.visible = false;
  }
  render() {
    const r = this.renderer, s = this.scene;
    const bg = s.background, fog = s.fog;
    s.background = null; s.fog = null;
    this.plane.visible = false;
    s.overrideMaterial = this.depthMat;
    const clearAlpha = r.getClearAlpha(), clearColor = r.getClearColor(new THREE.Color());
    r.setClearColor(0x000000, 0);
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(s, this.cam);
    s.overrideMaterial = null;
    this.blur(2.4);
    this.blur(1.0);
    r.setRenderTarget(null);
    r.setClearColor(clearColor, clearAlpha);
    s.background = bg; s.fog = fog;
    this.plane.visible = true;
    this.dirty = false;
  }
}

/* ================================================================================ Studio */
export class Studio {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ Q: object, reduced?: boolean, keepBuffer?: boolean }} o
   */
  constructor(canvas, { Q, reduced = false, keepBuffer = false }) {
    this.Q = Q;
    this.reduced = reduced;
    const renderer = new THREE.WebGLRenderer({
      canvas, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: keepBuffer,
      // the gear page draws straight to the canvas (no HDR target / post chain), so the canvas's own
      // MSAA is the anti-aliasing; lite skips it
      antialias: Q.tier !== 'lite',
    });
    if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 unavailable');
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, Q.dprCap));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = !!Q.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.03, 120);
    this.pipCam = new THREE.PerspectiveCamera(7, 1, 0.08, 80);
    this.pip = null;              // { x, y, w, h } in CSS px of the canvas, when the telescope view is on

    scene.environment = paintedEnvironment(renderer);
    this.fog = new THREE.Fog(0x163049, 7.5, 17);
    scene.fog = this.fog;
    this.sky = skyDome();
    scene.add(this.sky);
    this.ground = groundPatch(Q);
    scene.add(this.ground);

    // lights (a constant set: the programs never change)
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.key = new THREE.DirectionalLight(0xffffff, 2);
    this.keyDir = new THREE.Vector3(-0.55, 0.62, 0.56).normalize();   // from the front-left, high
    this.key.position.copy(this.keyDir).multiplyScalar(12);
    this.key.target.position.set(0, 0.4, 0);
    if (Q.shadows) {
      this.key.castShadow = true;
      this.key.shadow.mapSize.set(2048, 2048);
      const sc = this.key.shadow.camera;
      sc.left = -4.2; sc.right = 4.2; sc.top = 4.2; sc.bottom = -4.2; sc.near = 2; sc.far = 26;
      this.key.shadow.bias = -0.0004;
      this.key.shadow.normalBias = 0.025;
      this.key.shadow.radius = 3;
    }
    this.rim = new THREE.DirectionalLight(0xffffff, 1);
    this.rim.target.position.set(0, 0.5, 0);
    scene.add(this.hemi, this.key, this.key.target, this.rim, this.rim.target);
    // the EDM beam (effects.js); its point light is part of the light set from the start
    this.laser = new LaserShot(scene);
    this.laser.target.visible = false;
    // correction-signal rings for the RTK steps (effects.js)
    this.rings = new SignalRings(scene, { count: 4 });

    this.contact = new ContactShadow(renderer, scene, { res: Math.max(256, Q.texSize / 2) });
    scene.add(this.contact.group);

    // the instrument's holder (missions slide / turn it; explode lifts the model root inside it)
    this.holder = new THREE.Group();
    this.holder.name = 'gear:holder';
    scene.add(this.holder);

    this.buildProps();
    this.day = 0; this.dayGoal = 0;
    this.applyDay(0);
    this.size = { w: 1, h: 1 };
    this.safe = null;
    this.entry = null;
  }

  /* ----------------------------------------------------------------------------- props */
  buildProps() {
    const mats = this.mats = {
      wood: STD(0xc9a27a, { roughness: 0.85 }),
      orange: STD(0xff6a1a, { roughness: 0.55 }),
      flagPink: STD(0xff3d96, { roughness: 0.6, side: THREE.DoubleSide, emissive: 0x3a0018 }),
      flagOrange: STD(0xff7d1f, { roughness: 0.6, side: THREE.DoubleSide, emissive: 0x2a0d00 }),
      darkGrey: STD(0x3a3e43, { roughness: 0.5, metalness: 0.2 }),
      charcoal: STD(0x2b2f33, { roughness: 0.55 }),
      alu: STD(0xc9ccd0, { roughness: 0.32, metalness: 0.65 }),
      steel: STD(0x9aa0a6, { roughness: 0.3, metalness: 0.8 }),
      carbon: STD(0x1d1f22, { roughness: 0.35, metalness: 0.1 }),
      red: STD(0xc8361e, { roughness: 0.5 }),
      yellow: STD(0xf2c200, { roughness: 0.45 }),
      prismGlass: STD(0x1a1d22, { roughness: 0.06, metalness: 0.95, emissive: 0xff5040, emissiveIntensity: 0 }),
      r12Grey: STD(0x7a7f84, { roughness: 0.5, metalness: 0.15 }),
      offWhite: STD(0xe9e8e3, { roughness: 0.38 }),
      screen: STD(0x0d1a26, { roughness: 0.2, emissive: 0x2d79b0, emissiveIntensity: 0.55 }),
      keys: STD(0x50565c, { roughness: 0.7 }),
      nail: STD(0xb08d57, { roughness: 0.35, metalness: 0.85 }),
    };
    const props = this.props = new THREE.Group();
    props.name = 'gear:props';
    this.scene.add(props);
    const P = this.p = {};
    const blobTex = blobTexture();
    const blob = (size) => { const b = decal(blobTex, size, { y: 0.0018 }); b.material = this.blobMat ||= b.material; return b; };

    // CP-01: the nail with its shiner and pink paint (the origin)
    P.nail = new THREE.Group();
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.004, 16), mats.steel); head.position.y = 0.004;
    const shiner = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.0018, 24), mats.nail); shiner.position.y = 0.0016;
    P.nail.add(head, shiner, decal(paintTexture(), 0.3, { y: 0.0014 }));
    // the GCP target
    P.gcp = new THREE.Group();
    const board = decal(checkerTexture(), 0.6, { y: 0.004 });
    board.material.transparent = false; board.material.depthWrite = true;
    const gnail = head.clone(); gnail.position.y = 0.007;
    P.gcp.add(board, gnail);
    P.gcp.position.set(SPOTS.gcp[0], 0, SPOTS.gcp[1]); P.gcp.rotation.y = 0.45;
    // an older lath already on site
    P.lath = lathGroup(mats); P.lath.position.set(SPOTS.lath[0], 0, SPOTS.lath[1]); P.lath.rotation.y = 0.8;
    P.lath.add(blob(0.3));
    // PR-1: the 360 prism on a pole with a bipod
    P.prism = prismPole(mats); P.prism.position.set(SPOTS.prism[0], 0, SPOTS.prism[1]);
    P.prism.add(blob(1.0));
    // BS-02: the backsight prism on a tripod, facing CP-01
    P.backsight = backsightTripod(mats); P.backsight.position.set(SPOTS.backsight[0], 0, SPOTS.backsight[1]);
    P.backsight.rotation.y = Math.atan2(-SPOTS.backsight[0], -SPOTS.backsight[1]);
    P.backsight.add(blob(0.95));
    // the rover (GNSS stake-out)
    P.rover = roverPole(mats); P.rover.add(blob(0.5));
    // the lath driven at the staked point
    P.stakeLath = lathGroup(mats); P.stakeLath.add(blob(0.3));
    // stake stubs + the stake line (TS robotic)
    P.stubs = [];
    for (let i = 0; i < 8; i++) { const s = stub(mats); s.visible = false; props.add(s); P.stubs.push(s); }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
    P.stakeLine = new THREE.Line(lg, new THREE.LineDashedMaterial({ color: 0xff7a1a, dashSize: 0.08, gapSize: 0.05, transparent: true, opacity: 0.95, depthWrite: false }));
    P.stakeLine.frustumCulled = false; P.stakeLine.renderOrder = 3;
    // the stake-out design ring, the guidance arrow, the plummet laser
    const glowMat = (color, opacity = 0.95) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    P.ring = new THREE.Group();
    const r1 = new THREE.Mesh(new THREE.RingGeometry(0.055, 0.07, 48).rotateX(-Math.PI / 2), glowMat(0x5cc0f5));
    const r2 = new THREE.Mesh(new THREE.RingGeometry(0.018, 0.024, 32).rotateX(-Math.PI / 2), r1.material);
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.006).rotateX(-Math.PI / 2), r1.material);
    const cross2 = cross.clone(); cross2.rotation.y = Math.PI / 2;
    P.ring.add(r1, r2, cross, cross2); P.ring.position.y = 0.006; P.ring.renderOrder = 4;
    P.ringMat = r1.material;
    P.arrow = new THREE.Mesh(arrowShape(), glowMat(0xffc24a, 0.92)); P.arrow.position.y = 0.012; P.arrow.renderOrder = 4;
    P.plummetDot = new THREE.Mesh(new THREE.CircleGeometry(0.009, 20).rotateX(-Math.PI / 2), glowMat(0xff3020, 1));
    P.plummetDot.material.color.setRGB(4, 0.5, 0.3); P.plummetDot.position.y = 0.007;
    const pg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.56, 0), new THREE.Vector3(0, 0.006, 0)]);
    P.plumbLine = new THREE.Line(pg, new THREE.LineDashedMaterial({ color: 0xff4030, dashSize: 0.025, gapSize: 0.02, transparent: true, opacity: 0.85, depthWrite: false }));
    P.plumbLine.computeLineDistances(); P.plumbLine.frustumCulled = false;
    // the landing mat (drone)
    P.pad = decal(padTexture(), 1.25, { y: 0.0022 });
    P.pad.material.transparent = true;

    for (const k of ['nail', 'gcp', 'lath', 'prism', 'backsight', 'rover', 'stakeLath', 'stakeLine', 'ring', 'arrow', 'plummetDot', 'plumbLine', 'pad']) props.add(P[k]);
    // the EDM's prism flash rides on PR-1's glass
    this.laser.spark.position.set(0, 0, 0);
    const glassAnchor = new THREE.Object3D(); glassAnchor.position.y = PRISM_GLASS_Y; P.prism.add(glassAnchor);
    glassAnchor.add(this.laser.spark);
    P.prismGlassAnchor = glassAnchor;
    this.setProps({});
  }

  /** Which props show (missing keys = the default diorama: nail, gcp, lath, prism). */
  setProps(o = {}) {
    const P = this.p;
    const on = { nail: true, gcp: true, lath: true, prism: true, backsight: false, rover: false, stakeLath: false, stakeLine: false, ring: false, arrow: false, plummetDot: false, plumbLine: false, pad: false, ...o };
    for (const [k, v] of Object.entries(on)) if (P[k]) P[k].visible = !!v;
    if (!o.stubs) for (const s of P.stubs) s.visible = false;
    this.contact.dirty = true;
  }

  /** World position of PR-1's glass centre / BS-02's glass centre. */
  prismGlass(out = new THREE.Vector3()) { return out.set(SPOTS.prism[0], PRISM_GLASS_Y, SPOTS.prism[1]); }
  backsightGlass(out = new THREE.Vector3()) { return out.set(SPOTS.backsight[0], BS_GLASS_Y, SPOTS.backsight[1]); }

  /* ------------------------------------------------------------------------- day / night */
  setDay(isDay, { instant = false } = {}) {
    this.dayGoal = isDay ? 1 : 0;
    if (instant || this.reduced) { this.day = this.dayGoal; this.applyDay(this.day); }
  }
  /** Ease the daylight blend; returns true while it changes. */
  updateDay(dt) {
    if (this.day === this.dayGoal) return false;
    const step = dt / 0.8;
    this.day = this.dayGoal > this.day ? Math.min(this.dayGoal, this.day + step) : Math.max(this.dayGoal, this.day - step);
    this.applyDay(THREE.MathUtils.smoothstep(this.day, 0, 1));
    return true;
  }
  applyDay(k) {
    const c = (a, b) => new THREE.Color(a).lerp(new THREE.Color(b), k);
    const n = (a, b) => a + (b - a) * k;
    const u = this.sky.material.uniforms;
    u.top.value.copy(c(NIGHT.top, DAY.top)); u.mid.value.copy(c(NIGHT.mid, DAY.mid)); u.bottom.value.copy(c(NIGHT.bottom, DAY.bottom)); u.glow.value.copy(c(NIGHT.glow, DAY.glow));
    this.fog.color.copy(u.mid.value);
    this.hemi.color.copy(c(NIGHT.hemiSky, DAY.hemiSky)); this.hemi.groundColor.copy(c(NIGHT.hemiGround, DAY.hemiGround)); this.hemi.intensity = n(NIGHT.hemi, DAY.hemi);
    this.key.color.copy(c(NIGHT.key, DAY.key)); this.key.intensity = n(NIGHT.keyI, DAY.keyI);
    this.rim.color.copy(c(NIGHT.rim, DAY.rim)); this.rim.intensity = n(NIGHT.rimI, DAY.rimI);
    this.scene.environmentIntensity = n(NIGHT.env, DAY.env);
    this.renderer.toneMappingExposure = n(NIGHT.exposure, DAY.exposure);
    u.sunDir.value.copy(this.keyDir);
    this.mats.screen.emissiveIntensity = n(0.9, 0.35);
    this.dayK = k;
  }

  /* ---------------------------------------------------------------------- model + view */
  /** Put a built model (cache entry) in the holder; null clears it. */
  attach(entry) {
    if (this.entry === entry) return;
    if (this.entry) this.holder.remove(this.entry.inst.root);
    this.entry = entry;
    this.holder.position.set(0, 0, 0); this.holder.rotation.set(0, 0, 0);
    if (entry) {
      const root = entry.inst.root;
      root.traverse((o) => { if (o.isMesh || o.isInstancedMesh) o.layers.enable(CS_LAYER); });
      this.holder.add(root);
    }
    this.contact.dirty = true;
  }

  /** Canvas size in CSS px and the free (un-covered) part of it; the camera centres on the free part. */
  setView(w, h, safe = null) {
    this.size = { w, h };
    this.safe = safe;
    this.renderer.setSize(w, h, false);
    const cam = this.camera;
    cam.aspect = w / h;
    if (safe) {
      const cx = safe.x + safe.w / 2, cy = safe.y + safe.h / 2;
      cam.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
    } else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }

  /** Camera distance that fits a sphere of radius r inside the free area (with `fit` margin). */
  fitDistance(r, fit = 1.15) {
    const { w, h } = this.size, s = this.safe || { w, h };
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const tv = t * (s.h / h), th = t * (s.w / h);
    return (r * fit) / Math.max(0.05, Math.min(tv, th));
  }

  /** Project a world point to canvas CSS px ({ x, y, front }). */
  project(v, out = { x: 0, y: 0, front: true }) {
    const p = (this._pv ||= new THREE.Vector3()).copy(v).project(this.camera);
    out.x = (p.x * 0.5 + 0.5) * this.size.w;
    out.y = (-p.y * 0.5 + 0.5) * this.size.h;
    out.front = p.z < 1;
    return out;
  }

  /** Pointer (canvas CSS px) → world point on the ground plane y = 0 (or null). */
  groundPoint(x, y, out = new THREE.Vector3()) {
    const ray = (this._ray ||= new THREE.Raycaster());
    ray.setFromCamera({ x: (x / this.size.w) * 2 - 1, y: -(y / this.size.h) * 2 + 1 }, this.camera);
    const plane = (this._plane ||= new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
    return ray.ray.intersectPlane(plane, out);
  }

  /** Raycast the model at canvas CSS px; returns the first hit or null. */
  pick(x, y) {
    if (!this.entry) return null;
    const ray = (this._ray ||= new THREE.Raycaster());
    ray.setFromCamera({ x: (x / this.size.w) * 2 - 1, y: -(y / this.size.h) * 2 + 1 }, this.camera);
    ray.camera = this.camera;
    const hits = ray.intersectObject(this.entry.inst.root, true).filter((h) => h.object.visible && !h.object.isSprite);
    return hits[0] || null;
  }

  /* ---------------------------------------------------------------------------- warm-up */
  /**
   * Compile every program the gear can need before it is shown: the model (with its parts that only
   * appear exploded), all the diorama and mission props, the laser, the depth programs of the contact
   * shadow and (high tier) the shadow map. `extra` = more roots to reveal. Draws to the canvas (the
   * same output target as the real frames), so call it while the loader covers the stage.
   */
  async warm(extra = [], { sync = false } = {}) {
    const shown = [];
    const reveal = (root) => root?.traverse((o) => { if (!o.visible) { o.visible = true; shown.push(o); } });
    // (the LaserShot's own prism target is never shown here: PR-1 is the diorama's prism)
    reveal(this.props); reveal(this.laser.group); reveal(this.rings.group);
    for (const m of this.rings.rings) m.material.opacity = Math.max(m.material.opacity, 0.001);
    if (this.entry) reveal(this.entry.inst.root);
    for (const r of extra) reveal(r);
    this.camera.updateMatrixWorld();
    if (!sync && this.renderer.compileAsync) {
      try { await this.renderer.compileAsync(this.scene, this.camera); } catch (e) { /* fall through to the draws */ }
    } else this.renderer.compile(this.scene, this.camera);
    // depth programs: the contact pass, then two full frames (three keys a shadow depth program by the
    // light counts of the draw before it, so the second frame catches the other variant)
    this.contact.render();
    for (let i = 0; i < 2; i++) {
      if (this.key.castShadow) this.key.shadow.needsUpdate = true;
      this.renderer.render(this.scene, this.camera);
    }
    for (const o of shown) o.visible = false;
    this.laser.target.visible = false;
    this.contact.dirty = true;
  }

  programs() { return this.renderer.info.programs?.length ?? 0; }

  /* ----------------------------------------------------------------------------- render */
  render() {
    const r = this.renderer;
    // the rim stays behind the subject, on the side away from the camera
    const cam = this.camera.position;
    const tgt = this.rim.target.position;
    this.rim.position.set(tgt.x - (cam.x - tgt.x), tgt.y + 2.2, tgt.z - (cam.z - tgt.z)).normalize().multiplyScalar(10);
    if (this.contact.dirty) this.contact.render();
    this.laser.target.visible = false;
    r.setRenderTarget(null);
    r.setScissorTest(false);
    r.setViewport(0, 0, this.size.w, this.size.h);
    r.render(this.scene, this.camera);
    if (this.pip) {
      const { x, y, w, h } = this.pip;
      const auto = r.shadowMap.autoUpdate;
      r.shadowMap.autoUpdate = false;
      this.pipCam.aspect = w / h; this.pipCam.updateProjectionMatrix();
      const yb = this.size.h - y - h;
      r.setScissorTest(true);
      r.setViewport(x, yb, w, h); r.setScissor(x, yb, w, h);
      r.render(this.scene, this.pipCam);
      r.setScissorTest(false);
      r.setViewport(0, 0, this.size.w, this.size.h);
      r.shadowMap.autoUpdate = auto;
    }
  }
}
