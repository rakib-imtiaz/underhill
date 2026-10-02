import PageHero from "../components/PageHero";
import CtaBand from "../components/CtaBand";
import SmartLink from "../components/SmartLink";
import useDocumentMeta from "../hooks/useDocumentMeta";
import { ContourDivider } from "./motifs";

/* ---------------------------------------------------------------------------
   Industries (`/about-underhill-geomatics/land-surveyors/`).
   Copy is lifted from site_capture/text/about-underhill-geomatics_land-
   surveyors.txt; the hero photo, the video overlay still and the three
   featured-project thumbnails are the ones the source page used. The source's
   "Watch Now" lightbox becomes a plain link to the same YouTube video (no
   third-party embed on load). Shared primitives (.section/.split/.kicker/
   .figure/.btn/.cards) plus a page-scoped layer namespaced `.pg-ind`.
   Transform/opacity animation only; reduced-motion safe.
--------------------------------------------------------------------------- */
const CSS = `
/* sector chips under the intro */
.pg-ind .sectors { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
.pg-ind .sectors span {
  font-family: var(--font-head); font-size: 12px; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--navy);
  border: 1px solid var(--grey-300); padding: 9px 16px;
}

/* video still with a play reticle — links out to the source YouTube video */
.pg-ind .video { display: block; position: relative; overflow: hidden; box-shadow: var(--shadow-lg); }
.pg-ind .video img { width: 100%; height: auto; transition: transform 0.6s var(--ease); }
.pg-ind .video::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(29,34,43,0) 40%, rgba(29,34,43,.72));
}
.pg-ind .video .play {
  position: absolute; left: 50%; top: 50%; z-index: 2;
  width: 84px; height: 84px; margin: -42px 0 0 -42px; border-radius: 50%;
  background: var(--blue); color: var(--white);
  display: grid; place-items: center;
  box-shadow: 0 0 0 10px rgba(var(--blue-rgb), .25);
  transition: transform 0.35s var(--ease), box-shadow 0.35s var(--ease);
}
.pg-ind .video .label {
  position: absolute; left: 24px; bottom: 20px; z-index: 2;
  font-family: var(--font-head); font-size: 12px; font-weight: 600;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--white);
  display: inline-flex; align-items: center; gap: 10px;
}
.pg-ind .video .label::before { content: ""; width: 26px; height: 2px; background: var(--lime); }
.pg-ind .video:hover img { transform: scale(1.04); }
.pg-ind .video:hover .play { transform: scale(1.08); box-shadow: 0 0 0 16px rgba(var(--blue-rgb), .2); }

/* who we serve — numbered sector rows */
.pg-ind .serve { display: grid; grid-template-columns: repeat(2, 1fr); gap: 22px; margin-top: 46px; }
@media (max-width: 800px) { .pg-ind .serve { grid-template-columns: 1fr; } }
.pg-ind .serve > .reveal { display: flex; }
.pg-ind .serve-item {
  position: relative; flex: 1; background: var(--white);
  padding: 28px 30px 28px 34px; box-shadow: var(--shadow-sm);
  border-left: 3px solid var(--blue);
  transition: transform 0.3s var(--ease), box-shadow 0.3s var(--ease), border-color 0.3s var(--ease);
}
.pg-ind .serve-item:hover { transform: translateY(-4px); box-shadow: var(--shadow-md); border-left-color: var(--navy); }
.pg-ind .serve-item .num {
  font-family: var(--font-head); font-size: 12px; letter-spacing: 0.2em;
  color: var(--blue); display: block; margin-bottom: 8px;
}
.pg-ind .serve-item h3 { margin: 0 0 8px; font-size: 20px; }
.pg-ind .serve-item p { font-size: 14.5px; color: var(--grey-600); margin: 0; }

/* office network cards (dark section) */
.pg-ind .offices { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-top: 46px; }
@media (max-width: 1080px) { .pg-ind .offices { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 620px) { .pg-ind .offices { grid-template-columns: 1fr; } }
.pg-ind .office {
  position: relative; display: flex; flex-direction: column;
  background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.1);
  padding: 30px 26px 26px; color: rgba(255,255,255,.75);
  transition: transform 0.3s var(--ease), border-color 0.3s var(--ease), background 0.3s var(--ease);
}
.pg-ind .office:hover {
  transform: translateY(-5px); border-color: rgba(var(--blue-rgb), .6);
  background: rgba(255,255,255,.07); color: rgba(255,255,255,.75);
}
.pg-ind .office .plus { color: var(--lime); font-size: 26px; line-height: 1; font-family: var(--font-head); }
.pg-ind .office h3 { color: var(--white); font-size: 21px; margin: 18px 0 10px; }
.pg-ind .office p { font-size: 14px; flex: 1; margin: 0 0 22px; }
.pg-ind .office .go {
  font-family: var(--font-head); font-weight: 600; font-size: 12.5px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--white);
  display: inline-flex; align-items: center; gap: 9px;
}
.pg-ind .office .go::after { content: "+"; color: var(--blue); font-size: 17px; transition: transform 0.3s var(--ease); }
.pg-ind .office:hover .go { color: var(--lime); }
.pg-ind .office:hover .go::after { transform: rotate(90deg); }

@media (prefers-reduced-motion: reduce) {
  .pg-ind .video img, .pg-ind .video .play, .pg-ind .serve-item,
  .pg-ind .office, .pg-ind .office .go::after { transition: none !important; }
  .pg-ind .video:hover img, .pg-ind .video:hover .play,
  .pg-ind .serve-item:hover, .pg-ind .office:hover,
  .pg-ind .office:hover .go::after { transform: none; }
}
`;

const VIDEO_URL = "https://youtu.be/xii2tc6JtaI";

const SECTORS = ["Construction", "Marine", "Mining", "Oil and Gas", "Infrastructure"];

/* "Who We Serve and How We Help" — verbatim from the source list */
const WHO_WE_SERVE = [
  {
    title: "Land Developers",
    body: "We provide site surveys, topographic plans, and subdivision layouts for residential, commercial, and industrial projects.",
  },
  {
    title: "Construction Firms",
    body: "We provide, control, layout, and as-built surveys to guide foundations, roads, utilities, and other structures.",
  },
  {
    title: "Municipal & Provincial Governments",
    body: "We support infrastructure development, corridor mapping, and utility planning.",
  },
  {
    title: "Port & Marine Operators",
    body: "We provide shoreline mapping, bathymetric surveys, and support for dredging and marine construction.",
  },
  {
    title: "Mining Operations",
    body: "We support exploration, development, construction, and ongoing mining operations.",
  },
  {
    title: "Oil & Gas Companies",
    body: "Our surveys support pipeline layout, facility design, and land use permitting.",
  },
  {
    title: "Indigenous Communities",
    body: "We help define reserve boundaries, land stewardship areas, and provide support for growth and development.",
  },
  {
    title: "Legal Professionals",
    body: "Our survey plans assist with property disputes, easement documentation, and title clarification.",
  },
];

/* source order: Whitehorse, Vancouver, Kamloops, Vancouver Island */
const OFFICES = [
  {
    name: "Whitehorse Office",
    body: "Supporting Yukon, NWT, and Nunavut projects.",
    href: "/whitehorse-land-surveyors/",
  },
  {
    name: "Vancouver Office",
    body: "Serving Metro Vancouver and the Lower Mainland.",
    href: "/vancouver-land-surveyors/",
  },
  {
    name: "Kamloops Office",
    body: "Working across the BC Interior and surrounding areas.",
    href: "/kamloops-land-surveyors/",
  },
  {
    name: "Vancouver Island Office",
    body: "Covering Courtenay, Comox Valley, Campbell River, and the Victoria region.",
    href: "/vancouver-island-land-surveyors/",
  },
];

/* the three projects featured on the source page; all three live on the
   ported Construction category listing */
const FEATURED = [
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

export default function Industries() {
  useDocumentMeta(
    "Land Surveyors | Trusted, Precise, Experienced",
    "Trusted land surveyors since 1913. Reliable geomatics services for construction, marine, infrastructure, mining, and oil & gas projects."
  );

  return (
    <main id="main" className="pg-ind">
      <style>{CSS}</style>
      <PageHero
        image="/assets/uploads/2025/06/land-surveying_027_underhill-geomatics__Eagle-Vision-Agency_.jpg"
        title="Industries"
        subtitle="We Serve Industries Across BC, Yukon, NWT & Nunavut"
        lead="At Underhill Geomatics, our land surveyors have delivered trusted, precise services across Western and Northern Canada for over 110 years."
        crumb={{ label: "About", href: "/about-underhill-geomatics/" }}
      >
        <div className="actions">
          <a className="btn" href="#lets-talk">
            Request a Consultation
          </a>
          <a className="btn ghost" href={VIDEO_URL} target="_blank" rel="noreferrer">
            Watch Now
          </a>
        </div>
      </PageHero>

      {/* ------------------------------------------------------------ intro */}
      <section className="section">
        <div className="container split">
          <div className="reveal">
            <span className="kicker">Industries</span>
            <h2>Trusted, Precise, Experienced</h2>
            <p>
              We support construction, marine, mining, oil and gas, and
              infrastructure sectors. Our teams provide reliable surveying
              solutions that meet the needs of diverse and complex project
              environments.
            </p>
            <div className="sectors" aria-label="Sectors we support">
              {SECTORS.map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
          </div>
          <div className="reveal" style={{ transitionDelay: "120ms" }}>
            <a
              className="video"
              href={VIDEO_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Watch the Underhill Geomatics video on YouTube (opens in a new tab)"
            >
              <img
                src="/assets/uploads/2025/05/Underhill-Geomatics-Burnaby_029_Eagle-Vision-Agency_20240510.webp"
                alt=""
                loading="lazy"
              />
              <span className="play" aria-hidden="true">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5.5v13l11-6.5z" />
                </svg>
              </span>
              <span className="label">Watch Now</span>
            </a>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- who we serve */}
      <section className="section grey">
        <div className="container">
          <div className="reveal">
            <span className="kicker">Over 110 Years Serving Western and Northern Canada</span>
            <h2>Underhill’s Surveying Expertise Across Industries</h2>
            <p className="lead">
              Underhill’s land surveyors support a wide range of industries
              throughout British Columbia, Yukon, Northwest Territories, and
              Nunavut.
            </p>
            <h3>Who We Serve and How We Help</h3>
          </div>
          <div className="serve">
            {WHO_WE_SERVE.map((w, i) => (
              <div
                className="reveal"
                style={{ transitionDelay: `${(i % 2) * 90}ms` }}
                key={w.title}
              >
                <div className="serve-item">
                  <span className="num">{String(i + 1).padStart(2, "0")}</span>
                  <h3>{w.title}</h3>
                  <p>{w.body}</p>
                </div>
              </div>
            ))}
          </div>
          <ContourDivider />
        </div>
      </section>

      {/* -------------------------------------------------- office network */}
      <section className="section dark">
        <div className="container">
          <div className="reveal">
            <span className="kicker">Regional Offices</span>
            <h2>Our Office Network</h2>
            <p className="lead" style={{ color: "rgba(255,255,255,.78)" }}>
              We maintain four regional offices to serve clients across Western
              and Northern Canada.
            </p>
          </div>
          <div className="offices">
            {OFFICES.map((o, i) => (
              <SmartLink
                className="office reveal"
                style={{ transitionDelay: `${i * 80}ms` }}
                to={o.href}
                key={o.name}
              >
                <span className="plus" aria-hidden="true">
                  +
                </span>
                <h3>{o.name}</h3>
                <p>{o.body}</p>
                <span className="go">Learn More</span>
              </SmartLink>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ featured projects */}
      <section className="section grey">
        <div className="container">
          <div className="reveal">
            <span className="kicker">Featured Work</span>
            <h2>Featured Projects</h2>
          </div>
          <div className="cards">
            {FEATURED.map((p, i) => (
              <SmartLink
                className="card reveal"
                style={{ transitionDelay: `${i * 90}ms` }}
                to="/category/land-survey-projects/construction/"
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

      <CtaBand />
    </main>
  );
}
