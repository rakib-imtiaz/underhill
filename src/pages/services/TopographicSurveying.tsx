import { useEffect, useRef } from "react";
import CtaBand from "../../components/CtaBand";
import SmartLink from "../../components/SmartLink";
import useDocumentMeta from "../../hooks/useDocumentMeta";

/* ---------------------------------------------------------------------------
   Topographic Surveying service detail page.
   Content is lifted from the source page (site_capture/text/
   geospatial-services_topographic-surveying.txt); styling follows the
   Services hub conventions — shared primitives (.section/.container/.kicker/
   .lead/ul.check/.cards/.btn, .hero/.hero-video) plus a page-scoped layer
   namespaced `.pg-topo`. This page carries the site's only video hero
   (topographic-survey-1.mp4): muted/loop/autoPlay/playsInline, metadata-only
   preload, the shared dark `.hero-video` overlay for text contrast, and an
   IntersectionObserver that pauses playback offscreen. Every animation is
   transform/opacity only and disabled under prefers-reduced-motion. No WebGL.
--------------------------------------------------------------------------- */
const CSS = `
.pg-topo .sec-head { max-width: 760px; }

/* intro fact chips */
.pg-topo .facts { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px; }
.pg-topo .fact {
  display: flex; flex-direction: column; gap: 2px;
  border-left: 3px solid var(--blue); padding: 4px 16px 4px 14px;
}
.pg-topo .fact .fn {
  font-family: var(--font-head); font-weight: 700; font-size: 24px;
  color: var(--navy); line-height: 1; font-variant-numeric: tabular-nums;
}
.pg-topo .fact .fl {
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--grey-600);
}

/* figure callout chip */
.pg-topo .figure .callout {
  position: absolute; top: 18px; right: 18px;
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--white);
  background: rgba(29,34,43,.78); padding: 7px 12px; border-left: 2px solid var(--lime);
}

.pg-topo .btn-row { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 32px; }

/* service example groups — dark contrast section */
.pg-topo .grp { margin-top: 54px; }
.pg-topo .grp:first-of-type { margin-top: 46px; }
.pg-topo .grp > h3 {
  color: var(--white); font-size: 22px; margin: 0;
  display: flex; align-items: center; gap: 14px;
}
.pg-topo .grp > h3::before {
  content: ""; width: 26px; height: 2px; background: var(--lime); flex: 0 0 auto;
}
.pg-topo .grp-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 26px; margin-top: 26px;
}
@media (max-width: 800px) { .pg-topo .grp-grid { grid-template-columns: 1fr; } }
.pg-topo .grp-grid > .reveal { display: flex; }
.pg-topo .grp-item {
  position: relative; flex: 1; padding: 26px 28px 26px 34px;
  background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.09);
  border-left: 3px solid var(--blue);
  transition: transform 0.3s var(--ease), border-color 0.3s var(--ease), background 0.3s var(--ease);
}
.pg-topo .grp-item:hover {
  transform: translateX(6px); border-left-color: var(--lime);
  background: rgba(255,255,255,.06);
}
.pg-topo .grp-item h4 {
  color: var(--white); font-size: 18px; margin: 0 0 8px;
  font-family: var(--font-head); font-weight: 600;
}
.pg-topo .grp-item p { color: rgba(255,255,255,.7); font-size: 14.5px; margin: 0; }

/* related services */
.pg-topo .rel-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 48px;
}
@media (max-width: 900px) { .pg-topo .rel-grid { grid-template-columns: 1fr; } }
.pg-topo .rel-grid > .reveal { display: flex; }
.pg-topo .rel-card {
  position: relative; display: flex; flex-direction: column; flex: 1;
  background: var(--navy); color: rgba(255,255,255,.75);
  padding: 30px 28px 28px; overflow: hidden;
  transition: transform 0.35s var(--ease), box-shadow 0.35s var(--ease);
}
.pg-topo .rel-card::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, var(--blue), var(--lime));
  transform: scaleX(0); transform-origin: left;
  transition: transform 0.45s var(--ease);
}
.pg-topo .rel-card:hover { transform: translateY(-6px); box-shadow: 0 26px 54px rgba(18,26,38,.25); }
.pg-topo .rel-card:hover::before { transform: scaleX(1); }
.pg-topo .rel-card:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
.pg-topo .rel-card .rt {
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--lime);
}
.pg-topo .rel-card h3 { color: var(--white); font-size: 20px; margin: 10px 0 8px; }
.pg-topo .rel-card p { font-size: 14px; margin: 0 0 18px; flex: 1; }
.pg-topo .rel-card .go {
  font-family: var(--font-head); font-weight: 600; font-size: 12.5px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--white);
  display: inline-flex; align-items: center; gap: 9px;
}
.pg-topo .rel-card .go .arr { color: var(--blue); transition: transform 0.3s var(--ease); }
.pg-topo .rel-card:hover .go .arr { transform: translateX(6px); }

@media (prefers-reduced-motion: reduce) {
  .pg-topo .grp-item, .pg-topo .rel-card, .pg-topo .rel-card::before,
  .pg-topo .rel-card .go .arr { transition: none !important; }
  .pg-topo .grp-item:hover, .pg-topo .rel-card:hover { transform: none; }
  .pg-topo .rel-card:hover .go .arr { transform: none; }
}
`;

const WHO = [
  "Urban Planners and Developer",
  "Civil Engineers and Architects",
  "Construction Teams",
  "Residential & Commercial Property Owners",
  "Governments and Utility Agencies",
];

const GROUPS = [
  {
    title: "Ground-Based Technologies",
    items: [
      {
        t: "Total Station Surveys​",
        b: "A total station is used to capture precise elevation and feature data. Robotic total stations are particularly effective for detailed point collection, making them suitable for complex terrain or areas requiring high accuracy. They integrate seamlessly with control networks, ensuring dependable survey results.",
      },
      {
        t: "GNSS Surveys​",
        b: "GNSS surveys use satellite positioning to collect accurate spatial and elevation data. GNSS integrates well with control networks, providing reliable georeferenced survey points.",
      },
      {
        t: "Digital Leveling",
        b: "Digital levels deliver superior vertical accuracy for elevation profiling. They are best suited for applications requiring precise height measurements, such as establishing benchmarks or detailed terrain sections.",
      },
    ],
  },
  {
    title: "Advanced 3D Surveying",
    items: [
      {
        t: "Terrestrial Laser Scanning (TLS)​",
        b: "TLS is a ground-based method using lidar to scan the site from a fixed location. It delivers highly accurate 3D point clouds, perfect for complex structures and sites that require dense data for modeling and design.",
      },
      {
        t: "SLAM Mobile Mapping",
        b: "Using Simultaneous Localization and Mapping (SLAM) technology, this wearable scanner allows surveyors to walk the site and capture colorized 3D data in real time.",
      },
    ],
  },
  {
    title: "Aerial and Marine-Based Surveys",
    items: [
      {
        t: "UAV / Drone Topographic Surveys​",
        b: "Drones equipped with high-resolution cameras or lidar sensors are used to map large areas quickly. These surveys are well-suited for remote, expansive, or otherwise inaccessible terrain.",
      },
      {
        t: "Marine and Hydrographic Surveys",
        b: "These surveys chart shorelines, harbors, and underwater features. They support coastal development, flood modeling, and marine infrastructure planning.",
      },
    ],
  },
];

const PROJECTS = [
  {
    num: "01",
    title: "Ruby Creek Mineral Lease Survey",
    img: "/assets/uploads/2025/09/ruby-creek-thegem-blog-justified.webp",
  },
  {
    num: "02",
    title: "Nares River Bridge Construction Surveying",
    img: "/assets/uploads/2025/05/Bridge-1-thegem-blog-justified.webp",
  },
  {
    num: "03",
    title: "Eagle Gold Mine Construction Surveying",
    img: "/assets/uploads/2025/06/Underhill-truck-with-Eagle-Pit-in-the-background.-UAV-flight.-July-2019-2-thegem-blog-justified.webp",
  },
];

const RELATED = [
  {
    href: "/geospatial-services/aerial-surveying/",
    tag: "Service 01",
    title: "Aerial Surveys",
    body: "Aerial surveys using drones, LiDAR, and photogrammetry to deliver accurate, high-resolution data for planning and development.",
  },
  {
    href: "/geospatial-services/hydrographic-surveying/",
    tag: "Service 04",
    title: "Hydrographic Surveys",
    body: "Bathymetric data and subsurface analysis for marine, port, and environmental projects.",
  },
  {
    href: "/geospatial-services/construction-surveying/",
    tag: "Service 02",
    title: "Construction & Engineering Surveys",
    body: "Surveying support throughout the construction lifecycle, from initial layout to final as-builts.",
  },
];

export default function TopographicSurveying() {
  useDocumentMeta(
    "Topographic Surveying Services | Trusted Surveyors",
    "Topographic surveying provides accurate, site-specific elevation and feature data to plan and build with confidence—supporting planning, design, and development across Canada."
  );

  /* Pause the hero video whenever it scrolls offscreen (and keep it paused
     for users who prefer reduced motion). */
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      v.pause();
      return;
    }
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            void v.play().catch(() => {});
          } else {
            v.pause();
          }
        });
      },
      { threshold: 0.1 }
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <main id="main" className="pg-topo">
      <style>{CSS}</style>

      {/* Video hero — mirrors PageHero markup, video in place of the photo */}
      <section className="hero">
        <div className="hero-video">
          <video
            ref={videoRef}
            src="/assets/uploads/2026/03/topographic-survey-1.mp4"
            poster="/assets/uploads/2025/06/land-surveying_039_underhill-geomatics__Eagle-Vision-Agency_.webp"
            muted
            loop
            autoPlay
            playsInline
            preload="metadata"
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
            <span className="sep" aria-hidden="true">
              /
            </span>
            <span>
              <SmartLink to="/geospatial-services/">
                Geospatial Services
              </SmartLink>
            </span>
            <span className="sep" aria-hidden="true">
              /
            </span>
            <span className="here" aria-current="page">
              Topographic Surveying Services
            </span>
          </nav>
          <span className="hero-eyebrow">Geospatial Services</span>
          <h1>Topographic Surveying Services</h1>
          <h2 className="hero-sub">
            Accurate Land Mapping for Planning, Design, and Development
          </h2>
          <p className="lead on-dark">
            Topographic surveying is essential to any successful development
            or infrastructure project. It provides accurate, site-specific
            elevation and feature data to plan and build with confidence.
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
      <section className="section" aria-labelledby="top-expertise">
        <div className="container split">
          <div className="reveal">
            <span className="kicker">Topographic Surveying Expertise</span>
            <h2 id="top-expertise">Over 100 Years</h2>
            <p>
              Underhill has performed topographic surveys across Canada for
              over a century. From complex industrial sites to residential
              developments, we deliver trusted results with state-of-the-art
              tools.
            </p>
            <h3>Combining Innovation with Experience</h3>
            <p>
              Our teams use robotic total stations, GNSS, SLAM scanners,
              aerial and marine based surveys to meet your project’s needs.
              Whether you need traditional point collection or a complete 3D
              digital model, we’re ready to help.
            </p>
            <div className="facts" aria-label="Topographic surveying facts">
              <div className="fact">
                <span className="fn">100+</span>
                <span className="fl">Years across Canada</span>
              </div>
              <div className="fact">
                <span className="fn">3D</span>
                <span className="fl">Point collection to digital models</span>
              </div>
            </div>
          </div>
          <div className="figure reveal" style={{ transitionDelay: "0.12s" }}>
            <img
              src="/assets/uploads/2026/02/droneshot-thegem-blog-justified.jpg"
              alt="Aerial drone capture over a surveyed site"
              loading="lazy"
            />
            <span className="callout" aria-hidden="true">
              TOTAL STATIONS · GNSS · SLAM
            </span>
            <span className="cap">TOPOGRAPHIC SURVEYING · LAND, WATER &amp; URBAN CORRIDORS</span>
          </div>
        </div>
      </section>

      {/* Who we work with */}
      <section className="section grey" aria-labelledby="top-who">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Clients</span>
            <h2 id="top-who">Who We Work With</h2>
          </div>
          <div className="reveal">
            <ul className="check two-col">
              {WHO.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Full-service intro */}
      <section className="section" aria-labelledby="top-services">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Topographic Surveying Services</span>
            <h2 id="top-services">
              Full-Service Topographic Surveys for Every Environment
            </h2>
            <p className="lead">
              Whether you’re surveying land, water, or urban corridors, we
              offer the right tools and methods to get accurate results.
            </p>
            <p>
              Our topographic surveying services are designed to meet the
              needs of developers, engineers, and planners working in diverse
              settings—from city blocks to coastlines.
            </p>
          </div>
        </div>
      </section>

      {/* Service examples — dark contrast */}
      <section className="section dark" aria-labelledby="top-examples">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Service Examples</span>
            <h2 id="top-examples">
              Examples of Our Topographic Survey Services
            </h2>
          </div>
          {GROUPS.map((g) => (
            <div className="grp" key={g.title}>
              <h3 className="reveal">{g.title}</h3>
              <div className="grp-grid">
                {g.items.map((it, i) => (
                  <div
                    className="reveal"
                    key={it.t}
                    style={{ transitionDelay: `${(i % 2) * 0.09}s` }}
                  >
                    <div className="grp-item">
                      <h4>{it.t}</h4>
                      <p>{it.b}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Featured projects */}
      <section className="section grey" aria-labelledby="top-projects">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Featured Work</span>
            <h2 id="top-projects">Featured Projects</h2>
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
      <section className="section" aria-labelledby="top-related">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Keep Exploring</span>
            <h2 id="top-related">Related Geospatial Services</h2>
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
