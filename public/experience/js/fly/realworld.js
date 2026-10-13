// Fly mode: the real world. Google Photorealistic 3D Tiles over a real Underhill site, through the
// vendored 3d-tiles-renderer (NASA-AMMOS, v0.4.9, built against three r170). Loaded only when
// js/fly/config.js has a GOOGLE_MAPS_KEY and the reader flips "World" to the real site; without a key
// this file and the library are never fetched.
//
// The tileset is re-centred on the site with the plugin's east-north-up frame (ReorientationPlugin:
// +Y up, +Z north, +X west at the given latitude / longitude), then turned 180° about +Y so the scene
// keeps its own axes (+X east, −Z north). The same drone, controls and HUD fly over it; the ground
// comes from cached vertical raycasts against the tiles; LiDAR and the map stay on the built-in site.
// Google's attribution (their logo text and the data providers of the tiles in view) is shown while
// the tiles are on screen, as the Map Tiles API terms require.
import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import { GoogleCloudAuthPlugin, GLTFExtensionsPlugin, TileCompressionPlugin, UnloadTilesPlugin, ReorientationPlugin } from '3d-tiles-renderer/plugins';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { latLonToUtm } from './geo.js';
import { ground as siteGround } from './query.js';
import { HOME } from './world.js';

const DEG = Math.PI / 180;
const A = 6378137, E2 = 0.00669437999014;

export class RealWorld {
  constructor({ renderer, scene, world, sim, lidar, key, site, attribEl, onToast = () => {} }) {
    Object.assign(this, { renderer, scene, world, sim, lidar, key, site, attribEl, onToast });
    this.cache = new Map();
    this.ray = new THREE.Raycaster();
    this.ray.firstHitOnly = true;
    this.down = new THREE.Vector3(0, -1, 0);
    this.attribAt = 0;
    this.saved = null;
  }

  async enter() {
    const { world, scene, sim, lidar } = this;
    // the built-in site goes (its two lights stay: the light set, and every compiled program, holds)
    this.hidden = [];
    for (const o of [...world.field.group.children, ...world.group.children, world.prism.target, world.prism.group]) {
      if (o.isLight || o === world.sun.target) continue;
      if (o.visible) { o.visible = false; this.hidden.push(o); }
    }
    lidar.on = false; lidar.points.visible = false; lidar.fan.visible = false;
    this.saved = { fogNear: scene.fog.near, fogFar: scene.fog.far, query: sim.query, ground: sim.ground };
    scene.fog.near = 600; scene.fog.far = 6000;

    const tiles = this.tiles = new TilesRenderer();
    tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: this.key, autoRefreshToken: true }));
    tiles.registerPlugin(new TileCompressionPlugin());
    tiles.registerPlugin(new UnloadTilesPlugin());
    const draco = new DRACOLoader().setDecoderPath('./vendor/three/examples/jsm/libs/draco/gltf/');
    draco.setDecoderConfig({ type: 'wasm' });
    tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: draco }));
    tiles.registerPlugin(new ReorientationPlugin({ lat: this.site.lat * DEG, lon: this.site.lon * DEG, height: 0, recenter: true }));
    tiles.addEventListener('load-error', (e) => this.onToast(`Tiles: ${e.error?.message || 'load error'} (check the key and the Map Tiles API)`));
    this.holder = new THREE.Group();
    this.holder.name = 'real:tiles';
    this.holder.rotation.y = Math.PI;
    this.holder.add(tiles.group);
    scene.add(this.holder);
    this.onToast(`Loading Google Photorealistic 3D Tiles · ${this.site.name}`);

    // the flight model now reads the tiles' ground
    sim.query = null;
    sim.ground = (x, z) => this.groundAt(x, z);
    // wait (up to 15 s) for ground under the take-off point, then put the drone on it
    const t0 = performance.now();
    while (performance.now() - t0 < 15000) {
      this.update(null);
      const g = this.sample(0, 0);
      if (g !== null) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    const g0 = this.groundAt(0, 0);
    sim.homePad.set(0, g0, 0);
    sim.reset();
    sim.startPreflight();
  }

  /** A cached vertical raycast (2 m cells, refreshed every 3 s as finer tiles stream in). */
  groundAt(x, z) {
    const k = `${Math.round(x / 2)},${Math.round(z / 2)}`;
    const now = performance.now();
    const c = this.cache.get(k);
    if (c && now - c.t < 3000) return c.y;
    const y = this.sample(Math.round(x / 2) * 2, Math.round(z / 2) * 2);
    const v = y === null ? (c ? c.y : 0) : y;
    this.cache.set(k, { y: v, t: now });
    if (this.cache.size > 20000) this.cache.clear();
    return v;
  }

  sample(x, z) {
    if (!this.tiles) return null;
    this.ray.set(new THREE.Vector3(x, 9000, z), this.down);
    const hits = this.ray.intersectObject(this.tiles.group, true);
    return hits.length ? hits[0].point.y : null;
  }

  /** Per frame (camera may be null during loading). */
  update(camera) {
    const t = this.tiles; if (!t) return;
    if (camera) {
      if (!this.cams?.has(camera)) { (this.cams ||= new Set()).add(camera); t.setCamera(camera); camera.far = Math.max(camera.far, 8000); camera.updateProjectionMatrix(); }
      t.setResolutionFromRenderer(camera, this.renderer);
      camera.updateMatrixWorld();
    }
    this.holder.updateMatrixWorld(true);
    t.update();
    const now = performance.now();
    if (now - this.attribAt > 1000 && this.attribEl) {
      this.attribAt = now;
      const list = t.getAttributions ? t.getAttributions() : [];
      const text = list.filter((a) => a.type === 'string').map((a) => a.value).join(' · ');
      this.attribEl.hidden = false;
      this.attribEl.innerHTML = `<b class="attrib__g">Google</b><span>${text.replace(/[<>&]/g, '') || 'Map data ©Google'}</span>`;
    }
  }

  /** HUD position: the local tangent plane back to latitude / longitude, then the site's UTM zone. */
  hudPosition(p) {
    const lat0 = this.site.lat * DEG;
    const s = Math.sin(lat0);
    const Rn = A / Math.sqrt(1 - E2 * s * s), Rm = A * (1 - E2) / Math.pow(1 - E2 * s * s, 1.5);
    const lat = this.site.lat + (-p.z / Rm) / DEG;
    const lon = this.site.lon + (p.x / (Rn * Math.cos(lat0))) / DEG;
    const u = latLonToUtm(lat, lon, this.site.zone);
    return { lat, lon, E: u.E, N: u.N, zone: this.site.zone };
  }

  /** Orthometric height for the HUD: the tiles are ellipsoidal (h); H = h − N. */
  elevation(y) { return y - this.site.geoid; }

  exit() {
    const { scene, sim, lidar } = this;
    if (this.tiles) { this.holder.removeFromParent(); this.tiles.dispose(); this.tiles = null; }
    for (const o of this.hidden) o.visible = true;
    lidar.points.visible = true;
    scene.fog.near = this.saved.fogNear; scene.fog.far = this.saved.fogFar;
    sim.query = this.saved.query;
    sim.ground = this.saved.ground || siteGround;
    if (this.attribEl) this.attribEl.hidden = true;
    sim.homePad.copy(HOME);
    sim.reset();
    sim.startPreflight();
  }
}
