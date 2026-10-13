import { Fragment, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { motionFlags } from "./useLandingMotion";

/* The landing's continuous loops (the JS side; the CSS loops live in landing.css under "loops").
   Every loop runs only while its block is on screen and the tab is visible, and never for reduced
   motion or ?motion=0 (a static first frame instead). Ported ideas from React Bits, rewritten as
   transform / opacity / clip-path only, with no animation library:
     · RotatingText  (React Bits "Rotating Text", framer-motion → CSS transitions, per-character stagger)
     · Shimmer       (React Bits "Shiny Text", background-image repaint → a clip-path glint copy)
     · Ticker        (React Bits "Decrypted Text", a brief per-digit scramble when a readout changes)
*/

/** reduced motion / ?motion=0, read once per mount */
export function useCalm() {
  const [calm] = useState(() => motionFlags().calm);
  return calm;
}

/** true while `ref` is on screen and the tab is visible (and `enabled`) */
export function useLive(ref: RefObject<Element>, enabled = true, rootMargin = "0px") {
  const [live, setLive] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) { setLive(false); return; }
    if (!("IntersectionObserver" in window)) { setLive(!document.hidden); return; }
    let seen = false;
    const upd = () => setLive(seen && !document.hidden);
    const io = new IntersectionObserver(([e]) => { seen = e.isIntersecting; upd(); }, { rootMargin });
    io.observe(el);
    document.addEventListener("visibilitychange", upd);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", upd); };
  }, [ref, enabled, rootMargin]);
  return live;
}

/**
 * A photo slideshow's clock. Layers are mounted one ahead (`upto`), and the next photo is decoded before
 * it fades in, so a crossfade never shows a half-loaded image. `prev` stays opaque under the incoming
 * layer for the whole fade (no dip to the background).
 */
export function useSlides(count: number, interval: number, run: boolean, root: RefObject<HTMLElement>) {
  const [s, set] = useState({ cur: 0, prev: -1, upto: 0 });
  useEffect(() => {
    if (!run || count < 2) return;
    const next = (s.cur + 1) % count;
    if (s.upto < next) set((v) => ({ ...v, upto: Math.max(v.upto, next) }));
    let dead = false;
    const t = window.setTimeout(async () => {
      const img = root.current?.querySelector<HTMLImageElement>(`[data-slide="${next}"] img`);
      try { if (img) await img.decode(); } catch { /* a broken photo: the crossfade still runs */ }
      if (!dead) set((v) => ({ cur: next, prev: v.cur, upto: v.upto }));
    }, interval);
    return () => { dead = true; clearTimeout(t); };
    // `upto` is deliberately not a dependency: mounting the next layer must not restart the clock
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, s.cur, count, interval, root]);
  return s;
}

/** class for a slideshow layer */
export const slideClass = (i: number, s: { cur: number; prev: number }) => (i === s.cur ? " is-on" : i === s.prev ? " is-prev" : "");

/**
 * Rotating text: the phrases are stacked in one grid cell, so the block always has the size of the
 * largest phrase and nothing around it moves. Characters rise in with a stagger; the old phrase lifts out.
 * Controlled by `index`. Screen readers get `label` (stable), the animation is aria-hidden.
 */
export function RotatingText({ texts, index, label, className }: { texts: string[]; index: number; label: string; className?: string }) {
  const [st, setSt] = useState({ cur: index, out: -1 });
  if (st.cur !== index) setSt({ cur: index, out: st.cur });
  return (
    <>
      <span className="ld-sr">{label}</span>
      <span className={`ld-rot${className ? " " + className : ""}`} aria-hidden="true">
        {texts.map((t, i) => {
          let ci = 0;
          return (
            <span key={t} className={`ld-rot__p${i === st.cur ? " is-on" : i === st.out ? " is-out" : ""}`}>
              {t.split(" ").map((w, wi) => (
                <Fragment key={wi}>
                  {wi > 0 ? " " : null}
                  <span className="ld-rot__w">
                    {Array.from(w).map((ch, k) => (
                      <span key={k} className="ld-rot__c" style={{ ["--ci" as string]: ci++ }}>{ch}</span>
                    ))}
                  </span>
                </Fragment>
              ))}
            </span>
          );
        })}
      </span>
    </>
  );
}

/** a light glint that sweeps across the text now and then (a clip-path band over a copy of the text) */
export function Shimmer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={`ld-shine${className ? " " + className : ""}`}>
      {children}
      <span className="ld-shine__glint" aria-hidden="true">{children}</span>
    </span>
  );
}

const DIGITS = "0123456789";

/**
 * A HUD readout that changes every `every` ms while `live`; the digits that change scramble for a few
 * frames first (fixed-width mono digits, so the readout never changes width). Writes the DOM directly.
 */
export function Ticker({ next, every, live, initial, className }: { next: () => string; every: number; live: boolean; initial: string; className?: string }) {
  const el = useRef<HTMLSpanElement>(null);
  const nextRef = useRef(next);
  nextRef.current = next;
  useEffect(() => {
    const node = el.current;
    if (!node || !live) return;
    let timers: number[] = [];
    const show = (target: string) => {
      const from = node.textContent || "";
      const steps = 5;
      for (let k = 1; k <= steps; k++) {
        timers.push(window.setTimeout(() => {
          node.textContent = k === steps ? target : Array.from(target).map((ch, i) =>
            ch !== from[i] && DIGITS.includes(ch) && i >= (target.length * k) / (steps + 1) - 1 ? DIGITS[(Math.random() * 10) | 0] : ch
          ).join("");
        }, k * 55));
      }
    };
    const id = window.setInterval(() => { timers.forEach(clearTimeout); timers = []; show(nextRef.current()); }, every);
    return () => { clearInterval(id); timers.forEach(clearTimeout); };
  }, [live, every]);
  return <span ref={el} className={className}>{initial}</span>;
}
