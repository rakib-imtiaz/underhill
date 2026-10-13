// Underhill v2 — gear playground: small line drawings for the "How the crew uses it" step lists
// (shown while a gear's 3D model is in production). Each is the inner markup of a 120 × 72 SVG,
// stroke only; the page sets the stroke colour (currentColor) and width. Classes inside:
//   .a  accent stroke (the step's point of interest)     .d  dashed (beams, paths, sight lines)
//   .f  filled with currentColor (or the accent with .a)
// Keys are referenced by missions.js (step.diagram). Unknown keys fall back to 'measure'.

const G = 'M8 62h104';   // the ground line most drawings stand on

export const DIAGRAMS = Object.freeze({
  tripod: `<path d="${G}"/><rect x="53" y="9" width="14" height="11" rx="1.5"/><path d="M49 22h22M56 22 40 62M64 22l16 40M60 22v4"/><path class="a d" d="M60 26v33"/><circle class="a" cx="60" cy="62" r="2.6"/>`,
  level: `<circle cx="60" cy="36" r="25"/><circle class="d" cx="60" cy="36" r="8"/><path d="M60 7v6M60 59v6M31 36h6M83 36h6"/><circle class="a" cx="71" cy="27" r="6"/><path class="a" d="M66 31.5 62.5 34.5m0 0h3.6m-3.6 0v-3.6"/>`,
  sky: `<path d="${G}"/><path d="M60 62V37M51 37h18M53 37a7 6 0 0 1 14 0"/><g class="a"><path d="M21 12h7v4h-7zM18 14h3M28 14h3M47 6h7v4h-7zM44 8h3M54 8h3M83 8h7v4h-7zM80 10h3M90 10h3M98 21h7v4h-7zM95 23h3M105 23h3"/></g><path class="d" d="M26 17 55 32M51 11l7 19M86 13 64 30M100 26 67 33"/>`,
  measure: `<rect x="30" y="8" width="60" height="44" rx="3"/><rect x="35" y="13" width="50" height="23"/><path class="a" d="M39 19h18M39 25h27M39 31h22"/><path d="M37 43h4M44 43h4M51 43h4M58 43h4M65 43h4M72 43h4M79 43h4M60 52v10M50 62h20"/>`,
  stake: `<path d="${G}"/><rect x="72" y="18" width="5" height="44"/><path class="a f" d="M72 18h5v10h-5z"/><path class="a" d="M77 21c6 2 7 8 12 10M77 24c5 3 5 9 9 12"/><path d="M50 62v-7"/><ellipse class="a d" cx="50" cy="61" rx="12" ry="3.5"/><path class="a" d="M16 50h18m-5-4 5 4-5 4"/>`,
  aim: `<circle cx="60" cy="36" r="27"/><path d="M60 9v20M60 43v20M33 36h20M67 36h20M56 30h8M56 42h8"/><circle class="a" cx="60" cy="36" r="4.5"/><circle class="a f" cx="60" cy="36" r="1.5"/>`,
  prism: `<path d="${G}"/><path d="M60 62V24"/><path d="M53 12h14l3 5-3 5H53l-3-5z"/><path class="a" d="M50 17h20"/><circle cx="60" cy="44" r="2.6"/><path class="d" d="M60 40 46 62M60 40l14 22"/>`,
  beam: `<path d="${G}"/><rect x="18" y="20" width="12" height="10" rx="1.5"/><path d="M24 30v2M24 32 14 62M24 32l10 30M96 62V28M90 18h12l2.5 4.5-2.5 4.5H90l-2.5-4.5z"/><path class="a" d="M31 25 86 22.5"/><circle class="a f" cx="88" cy="22.5" r="2"/>`,
  track: `<path d="${G}"/><rect x="12" y="22" width="11" height="9" rx="1.5"/><path d="M17.5 31 10 62M17.5 31 25 62M90 50V22M85 14h10l2 4-2 4H85l-2-4z"/><path class="d" d="M38 60c14-4 30-3 46-8"/><path class="a" d="M46 58v-5M58 56v-5M70 55v-5"/><path class="a d" d="M24 26 82 18"/><path class="a" d="M98 40h9m-3-3 3 3-3 3"/>`,
  unfold: `<rect x="52" y="28" width="16" height="16" rx="2"/><path d="M68 31 87 15M68 41l19 16"/><circle cx="90" cy="13" r="6"/><circle cx="90" cy="59" r="6"/><path d="M52 31 36 34M52 41 36 38"/><path class="d" d="M52 31 33 15M52 41 33 57"/><circle class="d" cx="30" cy="13" r="6"/><circle class="d" cx="30" cy="59" r="6"/><path class="a" d="M37 30c-3-4-4-8-4-12m0 0-2.8 3.4M33 18l2.8 3.2M37 42c-3 4-4 8-4 12m0 0-2.8-3.4M33 54l2.8-3.2"/>`,
  mount: `<rect x="38" y="12" width="44" height="10" rx="2"/><path d="M28 17h10M82 17h10M48 22 42 34h-6M72 22l6 12h6M54 26h12"/><rect class="a" x="53" y="44" width="14" height="12" rx="1.5"/><path class="a" d="M60 40V30m-4 4 4-4 4 4"/><path class="a d" d="M45 54a15 5 0 0 0 30 0"/>`,
  power: `<rect x="36" y="22" width="42" height="24" rx="3"/><path d="M78 30h4v8h-4"/><path class="a" d="M58 25 51 35h7l-3 8 9-11h-7l3-7z"/><path class="a" d="M12 34h14m-4-4 4 4-4 4"/>`,
  calibrate: `<rect x="52" y="28" width="16" height="16" rx="2"/><path class="a" d="M60 11a25 25 0 1 1-23.4 16.2"/><path class="a" d="M36.6 27.2 35 19.6M36.6 27.2l7.2-2.6"/>`,
  grid: `<rect class="d" x="22" y="10" width="76" height="52"/><path class="a" d="M28 16h64v10H28v10h64v10H28v10h64"/><circle cx="28" cy="16" r="2.2"/>`,
  pano: `<path d="${G}"/><rect x="54" y="18" width="12" height="12" rx="2"/><path d="M60 30v4M60 34 50 62M60 34l10 28"/><ellipse class="a d" cx="60" cy="24" rx="34" ry="10"/><path class="a" d="M94 24l-1-6M94 24l4.5-4"/>`,
  scan: `<path d="${G}"/><rect x="18" y="20" width="10" height="14" rx="2"/><path d="M23 34 15 62M23 34l8 28M68 62l16-32 20-8"/><path class="a d" d="M28 26 74 52M28 26 80 38M28 26 88 29M28 26 98 24"/>`,
  assemble: `<rect x="48" y="30" width="24" height="12" rx="5"/><path d="M12 34h24v4H12zM84 34h24v4H84zM60 42v8M54 50h12"/><path class="a" d="M38 26h7m-3-3 3 3-3 3M82 26h-7m3-3-3 3 3 3M60 18v8m-3-3 3 3 3-3"/>`,
  vtol: `<path d="${G}"/><path d="M22 36h76M34 36v-6M86 36v-6M26 28h16M78 28h16"/><rect x="54" y="32" width="12" height="9" rx="3"/><path class="a" d="M60 26V10m-5 5 5-5 5 5"/><path class="a d" d="M60 44v15"/>`,
  fly: `<path d="${G}"/><rect x="52" y="16" width="16" height="7" rx="2"/><path d="M44 16h8M68 16h8M42 13h12M66 13h12"/><path class="a d" d="M54 24 34 60M66 24l20 36"/><path class="a" d="M34 60h52"/><path class="d" d="M10 22c10-6 22-7 32-5"/>`,
  process: `<rect x="32" y="12" width="56" height="34" rx="2"/><path d="M24 52h72l-6-6H30z"/><path class="a" style="stroke-width:2.6" d="M40 38h.1M44 34h.1M48 36h.1M52 30h.1M56 32h.1M60 26h.1M64 30h.1M68 24h.1M72 28h.1M76 22h.1M80 26h.1"/>`,
  walk: `<circle cx="40" cy="14" r="5"/><path d="M40 19v18l-6 16M40 37l6 16M32 26l8-4 8 4"/><rect x="44" y="18" width="7" height="12" rx="1.5"/><path class="a d" d="M60 50c0-14 40-14 40 0s-40 14-40 0z"/><path class="a" d="M100 50l-3.6-3.6M100 50l4-3"/>`,
  target: `<rect x="40" y="16" width="40" height="40"/><path class="f" d="M40 16h20v20H40zM60 36h20v20H60z"/><circle class="a" cx="60" cy="36" r="2.6"/><path class="a" d="M60 6v5M60 61v5M30 36h5M85 36h5"/>`,
  stations: `<path d="${G}"/><rect x="22" y="26" width="8" height="10" rx="1.5"/><path d="M26 36 20 62M26 36l6 26"/><rect x="88" y="26" width="8" height="10" rx="1.5"/><path d="M92 36 86 62M92 36l6 26"/><path class="a d" d="M30 30 72 14M30 30 72 46M88 30 46 14M88 30 46 46"/><circle class="a" cx="59" cy="30" r="3"/>`,
  boat: `<path d="M8 30c8-3 16 3 24 0s16 3 24 0 16 3 24 0 16 3 24 0"/><path d="M40 24h40l-6 8H46zM58 24v-8h6M14 62c20-4 70-4 92 0"/><path class="a d" d="M60 32 30 61M60 32l30 29"/>`,
  flow: `<path d="M8 12h104M8 60h104"/><path class="d" d="M60 12v48"/><rect class="a" x="54" y="31" width="12" height="8" rx="2"/><path class="a" d="M16 24h20m-4-3 4 3-4 3M16 48h26m-4-3 4 3-4 3M80 36h24m-4-3 4 3-4 3"/>`,
  tracker: `<path d="${G}"/><circle cx="28" cy="24" r="9"/><circle class="a" cx="28" cy="24" r="3"/><path d="M22 33h12v4H22zM28 37v6M28 43 18 62M28 43l10 19"/><path class="a" d="M31 23 87 30"/><circle cx="92" cy="31" r="4.5"/><circle class="a" cx="92" cy="31" r="1.6"/>`,
  nest: `<path d="M14 60a46 46 0 0 1 92 0M24 60a36 36 0 0 1 72 0"/><circle class="a" cx="60" cy="14" r="5"/><path d="M54 19h12v3H54z"/><circle cx="31" cy="31" r="2.6"/><circle cx="89" cy="31" r="2.6"/><circle cx="20" cy="50" r="2.6"/><circle cx="100" cy="50" r="2.6"/>`,
  bridge: `<path d="M6 30h108M6 34h108M36 34v28M84 34v28M8 52c10-3 20 3 30 0s20 3 30 0 20 3 30 0 10 3 16 0"/><path class="a" d="M80 18h8l2 4-2 4h-8l-2-4zM84 26v4"/><rect class="a" x="38" y="40" width="7" height="7"/>`,
  alarm: `<path d="M16 10v50h92"/><path class="d" d="M16 26h92"/><path class="a" d="M18 52l16-2 12-2 12-2 12-6 12-8 10-10 12-8"/><circle class="a f" cx="88" cy="26" r="3"/>`,
  rails: `<path d="M10 60 46 12M110 60 74 12M18 50h84M26 40h68M33 31h54M40 22h40"/><path class="a" d="M30 44h60v5H30zM60 44V30M56 23h8l2 3.5-2 3.5h-8l-2-3.5z"/>`,
  staff: `<path d="${G}"/><rect x="16" y="22" width="18" height="8" rx="1.5"/><path d="M25 30v2M25 32 16 62M25 32l9 30"/><rect x="88" y="8" width="8" height="54"/><path class="f" d="M88 12h8v3h-8zM88 19h8v2h-8zM88 25h8v4h-8zM88 33h8v2h-8zM88 39h8v3h-8zM88 46h8v2h-8zM88 52h8v4h-8z"/><path class="a d" d="M35 26h52"/>`,
  plumb: `<path d="${G}"/><path d="M8 40h44M68 40h44M8 43h44M68 43h44M8 18h44M68 18h44M8 21h44M68 21h44"/><rect x="55" y="52" width="10" height="8" rx="1.5"/><path class="a" d="M60 52V8M53 10h14"/>`,
  pack: `<rect x="30" y="20" width="60" height="38" rx="4"/><path d="M48 20v-6h24v6M30 32h60"/><path class="a" d="M40 29v6M80 29v6"/>`,
});

/** The full <svg> for a diagram key (fallback: 'measure'). `label` becomes its accessible name. */
export function diagramSvg(key, label = '') {
  const body = DIAGRAMS[key] || DIAGRAMS.measure;
  const a11y = label ? `role="img" aria-label="${String(label).replace(/"/g, '&quot;')}"` : 'aria-hidden="true"';
  return `<svg class="gx-dia" viewBox="0 0 120 72" ${a11y}>${body}</svg>`;
}
