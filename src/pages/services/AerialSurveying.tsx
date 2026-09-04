import PageHero from "../../components/PageHero";
import CtaBand from "../../components/CtaBand";
import SmartLink from "../../components/SmartLink";
import useDocumentMeta from "../../hooks/useDocumentMeta";

/* ---------------------------------------------------------------------------
   Aerial Surveying service detail page.
   Content is lifted from the source page (site_capture/text/
   geospatial-services_aerial-surveying.txt); styling follows the Services
   hub conventions — shared primitives (.section/.container/.kicker/.lead/
   ul.check/.cards/.btn) plus a page-scoped layer namespaced `.pg-aerial`.
   Every animation is transform/opacity only and disabled under
   prefers-reduced-motion. No WebGL, no video — static imagery only.
--------------------------------------------------------------------------- */
const CSS = `
.pg-aerial .sec-head { max-width: 760px; }

/* intro fact chips */
.pg-aerial .facts { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px; }
.pg-aerial .fact {
  display: flex; flex-direction: column; gap: 2px;
  border-left: 3px solid var(--blue); padding: 4px 16px 4px 14px;
}
.pg-aerial .fact .fn {
  font-family: var(--font-head); font-weight: 700; font-size: 24px;
  color: var(--navy); line-height: 1; font-variant-numeric: tabular-nums;
}
.pg-aerial .fact .fl {
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--grey-600);
}

/* figure callout chip */
.pg-aerial .figure .callout {
  position: absolute; top: 18px; right: 18px;
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--white);
  background: rgba(29,34,43,.78); padding: 7px 12px; border-left: 2px solid var(--lime);
}

.pg-aerial .btn-row { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 32px; }

/* key aspects — dark contrast cards */
.pg-aerial .aspect-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 54px;
}
@media (max-width: 900px) { .pg-aerial .aspect-grid { grid-template-columns: 1fr; } }
.pg-aerial .aspect-grid > .reveal { display: flex; }
.pg-aerial .aspect {
  position: relative; flex: 1; padding: 30px 28px 32px;
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1);
  border-top: 3px solid var(--lime);
  transition: transform 0.3s var(--ease), background 0.3s var(--ease);
}
.pg-aerial .aspect:hover { transform: translateY(-6px); background: rgba(255,255,255,.07); }
.pg-aerial .aspect .an {
  font-family: var(--font-head); font-size: 12px; font-weight: 600;
  letter-spacing: 0.22em; color: var(--lime); font-variant-numeric: tabular-nums;
}
.pg-aerial .aspect h3 { color: var(--white); font-size: 21px; margin: 12px 0 10px; }
.pg-aerial .aspect p { color: rgba(255,255,255,.7); font-size: 14.5px; margin: 0; }

/* related services */
.pg-aerial .rel-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 48px;
}
@media (max-width: 900px) { .pg-aerial .rel-grid { grid-template-columns: 1fr; } }
.pg-aerial .rel-grid > .reveal { display: flex; }
.pg-aerial .rel-card {
  position: relative; display: flex; flex-direction: column; flex: 1;
  background: var(--navy); color: rgba(255,255,255,.75);
  padding: 30px 28px 28px; overflow: hidden;
  transition: transform 0.35s var(--ease), box-shadow 0.35s var(--ease);
}
.pg-aerial .rel-card::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, var(--blue), var(--lime));
  transform: scaleX(0); transform-origin: left;
  transition: transform 0.45s var(--ease);
}
.pg-aerial .rel-card:hover { transform: translateY(-6px); box-shadow: 0 26px 54px rgba(18,26,38,.25); }
.pg-aerial .rel-card:hover::before { transform: scaleX(1); }
.pg-aerial .rel-card:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
.pg-aerial .rel-card .rt {
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--lime);
}
.pg-aerial .rel-card h3 { color: var(--white); font-size: 20px; margin: 10px 0 8px; }
.pg-aerial .rel-card p { font-size: 14px; margin: 0 0 18px; flex: 1; }
.pg-aerial .rel-card .go {
  font-family: var(--font-head); font-weight: 600; font-size: 12.5px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--white);
  display: inline-flex; align-items: center; gap: 9px;
}
.pg-aerial .rel-card .go .arr { color: var(--blue); transition: transform 0.3s var(--ease); }
.pg-aerial .rel-card:hover .go .arr { transform: translateX(6px); }

@media (prefers-reduced-motion: reduce) {
  .pg-aerial .aspect, .pg-aerial .rel-card, .pg-aerial .rel-card::before,
  .pg-aerial .rel-card .go .arr { transition: none !important; }
  .pg-aerial .aspect:hover, .pg-aerial .rel-card:hover { transform: none; }
  .pg-aerial .rel-card:hover .go .arr { transform: none; }
}
`;

const FLEET = [
  "Fixed and rotary wing drones",
  "Software: Agisoft Metashape, Pix4D, DJI Terra, Spexi, TopoDOT and Map Pilot Pro",
  "Our drone fleet includes: Quantum Systems Trinity F90+, DJI (M400, M300, Phantom 4RTK, Mavic 3 Enterprise) & more",
  "Payloads: Zenmuse L2 LiDAR, Yellowscan Mapper + LiDAR, Zenmuse P1 45mp Sensor & H20T Thermal Camera",
];

const ASPECTS = [
  {
    n: "01",
    title: "High Accuracy",
    body: "We use calibrated sensors and RTK/PPK workflows to achieve survey-grade precision.",
  },
  {
    n: "02",
    title: "Rapid Turnaround",
    body: "Fast data capture and processing keep your projects on schedule.",
  },
  {
    n: "03",
    title: "Comprehensive Coverage",
    body: "Safely cover rugged terrain and large areas without added risk or cost.",
  },
];

const PROJECTS = [
  {
    num: "01",
    title: "Airport Obstacle Limitation Surveys",
    img: "/assets/uploads/2026/03/FaroAirport-thegem-blog-justified.jpg",
  },
  {
    num: "02",
    title: "Site C Hydroelectric Dam – Slope Monitoring",
    img: "/assets/uploads/2026/02/DSC_9472-thegem-blog-justified.webp",
  },
  {
    num: "03",
    title: "Erik Nielsen Whitehorse International Airport Improvements",
    img: "/assets/uploads/2025/11/overheadview-thegem-blog-justified.webp",
  },
];

const RELATED = [
  {
    href: "/geospatial-services/construction-surveying/",
    tag: "Service 02",
    title: "Construction & Engineering Surveys",
    body: "Surveying support throughout the construction lifecycle, from initial layout to final as-builts.",
  },
  {
    href: "/geospatial-services/topographic-surveying/",
    tag: "Service 08",
    title: "Topographic Surveys",
    body: "Detailed elevation and contour maps to support engineering design, land development, and infrastructure planning.",
  },
  {
    href: "/geospatial-services/3d-laser-scanning-reality-capture/",
    tag: "Service 05",
    title: "Laser Scanning",
    body: "Reality capture combining traditional surveying, laser scanning, and photogrammetry into full-detail digital models.",
  },
];

export default function AerialSurveying() {
  useDocumentMeta(
    "Aerial Surveying Across Canada | Certified Drone Mapping Experts",
    "Aerial surveying gives you a clear view from above—certified drone expertise, advanced mapping technologies, and decades of experience delivering professional data for planning, design, and development across Canada."
  );

  return (
    <main id="main" className="pg-aerial">
      <style>{CSS}</style>

      <PageHero
        image="/assets/uploads/2025/07/aerial-surveying_120_underhill-geomatics__Eagle-Vision-Agency_.webp"
        eyebrow="Geospatial Services"
        title="Aerial Surveying Services"
        subtitle="Fast, accurate, and reliable geospatial data from the air."
        lead="Aerial surveying gives you a clear view from above—capturing large areas of land quickly and precisely."
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Geospatial Services", href: "/geospatial-services/" },
        ]}
      />

      {/* Intro — positioning statement + feature sheet */}
      <section className="section" aria-labelledby="aer-intro">
        <div className="container split">
          <div className="reveal">
            <span className="kicker">Drones · LiDAR · Photogrammetry</span>
            <h2 id="aer-intro">A Clear View from Above</h2>
            <p>
              At Underhill, our aerial services combine certified drone
              expertise, advanced mapping technologies, and decades of
              experience to deliver professional data for planning, design,
              and development across Canada—while offering flexible,
              cost-effective solutions tailored to your project.
            </p>
            <div className="facts" aria-label="Aerial surveying facts">
              <div className="fact">
                <span className="fn">2012</span>
                <span className="fl">UAV surveying in Canada since</span>
              </div>
              <div className="fact">
                <span className="fn">RPAS</span>
                <span className="fl">Transport Canada certified operators</span>
              </div>
            </div>
            <div className="btn-row">
              <SmartLink className="btn" to="#lets-talk">
                Request Consultation
              </SmartLink>
              <a
                className="btn navy"
                href="/assets/uploads/2026/04/Underhill-Aerial-Surveys-Feature-Sheet-v3.pdf"
                target="_blank"
                rel="noreferrer"
              >
                View Feature Sheet
              </a>
            </div>
          </div>
          <div className="figure reveal" style={{ transitionDelay: "0.12s" }}>
            <img
              src="/assets/uploads/2025/06/land-surveying_039_underhill-geomatics__Eagle-Vision-Agency_.webp"
              alt="Underhill surveyor operating field instrumentation"
              loading="lazy"
            />
            <span className="callout" aria-hidden="true">
              UAV · FIXED &amp; ROTARY WING
            </span>
            <span className="cap">AERIAL SURVEYING · CANADA-WIDE</span>
          </div>
        </div>
      </section>

      {/* Drone expertise */}
      <section className="section grey" aria-labelledby="aer-fleet">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Underhill’s Drone Surveying Expertise</span>
            <h2 id="aer-fleet">Transport Canada Certified RPAS Operators</h2>
            <p className="lead">
              Underhill has been at the forefront of UAV-based surveying in
              Canada since 2012, combining deep geomatics expertise with
              innovation in drone technology.
            </p>
          </div>
          <div className="reveal">
            <p>We use advanced UAV systems including:</p>
            <ul className="check two-col">
              {FLEET.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p>
              Our tools and workflows ensure survey-grade accuracy and rapid
              turnaround times—reducing project costs while achieving your
              desired outcomes.
            </p>
          </div>
        </div>
      </section>

      {/* Services for planners, engineers, developers */}
      <section className="section" aria-labelledby="aer-services">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Our Aerial Surveying Services</span>
            <h2 id="aer-services">
              Aerial Surveying Services for Planners, Engineers, and Developers
            </h2>
            <p className="lead">
              We tailor our aerial surveying services to meet the unique
              requirements of your site, timeline, and technical objectives.
            </p>
            <p>
              Whether you’re developing land, designing infrastructure, or
              conducting environmental assessments, we ensure the data
              collected aligns precisely with your project goals.
            </p>
          </div>
        </div>
      </section>

      {/* Key aspects — dark contrast */}
      <section className="section dark" aria-labelledby="aer-aspects">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Key Aspects of Aerial Surveying</span>
            <h2 id="aer-aspects">What makes aerial surveying so effective?</h2>
            <p style={{ color: "rgba(255,255,255,.7)" }}>
              These benefits are why aerial surveying is now standard practice
              across land development and resource sectors.
            </p>
          </div>
          <div className="aspect-grid">
            {ASPECTS.map((a, i) => (
              <div
                className="reveal"
                key={a.n}
                style={{ transitionDelay: `${i * 0.08}s` }}
              >
                <div className="aspect">
                  <span className="an">{a.n}</span>
                  <h3>{a.title}</h3>
                  <p>{a.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured projects */}
      <section className="section grey" aria-labelledby="aer-projects">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Featured Work</span>
            <h2 id="aer-projects">Featured Projects</h2>
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
      <section className="section" aria-labelledby="aer-related">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Keep Exploring</span>
            <h2 id="aer-related">Related Geospatial Services</h2>
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
