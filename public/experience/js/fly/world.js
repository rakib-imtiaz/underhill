// Fly mode: the world. The film's Act II valley (js/field.js) imported as it is, with the film-only
// parts hidden (LiDAR cloud, contours, scan fan, profile) and its sky, flat ridgelines and single tree
// replaced; then the land is made big and real (js/fly/terrain, sky, water, forest):
//   - a creek carved along the valley floor (this page's copy of the terrain), water in it
//   - the land continued to 6 km with a LOD grid stitched to the site (mountains both sides, the
//     valley and its river running through), far ridgelines in atmospheric haze beyond
//   - a ground detail shader (meadow, dry grass, dirt, rock on steep faces, damp valley floor, the
//     gravel access track), conifer stands, far-forest impostors, boulders
//   - what a crew leaves on site: the landing pad (home), ground control targets, CP-01's painted mark,
//     the prism on its pole (effects.js LaserShot target), and the navy pickup at the end of the track
// Day / night is a light-only blend: sky and fog colours (fog = the horizon colour), sun or moon light,
// the sky light, the environment's strength, a few emissive levels. Nothing recompiles.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Field, FIELD, groundAt } from '../field.js';
import { LaserShot } from '../effects.js';
import { makeNoise, carveCreek, FarTerrain, makeGroundMaterial, ground, TRUCK } from './terrain.js';
import { Sky, SUN_DAY, MOON } from './sky.js';
import { Water } from './water.js';
import { Forest } from './forest.js';

export const HOME = new THREE.Vector3(-3.4, 0, 2.1);            // the drone pad (film: FIELD.stations.drone)
export const PRISM_GLASS = FIELD.prism.clone().add(new THREE.Vector3(0, 1.55, 0));   // as timeline.js
export const GEOFENCE = 600;      // m, soft boundary (|x|, |z|): pushed back beyond it
export const VLOS = 500;          // m from home: the visual-line-of-sight warning
export const ALT_CAP = 120;       // m AGL (Transport Canada, basic / advanced RPAS ops)

const LIGHT = {
  sunCol: new THREE.Color(0xfff1e0), moonCol: new THREE.Color(0x9db3dc),
  skyTopNight: new THREE.Color(0x24375c), skyTopDay: new THREE.Color(0xc4dcf3),
  skyGroundNight: new THREE.Color(0x0b0d12), skyGroundDay: new THREE.Color(0x6e604c),
};

/** A small painted environment (sky above, light horizon, earth below) → PMREM. */
function fieldEnvironment(renderer) {
  const W = 256, H = 128;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0.0, '#4a6a92');
  grd.addColorStop(0.42, '#8fa5bb');
  grd.addColorStop(0.5, '#b4b8b4');
  grd.addColorStop(0.53, '#4d4c3c');
  grd.addColorStop(1.0, '#22231b');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromEquirectangular(tex).texture;
  pm.dispose(); tex.dispose();
  return env;
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A flat-ish square draped on the terrain: (cx, cz) centre, side s, yaw a, n×n cells, lifted by `lift`. */
function drapedSquare(cx, cz, s, a, n, lift, uv0 = [0, 0, 1, 1]) {
  const geo = new THREE.PlaneGeometry(s, s, n, n).rotateX(-Math.PI / 2);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  const ca = Math.cos(a), sa = Math.sin(a);
  for (let i = 0; i < p.count; i++) {
    const lx = p.getX(i), lz = p.getZ(i);
    const x = cx + lx * ca + lz * sa, z = cz - lx * sa + lz * ca;
    p.setXYZ(i, x, groundAt(x, z) + lift, z);
    uv.setXY(i, uv0[0] + uv.getX(i) * (uv0[2] - uv0[0]), uv0[1] + uv.getY(i) * (uv0[3] - uv0[1]));
  }
  geo.computeVertexNormals();
  return geo;
}

/* ---------------------------------------------------------------------------- the pickup */
// Underhill's navy Tundra, low-poly: a box cab, hood and bed on four wheels, a white and a blue stripe
// along each side, an amber light bar. Local +Z is the nose; origin on the ground between the axles.
function buildTruck() {
  const parts = new Map();   // material → geometries
  const add = (mat, geo) => { if (!parts.has(mat)) parts.set(mat, []); parts.get(mat).push(geo.index ? geo.toNonIndexed() : geo); };
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const navy = new THREE.MeshStandardMaterial({ color: 0x14284a, roughness: 0.38, metalness: 0.45, name: 'truck-navy' });
  const hoodMat = navy.clone(); hoodMat.name = 'truck-hood'; hoodMat.emissive = new THREE.Color(0xff5a20); hoodMat.emissiveIntensity = 0;
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b1118, roughness: 0.08, metalness: 0.6, name: 'truck-glass' });
  const black = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.85, metalness: 0.1, name: 'truck-black' });
  const rim = new THREE.MeshStandardMaterial({ color: 0x8d9298, roughness: 0.35, metalness: 0.8, name: 'truck-rim' });
  const white = new THREE.MeshStandardMaterial({ color: 0xeef1f4, roughness: 0.45, metalness: 0.1, name: 'truck-white' });
  const blue = new THREE.MeshStandardMaterial({ color: 0x0082ca, roughness: 0.45, metalness: 0.1, name: 'truck-blue' });
  const lamps = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d8, emissiveIntensity: 0.4, roughness: 0.3, name: 'truck-lamps' });
  const tail = new THREE.MeshStandardMaterial({ color: 0x5a0d08, emissive: 0xff2a1a, emissiveIntensity: 0.3, roughness: 0.4, name: 'truck-tail' });
  const amber = new THREE.MeshStandardMaterial({ color: 0x5a3a08, emissive: 0xffa020, emissiveIntensity: 0.4, roughness: 0.4, name: 'truck-amber' });

  const W = 1.96, Wb = 1.9;
  // lower body (rocker to belt line), cab, bed walls, hood
  add(navy, box(W, 0.62, 5.7, 0, 0.74, 0));
  add(navy, box(Wb, 0.82, 1.95, 0, 1.46, 0.28));                 // cab
  add(navy, box(Wb - 0.1, 0.06, 1.75, 0, 1.9, 0.26));            // roof cap
  for (const s of [1, -1]) add(navy, box(0.07, 0.42, 2.25, s * (W / 2 - 0.035), 1.26, -1.78));   // bed walls
  add(navy, box(W, 0.42, 0.07, 0, 1.26, -2.86));                 // tailgate
  add(navy, box(W - 0.14, 0.04, 2.2, 0, 1.06, -1.78));           // bed floor
  add(hoodMat, new THREE.BoxGeometry(Wb - 0.02, 0.14, 1.6).rotateX(0.05).translate(0, 1.1, 2.03));
  // glass: windscreen (raked), side windows, rear window
  add(glass, new THREE.BoxGeometry(Wb - 0.16, 0.6, 0.05).rotateX(-0.42).translate(0, 1.5, 1.24));
  for (const s of [1, -1]) {
    add(glass, box(0.02, 0.42, 0.78, s * (Wb / 2 + 0.006), 1.58, 0.72));
    add(glass, box(0.02, 0.42, 0.7, s * (Wb / 2 + 0.006), 1.58, -0.18));
  }
  add(glass, box(Wb - 0.3, 0.38, 0.02, 0, 1.6, -0.69));
  // grille, bumpers, arches
  add(black, box(W - 0.3, 0.36, 0.06, 0, 0.92, 2.86));
  add(black, box(W + 0.04, 0.2, 0.18, 0, 0.5, 2.88));
  add(black, box(W + 0.04, 0.2, 0.16, 0, 0.5, -2.9));
  for (const [x, z] of [[1, 1.82], [-1, 1.82], [1, -1.72], [-1, -1.72]]) add(black, box(0.08, 0.5, 1.0, x * (W / 2 + 0.01), 0.82, z));
  // wheels: tyre + rim
  for (const [x, z] of [[1, 1.82], [-1, 1.82], [1, -1.72], [-1, -1.72]]) {
    add(black, new THREE.CylinderGeometry(0.41, 0.41, 0.3, 20).rotateZ(Math.PI / 2).translate(x * 0.84, 0.41, z));
    add(rim, new THREE.CylinderGeometry(0.24, 0.24, 0.31, 16).rotateZ(Math.PI / 2).translate(x * 0.84, 0.41, z));
  }
  // livery: a white stripe over a blue one along both sides
  for (const s of [1, -1]) {
    add(white, box(0.012, 0.08, 5.5, s * (W / 2 + 0.006), 0.9, 0));
    add(blue, box(0.012, 0.06, 5.5, s * (W / 2 + 0.006), 0.8, 0));
    add(blue, box(0.012, 0.03, 4.2, s * (W / 2 + 0.006), 0.71, -0.4));
  }
  // lamps, tail lights, the amber light bar on the cab
  for (const s of [1, -1]) {
    add(lamps, box(0.34, 0.12, 0.04, s * 0.72, 1.0, 2.88));
    add(tail, box(0.06, 0.32, 0.1, s * (W / 2 - 0.01), 1.2, -2.85));
  }
  add(amber, box(1.2, 0.08, 0.18, 0, 1.97, 0.75));
  const g = new THREE.Group(); g.name = 'site:truck';
  for (const [mat, geos] of parts) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  }
  // door decals: UNDERHILL in white on both doors
  const decal = canvasTex(512, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#ffffff'; c.font = '600 64px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('UNDERHILL', w / 2, h / 2 - 6);
    c.fillStyle = '#5cc0f5'; c.fillRect(w * 0.18, h - 22, w * 0.64, 6);
  });
  const dm = new THREE.MeshStandardMaterial({ map: decal, transparent: true, roughness: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, name: 'truck-decal' });
  for (const s of [1, -1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.24), dm);
    p.position.set(s * (W / 2 + 0.014), 1.2, 0.55);
    p.rotation.y = s * Math.PI / 2;
    g.add(p);
  }
  g.userData = { hoodMat, lamps, tail, amber, size: [W, 2.0, 5.8] };
  return g;
}

/* ------------------------------------------------------------------------- the world */
export class World {
  constructor(renderer, scene, Q) {
    this.scene = scene; this.Q = Q;
    scene.background = new THREE.Color();
    scene.fog = new THREE.FogExp2(0x101820, 0.0002);
    scene.environment = fieldEnvironment(renderer);
    scene.environmentIntensity = 0.4;

    const field = this.field = new Field(scene, { mobile: Q.tier !== 'high', q: Q });
    field.group.visible = true;
    // the film-only parts stay hidden (the profile is never built here: buildProfile() is not called);
    // the film's sky, flat ridgelines and trees are replaced by sky.js and forest.js
    for (const o of [field.cloud, field.contours, field.fan, field.swath, field.swathGlow, field.sky, field.trees, ...(field.ridges || [])]) o.visible = false;
    // the creek, carved into this page's copy of the terrain; the parcel line re-draped over it
    carveCreek(field);
    const bp = field.boundary.geometry.attributes.position;
    for (let i = 0; i < bp.count; i++) bp.setY(i, groundAt(bp.getX(i), bp.getZ(i)) + 0.05);
    bp.needsUpdate = true;
    field.boundaryMat.uniforms.draw.value = 1;
    field.boundaryMat.uniforms.alpha.value = 0.45;
    for (const s of field.stakes) { s.visible = true; s.scale.set(1, 1, 1); }
    field.monument.position.set(0, 0, 0);
    field.pad.position.set(HOME.x, 0.004, HOME.z);
    field.pad.scale.setScalar(1.25);           // a 2 m landing mat
    // the ground detail shader on the site terrain and the far land (one material, one program)
    this.noise = makeNoise(Q.aniso);
    this.groundMat = makeGroundMaterial(this.noise);
    field.terrain.material = this.groundMat;
    field.terrain.receiveShadow = Q.shadows;

    // the key light: the sun by day, the moon by night; it follows the drone so a small shadow box covers it
    this.sun = field.sun;
    field.group.add(this.sun.target);
    this.sunDir = MOON.clone();
    if (Q.shadows) {
      const s = this.sun;
      s.castShadow = true;
      s.shadow.mapSize.set(1024, 1024);
      s.shadow.camera.left = s.shadow.camera.bottom = -14;
      s.shadow.camera.right = s.shadow.camera.top = 14;
      s.shadow.camera.near = 1; s.shadow.camera.far = 400;
      s.shadow.bias = -0.0006; s.shadow.normalBias = 0.03;
    }

    this.group = new THREE.Group(); this.group.name = 'site';
    scene.add(this.group);
    this.far = new FarTerrain(field, Q, this.groundMat);
    this.group.add(this.far.mesh);
    this.sky = new Sky(scene, this.noise);
    this.water = new Water(scene, this.noise);
    this.buildMarks();
    this.buildTargets();
    this.prism = new LaserShot(scene);
    this.prism.placeAt(PRISM_GLASS, groundAt(FIELD.prism.x, FIELD.prism.z), new THREE.Vector3(2.6, 1.1, 1.3));
    this.prism.light.visible = false;           // fixed light set: the prism glows by emissive + sprite only
    this.prism.update(null, 0, 0, 1, 0);        // target shown, no beam
    this.truck = buildTruck();
    this.placeTruck(TRUCK.x, TRUCK.z, TRUCK.yaw);
    this.group.add(this.truck);
    this.forest = new Forest(scene, Q, { truck: TRUCK });
    this.ridge = this.findRidge();
    this.viewpoints = this.buildViewpoints();
    this.day = 0;
    this.exposure = 1;
    this.applyLight(0);
  }

  /** CP-01's painted survey mark (big enough to read from the air). */
  buildMarks() {
    const tex = canvasTex(512, 512, (g, S) => {
      g.translate(S / 2, S / 2);
      g.strokeStyle = 'rgba(255,240,140,0.95)'; g.fillStyle = 'rgba(255,240,140,0.95)';
      g.lineWidth = 14; g.beginPath(); g.arc(0, 0, 150, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 8;
      for (const [x0, y0, x1, y1] of [[-240, 0, -60, 0], [60, 0, 240, 0], [0, -240, 0, -60], [0, 60, 0, 240]]) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
      g.beginPath(); g.arc(0, 0, 16, 0, Math.PI * 2); g.fill();
    });
    const m = new THREE.Mesh(drapedSquare(0, 0, 2.4, 0, 2, 0.006), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, name: 'site-mark' }));
    m.receiveShadow = this.Q.shadows;
    m.name = 'site:cp01-mark';
    this.group.add(m);
  }

  /** Ground control targets: 1 m checkerboard squares lying on the terrain (one merged mesh). */
  buildTargets() {
    const tex = canvasTex(256, 256, (g, S) => {
      g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, S, S);
      g.fillStyle = '#111214'; g.fillRect(0, 0, S / 2, S / 2); g.fillRect(S / 2, S / 2, S / 2, S / 2);
      g.strokeStyle = '#111214'; g.lineWidth = 6; g.strokeRect(3, 3, S - 6, S - 6);
    });
    // round the parcel and the terrace, clear of the creek and the trees
    const spots = [[-25, -13, 0.2], [33, -12, 0.5], [-27, -50, 1.1], [31, -51, 0.3], [4, -39, 0.9], [-10, -22, 0.1], [18, -37, 1.3], [9, 9, 0.4]];
    this.gcps = spots.map(([x, z, a], i) => ({ id: `GCP-${String(i + 1).padStart(2, '0')}`, x, z, a, y: groundAt(x, z), size: 1 }));
    const geo = mergeGeometries(this.gcps.map((t) => drapedSquare(t.x, t.z, t.size, t.a, 3, 0.012)));
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, name: 'site-gcp' }));
    m.receiveShadow = this.Q.shadows;
    m.name = 'site:gcps';
    this.group.add(m);
  }

  placeTruck(x, z, yaw) {
    const t = this.truck;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const w = (lx, lz) => { const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c; return ground(wx, wz); };
    const fl = w(0.84, 1.82), fr = w(-0.84, 1.82), rl = w(0.84, -1.72), rr = w(-0.84, -1.72);
    t.position.set(x, (fl + fr + rl + rr) / 4, z);
    t.rotation.order = 'YXZ';
    t.rotation.set(Math.atan2((rl + rr) / 2 - (fl + fr) / 2, 3.54), yaw, Math.atan2((fr + rr) / 2 - (fl + rl) / 2, 1.68));
    t.updateMatrixWorld(true);
    this.truckPose = { x, z, yaw, y: t.position.y };
  }

  /** The highest point on the valley side inside the flying area (250–520 m out): the ridge overlook. */
  findRidge() {
    let best = null;
    for (let x = -520; x <= 520; x += 10) for (let z = -520; z <= 520; z += 10) {
      const r = Math.max(Math.abs(x), Math.abs(z));
      if (r < 250 || r > 520) continue;
      const h = ground(x, z);
      if (!best || h > best.y) best = { x, y: h, z };
    }
    return new THREE.Vector3(best.x, best.y, best.z);
  }

  /** Fly-to viewpoints: where to hover (pos) and what to look at (look). */
  buildViewpoints() {
    const P = FIELD.parcel;
    const pg = groundAt(P.cx, P.cz);
    const r = this.ridge;
    const toSite = new THREE.Vector3(-r.x, 0, -r.z).normalize();
    const list = [
      { id: 'cp01', name: 'CP-01', sub: 'Control mark', look: new THREE.Vector3(0, 0.05, 0), pos: new THREE.Vector3(7, 8, 10) },
      { id: 'prism', name: 'Prism', sub: 'Survey target', look: PRISM_GLASS.clone(), pos: new THREE.Vector3(PRISM_GLASS.x - 4, PRISM_GLASS.y + 5, PRISM_GLASS.z + 13) },
      { id: 'parcel', name: 'Parcel', sub: '52 × 30 m', look: new THREE.Vector3(P.cx, pg, P.cz), pos: new THREE.Vector3(P.cx, pg + 38, P.cz + 40) },
      { id: 'ridge', name: 'Ridge overlook', sub: 'High point', look: new THREE.Vector3(0, 0, -20), pos: new THREE.Vector3(r.x + toSite.x * 6, r.y + 16, r.z + toSite.z * 6), mark: new THREE.Vector3(r.x, r.y + 1, r.z) },
    ];
    for (const v of list) v.mark = v.mark || v.look;
    return list;
  }

  /**
   * Light-only day/night blend, d = 0 (moonlit night) … 1 (clear day). `focus` is where the shadow box
   * goes (the drone), `agl` its height above ground (to put the box under its shadow).
   */
  applyLight(d, focus = HOME, agl = 0) {
    this.day = d;
    const s = this.scene, f = this.field;
    this.sunDir.copy(MOON).lerp(SUN_DAY, d).normalize();
    const L = this.sky.apply(d, SUN_DAY);
    s.background.copy(L.horizon);
    s.fog.color.copy(L.horizon);
    s.fog.density = L.density;
    s.environmentIntensity = 0.3 + 0.5 * d;
    f.sun.color.copy(LIGHT.moonCol).lerp(LIGHT.sunCol, d);
    f.sun.intensity = 1.15 + (3.4 - 1.15) * d;
    f.skyLight.color.copy(LIGHT.skyTopNight).lerp(LIGHT.skyTopDay, d);
    f.skyLight.groundColor.copy(LIGHT.skyGroundNight).lerp(LIGHT.skyGroundDay, d);
    f.skyLight.intensity = 1.15 + 0.75 * d;
    this.water.setLook({ zenith: L.zenith, horizon: L.horizon, sunDir: d > 0.5 ? SUN_DAY : MOON, sunCol: new THREE.Color().copy(LIGHT.moonCol).multiplyScalar(0.5).lerp(LIGHT.sunCol, d), light: 0.35 + 0.65 * d });
    this.forest.setLight(new THREE.Color(0.32, 0.38, 0.55).lerp(new THREE.Color(1.55, 1.6, 1.45), d));
    this.exposure = 1.18 - 0.18 * d;
    const u = this.truck.userData;
    u.lamps.emissiveIntensity = 0.25 + 1.6 * (1 - d);
    u.tail.emissiveIntensity = 0.2 + 0.8 * (1 - d);
    this.placeSun(focus, agl);
  }

  /** Aim the key light's small shadow box at the drone's shadow on the ground. */
  placeSun(focus, agl = 0) {
    const sd = this.sunDir;
    const k = Math.min(600, agl / Math.max(0.05, sd.y));
    const gx = focus.x - sd.x * k, gz = focus.z - sd.z * k;
    const t = this.sun.target.position.set(gx, ground(gx, gz), gz);
    this.sun.position.copy(t).addScaledVector(sd, k + 60);
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
  }

  /** Per frame: clouds and water drift, the truck's amber bar flashes slowly at night. */
  update(clock, { thermal = false } = {}) {
    this.sky.update(clock);
    this.water.update(clock);
    const u = this.truck.userData;
    u.amber.emissiveIntensity = (0.3 + 0.7 * (1 - this.day)) * (0.35 + 0.65 * Math.max(0, Math.sin(clock * 5.2)) ** 6);
    u.hoodMat.emissiveIntensity = thermal ? 0.9 : 0;    // a warm engine bay, seen only in thermal
  }
}
