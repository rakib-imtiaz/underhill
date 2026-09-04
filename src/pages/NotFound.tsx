import { Link } from "react-router-dom";
import useDocumentMeta from "../hooks/useDocumentMeta";
import "../styles/notfound.css";

const LINKS = [
  { to: "/", label: "Home", d: "Back to the starting point" },
  { to: "/geospatial-services/", label: "Geospatial Services", d: "What we do" },
  { to: "/land-surveying-projects/", label: "Projects", d: "A legacy of precision since 1913" },
  { to: "/about-underhill-geomatics/", label: "About", d: "Underhill Geomatics" },
  { to: "/our-team/", label: "Meet the Team", d: "Our professionals, your partners" },
  { to: "/vancouver-land-surveyors/", label: "Contact", d: "Four offices across BC & Yukon" },
];

/**
 * The static clone contains many more pages than this port; anything not
 * routed lands here rather than on a blank screen.
 */
export default function NotFound() {
  useDocumentMeta("Page Not Found | Underhill Geomatics");

  return (
    <main id="main">
      <section className="nf">
        <div className="container">
          <span className="kicker">Error 404 — Signal Lost</span>
          <div className="mark" aria-hidden="true">
            404
          </div>
          <h1>This Point Isn't on Our Grid</h1>
          <p className="lead">
            The page you're looking for has moved, been retired, or was never
            surveyed in the first place. Let's get you back to a known coordinate.
          </p>
          <div className="actions">
            <Link className="btn" to="/">
              Back to Home
            </Link>
            <a className="btn ghost" href="#lets-talk">
              Contact Us
            </a>
          </div>
          <nav className="nf-links" aria-label="Popular pages">
            {LINKS.map((l) => (
              <Link to={l.to} key={l.to}>
                {l.label}
                <span className="d">{l.d}</span>
              </Link>
            ))}
          </nav>
        </div>
      </section>
    </main>
  );
}
