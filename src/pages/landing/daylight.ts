import { useSyncExternalStore } from "react";

/**
 * Home's daylight (light / dark) switch, ported from showcase-v2/js/theme.js.
 *
 * The choice is remembered under localStorage 'gt-daylight' ('1' day, '0' night): the same key the 3D
 * pages (film, fly, gear) use, so they agree. ?day=1 / ?day=0 overrides it for one load (review).
 * Home is light by default (the approved mockup): with nothing saved, it shows day and saves nothing.
 *
 * The state lives on <body> (`is-day`, next to the `ld-body` class Home sets while it is mounted), so
 * the header variant and the page read the same switch. The Header's toggle subscribes with
 * useDaylight().
 */
export const DAYLIGHT_KEY = "gt-daylight";

function initialDay(): boolean {
  try {
    const d = new URLSearchParams(location.search).get("day");
    if (d !== null) return d !== "0";
    const saved = localStorage.getItem(DAYLIGHT_KEY);
    if (saved !== null) return saved === "1";
  } catch {
    /* private mode / no storage: fall through */
  }
  return true;
}

let day = typeof window === "undefined" ? true : initialDay();
const listeners = new Set<() => void>();

function paint(transition: boolean) {
  const swap = () => {
    // a view-transition swap can land after Home has unmounted: never leave the theme on another page
    if (!document.body.classList.contains("ld-body")) return;
    document.body.classList.toggle("is-day", day);
    document.documentElement.style.colorScheme = day ? "light" : "dark";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", day ? "#ffffff" : "#0a1b2e");
  };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (transition && doc.startViewTransition && !document.hidden && !reduced) doc.startViewTransition(swap);
  else swap();
}

export function getDay() {
  return day;
}

export function setDay(on: boolean, { save = true, transition = true } = {}) {
  day = on;
  if (save) {
    try {
      localStorage.setItem(DAYLIGHT_KEY, on ? "1" : "0");
    } catch {
      /* private mode: fine */
    }
  }
  paint(transition);
  listeners.forEach((l) => l());
}

/** Home calls this on mount: body.ld-body + the current daylight, before first paint. Returns the cleanup. */
export function mountLandingBody() {
  day = initialDay();
  document.body.classList.add("ld-body");
  paint(false);
  return () => {
    document.body.classList.remove("ld-body", "is-day");
    document.documentElement.style.colorScheme = "";
  };
}

export function useDaylight(): [boolean, () => void] {
  const on = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getDay,
    () => true
  );
  return [on, () => setDay(!getDay())];
}
