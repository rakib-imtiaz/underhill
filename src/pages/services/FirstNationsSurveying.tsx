import PageHero from "../../components/PageHero";
import CtaBand from "../../components/CtaBand";
import SmartLink from "../../components/SmartLink";
import useDocumentMeta from "../../hooks/useDocumentMeta";

/* ---------------------------------------------------------------------------
   Page-scoped styles, namespaced under `.pg-firstnations`. Visual language
   mirrors the Services hub — credential cards, check lists, a dark contrast
   history band, and project cards. Every animation is transform/opacity only
   and is disabled under prefers-reduced-motion.
--------------------------------------------------------------------------- */
const CSS = `
.pg-firstnations .sec-head { max-width: 760px; }

/* figure callout chip */
.pg-firstnations .figure .callout {
  position: absolute; top: 18px; right: 18px;
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--white);
  background: rgba(29,34,43,.78); padding: 7px 12px; border-left: 2px solid var(--lime);
}

/* credential cards */
.pg-firstnations .cred-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 54px;
}
@media (max-width: 900px) { .pg-firstnations .cred-grid { grid-template-columns: 1fr; } }
.pg-firstnations .cred-grid > .reveal { display: flex; }
.pg-firstnations .cred-card {
  position: relative; flex: 1; background: var(--white); padding: 30px 26px 30px;
  box-shadow: 0 10px 40px rgba(18,26,38,.08); overflow: hidden;
  transition: transform 0.35s var(--ease), box-shadow 0.35s var(--ease);
}
.pg-firstnations .cred-card::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, var(--blue), var(--lime));
  transform: scaleX(0); transform-origin: left;
  transition: transform 0.45s var(--ease);
}
.pg-firstnations .cred-card:hover { transform: translateY(-6px); box-shadow: 0 26px 54px rgba(18,26,38,.16); }
.pg-firstnations .cred-card:hover::before { transform: scaleX(1); }
.pg-firstnations .cred-card h3 { color: var(--navy); font-size: 19px; margin: 0 0 10px; }
.pg-firstnations .cred-card p { font-size: 14.5px; color: var(--grey-600); margin: 0; }

/* service example list */
.pg-firstnations ul.check { margin-top: 22px; }
.pg-firstnations ul.check li { font-size: 15px; }
.pg-firstnations ul.check li strong { color: var(--navy); }
.pg-firstnations ul.check a { color: var(--blue); }
.pg-firstnations ul.check a:hover { color: var(--navy); }

/* history band (dark) */
.pg-firstnations .history { max-width: 760px; }
.pg-firstnations .history p { color: rgba(255,255,255,.75); }
.pg-firstnations .history .rule {
  height: 16px; margin-top: 54px; opacity: 0.6;
  background-image:
    repeating-linear-gradient(90deg, rgba(255,255,255,.4) 0 1px, transparent 1px 96px),
    repeating-linear-gradient(90deg, rgba(255,255,255,.22) 0 1px, transparent 1px 24px);
  background-size: 100% 14px, 100% 8px;
  background-repeat: repeat-x;
  background-position: bottom left, bottom left;
}

/* featured projects */
.pg-firstnations .proj-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 54px;
}
@media (max-width: 900px) { .pg-firstnations .proj-grid { grid-template-columns: 1fr; } }
.pg-firstnations .proj-grid > .reveal { display: flex; }
.pg-firstnations .proj-card {
  position: relative; display: flex; flex-direction: column; flex: 1;
  background: var(--navy); color: rgba(255,255,255,.74); overflow: hidden;
  transition: transform 0.35s var(--ease), box-shadow 0.35s var(--ease);
}
.pg-firstnations .proj-card:hover { transform: translateY(-8px); box-shadow: 0 34px 64px rgba(18,26,38,.3); }
.pg-firstnations .proj-card:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
.pg-firstnations .proj-media { position: relative; aspect-ratio: 4 / 3; overflow: hidden; }
.pg-firstnations .proj-media img {
  width: 100%; height: 100%; object-fit: cover;
  transition: transform 0.6s var(--ease);
}
.pg-firstnations .proj-card:hover .proj-media img { transform: scale(1.06); }
.pg-firstnations .proj-media::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(60,57,80,.08), rgba(60,57,80,.55) 96%);
}
.pg-firstnations .proj-body { padding: 22px 24px 24px; display: flex; flex-direction: column; flex: 1; }
.pg-firstnations .proj-body h3 { color: var(--white); font-size: 18px; margin: 0; }
.pg-firstnations .proj-all { margin-top: 36px; }

/* related services strip */
.pg-firstnations .rel-row {
  display: flex; flex-wrap: wrap; gap: 14px; margin-top: 34px;
}
.pg-firstnations .rel-link {
  display: inline-flex; align-items: center; gap: 10px;
  font-family: var(--font-head); font-weight: 600; font-size: 13px;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--navy);
  border: 1px solid var(--grey-100); padding: 14px 20px;
  transition: transform 0.3s var(--ease), border-color 0.3s var(--ease), color 0.3s var(--ease);
}
.pg-firstnations .rel-link .arr { color: var(--blue); transition: transform 0.3s var(--ease); }
.pg-firstnations .rel-link:hover { transform: translateY(-3px); border-color: var(--blue); }
.pg-firstnations .rel-link:hover .arr { transform: translateX(5px); }

@media (prefers-reduced-motion: reduce) {
  .pg-firstnations .cred-card, .pg-firstnations .cred-card::before,
  .pg-firstnations .proj-card, .pg-firstnations .proj-media img,
  .pg-firstnations .rel-link, .pg-firstnations .rel-link .arr {
    transition: none !important;
  }
  .pg-firstnations .cred-card:hover, .pg-firstnations .proj-card:hover,
  .pg-firstnations .rel-link:hover { transform: none; }
  .pg-firstnations .proj-card:hover .proj-media img,
  .pg-firstnations .rel-link:hover .arr { transform: none; }
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

const PROJECTS = [
  {
    title: "Inuvialuit Final Agreement (IFA) Boundary Survey",
    img: "/assets/uploads/2025/06/Inuvialuit-Final-Agreement-Survey-NWT-07-thegem-blog-justified.webp",
    alt: "Inuvialuit Final Agreement boundary survey, NWT",
  },
  {
    title: "Council of Yukon First Nations (CYFN) Land Claim Surveys",
    img: "/assets/uploads/2025/06/CYF-UNDERHILL-01-thegem-blog-justified.webp",
    alt: "Council of Yukon First Nations land claim survey",
  },
  {
    title: "Sahtu Dene and Metis Final Agreement",
    img: "/assets/uploads/2025/06/Sahtu-Dene-Metis-Agreement-01-thegem-blog-justified.webp",
    alt: "Sahtu Dene and Metis Final Agreement survey",
  },
];

const RELATED = [
  { to: "/geospatial-services/cadastral-surveying/", label: "Cadastral Surveying" },
  { to: "/geospatial-services/topographic-surveying/", label: "Topographic Surveys" },
  { to: "/geospatial-services/3d-laser-scanning-reality-capture/", label: "Laser Scanning" },
];

export default function FirstNationsSurveying() {
  useDocumentMeta(
    "First Nations Land Claims Surveying",
    "Surveying services for First Nations land claims and boundaries. Underhill's partnerships with First Nations are built on deep respect and lasting relationships with Indigenous clients."
  );

  return (
    <main id="main" className="pg-firstnations">
      <style>{CSS}</style>

      <PageHero
        image="/assets/uploads/2025/10/DSC_6741-Edit-scaled.jpg"
        title="First Nations Land Claims Surveying"
        eyebrow="Geospatial Services"
        subtitle="Surveying Services for First Nations Land Claims and Boundaries"
        lead="Our partnerships with First Nations extend further than just land claims; we have a deep respect and have built lasting relationships with our Indigenous clients."
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

      {/* Intro — Indigenous survey expertise */}
      <section className="section" aria-labelledby="fn-intro">
        <div className="container split">
          <div className="reveal">
            <span className="kicker">Over 100 Years of Experience</span>
            <h2 id="fn-intro">Underhill’s Indigenous Survey Expertise</h2>
            <p>
              Throughout our history, Underhill has supported ground-breaking
              First Nations land claims surveys across Canada. Today, we remain
              a trusted partner in Indigenous communities, providing support
              for growth and development.
            </p>
            <h3>Service Examples:</h3>
            <ul className="check">
              <li>
                <SmartLink to="/geospatial-services/cadastral-surveying/">
                  <strong>Cadastral Land Surveying Services</strong>
                </SmartLink>{" "}
                - to support Indigenous land development and planning
              </li>
              <li>
                <strong>Mineral Title &amp; Lease Surveys</strong> - For mining
                and resource operations
              </li>
              <li>
                <SmartLink to="/geospatial-services/3d-laser-scanning-reality-capture/">
                  <strong>3D Laser Scanning</strong>
                </SmartLink>{" "}
                - For reality capture, visualization and spatial analysis as
                well as heritage documentation and preservation
              </li>
              <li>
                <SmartLink to="/geospatial-services/topographic-surveying/">
                  <strong>Topographic Surveying Services</strong>
                </SmartLink>{" "}
                - Accurate land mapping for planning, design &amp; development
              </li>
            </ul>
            <SmartLink className="btn" to="#lets-talk" style={{ marginTop: 24 }}>
              Request Consultation
            </SmartLink>
          </div>
          <div className="figure reveal" style={{ transitionDelay: "0.12s" }}>
            <img
              src="/assets/uploads/2025/08/cyfn-land-survey-yt.jpg.jpg"
              alt="Council of Yukon First Nations land survey, Yukon"
              loading="lazy"
            />
            <span className="callout" aria-hidden="true">
              PARTNERSHIP · RESPECT · PRECISION
            </span>
            <span className="cap">FIRST NATIONS SURVEYING · CANADA</span>
          </div>
        </div>
      </section>

      {/* Credentials */}
      <section className="section grey" aria-labelledby="fn-creds">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Credentials</span>
            <h2 id="fn-creds">Licensed, Authorized, and Trusted</h2>
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

      {/* History — dark contrast */}
      <section className="section dark" aria-labelledby="fn-history">
        <div className="container">
          <div className="history reveal">
            <span className="kicker">Our History</span>
            <h2 id="fn-history">Our First Nations Land Claims Surveying History</h2>
            <p>
              Underhill has been very active in the survey and demarcation of
              the boundaries of the various Indigenous claims. We have an
              unparalleled record in the performance of First Nations Land
              Claims surveys in Canada.
            </p>
            <p>
              Some examples of these historical land claim projects are
              featured below.
            </p>
            <div className="rule" aria-hidden="true" />
          </div>
        </div>
      </section>

      {/* Featured historical land claim projects */}
      <section className="section" aria-labelledby="fn-projects">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Featured Projects</span>
            <h2 id="fn-projects">Featured Historical Land Claim Projects</h2>
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
      <section className="section tight grey" aria-labelledby="fn-related">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Related Services</span>
            <h2 id="fn-related">Explore Related Surveying Services</h2>
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
