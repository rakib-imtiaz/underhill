/**
 * Where the 3D pages live: public/experience/ (film.html, fly.html, gear.html + their own js/, css/,
 * vendor/ …). Vite serves public/ as-is, so they are at `/experience/*` on the site's own origin in dev
 * (npm run dev), in the build (copied to dist/experience/) and in preview. No proxy, no :4300 server.
 *
 *  · VITE_EXPERIENCE_URL (no trailing slash) optionally points the links somewhere else, e.g. a CDN
 *    copy of the same folder. Leave it unset for the normal case.
 */
const env = import.meta.env as ImportMetaEnv & { VITE_EXPERIENCE_URL?: string };

export const EXPERIENCE_BASE: string = (env.VITE_EXPERIENCE_URL || "/experience").replace(/\/$/, "");

export const FILM_URL = `${EXPERIENCE_BASE}/film.html`;
export const FLY_URL = `${EXPERIENCE_BASE}/fly.html`;
export const GEAR_URL = `${EXPERIENCE_BASE}/gear.html`;
export const gearHref = (id: string) => `${GEAR_URL}?g=${encodeURIComponent(id)}`;
/** the 3D film's three.js entry, prefetched on hover of a film link (high-tier devices only) */
export const FILM_MODULES = [`${EXPERIENCE_BASE}/vendor/three/build/three.module.min.js`, `${EXPERIENCE_BASE}/js/main.js`];
