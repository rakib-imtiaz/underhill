import PageHero from "../../components/PageHero";
import CtaBand from "../../components/CtaBand";
import SmartLink from "../../components/SmartLink";
import useDocumentMeta from "../../hooks/useDocumentMeta";

/* ---------------------------------------------------------------------------
   Category archive — Infrastructure. Editorial ledger layout: a numbered,
   hairline-separated list of real projects from the underhill.ca archive.
   Page-scoped styles live here, namespaced under `.pg-infra`.
   Every animation is transform/opacity only and is disabled under
   prefers-reduced-motion — GPU-cheap by contract. No WebGL, no video.
--------------------------------------------------------------------------- */
const CSS = `
.pg-infra .cat-meta {
  display: flex; flex-wrap: wrap; gap: 12px; margin-top: 30px;
}
.pg-infra .cat-chip {
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.18em; text-transform: uppercase; color: var(--navy);
  border: 1px solid var(--grey-100); border-left: 3px solid var(--blue);
  padding: 9px 14px; background: var(--white);
}

/* ---------- editorial project ledger ---------- */
.pg-infra .cat-list { margin-top: 60px; }
.pg-infra .cat-item {
  position: relative;
  display: grid; grid-template-columns: 72px minmax(0, 300px) 1fr;
  gap: 34px; align-items: center;
  padding: 38px 0;
  border-bottom: 1px solid var(--grey-100);
}
.pg-infra .cat-item:first-child { border-top: 1px solid var(--grey-100); }
.pg-infra .cat-idx {
  font-family: var(--font-head); font-weight: 700; font-size: 14px;
  letter-spacing: 0.22em; color: var(--grey-600);
  font-variant-numeric: tabular-nums;
}
.pg-infra .cat-idx::after {
  content: ""; display: block; width: 26px; height: 2px;
  background: var(--lime); margin-top: 12px;
  transition: width 0.35s var(--ease);
}
.pg-infra .cat-item:hover .cat-idx::after { width: 44px; }

.pg-infra .cat-thumb {
  position: relative; aspect-ratio: 16 / 10; overflow: hidden;
  background: var(--grey-050); border: 1px solid var(--grey-100);
}
.pg-infra .cat-thumb img {
  width: 100%; height: 100%; object-fit: cover; display: block;
  transition: transform 0.6s var(--ease);
}
.pg-infra .cat-item:hover .cat-thumb img { transform: scale(1.05); }

/* typographic fallback card — number inside a crosshair motif, pure CSS */
.pg-infra .cat-thumb.typo { background: var(--navy); }
.pg-infra .cat-thumb.typo::before,
.pg-infra .cat-thumb.typo::after {
  content: ""; position: absolute; background: rgba(255, 255, 255, 0.2);
}
.pg-infra .cat-thumb.typo::before { left: 0; right: 0; top: 50%; height: 1px; }
.pg-infra .cat-thumb.typo::after { top: 0; bottom: 0; left: 50%; width: 1px; }
.pg-infra .cat-thumb .tnum {
  position: relative; z-index: 1;
  width: 58px; height: 58px; margin: auto;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.42); border-radius: 50%;
  font-family: var(--font-head); font-weight: 700; font-size: 15px;
  letter-spacing: 0.12em; color: var(--white);
  font-variant-numeric: tabular-nums;
}
.pg-infra .cat-thumb.typo { display: flex; }
.pg-infra .cat-thumb .tick {
  position: absolute; left: 10px; bottom: 10px; z-index: 1;
  width: 8px; height: 8px; background: var(--lime);
}

.pg-infra .cat-body h3 {
  color: var(--navy); font-size: 21px; margin: 0 0 10px;
}
.pg-infra .cat-body p {
  font-size: 15px; color: var(--grey-600); margin: 0; max-width: 64ch;
}
.pg-infra .cat-tag {
  margin-top: 16px; display: inline-flex; align-items: center; gap: 9px;
  font-family: var(--font-head); font-weight: 600; font-size: 12px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--blue);
  transition: color 0.25s var(--ease);
}
.pg-infra .cat-tag .arr { transition: transform 0.3s var(--ease); }
.pg-infra .cat-tag:hover { color: var(--navy); }
.pg-infra .cat-tag:hover .arr { transform: translateX(5px); }
.pg-infra .cat-tag:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }

/* ---------- closing CTA row ---------- */
.pg-infra .cat-cta {
  display: flex; flex-wrap: wrap; gap: 16px; align-items: center;
  margin-top: 58px;
}

@media (max-width: 940px) {
  .pg-infra .cat-item { grid-template-columns: 52px 1fr; }
  .pg-infra .cat-thumb { grid-column: 2; max-width: 460px; }
  .pg-infra .cat-body { grid-column: 2; }
}
@media (max-width: 560px) {
  .pg-infra .cat-item { grid-template-columns: 1fr; gap: 20px; }
  .pg-infra .cat-thumb, .pg-infra .cat-body { grid-column: 1; }
  .pg-infra .cat-idx::after { margin-top: 8px; }
}

/* ---------- reduced motion: kill every transition introduced here ---------- */
@media (prefers-reduced-motion: reduce) {
  .pg-infra .cat-thumb img, .pg-infra .cat-idx::after,
  .pg-infra .cat-tag, .pg-infra .cat-tag .arr {
    transition: none !important;
  }
  .pg-infra .cat-item:hover .cat-thumb img { transform: none; }
  .pg-infra .cat-item:hover .cat-idx::after { width: 26px; }
  .pg-infra .cat-tag:hover .arr { transform: none; }
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

const SVC = {
  aerial: { label: "Aerial Surveying", to: "/geospatial-services/aerial-surveying/" },
  construction: {
    label: "Construction & Engineering Surveys",
    to: "/geospatial-services/construction-surveying/",
  },
  monitoring: {
    label: "Deformation Monitoring",
    to: "/geospatial-services/deformation-monitoring/",
  },
  scanning: {
    label: "3D Laser Scanning & Reality Capture",
    to: "/geospatial-services/3d-laser-scanning-reality-capture/",
  },
  cadastral: { label: "Cadastral Surveying", to: "/geospatial-services/cadastral-surveying/" },
  topographic: {
    label: "Topographic Surveying",
    to: "/geospatial-services/topographic-surveying/",
  },
  railway: { label: "Railway Surveying", to: "/geospatial-services/railway-surveying/" },
} satisfies Record<string, ServiceRef>;

const PROJECTS: Project[] = [
  {
    title: "Fraser River Tunnel Project",
    excerpt:
      "Underhill Geomatics is supporting the Fraser River Tunnel Project through topographic surveys, construction layout, as-built surveys, and monitoring services, helping advance one of British Columbia’s most significant transportation infrastructure projects.",
    img: "/assets/uploads/2026/07/Highway99-Tunnel-2-thegem-blog-justified.jpg",
    alt: "Tunnel works on the Highway 99 Fraser River Tunnel Project",
    service: SVC.construction,
  },
  {
    title: "Burnaby Hospital Redevelopment Project",
    excerpt:
      "Provided survey control, construction layout, LiDAR scanning, and legal surveying services for Phase 1 of the Burnaby Hospital Redevelopment Project.",
    img: "/assets/uploads/2026/07/Burnaby-Hospital-Redevelopment-Project-1-thegem-blog-justified.jpg",
    alt: "Burnaby Hospital Redevelopment Project site",
    service: SVC.construction,
  },
  {
    title: "Broadway Subway Project",
    excerpt:
      "Underhill Geomatics supported PNR RailWorks on the Broadway Subway Project, delivering millimetre-level rail alignment surveys for this major Millennium Line extension—helping ensure precise, efficient installation of critical transit infrastructure.",
    img: "/assets/uploads/2026/06/broadway-subway-project-2-thegem-blog-justified.jpg",
    alt: "Broadway Subway Project corridor at sunrise",
    service: SVC.railway,
  },
  {
    title: "Nunavut Harbour Surveys",
    excerpt:
      "High‑resolution topographic and control surveys to support new harbour infrastructure in Resolute Bay and Grise Fiord, Nunavut.",
    service: SVC.topographic,
  },
  {
    title: "Dawson City Flood Mapping",
    excerpt:
      "Mapping historic flood areas and help predict where future flooding may occur in Dawson City.",
    img: "/assets/uploads/2026/02/dawson-city-river-e1770239236869-thegem-blog-justified.jpg",
    alt: "The Yukon River at Dawson City, mapped for flood risk",
    service: SVC.aerial,
  },
  {
    title: "Airport Obstacle Limitation Surveys",
    excerpt:
      "Underhill updated OLS surveys for nine Yukon airports using advanced UAV LiDAR, delivering fast, accurate 3D airspace data that meets TP 312 5th Edition standards.",
    img: "/assets/uploads/2026/03/FaroAirport-thegem-blog-justified.jpg",
    alt: "Faro Airport, one of nine Yukon airports surveyed for obstacle limitation surfaces",
    service: SVC.aerial,
  },
  {
    title: "Erik Nielsen Whitehorse International Airport Improvements",
    excerpt:
      "Runway and infrastructure improvements to The Erik Nielsen Whitehorse International Airport from 2023 – 2025.",
    img: "/assets/uploads/2025/11/overheadview-thegem-blog-justified.webp",
    alt: "Overhead view of Erik Nielsen Whitehorse International Airport",
    service: SVC.construction,
  },
  {
    title: "Parkland Burnaby Refinery Surveying & 3D Laser Scanning",
    excerpt:
      "Underhill has supported Parkland’s Burnaby Refinery since 1996 with layout surveys and 3D scanning for expansion and upgrade projects.",
    img: "/assets/uploads/2025/09/parkland-refinery_underhill-thegem-blog-justified.jpg",
    alt: "Parkland Burnaby refinery surveying and 3D laser scanning",
    service: SVC.scanning,
  },
  {
    title: "Field Data Services, Inc: Customized Software",
    excerpt:
      "From 1996–2001, Underhill’s DCB software supported FDSI in digitizing over 1.5 million poles and attachments for U.S. utilities.",
  },
  {
    title: "City of Coquitlam: Land and Utility GIS Data Conversion and Custom Software",
  },
  {
    title: "Florida Power & Light Data Conversion Project",
    excerpt:
      "Underhill helped convert over 1,000 square miles of utility data for FPL’s IBM GFIS system, delivering high-accuracy, GIS-ready results.",
  },
  {
    title: "Natural Resources Canada: GIS Cadastral Compilation",
    excerpt:
      "Underhill captured and processed GIS and cadastral data for 500+ Canada Lands parcels and over 30 communities across BC, Yukon, NWT, and Nunavut.",
    service: SVC.cadastral,
  },
  {
    title: "Science World Seismic Upgrade",
    excerpt:
      "Underhill provided 3D scanning and surveying for Science World’s 2006 seismic upgrade—over 200 core holes drilled into deck over False Creek.",
    img: "/assets/uploads/2025/08/Science-World-3D-Laser-Scan.jpg.jpg",
    alt: "3D laser scan of Science World in Vancouver",
    service: SVC.scanning,
  },
  {
    title: "Vancouver General Hospital Redevelopment",
  },
  {
    title: "North Fraser Harbour Mapping: 50 Years of Headline Control, GIS & Digital Modernization",
    excerpt:
      "Underhill led mapping, modernization, and GIS integration for North Fraser Harbour from 1958 to 2008, shaping today’s Port Metro Vancouver.",
    img: "/assets/uploads/2025/08/North-Fraser-Harbour-Commission-GIS.jpg.jpg",
    alt: "North Fraser Harbour Commission GIS mapping",
  },
  {
    title: "BC Hydro-Transmission GIS Land Base Development using COGO",
  },
  {
    title: "Canada Line Surveying: Rapid Transit Infrastructure from Vancouver to YVR",
    excerpt:
      "Underhill delivered precision surveys, laser scanning, and legal right-of-way mapping for the Canada Line rapid transit project.",
    img: "/assets/uploads/2025/09/canada-line-thegem-blog-justified.webp",
    alt: "Canada Line rapid transit tunnel in Vancouver",
    service: SVC.railway,
  },
  {
    title: "CBC Building Redevelopment",
    img: "/assets/uploads/2025/08/IMG_0254.jpg",
    alt: "CBC Building redevelopment in Vancouver",
  },
  {
    title: "Surveying the Village on False Creek",
    excerpt:
      "Underhill supported Olympic Village construction with topographic, legal, and air space surveys for this Vancouver legacy development.",
    img: "/assets/uploads/2025/08/olympicvillage.jpg",
    alt: "The Village on False Creek under construction",
    service: SVC.construction,
  },
  {
    title: "Vancouver–Whistler 2010 Winter Olympics",
    excerpt:
      "Underhill supported Olympic infrastructure with surveying for venues, transportation, and GPS positioning from Hope to Whistler.",
    service: SVC.construction,
  },
  {
    title: "BC Hydro Distribution | GIS Conversion & Field Inventory",
  },
  {
    title: "Capilano–Seymour Water Tunnel Surveying & 3D Scanning",
    service: SVC.scanning,
  },
  {
    title: "BC Rail Tumbler Ridge Branch Line Tunnel & Railway Surveying",
    excerpt:
      "Underhill delivered precision surveying for 140 km of railway, including two tunnels and 15 bridges, through BC’s Rocky Mountains.",
    img: "/assets/uploads/2025/06/BC-Rail-Underhill-15-thegem-blog-justified.webp",
    alt: "BC Rail Tumbler Ridge branch line through the Rocky Mountains",
    service: SVC.railway,
  },
  {
    title: "Robert Campbell Bridge Real-Time Monitoring",
    excerpt:
      "Underhill deployed tilt sensors and survey prisms to monitor bridge stability during 2021 Yukon floods—no movement was detected.",
    img: "/assets/uploads/2025/05/Underhill-Robert-Campbell-Bridge-Whitehorse-1-1-thegem-blog-justified.webp",
    alt: "Robert Campbell Bridge in Whitehorse during real-time monitoring",
    service: SVC.monitoring,
  },
  {
    title: "Nares River Bridge Construction Surveying",
    excerpt:
      "Underhill provided full surveying services for the new Nares River Bridge in Carcross, Yukon—supporting topographic, pillar, and girder layout.",
    img: "/assets/uploads/2025/05/Bridge-1-thegem-blog-justified.webp",
    alt: "Nares River Bridge construction in Carcross, Yukon",
    service: SVC.construction,
  },
  {
    title: "Whistle Bend Continuing Care Facility Surveying",
    excerpt:
      "Underhill supported PCL with complete surveying services for a $150M continuing care facility in Whitehorse, from site prep to final layout.",
    img: "/assets/uploads/2025/05/WhistleBend-08-thegem-blog-justified.webp",
    alt: "Whistle Bend Continuing Care Facility construction in Whitehorse",
    service: SVC.construction,
  },
  {
    title: "Neptune Bulk Terminals Surveying & Infrastructure Support",
    excerpt:
      "Since 2005, Underhill has supported Neptune Bulk Terminals with 3D scanning, rail alignment, and construction layout for major export operations.",
    service: SVC.scanning,
  },
  {
    title: "Westshore Terminals Surveying & Infrastructure Support",
  },
  {
    title: "ICIS Cadastral Data Modernization",
    excerpt:
      "Underhill upgraded cadastral accuracy across BC communities through ICIS projects, using COGO, GPS, and GIS data integration.",
    service: SVC.cadastral,
  },
  {
    title: "North Vancouver School District Surveying & 3D Scanning",
    excerpt:
      "Underhill has surveyed North Vancouver’s school sites for over 50 years, using 3D scanning and legal surveys to support design and preservation.",
    img: "/assets/uploads/2025/05/Copy-of-DSCF1858-thegem-blog-justified.webp",
    alt: "Surveying a North Vancouver School District site",
    service: SVC.scanning,
  },
  {
    title: "DP World Centerm Terminal Surveying & Expansion Support",
    excerpt:
      "Underhill supported Centerm container port upgrades over four decades, providing legal, construction, and crane alignment surveys.",
    img: "/assets/uploads/2025/05/DP-World-Centerm-Underhill-07-thegem-blog-justified.webp",
    alt: "DP World Centerm container terminal in Vancouver",
    service: SVC.construction,
  },
  {
    title: "Vancouver Fraser Port Authority Surveying & GIS Support",
    excerpt:
      "Underhill has served Vancouver’s ports for over 50 years, providing geodetic control, lease surveys, and cadastral mapping for VFPA projects.",
    img: "/assets/uploads/2025/09/DP-World-Crane-6-017-b-thegem-blog-justified.jpg",
    alt: "Container crane alignment at a Vancouver Fraser Port Authority terminal",
    service: SVC.cadastral,
  },
  {
    title: "Pattullo Bridge Replacement Hydraulic Model Surveying",
    excerpt:
      "Underhill used 3D laser scanning to monitor riverbed changes in a hydraulic scale model supporting the Pattullo Bridge replacement project.",
    img: "/assets/uploads/2025/09/Underhill-Patullo-thegem-blog-justified.jpg",
    alt: "Pattullo Bridge hydraulic scale model surveying",
    service: SVC.scanning,
  },
  {
    title: "Second Narrows Water Tunnel Real-Time Monitoring",
    excerpt:
      "Underhill installed a real-time total station to monitor shaft wall movement during the Second Narrows Water Tunnel TBM lift.",
    img: "/assets/uploads/2025/06/NorthVancouverWaterTunnel-1-thegem-blog-justified.webp",
    alt: "Second Narrows Water Tunnel shaft monitored by real-time total station",
    service: SVC.monitoring,
  },
];

export default function Infrastructure() {
  useDocumentMeta(
    "Infrastructure Surveying Projects - Underhill Geomatics",
    "From highways to bridges, our infrastructure surveying supports accuracy, alignment, and long-term performance."
  );

  return (
    <main id="main" className="pg-infra">
      <style>{CSS}</style>

      <PageHero
        image="/assets/uploads/2026/07/Highway99-Tunnel-2-thegem-blog-justified.jpg"
        title="Infrastructure Surveying Projects"
        eyebrow="Project Category"
        subtitle="Accuracy · Alignment · Long-Term Performance"
        lead="From highways to bridges, our infrastructure surveying supports accuracy, alignment, and long-term performance."
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Projects", href: "/land-surveying-projects/" },
        ]}
      />

      {/* Category intro — sourced from the land-surveying-projects page */}
      <section className="section" aria-labelledby="infra-intro">
        <div className="container">
          <div className="reveal" style={{ maxWidth: 820 }}>
            <span className="kicker">The Category</span>
            <h2 id="infra-intro">Roads, Bridges, and Transit Corridors</h2>
            <p className="lead">
              We conduct land surveying for infrastructure projects like roads,
              bridges, and transit corridors—ensuring accurate alignment,
              grading, and long-term integrity.
            </p>
            <div className="cat-meta" aria-label="Category facts">
              <span className="cat-chip">{PROJECTS.length} Archive Projects</span>
              <span className="cat-chip">BC · Yukon · Nunavut</span>
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
