import { useEffect, useLayoutEffect } from "react";

/**
 * Home's motion: the Our Team page's (team/useMotion.ts), with the prototype landing's details
 * (showcase-v2/js/landing.js). Everything is CSS-driven; this only adds classes and one custom property.
 *  · entrances — every [data-in] block gets `.is-in` once, the first time it is well into view; the CSS
 *    plays the choreography (line masks, diagonal wipes, rise-in; staggers read --d).
 *  · the hero — `.is-in` once `ready` (the brand intro has started to leave, or never played), two frames
 *    after its starting state has been drawn (a timer covers a background tab, where frames never come).
 *  · count-ups — [data-ld-count] figures count from data-from (default 0) when their block arrives. Not
 *    [data-count]: the site-wide useReveal owns that attribute (and groups digits: "1,913").
 *  · loops — [data-loop] blocks get `.is-live` only while on screen (their CSS loops pause otherwise,
 *    through --ld-play); `.ld-tab-hidden` pauses them all in a background tab, `.ld-lite` trims them.
 *    The JS loops (slideshows, rotating text, readouts) are in loops.tsx.
 *  · drift — [data-drift="k"] images move with scroll by k × their frame's distance from the viewport
 *    centre, as --drift; one rAF per scroll, transform only. Off for reduced motion, weak touch devices
 *    and the lite tier (`lite`).
 * Review hooks: ?motion=0 shows every block in its final state with nothing animating (`.ld-still`);
 * ?reduced=1 forces reduced motion (`.ld-reduced`).
 */
export function motionFlags() {
  const q = new URLSearchParams(location.search);
  const still = q.get("motion") === "0";
  const reduced = q.has("reduced") ? q.get("reduced") !== "0" : matchMedia("(prefers-reduced-motion: reduce)").matches;
  return { still, reduced, calm: still || reduced };
}

const fmt = (el: HTMLElement, v: number) => `${el.dataset.prefix || ""}${Math.round(v)}${el.dataset.suffix || ""}`;

function runCounts(scope: Element, calm: boolean) {
  for (const el of scope.querySelectorAll<HTMLElement & { __counted?: boolean }>("[data-ld-count]")) {
    if (el.__counted) continue;
    el.__counted = true;
    const to = Number(el.dataset.ldCount), from = Number(el.dataset.from || 0);
    if (calm) { el.textContent = fmt(el, to); continue; }
    const D = 1600, t0 = performance.now();
    let done = false;
    const tick = (now: number) => {
      if (done) return;
      const p = Math.min(1, (now - t0) / D);
      el.textContent = fmt(el, from + (to - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick); else done = true;
    };
    requestAnimationFrame(tick);
    // a background tab never runs rAF: land on the figure anyway
    setTimeout(() => { done = true; el.textContent = fmt(el, to); }, D + 400);
  }
}

export default function useLandingMotion(root: React.RefObject<HTMLElement>, { ready, lite }: { ready: boolean; lite: boolean }) {
  // before first paint: the flags, and the count-ups at their starting figure
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const { still, reduced, calm } = motionFlags();
    el.classList.toggle("ld-still", still);
    el.classList.toggle("ld-reduced", reduced);
    if (!calm) for (const n of el.querySelectorAll<HTMLElement>("[data-ld-count]")) n.textContent = fmt(n, Number(n.dataset.from || 0));
  }, [root]);

  // entrances + count-ups + loops
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const { calm } = motionFlags();
    const ins = [...el.querySelectorAll<HTMLElement>("[data-in]")];
    const reveal = (n: Element) => { n.classList.add("is-in"); runCounts(n, calm); };
    let io: IntersectionObserver | null = null;
    if (calm || !("IntersectionObserver" in window)) ins.forEach(reveal);
    else {
      io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          reveal(e.target);
          io?.unobserve(e.target);
        }
      }, { rootMargin: "0px 0px -12% 0px", threshold: 0.1 });
      ins.forEach((n) => io!.observe(n));
    }
    const loops = [...el.querySelectorAll<HTMLElement>("[data-loop]")];
    let lio: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window) {
      lio = new IntersectionObserver((entries) => {
        for (const e of entries) e.target.classList.toggle("is-live", e.isIntersecting);
      }, { rootMargin: "80px 0px" });
      loops.forEach((n) => lio!.observe(n));
    } else loops.forEach((n) => n.classList.add("is-live"));
    return () => { io?.disconnect(); lio?.disconnect(); };
  }, [root]);

  // the continuous loops: `.ld-lite` (lite tier: crossfades only, no Ken Burns or sweeps) and
  // `.ld-tab-hidden` (every CSS loop paused while the tab is in the background)
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    el.classList.toggle("ld-lite", lite);
    const vis = () => el.classList.toggle("ld-tab-hidden", document.hidden);
    vis();
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, [root, lite]);

  // the hero plays as the page appears, or as the brand intro leaves it
  useEffect(() => {
    const hero = root.current?.querySelector(".ld-hero");
    if (!hero || !ready) return;
    const show = () => hero.classList.add("is-in");
    if (motionFlags().calm) { show(); return; }
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(show); });
    const t = setTimeout(show, 260);
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); clearTimeout(t); };
  }, [root, ready]);

  // scroll drift
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const { calm } = motionFlags();
    const nav = navigator as Navigator & { deviceMemory?: number };
    const weakTouch = matchMedia("(pointer: coarse)").matches && ((nav.hardwareConcurrency || 8) <= 4 || (nav.deviceMemory ?? 8) <= 4);
    const drifts = calm || weakTouch || lite ? [] : [...el.querySelectorAll<HTMLElement>("[data-drift]")];
    if (!drifts.length) {
      el.querySelectorAll<HTMLElement>("[data-drift]").forEach((d) => d.style.removeProperty("--drift"));
      return;
    }
    let raf = 0;
    const measure = () => {
      raf = 0;
      const vh = innerHeight;
      for (const d of drifts) {
        // measure the untransformed frame, so the drift never feeds back into itself
        const frame = d.closest(".ld-wipe, .ld-hero__media, .ld-band__bg") || d.parentElement || d;
        const r = frame.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) continue;
        const k = Number(d.dataset.drift) || 0.05;
        d.style.setProperty("--drift", `${((r.top + r.height / 2 - vh / 2) * k).toFixed(1)}px`);
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    measure();
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [root, lite]);
}
