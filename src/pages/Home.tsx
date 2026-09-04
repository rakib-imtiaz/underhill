import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import HeroJourney from "../components/HeroJourney";
import ProjectsMap from "../components/ProjectsMap";
import CtaBand from "../components/CtaBand";
import SmartLink from "../components/SmartLink";
import useDocumentMeta from "../hooks/useDocumentMeta";

/* ---------------------------------------------------------------------------
   Page-scoped styles. The shared stylesheet is owned by another agent, so the
   redesign layer for this page lives here, namespaced under `.pg-home`.
   Every animation is transform/opacity only and is disabled under
   prefers-reduced-motion — GPU-cheap by contract.
--------------------------------------------------------------------------- */
const CSS = `
/* ---------- shared page primitives ---------- */
.pg-home .sec-head { max-width: 720px; }
.pg-home .sec-head.center { margin-inline: auto; text-align: center; }
.pg-home .sec-head.center .kicker { justify-content: center; }
.pg-home .sec-head.center .lead { margin-inline: auto; }

/* crosshair ornament — pure CSS, static */
.pg-home .xhair {
  position: absolute; width: 26px; height: 26px; z-index: 2;
  pointer-events: none; opacity: 0.55;
}
.pg-home .xhair::before, .pg-home .xhair::after {
  content: ""; position: absolute; background: var(--blue);
}
.pg-home .xhair::before { left: 50%; top: 0; bottom: 0; width: 1px; }
.pg-home .xhair::after { top: 50%; left: 0; right: 0; height: 1px; }
.pg-home .xhair i {
  position: absolute; inset: 8px; border: 1px solid var(--blue); border-radius: 50%;
}
.pg-home .xhair.on-dark::before, .pg-home .xhair.on-dark::after { background: rgba(255,255,255,.4); }
.pg-home .xhair.on-dark i { border-color: rgba(255,255,255,.4); }

/* measurement ruler — a static tick-mark divider strip */
.pg-home .rule {
  height: 16px; margin-top: 54px; opacity: 0.6;
  background-image:
    repeating-linear-gradient(90deg, rgba(255,255,255,.4) 0 1px, transparent 1px 96px),
    repeating-linear-gradient(90deg, rgba(255,255,255,.22) 0 1px, transparent 1px 24px);
  background-size: 100% 14px, 100% 8px;
  background-repeat: repeat-x;
  background-position: bottom left, bottom left;
}
.pg-home .rule.light {
  background-image:
    repeating-linear-gradient(90deg, rgba(60,57,80,.35) 0 1px, transparent 1px 96px),
    repeating-linear-gradient(90deg, rgba(60,57,80,.18) 0 1px, transparent 1px 24px);
}

/* ---------- heritage statement band ---------- */
.pg-home .statement { position: relative; text-align: center; max-width: 940px; margin: 0 auto; }
.pg-home .statement .serif {
  font-family: var(--font-serif); font-weight: 600;
  font-size: clamp(34px, 4.8vw, 60px); line-height: 1.16; letter-spacing: -0.01em;
  color: var(--navy); margin: 6px auto 26px; max-width: 24ch;
}
.pg-home .statement .serif em { font-style: normal; color: var(--blue); }
.pg-home .statement p { max-width: 64ch; margin: 0 auto 30px; color: var(--grey-600); font-size: 18px; }

/* ---------- credential / region chips ---------- */
.pg-home .chips { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 26px; }
.pg-home .chip {
  font-family: var(--font-head); font-size: 12px; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--navy);
  border: 1px solid var(--grey-300); padding: 8px 14px;
  transition: border-color 0.25s var(--ease), color 0.25s var(--ease), transform 0.25s var(--ease);
}
.pg-home .chip:hover { border-color: var(--blue); color: var(--blue); transform: translateY(-2px); }

/* ---------- stats band ---------- */
.pg-home .stats-sec { position: relative; overflow: hidden; }
.pg-home .stats-sec .blueprint {
  position: absolute; inset: 0; pointer-events: none; opacity: 0.55;
  background-image:
    linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px);
  background-size: 72px 72px;
  mask-image: linear-gradient(180deg, transparent, #000 25%, #000 80%, transparent);
  -webkit-mask-image: linear-gradient(180deg, transparent, #000 25%, #000 80%, transparent);
}
.pg-home .stats-sec .container { position: relative; z-index: 1; }
.pg-home .stats-sec .stat .n { font-variant-numeric: tabular-nums; }
.pg-home .stats-sec .stat { border-top: 2px solid rgba(255,255,255,.14); padding-top: 22px; }

/* ---------- service cards (image-top, shared language with Services page) -- */
.pg-home .svc-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; margin-top: 54px;
}
@media (max-width: 1100px) { .pg-home .svc-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 620px) { .pg-home .svc-grid { grid-template-columns: 1fr; } }
.pg-home .svc-grid > .reveal { display: flex; }
.pg-home .svc-card {
  position: relative; display: flex; flex-direction: column; flex: 1;
  background: var(--navy); color: rgba(255,255,255,.74); overflow: hidden;
  transition: transform 0.35s var(--ease), box-shadow 0.35s var(--ease);
}
.pg-home .svc-card:hover { transform: translateY(-8px); box-shadow: 0 34px 64px rgba(18,26,38,.3); }
.pg-home .svc-card:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
.pg-home .svc-media { position: relative; aspect-ratio: 16 / 10; overflow: hidden; }
.pg-home .svc-media img {
  width: 100%; height: 100%; object-fit: cover;
  transition: transform 0.6s var(--ease);
}
.pg-home .svc-card:hover .svc-media img { transform: scale(1.06); }
.pg-home .svc-media::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(60,57,80,.08), rgba(60,57,80,.55) 96%);
}
.pg-home .svc-num {
  position: absolute; top: 14px; left: 16px; z-index: 2;
  font-family: var(--font-head); font-size: 12px; font-weight: 600;
  letter-spacing: 0.2em; color: var(--white);
  background: rgba(60,57,80,.72); padding: 5px 10px; border-left: 2px solid var(--lime);
}
.pg-home .svc-body {
  position: relative; padding: 26px 26px 28px;
  display: flex; flex-direction: column; flex: 1;
}
.pg-home .svc-body::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, var(--blue), var(--lime));
  transform: scaleX(0); transform-origin: left;
  transition: transform 0.45s var(--ease);
}
.pg-home .svc-card:hover .svc-body::before { transform: scaleX(1); }
.pg-home .svc-body h3 { color: var(--white); font-size: 21px; margin: 0 0 10px; }
.pg-home .svc-body p { font-size: 14.5px; flex: 1; }
.pg-home .svc-more {
  margin-top: 20px; font-family: var(--font-head); font-weight: 600; font-size: 13px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--white);
  display: inline-flex; align-items: center; gap: 9px;
  transition: color 0.25s var(--ease);
}
.pg-home .svc-more .arr { color: var(--blue); transition: transform 0.3s var(--ease); }
.pg-home .svc-card:hover .svc-more { color: var(--lime); }
.pg-home .svc-card:hover .svc-more .arr { transform: translateX(6px); }

/* ---------- figure callout ---------- */
.pg-home .figure .callout {
  position: absolute; top: 18px; right: 18px;
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--white);
  background: rgba(29,34,43,.78); padding: 7px 12px; border-left: 2px solid var(--lime);
}

/* ---------- reduced motion: kill every transition/animation introduced here */
@media (prefers-reduced-motion: reduce) {
  .pg-home .svc-card, .pg-home .svc-media img, .pg-home .svc-body::before,
  .pg-home .svc-more, .pg-home .svc-more .arr, .pg-home .chip {
    transition: none !important;
  }
  .pg-home .svc-card:hover { transform: none; }
  .pg-home .svc-card:hover .svc-media img { transform: none; }
  .pg-home .chip:hover { transform: none; }
}
`;

/* Animated stat number — counts up when scrolled into view, snaps to the final
   value under prefers-reduced-motion. DOM text updates only: no layout or GPU
   work beyond a single repaint. */
function Counter({ to, duration = 1500 }: { to: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !("IntersectionObserver" in window)) {
      el.textContent = String(to);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const t0 = performance.now();
        const step = (t: number) => {
          const p = Math.min(1, (t - t0) / duration);
          el.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3))));
          if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, duration]);

  return <span ref={ref}>0</span>;
}

/** Static contour-line divider — the surveying motif, decorative only. */
function ContourDivider({ dark = false }: { dark?: boolean }) {
  return (
    <svg
      className="contour-divider"
      viewBox="0 0 1200 90"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={dark ? { color: "#ffffff", opacity: 0.14 } : undefined}
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.2">
        <path d="M0 78 C 180 60, 300 88, 480 70 S 820 50, 1000 66 S 1150 80, 1200 72" />
        <path d="M0 58 C 160 42, 320 68, 500 52 S 840 32, 1020 48 S 1160 60, 1200 54" />
        <path d="M0 38 C 140 26, 340 48, 520 34 S 860 16, 1040 30 S 1170 42, 1200 36" />
        <path d="M0 20 C 120 12, 360 28, 540 18 S 880 4, 1060 14 S 1180 24, 1200 18" />
      </g>
    </svg>
  );
}

const WHY_POINTS = [
  "100+ years of geomatics leadership",
  "Trusted by industry and government",
  "Experienced geospatial engineers and surveyors",
  "Licensed Canada and British Columbia Land Surveyors (CLS, BCLS)",
  "Licensed Professional Geomatics Engineers (P.Eng.)",
  "Custom solutions for complex geospatial projects",
  "Seamless field-to-office workflows",
];

const SERVICE_CARDS = [
  {
    href: "/geospatial-services/aerial-surveying/",
    img: "/assets/uploads/2025/07/aerial-surveying_120_underhill-geomatics__Eagle-Vision-Agency_.webp",
    num: "01",
    title: "Aerial Surveys",
    body: "Aerial surveys using unmanned aerial vehicles (UAVs), LiDAR, and photogrammetry to deliver accurate, high-resolution data.",
  },
  {
    href: "/geospatial-services/construction-surveying/",
    img: "/assets/uploads/2025/07/construction-surveying_040_underhill-geomatics__Eagle-Vision-Agency_.webp",
    num: "02",
    title: "Construction & Engineering Surveys",
    body: "Supporting the development of Western and Northern Canada since 1913 with comprehensive construction surveys.",
  },
  {
    href: "/geospatial-services/hydrographic-surveying/",
    img: "/assets/uploads/2025/08/Hydrographic-Surveying-Williston-Lake.jpg.jpg",
    num: "03",
    title: "Hydrographic Surveys",
    body: "Near-shore bathymetric surveys using the latest technologies and methods.",
  },
  {
    href: "/geospatial-services/cadastral-surveying/",
    img: "/assets/uploads/2025/08/Cadastral-boundaries-little-mtn-bc.jpg.jpg",
    num: "04",
    title: "Legal Surveys",
    body: "Survey solutions ranging from single-family homes to major infrastructure.",
  },
];

const STATS = [
  { to: 100, suffix: "+", label: "Years of leadership" },
  { to: 4, suffix: "", label: "Offices across BC & Yukon" },
  { to: 11, suffix: "", label: "Geospatial service lines" },
  { to: 1913, suffix: "", label: "Founded in Vancouver" },
];

const SERVE_POINTS = [
  "Infrastructure and Transportation",
  "Resource Development and Energy",
  "Land Development and Construction",
  "First Nations Governance and Land Use",
  "Environmental Assessment and Planning",
];

const REGIONS = ["British Columbia", "Yukon", "Northwest Territories", "Nunavut"];

export default function Home() {
  useDocumentMeta(
    "Geospatial Solutions in Canada | Underhill Geomatics",
    "Full-service geospatial solutions backed by more than a century of experience, driven by innovation, and powered by modern technology."
  );

  return (
    <main id="main" className="pg-home">
      <style>{CSS}</style>

      {/* Cinematic 3D scroll journey — owned by the scenes agent, untouched */}
      <HeroJourney />

      {/* Heritage statement — the first beat after the journey */}
      <section className="section" aria-labelledby="home-statement">
        <div className="container">
          <div className="statement reveal">
            <span className="kicker" style={{ justifyContent: "center" }}>
              Trusted and Reliable
            </span>
            <h2 className="serif" id="home-statement">
              Trusted Geospatial <em>Partners Since 1913</em>
            </h2>
            <p>
              Trusted and reliable. That’s what you can count on with Underhill
              Geomatics. Through traditional surveying or innovative
              technologies, we help our clients make informed, data-driven
              decisions for successful projects.
            </p>
            <Link className="btn" to="/about-underhill-geomatics/">
              About Us
            </Link>
          </div>
          <div className="rule light" aria-hidden="true" />
        </div>
      </section>

      {/* Why Underhill — split with credential proof */}
      <section className="section" style={{ paddingTop: 30 }} aria-labelledby="why-underhill">
        <div className="container split">
          <div className="reveal">
            <span className="kicker">Why Underhill</span>
            <h2 id="why-underhill">
              Why Organizations Across Canada Choose Underhill Geomatics
            </h2>
            <p>
              For over a century, Underhill Geomatics has helped clients see
              the full picture. Our experienced team combines fieldwork
              precision with cutting-edge digital tools.
            </p>
            <ul className="check two-col">
              {WHY_POINTS.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <div className="chips" aria-label="Credentials">
              <span className="chip">CLS Licensed</span>
              <span className="chip">BCLS Licensed</span>
              <span className="chip">P.Eng. Certified</span>
            </div>
            <Link className="btn" to="/our-approach/" style={{ marginTop: 30 }}>
              Our Approach
            </Link>
          </div>
          <div className="figure reveal" style={{ transitionDelay: "0.12s" }}>
            <span className="xhair" style={{ top: -13, left: -13 }} aria-hidden="true">
              <i />
            </span>
            <span className="xhair" style={{ bottom: 21, right: -13 }} aria-hidden="true">
              <i />
            </span>
            <img
              src="/assets/uploads/2025/06/land-surveying_088_underhill-geomatics__Eagle-Vision-Agency_.jpg"
              alt="Underhill surveyor operating a total station in the field"
              loading="lazy"
            />
            <span className="callout" aria-hidden="true">
              EST. 1913 · VANCOUVER, BC
            </span>
            <span className="cap">FIELD CREW · BRITISH COLUMBIA</span>
          </div>
        </div>
      </section>

      {/* Stats band — animated counters over a blueprint grid */}
      <section className="section dark stats-sec" aria-labelledby="home-century">
        <div className="blueprint" aria-hidden="true" />
        <span className="xhair on-dark" style={{ top: 26, right: 30 }} aria-hidden="true">
          <i />
        </span>
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Since 1913</span>
            <h2 id="home-century">Precision. Innovation. Experience.</h2>
            <p style={{ color: "rgba(255,255,255,.7)" }}>
              For over 100 years, clients have trusted Underhill to deliver
              clarity and confidence on Canada’s most challenging projects.
            </p>
          </div>
          <div className="stats">
            {STATS.map((s, i) => (
              <div
                className="stat reveal"
                key={s.label}
                style={{ transitionDelay: `${i * 0.09}s` }}
              >
                <div className="n">
                  <Counter to={s.to} />
                  {s.suffix ? <em>{s.suffix}</em> : null}
                </div>
                <div className="l">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="rule" aria-hidden="true" />
        </div>
      </section>

      {/* Featured services */}
      <section className="section grey" aria-labelledby="home-services">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">What We Do</span>
            <h2 id="home-services">Our Geospatial Services</h2>
            <p className="lead">
              Supporting the development of Western and Northern Canada since
              1913.
            </p>
          </div>
          <div className="svc-grid">
            {SERVICE_CARDS.map((c, i) => (
              <div
                className="reveal"
                key={c.num}
                style={{ transitionDelay: `${i * 0.08}s` }}
              >
                <SmartLink className="svc-card" to={c.href} unported>
                  <div className="svc-media">
                    <img src={c.img} alt="" loading="lazy" />
                    <span className="svc-num">{c.num}</span>
                  </div>
                  <div className="svc-body">
                    <h3>{c.title}</h3>
                    <p>{c.body}</p>
                    <span className="svc-more">
                      Learn More <span className="arr" aria-hidden="true">→</span>
                    </span>
                  </div>
                </SmartLink>
              </div>
            ))}
          </div>
          <div className="reveal" style={{ marginTop: 40 }}>
            <Link className="btn" to="/geospatial-services/">
              View All Services
            </Link>
          </div>
        </div>
      </section>

      <ContourDivider />

      {/* Who we serve */}
      <section className="section" aria-labelledby="home-serve">
        <div className="container split">
          <div className="reveal">
            <span className="kicker">Industries</span>
            <h2 id="home-serve">Who We Serve</h2>
            <p>
              Our professional land surveyors firm provides services throughout
              BC, the Yukon, the Northwest Territories, Nunavut and all of
              Canada.
            </p>
            <ul className="check">
              {SERVE_POINTS.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <div className="chips" aria-label="Service regions">
              {REGIONS.map((r) => (
                <span className="chip" key={r}>
                  {r}
                </span>
              ))}
            </div>
            <Link
              className="btn"
              to="/land-surveying-projects/"
              style={{ marginTop: 30 }}
            >
              Projects
            </Link>
          </div>
          <div className="figure reveal" style={{ transitionDelay: "0.12s" }}>
            <span className="xhair" style={{ top: -13, right: -13 }} aria-hidden="true">
              <i />
            </span>
            <span className="xhair" style={{ bottom: 21, left: -13 }} aria-hidden="true">
              <i />
            </span>
            <img
              src="/assets/uploads/2025/06/Underhill-truck-with-Eagle-Pit-in-the-background.-UAV-flight.-July-2019-2-thegem-blog-justified.webp"
              alt="Underhill field truck during a UAV flight at Eagle Pit"
              loading="lazy"
            />
            <span className="callout" aria-hidden="true">
              UAV FLIGHT · JULY 2019
            </span>
            <span className="cap">UAV FLIGHT · EAGLE PIT</span>
          </div>
        </div>
      </section>

      {/* Project explorer map — 3D/canvas mount owned by the scenes agent */}
      <section className="section dark pmap-section" aria-labelledby="home-map">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Where We Work</span>
            <h2 id="home-map">Explore Our Work Across Canada</h2>
            <p style={{ color: "rgba(255,255,255,.7)" }}>
              From single-family homes to major infrastructure — surveyed
              across British Columbia, the Yukon, the Northwest Territories and
              Nunavut.
            </p>
          </div>
          <ProjectsMap />
        </div>
      </section>

      <CtaBand />
    </main>
  );
}
