import { Link } from "react-router-dom";
import PageHero from "../components/PageHero";
import CtaBand from "../components/CtaBand";
import useDocumentMeta from "../hooks/useDocumentMeta";
import { UxStyle } from "./motifs";

/* Names, credentials and bios exactly as they appear on the source page. */
const LEADERSHIP = [
  {
    img: "/assets/uploads/2025/09/Chris-El-Araj.jpg",
    alt: "Chris El-Araj, BCLS, President at Underhill Geomatics",
    name: "Chris El-Araj, BCLS",
    role: "President",
    creds: ["BCLS", "CLS"],
    bio: [
      "Chris El-Araj, BCLS, CLS, is the President of the Underhill Group of Companies, where he leads the firm with a commitment to professionalism, technical excellence, innovation, and client-focused service. With more than twenty-five years of experience in land surveying and geomatics, he specializes in cadastral and engineering surveys and is recognized as a trusted authority in the field.",
      "Chris holds a Diploma of Technology in Geomatics from the British Columbia Institute of Technology and earned his BC Land Surveyor (BCLS) commission in 2009 and his Canada Land Surveyor (CLS) commission in 2026. Since joining Underhill, he has advanced the company's technical capabilities and supported its growth across Western Canada. His work spans major infrastructure, transportation, and land development projects.",
    ],
  },
  {
    img: "/assets/uploads/2025/09/Sandy-Cooke.jpg",
    alt: "Sandy Cooke, P.Eng, Vice President at Underhill Geomatics",
    name: "Sandy Cooke, P.Eng",
    role: "Vice President",
    creds: ["P.Eng."],
    bio: [
      "Sandy Cooke, P.Eng., is the Vice President and Managing Partner of the Whitehorse office. A Professional Engineer with a degree in Geodesy and Geomatics Engineering from the University of New Brunswick, he has embodied the company's values of innovation, collaboration, and professional excellence.",
      "Since joining Underhill in 2008—later becoming a partner in 2018— Sandy delivers precise and practical engineering solutions across diverse projects. He is known for fostering strong collaboration among clients, project teams, and stakeholders, ensuring that each assignment meets the highest standards of quality and care.",
      "Driven by a passion for advancing the geomatics industry, Sandy contributes to Underhill's ongoing reputation for forward-thinking approaches and exceptional client service.",
    ],
  },
  {
    img: "/assets/uploads/2025/09/Jon-Cormier-2-2.jpg",
    alt: "Jon Cormier, BCLS, Partner at Underhill Geomatics",
    name: "Jon Cormier, BCLS",
    role: "Partner",
    creds: ["BCLS"],
    bio: [
      "Jon Cormier, BCLS, is a Partner based at our Vancouver office, and an experienced BC Land Surveyor who has worked in the industry since 2005. Jon joined Underhill in 2010 and progressed from field surveyor to project manager before becoming a partner. Jon earned his BCLS commission in 2015, following a Diploma in Surveying Engineering Technology from the College of the North Atlantic and a Bachelor of Technology in Geomatics from BCIT.",
      "Jon serves as a technical lead on a wide range of projects, including topographic, cadastral, 3D laser scanning, bathymetric, and engineering surveys. His comprehensive experience across Western Canada includes work with land developers, public utilities, railways, port facilities, industrial sites, municipalities, and government agencies.",
      "Known for his meticulous approach and broad technical expertise, Jon contributes significantly to Underhill's reputation for high-quality, dependable surveying services.",
    ],
  },
  {
    img: "/assets/uploads/2025/09/Ryan-Schuler.jpg",
    alt: "Ryan Schuler, P.Eng., CLS, Partner at Underhill Geomatics",
    name: "Ryan Schuler, P.Eng., CLS",
    role: "Partner",
    creds: ["P.Eng.", "CLS"],
    bio: [
      "Ryan Schuler, P.Eng., CLS is the Managing Partner of Underhill's Kamloops office, guiding regional operations with a strong focus on quality, technology integration, and team development. He is also the Managing Partner of the Fort St. John office and leads geomatics operations for the BC Hydro Site C Clean Energy Project. His leadership has advanced major technical initiatives, including the development of a UAV mapping program, infrastructure monitoring systems, and extensive quality assurance surveys—supporting one of Canada's largest infrastructure projects.",
      "His broader career spans Northern Canada, where he has delivered large-scale topographic surveys, environmental monitoring programs, offshore marine work, and Arctic ice road assessments. Ryan has received two David Thompson National Geomatics Awards for Innovation in Geomatics and Contribution to Society.",
      "A strong advocate for mentorship and professional development, Ryan has served as Chair of the ACLS Practice Review Committee and as a Council Member for NAPEG. He remains committed to advancing the surveying profession through innovation and leadership.",
    ],
  },
];

export default function Team() {
  useDocumentMeta(
    "Meet The Team | Underhill Geomatics",
    "Meet the leadership team of Underhill Geomatics — licensed land surveyors and professional geomatics engineers."
  );

  return (
    <main id="main">
      <UxStyle />
      <PageHero
        image="/assets/uploads/2025/05/Underhill-Geomatics-Alouette_055_Eagle-Vision-Agency_20231105.webp"
        title="Meet The Team"
        subtitle="Our Professionals, Your Partners"
        lead="At Underhill, our team is our greatest asset."
        crumb={{ label: "About", href: "/about-underhill-geomatics/" }}
      />

      {/* ------------------------------------------------------- about team */}
      <section className="section">
        <div className="container split">
          <div className="reveal">
            <span className="kicker">Who We Are</span>
            <h2>About Our Team</h2>
            <p>
              We bring together a diverse group of experienced professionals who
              contribute their unique skills and technical expertise to every
              project we undertake, allowing us to deliver reliable data and
              insights for every industry.
            </p>
            <p>
              It's through our team's dedication to excellence and commitment to
              continuous innovation that we've established ourselves as a leader
              in geomatics. Meet the meticulous minds that guide our operations!
            </p>
          </div>
          <div className="figure reveal" style={{ transitionDelay: "120ms" }}>
            <img
              src="/assets/uploads/2025/08/Pitt-Lake-Survey-Team-Photo-2011.jpg.jpg"
              alt="The Underhill survey crew at Pitt Lake, 2011"
              loading="lazy"
            />
            <span className="cap">SURVEY CREW · PITT LAKE · 2011</span>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- leadership */}
      <section className="section grey">
        <div className="container">
          <div className="reveal">
            <span className="kicker">Leadership</span>
            <h2>Leadership Team</h2>
            <p className="lead">
              Licensed land surveyors and professional geomatics engineers who
              guide Underhill's operations across Western and Northern Canada.
            </p>
          </div>
          <div className="ux-leaders">
            {LEADERSHIP.map((m, i) => (
              <article
                className="ux-leader reveal"
                style={{ transitionDelay: `${i * 90}ms` }}
                key={m.name}
              >
                <div className="ph">
                  <img src={m.img} alt={m.alt} loading="lazy" />
                </div>
                <div className="meta">
                  <h3>{m.name}</h3>
                  <div className="role">{m.role}</div>
                  <div className="creds">
                    {m.creds.map((c) => (
                      <span key={c}>{c}</span>
                    ))}
                  </div>
                  {m.bio.map((p, j) => (
                    <p key={j}>{p}</p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- join CTA */}
      <section className="ux-band">
        <div className="container reveal">
          <div>
            <span className="kicker">Careers</span>
            <h2>Join the Meticulous Minds at Underhill</h2>
            <p>
              If you like responsibility, teamwork and innovation, we'd love to
              talk to you. See the survey and CAD roles we're hiring for across
              BC &amp; Yukon.
            </p>
          </div>
          <Link className="btn" to="/careers/">
            See Open Positions
          </Link>
        </div>
      </section>

      <CtaBand />
    </main>
  );
}
