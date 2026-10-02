import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import RegionMap from "./RegionMap";
import { MAP } from "./mapData";

const CYCLE = 3600; // ms on each office
const OFFICES = [
  { name: "Vancouver", href: "/vancouver-land-surveyors/", note: "Head office · Burnaby" },
  { name: "Vancouver Island", href: "/vancouver-island-land-surveyors/", note: "Comox Valley" },
  { name: "Kamloops", href: "/kamloops-land-surveyors/", note: "BC Interior" },
  { name: "Whitehorse", href: "/whitehorse-land-surveyors/", note: "Yukon & the North" },
];

/** decimal degrees → 49°17′N style, as a surveyor would read it off */
function dms(v: number, pos: string, neg: string) {
  const a = Math.abs(v), d = Math.floor(a), m = Math.round((a - d) * 60);
  return `${d}°${String(m).padStart(2, "0")}′${v >= 0 ? pos : neg}`;
}

/**
 * OUR REACH: copy, the office list and the region map, kept in step. A highlight steps through the offices on a
 * loop (list row, map station and a coordinate readout together); hovering or focusing an office pins it. It only
 * runs while the section is on screen, and not under reduced motion.
 */
export default function Reach() {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const pinned = useRef(false);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const q = new URLSearchParams(location.search);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || q.get("motion") === "0") return;
    const force = q.get("tl") === "force";
    let visible = force, timer = 0;
    const step = () => {
      if (!pinned.current && visible && (force || !document.hidden)) setActive((k) => (k + 1) % OFFICES.length);
      timer = window.setTimeout(step, CYCLE);
    };
    const io = new IntersectionObserver(([e]) => { visible = force || e.isIntersecting; }, { threshold: 0.3 });
    io.observe(el);
    timer = window.setTimeout(step, 3600 + CYCLE); // let the map build first
    return () => { io.disconnect(); clearTimeout(timer); };
  }, []);

  const pin = (i: number | null) => { pinned.current = i !== null; if (i !== null) setActive(i); };
  const o = MAP.offices.find((x) => x.name === OFFICES[active].name)!;

  return (
    <div className="tm-wrap tm-reach" ref={root}>
      <div className="tm-reach-copy" data-in>
        <p className="tm-eyebrow tm-rise">Our reach</p>
        <h2 className="tm-lines">
          <span className="tm-line"><span>Local knowledge.</span></span>
          <span className="tm-line"><span style={{ ["--d" as string]: "0.12s" }}><em>National impact.</em></span></span>
        </h2>
        <p className="tm-rise" style={{ ["--d" as string]: "0.25s" }}>
          Our professional land surveyors serve British Columbia, the Yukon, the Northwest Territories, Nunavut and
          all of Canada — with deep knowledge of the landscapes our communities live in.
        </p>
        <ul className="tm-offices tm-rise" style={{ ["--d" as string]: "0.35s" }}>
          {OFFICES.map((x, i) => (
            <li key={x.name} className={i === active ? "is-active" : undefined}>
              <Link to={x.href} onMouseEnter={() => pin(i)} onMouseLeave={() => pin(null)} onFocus={() => pin(i)} onBlur={() => pin(null)}>
                <span className="tm-office-name">{x.name}</span>
                <span className="tm-office-note">{x.note}</span>
                {i === active && <span className="tm-office-bar" aria-hidden="true" key={active} />}
              </Link>
            </li>
          ))}
        </ul>
        <div className="tm-readout-card tm-rise" style={{ ["--d" as string]: "0.45s" }} aria-live="polite">
          <span className="tm-readout-k">Station</span>
          <span className="tm-readout-v" key={o.name}>{o.name}</span>
          <span className="tm-readout-c" key={o.name + "c"}>{dms(o.lat, "N", "S")} · {dms(o.lon, "E", "W")}</span>
        </div>
      </div>
      <div className="tm-reach-map" data-in>
        <RegionMap active={active} />
      </div>
    </div>
  );
}
