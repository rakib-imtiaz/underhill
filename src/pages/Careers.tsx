import PageHero from "../components/PageHero";
import CtaBand from "../components/CtaBand";
import SmartLink from "../components/SmartLink";
import useDocumentMeta from "../hooks/useDocumentMeta";
import { UxStyle, Crosshair, CountUp } from "./motifs";

/* The eight openings listed on the source Careers page. Where the source site
   published a posting PDF, the local copy is linked; the remaining roles route
   applicants to the Let's Talk form. */
const OPENINGS: { title: string; loc: string; pdf?: string }[] = [
  {
    title: "Project Manager",
    loc: "Kamloops",
    pdf: "/assets/uploads/2026/07/Project-Manager-Posting-v12.pdf",
  },
  {
    title: "BCLS Professional Land Surveyor",
    loc: "Kamloops",
    pdf: "/assets/uploads/2026/06/Kamloops-BCLS-Professional-Land-Surveyor-v1.pdf",
  },
  {
    title: "Survey Technician",
    loc: "Kamloops",
    pdf: "/assets/uploads/2026/07/Survey-Tech-Kamloops-202606.pdf",
  },
  {
    title: "Survey Technician",
    loc: "Campbell River",
    pdf: "/assets/uploads/2026/06/Campbell-River-Survey-Technician-v1.pdf",
  },
  {
    title: "Survey Technician",
    loc: "Fort St. John",
    pdf: "/assets/uploads/2026/06/FSJ-Survey-Technician.pdf",
  },
  { title: "Survey Technician", loc: "Whitehorse" },
  { title: "CLS Professional Land Surveyor", loc: "Whitehorse" },
  { title: "BCLS Professional Land Surveyor", loc: "Vancouver" },
];

const EXPECTATIONS = [
  {
    num: "01",
    title: "Major Projects",
    body: "Participate on major, technically challenging projects in land surveying, engineering surveying, mapping, and information systems.",
  },
  {
    num: "02",
    title: "Latest Technology",
    body: "Gain first-hand experience using the latest in geomatics technology — traditional and modern.",
  },
  {
    num: "03",
    title: "Broad Disciplines",
    body: "Work across a broad spectrum of geomatics disciplines and grow your career with every assignment.",
  },
];

const LOCATIONS: {
  name: string;
  tag: string;
  body: string;
  href?: string;
}[] = [
  {
    name: "Vancouver",
    tag: "Head Office · Est. 1913",
    body: "Our head office and first location. Our office is located in Burnaby, and our work area is primarily in the Lower Mainland.",
    href: "/vancouver-land-surveyors/",
  },
  {
    name: "Kamloops",
    tag: "Est. 2004",
    body: "Our Kamloops office was opened in 2004 and services the interior and Central British Columbia.",
    href: "/kamloops-land-surveyors/",
  },
  {
    name: "Whitehorse",
    tag: "Est. 1969",
    body: "Our Whitehorse office was opened in 1969 and serves Northern BC, Yukon, the Northwest Territories and Nunavut.",
    href: "/whitehorse-land-surveyors/",
  },
  {
    name: "Vancouver Island",
    tag: "Our Newest Office",
    body: "Our newest office is located in the Comox Valley on Vancouver Island.",
    href: "/vancouver-island-land-surveyors/",
  },
  {
    name: "Fort St. John",
    tag: "Site C Project Office",
    body: "Our Site C office is located on site at the BC Hydro dam project in Fort St. John.",
  },
];

export function Careers() {
  useDocumentMeta(
    "Careers | Underhill Geomatics",
    "Join Underhill Geomatics. Hiring Field Survey, Survey, and CAD Technicians in Burnaby, Kamloops, Vancouver Island, Site C, and Whitehorse. Grow your career."
  );

  return (
    <main id="main">
      <UxStyle />
      <PageHero
        image="/assets/uploads/2026/05/2-female-ls-4-3.png"
        title="Careers"
        subtitle="Surveying Jobs in BC &amp; Yukon"
        lead="At Underhill, you can expect the opportunity to participate on major projects, gain first-hand experience using the latest in geomatics technology, and work in a broad spectrum of geomatics disciplines."
        crumb={{ label: "About", href: "/about-underhill-geomatics/" }}
      >
        <div className="actions">
          <a className="btn" href="#openings">
            View Open Positions
          </a>
          <a className="btn ghost" href="#lets-talk">
            Introduce Yourself
          </a>
        </div>
      </PageHero>

      {/* ---------------------------------------------------------- culture */}
      <section className="section">
        <div className="container split">
          <div className="reveal">
            <span className="kicker">Life at Underhill</span>
            <h2>Our People Are an Important Part of Our Success</h2>
            <p>
              We have a reputation for providing excellent service to our
              clients. We are involved with technically challenging projects in
              land surveying, engineering surveying, mapping, and information
              systems, using traditional and modern technologies.
            </p>
            <p>
              Underhill offers a competitive compensation package, and a
              friendly and flexible working environment.
            </p>
            <p>
              If you like responsibility, teamwork and innovation, and would
              like to join the Underhill organization we'd love to talk to you!
            </p>
            <div className="ux-chips">
              <span className="ux-chip">Responsibility</span>
              <span className="ux-chip">Teamwork</span>
              <span className="ux-chip">Innovation</span>
            </div>
          </div>
          <div className="figure reveal" style={{ transitionDelay: "120ms" }}>
            <img
              src="/assets/uploads/2025/05/Underhill-Geomatics-Kamloops_037_Eagle-Vision-Agency_20240313.jpg"
              alt="Underhill field crew at work near Kamloops, BC"
              loading="lazy"
            />
            <span className="cap">FIELD CREW · KAMLOOPS BC</span>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ expectations */}
      <section className="section dark tight">
        <div className="container">
          <div className="reveal">
            <span className="kicker">What to Expect</span>
            <h2>Grow Your Career in Geomatics</h2>
          </div>
          <div className="cards">
            {EXPECTATIONS.map((e, i) => (
              <div
                className="card reveal"
                style={{ transitionDelay: `${i * 90}ms` }}
                key={e.num}
              >
                <span className="num">{e.num}</span>
                <h3>{e.title}</h3>
                <p>{e.body}</p>
              </div>
            ))}
          </div>
          <div className="stats">
            <div className="stat">
              <div className="n">
                <CountUp to={8} />
              </div>
              <div className="l">Open positions</div>
            </div>
            <div className="stat">
              <div className="n">
                <CountUp to={5} />
              </div>
              <div className="l">Locations across BC &amp; Yukon</div>
            </div>
            <div className="stat">
              <div className="n">
                <CountUp to={110} suffix="+" />
              </div>
              <div className="l">Years of practice</div>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- openings */}
      <section className="section grey" id="openings">
        <div className="container">
          <div className="reveal">
            <span className="kicker">Current Openings</span>
            <h2>Surveying Jobs in BC &amp; Yukon</h2>
            <p className="lead">
              We're hiring Field Survey, Survey, and CAD Technicians and
              professional land surveyors in Burnaby, Kamloops, Vancouver
              Island, Site C, and Whitehorse.
            </p>
          </div>
          <div className="ux-jobs">
            {OPENINGS.map((j, i) => (
              <div
                className="ux-job reveal"
                style={{ transitionDelay: `${Math.min(i, 5) * 60}ms` }}
                key={`${j.title}-${j.loc}`}
              >
                <Crosshair size={20} />
                <div>
                  <h3>{j.title}</h3>
                  <span className="loc">
                    Location · <b>{j.loc}</b>
                  </span>
                </div>
                <div className="apply">
                  {j.pdf ? (
                    <a
                      className="btn small"
                      href={j.pdf}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View Posting
                    </a>
                  ) : (
                    <a className="btn small" href="#lets-talk">
                      Apply Now
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- locations */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="kicker">Where You Could Work</span>
            <h2>Underhill Locations</h2>
          </div>
          <div className="ux-locs">
            {LOCATIONS.map((l, i) => {
              const inner = (
                <>
                  <span className="tag">{l.tag}</span>
                  <h3>{l.name}</h3>
                  <p>{l.body}</p>
                  {l.href ? <span className="go">Visit Office Page</span> : null}
                </>
              );
              return l.href ? (
                <SmartLink
                  className="ux-loc reveal"
                  style={{ transitionDelay: `${i * 70}ms` }}
                  to={l.href}
                  key={l.name}
                >
                  {inner}
                </SmartLink>
              ) : (
                <div
                  className="ux-loc reveal"
                  style={{ transitionDelay: `${i * 70}ms` }}
                  key={l.name}
                >
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- email band */}
      <section className="ux-band">
        <div className="container reveal">
          <div>
            <span className="kicker">Get In Touch</span>
            <h2>Interested in a career with Underhill? Email us!</h2>
            <p>
              Tell us which branch and role fit you best — the Let's Talk form
              below reaches the right office directly.
            </p>
          </div>
          <a className="btn" href="#lets-talk">
            Start the Conversation
          </a>
        </div>
      </section>

      <CtaBand />
    </main>
  );
}

/* Default export too, so the routing agent can wire `/careers` with either
   `import Careers from …` or `import { Careers } from …`. */
export default Careers;
