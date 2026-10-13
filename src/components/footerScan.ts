import { deviceTier } from "../hero/device";

/**
 * The footer band's scanner. A LiDAR-style lens turns the Yukon photo into survey points wherever it looks, a
 * sweep scans the whole range on a loop, and the lens locks on to an office when it reaches one.
 *
 * The points come from a returns map made offline from the photo (/team/footer-scan.png — R: return strength,
 * G: depth below the skyline), so they sit on the real terrain and the sky returns nothing.
 *
 * Aiming: a mouse steers the lens; on touch screens a tap or a sideways drag aims it, and after a pause it goes
 * back to its own route — the offices, then the features of the photo — so the band never goes still.
 * `?motion=0` draws one still frame, locked on Whitehorse.
 */

const MAP_W = 288, MAP_H = 162; // the returns map
const IMG_W = 1920, IMG_H = 1080, POS_X = 0.62, POS_Y = 0.4; // the photo, and its object-position in footer.css
const INSET = 24; // .sf-band-bg overhangs the band by this much, so the parallax never shows an edge
const CELL = 24; // spatial buckets for the points, in px

// far (ice white) to near (survey blue)
const FAR = [226, 245, 255], NEAR = [56, 158, 232];
const RAMP = 8;
const COLORS = Array.from({ length: RAMP }, (_, i) =>
  `rgb(${FAR.map((f, j) => Math.round(f + ((NEAR[j] - f) * i) / (RAMP - 1))).join(",")})`);

// features of the photo the lens visits on its own route (fractions of the photo)
const FEATURES: [number, number][] = [
  [0.479, 0.205], // the snow peak, centre
  [0.417, 0.43], // the snowfield on the near ridge
  [0.718, 0.705], // the surveyor on the ridge
  [0.86, 0.22], // the peaks, right
  [0.3, 0.62], // the forest below the ridge
  [0.55, 0.3], // the snow slopes (these three also fall inside a phone's crop)
  [0.66, 0.255], // the peaks, right of centre
  [0.6, 0.38], // the near ridge line
];
// the photo's extent, for the live readout (the range above Whitehorse)
const LAT0 = 60.8, LAT1 = 60.64, LON0 = -135.3, LON1 = -134.8;

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Stop = { pin: number } | { u: number; v: number };

export function startScan(band: HTMLElement): () => void {
  const wrap = band.querySelector<HTMLElement>(".sf-band-bg");
  const canvas = band.querySelector<HTMLCanvasElement>(".sf-scan");
  const ret = band.querySelector<HTMLElement>(".sf-reticle");
  const copy = band.querySelector<HTMLElement>(".sf-band-copy");
  const ctx = canvas?.getContext("2d");
  if (!wrap || !canvas || !ret || !copy || !ctx) return () => {};
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};

  const tag = ret.querySelector<HTMLElement>(".sf-ret-tag");
  const kick = band.querySelector<HTMLElement>(".sf-coord-k");
  const latEl = band.querySelector<HTMLElement>(".sf-coord-lat");
  const lonEl = band.querySelector<HTMLElement>(".sf-coord-lon");
  const pins = [...band.querySelectorAll<HTMLElement>(".sf-pin")];
  const still = new URLSearchParams(location.search).get("motion") === "0";
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const tier = deviceTier();
  const lowEnd = tier === "phone" && (navigator.hardwareConcurrency || 8) <= 4;

  // ---------------- the points ----------------
  let map: Uint8ClampedArray | null = null;
  const MAX = MAP_W * MAP_H * 2;
  const px = new Float32Array(MAX), py = new Float32Array(MAX), ps = new Float32Array(MAX);
  const pz = new Float32Array(MAX), ph = new Float32Array(MAX), pc = new Uint8Array(MAX);
  let n = 0, cols = 0, rows = 0;
  let start = new Int32Array(1), order = new Int32Array(0), stamp = new Int32Array(0);
  // this frame's lit points
  const cx = new Float32Array(MAX), cy = new Float32Array(MAX), ca = new Float32Array(MAX), cz = new Float32Array(MAX);
  const cc = new Uint8Array(MAX);
  // canvas size and the photo's cover fit inside it (canvas px = css px of .sf-band-bg)
  let W = 0, H = 0, dpr = 1, ox = 0, oy = 0, dw = 0, dh = 0;

  function build() {
    if (!map) return;
    W = wrap!.offsetWidth; H = wrap!.offsetHeight;
    if (!W || !H) return;
    dpr = Math.min(devicePixelRatio || 1, lowEnd ? 1 : tier === "desktop" ? 2 : 1.5);
    canvas!.width = Math.round(W * dpr); canvas!.height = Math.round(H * dpr);
    const k = Math.max(W / IMG_W, H / IMG_H);
    dw = IMG_W * k; dh = IMG_H * k; ox = (W - dw) * POS_X; oy = (H - dh) * POS_Y;
    const cs = dw / MAP_W, spawn = lowEnd ? 1 : 2, rand = seeded(7);
    n = 0;
    for (let my = 0; my < MAP_H; my++) for (let mx = 0; mx < MAP_W; mx++) {
      const i = (my * MAP_W + mx) * 4, s = map[i] / 255, d = map[i + 1] / 255;
      for (let j = 0; j < spawn; j++) {
        const r1 = rand(), r2 = rand(), r3 = rand();
        if (s === 0 || r1 > s * s * 0.9) continue;
        const x = ox + (mx + r2) * cs, y = oy + (my + r3) * cs;
        if (x < -2 || y < -2 || x > W + 2 || y > H + 2) continue;
        px[n] = x; py[n] = y; ps[n] = s; pz[n] = 1.1 + d * 1.1; ph[n] = r1 * 40; pc[n] = Math.min(RAMP - 1, Math.round(d * (RAMP - 1)));
        n++;
      }
    }
    // bucket the points by cell (counting sort)
    cols = Math.ceil(W / CELL) + 1; rows = Math.ceil(H / CELL) + 1;
    start = new Int32Array(cols * rows + 1); order = new Int32Array(n); stamp = new Int32Array(cols * rows);
    const cell = (p: number) => Math.min(rows - 1, Math.max(0, (py[p] / CELL) | 0)) * cols + Math.min(cols - 1, Math.max(0, (px[p] / CELL) | 0));
    for (let p = 0; p < n; p++) start[cell(p) + 1]++;
    for (let c = 0; c < cols * rows; c++) start[c + 1] += start[c];
    const fill = start.slice(0, cols * rows);
    for (let p = 0; p < n; p++) order[fill[cell(p)]++] = p;
  }

  // ---------------- band geometry ----------------
  let bw = 0, bh = 0, radius = 120, copyTop = 0, copyRight = 0;
  let pinXY: [number, number][] = [];
  const wide = () => bw >= 861;

  function measure() {
    bw = band.clientWidth; bh = band.clientHeight;
    const br = band.getBoundingClientRect();
    pinXY = pins.map((p) => {
      const r = (p.querySelector("i") ?? p).getBoundingClientRect();
      return [r.left + r.width / 2 - br.left, r.top + r.height / 2 - br.top];
    });
    copyTop = copy!.offsetTop;
    copyRight = Math.max(0, ...[...copy!.children].map((c) => c.getBoundingClientRect().right - br.left));
    radius = bw < 601 ? 62 : bw < 861 ? 100 : Math.min(150, Math.round(bw * 0.1));
    ret!.style.setProperty("--r", radius + "px");
    build();
  }

  // where the lens may roam on its own, and where a tap may aim it (clear of the copy)
  function zone(p: { x: number; y: number }, auto: boolean) {
    const m = 18;
    let x0 = m, y0 = m, x1 = bw - m, y1 = bh - m;
    if (wide()) { if (auto) x0 = Math.max(x0, copyRight + 60); }
    else if (auto) { x0 = bw * 0.36; y0 = 130; y1 = copyTop - radius - 6; } // on its own, clear of the corner readout and the headline
    else y1 = Math.max(m + 40, copyTop - 26);
    return { x: Math.min(x1, Math.max(x0, p.x)), y: Math.min(y1, Math.max(y0, p.y)), inside: p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 };
  }

  // ---------------- state ----------------
  let clock = 0, last = 0, raf = 0, running = false, alive = true, inAt = -1, frameId = 0;
  const pos = { x: 0, y: 0, vx: 0, vy: 0 };
  let target = { x: 0, y: 0 };
  let mode: "auto" | "pointer" | "touch" = "auto";
  let touching = false, touchUntil = 0;
  let route = -1, arrived = true, dwellUntil = 0, featTurn = 0, placed = false;
  let lock = -1, parX = 0, parY = 0, sc = 1.08, sweepBx = -1e9, lensCount = 0, readAt = 0;
  const timers: number[] = [];

  // canvas px <-> band px (the wrap is translated by the parallax and scaled by the entrance, about its centre)
  const toLocal = (x: number, y: number) => ({ x: (x + INSET - W / 2 - parX) / sc + W / 2, y: (y + INSET - H / 2 - parY) / sc + H / 2 });
  const toBand = (x: number, y: number) => ({ x: (x - W / 2) * sc + W / 2 - INSET + parX, y: (y - H / 2) * sc + H / 2 - INSET + parY });

  const seq: Stop[] = [];
  for (let i = 0; i < pins.length; i++) seq.push({ pin: i }, { u: -1, v: -1 });

  function resolve(s: Stop): { x: number; y: number } | null {
    if ("pin" in s) return pinXY[s.pin] ? { x: pinXY[s.pin][0], y: pinXY[s.pin][1] } : null;
    // a feature slot: the next feature of the photo that falls inside the roaming zone
    for (let k = 0; k < FEATURES.length; k++) {
      const [u, v] = FEATURES[(featTurn + k) % FEATURES.length];
      const b = toBand(ox + u * dw, oy + v * dh);
      if (zone(b, true).inside) { featTurn = (featTurn + k + 1) % FEATURES.length; return b; }
    }
    return null;
  }
  function nextStop() {
    for (let k = 0; k < seq.length; k++) {
      route = (route + 1) % seq.length;
      const t = resolve(seq[route]);
      if (t) { target = t; arrived = false; return; }
    }
  }

  function ping(i: number) {
    const p = pins[i];
    if (!p || p.classList.contains("is-ping")) return;
    p.classList.add("is-ping");
    timers.push(window.setTimeout(() => p.classList.remove("is-ping"), 1400));
  }

  function setLock(i: number) {
    if (i === lock) return;
    if (lock >= 0) pins[lock]?.classList.remove("is-lock");
    lock = i;
    if (lock >= 0) { pins[lock]?.classList.add("is-lock"); ping(lock); }
    ret!.classList.toggle("is-lock", lock >= 0);
    readAt = 0;
  }

  const setText = (el: HTMLElement | null, s: string) => { if (el && el.textContent !== s) el.textContent = s; };

  function readout() {
    if (lock >= 0) {
      const p = pins[lock];
      setText(kick, "Locked · " + (p.dataset.name ?? ""));
      setText(latEl, p.dataset.lat ?? ""); setText(lonEl, p.dataset.lon ?? "");
      setText(tag, "Station");
    } else {
      const L = toLocal(pos.x, pos.y), u = (L.x - ox) / dw, v = (L.y - oy) / dh;
      setText(kick, "Live scan");
      setText(latEl, (LAT0 + (LAT1 - LAT0) * v).toFixed(4) + "° N");
      setText(lonEl, Math.abs(LON0 + (LON1 - LON0) * u).toFixed(4) + "° W");
      setText(tag, lensCount.toLocaleString("en-CA") + " pts");
    }
  }

  // ---------------- a step of the simulation ----------------
  function step(dt: number) {
    clock += dt;
    if (inAt < 0 && band.classList.contains("is-in")) inAt = clock;
    const e = inAt < 0 ? 0 : Math.min(1, (clock - inAt) / 2.8);
    sc = 1 + 0.08 * Math.pow(1 - e, 3);
    if (inAt >= 0 && clock - inAt > 1.4) band.classList.add("is-scan");

    if (!placed && pinXY.length) { pos.x = pinXY[0][0]; pos.y = pinXY[0][1]; placed = true; }
    if (mode === "touch" && !touching && clock > touchUntil) { mode = "auto"; arrived = true; dwellUntil = clock + 0.4; }
    if (mode === "auto") {
      if (arrived && clock > dwellUntil) nextStop();
      const d = Math.hypot(target.x - pos.x, target.y - pos.y), v = Math.hypot(pos.vx, pos.vy);
      if (!arrived && d < 2.5 && v < 30) { arrived = true; dwellUntil = clock + ("pin" in seq[route] ? 2.1 : 1.2); }
    }
    const w = mode === "pointer" ? 13 : mode === "touch" ? 9 : 3.4;
    pos.vx += (w * w * (target.x - pos.x) - 2 * w * pos.vx) * dt;
    pos.vy += (w * w * (target.y - pos.y) - 2 * w * pos.vy) * dt;
    pos.x += pos.vx * dt; pos.y += pos.vy * dt;

    // lock on to the nearest office within reach
    let best = -1, bd = 30;
    pinXY.forEach(([x, y], i) => { const d = Math.hypot(x - pos.x, y - pos.y); if (d < bd) { bd = d; best = i; } });
    setLock(best);

    // parallax: the photo leans away from the lens
    const A = fine ? 22 : 12;
    const tpx = -(pos.x / (bw || 1) - 0.5) * A, tpy = -(pos.y / (bh || 1) - 0.5) * A * 0.6;
    parX += (tpx - parX) * Math.min(1, dt * 2.5); parY += (tpy - parY) * Math.min(1, dt * 2.5);
  }

  // the sweep: across the photo every few seconds, leaving a fading trail of points
  const trail = () => (bw < 601 ? 150 : 260);
  function sweepX(): number | null {
    if (inAt < 0) return null;
    const P = bw < 601 ? 7 : 8.5, D = Math.min(3.4, Math.max(1.8, W / 480));
    const ph0 = clock - inAt - 1.2;
    if (ph0 < 0) return null;
    const s = ((ph0 % P) / D) * (W + trail());
    return s < W + trail() ? s : null;
  }

  // ---------------- drawing ----------------
  function draw(stillSweep?: number) {
    if (!n || !W) return;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, W, H);
    const L = toLocal(pos.x, pos.y), lr = radius / sc, lr2 = lr * lr;
    const sx = stillSweep ?? sweepX(), tr = trail();
    const showLens = band.classList.contains("is-scan");

    // pings: the sweep reaching an office
    const sb = sx === null ? -1e9 : toBand(sx, 0).x;
    pinXY.forEach(([x], i) => { if (sweepBx < x && sb >= x) ping(i); });
    sweepBx = sb;

    // dim the photo under the lens and the sweep, so the points read
    if (showLens) {
      const g = ctx!.createRadialGradient(L.x, L.y, 0, L.x, L.y, lr);
      g.addColorStop(0, "rgba(2,18,38,0.5)"); g.addColorStop(0.7, "rgba(2,18,38,0.34)"); g.addColorStop(1, "rgba(2,18,38,0)");
      ctx!.fillStyle = g; ctx!.fillRect(L.x - lr, L.y - lr, lr * 2, lr * 2);
    }
    if (sx !== null) {
      const g = ctx!.createLinearGradient(sx - tr, 0, sx, 0);
      g.addColorStop(0, "rgba(3,12,24,0)"); g.addColorStop(1, "rgba(3,12,24,0.38)");
      ctx!.fillStyle = g; ctx!.fillRect(sx - tr, 0, tr, H);
    }

    // gather the lit points from the cells under the lens and the sweep
    frameId++;
    let m = 0;
    lensCount = 0;
    const visit = (c0: number, c1: number, r0: number, r1: number) => {
      c0 = Math.max(0, c0); r0 = Math.max(0, r0); c1 = Math.min(cols - 1, c1); r1 = Math.min(rows - 1, r1);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const ci = r * cols + c;
        if (stamp[ci] === frameId) continue;
        stamp[ci] = frameId;
        for (let k = start[ci]; k < start[ci + 1]; k++) {
          const p = order[k];
          let x = px[p], y = py[p], a = 0, z = pz[p];
          if (showLens) {
            const dx = x - L.x, dy = y - L.y, d2 = dx * dx + dy * dy;
            if (d2 < lr2) {
              // the lens magnifies a touch, and its points shimmer like live returns
              const q = 1 - Math.sqrt(d2) / lr, bulge = 1 + 0.14 * q;
              a = Math.min(1, q * 2.6) * (0.75 + 0.25 * Math.sin(clock * 5 + ph[p]));
              x = L.x + dx * bulge; y = L.y + dy * bulge; z *= 1 + 0.45 * q;
              lensCount++;
            }
          }
          if (sx !== null) {
            const b = sx - px[p];
            if (b >= 0 && b < tr) a = Math.max(a, Math.pow(1 - b / tr, 1.6));
            else if (b < 0 && b > -4) a = 1;
          }
          if (a > 0.03) { cx[m] = x; cy[m] = y; ca[m] = Math.min(1, a * (0.55 + 0.6 * ps[p])); cz[m] = z; cc[m] = pc[p]; m++; }
        }
      }
    };
    if (showLens) visit(((L.x - lr) / CELL) | 0, ((L.x + lr) / CELL) | 0, ((L.y - lr) / CELL) | 0, ((L.y + lr) / CELL) | 0);
    if (sx !== null) visit(((sx - tr) / CELL) | 0, ((sx + 4) / CELL) | 0, 0, rows - 1);

    // additive, so dense returns (snow, ridges) bloom
    ctx!.globalCompositeOperation = "lighter";
    for (let col = 0; col < RAMP; col++) {
      ctx!.fillStyle = COLORS[col];
      for (let j = 0; j < m; j++) {
        if (cc[j] !== col) continue;
        ctx!.globalAlpha = ca[j];
        const z = cz[j];
        ctx!.fillRect(cx[j] - z / 2, cy[j] - z / 2, z, z);
      }
    }
    ctx!.globalAlpha = 1;
    ctx!.globalCompositeOperation = "source-over";

    // the sweep's leading edge
    if (sx !== null) {
      const g = ctx!.createLinearGradient(sx - 40, 0, sx, 0);
      g.addColorStop(0, "rgba(92,192,245,0)"); g.addColorStop(1, "rgba(92,192,245,0.22)");
      ctx!.fillStyle = g; ctx!.fillRect(sx - 40, 0, 40, H);
      ctx!.fillStyle = "rgba(205,238,255,0.85)"; ctx!.fillRect(sx - 0.75, 0, 1.5, H);
    }

    // the HUD: the reticle, the corner readout (a few times a second)
    ret!.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0)`;
    ret!.classList.toggle("is-flip", pos.x > bw - 220);
    wrap!.style.translate = `${parX.toFixed(2)}px ${parY.toFixed(2)}px`;
    wrap!.style.scale = sc.toFixed(4);
    if (clock - readAt > 0.09 || clock < readAt) { readAt = clock; readout(); }
  }

  function frame(now: number) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    step(dt);
    draw();
    if (running) raf = requestAnimationFrame(frame);
  }
  function setRunning(on: boolean) {
    on = on && alive && !still && !document.hidden;
    if (on === running) return;
    running = on;
    if (on) { last = 0; raf = requestAnimationFrame(frame); } else cancelAnimationFrame(raf);
  }

  // ---------------- input ----------------
  const local = (e: PointerEvent) => { const r = band.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "mouse") {
      if (!fine) return;
      mode = "pointer"; target = local(e); band.classList.add("is-aim");
    } else if (touching) { target = zone(local(e), false); touchUntil = clock + 3.5; }
  };
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" || (e.target as Element).closest("a, button")) return;
    mode = "touch"; touching = true; target = zone(local(e), false); touchUntil = clock + 3.5;
  };
  const onUp = () => { touching = false; };
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    mode = "auto"; arrived = true; dwellUntil = clock + 0.5; band.classList.remove("is-aim");
  };
  band.addEventListener("pointermove", onMove);
  band.addEventListener("pointerdown", onDown);
  band.addEventListener("pointerup", onUp);
  band.addEventListener("pointercancel", onUp);
  band.addEventListener("pointerleave", onLeave);
  const onVis = () => setRunning(visible);
  document.addEventListener("visibilitychange", onVis);

  // ---------------- lifecycle ----------------
  let visible = false;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; setRunning(visible); });
  io.observe(band);
  const ro = new ResizeObserver(() => { measure(); if (still) snapshot(); });
  ro.observe(band);
  document.fonts?.ready.then(() => { if (alive) measure(); });

  function snapshot() {
    if (!n || !pinXY.length) return;
    band.classList.add("is-in", "is-scan");
    inAt = 0; clock = 10; sc = 1; parX = parY = 0;
    pos.x = pinXY[0][0]; pos.y = pinXY[0][1];
    setLock(0);
    sweepBx = 1e9; // no pings in a still
    draw(W * 0.62);
  }

  // the returns map loads once the band is near
  let loading = false;
  function loadMap() {
    if (loading) return;
    loading = true;
    const img = new Image();
    // onload, not decode(): Chrome holds decode() back in background tabs
    img.onload = () => {
      if (!alive) return;
      const c = document.createElement("canvas");
      c.width = MAP_W; c.height = MAP_H;
      const x = c.getContext("2d", { willReadFrequently: true });
      if (!x) return;
      x.drawImage(img, 0, 0, MAP_W, MAP_H);
      map = x.getImageData(0, 0, MAP_W, MAP_H).data;
      measure();
      if (still) snapshot();
    };
    img.src = "/team/footer-scan.png";
  }
  const near = new IntersectionObserver(([e]) => { if (e.isIntersecting) { near.disconnect(); loadMap(); } }, { rootMargin: "800px 0px" });
  near.observe(band);

  if (import.meta.env.DEV) {
    // review hook: drive the scanner by hand in a background tab (no rAF there)
    (band as unknown as Record<string, unknown>).__scan = {
      load: loadMap,
      tick(ms: number) { for (let t = 0; t < ms; t += 16) step(0.016); draw(); },
      aim(x: number, y: number) { mode = "pointer"; target = { x, y }; },
      free() { mode = "auto"; arrived = true; dwellUntil = clock; },
      state: () => ({ n, W, H, pos: { ...pos }, lock, mode, lensCount, sc, parX, parY, route }),
    };
  }

  return () => {
    alive = false;
    setRunning(false);
    io.disconnect(); ro.disconnect(); near.disconnect();
    timers.forEach(clearTimeout);
    band.removeEventListener("pointermove", onMove);
    band.removeEventListener("pointerdown", onDown);
    band.removeEventListener("pointerup", onUp);
    band.removeEventListener("pointercancel", onUp);
    band.removeEventListener("pointerleave", onLeave);
    document.removeEventListener("visibilitychange", onVis);
  };
}
