import PageHero from "../../components/PageHero";
import CtaBand from "../../components/CtaBand";
import SmartLink from "../../components/SmartLink";
import useDocumentMeta from "../../hooks/useDocumentMeta";

/* ---------------------------------------------------------------------------
   Category archive — Mining. Editorial ledger layout: a numbered,
   hairline-separated list of real projects from the underhill.ca archive.
   Page-scoped styles live here, namespaced under `.pg-mining`.
   Every animation is transform/opacity only and is disabled under
   prefers-reduced-motion — GPU-cheap by contract. No WebGL, no video.
--------------------------------------------------------------------------- */
const CSS = `
.pg-mining .cat-meta {
  display: flex; flex-wrap: wrap; gap: 12px; margin-top: 30px;
}
.pg-mining .cat-chip {
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.18em; text-transform: uppercase; color: var(--navy);
  border: 1px solid var(--grey-100); border-left: 3px solid var(--blue);
  padding: 9px 14px; background: var(--white);
}

/* ---------- editorial project ledger ---------- */
.pg-mining .cat-list { margin-top: 60px; }
.pg-mining .cat-item {
  position: relative;
  display: grid; grid-template-columns: 72px minmax(0, 300px) 1fr;
  gap: 34px; align-items: center;
  padding: 38px 0;
  border-bottom: 1px solid var(--grey-100);
}
.pg-mining .cat-item:first-child { border-top: 1px solid var(--grey-100); }
.pg-mining .cat-idx {
  font-family: var(--font-head); font-weight: 700; font-size: 14px;
  letter-spacing: 0.22em; color: var(--grey-600);
  font-variant-numeric: tabular-nums;
}
.pg-mining .cat-idx::after {
  content: ""; display: block; width: 26px; height: 2px;
  background: var(--lime); margin-top: 12px;
  transition: width 0.35s var(--ease);
}
.pg-mining .cat-item:hover .cat-idx::after { width: 44px; }

.pg-mining .cat-thumb {
  position: relative; aspect-ratio: 16 / 10; overflow: hidden;
  background: var(--grey-050); border: 1px solid var(--grey-100);
}
.pg-mining .cat-thumb img {
  width: 100%; height: 100%; object-fit: cover; display: block;
  transition: transform 0.6s var(--ease);
}
.pg-mining .cat-item:hover .cat-thumb img { transform: scale(1.05); }

/* typographic fallback card — number inside a crosshair motif, pure CSS */
.pg-mining .cat-thumb.typo { display: flex; background: var(--navy); }
.pg-mining .cat-thumb.typo::before,
.pg-mining .cat-thumb.typo::after {
  content: ""; position: absolute; background: rgba(255, 255, 255, 0.2);
}
.pg-mining .cat-thumb.typo::before { left: 0; right: 0; top: 50%; height: 1px; }
.pg-mining .cat-thumb.typo::after { top: 0; bottom: 0; left: 50%; width: 1px; }
.pg-mining .cat-thumb .tnum {
  position: relative; z-index: 1;
  width: 58px; height: 58px; margin: auto;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.42); border-radius: 50%;
  font-family: var(--font-head); font-weight: 700; font-size: 15px;
  letter-spacing: 0.12em; color: var(--white);
  font-variant-numeric: tabular-nums;
}
.pg-mining .cat-thumb .tick {
  position: absolute; left: 10px; bottom: 10px; z-index: 1;
  width: 8px; height: 8px; background: var(--lime);
}

.pg-mining .cat-body h3 {
  color: var(--navy); font-size: 21px; margin: 0 0 10px;
}
.pg-mining .cat-body p {
  font-size: 15px; color: var(--grey-600); margin: 0; max-width: 64ch;
}
.pg-mining .cat-tag {
  margin-top: 16px; display: inline-flex; align-items: center; gap: 9px;
  font-family: var(--font-head); font-weight: 600; font-size: 12px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--blue);
  transition: color 0.25s var(--ease);
}
.pg-mining .cat-tag .arr { transition: transform 0.3s var(--ease); }
.pg-mining .cat-tag:hover { color: var(--navy); }
.pg-mining .cat-tag:hover .arr { transform: translateX(5px); }
.pg-mining .cat-tag:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }

/* ---------- closing CTA row ---------- */
.pg-mining .cat-cta {
  display: flex; flex-wrap: wrap; gap: 16px; align-items: center;
  margin-top: 58px;
}

@media (max-width: 940px) {
  .pg-mining .cat-item { grid-template-columns: 52px 1fr; }
  .pg-mining .cat-thumb { grid-column: 2; max-width: 460px; }
  .pg-mining .cat-body { grid-column: 2; }
}
@media (max-width: 560px) {
  .pg-mining .cat-item { grid-template-columns: 1fr; gap: 20px; }
  .pg-mining .cat-thumb, .pg-mining .cat-body { grid-column: 1; }
  .pg-mining .cat-idx::after { margin-top: 8px; }
}

/* ---------- reduced motion: kill every transition introduced here ---------- */
@media (prefers-reduced-motion: reduce) {
  .pg-mining .cat-thumb img, .pg-mining .cat-idx::after,
  .pg-mining .cat-tag, .pg-mining .cat-tag .arr {
    transition: none !important;
  }
  .pg-mining .cat-item:hover .cat-thumb img { transform: none; }
  .pg-mining .cat-item:hover .cat-idx::after { width: 26px; }
  .pg-mining .cat-tag:hover .arr { transform: none; }
}
`;

type ServiceRef = { label: string; to: string };
type Project = {
  title: string;
  excerpt?: string;
  img?: string;
  alt?: string;
  service?: ServiceRef;
};

const PROJECTS: Project[] = [
  {
    title: "Ruby Creek Mineral Lease Survey",
    excerpt:
      "Underhill conducted the first mineral lease survey using BC’s geographic cell system at Ruby Creek near Atlin.",
    img: "/assets/uploads/2025/09/ruby-creek-thegem-blog-justified.webp",
    alt: "GPS survey of the Ruby Creek mineral lease near Atlin, BC",
    service: {
      label: "Cadastral Surveying",
      to: "/geospatial-services/cadastral-surveying/",
    },
  },
  {
    title: "Minto Mine Underground & Surface Surveying",
    excerpt:
      "Underhill supported the re-opening of Minto Mine with underground and surface surveys including drill layout, CMS, volume calculations, and 3D scanning.",
    service: {
      label: "3D Laser Scanning & Reality Capture",
      to: "/geospatial-services/3d-laser-scanning-reality-capture/",
    },
  },
  {
    title: "Eagle Gold Mine Construction Surveying",
    excerpt:
      "Underhill provided multi-year surveying, CAD, and UAV support during the construction of Eagle Gold Mine, in partnership with Nacho Nyak Dun.",
    img: "/assets/uploads/2025/06/Underhill-truck-with-Eagle-Pit-in-the-background.-UAV-flight.-July-2019-2-thegem-blog-justified.webp",
    alt: "Underhill field truck during a UAV flight with the Eagle Gold pit in the background, July 2019",
    service: {
      label: "Construction & Engineering Surveys",
      to: "/geospatial-services/construction-surveying/",
    },
  },
];

export default function Mining() {
  useDocumentMeta(
    "Mining Surveying Projects - Underhill Geomatics",
    "Explore our mining surveys—from exploration and extraction to volumetrics and site reclamation across Canada."
  );

  return (
    <main id="main" className="pg-mining">
      <style>{CSS}</style>

      <PageHero
        image="/assets/uploads/2025/09/ruby-creek-thegem-blog-justified.webp"
        title="Mining Surveying Projects"
        eyebrow="Project Category"
        subtitle="Exploration · Extraction · Volumetrics · Reclamation"
        lead="Explore our mining surveys—from exploration and extraction to volumetrics and site reclamation across Canada."
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Projects", href: "/land-surveying-projects/" },
        ]}
      />

      {/* Category intro — sourced from the land-surveying-projects page */}
      <section className="section" aria-labelledby="mining-intro">
        <div className="container">
          <div className="reveal" style={{ maxWidth: 820 }}>
            <span className="kicker">The Category</span>
            <h2 id="mining-intro">Surface and Subsurface Operations</h2>
            <p className="lead">
              We provide mining-focused land surveying, including topographic
              and volumetric surveys, site control, and 3D data for surface and
              subsurface operations.
            </p>
            <div className="cat-meta" aria-label="Category facts">
              <span className="cat-chip">{PROJECTS.length} Archive Projects</span>
              <span className="cat-chip">BC · Yukon</span>
              <span className="cat-chip">Since 1913</span>
            </div>
          </div>

          {/* Project ledger — real archive listings, no links (detail posts unported) */}
          <div className="cat-list">
            {PROJECTS.map((p, i) => {
              const num = String(i + 1).padStart(2, "0");
              return (
                <article
                  className="cat-item reveal"
                  key={p.title}
                  style={{ transitionDelay: `${(i % 3) * 0.07}s` }}
                >
                  <span className="cat-idx" aria-hidden="true">
                    {num}
                  </span>
                  {p.img ? (
                    <div className="cat-thumb">
                      <img src={p.img} alt={p.alt ?? ""} loading="lazy" />
                    </div>
                  ) : (
                    <div className="cat-thumb typo" aria-hidden="true">
                      <span className="tnum">{num}</span>
                      <span className="tick" />
                    </div>
                  )}
                  <div className="cat-body">
                    <h3>{p.title}</h3>
                    {p.excerpt ? <p>{p.excerpt}</p> : null}
                    {p.service ? (
                      <SmartLink className="cat-tag" to={p.service.to}>
                        Related: {p.service.label}
                        <span className="arr" aria-hidden="true">
                          →
                        </span>
                      </SmartLink>
                    ) : null}
                  </div>
                </article>
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
