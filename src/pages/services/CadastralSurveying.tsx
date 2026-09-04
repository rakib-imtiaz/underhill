import PageHero from "../../components/PageHero";
import CtaBand from "../../components/CtaBand";
import SmartLink from "../../components/SmartLink";
import useDocumentMeta from "../../hooks/useDocumentMeta";

/* ---------------------------------------------------------------------------
   Page-scoped styles, namespaced under `.pg-cadastral`. Visual language
   mirrors the Services hub (`.pg-services`) — chips, credential cards,
   grouped check lists, dark contrast band, project cards. Every animation is
   transform/opacity only and is disabled under prefers-reduced-motion.
--------------------------------------------------------------------------- */
const CSS = `
.pg-cadastral .sec-head { max-width: 760px; }

/* jurisdiction chips */
.pg-cadastral .chips { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 26px; }
.pg-cadastral .chip {
  font-family: var(--font-head); font-size: 11.5px; font-weight: 600;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--navy);
  border: 1px solid var(--grey-100); background: var(--white);
  padding: 8px 14px; border-left: 3px solid var(--blue);
}

/* figure callout chip */
.pg-cadastral .figure .callout {
  position: absolute; top: 18px; right: 18px;
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--white);
  background: rgba(29,34,43,.78); padding: 7px 12px; border-left: 2px solid var(--lime);
}

/* credential cards */
.pg-cadastral .cred-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 54px;
}
@media (max-width: 900px) { .pg-cadastral .cred-grid { grid-template-columns: 1fr; } }
.pg-cadastral .cred-grid > .reveal { display: flex; }
.pg-cadastral .cred-card {
  position: relative; flex: 1; background: var(--white); padding: 30px 26px 30px;
  box-shadow: 0 10px 40px rgba(18,26,38,.08); overflow: hidden;
  transition: transform 0.35s var(--ease), box-shadow 0.35s var(--ease);
}
.pg-cadastral .cred-card::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, var(--blue), var(--lime));
  transform: scaleX(0); transform-origin: left;
  transition: transform 0.45s var(--ease);
}
.pg-cadastral .cred-card:hover { transform: translateY(-6px); box-shadow: 0 26px 54px rgba(18,26,38,.16); }
.pg-cadastral .cred-card:hover::before { transform: scaleX(1); }
.pg-cadastral .cred-card h3 { color: var(--navy); font-size: 19px; margin: 0 0 10px; }
.pg-cadastral .cred-card p { font-size: 14.5px; color: var(--grey-600); margin: 0; }

/* grouped service lists */
.pg-cadastral .svc-groups {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 40px 56px; margin-top: 54px;
}
@media (max-width: 800px) { .pg-cadastral .svc-groups { grid-template-columns: 1fr; } }
.pg-cadastral .svc-groups > .reveal { display: flex; }
.pg-cadastral .svc-group { flex: 1; border-top: 3px solid var(--blue); padding-top: 22px; }
.pg-cadastral .svc-group h3 { font-size: 21px; margin: 0 0 6px; color: var(--navy); }
.pg-cadastral .svc-group ul.check { margin: 14px 0 0; }
.pg-cadastral .svc-group ul.check li { font-size: 15px; }
.pg-cadastral .svc-group ul.check li strong { color: var(--navy); }

/* specialized services (dark) */
.pg-cadastral .spec-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 26px; margin-top: 54px;
}
@media (max-width: 800px) { .pg-cadastral .spec-grid { grid-template-columns: 1fr; } }
.pg-cadastral .spec-grid > .reveal { display: flex; }
.pg-cadastral .spec-item {
  position: relative; flex: 1; padding: 26px 28px 26px 34px;
  background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.09);
  border-left: 3px solid var(--blue);
  transition: transform 0.3s var(--ease), border-color 0.3s var(--ease), background 0.3s var(--ease);
}
.pg-cadastral .spec-item:hover {
  transform: translateX(6px); border-left-color: var(--lime);
  background: rgba(255,255,255,.06);
}
.pg-cadastral .spec-item h3 { color: var(--white); font-size: 20px; margin: 0 0 8px; }
.pg-cadastral .spec-item p { color: rgba(255,255,255,.7); font-size: 14.5px; margin: 0; }

/* featured projects */
.pg-cadastral .proj-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 54px;
}
@media (max-width: 900px) { .pg-cadastral .proj-grid { grid-template-columns: 1fr; } }
.pg-cadastral .proj-grid > .reveal { display: flex; }
.pg-cadastral .proj-card {
  position: relative; display: flex; flex-direction: column; flex: 1;
  background: var(--navy); color: rgba(255,255,255,.74); overflow: hidden;
  transition: transform 0.35s var(--ease), box-shadow 0.35s var(--ease);
}
.pg-cadastral .proj-card:hover { transform: translateY(-8px); box-shadow: 0 34px 64px rgba(18,26,38,.3); }
.pg-cadastral .proj-card:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
.pg-cadastral .proj-media { position: relative; aspect-ratio: 4 / 3; overflow: hidden; }
.pg-cadastral .proj-media img {
  width: 100%; height: 100%; object-fit: cover;
  transition: transform 0.6s var(--ease);
}
.pg-cadastral .proj-card:hover .proj-media img { transform: scale(1.06); }
.pg-cadastral .proj-media::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(60,57,80,.08), rgba(60,57,80,.55) 96%);
}
.pg-cadastral .proj-body { padding: 22px 24px 24px; display: flex; flex-direction: column; flex: 1; }
.pg-cadastral .proj-body h3 { color: var(--white); font-size: 18px; margin: 0; }
.pg-cadastral .proj-all { margin-top: 36px; }

/* related services strip */
.pg-cadastral .rel-row {
  display: flex; flex-wrap: wrap; gap: 14px; margin-top: 34px;
}
.pg-cadastral .rel-link {
  display: inline-flex; align-items: center; gap: 10px;
  font-family: var(--font-head); font-weight: 600; font-size: 13px;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--navy);
  border: 1px solid var(--grey-100); padding: 14px 20px;
  transition: transform 0.3s var(--ease), border-color 0.3s var(--ease), color 0.3s var(--ease);
}
.pg-cadastral .rel-link .arr { color: var(--blue); transition: transform 0.3s var(--ease); }
.pg-cadastral .rel-link:hover { transform: translateY(-3px); border-color: var(--blue); }
.pg-cadastral .rel-link:hover .arr { transform: translateX(5px); }

@media (prefers-reduced-motion: reduce) {
  .pg-cadastral .cred-card, .pg-cadastral .cred-card::before,
  .pg-cadastral .spec-item, .pg-cadastral .proj-card, .pg-cadastral .proj-media img,
  .pg-cadastral .rel-link, .pg-cadastral .rel-link .arr {
    transition: none !important;
  }
  .pg-cadastral .cred-card:hover, .pg-cadastral .spec-item:hover,
  .pg-cadastral .proj-card:hover, .pg-cadastral .rel-link:hover { transform: none; }
  .pg-cadastral .proj-card:hover .proj-media img,
  .pg-cadastral .rel-link:hover .arr { transform: none; }
}
`;

const CREDENTIALS = [
  {
    title: "Association of BC Land Surveyors (ABCLS)",
    body: "Our surveyors are fully licensed under ABCLS for provincial lands.",
  },
  {
    title: "Association of Canada Lands Surveyors (ACLS)",
    body: "We are authorized to survey on Canada Lands, including First Nations reserves, national parks, and the territories.",
  },
  {
    title: "Trusted Advisors for Landowners, Developers, and Governments",
    body: "Clients rely on our professionalism, accuracy, and timely results for land acquisition, subdivision, and regulation compliance.",
  },
];

const SERVICE_GROUPS = [
  {
    title: "Boundary & Ownership Services",
    items: [
      ["Property Line Surveys", "We identify, measure, and mark legal boundary lines for urban and rural properties."],
      ["Title Searches & Land Acquisition Support", "We support due diligence for purchases, development, and infrastructure planning."],
      ["Building Location Certificates and Site Improvement", "We verify building positions relative to lot boundaries for legal compliance."],
    ],
  },
  {
    title: "Development & Subdivision Services",
    items: [
      ["Subdivisions & Consolidations", "We divide or combine parcels and prepare the legal plans for registration."],
      ["Strata & Condominium Surveys", "We prepare legal plans for vertical ownership structures and shared developments."],
      ["Air Space Parcels & 3D Cadastre", "We define ownership in three dimensions—from underground parkades to rooftop spaces."],
    ],
  },
  {
    title: "Crown Land, Access Rights & Mineral Claims",
    items: [
      ["Easements & Rights-of-Way", "We survey access routes, utility corridors, and shared-use areas."],
      ["Crown Land & Foreshore Leases", "We support land use near water bodies and public lands."],
      ["Covenants & Posting Plans", "We prepare documentation for land restrictions and regulatory compliance."],
      ["Mineral Title & Lease Surveys", "We define extractive rights and boundaries for mining and resource operations."],
    ],
  },
] as const;

const SPECIALIZED = [
  {
    title: "First Nations Land Claims & Boundary Support",
    body: "We collaborate with Indigenous communities on historic land claim boundaries and mapping.",
  },
  {
    title: "Accretion & Natural Boundary Adjustments",
    body: "We survey natural changes to waterfront property boundaries.",
  },
  {
    title: "Professional Opinions for Legal Disputes",
    body: "Our experts provide affidavits and testimony for boundary disputes and title interpretation.",
  },
  {
    title: "BOMA & Lease Surveys",
    body: "We deliver accurate, certified lease area surveys that align with BOMA standards—helping you optimize space, reduce risk, and support legal compliance.",
  },
];

const PROJECTS = [
  {
    title: "Langford Heights Business Park",
    img: "/assets/uploads/2026/07/langford-business-park-1-thegem-blog-justified.jpg",
    alt: "Langford Heights Business Park",
  },
  {
    title: "King Edward Village",
    img: "/assets/uploads/2025/09/King-Edward-Underhill-04-thegem-blog-justified.jpg",
    alt: "King Edward Village",
  },
  {
    title: "Brookside Multi-Phase Housing Development Surveying",
    img: "/assets/uploads/2011/01/Brookside-Development-7-thegem-blog-justified.webp",
    alt: "Brookside multi-phase housing development",
  },
];

const RELATED = [
  { to: "/geospatial-services/first-nations-land-claims-surveying/", label: "First Nations Surveying" },
  { to: "/geospatial-services/boma-surveying/", label: "BOMA & Lease Surveys" },
  { to: "/geospatial-services/topographic-surveying/", label: "Topographic Surveys" },
];

export default function CadastralSurveying() {
  useDocumentMeta(
    "Cadastral Surveying Services | Trusted in BC & Northern Canada",
    "Cadastral surveying defines, measures, and records legal land boundaries. Underhill helps clients secure land rights, resolve disputes, and plan developments with precision."
  );

  return (
    <main id="main" className="pg-cadastral">
      <style>{CSS}</style>

      <PageHero
        image="/assets/uploads/2025/05/Underhill-Geomatics-Victoria_073_Eagle-Vision-Agency_20230705.jpg"
        title="Cadastral & Legal Surveying Services"
        eyebrow="Geospatial Services"
        subtitle="Accurate Legal Boundaries in Western and Northern Canada"
        lead="Cadastral surveying defines, measures, and records legal land boundaries. At Underhill, we help clients secure land rights, resolve disputes, and plan developments with precision."
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

      {/* Intro — legal surveying expertise */}
      <section className="section" aria-labelledby="cad-intro">
        <div className="container split">
          <div className="reveal">
            <span className="kicker">Legal Surveying Expertise</span>
            <h2 id="cad-intro">Serving BC, Yukon, NWT, and Nunavut Since 1913</h2>
            <p>
              Cadastral surveying is the foundation of our company. We provide
              full-spectrum legal surveying services for residential,
              commercial, and industrial applications. From property line
              marking to 3D air space parcels, our work ensures legal clarity
              across all project types.
            </p>
            <div className="chips" aria-label="Jurisdictions served">
              {["British Columbia", "Yukon", "Northwest Territories", "Nunavut"].map((j) => (
                <span className="chip" key={j}>{j}</span>
              ))}
            </div>
            <SmartLink className="btn" to="#lets-talk" style={{ marginTop: 32 }}>
              Request Consultation
            </SmartLink>
          </div>
          <div className="figure reveal" style={{ transitionDelay: "0.12s" }}>
            <img
              src="/assets/uploads/2025/08/Cadastral-boundaries-little-mtn-bc.jpg.jpg"
              alt="Cadastral boundaries near Little Mountain, BC"
              loading="lazy"
            />
            <span className="callout" aria-hidden="true">
              LEGAL BOUNDARIES · SINCE 1913
            </span>
            <span className="cap">CADASTRAL SURVEYING · WESTERN &amp; NORTHERN CANADA</span>
          </div>
        </div>
      </section>

      {/* Credentials */}
      <section className="section grey" aria-labelledby="cad-creds">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Credentials</span>
            <h2 id="cad-creds">Licensed, Authorized, and Trusted</h2>
          </div>
          <div className="cred-grid">
            {CREDENTIALS.map((c, i) => (
              <div className="reveal" key={c.title} style={{ transitionDelay: `${i * 0.08}s` }}>
                <div className="cred-card">
                  <h3>{c.title}</h3>
                  <p>{c.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Service groups */}
      <section className="section" aria-labelledby="cad-services">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Service Examples</span>
            <h2 id="cad-services">Our Cadastral Surveying Services</h2>
            <p className="lead">
              We offer a complete suite of cadastral surveying services tailored
              to your project’s legal and spatial requirements. Whether you’re
              confirming a boundary or subdividing land, we deliver accurate,
              compliant results.
            </p>
          </div>
          <div className="svc-groups">
            {SERVICE_GROUPS.map((g, i) => (
              <div className="reveal" key={g.title} style={{ transitionDelay: `${(i % 2) * 0.08}s` }}>
                <div className="svc-group">
                  <h3>{g.title}</h3>
                  <ul className="check">
                    {g.items.map(([term, desc]) => (
                      <li key={term}>
                        <strong>{term}</strong> – {desc}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Specialized services — dark contrast */}
      <section className="section dark" aria-labelledby="cad-spec">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Specialized Services</span>
            <h2 id="cad-spec">Specialized Cadastral Services</h2>
          </div>
          <div className="spec-grid">
            {SPECIALIZED.map((s, i) => (
              <div className="reveal" key={s.title} style={{ transitionDelay: `${(i % 2) * 0.09}s` }}>
                <div className="spec-item">
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured projects */}
      <section className="section grey" aria-labelledby="cad-projects">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Featured Projects</span>
            <h2 id="cad-projects">Cadastral Surveying in Practice</h2>
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
            <SmartLink className="btn navy" to="/land-surveying-projects/">
              All Projects
            </SmartLink>
          </div>
        </div>
      </section>

      {/* Related services */}
      <section className="section tight" aria-labelledby="cad-related">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Related Services</span>
            <h2 id="cad-related">Explore Related Surveying Services</h2>
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
