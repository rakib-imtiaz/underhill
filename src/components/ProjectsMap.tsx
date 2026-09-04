import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  CATS,
  PROJECTS,
  canadaFrame,
  drawMap,
  pinLatLon,
  project,
  W,
  H,
  type Frame,
  type View,
} from "../lib/projectsMap";

/* canadaFrame() walks the whole 1440x720 raster; the answer never changes, so
   it is computed once per page load and shared across mounts. */
let FRAME: Frame | null = null;
const getFrame = () => (FRAME ??= canadaFrame());

/** pins are a pure function of the project list — computed once */
const PINS = PROJECTS.map((p, idx) => {
  const pl = pinLatLon(p.lat, p.lon);
  return { ...p, idx, q: project(pl.lat, pl.lon) };
}).filter((p) => p.q !== null);

const DEFAULT_IDX =
  (PINS.find((p) => p.title.startsWith("BC Place")) ?? PINS[0])?.idx ?? 0;

type Box = { w: number; h: number };

/**
 * The interactive Canada project explorer.
 *
 * The raster stays imperative — it is a per-pixel inverse projection written
 * straight into an ImageData, which React has no business owning. Pins,
 * filters and the detail card are ordinary React state.
 */
export default function ProjectsMap() {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [armed, setArmed] = useState(false);
  const [box, setBox] = useState<Box>({ w: W, h: H });
  const [view, setView] = useState<View | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<number>(DEFAULT_IDX);

  /* the map costs ~1M inverse projections to draw; defer it until it is near */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (!("IntersectionObserver" in window)) {
      setArmed(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        setArmed(true);
      },
      { rootMargin: "400px" }
    );
    io.observe(root);
    return () => io.disconnect();
  }, []);

  /* render at the stage's real aspect so a portrait phone box does not
     squash the projection; cap the long edge to keep the redraw cheap */
  const measure = (): Box => {
    const b = stageRef.current?.getBoundingClientRect();
    const ar = b && b.width && b.height ? b.width / b.height : W / H;
    const long = 1100;
    return ar >= 1
      ? { w: long, h: Math.round(long / ar) }
      : { w: Math.round(long * ar), h: long };
  };

  /* draw once armed, then whenever the stage aspect actually moves */
  useEffect(() => {
    if (!armed) return;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    let current = measure();
    setBox(current);
    setView(drawMap(canvas, getFrame(), current.w, current.h));

    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const next = measure();
        if (Math.abs(next.w / next.h - current.w / current.h) < 0.02) return;
        current = next;
        setBox(next);
        setView(drawMap(canvas, getFrame(), next.w, next.h));
      }, 220);
    };

    window.addEventListener("resize", onResize, { passive: true });
    /* orientation change alone does not always fire a window resize on iOS */
    const ro = "ResizeObserver" in window ? new ResizeObserver(onResize) : null;
    ro?.observe(stage);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
      ro?.disconnect();
    };
  }, [armed]);

  const visible = useMemo(
    () => PINS.filter((p) => !filter || p.cat === filter),
    [filter]
  );

  const active = PROJECTS[selected];

  return (
    <div className="pmap" id="projects-map" ref={rootRef}>
      <div className="pmap-controls">
        <div className="pmap-filters" role="group" aria-label="Filter projects by category">
          <button
            type="button"
            className={filter === "" ? "on" : undefined}
            aria-pressed={filter === ""}
            onClick={() => setFilter("")}
          >
            All
          </button>
          {CATS.map((c) => (
            <button
              key={c}
              type="button"
              className={filter === c ? "on" : undefined}
              aria-pressed={filter === c}
              onClick={() => setFilter(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <span className="pmap-count">
          {visible.length} project{visible.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="pmap-body">
        <div className="pmap-stage" ref={stageRef}>
          <canvas
            className="pmap-canvas"
            ref={canvasRef}
            role="img"
            aria-label="Map of Canada showing Underhill Geomatics project locations"
          />
          <div className="pmap-pins">
            {view
              ? visible.map((p) => {
                  const q = p.q!;
                  const x = ((box.w / 2 + (q.x - view.cx) * view.s) / box.w) * 100;
                  const y = ((box.h / 2 - (q.y - view.cy) * view.s) / box.h) * 100;
                  const offscreen = x < -2 || x > 102 || y < -2 || y > 102;
                  return (
                    <button
                      key={p.idx}
                      type="button"
                      className={`pmap-pin${selected === p.idx ? " on" : ""}`}
                      style={{
                        left: `${x.toFixed(3)}%`,
                        top: `${y.toFixed(3)}%`,
                        visibility: offscreen ? "hidden" : undefined,
                      }}
                      aria-label={`${p.title} — ${p.region}`}
                      onClick={() => setSelected(p.idx)}
                      onFocus={() => setSelected(p.idx)}
                    >
                      <span className="pmap-tip">
                        {p.title}
                        <em>{p.region}</em>
                      </span>
                    </button>
                  );
                })
              : null}
          </div>
        </div>

        <aside className="pmap-card" aria-live="polite">
          {active ? (
            <>
              <span className="pmap-cat">{active.cat}</span>
              <h3>{active.title}</h3>
              <p className="pmap-region">{active.region}</p>
              {active.summary ? (
                <p>{active.summary}</p>
              ) : (
                <p className="pmap-nodata">
                  Project record — see the full case study for scope and delivery
                  detail.
                </p>
              )}
              <Link className="btn small" to="/land-surveying-projects/">
                All Projects
              </Link>
            </>
          ) : null}
        </aside>
      </div>

      <p className="pmap-note">
        Coastline from Natural Earth. Project locations shown approximately.
      </p>
    </div>
  );
}
