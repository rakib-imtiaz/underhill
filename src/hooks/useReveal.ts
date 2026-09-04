import { useEffect } from "react";

/**
 * Reveal-on-scroll + animated counters (design-system level).
 *
 * Reveal API (class-driven, no wrapper component needed):
 *   .reveal           — fade + slide-up        (base pattern)
 *   .reveal-l/.reveal-r — slide in from a side
 *   .reveal-scale     — gentle scale-in
 *   .reveal-stagger   — children cascade; --i is assigned automatically
 *                       (set style={{ ["--i" as string]: n }} to override)
 *   style={{ ["--reveal-delay" as string]: "120ms" }} delays any variant.
 *
 * Counter API:
 *   <span data-count="110" data-suffix="+">110+</span>
 *   animates textContent 0 → 110+ when scrolled into view.
 *   Optional: data-prefix, data-decimals="1".
 *
 * Everything collapses to final state under prefers-reduced-motion.
 * Re-runs on every route change, when a fresh crop of nodes appears.
 */
const REVEAL_SEL = ".reveal, .reveal-l, .reveal-r, .reveal-scale, .reveal-stagger";

function formatCount(el: HTMLElement, value: number) {
  const decimals = Number(el.dataset.decimals ?? 0);
  const text = value.toLocaleString("en-CA", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  el.textContent = `${el.dataset.prefix ?? ""}${text}${el.dataset.suffix ?? ""}`;
}

function animateCount(el: HTMLElement, reduced: boolean) {
  const target = Number(el.dataset.count);
  if (!Number.isFinite(target)) return;
  if (reduced) {
    formatCount(el, target);
    return;
  }
  const DURATION = 1600;
  const t0 = performance.now();
  const tick = (now: number) => {
    const p = Math.min((now - t0) / DURATION, 1);
    const eased = 1 - Math.pow(1 - p, 3); /* easeOutCubic */
    formatCount(el, target * eased);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export default function useReveal(key: string) {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealEls = Array.from(document.querySelectorAll<HTMLElement>(REVEAL_SEL));
    const countEls = Array.from(document.querySelectorAll<HTMLElement>("[data-count]"));
    if (!revealEls.length && !countEls.length) return;

    /* stagger children get an index if the author didn't set one inline */
    document.querySelectorAll<HTMLElement>(".reveal-stagger").forEach((wrap) => {
      Array.from(wrap.children).forEach((child, i) => {
        const el = child as HTMLElement;
        if (!el.style.getPropertyValue("--i")) el.style.setProperty("--i", String(i));
      });
    });

    if (reduced || !("IntersectionObserver" in window)) {
      revealEls.forEach((el) => el.classList.add("in"));
      countEls.forEach((el) => animateCount(el, true));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target as HTMLElement;
          if (el.hasAttribute("data-count")) animateCount(el, false);
          else el.classList.add("in");
          io.unobserve(el);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    revealEls.forEach((el) => io.observe(el));
    countEls.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [key]);
}
