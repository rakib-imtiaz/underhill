import { useEffect, useRef } from "react";
import CtaBand from "../../components/CtaBand";
import SmartLink from "../../components/SmartLink";
import useDocumentMeta from "../../hooks/useDocumentMeta";

/* ---------------------------------------------------------------------------
   Page-scoped styles, namespaced under `.pg-rail`. Visual language mirrors
   the Services hub — chips, grouped check lists, a dark contrast band, and
   project cards. Every animation is transform/opacity only and is disabled
   under prefers-reduced-motion. The hero video is muted/inline and is paused
   off-screen (and under reduced-motion) in the component below.
--------------------------------------------------------------------------- */
const CSS = `
.pg-rail .sec-head { max-width: 760px; }

/* toolkit chips */
.pg-rail .chips { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 26px; }
.pg-rail .chip {
  font-family: var(--font-head); font-size: 11.5px; font-weight: 600;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--navy);
  border: 1px solid var(--grey-100); background: var(--white);
  padding: 8px 14px; border-left: 3px solid var(--blue);
}

/* figure callout chip */
.pg-rail .figure .callout {
  position: absolute; top: 18px; right: 18px;
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--white);
  background: rgba(29,34,43,.78); padding: 7px 12px; border-left: 2px solid var(--lime);
}

/* expertise list */
.pg-rail ul.check { margin-top: 22px; }
.pg-rail ul.check li { font-size: 15px; }
.pg-rail ul.check.two-col li strong { color: var(--navy); }

/* featured projects (dark) */
.pg-rail .proj-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 54px;
}
@media (max-width: 900px) { .pg-rail .proj-grid { grid-template-columns: 1fr; } }
.pg-rail .proj-grid > .reveal { display: flex; }
.pg-rail .proj-card {
  position: relative; display: flex; flex-direction: column; flex: 1;
  background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.09);
  color: rgba(255,255,255,.74); overflow: hidden;
  transition: transform 0.35s var(--ease), box-shadow 0.35s var(--ease), border-color 0.35s var(--ease);
}
.pg-rail .proj-card:hover {
  transform: translateY(-8px); border-color: rgba(255,255,255,.22);
  box-shadow: 0 34px 64px rgba(0,0,0,.4);
}
.pg-rail .proj-card:focus-visible { outline: 2px solid var(--lime); outline-offset: 3px; }
.pg-rail .proj-media { position: relative; aspect-ratio: 4 / 3; overflow: hidden; }
.pg-rail .proj-media img {
  width: 100%; height: 100%; object-fit: cover;
  transition: transform 0.6s var(--ease);
}
.pg-rail .proj-card:hover .proj-media img { transform: scale(1.06); }
.pg-rail .proj-media::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(60,57,80,.08), rgba(29,34,43,.6) 96%);
}
.pg-rail .proj-body { padding: 22px 24px 24px; display: flex; flex-direction: column; flex: 1; }
.pg-rail .proj-body h3 { color: var(--white); font-size: 18px; margin: 0; }
.pg-rail .proj-all { margin-top: 36px; }

/* related services strip */
.pg-rail .rel-row {
  display: flex; flex-wrap: wrap; gap: 14px; margin-top: 34px;
}
.pg-rail .rel-link {
  display: inline-flex; align-items: center; gap: 10px;
  font-family: var(--font-head); font-weight: 600; font-size: 13px;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--navy);
  border: 1px solid var(--grey-100); padding: 14px 20px;
  transition: transform 0.3s var(--ease), border-color 0.3s var(--ease), color 0.3s var(--ease);
}
.pg-rail .rel-link .arr { color: var(--blue); transition: transform 0.3s var(--ease); }
.pg-rail .rel-link:hover { transform: translateY(-3px); border-color: var(--blue); }
.pg-rail .rel-link:hover .arr { transform: translateX(5px); }

@media (prefers-reduced-motion: reduce) {
  .pg-rail .proj-card, .pg-rail .proj-media img,
  .pg-rail .rel-link, .pg-rail .rel-link .arr {
    transition: none !important;
  }
  .pg-rail .proj-card:hover, .pg-rail .rel-link:hover { transform: none; }
  .pg-rail .proj-card:hover .proj-media img,
  .pg-rail .rel-link:hover .arr { transform: none; }
}
`;

const TOOLKIT = [
  "eRailSafe Certified Crews",
  "UAVs",
  "3D Scanners",
  "LiDAR",
  "Mobile Mapping",
  "Rail Geometry Trollies",
  "360° Imaging",
];

const EXPERTISE = [
  "Heavy rail operators rely on us for maintenance surveys and emergency response data.",
  "We supply accurate data for rail alignments, bridge positioning, and structural design support.",
  "Transit operators such as Translink trust our precision and responsiveness for Skytrain and rapid transit corridors.",
  "We help crews stay on track with real-time layout, deformation monitoring, and clearance assessments.",
];

const SERVICES = [
  ["Preliminary Topographic Surveys", "Capture base terrain for design and planning"],
  ["Track Construction Staking", "Field layout to guide accurate construction of new or upgraded lines"],
  ["As-Built Surveys", "Verify track and infrastructure against design plans"],
  ["Settlement & Geometry Monitoring", "Detect settlement or horizontal movement"],
  ["High-Precision Control Networks", "Provide primary coordinate reference systems for consistent spatial control"],
  ["Tunnel and Bridge Geometry", "Capture confined and complex structures with 3D scanning"],
  ["LiDAR & UAV Mapping", "Map large or remote rail corridors with accuracy and efficiency"],
  ["360° and Mobile Imaging", "360 degree panoramic images and mobile mounted video solutions"],
  ["CAD Integration", "Deliver data optimized for Civil 3D"],
  ["GEDO Trolley", "Captures precise track geometry for clearance analysis, as-built documentation, and real-time data verification"],
] as const;

const PROJECTS = [
  {
    title: "Broadway Subway Project",
    img: "/assets/uploads/2026/06/broadway-subway-project-2-thegem-blog-justified.jpg",
    alt: "Broadway subway project at sunrise",
  },
  {
    title: "Canada Line Surveying: Rapid Transit Infrastructure from Vancouver to YVR",
    img: "/assets/uploads/2025/09/canada-line-thegem-blog-justified.webp",
    alt: "Canada Line tunnel",
  },
  {
    title: "BC Rail Tumbler Ridge Branch Line Tunnel & Railway Surveying",
    img: "/assets/uploads/2025/06/BC-Rail-Underhill-15-thegem-blog-justified.webp",
    alt: "BC Rail Tumbler Ridge branch line surveying",
  },
];

const RELATED = [
  { to: "/geospatial-services/deformation-monitoring/", label: "Deformation Monitoring" },
  { to: "/geospatial-services/topographic-surveying/", label: "Topographic Surveys" },
  { to: "/geospatial-services/3d-laser-scanning-reality-capture/", label: "Laser Scanning" },
];

export default function RailwaySurveying() {
  useDocumentMeta(
    "Railway Surveying | Certified Surveyors for Transit & Heavy Rail",
    "Railway surveying across Western Canada — supporting heavy industrial rail, rapid transit, and skytrain projects with trusted expertise, high-accuracy tools, and decades of experience."
  );

  const videoRef = useRef<HTMLVideoElement>(null);

  /* Pause the hero video off-screen; honour prefers-reduced-motion. */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) {
      v.pause();
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          void v.play().catch(() => {});
        } else {
          v.pause();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <main id="main" className="pg-rail">
      <style>{CSS}</style>

      {/* Video hero — mirrors PageHero structure with .hero-video */}
      <section className="hero">
        <div className="hero-video">
          <video
            ref={videoRef}
            src="/assets/uploads/2026/03/railvideo-1.mp4"
            poster="/assets/uploads/2025/10/Gedo-1.webp"
            muted
            loop
            autoPlay
            playsInline
            preload="metadata"
            aria-hidden="true"
          />
        </div>
        <div className="blueprint-grid" aria-hidden="true" />
        <div className="coords tl" aria-hidden="true">
          49.2827° N · 123.1207° W
          <br />
          GEODETIC DATUM NAD83
        </div>
        <div className="container">
          <nav className="crumbs" aria-label="Breadcrumb">
            <span>
              <SmartLink to="/">Home</SmartLink>
            </span>
            <span className="sep" aria-hidden="true">/</span>
            <span>
              <SmartLink to="/geospatial-services/">Geospatial Services</SmartLink>
            </span>
            <span className="sep" aria-hidden="true">/</span>
            <span className="here" aria-current="page">
              Railway Surveying Services
            </span>
          </nav>
          <span className="hero-eyebrow">Geospatial Services</span>
          <h1>Railway Surveying Services</h1>
          <h2 className="hero-sub">Precision rail data. Safe infrastructure.</h2>
          <p className="lead on-dark">
            Railway surveying is essential for planning, building, and
            maintaining safe and efficient rail systems. Underhill provides
            railway surveying across Western Canada, supporting heavy
            industrial rail and rapid transit projects with trusted expertise,
            high-accuracy tools, and decades of experience.
          </p>
          <div className="actions">
            <SmartLink className="btn" to="#lets-talk">
              Request Consultation
            </SmartLink>
            <a
              className="btn ghost"
              href="/assets/uploads/2025/10/Underhill-Rail-Feature-Sheet-v2.pdf"
              target="_blank"
              rel="noopener noreferrer"
            >
              View Feature Sheet
            </a>
          </div>
        </div>
        <div className="hero-ticks" aria-hidden="true" />
      </section>

      {/* Expertise */}
      <section className="section" aria-labelledby="rail-intro">
        <div className="container split">
          <div className="reveal">
            <span className="kicker">Our Railway Surveying Expertise</span>
            <h2 id="rail-intro">Trusted by industry leaders.</h2>
            <p>
              Underhill has delivered professional railway surveying throughout
              our century long history. We’ve worked with Class I freight
              railways, TransLink, and industrial developers across Western
              Canada.
            </p>
            <p>
              Our eRailSafe certified crews use UAVs, 3D scanners, LiDAR,
              mobile mapping, rail geometry trollies and 360° imaging tools to
              complete surveys safely and precisely.
            </p>
            <div className="chips" aria-label="Railway surveying toolkit">
              {TOOLKIT.map((t) => (
                <span className="chip" key={t}>{t}</span>
              ))}
            </div>
          </div>
          <div className="figure reveal" style={{ transitionDelay: "0.12s" }}>
            <img
              src="/assets/uploads/2025/10/Gedo-1.webp"
              alt="GEDO trolley capturing precise track geometry"
              loading="lazy"
            />
            <span className="callout" aria-hidden="true">
              ERAILSAFE CERTIFIED CREWS
            </span>
            <span className="cap">RAILWAY SURVEYING · WESTERN CANADA</span>
          </div>
        </div>
        <div className="container" style={{ marginTop: 48 }}>
          <ul className="check reveal">
            {EXPERTISE.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Full-service railway surveying */}
      <section className="section grey" aria-labelledby="rail-services">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Railway Service Examples</span>
            <h2 id="rail-services">
              Full-Service Railway Surveying for Transit, Freight, and
              Industrial Rail Projects
            </h2>
            <p className="lead">
              We support the full life cycle of your rail project—from early
              design studies and route planning to construction layout,
              as-builts, and long-term performance monitoring.
            </p>
          </div>
          <h3 className="reveal">Our specialized railway surveying services include:</h3>
          <ul className="check two-col reveal">
            {SERVICES.map(([term, desc]) => (
              <li key={term}>
                <strong>{term}</strong> – {desc}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Featured projects — dark contrast */}
      <section className="section dark" aria-labelledby="rail-projects">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Featured Projects</span>
            <h2 id="rail-projects">Railway Surveying in Practice</h2>
          </div>
          <div className="proj-grid">
            {PROJECTS.map((p, i) => (
              <div className="reveal" key={p.title} style={{ transitionDelay: `${(i % 3) * 0.08}s` }}>
                <SmartLink className="proj-card" to="/land-surveying-projects/">
                  <div className="proj-media">
                    <img src={p.img} alt={p.alt} loading="lazy" />
                  </div>
                  <div className="proj-body">
                    <h3>{p.title}</h3>
                  </div>
                </SmartLink>
              </div>
            ))}
          </div>
          <div className="proj-all reveal">
            <SmartLink className="btn" to="/land-surveying-projects/">
              All Projects
            </SmartLink>
          </div>
        </div>
      </section>

      {/* Related services */}
      <section className="section tight" aria-labelledby="rail-related">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Related Services</span>
            <h2 id="rail-related">Explore Related Surveying Services</h2>
          </div>
          <div className="rel-row reveal">
            {RELATED.map((r) => (
              <SmartLink className="rel-link" to={r.to} key={r.to}>
                {r.label} <span className="arr" aria-hidden="true">→</span>
              </SmartLink>
            ))}
          </div>
        </div>
      </section>

      <CtaBand />
    </main>
  );
}
