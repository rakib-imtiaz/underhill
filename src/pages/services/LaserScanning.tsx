import { useEffect, useRef } from "react";
import CtaBand from "../../components/CtaBand";
import SmartLink from "../../components/SmartLink";
import useDocumentMeta from "../../hooks/useDocumentMeta";

/* ---------------------------------------------------------------------------
   Page-scoped styles, namespaced under `.pg-laser`. This is the flagship
   reality-capture page: a point-cloud video hero, a wide cinematic figure
   band, and a dark numbered service matrix. Static imagery everywhere except
   the hero video. Every animation is transform/opacity only and disabled
   under prefers-reduced-motion — GPU-cheap by contract.
--------------------------------------------------------------------------- */
const CSS = `
/* ---------- video hero (mirrors the shared .hero markup) ---------- */
.pg-laser .hero-photo video {
  width: 100%; height: 100%; object-fit: cover;
}
.pg-laser .hero-shade {
  position: absolute; inset: 0; z-index: 2;
  background: linear-gradient(180deg, rgba(18,26,38,.58), rgba(18,26,38,.8) 92%);
}

/* ---------- experience fact chips ---------- */
.pg-laser .facts { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px; }
.pg-laser .fact {
  display: flex; flex-direction: column; gap: 2px;
  border-left: 3px solid var(--blue); padding: 4px 16px 4px 14px;
}
.pg-laser .fact .fn {
  font-family: var(--font-head); font-weight: 700; font-size: 24px;
  color: var(--navy); line-height: 1;
}
.pg-laser .fact .fl {
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--grey-600);
}

/* figure callout chip */
.pg-laser .figure .callout {
  position: absolute; top: 18px; right: 18px;
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--white);
  background: rgba(29,34,43,.78); padding: 7px 12px; border-left: 2px solid var(--lime);
}

/* ---------- cinematic wide figure band ---------- */
.pg-laser .band {
  position: relative; height: clamp(320px, 52vh, 560px); overflow: hidden;
  background: var(--navy);
}
.pg-laser .band img {
  width: 100%; height: 100%; object-fit: cover; opacity: 0.85;
  transform: scale(1.04);
  transition: transform 1.2s var(--ease);
}
.pg-laser .band:hover img { transform: scale(1.0); }
.pg-laser .band::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(18,26,38,.35), rgba(18,26,38,.15) 45%, rgba(18,26,38,.6));
}
.pg-laser .band .band-cap {
  position: absolute; left: 0; right: 0; bottom: 26px; z-index: 2;
  display: flex; justify-content: space-between; gap: 20px; flex-wrap: wrap;
  font-family: var(--font-head); font-size: 11.5px; font-weight: 600;
  letter-spacing: 0.22em; text-transform: uppercase; color: rgba(255,255,255,.85);
}

/* ---------- service matrix (dark) ---------- */
.pg-laser .matrix { margin-top: 64px; display: grid; gap: 58px; }
.pg-laser .m-group { position: relative; padding-left: 92px; }
@media (max-width: 700px) { .pg-laser .m-group { padding-left: 0; } }
.pg-laser .m-num {
  position: absolute; left: 0; top: 4px;
  font-family: var(--font-head); font-weight: 700; font-size: 40px; line-height: 1;
  color: transparent; -webkit-text-stroke: 1px rgba(255,255,255,.35);
}
@media (max-width: 700px) { .pg-laser .m-num { position: static; display: block; margin-bottom: 10px; } }
.pg-laser .m-group > h3 { color: var(--white); font-size: 23px; margin: 0 0 22px; }
.pg-laser .m-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px;
}
@media (max-width: 800px) { .pg-laser .m-grid { grid-template-columns: 1fr; } }
.pg-laser .m-item {
  position: relative; padding: 22px 24px 22px 30px;
  background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.09);
  border-left: 3px solid var(--blue);
  transition: transform 0.3s var(--ease), border-color 0.3s var(--ease), background 0.3s var(--ease);
}
.pg-laser .m-item:hover {
  transform: translateX(6px); border-left-color: var(--lime);
  background: rgba(255,255,255,.06);
}
.pg-laser .m-item h4 {
  color: var(--white); font-size: 16.5px; margin: 0 0 7px;
  font-family: var(--font-head); font-weight: 600;
}
.pg-laser .m-item p { color: rgba(255,255,255,.7); font-size: 14px; margin: 0; }

/* ---------- featured projects ---------- */
.pg-laser .proj-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 54px;
}
@media (max-width: 980px) { .pg-laser .proj-grid { grid-template-columns: 1fr; } }
.pg-laser .proj-grid > .reveal { display: flex; }
.pg-laser .proj-card {
  position: relative; display: flex; flex-direction: column; flex: 1;
  background: var(--navy); color: rgba(255,255,255,.74); overflow: hidden;
  transition: transform 0.35s var(--ease), box-shadow 0.35s var(--ease);
}
.pg-laser .proj-card:hover { transform: translateY(-8px); box-shadow: 0 34px 64px rgba(18,26,38,.3); }
.pg-laser .proj-media { position: relative; aspect-ratio: 16 / 10; overflow: hidden; }
.pg-laser .proj-media img {
  width: 100%; height: 100%; object-fit: cover;
  transition: transform 0.6s var(--ease);
}
.pg-laser .proj-card:hover .proj-media img { transform: scale(1.06); }
.pg-laser .proj-media::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(60,57,80,.08), rgba(60,57,80,.55) 96%);
}
.pg-laser .proj-card h3 {
  color: var(--white); font-size: 19px; margin: 0; padding: 22px 24px 24px;
}

/* ---------- related services ---------- */
.pg-laser .rel-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 54px;
}
@media (max-width: 980px) { .pg-laser .rel-grid { grid-template-columns: 1fr; } }
.pg-laser .rel-grid > .reveal { display: flex; }
.pg-laser .rel-card {
  position: relative; flex: 1; padding: 28px 26px 26px;
  background: var(--white); box-shadow: 0 10px 40px rgba(18,26,38,.08); overflow: hidden;
  display: flex; flex-direction: column;
  transition: transform 0.35s var(--ease), box-shadow 0.35s var(--ease);
}
.pg-laser .rel-card::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, var(--blue), var(--lime));
  transform: scaleX(0); transform-origin: left;
  transition: transform 0.45s var(--ease);
}
.pg-laser .rel-card:hover { transform: translateY(-6px); box-shadow: 0 26px 54px rgba(18,26,38,.16); }
.pg-laser .rel-card:hover::before { transform: scaleX(1); }
.pg-laser .rel-card h3 { color: var(--navy); font-size: 20px; margin: 0 0 10px; }
.pg-laser .rel-card p { font-size: 14.5px; color: var(--grey-600); margin: 0; flex: 1; }
.pg-laser .rel-more {
  margin-top: 18px; font-family: var(--font-head); font-weight: 600; font-size: 13px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--navy);
  display: inline-flex; align-items: center; gap: 9px;
  transition: color 0.25s var(--ease);
}
.pg-laser .rel-more .arr { color: var(--blue); transition: transform 0.3s var(--ease); }
.pg-laser .rel-card:hover .rel-more { color: var(--blue); }
.pg-laser .rel-card:hover .rel-more .arr { transform: translateX(6px); }

/* ---------- reduced motion: kill every transition introduced here ---------- */
@media (prefers-reduced-motion: reduce) {
  .pg-laser .band img, .pg-laser .m-item, .pg-laser .proj-card, .pg-laser .proj-media img,
  .pg-laser .rel-card, .pg-laser .rel-card::before,
  .pg-laser .rel-more, .pg-laser .rel-more .arr {
    transition: none !important;
  }
  .pg-laser .band img, .pg-laser .band:hover img { transform: none; }
  .pg-laser .m-item:hover, .pg-laser .proj-card:hover, .pg-laser .rel-card:hover { transform: none; }
  .pg-laser .proj-card:hover .proj-media img { transform: none; }
}
`;

const FACTS = [
  { n: "2007", l: "Scanning at Underhill since" },
  { n: "3", l: "Systems — Leica · Faro · Trimble" },
  { n: "100s", l: "Projects across Canada" },
];

const WHO_WE_HELP = [
  "Construction managers",
  "Engineers and architects",
  "Industrial site operators",
  "Film and media producers",
  "Heritage and environmental planners",
  "Federal, provincial, and Indigenous governments",
];

const SERVICE_GROUPS = [
  {
    num: "01",
    title: "Digital As-Built and Documentation Services",
    items: [
      {
        t: "Construction Verification and Clash Detection",
        b: "Scan construction sites to compare real-world conditions against design plans, identifying conflicts early.",
      },
      {
        t: "Building and Infrastructure Modeling",
        b: "Generate accurate 3D representations of buildings and infrastructure for maintenance, design, or retrofit planning.",
      },
      {
        t: "Interior and Facade Scans",
        b: "Capture complete surface detail of architectural interiors and building facades with millimetre accuracy.",
      },
      {
        t: "Heritage Documentation and Preservation",
        b: "Digitally preserve historic structures and cultural landmarks using high-resolution laser scanning.",
      },
    ],
  },
  {
    num: "02",
    title: "Data Modeling and Visualization Support",
    items: [
      {
        t: "Point Cloud Creation and Processing",
        b: "Produce detailed point clouds from field data, ready for analysis, modeling, or measurement.",
      },
      {
        t: "BIM-Ready 3D Models",
        b: "Convert scan data into Building Information Models (BIM) to integrate with project workflows.",
      },
      {
        t: "Reverse Engineering Support",
        b: "Reconstruct existing structures digitally to inform design and redevelopment strategies.",
      },
      {
        t: "Output in Multiple File Formats",
        b: "Deliverables in formats such as LAS, E57, RCP, and OBJ to support different software environments.",
      },
    ],
  },
  {
    num: "03",
    title: "Immersive and Media Services",
    items: [
      {
        t: "Virtual Reality Tours & 360° Site Imaging",
        b: "Create immersive experiences for stakeholder presentations, safety reviews, or virtual access.",
      },
      {
        t: "Scanning for CGI and Visual Effects",
        b: "Capture environments for use in digital modeling, visual effects, and 3D animation.",
      },
      {
        t: "Matterport Scanning for Interiors",
        b: "Offer walkable, interactive 3D models of interior spaces for facilities, real estate, or design.",
      },
    ],
  },
  {
    num: "04",
    title: "Specialized and Analytical Applications",
    items: [
      {
        t: "Geotechnical Scanning & Forestry Modeling",
        b: "Support slope stability analysis, erosion studies, and vegetation mapping with high-resolution scans.",
      },
      {
        t: "UAV Photogrammetry & LIDAR",
        b: "Collect large-area terrain data from drones for mapping, volumetrics, or environmental monitoring.",
      },
      {
        t: "Volumetric Measurement of Stockpiles",
        b: "Accurately measure bulk material volumes for tracking inventory or material movements.",
      },
      {
        t: "Environmental Terrain Modeling",
        b: "Generate detailed models of natural landscapes to support planning, remediation, or habitat studies.",
      },
    ],
  },
];

const PROJECTS = [
  {
    title: "Burnaby Hospital Redevelopment Project",
    img: "/assets/uploads/2026/07/Burnaby-Hospital-Redevelopment-Project-1-thegem-blog-justified.jpg",
  },
  {
    title: "North Vancouver School District Surveying & 3D Scanning",
    img: "/assets/uploads/2025/05/Copy-of-DSCF1858-thegem-blog-justified.webp",
  },
  {
    title: "Deloitte Summit Surveying & 3D Laser Scanning",
    img: "/assets/uploads/2020/01/Underhill-400W-Georgia-14-1-thegem-blog-justified.webp",
  },
];

const RELATED = [
  {
    href: "/geospatial-services/bim-modelling-services/",
    title: "BIM & 3D Modelling",
    body: "BIM Modelling and 3D Modelling services covering everything from infrastructure planning to detailed visualizations—delivered with precision and clarity.",
  },
  {
    href: "/geospatial-services/deformation-monitoring/",
    title: "Deformation Monitoring",
    body: "Precise monitoring surveys to detect structural shifts, ground movement, and changes in elevation over time.",
  },
  {
    href: "/geospatial-services/construction-surveying/",
    title: "Construction & Engineering Surveys",
    body: "Surveying support throughout the construction lifecycle, from initial layout to final as-builts.",
  },
];

export default function LaserScanning() {
  useDocumentMeta(
    "3D Laser Scanning | Reality Capture Services",
    "High-resolution reality capture for construction, infrastructure, and as-built documentation — precise, measurable, project-ready 3D laser scanning data across Canada."
  );

  /* Pause the hero video when it scrolls offscreen (and under reduced motion). */
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      v.pause();
      return;
    }
    if (typeof IntersectionObserver === "undefined") return;
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
    <main id="main" className="pg-laser">
      <style>{CSS}</style>

      {/* Video hero — point-cloud reel in place of the hero photo */}
      <section className="hero">
        <div className="hero-photo">
          <video
            ref={videoRef}
            src="/assets/uploads/2026/03/point-cloud-1-1.mp4"
            poster="/assets/uploads/2025/06/3d-laser-scanning045_underhill-geomatics__Eagle-Vision-Agency_.jpg"
            muted
            loop
            autoPlay
            playsInline
            preload="metadata"
            aria-hidden="true"
          />
        </div>
        <div className="hero-shade" aria-hidden="true" />
        <div className="blueprint-grid" aria-hidden="true" />
        <div className="coords tl" aria-hidden="true">
          49.2827° N · 123.1207° W
          <br />
          GEODETIC DATUM NAD83
        </div>
        <div className="container">
          <nav className="crumbs" aria-label="Breadcrumb">
            <SmartLink to="/">Home</SmartLink>
            <span className="sep" aria-hidden="true">/</span>
            <SmartLink to="/geospatial-services/">Geospatial Services</SmartLink>
            <span className="sep" aria-hidden="true">/</span>
            <span className="here" aria-current="page">Laser Scanning</span>
          </nav>
          <span className="hero-eyebrow">Reality Capture</span>
          <h1>3D Laser Scanning Services</h1>
          <h2 className="hero-sub">
            High-resolution reality capture for construction, infrastructure,
            and as-built documentation.
          </h2>
          <p className="lead on-dark">
            3D laser scanning creates accurate digital records of real-world
            environments. Our licensed surveyors use the latest scanning
            technologies to deliver precise, measurable, and project-ready
            data across Canada.
          </p>
          <div className="actions">
            <SmartLink className="btn" to="#lets-talk">
              Request Consultation
            </SmartLink>
          </div>
        </div>
        <div className="hero-ticks" aria-hidden="true" />
      </section>

      {/* Expertise */}
      <section className="section" aria-labelledby="ls-expertise">
        <div className="container split">
          <div className="reveal">
            <span className="kicker">Our 3D Laser Scanning Expertise</span>
            <h2 id="ls-expertise">Decades of Experience</h2>
            <p>
              Our 3D laser scanning expertise spans over a decade of
              experience, using reality capture to support complex projects
              across Canada. We bring accuracy, accountability, and deep
              technical knowledge to every scan.
            </p>
            <p>
              Underhill has offered 3D laser scanning services since 2007. We
              operate systems from Leica, Faro, and Trimble and have completed
              hundreds of projects across Canada.
            </p>
            <div className="facts" aria-label="Laser scanning facts">
              {FACTS.map((f) => (
                <div className="fact" key={f.l}>
                  <span className="fn">{f.n}</span>
                  <span className="fl">{f.l}</span>
                </div>
              ))}
            </div>
            <h3 style={{ marginTop: 34 }}>Who We Help</h3>
            <ul className="check two-col">
              {WHO_WE_HELP.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
          <div className="figure reveal" style={{ transitionDelay: "0.12s" }}>
            <img
              src="/assets/uploads/2025/06/3d-laser-scanning045_underhill-geomatics__Eagle-Vision-Agency_.jpg"
              alt="Surveyor operating a 3D laser scanner on site"
              loading="lazy"
            />
            <span className="callout" aria-hidden="true">
              LEICA · FARO · TRIMBLE
            </span>
            <span className="cap">REALITY CAPTURE · SINCE 2007</span>
          </div>
        </div>
      </section>

      {/* Cinematic figure band */}
      <div className="band" aria-label="3D laser scanning in the field">
        <img
          src="/assets/uploads/2025/05/Copy-of-DSCF1858-thegem-blog-justified.webp"
          alt="High-resolution laser scan capture of a built environment"
          loading="lazy"
        />
        <div className="container band-cap" aria-hidden="true">
          <span>POINT CLOUD · MILLIMETRE ACCURACY</span>
          <span>LAS · E57 · RCP · OBJ</span>
        </div>
      </div>

      {/* Service matrix — dark contrast */}
      <section className="section dark" aria-labelledby="ls-services">
        <div className="container">
          <div className="sec-head reveal" style={{ maxWidth: 760 }}>
            <span className="kicker">Our 3D Laser Scanning Services</span>
            <h2 id="ls-services">
              Comprehensive 3D laser scanning and reality capture services
              tailored for technical, industrial, and spatial applications.
            </h2>
            <p style={{ color: "rgba(255,255,255,.7)" }}>
              We provide complete 3D laser scanning services for reality
              capture, as-built documentation, visualization, and spatial
              analysis. These services support construction, industrial,
              environmental, and digital media applications.
            </p>
          </div>
          <div className="matrix">
            {SERVICE_GROUPS.map((g, gi) => (
              <div className="m-group reveal" key={g.num}>
                <span className="m-num" aria-hidden="true">{g.num}</span>
                <h3>{g.title}</h3>
                <div className="m-grid">
                  {g.items.map((it, i) => (
                    <div
                      className="m-item"
                      key={it.t}
                      style={{ transitionDelay: `${((gi + i) % 2) * 0.06}s` }}
                    >
                      <h4>{it.t}</h4>
                      <p>{it.b}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured projects */}
      <section className="section" aria-labelledby="ls-projects">
        <div className="container">
          <div className="sec-head reveal" style={{ maxWidth: 760 }}>
            <span className="kicker">Featured Projects</span>
            <h2 id="ls-projects">Reality Capture in the Field</h2>
          </div>
          <div className="proj-grid">
            {PROJECTS.map((p, i) => (
              <div
                className="reveal"
                key={p.title}
                style={{ transitionDelay: `${i * 0.08}s` }}
              >
                <div className="proj-card">
                  <div className="proj-media">
                    <img src={p.img} alt="" loading="lazy" />
                  </div>
                  <h3>{p.title}</h3>
                </div>
              </div>
            ))}
          </div>
          <div className="reveal" style={{ marginTop: 34 }}>
            <SmartLink className="btn" to="/land-surveying-projects/">
              All Projects
            </SmartLink>
          </div>
        </div>
      </section>

      {/* Related services */}
      <section className="section grey" aria-labelledby="ls-related">
        <div className="container">
          <div className="sec-head reveal" style={{ maxWidth: 760 }}>
            <span className="kicker">Related Services</span>
            <h2 id="ls-related">Explore More Geospatial Services</h2>
          </div>
          <div className="rel-grid">
            {RELATED.map((r, i) => (
              <div
                className="reveal"
                key={r.href}
                style={{ transitionDelay: `${i * 0.08}s` }}
              >
                <SmartLink className="rel-card" to={r.href}>
                  <h3>{r.title}</h3>
                  <p>{r.body}</p>
                  <span className="rel-more">
                    Learn More <span className="arr" aria-hidden="true">→</span>
                  </span>
                </SmartLink>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBand />
    </main>
  );
}
