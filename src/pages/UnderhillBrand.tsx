import PageHero from "../components/PageHero";
import CtaBand from "../components/CtaBand";
import useDocumentMeta from "../hooks/useDocumentMeta";

/* ---------------------------------------------------------------------------
   Underhill Brand (`/about-underhill-geomatics/underhill-brand/`).
   Copy, logo artwork, colour specs and download targets are lifted from
   site_capture (text + captured markup). Logo packs download from the same
   Google Drive links the source used; the brand-guidelines PDF is served
   locally from public/assets/uploads. Swatches are drawn in CSS from the
   published HEX values rather than the source's flat JPG squares. The source
   page has no hero photo, so the hero uses a branded field shot from the
   site's own library. Page-scoped layer namespaced `.pg-brand`.
--------------------------------------------------------------------------- */
const CSS = `
.pg-brand .sec-head { max-width: 760px; }

/* logo family — one block per lockup, gallery + download */
.pg-brand .family + .family { margin-top: 76px; padding-top: 64px; border-top: 1px solid var(--grey-300); }
.pg-brand .family-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
.pg-brand .family-head h3 { margin: 0; font-size: clamp(22px, 2.2vw, 28px); }
.pg-brand .family-head .count {
  display: block; margin-bottom: 8px;
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--blue);
}
.pg-brand .logo-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-top: 28px; }
@media (max-width: 1000px) { .pg-brand .logo-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 480px) { .pg-brand .logo-grid { grid-template-columns: 1fr; } }
.pg-brand .tile {
  display: flex; flex-direction: column; gap: 12px;
  background: var(--white); padding: 16px 16px 14px; box-shadow: var(--shadow-sm);
  transition: transform 0.3s var(--ease), box-shadow 0.3s var(--ease);
}
.pg-brand .tile:hover { transform: translateY(-4px); box-shadow: var(--shadow-md); }
.pg-brand .tile .art {
  display: grid; place-items: center; aspect-ratio: 16 / 10;
  background: var(--grey-050); padding: 14px; overflow: hidden;
}
.pg-brand .tile .art img { max-height: 100%; max-width: 100%; width: auto; object-fit: contain; }
.pg-brand .tile span {
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--grey-600);
}

/* colour swatches */
.pg-brand .swatches { display: grid; grid-template-columns: repeat(5, 1fr); gap: 20px; margin-top: 40px; }
@media (max-width: 1000px) { .pg-brand .swatches { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 560px) { .pg-brand .swatches { grid-template-columns: repeat(2, 1fr); } }
.pg-brand .swatch { background: var(--white); box-shadow: var(--shadow-sm); }
.pg-brand .swatch .chip { position: relative; aspect-ratio: 1 / 1; }
.pg-brand .swatch .chip .tag {
  position: absolute; left: 12px; top: 12px;
  font-family: var(--font-head); font-size: 10px; font-weight: 600;
  letter-spacing: 0.2em; text-transform: uppercase;
  background: var(--white); color: var(--navy); padding: 5px 9px;
}
.pg-brand .swatch .meta { padding: 16px 16px 18px; }
.pg-brand .swatch .pms {
  display: block; margin-bottom: 8px;
  font-family: var(--font-head); font-weight: 600; font-size: 14px; color: var(--navy);
}
.pg-brand .swatch dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 13px; }
.pg-brand .swatch dt {
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.14em; color: var(--blue); padding-top: 1px;
}
.pg-brand .swatch dd { color: var(--grey-600); font-variant-numeric: tabular-nums; }

/* logo-treatment don'ts */
.pg-brand ol.donts { list-style: none; counter-reset: dont; display: grid; gap: 10px; margin: 18px 0 0; }
.pg-brand ol.donts li {
  counter-increment: dont; position: relative; padding-left: 44px;
  font-weight: 500; color: var(--charcoal);
}
.pg-brand ol.donts li::before {
  content: counter(dont, decimal-leading-zero); position: absolute; left: 0; top: 1px;
  font-family: var(--font-head); font-size: 12px; font-weight: 600; letter-spacing: 0.12em;
  color: var(--blue); border-top: 2px solid var(--blue); padding-top: 2px; width: 30px;
}
.pg-brand .figure.plain img { box-shadow: var(--shadow-md); background: var(--white); }

/* downloads */
.pg-brand .dl-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; margin-top: 46px; }
@media (max-width: 800px) { .pg-brand .dl-grid { grid-template-columns: 1fr; } }
.pg-brand .dl-grid > .reveal { display: flex; }
.pg-brand .dl {
  position: relative; flex: 1; display: flex; flex-direction: column;
  background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.1);
  border-top: 3px solid var(--blue); padding: 34px 32px 30px;
}
.pg-brand .dl .fmt {
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--lime);
}
.pg-brand .dl h3 { margin: 12px 0 10px; font-size: 22px; }
.pg-brand .dl p { color: rgba(255,255,255,.75); flex: 1; margin-bottom: 24px; }
.pg-brand .dl .btn { align-self: flex-start; }

@media (prefers-reduced-motion: reduce) {
  .pg-brand .tile { transition: none !important; }
  .pg-brand .tile:hover { transform: none; }
}
`;

const UP = "/assets/uploads/2025/08";

type Logo = { src: string; label: string };

/* Each lockup ships four treatments: full colour, reversed (REV-, on black),
   black, and black reversed — the order the source gallery used. */
function variants(base: string, rgbFile = `${base}-RGB.jpg`): Logo[] {
  return [
    { src: `${UP}/${rgbFile}`, label: "Full colour" },
    { src: `${UP}/REV-${rgbFile}`, label: "Full colour · reversed" },
    { src: `${UP}/${base}-Black.jpg`, label: "Black" },
    { src: `${UP}/REV-${base}-Black.jpg`, label: "Black · reversed" },
  ];
}

const FAMILIES: {
  title: string;
  name: string;
  download: string;
  href: string;
  logos: Logo[];
}[] = [
  {
    title: "Preferred Version",
    name: "Underhill logo",
    download: "Download Underhill Logos",
    href: "https://drive.google.com/file/d/11T66r2B4hxT6-WNuhiwuIbK7xDG-2YKR/view?usp=sharing",
    logos: [
      ...variants("Underhill-Horozontal").map((l) => ({ ...l, label: `Horizontal · ${l.label}` })),
      ...variants("Underhill-Vertical").map((l) => ({ ...l, label: `Vertical · ${l.label}` })),
    ],
  },
  {
    title: "Underhill & Underhill Logo",
    name: "Underhill & Underhill logo",
    download: "Download Underhill & Underhill Logos",
    href: "https://drive.google.com/file/d/13hGxlCtla4XRpsUSiQr0jgTgGehRs7pR/view?usp=sharing",
    logos: [
      ...variants("UU-Horozontal").map((l) => ({ ...l, label: `Horizontal · ${l.label}` })),
      ...variants("UU-Vertical").map((l) => ({ ...l, label: `Vertical · ${l.label}` })),
    ],
  },
  {
    title: "Underhill Combined Logo",
    name: "Underhill combined logo",
    download: "Download Underhill Combined Logos",
    href: "https://drive.google.com/file/d/1ydvESDvIOrgZOVKeq2WjX4YaRYx6bV-3/view?usp=sharing",
    logos: variants("UG-UandU-Horozontal"),
  },
  {
    title: "Underhill Icon",
    name: "Underhill icon",
    download: "Download Underhill Icon",
    /* the source points the icon download at the same pack as the combined
       logos; kept as published */
    href: "https://drive.google.com/file/d/1ydvESDvIOrgZOVKeq2WjX4YaRYx6bV-3/view?usp=sharing",
    logos: variants("Underhill-Icon", "Underhill-Icon-RGB-1.jpg"),
  },
];

const COLOURS = [
  { pms: "PANTONE Process Blue C", rgb: "0 133 202", hex: "0085CA", cmyk: "100 15 0 6", primary: true },
  { pms: "PANTONE 158-15C", rgb: "115 151 63", hex: "73973F", cmyk: "41 0 85 32" },
  { pms: "PANTONE 45-5C", rgb: "245 126 37", hex: "F57E25", cmyk: "0 62 97 0" },
  { pms: "PANTONE 104-7C", rgb: "45 108 181", hex: "2D6CB5", cmyk: "85 58 0 0" },
  { pms: "PANTONE 127-3C", rgb: "145 211 206", hex: "91D3CE", cmyk: "42 0 22 0" },
];

const DONTS = [
  "Change the logo’s orientation or rotation.",
  "Disproportionately scale or resize the logo.",
  "Change the logo’s colors.",
  "Display the logo with colour combinations not previously specified.",
  "Display the logo in a configuration not previously specified.",
  "Add special effects to the logo.",
  "Add an outline to the logo or display the logo as an outline.",
  "Use the logo on top of busy photography.",
  "Display other elements within the logo’s designated clear space.",
  "Crop the logo in any way.",
];

const GUIDELINES_PDF = `${UP}/UnderhillGeomaticsBrandGuidelines_v6.pdf`;
const LOGO_FILES =
  "https://drive.google.com/file/d/1-x8E0mcjjO3jlg31jnF-6Kx_8HMdYuwR/view?usp=sharing";

export default function UnderhillBrand() {
  useDocumentMeta(
    "Underhill Brand - Underhill Geomatics",
    "The Underhill logo was originally designed in 1979 by S. Thorne, and features two “U” letters for the founding Underhill brothers."
  );

  return (
    <main id="main" className="pg-brand">
      <style>{CSS}</style>
      <PageHero
        image="/assets/uploads/2025/07/Underhill-Geomatics-Whitehorse_017_Eagle-Vision-Agency_20240515.jpg"
        title="The Underhill Brand"
        lead="The Underhill logo was originally designed in 1979 by S. Thorne, and features two “U” letters for the founding Underhill brothers."
        crumb={{ label: "About", href: "/about-underhill-geomatics/" }}
      >
        <div className="actions">
          <a className="btn" href={GUIDELINES_PDF} target="_blank" rel="noreferrer" download>
            Brand Guidelines (PDF)
          </a>
          <a className="btn ghost" href="#logos">
            Logos &amp; Colours
          </a>
        </div>
      </PageHero>

      {/* ------------------------------------------------------------- logos */}
      <section className="section grey" id="logos">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Since 1979</span>
            <h2>Logos</h2>
          </div>
          <div style={{ marginTop: 40 }}>
            {FAMILIES.map((f) => (
              <div className="family" key={f.title}>
                <div className="family-head reveal">
                  <div>
                    <span className="count">
                      {f.logos.length} {f.logos.length === 1 ? "file" : "files"}
                    </span>
                    <h3>{f.title}</h3>
                  </div>
                  <a className="btn small" href={f.href} target="_blank" rel="noreferrer">
                    {f.download}
                  </a>
                </div>
                <div className="logo-grid">
                  {f.logos.map((l, i) => (
                    <figure
                      className="tile reveal"
                      style={{ transitionDelay: `${(i % 4) * 60}ms` }}
                      key={l.src}
                    >
                      <div className="art">
                        <img src={l.src} alt={`${f.name}, ${l.label.toLowerCase()}`} loading="lazy" />
                      </div>
                      <span>{l.label}</span>
                    </figure>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- colours */}
      <section className="section">
        <div className="container">
          <div className="sec-head reveal">
            <span className="kicker">Brand Palette</span>
            <h2>Colours</h2>
            <p className="lead">
              Our company colours are professional and modern, expressing who we
              are.
            </p>
            <p>
              Underhill Blue is defined as Pantone Process Blue C. This is the
              main colour utilized in our branding.
            </p>
            <p>
              The following tertiary colours are used to complement the main blue
              brand colour.
            </p>
          </div>
          <div className="swatches">
            {COLOURS.map((c, i) => (
              <div
                className="swatch reveal"
                style={{ transitionDelay: `${i * 70}ms` }}
                key={c.hex}
              >
                <div className="chip" style={{ background: `#${c.hex}` }}>
                  {c.primary ? <span className="tag">Underhill Blue</span> : null}
                </div>
                <div className="meta">
                  <span className="pms">{c.pms}</span>
                  <dl>
                    <dt>RGB</dt>
                    <dd>{c.rgb}</dd>
                    <dt>HEX</dt>
                    <dd>{c.hex}</dd>
                    <dt>CMYK</dt>
                    <dd>{c.cmyk}</dd>
                  </dl>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- typography */}
      <section className="section grey">
        <div className="container split">
          <div className="reveal">
            <span className="kicker">Open Sans</span>
            <h2>Typography</h2>
            <p>
              Our primary typeface is Open Sans. We use Light, Regular and Bold.
              Whenever possible Open Sans should be used.
            </p>
            <p>
              When the use of Open Sans is not possible Arial is the alternative
              choice.
            </p>
          </div>
          <div className="figure plain reveal" style={{ transitionDelay: "120ms" }}>
            <img
              src={`${UP}/fonts.jpg`}
              alt="Open Sans Light, Regular and Bold type specimen"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- logo treatment */}
      <section className="section">
        <div className="container split">
          <div className="figure plain reveal">
            <img
              src={`${UP}/LOGO-USEAGE-e1570038916622-768x801-1.jpg`}
              alt="Examples of incorrect Underhill logo usage"
              loading="lazy"
            />
          </div>
          <div className="reveal" style={{ transitionDelay: "120ms" }}>
            <span className="kicker">Usage Rules</span>
            <h2>Logo Treatment</h2>
            <p>
              The logo must be used as is and not be altered in any way. This
              means that you must not:
            </p>
            <ol className="donts">
              {DONTS.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- clear space */}
      <section className="section grey">
        <div className="container split">
          <div className="reveal">
            <span className="kicker">Logo Spacing</span>
            <h2>Clear Space</h2>
            <p>
              All forms of the Underhill logo must have a designated amount of
              clear space on all sides unoccupied by other elements. This is to
              ensure the logo’s visual clarity and effectiveness.
            </p>
            <p>
              The clear space is defined as the space in the top right section of
              the icon or logomark’s crosshairs.
            </p>
          </div>
          <div className="figure plain reveal" style={{ transitionDelay: "120ms" }}>
            <img
              src={`${UP}/clearspace-768x615-1.jpg`}
              alt="Underhill logo clear-space diagram"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- downloads */}
      <section className="section dark">
        <div className="container">
          <div className="reveal">
            <span className="kicker">Downloads</span>
            <h2>Brand Resources</h2>
          </div>
          <div className="dl-grid">
            <div className="reveal">
              <div className="dl">
                <span className="fmt">PDF</span>
                <h3>Underhill Brand Guidelines</h3>
                <p>Download a full copy of our brand guidelines in PDF format.</p>
                <a className="btn" href={GUIDELINES_PDF} target="_blank" rel="noreferrer" download>
                  Download
                </a>
              </div>
            </div>
            <div className="reveal" style={{ transitionDelay: "90ms" }}>
              <div className="dl">
                <span className="fmt">AI · EPS · JPG · PNG</span>
                <h3>Underhill Logo Files</h3>
                <p>
                  Download all version of the Underhill logo in all formats (ai,
                  eps, jpg, png).
                </p>
                <a className="btn" href={LOGO_FILES} target="_blank" rel="noreferrer">
                  Download
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <CtaBand />
    </main>
  );
}
