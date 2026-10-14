import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import IntroVideo from "../hero/IntroVideo";
import "../hero/hero-in-site.css";
import useDocumentMeta from "../hooks/useDocumentMeta";
import { CAREERS_HREF, STORY_HREF } from "../data/nav";
import { mountLandingBody } from "./landing/daylight";
import useLandingMotion from "./landing/useLandingMotion";
import Experience, { prefetchFilm, useQuality } from "./landing/Experience";
import Kit from "./landing/Kit";
import { FILM_URL, FLY_URL } from "./landing/urls";
import { Arrow, Go, Line, Pic, Topo, d } from "./landing/parts";
import { RotatingText, Shimmer, Ticker, slideClass, useCalm, useLive, useSlides } from "./landing/loops";
import "./landing/landing.css";
import "./landing/loops.css";

/* ---------------------------------------------------------------------------------------------
   Home: the photo-first landing (the approved mockup), ported from
   drafts/film-fly-gear/showcase-v2/index.html + css/landing.css + js/landing.js.
   Sections: hero · our story · expertise (Land / Air / Water / Data) · the 3D experience ·
   take the controls (fly mode) · the tools (kit rail) · our people · purpose band.
   The header is the site Header in its "landing" variant (Layout), the footer is the site Footer
   without its survey band. The 3D pages (film, fly, gear) stay in drafts: see landing/urls.ts.
   The previous Home (SurveyHero + project map) is kept in drafts/old-home.
--------------------------------------------------------------------------------------------- */

const EXPERTISE = [
  {
    title: "Land",
    sub: "Surveying and spatial data for what's next.",
    to: "/geospatial-services/topographic-surveying/",
    img: <img src="/landing/photos/land.webp" width={1100} height={734} alt="" loading="lazy" decoding="async" />,
    alt: <Pic set={[["alt-land"]]} width={800} height={533} />,
    icon: <svg className="ld-xcard__icon" viewBox="0 0 28 24" aria-hidden="true"><path d="M2 21 10 7l4 6 3-4 9 12zM10 7l3 14M17 9l-2 12" /></svg>,
  },
  {
    title: "Air",
    sub: "Aerial data capture and mapping.",
    to: "/geospatial-services/aerial-surveying/",
    img: <Pic set={[["draft-air"]]} width={450} height={562} />,
    alt: <Pic set={[["draft-controls-720"]]} width={720} height={526} />,
    icon: (
      <svg className="ld-xcard__icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="5" cy="5" r="2.6" /><circle cx="19" cy="5" r="2.6" /><circle cx="5" cy="19" r="2.6" /><circle cx="19" cy="19" r="2.6" />
        <path d="M7 7l3 3M17 7l-3 3M7 17l3-3M17 17l-3-3" /><rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      </svg>
    ),
  },
  {
    title: "Water",
    sub: "Bathymetry and hydrospatial solutions.",
    to: "/geospatial-services/hydrographic-surveying/",
    img: <img src="/landing/photos/water.webp" width={1100} height={580} alt="" loading="lazy" decoding="async" />,
    alt: <Pic set={[["alt-water"]]} width={800} height={450} />,
    icon: <svg className="ld-xcard__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 8c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0M2 13c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0M2 18c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0" /></svg>,
  },
  {
    title: "Data",
    sub: "Transforming data into insight.",
    to: "/geospatial-services/3d-laser-scanning-reality-capture/",
    img: <img src="/landing/photos/data.webp" width={860} height={1075} alt="" loading="lazy" decoding="async" />,
    alt: <Pic set={[["alt-data"]]} width={800} height={534} />,
    icon: <svg className="ld-xcard__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 8l10 5 10-5zM2 12.5l10 5 10-5M2 17l10 5 10-5" /></svg>,
  },
];

const STATS: { to: number; from?: number; suffix?: string; label: string }[] = [
  { to: 1913, from: 1870, label: "Year Founded" },
  { to: 5, label: "Offices Across Western Canada" },
  { to: 11, label: "Specialized Service Areas" },
  { to: 100, suffix: "+", label: "Dedicated Professionals" },
];

const CREW = [
  { cls: "is-tall", altStem: "tile-beard", stem: "draft-crew-rover", w: 259, h: 283, alt: "An Underhill surveyor with a GNSS rover and field controller beside a mountain lake" },
  { cls: "is-a", altStem: "tile-meadow", stem: "draft-crew-valley", w: 308, h: 179, alt: "Two Underhill surveyors with a field tablet point out a line across the valley" },
  { cls: "is-b", altStem: "tile-fog", stem: "draft-crew-snowfield", w: 287, h: 179, alt: "Two Underhill surveyors set out a stake in fresh snow" },
  { cls: "is-c", altStem: "tile-tablet", stem: "draft-crew-riverbank", w: 270, h: 179, alt: "Two Underhill surveyors with a rover pole and a yellow case on a riverbank" },
  { cls: "is-d", altStem: "tile-ridge", stem: "draft-crew-grasslands", w: 282, h: 179, alt: "An Underhill surveyor carries a yellow pack and rover over the grasslands above a lake" },
];

/* The hero slideshow: the approved hero first, then four Underhill field photos (Eagle Vision shoot,
   re-encoded from /assets/uploads at 960 / 1920). `op` is the focal point (desktop, phone). Each slide
   holds ~6.5 s, crossfades over 1.8 s and drifts (Ken Burns, CSS) towards --kx / --ky. The headline's
   last line rotates with it. */
const HERO_SLIDES: { stem: string; op?: [string, string]; k: [string, string, string] }[] = [
  { stem: "draft-hero", k: ["1.07", "-1.6%", "-0.8%"] },
  { stem: "slide-meadow", op: ["58% 46%", "56% 50%"], k: ["1.08", "1.4%", "-1%"] },
  { stem: "slide-ridge", op: ["72% 40%", "70% 40%"], k: ["1.07", "-1.4%", "0.8%"] },
  { stem: "slide-fog", op: ["40% 40%", "30% 45%"], k: ["1.09", "1.2%", "-0.6%"] },
  { stem: "slide-forest", op: ["60% 35%", "52% 40%"], k: ["1.07", "-1%", "-1.2%"] },
];
const HERO_LINES = ["Lead with certainty.", "Measure the land.", "Know the ground.", "Work in any weather.", "Deliver the data."];
const HERO_HOLD = 5000;

function Hero({ ready, pre }: { ready: boolean; pre: Record<string, () => void> }) {
  const ref = useRef<HTMLElement>(null);
  const calm = useCalm();
  const live = useLive(ref, ready && !calm);
  const s = useSlides(HERO_SLIDES.length, HERO_HOLD, live, ref);
  return (
    <section className="ld-hero" id="top" aria-labelledby="hero-title" ref={ref} data-loop style={{ ["--hold" as string]: `${HERO_HOLD}ms` }}>
      <div className="ld-hero__media">
        <div className="ld-hero__slides" data-drift={-0.05}>
          {HERO_SLIDES.map((sl, i) =>
            i === 0 || (i <= s.upto && !calm) ? (
              <div
                key={sl.stem}
                className={`ld-slide${slideClass(i, s)}`}
                data-slide={i}
                aria-hidden={i === 0 ? undefined : true}
                style={{ ["--kz" as string]: sl.k[0], ["--kx" as string]: sl.k[1], ["--ky" as string]: sl.k[2], ...(sl.op ? { ["--op" as string]: sl.op[0], ["--op-m" as string]: sl.op[1] } : {}) }}
              >
                <Pic
                  set={i === 0 ? [["draft-hero-960", 960], ["draft-hero", 1672]] : [[`${sl.stem}-960`, 960], [sl.stem, 1920]]}
                  sizes="(max-width: 860px) 250vw, 100vw"
                  width={i === 0 ? 1672 : 1920}
                  height={i === 0 ? 941 : 1280}
                  priority={i === 0}
                  loading={i === 0 ? undefined : "eager"}
                  className={`ld-hero__img${sl.op ? " is-alt" : ""}`}
                  alt={i === 0 ? "An Underhill crew on a ridge at sunrise: a surveyor at a total station on a yellow tripod, a rover pole, and an M350 survey drone over the lake below" : ""}
                />
              </div>
            ) : null
          )}
        </div>
        {calm ? null : (
          <div className="ld-hero__ticks" aria-hidden="true">
            {HERO_SLIDES.map((sl, i) => (
              <span key={sl.stem} className={`ld-tick${i === s.cur ? " is-on" : ""}`}><i /></span>
            ))}
          </div>
        )}
      </div>
      <div className="ld-hero__shade" aria-hidden="true" />
      <span className="ld-slash is-a" aria-hidden="true" />
      <span className="ld-slash is-b" aria-hidden="true" />

      <div className="ld-wrap ld-hero__copy">
        <p className="ld-kicker ld-rise" style={d(0.05)}>Geospatial solutions for a brighter tomorrow</p>
        <h1 className="ld-lines ld-hero__title" id="hero-title">
          <Line delay={0.12}>Build with</Line>
          <Line delay={0.2}>precision.</Line>
          <Line delay={0.3}>
            <em>{calm ? HERO_LINES[0] : <RotatingText texts={HERO_LINES} index={s.cur} label={HERO_LINES[0]} />}</em>
          </Line>
        </h1>
        <p className="ld-hero__lede ld-rise" style={d(0.45)}>
          Accurate data. Smarter decisions. A more resilient tomorrow. Underhill Geomatics delivers trusted geospatial solutions across land, air, water and data.
        </p>
        <div className="ld-hero__actions ld-rise" style={d(0.56)}>
          <a className="ld-btn" href="#expertise">
            Our solutions <Arrow />
          </a>
          <a className="ld-btn ld-btn--ghost" href={FILM_URL} {...pre}>
            See how we measure
            <svg className="ld-play" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" /><path d="M8 6.4v7.2l5.6-3.6z" /></svg>
          </a>
        </div>
        {/* the 3D film, in the first screen: a small video tile (wide screens: bottom right, level with
            the buttons; phones and tablets: a slim bar under them) */}
        <a className="ld-herofilm ld-rise" style={d(0.7)} href={FILM_URL} {...pre} aria-label="Watch the 3D film, Ground Truth (about three minutes)">
          <span className="ld-herofilm__thumb" aria-hidden="true">
            <Pic set={[["exp-frame-3-900", 900]]} sizes="160px" width={900} height={506} loading="lazy" />
            <span className="ld-herofilm__play"><svg viewBox="0 0 16 16"><path d="M5 3.2v9.6l7.6-4.8z" /></svg></span>
          </span>
          <span className="ld-herofilm__body" aria-hidden="true">
            <span className="ld-herofilm__k"><i />3D film · 3 min</span>
            <span className="ld-herofilm__t">Ground Truth</span>
            <span className="ld-herofilm__s">Watch how we measure <Arrow /></span>
          </span>
        </a>
      </div>
    </section>
  );
}

/** "Take the controls": a flight readout over the drone photo */
const agl = () => `ALT ${(118 + Math.random() * 6).toFixed(1)} m  ·  GS ${(11 + Math.random() * 3).toFixed(1)} m/s`;
function CtlHud() {
  const ref = useRef<HTMLDivElement>(null);
  const calm = useCalm();
  const live = useLive(ref, !calm);
  return (
    <div className="ld-ctl__hud" ref={ref} aria-hidden="true">
      <span className="ld-ctl__read">
        <b>UAV-01 · LiDAR</b>
        <Ticker className="ld-ctl__num" initial="ALT 121.4 m  ·  GS 12.6 m/s" next={agl} every={2400} live={live} />
      </span>
      <span className="ld-ctl__ruler"><i /></span>
    </div>
  );
}

export default function Home() {
  useDocumentMeta(
    "Underhill Geomatics — Build with precision. Lead with certainty.",
    "Underhill Geomatics has measured land, air, water and data across BC and the Yukon since 1913. Watch the 3D experience, fly a survey drone and try the kit."
  );

  // body.ld-body (+ is-day) while Home is mounted: the tokens, the page background and the header variant
  useLayoutEffect(() => mountLandingBody(), []);

  const root = useRef<HTMLElement>(null);
  const [introDone, setIntroDone] = useState(false);
  const onIntroLeave = useCallback(() => setIntroDone(true), []);
  const { q, ready } = useQuality();
  useLandingMotion(root, { ready: introDone, lite: q.tier === "lite" });
  const pre = { onPointerEnter: () => prefetchFilm(q), onFocus: () => prefetchFilm(q), onTouchStart: () => prefetchFilm(q) };

  return (
    <main id="main" className="ld ld-js" ref={root}>
      {/* Brand intro: once per visit, before the landing (portalled to <body>: the page-shell fade would
          otherwise trap a position:fixed overlay inside its transform). The hero plays as it leaves. */}
      {createPortal(<IntroVideo onLeave={onIntroLeave} />, document.body)}

      {/* ================================================================== 1. HERO */}
      <Hero ready={introDone} pre={pre} />

      {/* ================================================================== 2. OUR STORY */}
      <section className="ld-sec ld-story" id="story" aria-labelledby="story-title" data-loop>
        <Topo className="is-story" />
        <figure className="ld-story__fig" data-in>
          <div className="ld-story__img ld-wipe">
            <Pic
              set={[["draft-story-760", 760], ["draft-story", 1400]]}
              sizes="(min-width: 861px) 52vw, 100vw"
              width={1400}
              height={933}
              drift={0.04}
              alt="An Underhill surveyor in a red vest and ear defenders sights a total station on a gravel site while a colleague holds the rover pole by a mountain lake"
            />
            <span className="ld-story__alt" aria-hidden="true">
              <Pic set={[["story-hills-760", 760], ["story-hills", 1400]]} sizes="(min-width: 861px) 52vw, 100vw" width={1400} height={933} />
            </span>
          </div>
          <figcaption className="ld-script">Same spirit.<br />Further horizons.</figcaption>
        </figure>
        <div className="ld-wrap">
          <div className="ld-story__copy" data-in>
            <p className="ld-kicker ld-rise">Our story</p>
            <h2 className="ld-lines" id="story-title">
              <Line>Advanced geospatial</Line>
              <Line delay={0.12}>solutions <em><Shimmer>since 1913.</Shimmer></em></Line>
            </h2>
            <p className="ld-story__text ld-rise" style={d(0.3)}>
              For over a century, Underhill Geomatics has helped shape communities, infrastructure and natural resource management with accurate, reliable geospatial data and expert insight.
            </p>
            <Link className="ld-link ld-rise" style={d(0.4)} to={STORY_HREF}>
              Our history <Arrow />
            </Link>
          </div>
          <dl className="ld-stats" data-in>
            {STATS.map((s, i) => {
              const final = `${s.to}${s.suffix || ""}`;
              return (
                <div key={s.label} style={d(0.05 + i * 0.1)}>
                  <dt>
                    <span className="ld-num" data-ld-count={s.to} data-from={s.from} data-suffix={s.suffix} aria-hidden="true">{final}</span>
                    <span className="ld-sr">{final}</span>
                  </dt>
                  <dd>{s.label}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      </section>

      {/* ================================================================== 3. EXPERTISE */}
      <section className="ld-sec ld-x" id="expertise" aria-labelledby="x-title" data-loop>
        <Topo className="is-x" />
        <div className="ld-wrap ld-x__head" data-in>
          <div>
            <p className="ld-kicker ld-rise">Our expertise</p>
            <h2 className="ld-lines" id="x-title">
              <Line>Land. Air. Water. <em>Data.</em></Line>
            </h2>
          </div>
          <p className="ld-x__lede ld-rise" style={d(0.25)}>
            Integrated geospatial solutions that give you a clearer perspective. From the ground to the sky, and everywhere in between.
          </p>
        </div>
        <ul className="ld-x__cards" data-in data-loop aria-label="Our expertise">
          {EXPERTISE.map((x, i) => (
            <li key={x.title} style={d(0.05 + i * 0.12)}>
              <Link className={`ld-xcard${x.title === "Data" ? " is-data" : ""}`} to={x.to}>
                <span className="ld-xcard__img ld-wipe">
                  {x.img}
                  <span className="ld-xcard__alt" aria-hidden="true">{x.alt}</span>
                </span>
                <span className="ld-xcard__body">
                  {x.icon}
                  <span className="ld-xcard__title">{x.title}</span>
                  <span className="ld-xcard__sub">{x.sub}</span>
                  <Go />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ================================================================== 4. THE EXPERIENCE */}
      <Experience q={q} ready={ready} />

      {/* ================================================================== 5. TAKE THE CONTROLS */}
      <section className="ld-ctl" id="fly" aria-labelledby="fly-title" data-loop>
        <figure className="ld-ctl__art" data-in>
          <div className="ld-ctl__img ld-wipe">
            <Pic
              set={[["draft-controls-720", 720], ["draft-controls", 1214]]}
              sizes="(min-width: 861px) 63vw, 100vw"
              width={1214}
              height={887}
              drift={0.04}
              alt="An Underhill M350 survey drone flies over a ridge at sunrise; a surveyor holds a GNSS rover pole and the navy Underhill truck is parked by the lake"
            />
          </div>
          <CtlHud />
          <span className="ld-slash is-c" aria-hidden="true" />
        </figure>
        <div className="ld-wrap ld-ctl__grid">
          <div className="ld-ctl__copy" data-in>
            <p className="ld-kicker ld-rise">Technology</p>
            <h2 className="ld-lines" id="fly-title">
              <Line>Take the <em>controls.</em></Line>
            </h2>
            <p className="ld-rise" style={d(0.25)}>
              From UAV mapping to LiDAR, we deploy the latest technology to capture high-resolution, accurate data safely and efficiently. Now fly it yourself.
            </p>
            <ul className="ld-checks ld-rise" style={d(0.35)}>
              <li>UAV photogrammetry &amp; LiDAR</li>
              <li>Real-time data processing</li>
              <li>Safer access to challenging terrain</li>
              <li>Actionable deliverables</li>
            </ul>
            <div className="ld-rise" style={d(0.45)}>
              <a className="ld-btn" href={FLY_URL}>
                Fly the drone <Arrow />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== 6. THE TOOLS */}
      <Kit />

      {/* ================================================================== 7. OUR PEOPLE */}
      <section className="ld-sec ld-crew" id="people" aria-labelledby="crew-title" data-loop>
        <div className="ld-wrap ld-crew__grid">
          <div className="ld-crew__copy" data-in>
            <p className="ld-kicker ld-rise">Our people</p>
            <h2 className="ld-lines" id="crew-title">
              <Line>Where the</Line>
              <Line delay={0.12}>data <em>comes from.</em></Line>
            </h2>
            <p className="ld-rise" style={d(0.3)}>
              A team of problem solvers, explorers and community builders. We're proud to work on projects that make a real difference — for people, communities and the places we all share.
            </p>
            <div className="ld-rise" style={d(0.4)}>
              <Link className="ld-btn" to={CAREERS_HREF}>
                Our culture <Arrow />
              </Link>
            </div>
          </div>
          <ul className="ld-mosaic" data-in data-loop>
            {CREW.map((c, i) => (
              <li key={c.stem} className={c.cls} style={d(0.1 + i * 0.1)}>
                <Pic set={[[c.stem]]} width={c.w} height={c.h} alt={c.alt} />
                <span className="ld-alt" aria-hidden="true"><Pic set={[[c.altStem]]} width={600} height={400} /></span>
                {c.cls === "is-d" ? (
                  <p className="ld-hand" aria-hidden="true">People.<br />Places.<br />A brighter tomorrow.</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ================================================================== 8. PURPOSE BAND */}
      <section className="ld-band" id="contact" aria-labelledby="band-title" data-in data-loop>
        <div className="ld-band__bg" aria-hidden="true">
          <Pic set={[["draft-purpose-900", 900], ["draft-purpose", 1774]]} sizes="(max-width: 860px) 220vw, 100vw" width={1774} height={887} drift={0.05} />
        </div>
        <div className="ld-wrap ld-band__copy">
          <p className="ld-kicker ld-rise">Our purpose</p>
          <h2 className="ld-lines" id="band-title">
            <Line>Data for a</Line>
            <Line delay={0.12}><em><Shimmer className="is-band">brighter tomorrow.</Shimmer></em></Line>
          </h2>
          <p className="ld-rise" style={d(0.3)}>
            Trusted geospatial solutions that help build safer communities, stronger infrastructure and a more sustainable future.
          </p>
          <div className="ld-rise" style={d(0.4)}>
            {/* opens the Let's Talk side panel (Footer.tsx) */}
            <a className="ld-btn" href="#lets-talk">
              Let's talk about your project <Arrow />
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
