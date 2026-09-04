import PageHero from "../../components/PageHero";
import CtaBand from "../../components/CtaBand";
import SmartLink from "../../components/SmartLink";
import useDocumentMeta from "../../hooks/useDocumentMeta";

/* ---------------------------------------------------------------------------
   Page-scoped styles, namespaced under `.pg-historical`.
   Editorial listing grid: image cards for projects with a verified capture,
   navy typographic cards (file number + crosshair motif) for the rest.
   Cards are <article>s — project detail posts are not part of this port.
   Every animation is transform/opacity only and disabled under
   prefers-reduced-motion — GPU-cheap by contract.
--------------------------------------------------------------------------- */
const CSS = `
.pg-historical .sec-head { max-width: 760px; }

/* archive meta strip above the grid */
.pg-historical .listing-meta {
  display: flex; align-items: baseline; justify-content: space-between; gap: 16px;
  flex-wrap: wrap;
  margin-top: 54px; padding-bottom: 18px;
  border-bottom: 1px solid var(--grey-100);
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.18em; text-transform: uppercase; color: var(--grey-600);
}
.pg-historical .listing-meta .n { color: var(--blue); }

/* listing grid */
.pg-historical .cat-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 34px;
}
@media (max-width: 1100px) { .pg-historical .cat-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 620px) { .pg-historical .cat-grid { grid-template-columns: 1fr; } }
.pg-historical .cat-grid > .reveal { display: flex; }
.pg-historical .cat-card {
  position: relative; display: flex; flex-direction: column; flex: 1;
  background: var(--white); box-shadow: 0 10px 40px rgba(18,26,38,.08); overflow: hidden;
  transition: transform 0.35s var(--ease), box-shadow 0.35s var(--ease);
}
.pg-historical .cat-card:hover { transform: translateY(-6px); box-shadow: 0 26px 54px rgba(18,26,38,.16); }
.pg-historical .cat-card::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px; z-index: 2;
  background: linear-gradient(90deg, var(--blue), var(--lime));
  transform: scaleX(0); transform-origin: left;
  transition: transform 0.45s var(--ease);
}
.pg-historical .cat-card:hover::before { transform: scaleX(1); }

/* image card */
.pg-historical .shot { position: relative; aspect-ratio: 16 / 10; overflow: hidden; }
.pg-historical .shot img {
  width: 100%; height: 100%; object-fit: cover;
  transition: transform 0.6s var(--ease);
}
.pg-historical .cat-card:hover .shot img { transform: scale(1.05); }
.pg-historical .shot::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(60,57,80,.04), rgba(60,57,80,.5) 96%);
}
.pg-historical .idx {
  position: absolute; top: 14px; left: 16px; z-index: 2;
  font-family: var(--font-head); font-size: 12px; font-weight: 600;
  letter-spacing: 0.2em; color: var(--white);
  background: rgba(60,57,80,.72); padding: 5px 10px; border-left: 2px solid var(--lime);
}
.pg-historical .body {
  position: relative; padding: 24px 26px 26px;
  display: flex; flex-direction: column; flex: 1;
}
.pg-historical .body h3 { color: var(--navy); font-size: 19px; margin: 0 0 10px; }
.pg-historical .body p { font-size: 14.5px; color: var(--grey-600); margin: 0; flex: 1; }

/* related service link — the only link on a card */
.pg-historical .rel {
  margin-top: 18px; font-family: var(--font-head); font-weight: 600; font-size: 12px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--blue);
  display: inline-flex; align-items: center; gap: 9px; align-self: flex-start;
  transition: color 0.25s var(--ease);
}
.pg-historical .rel .arr { transition: transform 0.3s var(--ease); }
.pg-historical .rel:hover { color: var(--navy); }
.pg-historical .rel:hover .arr { transform: translateX(6px); }

/* typographic card — no usable image in the capture */
.pg-historical .typo { background: var(--navy); }
.pg-historical .typo .body h3 { color: var(--white); }
.pg-historical .typo .body p { color: rgba(255,255,255,.72); }
.pg-historical .typo .rel { color: var(--lime); }
.pg-historical .typo .rel:hover { color: var(--white); }
.pg-historical .tnum {
  display: block; margin-bottom: 14px;
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.22em; text-transform: uppercase; color: var(--lime);
}
.pg-historical .ghost {
  position: absolute; right: 14px; bottom: -16px; pointer-events: none;
  font-family: var(--font-head); font-weight: 700; font-size: 130px; line-height: 1;
  color: rgba(255,255,255,.06); font-variant-numeric: tabular-nums;
}
.pg-historical .cross {
  position: absolute; top: 20px; right: 20px; width: 26px; height: 26px;
  opacity: 0.55; pointer-events: none;
}
.pg-historical .cross::before, .pg-historical .cross::after {
  content: ""; position: absolute; background: rgba(255,255,255,.45);
}
.pg-historical .cross::before { left: 50%; top: 0; bottom: 0; width: 1px; }
.pg-historical .cross::after { top: 50%; left: 0; right: 0; height: 1px; }
.pg-historical .cross i {
  position: absolute; inset: 8px; border: 1px solid rgba(255,255,255,.45); border-radius: 50%;
}

/* closing CTA row */
.pg-historical .cat-cta { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 54px; }

/* reduced motion: kill every transition/animation introduced here */
@media (prefers-reduced-motion: reduce) {
  .pg-historical .cat-card, .pg-historical .cat-card::before,
  .pg-historical .shot img, .pg-historical .rel, .pg-historical .rel .arr {
    transition: none !important;
  }
  .pg-historical .cat-card:hover { transform: none; }
  .pg-historical .cat-card:hover .shot img { transform: none; }
  .pg-historical .rel:hover .arr { transform: none; }
}
`;

/* Related service lines a project excerpt clearly points at. */
const REL = {
  firstNations: { href: "/geospatial-services/first-nations-land-claims-surveying/", label: "First Nations Surveying" },
  cadastral: { href: "/geospatial-services/cadastral-surveying/", label: "Cadastral Surveying" },
  railway: { href: "/geospatial-services/railway-surveying/", label: "Railway Surveying" },
  scanning: { href: "/geospatial-services/3d-laser-scanning-reality-capture/", label: "Laser Scanning" },
  construction: { href: "/geospatial-services/construction-surveying/", label: "Construction & Engineering Surveys" },
} as const;

type RelKey = keyof typeof REL;

type Project = {
  title: string;
  excerpt: string;
  img?: string;
  alt?: string;
  rel?: RelKey;
};

/* Real listings from the underhill.ca historical category archive.
   Excerpts marked (†) restate the title only — the source listing carried
   no excerpt. */
const PROJECTS: Project[] = [
  {
    title: "Gwich’in Land Claim Boundary Survey",
    excerpt:
      "From 1993 to 1995, Underhill surveyed the Gwich’in Land Claim boundaries across NT and Yukon, securing over 24,000 km² of land.",
    rel: "firstNations",
  },
  {
    title: "Field Data Services, Inc: Customized Software",
    excerpt:
      "From 1996–2001, Underhill’s DCB software supported FDSI in digitizing over 1.5 million poles and attachments for U.S. utilities.",
  },
  {
    title: "City of Coquitlam: Land and Utility GIS Data Conversion and Custom Software",
    excerpt:
      "Land and utility GIS data conversion and custom software development for the City of Coquitlam.", // †
    img: "/assets/uploads/2025/08/GIS-Mapping-Facility-Burnaby-1991.jpg.jpg",
    alt: "Underhill's GIS mapping facility in Burnaby, 1991",
  },
  {
    title: "Nunavut Land Claim Survey",
    excerpt:
      "Underhill surveyed over 2,700 boundary corners across 1.9 million km² for the Nunavut Land Claim—Canada’s largest land settlement.",
    img: "/assets/uploads/2025/08/Nunavut-Land-Claim-Boundary-Survey-Ellesmere-Is-1998.jpg.jpg",
    alt: "Nunavut Land Claim boundary survey on Ellesmere Island, 1998",
    rel: "firstNations",
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
    img: "/assets/uploads/2025/08/Cadastral-boundaries-little-mtn-bc.jpg.jpg",
    alt: "Cadastral boundaries compiled across Canada Lands",
    rel: "cadastral",
  },
  {
    title: "Ruby Creek Mineral Lease Survey",
    excerpt:
      "Underhill conducted the first mineral lease survey using BC’s geographic cell system at Ruby Creek near Atlin.",
    img: "/assets/uploads/2025/09/ruby-creek-thegem-blog-justified.webp",
    alt: "GPS survey of a mineral lease at Ruby Creek, Atlin, BC",
    rel: "cadastral",
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
    excerpt:
      "GIS land base development using COGO for BC Hydro’s transmission network.", // †
    img: "/assets/uploads/2025/08/Transmission-Line-Survey-2ns-Narrows-Crossing_fx.jpg",
    alt: "Transmission line survey at the Second Narrows crossing",
  },
  {
    title: "Canada Line Surveying: Rapid Transit Infrastructure from Vancouver to YVR",
    excerpt:
      "Underhill delivered precision surveys, laser scanning, and legal right-of-way mapping for the Canada Line rapid transit project.",
    img: "/assets/uploads/2025/09/canada-line-thegem-blog-justified.webp",
    alt: "The Canada Line rapid transit corridor in Vancouver",
    rel: "railway",
  },
  {
    title: "BC Hydro Distribution | GIS Conversion & Field Inventory",
    excerpt:
      "GIS conversion and field inventory for BC Hydro’s distribution system.", // †
  },
  {
    title: "Capilano–Seymour Water Tunnel Surveying & 3D Scanning",
    excerpt:
      "Surveying and 3D laser scanning for the Capilano–Seymour water tunnel.", // †
    img: "/assets/uploads/2025/06/NorthVancouverWaterTunnel-1-thegem-blog-justified.webp",
    alt: "Water tunnel surveying on Vancouver's North Shore",
    rel: "scanning",
  },
  {
    title: "BC Rail Tumbler Ridge Branch Line Tunnel & Railway Surveying",
    excerpt:
      "Underhill delivered precision surveying for 140 km of railway, including two tunnels and 15 bridges, through BC’s Rocky Mountains.",
    img: "/assets/uploads/2025/06/BC-Rail-Underhill-15-thegem-blog-justified.webp",
    alt: "BC Rail Tumbler Ridge branch line surveying",
    rel: "railway",
  },
  {
    title: "Maa-nulth First Nations Treaty Settlement Surveys",
    excerpt:
      "Underhill completed cadastral surveys for Pre-Effective Lands under the Maa-nulth Treaty, supporting First Nations self-governance on Vancouver Island.",
    img: "/assets/uploads/2025/08/Maa-Nulth-Uculet-2009.jpg.jpg",
    alt: "Surveying Maa-nulth pre-effective lands near Ucluelet, 2009",
    rel: "cadastral",
  },
  {
    title: "Lord Strathcona Elementary School 3D Laser Scanning",
    excerpt:
      "Underhill scanned four heritage buildings at Vancouver’s oldest school, delivering 2D elevations and a 3D Webshare model for design use.",
    rel: "scanning",
  },
  {
    title: "Inuvialuit Final Agreement (IFA) Boundary Survey",
    excerpt:
      "Underhill surveyed over 2,000 km of boundaries for the Inuvialuit Final Agreement—the first GPS-based land claim survey in Canada.",
    img: "/assets/uploads/2025/06/Inuvialuit-Final-Agreement-Survey-NWT-07-thegem-blog-justified.webp",
    alt: "Inuvialuit Final Agreement boundary survey in the Northwest Territories",
    rel: "firstNations",
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
    title: "Sahtu Dene and Metis Final Agreement",
    excerpt:
      "Underhill surveyed 679 corners and 3,500+ km of natural boundaries for the Sahtu Land Claim in the Western Arctic from 1995 to 2003.",
    img: "/assets/uploads/2025/06/Sahtu-Dene-Metis-Agreement-01-thegem-blog-justified.webp",
    alt: "Sahtu Dene and Metis land claim survey in the Western Arctic",
    rel: "firstNations",
  },
  {
    title: "ICIS Cadastral Data Modernization",
    excerpt:
      "Underhill upgraded cadastral accuracy across BC communities through ICIS projects, using COGO, GPS, and GIS data integration.",
    rel: "cadastral",
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
    title: "DP World Centerm Terminal Surveying & Expansion Support",
    excerpt:
      "Underhill supported Centerm container port upgrades over four decades, providing legal, construction, and crane alignment surveys.",
    img: "/assets/uploads/2025/05/DP-World-Centerm-Underhill-07-thegem-blog-justified.webp",
    alt: "DP World Centerm container terminal in Vancouver",
    rel: "construction",
  },
  {
    title: "Vancouver Fraser Port Authority Surveying & GIS Support",
    excerpt:
      "Underhill has served Vancouver’s ports for over 50 years, providing geodetic control, lease surveys, and cadastral mapping for VFPA projects.",
    img: "/assets/uploads/2025/09/DP-World-Crane-6-017-b-thegem-blog-justified.jpg",
    alt: "Crane surveying at a Port of Vancouver terminal",
    rel: "cadastral",
  },
];

export default function Historical() {
  useDocumentMeta(
    "Historical Land Surveying Projects - Underhill Geomatics",
    "With records dating to 1913, Underhill supports heritage restoration and historic land documentation projects."
  );

  return (
    <main id="main" className="pg-historical">
      <style>{CSS}</style>

      <PageHero
        image="/assets/uploads/2025/08/Metropolitan-Building-ca-1921-city-archives-Bu-N339-Major-Matthew-collection_UU-office-1919-1921.jpg"
        title="Historical Land Surveying Projects"
        eyebrow="Project Archive"
        lead="With records dating to 1913, Underhill supports heritage restoration and historic land documentation projects."
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Projects", href: "/land-surveying-projects/" },
        ]}
      />

      <section className="section" aria-labelledby="cat-intro">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Category Focus</span>
            <h2 id="cat-intro">Historical Projects</h2>
            <p className="lead">
              From heritage structures to historic land claims, our land
              surveying work documents over a century of physical and legal
              development. With project records dating back to 1913, we bring
              deep archival knowledge and continuity to complex restoration and
              redevelopment efforts.
            </p>
          </div>

          <div className="listing-meta reveal" aria-hidden="true">
            <span>
              <span className="n">{PROJECTS.length}</span> Projects
            </span>
            <span>Underhill Project Archive · Historical</span>
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
