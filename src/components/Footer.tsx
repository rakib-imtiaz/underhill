import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import SmartLink from "./SmartLink";
import "../styles/footer.css";

type Props = {
  /** raises the success toast — client-side only demo, same as the source */
  onSent: () => void;
};

const COLUMNS: { title: string; links: { label: string; href: string; ext?: boolean }[] }[] = [
  {
    title: "Company",
    links: [
      { label: "About", href: "/about-underhill-geomatics/" },
      { label: "Our Team", href: "/our-team/" },
      { label: "Careers", href: "/careers/" },
      { label: "Projects", href: "/land-surveying-projects/" },
    ],
  },
  {
    title: "Expertise",
    links: [
      { label: "Land", href: "/geospatial-services/topographic-surveying/" },
      { label: "Water", href: "/geospatial-services/hydrographic-surveying/" },
      { label: "Air", href: "/geospatial-services/aerial-surveying/" },
      { label: "Data", href: "/geospatial-services/3d-laser-scanning-reality-capture/" },
    ],
  },
  {
    title: "Locations",
    links: [
      { label: "Vancouver", href: "/vancouver-land-surveyors/" },
      { label: "Vancouver Island", href: "/vancouver-island-land-surveyors/" },
      { label: "Kamloops", href: "/kamloops-land-surveyors/" },
      { label: "Whitehorse", href: "/whitehorse-land-surveyors/" },
    ],
  },
  {
    title: "Client Tools",
    links: [
      /* the source footer links these to Underhill's external client systems */
      { label: "Panoramas", href: "https://clients.underhill.ca/auth/start.html", ext: true },
      { label: "Map Check Tool", href: "https://underhillgeo.com/map_check.php", ext: true },
    ],
  },
];

const Arrow = () => (
  <svg className="sf-arrow" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * The site footer: a survey band (the closing call to action, with the offices as survey stations over a Yukon
 * range), then the footer proper. "Request a consultation" — and every #lets-talk link on the site — opens the
 * Let's Talk form in a side panel.
 */
export default function Footer({ onSent }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const bandRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const { hash, pathname } = useLocation();

  // #lets-talk (from any page's CTA) lands on the band and opens the form
  useEffect(() => {
    const check = () => { if (location.hash === "#lets-talk") setOpen(true); };
    check();
    addEventListener("hashchange", check);
    return () => removeEventListener("hashchange", check);
  }, [hash, pathname]);

  const close = () => {
    setOpen(false);
    if (location.hash === "#lets-talk") history.replaceState(null, "", location.pathname + location.search);
  };
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    addEventListener("keydown", k);
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => { removeEventListener("keydown", k); document.documentElement.style.overflow = prev; };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // the band's survey build plays once, when it arrives
  useEffect(() => {
    const el = bandRef.current;
    if (!el) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) { el.classList.add("is-in"); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { el.classList.add("is-in"); io.disconnect(); } }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const onSubmit = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    onSent();
    formRef.current?.reset();
    close();
  };

  return (
    <>
      {/* ---------------- the survey band ---------------- */}
      <section className="sf-band" id="lets-talk" ref={bandRef}>
        <div className="sf-band-bg" aria-hidden="true"><img src="/team/footer-range.webp" alt="" loading="lazy" /></div>
        <svg className="sf-stations" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
          <polyline className="sf-line" points="520,170 690,330 905,410" pathLength={1} />
          <polyline className="sf-pkt" points="520,170 690,330 905,410" pathLength={1} />
          <line className="sf-drop" x1="520" y1="40" x2="520" y2="170" />
          <line className="sf-drop" x1="905" y1="300" x2="905" y2="410" />
        </svg>
        <div className="sf-pin" style={{ left: "52%", top: "28.3%", ["--i" as string]: 0 }}><i /><span>Whitehorse</span></div>
        <div className="sf-pin" style={{ left: "69%", top: "55%", ["--i" as string]: 1 }}><i /><span>Kamloops</span></div>
        <div className="sf-pin is-left" style={{ left: "90.5%", top: "68.3%", ["--i" as string]: 2 }}><i /><span>Vancouver</span></div>
        <p className="sf-coord is-a" aria-hidden="true"><b>+</b>60.7212° N<br />135.0568° W</p>
        <p className="sf-coord is-b" aria-hidden="true">49.2827° N<br />123.1207° W</p>
        <div className="sf-band-copy">
          <h2>Data for a <em>brighter</em> <em>tomorrow.</em></h2>
          <span className="sf-rule" aria-hidden="true" />
          <p>Geospatial solutions built on over a century of precision.</p>
          <button type="button" className="sf-btn" onClick={() => setOpen(true)}>Request a consultation <Arrow /></button>
        </div>
      </section>

      {/* ---------------- the footer proper ---------------- */}
      <footer className="sf-foot">
        <div className="sf-wrap sf-top">
          <div className="sf-brand">
            <Link className="sf-logo" to="/"><img src="/assets/uploads/2024/12/REV-UG-Horozontal-RGB.png" alt="Underhill Geomatics" /></Link>
            <span className="sf-rule" aria-hidden="true" />
            <p>Advanced geospatial solutions backed by more than a century of experience.</p>
            <p className="sf-offices">Vancouver · Vancouver Island · Kamloops · Whitehorse</p>
          </div>
          {COLUMNS.map((col) => (
            <nav key={col.title} className="sf-col" aria-label={col.title}>
              <h4>{col.title}</h4>
              <ul>
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.ext ? <a href={l.href} target="_blank" rel="noopener">{l.label}</a> : <SmartLink to={l.href}>{l.label}</SmartLink>}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
          <div className="sf-social">
            <h4>Stay connected</h4>
            <div>
              <a href="https://www.linkedin.com/company/underhill-geomatics-ltd/" target="_blank" rel="noopener" aria-label="Underhill Geomatics on LinkedIn">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.9 8.6H3.6V20h3.3V8.6zM5.25 3.5a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8zM20.4 13.2c0-3.1-1.7-4.8-4.1-4.8-1.8 0-2.7 1-3.1 1.7V8.6H9.9V20h3.3v-6c0-1.6.6-2.6 2-2.6s1.9 1 1.9 2.6v6h3.3v-6.8z" /></svg>
              </a>
              <a href="https://www.facebook.com/UnderhillGeomat" target="_blank" rel="noopener" aria-label="Underhill Geomatics on Facebook">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.6 21v-7.6h2.6l.4-3h-3V8.5c0-.9.3-1.5 1.5-1.5h1.6V4.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.9v3h2.6V21h3.1z" /></svg>
              </a>
            </div>
          </div>
        </div>
        <div className="sf-wrap sf-bottom">
          <span>© 2026 Underhill Geomatics Ltd. All rights reserved.</span>
          <a href="/privacy-policy/">Privacy Policy</a>
          <span className="sf-grid">49.2827° N, 123.1207° W — NAD83</span>
          <svg className="sf-peaks" viewBox="0 0 54 20" aria-hidden="true"><path d="M1 19 L14 5 L21 12 L30 2 L42 14 L47 9 L53 19" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
        </div>
      </footer>

      {/* ---------------- Let's Talk, in a side panel ---------------- */}
      <div className={`sf-talk${open ? " is-open" : ""}`} aria-hidden={!open} onClick={close}>
        <aside className="sf-talk-panel" role="dialog" aria-modal="true" aria-labelledby="sf-talk-h" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="sf-talk-close" onClick={close} aria-label="Close">×</button>
          <p className="sf-kicker">Let’s talk</p>
          <h3 id="sf-talk-h">Request a consultation</h3>
          <p className="sf-talk-lede">You need accurate data and a partner who understands the stakes. Tell us about your project.</p>
          <form className="sf-form" ref={formRef} noValidate onSubmit={onSubmit}>
            <div className="sf-row">
              <input type="text" name="name" placeholder="Name *" required />
              <input type="tel" name="phone" placeholder="Phone" />
            </div>
            <input type="email" name="email" placeholder="Email *" required />
            <select name="branch" aria-label="Branch" defaultValue="" required>
              <option value="" disabled>Select a branch</option>
              <option>General</option>
              <option>Vancouver</option>
              <option>Vancouver Island</option>
              <option>Kamloops</option>
              <option>Whitehorse</option>
            </select>
            <textarea name="message" placeholder="Message *" required />
            <button className="sf-btn" type="submit">Send <Arrow /></button>
          </form>
        </aside>
      </div>
    </>
  );
}
