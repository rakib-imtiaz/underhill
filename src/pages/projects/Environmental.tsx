import PageHero from "../../components/PageHero";
import CtaBand from "../../components/CtaBand";
import SmartLink from "../../components/SmartLink";
import useDocumentMeta from "../../hooks/useDocumentMeta";

/* ---------------------------------------------------------------------------
   Page-scoped styles, namespaced under `.pg-environmental`.
   Editorial listing grid: image cards for projects with a verified capture,
   navy typographic cards (file number + crosshair motif) for the rest.
   Cards are <article>s — project detail posts are not part of this port.
   Every animation is transform/opacity only and disabled under
   prefers-reduced-motion — GPU-cheap by contract.
--------------------------------------------------------------------------- */
const CSS = `
.pg-environmental .sec-head { max-width: 760px; }

/* archive meta strip above the grid */
.pg-environmental .listing-meta {
  display: flex; align-items: baseline; justify-content: space-between; gap: 16px;
  flex-wrap: wrap;
  margin-top: 54px; padding-bottom: 18px;
  border-bottom: 1px solid var(--grey-100);
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.18em; text-transform: uppercase; color: var(--grey-600);
}
.pg-environmental .listing-meta .n { color: var(--blue); }

/* listing grid */
.pg-environmental .cat-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 34px;
}
@media (max-width: 1100px) { .pg-environmental .cat-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 620px) { .pg-environmental .cat-grid { grid-template-columns: 1fr; } }
.pg-environmental .cat-grid > .reveal { display: flex; }
.pg-environmental .cat-card {
  position: relative; display: flex; flex-direction: column; flex: 1;
  background: var(--white); box-shadow: 0 10px 40px rgba(18,26,38,.08); overflow: hidden;
  transition: transform 0.35s var(--ease), box-shadow 0.35s var(--ease);
}
.pg-environmental .cat-card:hover { transform: translateY(-6px); box-shadow: 0 26px 54px rgba(18,26,38,.16); }
.pg-environmental .cat-card::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px; z-index: 2;
  background: linear-gradient(90deg, var(--blue), var(--lime));
  transform: scaleX(0); transform-origin: left;
  transition: transform 0.45s var(--ease);
}
.pg-environmental .cat-card:hover::before { transform: scaleX(1); }

/* image card */
.pg-environmental .shot { position: relative; aspect-ratio: 16 / 10; overflow: hidden; }
.pg-environmental .shot img {
  width: 100%; height: 100%; object-fit: cover;
  transition: transform 0.6s var(--ease);
}
.pg-environmental .cat-card:hover .shot img { transform: scale(1.05); }
.pg-environmental .shot::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(60,57,80,.04), rgba(60,57,80,.5) 96%);
}
.pg-environmental .idx {
  position: absolute; top: 14px; left: 16px; z-index: 2;
  font-family: var(--font-head); font-size: 12px; font-weight: 600;
  letter-spacing: 0.2em; color: var(--white);
  background: rgba(60,57,80,.72); padding: 5px 10px; border-left: 2px solid var(--lime);
}
.pg-environmental .body {
  position: relative; padding: 24px 26px 26px;
  display: flex; flex-direction: column; flex: 1;
}
.pg-environmental .body h3 { color: var(--navy); font-size: 19px; margin: 0 0 10px; }
.pg-environmental .body p { font-size: 14.5px; color: var(--grey-600); margin: 0; flex: 1; }

/* related service link — the only link on a card */
.pg-environmental .rel {
  margin-top: 18px; font-family: var(--font-head); font-weight: 600; font-size: 12px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--blue);
  display: inline-flex; align-items: center; gap: 9px; align-self: flex-start;
  transition: color 0.25s var(--ease);
}
.pg-environmental .rel .arr { transition: transform 0.3s var(--ease); }
.pg-environmental .rel:hover { color: var(--navy); }
.pg-environmental .rel:hover .arr { transform: translateX(6px); }

/* typographic card — no usable image in the capture */
.pg-environmental .typo { background: var(--navy); }
.pg-environmental .typo .body h3 { color: var(--white); }
.pg-environmental .typo .body p { color: rgba(255,255,255,.72); }
.pg-environmental .typo .rel { color: var(--lime); }
.pg-environmental .typo .rel:hover { color: var(--white); }
.pg-environmental .tnum {
  display: block; margin-bottom: 14px;
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.22em; text-transform: uppercase; color: var(--lime);
}
.pg-environmental .ghost {
  position: absolute; right: 14px; bottom: -16px; pointer-events: none;
  font-family: var(--font-head); font-weight: 700; font-size: 130px; line-height: 1;
  color: rgba(255,255,255,.06); font-variant-numeric: tabular-nums;
}
.pg-environmental .cross {
  position: absolute; top: 20px; right: 20px; width: 26px; height: 26px;
  opacity: 0.55; pointer-events: none;
}
.pg-environmental .cross::before, .pg-environmental .cross::after {
  content: ""; position: absolute; background: rgba(255,255,255,.45);
}
.pg-environmental .cross::before { left: 50%; top: 0; bottom: 0; width: 1px; }
.pg-environmental .cross::after { top: 50%; left: 0; right: 0; height: 1px; }
.pg-environmental .cross i {
  position: absolute; inset: 8px; border: 1px solid rgba(255,255,255,.45); border-radius: 50%;
}

/* closing CTA row */
.pg-environmental .cat-cta { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 54px; }

/* reduced motion: kill every transition/animation introduced here */
@media (prefers-reduced-motion: reduce) {
  .pg-environmental .cat-card, .pg-environmental .cat-card::before,
  .pg-environmental .shot img, .pg-environmental .rel, .pg-environmental .rel .arr {
    transition: none !important;
  }
  .pg-environmental .cat-card:hover { transform: none; }
  .pg-environmental .cat-card:hover .shot img { transform: none; }
  .pg-environmental .rel:hover .arr { transform: none; }
}
`;

/* Related service lines a project excerpt clearly points at. */
const REL = {
  aerial: { href: "/geospatial-services/aerial-surveying/", label: "Aerial Surveying" },
  monitoring: { href: "/geospatial-services/deformation-monitoring/", label: "Deformation Monitoring" },
  topographic: { href: "/geospatial-services/topographic-surveying/", label: "Topographic Surveying" },
} as const;

type RelKey = keyof typeof REL;

type Project = {
  title: string;
  excerpt: string;
  img?: string;
  alt?: string;
  rel?: RelKey;
};

/* Real listings from the underhill.ca environmental category archive. */
const PROJECTS: Project[] = [
  {
    title: "Nunavut Harbour Surveys",
    excerpt:
      "High‑resolution topographic and control surveys to support new harbour infrastructure in Resolute Bay and Grise Fiord, Nunavut.",
    rel: "topographic",
  },
  {
    title: "Dawson City Flood Mapping",
    excerpt:
      "Mapping historic flood areas and help predict where future flooding may occur in Dawson City.",
    img: "/assets/uploads/2026/02/dawson-city-river-e1770239236869-thegem-blog-justified.jpg",
    alt: "The Yukon River at Dawson City, mapped for flood forecasting",
    rel: "aerial",
  },
  {
    title: "Tay River Salmon Restoration Mapping | Faro, Yukon",
    excerpt:
      "Underhill used RTK drone mapping to model rock barriers in the Tay River, supporting salmon habitat restoration planning.",
    rel: "aerial",
  },
  {
    title: "Robert Campbell Bridge Real-Time Monitoring",
    excerpt:
      "Underhill deployed tilt sensors and survey prisms to monitor bridge stability during 2021 Yukon floods—no movement was detected.",
    img: "/assets/uploads/2025/05/Underhill-Robert-Campbell-Bridge-Whitehorse-1-1-thegem-blog-justified.webp",
    alt: "The Robert Campbell Bridge in Whitehorse during monitoring",
    rel: "monitoring",
  },
];

export default function Environmental() {
  useDocumentMeta(
    "Environmental Surveying Projects | Underhill Geomatics",
    "See how our land surveys support environmental projects like restoration, permitting, and long-term land monitoring."
  );

  return (
    <main id="main" className="pg-environmental">
      <style>{CSS}</style>

      <PageHero
        image="/assets/uploads/2025/08/Black-tusk.jpg"
        title="Environmental Surveying Projects"
        eyebrow="Project Archive"
        lead="See how our land surveys support environmental projects like restoration, permitting, and long-term land monitoring."
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Projects", href: "/land-surveying-projects/" },
        ]}
      />

      <section className="section" aria-labelledby="cat-intro">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Category Focus</span>
            <h2 id="cat-intro">Environmental</h2>
            <p className="lead">
              Our teams conduct environmental land surveys that support land
              restoration, ecological monitoring, and permitting across varied
              landscapes.
            </p>
          </div>

          <div className="listing-meta reveal" aria-hidden="true">
            <span>
              <span className="n">{PROJECTS.length}</span> Projects
            </span>
            <span>Underhill Project Archive · Environmental</span>
          </div>

          <div className="cat-grid">
            {PROJECTS.map((p, i) => {
              const num = String(i + 1).padStart(2, "0");
              const rel = p.rel ? REL[p.rel] : null;
              return (
                <div
                  className="reveal"
                  key={p.title}
                  style={{ transitionDelay: `${(i % 3) * 90}ms` }}
                >
                  <article className={p.img ? "cat-card" : "cat-card typo"}>
                    {p.img ? (
                      <div className="shot">
                        <img src={p.img} alt={p.alt ?? ""} loading="lazy" />
                        <span className="idx" aria-hidden="true">{num}</span>
                      </div>
                    ) : (
                      <>
                        <span className="cross" aria-hidden="true">
                          <i />
                        </span>
                        <span className="ghost" aria-hidden="true">
                          {num}
                        </span>
                      </>
                    )}
                    <div className="body">
                      {!p.img && <span className="tnum">File No. {num}</span>}
                      <h3>{p.title}</h3>
                      <p>{p.excerpt}</p>
                      {rel && (
                        <SmartLink className="rel" to={rel.href}>
                          {rel.label}{" "}
                          <span className="arr" aria-hidden="true">
                            →
                          </span>
                        </SmartLink>
                      )}
                    </div>
                  </article>
                </div>
              );
            })}
          </div>

          <div className="cat-cta reveal">
            <SmartLink className="btn navy" to="/land-surveying-projects/">
              All Project Categories
            </SmartLink>
            <SmartLink className="btn" to="#lets-talk">
              Request a Consultation
            </SmartLink>
          </div>
        </div>
      </section>

      <CtaBand />
    </main>
  );
}
