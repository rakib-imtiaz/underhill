import PageHero from "../../components/PageHero";
import CtaBand from "../../components/CtaBand";
import SmartLink from "../../components/SmartLink";
import useDocumentMeta from "../../hooks/useDocumentMeta";

/* ---------------------------------------------------------------------------
   Page-scoped styles, namespaced under `.pg-construction`.
   Editorial listing grid: image cards for projects with a verified capture,
   navy typographic cards (file number + crosshair motif) for the rest.
   Cards are <article>s — project detail posts are not part of this port.
   Every animation is transform/opacity only and disabled under
   prefers-reduced-motion — GPU-cheap by contract.
--------------------------------------------------------------------------- */
const CSS = `
.pg-construction .sec-head { max-width: 760px; }

/* archive meta strip above the grid */
.pg-construction .listing-meta {
  display: flex; align-items: baseline; justify-content: space-between; gap: 16px;
  flex-wrap: wrap;
  margin-top: 54px; padding-bottom: 18px;
  border-bottom: 1px solid var(--grey-100);
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.18em; text-transform: uppercase; color: var(--grey-600);
}
.pg-construction .listing-meta .n { color: var(--blue); }

/* listing grid */
.pg-construction .cat-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 34px;
}
@media (max-width: 1100px) { .pg-construction .cat-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 620px) { .pg-construction .cat-grid { grid-template-columns: 1fr; } }
.pg-construction .cat-grid > .reveal { display: flex; }
.pg-construction .cat-card {
  position: relative; display: flex; flex-direction: column; flex: 1;
  background: var(--white); box-shadow: 0 10px 40px rgba(18,26,38,.08); overflow: hidden;
  transition: transform 0.35s var(--ease), box-shadow 0.35s var(--ease);
}
.pg-construction .cat-card:hover { transform: translateY(-6px); box-shadow: 0 26px 54px rgba(18,26,38,.16); }
.pg-construction .cat-card::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px; z-index: 2;
  background: linear-gradient(90deg, var(--blue), var(--lime));
  transform: scaleX(0); transform-origin: left;
  transition: transform 0.45s var(--ease);
}
.pg-construction .cat-card:hover::before { transform: scaleX(1); }

/* image card */
.pg-construction .shot { position: relative; aspect-ratio: 16 / 10; overflow: hidden; }
.pg-construction .shot img {
  width: 100%; height: 100%; object-fit: cover;
  transition: transform 0.6s var(--ease);
}
.pg-construction .cat-card:hover .shot img { transform: scale(1.05); }
.pg-construction .shot::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(60,57,80,.04), rgba(60,57,80,.5) 96%);
}
.pg-construction .idx {
  position: absolute; top: 14px; left: 16px; z-index: 2;
  font-family: var(--font-head); font-size: 12px; font-weight: 600;
  letter-spacing: 0.2em; color: var(--white);
  background: rgba(60,57,80,.72); padding: 5px 10px; border-left: 2px solid var(--lime);
}
.pg-construction .body {
  position: relative; padding: 24px 26px 26px;
  display: flex; flex-direction: column; flex: 1;
}
.pg-construction .body h3 { color: var(--navy); font-size: 19px; margin: 0 0 10px; }
.pg-construction .body p { font-size: 14.5px; color: var(--grey-600); margin: 0; flex: 1; }

/* related service link — the only link on a card */
.pg-construction .rel {
  margin-top: 18px; font-family: var(--font-head); font-weight: 600; font-size: 12px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--blue);
  display: inline-flex; align-items: center; gap: 9px; align-self: flex-start;
  transition: color 0.25s var(--ease);
}
.pg-construction .rel .arr { transition: transform 0.3s var(--ease); }
.pg-construction .rel:hover { color: var(--navy); }
.pg-construction .rel:hover .arr { transform: translateX(6px); }

/* typographic card — no usable image in the capture */
.pg-construction .typo { background: var(--navy); }
.pg-construction .typo .body h3 { color: var(--white); }
.pg-construction .typo .body p { color: rgba(255,255,255,.72); }
.pg-construction .typo .rel { color: var(--lime); }
.pg-construction .typo .rel:hover { color: var(--white); }
.pg-construction .tnum {
  display: block; margin-bottom: 14px;
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.22em; text-transform: uppercase; color: var(--lime);
}
.pg-construction .ghost {
  position: absolute; right: 14px; bottom: -16px; pointer-events: none;
  font-family: var(--font-head); font-weight: 700; font-size: 130px; line-height: 1;
  color: rgba(255,255,255,.06); font-variant-numeric: tabular-nums;
}
.pg-construction .cross {
  position: absolute; top: 20px; right: 20px; width: 26px; height: 26px;
  opacity: 0.55; pointer-events: none;
}
.pg-construction .cross::before, .pg-construction .cross::after {
  content: ""; position: absolute; background: rgba(255,255,255,.45);
}
.pg-construction .cross::before { left: 50%; top: 0; bottom: 0; width: 1px; }
.pg-construction .cross::after { top: 50%; left: 0; right: 0; height: 1px; }
.pg-construction .cross i {
  position: absolute; inset: 8px; border: 1px solid rgba(255,255,255,.45); border-radius: 50%;
}

/* closing CTA row */
.pg-construction .cat-cta { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 54px; }

/* reduced motion: kill every transition/animation introduced here */
@media (prefers-reduced-motion: reduce) {
  .pg-construction .cat-card, .pg-construction .cat-card::before,
  .pg-construction .shot img, .pg-construction .rel, .pg-construction .rel .arr {
    transition: none !important;
  }
  .pg-construction .cat-card:hover { transform: none; }
  .pg-construction .cat-card:hover .shot img { transform: none; }
  .pg-construction .rel:hover .arr { transform: none; }
}
`;

/* Related service lines a project excerpt clearly points at. */
const REL = {
  construction: { href: "/geospatial-services/construction-surveying/", label: "Construction & Engineering Surveys" },
  aerial: { href: "/geospatial-services/aerial-surveying/", label: "Aerial Surveying" },
  railway: { href: "/geospatial-services/railway-surveying/", label: "Railway Surveying" },
  monitoring: { href: "/geospatial-services/deformation-monitoring/", label: "Deformation Monitoring" },
  topographic: { href: "/geospatial-services/topographic-surveying/", label: "Topographic Surveying" },
  scanning: { href: "/geospatial-services/3d-laser-scanning-reality-capture/", label: "Laser Scanning" },
  boma: { href: "/geospatial-services/boma-surveying/", label: "BOMA & Lease Surveys" },
} as const;

type RelKey = keyof typeof REL;

type Project = {
  title: string;
  excerpt: string;
  img?: string;
  alt?: string;
  rel?: RelKey;
};

/* Real listings from the underhill.ca construction category archive.
   Excerpts marked (†) restate the title only — the source listing carried
   no excerpt. */
const PROJECTS: Project[] = [
  {
    title: "Fraser River Tunnel Project",
    excerpt:
      "Underhill Geomatics is supporting the Fraser River Tunnel Project through topographic surveys, construction layout, as-built surveys, and monitoring services, helping advance one of British Columbia’s most significant transportation infrastructure projects.",
    img: "/assets/uploads/2026/07/Highway99-Tunnel-2-thegem-blog-justified.jpg",
    alt: "Tunnel works on the Fraser River Tunnel Project corridor",
    rel: "construction",
  },
  {
    title: "Burnaby Hospital Redevelopment Project",
    excerpt:
      "Provided survey control, construction layout, LiDAR scanning, and legal surveying services for Phase 1 of the Burnaby Hospital Redevelopment Project.",
    img: "/assets/uploads/2026/07/Burnaby-Hospital-Redevelopment-Project-1-thegem-blog-justified.jpg",
    alt: "Burnaby Hospital Redevelopment Project site",
    rel: "construction",
  },
  {
    title: "Langford Heights Business Park",
    excerpt:
      "Transforming the former Western Speedway site, Langford Heights Business Park is a major mixed-use development in Langford, BC. Underhill Geomatics provided legal, environmental, UAV LiDAR, and construction surveying services to support subdivision planning, infrastructure design, and ongoing construction.",
    img: "/assets/uploads/2026/07/langford-business-park-1-thegem-blog-justified.jpg",
    alt: "Langford Heights Business Park development in Langford, BC",
    rel: "aerial",
  },
  {
    title: "Broadway Subway Project",
    excerpt:
      "Underhill Geomatics supported PNR RailWorks on the Broadway Subway Project, delivering millimetre-level rail alignment surveys for this major Millennium Line extension—helping ensure precise, efficient installation of critical transit infrastructure.",
    img: "/assets/uploads/2026/06/broadway-subway-project-2-thegem-blog-justified.jpg",
    alt: "Rail alignment works on the Broadway Subway Project",
    rel: "railway",
  },
  {
    title: "Site C Hydroelectric Dam – High Precision Monitoring",
    excerpt:
      "Comprehensive aerial inspections and photogrammetric analysis of winter spillway gate operations.",
    img: "/assets/uploads/2026/05/DJI_20250618025441_0030_W-scaled-thegem-blog-justified.jpg",
    alt: "Aerial inspection over the Site C hydroelectric dam",
    rel: "monitoring",
  },
  {
    title: "Nunavut Harbour Surveys",
    excerpt:
      "High‑resolution topographic and control surveys to support new harbour infrastructure in Resolute Bay and Grise Fiord, Nunavut.",
    rel: "topographic",
  },
  {
    title: "Site C Hydroelectric Dam – Slope Monitoring",
    excerpt:
      "Comprehensive aerial inspections and photogrammetric analysis of winter spillway gate operations.",
    img: "/assets/uploads/2026/02/DSC_9472-thegem-blog-justified.webp",
    alt: "Slope monitoring survey at the Site C hydroelectric dam",
    rel: "monitoring",
  },
  {
    title: "Site C Hydroelectric Dam – Large Scale UAV Mapping/Processing Program",
    excerpt:
      "Comprehensive aerial inspections and photogrammetric analysis of winter spillway gate operations.",
    img: "/assets/uploads/2026/02/droneshot-thegem-blog-justified.jpg",
    alt: "UAV mapping flight over the Site C hydroelectric dam site",
    rel: "aerial",
  },
  {
    title: "Erik Nielsen Whitehorse International Airport Improvements",
    excerpt:
      "Runway and infrastructure improvements to The Erik Nielsen Whitehorse International Airport from 2023 – 2025.",
    img: "/assets/uploads/2025/11/overheadview-thegem-blog-justified.webp",
    alt: "Overhead view of runway improvement works in Whitehorse",
    rel: "construction",
  },
  {
    title: "Science World Seismic Upgrade",
    excerpt:
      "Underhill provided 3D scanning and surveying for Science World’s 2006 seismic upgrade—over 200 core holes drilled into deck over False Creek.",
    img: "/assets/uploads/2025/08/Science-World-3D-Laser-Scan.jpg.jpg",
    alt: "3D laser scanning at Science World in Vancouver",
    rel: "scanning",
  },
  {
    title: "Vancouver General Hospital Redevelopment",
    excerpt: "Surveying services for the Vancouver General Hospital redevelopment.", // †
  },
  {
    title: "King Edward Village",
    excerpt:
      "Underhill provided full surveying services for King Edward Village, including strata plans, lease surveys, and construction layout.",
    img: "/assets/uploads/2025/09/King-Edward-Underhill-04-thegem-blog-justified.jpg",
    alt: "King Edward Village development in Vancouver",
    rel: "boma",
  },
  {
    title: "CBC Building Redevelopment",
    excerpt:
      "Surveying support for the redevelopment of the CBC building in Vancouver.", // †
    img: "/assets/uploads/2025/08/IMG_0254.jpg",
    alt: "CBC building redevelopment site in Vancouver",
  },
  {
    title: "Surveying the Village on False Creek",
    excerpt:
      "Underhill supported Olympic Village construction with topographic, legal, and air space surveys for this Vancouver legacy development.",
    img: "/assets/uploads/2025/08/olympicvillage.jpg",
    alt: "The Village on False Creek Olympic legacy development",
    rel: "topographic",
  },
  {
    title: "Vancouver–Whistler 2010 Winter Olympics",
    excerpt:
      "Underhill supported Olympic infrastructure with surveying for venues, transportation, and GPS positioning from Hope to Whistler.",
  },
  {
    title: "Lord Strathcona Elementary School 3D Laser Scanning",
    excerpt:
      "Underhill scanned four heritage buildings at Vancouver’s oldest school, delivering 2D elevations and a 3D Webshare model for design use.",
    rel: "scanning",
  },
  {
    title: "BC Place Roof Replacement Surveying",
    excerpt:
      "Underhill provided surveying and 3D scanning for BC Place’s retractable roof—the largest cable-supported stadium roof in the world.",
    img: "/assets/uploads/2025/08/BC-Place-Roof-Measuring-2011.jpg.jpg",
    alt: "Measuring works during the BC Place roof replacement, 2011",
    rel: "scanning",
  },
  {
    title: "River’s Reach II Condo Development",
    excerpt:
      "Underhill supported Northern Vision’s condo development with ground surveys, utility locates, layout, and legal registration from 2017 to 2019.",
    rel: "construction",
  },
  {
    title: "Nares River Bridge Construction Surveying",
    excerpt:
      "Underhill provided full surveying services for the new Nares River Bridge in Carcross, Yukon—supporting topographic, pillar, and girder layout.",
    img: "/assets/uploads/2025/05/Bridge-1-thegem-blog-justified.webp",
    alt: "Nares River Bridge construction in Carcross, Yukon",
    rel: "construction",
  },
  {
    title: "Whistle Bend Continuing Care Facility Surveying",
    excerpt:
      "Underhill supported PCL with complete surveying services for a $150M continuing care facility in Whitehorse, from site prep to final layout.",
    img: "/assets/uploads/2025/05/WhistleBend-08-thegem-blog-justified.webp",
    alt: "Whistle Bend continuing care facility under construction in Whitehorse",
    rel: "construction",
  },
  {
    title: "Neptune Bulk Terminals Surveying & Infrastructure Support",
    excerpt:
      "Since 2005, Underhill has supported Neptune Bulk Terminals with 3D scanning, rail alignment, and construction layout for major export operations.",
    rel: "railway",
  },
  {
    title: "Westshore Terminals Surveying & Infrastructure Support",
    excerpt:
      "Long-term surveying and infrastructure support for Westshore Terminals.", // †
  },
  {
    title: "North Vancouver School District Surveying & 3D Scanning",
    excerpt:
      "Underhill has surveyed North Vancouver’s school sites for over 50 years, using 3D scanning and legal surveys to support design and preservation.",
    img: "/assets/uploads/2025/05/Copy-of-DSCF1858-thegem-blog-justified.webp",
    alt: "Surveying a North Vancouver school site",
    rel: "scanning",
  },
  {
    title: "Deloitte Summit Surveying & 3D Laser Scanning",
    excerpt:
      "Underhill supported the Deloitte Summit tower with deformation monitoring, laser scanning, and full-service construction surveying from excavation to finish.",
    img: "/assets/uploads/2020/01/Underhill-400W-Georgia-14-1-thegem-blog-justified.webp",
    alt: "The Deloitte Summit tower at 400 West Georgia, Vancouver",
    rel: "monitoring",
  },
  {
    title: "Brookside Multi-Phase Housing Development Surveying",
    excerpt:
      "Underhill provided full-cycle survey support for the Brookside housing development—118 units and 6 lots—across all phases from 2011 to 2020.",
    img: "/assets/uploads/2011/01/Brookside-Development-7-thegem-blog-justified.webp",
    alt: "Brookside housing development under construction",
    rel: "construction",
  },
  {
    title: "DP World Centerm Terminal Surveying & Expansion Support",
    excerpt:
      "Underhill supported Centerm container port upgrades over four decades, providing legal, construction, and crane alignment surveys.",
    img: "/assets/uploads/2025/05/DP-World-Centerm-Underhill-07-thegem-blog-justified.webp",
    alt: "DP World Centerm container terminal in Vancouver",
    rel: "construction",
  },
  {
    title: "Pattullo Bridge Replacement Hydraulic Model Surveying",
    excerpt:
      "Underhill used 3D laser scanning to monitor riverbed changes in a hydraulic scale model supporting the Pattullo Bridge replacement project.",
    img: "/assets/uploads/2025/09/Underhill-Patullo-thegem-blog-justified.jpg",
    alt: "Hydraulic scale model survey for the Pattullo Bridge replacement",
    rel: "scanning",
  },
];

export default function Construction() {
  useDocumentMeta(
    "Construction Surveying Projects | Underhill Geomatics",
    "Discover our construction land surveying work for commercial, residential, and infrastructure developments across Canada."
  );

  return (
    <main id="main" className="pg-construction">
      <style>{CSS}</style>

      <PageHero
        image="/assets/uploads/2026/07/Burnaby-Hospital-Redevelopment-Project-1-thegem-blog-justified.jpg"
        title="Construction Surveying Projects"
        eyebrow="Project Archive"
        lead="Discover our construction land surveying work for commercial, residential, and infrastructure developments across Canada."
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Projects", href: "/land-surveying-projects/" },
        ]}
      />

      <section className="section" aria-labelledby="cat-intro">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Category Focus</span>
            <h2 id="cat-intro">Construction</h2>
            <p className="lead">
              From residential towers to commercial developments, we support
              builders with construction layout, control surveys, and phase
              documentation.
            </p>
          </div>

          <div className="listing-meta reveal" aria-hidden="true">
            <span>
              <span className="n">{PROJECTS.length}</span> Projects
            </span>
            <span>Underhill Project Archive · Construction</span>
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
