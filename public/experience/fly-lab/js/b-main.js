// Scenario B: Google Photorealistic 3D Tiles in three.js through the vendored 3d-tiles-renderer
// (NASA-AMMOS, v0.4.9, the same copy fly mode's real-world switch uses). Needs the reader's own Google
// Maps Platform key with the Map Tiles API; it is kept only in this browser's localStorage.
//
// The tileset is re-centred on the lab origin with ReorientationPlugin (+Y up, +Z north, +X west) and
// turned 180 deg about +Y so it matches the lab frame (+X east, -Z north), as js/fly/realworld.js does;
// then lowered so the ground at the take-off pad is y = 0.
import * as THREE from 'three';
import { startLab, PROBE } from './lab.js';
import { PLACE, PAD } from './geo.js';
import { Sky, SUN_DAY, MOON, makeNoiseTexture } from './sky3.js';
import { makeDrone, poseDrone, droneEnv } from './drone3.js';
import { readLuma } from './util3.js';

const DEG = Math.PI / 180;
const STORE = 'flylab:key:google';

const adapter = {
  id: 'B', title: 'Google Photorealistic 3D Tiles in three.js',
  engine: 'three.js r170 + 3d-tiles-renderer 0.4.9 (vendored, as fly mode) · Google Map Tiles API, photogrammetry mesh streamed per view',
  data: 'Data: Google Photorealistic 3D Tiles (Map Tiles API). Google requires its logo and the data providers of the tiles in view on screen; the lab shows the provider list from the tiles and a text “Google” mark (production needs Google\'s logo image).',
  needsKey: {
    store: STORE, label: 'Your Google Maps Platform API key', placeholder: 'AIza…',
    help: 'Where: <a href="https://console.cloud.google.com/google/maps-apis/api-list" target="_blank" rel="noopener">Google Cloud console</a> → enable <b>Map Tiles API</b> → Credentials → Create API key; restrict it to the Map Tiles API and the referrer <code>http://127.0.0.1:5180/*</code>. A billing account is required. Cost: billed per 3D-tiles session (root request) after a monthly free allowance; check Google\'s current Map Tiles pricing. The key stays in this browser only (localStorage), never in the files.',
  },
  chaseDist: 7,
  raycastNote: 'Mesh raycast against the streamed photogrammetry (three.js Raycaster, first hit). The Google mesh carries no building / ground labels: a hit counts as “building” when it is more than 3 m above the pad and on a steep surface.',

  async init({ host, key, lab }) {
    const canvas = document.createElement('canvas');
    canvas.className = 'lab-canvas'; host.prepend(canvas); this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, PROBE ? 2 : 1.5));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
    this.gl = r.getContext();
    const scene = this.scene = new THREE.Scene();
    const cam = this.camera = new THREE.PerspectiveCamera(55, 1, 0.3, 12000);
    this.resize = () => { const w = host.clientWidth, h = host.clientHeight; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    this.resize(); addEventListener('resize', this.resize);
    this.drone = await makeDrone('balanced'); scene.add(this.drone.group);
    this.sky = new Sky(scene, makeNoiseTexture(), { ridges: !key });
    scene.fog = new THREE.FogExp2(0xaabbcc, 0.00012);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.6); scene.add(this.sun);
    this.hemi = new THREE.HemisphereLight(0xbfd5ee, 0x6b665c, 0.9); scene.add(this.hemi);
    this.env = { day: droneEnv(r, 1), night: droneEnv(r, 0) };
    this.raycaster = new THREE.Raycaster(); this.raycaster.firstHitOnly = true;
    this.cache = new Map();
    this.mats = new Set();
    this.attribEl = document.getElementById('attrib');
    this.key = key;

    if (!key || PROBE) {
      // no key (or the 390 px probe copy): the drone over a plain survey grid, so the page still works
      const grid = new THREE.GridHelper(2000, 100, 0x3b5a78, 0x22384d); grid.position.y = 0; scene.add(grid);
      const pad = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.5, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0082ca })); pad.position.set(PAD.x, 0.02, PAD.z); scene.add(pad);
      this.attribEl.innerHTML = key ? '<span class="g-logo">Google</span><span>(probe copy: no tiles)</span>' : '<span>No Google tiles loaded: paste a key to see them</span>';
      this.setDaylight(1);
      return { mode: key ? 'full' : 'nokey', note: key ? 'Probe copy: tiles skipped.' : 'No key: drone, controls and engine only. Paste a Google Maps Platform key in the box above to load the city.' };
    }

    const [{ TilesRenderer }, P, { DRACOLoader }] = await Promise.all([
      import('3d-tiles-renderer'), import('3d-tiles-renderer/plugins'), import('three/addons/loaders/DRACOLoader.js'),
    ]);
    const tiles = this.tiles = new TilesRenderer();
    tiles.registerPlugin(new P.GoogleCloudAuthPlugin({ apiToken: key, autoRefreshToken: true }));
    tiles.registerPlugin(new P.TileCompressionPlugin());
    tiles.registerPlugin(new P.UnloadTilesPlugin());
    const draco = new DRACOLoader().setDecoderPath('../vendor/three/examples/jsm/libs/draco/gltf/');
    draco.setDecoderConfig({ type: 'wasm' });
    tiles.registerPlugin(new P.GLTFExtensionsPlugin({ dracoLoader: draco }));
    tiles.registerPlugin(new P.ReorientationPlugin({ lat: PLACE.lat * DEG, lon: PLACE.lon * DEG, height: 0, recenter: true }));
    this.errors = [];
    tiles.addEventListener('load-error', (e) => { const m = e.error?.message || 'load error'; this.errors.push(m); if (this.errors.length < 3) lab.toast('Google tiles: ' + m + ' (check the key and that the Map Tiles API is enabled)', 6000); });
    tiles.addEventListener('load-model', ({ scene: s }) => {
      s.traverse((o) => { if (o.material) { this.mats.add(o.material); this.tintOne(o.material); } });
    });
    tiles.setCamera(cam); tiles.setResolutionFromRenderer(cam, r);
    this.holder = new THREE.Group(); this.holder.name = 'lab:tiles'; this.holder.rotation.y = Math.PI;
    this.holder.add(tiles.group); scene.add(this.holder);
    this.setDaylight(1);
    // content: the first ground under the pad; then the pad's ground becomes y = 0
    this.contentReady = new Promise((resolve) => {
      const t0 = performance.now();
      const poll = () => {
        const y = this.sampleRaw(PAD.x, PAD.z);
        if (y !== null) { this.h0 = y; this.holder.position.y = -y; this.holder.updateMatrixWorld(true); this.cache.clear(); resolve(); return; }
        if (performance.now() - t0 > 40000) { resolve(); return; }
        setTimeout(poll, 150);
      };
      poll();
    });
    this.settled = () => new Promise((res) => { const t0 = performance.now(); const p = () => (tiles.loadProgress >= 1 || performance.now() - t0 > 30000 ? res(tiles.loadProgress) : setTimeout(p, 250)); p(); });
    return { mode: 'full', note: 'Google Photorealistic 3D Tiles · key from this browser' };
  },

  tintOne(m) { const k = this.night ? 0.16 : 1; if (m.color) { if (!m.userData.c0) m.userData.c0 = m.color.clone(); m.color.copy(m.userData.c0).multiply(new THREE.Color(k, k * 1.06, k * 1.45)); } },

  sampleRaw(x, z) {
    if (!this.tiles) return null;
    this.holder.updateMatrixWorld(true);
    this.raycaster.set(new THREE.Vector3(x, 9000, z), new THREE.Vector3(0, -1, 0)); this.raycaster.far = 20000;
    const h = this.raycaster.intersectObject(this.tiles.group, true);
    return h.length ? h[0].point.y : null;
  },
  ground(x, z) {
    if (!this.tiles || this.h0 === undefined) return 0;
    const k = `${Math.round(x / 2)},${Math.round(z / 2)}`, now = performance.now(), c = this.cache.get(k);
    if (c && now - c.t < 3000) return c.y;
    const y = this.sampleRaw(Math.round(x / 2) * 2, Math.round(z / 2) * 2);
    const v = y === null ? (c ? c.y : 0) : y;
    this.cache.set(k, { y: v, t: now }); if (this.cache.size > 20000) this.cache.clear();
    return v;
  },
  setDrone(p) { this.clock = (this.clock || 0) + (p.dt || 1 / 60); poseDrone(this.drone, p, this.clock); this.sky.update(this.clock); },
  setCamera(c) {
    const cam = this.camera; cam.position.set(c.pos.x, c.pos.y, c.pos.z); cam.lookAt(c.target.x, c.target.y, c.target.z);
    if (cam.fov !== c.fov) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld(); this.sky.follow(cam);
  },
  render() {
    if (this.tiles) {
      this.tiles.setResolutionFromRenderer(this.camera, this.renderer);
      this.holder.updateMatrixWorld(true);
      this.tiles.update();
      const now = performance.now();
      if (!this.attribAt || now - this.attribAt > 1000) {
        this.attribAt = now;
        const list = this.tiles.getAttributions ? this.tiles.getAttributions() : [];
        const text = list.filter((a) => a.type === 'string').map((a) => a.value).join(' · ');
        this.attribEl.innerHTML = `<span class="g-logo">Google</span><span>${text.replace(/[<>&]/g, '') || 'Map data ©Google'}</span>`;
      }
    }
    this.renderer.render(this.scene, this.camera);
  },
  sync() { const px = new Uint8Array(4); this.gl.readPixels(0, 0, 1, 1, this.gl.RGBA, this.gl.UNSIGNED_BYTE, px); },
  readLuma() { return readLuma(this.gl); },
  probe(o, d, max) {
    if (!this.tiles) return Infinity;
    this.raycaster.set(new THREE.Vector3(o.x, o.y, o.z), new THREE.Vector3(d.x, d.y, d.z)); this.raycaster.far = max;
    const h = this.raycaster.intersectObject(this.tiles.group, true);
    return h.length ? h[0].distance : Infinity;
  },
  raycast(o, d, max) {
    if (!this.tiles) return null;
    this.raycaster.set(new THREE.Vector3(o.x, o.y, o.z), new THREE.Vector3(d.x, d.y, d.z)); this.raycaster.far = max;
    const h = this.raycaster.intersectObject(this.tiles.group, true)[0];
    if (!h) return null;
    const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
    const building = h.point.y > 3 && Math.abs(n.y) < 0.6;
    return { dist: h.distance, kind: building ? 'building' : 'ground' };
  },
  setDaylight(d) {
    const L = this.sky.apply(d, SUN_DAY);
    this.scene.fog.color.copy(L.horizon); this.scene.fog.density = this.tiles ? L.density * 0.45 : L.density;
    this.night = d < 0.5;
    if (!this.night) { this.sun.position.copy(SUN_DAY); this.sun.intensity = 2.6; this.hemi.intensity = 0.9; }
    else { this.sun.position.copy(MOON); this.sun.intensity = 0.25; this.hemi.intensity = 0.2; }
    this.scene.environment = this.night ? this.env.night : this.env.day;
    for (const m of this.mats) this.tintOne(m);
    this.renderer.toneMappingExposure = this.night ? 1.3 : 1.0;
    return { support: 'partial', note: 'The tiles are photographs with daylight and shadows baked in: night is only a blue tint over them (no lit windows, no street lights, shadows stay). Sky, fog and the drone\'s lights do change.' };
  },
  attribution() {
    const ok = !!this.tiles;
    return { el: this.attribEl, required: ok ? ['Google'] : [], status: ok ? undefined : 'blocked', partialOnly: ok, note: ok ? 'Map Tiles API terms: Google\'s logo plus the data providers of the tiles on screen. The lab shows the providers and a text “Google” mark: production needs the official logo image, so at best partial.' : 'Nothing to attribute until Google tiles are loaded (needs a key).' };
  },
  sizeCategory(u) {
    const url = new URL(u, location.href);
    if (url.hostname.endsWith('googleapis.com')) return 'Google tiles';
    if (url.pathname.endsWith('metrotown-osm.geojson')) return null; // the lab's reference data, not this scenario's
    return undefined;
  },
};

startLab(adapter);
