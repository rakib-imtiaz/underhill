// Daylight mode: the same film in a bright studio, on a clear day and over the planet's day side.
//
// One value, `d` (0 = the dark film, 1 = daylight), eased over 0.8 s (instant under reduced
// motion). Every frame, after the scene has been posed and lit for u, `apply()` blends what the
// mode changes on top of that: light colours and intensities, shadow strength, the environment's
// strength, exposure, fog and background, a few material colours and shader uniforms. It never
// changes the number or type of lights, a light's visibility, or anything that is a material
// define, so switching compiles no shader programs (verified with renderer.info.programs).
import * as THREE from 'three';
import { BG } from './stage.js';

// the remembered choice ('gt-daylight') lives in theme.js, shared with the pages that have no 3D
export { savedDaylight, saveDaylight } from './theme.js';

const lin = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
const DAY = {
  // a bright, seamless cyclorama: a cool paper-white wall the floor fades into (fog = wall colour)
  // (linear, above 1: the background is tone mapped like the scene, so it is pushed up to read as
  // paper white, #e9eff4 on screen, after ACES)
  studioBg: lin(1.75, 1.86, 2.02),
  floor: new THREE.Color(0xffffff), floorGlow: new THREE.Color(0xc4ccd4),
  hemiSky: new THREE.Color(0xffffff), hemiGround: new THREE.Color(0x8e98a3),
  key: new THREE.Color(0xfff6ec), rim: new THREE.Color(0x9fd6ff),
  fieldNight: lin(0.1, 0.12, 0.15), fieldHaze: lin(0.5, 0.62, 0.76),
  sun: new THREE.Color(0xfff2e2), skyTop: new THREE.Color(0xc4dcf3), skyGround: new THREE.Color(0x6e604c),
  ridges: [new THREE.Color(0x7d93a9), new THREE.Color(0x8ca1b6), new THREE.Color(0x9cb0c3)],
  space: lin(0.03, 0.05, 0.09), spaceNight: lin(0.004, 0.006, 0.01),
};
const tmp = new THREE.Color();
const DEG = Math.PI / 180;
// day variants of the additive glows: deep, saturated Underhill colours drawn with normal (alpha)
// blending. Blending is GL state, not a shader define, so switching it compiles nothing.
const GLOW_DAY = { blue: new THREE.Color(0x0069a3), red: new THREE.Color(0xc4161c), orange: new THREE.Color(0xc4520c) };
function glowKind(c) {
  if (c.r > c.g * 1.4 && c.r > c.b * 1.4) return c.g > c.b * 1.6 ? 'orange' : 'red';
  return 'blue';
}
/** The studio floor in daylight: paper white with a faint blue-grey survey grid (same size and
 *  settings as stage.js's floor texture, so swapping the map compiles nothing). */
function dayFloorTexture(like) {
  const S = like.image?.width || 1024;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#f1f4f7'; g.fillRect(0, 0, S, S);
  const img = g.getImageData(0, 0, S, S); const dd = img.data;
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < dd.length; i += 4) { const v = rnd() * 5; dd[i] -= v; dd[i + 1] -= v; dd[i + 2] -= v; }
  g.putImageData(img, 0, 0);
  const cells = 8;
  g.strokeStyle = 'rgba(70,100,130,0.16)'; g.lineWidth = Math.max(1, S / 1024);
  for (let i = 0; i <= cells; i++) {
    const p = Math.round((i / cells) * S) + 0.5;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
  }
  g.strokeStyle = 'rgba(40,80,120,0.26)'; g.lineWidth = Math.max(1.5, S / 512);
  for (const p of [0.5, S - 0.5]) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = like.wrapS; t.wrapT = like.wrapT; t.repeat.copy(like.repeat);
  t.colorSpace = like.colorSpace; t.anisotropy = like.anisotropy;
  return t;
}

export class Daylight {
  constructor({ stage, field, globe }) {
    this.stage = stage; this.field = field; this.globe = globe;
    this.target = 0; this.t = 0; this.d = 0;
    // the values the mode blends away from (captured once, before any blending)
    const st = Object.values(stage.stations)[0];
    this.base = {
      floor: stage.floor.material.color.clone(), floorGlow: stage.floor.material.emissive.clone(),
      hemiSky: stage.hemi.color.clone(), hemiGround: stage.hemi.groundColor.clone(), hemi: stage.hemi.intensity,
      key: st.keyLight.color.clone(), rim: st.rim.color.clone(),
      contact: Object.fromEntries(Object.entries(stage.stations).map(([k, s]) => [k, s.contact?.plane.material.opacity ?? 1])),
      sun: field.sun.color.clone(), sunPos: field.sun.position.clone(),
      skyTop: field.skyLight.color.clone(), skyGround: field.skyLight.groundColor.clone(),
      ridges: (field.ridges || []).map((m) => m.material.color.clone()),
    };
    this.sunDay = new THREE.Vector3(-0.5, 0.78, -0.38).normalize().multiplyScalar(200);
    this.glows = new Map();   // additive materials (lasers, pulses, glows) → { color, kind, day }
    this.scanAt = -1;
    this.nightFloor = stage.floor.material.map;
    this.dayFloor = this.nightFloor ? dayFloorTexture(this.nightFloor) : null;
    this.dayGlow = false;     // the glows' current variant (switched at d = 0.5)
    this.fieldBase = null;    // the field's effect colours (applyFieldDay)
  }

  /** Switch the mode; `instant` skips the 0.8 s ease (reduced motion, first load). */
  set(on, instant = false) { this.target = on ? 1 : 0; if (instant) { this.t = this.target; this.d = this.target; } }

  /** Advance the ease; true while it is moving (the loop keeps rendering). */
  step(dt) {
    if (this.t === this.target) return false;
    const r = dt / 0.8;
    this.t = this.target > this.t ? Math.min(this.target, this.t + r) : Math.max(this.target, this.t - r);
    this.d = this.t * this.t * (3 - 2 * this.t);
    return true;
  }

  /** The additive glows in the scene (looked up again now and then: models and effects arrive late). */
  scanGlows(scene, frame) {
    // (a full traverse costs a few ms on this scene: only now and then)
    if (this.scanAt >= 0 && frame - this.scanAt < 240) return;
    this.scanAt = frame;
    const globeGroup = this.globe.group;
    const visit = (o, inGlobe) => {
      inGlobe = inGlobe || o === globeGroup;
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) {
        if (this.glows.has(m) || !m.color || m.isShaderMaterial) continue;
        if (m.blending !== THREE.AdditiveBlending) continue;
        // sprites stay soft glows; the planet keeps its glows (space is dark in daylight too)
        const day = !inGlobe && !o.isSprite;
        this.glows.set(m, { color: m.color.clone(), kind: glowKind(m.color), day });
      }
      for (const c of o.children) visit(c, inGlobe);
    };
    visit(scene, false);
  }

  /** Switch every glow to its day or night variant (blending, colour, ring width). */
  setGlowVariant(day) {
    this.dayGlow = day;
    for (const [m, g] of this.glows) {
      if (!g.day) continue;
      m.blending = day ? THREE.NormalBlending : THREE.AdditiveBlending;
      if (!day) m.color.copy(g.color);
    }
    // the GNSS signal rings: wider bands in daylight (a geometry swap, same material)
    const rings = this.rings || (this.rings = this.stage.scene.getObjectByName('fx:rings'));
    if (rings) for (const r of rings.children) {
      if (!r.isMesh) continue;
      r.userData.nightGeo = r.userData.nightGeo || r.geometry;
      if (day && !r.userData.dayGeo) r.userData.dayGeo = new THREE.RingGeometry(0.9, 1, 128, 1).rotateX(-Math.PI / 2);
      r.geometry = day ? r.userData.dayGeo : r.userData.nightGeo;
    }
    this.applyFieldDay(day);
  }

  /**
   * The field's glows (shader materials in field.js) on a bright ground: the point cloud draws
   * opaque; the scan fan is drawn in deep blue; contours and profile darken the ground instead of lighting it (reverse-subtract
   * blending, with the complement of the colour they should leave behind). GL state and uniforms
   * only: nothing compiles. Each material is looked up defensively (field.js belongs to the field act).
   */
  applyFieldDay(day) {
    const f = this.field;
    const sub = (m, on) => {
      if (!m || !m.isMaterial) return;
      // dst × (1 − src): a multiplicative darkening that can never go negative or flip a hue (as long
      // as src stays under 1, which the day colours below keep it)
      if (on) { m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation; m.blendSrc = THREE.ZeroFactor; m.blendDst = THREE.OneMinusSrcColorFactor; }
      else { m.blending = THREE.AdditiveBlending; m.blendEquation = THREE.AddEquation; m.blendSrc = THREE.SrcAlphaFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor; }
    };
    const plain = (m, on) => { if (m && m.isMaterial) m.blending = on ? THREE.NormalBlending : THREE.AdditiveBlending; };
    if (!this.fieldBase) {
      this.fieldBase = {
        sec: f.secU?.uColor?.value?.isColor ? f.secU.uColor.value.clone() : null,
      };
    }
    plain(f.cloudMat, day);
    sub(f.contourMat, day);
    plain(f.boundaryMat, day);
    // (2026-10-13: the drone's LiDAR is drawn in deep Underhill blue over the ground by day, normal-
    // blended like the other day glows, and added light by night: field.setScanDay, blend state only)
    f.setScanDay?.(day);
    // (the section stays additive: on the mid-tone valley ground an Underhill-blue light reads as a clear
    // cut line and a tinted section, with no colour artefacts; see the colour below)
    // (what the contours darken by: the complement of Underhill blue, scaled so the brightest term of
    // the shader and the section curve stay under 1)
    if (this.fieldBase.sec) f.secU.uColor.value.copy(day ? new THREE.Color(0.04, 0.42, 1.0).multiplyScalar(1.7) : this.fieldBase.sec);
    // the contours' index lines are 1.6× bright: at half strength they stay under 1 too
    if (f.contourMat?.uniforms?.alpha) f.contourMat.uniforms.alpha.value = day ? 0.55 : 1;
  }

  /**
   * Blend daylight over the frame just posed. `envBase` is the environment strength the dark film
   * uses at this moment (main.js); `frame` a running frame count.
   */
  apply(frame) {
    const d = this.d, { stage, field, globe } = this, b = this.base, scene = stage.scene;
    const layout = stage.layout, inField = layout === 'field', inGlobe = layout === 'globe';
    this.scanGlows(scene, frame);
    if ((d > 0.5) !== this.dayGlow || this.glows.size !== this.glowCount) { this.glowCount = this.glows.size; this.setGlowVariant(d > 0.5); }
    for (const [m, g] of this.glows) {
      if (g.day && this.dayGlow) m.color.copy(GLOW_DAY[g.kind]);
      else m.color.copy(g.color).multiplyScalar(1 - 0.5 * d);
    }
    // the rings' opacity is written each frame by effects.js (before this): stronger in daylight,
    // where they are deep blue bands drawn over a bright wall instead of light added to a dark one
    if (this.dayGlow) {
      const rings = this.rings || (this.rings = scene.getObjectByName('fx:rings'));
      if (rings?.visible) for (const r of rings.children) if (r.isMesh) r.material.opacity = Math.min(0.92, r.material.opacity * 2.4);
    }
    if (d <= 0 && this.applied === 0) return;
    this.applied = d;

    // background and fog
    if (scene.background?.isColor) {
      if (inGlobe) scene.background.copy(DAY.spaceNight).lerp(DAY.space, d);
      else if (inField) scene.background.copy(DAY.fieldNight).lerp(DAY.fieldHaze, d);
      else scene.background.copy(BG).lerp(DAY.studioBg, d);
    }
    const fog = scene.fog;
    if (fog) {
      if (inField) { fog.color.copy(DAY.fieldNight).lerp(DAY.fieldHaze, d); fog.near = 40 + 30 * d; fog.far = 300 + 350 * d; }
      // (daylight: the fog starts past the nearest instrument, so the subject is never hazed, even in
      // the wide shot of all three from 17 m; the floor then runs back into the wall as a soft horizon)
      else if (!inGlobe) {
        const near = this.camera ? Math.min(30, Math.max(7, this.nearestStation() + 2.5)) : 7;
        fog.color.copy(BG).lerp(DAY.studioBg, d);
        fog.near = 8 + (near - 8) * d;
        fog.far = 24 + (Math.min(56, Math.max(42, near + 26)) - 24) * d;   // (inside the camera's 60 m far plane)
      }
    }
    scene.environmentIntensity *= 1 + (inField ? 1.0 : 1.1) * d;

    // the studio: a bright, seamless cyclorama. An even, high fill does most of the work; the keys
    // are broad and soft (no hard, blotchy pools on the floor); the floor is paper white with a faint
    // grid and fades into the wall through the fog; contact shadows stay to ground the instruments.
    stage.floor.material.color.copy(b.floor).lerp(DAY.floor, d);
    stage.floor.material.emissive.copy(b.floorGlow).lerp(DAY.floorGlow, d);
    const fm = d > 0.5 ? this.dayFloor : this.nightFloor;
    if (fm && stage.floor.material.map !== fm) stage.floor.material.map = fm;
    stage.hemi.color.copy(b.hemiSky).lerp(DAY.hemiSky, d);
    stage.hemi.groundColor.copy(b.hemiGround).lerp(DAY.hemiGround, d);
    stage.hemi.intensity = b.hemi + (2.1 - b.hemi) * d;
    for (const [k, st] of Object.entries(stage.stations)) {
      st.keyLight.color.copy(b.key).lerp(DAY.key, d);
      st.keyLight.intensity *= inField ? 1 - 0.5 * d : 1 - 0.45 * d;
      // (cone and edge are uniforms: a wider, fully soft cone in the studio's daylight)
      if (!inField) {
        st.keyLight.angle = (24 + 14 * d) * DEG;
        st.keyLight.penumbra = 0.65 + 0.35 * d;
      }
      st.keyLight.shadow.intensity = 1 - 0.35 * d;
      st.rim.color.copy(b.rim).lerp(DAY.rim, d);
      st.rim.intensity *= 1 - 0.45 * d;
      st.kick.intensity *= 1 - 0.4 * d;
      // (in daylight the contact shadows are the instruments' only grounding on the bright floor and the
      // sunlit gravel: full strength)
      if (st.contact) {
        st.contact.plane.material.opacity = Math.min(1, b.contact[k] * (1 + 0.12 * d));
        // on the bright floor and the sunlit gravel the shadow itself is denser (a uniform of the
        // depth pass: the shadow map is redrawn once when it changes)
        const dk = st.contact.depthMat?.userData?.darkness;
        if (dk) {
          if (st.contact.darkBase === undefined) st.contact.darkBase = dk.value;
          const want = st.contact.darkBase * (this.dayGlow ? (inField ? 1.9 : 1.9) : 1);
          if (Math.abs(dk.value - want) > 1e-3) { dk.value = want; st.contact.dirty = true; }
        }
      }
    }

    // the field: a clear day, the sun higher and white, the far ridges in blue haze
    field.skyMat.uniforms.day.value = d;
    field.sun.color.copy(b.sun).lerp(DAY.sun, d);
    field.sun.position.copy(b.sunPos).lerp(this.sunDay, d);
    if (inField) field.sun.intensity *= 1 + 0.45 * d;   // (rewritten each frame only in the field)
    field.skyLight.color.copy(b.skyTop).lerp(DAY.skyTop, d);
    field.skyLight.groundColor.copy(b.skyGround).lerp(DAY.skyGround, d);
    if (inField) field.skyLight.intensity *= 1 + 0.9 * d;
    (field.ridges || []).forEach((m, i) => m.material.color.copy(b.ridges[i]).lerp(DAY.ridges[i], d));

    // the planet: the sun over the site, a brighter day side, fainter stars
    globe.uniforms.uDay.value = d;
    globe.sun.copy(globe.sunDusk).lerp(globe.sunNoon, d).normalize();
    if (inGlobe) globe.starMat.uniforms.uAlpha.value *= 1 - 0.6 * d;
  }

  /** Camera distance to the nearest studio station (metres). */
  nearestStation() {
    let m = Infinity;
    for (const st of Object.values(this.stage.stations)) m = Math.min(m, this.camera.position.distanceTo(st.pos));
    return Number.isFinite(m) ? m : 0;
  }

  /** Post settings for the frame: less bloom, vignette and grain; dips go to white. */
  post(o) {
    const d = this.d;
    // (a bright floor is over the bloom threshold: no haze over the subject; grain on paper white
    // reads as dirt and a dark vignette as smog)
    o.bloom *= 1 - 0.85 * d;
    o.vignette *= 1 - 0.7 * d;
    o.grain *= 1 - 0.6 * d;
    // (the cool anamorphic streak smears the bright floor sideways across whatever stands on it: on
    // paper white it reads as a fog over the instruments' legs. Night only.)
    o.streakScale = 1 - d;
    o.fadeLevel = 0.85 * d;
    return o;
  }
}
