// Fly mode: the sky and the distance. Replaces the film's sky dome and its flat ridgelines (which read
// as a black wall from altitude).
//
//   dome    zenith → horizon gradient, sun disc + glow (day), cheap moving clouds from the shared noise
//           texture, stars, a moon and a faint twilight glow in the west (night)
//   ridges  two rings of far mountains at 7.2 and 8.6 km, shaded with the same atmospheric haze the
//           scene's FogExp2 gives the terrain at that distance (never black: deep blue at night, with a
//           thin rim of sky light along their crests)
//   colours one function gives the zenith / horizon / ground colours, the sun and moon directions and
//           the fog density for a daylight value d (0 night … 1 day); the fog colour is always the
//           horizon colour, so terrain fades into the sky with no seam
// Everything is uniforms: switching day and night compiles nothing.
import * as THREE from 'three';
import { fbm } from './terrain.js';

const lin = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
const NIGHT = { zenith: lin(0.006, 0.012, 0.036), horizon: lin(0.04, 0.058, 0.1), ground: lin(0.02, 0.026, 0.038), density: 0.00021 };
const DAY = { zenith: lin(0.1, 0.24, 0.6), horizon: lin(0.56, 0.68, 0.8), ground: lin(0.36, 0.4, 0.42), density: 0.00017 };
export const SUN_DAY = new THREE.Vector3(-0.42, 0.74, -0.52).normalize();
export const MOON = new THREE.Vector3(0.45, 0.42, -0.79).normalize();
const RINGS = [{ R: 7200, base: 380, amp: 820, seed: 2.3 }, { R: 8600, base: 520, amp: 1050, seed: 5.9 }];

/** The sky's look for daylight d: colours (linear), fog density, sun / moon. */
export function skyLook(d, out = {}) {
  out.zenith = (out.zenith || new THREE.Color()).copy(NIGHT.zenith).lerp(DAY.zenith, d);
  out.horizon = (out.horizon || new THREE.Color()).copy(NIGHT.horizon).lerp(DAY.horizon, d);
  out.ground = (out.ground || new THREE.Color()).copy(NIGHT.ground).lerp(DAY.ground, d);
  out.density = NIGHT.density + (DAY.density - NIGHT.density) * d;
  return out;
}

export class Sky {
  constructor(scene, noiseTex) {
    this.uniforms = {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
      uSun: { value: SUN_DAY.clone() }, uMoon: { value: MOON.clone() }, uDay: { value: 0 }, uTime: { value: 0 },
      uNoise: { value: noiseTex }, uCloud: { value: 1 }, uAmount: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: /* glsl */`
        uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSun; uniform vec3 uMoon;
        uniform float uDay; uniform float uTime; uniform float uCloud; uniform float uAmount; uniform sampler2D uNoise;
        varying vec3 vD;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }
        void main(){
          vec3 d = normalize(vD); float y = d.y;
          vec3 c = mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.9, y), 0.55));
          c = mix(uGround, c, smoothstep(-0.08, 0.0, y));
          float night = 1.0 - uDay;
          // the sun: a white disc, a soft glow round it, warmer near the horizon
          float sd = max(dot(d, uSun), 0.0);
          c += vec3(1.0, 0.92, 0.8) * (pow(sd, 6.0) * 0.16 + pow(sd, 90.0) * 0.6 + smoothstep(0.99955, 0.9997, sd) * 40.0) * uDay;
          // night: a faint glow left in the west, the moon (disc + halo), stars above the haze
          vec3 hz = normalize(vec3(d.x, 0.0, d.z));
          float wv = max(dot(hz, normalize(vec3(-0.85, 0.0, -0.4))), 0.0);
          c += vec3(0.05, 0.085, 0.1) * pow(wv, 5.0) * exp(-max(y, 0.0) * 7.0) * night;
          float md = dot(d, uMoon);
          c += vec3(0.85, 0.88, 0.95) * (smoothstep(0.99975, 0.99984, md) * 6.0 + pow(max(md, 0.0), 260.0) * 0.18 + pow(max(md, 0.0), 12.0) * 0.012) * night;
          float st = 0.0;
          if (night > 0.01 && y > 0.12) {
            vec2 g = floor(vec2(atan(d.z, d.x) * 420.0, asin(clamp(y, -1.0, 1.0)) * 420.0));
            st = step(0.9968, h21(g)) * smoothstep(0.12, 0.5, y) * (0.35 + 0.65 * h21(g + 7.0));
          }
          // clouds: two octaves of the noise projected on a high layer, drifting
          float cov = 0.0, shade = 0.0;
          if (y > 0.0) {
            vec2 cu = d.xz / (y + 0.1) * 0.32 + vec2(uTime * 0.0045, uTime * 0.0017);
            float n = texture2D(uNoise, cu * 0.16).r * 0.62 + texture2D(uNoise, cu * 0.63 + 0.37).g * 0.38;
            cov = smoothstep(0.53, 0.8, n) * smoothstep(0.0, 0.22, y) * uCloud;
            shade = n;
          }
          c += vec3(0.75, 0.85, 1.0) * st * 0.55 * night * (1.0 - cov);
          vec3 cday = vec3(1.0, 0.99, 0.97) * (0.95 + 0.35 * (shade - 0.6)) + vec3(1.0, 0.85, 0.6) * pow(sd, 4.0) * 0.25;
          vec3 cnight = vec3(0.045, 0.055, 0.08) + vec3(0.06, 0.065, 0.075) * pow(max(md, 0.0), 6.0);
          c = mix(c, mix(cnight, cday, uDay), cov * mix(0.7, 0.85, uDay));
          gl_FragColor = vec4(c * uAmount, 1.0);
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    this.dome.name = 'fly:sky';
    scene.add(this.dome);

    // the far ridgelines
    this.ridgeU = RINGS.map(() => ({ uCol: { value: new THREE.Color() }, uRim: { value: new THREE.Color() } }));
    this.ridges = RINGS.map((rg, k) => {
      const n = 320, pos = [], hf = [], idx = [];
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const t = 0.5 + 0.5 * fbm(ca * 2.4 + rg.seed, sa * 2.4 - rg.seed, 5);
        const peaks = Math.pow(0.5 + 0.5 * fbm(ca * 7 + rg.seed * 2, sa * 7, 3), 2);
        const top = rg.base + rg.amp * (0.55 * t + 0.45 * peaks);
        pos.push(ca * rg.R, -300, sa * rg.R, ca * rg.R, top, sa * rg.R);
        hf.push(0, 1);
        if (i < n) { const q = i * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aTop', new THREE.Float32BufferAttribute(hf, 1));
      g.setIndex(idx);
      const m = new THREE.ShaderMaterial({
        uniforms: this.ridgeU[k], side: THREE.DoubleSide, fog: false,
        vertexShader: 'attribute float aTop; varying float vT; void main(){ vT = aTop; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 uCol; uniform vec3 uRim; varying float vT; void main(){ float rim = smoothstep(0.86, 1.0, vT); gl_FragColor = vec4(uCol + uRim * rim * rim, 1.0); }',
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.frustumCulled = false;
      mesh.renderOrder = -5;
      mesh.name = `fly:ridges-${k}`;
      scene.add(mesh);
      return mesh;
    });
    this.look = {};
  }

  /** Light-only: daylight d, the sun's direction (day). Returns the look (fog colour = horizon). */
  apply(d, sunDir) {
    const L = skyLook(d, this.look), u = this.uniforms;
    u.uZenith.value.copy(L.zenith); u.uHorizon.value.copy(L.horizon); u.uGround.value.copy(L.ground);
    u.uDay.value = d; u.uSun.value.copy(sunDir);
    // the ridges carry the haze the terrain's fog would give at their distance, over a lit / dark tint
    const tint = lin(0.05, 0.07, 0.1).lerp(lin(0.17, 0.22, 0.3), d);
    RINGS.forEach((rg, k) => {
      const haze = 1 - Math.exp(-Math.pow(L.density * rg.R * 0.82, 2));
      this.ridgeU[k].uCol.value.copy(tint).lerp(L.horizon, haze);
      this.ridgeU[k].uRim.value.copy(L.horizon).multiplyScalar(0.16 * (1 - d) + 0.04 * d);
    });
    return L;
  }

  update(t) { this.uniforms.uTime.value = t; }
}
