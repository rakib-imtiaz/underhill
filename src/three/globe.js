/* ==========================================================================
   three/globe.js â€” procedural Earth for the PULL BACK / REACH / FOCUS
   chapters of the home scene.

   Zero asset files: the coastline comes from landmask.js, a run-length
   encoded raster of the real Natural Earth 110m land polygons baked at build
   time by tools/build-landmask.mjs. Sampling it gives recognisable
   continents; the earlier hand-authored rings did not read as Earth.

   The globe is oriented so that ANCHOR (central BC) sits at +Y, which is
   where the terrain patch is tangent. The survey site and the country it
   sits in are therefore the same place, seen at two scales.
   ========================================================================== */
import * as THREE from "three";
import { MASK, MASK_W, MASK_H, MASK_STEP } from "./landmask.js";

/* ------------------------------------------------- landmask as a texture
   Points alone are far too sparse to read as continents from orbit, so the
   coastline is also painted onto the ocean sphere as a data texture:
     R = land   G = Canada   B = coastline cell
   Built from the same raster, so it can never disagree with the points. */
function landTexture() {
  const c = document.createElement("canvas");
  c.width = MASK_W; c.height = MASK_H;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(MASK_W, MASK_H);
  const d = img.data;
  for (let row = 0; row < MASK_H; row++) {
    for (let col = 0; col < MASK_W; col++) {
      const i = row * MASK_W + col;
      const m = MASK[i];
      const land = m & 1;
      let coast = 0;
      if (land) {
        const l = MASK[row * MASK_W + ((col - 1 + MASK_W) % MASK_W)] & 1;
        const r = MASK[row * MASK_W + ((col + 1) % MASK_W)] & 1;
        const u = row > 0 ? MASK[(row - 1) * MASK_W + col] & 1 : 1;
        const dn = row < MASK_H - 1 ? MASK[(row + 1) * MASK_W + col] & 1 : 1;
        coast = (l && r && u && dn) ? 0 : 255;
      }
      d[i * 4] = land ? 255 : 0;
      d[i * 4 + 1] = (m & 2) ? 255 : 0;
      d[i * 4 + 2] = coast;
      d[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;   // data, not colour — must not be decoded
  t.flipY = false;                     // row 0 of the raster is +90 lat
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  /* shorelines near the limb are sampled at extreme grazing angles; without
     anisotropy the mip chain melts them into mush exactly where the planet
     needs its crisp edge */
  t.anisotropy = 4;
  return t;
}

export const GLOBE_R = 90;
/** the terrain patch is tangent here â€” central BC, Underhill's home ground */
export const ANCHOR = { lat: 54.0, lon: -122.0 };

/* Underhill offices (README / site contact pages) */
export const OFFICES = [
  { name: "BURNABY", lat: 49.25, lon: -122.98 },
  { name: "VANCOUVER ISLAND", lat: 48.43, lon: -123.37 },
  { name: "KAMLOOPS", lat: 50.68, lon: -120.33 },
  { name: "WHITEHORSE", lat: 60.72, lon: -135.05 },
  { name: "FORT ST. JOHN", lat: 56.25, lon: -120.85 },
  { name: "TUMBLER RIDGE", lat: 55.13, lon: -121.00 },
];


/** lat/lon (degrees) -> position on a sphere of radius r, Y-up, lon 0 at +Z */
export function llToVec3(lat, lon, r = GLOBE_R, out = new THREE.Vector3()) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  return out.set(
    -r * Math.sin(phi) * Math.sin(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.cos(theta)
  );
}

/* deterministic RNG â€” no bare Math.random() anywhere in the scene */
function rand(n) {
  const v = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/* ------------------------------------------- land cell index (sampling)
   The land points used to be rejection-sampled: 230k throws for ~76k hits,
   with the poles over-dense and coastlines no denser than interiors. This
   index walks the raster ONCE, splits land cells into interior / coast, and
   stores cumulative cos(latitude) weights so a uniform pick stays
   area-even. Every sample lands on land, and coasts can be deliberately
   over-weighted — the shoreline is what reads as "Earth" from orbit. */
let _landIndex = null;
function landIndex() {
  if (_landIndex) return _landIndex;
  const interior = [], coast = [];
  for (let row = 0; row < MASK_H; row++) {
    const w = Math.cos((90 - (row + 0.5) * MASK_STEP) * Math.PI / 180);
    for (let col = 0; col < MASK_W; col++) {
      const idx = row * MASK_W + col;
      if (!(MASK[idx] & 1)) continue;
      const l = MASK[row * MASK_W + ((col + MASK_W - 1) % MASK_W)] & 1;
      const r = MASK[row * MASK_W + ((col + 1) % MASK_W)] & 1;
      const u = row > 0 ? MASK[(row - 1) * MASK_W + col] & 1 : 1;
      const d = row < MASK_H - 1 ? MASK[(row + 1) * MASK_W + col] & 1 : 1;
      (l && r && u && d ? interior : coast).push(idx, w);
    }
  }
  /* flat [idx, weight, idx, weight, ...] -> typed arrays + cumulative */
  const pack = (pairs) => {
    const n = pairs.length / 2;
    const idx = new Uint32Array(n);
    const cum = new Float64Array(n);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      idx[i] = pairs[i * 2];
      acc += pairs[i * 2 + 1];
      cum[i] = acc;
    }
    return { idx, cum, total: acc };
  };
  _landIndex = { interior: pack(interior), coast: pack(coast) };
  return _landIndex;
}

/* area-weighted pick from a cumulative list, deterministic via rand() */
function pickCell(list, r) {
  const x = r * list.total;
  let lo = 0, hi = list.cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list.cum[mid] < x) lo = mid + 1; else hi = mid;
  }
  return list.idx[lo];
}

/**
 * Build the Earth.
 * @returns {{ group, uniforms, atmoUniforms, markers, markerUniforms, pulseRing }}
 */
/* PERF (AMD-GPU thermal fix): hard ceiling on land points regardless of what
   the caller asks for. 42k additive points + bloom was a fill-rate hotspot;
   24k keeps coastlines legible because coast cells are over-weighted. */
const MAX_LAND_POINTS = 24000;

export function buildGlobe(scene, { landPoints = 16000 } = {}) {
  landPoints = Math.min(landPoints, MAX_LAND_POINTS);
  const group = new THREE.Group();
  group.name = "globe";

  /* Orient so ANCHOR ends up at local +Y â€” the point the terrain patch is
     tangent to.

     llToVec3 puts the anchor at (-sinÏ† sinÎ¸, cosÏ†, sinÏ† cosÎ¸) for
     Ï† = 90-lat, Î¸ = lon+180. Getting that to +Y needs, IN THIS ORDER:
       1. a +Î¸ rotation about Y, which lands it on (0, cosÏ†, sinÏ†)
       2. a -Ï† rotation about X, which lands it on (0, 1, 0)
     three applies parent transforms LAST, so the Y spin must be the INNER
     node and the X tilt the OUTER one. `group` itself stays unrotated so
     the scan pulse and plumb line can sit on world +Y. */
  const tilt = new THREE.Group();
  tilt.name = "globe.tilt";
  tilt.rotation.x = -(90 - ANCHOR.lat) * Math.PI / 180;
  const spin = new THREE.Group();
  spin.name = "globe.spin";
  spin.rotation.y = (ANCHOR.lon + 180) * Math.PI / 180;
  const oriented = new THREE.Group();
  oriented.name = "globe.oriented";
  group.add(tilt);
  tilt.add(spin);
  spin.add(oriented);

  /* ---------------------------------------------------- ocean / body
     Shaded in its own shader rather than by the scene lights: the scene rig
     is built for a 2 m instrument at the origin and does nothing useful for
     a 90-unit sphere 90 units below it. A fixed sun vector gives a real
     terminator; the fresnel term seats the land points on a surface. */
  const bodyMat = new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 0 },
      uSun: { value: new THREE.Vector3(0.55, 0.62, 0.56).normalize() },
      uLand: { value: landTexture() },
      uHighlight: { value: 0 },
    },
    transparent: true,
    fog: false,
    vertexShader: /* glsl */`
      varying vec3 vN;
      varying vec3 vView;
      varying vec3 vObj;
      void main() {
        vN = normalize(normalMatrix * normal);
        vObj = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uOpacity, uHighlight;
      uniform vec3 uSun;
      uniform sampler2D uLand;
      varying vec3 vN;
      varying vec3 vView;
      varying vec3 vObj;
      const float PI = 3.14159265359;
      void main() {
        /* Look the landmask up from the object-space normal rather than from
           SphereGeometry's UVs — same formula as llToVec3, so the texture and
           the point cloud are guaranteed to agree. */
        float lat = degrees(asin(clamp(vObj.y, -1.0, 1.0)));
        float th = atan(-vObj.x, vObj.z);          // 0..2PI == lon -180..180
        vec2 uv = vec2(th / (2.0 * PI), (90.0 - lat) / 180.0);
        vec3 ms = texture2D(uLand, uv).rgb;

        vec3 sun = normalize((viewMatrix * vec4(uSun, 0.0)).xyz);
        float lam = clamp(dot(vN, sun), 0.0, 1.0);
        /* soft terminator, and a night side that is deep navy, never black */
        /* NOTE: these are LINEAR values and the composer's OutputPass
           re-encodes the whole buffer to sRGB, which lifts them steeply
           (linear 0.25 lands near 0.53 on screen). They are deliberately
           an order of magnitude lower than they look like they should be â€”
           the land points, not the ocean, are meant to carry this frame. */
        float day = smoothstep(-0.05, 0.55, lam);
        vec3 night = vec3(0.0016, 0.0042, 0.0090);
        vec3 noon  = vec3(0.0085, 0.0300, 0.0560);
        vec3 col = mix(night, noon, day);

        /* limb darkening: a real ocean falls off toward the edge of the
           disc instead of staying uniformly lit — without it the sphere
           reads as a flat sticker */
        float ndv = clamp(dot(vN, vView), 0.0, 1.0);
        col *= 0.72 + 0.28 * ndv;

        /* sun glint — a TIGHT bright specular point that sells water from
           orbit. Broad + dim read as a detached grey smudge; small + hot
           reads as the sun reflecting off the Pacific. Ocean, day side. */
        vec3 refl = reflect(-sun, vN);
        float glint = pow(clamp(dot(refl, vView), 0.0, 1.0), 1200.0);
        col += vec3(0.45, 0.58, 0.68) * glint * smoothstep(0.15, 0.55, day)
               * (1.0 - ms.r) * 1.2;

        /* continents: dark olive against the blue, Canada warming on cue */
        vec3 landNight = vec3(0.0040, 0.0055, 0.0032);
        vec3 landNoon  = vec3(0.0230, 0.0330, 0.0150);
        vec3 caNoon    = vec3(0.0420, 0.0680, 0.0210);
        vec3 lcol = mix(landNight, mix(landNoon, caNoon, ms.g * uHighlight), day);
        col = mix(col, lcol, ms.r);

        /* night-side settlements: sparse warm speckle on dark land. The
           ms.r gate double-duties as an LOD fade — under mipmaps the land
           channel averages toward the land FRACTION at distance, dropping
           below the gate, so the speckle never shimmers at orbit range. */
        float nightK = 1.0 - day;
        if (nightK > 0.01 && ms.r > 0.35) {
          vec2 cell = floor(uv * vec2(1440.0, 720.0));
          float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
          float lit = step(0.935, h) * fract(h * 91.7);
          col += vec3(0.34, 0.22, 0.08) * lit * nightK * 0.45;
        }

        /* the coastline is what actually makes a continent legible */
        col += vec3(0.020, 0.048, 0.030) * ms.b * (0.30 + 0.70 * day);

        /* grazing-angle sheen so the limb reads as water, not a cut-out */
        float fres = pow(1.0 - ndv, 3.0);
        col += vec3(0.008, 0.022, 0.040) * fres * (0.35 + 0.65 * day);
        gl_FragColor = vec4(col, uOpacity);
      }`,
  });
  const body = new THREE.Mesh(
    /* PERF: 64x48 -> 48x32 — the shader derives everything from the
       normalized position, so tessellation is invisible on a smooth sphere */
    new THREE.SphereGeometry(GLOBE_R * 0.995, 48, 32), bodyMat
  );
  body.name = "globe.ocean";
  oriented.add(body);

  /* ------------------------------------------------------ land points
     Sampled from the land cell index above: 100% acceptance, area-even,
     and coast cells deliberately over-represented — the shoreline edge is
     what makes a continent readable at this distance. Points are jittered
     inside their cell so no raster grid shows. */
  const LI = landIndex();
  const COAST_SHARE = 0.45;
  const pos = [], flag = [], seed = [], coast = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < landPoints; i++) {
    const onCoast = rand(i * 5.13 + 0.7) < COAST_SHARE;
    const cell = pickCell(onCoast ? LI.coast : LI.interior, rand(i * 3.7 + 11.1));
    const row = (cell / MASK_W) | 0;
    const col = cell % MASK_W;
    const lat = 90 - (row + rand(i * 1.31 + 3.3)) * MASK_STEP;
    const lon = (col + rand(i * 2.17 + 7.7)) * MASK_STEP - 180;
    llToVec3(lat, lon, GLOBE_R, v);
    pos.push(v.x, v.y, v.z);
    flag.push((MASK[cell] & 2) ? 1 : 0);
    coast.push(onCoast ? 1 : 0);
    seed.push(rand(i * 1.618));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("aCanada", new THREE.Float32BufferAttribute(flag, 1));
  geo.setAttribute("aCoast", new THREE.Float32BufferAttribute(coast, 1));
  geo.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 1));
  geo.computeBoundingSphere();

  const uniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0 },
    uHighlight: { value: 0 },   // 0 = uniform land, 1 = Canada picked out
    uSize: { value: 2.0 },
  };
  const land = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    vertexShader: /* glsl */`
      attribute float aCanada;
      attribute float aCoast;
      attribute float aSeed;
      uniform float uTime, uHighlight, uSize;
      varying vec3 vColor;
      varying float vA;
      void main() {
        /* base land is a DESATURATED deep teal — the old neon mint read as
           candy against the ocean. Canada warms to brand lime on highlight. */
        vec3 cold = vec3(0.19, 0.55, 0.46);
        vec3 warm = vec3(0.55, 0.86, 0.34);
        vec3 rim  = vec3(0.62, 0.92, 0.98);
        float k = aCanada * uHighlight;
        /* coasts carry the silhouette: cooler, brighter, slightly larger */
        vec3 base = mix(cold, rim, aCoast * 0.55) * (0.70 + 0.55 * aCoast);
        vColor = mix(base, warm * (1.0 + 0.35 * aCoast), k);
        /* gentle shimmer only — full-range twinkle is what made the surface
           read as confetti instead of landmass */
        vA = 0.82 + 0.18 * sin(uTime * (0.4 + aSeed) + aSeed * 24.0);
        vA = mix(vA, 1.0, max(k * 0.6, aCoast * 0.35));
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        /* fade points toward the limb: seen edge-on they stack into a solid
           bright band that bloom smears into snow-globe fuzz. A real
           planet's edge is atmosphere, not dots. */
        vec3 vn = normalize(normalMatrix * normalize(position));
        float face = abs(dot(vn, normalize(-mv.xyz)));
        vA *= 0.45 + 0.55 * smoothstep(0.0, 0.45, face);
        /* clamped so the land does not turn into confetti on close approach */
        gl_PointSize = clamp((uSize + k * 1.2 + aCoast * 0.9) * (260.0 / -mv.z), 1.0, 5.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uOpacity;
      varying vec3 vColor;
      varying float vA;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        gl_FragColor = vec4(vColor, smoothstep(0.5, 0.1, d) * vA * uOpacity);
      }`,
  }));
  land.name = "globe.land";
  oriented.add(land);

  /* -------------------------------------------------------- graticule */
  const gLines = [];
  for (let lat = -60; lat <= 60; lat += 30) {
    for (let lon = -180; lon < 180; lon += 4) {
      llToVec3(lat, lon, GLOBE_R * 1.001, v); gLines.push(v.x, v.y, v.z);
      llToVec3(lat, lon + 4, GLOBE_R * 1.001, v); gLines.push(v.x, v.y, v.z);
    }
  }
  for (let lon = -180; lon < 180; lon += 30) {
    for (let lat = -85; lat < 85; lat += 4) {
      llToVec3(lat, lon, GLOBE_R * 1.001, v); gLines.push(v.x, v.y, v.z);
      llToVec3(lat + 4, lon, GLOBE_R * 1.001, v); gLines.push(v.x, v.y, v.z);
    }
  }
  const gratMat = new THREE.LineBasicMaterial({
    color: 0x0082ca, transparent: true, opacity: 0, toneMapped: false,
    fog: false, depthWrite: false,
  });
  const grat = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute(
      "position", new THREE.Float32BufferAttribute(gLines, 3)), gratMat);
  grat.name = "globe.graticule";
  oriented.add(grat);

  /* ------------------------------------------------------- atmosphere
     Back-side shell with a Fresnel rim â€” the limb glow in the reference. */
  const atmoUniforms = { uOpacity: { value: 0 } };
  /* 1.055 read as a fat grey ring around a black disc; a thin shell with a
     sharp fresnel falloff is what makes it look like atmosphere */
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_R * 1.022, 48, 32), // PERF: was 64x40
    new THREE.ShaderMaterial({
      uniforms: atmoUniforms,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      vertexShader: /* glsl */`
        varying vec3 vN;
        varying vec3 vView;
        void main() {
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uOpacity;
        varying vec3 vN;
        varying vec3 vView;
        void main() {
          float rim = clamp(1.0 - abs(dot(vN, vView)), 0.0, 1.0);
          /* two scales from one shell: a tight bright limb (the airglow
             line) plus a wide faint halo (scattered light). The single
             hard fresnel on its own read as a neon outline. */
          float f = pow(rim, 6.0);
          /* wide halo stays FAINT: additive + bloom turns anything stronger
             into snow-globe smear at the limbs */
          float soft = pow(rim, 2.2) * 0.07;
          vec3 col = mix(vec3(0.04, 0.26, 0.50), vec3(0.42, 0.72, 0.98), f);
          gl_FragColor = vec4(col * 0.9, (f + soft) * uOpacity);
        }`,
    })
  );
  atmo.name = "globe.atmosphere";
  oriented.add(atmo);

  /* ---------------------------------------------------- office markers */
  const markerUniforms = { uTime: { value: 0 }, uOpacity: { value: 0 } };
  const mPos = [], mSeed = [];
  OFFICES.forEach((o, i) => {
    llToVec3(o.lat, o.lon, GLOBE_R * 1.004, v);
    mPos.push(v.x, v.y, v.z);
    mSeed.push(i / OFFICES.length);
  });
  const mGeo = new THREE.BufferGeometry();
  mGeo.setAttribute("position", new THREE.Float32BufferAttribute(mPos, 3));
  mGeo.setAttribute("aSeed", new THREE.Float32BufferAttribute(mSeed, 1));
  const markers = new THREE.Points(mGeo, new THREE.ShaderMaterial({
    uniforms: markerUniforms,
    transparent: true, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aSeed;
      uniform float uTime;
      varying float vP;
      void main() {
        vP = 0.55 + 0.45 * sin(uTime * 2.2 - aSeed * 6.28);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (5.0 + vP * 4.0) * (260.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uOpacity;
      varying float vP;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float core = smoothstep(0.22, 0.0, d);
        float ring = smoothstep(0.5, 0.34, d) * smoothstep(0.26, 0.34, d);
        gl_FragColor = vec4(vec3(0.91, 1.0, 0.54), (core + ring * vP) * uOpacity);
      }`,
  }));
  markers.name = "globe.offices";
  oriented.add(markers);

  /* ------------------------------------------- scan pulse over the anchor
     Concentric rings on the surface at BC â€” the reference's "scan pulse
     shows scale and reach", and the same visual language as the ground
     ripples in the terrain chapters. */
  const pulseUniforms = { uTime: { value: 0 }, uOpacity: { value: 0 } };
  const ringGeo = new THREE.RingGeometry(0.985, 1.0, 64); // PERF: was 128
  const pulseRing = new THREE.Group();
  pulseRing.name = "globe.scanPulse";
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.ShaderMaterial({
      uniforms: { ...pulseUniforms, uPhase: { value: i / 3 } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, fog: false,
      vertexShader: /* glsl */`
        uniform float uTime, uPhase;
        varying float vF;
        void main() {
          float t = fract(uTime * 0.28 + uPhase);
          vF = 1.0 - t;
          vec3 p = position * (1.0 + t * 13.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float uOpacity;
        varying float vF;
        void main() {
          gl_FragColor = vec4(vec3(0.85, 1.0, 0.62), vF * vF * uOpacity);
        }`,
    }));
    m.name = `globe.scanPulse.${i}`;
    m.rotation.x = -Math.PI / 2;
    pulseRing.add(m);
  }
  /* sits on the surface at the anchor, i.e. straight up in globe-local space */
  pulseRing.position.set(0, GLOBE_R * 1.002, 0);
  group.add(pulseRing);   // outside `oriented` so it stays at +Y

  /* ------------------------------------------------------- reach arcs
     Great circles from the survey site to each office, lifted off the
     surface and drawn in as the final chapter lands. This is the closing
     statement made literal: one setup, connected to a national footprint.
     Each arc carries a travelling pulse so the frame is never static. */
  const arcUniforms = {
    uTime: { value: 0 },
    uDraw: { value: 0 },      // 0..1 — how much of each arc has been drawn
    uOpacity: { value: 0 },
  };
  const arcGroup = new THREE.Group();
  arcGroup.name = "globe.reachArcs";
  const aFrom = llToVec3(ANCHOR.lat, ANCHOR.lon, 1, new THREE.Vector3());
  const SEG = 64; // PERF: was 96 — 1px lines, the extra vertices are invisible
  OFFICES.forEach((o, i) => {
    const to = llToVec3(o.lat, o.lon, 1, new THREE.Vector3());
    const ang = Math.acos(Math.min(1, Math.max(-1, aFrom.dot(to))));
    /* short hops still need visible altitude or they hug the surface */
    const lift = GLOBE_R * (0.035 + ang * 0.42);
    const pos = [], ts = [];
    const tmp = new THREE.Vector3();
    for (let k = 0; k <= SEG; k++) {
      const t = k / SEG;
      /* slerp; falls back to lerp when the endpoints are nearly coincident */
      if (ang < 1e-4) tmp.copy(aFrom);
      else {
        tmp.set(0, 0, 0)
          .addScaledVector(aFrom, Math.sin((1 - t) * ang) / Math.sin(ang))
          .addScaledVector(to, Math.sin(t * ang) / Math.sin(ang));
      }
      tmp.normalize().multiplyScalar(GLOBE_R + Math.sin(Math.PI * t) * lift);
      pos.push(tmp.x, tmp.y, tmp.z);
      ts.push(t);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aT", new THREE.Float32BufferAttribute(ts, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...arcUniforms, uPhase: { value: i / OFFICES.length } },
      transparent: true, depthWrite: false, fog: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute float aT;
        uniform float uTime, uDraw, uOpacity, uPhase;
        varying float vA;
        varying float vHot;
        void main() {
          float drawn = 1.0 - smoothstep(uDraw - 0.07, uDraw, aT);
          float p = fract(uTime * 0.28 + uPhase);
          float pulse = exp(-pow((aT - p) * 11.0, 2.0));
          vHot = pulse * drawn;
          vA = (drawn * 0.62 + vHot * 2.4) * uOpacity;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying float vA;
        varying float vHot;
        void main() {
          if (vA < 0.004) discard;
          /* the standing arc is brand cyan; the travelling pulse goes lime */
          vec3 col = mix(vec3(0.30, 0.72, 0.98), vec3(0.90, 1.0, 0.55),
                         clamp(vHot * 1.6, 0.0, 1.0));
          gl_FragColor = vec4(col, clamp(vA, 0.0, 1.0));
        }`,
    });
    const line = new THREE.Line(g, mat);
    line.name = `globe.reachArc.${o.name}`;
    arcGroup.add(line);
  });
  oriented.add(arcGroup);
  const arcMats = arcGroup.children.map((c) => c.material);

  /* vertical sightline from orbit down to the anchor (reference frames 05/06) */
  const beamMat = new THREE.LineBasicMaterial({
    color: 0x9fe8ff, transparent: true, opacity: 0, toneMapped: false,
    fog: false, depthWrite: false,
  });
  const beam = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, GLOBE_R * 1.0, 0),
      new THREE.Vector3(0, GLOBE_R * 1.20, 0),
    ]), beamMat);
  beam.name = "globe.sightline";
  group.add(beam);

  scene.add(group);
  return {
    group, oriented, uniforms, atmoUniforms, gratMat, markerUniforms,
    pulseRing, pulseMats: pulseRing.children.map((c) => c.material),
    beamMat, bodyUniforms: bodyMat.uniforms, arcMats,
  };
}
