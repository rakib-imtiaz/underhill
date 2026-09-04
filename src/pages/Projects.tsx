import { useEffect, useRef, useState } from "react";
import PageHero from "../components/PageHero";
import CtaBand from "../components/CtaBand";
import SmartLink from "../components/SmartLink";
import useDocumentMeta from "../hooks/useDocumentMeta";
import "../styles/projects.css";

/* GPU-safe count-up: rAF on a number, skipped entirely under reduced motion. */
function Stat({ value, suffix = "", label }: { value: number; suffix?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !("IntersectionObserver" in window)) {
      setN(value);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const t0 = performance.now();
        const dur = 1400;
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / dur);
          setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);

  return (
    <div className="proj-stat" ref={ref}>
      <div className="n">
        {n.toLocaleString()}
        {suffix ? <em>{suffix}</em> : null}
      </div>
      <div className="l">{label}</div>
    </div>
  );
}

const CATEGORIES = [
  {
    num: "01",
    title: "Construction",
    img: "/assets/uploads/2025/05/Underhill-Geomatics-Oakridge_024_Eagle-Vision-Agency_20230427.jpg",
    alt: "Construction surveying at the Oakridge development in Vancouver",
    body: "From residential towers to commercial developments, we support builders with construction layout, control surveys, and phase documentation.",
  },
  {
    num: "02",
    title: "Environment",
    img: "/assets/uploads/2025/08/Black-tusk.jpg",
    alt: "Black Tusk, in the Coast Mountains of British Columbia",
    body: "Our teams conduct environmental land surveys that support land restoration, ecological monitoring, and permitting across varied landscapes.",
  },
  {
    num: "03",
    title: "First Nations",
    img: "/assets/uploads/2025/08/Maa-Nulth-Survey-2009.jpg.jpg",
    alt: "Surveying the Maa-Nulth pre-effective lands on the BC West Coast, 2009",
    body: "We work alongside Indigenous communities to provide land surveying services that document land use, support planning, and define legal boundaries.",
  },
  {
    num: "04",
    title: "Infrastructure",
    img: "/assets/uploads/2025/09/canada-line-thegem-blog-justified.webp",
    alt: "The Canada Line rapid transit corridor in Vancouver",
    body: "We conduct land surveying for infrastructure projects like roads, bridges, and transit corridors — ensuring accurate alignment, grading, and long-term integrity.",
  },
  {
    num: "05",
    title: "Mining",
    img: "/assets/uploads/2025/09/ruby-creek-thegem-blog-justified.webp",
    alt: "GPS survey of a mineral lease at Ruby Creek, Atlin, BC",
    body: "We provide mining-focused land surveying, including topographic and volumetric surveys, site control, and 3D data for surface and subsurface operations.",
  },
  {
    num: "06",
    title: "Energy",
    img: "/assets/uploads/2025/09/parkland-refinery_underhill-thegem-blog-justified.jpg",
    alt: "Surveying and 3D laser scanning at the Parkland Burnaby refinery",
    body: "We have a strong track record providing surveying services for energy-related projects — ranging from dams and wind farms to oil and gas infrastructure across Western and Northern Canada.",
  },
];

const WHY = [
  {
    title: "Legal Clarity",
    body: "Defines property boundaries accurately for development, sales, and legal clarity.",
  },
  {
    title: "Construction Certainty",
    body: "Supports construction staging, permitting, and trade coordination.",
  },
  {
    title: "Documented Infrastructure",
    body: "Documents hidden infrastructure for long-term operations and upgrades.",
  },
  {
    title: "Risk Avoided",
    body: "Helps avoid costly errors, rework, or disputes across the project lifecycle.",
  },
];

const FLOW = [
  {
    phase: "Phase 01",
    title: "Project Scoping",
    body: "We collaborate with clients to define scope, timelines, and documentation needs.",
  },
  {
    phase: "Phase 02",
    title: "Field Surveying",
    body: "Using UAVs, GNSS, lidar, and total stations, our teams collect data across varied terrains.",
  },
  {
    phase: "Phase 03",
    title: "Data Processing",
    body: "High-accuracy results are processed in-house using Civil 3D, Pix4D, Cyclone, and other platforms.",
  },
  {
    phase: "Phase 04",
    title: "Quality Assurance",
    body: "Every deliverable is checked against regulatory standards and project specs.",
  },
  {
    phase: "Phase 05",
    title: "Delivery and Support",
    body: "Clients receive clear drawings, models, and data with ongoing support as projects evolve.",
  },
];

export default function Projects() {
  useDocumentMeta(
    "Land Surveying Projects Across Canada | Underhill Geomatics",
    "A legacy of precision since 1913 — land surveying projects across Canada."
  );

  return (
    <main id="main">
      <PageHero
        image="/assets/uploads/2025/05/Underhill-Geomatics-Oakridge_001_Eagle-Vision-Agency_20230427.jpg"
        title="Land Surveying Projects Across Canada"
        subtitle="A Legacy of Precision Since 1913"
        lead="Land surveying is at the heart of everything we do. For over a century, Underhill has delivered professional land surveying services across Canada."
      />

      <section className="proj-stats" aria-label="Underhill project experience in numbers">
        <div className="container">
          <Stat value={110} suffix="+" label="Years of Practice" />
          <Stat value={7} label="Project Categories" />
          <Stat value={4} label="Offices in BC & Yukon" />
          <Stat value={1913} label="Established" />
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="reveal">
            <span className="kicker">Categories</span>
            <h2>Explore Land Surveying Projects by Category</h2>
            <p className="lead">
              Our projects help define property boundaries, guide development, and
              support infrastructure delivery at every scale — from major construction
              corridors to heritage buildings and remote resource operations.
            </p>
          </div>
          <div className="proj-grid">
            {CATEGORIES.map((c, i) => (
              <article
                className={`proj-card reveal${i === 0 ? " featured" : ""}`}
                key={c.num}
                style={{ transitionDelay: `${(i % 3) * 90}ms` }}
              >
                <div className="shot">
                  <img src={c.img} alt={c.alt} loading="lazy" />
                </div>
                <div className="body">
                  <span className="num">{c.num}</span>
                  <h3>{c.title}</h3>
                  <p>{c.body}</p>
                </div>
              </article>
            ))}

            {/* the archive card closes the grid and hands off to the Story page */}
            <SmartLink
              to="/story/"
              className="proj-card reveal"
              style={{ transitionDelay: "180ms" }}
            >
              <div className="shot">
                <img
                  src="/assets/uploads/2025/08/Metropolitan-Building-ca-1921-city-archives-Bu-N339-Major-Matthew-collection_UU-office-1919-1921.jpg"
                  alt="The Metropolitan Building, office of Underhill & Underhill from 1919 to 1921"
                  loading="lazy"
                />
              </div>
              <div className="body">
                <span className="num">07</span>
                <h3>Historical Projects</h3>
                <p>
                  From heritage structures to historic land claims, our land
                  surveying work documents over a century of physical and legal
                  development. With project records dating back to 1913, we bring
                  deep archival knowledge and continuity to complex restoration
                  and redevelopment efforts.
                </p>
                <span className="more">Explore Our Story</span>
              </div>
            </SmartLink>
          </div>
        </div>
      </section>

      <section className="section dark">
        <div className="container">
          <div className="reveal">
            <span className="kicker">Why It Matters</span>
            <h2>Why Land Surveying Matters</h2>
            <p className="lead on-dark">
              Land surveying supports legal, design, and construction workflows across
              every project type. Here's why it matters:
            </p>
          </div>
          <div className="proj-why">
            {WHY.map((w, i) => (
              <div
                className="cell reveal"
                key={w.title}
                style={{ transitionDelay: `${i * 90}ms` }}
              >
                <h3>{w.title}</h3>
                <p>{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section grey">
        <div className="container">
          <div className="reveal">
            <span className="kicker">How We Work</span>
            <h2>How We Deliver Land Surveying Projects</h2>
            <p className="lead">
              Our proven approach to land surveying combines technical precision with a
              deep understanding of Canadian landscapes. Here's how we work:
            </p>
          </div>
          <div className="proj-flow">
            {FLOW.map((f, i) => (
              <div
                className="station reveal"
                key={f.phase}
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <span className="phase">{f.phase}</span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBand />
    </main>
  );
}
