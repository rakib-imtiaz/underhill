import { memo, useEffect, useRef, type ReactNode } from "react";
import SmartLink from "./SmartLink";
import { boot } from "../three/core.js";
import { TerrainScene } from "../three/terrain.js";

/* The eight hero chapters, copy-for-copy from the static index.html.
   `right` mirrors the `.chapter.right` variant (desktop only — the mobile
   stylesheet pulls every chapter back to the left). */
type Chapter = {
  right?: boolean;
  heading: ReactNode;
  sub: string;
  actions: { label: string; href: string; ghost?: boolean; unported?: boolean }[];
};

const CHAPTERS: Chapter[] = [
  {
    heading: (
      <>
        Geospatial Solutions That Help You <em>See the Whole Picture</em>
      </>
    ),
    sub: "Full-service geospatial solutions backed by more than a century of experience, driven by innovation, and powered by modern technology.",
    actions: [
      { label: "Our Services", href: "/geospatial-services/" },
      { label: "Request Consultation", href: "#lets-talk", ghost: true },
    ],
  },
  {
    right: true,
    heading: (
      <>
        Every Project Begins at <em>a Single Setup</em>
      </>
    ),
    sub: "Tribrach levelled, instrument height recorded, backsight observed to a known control point. Everything downstream inherits the quality of that first setup — so we document every one of them.",
    actions: [
      {
        label: "Topographic Surveys",
        href: "/geospatial-services/topographic-surveying/",
        unported: true,
      },
    ],
  },
  {
    heading: (
      <>
        Precision. Innovation. <em>Experience.</em>
      </>
    ),
    sub: "For over 100 years, clients have trusted Underhill to deliver clarity and confidence on Canada's most challenging projects.",
    actions: [{ label: "Our Approach", href: "/our-approach/" }],
  },
  {
    right: true,
    heading: (
      <>
        3D Laser Scanning &amp; <em>Reality Capture</em>
      </>
    ),
    sub: "Millions of measured points per setup. We capture existing conditions at full density, then register, clean and deliver them as the model your team can actually build from.",
    actions: [
      {
        label: "Reality Capture",
        href: "/geospatial-services/3d-laser-scanning-reality-capture/",
        unported: true,
      },
    ],
  },
  {
    heading: (
      <>
        Accuracy You Can <em>Defend</em>
      </>
    ),
    sub: "Every distance, angle and elevation is observed, checked and closed by Licensed Canada and British Columbia Land Surveyors (CLS, BCLS) and Professional Geomatics Engineers (P.Eng.).",
    actions: [
      {
        label: "Legal Surveys",
        href: "/geospatial-services/cadastral-surveying/",
        unported: true,
      },
    ],
  },
  {
    right: true,
    heading: (
      <>
        Trusted Geospatial <em>Partners Since 1913</em>
      </>
    ),
    sub: "Trusted and reliable. That's what you can count on with Underhill Geomatics. Through traditional surveying or innovative technologies, we help our clients make informed, data-driven decisions for successful projects.",
    actions: [{ label: "About Us", href: "/about-underhill-geomatics/" }],
  },
  {
    heading: (
      <>
        One Setup. <em>A National Footprint.</em>
      </>
    ),
    sub: "Our professional land surveyors provide services throughout British Columbia, the Yukon, the Northwest Territories, Nunavut and all of Canada.",
    actions: [{ label: "Explore Projects", href: "/land-surveying-projects/" }],
  },
  {
    right: true,
    heading: (
      <>
        Build with Precision. <em>Lead with Certainty.</em>
      </>
    ),
    sub: "Four regional offices across Western and Northern Canada — Vancouver (Burnaby), Vancouver Island, Kamloops and Whitehorse.",
    actions: [{ label: "Request a Consultation", href: "#lets-talk" }],
  },
];

const RAIL = ["Site", "Scan", "Instrument", "Capture", "Plan", "Ascend", "Reach", "Canada"];

/**
 * Owns the hero canvas. The scene itself is untouched imperative three.js:
 * React creates the host element, the effect constructs the scene against it,
 * and unmounting disposes the GPU context and every listener the scene added.
 *
 * Deliberately memo()'d with no props: the scene writes directly to these DOM
 * nodes (chapter opacity, `--enter`, rail `.on`/aria-current, HUD readouts),
 * so a React re-render here would fight the render loop.
 */
function HeroJourney() {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const journey = stage.closest<HTMLElement>(".journey");
    const scene = boot(stage, TerrainScene);
    /* EMERGENCY GPU BUDGET: TerrainScene requests idle 30 / active 48 fps;
       the site-wide budget after the GPU-overheat incident is 24 idle /
       40 active. start() reads these caps each time it (re)builds the loop,
       so restart only if a loop is already running — under ?frame= or
       reduced-motion there is none, and later starts (visibility changes)
       pick the clamped values up on their own. */
    if (scene) {
      const sc = scene as {
        idleFps?: number;
        activeFps?: number;
        raf: number;
        start: () => void;
      };
      sc.idleFps = Math.min(sc.idleFps ?? 24, 24);
      sc.activeFps = Math.min(sc.activeFps ?? 40, 40);
      if (sc.raf) sc.start();
    }
    return () => {
      scene?.dispose?.();
      /* boot() may have pinned the fallback/reduced-motion layout */
      journey?.classList.remove("static");
    };
  }, []);

  return (
    <div className="journey">
      <div className="journey-track">
        <div className="journey-stage" ref={stageRef}>
          <div className="webgl-fallback">
            <img
              src="/assets/uploads/2025/08/Surveyors-on-Mountain_fx.jpg"
              alt="Underhill surveyors at work on a mountain control survey"
            />
            <div className="fb-msg">
              Advanced Geospatial Solutions Since 1913.
              <br />
              <span style={{ fontSize: 12, letterSpacing: ".2em", opacity: 0.6 }}>
                INTERACTIVE 3D SCENE UNAVAILABLE IN THIS BROWSER
              </span>
            </div>
          </div>

          <div className="reticle">
            <div className="ring" />
            <div className="tag">SCAN ACTIVE</div>
          </div>

          <div className="hotspot-tip" aria-hidden="true">
            <span className="t" />
            <span className="d" />
          </div>

          <div className="scene-hud" aria-hidden="true">
            <div className="hud-phase" data-readout="phase">
              APPROACH
            </div>
            <dl className="hud-coords">
              <div>
                <dt>N</dt>
                <dd data-readout="n">5459000.00</dd>
              </div>
              <div>
                <dt>E</dt>
                <dd data-readout="e">491000.00</dd>
              </div>
              <div>
                <dt>ELEV</dt>
                <dd data-readout="z">0.00</dd>
              </div>
            </dl>
            <div className="hud-hint">Drag to orbit · ↑ ↓ to step</div>
          </div>

          <div className="journey-copy">
            {CHAPTERS.map((ch, i) => (
              <div
                key={i}
                className={`chapter${ch.right ? " right" : ""}`}
                data-chapter={i}
              >
                <div className="container">
                  {i === 0 ? <h1>{ch.heading}</h1> : <h2>{ch.heading}</h2>}
                  <p className="sub">{ch.sub}</p>
                  <div className="actions">
                    {ch.actions.map((a) => (
                      <SmartLink
                        key={a.label}
                        className={`btn${a.ghost ? " ghost" : ""}`}
                        to={a.href}
                        unported={a.unported}
                      >
                        {a.label}
                      </SmartLink>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <nav className="rail" aria-label="Scene chapters">
            {RAIL.map((label, i) => (
              <button
                key={label}
                type="button"
                className={i === 0 ? "on" : undefined}
                aria-current={i === 0 ? "true" : "false"}
                aria-label={`Chapter ${i + 1}: ${label}`}
              >
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <div className="scroll-cue">Scroll</div>
        </div>
      </div>
    </div>
  );
}

export default memo(HeroJourney);
