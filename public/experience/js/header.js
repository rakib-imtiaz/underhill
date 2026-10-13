// Underhill's site header and phone menu, ported from the React site (Header.tsx, MobileNav.tsx) to
// plain DOM. Styles are in css/base.css.
//
// Two ways to get it on a page:
//   1. Static markup (film.html): this module wires it on import if #site-head is in the page.
//   2. Rendered (landing, fly, gear): call mountHeader() into an empty element anywhere in <body>
//      (the header and the phone menu are position: fixed, so where the element sits does not matter).
//
//        <div id="uh-header"></div>
//        <script type="module">
//          import { mountHeader } from './js/header.js';
//          import { wireDaylightToggle } from './js/theme.js';
//          const h = mountHeader(document.getElementById('uh-header'), { home: '/' });
//          wireDaylightToggle(h.daylight, (isDay) => { /* page reacts */ });
//          // later: h.setLight(true) for the white header over light sections; h.setProgress(0.4)
//        </script>
//
// mountHeader(el, opts) → { head, mnav, daylight, setMenu(open), setProgress(p), setLight(on) }
//   opts.home      logo link (default '/', the site's home page)
//   opts.links     menu groups [{ label, href, children?: [{ label, href }] }]; an href starting with
//                  '/' is a path on underhill.ca, anything else ('./fly.html', 'https://…') is used
//                  as is. Default: Underhill's primary nav (nav.js).
//   opts.join      { label, href } for the blue button, or false to leave it out (default: Join The Team)
//   opts.daylight  include the sun / moon pill (default true; wire it with theme.js)
//   opts.progress  include the scroll-progress rule and drive it from window scroll (default true)
//   opts.foot      the phone menu's footer line (HTML string); default the "Est. 1913" line
//
// Every feature is optional: if a node is missing (no nav list, no burger, no progress rule …) that
// feature is skipped instead of throwing. setProgress(p) is always safe to call.
//
// Differences from the React original, both deliberate:
// - The header stays in its over-the-hero state (light logo, white links) unless the page asks for
//   the light state (body.is-day, or .site-head.is-light via setLight).
// - The phone menu sits under the header, not over it, so the burger (now a close icon) stays
//   reachable. In the original the open menu covers its own close button.

import { PRIMARY_NAV, SITE_URL, CAREERS_HREF } from './nav.js';

const resolve = (h) => (typeof h === 'string' && h.startsWith('/') ? SITE_URL + h : h);

const el = (tag, props = {}, kids = []) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'text') e.textContent = v;
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  for (const c of kids) e.appendChild(c);
  return e;
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* the progress rule of the header that was wired last (setProgress drives it) */
let progressEl = null;

/** For review captures (?frame=) and pages that drive progress themselves; safe with no header. */
export function setProgress(p) {
  if (progressEl) progressEl.style.transform = `scaleX(${Math.min(1, Math.max(0, p)).toFixed(4)})`;
}

/**
 * Wire an existing header. `root` is the element holding #site-head and #mnav (default: document).
 * Idempotent per header. Returns the same handle as mountHeader.
 */
export function wireHeader(root = document, { links = PRIMARY_NAV, progress = true } = {}) {
  const q = (id) => root.querySelector(`#${id}`);
  const head = q('site-head');
  const list = q('nav-list');
  const mlist = q('mnav-list');
  const mnav = q('mnav');
  const burger = q('burger');
  const prog = q('head-progress');
  const daylight = q('daylight');
  if (head?.__uhHeader) return head.__uhHeader;

  /* ------------------------------------------------------------------------ desktop menus */
  if (list && !list.childElementCount) {
    for (const group of links) {
      const a = el('a', { href: resolve(group.href) }, [document.createTextNode(group.label)]);
      const li = el('li', { class: group.children ? 'has-drop' : '' }, [a]);
      if (group.children) {
        a.setAttribute('aria-haspopup', 'true');
        a.appendChild(el('span', { class: 'caret', 'aria-hidden': 'true' }));
        const drop = el('ul', { class: 'drop' });
        for (const c of group.children) drop.appendChild(el('li', {}, [el('a', { href: resolve(c.href), text: c.label })]));
        li.appendChild(drop);
      }
      list.appendChild(li);
    }
  }

  /* -------------------------------------------------------------------------- phone menu */
  if (mlist && !mlist.childElementCount) {
    for (const group of links) {
      const li = el('li');
      if (group.children) {
        const ex = el('button', { type: 'button', class: 'expander', 'aria-expanded': 'false', 'aria-label': `Expand ${group.label} menu`, text: '+' });
        ex.addEventListener('click', () => {
          const open = !li.classList.contains('expanded');
          li.classList.toggle('expanded', open);
          ex.textContent = open ? '−' : '+';
          ex.setAttribute('aria-expanded', String(open));
          ex.setAttribute('aria-label', `${open ? 'Collapse' : 'Expand'} ${group.label} menu`);
        });
        li.appendChild(ex);
      }
      li.appendChild(el('a', { href: resolve(group.href), text: group.label }));
      if (group.children) {
        const sub = el('ul', { class: 'sub' });
        for (const c of group.children) sub.appendChild(el('li', {}, [el('a', { href: resolve(c.href), text: c.label })]));
        li.appendChild(sub);
      }
      mlist.appendChild(li);
    }
  }

  let menuOpen = false;
  function setMenu(open) {
    if (!mnav) return;
    menuOpen = open;
    mnav.classList.toggle('open', open);
    mnav.setAttribute('aria-hidden', String(!open));
    mnav.inert = !open;
    burger?.classList.toggle('open', open);
    burger?.setAttribute('aria-expanded', String(open));
    burger?.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    head?.classList.toggle('menu-open', open);
    // body scroll lock, as the original did it
    document.body.style.overflow = open ? 'hidden' : '';
  }
  if (mnav && burger) {
    mnav.inert = true;
    burger.addEventListener('click', () => setMenu(!menuOpen));
    addEventListener('keydown', (e) => { if (menuOpen && e.key === 'Escape') setMenu(false); });
    mnav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
    // the phone menu only exists below the desktop breakpoint
    matchMedia('(min-width: 1081px)').addEventListener('change', (e) => { if (e.matches && menuOpen) setMenu(false); });
  }

  /* ------------------------------------------------ scroll progress along the bottom edge */
  if (prog) {
    progressEl = prog;
    if (progress) {
      let raf = 0;
      const onScroll = () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const doc = document.documentElement;
          const max = doc.scrollHeight - innerHeight;
          setProgress(max > 0 ? Math.min(scrollY / max, 1) : 0);
        });
      };
      addEventListener('scroll', onScroll, { passive: true });
      addEventListener('resize', onScroll);
      onScroll();
    }
  }

  const handle = {
    head, mnav, daylight,
    setMenu,
    setProgress,
    /** the white header (Underhill's scrolled state) regardless of daylight */
    setLight(on) { head?.classList.toggle('is-light', !!on); },
  };
  if (head) head.__uhHeader = handle;
  return handle;
}

/**
 * Render Underhill's header + phone menu into `el` (its content is replaced) and wire it.
 * See the top of this file for the options.
 */
export function mountHeader(el, { home = '/', links = PRIMARY_NAV, join, daylight = true, progress = true, foot } = {}) {
  if (!el) return wireHeader(document, { links, progress });
  const joinBtn = join === false ? null : { label: 'Join The Team', href: CAREERS_HREF, ...(join || {}) };
  const footHtml = foot ?? 'Est. <b>1913</b> — Vancouver · Kamloops · Vancouver Island · Whitehorse';
  el.innerHTML = `
  <header class="site-head" id="site-head">
    <div class="container">
      <a class="logo" href="${esc(home)}" aria-label="Underhill Geomatics — home">
        <img class="logo-light" src="./media/REV-UG-Horozontal-RGB.png" alt="Underhill Geomatics" width="1000" height="284">
        <img class="logo-dark" src="./media/Underhill-Horozontal-RGB.png" alt="Underhill Geomatics" width="1000" height="284">
      </a>
      <nav class="nav" aria-label="Primary"><ul id="nav-list"></ul></nav>
      ${daylight ? `<button type="button" class="daylight" id="daylight" aria-pressed="false" aria-label="Daylight on/off" title="Daylight">
        <span class="daylight__knob" aria-hidden="true"></span>
        <svg class="daylight__moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 14.6A7.6 7.6 0 0 1 9.4 4.5a7.6 7.6 0 1 0 10.1 10.1z"/></svg>
        <svg class="daylight__sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/></svg>
      </button>` : ''}
      ${joinBtn ? `<a class="btn small join" id="nav-join" href="${esc(resolve(joinBtn.href))}">${esc(joinBtn.label)}</a>` : ''}
      <button type="button" class="burger" id="burger" aria-label="Open menu" aria-expanded="false" aria-controls="mnav"><span></span><span></span><span></span></button>
    </div>
    ${progress ? '<div class="head-progress" id="head-progress" aria-hidden="true"></div>' : ''}
  </header>
  <div class="mnav" id="mnav" aria-hidden="true">
    <ul id="mnav-list"></ul>
    ${joinBtn ? `<a class="btn" id="mnav-join" href="${esc(resolve(joinBtn.href))}">${esc(joinBtn.label)}</a>` : ''}
    <p class="mnav-foot">${footHtml}</p>
  </div>`;
  return wireHeader(el, { links, progress });
}

// film.html (and any page with static markup): wire it now. Pages without #site-head do nothing here.
if (typeof document !== 'undefined' && document.getElementById('site-head')) wireHeader(document);
