import { useEffect } from "react";

/**
 * The page's motion, in two parts, both off under prefers-reduced-motion:
 *  · entrances — every [data-in] element gets `.is-in` once, the first time it is well into view; the CSS plays
 *    the choreography (staggers read --d), so nothing re-triggers or jitters on the way back up.
 *  · drift — [data-drift="k"] elements move with scroll by k × their distance from the viewport centre (px per
 *    px), written as --drift on the element; one rAF loop, transform only. Skipped on coarse/low-power devices.
 */
export default function useMotion(root: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    // ?motion=0 (review): every block in its final state, no transitions
    const still = new URLSearchParams(location.search).get("motion") === "0";
    if (still) el.classList.add("no-motion");
    const reduced = still || matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ins = [...el.querySelectorAll<HTMLElement>("[data-in]")];
    if (reduced || !("IntersectionObserver" in window)) {
      ins.forEach((n) => n.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -18% 0px", threshold: 0.12 }
    );
    ins.forEach((n) => io.observe(n));

    // parallax drift: desktops and capable tablets only
    const weak =
      matchMedia("(pointer: coarse)").matches &&
      ((navigator.hardwareConcurrency || 8) <= 4 || ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4);
    const drifts = weak ? [] : [...el.querySelectorAll<HTMLElement>("[data-drift]")];
    let raf = 0;
    const tick = () => {
      raf = 0;
      const vh = innerHeight;
      for (const d of drifts) {
        const r = d.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) continue;
        const k = Number(d.dataset.drift) || 0.08;
        const off = (r.top + r.height / 2 - vh / 2) * k;
        d.style.setProperty("--drift", `${off.toFixed(1)}px`);
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(tick); };
    if (drifts.length) {
      addEventListener("scroll", onScroll, { passive: true });
      addEventListener("resize", onScroll);
      tick();
    }
    return () => {
      io.disconnect();
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [root]);
}
