import { createElement, useEffect, useRef } from "react";
import { GEAR_ICONS, KIT, type KitEntry } from "./kit-data";
import { GEAR_URL, gearHref } from "./urls";
import { Arrow, PHOTOS, d } from "./parts";
import { motionFlags } from "./useLandingMotion";

/* "The tools behind the data": a sideways rail of the kit. The first four read like the mockup's product
   cards; the rest of the kit follows in kit-data order. Photos: the draft crops where one exists, then
   the kit's own photo, else a blueprint panel with the gear's line icon. Upcoming gear (no 3D model and
   no photo yet) stays off Home; it is still listed, marked Upcoming, on the gear page. Each card opens
   the gear playground on that instrument (<experience>/gear.html?g=<id>). */

type Card = KitEntry & { title: string; photoStem?: string; w?: number; h?: number };

const FEATURED: { id: string; title: string; line: string; photoStem?: string; w?: number; h?: number }[] = [
  { id: "r12i-tsc7", title: "GNSS Solutions", line: "Centimetre-level accuracy for any environment.", photoStem: "draft-gear-r12i", w: 224, h: 150 },
  // (the S7 is the total station with a 3D model; the card keeps the total-station photo)
  { id: "s7-robotic", title: "Total Stations", line: "Reliable, high-precision surveying for complex sites.", photoStem: "draft-gear-sx10", w: 283, h: 149 },
  { id: "m350-mapper", title: "UAV & LiDAR Systems", line: "High-resolution aerial data capture and mapping.", photoStem: "draft-gear-m350", w: 282, h: 283 },
  { id: "leica-p50", title: "Reality Capture", line: "Laser scanning that turns sites into models you can measure." },
];
const DRAFT_PHOTOS: Record<string, { photoStem: string; w: number; h: number }> = {
  "trinity-f90": { photoStem: "draft-gear-trinity-f90", w: 324, h: 283 },
};
const featuredIds = new Set(FEATURED.map((f) => f.id));
const byId = new Map(KIT.map((g) => [g.id, g]));
const CARDS: Card[] = [
  ...FEATURED.flatMap((f) => {
    const g = byId.get(f.id);
    return g ? [{ ...g, ...f }] : [];
  }),
  ...KIT.filter((g) => !featuredIds.has(g.id)).map((g) => ({ ...g, title: g.short, ...(DRAFT_PHOTOS[g.id] || {}) })),
]
  .filter((c) => !isUpcoming(c))
  // the ones you can explore in 3D lead the rail (stable: otherwise in the order above)
  .sort((a, b) => Number(b.status === "ready") - Number(a.status === "ready"));

/** not built yet: no 3D model and no photo of any kind */
function isUpcoming(c: Card) {
  return c.status !== "ready" && !c.photoStem && !c.photo;
}

/** the card's call to action: a cube in a turning orbit (a 3D model to explore) or a play mark */
const CubeIcon = () => (
  <svg viewBox="0 0 24 24" className="ld-ico-cube">
    <path d="M12 6.2 16.6 8.8v5.4L12 16.8l-4.6-2.6V8.8z" />
    <path d="M7.4 8.8 12 11.4l4.6-2.6M12 11.4v5.4" />
    <ellipse className="ld-ico-orbit" cx="12" cy="12" rx="10" ry="4.2" transform="rotate(-18 12 12)" />
  </svg>
);
const PlayIcon = () => (
  <svg viewBox="0 0 24 24" className="ld-ico-play">
    <path d="M9.5 7.6v8.8l7-4.4z" />
  </svg>
);

/** a GEAR_ICONS entry (inner SVG markup) as React elements */
function GearIcon({ name }: { name: string }) {
  const src = GEAR_ICONS[name] || "";
  const kids = [...src.matchAll(/<(\w+)([^>]*?)\/>/g)].map(([, tag, attrs], i) => {
    const props: Record<string, string> = { key: String(i) };
    for (const [, k, v] of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) props[k.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())] = v;
    return createElement(tag, props);
  });
  return (
    <svg className="ld-bp__icon" viewBox="0 0 24 24">
      {kids}
    </svg>
  );
}

function CardMedia({ c, i }: { c: Card; i: number }) {
  if (c.photoStem) {
    return (
      <picture>
        <source type="image/avif" srcSet={`${PHOTOS}${c.photoStem}.avif`} />
        <img src={`${PHOTOS}${c.photoStem}.webp`} width={c.w} height={c.h} alt="" loading="lazy" decoding="async" />
      </picture>
    );
  }
  if (c.photo) return <img src={PHOTOS + c.photo} width={1200} height={800} alt="" loading="lazy" decoding="async" />;
  return (
    <div className="ld-bp" aria-hidden="true">
      <GearIcon name={c.icon} />
      <span className="ld-bp__fig">Fig. {String(i + 1).padStart(2, "0")}</span>
      <span className="ld-bp__note">{c.status === "ready" ? "Open in 3D" : "Photo to come"}</span>
      <span className="ld-bp__scan" />
    </div>
  );
}

function useRail(rail: React.RefObject<HTMLDivElement>, list: React.RefObject<HTMLUListElement>, prev: React.RefObject<HTMLButtonElement>, next: React.RefObject<HTMLButtonElement>) {
  useEffect(() => {
    const r = rail.current, l = list.current;
    if (!r || !l) return;
    const { calm } = motionFlags();
    const behavior: ScrollBehavior = calm ? "auto" : "smooth";
    const cards = () => [...l.children] as HTMLElement[];
    const stepPx = () => {
      const c = cards();
      return c.length < 2 ? r.clientWidth : c[1].offsetLeft - c[0].offsetLeft; // card width + gap
    };
    const update = () => {
      const max = r.scrollWidth - r.clientWidth - 2;
      if (prev.current) prev.current.disabled = r.scrollLeft <= 2;
      if (next.current) next.current.disabled = r.scrollLeft >= max;
    };
    const page = (dir: number) => {
      const step = stepPx();
      const n = Math.max(1, Math.floor((r.clientWidth + 8) / step));
      r.scrollBy({ left: dir * n * step, behavior });
    };
    const onPrev = () => page(-1), onNext = () => page(1);
    prev.current?.addEventListener("click", onPrev);
    next.current?.addEventListener("click", onNext);
    let raf = 0;
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    r.addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", update);
    update();
    const t = setTimeout(update, 300);

    // mouse drag (touch and pens scroll natively); a drag never also clicks the card under it
    let drag: { x: number; left: number; id: number } | null = null, moved = false;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      drag = { x: e.clientX, left: r.scrollLeft, id: e.pointerId };
      moved = false;
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      if (!moved && Math.abs(dx) > 6) { moved = true; r.classList.add("is-dragging"); r.setPointerCapture(e.pointerId); }
      if (moved) r.scrollLeft = drag.left - dx;
    };
    const end = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      if (moved) {
        r.classList.remove("is-dragging");
        const step = stepPx();
        r.scrollTo({ left: Math.round(r.scrollLeft / step) * step, behavior });
      }
    };
    const click = (e: MouseEvent) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } };
    const noDrag = (e: Event) => e.preventDefault();
    const key = (e: KeyboardEvent) => {
      if (e.target !== r) return;
      if (e.key === "ArrowRight") { e.preventDefault(); page(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); page(-1); }
    };
    r.addEventListener("pointerdown", down);
    r.addEventListener("pointermove", move);
    r.addEventListener("pointerup", end);
    r.addEventListener("pointercancel", end);
    r.addEventListener("click", click, true);
    r.addEventListener("dragstart", noDrag);
    r.addEventListener("keydown", key);

    // gentle auto-advance: one card every AUTO ms while the rail is well on screen and the tab visible;
    // never while it is hovered, focused, dragged or being touched / wheeled (and for 8 s after), and
    // never for reduced motion. At the end it glides back to the first card.
    const wrap = r.parentElement || r;
    let inView = false, holdUntil = 0;
    const hold = () => { holdUntil = performance.now() + 8000; };
    const io = "IntersectionObserver" in window ? new IntersectionObserver(([e]) => { inView = e.isIntersecting; }, { threshold: 0.4 }) : null;
    io?.observe(r);
    const AUTO = 4200;
    const auto = calm ? 0 : window.setInterval(() => {
      if (!inView || document.hidden || drag || performance.now() < holdUntil) return;
      if (wrap.matches(":hover") || wrap.contains(document.activeElement)) return;
      const max = r.scrollWidth - r.clientWidth - 2;
      if (max <= 0) return;
      if (r.scrollLeft >= max) r.scrollTo({ left: 0, behavior });
      else r.scrollBy({ left: stepPx(), behavior });
    }, AUTO);
    r.addEventListener("touchstart", hold, { passive: true });
    r.addEventListener("wheel", hold, { passive: true });
    r.addEventListener("pointerdown", hold);
    wrap.addEventListener("click", hold);
    return () => {
      clearInterval(auto);
      io?.disconnect();
      r.removeEventListener("touchstart", hold);
      r.removeEventListener("wheel", hold);
      r.removeEventListener("pointerdown", hold);
      wrap.removeEventListener("click", hold);
      clearTimeout(t);
      cancelAnimationFrame(raf);
      prev.current?.removeEventListener("click", onPrev);
      next.current?.removeEventListener("click", onNext);
      r.removeEventListener("scroll", onScroll);
      removeEventListener("resize", update);
      r.removeEventListener("pointerdown", down);
      r.removeEventListener("pointermove", move);
      r.removeEventListener("pointerup", end);
      r.removeEventListener("pointercancel", end);
      r.removeEventListener("click", click, true);
      r.removeEventListener("dragstart", noDrag);
      r.removeEventListener("keydown", key);
    };
  }, [rail, list, prev, next]);
}

export default function Kit() {
  const rail = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const prev = useRef<HTMLButtonElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  useRail(rail, list, prev, next);

  return (
    <section className="ld-sec ld-kit" id="kit" aria-labelledby="kit-title" data-loop>
      <div className="ld-wrap">
        <div className="ld-kit__head" data-in>
          <div>
            <p className="ld-kicker ld-rise">Tools &amp; products</p>
            <h2 className="ld-lines" id="kit-title">
              <span className="ld-line"><span>The tools behind <em>the data.</em></span></span>
            </h2>
          </div>
          <div className="ld-kit__side ld-rise" style={d(0.2)}>
            <p>From field equipment to powerful software, we use and support industry-leading tools to deliver exceptional results.</p>
            <a className="ld-link" href={GEAR_URL}>
              View all tools <Arrow />
            </a>
          </div>
        </div>
        <div className="ld-kit__wrap" data-in>
          <div className="ld-kit__rail" ref={rail} tabIndex={0} role="region" aria-label={`The tools: ${CARDS.length} instruments, scrolls sideways`}>
            <ul className="ld-kit__list" ref={list}>
              {CARDS.map((c, i) => (
                <li className="ld-gear" key={c.id} style={{ ["--i" as string]: i }}>
                  <article className="ld-gear__card">
                    <div className="ld-gear__media">
                      <CardMedia c={c} i={i} />
                      {c.status === "ready" ? <span className="ld-gear__tag">3D model</span> : null}
                    </div>
                    <div className="ld-gear__body">
                      <h3 className="ld-gear__name">
                        <a href={gearHref(c.id)}>{c.title}</a>
                      </h3>
                      <p className="ld-gear__line">{c.line}</p>
                      <span className={`ld-gear__more${c.status === "ready" ? " is-3d" : ""}`} aria-hidden="true">
                        <span className="ld-gear__ico">{c.status === "ready" ? <CubeIcon /> : <PlayIcon />}</span>
                        {c.status === "ready" ? "Explore in 3D" : "How it works"}
                        <Arrow />
                      </span>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          </div>
          <div className="ld-kit__nav">
            <button type="button" className="ld-round" ref={prev} aria-label="Previous tools">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8H3.5M7 4.5 3.5 8 7 11.5" /></svg>
            </button>
            <button type="button" className="ld-round" ref={next} aria-label="Next tools">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9.5M9 4.5 12.5 8 9 11.5" /></svg>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
