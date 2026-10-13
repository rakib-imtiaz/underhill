// Fly mode: sound, all synthesised with WebAudio (no files). Nothing is created until the first user
// gesture (browsers keep audio muted before one anyway); the toggle is remembered ('uh-fly-sound').
//   shutter()   a mechanical-sounding click (a noise burst through a band-pass, then a softer second)
//   beep(kind)  'warn' two short tones, 'ok' one rising tone
//   rotor(k)    a soft filtered-noise hum whose level and pitch follow the rotor speed (0..1)
const KEY = 'uh-fly-sound';

export class Sfx {
  constructor() {
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
    this.enabled = saved !== '0';
    this.ctx = null;
    this.unlocked = false;
    const unlock = () => { this.unlocked = true; if (this.enabled) this.ensure(); removeEventListener('pointerdown', unlock, true); removeEventListener('keydown', unlock, true); };
    addEventListener('pointerdown', unlock, true);
    addEventListener('keydown', unlock, true);
  }

  ensure() {
    if (this.ctx || !this.unlocked) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 0.6; this.master.connect(c.destination);
    // a looping noise buffer shared by the shutter and the rotor hum
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // rotor hum
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    this.hf = c.createBiquadFilter(); this.hf.type = 'bandpass'; this.hf.frequency.value = 160; this.hf.Q.value = 1.4;
    this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 600;
    this.hum = c.createGain(); this.hum.gain.value = 0;
    src.connect(this.hf); this.hf.connect(this.lp); this.lp.connect(this.hum); this.hum.connect(this.master);
    src.start();
    return c;
  }

  setEnabled(on) {
    this.enabled = !!on;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* fine */ }
    if (on) this.ensure();
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.6 : 0, this.ctx.currentTime, 0.05);
  }

  shutter() {
    const c = this.enabled && this.ensure(); if (!c) return;
    const t = c.currentTime;
    for (const [dt, g0, f] of [[0, 0.9, 3200], [0.07, 0.45, 2200]]) {
      const s = c.createBufferSource(); s.buffer = this.noise;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 0.9;
      const g = c.createGain(); g.gain.setValueAtTime(g0, t + dt); g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.045);
      s.connect(bp); bp.connect(g); g.connect(this.master);
      s.start(t + dt, Math.random()); s.stop(t + dt + 0.06);
    }
  }

  beep(kind = 'warn') {
    const c = this.enabled && this.ensure(); if (!c) return;
    const t = c.currentTime;
    const tones = kind === 'ok' ? [[0, 660], [0.09, 990]] : [[0, 880], [0.16, 880]];
    for (const [dt, f] of tones) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t + dt); g.gain.exponentialRampToValueAtTime(0.18, t + dt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.11);
      o.connect(g); g.connect(this.master); o.start(t + dt); o.stop(t + dt + 0.13);
    }
  }

  rotor(k) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    this.hum.gain.setTargetAtTime(0.05 * k, t, 0.15);
    this.hf.frequency.setTargetAtTime(110 + 120 * k, t, 0.2);
  }
}
