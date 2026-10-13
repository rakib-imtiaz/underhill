// Fly mode: stills from the gimbal camera (P1-style, 3:2). The gimbal view is rendered into a small
// HDR target (512 px wide), finished (ACES, sRGB) into an 8-bit target, read back (asynchronously
// where the browser can), and kept as a JPEG blob with its geotag. Each still's ground footprint (the
// camera frustum's four corner rays meeting the terrain) is drawn faintly on the ground, from one
// preallocated line buffer, and handed to the minimap.
import * as THREE from 'three';
import { ground, rayTerrain } from './query.js';

const W = 512, H = 342;            // 3:2
const MAX_FP = 240;                // footprints kept on the ground
const SEG = 8;                     // segments per footprint edge (draped)

export class PhotoSystem {
  constructor({ renderer, scene, passes }) {
    this.renderer = renderer; this.scene = scene; this.passes = passes;
    this.hdr = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: true });
    this.ldr = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, depthBuffer: false });
    this.hdr.texture.generateMipmaps = this.ldr.texture.generateMipmaps = false;
    this.cam = new THREE.PerspectiveCamera(37.8, W / H, 0.1, 10000);
    this.photos = [];
    this.n = 0;
    // footprints on the ground
    const g = new THREE.BufferGeometry();
    this.fpPos = new THREE.BufferAttribute(new Float32Array(MAX_FP * 4 * SEG * 2 * 3), 3);
    this.fpPos.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.fpPos);
    g.setDrawRange(0, 0);
    this.fpMat = new THREE.LineBasicMaterial({ color: 0x9fe3ff, transparent: true, opacity: 0.5, depthWrite: false });
    this.fp = new THREE.LineSegments(g, this.fpMat);
    this.fp.frustumCulled = false;
    this.fp.name = 'fly:footprints';
    this.fp.renderOrder = 2;
    scene.add(this.fp);
    this.fpHead = 0; this.fpCount = 0;
  }

  /** The ground quad seen by a camera (world corners [x, y, z] ×4), or null if the view misses the ground. */
  footprint(cam) {
    cam.updateMatrixWorld();
    const o = cam.position, out = [];
    const v = new THREE.Vector3();
    for (const [nx, ny] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      v.set(nx, ny, 0.5).unproject(cam).sub(o).normalize();
      let t = rayTerrain(o.x, o.y, o.z, v.x, v.y, v.z, 400);
      if (!Number.isFinite(t)) {
        // above the horizon: clip the corner at 300 m, inside the site's terrain
        t = 300;
        if (Math.abs(v.x) > 1e-6) t = Math.min(t, ((v.x > 0 ? 640 : -640) - o.x) / v.x);
        if (Math.abs(v.z) > 1e-6) t = Math.min(t, ((v.z > 0 ? 640 : -640) - o.z) / v.z);
        t = Math.max(0, t);
        const x = o.x + v.x * t, z = o.z + v.z * t;
        out.push([x, ground(x, z), z]);
        continue;
      }
      out.push([o.x + v.x * t, o.y + v.y * t, o.z + v.z * t]);
    }
    return out;
  }

  /** Draw a footprint outline, draped every 1/SEG of each edge. */
  addFootprint(c) {
    const k = this.fpHead; this.fpHead = (k + 1) % MAX_FP; this.fpCount = Math.min(MAX_FP, this.fpCount + 1);
    const a = this.fpPos.array; let i = k * 4 * SEG * 2 * 3;
    for (let e = 0; e < 4; e++) {
      const p = c[e], q = c[(e + 1) % 4];
      for (let s = 0; s < SEG; s++) {
        for (const f of [s / SEG, (s + 1) / SEG]) {
          const x = p[0] + (q[0] - p[0]) * f, z = p[2] + (q[2] - p[2]) * f;
          a[i++] = x; a[i++] = ground(x, z) + 0.06; a[i++] = z;
        }
      }
    }
    this.fpPos.addUpdateRange(k * 4 * SEG * 2 * 3, 4 * SEG * 2 * 3);
    this.fpPos.needsUpdate = true;
    this.fp.geometry.setDrawRange(0, this.fpCount * 4 * SEG * 2);
  }

  /**
   * Take a still. pose = { position: Vector3, quaternion: Quaternion, hfov (deg), zoom }.
   * opts = { mode (0 colour, 1/2 thermal), exposure, gain, meta (geotag fields), payload, before(), after() }.
   * Returns the photo record; its blob / url fill in when the read-back lands.
   */
  async capture(pose, opts = {}) {
    const r = this.renderer, cam = this.cam;
    const hf = THREE.MathUtils.degToRad(pose.hfov) / 2;
    cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hf) / (W / H) / Math.max(1, pose.zoom || 1)));
    cam.aspect = W / H;
    cam.position.copy(pose.position); cam.quaternion.copy(pose.quaternion);
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const prev = r.getRenderTarget();
    opts.before?.();
    r.setRenderTarget(this.hdr); r.clear(); r.render(this.scene, cam);
    opts.after?.();
    this.passes.run(this.hdr.texture, this.ldr, { mode: opts.mode || 0, exposure: opts.exposure ?? 1, vignette: 0.18, gain: opts.gain ?? 1, w: W, h: H });
    r.setRenderTarget(prev);
    const corners = this.footprint(cam);
    this.addFootprint(corners);
    const id = ++this.n;
    const photo = { id, corners, meta: opts.meta || {}, payload: opts.payload || 'P1', url: null, blob: null, thumb: null, ready: null };
    this.photos.push(photo);
    photo.ready = this.readBack().then((canvas) => new Promise((res) => {
      photo.canvas = canvas;
      canvas.toBlob((b) => { photo.blob = b; photo.url = b ? URL.createObjectURL(b) : null; res(photo); }, 'image/jpeg', 0.88);
    }));
    return photo;
  }

  async readBack() {
    const r = this.renderer;
    const buf = new Uint8Array(W * H * 4);       // one per still: several read-backs can be in flight
    if (r.readRenderTargetPixelsAsync) await r.readRenderTargetPixelsAsync(this.ldr, 0, 0, W, H, buf);
    else r.readRenderTargetPixels(this.ldr, 0, 0, W, H, buf);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const img = g.createImageData(W, H);
    // GL rows run bottom-up
    for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    g.putImageData(img, 0, 0);
    return c;
  }

  /** A JPEG with the geotag burnt into a strip along the bottom (the download). */
  async download(photo) {
    await photo.ready;
    const src = photo.canvas; if (!src) return;
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height + 44;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.fillStyle = '#0a1b2e'; g.fillRect(0, src.height, c.width, 44);
    g.fillStyle = '#e9edf0'; g.font = '11px "Plex Mono", ui-monospace, monospace';
    const m = photo.meta;
    g.fillText(`${m.name || ''}  ${m.utm || ''}`, 8, src.height + 17);
    g.fillStyle = '#9fb3c4';
    g.fillText(`${m.latlon || ''}  ${m.agl || ''}  ${m.hdg || ''}  ${m.time || ''}`, 8, src.height + 34);
    await new Promise((res) => c.toBlob((b) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = `${m.file || 'UH_photo'}.jpg`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      res();
    }, 'image/jpeg', 0.9));
  }
}
