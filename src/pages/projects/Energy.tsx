import PageHero from "../../components/PageHero";
import CtaBand from "../../components/CtaBand";
import SmartLink from "../../components/SmartLink";
import useDocumentMeta from "../../hooks/useDocumentMeta";

/* ---------------------------------------------------------------------------
   Category archive — Energy. Editorial ledger layout: a numbered,
   hairline-separated list of real projects from the underhill.ca archive.
   Page-scoped styles live here, namespaced under `.pg-energy`.
   Every animation is transform/opacity only and is disabled under
   prefers-reduced-motion — GPU-cheap by contract. No WebGL, no video.
--------------------------------------------------------------------------- */
const CSS = `
.pg-energy .cat-meta {
  display: flex; flex-wrap: wrap; gap: 12px; margin-top: 30px;
}
.pg-energy .cat-chip {
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.18em; text-transform: uppercase; color: var(--navy);
  border: 1px solid var(--grey-100); border-left: 3px solid var(--blue);
  padding: 9px 14px; background: var(--white);
}

/* ---------- editorial project ledger ---------- */
.pg-energy .cat-list { margin-top: 60px; }
.pg-energy .cat-item {
  position: relative;
  display: grid; grid-template-columns: 72px minmax(0, 300px) 1fr;
  gap: 34px; align-items: center;
  padding: 38px 0;
  border-bottom: 1px solid var(--grey-100);
}
.pg-energy .cat-item:first-child { border-top: 1px solid var(--grey-100); }
.pg-energy .cat-idx {
  font-family: var(--font-head); font-weight: 700; font-size: 14px;
  letter-spacing: 0.22em; color: var(--grey-600);
  font-variant-numeric: tabular-nums;
}
.pg-energy .cat-idx::after {
  content: ""; display: block; width: 26px; height: 2px;
  background: var(--lime); margin-top: 12px;
  transition: width 0.35s var(--ease);
}
.pg-energy .cat-item:hover .cat-idx::after { width: 44px; }

.pg-energy .cat-thumb {
  position: relative; aspect-ratio: 16 / 10; overflow: hidden;
  background: var(--grey-050); border: 1px solid var(--grey-100);
}
.pg-energy .cat-thumb img {
  width: 100%; height: 100%; object-fit: cover; display: block;
  transition: transform 0.6s var(--ease);
}
.pg-energy .cat-item:hover .cat-thumb img { transform: scale(1.05); }

/* typographic fallback card — number inside a crosshair motif, pure CSS */
.pg-energy .cat-thumb.typo { display: flex; background: var(--navy); }
.pg-energy .cat-thumb.typo::before,
.pg-energy .cat-thumb.typo::after {
  content: ""; position: absolute; background: rgba(255, 255, 255, 0.2);
}
.pg-energy .cat-thumb.typo::before { left: 0; right: 0; top: 50%; height: 1px; }
.pg-energy .cat-thumb.typo::after { top: 0; bottom: 0; left: 50%; width: 1px; }
.pg-energy .cat-thumb .tnum {
  position: relative; z-index: 1;
  width: 58px; height: 58px; margin: auto;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.42); border-radius: 50%;
  font-family: var(--font-head); font-weight: 700; font-size: 15px;
  letter-spacing: 0.12em; color: var(--white);
  font-variant-numeric: tabular-nums;
}
.pg-energy .cat-thumb .tick {
  position: absolute; left: 10px; bottom: 10px; z-index: 1;
  width: 8px; height: 8px; background: var(--lime);
}

.pg-energy .cat-body h3 {
  color: var(--navy); font-size: 21px; margin: 0 0 10px;
}
.pg-energy .cat-body p {
  font-size: 15px; color: var(--grey-600); margin: 0; max-width: 64ch;
}
.pg-energy .cat-tag {
  margin-top: 16px; display: inline-flex; align-items: center; gap: 9px;
  font-family: var(--font-head); font-weight: 600; font-size: 12px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--blue);
  transition: color 0.25s var(--ease);
}
.pg-energy .cat-tag .arr { transition: transform 0.3s var(--ease); }
.pg-energy .cat-tag:hover { color: var(--navy); }
.pg-energy .cat-tag:hover .arr { transform: translateX(5px); }
.pg-energy .cat-tag:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }

/* ---------- closing CTA row ---------- */
.pg-energy .cat-cta {
  display: flex; flex-wrap: wrap; gap: 16px; align-items: center;
  margin-top: 58px;
}

@media (max-width: 940px) {
  .pg-energy .cat-item { grid-template-columns: 52px 1fr; }
  .pg-energy .cat-thumb { grid-column: 2; max-width: 460px; }
  .pg-energy .cat-body { grid-column: 2; }
}
@media (max-width: 560px) {
  .pg-energy .cat-item { grid-template-columns: 1fr; gap: 20px; }
  .pg-energy .cat-thumb, .pg-energy .cat-body { grid-column: 1; }
  .pg-energy .cat-idx::after { margin-top: 8px; }
}

/* ---------- reduced motion: kill every transition introduced here ---------- */
@media (prefers-reduced-motion: reduce) {
  .pg-energy .cat-thumb img, .pg-energy .cat-idx::after,
  .pg-energy .cat-tag, .pg-energy .cat-tag .arr {
    transition: none !important;
  }
  .pg-energy .cat-item:hover .cat-thumb img { transform: none; }
  .pg-energy .cat-item:hover .cat-idx::after { width: 26px; }
  .pg-energy .cat-tag:hover .arr { transform: none; }
}
`;

type ServiceRef = { label: string; to: string };
type Project = {
  title: string;
  excerpt: string;
  img: string;
  alt: string;
  service: ServiceRef;
};

const PROJECTS: Project[] = [
  {
    title: "Site C Hydroelectric Dam – High Precision Monitoring",
    excerpt:
      "Comprehensive aerial inspections and photogrammetric analysis of winter spillway gate operations",
    img: "/assets/uploads/2026/05/DJI_20250618025441_0030_W-scaled-thegem-blog-justified.jpg",
    alt: "Aerial view of the Site C Hydroelectric Dam",
    service: {
      label: "Deformation Monitoring",
      to: "/geospatial-services/deformation-monitoring/",
    },
  },
  {
    title: "Site C Hydroelectric Dam – Slope Monitoring",
    excerpt:
      "Comprehensive aerial inspections and photogrammetric analysis of winter spillway gate operations",
    img: "/assets/uploads/2026/02/DSC_9472-thegem-blog-justified.webp",
    alt: "Slope monitoring scene at the Site C Hydroelectric Dam",
    service: {
      label: "Deformation Monitoring",
      to: "/geospatial-services/deformation-monitoring/",
    },
  },
  {
    title: "Site C Hydroelectric Dam – Large Scale UAV Mapping/Processing Program",
    excerpt:
      "Comprehensive aerial inspections and photogrammetric analysis of winter spillway gate operations",
    img: "/assets/uploads/2026/02/droneshot-thegem-blog-justified.jpg",
    alt: "UAV mapping over the Site C Hydroelectric Dam site",
    service: {
      label: "Aerial Surveying",
      to: "/geospatial-services/aerial-surveying/",
    },
  },
  {
    title: "Peace Canyon Water Spillway Monitoring",
    excerpt:
      "Comprehensive aerial inspections and photogrammetric analysis of winter spillway gate operations",
    img: "/assets/uploads/2026/02/PCN-Spillway-Thermography-thegem-blog-justified.webp",
    alt: "Thermal imagery of Peace Canyon dam winter spillway monitoring",
    service: {
      label: "Deformation Monitoring",
      to: "/geospatial-services/deformation-monitoring/",
    },
  },
  {
    title: "Parkland Burnaby Refinery Surveying & 3D Laser Scanning",
    excerpt:
      "Underhill has supported Parkland’s Burnaby Refinery since 1996 with layout surveys and 3D scanning for expansion and upgrade projects.",
    img: "/assets/uploads/2025/09/parkland-refinery_underhill-thegem-blog-justified.jpg",
    alt: "Parkland Burnaby refinery surveying and 3D laser scanning",
    service: {
      label: "3D Laser Scanning & Reality Capture",
      to: "/geospatial-services/3d-laser-scanning-reality-capture/",
    },
  },
];

export default function Energy() {
  useDocumentMeta(
    "Oil and Gas Surveying Projects - Underhill Geomatics",
    "We support Western and Northern Canada’s energy sector with pipeline surveys, hydroelectric infrastructure and facility site documentation."
  );

  return (
    <main id="main" className="pg-energy">
      <style>{CSS}</style>

      <PageHero
        image="/assets/uploads/2026/05/DJI_20250618025441_0030_W-scaled-thegem-blog-justified.jpg"
        title="Energy Surveying Projects"
        eyebrow="Project Category"
        subtitle="Pipelines · Hydroelectric · Facility Sites"
        lead="We support Western and Northern Canada’s energy sector with pipeline surveys, hydroelectric infrastructure and facility site documentation."
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Projects", href: "/land-surveying-projects/" },
        ]}
      />

      {/* Category intro — sourced from the land-surveying-projects page */}
      <section className="section" aria-labelledby="energy-intro">
        <div className="container">
          <div className="reveal" style={{ maxWidth: 820 }}>
            <span className="kicker">The Category</span>
            <h2 id="energy-intro">From Dams and Wind Farms to Oil and Gas</h2>
            <p className="lead">
              We have a strong track record providing surveying services for
              energy‑related projects – ranging from dams and wind farms to oil
              and gas infrastructure across Western and Northern Canada.
            </p>
            <div className="cat-meta" aria-label="Category facts">
              <span className="cat-chip">{PROJECTS.length} Archive Projects</span>
              <span className="cat-chip">Western &amp; Northern Canada</span>
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
                  <div className="cat-thumb">
                    <img src={p.img} alt={p.alt} loading="lazy" />
                  </div>
                  <div className="cat-body">
                    <h3>{p.title}</h3>
                    <p>{p.excerpt}</p>
                    <SmartLink className="cat-tag" to={p.service.to}>
                      Related: {p.service.label}
                      <span className="arr" aria-hidden="true">
                        →
                      </span>
                    </SmartLink>
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
