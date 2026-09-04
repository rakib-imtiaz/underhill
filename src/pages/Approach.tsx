import PageHero from "../components/PageHero";
import CtaBand from "../components/CtaBand";
import useDocumentMeta from "../hooks/useDocumentMeta";
import { UxStyle, ContourDivider, ProjectsTeaser } from "./motifs";

const PARTNERSHIP_PILLARS = [
  {
    num: "01",
    title: "Early & Consistent Support",
    body: "Project support that starts early and stays consistent — from kickoff to final delivery.",
  },
  {
    num: "02",
    title: "Insightful Communication",
    body: "Insightful communication, not just data delivery. We work with you, not just on your project.",
  },
  {
    num: "03",
    title: "A Trusted Partner",
    body: "Expert guidance, clear data, and responsive service every step of the way — a partner, not just a provider.",
  },
];

const INNOVATION_STEPS = [
  {
    title: "Investing in Leading-Edge Tools",
    body: "From UAV mapping to 3D laser scanning, our equipment program keeps pace with the state of the art.",
  },
  {
    title: "Training Teams on Evolving Standards",
    body: "Our people stay current with emerging methods, standards, and best practices.",
  },
  {
    title: "Delivering Modern, Proven Results",
    body: "Deliverables that are both modern and proven — innovation grounded in a century of practice.",
  },
];

export default function Approach() {
  useDocumentMeta(
    "Our Approach | Underhill Geomatics",
    "At Underhill Geomatics, we draw on 110+ years of expertise and a forward-thinking approach."
  );

  return (
    <main id="main">
      <UxStyle />
      <PageHero
        image="/assets/uploads/2025/06/land-surveying_039_underhill-geomatics__Eagle-Vision-Agency_.webp"
        title="Our Approach"
        subtitle="Where Tradition Meets Technology"
        lead="At Underhill Geomatics, we draw on 110+ years of expertise and a forward-thinking approach."
        crumb={{ label: "About", href: "/about-underhill-geomatics/" }}
      />

      {/* ------------------------------------------------------------ intro */}
      <section className="section">
        <div className="container split">
          <div className="reveal">
            <span className="kicker">Our Approach</span>
            <h2>Where Tradition Meets Technology</h2>
            <p>
              At Underhill Geomatics, we draw on 110+ years of expertise and a
              forward-thinking approach. By blending proven practices with
              advanced technology, we deliver precise, reliable solutions for
              diverse projects.
            </p>
            <p>
              Our legacy drives us—but we never stand still. As challenges
              evolve, so do we, ensuring accuracy and adaptability every step of
              the way.
            </p>
            <a className="btn" href="#lets-talk" style={{ marginTop: 14 }}>
              Request Consultation
            </a>
          </div>
          <div className="figure reveal" style={{ transitionDelay: "120ms" }}>
            <img
              src="/assets/uploads/2025/06/land-surveying_027_underhill-geomatics__Eagle-Vision-Agency_.jpg"
              alt="Underhill surveyor taking a measurement in the field"
              loading="lazy"
            />
            <span className="cap">FIELD PRACTICE · PROVEN SINCE 1913</span>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------- collaboration */}
      <section className="section dark">
        <div className="container">
          <div className="reveal">
            <span className="kicker">Collaboration and Communication</span>
            <h2>
              Clear dialogue and strong partnerships are essential to every
              successful project.
            </h2>
            <p
              className="lead"
              style={{ color: "rgba(255,255,255,.78)" }}
            >
              We believe the best results come from shared understanding. That's
              why we prioritize open dialogue at every stage—from kickoff to
              final delivery.
            </p>
          </div>
          <div className="cards">
            {PARTNERSHIP_PILLARS.map((p, i) => (
              <div
                className="card reveal"
                style={{ transitionDelay: `${i * 90}ms` }}
                key={p.num}
              >
                <span className="num">{p.num}</span>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- precision */}
      <section className="section">
        <div className="container split">
          <div className="figure reveal">
            <img
              src="/assets/uploads/2025/07/construction-surveying_040_underhill-geomatics__Eagle-Vision-Agency_.webp"
              alt="Construction surveying in progress on a major project site"
              loading="lazy"
            />
            <span className="cap">QUALITY CONTROL · EVERY STAGE</span>
          </div>
          <div className="reveal" style={{ transitionDelay: "120ms" }}>
            <span className="kicker">Why Clients Trust Our Approach</span>
            <h2>Precision you can trust, backed by proven processes.</h2>
            <blockquote className="ux-quote">
              In surveying and geomatics, accuracy isn't optional – it's
              essential.
            </blockquote>
            <p>
              Every project depends on the precision of the data that guides it,
              and our clients count on us to get it right. We meet that
              expectation through:
            </p>
            <ul className="check">
              <li>Rigorous quality control at every stage</li>
              <li>Standardized workflows that ensure consistency</li>
              <li>
                Field-proven expertise across land, marine, and infrastructure
                environments
              </li>
            </ul>
            <p>
              <strong>
                When you hire Underhill, you get results you can rely on
              </strong>{" "}
              – because we've built our reputation on it.
            </p>
          </div>
        </div>
        <div className="container">
          <ContourDivider />
        </div>
      </section>

      {/* ---------------------------------------------------- innovation */}
      <section className="section grey">
        <div className="container">
          <div className="reveal">
            <span className="kicker">Innovation and Adaptability</span>
            <h2>Evolving with technology to meet changing project demands.</h2>
            <p className="lead">
              Land Surveying has changed dramatically since we began in 1913 –
              and we've changed with it.
            </p>
            <p>
              Our teams stay current with emerging technologies, integrating new
              tools and methods that enhance accuracy, efficiency, and insight.
              Whether it's UAV mapping, 3D laser scanning, or BIM data
              integration, we approach innovation as a core part of how we work.
            </p>
            <div className="ux-chips">
              <span className="ux-chip">UAV Mapping</span>
              <span className="ux-chip">3D Laser Scanning</span>
              <span className="ux-chip">BIM Data Integration</span>
            </div>
          </div>
          <div className="steps">
            {INNOVATION_STEPS.map((s, i) => (
              <div
                className="step reveal"
                style={{ transitionDelay: `${i * 90}ms` }}
                key={s.title}
              >
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <ProjectsTeaser />

      <CtaBand />
    </main>
  );
}
