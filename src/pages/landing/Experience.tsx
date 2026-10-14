import { useEffect, useRef, useState, type MouseEvent } from "react";
import { FILM_MODULES, FILM_URL } from "./urls";
import { Arrow, Line, Pic, Topo, d } from "./parts";
import { detectQuality, qualityBadge, type Quality } from "./quality";
import { slideClass, useCalm, useLive, useSlides } from "./loops";

/* "Watch the ground become data": the 3D film teaser, with a device badge from detectQuality() ("Runs
   smoothly on this device"; the tier and the reason in the tooltip). The GPU probe (one throwaway 1×1
   WebGL context, cached for the session) runs once the page is idle; on high-tier devices the film's
   modules are then prefetched so "Enter" starts fast. */

function webgl(q: Quality): "ok" | "none" {
  try {
    const raw = sessionStorage.getItem("uh-gpu");
    if (raw === "null") return "none";
    if (raw) return JSON.parse(raw).webgl2 ? "ok" : "none";
  } catch {
    /* no storage */
  }
  return /no WebGL/.test(q.reason) ? "none" : "ok";
}

let prefetched = false;
export function prefetchFilm(q: Quality) {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (prefetched || q.tier !== "high" || webgl(q) === "none" || conn?.saveData) return;
  prefetched = true;
  for (const href of FILM_MODULES) {
    const l = document.createElement("link");
    l.rel = "modulepreload";
    l.href = href;
    document.head.appendChild(l);
  }
}

/** the device tier: a first guess without WebGL, then the real probe when the page is idle */
export function useQuality() {
  const [q, setQ] = useState<Quality>(() => detectQuality({ probe: false }));
  const [probed, setProbed] = useState(() => {
    try {
      return sessionStorage.getItem("uh-gpu") !== null;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    let id = 0, t = 0;
    const probe = () => {
      const nq = detectQuality({ probe: true });
      setQ(nq);
      setProbed(true);
      if (nq.tier === "high") t = window.setTimeout(() => prefetchFilm(nq), 4000);
    };
    const go = () => { if (ric) id = ric(probe, { timeout: 1500 }); else t = window.setTimeout(probe, 300); };
    if (document.readyState === "complete") go();
    else addEventListener("load", go, { once: true });
    return () => {
      removeEventListener("load", go);
      if (id) (window as Window & { cancelIdleCallback?: (n: number) => void }).cancelIdleCallback?.(id);
      clearTimeout(t);
    };
  }, []);
  return { q, ready: probed || q.override };
}

function Badge({ q, ready }: { q: Quality; ready: boolean }) {
  // with this session's probe cached (or a tier forced) the first guess is already the answer; otherwise
  // the badge reads "Checking this device…" until the probe, rather than changing its mind
  const gl = ready ? webgl(q) : null;
  const tier = gl === null ? undefined : gl === "none" ? "none" : q.tier;
  return (
    <p className="ld-badge" data-tier={tier} role="status" title={gl === "ok" ? `${qualityBadge(q)} — ${q.reason}` : undefined}>
      <i className="ld-badge__dot" aria-hidden="true" />
      <span className="ld-badge__text">
        {gl === null ? (
          "Checking this device…"
        ) : gl === "none" ? (
          <>
            3D needs a newer browser — <a href="/?intro=1">watch the brand film</a>
          </>
        ) : q.tier === "lite" ? (
          "Runs on this device, in a lighter mode"
        ) : (
          "Runs smoothly on this device"
        )}
      </span>
    </p>
  );
}

/* The film title card's frames: stills rendered from the film itself (q=high, canvas readback, the
   subject framed right of centre so the title block at the bottom left never covers it), crossfading
   slowly with a Ken Burns drift while the card is on screen.
   `op` is the frame's object-position: its x matters on phones (the card is square there and crops the
   16:9 frame's sides; 75 % keeps a subject right of centre), its y on desktop (a 2.26:1 band).

   TO USE YOUR OWN IMAGE as the first frame:
     1. Export it at 1920 x 1080 (16:9), with the subject right of centre and the bottom-left third
        quiet (the title sits there over a dark gradient).
     2. Save it as  public/landing/photos/experience-poster-user.avif  and  ...-user.webp
        (AVIF about quality 60, WebP about quality 80; aim for under 250 KB each).
     3. Uncomment the USER line below (it goes first, so it is also the static frame for reduced motion).
   To show only your image, delete the other entries. */
type Frame = { set: [string, number?][]; op: string };
const FRAMES: Frame[] = [
  // { set: [["experience-poster-user"]], op: "75% 50%" }, // USER: your own 1920x1080 image
  { set: [["exp-frame-2-900", 900], ["exp-frame-2", 1800]], op: "67% 50%" }, // the total station under its spotlight (night studio, u 19.15)
  { set: [["exp-frame-3-900", 900], ["exp-frame-3", 1800]], op: "62% 42%" }, // the globe, the valley pinned in BC (night, u 53.1)
  // (the drone over the valley, exp-frame-1, is out: its low-poly valley and flat rotor discs read as a
  // game next to the page's photographs. Re-render it, or use a photo, before bringing it back.)
];
const FRAME_HOLD = 5000;
// "Play the film" starts the film playing by itself (film.html?autoplay=1: it runs from the title to
// the end once its boot screen hands off); the rest of the card opens the film at its title, as before.
// (The control sits inside the card's link, and links cannot nest, so it redirects a plain click; a
// modified or middle click opens the card's own link.)
const FILM_PLAY_URL = `${FILM_URL}?autoplay=1`;
const playFilm = (e: MouseEvent) => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  window.location.assign(FILM_PLAY_URL);
};

export default function Experience({ q, ready }: { q: Quality; ready: boolean }) {
  const card = useRef<HTMLAnchorElement>(null);
  const calm = useCalm();
  const live = useLive(card, !calm);
  const sl = useSlides(FRAMES.length, FRAME_HOLD, live, card);
  // hovering, focusing or touching a film link fetches its modules (high tier only)
  const pre = { onPointerEnter: () => prefetchFilm(q), onFocus: () => prefetchFilm(q), onTouchStart: () => prefetchFilm(q) };
  return (
    <section className="ld-sec ld-exp" id="experience" aria-labelledby="exp-title" data-loop>
      <Topo className="is-exp" />
      <div className="ld-wrap ld-exp__grid">
        <div className="ld-exp__copy" data-in>
          <p className="ld-kicker ld-rise">Experience</p>
          <h2 className="ld-lines" id="exp-title">
            <Line>Watch the ground</Line>
            <Line delay={0.12}><em>become data.</em></Line>
          </h2>
          <p className="ld-rise" style={d(0.3)}>
            See how our people, technology and expertise turn real-world environments into precise, actionable geospatial data, in a 3D film you can scrub through.
          </p>
          <div className="ld-exp__actions ld-rise" style={d(0.4)}>
            <a className="ld-btn is-shiny" href={FILM_URL} {...pre}>
              Enter the 3D experience <Arrow />
            </a>
            <Badge q={q} ready={ready} />
          </div>
        </div>
        <a className="ld-film" ref={card} href={FILM_URL} data-in data-loop aria-label="Play the 3D film, Ground Truth (opens the film page, about three minutes)" {...pre}>
          <span className="ld-film__media ld-wipe">
            {FRAMES.map((f, i) =>
              i === 0 || (i <= sl.upto && !calm) ? (
                <span key={f.set[0][0]} className={`ld-slide ld-film__frame${slideClass(i, sl)}`} data-slide={i} style={{ ["--op" as string]: f.op }}>
                  <Pic set={f.set} sizes="(min-width: 861px) 60vw, 100vw" width={1800} height={1013} loading={i === 0 ? undefined : "eager"} />
                </span>
              ) : null
            )}
          </span>
          <span className="ld-film__shade" aria-hidden="true" />
          <span className="ld-film__body" aria-hidden="true">
            <span className="ld-film__kicker">3D film <i>·</i> 3 min</span>
            <span className="ld-film__title">Ground Truth</span>
            <span className="ld-film__line">One valley, measured from the air, the ground and space.</span>
          </span>
          <span className="ld-film__play" aria-hidden="true" data-href={FILM_PLAY_URL} onClick={playFilm}>
            <span className="ld-film__icon"><svg viewBox="0 0 16 16"><path d="M5 3.2v9.6l7.6-4.8z" /></svg></span>
            <span className="ld-film__label">Play the film</span>
          </span>
        </a>
      </div>
    </section>
  );
}
