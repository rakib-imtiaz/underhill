import PageHero from "../../components/PageHero";
import CtaBand from "../../components/CtaBand";
import SmartLink from "../../components/SmartLink";
import useDocumentMeta from "../../hooks/useDocumentMeta";

/* ---------------------------------------------------------------------------
   Page-scoped styles, namespaced under `.pg-bim`. Shared primitives
   (.section/.container/.kicker/.lead/.check/.btn/.steps/.figure) come from the
   global stylesheet. Every animation is transform/opacity only and is disabled
   under prefers-reduced-motion — GPU-cheap by contract.
--------------------------------------------------------------------------- */
const CSS = `
.pg-bim .sec-head { max-width: 760px; }

/* crosshair ornament — pure CSS, static (mirrors the Services hub language) */
.pg-bim .xhair {
  position: absolute; width: 26px; height: 26px; z-index: 2;
  pointer-events: none; opacity: 0.55;
}
.pg-bim .xhair::before, .pg-bim .xhair::after {
  content: ""; position: absolute; background: var(--blue);
}
.pg-bim .xhair::before { left: 50%; top: 0; bottom: 0; width: 1px; }
.pg-bim .xhair::after { top: 50%; left: 0; right: 0; height: 1px; }
.pg-bim .xhair i {
  position: absolute; inset: 8px; border: 1px solid var(--blue); border-radius: 50%;
}
.pg-bim .xhair.on-dark::before, .pg-bim .xhair.on-dark::after { background: rgba(255,255,255,.4); }
.pg-bim .xhair.on-dark i { border-color: rgba(255,255,255,.4); }

/* figure callout chip */
.pg-bim .figure .callout {
  position: absolute; top: 18px; right: 18px;
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--white);
  background: rgba(29,34,43,.78); padding: 7px 12px; border-left: 2px solid var(--lime);
}

/* process steps — gentle lift only */
.pg-bim .steps .step { transition: transform 0.3s var(--ease); }
.pg-bim .steps .step:hover { transform: translateY(-4px); }

/* measurement ruler divider */
.pg-bim .rule {
  height: 16px; margin-top: 54px; opacity: 0.6;
  background-image:
    repeating-linear-gradient(90deg, rgba(255,255,255,.4) 0 1px, transparent 1px 96px),
    repeating-linear-gradient(90deg, rgba(255,255,255,.22) 0 1px, transparent 1px 24px);
  background-size: 100% 14px, 100% 8px;
  background-repeat: repeat-x;
  background-position: bottom left, bottom left;
}

/* related-service link tiles */
.pg-bim .rel-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 46px;
}
@media (max-width: 900px) { .pg-bim .rel-grid { grid-template-columns: 1fr; } }
.pg-bim .rel-grid > .reveal { display: flex; }
.pg-bim .rel {
  position: relative; flex: 1; display: flex; flex-direction: column;
  padding: 26px 26px 26px 30px;
  background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.09);
  border-left: 3px solid var(--blue); color: rgba(255,255,255,.7);
  transition: transform 0.3s var(--ease), border-color 0.3s var(--ease), background 0.3s var(--ease);
}
.pg-bim .rel:hover {
  transform: translateX(6px); border-left-color: var(--lime);
  background: rgba(255,255,255,.06);
}
.pg-bim .rel:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
.pg-bim .rel h3 { color: var(--white); font-size: 19px; margin: 0 0 8px; }
.pg-bim .rel p { font-size: 14px; margin: 0 0 18px; flex: 1; }
.pg-bim .rel .go {
  font-family: var(--font-head); font-weight: 600; font-size: 12.5px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--white);
  display: inline-flex; align-items: center; gap: 8px;
}
.pg-bim .rel .go .arr { color: var(--blue); transition: transform 0.3s var(--ease); }
.pg-bim .rel:hover .go { color: var(--lime); }
.pg-bim .rel:hover .go .arr { transform: translateX(6px); }

@media (prefers-reduced-motion: reduce) {
  .pg-bim .steps .step, .pg-bim .rel, .pg-bim .rel .go .arr {
    transition: none !important;
  }
  .pg-bim .steps .step:hover, .pg-bim .rel:hover { transform: none; }
  .pg-bim .rel:hover .go .arr { transform: none; }
}
`;

export default function BimModelling() {
  useDocumentMeta(
    "BIM & 3D Modelling | Underhill Geomatics",
    "BIM Modelling and 3D Modelling services covering everything from infrastructure planning to detailed visualizations — delivered with precision and clarity."
  );

  return (
    <main id="main" className="pg-bim">
      <style>{CSS}</style>

      <PageHero
        image="/assets/uploads/2025/08/3D-Image-Scan.jpg.jpg"
        title="BIM & 3D Modelling"
        subtitle="Explore Comprehensive 3D Services Backed by BIM Expertise"
        lead="BIM Modelling and 3D Modelling services covering everything from infrastructure planning to detailed visualizations — delivered with precision and clarity."
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Geospatial Services", href: "/geospatial-services/" },
        ]}
      />

      {/* Intro — the positioning statement from the source page */}
      <section className="section" aria-labelledby="bim-intro">
        <div className="container split">
          <div className="reveal">
            <span className="kicker">BIM · 3D Modelling · Visualization</span>
            <h2 id="bim-intro">
              From Infrastructure Planning to Detailed Visualizations
            </h2>
            <p>
              Our BIM Modelling and 3D Modelling services cover everything from
              infrastructure planning to detailed visualizations — delivered
              with precision and clarity.
            </p>
            <ul className="check">
              <li>Comprehensive 3D services backed by BIM expertise</li>
              <li>Precise measurements and full 3D context for every model</li>
              <li>Support for as-built records, retrofits, and compliance</li>
              <li>Visual data to track progress and verify installations</li>
            </ul>
            <SmartLink className="btn" to="#lets-talk" style={{ marginTop: 32 }}>
              Request a Consultation
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
              src="/assets/uploads/2025/08/3D-Image-Scan.jpg.jpg"
              alt="3D laser scan image of a building interior used for BIM modelling"
              loading="lazy"
            />
            <span className="callout" aria-hidden="true">
              SCAN-TO-MODEL · BIM
            </span>
            <span className="cap">3D IMAGE SCAN · DETAILED VISUALIZATION</span>
          </div>
        </div>
      </section>

      {/* Capture-to-model pipeline — sourced reality-capture lines, sequenced */}
      <section className="section grey" aria-labelledby="bim-pipeline">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Capture to Model</span>
            <h2 id="bim-pipeline">How Measured Reality Becomes a 3D Model</h2>
            <p className="lead">
              Reality capture combines the strengths of traditional surveying,
              laser scanning, and photogrammetry — a hybrid approach that
              delivers high-accuracy, full-detail digital models.
            </p>
          </div>
          <div className="steps">
            {[
              {
                t: "Capture the Site",
                b: "Reality capture combines traditional surveying, laser scanning, and photogrammetry in a single survey.",
              },
              {
                t: "Measure with Precision",
                b: "High-density point clouds deliver precise measurements and full 3D context for as-built records, retrofits, and compliance.",
              },
              {
                t: "Model and Visualize",
                b: "BIM and 3D modelling cover everything from infrastructure planning to detailed visualizations.",
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

      {/* Related services — laser scanning is the direct sibling */}
      <section className="section dark" aria-labelledby="bim-related">
        <span className="xhair on-dark" style={{ top: 24, left: 30 }} aria-hidden="true">
          <i />
        </span>
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Related Services</span>
            <h2 id="bim-related">The Data Behind the Model</h2>
            <p style={{ color: "rgba(255,255,255,.7)" }}>
              Every model starts with measurement. These service lines capture
              the site data that BIM and 3D modelling build on.
            </p>
          </div>
          <div className="rel-grid">
            {[
              {
                href: "/geospatial-services/3d-laser-scanning-reality-capture/",
                title: "Laser Scanning",
                body: "Reality capture combining traditional surveying, laser scanning, and photogrammetry into high-accuracy, full-detail digital models.",
              },
              {
                href: "/geospatial-services/aerial-surveying/",
                title: "Aerial Surveys",
                body: "Drones, LiDAR, and photogrammetry delivering orthomosaics, DEMs, contours, volume reports, and 3D models.",
              },
              {
                href: "/geospatial-services/topographic-surveying/",
                title: "Topographic Surveys",
                body: "Detailed elevation and contour maps to support engineering design, land development, and infrastructure planning.",
              },
            ].map((r, i) => (
              <div
                className="reveal"
                key={r.href}
                style={{ transitionDelay: `${i * 0.08}s` }}
              >
                <SmartLink className="rel" to={r.href}>
                  <h3>{r.title}</h3>
                  <p>{r.body}</p>
                  <span className="go">
                    Learn More <span className="arr" aria-hidden="true">→</span>
                  </span>
                </SmartLink>
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
