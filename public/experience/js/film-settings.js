// The film's quality control: a gear on the chapter rail opens Quality: Auto / Lite / Balanced / High,
// with the tier this load is running at. A choice is saved with setQualityOverride (quality.js) and
// the film reloads, because the geometry-level knobs (terrain, trees, stars …) are fixed at load.
// A ?q= in the address forces a tier for one load; choosing here drops it so the saved choice applies.
import { detectQuality, setQualityOverride, qualityBadge } from './quality.js';

const $ = (id) => document.getElementById(id);
const root = $('fset'), btn = $('fset-btn'), panel = $('fset-panel');
if (root && btn && panel) {
  const Q = detectQuality();   // the same answer main.js got (the GPU probe is memoised)
  const LABEL = { lite: 'Lite', balanced: 'Balanced', high: 'High' };
  const fromUrl = /^forced by \?q=/.test(Q.reason);
  const userSet = Q.override && !fromUrl;
  const current = userSet ? Q.tier : fromUrl ? Q.tier : 'auto';

  $('fset-tier').textContent = LABEL[Q.tier];
  $('fset-now').textContent = qualityBadge(Q);
  $('fset-why').textContent = fromUrl ? `Set by ?q=${Q.tier} in the address` : Q.reason.replace(/^auto: /, 'Auto: ');
  for (const input of panel.querySelectorAll('input[name="fset-q"]')) {
    input.checked = input.value === current;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      setQualityOverride(input.value);
      const url = new URL(location.href);
      url.searchParams.delete('q');
      location.replace(url.href);
    });
  }

  let open = false;
  const set = (on) => {
    open = on;
    panel.hidden = !on;
    btn.setAttribute('aria-expanded', String(on));
    root.classList.toggle('is-open', on);
    if (on) (panel.querySelector('input:checked') || panel.querySelector('input'))?.focus({ preventScroll: true });
  };
  btn.addEventListener('click', () => set(!open));
  addEventListener('keydown', (e) => {
    if (open && e.key === 'Escape') { e.preventDefault(); set(false); btn.focus({ preventScroll: true }); }
  });
  addEventListener('pointerdown', (e) => { if (open && !root.contains(e.target)) set(false); }, true);
  // the film moves on a wheel or a swipe: the panel gets out of the way
  addEventListener('scroll', () => { if (open) set(false); }, { passive: true });
}
