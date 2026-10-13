// Act III set: the planet. The valley from Act II becomes one lit point on a globe at dusk, held in
// place by a constellation of positioning satellites, the same signals the base station listened
// to in chapter 02.
//
// The globe is a unit sphere. Land comes from a Natural Earth raster (js/data/landmask.js) decoded
// into a texture once; everything else (halftone land, coastlines, graticule, the dusk terminator,
// the atmosphere) is shaded procedurally. Satellites orbit on the clock; what is shown is scroll-driven.
import * as THREE from 'three';
import { MASK, MASK_W, MASK_H } from './data/landmask.js';
import { QUALITY_TIERS } from './quality.js';

const D2R = Math.PI / 180;
/** The Act II valley: BC interior, UTM zone 11 (matches the E/N readouts in the field). */
export const SITE = { lat: 50.73, lon: -117.83 };

/** lat/lon (deg) → unit vector in the globe's own frame (+Y north, lon 0 on +Z). */
export function llToDir(lat, lon, out = new THREE.Vector3()) {
  const la = lat * D2R, lo = lon * D2R;
  return out.set(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo));
}

function maskTexture() {
  const data = new Uint8Array(MASK_W * MASK_H * 4);
  for (let i = 0; i < MASK.length; i++) {
    const v = MASK[i];
    data[i * 4] = v & 1 ? 255 : 0;          // land
    data[i * 4 + 1] = v & 2 ? 255 : 0;      // Canada
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, MASK_W, MASK_H, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

function glowTex(rgbIn, rgbOut) {
  const S = 128; const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  r.addColorStop(0, `rgba(${rgbIn},1)`); r.addColorStop(0.2, `rgba(${rgbOut},0.5)`); r.addColorStop(1, `rgba(${rgbOut},0)`);
  g.fillStyle = r; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const GLOBE_FRAG = /* glsl */`
  uniform sampler2D uMask; uniform vec3 uSun; uniform vec3 uSite; uniform float uTime; uniform float uReach; uniform float uAlpha; uniform float uDay;
  varying vec3 vObj; varying vec3 vN; varying vec3 vWorld;
  const float PI = 3.14159265359;
  float lineAA(float v, float period) { float d = abs(fract(v / period + 0.5) - 0.5) * period; return d / max(fwidth(v), 1e-6); }
  void main() {
    vec3 p = normalize(vObj);
    float lat = asin(clamp(p.y, -1.0, 1.0));
    float lon = atan(p.x, p.z);
    vec2 uv = vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);
    vec4 m = texture2D(uMask, uv);
    float fw = max(fwidth(m.r), 1e-4);
    float land = smoothstep(0.5 - fw, 0.5 + fw, m.r);
    vec3 n = normalize(vN);
    vec3 v = normalize(cameraPosition - vWorld);
    float mu = max(dot(n, v), 0.0);
    float sunL = dot(normalize(vObj), uSun);
    float day = smoothstep(-0.04, 0.35, sunL);
    // sea and ground: deep on the night side, a cold blue by day
    // (the daylight mode lifts the day side: a brighter sea and land)
    vec3 ocean = mix(vec3(0.002, 0.005, 0.011), mix(vec3(0.022, 0.065, 0.12), vec3(0.05, 0.15, 0.3), uDay), day) * (0.65 + 0.35 * mu);
    vec3 ground = mix(vec3(0.006, 0.009, 0.012), mix(vec3(0.05, 0.072, 0.075), vec3(0.13, 0.17, 0.15), uDay), day);
    vec3 col = mix(ocean, ground, land);
    // halftone land: rows every 0.6 deg, spacing widened by 1/cos(lat) so the dots stay even
    float latD = degrees(lat), lonD = degrees(lon);
    float dLat = 0.6; float row = floor(latD / dLat); float rowLat = (row + 0.5) * dLat;
    float dLon = dLat / max(cos(radians(rowLat)), 0.05);
    float off = 0.5 * mod(row, 2.0);
    float cx = (floor(lonD / dLon + off) + 0.5 - off) * dLon;
    vec2 dd = vec2((lonD - cx) * cos(lat), latD - rowLat);
    float cell = dLat / max(fwidth(latD), 1e-6);
    float dotA = 1.0 - smoothstep(0.22 * dLat - 0.7 * dLat / cell, 0.22 * dLat + 0.7 * dLat / cell, length(dd));
    float dotVis = smoothstep(2.0, 4.5, cell) * land;
    // the survey's reach: dots within ~900 km of the site warm up toward the accent
    float ang = acos(clamp(dot(normalize(vObj), uSite), -1.0, 1.0));
    float reach = (1.0 - smoothstep(0.06, 0.15, ang)) * uReach;
    vec3 dotCol = mix(vec3(0.22, 0.62, 0.7), vec3(1.0, 0.56, 0.24), reach);
    col = mix(col, dotCol * (0.35 + 0.65 * day), dotA * dotVis * 0.75);
    col = mix(col, dotCol * (0.35 + 0.65 * day), 0.12 * land * (1.0 - smoothstep(2.0, 4.5, cell)));
    // night side: a few settlement lights along the dotted land
    float city = step(0.86, fract(sin(dot(floor(vec2(lonD, latD) * 2.0), vec2(12.9898, 78.233))) * 43758.5453));
    col += vec3(1.0, 0.7, 0.4) * city * dotA * land * (1.0 - day) * 0.5;
    // coastlines
    float coast = 1.0 - smoothstep(0.6, 1.6, abs(m.r - 0.5) / fw);
    col += vec3(0.35, 0.8, 0.95) * coast * (0.25 + 0.45 * day);
    // graticule every 15 deg
    float gl = min(lineAA(latD, 15.0), lineAA(lonD, 15.0));
    col += vec3(0.25, 0.55, 0.85) * (1.0 - smoothstep(0.4, 1.3, gl)) * 0.07;
    // dusk: the terminator glows warm (it is evening at the site)
    float dusk = exp(-pow((sunL + 0.01) / 0.06, 2.0));
    col += vec3(1.0, 0.42, 0.14) * dusk * 0.018;
    // limb
    col += vec3(0.2, 0.5, 0.95) * pow(1.0 - mu, 4.0) * (0.08 + 0.92 * day) * 0.75;
    gl_FragColor = vec4(col * uAlpha, 1.0);
  }`;

const ATMO_FRAG = /* glsl */`
  uniform vec3 uSun; uniform float uAlpha; varying vec3 vN; varying vec3 vWorld; varying vec3 vObj;
  void main() {
    vec3 v = normalize(cameraPosition - vWorld);
    float rim = pow(1.0 - abs(dot(normalize(vN), v)), 3.0);
    float day = smoothstep(-0.35, 0.4, dot(normalize(vObj), uSun));
    vec3 c = mix(vec3(0.02, 0.05, 0.14), vec3(0.3, 0.6, 1.0), day) + vec3(1.0, 0.45, 0.15) * exp(-pow(dot(normalize(vObj), uSun) / 0.08, 2.0)) * 0.18;
    gl_FragColor = vec4(c * rim * 1.4 * uAlpha, 1.0);
  }`;

const VERT = /* glsl */`
  varying vec3 vObj; varying vec3 vN; varying vec3 vWorld;
  void main() {
    vObj = position;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

export class Globe {
  /** opts.q: a quality tier (quality.js); without it, mobile → balanced, else high */
  constructor(scene, { mobile, q } = {}) {
    const Q = q || QUALITY_TIERS[mobile ? 'balanced' : 'high'];
    this.group = new THREE.Group();
    this.group.name = 'globe';
    this.group.visible = false;
    scene.add(this.group);
    // rotate the planet so the site faces +Z (the camera keys orbit around it from there)
    this.spin = new THREE.Group();
    this.spin.rotation.y = -SITE.lon * D2R;
    this.group.add(this.spin);
    this.siteDir = llToDir(SITE.lat, SITE.lon);                    // planet frame
    this.siteWorld = this.siteDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -SITE.lon * D2R);

    // sun just below the site's western horizon: dusk there, day over the Pacific
    const west = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), this.siteDir).normalize().negate();
    this.sun = this.siteDir.clone().multiplyScalar(-0.06).addScaledVector(west, 1).normalize();

    const uniforms = {
      uMask: { value: maskTexture() }, uSun: { value: this.sun }, uSite: { value: this.siteDir },
      uTime: { value: 0 }, uReach: { value: 0 }, uAlpha: { value: 1 }, uDay: { value: 0 },
    };
    this.sunDusk = this.sun.clone();
    // daylight mode: the sun high over the site (its day side faces the camera)
    this.sunNoon = this.siteDir.clone().multiplyScalar(0.8).addScaledVector(west, 0.6).normalize();
    this.uniforms = uniforms;
    const seg = Q.planetSeg;
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(1, seg, seg / 2), new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: GLOBE_FRAG }));
    this.planet.name = 'globe:planet';
    this.spin.add(this.planet);
    this.atmo = new THREE.Mesh(new THREE.SphereGeometry(1.045, 96, 48), new THREE.ShaderMaterial({
      uniforms: { uSun: uniforms.uSun, uAlpha: uniforms.uAlpha }, vertexShader: VERT, fragmentShader: ATMO_FRAG,
      side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.spin.add(this.atmo);

    this.buildStars(Q.stars);
    this.buildSite();
    this.buildSatellites();
  }

  buildStars(n) {
    const pos = new Float32Array(n * 3), size = new Float32Array(n);
    let seed = 5;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      pos.set([Math.cos(a) * r * 60, u * 60, Math.sin(a) * r * 60], i * 3);
      size[i] = 0.6 + Math.pow(rnd(), 6) * 2.6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uAlpha: { value: 1 }, uPixel: { value: 1 } },
      vertexShader: 'attribute float size; uniform float uPixel; varying float vS; void main(){ vS = size; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uPixel * 1.6; }',
      fragmentShader: 'uniform float uAlpha; varying float vS; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.25, 0.0, dot(c,c)); gl_FragColor = vec4(vec3(0.75,0.85,1.0) * a * uAlpha * (0.35 + 0.25 * vS), 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(g, this.starMat);
    this.stars.frustumCulled = false;
    this.group.add(this.stars);
  }

  /* the site: a hot point, survey rings spreading over the ground, and a short pin of light */
  buildSite() {
    const s = new THREE.Group();
    s.name = 'globe:site';
    s.position.copy(this.siteDir).multiplyScalar(1.0015);
    s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.siteDir);
    this.spin.add(s);
    this.siteDot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('255,240,225', '255,130,60'), color: new THREE.Color(2.4, 2.4, 2.4), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    this.siteDot.scale.setScalar(0.05);
    s.add(this.siteDot);
    const rg = new THREE.RingGeometry(0.96, 1, 96).rotateX(-Math.PI / 2);
    this.siteRings = [0, 1, 2].map(() => {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.8, 0.35), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      s.add(m); return m;
    });
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 1, 6, 1, true).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.1, 0.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    pin.scale.y = 0.09;
    this.pin = pin;
    s.add(pin);
    this.site = s;
  }

  /* a GNSS-like constellation: 6 planes × 4, inclined 55° (radius compressed for the frame) */
  buildSatellites() {
    this.sats = [];
    this.orbitR = 1.95;
    const tex = glowTex('235,250,255', '120,200,255');
    const orbitMat = new THREE.LineBasicMaterial({ color: new THREE.Color(0.25, 0.55, 0.9), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.orbitMat = orbitMat;
    this.orbits = new THREE.Group();
    this.spin.add(this.orbits);
    for (let p = 0; p < 6; p++) {
      const raan = (p / 6) * Math.PI * 2;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(55 * D2R, raan, 0, 'YXZ'));
      const pts = [];
      for (let i = 0; i <= 128; i++) { const a = (i / 128) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * this.orbitR, 0, Math.sin(a) * this.orbitR).applyQuaternion(q)); }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), orbitMat);
      line.frustumCulled = false;
      this.orbits.add(line);
      for (let k = 0; k < 4; k++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(1.8, 1.9, 2.2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false }));
        sp.scale.setScalar(0.06);
        this.spin.add(sp);
        this.sats.push({ sp, q, phase: (k / 4) * Math.PI * 2 + p * 0.37 });
      }
    }
    // ranging links: site → each satellite above its horizon
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.sats.length * 6), 3));
    lg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.sats.length * 6), 3));
    this.links = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.links.frustumCulled = false;
    this.spin.add(this.links);
  }

  /** Site position in world space (for HTML labels). */
  siteWorldPos(out = new THREE.Vector3()) { return this.site.getWorldPosition(out); }

  /**
   * @param {object} g  { on, reach, rings, flare, sats, links, alpha }
   * @param {number} clock seconds (continuous motion)
   */
  update(g, clock, pixel) {
    this.group.visible = g.on > 0;
    if (!this.group.visible) return;
    this.uniforms.uReach.value = g.reach;
    this.uniforms.uAlpha.value = g.alpha;
    this.starMat.uniforms.uAlpha.value = g.alpha;
    this.starMat.uniforms.uPixel.value = pixel;
    this.spin.rotation.y = -SITE.lon * D2R + g.drift;
    // site rings: survey pulses spreading over the ground
    this.siteRings.forEach((m, i) => {
      const ph = (clock * 0.28 + i / 3) % 1;
      const r = 0.012 + ph * 0.16;
      m.scale.set(r, 1, r);
      m.material.opacity = g.rings * (1 - ph) * 0.85;
    });
    this.siteDot.material.opacity = Math.min(1, g.rings * 2 + g.reach);
    // a brighter, larger marker for the moment the planet is revealed behind the departing drone
    this.siteDot.scale.setScalar(0.05 * (1 + 1.4 * (g.flare || 0)));
    this.pin.material.opacity = g.rings;
    // satellites
    this.orbitMat.opacity = 0.16 * g.sats;
    const pos = this.links.geometry.attributes.position, col = this.links.geometry.attributes.color;
    const site = this.siteDir.clone().multiplyScalar(1.0015);
    let k = 0;
    this.linked = 0;   // satellites drawn linked to the site (for the coverage card)
    this.linkedSat = null;
    for (const s of this.sats) {
      const a = s.phase + clock * 0.05;
      const p = new THREE.Vector3(Math.cos(a) * this.orbitR, 0, Math.sin(a) * this.orbitR).applyQuaternion(s.q);
      s.sp.position.copy(p);
      s.sp.material.opacity = g.sats;
      // visible from the site? (above its horizon, with a 10° mask)
      const elev = p.clone().sub(site).normalize().dot(this.siteDir);
      const vis = THREE.MathUtils.smoothstep(elev, 0.5, 0.68) * g.links;
      if (elev > 0.59) { this.linked++; if (!this.linkedSat || elev > this.linkedSat.elev) this.linkedSat = { sp: s.sp, elev }; }
      pos.setXYZ(k, site.x, site.y, site.z); pos.setXYZ(k + 1, p.x, p.y, p.z);
      col.setXYZ(k, 1.4 * vis, 0.75 * vis, 0.35 * vis); col.setXYZ(k + 1, 0.4 * vis, 0.75 * vis, 1.3 * vis);
      k += 2;
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  }
}
