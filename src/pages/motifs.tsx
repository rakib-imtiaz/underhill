import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import SmartLink from "../components/SmartLink";

/* ==========================================================================
   Page-scoped redesign accents for About / Approach / Team / Careers.
   These classes are prefixed `ux-` and are only ever emitted by the four
   pages above, so they can never collide with the shared stylesheet or the
   other page agents' work. Everything animates on transform/opacity only
   and every motion rule is cancelled under prefers-reduced-motion.
   ========================================================================== */
const UX_CSS = `
/* cards placed on a dark section need separation from the navy ground */
.section.dark .card { background: rgba(255, 255, 255, 0.045); border: 1px solid rgba(255, 255, 255, 0.1); }
.section.dark .card:hover { border-color: rgba(0, 130, 202, 0.55); }

/* heritage quote accent (Roboto Slab) with crosshair ornament */
.ux-quote {
  position: relative; margin: 30px 0; padding: 8px 0 8px 34px;
  border-left: 3px solid var(--blue);
  font-family: var(--font-serif); font-size: clamp(19px, 2vw, 24px);
  line-height: 1.5; color: var(--navy); max-width: 56ch;
}
.ux-quote .ux-cross { position: absolute; left: -12px; top: -14px; color: var(--blue); background: inherit; }
.section.dark .ux-quote { color: var(--white); }

/* crosshair ornament */
.ux-cross { display: inline-block; flex: 0 0 auto; }

/* chip list (tech / values / credentials) */
.ux-chips { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
.ux-chip {
  font-family: var(--font-head); font-size: 12px; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--navy);
  border: 1px solid var(--grey-300); padding: 9px 16px;
  display: inline-flex; align-items: center; gap: 9px;
  transition: border-color 0.25s var(--ease), color 0.25s var(--ease), transform 0.25s var(--ease);
}
.ux-chip::before { content: "+"; color: var(--blue); font-size: 14px; line-height: 0; }
.ux-chip:hover { border-color: var(--blue); color: var(--blue); transform: translateY(-2px); }
.section.dark .ux-chip { color: rgba(255, 255, 255, 0.85); border-color: rgba(255, 255, 255, 0.28); }
.section.dark .ux-chip:hover { color: var(--lime); border-color: var(--lime); }

/* leadership cards (Team) — horizontal, image left, hover lift + top border sweep */
.ux-leaders { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 50px; }
.ux-leader {
  position: relative; display: grid; grid-template-columns: 240px 1fr;
  background: var(--white); box-shadow: 0 16px 46px rgba(18, 26, 38, 0.1);
  overflow: hidden;
  transition: transform 0.35s var(--ease), box-shadow 0.35s var(--ease);
}
.ux-leader::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 4px;
  background: var(--blue); transform: scaleX(0); transform-origin: left;
  transition: transform 0.45s var(--ease); z-index: 2;
}
.ux-leader:hover { transform: translateY(-6px); box-shadow: 0 30px 64px rgba(18, 26, 38, 0.2); }
.ux-leader:hover::before { transform: scaleX(1); }
.ux-leader .ph { position: relative; min-height: 100%; max-height: 440px; }
.ux-leader .ph img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 18%; }
.ux-leader .meta { padding: 30px 32px 34px; }
.ux-leader h3 { margin: 0; font-size: 23px; }
.ux-leader .role {
  font-family: var(--font-head); font-size: 12px; font-weight: 600;
  letter-spacing: 0.18em; text-transform: uppercase; color: var(--blue);
  margin: 7px 0 4px;
}
.ux-leader .creds { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0 16px; }
.ux-leader .creds span {
  font-family: var(--font-head); font-size: 10.5px; font-weight: 600;
  letter-spacing: 0.16em; color: var(--navy);
  border: 1px solid var(--grey-300); padding: 4px 10px;
}
.ux-leader p { font-size: 14px; color: var(--grey-600); margin-bottom: 12px; }
.ux-leader p:last-child { margin-bottom: 0; }
@media (max-width: 1080px) { .ux-leaders { grid-template-columns: 1fr; gap: 22px; } }
/* tablet: the photo column no longer stretches to the length of the bio --
   the president has the longest bio and was getting a 240 x 900 crop */
@media (max-width: 1080px) {
  .ux-leader { grid-template-columns: 220px 1fr; align-items: start; }
  .ux-leader .ph { min-height: 0; aspect-ratio: 4 / 5; max-height: none; }
}
/* phone: profile header (photo beside name + role), bio flows underneath.
   Reads as a profile card instead of a full-bleed poster with text below. */
@media (max-width: 620px) {
  /* .meta dissolves into the grid so the name, role and credentials can sit
     BESIDE the photo while the bio paragraphs span the full card width */
  .ux-leader {
    grid-template-columns: 104px 1fr; column-gap: 16px; row-gap: 0;
    align-items: start; padding: 20px 20px 24px;
  }
  .ux-leader .ph {
    aspect-ratio: auto; min-height: 0; max-height: none;
    grid-column: 1; grid-row: 1 / span 3;
    width: 104px; height: 124px; border-radius: 6px; overflow: hidden;
  }
  .ux-leader .meta { display: contents; }
  .ux-leader h3 { grid-column: 2; font-size: 19px; line-height: 1.2; margin-top: 4px; }
  .ux-leader .role { grid-column: 2; margin: 6px 0 0; }
  .ux-leader .creds { grid-column: 2; margin: 8px 0 0; align-self: start; }
  .ux-leader p { grid-column: 1 / -1; font-size: 14.5px; line-height: 1.6; margin: 0; }
  .ux-leader p:first-of-type { margin-top: 18px; }
  .ux-leader p + p { margin-top: 10px; }
}

/* job opening rows (Careers) — hover lift + left border sweep */
.ux-jobs { margin-top: 46px; display: grid; gap: 14px; }
.ux-job {
  position: relative; display: flex; align-items: center; gap: 20px; flex-wrap: wrap;
  background: var(--white); border: 1px solid var(--grey-100);
  padding: 24px 28px 24px 32px;
  transition: transform 0.3s var(--ease), box-shadow 0.3s var(--ease), border-color 0.3s var(--ease);
}
.ux-job::before {
  content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
  background: var(--blue); transform: scaleY(0); transform-origin: top;
  transition: transform 0.35s var(--ease);
}
.ux-job:hover { transform: translateY(-3px); box-shadow: 0 18px 42px rgba(18, 26, 38, 0.13); border-color: rgba(0, 130, 202, 0.35); }
.ux-job:hover::before { transform: scaleY(1); }
.ux-job .ux-cross { color: var(--blue); }
.ux-job h3 { margin: 0; font-size: 20px; }
.ux-job .loc {
  display: block; margin-top: 6px;
  font-family: var(--font-head); font-size: 12px; font-weight: 600;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--grey-600);
}
.ux-job .loc b { color: var(--blue); font-weight: 600; }
.ux-job .apply { margin-left: auto; display: flex; gap: 10px; flex-wrap: wrap; }
.ux-job a:focus-visible, .ux-loc a:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }

/* office location cards (Careers) */
.ux-locs { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 22px; margin-top: 46px; }
.ux-loc {
  position: relative; background: var(--white); padding: 30px 26px 28px;
  border-top: 4px solid var(--blue); box-shadow: 0 14px 40px rgba(18, 26, 38, 0.09);
  display: flex; flex-direction: column;
  transition: transform 0.3s var(--ease), box-shadow 0.3s var(--ease);
}
.ux-loc:hover { transform: translateY(-5px); box-shadow: 0 26px 56px rgba(18, 26, 38, 0.17); }
.ux-loc .tag {
  font-family: var(--font-head); font-size: 10.5px; font-weight: 600;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--blue);
  margin-bottom: 12px; display: block;
}
.ux-loc h3 { margin: 0 0 10px; font-size: 21px; }
.ux-loc p { font-size: 14px; color: var(--grey-600); flex: 1; }
.ux-loc .go {
  margin-top: 18px; font-family: var(--font-head); font-weight: 600; font-size: 12.5px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--navy);
  display: inline-flex; gap: 8px; align-items: center;
}
.ux-loc .go::after { content: "+"; color: var(--blue); font-size: 16px; }
.ux-loc:hover .go { color: var(--blue); }

/* navy engagement band (Careers email CTA, Team join CTA) */
.ux-band { position: relative; background: var(--navy); color: var(--white); padding: 96px 0; overflow: hidden; }
.ux-band::before {
  content: ""; position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px);
  background-size: 72px 72px;
}
.ux-band .container { position: relative; display: flex; align-items: center; gap: 40px; flex-wrap: wrap; }
.ux-band h2 { color: var(--white); font-size: clamp(28px, 3.4vw, 44px); max-width: 20ch; margin: 0; }
.ux-band p { color: rgba(255, 255, 255, 0.78); max-width: 56ch; margin-top: 14px; }
.ux-band .btn { margin-left: auto; flex: 0 0 auto; }
.ux-band .kicker { color: var(--lime); }
.ux-band .kicker::before { background: var(--lime); }

@media (prefers-reduced-motion: reduce) {
  .ux-chip, .ux-leader, .ux-leader::before, .ux-job, .ux-job::before, .ux-loc { transition: none; }
  .ux-chip:hover, .ux-leader:hover, .ux-job:hover, .ux-loc:hover { transform: none; }
}
`;

/** Emits the scoped `ux-` stylesheet once per page. */
export function UxStyle() {
  return <style>{UX_CSS}</style>;
}

/** Crosshair ✚ ornament — pure SVG, inherits currentColor. */
export function Crosshair({ size = 18 }: { size?: number }) {
  return (
    <svg
      className="ux-cross"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M12 1v6M12 17v6M1 12h6M17 12h6"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

/** Contour-line divider — uses the shared `.contour-divider` sizing/colour. */
export function ContourDivider() {
  return (
    <svg
      className="contour-divider"
      viewBox="0 0 1200 90"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M0 66 C 140 50, 260 82, 420 60 S 700 34, 880 56 S 1100 80, 1200 62"
        fill="none" stroke="currentColor" strokeWidth="1.2"
      />
      <path
        d="M0 46 C 160 30, 300 62, 460 42 S 740 16, 920 38 S 1120 58, 1200 42"
        fill="none" stroke="currentColor" strokeWidth="1"
      />
      <path
        d="M0 82 C 120 70, 280 90, 440 76 S 720 56, 900 72 S 1110 88, 1200 78"
        fill="none" stroke="currentColor" strokeWidth="0.8"
      />
    </svg>
  );
}

/**
 * Animated stat counter. IntersectionObserver-triggered, rAF-driven count-up
 * with cubic ease-out; renders the final value immediately when the user
 * prefers reduced motion. Text-only — no layout or paint animation.
 */
export function CountUp({
  to,
  suffix = "",
  duration = 1400,
}: {
  to: number;
  suffix?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [val, setVal] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !("IntersectionObserver" in window)) {
      setVal(to);
      return;
    }
    let raf = 0;
    let started = false;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting || started) return;
          started = true;
          io.disconnect();
          const t0 = performance.now();
          const step = (t: number) => {
            const p = Math.min(1, (t - t0) / duration);
            setVal(Math.round(to * (1 - Math.pow(1 - p, 3))));
            if (p < 1) raf = requestAnimationFrame(step);
          };
          raf = requestAnimationFrame(step);
        });
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, duration]);

  return (
    <span ref={ref}>
      {val}
      {suffix}
    </span>
  );
}

/* The three featured projects named on both the About and Approach pages of
   the source site, linked to the ported Projects index. */
const FEATURED_PROJECTS = [
  {
    num: "01",
    title: "Erik Nielsen Whitehorse International Airport Improvements",
    img: "/assets/uploads/2026/03/FaroAirport-thegem-blog-justified.jpg",
  },
  {
    num: "02",
    title: "Pattullo Bridge Replacement Hydraulic Model Surveying",
    img: "/assets/uploads/2025/09/Underhill-Patullo-thegem-blog-justified.jpg",
  },
  {
    num: "03",
    title: "Second Narrows Water Tunnel Real-Time Monitoring",
    img: "/assets/uploads/2025/06/NorthVancouverWaterTunnel-1-thegem-blog-justified.webp",
  },
];

/** Shared Featured Projects teaser used by About and Approach. */
export function ProjectsTeaser() {
  return (
    <section className="section grey">
      <div className="container">
        <span className="kicker">Featured Work</span>
        <h2>Featured Projects</h2>
        <div className="cards">
          {FEATURED_PROJECTS.map((p, i) => (
            <SmartLink
              className="card reveal"
              style={{ transitionDelay: `${i * 90}ms` }}
              to="/land-surveying-projects/"
              key={p.num}
            >
              <div className="bg">
                <img src={p.img} alt="" loading="lazy" />
              </div>
              <span className="num">{p.num}</span>
              <h3>{p.title}</h3>
              <span className="more">View Project</span>
            </SmartLink>
          ))}
        </div>
        <div style={{ marginTop: 36 }}>
          <Link className="btn" to="/land-surveying-projects/">
            All Projects
          </Link>
        </div>
      </div>
    </section>
  );
}
