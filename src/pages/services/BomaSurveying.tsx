import PageHero from "../../components/PageHero";
import CtaBand from "../../components/CtaBand";
import SmartLink from "../../components/SmartLink";
import useDocumentMeta from "../../hooks/useDocumentMeta";

/* ---------------------------------------------------------------------------
   Page-scoped styles, namespaced under `.pg-boma`. Shared primitives
   (.section/.container/.kicker/.lead/.check/.btn/.cards/.figure) come from the
   global stylesheet. Every animation is transform/opacity only and is disabled
   under prefers-reduced-motion — GPU-cheap by contract.
--------------------------------------------------------------------------- */
const CSS = `
.pg-boma .sec-head { max-width: 760px; }

/* crosshair ornament — pure CSS, static (mirrors the Services hub language) */
.pg-boma .xhair {
  position: absolute; width: 26px; height: 26px; z-index: 2;
  pointer-events: none; opacity: 0.55;
}
.pg-boma .xhair::before, .pg-boma .xhair::after {
  content: ""; position: absolute; background: var(--blue);
}
.pg-boma .xhair::before { left: 50%; top: 0; bottom: 0; width: 1px; }
.pg-boma .xhair::after { top: 50%; left: 0; right: 0; height: 1px; }
.pg-boma .xhair i {
  position: absolute; inset: 8px; border: 1px solid var(--blue); border-radius: 50%;
}
.pg-boma .xhair.on-dark::before, .pg-boma .xhair.on-dark::after { background: rgba(255,255,255,.4); }
.pg-boma .xhair.on-dark i { border-color: rgba(255,255,255,.4); }

/* figure callout chip */
.pg-boma .figure .callout {
  position: absolute; top: 18px; right: 18px;
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--white);
  background: rgba(29,34,43,.78); padding: 7px 12px; border-left: 2px solid var(--lime);
}

/* standards chips — labels only, no invented stats */
.pg-boma .chips { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 26px; }
.pg-boma .chip {
  font-family: var(--font-head); font-size: 11.5px; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--navy);
  border: 1px solid var(--grey-100); background: var(--grey-050);
  padding: 8px 14px; border-left: 3px solid var(--blue);
}

/* measurement ruler divider */
.pg-boma .rule {
  height: 16px; margin-top: 54px; opacity: 0.6;
  background-image:
    repeating-linear-gradient(90deg, rgba(255,255,255,.4) 0 1px, transparent 1px 96px),
    repeating-linear-gradient(90deg, rgba(255,255,255,.22) 0 1px, transparent 1px 24px);
  background-size: 100% 14px, 100% 8px;
  background-repeat: repeat-x;
  background-position: bottom left, bottom left;
}

/* related-service link tiles */
.pg-boma .rel-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 46px;
}
@media (max-width: 900px) { .pg-boma .rel-grid { grid-template-columns: 1fr; } }
.pg-boma .rel-grid > .reveal { display: flex; }
.pg-boma .rel {
  position: relative; flex: 1; display: flex; flex-direction: column;
  padding: 26px 26px 26px 30px;
  background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.09);
  border-left: 3px solid var(--blue); color: rgba(255,255,255,.7);
  transition: transform 0.3s var(--ease), border-color 0.3s var(--ease), background 0.3s var(--ease);
}
.pg-boma .rel:hover {
  transform: translateX(6px); border-left-color: var(--lime);
  background: rgba(255,255,255,.06);
}
.pg-boma .rel:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
.pg-boma .rel h3 { color: var(--white); font-size: 19px; margin: 0 0 8px; }
.pg-boma .rel p { font-size: 14px; margin: 0 0 18px; flex: 1; }
.pg-boma .rel .go {
  font-family: var(--font-head); font-weight: 600; font-size: 12.5px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--white);
  display: inline-flex; align-items: center; gap: 8px;
}
.pg-boma .rel .go .arr { color: var(--blue); transition: transform 0.3s var(--ease); }
.pg-boma .rel:hover .go { color: var(--lime); }
.pg-boma .rel:hover .go .arr { transform: translateX(6px); }

@media (prefers-reduced-motion: reduce) {
  .pg-boma .rel, .pg-boma .rel .go .arr { transition: none !important; }
  .pg-boma .rel:hover { transform: none; }
  .pg-boma .rel:hover .go .arr { transform: none; }
}
`;

export default function BomaSurveying() {
  useDocumentMeta(
    "BOMA & Lease Surveys | Underhill Geomatics",
    "Precise lease area calculations and space measurements that comply with BOMA standards, helping property owners and tenants navigate commercial leasing with clarity."
  );

  return (
    <main id="main" className="pg-boma">
      <style>{CSS}</style>

      <PageHero
        image="/assets/uploads/2025/08/Airspace-plan-capital-6-theatre.jpg.jpg"
        title="BOMA & Lease Surveys"
        subtitle="Accurate Floor Area Reporting, Delivered to Industry Standards"
        lead="Precise lease area calculations and space measurements that comply with BOMA standards — helping property owners and tenants navigate commercial leasing with clarity."
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Geospatial Services", href: "/geospatial-services/" },
        ]}
      />

      {/* Intro — the positioning statement from the source page */}
      <section className="section" aria-labelledby="boma-intro">
        <div className="container split">
          <div className="reveal">
            <span className="kicker">Lease Measurement Standards</span>
            <h2 id="boma-intro">
              Lease Area Calculations That Comply with BOMA Standards
            </h2>
            <p>
              We provide precise lease area calculations and space measurements
              that comply with BOMA standards, helping property owners and
              tenants navigate commercial leasing with clarity.
            </p>
            <ul className="check">
              <li>Precise lease area calculations and space measurements</li>
              <li>Clear, standards-based lease measurements</li>
              <li>Reports that follow BOMA guidelines and industry best practices</li>
              <li>Clarity for property owners and tenants navigating commercial leasing</li>
            </ul>
            <div className="chips" aria-label="Standards and scope">
              <span className="chip">BOMA Standards</span>
              <span className="chip">Lease Area Calculations</span>
              <span className="chip">Floor Area Reporting</span>
            </div>
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
              src="/assets/uploads/2025/08/Airspace-plan-capital-6-theatre.jpg.jpg"
              alt="Airspace plan drawing for a commercial lease survey"
              loading="lazy"
            />
            <span className="callout" aria-hidden="true">
              LEASE MEASUREMENT · BOMA
            </span>
            <span className="cap">AIRSPACE PLAN · COMMERCIAL LEASING</span>
          </div>
        </div>
      </section>

      {/* What we deliver — the two sourced commitments */}
      <section className="section grey" aria-labelledby="boma-deliver">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">What We Deliver</span>
            <h2 id="boma-deliver">Standards-Based Measurement You Can Lease On</h2>
            <p className="lead">
              Every lease survey is measured, calculated, and reported against
              the same recognized framework — so owners and tenants read from
              the same page.
            </p>
          </div>
          <div className="cards">
            <div className="reveal">
              <div className="card light">
                <span className="num">01</span>
                <h3>Accurate Floor Area Reporting</h3>
                <p>We deliver clear, standards-based lease measurements.</p>
              </div>
            </div>
            <div className="reveal" style={{ transitionDelay: "0.1s" }}>
              <div className="card light">
                <span className="num">02</span>
                <h3>Delivered to Industry Standards</h3>
                <p>Reports follow BOMA guidelines and industry best practices.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Related services */}
      <section className="section dark" aria-labelledby="boma-related">
        <span className="xhair on-dark" style={{ top: 24, left: 30 }} aria-hidden="true">
          <i />
        </span>
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Related Services</span>
            <h2 id="boma-related">Surveys That Support Commercial Property</h2>
            <p style={{ color: "rgba(255,255,255,.7)" }}>
              Lease surveys sit alongside our legal and reality-capture work —
              one standard of accuracy across every service line.
            </p>
          </div>
          <div className="rel-grid">
            {[
              {
                href: "/geospatial-services/cadastral-surveying/",
                title: "Cadastral Surveying",
                body: "Legal land surveys to define and document property boundaries, ensuring clarity in ownership and development rights.",
              },
              {
                href: "/geospatial-services/3d-laser-scanning-reality-capture/",
                title: "Laser Scanning",
                body: "High-density point clouds that deliver precise measurements and full 3D context for as-built records, retrofits, and compliance.",
              },
              {
                href: "/geospatial-services/bim-modelling-services/",
                title: "BIM & 3D Modelling",
                body: "BIM Modelling and 3D Modelling services covering everything from infrastructure planning to detailed visualizations.",
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
