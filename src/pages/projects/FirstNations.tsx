import PageHero from "../../components/PageHero";
import CtaBand from "../../components/CtaBand";
import SmartLink from "../../components/SmartLink";
import useDocumentMeta from "../../hooks/useDocumentMeta";

/* ---------------------------------------------------------------------------
   Page-scoped styles, namespaced under `.pg-first-nations`.
   Editorial listing grid: image cards for projects with a verified capture,
   navy typographic cards (file number + crosshair motif) for the rest.
   Cards are <article>s — project detail posts are not part of this port.
   Every animation is transform/opacity only and disabled under
   prefers-reduced-motion — GPU-cheap by contract.
--------------------------------------------------------------------------- */
const CSS = `
.pg-first-nations .sec-head { max-width: 760px; }

/* archive meta strip above the grid */
.pg-first-nations .listing-meta {
  display: flex; align-items: baseline; justify-content: space-between; gap: 16px;
  flex-wrap: wrap;
  margin-top: 54px; padding-bottom: 18px;
  border-bottom: 1px solid var(--grey-100);
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.18em; text-transform: uppercase; color: var(--grey-600);
}
.pg-first-nations .listing-meta .n { color: var(--blue); }

/* listing grid */
.pg-first-nations .cat-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 34px;
}
@media (max-width: 1100px) { .pg-first-nations .cat-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 620px) { .pg-first-nations .cat-grid { grid-template-columns: 1fr; } }
.pg-first-nations .cat-grid > .reveal { display: flex; }
.pg-first-nations .cat-card {
  position: relative; display: flex; flex-direction: column; flex: 1;
  background: var(--white); box-shadow: 0 10px 40px rgba(18,26,38,.08); overflow: hidden;
  transition: transform 0.35s var(--ease), box-shadow 0.35s var(--ease);
}
.pg-first-nations .cat-card:hover { transform: translateY(-6px); box-shadow: 0 26px 54px rgba(18,26,38,.16); }
.pg-first-nations .cat-card::before {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px; z-index: 2;
  background: linear-gradient(90deg, var(--blue), var(--lime));
  transform: scaleX(0); transform-origin: left;
  transition: transform 0.45s var(--ease);
}
.pg-first-nations .cat-card:hover::before { transform: scaleX(1); }

/* image card */
.pg-first-nations .shot { position: relative; aspect-ratio: 16 / 10; overflow: hidden; }
.pg-first-nations .shot img {
  width: 100%; height: 100%; object-fit: cover;
  transition: transform 0.6s var(--ease);
}
.pg-first-nations .cat-card:hover .shot img { transform: scale(1.05); }
.pg-first-nations .shot::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(60,57,80,.04), rgba(60,57,80,.5) 96%);
}
.pg-first-nations .idx {
  position: absolute; top: 14px; left: 16px; z-index: 2;
  font-family: var(--font-head); font-size: 12px; font-weight: 600;
  letter-spacing: 0.2em; color: var(--white);
  background: rgba(60,57,80,.72); padding: 5px 10px; border-left: 2px solid var(--lime);
}
.pg-first-nations .body {
  position: relative; padding: 24px 26px 26px;
  display: flex; flex-direction: column; flex: 1;
}
.pg-first-nations .body h3 { color: var(--navy); font-size: 19px; margin: 0 0 10px; }
.pg-first-nations .body p { font-size: 14.5px; color: var(--grey-600); margin: 0; flex: 1; }

/* related service link — the only link on a card */
.pg-first-nations .rel {
  margin-top: 18px; font-family: var(--font-head); font-weight: 600; font-size: 12px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--blue);
  display: inline-flex; align-items: center; gap: 9px; align-self: flex-start;
  transition: color 0.25s var(--ease);
}
.pg-first-nations .rel .arr { transition: transform 0.3s var(--ease); }
.pg-first-nations .rel:hover { color: var(--navy); }
.pg-first-nations .rel:hover .arr { transform: translateX(6px); }

/* typographic card — no usable image in the capture */
.pg-first-nations .typo { background: var(--navy); }
.pg-first-nations .typo .body h3 { color: var(--white); }
.pg-first-nations .typo .body p { color: rgba(255,255,255,.72); }
.pg-first-nations .typo .rel { color: var(--lime); }
.pg-first-nations .typo .rel:hover { color: var(--white); }
.pg-first-nations .tnum {
  display: block; margin-bottom: 14px;
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.22em; text-transform: uppercase; color: var(--lime);
}
.pg-first-nations .ghost {
  position: absolute; right: 14px; bottom: -16px; pointer-events: none;
  font-family: var(--font-head); font-weight: 700; font-size: 130px; line-height: 1;
  color: rgba(255,255,255,.06); font-variant-numeric: tabular-nums;
}
.pg-first-nations .cross {
  position: absolute; top: 20px; right: 20px; width: 26px; height: 26px;
  opacity: 0.55; pointer-events: none;
}
.pg-first-nations .cross::before, .pg-first-nations .cross::after {
  content: ""; position: absolute; background: rgba(255,255,255,.45);
}
.pg-first-nations .cross::before { left: 50%; top: 0; bottom: 0; width: 1px; }
.pg-first-nations .cross::after { top: 50%; left: 0; right: 0; height: 1px; }
.pg-first-nations .cross i {
  position: absolute; inset: 8px; border: 1px solid rgba(255,255,255,.45); border-radius: 50%;
}

/* closing CTA row */
.pg-first-nations .cat-cta { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 54px; }

/* reduced motion: kill every transition/animation introduced here */
@media (prefers-reduced-motion: reduce) {
  .pg-first-nations .cat-card, .pg-first-nations .cat-card::before,
  .pg-first-nations .shot img, .pg-first-nations .rel, .pg-first-nations .rel .arr {
    transition: none !important;
  }
  .pg-first-nations .cat-card:hover { transform: none; }
  .pg-first-nations .cat-card:hover .shot img { transform: none; }
  .pg-first-nations .rel:hover .arr { transform: none; }
}
`;

/* Related service lines a project excerpt clearly points at. */
const REL = {
  firstNations: { href: "/geospatial-services/first-nations-land-claims-surveying/", label: "First Nations Surveying" },
  cadastral: { href: "/geospatial-services/cadastral-surveying/", label: "Cadastral Surveying" },
} as const;

type RelKey = keyof typeof REL;

type Project = {
  title: string;
  excerpt: string;
  img?: string;
  alt?: string;
  rel?: RelKey;
};

/* Real listings from the underhill.ca First Nations category archive. */
const PROJECTS: Project[] = [
  {
    title: "Gwich’in Land Claim Boundary Survey",
    excerpt:
      "From 1993 to 1995, Underhill surveyed the Gwich’in Land Claim boundaries across NT and Yukon, securing over 24,000 km² of land.",
    rel: "firstNations",
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
    title: "Maa-nulth First Nations Treaty Settlement Surveys",
    excerpt:
      "Underhill completed cadastral surveys for Pre-Effective Lands under the Maa-nulth Treaty, supporting First Nations self-governance on Vancouver Island.",
    img: "/assets/uploads/2025/08/Maa-Nulth-Green-Cove-2009.jpg.jpg",
    alt: "Surveying Maa-nulth pre-effective lands at Green Cove, 2009",
    rel: "cadastral",
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
    title: "Council of Yukon First Nations (CYFN) Land Claim Surveys",
    excerpt:
      "From 1995 to 2011, Underhill completed 63 legal surveys for Yukon First Nations under the Umbrella Final Agreement, supporting land ownership and self-governance.",
    img: "/assets/uploads/2025/06/CYF-UNDERHILL-01-thegem-blog-justified.webp",
    alt: "Council of Yukon First Nations land claim survey fieldwork",
    rel: "firstNations",
  },
  {
    title: "Vuntut Gwitchin First Nation Settlement",
    excerpt:
      "Underhill surveyed 232 parcels for VGFN in 2014, enabling future residential and commercial planning through legal monumented boundaries.",
    rel: "cadastral",
  },
  {
    title: "Sahtu Dene and Metis Final Agreement",
    excerpt:
      "Underhill surveyed 679 corners and 3,500+ km of natural boundaries for the Sahtu Land Claim in the Western Arctic from 1995 to 2003.",
    img: "/assets/uploads/2025/06/Sahtu-Dene-Metis-Agreement-01-thegem-blog-justified.webp",
    alt: "Sahtu Dene and Metis land claim survey in the Western Arctic",
    rel: "firstNations",
  },
];

export default function FirstNations() {
  useDocumentMeta(
    "First Nations Surveying Projects - Underhill Geomatics",
    "We partner with Indigenous communities across Canada to deliver accurate, respectful, and legally sound land surveying."
  );

  return (
    <main id="main" className="pg-first-nations">
      <style>{CSS}</style>

      <PageHero
        image="/assets/uploads/2025/08/Maa-Nulth-Survey-2009.jpg.jpg"
        title="First Nations Surveying Projects"
        eyebrow="Project Archive"
        lead="We partner with Indigenous communities across Canada to deliver accurate, respectful, and legally sound land surveying."
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Projects", href: "/land-surveying-projects/" },
        ]}
      />

      <section className="section" aria-labelledby="cat-intro">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Category Focus</span>
            <h2 id="cat-intro">First Nations</h2>
            <p className="lead">
              We work alongside Indigenous communities to provide land surveying
              services that document land use, support planning, and define
              legal boundaries.
            </p>
          </div>

          <div className="listing-meta reveal" aria-hidden="true">
            <span>
              <span className="n">{PROJECTS.length}</span> Projects
            </span>
            <span>Underhill Project Archive · First Nations</span>
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
