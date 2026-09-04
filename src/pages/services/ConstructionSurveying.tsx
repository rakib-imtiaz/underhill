import PageHero from "../../components/PageHero";
import CtaBand from "../../components/CtaBand";
import SmartLink from "../../components/SmartLink";
import useDocumentMeta from "../../hooks/useDocumentMeta";

/* ---------------------------------------------------------------------------
   Construction Surveying service detail page.
   Content is lifted from the source page (site_capture/text/
   geospatial-services_construction-surveying.txt); styling follows the
   Services hub conventions — shared primitives (.section/.container/.kicker/
   .lead/ul.check/.cards/.btn) plus a page-scoped layer namespaced
   `.pg-construction`. Every animation is transform/opacity only and disabled
   under prefers-reduced-motion. No WebGL, no video — static imagery only.
--------------------------------------------------------------------------- */
const CSS = `
.pg-construction .sec-head { max-width: 760px; }

/* intro fact chips */
.pg-construction .facts { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px; }
.pg-construction .fact {
  display: flex; flex-direction: column; gap: 2px;
  border-left: 3px solid var(--blue); padding: 4px 16px 4px 14px;
}
.pg-construction .fact .fn {
  font-family: var(--font-head); font-weight: 700; font-size: 24px;
  color: var(--navy); line-height: 1; font-variant-numeric: tabular-nums;
}
.pg-construction .fact .fl {
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--grey-600);
}

/* figure callout chip */
.pg-construction .figure .callout {
  position: absolute; top: 18px; right: 18px;
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--white);
  background: rgba(29,34,43,.78); padding: 7px 12px; border-left: 2px solid var(--lime);
}

.pg-construction .btn-row { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 32px; }

/* construction surveying examples — dark contrast list */
.pg-construction .ex-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 26px; margin-top: 54px;
}
@media (max-width: 800px) { .pg-construction .ex-grid { grid-template-columns: 1fr; } }
.pg-construction .ex-grid > .reveal { display: flex; }
.pg-construction .ex-item {
  position: relative; flex: 1; padding: 26px 28px 26px 34px;
  background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.09);
  border-left: 3px solid var(--blue);
  transition: transform 0.3s var(--ease), border-color 0.3s var(--ease), background 0.3s var(--ease);
}
.pg-construction .ex-item:hover {
  transform: translateX(6px); border-left-color: var(--lime);
  background: rgba(255,255,255,.06);
}
.pg-construction .ex-item h3 { color: var(--white); font-size: 19px; margin: 0 0 8px; }
.pg-construction .ex-item p { color: rgba(255,255,255,.7); font-size: 14.5px; margin: 0; }

/* related services */
.pg-construction .rel-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 48px;
}
@media (max-width: 900px) { .pg-construction .rel-grid { grid-template-columns: 1fr; } }
.pg-construction .rel-grid > .reveal { display: flex; }
.pg-construction .rel-card {
  position: relative; display: flex; flex-direction: column; flex: 1;
  background: var(--navy); color: rgba(255,255,255,.75);
  padding: 30px 28px 28px; overflow: hidden;
  transition: transform 0.35s var(--ease), box-shadow 0.35s var(--ease);
}
.pg-construction .rel-card::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, var(--blue), var(--lime));
  transform: scaleX(0); transform-origin: left;
  transition: transform 0.45s var(--ease);
}
.pg-construction .rel-card:hover { transform: translateY(-6px); box-shadow: 0 26px 54px rgba(18,26,38,.25); }
.pg-construction .rel-card:hover::before { transform: scaleX(1); }
.pg-construction .rel-card:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
.pg-construction .rel-card .rt {
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--lime);
}
.pg-construction .rel-card h3 { color: var(--white); font-size: 20px; margin: 10px 0 8px; }
.pg-construction .rel-card p { font-size: 14px; margin: 0 0 18px; flex: 1; }
.pg-construction .rel-card .go {
  font-family: var(--font-head); font-weight: 600; font-size: 12.5px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--white);
  display: inline-flex; align-items: center; gap: 9px;
}
.pg-construction .rel-card .go .arr { color: var(--blue); transition: transform 0.3s var(--ease); }
.pg-construction .rel-card:hover .go .arr { transform: translateX(6px); }

@media (prefers-reduced-motion: reduce) {
  .pg-construction .ex-item, .pg-construction .rel-card,
  .pg-construction .rel-card::before,
  .pg-construction .rel-card .go .arr { transition: none !important; }
  .pg-construction .ex-item:hover, .pg-construction .rel-card:hover { transform: none; }
  .pg-construction .rel-card:hover .go .arr { transform: none; }
}
`;

const WHO = [
  "Construction Superintendents – who need fast, reliable site layouts and volume checks",
  "Project Engineers – requiring data for QA/QC and technical documentation",
  "General Contractors – coordinating multiple phases with accurate positioning",
  "Developers & Owners – who need compliance-ready reports and updates",
];

const EXAMPLES = [
  {
    title: "Control Surveys",
    body: "Provide primary coordinate reference systems for consistent spatial control",
  },
  {
    title: "Gridline and Building Layout",
    body: "Set out excavation limits, forms, structures, and anchor points based on grids from design plans",
  },
  {
    title: "Form and Concrete Certificates",
    body: "Ensure compliance with architectural and engineering requirements and building code",
  },
  {
    title: "Deformation Monitoring",
    body: "Track movement over time for critical structures like buildings, structural columns, shotcrete retaining walls, and tunnels",
  },
  {
    title: "Topographic Surveys",
    body: "Capture current site conditions and changes in terrain",
  },
  {
    title: "UAV & Aerial Volumetric Surveys",
    body: "Rapid capture of earthworks and material stockpiles from above",
  },
  {
    title: "Progress Documentation",
    body: "360° photos, video walkthroughs, and photogrammetry models to support reporting and planning",
  },
  {
    title: "As-built Surveys",
    body: "Capture final locations of constructed features and structures",
  },
];

const PROJECTS = [
  {
    num: "01",
    title: "Fraser River Tunnel Project",
    img: "/assets/uploads/2026/07/Highway99-Tunnel-2-thegem-blog-justified.jpg",
  },
  {
    num: "02",
    title: "Burnaby Hospital Redevelopment Project",
    img: "/assets/uploads/2026/07/Burnaby-Hospital-Redevelopment-Project-1-thegem-blog-justified.jpg",
  },
  {
    num: "03",
    title: "Langford Heights Business Park",
    img: "/assets/uploads/2026/07/langford-business-park-1-thegem-blog-justified.jpg",
  },
];

const RELATED = [
  {
    href: "/geospatial-services/deformation-monitoring/",
    tag: "Service 03",
    title: "Deformation Monitoring",
    body: "Precise monitoring surveys to detect structural shifts, ground movement, and changes in elevation over time.",
  },
  {
    href: "/geospatial-services/topographic-surveying/",
    tag: "Service 08",
    title: "Topographic Surveys",
    body: "Detailed elevation and contour maps to support engineering design, land development, and infrastructure planning.",
  },
  {
    href: "/geospatial-services/bim-modelling-services/",
    tag: "Service 11",
    title: "BIM & 3D Modelling",
    body: "BIM Modelling and 3D Modelling services covering everything from infrastructure planning to detailed visualizations—delivered with precision and clarity.",
  },
];

export default function ConstructionSurveying() {
  useDocumentMeta(
    "Construction Surveying & Engineering Surveys | Trusted Surveyors",
    "Construction surveying and engineering surveys supporting builders, engineers, and developers across Canada with trusted spatial services—from layout to final certifications."
  );

  return (
    <main id="main" className="pg-construction">
      <style>{CSS}</style>

      <PageHero
        image="/assets/uploads/2025/06/construction-documentation_124_underhill-geomatics__Eagle-Vision-Agency_.jpg"
        eyebrow="Geospatial Services"
        title="Construction Surveying Services"
        subtitle="Accurate Construction Surveying and Engineering Surveys"
        lead="Construction surveying and engineering surveys provides support to builders, engineers, and developers across Canada with trusted spatial services. From layout to final certifications, our team provides the accuracy needed to build future infrastructure projects."
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Geospatial Services", href: "/geospatial-services/" },
        ]}
      />

      {/* Intro — positioning statement + feature sheet */}
      <section className="section" aria-labelledby="con-intro">
        <div className="container split">
          <div className="reveal">
            <span className="kicker">Layout to Final Certifications</span>
            <h2 id="con-intro">From Layout to Final Certifications</h2>
            <p>
              From layout to final certifications, our team provides the
              accuracy needed to build future infrastructure
              projects—supporting builders, engineers, and developers across
              Canada with trusted spatial services.
            </p>
            <div className="facts" aria-label="Construction surveying facts">
              <div className="fact">
                <span className="fn">1913</span>
                <span className="fl">Trusted by builders since</span>
              </div>
              <div className="fact">
                <span className="fn">4</span>
                <span className="fl">Provinces &amp; territories served</span>
              </div>
            </div>
            <div className="btn-row">
              <SmartLink className="btn" to="#lets-talk">
                Request Consultation
              </SmartLink>
              <a
                className="btn navy"
                href="/assets/uploads/2026/04/Underhill-Construction-Engineering-Feature-Sheet-v2.pdf"
                target="_blank"
                rel="noreferrer"
              >
                View Feature Sheet
              </a>
            </div>
          </div>
          <div className="figure reveal" style={{ transitionDelay: "0.12s" }}>
            <img
              src="/assets/uploads/2025/07/construction-surveying_040_underhill-geomatics__Eagle-Vision-Agency_.webp"
              alt="Underhill surveyor on an active construction site"
              loading="lazy"
            />
            <span className="callout" aria-hidden="true">
              ON TIME · ON SPEC · DOCUMENTED
            </span>
            <span className="cap">CONSTRUCTION &amp; ENGINEERING SURVEYS</span>
          </div>
        </div>
      </section>

      {/* Expertise + who we help */}
      <section className="section grey" aria-labelledby="con-expertise">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Our Construction Surveying Expertise</span>
            <h2 id="con-expertise">Trusted by Builders for Over a Century</h2>
            <p className="lead">
              Since 1913, Underhill has helped shape communities across
              Western and Northern Canada, including British Columbia, Yukon,
              Northwest Territories and Nunavut. Our team of experienced field
              crews and licensed professionals brings precision, speed, and
              deep regional knowledge to every project
            </p>
          </div>
          <div className="reveal">
            <h3>
              Underhill supports all types of construction &amp; engineering
              projects
            </h3>
            <p>
              With over a century of surveying history, Underhill has
              supported everything from small residential developments to
              multi-billion-dollar infrastructure and development projects. We
              use the latest in conventional instrumentation, terrestrial
              LiDAR equipment, UAV drones, and BIM-compatible software to meet
              tight timelines and demanding specifications.
            </p>
            <h3>Who We Help</h3>
            <ul className="check two-col">
              {WHO.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Full lifecycle services */}
      <section className="section" aria-labelledby="con-services">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Our Construction Surveying Services</span>
            <h2 id="con-services">
              Full Project Life Cycle Construction Surveying for Contractors,
              Engineers, and Owners
            </h2>
            <p className="lead">
              Whether you’re managing a remote site or an urban high-rise
              tower, our construction surveying services keep your project
              moving—on time, on spec, and fully documented.
            </p>
          </div>
        </div>
      </section>

      {/* Construction surveying examples — dark contrast */}
      <section className="section dark" aria-labelledby="con-examples">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Construction Surveying Examples</span>
            <h2 id="con-examples">Construction Surveying Examples</h2>
            <p style={{ color: "rgba(255,255,255,.7)" }}>
              Our work doesn’t just measure—it empowers confident decisions
              throughout the project lifecycle.
            </p>
          </div>
          <div className="ex-grid">
            {EXAMPLES.map((e, i) => (
              <div
                className="reveal"
                key={e.title}
                style={{ transitionDelay: `${(i % 2) * 0.09}s` }}
              >
                <div className="ex-item">
                  <h3>{e.title}</h3>
                  <p>{e.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured projects */}
      <section className="section grey" aria-labelledby="con-projects">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Featured Work</span>
            <h2 id="con-projects">Featured Projects</h2>
          </div>
          <div className="cards">
            {PROJECTS.map((p, i) => (
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
            <SmartLink className="btn" to="/land-surveying-projects/">
              All Projects
            </SmartLink>
          </div>
        </div>
      </section>

      {/* Related services */}
      <section className="section" aria-labelledby="con-related">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Keep Exploring</span>
            <h2 id="con-related">Related Geospatial Services</h2>
          </div>
          <div className="rel-grid">
            {RELATED.map((r, i) => (
              <div
                className="reveal"
                key={r.href}
                style={{ transitionDelay: `${i * 0.08}s` }}
              >
                <SmartLink className="rel-card" to={r.href}>
                  <span className="rt">{r.tag}</span>
                  <h3>{r.title}</h3>
                  <p>{r.body}</p>
                  <span className="go">
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
