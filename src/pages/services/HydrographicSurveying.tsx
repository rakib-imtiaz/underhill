import PageHero from "../../components/PageHero";
import CtaBand from "../../components/CtaBand";
import SmartLink from "../../components/SmartLink";
import useDocumentMeta from "../../hooks/useDocumentMeta";

/* ---------------------------------------------------------------------------
   Page-scoped styles, namespaced under `.pg-hydrographic`. Static imagery
   only — no video on this page. Every animation is transform/opacity only
   and disabled under prefers-reduced-motion — GPU-cheap by contract.
--------------------------------------------------------------------------- */
const CSS = `
/* figure callout chip */
.pg-hydrographic .figure .callout {
  position: absolute; top: 18px; right: 18px;
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--white);
  background: rgba(29,34,43,.78); padding: 7px 12px; border-left: 2px solid var(--lime);
}

/* ---------- capability items (dark) ---------- */
.pg-hydrographic .cap-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 26px; margin-top: 54px;
}
@media (max-width: 800px) { .pg-hydrographic .cap-grid { grid-template-columns: 1fr; } }
.pg-hydrographic .cap-grid > .reveal { display: flex; }
.pg-hydrographic .cap-item {
  position: relative; flex: 1; padding: 28px 30px 28px 36px;
  background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.09);
  border-left: 3px solid var(--blue);
  transition: transform 0.3s var(--ease), border-color 0.3s var(--ease), background 0.3s var(--ease);
}
.pg-hydrographic .cap-item:hover {
  transform: translateX(6px); border-left-color: var(--lime);
  background: rgba(255,255,255,.06);
}
.pg-hydrographic .cap-item h3 { color: var(--white); font-size: 20px; margin: 0 0 10px; }
.pg-hydrographic .cap-item > p { color: rgba(255,255,255,.7); font-size: 14.5px; margin: 0; }
.pg-hydrographic .cap-item ul.check { margin: 16px 0 0; gap: 9px; }
.pg-hydrographic .cap-item ul.check li { font-size: 14px; }

/* ---------- technology cards ---------- */
.pg-hydrographic .tech-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 54px;
}
@media (max-width: 980px) { .pg-hydrographic .tech-grid { grid-template-columns: 1fr; } }
.pg-hydrographic .tech-grid > .reveal { display: flex; }
.pg-hydrographic .tech-card {
  position: relative; flex: 1; background: var(--white); padding: 30px 28px 30px;
  box-shadow: 0 10px 40px rgba(18,26,38,.08); overflow: hidden;
  transition: transform 0.35s var(--ease), box-shadow 0.35s var(--ease);
}
.pg-hydrographic .tech-card::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, var(--blue), var(--lime));
  transform: scaleX(0); transform-origin: left;
  transition: transform 0.45s var(--ease);
}
.pg-hydrographic .tech-card:hover { transform: translateY(-6px); box-shadow: 0 26px 54px rgba(18,26,38,.16); }
.pg-hydrographic .tech-card:hover::before { transform: scaleX(1); }
.pg-hydrographic .tech-card h3 { color: var(--navy); font-size: 20px; margin: 0 0 6px; }
.pg-hydrographic .tech-card ul.check { margin-bottom: 0; }
.pg-hydrographic .tech-card ul.check li { font-size: 14.5px; }

/* ---------- featured projects ---------- */
.pg-hydrographic .proj-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 54px;
}
@media (max-width: 980px) { .pg-hydrographic .proj-grid { grid-template-columns: 1fr; } }
.pg-hydrographic .proj-grid > .reveal { display: flex; }
.pg-hydrographic .proj-card {
  position: relative; display: flex; flex-direction: column; flex: 1;
  background: var(--navy); color: rgba(255,255,255,.74); overflow: hidden;
  transition: transform 0.35s var(--ease), box-shadow 0.35s var(--ease);
}
.pg-hydrographic .proj-card:hover { transform: translateY(-8px); box-shadow: 0 34px 64px rgba(18,26,38,.3); }
.pg-hydrographic .proj-media { position: relative; aspect-ratio: 16 / 10; overflow: hidden; }
.pg-hydrographic .proj-media img {
  width: 100%; height: 100%; object-fit: cover;
  transition: transform 0.6s var(--ease);
}
.pg-hydrographic .proj-card:hover .proj-media img { transform: scale(1.06); }
.pg-hydrographic .proj-media::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(60,57,80,.08), rgba(60,57,80,.55) 96%);
}
.pg-hydrographic .proj-card h3 {
  color: var(--white); font-size: 19px; margin: 0; padding: 22px 24px 24px;
}

/* ---------- related services ---------- */
.pg-hydrographic .rel-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 54px;
}
@media (max-width: 980px) { .pg-hydrographic .rel-grid { grid-template-columns: 1fr; } }
.pg-hydrographic .rel-grid > .reveal { display: flex; }
.pg-hydrographic .rel-card {
  position: relative; flex: 1; padding: 28px 26px 26px;
  background: var(--white); box-shadow: 0 10px 40px rgba(18,26,38,.08); overflow: hidden;
  display: flex; flex-direction: column;
  transition: transform 0.35s var(--ease), box-shadow 0.35s var(--ease);
}
.pg-hydrographic .rel-card::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, var(--blue), var(--lime));
  transform: scaleX(0); transform-origin: left;
  transition: transform 0.45s var(--ease);
}
.pg-hydrographic .rel-card:hover { transform: translateY(-6px); box-shadow: 0 26px 54px rgba(18,26,38,.16); }
.pg-hydrographic .rel-card:hover::before { transform: scaleX(1); }
.pg-hydrographic .rel-card h3 { color: var(--navy); font-size: 20px; margin: 0 0 10px; }
.pg-hydrographic .rel-card p { font-size: 14.5px; color: var(--grey-600); margin: 0; flex: 1; }
.pg-hydrographic .rel-more {
  margin-top: 18px; font-family: var(--font-head); font-weight: 600; font-size: 13px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--navy);
  display: inline-flex; align-items: center; gap: 9px;
  transition: color 0.25s var(--ease);
}
.pg-hydrographic .rel-more .arr { color: var(--blue); transition: transform 0.3s var(--ease); }
.pg-hydrographic .rel-card:hover .rel-more { color: var(--blue); }
.pg-hydrographic .rel-card:hover .rel-more .arr { transform: translateX(6px); }

/* ---------- reduced motion: kill every transition introduced here ---------- */
@media (prefers-reduced-motion: reduce) {
  .pg-hydrographic .cap-item, .pg-hydrographic .tech-card, .pg-hydrographic .tech-card::before,
  .pg-hydrographic .proj-card, .pg-hydrographic .proj-media img,
  .pg-hydrographic .rel-card, .pg-hydrographic .rel-card::before,
  .pg-hydrographic .rel-more, .pg-hydrographic .rel-more .arr {
    transition: none !important;
  }
  .pg-hydrographic .cap-item:hover, .pg-hydrographic .tech-card:hover,
  .pg-hydrographic .proj-card:hover, .pg-hydrographic .rel-card:hover { transform: none; }
  .pg-hydrographic .proj-card:hover .proj-media img { transform: none; }
}
`;

const CLIENTS = [
  ["Environmental Consultants", "For habitat mapping and marine impact assessments"],
  ["Port Authorities and Engineers", "For berth maintenance, dredging, and harbor design"],
  ["Mining and Energy Developers", "For tailings ponds, subsea cable routing, and site access planning"],
  ["Civil Engineers and Planners", "For infrastructure tied to waterways and intertidal zones"],
  ["Government Agencies", "For flood planning, waterway navigation, and riverbed monitoring"],
] as const;

const CAPABILITIES = [
  {
    title: "Navigation & Port Engineering",
    body: "We support harbour dredging, breakwater planning, and safe berth and channel design with accurate underwater mapping.",
    points: ["Harbour dredging", "Breakwater design", "Safe berth & channel mapping"],
  },
  {
    title: "Offshore Energy & Environmental Surveys",
    body: "Our bathymetric models aid in wind farm siting, offshore drilling, and marine habitat assessments.",
    points: ["Wind farm siting", "Offshore drilling support", "Marine habitat mapping"],
  },
  {
    title: "Coastal & River Management",
    body: "Hydrographic surveys monitor shoreline changes, river scour, and support flood and erosion control efforts.",
    points: ["Shoreline change monitoring", "River scour analysis", "Flood & erosion control"],
  },
  {
    title: "Infrastructure & Resource Development",
    body: "Data from hydrographic surveys supports dam construction, tailings ponds, and underwater pipeline and cable planning.",
    points: ["Dam and tailings pond planning", "Underwater pipeline and cable routing"],
  },
];

const TECH = [
  {
    title: "HYPAC Data Processing Software",
    points: [
      "Real-time visualization",
      "Tidal corrections",
      "Multibeam integration for high-quality charting",
    ],
  },
  {
    title: "SeaFloor HyDrone USV",
    points: [
      "Remote-controlled for shallow or obstructed areas",
      "Reduces crew requirements",
      "Enables continuous, safe data collection",
    ],
  },
  {
    title: "Multibeam & Single-Beam Echo Sounders",
    points: [
      "Multibeam: wide coverage & detailed topography",
      "Single-beam: targeted depth verifications",
    ],
  },
];

const PROJECTS = [
  {
    title: "Dawson City Flood Mapping",
    img: "/assets/uploads/2026/02/dawson-city-river-e1770239236869-thegem-blog-justified.jpg",
  },
  {
    title: "DP World Centerm Terminal Surveying & Expansion Support",
    img: "/assets/uploads/2025/05/DP-World-Centerm-Underhill-07-thegem-blog-justified.webp",
  },
  {
    title: "Vancouver Fraser Port Authority Surveying & GIS Support",
    img: "/assets/uploads/2025/09/DP-World-Crane-6-017-b-thegem-blog-justified.jpg",
  },
];

const RELATED = [
  {
    href: "/geospatial-services/deformation-monitoring/",
    title: "Deformation Monitoring",
    body: "Precise monitoring surveys to detect structural shifts, ground movement, and changes in elevation over time.",
  },
  {
    href: "/geospatial-services/topographic-surveying/",
    title: "Topographic Surveys",
    body: "Detailed elevation and contour maps to support engineering design, land development, and infrastructure planning.",
  },
  {
    href: "/geospatial-services/aerial-surveying/",
    title: "Aerial Surveys",
    body: "Aerial surveys using drones, LiDAR, and photogrammetry to deliver accurate, high-resolution data for planning and development.",
  },
];

export default function HydrographicSurveying() {
  useDocumentMeta(
    "Hydrographic Surveying Services | Trusted Surveyors",
    "Expert hydrographic surveys across Western and Northern Canada — detailed, accurate underwater data for engineering and environmental needs."
  );

  return (
    <main id="main" className="pg-hydrographic">
      <style>{CSS}</style>

      <PageHero
        image="/assets/uploads/2025/08/Hydrographic-Surveying-Williston-Lake.jpg.jpg"
        title="Hydrographic Surveying Services"
        subtitle="Comprehensive Marine Surveying for Complex Projects"
        lead="Hydrographic surveying is a core service at Underhill Geomatics. We deliver expert hydrographic surveys across Western and Northern Canada. Using advanced hydrographic survey equipment and proven methods, we provide detailed, accurate underwater data for engineering and environmental needs."
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Geospatial Services", href: "/geospatial-services/" },
        ]}
      >
        <div className="actions">
          <SmartLink className="btn" to="#lets-talk">
            Request Consultation
          </SmartLink>
        </div>
      </PageHero>

      {/* Expertise */}
      <section className="section" aria-labelledby="hy-expertise">
        <div className="container split">
          <div className="reveal">
            <span className="kicker">Hydrographic Surveying Expertise</span>
            <h2 id="hy-expertise">Trusted by Industry Leaders Across Canada</h2>
            <p>
              Underhill has provided hydrographic surveys across Canada for
              decades. From river scour monitoring to offshore site modeling,
              our work supports critical engineering, resource, and
              environmental projects.
            </p>
            <h3>Blending Innovation With Experience</h3>
            <p>
              We deploy unmanned vessels, sonar systems, and powerful software
              to meet your project needs. Whether you’re mapping a tailings
              pond or verifying port depths, we deliver results you can rely
              on.
            </p>
            <SmartLink className="btn" to="#lets-talk" style={{ marginTop: 12 }}>
              Request Consultation
            </SmartLink>
          </div>
          <div className="figure reveal" style={{ transitionDelay: "0.12s" }}>
            <img
              src="/assets/uploads/2025/05/Underhill-Geomatics-Alouette_055_Eagle-Vision-Agency_20231105.webp"
              alt="Underhill crew conducting a hydrographic survey on the water"
              loading="lazy"
            />
            <span className="callout" aria-hidden="true">
              MARINE &amp; FRESHWATER
            </span>
            <span className="cap">HYDROGRAPHIC SURVEYS · WESTERN &amp; NORTHERN CANADA</span>
          </div>
        </div>
      </section>

      {/* Who we work with */}
      <section className="section grey" aria-labelledby="hy-clients">
        <div className="container">
          <div className="sec-head reveal" style={{ maxWidth: 760 }}>
            <span className="kicker">Who We Work With</span>
            <h2 id="hy-clients">Full-Service Hydrographic Surveying Capabilities</h2>
            <p className="lead">
              Hydrographic surveying is more than just data collection — it
              directly supports decisions in design, construction, and
              environmental protection. We provide full-spectrum hydrographic
              surveying services, equipped to handle complex marine and
              freshwater environments with confidence and precision.
            </p>
          </div>
          <div className="reveal" style={{ marginTop: 20 }}>
            <ul className="check two-col">
              {CLIENTS.map(([who, why]) => (
                <li key={who}>
                  <strong>{who}:</strong> {why}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Capabilities — dark contrast */}
      <section className="section dark" aria-labelledby="hy-capabilities">
        <div className="container">
          <div className="sec-head reveal" style={{ maxWidth: 760 }}>
            <span className="kicker">Hydrographic Survey Service Examples</span>
            <h2 id="hy-capabilities">Our Specialized Hydrographic Surveying Services</h2>
          </div>
          <div className="cap-grid">
            {CAPABILITIES.map((c, i) => (
              <div
                className="reveal"
                key={c.title}
                style={{ transitionDelay: `${(i % 2) * 0.09}s` }}
              >
                <div className="cap-item">
                  <h3>{c.title}</h3>
                  <p>{c.body}</p>
                  <ul className="check">
                    {c.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Technologies */}
      <section className="section" aria-labelledby="hy-tech">
        <div className="container">
          <div className="sec-head reveal" style={{ maxWidth: 760 }}>
            <span className="kicker">Technologies &amp; Software</span>
            <h2 id="hy-tech">
              State of the Art Technologies for Hydrographic Services
            </h2>
          </div>
          <div className="tech-grid">
            {TECH.map((t, i) => (
              <div
                className="reveal"
                key={t.title}
                style={{ transitionDelay: `${i * 0.08}s` }}
              >
                <div className="tech-card">
                  <h3>{t.title}</h3>
                  <ul className="check">
                    {t.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured projects */}
      <section className="section grey" aria-labelledby="hy-projects">
        <div className="container">
          <div className="sec-head reveal" style={{ maxWidth: 760 }}>
            <span className="kicker">Featured Projects</span>
            <h2 id="hy-projects">Hydrographic Surveying in Action</h2>
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
      <section className="section" aria-labelledby="hy-related">
        <div className="container">
          <div className="sec-head reveal" style={{ maxWidth: 760 }}>
            <span className="kicker">Related Services</span>
            <h2 id="hy-related">Explore More Geospatial Services</h2>
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
