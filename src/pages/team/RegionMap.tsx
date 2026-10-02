import { MAP } from "./mapData";

/**
 * The service region as a lit survey map, from real boundaries (Natural Earth 1:50m): the coast, BC + Yukon + NWT +
 * Nunavut as one region with its own borders inside, the neighbours faint. The parent's `.is-in` plays the build
 * (coast → region → offices → routes → labels); after that it never stops, quietly: packets run the routes, a scan
 * line sweeps north across the region, the offices pulse, and the `active` office (cycled by the parent, in step
 * with the office list) is lit. See team.css `.tm-map`.
 */
const OFF_LABEL: Record<string, { dx: number; dy: number; anchor: "start" | "end" }> = {
  Vancouver: { dx: 18, dy: 30, anchor: "start" },
  "Vancouver Island": { dx: -18, dy: 30, anchor: "end" },
  Kamloops: { dx: 18, dy: -14, anchor: "start" },
  Whitehorse: { dx: 18, dy: -14, anchor: "start" },
};

/** a gentle arc between two map points, bowed to the left of the direction of travel */
function arc([x0, y0]: readonly number[], [x1, y1]: readonly number[], bow = 0.22) {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const dx = x1 - x0, dy = y1 - y0;
  return `M${x0},${y0} Q${(mx - dy * bow).toFixed(1)},${(my + dx * bow).toFixed(1)} ${x1},${y1}`;
}

export default function RegionMap({ active }: { active: number }) {
  const office = (n: string) => MAP.offices.find((o) => o.name === n)!.xy;
  const van = office("Vancouver"), kam = office("Kamloops"), whs = office("Whitehorse");
  const routes = [
    arc(van, office("Vancouver Island"), 0.5),
    arc(van, kam, -0.35),
    arc(van, whs, 0.16),
    ...MAP.sites.map((s) => arc(whs, s.xy, 0.14)),
  ];
  const east = `M${kam[0]},${kam[1]} C${kam[0] + 120},${kam[1] - 40} ${MAP.w - 220},${kam[1] - 150} ${MAP.w - 70},${kam[1] - 170}`;
  const L = MAP.labels;
  return (
    <svg className="tm-map" viewBox={`0 0 ${MAP.w} ${MAP.h}`} role="img"
      aria-label="Map of Underhill's service region — British Columbia, the Yukon, the Northwest Territories and Nunavut — with offices in Vancouver, Vancouver Island, Kamloops and Whitehorse">
      <defs>
        <clipPath id="tm-svc"><path d={MAP.region} /></clipPath>
        <pattern id="tm-dots" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="4.5" cy="4.5" r="1.15" /></pattern>
        <linearGradient id="tm-scan" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e7ff89" stopOpacity="0" />
          <stop offset="0.82" stopColor="#e7ff89" stopOpacity="0.16" />
          <stop offset="1" stopColor="#f4ffc9" stopOpacity="0.85" />
        </linearGradient>
        <filter id="tm-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <marker id="tm-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M1 1 L9 5 L1 9" fill="none" stroke="#5cc0f5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>

      <path className="tm-map-grat" d={MAP.grat} />
      <path className="tm-map-land" d={MAP.land} />
      <path className="tm-map-others" d={MAP.others} />
      <path className="tm-map-region" d={MAP.region} />
      <path className="tm-map-dots" d={MAP.region} fill="url(#tm-dots)" />
      <g clipPath="url(#tm-svc)" className="tm-map-scanwrap"><rect className="tm-map-scan" x="0" y="0" width={MAP.w} height="150" fill="url(#tm-scan)" /></g>
      <path className="tm-map-inner" d={MAP.regionInner} />
      <path className="tm-map-coast" d={MAP.coast} pathLength={1} filter="url(#tm-glow)" />
      <path className="tm-map-edge" d={MAP.regionEdge} pathLength={1} />

      <g className="tm-map-routes">
        {routes.map((d, i) => (
          <g key={i} style={{ ["--i" as string]: i }}>
            <path className="base" d={d} pathLength={1} />
            <path className="pkt" d={d} pathLength={1} />
          </g>
        ))}
      </g>
      <g className="tm-map-east" style={{ ["--i" as string]: 0 }}>
        <path className="base" d={east} pathLength={1} markerEnd="url(#tm-arrowhead)" />
        <path className="pkt" d={east} pathLength={1} />
        <text x={MAP.w - 70} y={kam[1] - 192} textAnchor="end">ACROSS CANADA</text>
      </g>
      <g className="tm-map-sites">
        {MAP.sites.map((s, i) => <circle key={s.name} cx={s.xy[0]} cy={s.xy[1]} r={4} style={{ ["--i" as string]: i }} />)}
      </g>

      <g className="tm-map-regions" aria-hidden="true" textAnchor="middle">
        <text x={L.yukon[0]} y={L.yukon[1]}>YUKON</text>
        <text x={L.nwt[0]} y={L.nwt[1]}>NORTHWEST TERRITORIES</text>
        <text x={L.bc[0]} y={L.bc[1]}>BRITISH COLUMBIA</text>
        <text x={L.nunavut[0]} y={L.nunavut[1]}>NUNAVUT</text>
        <text className="is-out" x={L.alberta[0]} y={L.alberta[1]}>ALBERTA</text>
      </g>

      <g className="tm-map-offices">
        {MAP.offices.map((o, i) => {
          const lb = OFF_LABEL[o.name] ?? { dx: 14, dy: -10, anchor: "start" as const };
          return (
            <g key={o.name} className={i === active ? "is-active" : undefined} transform={`translate(${o.xy[0]} ${o.xy[1]})`} style={{ ["--i" as string]: i }}>
              <circle className="ring" r={9} />
              <circle className="ring is-late" r={9} />
              <circle className="halo" r={16} />
              <circle className="dot" r={6.5} />
              <text x={lb.dx} y={lb.dy} textAnchor={lb.anchor}>{o.name.toUpperCase()}</text>
            </g>
          );
        })}
      </g>

      {/* cartographic furniture: scale and north */}
      <g className="tm-map-furniture" transform={`translate(28 ${MAP.h - 46})`}>
        <path d={`M0 0 V8 H${MAP.scale.len} V0 M${MAP.scale.len / 2} 8 V3`} />
        <text x="0" y="-8">0</text>
        <text x={MAP.scale.len} y="-8" textAnchor="middle">500 km</text>
      </g>
      <g className="tm-map-furniture" transform={`translate(${MAP.w - 44} ${MAP.h - 74})`}>
        <path d="M0 -18 L7 6 L0 1 L-7 6 Z" className="north" />
        <text x="0" y="26" textAnchor="middle">N</text>
      </g>
    </svg>
  );
}
