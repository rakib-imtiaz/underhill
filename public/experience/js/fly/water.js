// Fly mode: the creek and the river it becomes down the valley. One ribbon along the centre line
// (2 m steps on the site, coarser out to 6 km), level across the middle and sloping under the banks at
// its edges, so the terrain itself draws the shoreline. A cheap water shader: the sky's colours by a
// Fresnel term, a slow normal wobble from the shared noise texture, a sun glint, and three's fog.
import * as THREE from 'three';
import { creekZ, waterLevel, waterHalfWidth, WORLD } from './terrain.js';

export class Water {
  constructor(scene, noiseTex) {
    const xs = [];
    for (let x = -WORLD; x < -400; x += 60) xs.push(x);
    for (let x = -400; x < -170; x += 10) xs.push(x);
    for (let x = -170; x <= 170; x += 2) xs.push(x);
    for (let x = 180; x <= 400; x += 10) xs.push(x);
    for (let x = 460; x <= WORLD; x += 60) xs.push(x);
    const across = [-1, -0.62, 0, 0.62, 1];
    const pos = [], uvs = [], idx = [];
    xs.forEach((x, i) => {
      // the centre line's direction (for a ribbon at right angles to it)
      const dz = (creekZ(x + 1) - creekZ(x - 1)) / 2, L = Math.hypot(1, dz);
      const nx = -dz / L, nz = 1 / L;
      const w = waterHalfWidth(x), y = waterLevel(x), zc = creekZ(x);
      for (const a of across) {
        const edge = Math.abs(a) > 0.99;
        pos.push(x + nx * w * a, y - (edge ? 0.7 : 0), zc + nz * w * a);
        uvs.push(a, x);
      }
      if (i > 0) {
        const r0 = (i - 1) * across.length, r1 = i * across.length;
        for (let k = 0; k < across.length - 1; k++) idx.push(r0 + k, r0 + k + 1, r1 + k, r0 + k + 1, r1 + k + 1, r1 + k);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uNoise: { value: null }, uTime: { value: 0 }, uSky: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uDeep: { value: new THREE.Color(0.012, 0.03, 0.032) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
      uLight: { value: 1 },
    }]);
    this.uniforms.uNoise.value = noiseTex;
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, fog: true,
      vertexShader: /* glsl */`
        #include <common>
        #include <fog_pars_vertex>
        varying vec3 vWp;
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0); vWp = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <common>
        #include <fog_pars_fragment>
        uniform sampler2D uNoise; uniform float uTime; uniform vec3 uSky; uniform vec3 uHorizon; uniform vec3 uDeep;
        uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uLight;
        varying vec3 vWp;
        void main(){
          vec2 p = vWp.xz;
          float a = texture2D(uNoise, p * 0.11 + vec2(uTime * 0.035, 0.0)).b - 0.5;
          float b = texture2D(uNoise, p * 0.043 - vec2(uTime * 0.02, uTime * 0.011)).g - 0.5;
          vec3 n = normalize(vec3(a * 0.32 + b * 0.2, 1.0, b * 0.32 - a * 0.12));
          vec3 v = normalize(cameraPosition - vWp);
          float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
          vec3 r = reflect(-v, n);
          vec3 sky = mix(uHorizon, uSky, smoothstep(0.0, 0.6, r.y));
          vec3 col = mix(uDeep * uLight, sky, fres);
          col += uSunCol * pow(max(dot(r, uSunDir), 0.0), 220.0) * 3.0;
          gl_FragColor = vec4(col, 1.0);
          #include <fog_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.name = 'fly:water';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  /** Light-only: the sky colours it reflects, the sun's glint, the water's own darkness. */
  setLook({ zenith, horizon, sunDir, sunCol, light }) {
    const u = this.uniforms;
    u.uSky.value.copy(zenith); u.uHorizon.value.copy(horizon);
    u.uSunDir.value.copy(sunDir); u.uSunCol.value.copy(sunCol); u.uLight.value = light;
  }

  update(t) { this.uniforms.uTime.value = t; }
}
