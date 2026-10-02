import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import useDocumentMeta from "../hooks/useDocumentMeta";
import useMotion from "./team/useMotion";
import Reach from "./team/Reach";
import Timeline from "./team/Timeline";
import { CULTURE, EXPERTISE, LEADERS, YOUTUBE_ID, type Leader } from "./team/content";
import "./team/team.css";

const SPOT_TEXT =
  "With more than twenty-five years in land surveying and geomatics, Chris leads the Underhill Group of Companies with a commitment to professionalism, technical excellence, innovation and client-focused service.";

const Arrow = () => (
  <svg className="tm-arrow" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* line icons for the four expertise cards (stroke-drawn on entrance) */
const ICONS: Record<string, JSX.Element> = {
  land: <path d="M12 3v4M12 7l-6 14M12 7l6 14M8.5 15h7M12 7a2 2 0 1 0 0-.01" />,
  water: <path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 19c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />,
  air: <path d="M12 10l-3 3h6zM4 6h5M15 6h5M6.5 6v3l3 1M17.5 6v3l-3 1M12 13v3M10 19h4" />,
  data: <path d="M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />,
};

/** a headline split into lines that rise in turn (each line masked) */
function Lines({ lines, as: Tag = "h2", className = "" }: { lines: (string | JSX.Element)[]; as?: "h1" | "h2"; className?: string }) {
  return (
    <Tag className={`tm-lines ${className}`}>
      {lines.map((l, i) => (
        <span className="tm-line" key={i}><span style={{ ["--d" as string]: `${i * 0.12}s` }}>{l}</span></span>
      ))}
    </Tag>
  );
}

function VideoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => { removeEventListener("keydown", k); document.documentElement.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="tm-modal" role="dialog" aria-modal="true" aria-label="Underhill team film" onClick={onClose}>
      <div className="tm-modal-frame" onClick={(e) => e.stopPropagation()}>
        <iframe src={`https://www.youtube-nocookie.com/embed/${YOUTUBE_ID}?autoplay=1&rel=0`} title="Underhill Geomatics — our team"
          allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      </div>
      <button type="button" className="tm-modal-close" onClick={onClose} aria-label="Close video">×</button>
    </div>
  );
}

function BioPanel({ leader, onClose }: { leader: Leader | null; onClose: () => void }) {
  const [shown, setShown] = useState<Leader | null>(null);
  useEffect(() => { if (leader) setShown(leader); }, [leader]);
  useEffect(() => {
    if (!leader) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [leader, onClose]);
  const l = shown;
  return (
    <div className={`tm-bio${leader ? " is-open" : ""}`} aria-hidden={!leader} onClick={onClose}>
      <aside className="tm-bio-panel" role="dialog" aria-modal="true" aria-label={l ? `${l.name} biography` : undefined} onClick={(e) => e.stopPropagation()}>
        {l && (
          <>
            <button type="button" className="tm-bio-close" onClick={onClose} aria-label="Close">×</button>
            <div className="tm-bio-head">
              <div className="tm-bio-photo"><img src={l.img} alt="" /></div>
              <div>
                <p className="tm-eyebrow">{l.role}</p>
                <h3>{l.name}</h3>
                <p className="tm-bio-creds">{l.creds}{l.base ? ` · ${l.base}` : ""}</p>
              </div>
            </div>
            <div className="tm-bio-body">{l.bio.map((p, i) => <p key={i}>{p}</p>)}</div>
          </>
        )}
      </aside>
    </div>
  );
}

export default function Team() {
  useDocumentMeta(
    "Meet the Team | Underhill Geomatics Professionals",
    "Meet the licensed surveyors and engineers who lead Underhill Geomatics — our professionals, your partners since 1913."
  );
  const root = useRef<HTMLElement>(null);
  useMotion(root);
  const [video, setVideo] = useState(false);
  const [bio, setBio] = useState<Leader | null>(null);

  // the hero is light: the site header shows its dark logo and links over it until the page scrolls
  useEffect(() => {
    document.body.classList.add("head-on-light");
    return () => document.body.classList.remove("head-on-light");
  }, []);

  return (
    <main id="main" className="pg-team" ref={root}>
      {/* ---------------- HERO ---------------- */}
      <section className="tm-hero" data-in>
        <div className="tm-hero-copy">
          <p className="tm-eyebrow tm-rise">Meet the team · Since 1913</p>
          <Lines as="h1" lines={["A higher", "perspective", <em key="e">for what’s next.</em>]} />
          <p className="tm-lede tm-rise" style={{ ["--d" as string]: "0.45s" }}>
            At Underhill, our team is our greatest asset — licensed surveyors, engineers and technologists who bring
            practical experience and precise data to every project.
          </p>
          <div className="tm-actions tm-rise" style={{ ["--d" as string]: "0.55s" }}>
            <a className="tm-btn" href="#leadership">Meet the leadership <Arrow /></a>
            <button type="button" className="tm-play" onClick={() => setVideo(true)}>
              <span className="tm-play-dot" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M5 3.5v9l7.5-4.5z" /></svg></span>
              Watch the film
            </button>
          </div>
          <dl className="tm-stats tm-rise" style={{ ["--d" as string]: "0.68s" }}>
            <div><dt>1913</dt><dd>Founded in Vancouver</dd></div>
            <div><dt>4</dt><dd>Offices across BC &amp; the Yukon</dd></div>
            <div><dt className="is-text">BCLS · CLS · P.Eng.</dt><dd>Licensed professionals</dd></div>
          </dl>
        </div>
        <div className="tm-hero-art">
          <div className="tm-hero-img"><img src="/team/hero.webp" alt="An Underhill surveyor with a GNSS rover on a mountain summit, Ruby Creek mineral lease survey" data-drift="-0.06" fetchPriority="high" /></div>
          <ul className="tm-readout" aria-hidden="true">
            {["Measure", "Map", "Understand", "Build what’s next"].map((w, i) => <li key={w} style={{ ["--d" as string]: `${0.9 + i * 0.16}s` }}>{w}</li>)}
          </ul>
        </div>
      </section>

      {/* ---------------- OUR STORY ---------------- */}
      <section className="tm-story">
        <div className="tm-wrap tm-story-top">
          <div className="tm-story-copy" data-in>
            <p className="tm-eyebrow tm-rise">Our story</p>
            <Lines lines={["A proud history.", <em key="e">A bold future.</em>]} />
            <p className="tm-rise" style={{ ["--d" as string]: "0.3s" }}>
              In 1913 two brothers, Clare and J.T. Underhill — McGill-trained civil engineers — earned their BC Land
              Surveyor commissions and opened a small office in Vancouver. More than a century on, the standards they
              set still guide every survey we sign.
            </p>
            <Link className="tm-link tm-rise" style={{ ["--d" as string]: "0.4s" }} to="/story/">Our history <Arrow /></Link>
          </div>
          <figure className="tm-story-img" data-in>
            <img src="/team/story-bw.webp" alt="Underhill surveyors at work on an open hillside" data-drift="0.05" loading="lazy" />
            <figcaption className="tm-script" aria-label="Same spirit. Further horizons.">Same spirit.<br />Further horizons.</figcaption>
          </figure>
        </div>
        <Timeline />
      </section>

      {/* ---------------- LEADERSHIP SPOTLIGHT ---------------- */}
      <section className="tm-spot">
        <div className="tm-spot-art" aria-hidden="true" data-in>
          <div className="tm-spot-bg"><img src="/team/spotlight-peaks.webp" alt="" data-drift="0.05" loading="lazy" /></div>
          <img className="tm-spot-glass" src="/team/spotlight-glass.webp" alt="" loading="lazy" data-drift="-0.04" />
          <span className="tm-spot-light" />
          <img className="tm-spot-person" src="/team/leader-chris.webp" alt="" loading="lazy" />
        </div>
        <div className="tm-spot-copy" data-in>
          <p className="tm-eyebrow tm-rise">Leadership spotlight</p>
          {/* the headline is read off like a survey: a scan line sweeps each line and leaves it written */}
          <h2 className="tm-scan">
            <span className="tm-scan-line" style={{ ["--d" as string]: "0.15s" }}><span>Experience guides</span></span>
            <span className="tm-scan-line" style={{ ["--d" as string]: "0.75s" }}><em>what’s next.</em></span>
          </h2>
          <p className="tm-spot-text" aria-label={SPOT_TEXT}>
            {SPOT_TEXT.split(" ").map((w, i) => (
              <span key={i} className="tm-word" aria-hidden="true" style={{ ["--w" as string]: i }}>{w}</span>
            ))}
          </p>
          <div className="tm-spot-sign tm-rise" style={{ ["--d" as string]: "2.1s" }}>
            <p className="tm-spot-name">Chris El-Araj, <span>BCLS, CLS</span></p>
            <p className="tm-spot-role">President, Underhill Group of Companies</p>
          </div>
          <button type="button" className="tm-btn tm-rise" style={{ ["--d" as string]: "2.25s" }} onClick={() => setBio(LEADERS[0])}>
            Read Chris’s bio <Arrow />
          </button>
        </div>
      </section>

      {/* ---------------- LEADERSHIP TEAM ---------------- */}
      <section className="tm-team" id="leadership">
        <div className="tm-team-collage" aria-hidden="true" data-in>
          <div className="tm-panel is-a"><img src="/team/l-peaks.webp" alt="" loading="lazy" /></div>
          <div className="tm-panel is-b"><img src="/team/l-drone.webp" alt="" loading="lazy" /></div>
          <div className="tm-panel is-c"><img src="/team/l-crew.webp" alt="" loading="lazy" /></div>
          <svg className="tm-collage-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="M100 0 L58 100" pathLength={1} />
            <path d="M48.2 0 L42.2 49.4" pathLength={1} />
            <path d="M0 55.6 L42.6 51 L77.2 60.3" pathLength={1} />
          </svg>
        </div>
        <div className="tm-team-body" data-in>
          <p className="tm-eyebrow tm-rise">Leadership team</p>
          <Lines lines={["Expertise.", "Collaboration. Impact."]} />
          <p className="tm-team-lede tm-rise" style={{ ["--d" as string]: "0.25s" }}>
            We bring together experienced professionals who are committed to delivering exceptional results for our
            clients and communities.
          </p>
          <ul className="tm-leaders">
            {LEADERS.map((l, i) => (
              <li key={l.id} style={{ ["--d" as string]: `${0.3 + i * 0.12}s` }}>
                <button type="button" className="tm-leader" onClick={() => setBio(l)} aria-label={`${l.name}, ${l.role} — read biography`}>
                  <span className="tm-leader-photo"><img src={l.img} alt="" loading="lazy" /></span>
                  <span className="tm-leader-name">{l.name}</span>
                  <span className="tm-leader-role">{l.role} · <em>{l.creds}</em></span>
                  <span className="tm-leader-sum">{l.summary}</span>
                  <span className="tm-leader-more" aria-hidden="true"><Arrow /></span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------- EXPERTISE + REACH (one dark band) ---------------- */}
      <section className="tm-dark">
        <div className="tm-wrap tm-x" data-in>
          <div className="tm-x-head">
            <div>
              <p className="tm-eyebrow tm-rise">Our expertise</p>
              <Lines lines={["Integrated geospatial", "solutions across land,", "water, air and data."]} />
            </div>
            <p className="tm-rise" style={{ ["--d" as string]: "0.25s" }}>
              From traditional surveying to advanced remote sensing, we combine people, technology and local
              knowledge to deliver accurate data for real-world decisions.
            </p>
          </div>
          <ul className="tm-x-cards">
            {EXPERTISE.map((x, i) => (
              <li key={x.key} style={{ ["--d" as string]: `${0.2 + i * 0.12}s` }}>
                <a className={`tm-xcard is-${x.key}`} href={x.href}>
                  <span className="tm-xcard-img"><img src={x.img} alt="" loading="lazy" /></span>
                  <span className="tm-xcard-body">
                    <svg className="tm-xcard-icon" viewBox="0 0 24 24" aria-hidden="true">{ICONS[x.key]}</svg>
                    <span className="tm-xcard-title">{x.title}</span>
                    <span className="tm-xcard-sub">{x.sub}</span>
                    <span className="tm-xcard-go" aria-hidden="true"><Arrow /></span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
        <Reach />
      </section>

      {/* ---------------- CULTURE ---------------- */}
      <section className="tm-culture">
        <div className="tm-wrap tm-culture-grid">
          <div className="tm-culture-copy" data-in>
            <p className="tm-eyebrow tm-rise">Our culture</p>
            <Lines lines={["A culture of curiosity,", "collaboration and purpose."]} />
            <p className="tm-rise" style={{ ["--d" as string]: "0.25s" }}>
              We’re problem-solvers, explorers and community builders — surveyors, engineers, technologists and
              pilots, united by care for the places we live and work.
            </p>
            <Link className="tm-link tm-rise" style={{ ["--d" as string]: "0.35s" }} to="/careers/">Life at Underhill <Arrow /></Link>
          </div>
          <ul className="tm-mosaic" data-in>
            {CULTURE.map((c, i) => (
              <li key={c.src} style={{ ["--d" as string]: `${0.15 + i * 0.1}s` }}>
                <img src={c.src} alt={c.alt} loading="lazy" data-drift={i === 0 ? "0.05" : i % 2 ? "-0.04" : "0.03"} />
              </li>
            ))}
          </ul>
        </div>
      </section>


      <VideoModal open={video} onClose={() => setVideo(false)} />
      <BioPanel leader={bio} onClose={() => setBio(null)} />
    </main>
  );
}
