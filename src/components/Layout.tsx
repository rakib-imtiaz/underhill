import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Header from "./Header";
import MobileNav from "./MobileNav";
import Footer from "./Footer";
import Toast from "./Toast";
import useReveal from "../hooks/useReveal";

export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);
  const { pathname, hash } = useLocation();

  useReveal(pathname);

  /* A client-side navigation must land at the top of the new page, otherwise
     the sticky 800vh hero track leaves you mid-document. A hash target gets
     native smooth scrolling instead (e.g. `#lets-talk` on the footer). */
  useEffect(() => {
    if (hash) {
      try {
        const el = document.querySelector(hash);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch {
        /* not a valid selector — nothing to scroll to */
      }
      return;
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  /* close the mobile menu whenever the route changes */
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(
    () => () => {
      window.clearTimeout(toastTimer.current);
    },
    []
  );

  const showToast = useCallback(() => {
    setToast(true);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(false), 5200);
  }, []);

  return (
    <>
      <a className="skip" href="#main">
        Skip to main content
      </a>
      <Header menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((v) => !v)} />
      <MobileNav open={menuOpen} onClose={() => setMenuOpen(false)} />
      {/* keying on pathname remounts each route and replays the .page-shell
          fade (CSS animation, transform+opacity only, reduced-motion safe) */}
      <div className="page-shell" key={pathname}>
        {/* lazily loaded pages: keep the header and footer up while a page's chunk arrives */}
        <Suspense fallback={<div style={{ minHeight: "100vh" }} />}>
          <Outlet />
        </Suspense>
      </div>
      <Footer onSent={showToast} />
      <Toast show={toast} />
    </>
  );
}
