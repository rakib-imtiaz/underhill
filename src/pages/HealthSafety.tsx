import PageHero from "../components/PageHero";
import CtaBand from "../components/CtaBand";
import SmartLink from "../components/SmartLink";
import useDocumentMeta from "../hooks/useDocumentMeta";
import { ContourDivider } from "./motifs";

/* ---------------------------------------------------------------------------
   Health and Safety (`/about-underhill-geomatics/health-safety/`).
   Copy is lifted from site_capture/text/about-underhill-geomatics_health-
   safety.txt, external links and the certification logo strip from the
   captured markup. The source's NSNY nav logo is white-on-transparent and
   vanishes on a light tile, so the strip uses the full-colour NSNY logo the
   Affiliations page carries instead. Shared primitives plus a page-scoped
   layer namespaced `.pg-hs`. Transform/opacity animation only.
--------------------------------------------------------------------------- */
const CSS = `
/* statement band — the source's pull line */
.pg-hs .statement { text-align: center; }
.pg-hs .statement p.big {
  font-family: var(--font-head); font-weight: 600; color: var(--navy);
  font-size: clamp(24px, 2.8vw, 36px); line-height: 1.25;
  max-width: 34ch; margin: 0 auto; text-wrap: balance;
}
.pg-hs .statement p.sub { margin: 22px auto 0; color: var(--grey-600); max-width: 60ch; }
.pg-hs .envs { display: flex; justify-content: center; flex-wrap: wrap; gap: 10px; margin-top: 30px; }
.pg-hs .envs span {
  font-family: var(--font-head); font-size: 12px; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--navy);
  border: 1px solid var(--grey-300); padding: 9px 16px;
}

/* standards — two panels on the dark section */
.pg-hs .std { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; margin-top: 46px; }
@media (max-width: 900px) { .pg-hs .std { grid-template-columns: 1fr; } }
.pg-hs .std > .reveal { display: flex; }
.pg-hs .panel {
  flex: 1; padding: 32px 32px 30px;
  background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.1);
  border-top: 3px solid var(--blue);
}
.pg-hs .panel h3 { margin: 0 0 14px; font-size: 20px; }
.pg-hs .panel p { color: rgba(255,255,255,.78); }
.pg-hs .panel a { color: var(--lime); font-weight: 600; }
.pg-hs .panel a:hover { color: var(--white); }

/* certification & membership logo strip */
.pg-hs .logos { display: grid; grid-template-columns: repeat(5, 1fr); gap: 18px; margin-top: 40px; }
@media (max-width: 1000px) { .pg-hs .logos { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 560px) { .pg-hs .logos { grid-template-columns: repeat(2, 1fr); } }
.pg-hs .logo {
  display: flex; flex-direction: column; align-items: center; justify-content: space-between;
  gap: 14px; background: var(--white); padding: 24px 18px 18px;
  box-shadow: var(--shadow-sm); border-bottom: 3px solid transparent;
  transition: transform 0.3s var(--ease), box-shadow 0.3s var(--ease), border-color 0.3s var(--ease);
}
.pg-hs .logo:hover { transform: translateY(-4px); box-shadow: var(--shadow-md); border-bottom-color: var(--blue); }
.pg-hs .logo img { height: 92px; width: 100%; object-fit: contain; }
.pg-hs .logo span {
  font-family: var(--font-head); font-size: 11px; font-weight: 600;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--grey-600); text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .pg-hs .logo { transition: none !important; }
  .pg-hs .logo:hover { transform: none; }
}
`;

const TRAINED_TO = [
  "Follow strict safety protocols",
  "Conduct routine risk assessments",
  "Identify and control site hazards",
  "Report safety concerns immediately",
];

const PROTOCOLS = [
  "WorkSafeBC and OH&S Regulations",
  "CSA Standards for field operations",
  "Client-specific safety programs including ISNetworld and ComplyWorks",
];

/* logo strip — order, targets and images from the captured markup */
const LOGOS = [
  {
    label: "BC Construction Safety Alliance",
    img: "/assets/uploads/2025/06/BCCSA-logo2.webp",
    href: "https://www.bccsa.ca/",
  },
  {
    label: "Northern Safety Network Yukon",
    img: "/assets/uploads/2026/01/Northern-Safety-Network.png",
    href: "https://www.yukonsafety.com/",
  },
  {
    label: "BCCSA COR Certified",
    img: "/assets/uploads/2025/06/BCCSA-COR-Certified-Logo.webp",
    href: "https://www.bccsa.ca/COR----Overview.html",
  },
  {
    label: "NSNY COR Program",
    img: "/assets/uploads/2025/06/CORlogo-Yellow-and-Black_2c-SCALED.webp",
    href: "https://www.yukonsafety.com/cor",
  },
  {
    label: "eRailSafe Canada",
    img: "/assets/uploads/2025/06/erailsafe-tall.webp",
    href: "https://erailsafe.com/canada/",
  },
];

export default function HealthSafety() {
  useDocumentMeta(
    "Health and Safety | Underhill Geomatics",
    "Underhill Geomatics prioritizes health and safety through training, risk prevention, and certified field practices across every project."
  );

  return (
    <main id="main" className="pg-hs">
      <style>{CSS}</style>
      <PageHero
        image="/assets/uploads/2025/07/health-safety_004_underhill-geomatics__Eagle-Vision-Agency_.jpg"
        title="Health and Safety at Underhill Geomatics"
        subtitle="A Culture Built on Safety"
        lead="Underhill Geomatics is committed to creating safe worksites across every environment we serve—urban, remote, marine, or industrial."
        crumb={{ label: "About", href: "/about-underhill-geomatics/" }}
      />

      {/* -------------------------------------------------------- statement */}
      <section className="section tight">
        <div className="container statement reveal">
          <span className="kicker">A Culture Built on Safety</span>
          <p className="big">
            We are dedicated to fostering a culture of safety that protects our
            team, our clients, and our communities.
          </p>
          <p className="sub">
            Our health and safety practices are deeply embedded in how we train,
            plan, and operate.
          </p>
          <div className="envs" aria-label="Environments we work in">
            {["Urban", "Remote", "Marine", "Industrial"].map((e) => (
              <span key={e}>{e}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------- safe worksites */}
      <section className="section grey">
        <div className="container split">
          <div className="reveal">
            <span className="kicker">Training, Preparedness, and Prevention</span>
            <h2>How Our Land Surveyors Maintain Safe Worksites</h2>
            <p>
              At Underhill, health and safety are not just policies—they’re core
              values.
            </p>
            <p>
              Our approach begins with comprehensive training programs that
              prepare employees to work safely and efficiently in any
              environment.
            </p>
            <p>Every team member is trained to:</p>
            <ul className="check">
              {TRAINED_TO.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
          <div className="figure reveal" style={{ transitionDelay: "120ms" }}>
            <img
              src="/assets/uploads/2025/05/Underhill-Geomatics-Oakridge_110_Eagle-Vision-Agency_20230427.jpg"
              alt="Underhill field crew in high-visibility safety gear on an active urban worksite"
              loading="lazy"
            />
            <span className="cap">FIELD SAFETY · EVERY ENVIRONMENT</span>
          </div>
        </div>
      </section>

      {/* ----------------------------------------- standards & certifications */}
      <section className="section dark">
        <div className="container">
          <div className="reveal">
            <span className="kicker">Standards &amp; Compliance</span>
            <h2>Safety Standards and Certifications</h2>
            <p className="lead" style={{ color: "rgba(255,255,255,.78)" }}>
              Underhill’s health and safety systems align with leading standards
              and regulatory requirements.
            </p>
            <p>
              Our crews operate under the highest expectations for field safety,
              environmental awareness, and legal compliance.
            </p>
          </div>
          <div className="std">
            <div className="reveal">
              <div className="panel">
                <h3>We follow protocols aligned with:</h3>
                <ul className="check">
                  {PROTOCOLS.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="reveal" style={{ transitionDelay: "90ms" }}>
              <div className="panel">
                <h3>Memberships &amp; Certifications</h3>
                <p>
                  The Underhill Geomatics goal is for all employees to work in a
                  healthy and injury free work place. To this end we are a member
                  of various safety organizations such as:{" "}
                  <a href="https://www.bccsa.ca/" target="_blank" rel="noreferrer">
                    BC Construction Safety Alliance
                  </a>{" "}
                  (BCCSA),{" "}
                  <a href="https://www.yukonsafety.com/" target="_blank" rel="noreferrer">
                    Northern Safety Network Yukon
                  </a>{" "}
                  (NSNY), and{" "}
                  <a href="https://erailsafe.com/canada/" target="_blank" rel="noreferrer">
                    eRailSafe Canada
                  </a>
                  .
                </p>
                <p>
                  We are certified in the following programs:{" "}
                  <a
                    href="https://www.bccsa.ca/cor_program.php"
                    target="_blank"
                    rel="noreferrer"
                  >
                    BCCSA Certificate of Recognition
                  </a>{" "}
                  (COR) Program and{" "}
                  <a href="https://www.yukonsafety.com/cor" target="_blank" rel="noreferrer">
                    NSNY Certificate of Recognition
                  </a>{" "}
                  (COR) Program
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- logo strip */}
      <section className="section grey tight">
        <div className="container">
          <div className="reveal">
            <span className="kicker">Certified &amp; Affiliated</span>
          </div>
          <div className="logos">
            {LOGOS.map((l, i) => (
              <a
                className="logo reveal"
                style={{ transitionDelay: `${i * 70}ms` }}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                key={l.label}
              >
                <img src={l.img} alt={`${l.label} logo`} loading="lazy" />
                <span>{l.label}</span>
              </a>
            ))}
          </div>
          <div className="reveal" style={{ marginTop: 30 }}>
            <SmartLink to="/about-underhill-geomatics/affiliations/">
              See all of Underhill’s affiliations →
            </SmartLink>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- commitment */}
      <section className="section">
        <div className="container split">
          <div className="figure reveal">
            <img
              src="/assets/uploads/2025/05/Underhill-Geomatics-Victoria_060_Eagle-Vision-Agency_20230705.jpg"
              alt="Underhill surveyor in safety gear setting up a total station on Vancouver Island"
              loading="lazy"
            />
            <span className="cap">PEOPLE · PROPERTY · PLACE</span>
          </div>
          <div className="reveal" style={{ transitionDelay: "120ms" }}>
            <span className="kicker">Care in Action</span>
            <h2>A Commitment That Extends to Every Project</h2>
            <p>
              Our health and safety culture is more than compliance—it’s care in
              action.
            </p>
            <p>
              By protecting people, property, and the places we work, Underhill
              continues to earn the trust of communities, governments, and
              industry partners across Western and Northern Canada.
            </p>
          </div>
        </div>
        <div className="container">
          <ContourDivider />
        </div>
      </section>

      <CtaBand />
    </main>
  );
}
