import { useEffect, useRef, useState } from "react";
import { MILESTONES } from "./content";

const DWELL = 3000; // ms on each milestone
const START = 2400; // ms after the entrance before the loop takes over

/**
 * The milestone rail, alive: once it has drawn itself in, a survey signal travels dot to dot on a loop. The milestone
 * it reaches lights up (dot, ring, photo push-in and a sweep of light, year in blue, a dwell bar under the label) and
 * the rule behind it fills; after "Today" the fill drains and the signal fades back to 1913. Hover or focus pins a
 * milestone (the loop waits); off screen, in a hidden tab or under reduced motion it doesn't run. Where the rail
 * scrolls sideways (phones) the active milestone is kept in view unless the visitor is scrolling it themselves.
 */
export default function Timeline() {
  const ol = useRef<HTMLOListElement>(null);
  const comet = useRef<HTMLSpanElement>(null);
  const [on, setOn] = useState(-1);
  const pinned = useRef<number | null>(null);
  const touchedAt = useRef(0);

  // the loop
  useEffect(() => {
    const el = ol.current;
    if (!el) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches || new URLSearchParams(location.search).get("motion") === "0";
    if (still) return;
    // ?tl=force (review): run regardless of visibility (a background tab never reports it)
    const force = new URLSearchParams(location.search).get("tl") === "force";
    let visible = force, timer = 0, started = force;
    const step = () => {
      if (pinned.current === null && visible && (force || !document.hidden)) setOn((k) => (k + 1) % MILESTONES.length);
      timer = window.setTimeout(step, DWELL);
    };
    if (force) timer = window.setTimeout(step, 300);
    const io = new IntersectionObserver(([e]) => {
      visible = force || e.isIntersecting;
      if (visible && !started) { started = true; timer = window.setTimeout(step, START); }
    }, { threshold: 0.35 });
    io.observe(el);
    return () => { io.disconnect(); clearTimeout(timer); };
  }, []);

  // React must not own the rail's class list: useMotion adds .is-in to it, and a re-render would wipe that
  useEffect(() => { ol.current?.classList.toggle("is-looping", on >= 0); }, [on]);

  // the signal: glide to the active dot (fade across the wrap instead of sliding back over the rail)
  useEffect(() => {
    const el = ol.current, c = comet.current;
    if (!el || !c || on < 0) return;
    const place = () => {
      const dot = el.children[on + 1]?.querySelector<HTMLElement>(".tm-tl-mark i"); // children[0] is the comet
      if (!dot) return;
      const r = dot.getBoundingClientRect(), o = el.getBoundingClientRect();
      const x = r.left - o.left + el.scrollLeft + r.width / 2, y = r.top - o.top + r.height / 2;
      const wrap = on === 0 && c.dataset.at !== undefined && Number(c.dataset.at) > 0;
      c.dataset.at = String(on);
      if (wrap) {
        c.classList.add("is-wrap");
        window.setTimeout(() => { c.style.transform = `translate3d(${x}px, ${y}px, 0)`; requestAnimationFrame(() => c.classList.remove("is-wrap")); }, 420);
      } else {
        c.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }
      // phones: keep the active milestone in view, unless the visitor is scrolling the rail
      if (el.scrollWidth > el.clientWidth + 4 && performance.now() - touchedAt.current > 4000) {
        const li = el.children[on + 1] as HTMLElement;
        el.scrollTo({ left: li.offsetLeft - 12, behavior: "smooth" }); // li.offsetLeft is relative to the rail
      }
    };
    place();
    addEventListener("resize", place);
    return () => removeEventListener("resize", place);
  }, [on]);

  const pin = (i: number | null) => { pinned.current = i; if (i !== null) setOn(i); };

  return (
    <ol ref={ol} className="tm-wrap tm-timeline" data-in
      onPointerDown={() => { touchedAt.current = performance.now(); }} onScroll={() => { touchedAt.current = performance.now(); }}>
      <span ref={comet} className="tm-tl-comet" aria-hidden="true" />
      {MILESTONES.map((m, i) => (
        <li key={m.year} className={i === on ? "is-on" : i < on ? "is-past" : undefined} style={{ ["--d" as string]: `${0.25 + i * 0.16}s` }}
          onMouseEnter={() => pin(i)} onMouseLeave={() => pin(null)} onFocus={() => pin(i)} onBlur={() => pin(null)} tabIndex={0}>
          <div className="tm-tl-img"><img src={m.img} alt="" loading="lazy" /></div>
          <span className="tm-tl-mark" aria-hidden="true"><i /></span>
          <p className="tm-tl-year">{m.year}</p>
          <p className="tm-tl-label">{m.label}</p>
          <p className="tm-tl-note">{m.note}</p>
        </li>
      ))}
    </ol>
  );
}
