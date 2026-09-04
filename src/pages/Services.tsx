import PageHero from "../components/PageHero";
import CtaBand from "../components/CtaBand";
import SceneEmbed from "../components/SceneEmbed";
import SmartLink from "../components/SmartLink";
import useDocumentMeta from "../hooks/useDocumentMeta";
import { InstrumentScene } from "../three/instrument.js";

/* ---------------------------------------------------------------------------
   Page-scoped styles. The shared stylesheet is owned by another agent, so the
   redesign layer for this page lives here, namespaced under `.pg-services`.
   Card styling intentionally mirrors the Home page's `.svc-card` language.
   Every animation is transform/opacity only and is disabled under
   prefers-reduced-motion — GPU-cheap by contract.
--------------------------------------------------------------------------- */
const CSS = `
/* ---------- shared page primitives ---------- */
.pg-services .sec-head { max-width: 760px; }

/* crosshair ornament — pure CSS, static */
.pg-services .xhair {
  position: absolute; width: 26px; height: 26px; z-index: 2;
  pointer-events: none; opacity: 0.55;
}
.pg-services .xhair::before, .pg-services .xhair::after {
  content: ""; position: absolute; background: var(--blue);
}
.pg-services .xhair::before { left: 50%; top: 0; bottom: 0; width: 1px; }
.pg-services .xhair::after { top: 50%; left: 0; right: 0; height: 1px; }
.pg-services .xhair i {
  position: absolute; inset: 8px; border: 1px solid var(--blue); border-radius: 50%;
}
.pg-services .xhair.on-dark::before, .pg-services .xhair.on-dark::after { background: rgba(255,255,255,.4); }
.pg-services .xhair.on-dark i { border-color: rgba(255,255,255,.4); }

/* measurement ruler — a static tick-mark divider strip */
.pg-services .rule {
  height: 16px; margin-top: 54px; opacity: 0.6;
  background-image:
    repeating-linear-gradient(90deg, rgba(255,255,255,.4) 0 1px, transparent 1px 96px),
    repeating-linear-gradient(90deg, rgba(255,255,255,.22) 0 1px, transparent 1px 24px);
  background-size: 100% 14px, 100% 8px;
  background-repeat: repeat-x;
  background-position: bottom left, bottom left;
}
.pg-services .rule.light {
  background-image:
    repeating-linear-gradient(90deg, rgba(60,57,80,.35) 0 1px, transparent 1px 96px),
    repeating-linear-gradient(90deg, rgba(60,57,80,.18) 0 1px, transparent 1px 24px);
}

/* ---------- intro fact chips ---------- */
.pg-services .facts { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px; }
.pg-services .fact {
  display: flex; flex-direction: column; gap: 2px;
  border-left: 3px solid var(--blue); padding: 4px 16px 4px 14px;
}
.pg-services .fact .fn {
  font-family: var(--font-head); font-weight: 700; font-size: 24px;
  color: var(--navy); line-height: 1; font-variant-numeric: tabular-nums;
}
.pg-services .fact .fl {
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--grey-600);
}

/* figure callout chip */
.pg-services .figure .callout {
  position: absolute; top: 18px; right: 18px;
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--white);
  background: rgba(29,34,43,.78); padding: 7px 12px; border-left: 2px solid var(--lime);
}

/* ---------- process steps ---------- */
.pg-services .steps .step {
  transition: transform 0.3s var(--ease);
}
.pg-services .steps .step:hover { transform: translateY(-4px); }

/* ---------- service cards (image-top, mirrors Home) ---------- */
.pg-services .svc-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 54px;
}
@media (max-width: 1100px) { .pg-services .svc-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 620px) { .pg-services .svc-grid { grid-template-columns: 1fr; } }
.pg-services .svc-grid > .reveal { display: flex; }
.pg-services .svc-card {
  position: relative; display: flex; flex-direction: column; flex: 1;
  background: var(--navy); color: rgba(255,255,255,.74); overflow: hidden;
  transition: transform 0.35s var(--ease), box-shadow 0.35s var(--ease);
}
.pg-services .svc-card:hover { transform: translateY(-8px); box-shadow: 0 34px 64px rgba(18,26,38,.3); }
.pg-services .svc-card:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
.pg-services .svc-media { position: relative; aspect-ratio: 16 / 10; overflow: hidden; }
.pg-services .svc-media img {
  width: 100%; height: 100%; object-fit: cover;
  transition: transform 0.6s var(--ease);
}
.pg-services .svc-card:hover .svc-media img { transform: scale(1.06); }
.pg-services .svc-media::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(60,57,80,.08), rgba(60,57,80,.55) 96%);
}
.pg-services .svc-num {
  position: absolute; top: 14px; left: 16px; z-index: 2;
  font-family: var(--font-head); font-size: 12px; font-weight: 600;
  letter-spacing: 0.2em; color: var(--white);
  background: rgba(60,57,80,.72); padding: 5px 10px; border-left: 2px solid var(--lime);
}
.pg-services .svc-body {
  position: relative; padding: 26px 26px 28px;
  display: flex; flex-direction: column; flex: 1;
}
.pg-services .svc-body::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, var(--blue), var(--lime));
  transform: scaleX(0); transform-origin: left;
  transition: transform 0.45s var(--ease);
}
.pg-services .svc-card:hover .svc-body::before { transform: scaleX(1); }
.pg-services .svc-body h3 { color: var(--white); font-size: 21px; margin: 0 0 10px; }
.pg-services .svc-body p { font-size: 14.5px; flex: 1; }
.pg-services .svc-more {
  margin-top: 20px; font-family: var(--font-head); font-weight: 600; font-size: 13px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--white);
  display: inline-flex; align-items: center; gap: 9px;
  transition: color 0.25s var(--ease);
}
.pg-services .svc-more .arr { color: var(--blue); transition: transform 0.3s var(--ease); }
.pg-services .svc-card:hover .svc-more { color: var(--lime); }
.pg-services .svc-card:hover .svc-more .arr { transform: translateX(6px); }

/* ---------- industry cards ---------- */
.pg-services .ind-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; margin-top: 54px;
}
@media (max-width: 1100px) { .pg-services .ind-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 620px) { .pg-services .ind-grid { grid-template-columns: 1fr; } }
.pg-services .ind-grid > .reveal { display: flex; }
.pg-services .ind-card {
  position: relative; flex: 1; background: var(--white); padding: 30px 26px 30px;
  box-shadow: 0 10px 40px rgba(18,26,38,.08); overflow: hidden;
  transition: transform 0.35s var(--ease), box-shadow 0.35s var(--ease);
}
.pg-services .ind-card::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, var(--blue), var(--lime));
  transform: scaleX(0); transform-origin: left;
  transition: transform 0.45s var(--ease);
}
.pg-services .ind-card:hover { transform: translateY(-6px); box-shadow: 0 26px 54px rgba(18,26,38,.16); }
.pg-services .ind-card:hover::before { transform: scaleX(1); }
.pg-services .ind-ico {
  width: 46px; height: 46px; display: flex; align-items: center; justify-content: center;
  background: var(--grey-050); border: 1px solid var(--grey-100); color: var(--blue);
  margin-bottom: 20px;
}
.pg-services .ind-card h3 { color: var(--navy); font-size: 19px; margin: 0 0 10px; }
.pg-services .ind-card p { font-size: 14.5px; color: var(--grey-600); margin: 0; }

/* ---------- industry applications (dark) ---------- */
.pg-services .app-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 26px; margin-top: 54px;
}
@media (max-width: 800px) { .pg-services .app-grid { grid-template-columns: 1fr; } }
.pg-services .app-grid > .reveal { display: flex; }
.pg-services .app-item {
  position: relative; flex: 1; padding: 26px 28px 26px 34px;
  background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.09);
  border-left: 3px solid var(--blue);
  transition: transform 0.3s var(--ease), border-color 0.3s var(--ease), background 0.3s var(--ease);
}
.pg-services .app-item:hover {
  transform: translateX(6px); border-left-color: var(--lime);
  background: rgba(255,255,255,.06);
}
.pg-services .app-item h3 {
  color: var(--white); font-size: 20px; margin: 0 0 8px;
}
.pg-services .app-item p { color: rgba(255,255,255,.7); font-size: 14.5px; margin: 0; }

/* ---------- reduced motion: kill every transition/animation introduced here */
@media (prefers-reduced-motion: reduce) {
  .pg-services .svc-card, .pg-services .svc-media img, .pg-services .svc-body::before,
  .pg-services .svc-more, .pg-services .svc-more .arr,
  .pg-services .ind-card, .pg-services .ind-card::before,
  .pg-services .app-item, .pg-services .steps .step {
    transition: none !important;
  }
  .pg-services .svc-card:hover, .pg-services .ind-card:hover,
  .pg-services .app-item:hover, .pg-services .steps .step:hover { transform: none; }
  .pg-services .svc-card:hover .svc-media img { transform: none; }
}
`;

const SERVICES = [
  {
    href: "/geospatial-services/aerial-surveying/",
    img: "/assets/uploads/2025/07/aerial-surveying_120_underhill-geomatics__Eagle-Vision-Agency_.webp",
    num: "01",
    title: "Aerial Surveys",
    body: "Aerial surveys using drones, LiDAR, and photogrammetry to deliver accurate, high-resolution data for planning and development.",
  },
  {
    href: "/geospatial-services/construction-surveying/",
    img: "/assets/uploads/2025/07/construction-surveying_040_underhill-geomatics__Eagle-Vision-Agency_.webp",
    num: "02",
    title: "Construction & Engineering Surveys",
    body: "Surveying support throughout the construction lifecycle, from initial layout to final as-builts.",
  },
  {
    href: "/geospatial-services/deformation-monitoring/",
    img: "/assets/uploads/2026/02/PCN-Spillway-Thermography-thegem-blog-justified.webp",
    num: "03",
    title: "Deformation Monitoring",
    body: "Precise monitoring surveys to detect structural shifts, ground movement, and changes in elevation over time.",
  },
  {
    href: "/geospatial-services/hydrographic-surveying/",
    img: "/assets/uploads/2025/08/Hydrographic-Surveying-Williston-Lake.jpg.jpg",
    num: "04",
    title: "Hydrographic Surveys",
    body: "Bathymetric data and subsurface analysis for marine, port, and environmental projects.",
  },
  {
    href: "/geospatial-services/3d-laser-scanning-reality-capture/",
    img: "/assets/uploads/2025/06/3d-laser-scanning045_underhill-geomatics__Eagle-Vision-Agency_.jpg",
    num: "05",
    title: "Laser Scanning",
    body: "Reality capture combining traditional surveying, laser scanning, and photogrammetry into full-detail digital models.",
  },
  {
    href: "/geospatial-services/cadastral-surveying/",
    img: "/assets/uploads/2025/08/Cadastral-boundaries-little-mtn-bc.jpg.jpg",
    num: "06",
    title: "Cadastral Surveying",
    body: "Legal land surveys to define and document property boundaries, ensuring clarity in ownership and development rights.",
  },
  {
    href: "/geospatial-services/boma-surveying/",
    img: "/assets/uploads/2025/08/Airspace-plan-capital-6-theatre.jpg.jpg",
    num: "07",
    title: "BOMA & Lease Surveys",
    body: "Precise lease area calculations and space measurements that comply with BOMA standards, helping property owners and tenants navigate commercial leasing with clarity.",
  },
  {
    href: "/geospatial-services/topographic-surveying/",
    img: "/assets/uploads/2026/02/droneshot-thegem-blog-justified.jpg",
    num: "08",
    title: "Topographic Surveys",
    body: "Detailed elevation and contour maps to support engineering design, land development, and infrastructure planning.",
  },
  {
    href: "/geospatial-services/first-nations-land-claims-surveying/",
    img: "/assets/uploads/2025/08/cyfn-land-survey-yt.jpg.jpg",
    num: "09",
    title: "First Nations Surveys",
    body: "Trusted surveying services for Indigenous communities across Canada, supporting land claims and stewardship.",
  },
  {
    href: "/geospatial-services/railway-surveying/",
    img: "/assets/uploads/2025/06/BC-Rail-Underhill-15-thegem-blog-justified.webp",
    num: "10",
    title: "Railway Surveys",
    body: "Precise survey data to support rail alignment, construction, and maintenance for industrial and transit networks.",
  },
  {
    href: "/geospatial-services/bim-modelling-services/",
    img: "/assets/uploads/2025/08/3D-Image-Scan.jpg.jpg",
    num: "11",
    title: "BIM & 3D Modelling",
    body: "BIM Modelling and 3D Modelling services covering everything from infrastructure planning to detailed visualizations—delivered with precision and clarity.",
  },
];

const FACTS = [
  { n: "100+", l: "Years of experience" },
  { n: "11", l: "Service lines" },
  { n: "4", l: "Offices in BC & Yukon" },
];

const INDUSTRIES = [
  {
    title: "Engineers, Planners, and Developers",
    body: "They rely on spatial data for accurate site planning and design.",
    icon: (
      /* drafting triangle / crosshair */
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="12" cy="12" r="7" />
        <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
      </svg>
    ),
  },
  {
    title: "Federal, Provincial, and Municipal Governments",
    body: "Used for infrastructure, permitting, and land management.",
    icon: (
      /* landmark */
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M3 21h18M4 10h16M12 3l8 6H4l8-6z" />
        <path d="M6 10v8M10 10v8M14 10v8M18 10v8" />
      </svg>
    ),
  },
  {
    title: "First Nations and Indigenous Communities",
    body: "Essential for stewardship, land claims, and planning.",
    icon: (
      /* contour / land */
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M3 18c3-1.5 5-6 9-6s6 4.5 9 3" />
        <path d="M3 13c3-1.5 5-5 9-5s6 3.5 9 2" opacity=".55" />
        <path d="M3 8c3-1.2 5-3.6 9-3.6S18 6.4 21 5.6" opacity=".3" />
      </svg>
    ),
  },
  {
    title: "Energy, Rail, Construction, and Mining Companies",
    body: "Supports exploration, development, and infrastructure maintenance.",
    icon: (
      /* layers / infrastructure */
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M12 3l9 5-9 5-9-5 9-5z" />
        <path d="M3 13l9 5 9-5" opacity=".6" />
      </svg>
    ),
  },
];

const APPLICATIONS = [
  {
    title: "Geospatial Services for Infrastructure Development",
    body: "Used for roads, utilities, transit, and bridges.",
  },
  {
    title: "Land and Water Surveys for Natural Resources",
    body: "We support forestry, mining, and energy projects.",
  },
  {
    title: "Urban Growth and Land Management Projects",
    body: "Municipalities use our data for zoning, growth, and smart planning.",
  },
  {
    title: "Geospatial Planning for Indigenous Communities",
    body: "We partner with communities to map and protect land.",
  },
];

export default function Services() {
  useDocumentMeta(
    "Geospatial Services | Canadian Surveying Experts",
    "Geospatial services designed to support infrastructure, resource, and land development projects across Western and Northern Canada."
  );

  return (
    <main id="main" className="pg-services">
      <style>{CSS}</style>

      <PageHero
        image="/assets/uploads/2025/06/Services-Video-scaled.jpg"
        title="Geospatial Services"
        subtitle="Trusted Geospatial Services Company Since 1913"
        lead="Geospatial services designed to support infrastructure, resource, and land development projects across Western and Northern Canada."
        crumb={{ label: "Home", href: "/" }}
      />

      {/* Intro — the positioning statement from the source page */}
      <section className="section" aria-labelledby="svc-intro">
        <div className="container split">
          <div className="reveal">
            <span className="kicker">Land · Water · Infrastructure</span>
            <h2 id="svc-intro">
              Trusted Geospatial Services for Land, Water, and Infrastructure
            </h2>
            <p>
              Underhill Geomatics delivers accurate, reliable geospatial
              services for land, water, and infrastructure projects across
              Western and Northern Canada. Since 1913, our team of land
              surveyors has supported governments, Indigenous communities, and
              industry with data that drives progress.
            </p>
            <div className="facts" aria-label="Company facts">
              {FACTS.map((f) => (
                <div className="fact" key={f.l}>
                  <span className="fn">{f.n}</span>
                  <span className="fl">{f.l}</span>
                </div>
              ))}
            </div>
            <SmartLink
              className="btn"
              to="#lets-talk"
              style={{ marginTop: 32 }}
            >
              Request Consultation
            </SmartLink>
          </div>
          <div className="figure reveal" style={{ transitionDelay: "0.12s" }}>
            <span className="xhair" style={{ top: -13, left: -13 }} aria-hidden="true">
              <i />
            </span>
            <span className="xhair" style={{ bottom: 21, right: -13 }} aria-hidden="true">
              <i />
            </span>
            <img
              src="/assets/uploads/2025/06/land-surveying_039_underhill-geomatics__Eagle-Vision-Agency_.webp"
              alt="Underhill surveyor at work with field instrumentation"
              loading="lazy"
            />
            <span className="callout" aria-hidden="true">
              FIELD-TO-OFFICE · SINCE 1913
            </span>
            <span className="cap">GEOSPATIAL SERVICES · WESTERN &amp; NORTHERN CANADA</span>
          </div>
        </div>
      </section>

      {/* 3-step process */}
      <section className="section grey" aria-labelledby="svc-steps">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">How It Works</span>
            <h2 id="svc-steps">
              Survey Smarter. Plan Faster. Build Better. Start in 3 Steps.
            </h2>
            <p className="lead">
              For over 100 years, clients have trusted Underhill to deliver
              clarity and confidence on Canada’s most challenging projects.
            </p>
          </div>
          <div className="steps">
            {[
              {
                t: "Request a Customized Quote",
                b: "We’ll provide a tailored scope and estimate for your project.",
              },
              {
                t: "Talk to Our Surveying Specialists",
                b: "Get expert guidance on the right tools and approach.",
              },
              {
                t: "Build with Confidence",
                b: "Receive accurate data, expert insight, and ongoing support.",
              },
            ].map((s, i) => (
              <div
                className="reveal"
                key={s.t}
                style={{ transitionDelay: `${i * 0.1}s` }}
              >
                <div className="step">
                  <h3>{s.t}</h3>
                  <p>{s.b}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Interactive instrument — scene mount owned by the scenes agent */}
      <section className="section dark tight" aria-labelledby="svc-instrument">
        <span className="xhair on-dark" style={{ top: 24, right: 30 }} aria-hidden="true">
          <i />
        </span>
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">The Instrument</span>
            <h2 id="svc-instrument">Survey-Grade Precision, Built in Code</h2>
            <p style={{ color: "rgba(255,255,255,.7)" }}>
              The total station — the surveyor’s signature instrument —
              modelled procedurally as a true assembly: tribrach, alidade,
              telescope and tripod, every part mounted to the next. Drag it.
              This is how we think about measurement.
            </p>
          </div>
        </div>
      </section>

      <SceneEmbed
        scene={InstrumentScene}
        seekTo={1}
        label="TOTAL STATION · PROCEDURAL ASSEMBLY"
        hint="DRAG TO ROTATE"
        fallbackImage="/assets/uploads/2025/08/Surveyor-with-Geodimeter-Model-700_fx.jpg"
        fallbackAlt="Surveyor with a Geodimeter instrument"
        fallbackMessage="Interactive instrument unavailable in this browser."
      />

      {/* Full service range */}
      <section className="section grey" aria-labelledby="svc-range">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Full Range</span>
            <h2 id="svc-range">Our Full Range of Geospatial Services</h2>
            <p className="lead">
              Eleven service lines, one standard of accuracy — from UAV LiDAR
              to legal boundary surveys.
            </p>
          </div>
          <div className="svc-grid">
            {SERVICES.map((s, i) => (
              <div
                className="reveal"
                key={s.num}
                style={{ transitionDelay: `${(i % 3) * 0.08}s` }}
              >
                <SmartLink className="svc-card" to={s.href} unported>
                  <div className="svc-media">
                    <img src={s.img} alt="" loading="lazy" />
                    <span className="svc-num">{s.num}</span>
                  </div>
                  <div className="svc-body">
                    <h3>{s.title}</h3>
                    <p>{s.body}</p>
                    <span className="svc-more">
                      Learn More <span className="arr" aria-hidden="true">→</span>
                    </span>
                  </div>
                </SmartLink>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Industries */}
      <section className="section" aria-labelledby="svc-industries">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Industries</span>
            <h2 id="svc-industries">Who Uses Geospatial Services — and Why?</h2>
            <p className="lead">
              Geospatial services support industries that rely on
              location-based data. They guide better decisions across
              infrastructure, planning, and resource development.
            </p>
          </div>
          <div className="ind-grid">
            {INDUSTRIES.map((ind, i) => (
              <div
                className="reveal"
                key={ind.title}
                style={{ transitionDelay: `${i * 0.08}s` }}
              >
                <div className="ind-card">
                  <span className="ind-ico">{ind.icon}</span>
                  <h3>{ind.title}</h3>
                  <p>{ind.body}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="rule light" aria-hidden="true" style={{ opacity: 0.4 }} />
        </div>
      </section>

      {/* Industry applications */}
      <section className="section dark" aria-labelledby="svc-apps">
        <span className="xhair on-dark" style={{ top: 24, left: 30 }} aria-hidden="true">
          <i />
        </span>
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Applications</span>
            <h2 id="svc-apps">Industry Applications of Our Geospatial Services</h2>
            <p style={{ color: "rgba(255,255,255,.7)" }}>
              Geospatial services provide the foundation for informed
              decision-making in key industries. Our solutions help clients
              plan, manage, and develop projects with accuracy and efficiency
              across Canada.
            </p>
          </div>
          <div className="app-grid">
            {APPLICATIONS.map((a, i) => (
              <div
                className="reveal"
                key={a.title}
                style={{ transitionDelay: `${(i % 2) * 0.09}s` }}
              >
                <div className="app-item">
                  <h3>{a.title}</h3>
                  <p>{a.body}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="rule" aria-hidden="true" />
        </div>
      </section>

      <CtaBand />
    </main>
  );
}
