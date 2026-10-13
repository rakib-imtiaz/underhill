// The set: a dark studio floor with three stations (drone, GNSS, total station) in a row, each with
// its own warm key and cool rim light, a painted ground mark and a soft contact shadow.
// Lighting is environment (painted equirect → PMREM) + key + coloured rim + a faint hemisphere fill.
import * as THREE from 'three';
import { QUALITY_TIERS } from './quality.js';

export const BG = new THREE.Color(0x07090c);
export const RIM = 15;   // rim spot intensity at full focus
const FIELD_KEY_AZ = 0.35;  // work lights: from the front-left of the crew, toward the valley
// chapter layout: far enough apart that a wide orbit on one never catches its neighbours
export const STATIONS = {
  drone: new THREE.Vector3(-4.5, 0, 0),
  gnss: new THREE.Vector3(0, 0, 0),
  ts: new THREE.Vector3(4.5, 0, 0),
};
// finale layout: the three gathered into one shot (switched during a dip to black)
export const FINALE = {
  drone: new THREE.Vector3(-1.62, 0, 0.32),
  gnss: new THREE.Vector3(0, 0, -0.38),
  ts: new THREE.Vector3(1.58, 0, 0.26),
};

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, g: c.getContext('2d') };
}

/** Painted studio environment: dark gradient room with softboxes and a cool horizon strip. */
function studioEnvironment(renderer) {
  const W = 1024, H = 512;
  const { c, g } = canvas(W, H);
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0.0, '#14171c');
  grd.addColorStop(0.42, '#20252c');
  grd.addColorStop(0.5, '#262c34');
  grd.addColorStop(0.58, '#0d0f12');
  grd.addColorStop(1.0, '#050607');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  const box = (x, y, w, h, color, a) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, Math.max(w, h));
    rg.addColorStop(0, color.replace('A', a));
    rg.addColorStop(0.55, color.replace('A', a * 0.45));
    rg.addColorStop(1, color.replace('A', 0));
    g.save(); g.translate(x, y); g.scale(w / Math.max(w, h), h / Math.max(w, h)); g.translate(-x, -y);
    g.fillStyle = rg; g.fillRect(x - Math.max(w, h), y - Math.max(w, h), Math.max(w, h) * 2, Math.max(w, h) * 2);
    g.restore();
  };
  // equirect: u = 0.5 is -Z (looking forward), u = 0.75 is +X … softbox placement in pixels
  box(400, 130, 170, 70, 'rgba(255,236,214,A)', 1.0);    // warm key softbox, front-left high
  box(880, 175, 120, 55, 'rgba(120,205,255,A)', 0.85);   // cool rim strip, behind-right
  box(640, 80, 260, 30, 'rgba(235,240,248,A)', 0.45);    // overhead strip (top chamfer highlights)
  box(150, 235, 110, 40, 'rgba(255,170,110,A)', 0.35);   // low warm card
  // thin cool horizon line: grazing highlights along curved edges
  const hz = g.createLinearGradient(0, 238, 0, 262);
  hz.addColorStop(0, 'rgba(110,190,240,0)'); hz.addColorStop(0.5, 'rgba(110,190,240,0.32)'); hz.addColorStop(1, 'rgba(110,190,240,0)');
  g.fillStyle = hz; g.fillRect(0, 238, W, 24);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose(); tex.dispose();
  return env;
}

/** Floor texture: faint survey grid with 0.5 m cells and 2 m major lines (size and anisotropy by tier). */
function floorTexture(S = 1024, aniso = 8) {
  const { c, g } = canvas(S, S);
  g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
  // fine noise for the concrete (value variation in the multiplier)
  const img = g.getImageData(0, 0, S, S); const d = img.data;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < d.length; i += 4) { const v = 118 + rnd() * 20; d[i] = d[i + 1] = d[i + 2] = v; }
  g.putImageData(img, 0, 0);
  const cells = 8; // texture covers 4 m → 0.5 m cells
  g.strokeStyle = 'rgba(190,200,210,0.55)'; g.lineWidth = Math.max(1, S / 1024);
  for (let i = 0; i <= cells; i++) {
    const p = Math.round((i / cells) * S) + 0.5;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
  }
  g.strokeStyle = 'rgba(210,220,230,0.85)'; g.lineWidth = Math.max(1.5, S / 512);
  for (const p of [0.5, S - 0.5]) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

/** Painted ground mark under a station (a survey point / a landing pad). */
function groundMark(kind) {
  const S = 512;
  const { c, g } = canvas(S, S);
  g.translate(S / 2, S / 2);
  g.strokeStyle = 'rgba(230,226,214,0.9)'; g.fillStyle = 'rgba(230,226,214,0.9)';
  if (kind === 'pad') {
    g.lineWidth = 10; g.beginPath(); g.arc(0, 0, 230, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 205, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 4; i++) { g.save(); g.rotate((i * Math.PI) / 2 + Math.PI / 4); g.fillRect(-4, -236, 8, 26); g.restore(); }
  } else {
    // survey control point: ring, crosshair and a centre dot
    g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 120, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3;
    for (const [x0, y0, x1, y1] of [[-200, 0, -40, 0], [40, 0, 200, 0], [0, -200, 0, -40], [0, 40, 0, 200]]) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
    g.beginPath(); g.arc(0, 0, 9, 0, Math.PI * 2); g.fill();
    g.lineWidth = 2; g.setLineDash([10, 12]); g.beginPath(); g.arc(0, 0, 240, 0, Math.PI * 2); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft contact shadow: depth rendered from below with an orthographic camera, blurred twice. */
class ContactShadow {
  constructor(renderer, scene, layer, { size = 1.6, res = 512, height = 0.5, darkness = 1.0, opacity = 0.85 } = {}) {
    this.renderer = renderer; this.scene = scene; this.layer = layer;
    const opts = { type: THREE.UnsignedByteType };
    this.rt = new THREE.WebGLRenderTarget(res, res, opts);
    this.rtBlur = new THREE.WebGLRenderTarget(res, res, opts);
    this.rt.texture.generateMipmaps = this.rtBlur.texture.generateMipmaps = false;
    this.group = new THREE.Group();
    this.group.position.y = 0.0015;
    const planeGeo = new THREE.PlaneGeometry(size, size).rotateX(Math.PI / 2);
    this.plane = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({
      map: this.rt.texture, opacity, transparent: true, depthWrite: false, toneMapped: false,
    }));
    this.plane.scale.y = -1;
    this.plane.renderOrder = 1;
    this.group.add(this.plane);
    this.blurPlane = new THREE.Mesh(planeGeo);
    this.blurPlane.visible = false;
    this.group.add(this.blurPlane);
    this.cam = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0, height);
    this.cam.rotation.x = Math.PI / 2;
    this.cam.layers.set(layer);
    this.group.add(this.cam);
    const dm = new THREE.MeshDepthMaterial();
    dm.userData.darkness = { value: darkness };
    dm.onBeforeCompile = (shader) => {
      shader.uniforms.darkness = dm.userData.darkness;
      shader.fragmentShader = 'uniform float darkness;\n' + shader.fragmentShader.replace(
        'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
        'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );');
    };
    dm.depthTest = false; dm.depthWrite = false;
    this.depthMat = dm;
    const blurShader = (dir) => new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, h: { value: 1 / res } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float h; varying vec2 vUv;
        void main(){ vec4 s = vec4(0.0); vec2 d = ${dir};
          s += texture2D(tDiffuse, vUv - 4.0*h*d) * 0.051; s += texture2D(tDiffuse, vUv - 3.0*h*d) * 0.0918;
          s += texture2D(tDiffuse, vUv - 2.0*h*d) * 0.12245; s += texture2D(tDiffuse, vUv - 1.0*h*d) * 0.1531;
          s += texture2D(tDiffuse, vUv) * 0.1633;
          s += texture2D(tDiffuse, vUv + 1.0*h*d) * 0.1531; s += texture2D(tDiffuse, vUv + 2.0*h*d) * 0.12245;
          s += texture2D(tDiffuse, vUv + 3.0*h*d) * 0.0918; s += texture2D(tDiffuse, vUv + 4.0*h*d) * 0.051;
          gl_FragColor = s; }`,
      depthTest: false,
    });
    this.hBlur = blurShader('vec2(1.0, 0.0)');
    this.vBlur = blurShader('vec2(0.0, 1.0)');
    this.res = res;
    this.dirty = true;
  }

  blur(amount) {
    const r = this.renderer;
    this.blurPlane.visible = true;
    this.blurPlane.material = this.hBlur;
    this.hBlur.uniforms.tDiffuse.value = this.rt.texture; this.hBlur.uniforms.h.value = amount / this.res;
    r.setRenderTarget(this.rtBlur); r.render(this.blurPlane, this.cam);
    this.blurPlane.material = this.vBlur;
    this.vBlur.uniforms.tDiffuse.value = this.rtBlur.texture; this.vBlur.uniforms.h.value = amount / this.res;
    r.setRenderTarget(this.rt); r.render(this.blurPlane, this.cam);
    this.blurPlane.visible = false;
  }

  render() {
    const r = this.renderer; const s = this.scene;
    const bg = s.background; const fog = s.fog;
    s.background = null; s.fog = null;
    this.plane.visible = false;
    s.overrideMaterial = this.depthMat;
    const clearAlpha = r.getClearAlpha(); const clearColor = r.getClearColor(new THREE.Color());
    r.setClearColor(0x000000, 0);
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(s, this.cam);
    s.overrideMaterial = null;
    this.blur(2.2);
    this.blur(0.9);
    r.setRenderTarget(null);
    r.setClearColor(clearColor, clearAlpha);
    s.background = bg; s.fog = fog;
    this.plane.visible = true;
    this.dirty = false;
  }

  dispose() {
    this.rt.dispose(); this.rtBlur.dispose();
    this.plane.geometry.dispose(); this.plane.material.dispose();
    this.depthMat.dispose(); this.hBlur.dispose(); this.vBlur.dispose();
  }
}

export class Stage {
  constructor(renderer, { mobile, q } = {}) {
    this.renderer = renderer;
    this.mobile = mobile;
    // quality tier (quality.js); without one, the old phone / desktop split
    const Q = (this.q = q || QUALITY_TIERS[mobile ? 'balanced' : 'high']);
    const scene = (this.scene = new THREE.Scene());
    scene.background = BG.clone();
    scene.fog = new THREE.Fog(BG.getHex(), 8, 24);
    scene.environment = studioEnvironment(renderer);
    scene.environmentIntensity = 0.55;

    // floor
    const ftex = floorTexture(Q.texSize, Q.aniso);
    ftex.repeat.set(40 / 4, 40 / 4);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x7a8088, map: ftex, roughness: 0.78, metalness: 0.0, envMapIntensity: 0.25,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), floorMat);
    floor.receiveShadow = Q.shadows;
    floor.name = 'set:floor';
    scene.add(floor);
    this.floor = floor;

    this.hemi = new THREE.HemisphereLight(0x8aa4c0, 0x0b0c0e, 0.18);
    scene.add(this.hemi);

    this.stations = {};
    let layer = 1;
    for (const [key, pos] of Object.entries(STATIONS)) {
      const group = new THREE.Group();
      group.name = `station:${key}`;
      group.position.copy(pos);
      scene.add(group);

      // ground mark
      const mark = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({
        map: groundMark(key === 'drone' ? 'pad' : 'point'), transparent: true, opacity: key === 'drone' ? 0.1 : 0.18,
        roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
      }));
      const ms = key === 'drone' ? 1.5 : 0.5;
      mark.scale.set(ms, 1, ms);
      mark.position.y = 0.0008;
      mark.receiveShadow = Q.shadows;
      group.add(mark);

      // lights live in the station group, so they travel with it (station-local coordinates)
      // key: warm, front-left, high
      const key_ = new THREE.SpotLight(0xffdcb8, 0, 9, THREE.MathUtils.degToRad(24), 0.65, 1.6);
      key_.position.set(-1.7, 2.9, 2.1);
      key_.target.position.set(0, 0.45, 0);
      // rim: cool cyan, low and behind — it grazes the silhouette and only skims the floor
      const rim = new THREE.SpotLight(0x48c8ff, 0, 7, THREE.MathUtils.degToRad(17), 0.8, 1.6);
      rim.position.set(1.4, 1.35, -2.7);
      rim.target.position.set(0, 0.55, 0);
      // a faint warm kicker from the left-rear gives orange parts their edge
      const kick = new THREE.SpotLight(0xff8a3a, 0, 7, THREE.MathUtils.degToRad(30), 0.8, 1.8);
      kick.position.set(-2.2, 0.9, -1.6);
      kick.target.position.set(0, 0.4, 0);
      if (Q.shadows) {
        key_.castShadow = true;
        key_.shadow.mapSize.set(1024, 1024);
        key_.shadow.bias = -0.0004;
        key_.shadow.normalBias = 0.015;
        key_.shadow.camera.near = 1.2;
        key_.shadow.camera.far = 6;
        key_.shadow.autoUpdate = false;
      }
      // the rig is re-aimed per shot like a film crew would: the rim always sits behind the subject
      // relative to the camera, the key follows the camera half-way (so shadows barely swing)
      const keyRig = new THREE.Group(); keyRig.name = 'rig:key';
      const rimRig = new THREE.Group(); rimRig.name = 'rig:rim';
      group.add(keyRig, rimRig);
      keyRig.add(key_, key_.target, kick, kick.target);
      rimRig.add(rim, rim.target);

      const contact = new ContactShadow(renderer, scene, layer, {
        size: key === 'drone' ? 2.2 : 1.6, res: Q.texSize / 2, height: key === 'drone' ? 0.62 : 0.6,
        darkness: key === 'drone' ? 1.25 : 1.1, opacity: 0.9,
      });
      group.add(contact.group);

      this.stations[key] = { key, pos, group, mark, keyLight: key_, rim, kick, keyRig, rimRig, contact, layer, model: null, focus: 0, rigAz: 0 };
      layer++;
    }
  }

  /**
   * Where the stations stand: 'studio' (Act I chapters), 'finale' (the three gathered) or 'field'
   * (Act II, on the survey site). `true`/`false` are accepted for finale/studio.
   */
  setLayout(mode, field = null) {
    if (mode === true) mode = 'finale';
    if (mode === false || !mode) mode = 'studio';
    if (this.layout === mode) return;
    this.layout = mode;
    this.finale = mode === 'finale';
    const table = mode === 'field' && field ? field : mode === 'finale' ? FINALE : STATIONS;
    const globe = mode === 'globe';
    for (const [key, st] of Object.entries(this.stations)) {
      if (!globe) st.group.position.copy(table[key]);
      st.group.visible = !globe;
      st.group.updateMatrixWorld(true);
      st.mark.visible = mode !== 'field';
      this.markDirty(key);
    }
    this._fog = this._fog || this.scene.fog;
    this.scene.fog = globe ? null : this._fog;
    if (globe) {
      // a fixed light set on the planet (only scene-level lights remain), whatever layout came before
      this.hemi.visible = false;
      this.floor.visible = false;
      this.scene.background = new THREE.Color().setRGB(0.004, 0.006, 0.01, THREE.LinearSRGBColorSpace);
      this.followCamera = false;
      return;
    }
    const f = mode === 'field';
    this.floor.visible = !f;
    // The field is lit by the low sun, the sky and one work light per station. The studio's rim and
    // kicker spots and its fill are switched off there: every visible light is evaluated by every lit
    // pixel, and the open site has many more of them. (Changing the light set recompiles shaders,
    // which is why it only happens here, under the dip to black.)
    this.hemi.visible = !f;
    for (const st of Object.values(this.stations)) {
      st.rim.visible = !f; st.kick.visible = !f;
      // work lights stand still on the site; in the studio the rig follows the camera
      if (f) { st.keyRig.rotation.y = FIELD_KEY_AZ; st.rigAz = FIELD_KEY_AZ; st.shadowDirty = true; }
      // on site the work lights are broad floods, not stage spots: wide cone, fully soft edge
      st.keyLight.angle = THREE.MathUtils.degToRad(f ? 36 : 24);
      st.keyLight.penumbra = f ? 1 : 0.65;
    }
    this.followCamera = !f;
    if (f) {
      this.scene.background = new THREE.Color().setRGB(0.1, 0.12, 0.15, THREE.LinearSRGBColorSpace);
      this.scene.fog.color.setRGB(0.1, 0.12, 0.15, THREE.LinearSRGBColorSpace);
      this.scene.fog.near = 40; this.scene.fog.far = 300;
      this.scene.environmentIntensity = 0.42;
    } else {
      this.scene.background = BG.clone();
      this.scene.fog.color.copy(BG);
      this.scene.fog.near = 8; this.scene.fog.far = 24;
      this.scene.environmentIntensity = 0.55;
    }
  }

  /** Re-aim each station's light rig for a camera at `camPos` (world). */
  aimRigs(camPos) {
    if (this.followCamera === false) return;
    for (const st of Object.values(this.stations)) {
      const p = st.group.position;
      const az = Math.atan2(camPos.x - p.x, camPos.z - p.z);    // 0 = camera in front (+Z)
      // the camera's natural side is the front; wrap so a rear camera turns the rig the short way
      st.rimRig.rotation.y = az;
      const keyAz = az * 0.5;
      if (Math.abs(keyAz - st.rigAz) > 0.004) { st.rigAz = keyAz; st.keyRig.rotation.y = keyAz; st.shadowDirty = true; }
    }
  }

  /** Attach a model root to a station (replacing whatever is there). */
  setModel(key, inst) {
    const st = this.stations[key];
    if (st.model) st.group.remove(st.model.root);
    st.model = inst;
    if (inst) {
      st.group.add(inst.root);
      inst.root.traverse((o) => {
        const casts = (o.isMesh || o.isInstancedMesh) && !o.userData.noShadow && !(o.material?.transparent && !o.material?.alphaTest);
        if (casts) o.layers.enable(st.layer); else o.layers.disable(st.layer);
        if (!this.q.shadows && o.isMesh) { o.castShadow = false; }
      });
    }
    st.contact.dirty = true;
    st.shadowDirty = true;
  }

  /**
   * Light focus per station (0 = dark pool, 1 = fully lit). `title` dims keys for the opening.
   */
  setFocus(focus) {
    for (const [key, st] of Object.entries(this.stations)) {
      const f = focus[key] ?? 0;
      st.focus = f;
      st.keyLight.intensity = 85 * f;
      st.rim.intensity = RIM * Math.min(1, f * 1.4 + (focus.rimFloor ?? 0));
      st.kick.intensity = 2.5 * f;
      st.mark.material.opacity = (key === 'drone' ? 0.1 : 0.18) * Math.max(0.25, f);
      if (st.keyLight.castShadow) {
        const on = f > 0.02;
        st.keyLight.castShadow = true;
        st.keyLight.shadow.autoUpdate = false;
        if (on && st.shadowDirty) { st.keyLight.shadow.needsUpdate = true; }
      }
    }
  }

  /** Re-render contact shadows that are dirty. Call once per frame before the main render. */
  updateShadows() {
    for (const st of Object.values(this.stations)) {
      if (st.contact.dirty) st.contact.render();
      if (st.shadowDirty && st.keyLight.castShadow) { st.keyLight.shadow.needsUpdate = true; }
      st.shadowDirty = false;
    }
  }

  markDirty(key) {
    const st = this.stations[key];
    st.contact.dirty = true;
    st.shadowDirty = true;
  }
}
