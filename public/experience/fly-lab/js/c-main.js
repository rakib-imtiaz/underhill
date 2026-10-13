// Scenario C: MapLibre GL JS 4.7.1 (open source, BSD-3) with OpenFreeMap's free vector tiles (OpenMapTiles
// schema: buildings carry render_height / render_min_height from OpenStreetMap), extruded by MapLibre;
// the drone is our three.js model drawn in a MapLibre custom layer that shares the map's WebGL context
// and depth buffer.
//
// The lab's chase camera is turned into MapLibre's camera with calculateCameraOptionsFromTo(): MapLibre
// always looks at a point on the ground, so the camera aims through the drone at the ground behind it.
// MapLibre caps the pitch at 85 deg (no looking at the horizon or up), and has no 3D raycast API:
// collision and LiDAR use the building polygons from the vector tiles (querySourceFeatures) as prisms,
// which are exactly the extrusions MapLibre draws.
import * as THREE from 'three';
import { startLab, PROBE } from './lab.js';
import { PLACE, toLonLat } from './geo.js';
import { OsmCity, ringsToLab } from './osm.js';
import { makeDrone, poseDrone, droneEnv } from './drone3.js';
import { readLuma, gpuSync } from './util3.js';

const ml = window.maplibregl;
const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const OFM_ATTR = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const NIGHT = { bg: '#0d1622', ink: [12, 20, 32] };

const adapter = {
  id: 'C', title: 'MapLibre GL JS + OpenFreeMap 3D buildings',
  engine: 'MapLibre GL JS 4.7.1 (jsDelivr) · OpenFreeMap vector tiles (OpenMapTiles schema, building heights from OSM) · our drone in a three.js custom layer',
  data: 'Data: <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> (free, no key, no limits, donation-funded) · <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>.',
  chaseDist: 7,
  raycastKind: 'prism',
  raycastNote: 'MapLibre has no 3D raycast: the rays are cast (exactly) against the building polygons of the loaded vector tiles, extruded to render_height, which is the geometry MapLibre draws.',

  async init({ host, lab }) {
    if (!ml) throw new Error('MapLibre did not load (CDN blocked?)');
    const div = document.createElement('div'); div.className = 'lab-canvas'; host.prepend(div);
    const probeStyle = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e4e8ea' } }] };
    const map = this.map = new ml.Map({
      container: div, style: PROBE ? probeStyle : STYLE, center: [PLACE.lon, PLACE.lat], zoom: 17, pitch: 70, bearing: 45,
      interactive: false, maxZoom: 24, maxPitch: 85, fadeDuration: 0, antialias: true,
      attributionControl: { compact: false, customAttribution: PROBE ? OFM_ATTR : undefined },
    });
    this.canvas = map.getCanvas();
    this.gl = map.painter.context.gl;
    this.origin = ml.MercatorCoordinate.fromLngLat([PLACE.lon, PLACE.lat], 0);
    this.s = this.origin.meterInMercatorCoordinateUnits();
    this.drone = await makeDrone('balanced');
    this.pose = { x: 0, y: 0, z: 0 };
    const self = this;
    this.layer = {
      id: 'lab-drone', type: 'custom', renderingMode: '3d',
      onAdd(m, gl) {
        self.three = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
        self.three.autoClear = false;
        self.three.outputColorSpace = THREE.SRGBColorSpace;
        self.scene = new THREE.Scene();
        self.cam3 = new THREE.Camera();
        self.scene.add(self.drone.group);
        self.drone.group.traverse((o) => { o.frustumCulled = false; });
        self.sun = new THREE.DirectionalLight(0xfff1dc, 2.4); self.sun.position.set(-0.42, 0.66, 0.6);
        self.hemi = new THREE.HemisphereLight(0xbfd5ee, 0x6b665c, 1.0);
        self.scene.add(self.sun, self.hemi);
        self.env = { day: droneEnv(self.three, 1), night: droneEnv(self.three, 0) };
        self.scene.environment = self.env.day; self.scene.environmentIntensity = 0.6;
      },
      render(gl, matrix) {
        const p = self.pose, s = self.s;
        const m = new THREE.Matrix4().fromArray(matrix);
        const l = new THREE.Matrix4().makeTranslation(self.origin.x + p.x * s, self.origin.y + p.z * s, p.y * s)
          .scale(new THREE.Vector3(s, -s, s)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
        self.cam3.projectionMatrix = m.multiply(l);
        self.cam3.projectionMatrixInverse.copy(self.cam3.projectionMatrix).invert();
        self.three.resetState();
        self.three.render(self.scene, self.cam3);
      },
    };
    map.on('style.load', () => {
      map.addLayer(this.layer);
      if (PROBE) return;
      // stronger 3D buildings: opaque, coloured by height
      if (map.getLayer('building-3d')) {
        map.setPaintProperty('building-3d', 'fill-extrusion-opacity', 1);
        map.setPaintProperty('building-3d', 'fill-extrusion-color', ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 0], 0, '#ddd6ca', 20, '#cfc9bf', 60, '#b8c0c6', 140, '#97aab8']);
        map.setLayerZoomRange('building-3d', 13, 24);
      }
      this.styleSnapshot();
      this.setDaylight(this.day ?? 1);
    });
    this.contentReady = new Promise((res) => map.once('load', () => res()));
    this.settled = () => new Promise((res) => { const t = setTimeout(() => res(false), 30000); map.once('idle', () => { clearTimeout(t); res(true); }); this.map.redraw(); });
    // building prisms from the vector tiles, refreshed as tiles arrive
    this.prisms = null; this.prismAt = 0;
    map.on('sourcedata', (e) => { if (e.sourceId === 'openmaptiles' && e.isSourceLoaded) this.prismAt = 0; });
    await new Promise((r) => (map.isStyleLoaded() ? r() : map.once('style.load', r)));
    return { mode: 'full', note: PROBE ? 'Probe copy: blank style.' : 'OpenFreeMap tiles, no key' };
  },

  styleSnapshot() {
    // remember every plain colour in the style so night can recolour and day restore it
    this.orig = [];
    for (const l of this.map.getStyle().layers) {
      for (const prop of ['background-color', 'fill-color', 'line-color', 'fill-extrusion-color', 'text-color', 'text-halo-color', 'fill-outline-color']) {
        let v; try { v = this.map.getPaintProperty(l.id, prop); } catch { continue; }
        if (v === undefined) continue;
        this.orig.push({ id: l.id, prop, v });
      }
    }
  },

  buildingPrisms() {
    const now = performance.now();
    if (this.prisms && this.prismAt && now - this.prismAt < 2000) return this.prisms;
    const feats = this.map.querySourceFeatures('openmaptiles', { sourceLayer: 'building' });
    const list = [];
    for (const f of feats) {
      const h = f.properties.render_height || 0, minH = f.properties.render_min_height || 0;
      if (h <= 0) continue;
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
      for (const p of polys) { const rings = ringsToLab(p); if (rings[0]?.length >= 3) list.push({ rings, h, minH, props: f.properties }); }
    }
    this.prisms = OsmCity.fromPrisms(list); this.prismAt = now; this.prismCount = list.length;
    return this.prisms;
  },

  setDrone(p) { this.clock = (this.clock || 0) + (p.dt || 1 / 60); this.pose = p; poseDrone(this.drone, { ...p, x: 0, y: 0, z: 0 }, this.clock); },
  setCamera(c) {
    // aim through the target at the ground behind it (MapLibre's centre is always on the ground)
    let dx = c.target.x - c.pos.x, dy = c.target.y - c.pos.y, dz = c.target.z - c.pos.z;
    const L = Math.hypot(dx, dy, dz); dx /= L; dy /= L; dz /= L;
    if (dy > -0.09) { const h = Math.hypot(dx, dz) || 1; dy = -0.09; dx = dx / h * Math.sqrt(1 - dy * dy); dz = dz / h * Math.sqrt(1 - dy * dy); }
    const t = c.pos.y / -dy;
    const g = { x: c.pos.x + dx * t, z: c.pos.z + dz * t };
    const from = toLonLat(c.pos.x, c.pos.z), to = toLonLat(g.x, g.z);
    try {
      const o = this.map.calculateCameraOptionsFromTo(new ml.LngLat(from.lon, from.lat), Math.max(0.5, c.pos.y), new ml.LngLat(to.lon, to.lat), 0);
      this.map.jumpTo(o);
    } catch { /* same point */ }
  },
  render() { this.map.redraw(); },
  sync() { gpuSync(this.gl); },
  readLuma() { return readLuma(this.gl); },
  ground() { return 0; },
  probe(o, d, max) { const h = this.buildingPrisms().raycast(o, d, max); return h ? h.dist : Infinity; },
  raycast(o, d, max) {
    const h = this.buildingPrisms().raycast(o, d, max);
    const tg = d.y < 0 ? -o.y / d.y : Infinity;
    if (h && h.dist <= tg) return { dist: h.dist, kind: 'building' };
    if (tg <= max) return { dist: tg, kind: 'ground' };
    return null;
  },
  setDaylight(d) {
    this.day = d;
    const map = this.map;
    if (!PROBE && this.orig) {
      const night = d < 0.5;
      for (const o of this.orig) {
        let v = o.v;
        if (night && typeof v === 'string') v = nightColor(v, o.prop);
        else if (night && o.prop === 'fill-extrusion-color') v = ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 0], 0, '#2a3340', 60, '#2c3a4a', 140, '#33465a'];
        try { map.setPaintProperty(o.id, o.prop, v); } catch { /* expression we cannot recolour */ }
      }
      map.setLight({ anchor: 'map', position: [1.4, night ? 30 : 210, night ? 70 : 40], color: night ? '#9fb4e0' : '#ffffff', intensity: night ? 0.25 : 0.45 });
      try {
        map.setSky(night
          ? { 'sky-color': '#05080f', 'horizon-color': '#1a2433', 'fog-color': '#121a26', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.7 }
          : { 'sky-color': '#5d8fc7', 'horizon-color': '#c9d8e6', 'fog-color': '#d9e2ea', 'sky-horizon-blend': 0.5, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.85 });
      } catch { /* old style spec */ }
    }
    if (this.scene) { this.scene.environment = d < 0.5 ? this.env.night : this.env.day; this.sun.intensity = d < 0.5 ? 0.25 : 2.4; this.hemi.intensity = d < 0.5 ? 0.25 : 1.0; }
    return { support: 'partial', note: 'Night is a re-coloured style (every plain colour in the OpenFreeMap style darkened, MapLibre\'s light and sky changed). MapLibre has no lighting model for lit windows or street lights; those would need extra hand-made layers.' };
  },
  attribution() { return { el: document.querySelector('.maplibregl-ctrl-attrib'), required: ['OpenFreeMap', 'OpenMapTiles', 'OpenStreetMap'], note: 'MapLibre shows the tiles\' own attribution (OpenFreeMap, © OpenMapTiles, OpenStreetMap), expanded, as OpenFreeMap and the ODbL ask.' }; },
  sizeCategory(u) {
    const url = new URL(u, location.href);
    if (url.hostname === 'tiles.openfreemap.org') return url.pathname.includes('/fonts/') || url.pathname.includes('/sprites/') ? 'style, fonts, icons' : 'vector tiles';
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('maplibre')) return 'MapLibre';
    if (url.pathname.endsWith('metrotown-osm.geojson')) return null;
    return undefined;
  },
};

function nightColor(c, prop) {
  // blend towards a deep navy, keeping a hint of the original hue; labels stay readable
  const tmp = document.createElement('canvas').getContext('2d');
  tmp.fillStyle = '#000'; tmp.fillStyle = c;
  const hex = tmp.fillStyle; // #rrggbb or rgba(...)
  const m = hex.startsWith('#') ? [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 1] : (hex.match(/[\d.]+/g) || [0, 0, 0, 1]).map(Number);
  if (prop === 'text-color') return `rgba(${Math.round(150 + m[0] * 0.3)}, ${Math.round(160 + m[1] * 0.3)}, ${Math.round(175 + m[2] * 0.3)}, ${m[3] ?? 1})`;
  if (prop === 'text-halo-color') return 'rgba(8, 14, 22, 0.8)';
  const k = 0.16, n = NIGHT.ink;
  return `rgba(${Math.round(n[0] + m[0] * k)}, ${Math.round(n[1] + m[1] * k)}, ${Math.round(n[2] + m[2] * k * 1.2)}, ${m[3] ?? 1})`;
}

startLab(adapter);
