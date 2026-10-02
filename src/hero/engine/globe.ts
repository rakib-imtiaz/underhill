/**
 * The planet, ray-traced analytically in a fullscreen pass: an exact sphere (no tessellation sag,
 * so the scan points that sit on it never float), shaded land from the runtime land mask, a
 * halftone of land dots, coastlines, a lat/long graticule, the highlighted service region and an
 * atmosphere rim. Writes real depth so arcs and markers behind the limb are hidden.
 *
 * Precision: everything is camera-relative, and the one cancellation-prone quantity
 * (|C|² − R²) is computed in float64 on the CPU.
 */
import * as THREE from 'three'
import { NORTH_SITES, R, GLOBE_CENTER, LOCAL_TO_ECEF, OFFICES, latLonToDir, SITE } from './geo'
import { RAY_DIR, RAY_VERT, fullscreenTriangle, HAZE } from './sky'
import { buildFatLine, buildMarkers, type Polyline } from './lines'

export const GLOBE_SINK = 120 // sphere sits just under the valley floor

export function buildGlobe(mask: THREE.Texture) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    depthTest: true,
    uniforms: {
      uProjInv: { value: new THREE.Matrix4() },
      uCamRot: { value: new THREE.Matrix3() },
      uViewRot: { value: new THREE.Matrix3() },
      uProj: { value: new THREE.Matrix4() },
      uC: { value: new THREE.Vector3() },
      uC2: { value: 1 },
      uR: { value: R - GLOBE_SINK },
      uL2E: { value: LOCAL_TO_ECEF.clone() },
      uMask: { value: mask },
      uAlpha: { value: 0 },
      uSpace: { value: 0 },
      uRegion: { value: 0 },
      uTime: { value: 0 },
      uHaze: { value: HAZE.clone() },
      uLight: { value: new THREE.Vector3(0, 1, 0) },
    },
    vertexShader: RAY_VERT,
    fragmentShader: /* glsl */ `
      ${RAY_DIR}
      uniform mat3 uViewRot, uL2E;
      uniform mat4 uProj;
      uniform vec3 uC, uHaze, uLight;
      uniform float uC2, uR, uAlpha, uSpace, uRegion, uTime;
      uniform sampler2D uMask;
      varying vec2 vNdc;
      const float PI = 3.14159265359;

      float depthOf(vec3 rel) {
        vec4 clip = uProj * vec4(uViewRot * rel, 1.0);
        return clamp(clip.z / clip.w * 0.5 + 0.5, 0.0, 1.0);
      }
      float aaLine(float v, float period) {         // distance to nearest multiple of period, in px
        float d = abs(fract(v / period + 0.5) - 0.5) * period;
        return d / max(fwidth(v), 1e-6);
      }

      void main() {
        vec3 d = rayDir(vNdc);
        float b = dot(d, uC);
        float disc = b * b - uC2;

        if (disc < 0.0 || b < 0.0) {
          // miss: atmosphere rim around the limb
          // a bright thin shell hugging the limb over a wide soft glow
          float h = sqrt(max(uC2 + uR * uR - b * b, 0.0)) - uR;
          float shell = exp(-max(h, 0.0) / 60000.0), glow = exp(-max(h, 0.0) / 260000.0);
          float rim = (shell * 0.9 + glow * 0.35) * step(0.0, b);
          float a = rim * uAlpha * uSpace;
          if (a < 0.004) discard;
          gl_FragDepth = 0.9999999;
          gl_FragColor = vec4(mix(vec3(0.05, 0.3, 0.58), vec3(0.5, 0.8, 1.0), shell), a);
          return;
        }

        float t = uC2 / (b + sqrt(disc));          // near root, cancellation-free
        vec3 hit = d * t;
        vec3 n = normalize(hit - uC);
        vec3 ecef = uL2E * n;
        float lat = asin(clamp(ecef.z, -1.0, 1.0));
        float lon = atan(ecef.y, ecef.x);
        vec2 uv = vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);
        // seam-safe gradients for the mask lookup
        vec2 uv2 = vec2(fract(uv.x + 0.5), uv.y);
        vec2 gx = dFdx(uv), gy = dFdy(uv), gx2 = dFdx(uv2), gy2 = dFdy(uv2);
        if (abs(gx2.x) + abs(gy2.x) < abs(gx.x) + abs(gy.x)) { gx = gx2; gy = gy2; }
        vec4 m = textureGrad(uMask, uv, gx, gy);
        float fwl = max(length(vec2(gx.x, gy.x)) * 2048.0, 1e-3);
        float land = smoothstep(0.5 - 0.25 * fwl, 0.5 + 0.25 * fwl, m.r);
        float reg = smoothstep(0.35, 0.65, m.g) * uRegion;

        float latD = degrees(lat), lonD = degrees(lon);
        // lit ocean: a night side, a day side and a soft terminator between them; land darker than the sea
        float mu = max(dot(n, -d), 0.0);
        float lam = dot(n, uLight);
        float day = smoothstep(-0.05, 0.55, lam);
        vec3 ocean = mix(vec3(0.02, 0.045, 0.08), vec3(0.06, 0.17, 0.28), day) * (0.72 + 0.28 * mu);
        vec3 ground = mix(vec3(0.03, 0.05, 0.06), vec3(0.07, 0.12, 0.13), day);
        vec3 col = mix(ocean, ground, land);
        // the region polygon runs out to sea on purpose: its tint, border and glow are clipped to land
        col = mix(col, vec3(0.08, 0.17, 0.09), reg * land * 0.6);
        // sun glint on the water
        vec3 hv = normalize(uLight - d);
        col += vec3(0.5, 0.7, 0.9) * pow(max(dot(n, hv), 0.0), 900.0) * (1.0 - land) * 0.6;

        // halftone land dots: rows every 0.42°, spacing widened by 1/cos(lat) to stay even
        float dLat = 0.42;
        float row = floor(latD / dLat);
        float rowLat = (row + 0.5) * dLat;
        float dLon = dLat / max(cos(radians(rowLat)), 0.05);
        float cx = (floor(lonD / dLon + 0.5 * mod(row, 2.0)) + 0.5 - 0.5 * mod(row, 2.0)) * dLon;
        vec2 dd = vec2((lonD - cx) * cos(lat), latD - rowLat);
        float cellPx = dLat / max(fwidth(latD), 1e-6);
        float dotR = mix(0.28, 0.22, reg) * dLat;
        float dotA = 1.0 - smoothstep(dotR - 0.6 * dLat / cellPx, dotR + 0.6 * dLat / cellPx, length(dd));
        float dotVis = smoothstep(2.6, 5.0, cellPx) * (1.0 - smoothstep(13.0, 30.0, cellPx)) * land;
        vec3 dotCol = mix(vec3(0.24, 0.5, 0.44), vec3(0.5, 0.78, 0.36), reg); // teal land, the service region in lime
        col = mix(col, dotCol * (0.6 + 0.4 * day), dotA * dotVis * mix(0.5, 0.62, reg));
        // dots too small to draw (a phone, far out): their average tone instead, so the land never turns to mud
        float cover = 3.14159 * pow(mix(0.28, 0.22, reg), 2.0) * mix(0.5, 0.62, reg);
        col = mix(col, dotCol * (0.6 + 0.4 * day), cover * (1.0 - smoothstep(2.6, 5.0, cellPx)) * land);

        // coastline + region border
        float coast = 1.0 - smoothstep(0.6, 1.6, abs(m.r - 0.5) / max(fwidth(m.r), 1e-4));
        col += vec3(0.35, 0.78, 0.9) * coast * 0.7;
        float border = (1.0 - smoothstep(0.6, 1.8, abs(m.g - 0.5) / max(fwidth(m.g), 1e-4))) * uRegion * land;
        col += vec3(0.75, 1.0, 0.5) * border * (0.75 + 0.25 * sin(uTime * 2.0));
        // a soft glow just inside the border, and a thin survey scan line passing north across the region
        float halo = (1.0 - smoothstep(0.6, 7.0, abs(m.g - 0.5) / max(fwidth(m.g), 1e-4))) * uRegion * land;
        col += vec3(0.45, 0.8, 0.35) * halo * 0.12;
        float scanLat = 47.0 + mod(uTime * 7.0, 40.0);
        float scan = exp(-pow((latD - scanLat) / 0.3, 2.0)) + 0.08 * exp(-max(scanLat - latD, 0.0) / 2.0) * step(latD, scanLat);
        col += vec3(0.75, 1.0, 0.5) * reg * land * scan * 0.45; // a fine survey line, not a band
        // survey pulses: three rings spreading over the ground from the site
        float sa = degrees(acos(clamp(n.y, -1.0, 1.0)));
        for (int i = 0; i < 3; i++) {
          float ph = fract(uTime * 0.22 + float(i) / 3.0);
          float rr = ph * 9.0;
          float rw = max(fwidth(sa) * 1.2, 0.05);
          col += vec3(0.75, 1.0, 0.55) * exp(-pow((sa - rr) / rw, 2.0)) * (1.0 - ph) * 0.6 * uRegion;
        }

        // graticule every 15°
        float gl = min(aaLine(latD, 15.0), aaLine(lonD, 15.0));
        col += vec3(0.0, 0.51, 0.79) * (1.0 - smoothstep(0.4, 1.4, gl)) * 0.2 * uSpace;

        // limb: fresnel glow into the atmosphere
        col += mix(vec3(0.05, 0.3, 0.58), vec3(0.45, 0.75, 1.0), pow(1.0 - mu, 5.0)) * pow(1.0 - mu, 3.0) * 0.7 * uSpace;
        // near the ground the globe is seen through haze, matching the sky's ground tone
        col = mix(col, uHaze * 0.6, (1.0 - uSpace) * (1.0 - exp(-t / 120000.0)));

        gl_FragDepth = depthOf(hit);
        gl_FragColor = vec4(col, uAlpha);
      }
    `,
  })
  const mesh = new THREE.Mesh(fullscreenTriangle(), material)
  mesh.frustumCulled = false
  mesh.renderOrder = -50
  mesh.name = 'globe'
  return { mesh, material }
}

const surf = (dir: THREE.Vector3, alt: number, out: number[] | Float32Array, o: number) => {
  out[o] = dir.x * (R + alt) + GLOBE_CENTER.x
  out[o + 1] = dir.y * (R + alt) + GLOBE_CENTER.y
  out[o + 2] = dir.z * (R + alt) + GLOBE_CENTER.z
}

/** Office markers, the site marker, and great-circle arcs from the site to each office. */
export function buildNetwork() {
  const site = latLonToDir(SITE.lat, SITE.lon)
  const officePos = new Float32Array(OFFICES.length * 3)
  const dirs = OFFICES.map((o) => latLonToDir(o.lat, o.lon))
  dirs.forEach((d, i) => surf(d, 2500, officePos, i * 3))
  const offices = buildMarkers(officePos, { size: 34, color: '#e8ff8a', stagger: 0.75 })

  const sitePos = new Float32Array(3)
  surf(site, 2500, sitePos, 0)
  const siteMarker = buildMarkers(sitePos, { size: 34, color: '#8ff3ff' })

  const arcs: Polyline[] = dirs.map((d, i) => {
    const N = 72
    const pts = new Float32Array((N + 1) * 3)
    const ang = site.angleTo(d)
    const tmp = new THREE.Vector3()
    for (let s = 0; s <= N; s++) {
      const t = s / N
      // slerp along the great circle, lifted into a shallow arch
      const sn = Math.sin(ang)
      tmp.copy(site).multiplyScalar(Math.sin((1 - t) * ang) / sn).addScaledVector(d, Math.sin(t * ang) / sn).normalize()
      surf(tmp, 3000 + Math.sin(Math.PI * t) * ang * R * 0.14, pts, s * 3)
    }
    return { pts, id: i }
  })
  // order the arc reveal nearest-first so the network grows outward
  const order = dirs.map((d, i) => ({ i, a: site.angleTo(d) })).sort((a, b) => a.a - b.a)
  order.forEach((o, rank) => { arcs[o.i].id = rank })
  // to the Arctic: high arches from Whitehorse, the northern office, out to the northern project sites,
  // revealed after the office network, nearest first
  const coast = dirs[OFFICES.findIndex((o) => o.name === 'Whitehorse')]
  const northDirs = NORTH_SITES.map((o) => latLonToDir(o.lat, o.lon))
  northDirs.map((d, i) => ({ d, i, a: coast.angleTo(d) })).sort((a, b) => a.a - b.a).forEach(({ d, a: ang }, rank) => {
    const N = 96
    const pts = new Float32Array((N + 1) * 3)
    const tmp = new THREE.Vector3()
    const sn = Math.sin(ang)
    for (let s = 0; s <= N; s++) {
      const t = s / N
      tmp.copy(coast).multiplyScalar(Math.sin((1 - t) * ang) / sn).addScaledVector(d, Math.sin(t * ang) / sn).normalize()
      surf(tmp, 3000 + Math.sin(Math.PI * t) * ang * R * 0.34, pts, s * 3)
    }
    arcs.push({ pts, id: dirs.length + rank })
  })
  const projectPos = new Float32Array(NORTH_SITES.length * 3)
  northDirs.forEach((d, i) => surf(d, 2500, projectPos, i * 3))
  const projects = buildMarkers(projectPos, { size: 30, color: '#8ff3ff', ring: 1, stagger: 0.6 })
  const arcLines = buildFatLine(arcs, { width: 1.9, color: '#6fc4f5', alpha: 0.45, additive: true, comet: 2.4, pulseSpeed: 0.3, stagger: 0.7, headGlow: 1.4 })
  const officeOrder = order.map((o) => o.i)
  return { offices, siteMarker, sitePos, arcLines, officePos, officeOrder, officeDirs: dirs, projects, projectPos }
}
