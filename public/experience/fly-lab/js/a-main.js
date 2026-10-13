// Scenario A: three.js (the vendored r170) + OpenStreetMap footprints extruded to 3D, from a static
// GeoJSON in fly-lab/data/. No key, no network at run time beyond this site.
import * as THREE from 'three';
import { startLab, PROBE } from './lab.js';
import { OsmCity } from './osm.js';
import { buildCity } from './a-city.js';
import { Sky, SUN_DAY, MOON, makeNoiseTexture } from './sky3.js';
import { makeDrone, poseDrone, droneEnv } from './drone3.js';
import { readLuma } from './util3.js';

const adapter = {
  id: 'A', title: 'three.js + OpenStreetMap buildings',
  engine: 'three.js r170 (our engine, vendored) · footprints and heights from OpenStreetMap, saved once to a static file',
  data: 'Data: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a> (ODbL), one Overpass bbox query on 2026-10-13, 908 buildings / parts. Heights: OSM <code>height</code>, else levels × 3.2 m.',
  chaseDist: 7,
  raycastNote: 'Mesh raycast (plain THREE.Raycaster, no BVH) against the extruded building meshes, roads and the guideway; trees left out. A BVH (three-mesh-bvh) would make it far faster. Collision uses the same footprints as 2.5D prisms.',

  async init({ host, lab }) {
    const canvas = document.createElement('canvas');
    canvas.className = 'lab-canvas';
    host.prepend(canvas);
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, PROBE ? 2 : 1.5));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.shadowMap.autoUpdate = false;
    this.gl = r.getContext();
    const scene = this.scene = new THREE.Scene();
    const cam = this.camera = new THREE.PerspectiveCamera(55, 1, 0.3, 12000);
    this.resize = () => { const w = host.clientWidth, h = host.clientHeight; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    this.resize(); addEventListener('resize', this.resize);

    const T = this.timing = { start: performance.now() };
    const [osm, drone] = await Promise.all([lab.osmP.then((c) => c || OsmCity.load()), makeDrone('balanced')]);
    T.dataAndDrone = performance.now() - T.start;
    this.osm = osm;
    const city = this.city = buildCity(osm, { shadows: true });
    scene.add(city.group);
    T.city = performance.now() - T.start - T.dataAndDrone;
    this.drone = drone; scene.add(drone.group);
    const noise = makeNoiseTexture();
    this.sky = new Sky(scene, noise);
    // a little large-scale variation in the open ground (lawns, lots, paving)
    const nd = noise.image.data, N = noise.image.width, gd = new Uint8Array(N * N * 4);
    for (let i = 0; i < N * N; i++) { const v = 200 + (nd[i * 4] - 128) * 0.45; gd[i * 4] = gd[i * 4 + 1] = gd[i * 4 + 2] = v; gd[i * 4 + 3] = 255; }
    const gTex = new THREE.DataTexture(gd, N, N); gTex.wrapS = gTex.wrapT = THREE.RepeatWrapping; gTex.repeat.set(40, 40);
    gTex.minFilter = THREE.LinearMipmapLinearFilter; gTex.generateMipmaps = true; gTex.needsUpdate = true;
    city.groundMat.map = gTex; city.groundMat.color.set(0x8f9a86); city.groundMat.needsUpdate = true;
    scene.fog = new THREE.FogExp2(0xaabbcc, 0.0003);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.8);
    this.sun.castShadow = true;
    const S = this.sun.shadow; S.mapSize.set(2048, 2048); S.camera.left = -520; S.camera.right = 520; S.camera.top = 520; S.camera.bottom = -520; S.camera.near = 10; S.camera.far = 2400; S.bias = -0.0004; S.normalBias = 0.6;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd5ee, 0x6b665c, 0.9);
    scene.add(this.hemi);
    this.env = { day: droneEnv(r, 1), night: droneEnv(r, 0) };
    this.raycaster = new THREE.Raycaster();
    this.rayTargets = city.group.children.filter((o) => ['building', 'ground'].includes(o.userData.kind) || o.name === 'lab:guideway');
    this.pix = null;
    this.setDaylight(1);
    return { mode: 'full', note: `${city.stats.buildings} buildings · ${Math.round(city.stats.tris / 1000)}k triangles · ${city.stats.trees} trees · ${city.stats.roads} road / path ways` };
  },

  setDrone(p) { this.clock = (this.clock || 0) + (p.dt || 1 / 60); poseDrone(this.drone, p, this.clock); this.sky.update(this.clock); },
  setCamera(c) {
    const cam = this.camera;
    cam.position.set(c.pos.x, c.pos.y, c.pos.z);
    cam.lookAt(c.target.x, c.target.y, c.target.z);
    if (cam.fov !== c.fov) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    this.sky.follow(cam);
  },
  render() { this.renderer.render(this.scene, this.camera); },
  sync() { const px = new Uint8Array(4); this.gl.readPixels(0, 0, 1, 1, this.gl.RGBA, this.gl.UNSIGNED_BYTE, px); },
  readLuma() { return readLuma(this.gl); },
  ground() { return 0; },
  probe(o, d, max) { const h = this.osm.raycast(o, d, max); return h ? h.dist : Infinity; },
  raycast(o, d, max) {
    const rc = this.raycaster; rc.set(new THREE.Vector3(o.x, o.y, o.z), new THREE.Vector3(d.x, d.y, d.z)); rc.far = max;
    const hits = rc.intersectObjects(this.rayTargets, false);
    if (!hits.length) return null;
    return { dist: hits[0].distance, kind: hits[0].object.userData.kind === 'building' ? 'building' : hits[0].object.userData.kind === 'ground' ? 'ground' : 'other' };
  },
  setDaylight(d) {
    const L = this.sky.apply(d, SUN_DAY);
    this.scene.fog.color.copy(L.horizon); this.scene.fog.density = L.density;
    const night = 1 - d;
    if (d > 0.5) { this.sun.position.copy(SUN_DAY).multiplyScalar(1200); this.sun.color.set(0xfff1dc); this.sun.intensity = 2.8; }
    else { this.sun.position.copy(MOON).multiplyScalar(1200); this.sun.color.set(0x9fb4e0); this.sun.intensity = 0.22; }
    this.hemi.color.set(d > 0.5 ? 0xbfd5ee : 0x2c3a58); this.hemi.groundColor.set(d > 0.5 ? 0x6b665c : 0x14110d); this.hemi.intensity = d > 0.5 ? 0.9 : 0.25;
    this.scene.environment = d > 0.5 ? this.env.day : this.env.night;
    this.scene.environmentIntensity = d > 0.5 ? 0.55 : 0.4;
    this.city.bMat.userData.uniforms.uNight.value = night;
    this.city.roadMat.emissive.set(0x2a1d0e).multiplyScalar(night * 1.0);
    this.city.groundMat.emissive.set(0x0d0a07).multiplyScalar(night);
    this.renderer.toneMappingExposure = d > 0.5 ? 1.0 : 1.35;
    this.renderer.shadowMap.needsUpdate = true;
    return { support: 'full', note: 'Our own sky, sun / moon, fog and exposure; lit windows (random per floor and column), a warm street glow on the roads, the drone\'s nav lights and strobe.' };
  },
  attribution() { return { el: document.getElementById('attrib'), required: ['© OpenStreetMap contributors'], note: 'OSM (ODbL) asks for “© OpenStreetMap contributors” with a link to the copyright page, visible on the map.' }; },
};

startLab(adapter);
