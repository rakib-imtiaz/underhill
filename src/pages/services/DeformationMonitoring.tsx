import { useEffect, useRef } from "react";
import CtaBand from "../../components/CtaBand";
import SmartLink from "../../components/SmartLink";
import useDocumentMeta from "../../hooks/useDocumentMeta";

/* ---------------------------------------------------------------------------
   Page-scoped styles, namespaced under `.pg-deformation`. The hero is video-
   backed (the only video on the page); everything else is static imagery.
   Every animation is transform/opacity only and disabled under
   prefers-reduced-motion — GPU-cheap by contract.
--------------------------------------------------------------------------- */
const CSS = `
/* ---------- video hero (mirrors the shared .hero markup) ---------- */
.pg-deformation .hero-photo video {
  width: 100%; height: 100%; object-fit: cover;
}
.pg-deformation .hero-shade {
  position: absolute; inset: 0; z-index: 2;
  background: linear-gradient(180deg, rgba(18,26,38,.62), rgba(18,26,38,.78) 90%);
}

/* ---------- monitoring sensor chips ---------- */
.pg-deformation .chips { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 26px; }
.pg-deformation .chip {
  font-family: var(--font-head); font-size: 12px; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--navy);
  border: 1px solid var(--grey-100); border-left: 3px solid var(--blue);
  background: var(--white); padding: 9px 14px;
  transition: transform 0.3s var(--ease), border-color 0.3s var(--ease);
}
.pg-deformation .chip:hover { transform: translateY(-3px); border-left-color: var(--lime); }

/* figure callout chip */
.pg-deformation .figure .callout {
  position: absolute; top: 18px; right: 18px;
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--white);
  background: rgba(29,34,43,.78); padding: 7px 12px; border-left: 2px solid var(--lime);
}

/* ---------- industries (dark) ---------- */
.pg-deformation .ind-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; margin-top: 54px;
}
@media (max-width: 980px) { .pg-deformation .ind-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 620px) { .pg-deformation .ind-grid { grid-template-columns: 1fr; } }
.pg-deformation .ind-grid > .reveal { display: flex; }
.pg-deformation .ind-item {
  position: relative; flex: 1; padding: 24px 26px 24px 30px;
  background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.09);
  border-left: 3px solid var(--blue);
  transition: transform 0.3s var(--ease), border-color 0.3s var(--ease), background 0.3s var(--ease);
}
.pg-deformation .ind-item:hover {
  transform: translateX(6px); border-left-color: var(--lime);
  background: rgba(255,255,255,.06);
}
.pg-deformation .ind-item h3 { color: var(--white); font-size: 18px; margin: 0; }

/* ---------- featured projects ---------- */
.pg-deformation .proj-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 54px;
}
@media (max-width: 980px) { .pg-deformation .proj-grid { grid-template-columns: 1fr; } }
.pg-deformation .proj-grid > .reveal { display: flex; }
.pg-deformation .proj-card {
  position: relative; display: flex; flex-direction: column; flex: 1;
  background: var(--navy); color: rgba(255,255,255,.74); overflow: hidden;
  transition: transform 0.35s var(--ease), box-shadow 0.35s var(--ease);
}
.pg-deformation .proj-card:hover { transform: translateY(-8px); box-shadow: 0 34px 64px rgba(18,26,38,.3); }
.pg-deformation .proj-media { position: relative; aspect-ratio: 16 / 10; overflow: hidden; }
.pg-deformation .proj-media img {
  width: 100%; height: 100%; object-fit: cover;
  transition: transform 0.6s var(--ease);
}
.pg-deformation .proj-card:hover .proj-media img { transform: scale(1.06); }
.pg-deformation .proj-media::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(60,57,80,.08), rgba(60,57,80,.55) 96%);
}
.pg-deformation .proj-card h3 {
  color: var(--white); font-size: 19px; margin: 0; padding: 22px 24px 24px;
}

/* ---------- related services ---------- */
.pg-deformation .rel-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 54px;
}
@media (max-width: 980px) { .pg-deformation .rel-grid { grid-template-columns: 1fr; } }
.pg-deformation .rel-grid > .reveal { display: flex; }
.pg-deformation .rel-card {
  position: relative; flex: 1; padding: 28px 26px 26px;
  background: var(--white); box-shadow: 0 10px 40px rgba(18,26,38,.08); overflow: hidden;
  display: flex; flex-direction: column;
  transition: transform 0.35s var(--ease), box-shadow 0.35s var(--ease);
}
.pg-deformation .rel-card::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, var(--blue), var(--lime));
  transform: scaleX(0); transform-origin: left;
  transition: transform 0.45s var(--ease);
}
.pg-deformation .rel-card:hover { transform: translateY(-6px); box-shadow: 0 26px 54px rgba(18,26,38,.16); }
.pg-deformation .rel-card:hover::before { transform: scaleX(1); }
.pg-deformation .rel-card h3 { color: var(--navy); font-size: 20px; margin: 0 0 10px; }
.pg-deformation .rel-card p { font-size: 14.5px; color: var(--grey-600); margin: 0; flex: 1; }
.pg-deformation .rel-more {
  margin-top: 18px; font-family: var(--font-head); font-weight: 600; font-size: 13px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--navy);
  display: inline-flex; align-items: center; gap: 9px;
  transition: color 0.25s var(--ease);
}
.pg-deformation .rel-more .arr { color: var(--blue); transition: transform 0.3s var(--ease); }
.pg-deformation .rel-card:hover .rel-more { color: var(--blue); }
.pg-deformation .rel-card:hover .rel-more .arr { transform: translateX(6px); }

/* ---------- reduced motion: kill every transition introduced here ---------- */
@media (prefers-reduced-motion: reduce) {
  .pg-deformation .chip, .pg-deformation .ind-item, .pg-deformation .proj-card,
  .pg-deformation .proj-media img, .pg-deformation .rel-card, .pg-deformation .rel-card::before,
  .pg-deformation .rel-more, .pg-deformation .rel-more .arr {
    transition: none !important;
  }
  .pg-deformation .chip:hover, .pg-deformation .ind-item:hover,
  .pg-deformation .proj-card:hover, .pg-deformation .rel-card:hover { transform: none; }
  .pg-deformation .proj-card:hover .proj-media img { transform: none; }
}
`;

const MONITORING_POINTS = [
  "Rapid deployment for emergencies",
  "Real-time, daily, weekly & monthly monitoring",
  "Spatial, environmental, and temporal monitoring",
  "Multiple sensor integrations: conventional survey, geotechnical, vibration, tilt, atmospheric",
];

const SERVICE_EXAMPLES = [
  "Infrastructure monitoring",
  "Slope stability monitoring",
  "Preload settlement",
  "Periodic movement monitoring",
  "Construction excavation",
  "Spatial, environmental and temporal monitoring",
  "1D, 2D, 3D monitoring",
];

const INDUSTRIES = [
  "Transportation (Bridges, Tunnels)",
  "High-Rise Construction",
  "Energy (Dams, Stations)",
  "Urban Infrastructure",
  "Historic Restoration",
  "Mining & Resource Sites",
];

const PROJECTS = [
  {
    title: "Fraser River Tunnel Project",
    img: "/assets/uploads/2026/07/Highway99-Tunnel-2-thegem-blog-justified.jpg",
  },
  {
    title: "Burnaby Hospital Redevelopment Project",
    img: "/assets/uploads/2026/07/Burnaby-Hospital-Redevelopment-Project-1-thegem-blog-justified.jpg",
  },
  {
    title: "Site C Hydroelectric Dam – High Precision Monitoring",
    img: "/assets/uploads/2026/05/DJI_20250618025441_0030_W-scaled-thegem-blog-justified.jpg",
  },
];

const RELATED = [
  {
    href: "/geospatial-services/construction-surveying/",
    title: "Construction & Engineering Surveys",
    body: "Surveying support throughout the construction lifecycle, from initial layout to final as-builts.",
  },
  {
    href: "/geospatial-services/3d-laser-scanning-reality-capture/",
    title: "Laser Scanning",
    body: "Reality capture combining traditional surveying, laser scanning, and photogrammetry into full-detail digital models.",
  },
  {
    href: "/geospatial-services/aerial-surveying/",
    title: "Aerial Surveys",
    body: "Aerial surveys using drones, LiDAR, and photogrammetry to deliver accurate, high-resolution data for planning and development.",
  },
];

export default function DeformationMonitoring() {
  useDocumentMeta(
    "Deformation Monitoring Services | Structural Surveying Experts",
    "Settlement, movement, and deformation monitoring surveys for engineering and construction projects across Western Canada — accurate, real-time data to detect even the smallest movements."
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
    <main id="main" className="pg-deformation">
      <style>{CSS}</style>

      {/* Video hero — mirrors the shared .hero structure, video in place of the photo */}
      <section className="hero">
        <div className="hero-photo">
          <video
            ref={videoRef}
            src="/assets/uploads/2026/03/deformation-monitoring-video-1.mp4"
            poster="/assets/uploads/2026/02/PCN-Spillway-Thermography-thegem-blog-justified.webp"
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
            <span className="here" aria-current="page">Deformation Monitoring</span>
          </nav>
          <span className="hero-eyebrow">Movement Monitoring Experts</span>
          <h1>Deformation Monitoring Services for Safer Structures</h1>
          <p className="lead on-dark">
            Underhill provides settlement, movement, and deformation monitoring
            surveys for engineering and construction projects across Western
            Canada. We deliver accurate, real-time data to detect even the
            smallest movements, helping prevent failures, reduce costs, and
            support informed decision-making.
          </p>
          <div className="actions">
            <SmartLink className="btn" to="#lets-talk">
              Request Consultation
            </SmartLink>
            <a
              className="btn ghost"
              href="/assets/uploads/2026/04/Underhill-Monitoring-Feature-Sheet-v1.pdf"
              target="_blank"
              rel="noopener noreferrer"
            >
              View Feature Sheet
            </a>
          </div>
        </div>
        <div className="hero-ticks" aria-hidden="true" />
      </section>

      {/* Experience */}
      <section className="section" aria-labelledby="dm-experience">
        <div className="container split">
          <div className="reveal">
            <span className="kicker">Our Experience with Structural and Deformation Surveys</span>
            <h2 id="dm-experience">
              Decades of trusted expertise in complex infrastructure monitoring.
            </h2>
            <p>
              Underhill has decades of experience with monitoring across
              Western Canada. From excavations, rails, public infrastructure
              and underground services, our systems are custom built.
            </p>
            <h3>
              Our expert monitoring services help prevent failure, reduce
              repair costs, and support smart planning
            </h3>
            <ul className="check">
              {MONITORING_POINTS.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <div className="chips" aria-label="Sensor integrations">
              <span className="chip">Conventional Survey</span>
              <span className="chip">Geotechnical</span>
              <span className="chip">Vibration</span>
              <span className="chip">Tilt</span>
              <span className="chip">Atmospheric</span>
            </div>
          </div>
          <div className="figure reveal" style={{ transitionDelay: "0.12s" }}>
            <img
              src="/assets/uploads/2025/06/NorthVancouverWaterTunnel-2.webp"
              alt="Tunnel infrastructure monitored for movement and deformation"
              loading="lazy"
            />
            <span className="callout" aria-hidden="true">
              REAL-TIME · DAILY · WEEKLY · MONTHLY
            </span>
            <span className="cap">STRUCTURAL &amp; DEFORMATION SURVEYS · WESTERN CANADA</span>
          </div>
        </div>
      </section>

      {/* Services + examples */}
      <section className="section grey" aria-labelledby="dm-services">
        <div className="container">
          <div className="sec-head reveal" style={{ maxWidth: 760 }}>
            <span className="kicker">Deformation and Structural Surveying Services</span>
            <h2 id="dm-services">Reliable Data. Practical Solutions.</h2>
            <p className="lead">
              Our monitoring services are designed to give you timely,
              actionable information about your site. Whether you’re managing
              long-term settlement or monitoring slope stability, we provide
              the right mix of tools and expertise to get the job done.
            </p>
            <p>
              From manual surveys to automated systems, we tailor every
              solution to your project’s risk, scope, and budget.
            </p>
          </div>
          <div className="split" style={{ marginTop: 54 }}>
            <div className="reveal">
              <h3>Monitoring Service Examples</h3>
              <ul className="check">
                {SERVICE_EXAMPLES.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
            <div className="figure reveal" style={{ transitionDelay: "0.12s" }}>
              <img
                src="/assets/uploads/2025/05/Underhill-Geomatics-Burnaby_029_Eagle-Vision-Agency_20240510.webp"
                alt="Underhill surveyor operating monitoring instrumentation on site"
                loading="lazy"
              />
              <span className="cap">1D · 2D · 3D MONITORING</span>
            </div>
          </div>
        </div>
      </section>

      {/* Industries — dark contrast */}
      <section className="section dark" aria-labelledby="dm-industries">
        <div className="container">
          <div className="sec-head reveal" style={{ maxWidth: 760 }}>
            <span className="kicker">Industries We Serve</span>
            <h2 id="dm-industries">Where Monitoring Makes the Biggest Impact</h2>
            <p style={{ color: "rgba(255,255,255,.7)" }}>
              Deformation monitoring and structural surveying are essential
              across a wide range of industries. From infrastructure to energy,
              these services protect assets, ensure public safety, and support
              better decision-making. Here’s where our expertise delivers the
              most value:
            </p>
          </div>
          <div className="ind-grid">
            {INDUSTRIES.map((ind, i) => (
              <div
                className="reveal"
                key={ind}
                style={{ transitionDelay: `${(i % 3) * 0.08}s` }}
              >
                <div className="ind-item">
                  <h3>{ind}</h3>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured projects */}
      <section className="section" aria-labelledby="dm-projects">
        <div className="container">
          <div className="sec-head reveal" style={{ maxWidth: 760 }}>
            <span className="kicker">Featured Projects</span>
            <h2 id="dm-projects">Monitoring in the Field</h2>
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
      <section className="section grey" aria-labelledby="dm-related">
        <div className="container">
          <div className="sec-head reveal" style={{ maxWidth: 760 }}>
            <span className="kicker">Related Services</span>
            <h2 id="dm-related">Explore More Geospatial Services</h2>
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
