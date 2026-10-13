// Scenario D: CesiumJS 1.145 (Apache-2.0, from jsDelivr) with Cesium OSM Buildings (ion asset 96188) and
// Cesium World Terrain (ion asset 1), streamed from Cesium ion with the reader's own access token.
// Without a token the page runs Cesium on a plain globe with our local OSM extract extruded as Cesium
// polygons ("fallback"), so the engine-side tests (frame time, picking, lighting, layout) still run;
// those results are labelled as fallback. Cesium's built-in default ion token is cleared on purpose:
// the lab never uses a key the reader did not paste.
//
// The drone: our three.js model, exported to glTF (GLB) in the page with three's GLTFExporter and
// loaded as a Cesium Model. Its rotors do not spin (a static export).
import * as THREE from 'three';
import { startLab, PROBE } from './lab.js';
import { PLACE, toLonLat } from './geo.js';
import { makeDrone, poseDrone } from './drone3.js';
import { readLuma, gpuSync } from './util3.js';

const C = window.Cesium;
const STORE = 'flylab:key:cesium';
const DEG = Math.PI / 180;

const adapter = {
  id: 'D', title: 'CesiumJS + OSM Buildings + World Terrain',
  engine: 'CesiumJS 1.145.0 (jsDelivr) · Cesium ion: OSM Buildings (asset 96188), World Terrain (asset 1), Bing imagery (asset 2) · our drone exported to glTF',
  data: 'Data (with a token): Cesium OSM Buildings (© OpenStreetMap contributors, via Cesium ion), Cesium World Terrain, Bing Maps imagery. Fallback without a token: our local OSM extract (© OpenStreetMap contributors).',
  needsKey: {
    store: STORE, label: 'Your Cesium ion access token', placeholder: 'eyJhbGciOi…',
    help: 'Where: sign up at <a href="https://ion.cesium.com/signup" target="_blank" rel="noopener">ion.cesium.com</a> → Access Tokens → copy the Default token (it can read Cesium World Terrain and Cesium OSM Buildings). The free Community plan is for personal, non-commercial and evaluation use, with monthly streaming limits; a public company site needs a paid commercial plan (check Cesium\'s pricing). The token stays in this browser only (localStorage), never in the files.',
  },
  chaseDist: 7,
  raycastNote: 'Cesium scene.pickFromRay() per ray (it renders a small pick pass for each ray, so it is slow); it hits whatever Cesium draws (3D Tiles, primitives).',

  async init({ host, key, lab }) {
    if (!C) throw new Error('CesiumJS did not load (CDN blocked?)');
    C.Ion.defaultAccessToken = key || ''; // never Cesium's built-in evaluation token
    const div = document.createElement('div'); div.className = 'lab-canvas lab-cesium'; host.prepend(div);
    const real = !!key && !PROBE;
    this.real = real;
    const terrain = real ? C.Terrain.fromWorldTerrain() : undefined;
    const viewer = this.viewer = new C.Viewer(div, {
      baseLayer: real ? undefined : false,
      terrain,
      animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
      navigationHelpButton: false, fullscreenButton: false, infoBox: false, selectionIndicator: false,
      useDefaultRenderLoop: false, msaaSamples: 4, shadows: false,
    });
    const scene = this.scene = viewer.scene;
    scene.screenSpaceCameraController.enableInputs = false;
    scene.globe.baseColor = C.Color.fromCssColorString('#7d8578');
    scene.globe.enableLighting = true;
    scene.globe.depthTestAgainstTerrain = true;
    scene.fog.enabled = true;
    this.canvas = scene.canvas;
    this.gl = scene.context._gl;
    this.attribEl = viewer.creditDisplay.container || div.querySelector('.cesium-widget-credits');
    const resize = () => viewer.resize(); addEventListener('resize', resize); resize();
    this.setDaylight(1);

    // the take-off pad's ground height (terrain), then the lab frame
    this.h0 = 0;
    if (real) {
      try {
        const provider = await new Promise((res, rej) => { terrain.readyEvent.addEventListener(res); terrain.errorEvent.addEventListener(rej); });
        const [c] = await C.sampleTerrainMostDetailed(provider, [C.Cartographic.fromDegrees(PLACE.lon, PLACE.lat)]);
        if (c && isFinite(c.height)) this.h0 = c.height;
      } catch (e) { lab.toast('Cesium terrain: ' + (e.message || e), 6000); }
    }
    this.frame = C.Transforms.eastNorthUpToFixedFrame(C.Cartesian3.fromDegrees(PLACE.lon, PLACE.lat, this.h0));

    // buildings
    if (real) {
      try {
        const tiles = this.tileset = await C.createOsmBuildingsAsync();
        scene.primitives.add(tiles);
        this.contentReady = new Promise((res) => { const t = setTimeout(res, 45000); tiles.initialTilesLoaded.addEventListener(() => { clearTimeout(t); res(); }); });
      } catch (e) { lab.toast('Cesium OSM Buildings: ' + (e.message || e) + ' (check the token)', 8000); }
    } else if (!PROBE) {
      const osm = await lab.osmP;
      this.prim = this.fallbackBuildings(osm);
      this.contentReady = new Promise((res) => { const t0 = performance.now(); const p = () => (this.prim.ready || performance.now() - t0 > 30000 ? res() : setTimeout(p, 100)); p(); });
      try { viewer.creditDisplay.addStaticCredit(new C.Credit('© OpenStreetMap contributors', true)); } catch { try { viewer.creditDisplay.addDefaultCredit(new C.Credit('© OpenStreetMap contributors', true)); } catch { /* ignore */ } }
    } else {
      try { viewer.creditDisplay.addStaticCredit(new C.Credit('© OpenStreetMap contributors', true)); } catch { /* ignore */ }
    }

    // the drone: exported from three.js to glTF in the background (it does not hold up the first frame)
    this.droneNote = 'drone: exporting to glTF…';
    this.droneReady = this.exportDrone(scene).then(() => { const m = document.getElementById('lab-mode'); if (m) m.textContent = m.textContent.replace(/drone: exporting to glTF…/, this.droneNote); });
    this.B = new C.Matrix4(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1); // lab (x, y up, z south) -> ENU (x, -z, y)
    this.Binv = C.Matrix4.inverse(this.B, new C.Matrix4());
    this.tmpM = new THREE.Matrix4();
    this.cache = new Map();
    const mode = real ? 'full' : 'fallback';
    return {
      mode, testNote: real ? '' : 'FALLBACK (no token): Cesium engine with our OSM extract, not Cesium OSM Buildings / World Terrain.',
      note: (real ? 'Cesium ion: OSM Buildings + World Terrain' : PROBE ? 'Probe copy' : 'No token: Cesium on a plain globe with our local OSM extrusions (fallback)') + ' · ' + this.droneNote,
    };
  },

  async exportDrone(scene) {
    const t0 = performance.now();
    try {
      const { GLTFExporter } = await import('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/exporters/GLTFExporter.js');
      const d = await makeDrone('balanced');
      poseDrone(d, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, rotor: 0, dt: 0.016, day: 1 }, 0);
      d.group.position.set(0, 0, 0); d.group.rotation.set(0, 0, 0); d.group.updateMatrixWorld(true);
      // the exporter cannot draw DataTextures: hand it canvases with the same pixels
      const conv = new Map();
      d.group.traverse((o) => {
        if (!o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { for (const k of ['map', 'roughnessMap', 'metalnessMap', 'normalMap', 'bumpMap', 'emissiveMap', 'aoMap', 'alphaMap']) { const t = m[k]; if (t?.isDataTexture) { if (!conv.has(t)) conv.set(t, dataToCanvasTexture(t)); m[k] = conv.get(t); } } });
      });
      const glb = await new GLTFExporter().parseAsync(d.group, { binary: true, onlyVisible: true });
      this.glbBytes = glb.byteLength;
      const url = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
      this.model = await C.Model.fromGltfAsync({ url, upAxis: C.Axis.Y, forwardAxis: C.Axis.X, minimumPixelSize: 0, scene });
      scene.primitives.add(this.model);
      this.droneNote = `drone glTF ${(glb.byteLength / 1024).toFixed(0)} KB, exported in ${((performance.now() - t0) / 1000).toFixed(1)} s`;
    } catch (e) {
      console.warn('drone export failed, using a stand-in', e);
      this.model = scene.primitives.add(new C.Primitive({
        geometryInstances: new C.GeometryInstance({ geometry: C.BoxGeometry.fromDimensions({ dimensions: new C.Cartesian3(0.9, 0.9, 0.35) }), attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(C.Color.fromCssColorString('#222')) } }),
        appearance: new C.PerInstanceColorAppearance({ flat: false }), asynchronous: false,
      }));
      this.droneNote = 'drone stand-in box (glTF export failed: ' + (e.message || e) + ')';
    }
  },

  fallbackBuildings(osm) {
    const inst = [];
    const col = (h) => C.Color.fromCssColorString(h > 60 ? '#9aaab6' : h > 20 ? '#c9c4bb' : '#ddd6ca');
    for (const p of osm.prisms) {
      const toDeg = ([x, z]) => { const g = toLonLat(x, z); return [g.lon, g.lat]; };
      const outer = C.Cartesian3.fromDegreesArray(p.rings[0].flatMap(toDeg));
      const holes = p.rings.slice(1).map((r) => new C.PolygonHierarchy(C.Cartesian3.fromDegreesArray(r.flatMap(toDeg))));
      inst.push(new C.GeometryInstance({
        geometry: new C.PolygonGeometry({ polygonHierarchy: new C.PolygonHierarchy(outer, holes), height: p.minH, extrudedHeight: p.h, vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT }),
        attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(col(p.h)) }, id: 'osm:' + p.i,
      }));
    }
    return this.scene.primitives.add(new C.Primitive({ geometryInstances: inst, appearance: new C.PerInstanceColorAppearance({ translucent: false }), shadows: C.ShadowMode.ENABLED }));
  },

  labToEcef(x, y, z, out = new C.Cartesian3()) { return C.Matrix4.multiplyByPoint(this.frame, new C.Cartesian3(x, -z, y), out); },
  labDirToEcef(x, y, z) { return C.Cartesian3.normalize(C.Matrix4.multiplyByPointAsVector(this.frame, new C.Cartesian3(x, -z, y), new C.Cartesian3()), new C.Cartesian3()); },

  setDrone(p) {
    if (!this.model) return;
    // three's drone matrix in the lab frame, then lab -> ENU -> ECEF; Cesium's own Y-up -> Z-up turn
    // on the glTF equals B, so it is undone with B^-1
    const m = this.tmpM.compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(p.pitch || 0, p.yaw, p.roll || 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
    const M = C.Matrix4.fromColumnMajorArray(m.elements);
    const out = C.Matrix4.multiply(this.frame, C.Matrix4.multiply(this.B, C.Matrix4.multiply(M, this.Binv, new C.Matrix4()), new C.Matrix4()), new C.Matrix4());
    this.model.modelMatrix = out;
  },
  setCamera(c) {
    const cam = this.viewer.camera;
    const pos = this.labToEcef(c.pos.x, c.pos.y, c.pos.z);
    let dx = c.target.x - c.pos.x, dy = c.target.y - c.pos.y, dz = c.target.z - c.pos.z;
    const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
    const dir = this.labDirToEcef(dx, dy, dz);
    const upW = this.labDirToEcef(0, 1, 0);
    const right = C.Cartesian3.normalize(C.Cartesian3.cross(dir, upW, new C.Cartesian3()), new C.Cartesian3());
    const up = C.Cartesian3.cross(right, dir, new C.Cartesian3());
    cam.setView({ destination: pos, orientation: { direction: dir, up } });
    const f = cam.frustum; const a = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    f.fov = a >= 1 ? 2 * Math.atan(Math.tan(c.fov * DEG / 2) * a) : c.fov * DEG;
    f.near = 0.3; f.far = 2e7;
  },
  render() { this.viewer.render(); },
  sync() { gpuSync(this.gl); },
  readLuma() { return readLuma(this.gl); },
  ground(x, z) {
    if (!this.real) return 0;
    const k = `${Math.round(x / 4)},${Math.round(z / 4)}`, now = performance.now(), c = this.cache.get(k);
    if (c && now - c.t < 3000) return c.y;
    const e = this.labToEcef(x, 0, z);
    const h = this.scene.globe.getHeight(C.Cartographic.fromCartesian(e));
    const y = h === undefined ? (c ? c.y : 0) : h - this.h0;
    this.cache.set(k, { y, t: now }); if (this.cache.size > 20000) this.cache.clear();
    return y;
  },
  pick(o, d) {
    const ray = new C.Ray(this.labToEcef(o.x, o.y, o.z), this.labDirToEcef(d.x, d.y, d.z));
    let r;
    try { r = this.scene.pickFromRay(ray, this.model ? [this.model] : []); } catch { r = undefined; }
    if (!r || !r.position) return null;
    return { dist: C.Cartesian3.distance(ray.origin, r.position), object: r.object };
  },
  probe(o, d, max) { const h = this.pick(o, d); return h && h.dist <= max ? h.dist : Infinity; },
  raycast(o, d, max) {
    const h = this.pick(o, d);
    const tg = d.y < 0 ? -o.y / d.y : Infinity; // flat ground fallback (the globe is not always in the pick)
    if (h && h.dist <= max && (!isFinite(tg) || h.dist <= tg + 2)) return { dist: h.dist, kind: h.object ? 'building' : 'ground' };
    if (tg <= max) return { dist: tg, kind: 'ground' };
    return null;
  },
  setDaylight(d) {
    // the real sun for Burnaby on 2026-10-14: 14:00 PDT (day) or 23:00 PDT (night)
    const iso = d > 0.5 ? '2026-10-14T21:00:00Z' : '2026-10-15T06:00:00Z';
    this.viewer.clock.currentTime = C.JulianDate.fromIso8601(iso);
    this.viewer.clock.shouldAnimate = false;
    this.viewer.shadows = d > 0.5;
    // Cesium lights primitives and 3D Tiles from the sun even below the horizon: dim it at night
    this.scene.light = new C.SunLight({ intensity: d > 0.5 ? 2.0 : 0.12 });
    return { support: 'partial', note: 'Cesium places the real sun (and moon, stars, atmosphere) for a date and time, with real shadows by day; at night the city goes dark, but there are no lit windows or street lights without extra work (custom shaders on the 3D Tiles).' };
  },
  attribution() {
    const el = this.attribEl || document.querySelector('.cesium-widget-credits');
    return { el, required: ['OpenStreetMap'], note: this.real ? 'Cesium shows the ion logo and the data credits; OSM Buildings must carry “© OpenStreetMap contributors”. Credits Cesium cannot fit go behind a “Data attribution” link (that would be partial).' : 'Fallback: Cesium\'s credit bar with our “© OpenStreetMap contributors”.' };
  },
  sizeCategory(u) {
    const url = new URL(u, location.href);
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('/cesium@')) return 'CesiumJS';
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('/three@')) return 'glTF exporter';
    if (/cesium\.com$/.test(url.hostname)) return 'Cesium ion data';
    if (/virtualearth\.net$|bing\.com$/.test(url.hostname)) return 'Bing imagery';
    if (url.pathname.endsWith('metrotown-osm.geojson')) return this.real ? null : 'map data (fallback)';
    return undefined;
  },
};

function dataToCanvasTexture(t) {
  const { width: w, height: h, data } = t.image;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'); const id = ctx.createImageData(w, h);
  const n = w * h, ch = Math.round(data.length / n) || 4, f = data instanceof Float32Array ? 255 : 1;
  for (let i = 0; i < n; i++) {
    const r = data[i * ch] * f, g = ch > 1 ? data[i * ch + 1] * f : r, b = ch > 2 ? data[i * ch + 2] * f : r, a = ch > 3 ? data[i * ch + 3] * f : 255;
    id.data[i * 4] = r; id.data[i * 4 + 1] = g; id.data[i * 4 + 2] = b; id.data[i * 4 + 3] = a;
  }
  ctx.putImageData(id, 0, 0);
  // at most 512 px: the export is for a 1 m drone seen from metres away
  let out = cv;
  if (w > 512 || h > 512) { const k = 512 / Math.max(w, h); out = document.createElement('canvas'); out.width = Math.max(1, Math.round(w * k)); out.height = Math.max(1, Math.round(h * k)); out.getContext('2d').drawImage(cv, 0, 0, out.width, out.height); }
  const ct = new THREE.CanvasTexture(out);
  ct.flipY = t.flipY; ct.wrapS = t.wrapS; ct.wrapT = t.wrapT; ct.repeat.copy(t.repeat); ct.offset.copy(t.offset); ct.colorSpace = t.colorSpace;
  return ct;
}

startLab(adapter);
