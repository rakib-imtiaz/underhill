// Procedural surveying total station on a tripod - built entirely in code.
//
//   import { createTotalStationModel } from './src/totalStation.js';
//   const model = createTotalStationModel();   // THREE.Group, metres, Y up,
//   scene.add(model);                           // origin = centre of the footprint on the ground
//
// Every component of object-sculpt-spec.json is a named THREE.Group (userData.part === true),
// so parts can be picked, highlighted or exploded. Pivots for scroll choreography:
//   model.userData.pivots.alidade    yaw   (rotation.y)   - instrument turns on the tribrach
//   model.userData.pivots.telescope  tilt  (rotation.x)   - trunnion axis, +-30 deg is clear
//   model.userData.pivots.legs[i]    fold  (rotation.x)   - hinge at the tripod head
//   model.userData.setPose({ alidadeYaw, telescopeTilt, legFold })   (degrees / 0..1)
//   model.userData.explode(t)        0 = assembled, 1 = fully exploded
//   model.userData.dispose()         frees geometries, materials and textures
//
// Reference: reference.png (one front view). Hidden faces (instrument rear, +X side) are inferred.

import * as THREE from 'three';

export const TOTAL_STATION_PARAMS = Object.freeze({
  metresPerReferencePixel: 0.002,
  headY: 0.886,            // tripod head plate centre
  hingeRadius: 0.085,      // leg hinge axis distance from the vertical axis
  hingeY: 0.85,            // leg hinge axis height
  splayDeg: 23.75,         // leg angle from vertical
  legAzimuthDeg: { legFront: 0, legRearRight: 125, legRearLeft: 244 }, // measured per leg in the reference
  alidadeYawDeg: 28,       // instrument yaw seen in the reference
  trunnionY: 1.102,        // telescope tilt axis height
  totalHeight: 1.244,
});

const DEG = Math.PI / 180;

// --------------------------------------------------------------------------------------------
// Geometry helpers
// --------------------------------------------------------------------------------------------

/** Box with filleted edges: subdivided box whose vertices are projected onto a rounded hull. */
function roundedBox(w, h, d, r, seg = 3) {
  r = Math.max(1e-5, Math.min(r, w / 2 - 1e-5, h / 2 - 1e-5, d / 2 - 1e-5));
  const s = seg * 2 + 1;
  const g = new THREE.BoxGeometry(1, 1, 1, s, s, s);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const half = 0.5 / s;
  const inner = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.set(
      p.x - Math.sign(p.x) * half,
      p.y - Math.sign(p.y) * half,
      p.z - Math.sign(p.z) * half,
    ).normalize();
    pos.setXYZ(
      i,
      inner.x * Math.sign(p.x) + n.x * r,
      inner.y * Math.sign(p.y) + n.y * r,
      inner.z * Math.sign(p.z) + n.z * r,
    );
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
  return g;
}

/** Lathe around +Y from [radius, y] pairs listed bottom -> top. */
function lathe(points, segments = 48) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

/** Cylinder between two Y values, optionally elliptic (sx, sz radii). */
function cylY(r, y0, y1, seg = 32, rz = r) {
  const g = new THREE.CylinderGeometry(1, 1, Math.abs(y1 - y0), seg, 1, false);
  g.scale(r, 1, rz);
  g.translate(0, (y0 + y1) / 2, 0);
  return g;
}

/** Cylinder whose axis is X (centre cx..), length len. */
function cylX(r, len, seg = 24) {
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  g.rotateZ(Math.PI / 2);
  return g;
}

/** Cylinder whose axis is Z, spanning z0..z1. */
function cylZ(r, z0, z1, seg = 24) {
  const g = new THREE.CylinderGeometry(r, r, Math.abs(z1 - z0), seg, 1, false);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, (z0 + z1) / 2);
  return g;
}

/** Knurled cylinder (gear-profile extrusion) along +Y from y0, height h. */
function knurled(rOuter, rInner, teeth, y0, h) {
  const shape = new THREE.Shape();
  const steps = teeth * 4;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const phase = i % 4;
    const r = phase === 0 || phase === 1 ? rOuter : rInner;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  // no bevel: an offset bevel on the concave gear profile folds through itself (self_intersection gate)
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  g.computeVertexNormals();
  return g;
}

/** Rounded-triangle tribrach plate: convex hull of three corner circles + a centre circle. */
function tribrachPlate(thickness) {
  const circles = [{ x: 0, y: 0, r: 0.071 }];
  for (const azDeg of [60, 180, 300]) {
    const az = azDeg * DEG;
    // shape space (x, ys) maps to world (x, -z) after rotateX(-90deg)
    circles.push({ x: 0.066 * Math.sin(az), y: -0.066 * Math.cos(az), r: 0.021 });
  }
  const shape = new THREE.Shape();
  const n = 144;
  let last = [0, 0];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    let best = circles[0];
    let bestH = -Infinity;
    for (const c of circles) {
      const hgt = c.x * ux + c.y * uy + c.r;
      if (hgt > bestH) { bestH = hgt; best = c; }
    }
    const x = best.x + best.r * ux;
    const y = best.y + best.r * uy;
    if (i === 0) shape.moveTo(x, y);
    else if (Math.hypot(x - last[0], y - last[1]) > 0.0015 && i < n) shape.lineTo(x, y);
    else continue;
    last = [x, y];
  }
  const bevel = 0.0015;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 2, curveSegments: 1,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  g.computeVertexNormals();
  return g;
}

/**
 * Telescope housing: side profile (z forward, y up) with a flat top, flat front/back faces and a
 * bottom arc centred on the trunnion axis, so the housing can tilt without sweeping into the body.
 * Extruded along X (width 0.08) with rounded edges.
 */
function telescopeHousing(width = 0.08, halfDepth = 0.066, top = 0.073, arcR = 0.098, fillet = 0.008, bevel = 0.005) {
  const hd = halfDepth - bevel;
  const tp = top - bevel;
  const ar = arcR - bevel;
  const va = -Math.sqrt(ar * ar - hd * hd);
  const s = new THREE.Shape();
  s.moveTo(-hd + fillet, tp);
  s.lineTo(hd - fillet, tp);
  s.quadraticCurveTo(hd, tp, hd, tp - fillet);
  s.lineTo(hd, va);
  s.absarc(0, 0, ar, Math.atan2(va, hd), Math.atan2(va, -hd), true);
  s.lineTo(-hd, tp - fillet);
  s.quadraticCurveTo(-hd, tp, -hd + fillet, tp);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: width - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 3, curveSegments: 24,
  });
  g.translate(0, 0, -(width - 2 * bevel) / 2);
  g.rotateY(-Math.PI / 2); // shape u (forward) -> +Z, extrusion -> X
  g.computeVertexNormals();
  return g;
}

/** Spherical cap facing +Z: rim radius a, sagitta from radius of curvature R; apex at z = 0. */
function lensCap(a, R, seg = 40) {
  const theta = Math.asin(Math.min(1, a / R));
  const g = new THREE.SphereGeometry(R, seg, 12, 0, Math.PI * 2, 0, theta);
  g.rotateX(Math.PI / 2);      // pole (+Y) -> +Z
  g.translate(0, 0, -R);       // apex at z = 0
  return g;
}

// --------------------------------------------------------------------------------------------
// Procedural textures (seeded, independent of albedo)
// --------------------------------------------------------------------------------------------

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable multi-octave value noise into a canvas texture; value range [lo, hi] (0..1). */
function noiseTexture({ seed, size = 1024, octaves = [[4, 0.55], [16, 0.3], [64, 0.15]], lo = 0.8, hi = 1.0 }) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const acc = new Float32Array(size * size);
  const rand = mulberry32(seed);
  let total = 0;
  for (const [cells, amp] of octaves) {
    total += amp;
    const lattice = new Float32Array(cells * cells);
    for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
    const step = cells / size;
    for (let y = 0; y < size; y++) {
      const fy = y * step;
      const y0 = Math.floor(fy);
      const ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      const r0 = (y0 % cells) * cells;
      const r1 = ((y0 + 1) % cells) * cells;
      for (let x = 0; x < size; x++) {
        const fx = x * step;
        const x0 = Math.floor(fx);
        const tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const c0 = x0 % cells;
        const c1 = (x0 + 1) % cells;
        const a = lattice[r0 + c0] + (lattice[r0 + c1] - lattice[r0 + c0]) * sx;
        const b = lattice[r1 + c0] + (lattice[r1 + c1] - lattice[r1 + c0]) * sx;
        acc[y * size + x] += (a + (b - a) * sy) * amp;
      }
    }
  }
  for (let i = 0; i < acc.length; i++) {
    const v = Math.round((lo + (hi - lo) * (acc[i] / total)) * 255);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// --------------------------------------------------------------------------------------------
// Materials (ids match object-sculpt-spec.json materials[])
// --------------------------------------------------------------------------------------------

function createMaterials({ clay = false, textures = true, textureSize = 1024 } = {}) {
  const made = {};
  const disposables = [];
  if (clay) {
    // pass-gated review renders (blockout/structure/form) judge form without materials
    const base = new THREE.MeshStandardMaterial({ color: 0xa8a49b, roughness: 0.7, metalness: 0 });
    base.name = 'clay';
    disposables.push(base);
    return { lib: new Proxy({}, { get: () => base }), disposables };
  }
  let roughA = null;
  let roughB = null;
  let bump = null;
  if (textures) {
    roughA = noiseTexture({ seed: 1301, size: textureSize, lo: 0.82, hi: 1.0 });
    roughB = noiseTexture({ seed: 7717, size: textureSize, octaves: [[8, 0.5], [32, 0.3], [128, 0.2]], lo: 0.88, hi: 1.0 });
    bump = noiseTexture({ seed: 4242, size: textureSize, octaves: [[32, 0.4], [96, 0.35], [256, 0.25]], lo: 0.0, hi: 1.0 });
    for (const t of [roughA, roughB, bump]) if (t) { t.repeat.set(3, 3); disposables.push(t); }
  }
  const std = (id, params) => {
    const m = new THREE.MeshStandardMaterial(params);
    m.name = id;
    m.userData.referenceMaterialId = id;
    made[id] = m;
    disposables.push(m);
    return m;
  };
  const phys = (id, params) => {
    const m = new THREE.MeshPhysicalMaterial(params);
    m.name = id;
    m.userData.referenceMaterialId = id;
    made[id] = m;
    disposables.push(m);
    return m;
  };
  const c = (hex) => new THREE.Color(hex);

  phys('legPaintYellow', {
    color: c('#f59800'), roughness: 0.36, metalness: 0, specularIntensity: 0.4,
    clearcoat: 0.6, clearcoatRoughness: 0.06, envMapIntensity: 0.3,
    // warm grazing-angle sheen: reference tubes are yellow face-on and saturated orange at the edges
    sheen: 1.0, sheenColor: c('#ff5200'), sheenRoughness: 0.45, roughnessMap: roughA, bumpMap: bump, bumpScale: 0.15,
  });
  std('blackPolymer', { color: c('#141316'), roughness: 0.6, metalness: 0, envMapIntensity: 0.4, roughnessMap: roughB, bumpMap: bump, bumpScale: 0.08 });
  std('rubberBlack', { color: c('#1c1b1d'), roughness: 0.68, metalness: 0, roughnessMap: roughB });
  std('spikeSteel', { color: c('#8a8c90'), roughness: 0.24, metalness: 1, roughnessMap: roughB });
  std('chrome', { color: c('#a4a6aa'), roughness: 0.22, metalness: 1, roughnessMap: roughB });
  std('headDark', { color: c('#29282a'), roughness: 0.42, metalness: 0.35, roughnessMap: roughB });
  std('tribrachBlack', { color: c('#161718'), roughness: 0.38, metalness: 0.25, roughnessMap: roughB });
  std('knurlMetal', { color: c('#303033'), roughness: 0.4, metalness: 0.7, roughnessMap: roughB });
  std('hingeOrange', { color: c('#c45f16'), roughness: 0.4, metalness: 0.25, roughnessMap: roughB });
  phys('instrumentShell', {
    color: c('#d0d1d3'), roughness: 0.4, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.3,
    roughnessMap: roughA, bumpMap: bump, bumpScale: 0.06,
  });
  phys('telescopeCharcoal', {
    color: c('#1b1e21'), roughness: 0.5, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.35, envMapIntensity: 0.6,
    roughnessMap: roughB,
  });
  std('sidePanelGrey', { color: c('#8a8d93'), roughness: 0.45, metalness: 0.1, roughnessMap: roughB });
  std('greyPlate', { color: c('#8e9295'), roughness: 0.45, metalness: 0.1, roughnessMap: roughB });
  std('baseDiscGrey', { color: c('#c2c1bf'), roughness: 0.38, metalness: 0, roughnessMap: roughB });
  std('accentOrange', { color: c('#e0661c'), roughness: 0.38, metalness: 0, roughnessMap: roughB });
  std('handleGrip', { color: c('#46474b'), roughness: 0.5, metalness: 0, roughnessMap: roughB });
  phys('lensGlass', {
    color: c('#071420'), roughness: 0.03, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02,
    specularColor: c('#8fdcff'), specularIntensity: 1, iridescence: 0.35, iridescenceIOR: 1.6,
    iridescenceThicknessRange: [300, 420], emissive: c('#06263a'), emissiveIntensity: 0.6, envMapIntensity: 1.6,
    roughnessMap: roughB,
  });
  std('lensRing', { color: c('#aeb2b6'), roughness: 0.26, metalness: 1, roughnessMap: roughB });
  std('copperScrew', { color: c('#b8682e'), roughness: 0.35, metalness: 0.85 });
  std('screenGlass', { color: c('#0b1418'), roughness: 0.08, metalness: 0, emissive: c('#0f3540'), emissiveIntensity: 0.6 });
  std('darkSteel', { color: c('#3c3d40'), roughness: 0.35, metalness: 0.9 });
  // small helpers that are not separate spec materials (shades of the parent material)
  std('seamDark', { color: c('#121314'), roughness: 0.6, metalness: 0 });
  std('panelLight', { color: c('#ebebea'), roughness: 0.4, metalness: 0 });
  return { lib: made, disposables };
}

// --------------------------------------------------------------------------------------------
// Model factory
// --------------------------------------------------------------------------------------------

const STAGE_LEVELS = {
  blockout: new Set(['macro']),
  structure: new Set(['macro', 'meso']),
  form: new Set(['macro', 'meso', 'micro']),
  full: new Set(['macro', 'meso', 'micro']),
};

/**
 * @param {object} [options]
 * @param {'blockout'|'structure'|'form'|'full'} [options.stage='full'] pass-gated build level
 * @param {'high'|'low'} [options.detail='high'] tessellation / micro detail
 * @param {boolean} [options.castShadow=true]
 * @param {boolean} [options.textures=true] procedural roughness/bump canvases (browser only)
 * @param {number} [options.alidadeYaw] degrees (default 28, as in the reference)
 * @returns {THREE.Group}
 */
export function createTotalStationModel(options = {}) {
  const stage = options.stage ?? 'full';
  const levels = STAGE_LEVELS[stage] ?? STAGE_LEVELS.full;
  const high = (options.detail ?? 'high') !== 'low';
  const castShadow = options.castShadow ?? true;
  const clay = stage !== 'full';
  const { lib: M, disposables } = createMaterials({ clay, textures: options.textures ?? true, textureSize: high ? 1024 : 512 });
  const RS = high ? 1 : 0.5; // radial segment scale
  const seg = (n) => Math.max(6, Math.round(n * RS));

  const geometries = [];
  const root = new THREE.Group();
  root.name = 'totalStationOnTripod';
  root.userData.spec = 'object-sculpt-spec.json';
  root.userData.units = 'metres';
  const parts = {};

  /** Named component group (one per spec component). */
  function part(id, level, parent, { position = [0, 0, 0], rotation = null, order = 'XYZ', explode = null } = {}) {
    const g = new THREE.Group();
    g.name = id;
    g.position.set(...position);
    if (rotation) { g.rotation.order = order; g.rotation.set(...rotation); }
    g.userData.part = true;
    g.userData.componentId = id;
    g.userData.level = level;
    g.userData.basePosition = g.position.clone();
    if (explode) g.userData.explodeOffset = new THREE.Vector3(...explode);
    g.visible = levels.has(level);
    (parent ?? root).add(g);
    parts[id] = g;
    return g;
  }

  /** Mesh helper. level = visibility level of this sub-mesh (micro details hide before 'form'). */
  // shared geometry cache: the three legs (and other repeats) reuse one BufferGeometry per shape
  const geoCache = new Map();
  const G = (key, factory) => {
    if (!geoCache.has(key)) geoCache.set(key, factory());
    return geoCache.get(key);
  };
  function mesh(parent, geometry, materialId, name, level = null, { position = null, rotation = null } = {}) {
    if (level && !levels.has(level)) return null;
    if (level === 'micro' && !high) return null; // detail:'low' drops micro screws, keys and slots
    if (!geometries.includes(geometry)) geometries.push(geometry);
    const m = new THREE.Mesh(geometry, M[materialId]);
    m.name = `${parent.name}:${name}`;
    m.userData.partId = parent.userData.componentId ?? parent.name;
    m.userData.materialId = materialId;
    if (position) m.position.set(...position);
    if (rotation) m.rotation.set(...rotation);
    m.castShadow = castShadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  const P = TOTAL_STATION_PARAMS;
  const splay = P.splayDeg * DEG;
  const legLen = P.hingeY / Math.cos(splay);

  // ------------------------------------------------------------------ tripod head (root)
  const head = part('tripodHead', 'macro', root, { position: [0, P.headY, 0] });
  mesh(head, lathe([[0, -0.01], [0.087, -0.01], [0.09, -0.0075], [0.09, 0.0065], [0.0865, 0.01], [0, 0.01]], seg(72)), 'headDark', 'plate');

  const hub = part('headHub', 'macro', head, { explode: [0, -0.05, 0] });
  mesh(hub, lathe([[0, -0.064], [0.05, -0.064], [0.058, -0.058], [0.061, -0.05], [0.061, -0.009], [0, -0.009]], seg(48)), 'headDark', 'hub');

  const plumb = part('plumbScrew', 'meso', head, { explode: [0, -0.12, 0] });
  mesh(plumb, cylY(0.0075, -0.062, -0.112, seg(16)), 'darkSteel', 'rod');
  mesh(plumb, knurled(0.019, 0.0175, 24, -0.132, 0.02), 'knurlMetal', 'knob');
  mesh(plumb, new THREE.TorusGeometry(0.007, 0.0018, 8, 20), 'darkSteel', 'hook', 'micro', { position: [0, -0.142, 0], rotation: [0, 0, 0] });

  // ------------------------------------------------------------------ legs + hinge lugs
  const legEntries = Object.entries(P.legAzimuthDeg);
  const legs = [];
  for (const [legId, azDeg] of legEntries) {
    const az = azDeg * DEG;
    const hx = P.hingeRadius * Math.sin(az);
    const hz = P.hingeRadius * Math.cos(az);
    const hy = P.hingeY - P.headY;
    const suffix = legId.slice(3); // Front | RearRight | RearLeft

    // hub arm toward this hinge (belongs to the head casting)
    const arm = roundedBox(0.112, 0.024, 0.05, 0.006, 2);
    arm.translate(0, hy + 0.012, P.hingeRadius - 0.055);
    arm.rotateY(az);
    mesh(hub, arm, 'headDark', `arm${suffix}`);

    // orange lug pair + bolt + wing knob (static, on the head)
    const lugs = part(`hingeLugs${suffix}`, 'macro', head, {
      position: [hx, hy, hz], rotation: [0, az, 0], explode: [0, 0.02, 0],
    });
    for (const sx of [-1, 1]) {
      mesh(lugs, G(`roundedBox(0.01, 0.03, 0.046, 0.0035, 2)`, () => roundedBox(0.01, 0.03, 0.046, 0.0035, 2)), 'hingeOrange', sx < 0 ? 'lugA' : 'lugB', null, { position: [sx * 0.05, 0.004, -0.012] });
    }
    mesh(lugs, G(`cylX(0.0052, 0.126, seg(16))`, () => cylX(0.0052, 0.126, seg(16))), 'darkSteel', 'bolt', 'micro');
    mesh(lugs, G(`cylX(0.0085, 0.006, 6)`, () => cylX(0.0085, 0.006, 6)), 'darkSteel', 'nut', 'micro', { position: [-0.0605, 0, 0] });
    mesh(lugs, G(`cylX(0.006, 0.008, seg(12))`, () => cylX(0.006, 0.008, seg(12))), 'blackPolymer', 'wingShaft', 'micro', { position: [0.061, 0, 0] });
    mesh(lugs, G(`roundedBox(0.008, 0.036, 0.013, 0.003, 2)`, () => roundedBox(0.008, 0.036, 0.013, 0.003, 2)), 'blackPolymer', 'wingKnob', 'micro', { position: [0.0685, 0, 0] });

    // leg pivot at the hinge: R = Ry(az) * Rx(-splay)
    const leg = part(legId, 'macro', head, {
      position: [hx, hy, hz], rotation: [-splay, az, 0], order: 'YXZ',
      explode: [Math.sin(az) * 0.18, -0.05, Math.cos(az) * 0.18],
    });
    leg.userData.restSplay = splay;
    legs.push(leg);
    mesh(leg, G(`cylX(0.0045, 0.09, seg(12))`, () => cylX(0.0045, 0.09, seg(12))), 'darkSteel', 'hingePin');

    const cap = part(`${legId}Cap`, 'macro', leg, { explode: [0, 0.03, 0] });
    mesh(cap, G(`roundedBox(0.086, 0.074, 0.038, 0.009, 3)`, () => roundedBox(0.086, 0.074, 0.038, 0.009, 3)), 'blackPolymer', 'housing', null, { position: [0, -0.02, -0.002] });
    mesh(cap, G(`cylX(0.0165, 0.086, seg(24))`, () => cylX(0.0165, 0.086, seg(24))), 'blackPolymer', 'knuckle');

    for (const [t, x] of [['TubeA', -0.027], ['TubeB', 0.027]]) {
      const tube = part(`${legId}${t}`, 'macro', leg, { explode: [x * 1.5, -0.04, 0] });
      mesh(tube, G(`cylY(0.0115, -0.565, -0.03, seg(28))`, () => cylY(0.0115, -0.565, -0.03, seg(28))), 'legPaintYellow', 'tube', null, { position: [x, 0, 0] });
    }

    const rod = part(`${legId}SlideRod`, 'macro', leg, { explode: [0, -0.06, 0.05] });
    mesh(rod, G(`cylY(0.0072, -0.555, -0.06, seg(16))`, () => cylY(0.0072, -0.555, -0.06, seg(16))), 'chrome', 'rod');
    mesh(rod, G(`roundedBox(0.026, 0.068, 0.012, 0.004, 2)`, () => roundedBox(0.026, 0.068, 0.012, 0.004, 2)), 'blackPolymer', 'guideBlock', 'micro', { position: [0, -0.097, 0] });
    mesh(rod, G(`roundedBox(0.022, 0.068, 0.012, 0.004, 2)`, () => roundedBox(0.022, 0.068, 0.012, 0.004, 2)), 'blackPolymer', 'collarBlock', 'micro', { position: [0, -0.281, 0] });
    mesh(rod, G(`cylY(0.0085, -0.347, -0.315, seg(16))`, () => cylY(0.0085, -0.347, -0.315, seg(16))), 'seamDark', 'ring', 'micro');

    const clamp = part(`${legId}Clamp`, 'macro', leg, { explode: [0, -0.08, 0.05] });
    mesh(clamp, G(`roundedBox(0.09, 0.05, 0.05, 0.009, 3)`, () => roundedBox(0.09, 0.05, 0.05, 0.009, 3)), 'blackPolymer', 'collar', null, { position: [0, -0.558, 0] });
    // split line of the clamp collar on its outward face
    mesh(clamp, G(`roundedBox(0.0016, 0.046, 0.002, 0.0006, 1)`, () => roundedBox(0.0016, 0.046, 0.002, 0.0006, 1)), 'seamDark', 'split', 'micro', { position: [-0.016, -0.558, 0.0247] });
    mesh(clamp, G(`roundedBox(0.0016, 0.046, 0.002, 0.0006, 1)`, () => roundedBox(0.0016, 0.046, 0.002, 0.0006, 1)), 'seamDark', 'splitB', 'micro', { position: [0.016, -0.558, 0.0247] });
    mesh(clamp, G(`cylZ(0.0095, 0.023, 0.037, seg(20))`, () => cylZ(0.0095, 0.023, 0.037, seg(20))), 'blackPolymer', 'knob', 'micro', { position: [0, -0.558, 0] });
    mesh(clamp, G(`cylZ(0.0105, 0.036, 0.04, seg(20))`, () => cylZ(0.0105, 0.036, 0.04, seg(20))), 'blackPolymer', 'knobFace', 'micro', { position: [0, -0.558, 0] });
    mesh(clamp, G(`cylZ(0.0026, 0.0395, 0.0415, seg(10))`, () => cylZ(0.0026, 0.0395, 0.0415, seg(10))), 'copperScrew', 'knobScrew', 'micro', { position: [0, -0.558, 0] });

    const lower = part(`${legId}LowerTube`, 'macro', leg, { explode: [0, -0.1, 0] });
    mesh(lower, G(`cylY(0.024, -0.77, -0.55, seg(32))`, () => cylY(0.024, -0.77, -0.55, seg(32))), 'legPaintYellow', 'tube');

    const shoe = part(`${legId}Shoe`, 'macro', leg, { explode: [0, -0.13, 0] });
    mesh(shoe, G(`lathe([[0, -0.848], [0.017, -0.848], [0.0225, -0.8425], [0.029, -0.834], [0.031, -0.829],
      [0.031, -0.767], [0.0298, -0.7628], [0.027, -0.761], [0, -0.761]], seg(40))`, () => lathe([[0, -0.848], [0.017, -0.848], [0.0225, -0.8425], [0.029, -0.834], [0.031, -0.829],
      [0.031, -0.767], [0.0298, -0.7628], [0.027, -0.761], [0, -0.761]], seg(40))), 'rubberBlack', 'shoe');
    mesh(shoe, G(`cylZ(0.0105, 0.0292, 0.0312, seg(20))`, () => cylZ(0.0105, 0.0292, 0.0312, seg(20))), 'darkSteel', 'washer', 'micro', { position: [0, -0.797, 0] });
    mesh(shoe, G(`cylZ(0.0085, 0.031, 0.0372, 6)`, () => cylZ(0.0085, 0.031, 0.0372, 6)), 'darkSteel', 'hexBolt', 'micro', { position: [0, -0.797, 0], rotation: [0, 0, Math.PI / 6] });

    const spike = part(`${legId}Spike`, 'macro', leg, { explode: [0, -0.16, 0] });
    const L = legLen;
    mesh(spike, G(`lathe([[0, -L], [0.0012, -L + 0.0025], [0.0045, -L + 0.0115], [0.009, -L + 0.0265], [0.013, -L + 0.0435],
      [0.0148, -0.87], [0.0153, -0.858], [0.0149, -0.8485], [0.012, -0.846], [0, -0.846]], seg(32))`, () => lathe([[0, -L], [0.0012, -L + 0.0025], [0.0045, -L + 0.0115], [0.009, -L + 0.0265], [0.013, -L + 0.0435],
      [0.0148, -0.87], [0.0153, -0.858], [0.0149, -0.8485], [0.012, -0.846], [0, -0.846]], seg(32))), 'spikeSteel', 'spike');
  }

  // ------------------------------------------------------------------ tribrach
  const tribrach = part('tribrach', 'macro', head, { position: [0, 0.01, 0], explode: [0, 0.08, 0] });
  mesh(tribrach, tribrachPlate(0.012), 'tribrachBlack', 'plate');
  ['A', 'B', 'C'].forEach((letter, i) => {
    const az = [60, 180, 300][i] * DEG;
    const screw = part(`levelScrew${letter}`, 'macro', tribrach, {
      position: [0.066 * Math.sin(az), 0, 0.066 * Math.cos(az)], explode: [0.03 * Math.sin(az), 0.02, 0.03 * Math.cos(az)],
    });
    mesh(screw, knurled(0.0145, 0.0133, 30, 0.012, 0.019), 'knurlMetal', 'knob');
    mesh(screw, cylY(0.0075, 0.031, 0.036, seg(16)), 'darkSteel', 'spindle', 'micro');
  });
  const tTop = part('tribrachTop', 'macro', tribrach, { explode: [0, 0.04, 0] });
  mesh(tTop, lathe([[0, 0.024], [0.059, 0.024], [0.063, 0.027], [0.063, 0.033], [0.06, 0.036], [0, 0.036]], seg(56)), 'headDark', 'ring');
  // central housing between base plate and ring (fills the screw band in silhouette)
  mesh(tTop, lathe([[0, 0.011], [0.044, 0.011], [0.047, 0.014], [0.047, 0.025], [0, 0.025]], seg(48)), 'tribrachBlack', 'core');
  mesh(tTop, cylZ(0.0042, 0.06, 0.076, seg(12)), 'darkSteel', 'lockShaft', 'micro', { position: [0, 0.03, 0] });
  mesh(tTop, roundedBox(0.012, 0.009, 0.014, 0.003, 2), 'blackPolymer', 'lockKnob', 'micro', { position: [0, 0.03, 0.082] });

  // ------------------------------------------------------------------ instrument (alidade)
  const alidade = part('alidade', 'macro', tribrach, {
    position: [0, 0.036, 0], rotation: [0, (options.alidadeYaw ?? P.alidadeYawDeg) * DEG, 0], explode: [0, 0.3, 0],
  });
  mesh(alidade, lathe([[0, 0], [0.0735, 0], [0.077, 0.0035], [0.077, 0.0168], [0.074, 0.0202], [0, 0.0202]], seg(72)), 'baseDiscGrey', 'disc');
  const seamRing = new THREE.TorusGeometry(0.0771, 0.0006, 6, seg(72));
  seamRing.rotateX(Math.PI / 2);
  mesh(alidade, seamRing, 'seamDark', 'circleSeam', 'micro', { position: [0, 0.0104, 0] });

  const housing = part('baseHousing', 'macro', alidade, { explode: [0, 0.01, 0] });
  mesh(housing, roundedBox(0.184, 0.022, 0.15, 0.007, 2), 'telescopeCharcoal', 'band', null, { position: [0, 0.025, 0] });

  for (const [sid, sx] of [['standardRight', -1], ['standardLeft', 1]]) {
    const st = part(sid, 'macro', alidade, { position: [sx * 0.067, 0.136, 0], explode: [sx * 0.07, 0.02, 0] });
    mesh(st, roundedBox(0.05, 0.2, 0.145, 0.011, 3), 'instrumentShell', 'shell');
    // seam band where the standard meets the base housing
    mesh(st, roundedBox(0.0505, 0.003, 0.1455, 0.0012, 1), 'seamDark', 'seam', 'micro', { position: [0, -0.0985, 0] });
    // copper screw low on the front face
    mesh(st, cylZ(0.0029, 0.0723, 0.0743, seg(12)), 'copperScrew', 'frontScrew', 'micro', { position: [sx < 0 ? -0.006 : 0.002, -0.08, 0] });
    if (sx < 0) {
      // lighter inset panel with dark outline on the front face (reference x186-196, y95-118)
      mesh(st, roundedBox(0.024, 0.049, 0.0016, 0.0008, 1), 'greyPlate', 'slotFrame', 'micro', { position: [-0.006, -0.035, 0.0724] });
      mesh(st, roundedBox(0.021, 0.046, 0.0018, 0.0008, 1), 'panelLight', 'slotPanel', 'micro', { position: [-0.006, -0.035, 0.073] });
    } else {
      mesh(st, cylZ(0.0022, 0.0723, 0.0737, seg(10)), 'seamDark', 'ledDot', 'micro', { position: [0.002, 0.034, 0] });
    }
    // darker grey side cover plate on the outer face (reference side face reads mid-grey, fronts light grey)
    mesh(st, roundedBox(0.003, 0.178, 0.124, 0.0012, 1), 'sidePanelGrey', 'sidePlate', 'micro', { position: [sx * 0.0251, 0.002, -0.004] });
    const cover = part(sx < 0 ? 'sideCoverRight' : 'sideCoverLeft', 'meso', st, {
      position: [sx * 0.0245, 0.034, -0.024], explode: [sx * 0.05, 0, 0],
    });
    const cg = lathe([[0, 0], [0.0335, 0], [0.035, 0.0015], [0.035, 0.0046], [0.0335, 0.006], [0.0235, 0.006],
      [0.0222, 0.0049], [0.0208, 0.0049], [0.0198, 0.0058], [0, 0.0058]], seg(48));
    cg.rotateZ(-sx * Math.PI / 2); // lathe +Y -> outward (sx) X
    mesh(cover, cg, 'telescopeCharcoal', 'cover');
  }

  const keypad = part('sideKeypad', 'meso', parts.standardRight, { position: [-0.0268, -0.053, -0.038], explode: [-0.04, 0, 0] });
  mesh(keypad, roundedBox(0.004, 0.076, 0.05, 0.0015, 2), 'greyPlate', 'panel');
  mesh(keypad, roundedBox(0.003, 0.012, 0.012, 0.0012, 1), 'telescopeCharcoal', 'key', 'micro', { position: [-0.002, -0.018, 0.004] });
  for (const [ky, kz] of [[0.032, -0.019], [0.032, 0.019], [-0.032, -0.019], [-0.032, 0.019]]) {
    mesh(keypad, cylX(0.0018, 0.0012, 8), 'darkSteel', `screw${ky > 0 ? 'T' : 'B'}${kz > 0 ? 'F' : 'R'}`, 'micro', { position: [-0.0024, ky, kz] });
  }

  const body = part('centralBody', 'meso', alidade, { explode: [0, 0.0, 0] });
  mesh(body, roundedBox(0.088, 0.032, 0.14, 0.006, 2), 'instrumentShell', 'block', null, { position: [0, 0.052, 0] });

  const sensor = part('frontSensorBlock', 'meso', alidade, { position: [0, 0.049, 0.075], explode: [0, 0, 0.06] });
  mesh(sensor, roundedBox(0.078, 0.05, 0.032, 0.006, 3), 'instrumentShell', 'block');
  for (const lx of [-0.0148, 0.0148]) {
    mesh(sensor, cylZ(0.0118, 0.0155, 0.0172, seg(28)), 'seamDark', `port${lx < 0 ? 'A' : 'B'}`, 'micro', { position: [lx, 0.002, 0] });
    mesh(sensor, new THREE.TorusGeometry(0.0104, 0.0014, 8, seg(28)), 'lensRing', `ring${lx < 0 ? 'A' : 'B'}`, 'micro', { position: [lx, 0.002, 0.0172] });
    const glass = lensCap(0.0092, 0.024, seg(24));
    glass.translate(0, 0, 0.0182);
    mesh(sensor, glass, 'lensGlass', `glass${lx < 0 ? 'A' : 'B'}`, 'micro', { position: [lx, 0.002, 0] });
  }

  // telescope tilts about the trunnion axis
  const telescope = part('telescope', 'macro', alidade, { position: [0, 0.17, 0], explode: [0, 0.09, 0.0] });
  mesh(telescope, telescopeHousing(), 'telescopeCharcoal', 'housing');
  mesh(telescope, cylX(0.016, 0.0875, seg(24)), 'darkSteel', 'trunnionAxle');

  const objective = part('objectiveLens', 'meso', telescope, { position: [0, 0.004, 0], explode: [0, 0, 0.1] });
  const LZ = 0.012; // objective protrudes ~0.03 m beyond the telescope face, as in the reference
  const barrel = lathe([[0.0262, 0.06], [0.0305, 0.06], [0.031, 0.062], [0.031, 0.08 + LZ], [0.0262, 0.08 + LZ]], seg(48));
  barrel.rotateX(Math.PI / 2);
  mesh(objective, barrel, 'telescopeCharcoal', 'barrel');
  const ring = lathe([[0.0262, 0.0795], [0.0312, 0.0795], [0.0316, 0.0818], [0.0306, 0.0858], [0.0283, 0.0872],
    [0.0262, 0.0866], [0.0258, 0.0835]], seg(56));
  ring.rotateX(Math.PI / 2);
  ring.translate(0, 0, LZ);
  mesh(objective, ring, 'lensRing', 'frontRing');
  const inner = lathe([[0.0262, 0.078], [0.0262, 0.0835], [0.0258, 0.0835], [0.0228, 0.0786], [0.0262, 0.078]], seg(48));
  inner.rotateX(Math.PI / 2);
  inner.translate(0, 0, LZ);
  mesh(objective, inner, 'seamDark', 'innerRing', 'micro');
  const backing = new THREE.CircleGeometry(0.0236, seg(40));
  backing.translate(0, 0, 0.0765 + LZ);
  mesh(objective, backing, 'seamDark', 'backing');
  const glass = lensCap(0.0232, 0.075, seg(48));
  glass.translate(0, 0, 0.0828 + LZ);
  mesh(objective, glass, 'lensGlass', 'glass');

  for (const [pid, py, ph, pw] of [['telescopeTopPlate', 0.046, 0.024, 0.04], ['telescopeBottomPlate', -0.058, 0.026, 0.042]]) {
    const plate = part(pid, 'meso', telescope, { position: [0, py, 0.067], explode: [0, 0, 0.05] });
    mesh(plate, roundedBox(pw, ph, 0.006, 0.0025, 2), 'greyPlate', 'plate');
    mesh(plate, cylZ(0.0032, 0.0028, 0.0046, seg(14)), 'darkSteel', 'screw', 'micro');
    mesh(plate, roundedBox(0.0045, 0.0009, 0.0008, 0.0003, 1), 'seamDark', 'screwSlot', 'micro', { position: [0, 0, 0.0048] });
  }

  const eyepiece = part('eyepiece', 'meso', telescope, { position: [0, 0.004, 0], explode: [0, 0, -0.08] });
  const ep = lathe([[0, 0.064], [0.0168, 0.064], [0.0168, 0.072], [0.0172, 0.0738], [0.0172, 0.0862], [0.0166, 0.0873], [0.0154, 0.0884],
    [0.0147, 0.0902], [0.0142, 0.096], [0.0155, 0.1], [0.012, 0.102], [0.006, 0.098], [0, 0.098]], seg(36));
  ep.rotateX(-Math.PI / 2); // lathe +Y -> -Z (behind the telescope)
  mesh(eyepiece, ep, 'rubberBlack', 'eyepiece');
  if (levels.has('micro')) {
    const ribs = knurled(0.0181, 0.0172, 36, 0, 0.0115);
    ribs.rotateX(-Math.PI / 2);
    ribs.translate(0, 0, -0.0738);
    mesh(eyepiece, ribs, 'rubberBlack', 'focusRibs', 'micro');
  }

  for (const [hid, sx] of [['handleUprightRight', -1], ['handleUprightLeft', 1]]) {
    const up = part(hid, 'macro', alidade, { position: [sx * 0.07, 0.272, 0], explode: [sx * 0.03, 0.12, 0] });
    mesh(up, roundedBox(0.042, 0.08, 0.052, 0.012, 3), 'instrumentShell', 'upright');
    const acc = part(sx < 0 ? 'handleAccentRight' : 'handleAccentLeft', 'meso', up, {
      position: [sx * 0.0125, 0.0045, 0.0125], explode: [sx * 0.03, 0, 0.03],
    });
    mesh(acc, roundedBox(0.018, 0.074, 0.03, 0.006, 3), 'accentOrange', 'trim');
  }
  const grip = part('handleGrip', 'macro', alidade, { position: [0, 0.3, 0], explode: [0, 0.16, 0] });
  mesh(grip, roundedBox(0.1, 0.022, 0.034, 0.008, 3), 'handleGrip', 'bar');

  const rear = part('rearKeyboard', 'meso', alidade, { position: [0, 0.062, -0.078], explode: [0, 0, -0.08] });
  mesh(rear, roundedBox(0.15, 0.06, 0.03, 0.006, 3), 'instrumentShell', 'unit');
  mesh(rear, roundedBox(0.074, 0.038, 0.002, 0.002, 1), 'seamDark', 'bezel', 'micro', { position: [0, 0.008, -0.0151] });
  mesh(rear, roundedBox(0.068, 0.033, 0.0022, 0.0015, 1), 'screenGlass', 'screen', 'micro', { position: [0, 0.008, -0.0156] });
  if (levels.has('micro')) {
    const keyGeo = roundedBox(0.009, 0.0065, 0.003, 0.0012, 1);
    geometries.push(keyGeo);
    const slots = [];
    for (let i = 0; i < 6; i++) slots.push([-0.0375 + i * 0.015, -0.0185]);
    for (const x of [-0.06, -0.047, 0.047, 0.06]) for (const y of [0.016, 0.0]) slots.push([x, y]);
    const keys = new THREE.InstancedMesh(keyGeo, M.handleGrip, slots.length);
    keys.name = 'rearKeyboard:keys';
    keys.userData.partId = 'rearKeyboard';
    const mtx = new THREE.Matrix4();
    slots.forEach(([x, y], i) => { mtx.makeTranslation(x, y, -0.0158); keys.setMatrixAt(i, mtx); });
    keys.castShadow = castShadow;
    rear.add(keys);
  }

  // ------------------------------------------------------------------ sockets (named attachment / effect points)
  const sockets = {};
  const socket = (name, parent, position, lookDir = null) => {
    const o = new THREE.Object3D();
    o.name = `socket:${name}`;
    o.position.set(...position);
    if (lookDir) o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...lookDir).normalize());
    o.userData.socket = name;
    parent.add(o);
    sockets[name] = o;
    return o;
  };
  socket('lineOfSight', telescope, [0, 0.004, 0.1], [0, 0, 1]);      // +Z out of the objective (laser / beam FX)
  socket('eyepiece', telescope, [0, 0.004, -0.102], [0, 0, -1]);
  socket('handleGrip', parts.handleGrip, [0, 0, 0]);
  socket('instrumentMount', tribrach, [0, 0.036, 0], [0, 1, 0]);     // alidade seat on the tribrach
  socket('tripodHeadTop', head, [0, 0.01, 0], [0, 1, 0]);
  socket('plumbHook', parts.plumbScrew, [0, -0.142, 0], [0, -1, 0]); // plumb-bob / laser-plummet origin
  socket('rearDisplay', parts.rearKeyboard, [0, 0.008, -0.017], [0, 0, -1]);
  for (const leg of legs) socket(`${leg.name}Tip`, leg, [0, -legLen, 0], [0, -1, 0]);

  // ------------------------------------------------------------------ colliders + destruction groups
  // collider proxies measured from each part's own geometry in the part's local frame
  const colliderShape = {
    tripodHead: 'cylinder', tribrach: 'cylinder', alidade: 'cylinder', telescope: 'box',
    standardRight: 'box', standardLeft: 'box', handleGrip: 'capsule', handleUprightRight: 'box', handleUprightLeft: 'box',
  };
  root.updateMatrixWorld(true);
  const colliders = [];
  const tmpBox = new THREE.Box3();
  const inv = new THREE.Matrix4();
  const addCollider = (id, type) => {
    const g = parts[id];
    if (!g) return;
    tmpBox.makeEmpty();
    inv.copy(g.matrixWorld).invert();
    g.traverse((o) => {
      if (!o.isMesh || o.userData.partId !== id) return;
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      tmpBox.union(bb);
    });
    if (tmpBox.isEmpty()) return;
    const size = tmpBox.getSize(new THREE.Vector3());
    const center = tmpBox.getCenter(new THREE.Vector3());
    colliders.push({ part: id, type, offset: center.toArray().map((v) => +v.toFixed(4)), size: size.toArray().map((v) => +v.toFixed(4)), isTrigger: false });
  };
  for (const [id, type] of Object.entries(colliderShape)) addCollider(id, type);
  for (const leg of legs) {
    for (const sub of ['TubeA', 'TubeB', 'LowerTube', 'Spike']) addCollider(`${leg.name}${sub}`, sub === 'Spike' ? 'cone' : 'capsule');
    addCollider(`${leg.name}Clamp`, 'box');
    addCollider(`${leg.name}Shoe`, 'cylinder');
  }
  const descendantsOf = (g) => { const ids = []; g.traverse((o) => { if (o.userData.part) ids.push(o.name); }); return ids; };
  const destructionGroups = {
    instrument: { root: 'alidade', parts: descendantsOf(alidade), seam: 'alidade seat on tribrach (socket:instrumentMount)' },
    telescope: { root: 'telescope', parts: descendantsOf(telescope), seam: 'trunnion axles in both standards' },
    tribrach: { root: 'tribrach', parts: descendantsOf(tribrach).filter((id) => !descendantsOf(alidade).includes(id)), seam: 'tribrach plate on head plate' },
    handle: { root: 'handleGrip', parts: ['handleGrip', 'handleUprightRight', 'handleUprightLeft', 'handleAccentRight', 'handleAccentLeft'], seam: 'handle uprights on standard tops' },
  };
  for (const leg of legs) destructionGroups[leg.name] = { root: leg.name, parts: descendantsOf(leg), seam: `hinge bolt at hingeLugs${leg.name.slice(3)}` };

  // ------------------------------------------------------------------ runtime API
  const meshesByPart = {};
  root.traverse((o) => { if (o.isMesh) (meshesByPart[o.userData.partId] ??= []).push(o); });
  root.userData.parts = parts;
  root.userData.pivots = { alidade, telescope, legs };
  root.userData.sockets = sockets;
  root.userData.stage = stage;
  root.userData.sculptRuntime = {
    spec: 'object-sculpt-spec.json',
    units: 'metres', up: '+Y', forward: '+Z (front leg, telescope at yaw 0)',
    nodes: parts,
    meshes: meshesByPart,
    pivots: {
      alidade: { node: 'alidade', axis: [0, 1, 0], channel: 'rotation.y', rangeDeg: [-180, 180], restDeg: options.alidadeYaw ?? P.alidadeYawDeg },
      telescope: { node: 'telescope', axis: [1, 0, 0], channel: 'rotation.x', rangeDeg: [-30, 30], restDeg: 0, worldY: P.trunnionY },
      legs: legs.map((l) => ({ node: l.name, axis: [1, 0, 0], channel: 'rotation.x', restDeg: -P.splayDeg, foldedDeg: 0 })),
    },
    sockets,
    colliders,
    destructionGroups,
  };
  root.userData.setPose = ({ alidadeYaw, telescopeTilt, legFold } = {}) => {
    if (alidadeYaw !== undefined) alidade.rotation.y = alidadeYaw * DEG;
    if (telescopeTilt !== undefined) telescope.rotation.x = -THREE.MathUtils.clamp(telescopeTilt, -30, 30) * DEG;
    if (legFold !== undefined) {
      const f = THREE.MathUtils.clamp(legFold, 0, 1);
      const splayNow = splay * (1 - f);
      for (const leg of legs) leg.rotation.x = -splayNow;
      // keep the spike tips on the ground: a steeper leg reaches lower, so lift the head by the difference
      head.position.y = P.headY + (legLen * Math.cos(splayNow) - P.hingeY);
    }
  };
  root.userData.explode = (t = 0) => {
    for (const g of Object.values(parts)) {
      const off = g.userData.explodeOffset;
      if (!off) continue;
      g.position.copy(g.userData.basePosition).addScaledVector(off, t);
    }
  };
  /** Part id for a raycast hit (walks up to the nearest named part). */
  root.userData.partOf = (object) => {
    let o = object;
    while (o && !o.userData?.part) o = o.parent;
    return o ? o.name : null;
  };
  root.userData.dispose = () => {
    for (const g of geometries) g.dispose();
    for (const d of disposables) d.dispose?.();
  };
  root.userData.partList = () => Object.keys(parts);
  return root;
}

export default createTotalStationModel;
