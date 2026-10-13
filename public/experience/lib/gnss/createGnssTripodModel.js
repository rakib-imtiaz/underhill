// GNSS receiver on tripod — procedural Three.js model.
// Units: metres. +Y up. Origin: centre of the base footprint on the ground.
// +Z: front leg / dome LED window direction (faces the reference camera).
import * as THREE from 'three';

export const GNSS_DIMENSIONS = Object.freeze({
  totalHeight: 1.160,
  hingeRadius: 0.062,
  hingeY: 0.578,
  footRadius: 0.32,
  legRadius: 0.02,
  headPlateY: 0.588,
  headPlateThickness: 0.024,
  puckHeight: 0.040,
  unitOffsetX: 0.007,
  boxBottom: 0.648,
  box: [0.105, 0.17, 0.10],
  collarTop: 0.873,
  poleRadius: 0.0153,
  poleBottom: 0.85,
  poleTop: 1.06,
  neckBottom: 1.040,
  domeRadius: 0.0963,
});

const D = GNSS_DIMENSIONS;
const LEG_DX = D.footRadius - D.hingeRadius;
const LEG_LEN = Math.hypot(LEG_DX, D.hingeY);
const LEG_TILT = Math.atan2(LEG_DX, D.hingeY);
const FOOT_LEN = 0.186; // foot assembly length along the leg (sleeve top -> spike tip)
const Y_AXIS = new THREE.Vector3(0, 1, 0);
// broad sloped surfaces that are not wear edges (would read as scuffed otherwise)
const NO_WEAR = new Set(['band-shell', 'neck-body']);
const MATERIAL_CACHE = new Map();
const EXPLODE_OFFSETS = { 'receiver-unit': 0.09, 'range-pole': 0.18, 'gnss-antenna': 0.30 };

// azimuth (deg about +Y from +Z); side mirrors the reference (levers / knobs face the camera)
const LEGS = [
  { id: 'leg-front', az: 0, side: -1, knob: false },
  { id: 'leg-right', az: 120, side: -1, knob: true },
  { id: 'leg-left', az: 240, side: 1, knob: true },
];

// ------------------------------------------------------------------ geometry helpers
const UV_UNIT = 0.1; // 1 UV unit = 10 cm on every textured surface (stable texel density)

// Lathe about +Y with arc-length V (uv) and normalised V (uv1, used by end-AO maps).
// Profiles may be authored top-down; they are re-ordered bottom-up so normals face outward.
function lathe(points, segments = 48) {
  const pts = points[0][1] > points[points.length - 1][1] ? [...points].reverse() : points;
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  const arc = [0];
  for (let j = 1; j < pts.length; j++) arc.push(arc[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
  const total = arc[arc.length - 1] || 1;
  const uv = g.attributes.uv, uv1 = new Float32Array(uv.count * 2);
  for (let i = 0; i <= segments; i++) {
    for (let j = 0; j < pts.length; j++) {
      const k = i * pts.length + j;
      uv.setXY(k, i / segments, arc[j] / UV_UNIT);
      uv1[k * 2] = i / segments; uv1[k * 2 + 1] = arc[j] / total;
    }
  }
  g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
  return g;
}
// Cylinder: U around, V in UV_UNIT along the height; uv1 keeps the 0..1 height for AO.
function cylinder(rt, rb, h, seg = 24, open = false, thetaStart = 0, thetaLen = Math.PI * 2) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, thetaStart, thetaLen);
  const uv = g.attributes.uv;
  g.setAttribute('uv1', uv.clone());
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * h / UV_UNIT);
  return g;
}
function cylX(rt, rb, len, seg = 20) {
  return new THREE.CylinderGeometry(rt, rb, len, seg).rotateZ(Math.PI / 2);
}
function cylZ(rt, rb, len, seg = 20) {
  return new THREE.CylinderGeometry(rt, rb, len, seg).rotateX(Math.PI / 2);
}
// Triplanar-style box projection of UVs from position + dominant normal axis.
function boxProjectUV(g) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else if (ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u / UV_UNIT; uv[i * 2 + 1] = v / UV_UNIT;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}
// Smooth rounded box (all edges radius r), centred, box-projected UVs.
function roundedBox(w, h, d, r, seg = 4) {
  const n = seg * 2 + 1;
  const g = new THREE.BoxGeometry(1, 1, 1, n, n, n);
  const pos = g.attributes.position, nor = g.attributes.normal;
  const half = [w / 2, h / 2, d / 2];
  const v = new THREE.Vector3(), inner = new THREE.Vector3(), dir = new THREE.Vector3();
  const remap = (t, hs) => {
    const idx = Math.round((t + 0.5) * n);
    return idx <= seg ? -hs + (r * idx) / seg : hs - r + (r * (idx - seg - 1)) / seg;
  };
  for (let i = 0; i < pos.count; i++) {
    v.set(remap(pos.getX(i), half[0]), remap(pos.getY(i), half[1]), remap(pos.getZ(i), half[2]));
    inner.set(
      THREE.MathUtils.clamp(v.x, -half[0] + r, half[0] - r),
      THREE.MathUtils.clamp(v.y, -half[1] + r, half[1] - r),
      THREE.MathUtils.clamp(v.z, -half[2] + r, half[2] - r));
    dir.subVectors(v, inner);
    if (dir.lengthSq() > 1e-12) {
      dir.normalize();
      v.copy(inner).addScaledVector(dir, r);
      nor.setXYZ(i, dir.x, dir.y, dir.z);
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  return boxProjectUV(g);
}
// rounded-rect frame (ring) lying in XY, extruded along +Z
function frameGeometry(ow, oh, or, iw, ih, ir, depth, bevel = 0.0006) {
  const shape = roundedRectShape(ow, oh, or);
  shape.holes.push(roundedRectShape(iw, ih, ir));
  return boxProjectUV(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 }));
}
// star/lobed knob outline extruded along +Z
function lobedKnob(radius, lobes, amp, length) {
  const s = new THREE.Shape();
  const N = 96;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = radius - amp + amp * Math.cos(a * lobes);
    const p = [Math.cos(a) * r, Math.sin(a) * r];
    if (i === 0) s.moveTo(...p); else s.lineTo(...p);
  }
  return new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: true, bevelThickness: 0.0018, bevelSize: 0.0012, bevelSegments: 3, curveSegments: 4 });
}

// ------------------------------------------------------------------ surface pass: per-vertex edge wear, contact dust
// Lathe/cylinder parts (have uv1): wear on chamfers (normal tilted ~45 deg off the axis).
// Box/extrude parts: wear on bevel/rounding vertices (normal off the dominant axis).
// Wear is broken up by a deterministic position hash so it reads as patchy contact wear, not an outline.
function smoothstep(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function applySurfaceColors(g, cfg) {
  const p = g.attributes.position, n = g.attributes.normal, uv1 = g.attributes.uv1;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
    let f;
    if (uv1) { const a = Math.abs(ny); f = smoothstep(0.5, 0.95, 4 * a * (1 - a)); }
    else { f = smoothstep(0.06, 0.24, 1 - Math.max(Math.abs(nx), Math.abs(ny), Math.abs(nz))); }
    const x = p.getX(i) * 900, y = p.getY(i) * 900, z = p.getZ(i) * 900;
    const patch = 0.5 + 0.5 * Math.sin(x * 0.37 + y * 0.71) * Math.sin(z * 0.53 - y * 0.29 + x * 0.11);
    f *= smoothstep(0.25, 0.75, patch);
    let dust = 0;
    if (cfg.dust && uv1) dust = cfg.dust * smoothstep(cfg.dustTo ?? 0.25, 0, uv1.getY(i));
    for (let c = 0; c < 3; c++) col[i * 3 + c] = (1 + f * cfg.wear[c]) * (1 - dust);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

// ------------------------------------------------------------------ procedural texture fields (seeded, tileable)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// periodic value noise over an N x N grid with fx x fy lattice cells (tileable), values 0..1
function valueNoise(N, fx, fy, seed) {
  const r = rng(seed);
  const lat = new Float32Array(fx * fy);
  for (let i = 0; i < lat.length; i++) lat[i] = r();
  const out = new Float32Array(N * N);
  const x0 = new Int32Array(N), x1 = new Int32Array(N), wx = new Float32Array(N);
  for (let x = 0; x < N; x++) {
    const t = (x / N) * fx, i = Math.floor(t), f = t - i;
    x0[x] = i % fx; x1[x] = (i + 1) % fx; wx[x] = f * f * (3 - 2 * f);
  }
  for (let y = 0; y < N; y++) {
    const t = (y / N) * fy, j = Math.floor(t), f = t - j, wy = f * f * (3 - 2 * f);
    const r0 = (j % fy) * fx, r1 = ((j + 1) % fy) * fx, row = y * N;
    for (let x = 0; x < N; x++) {
      const a = lat[r0 + x0[x]], b = lat[r0 + x1[x]], c = lat[r1 + x0[x]], d = lat[r1 + x1[x]];
      const top = a + (b - a) * wx[x], bot = c + (d - c) * wx[x];
      out[row + x] = top + (bot - top) * wy;
    }
  }
  return out;
}
function fbm(N, fx, fy, octaves, seed, gain = 0.5) {
  const out = new Float32Array(N * N);
  let amp = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    const fxo = Math.min(N, fx << o), fyo = Math.min(N, fy << o);
    const n = valueNoise(N, fxo, fyo, seed + o * 101);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    norm += amp; amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}
function toTexture(N, fill, { srgb = false, repeat = [1, 1] } = {}) {
  const c = document.createElement('canvas');
  c.width = N; c.height = N;
  const g = c.getContext('2d');
  const img = g.createImageData(N, N);
  fill(img.data);
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  return t;
}
function hexRGB(hex) { return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]; }
// albedo: base colour scaled by a per-pixel value multiplier field (plus optional tint field)
function albedoTex(N, baseHex, valueField, opts) {
  const [r, g, b] = hexRGB(baseHex);
  return toTexture(N, (d) => {
    for (let i = 0; i < N * N; i++) {
      const k = valueField[i];
      d[i * 4] = r * k; d[i * 4 + 1] = g * k; d[i * 4 + 2] = b * k; d[i * 4 + 3] = 255;
    }
  }, { srgb: true, ...opts });
}
function scalarTex(N, field, opts) {
  return toTexture(N, (d) => {
    for (let i = 0; i < N * N; i++) {
      const v = Math.max(0, Math.min(255, field[i] * 255));
      d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
    }
  }, opts);
}
// tangent-space normal map from a height field (OpenGL convention, canvas rows run -V)
function normalTex(N, h, strength, opts) {
  return toTexture(N, (d) => {
    for (let y = 0; y < N; y++) {
      const ym = ((y - 1 + N) % N) * N, yp = ((y + 1) % N) * N, row = y * N;
      for (let x = 0; x < N; x++) {
        const xm = (x - 1 + N) % N, xp = (x + 1) % N;
        const du = (h[row + xp] - h[row + xm]) * strength;
        const dv = -(h[yp + x] - h[ym + x]) * strength;
        const inv = 1 / Math.sqrt(du * du + dv * dv + 1);
        const i = (row + x) * 4;
        d[i] = (-du * inv * 0.5 + 0.5) * 255; d[i + 1] = (-dv * inv * 0.5 + 0.5) * 255; d[i + 2] = (inv * 0.5 + 0.5) * 255; d[i + 3] = 255;
      }
    }
  }, opts);
}
// 1-D AO ramp along V (uv1): darkens both ends where parts enter sleeves/collars
function aoRampTex(lowEnd, highEnd, width = 0.08) {
  const N = 64;
  return toTexture(N, (d) => {
    for (let y = 0; y < N; y++) {
      const v = 1 - (y + 0.5) / N;
      const k = Math.min(1, lowEnd + (1 - lowEnd) * Math.min(1, v / width), highEnd + (1 - highEnd) * Math.min(1, (1 - v) / width));
      for (let x = 0; x < N; x++) { const i = (y * N + x) * 4; d[i] = d[i + 1] = d[i + 2] = k * 255; d[i + 3] = 255; }
    }
  });
}

// ------------------------------------------------------------------ materials (material pass)
// Every channel comes from its own seeded field; albedo is never reused as roughness/normal/AO.
function createMaterials(N = 1024) {
  const T = {};
  // ---- carbon fibre: 2x2 twill, 32 tows per tile (tile = tube circumference, ~4 mm tows)
  {
    const tows = 32, cell = N / tows;
    const height = new Float32Array(N * N), parity = new Float32Array(N * N);
    const stria = valueNoise(N, N / 2, 16, 11);   // fibre striations (along V)
    const striaW = valueNoise(N, 16, N / 2, 12);  // fibre striations (along U)
    for (let y = 0; y < N; y++) {
      const j = Math.floor(y / cell), fy = (y % cell) / cell;
      for (let x = 0; x < N; x++) {
        const i = Math.floor(x / cell), fx = (x % cell) / cell, k = y * N + x;
        const warp = ((i + j) & 3) < 2;
        const across = warp ? fx : fy;
        const crown = Math.sin(Math.PI * across);
        height[k] = 0.35 + 0.65 * Math.pow(crown, 0.6) + 0.06 * ((warp ? stria[k] : striaW[k]) - 0.5);
        parity[k] = warp ? 1 : 0;
      }
    }
    const macro = fbm(N, 2, 2, 3, 13);
    const alb = new Float32Array(N * N), rough = new Float32Array(N * N);
    const rn = fbm(N, 8, 8, 4, 14);
    for (let k = 0; k < N * N; k++) {
      alb[k] = (parity[k] ? 1.22 : 0.78) * (0.8 + 0.35 * height[k]) * (0.94 + 0.12 * macro[k]);
      rough[k] = 0.30 + 0.16 * (1 - height[k]) + 0.08 * (rn[k] - 0.5);
    }
    const rep = [1, 0.8];
    T.carbon = new THREE.MeshPhysicalMaterial({
      name: 'carbon-fibre', color: 0xffffff,
      map: albedoTex(N, 0x1e1f22, alb, { repeat: rep }),
      roughnessMap: scalarTex(N, rough, { repeat: rep }), roughness: 1,
      normalMap: normalTex(N, height, 2.2, { repeat: rep }), normalScale: new THREE.Vector2(0.55, 0.55),
      metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.07,
      aoMap: aoRampTex(0.45, 0.45, 0.04),
    });
    T.carbon.aoMap.channel = 1;
  }
  // ---- orange anodized aluminium: brushed streaks + macro hue drift + edge-lighter wear via cavity-free mottling
  {
    const macro = fbm(N, 3, 3, 3, 21);
    const streak = fbm(N, 2, 256, 3, 22);          // brushed along U
    const pits = valueNoise(N, 384, 384, 23);
    const rStreak = fbm(N, 2, 192, 3, 24), rMacro = fbm(N, 4, 4, 3, 25);
    const alb = new Float32Array(N * N), rough = new Float32Array(N * N), h = new Float32Array(N * N);
    for (let k = 0; k < N * N; k++) {
      alb[k] = 0.9 + 0.12 * macro[k] + 0.05 * (streak[k] - 0.5);
      rough[k] = 0.36 + 0.09 * (rStreak[k] - 0.5) + 0.08 * (rMacro[k] - 0.5);
      h[k] = 0.6 * streak[k] + 0.4 * pits[k];
    }
    const rep = [1, 1];
    T.orange = new THREE.MeshStandardMaterial({
      name: 'orange-anodized', color: 0xffffff,
      map: albedoTex(N, 0xd0701c, alb, { repeat: rep }),
      roughnessMap: scalarTex(N, rough, { repeat: rep }), roughness: 1,
      normalMap: normalTex(N, h, 1.2, { repeat: rep }), normalScale: new THREE.Vector2(0.25, 0.25),
      metalness: 0.75,
    });
  }
  // ---- black rugged polymer: mottled wear patches + bead-blast stipple
  {
    const macro = fbm(N, 8, 8, 4, 31);
    const scuffN = fbm(N, 14, 14, 4, 32);
    const stipple = valueNoise(N, 320, 320, 33);
    const stipple2 = valueNoise(N, 160, 160, 34);
    const rn = fbm(N, 16, 16, 3, 35);
    const alb = new Float32Array(N * N), rough = new Float32Array(N * N), h = new Float32Array(N * N);
    for (let k = 0; k < N * N; k++) {
      const scuff = Math.max(0, Math.min(1, (scuffN[k] - 0.56) * 6));
      alb[k] = 0.9 + 0.16 * macro[k] + 0.18 * scuff + 0.1 * (stipple[k] - 0.5);
      rough[k] = 0.64 - 0.12 * scuff + 0.06 * (rn[k] - 0.5) + 0.05 * (stipple2[k] - 0.5);
      h[k] = 0.7 * stipple[k] + 0.3 * stipple2[k];
    }
    const rep = [1, 1];
    T.black = new THREE.MeshStandardMaterial({
      name: 'black-polymer', color: 0xffffff,
      map: albedoTex(N, 0x2a2c30, alb, { repeat: rep }),
      roughnessMap: scalarTex(N, rough, { repeat: rep }), roughness: 1,
      normalMap: normalTex(N, h, 1.6, { repeat: rep }), normalScale: new THREE.Vector2(0.35, 0.35),
      metalness: 0.0,
    });
    T.blackGloss = T.black.clone();
    T.blackGloss.name = 'black-polymer-gloss';
    T.blackGloss.color = new THREE.Color(0xc8c8c8);
    T.blackGloss.roughness = 0.6;
  }
  // ---- glossy white radome
  {
    const tint = fbm(N, 2, 2, 3, 41);
    const peel = fbm(N, 48, 48, 2, 42);
    const rn = fbm(N, 6, 6, 3, 43);
    const alb = new Float32Array(N * N), rough = new Float32Array(N * N);
    for (let k = 0; k < N * N; k++) {
      alb[k] = 0.975 + 0.04 * (tint[k] - 0.5);
      rough[k] = 0.26 + 0.06 * (rn[k] - 0.5) + 0.03 * (peel[k] - 0.5);
    }
    T.white = new THREE.MeshPhysicalMaterial({
      name: 'dome-white', color: 0xffffff,
      map: albedoTex(N, 0xe2e2e5, alb), roughnessMap: scalarTex(N, rough), roughness: 1,
      normalMap: normalTex(N, peel, 0.9), normalScale: new THREE.Vector2(0.12, 0.12),
      clearcoat: 0.6, clearcoatRoughness: 0.12,
    });
  }
  // ---- gunmetal pole: vertical brushing, darker toward the antenna (AO ramp on uv1)
  {
    const streak = fbm(N, 256, 2, 3, 51);
    const rStreak = fbm(N, 192, 3, 3, 52);
    const fine = valueNoise(N, 512, 4, 53);
    const alb = new Float32Array(N * N), rough = new Float32Array(N * N);
    for (let k = 0; k < N * N; k++) {
      alb[k] = 0.92 + 0.14 * (streak[k] - 0.5);
      rough[k] = 0.27 + 0.1 * (rStreak[k] - 0.5);
    }
    T.pole = new THREE.MeshStandardMaterial({
      name: 'gunmetal-pole', color: 0xffffff,
      map: albedoTex(N, 0x8c8e92, alb, { repeat: [1, 1] }),
      roughnessMap: scalarTex(N, rough), roughness: 1,
      normalMap: normalTex(N, fine, 0.6), normalScale: new THREE.Vector2(0.2, 0.2),
      metalness: 0.65, aoMap: aoRampTex(0.7, 0.55, 0.18),
    });
    T.pole.aoMap.channel = 1;
  }
  // ---- hardened steel ferrule/spike: turning rings, scuffed tip (canvas bottom rows = tip)
  {
    const rings = fbm(N, 2, 320, 3, 61);
    const rRings = fbm(N, 2, 256, 3, 62);
    const scratches = valueNoise(N, 256, 24, 63);
    const alb = new Float32Array(N * N), rough = new Float32Array(N * N), h = new Float32Array(N * N);
    for (let y = 0; y < N; y++) {
      const v = 1 - y / N; // 0 at tip
      const tip = Math.max(0, 1 - v / 0.18);
      for (let x = 0; x < N; x++) {
        const k = y * N + x;
        alb[k] = 0.95 + 0.1 * (rings[k] - 0.5) + 0.22 * tip * scratches[k];
        rough[k] = 0.3 + 0.08 * (rRings[k] - 0.5) + 0.22 * tip;
        h[k] = 0.7 * rings[k] + 0.3 * tip * scratches[k];
      }
    }
    T.steel = new THREE.MeshStandardMaterial({
      name: 'spike-steel', color: 0xffffff,
      map: albedoTex(N, 0x70747a, alb), roughnessMap: scalarTex(N, rough), roughness: 1,
      normalMap: normalTex(N, h, 1.2), normalScale: new THREE.Vector2(0.3, 0.3),
      metalness: 0.9,
    });
  }
  // lathe/cylinder variants carrying an end-AO ramp on uv1 (contact darkening at sleeve joints)
  T.orangeAO = T.orange.clone(); T.orangeAO.aoMap = aoRampTex(0.55, 0.55, 0.1); T.orangeAO.aoMap.channel = 1;
  T.blackAO = T.black.clone(); T.blackAO.aoMap = aoRampTex(0.6, 0.6, 0.12); T.blackAO.aoMap.channel = 1;
  // surface-pass wear configs (per-channel multipliers on albedo at worn edges)
  const wear = {
    orange: { wear: [0.18, 0.55, 2.2] },          // anodizing rubbed through toward bare aluminium
    black: { wear: [0.7, 0.7, 0.75] },            // scuffed polymer edges turn grey
    white: { wear: [0, 0, 0], dust: 0.07, dustTo: 0.22 }, // faint grey dust at the radome rim
  };
  for (const [k, m] of [['orange', T.orange], ['orange', T.orangeAO], ['black', T.black], ['black', T.blackAO], ['black', T.blackGloss], ['white', T.white]]) {
    m.vertexColors = true;
    m.userData.surface = wear[k];
  }

  // ---- utility materials
  const ledWindowAlpha = canvasTexture([256, 64], (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, (h - 12) / 2); g.fill();
  });
  const ledWindowEmissive = canvasTexture([256, 64], (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) {
      const x = w / 2 + (i - 1.5) * 34, y = h / 2;
      const grd = g.createRadialGradient(x, y, 0, x, y, 9);
      grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.35, '#ffffff'); grd.addColorStop(1, '#000000');
      g.fillStyle = grd; g.fillRect(x - 10, y - 10, 20, 20);
    }
  });
  T.cavity = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.9, name: 'cavity' });
  T.silver = new THREE.MeshStandardMaterial({ color: 0xb8bbc0, roughness: 0.25, metalness: 1.0, name: 'hardware-silver' });
  T.led = new THREE.MeshStandardMaterial({ color: 0x3fe0f0, emissive: 0x3fe0f0, emissiveIntensity: 2.2, roughness: 0.3, name: 'led-cyan' });
  T.window = new THREE.MeshPhysicalMaterial({
    color: 0x0d0f12, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, name: 'led-window',
    alphaMap: ledWindowAlpha, alphaTest: 0.5, emissive: 0x3fe0f0, emissiveMap: ledWindowEmissive, emissiveIntensity: 2.2,
    side: THREE.DoubleSide,
  });
  return T;
}
function canvasTexture(size, draw, colorSpace = THREE.NoColorSpace) {
  const c = document.createElement('canvas');
  c.width = size[0]; c.height = size[1];
  draw(c.getContext('2d'), c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = colorSpace;
  t.anisotropy = 8;
  return t;
}

// ------------------------------------------------------------------ factory
export function createGnssTripodModel(options = {}) {
  const runtime = { nodes: {}, meshes: {}, sockets: {}, colliders: {}, destructionGroups: {} };
  const castShadow = options.castShadow ?? true;
  // optimization: procedural maps cost ~1 s at 1024px, so materials are cached per texture size
  // and shared between instances (pass shareMaterials:false for per-instance material state).
  const N = options.textureSize ?? 1024;
  let mats = options.shareMaterials === false ? null : MATERIAL_CACHE.get(N);
  if (!mats) {
    mats = createMaterials(N);
    if (options.shareMaterials !== false) MATERIAL_CACHE.set(N, mats);
  }
  const aoVariant = new Map([[mats.orange, mats.orangeAO], [mats.black, mats.blackAO]]);

  function node(id, parent, pos = [0, 0, 0]) {
    const g = new THREE.Group();
    g.name = id;
    g.position.set(...pos);
    if (parent) parent.add(g);
    runtime.nodes[id] = g;
    return g;
  }
  function mesh(id, geometry, material, parent, pos = [0, 0, 0], rot = null) {
    // geometries without explicit texel-density UVs get box-projected UVs (metres / UV_UNIT)
    if (!geometry.attributes.uv1 && material.normalMap) boxProjectUV(geometry);
    if (geometry.attributes.uv1 && aoVariant.has(material)) material = aoVariant.get(material);
    if (material.aoMap && material.aoMap.channel === 1 && !geometry.attributes.uv1) geometry.setAttribute('uv1', geometry.attributes.uv.clone());
    if (material.vertexColors && !geometry.attributes.color) {
      if (NO_WEAR.has(id)) geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 3).fill(1), 3));
      else applySurfaceColors(geometry, material.userData.surface);
    }
    const m = new THREE.Mesh(geometry, material);
    m.name = id;
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    m.castShadow = castShadow;
    m.receiveShadow = true;
    parent.add(m);
    runtime.meshes[id] = m;
    return m;
  }
  function socket(id, parent, pos) {
    const s = new THREE.Object3D();
    s.name = `socket:${id}`;
    s.position.set(...pos);
    parent.add(s);
    runtime.sockets[id] = s;
    return s;
  }
  function collider(id, type, nodeId, offset, size) {
    runtime.colliders[id] = { type, node: nodeId, offset, size, isTrigger: false };
  }
  function group(name, ids) {
    runtime.destructionGroups[name] = ids.map((i) => runtime.nodes[i]).filter(Boolean);
  }

  const root = node('root', null);
  root.name = 'gnss-tripod';
  socket('ground-contact', root, [0, 0, 0]);

  // ================================================================ TRIPOD HEAD
  const tripod = node('tripod', root);
  const head = node('tripod-head', tripod, [0, D.headPlateY, 0]);

  const plateShape = new THREE.Shape();
  {
    const lugR = 0.079, cornerR = 0.024;
    const pts = [0, 1, 2].map((i) => {
      const az = (i * 2 * Math.PI) / 3;
      return new THREE.Vector2(Math.sin(az) * (lugR - cornerR), -Math.cos(az) * (lugR - cornerR));
    });
    for (let i = 0; i < 3; i++) {
      const p = pts[i], prev = pts[(i + 2) % 3], next = pts[(i + 1) % 3];
      const dIn = p.clone().sub(prev).normalize(), dOut = next.clone().sub(p).normalize();
      const nIn = new THREE.Vector2(dIn.y, -dIn.x), nOut = new THREE.Vector2(dOut.y, -dOut.x);
      const a0 = Math.atan2(nIn.y, nIn.x), a1 = Math.atan2(nOut.y, nOut.x);
      const start = p.clone().addScaledVector(nIn, cornerR);
      if (i === 0) plateShape.moveTo(start.x, start.y); else plateShape.lineTo(start.x, start.y);
      plateShape.absarc(p.x, p.y, cornerR, a0, a1, a1 < a0);
    }
    plateShape.closePath();
  }
  const pb = 0.0025;
  const plateGeo = new THREE.ExtrudeGeometry(plateShape, { depth: D.headPlateThickness - 2 * pb, bevelEnabled: true, bevelThickness: pb, bevelSize: pb, bevelSegments: 3, curveSegments: 12 });
  plateGeo.translate(0, 0, pb);
  plateGeo.rotateX(-Math.PI / 2);
  mesh('head-plate', plateGeo, mats.orange, head);
  socket('mount-top', head, [0, D.headPlateThickness, 0]);
  // underside hub (centring boss)
  mesh('head-hub', lathe([[0, -0.012], [0.016, -0.012], [0.019, -0.008], [0.022, 0.002], [0, 0.002]], 32), mats.orange, head);

  // puck mount: flange, waist, groove, wide top lip
  const puck = node('mount-puck', head, [0, D.headPlateThickness - 0.002, 0]);
  mesh('puck-body', lathe([
    [0, 0], [0.0535, 0], [0.0545, 0.002], [0.0545, 0.0065], [0.0505, 0.009], [0.0478, 0.0105], [0.0478, 0.0235],
    [0.0462, 0.025], [0.0462, 0.0275], [0.0505, 0.029], [0.0515, 0.0305], [0.0515, 0.0385], [0.0495, 0.040], [0, 0.040],
  ], 64), mats.black, puck);
  mesh('puck-hole-rim', new THREE.TorusGeometry(0.0034, 0.0009, 8, 20), mats.blackGloss, puck, [0, 0.017, 0.0478]);
  mesh('puck-hole', cylZ(0.0028, 0.0028, 0.002, 16), mats.cavity, puck, [0, 0.017, 0.0472]);
  socket('receiver-seat', puck, [0, D.puckHeight, 0]);

  // ================================================================ LEGS
  for (const leg of LEGS) {
    const a = THREE.MathUtils.degToRad(leg.az);
    const radial = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const tangent = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
    const hingeLocal = [D.hingeRadius * radial.x, D.hingeY - D.headPlateY, D.hingeRadius * radial.z];
    socket(`hinge-${leg.az}`, head, hingeLocal);

    // clevis cheeks + hinge hardware (fixed to the head)
    const clevis = node(`clevis-${leg.az}`, head, hingeLocal);
    clevis.rotation.y = a;
    for (const s of [-1, 1]) {
      const cheek = mesh(`clevis-${leg.az}-cheek${s > 0 ? 'R' : 'L'}`, roundedBox(0.0075, 0.032, 0.032, 0.0025, 2), mats.orange, clevis, [s * 0.018, 0.005, -0.003]);
      cheek.rotation.x = 0.0;
    }
    mesh(`hinge-bolt-${leg.az}`, cylX(0.004, 0.004, 0.052, 12), mats.silver, clevis);
    const knobEnd = leg.side;
    mesh(`hinge-head-${leg.az}`, cylX(0.0068, 0.0068, 0.0042, 6), mats.silver, clevis, [-knobEnd * 0.0238, 0, 0]);
    if (leg.knob) {
      mesh(`hinge-washer-${leg.az}`, cylX(0.0075, 0.0075, 0.0018, 20), mats.silver, clevis, [knobEnd * 0.0226, 0, 0]);
      const kg = lobedKnob(0.0112, 5, 0.0013, 0.009);
      kg.rotateY(knobEnd > 0 ? Math.PI / 2 : -Math.PI / 2);
      const knob = mesh(`wing-knob-${leg.az}`, kg, mats.blackGloss, clevis, [knobEnd * 0.0245, 0, 0]);
      knob.rotation.x = 0.3 * leg.side;
      mesh(`wing-knob-cap-${leg.az}`, cylX(0.0072, 0.0072, 0.0016, 20), mats.black, clevis, [knobEnd * 0.0365, 0, 0]);
    } else {
      mesh(`hinge-nut-${leg.az}`, cylX(0.0068, 0.0068, 0.0042, 6), mats.silver, clevis, [knobEnd * 0.0238, 0, 0]);
    }

    const pivot = node(leg.id, head, hingeLocal);
    pivot.rotation.order = 'YXZ';
    pivot.rotation.set(-LEG_TILT, a, 0);
    pivot.userData.length = LEG_LEN;
    pivot.userData.restTilt = -LEG_TILT;
    pivot.userData.hingeAxisWorld = tangent.toArray();
    pivot.userData.side = leg.side;

    // knuckle + split-clamp leg cap
    mesh(`${leg.id}-knuckle`, cylX(0.0125, 0.0125, 0.0285, 28), mats.orange, pivot);
    mesh(`${leg.id}-cap-neck`, roundedBox(0.0285, 0.026, 0.026, 0.004, 2), mats.orange, pivot, [0, -0.012, 0]);
    mesh(`${leg.id}-cap`, lathe([[0.0200, -0.010], [0.0238, -0.0125], [0.0252, -0.017], [0.0252, -0.066], [0.0238, -0.0705], [0.0205, -0.0715]], 40), mats.orange, pivot);
    mesh(`${leg.id}-cap-slit`, new THREE.BoxGeometry(0.0016, 0.044, 0.004), mats.cavity, pivot, [0, -0.044, 0.0243]);
    mesh(`${leg.id}-cap-screw`, cylZ(0.0055, 0.0055, 0.0035, 24), mats.silver, pivot, [0, -0.044, 0.0262]);
    mesh(`${leg.id}-cap-screw-hex`, cylZ(0.0026, 0.0026, 0.001, 6), mats.cavity, pivot, [0, -0.044, 0.0281]);

    // carbon tube (open ended, ends hidden in sleeves)
    const sleeveTop = LEG_LEN - FOOT_LEN;
    const tubeTop = 0.062, tubeBot = sleeveTop + 0.012;
    mesh(`${leg.id}-tube`, cylinder(D.legRadius, D.legRadius, tubeBot - tubeTop, 48, true), mats.carbon, pivot, [0, -(tubeTop + tubeBot) / 2, 0]);
    socket(`foot-${leg.id.slice(4)}`, pivot, [0, -sleeveTop, 0]);

    // foot assembly (foot-local: y=0 at sleeve top, -FOOT_LEN at spike tip)
    const foot = node(`${leg.id}-foot`, pivot, [0, -sleeveTop, 0]);
    mesh(`${leg.id}-sleeve`, lathe([[0.0198, 0.002], [0.0218, 0.0005], [0.0226, -0.002], [0.0226, -0.116], [0.0215, -0.1195], [0.0140, -0.1205]], 40), mats.orange, foot);
    mesh(`${leg.id}-strap`, lathe([[0.0224, -0.034], [0.0243, -0.0355], [0.0246, -0.038], [0.0246, -0.079], [0.0243, -0.0815], [0.0224, -0.083]], 40), mats.black, foot);
    const leverDir = new THREE.Vector3(leg.side, 0, 0.3).normalize();
    const lever = node(`${leg.id}-lever`, foot, [leverDir.x * 0.0245, -0.0585, leverDir.z * 0.0245]);
    lever.rotation.y = Math.atan2(leverDir.x, leverDir.z);
    mesh(`${leg.id}-lever-body`, roundedBox(0.019, 0.036, 0.013, 0.003, 2), mats.black, lever, [0, 0, 0.0055]);
    mesh(`${leg.id}-lever-grip`, roundedBox(0.015, 0.012, 0.006, 0.002, 2), mats.blackGloss, lever, [0, 0.009, 0.013]);
    mesh(`${leg.id}-lever-pin`, cylX(0.0018, 0.0018, 0.022, 10), mats.silver, lever, [0, -0.012, 0.007]);
    mesh(`${leg.id}-spike`, lathe([[0.0, -0.1185], [0.0136, -0.1185], [0.0136, -0.127], [0.0127, -0.129], [0.0127, -0.1345], [0.0112, -0.1362], [0.0090, -0.150], [0.0045, -0.172], [0.0010, -0.1852], [0.0, -FOOT_LEN]], 32), mats.steel, foot);
    socket(`tip-${leg.id.slice(4)}`, foot, [0, -FOOT_LEN, 0]);

    // foot-step peg on the side opposite the lever
    const stepDir = new THREE.Vector3(-leg.side, 0, 0.15).normalize();
    const step = node(`${leg.id}-step`, pivot, [0, -(LEG_LEN - 0.205), 0]);
    step.rotation.y = Math.atan2(stepDir.x, stepDir.z);
    mesh(`${leg.id}-step-ring`, lathe([[0.0198, 0.0085], [0.0228, 0.007], [0.0234, 0.004], [0.0234, -0.004], [0.0228, -0.007], [0.0198, -0.0085]], 32), mats.orange, step);
    mesh(`${leg.id}-step-arm`, roundedBox(0.011, 0.015, 0.022, 0.003, 2), mats.orange, step, [0, 0, 0.031]);
    mesh(`${leg.id}-step-pad`, roundedBox(0.017, 0.024, 0.015, 0.003, 2), mats.black, step, [0, -0.004, 0.046]);

    collider(leg.id, 'capsule', leg.id, [0, -LEG_LEN / 2, 0], [0.045, LEG_LEN, 0.045]);
  }

  // ================================================================ RECEIVER UNIT
  const unit = node('receiver-unit', root, [D.unitOffsetX, D.boxBottom, 0]);
  const boxNode = node('receiver-box', unit);
  boxNode.rotation.y = Math.PI / 4;
  const [bw, bh, bd] = D.box;
  mesh('receiver-shell', roundedBox(bw, bh, bd, 0.0075, 4), mats.black, boxNode, [0, bh / 2, 0]);

  // +Z (front-right) face: raised bordered panel, screws, LED ring, logo emboss
  const front = node('receiver-front-panel', boxNode, [0, bh / 2, bd / 2]);
  mesh('panel-frame', frameGeometry(0.090, 0.152, 0.008, 0.078, 0.140, 0.005, 0.0016), mats.black, front);
  mesh('panel-inset', roundedBox(0.078, 0.140, 0.0016, 0.004, 2), mats.black, front, [0, 0, 0.0003]);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    mesh(`panel-screw-${sx}${sy}`, cylZ(0.0026, 0.0026, 0.0018, 14), mats.steel, front, [sx * 0.0395, sy * 0.0705, 0.0022]);
  }
  mesh('receiver-led-ring', new THREE.TorusGeometry(0.0066, 0.0016, 10, 40), mats.led, front, [0.003, 0.051, 0.0022]);
  mesh('receiver-led-text', new THREE.BoxGeometry(0.008, 0.0016, 0.0006), mats.led, front, [0.003, 0.038, 0.0022]);
  mesh('receiver-led-text2', new THREE.BoxGeometry(0.004, 0.0016, 0.0006), mats.led, front, [0.002, 0.034, 0.0022]);
  // embossed logo glyph blocks (approximation of the unreadable mark)
  const logo = node('panel-logo', front, [0.004, -0.045, 0.0018]);
  for (const [x, y, w, h] of [[-0.016, 0, 0.004, 0.018], [-0.011, 0.007, 0.010, 0.004], [-0.011, -0.007, 0.010, 0.004], [0.004, 0, 0.004, 0.018], [0.011, 0.007, 0.010, 0.004], [0.016, -0.004, 0.004, 0.010]]) {
    mesh(`logo-${x}-${y}`, roundedBox(w, h, 0.0012, 0.0006, 1), mats.black, logo, [x, y, 0]);
  }
  socket('led-ring-fx', front, [0.003, 0.051, 0.006]);

  // -X (front-left) face: border frame, latch block near the rear edge, faint logo
  const left = node('receiver-left-panel', boxNode, [-bw / 2, bh / 2, 0]);
  left.rotation.y = -Math.PI / 2;
  mesh('left-frame', frameGeometry(0.086, 0.152, 0.008, 0.076, 0.142, 0.005, 0.0012), mats.black, left);
  const latch = node('receiver-latch', left, [-0.031, 0.03, 0.0]);
  mesh('latch-body', roundedBox(0.013, 0.040, 0.011, 0.003, 2), mats.black, latch, [0, 0, 0.0055]);
  mesh('latch-tab', roundedBox(0.010, 0.010, 0.006, 0.002, 2), mats.blackGloss, latch, [0, -0.012, 0.012]);
  mesh('left-logo', roundedBox(0.022, 0.016, 0.0012, 0.003, 1), mats.black, left, [-0.016, -0.052, 0.0012]);

  // +X (rear-right) face: two rubber port plugs; -Z (rear-left): label recess
  const right = node('receiver-right-panel', boxNode, [bw / 2, bh / 2, 0]);
  right.rotation.y = Math.PI / 2;
  for (const y of [0.012, -0.018]) mesh(`port-plug-${y}`, roundedBox(0.016, 0.022, 0.003, 0.004, 2), mats.blackGloss, right, [-0.03, y, 0.0012]);
  const back = node('receiver-back-panel', boxNode, [0, bh / 2, -bd / 2]);
  back.rotation.y = Math.PI;
  mesh('back-label', roundedBox(0.06, 0.08, 0.0008, 0.004, 1), mats.blackGloss, back, [0, 0.0, 0.0002]);

  // pole collar on the pole axis (unit is offset +X), chamfered with clamp slot + set screw
  const collar = node('pole-collar', unit, [-D.unitOffsetX, bh - 0.003, 0]);
  mesh('collar-body', lathe([[0.0153, 0.061], [0.0215, 0.0605], [0.0235, 0.058], [0.0235, 0.004], [0.026, 0.0025], [0.026, 0.0], [0.0153, 0.0]], 40), mats.black, collar);
  mesh('collar-slot', new THREE.BoxGeometry(0.0035, 0.022, 0.004), mats.cavity, collar, [0.0098, 0.042, 0.0215], [0, 0.42, 0]);
  mesh('collar-screw', cylZ(0.0032, 0.0032, 0.004, 14), mats.blackGloss, collar, [0.0, 0.02, 0.0245]);
  socket('pole-socket', unit, [-D.unitOffsetX, D.collarTop - D.boxBottom, 0]);

  // whip antenna on the right corner of the box top
  const whipLocal = new THREE.Vector3(0.037, 0, 0.035).applyAxisAngle(Y_AXIS, Math.PI / 4);
  const whip = node('whip-antenna', unit, [whipLocal.x, bh - 0.002, whipLocal.z]);
  socket('whip-base', unit, [whipLocal.x, bh, whipLocal.z]);
  mesh('whip-nut', new THREE.CylinderGeometry(0.0086, 0.0086, 0.008, 6), mats.black, whip, [0, 0.004, 0]);
  mesh('whip-body', lathe([[0, 0.006], [0.0068, 0.006], [0.0068, 0.016], [0.0060, 0.019], [0.0054, 0.030], [0.0046, 0.040], [0.0036, 0.100], [0.0030, 0.1055], [0.0018, 0.1085], [0, 0.1095]], 20), mats.black, whip);

  // ================================================================ POLE
  const pole = node('range-pole', root, [0, D.poleBottom, 0]);
  mesh('pole-tube', cylinder(D.poleRadius, D.poleRadius, D.poleTop - D.poleBottom, 48), mats.pole, pole, [0, (D.poleTop - D.poleBottom) / 2, 0]);
  socket('antenna-mount', pole, [0, D.neckBottom - D.poleBottom, 0]);

  // ================================================================ GNSS ANTENNA
  const ant = node('gnss-antenna', root, [0, D.neckBottom, 0]);
  const neck = node('antenna-neck', ant);
  mesh('neck-body', lathe([[0.0156, 0], [0.0195, 0.0015], [0.0222, 0.006], [0.0228, 0.010], [0.0222, 0.0115], [0.0222, 0.0135], [0.0233, 0.0150], [0.0236, 0.030], [0.0250, 0.040], [0.0252, 0.047], [0.016, 0.048]], 48), mats.black, neck);
  const nl = mesh('neck-latch', roundedBox(0.005, 0.014, 0.008, 0.0015, 2), mats.blackGloss, neck, [0.0245, 0.024, 0]);
  nl.rotation.y = 0;
  const band = node('dome-band', ant);
  mesh('band-shell', lathe([[0.018, 0.045], [0.05, 0.0465], [0.075, 0.049], [0.088, 0.053], [0.0945, 0.058], [0.0963, 0.063], [0.0963, 0.0712], [0.0952, 0.0720]], 96), mats.black, band);
  mesh('seam-ring', lathe([[0.0952, 0.0719], [0.0947, 0.0722], [0.0947, 0.0727], [0.0953, 0.0730]], 96), mats.cavity, band);
  const winW = 0.052, winTheta = winW / 0.0966;
  mesh('led-window', new THREE.CylinderGeometry(0.09675, 0.09675, 0.0105, 32, 1, true, -winTheta / 2, winTheta), mats.window, band, [0, 0.0648, 0]);
  socket('led-fx', band, [0, 0.0648, 0.098]);
  const cap = node('dome-cap', ant);
  mesh('cap-shell', lathe([[0.0953, 0.0729], [0.0962, 0.0750], [0.0962, 0.0830], [0.0950, 0.0910], [0.0915, 0.0985], [0.0850, 0.1052], [0.0750, 0.1110], [0.0600, 0.1155], [0.0400, 0.1185], [0.0200, 0.1197], [0.0, 0.1200]], 96), mats.white, cap);
  socket('apc', ant, [0, 0.07, 0]);

  // ================================================================ runtime metadata
  collider('root', 'compound', 'root', [0, 0.58, 0], [0.58, D.totalHeight, 0.48]);
  collider('tripod-head', 'cylinder', 'tripod-head', [0, 0.012, 0], [0.16, 0.05, 0.16]);
  collider('receiver-unit', 'box', 'receiver-box', [0, D.box[1] / 2, 0], D.box);
  collider('range-pole', 'cylinder', 'range-pole', [0, 0.105, 0], [0.031, 0.21, 0.031]);
  collider('gnss-antenna', 'cylinder', 'gnss-antenna', [0, 0.06, 0], [0.193, 0.12, 0.193]);
  group('antenna', ['gnss-antenna']);
  group('pole', ['range-pole']);
  group('receiver', ['receiver-unit']);
  for (const leg of LEGS) group(leg.id, [leg.id]);
  group('leg-foot', LEGS.map((l) => `${l.id}-foot`));

  // rest transforms for poseGnssTripod()
  for (const id of ['tripod', 'receiver-unit', 'range-pole', 'gnss-antenna']) runtime.nodes[id].userData.restY = runtime.nodes[id].position.y;
  runtime.actions = {
    legs: LEGS.map((l) => l.id),
    hinge: { axis: 'leg-local +X (tangent)', restTiltDeg: -THREE.MathUtils.radToDeg(LEG_TILT), foldLimitDeg: 2 },
    explode: { ...EXPLODE_OFFSETS },
    whip: { node: 'whip-antenna', axis: 'local X', rangeDeg: [-90, 90] },
    ledMaterials: ['led-cyan', 'led-window'],
  };
  root.userData.sculptRuntime = runtime;
  root.userData.dimensions = { ...D, legLength: LEG_LEN, legTiltDeg: THREE.MathUtils.radToDeg(LEG_TILT) };
  return root;
}

// ------------------------------------------------------------------ runtime actions
// Drive the action-ready rig without touching geometry. Safe to call every frame (scroll scrubbing).
//   fold:    0 = deployed (24 deg splay), 1 = legs folded parallel under the head
//   explode: 0 = assembled, 1 = antenna / pole / receiver lifted apart along +Y
//   legOffsetsDeg: extra hinge rotation per leg id (positive swings the foot outward)
//   whipDeg: whip antenna swivel about its base
//   keepGrounded: lift the assembly so the lowest spike tip stays on y = 0 while folding
export function poseGnssTripod(root, { fold = 0, explode = 0, legOffsetsDeg = {}, whipDeg = 0, keepGrounded = true } = {}) {
  const rt = root.userData.sculptRuntime;
  let lowest = Infinity;
  for (const leg of LEGS) {
    const n = rt.nodes[leg.id];
    const rest = n.userData.restTilt;
    n.rotation.x = rest + (-rest + THREE.MathUtils.degToRad(2)) * fold - THREE.MathUtils.degToRad(legOffsetsDeg[leg.id] || 0);
    lowest = Math.min(lowest, D.hingeY - n.userData.length * Math.cos(n.rotation.x));
  }
  const lift = keepGrounded ? Math.max(0, -lowest) : 0;
  rt.nodes.tripod.position.y = rt.nodes.tripod.userData.restY + lift;
  for (const id of ['receiver-unit', 'range-pole', 'gnss-antenna']) {
    const n = rt.nodes[id];
    n.position.y = n.userData.restY + lift + (EXPLODE_OFFSETS[id] || 0) * explode;
  }
  rt.nodes['whip-antenna'].rotation.x = THREE.MathUtils.degToRad(whipDeg);
  return root;
}

// Free GPU resources. Materials/textures are only disposed when not shared through the cache.
export function disposeGnssTripod(root, { disposeMaterials = false } = {}) {
  const mats = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    mats.add(o.material);
  });
  if (disposeMaterials) {
    for (const m of mats) {
      for (const k of ['map', 'roughnessMap', 'normalMap', 'aoMap', 'alphaMap', 'emissiveMap']) m[k]?.dispose();
      m.dispose();
    }
    MATERIAL_CACHE.clear();
  }
}

export default createGnssTripodModel;
