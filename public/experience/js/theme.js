// Page-level daylight (light / dark) helper, shared by every v2 page. No three.js dependency.
//
// The choice is remembered under localStorage 'gt-daylight' ('1' day, '0' night): the same key the
// film has always used, so the landing, film, fly and gear pages agree. ?day=1 / ?day=0 overrides it
// for one load (review).
//
// API
//   DAYLIGHT_KEY                       'gt-daylight'
//   savedDaylight() → boolean          the remembered choice (false when nothing is stored)
//   saveDaylight(on)                   remember it
//   applyTheme(isDay, { transition })  toggles body.is-day, the root color-scheme and aria-pressed on
//                                      every .daylight pill; `transition: true` cross-fades the page
//                                      with a view transition (skipped under reduced motion / hidden tab)
//   wireDaylightToggle(buttonEl, onChange) → { get(), set(on, { save, transition }) }
//                                      applies the initial state (?day= → saved → night) without a
//                                      transition, then each click flips it, saves it and calls
//                                      onChange(isDay, { initial }). onChange is also called once at
//                                      start with { initial: true } so a page can sync its own state.
//                                      buttonEl may be null (the state is still applied).
//
// The film (js/main.js) keeps its own switch logic because its 3D eases with the page; it imports
// savedDaylight / saveDaylight from daylight.js, which re-exports them from here.

export const DAYLIGHT_KEY = 'gt-daylight';

export function savedDaylight() { try { return localStorage.getItem(DAYLIGHT_KEY) === '1'; } catch (e) { return false; } }
export function saveDaylight(on) { try { localStorage.setItem(DAYLIGHT_KEY, on ? '1' : '0'); } catch (e) { /* private mode: fine */ } }

const reducedMotion = () => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
};

export function applyTheme(isDay, { transition = false } = {}) {
  const swap = () => {
    document.body.classList.toggle('is-day', !!isDay);
    document.documentElement.style.colorScheme = isDay ? 'light' : 'dark';
    for (const b of document.querySelectorAll('.daylight')) b.setAttribute('aria-pressed', String(!!isDay));
  };
  if (transition && document.startViewTransition && !document.hidden && !reducedMotion()) document.startViewTransition(swap);
  else swap();
}

function initialDaylight() {
  try {
    const d = new URLSearchParams(location.search).get('day');
    if (d !== null) return d === '1';
  } catch (e) { /* no location: fall through */ }
  return savedDaylight();
}

export function wireDaylightToggle(buttonEl, onChange = () => {}) {
  let on = initialDaylight();
  const set = (v, { save = true, transition = true } = {}) => {
    on = !!v;
    if (save) saveDaylight(on);
    applyTheme(on, { transition });
    onChange(on, { initial: false });
  };
  applyTheme(on);
  onChange(on, { initial: true });
  buttonEl?.addEventListener('click', () => set(!on));
  return { get: () => on, set };
}
