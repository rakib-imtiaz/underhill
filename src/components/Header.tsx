import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import SmartLink from "./SmartLink";
import { PRIMARY_NAV, CAREERS_HREF } from "../data/nav";
import { useDaylight } from "../pages/landing/daylight";
import "../styles/nav-3d.css";

type Props = {
  menuOpen: boolean;
  onToggleMenu: () => void;
  /** "landing": Home's header (the approved mockup) — a solid white bar (navy at night), the menu
      centred, search, the daylight switch and "Let's talk". Styled by pages/landing/landing.css. */
  variant?: "default" | "landing";
};

const ArrowIcon = () => (
  <svg className="ld-arrow" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M2 8h11M9 4l4 4-4 4" />
  </svg>
);

/** the sun / moon pill (Home only): flips body.is-day and remembers the choice */
function DaylightToggle() {
  const [day, toggle] = useDaylight();
  return (
    <button type="button" className="daylight" aria-pressed={day} aria-label="Daylight on/off" title="Daylight" onClick={toggle}>
      <span className="daylight__knob" aria-hidden="true" />
      <svg className="daylight__moon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19.5 14.6A7.6 7.6 0 0 1 9.4 4.5a7.6 7.6 0 1 0 10.1 10.1z" />
      </svg>
      <svg className="daylight__sun" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
      </svg>
    </button>
  );
}

/** Replaces the sticky-header half of the static site's js/main.js,
    plus a scroll-progress rule along the header's bottom edge. */
export default function Header({ menuOpen, onToggleMenu, variant = "default" }: Props) {
  const landing = variant === "landing";
  const [scrolled, setScrolled] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const rafId = useRef(0);
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => {
      /* rAF-throttle: one style write per frame at most */
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        setScrolled(window.scrollY > (landing ? 24 : 40));
        const doc = document.documentElement;
        const max = doc.scrollHeight - window.innerHeight;
        const p = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
        progressRef.current?.style.setProperty(
          "transform",
          `scaleX(${p.toFixed(4)})`
        );
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId.current);
    };
  }, [landing]);

  const isCurrent = (href: string) =>
    pathname.replace(/\/$/, "") === href.replace(/\/$/, "");

  /* after client-side navigation, drop focus from any nav link so its
     dropdown doesn't stay open via :focus-within on the new page */
  useEffect(() => {
    const el = document.activeElement;
    if (el instanceof HTMLElement && el.closest(".site-head")) el.blur();
  }, [pathname]);

  const groupActive = (group: (typeof PRIMARY_NAV)[number]) =>
    isCurrent(group.href) ||
    !!group.children?.some((c) => isCurrent(c.href));

  return (
    <header
      className={
        "site-head" +
        /* the landing bar is always solid, so it keeps its own scrolled class (just a deeper shadow) */
        (landing ? ` ld-head${scrolled ? " is-scrolled" : ""}${menuOpen ? " menu-open" : ""}` : scrolled ? " scrolled" : "")
      }
    >
      <div className="container">
        <Link className="logo" to="/" aria-label="Underhill Geomatics — home">
          <img
            className="logo-light"
            src="/assets/uploads/2024/12/REV-UG-Horozontal-RGB.png"
            alt="Underhill Geomatics"
          />
          <img
            className="logo-dark"
            src="/assets/uploads/2024/12/Underhill-Horozontal-RGB.png"
            alt="Underhill Geomatics"
          />
        </Link>

        <nav className="nav" aria-label="Primary">
          <ul>
            {PRIMARY_NAV.map((group) => (
              <li
                key={group.label}
                className={
                  (group.children ? "has-drop" : "") +
                  (groupActive(group) ? " active" : "")
                }
              >
                <SmartLink
                  to={group.href}
                  unported={group.unported}
                  aria-current={isCurrent(group.href) ? "page" : undefined}
                  aria-haspopup={group.children ? "true" : undefined}
                >
                  {group.label}
                  {group.children ? <span className="caret" aria-hidden="true" /> : null}
                </SmartLink>
                {group.children ? (
                  <ul className="drop">
                    {group.children.map((child) => (
                      <li key={child.href + child.label} className={child.sep ? "is-sep" : undefined} data-sep={child.sep || undefined}>
                        <SmartLink
                          to={child.href}
                          unported={child.unported}
                          aria-current={isCurrent(child.href) ? "page" : undefined}
                        >
                          {child.label}
                        </SmartLink>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </nav>

        {landing ? (
          <>
            <a className="ld-search" href="https://underhill.ca/?s=" aria-label="Search underhill.ca">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m15.5 15.5 5 5" />
              </svg>
            </a>
            <DaylightToggle />
            {/* opens the Let's Talk side panel (Footer.tsx) */}
            <a className="btn small join" href="#lets-talk">
              Let's talk <ArrowIcon />
            </a>
          </>
        ) : (
          <SmartLink className="btn small join" to={CAREERS_HREF}>
            Join The Team
          </SmartLink>
        )}

        <button
          type="button"
          className={`burger${menuOpen ? " open" : ""}`}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={onToggleMenu}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
      <div className="head-progress" ref={progressRef} aria-hidden="true" />
    </header>
  );
}
