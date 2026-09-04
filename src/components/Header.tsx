import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import SmartLink from "./SmartLink";
import { PRIMARY_NAV, CAREERS_HREF } from "../data/nav";

type Props = {
  menuOpen: boolean;
  onToggleMenu: () => void;
};

/** Replaces the sticky-header half of the static site's js/main.js,
    plus a scroll-progress rule along the header's bottom edge. */
export default function Header({ menuOpen, onToggleMenu }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const rafId = useRef(0);
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => {
      /* rAF-throttle: one style write per frame at most */
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        setScrolled(window.scrollY > 40);
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
  }, []);

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
    <header className={`site-head${scrolled ? " scrolled" : ""}`}>
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
                      <li key={child.href + child.label}>
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

        <SmartLink className="btn small join" to={CAREERS_HREF}>
          Join The Team
        </SmartLink>

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
