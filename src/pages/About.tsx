import { Link } from "react-router-dom";
import PageHero from "../components/PageHero";
import CtaBand from "../components/CtaBand";
import SmartLink from "../components/SmartLink";
import useDocumentMeta from "../hooks/useDocumentMeta";
import {
  UxStyle,
  ContourDivider,
  CountUp,
  ProjectsTeaser,
} from "./motifs";

const VALUES = [
  {
    num: "01",
    title: "Professional",
    body: "Striving to serve clients, employees, and the public with honesty and respect.",
  },
  {
    num: "02",
    title: "Passionate",
    body: "Working with dedication toward our projects, and generosity towards our people and communities.",
  },
  {
    num: "03",
    title: "Collaborative",
    body: "Supporting each other to generate incredible results.",
  },
  {
    num: "04",
    title: "Innovative",
    body: "Leveraging our expertise, experience, and continuous learning to create solutions.",
  },
];

const INDUSTRIES = [
  "Land Development and Construction",
  "Municipal & Provincial Governements",
  "Ports and Marine Operators",
  "Indigenous Communities",
  "Mining Operations",
  "Oil and Gas Companies",
  "Legal Professionals",
  "Transportation & Infrastructure",
];

const GROUP_COMPANIES = [
  {
    name: "Underhill & Underhill",
    body: "A partnership of professional land surveyors.",
  },
  {
    name: "Underhill Geomatics Ltd.",
    body: "The surveying engineering services arm of the firm.",
  },
];

const MILESTONES = [
  {
    year: "1913",
    era: "The Founding Partnership",
    heading: "Two Brothers, One Transit",
    body: "Underhill traces its roots back to late 1913, when brothers Frederic Clare Underhill (Clare) and James Theodore Underhill (J.T.) established the Underhill & Underhill partnership.",
    img: "/assets/uploads/2025/08/1913-FC_Underhill_JT_Underhill.jpg",
    alt: "Frederic Clare Underhill and James Theodore Underhill, founders of Underhill & Underhill, 1913",
  },
  {
    year: "1919",
    era: "After the Great War",
    heading: "Rebuilt on Integrity",
    body: "Following their service in World War I, the brothers channeled their dedication and energy into building a successful land surveying and engineering firm in British Columbia. Their commitment to high standards and personal integrity quickly earned them recognition as leaders in the field.",
    img: "/assets/uploads/2025/08/1935_corp_of_Land_Surveyors.jpg-rotated-e1756401994922.jpg",
    alt: "Corporation of BC Land Surveyors 1935 Executive, F.C. Underhill back row left",
  },
  {
    year: "Today",
    era: "A National Reputation",
    heading: "A Century Later, Still Leading",
    body: "In the years since, Underhill has grown into one of the most trusted professional land surveying and geomatics companies in Canada.",
    img: "/assets/uploads/2025/06/land-surveying_039_underhill-geomatics__Eagle-Vision-Agency_.webp",
    alt: "Underhill surveyor working with modern field equipment",
  },
];

const WHY_CLIENTS = [
  {
    num: "01",
    title: "Deep Industry Experience",
    body: "More than a century of in-depth land surveys across railways, highways, tunnels, mines, and port facilities.",
  },
  {
    num: "02",
    title: "Cross-Sector Adaptability",
    body: "A track record that spans public and private sectors, meeting the unique needs of each industry.",
  },
  {
    num: "03",
    title: "Transparent Communication",
    body: "Ethical practices and clear dialogue at every stage of the engagement.",
  },
  {
    num: "04",
    title: "Safety & Environment",
    body: "A strong focus on safety and environmental responsibility on every project.",
  },
];

export default function About() {
  useDocumentMeta(
    "About | Underhill Geomatics",
    "Founded in 1913, Underhill Geomatics has earned a trusted reputation across British Columbia, the Yukon, the Northwest Territories, and Nunavut."
  );

  return (
    <main id="main">
      <UxStyle />
      <PageHero
        image="/assets/uploads/2025/05/Underhill-Geomatics-Burnaby_029_Eagle-Vision-Agency_20240510.jpg"
        title="Underhill Geomatics"
        subtitle="A Century of Surveying Excellence Across Canada"
        lead="Founded in 1913, Underhill Geomatics has earned a trusted reputation across British Columbia, the Yukon, the Northwest Territories, and Nunavut."
      />

      {/* ------------------------------------------------ established legacy */}
      <section className="section">
        <div className="container split">
          <div className="reveal">
            <span className="kicker">Since 1913</span>
            <h2>An Established Legacy</h2>
            <p>
              Underhill has provided professional land surveying and geomatics
              solutions for clients throughout British Columbia, the Yukon, the
              Northwest Territories, and Nunavut.
            </p>
            <p>
              With an experienced team using advanced technology, we have
              partnered with clients across a variety of industries to help them
              make data-driven decisions for successful project outcomes.
            </p>
            <Link className="btn" to="/our-approach/" style={{ marginTop: 14 }}>
              Our Approach
            </Link>
          </div>
          <div className="figure reveal" style={{ transitionDelay: "120ms" }}>
            <img
              src="/assets/uploads/2025/08/1913-FC_Underhill_JT_Underhill.jpg"
              alt="Clare and J.T. Underhill, the brothers who founded the firm in 1913"
              loading="lazy"
            />
            <span className="cap">CLARE &amp; J.T. UNDERHILL · EST. 1913</span>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- stat band */}
      <section className="section dark tight">
        <div className="container reveal">
          <span className="kicker">By the Numbers</span>
          <h2>A Century of Surveying Excellence</h2>
          <div className="stats">
            <div className="stat">
              <div className="n">
                <CountUp to={110} suffix="+" />
              </div>
              <div className="l">Years of practice</div>
            </div>
            <div className="stat">
              <div className="n">
                <CountUp to={1913} duration={1800} />
              </div>
              <div className="l">Founded in Vancouver</div>
            </div>
            <div className="stat">
              <div className="n">
                <CountUp to={5} />
              </div>
              <div className="l">Offices across BC &amp; Yukon</div>
            </div>
            <div className="stat">
              <div className="n">
                <CountUp to={9} />
              </div>
              <div className="l">Geospatial service lines</div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- values */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="kicker">Who We Are</span>
            <h2>Professional Land Surveyors &amp; Geomatics Engineers</h2>
            <p className="lead">
              Underhill is a group of professional land surveyors and geomatics
              engineers providing full-service geomatics consulting and
              technical services.
            </p>
          </div>
          <div className="cards">
            {VALUES.map((v, i) => (
              <div
                className="card light reveal"
                style={{ transitionDelay: `${i * 90}ms` }}
                key={v.num}
              >
                <span className="num">{v.num}</span>
                <h3>{v.title}</h3>
                <p>{v.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ what we do */}
      <section className="section grey">
        <div className="container">
          <div className="reveal">
            <span className="kicker">What We Do</span>
            <h2>What We Do at Underhill Geomatics</h2>
            <p className="lead">
              As your full-service geomatics partner, we provide timely,
              flexible, and efficient solutions for a wide range of industries.
            </p>
            <p>
              For more than a century, we've performed in-depth land surveys for
              railways, highways, residential and commercial developments,
              tunnels, mines, oil and gas operations, and port facilities. This
              diverse experience allows us to meet the unique needs of each
              sector while maintaining the highest standards of accuracy and
              professionalism.
            </p>
            <p>We're proud to support:</p>
            <ul className="check two-col">
              {INDUSTRIES.map((ind) => (
                <li key={ind}>{ind}</li>
              ))}
            </ul>
            <Link
              className="btn"
              to="/geospatial-services/"
              style={{ marginTop: 20 }}
            >
              Explore Our Services
            </Link>
          </div>
          <ContourDivider />
        </div>
      </section>

      {/* -------------------------------------------- group of companies */}
      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="kicker">Our Structure</span>
            <h2>The Underhill Group of Companies</h2>
            <p className="lead">The Underhill Group consists of two companies:</p>
          </div>
          <div className="cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            {GROUP_COMPANIES.map((c, i) => (
              <div
                className="card light reveal"
                style={{ transitionDelay: `${i * 90}ms` }}
                key={c.name}
              >
                <h3>{c.name}</h3>
                <p>{c.body}</p>
              </div>
            ))}
          </div>
          <div className="reveal">
            <blockquote className="ux-quote">
              Underhill's company philosophy is structured upon our commitment
              to people. We believe that combining experience and integrity with
              technology supports the essential growth necessary to service the
              rapidly developing needs of our clients.
            </blockquote>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- history */}
      <section className="section grey">
        <div className="container">
          <div className="reveal">
            <span className="kicker">Our History</span>
            <h2>A History Over 110 Years in the Making</h2>
          </div>
          <div className="timeline">
            {MILESTONES.map((m) => (
              <div className="tl-item reveal" key={m.year}>
                <div className="year">{m.year}</div>
                <div className="body">
                  <span className="era">{m.era}</span>
                  <h3>{m.heading}</h3>
                  <p>{m.body}</p>
                  <img src={m.img} alt={m.alt} loading="lazy" />
                </div>
              </div>
            ))}
          </div>
          <div className="reveal" style={{ marginTop: 30 }}>
            <SmartLink
              className="btn"
              to="/history-of-underhill-geomatics/"
            >
              Explore Our History
            </SmartLink>
          </div>
        </div>
      </section>

      {/* ------------------------------------- people & innovation split */}
      <section className="section">
        <div className="container split">
          <div className="figure reveal">
            <img
              src="/assets/uploads/2025/06/3d-laser-scanning045_underhill-geomatics__Eagle-Vision-Agency_.jpg"
              alt="Underhill specialist operating a 3D laser scanner"
              loading="lazy"
            />
            <span className="cap">REALITY CAPTURE · 3D LASER SCANNING</span>
          </div>
          <div className="reveal" style={{ transitionDelay: "120ms" }}>
            <span className="kicker">People &amp; Innovation</span>
            <h2>Our Commitment to People and Innovation</h2>
            <p>
              At Underhill Geomatics, we believe that the best outcomes come
              from investing in our people. Our team combines long-standing
              expertise with continuous learning and innovation.
            </p>
            <p>
              We use leading-edge technology—including UAVs, 3D scanning, and
              geospatial tools—to support data-driven decisions and maintain the
              highest standards of quality.
            </p>
            <div className="ux-chips">
              <span className="ux-chip">UAVs</span>
              <span className="ux-chip">3D Scanning</span>
              <span className="ux-chip">Geospatial Tools</span>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- why clients */}
      <section className="section grey">
        <div className="container">
          <div className="reveal">
            <span className="kicker">Why Underhill</span>
            <h2>Why Clients Choose Underhill Geomatics</h2>
            <p className="lead">
              Clients rely on us for more than just accurate data. We are known
              for:
            </p>
          </div>
          <div className="cards">
            {WHY_CLIENTS.map((w, i) => (
              <div
                className="card light reveal"
                style={{ transitionDelay: `${i * 90}ms` }}
                key={w.num}
              >
                <span className="num">{w.num}</span>
                <h3>{w.title}</h3>
                <p>{w.body}</p>
              </div>
            ))}
          </div>
          <div className="reveal" style={{ marginTop: 30 }}>
            <SmartLink to="/about-underhill-geomatics/health-safety/" unported>
              Health &amp; Safety at Underhill →
            </SmartLink>
          </div>
        </div>
      </section>

      <ProjectsTeaser />

      <CtaBand />
    </main>
  );
}
