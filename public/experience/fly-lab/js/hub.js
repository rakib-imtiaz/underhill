// Fly Lab hub: the four scenario cards and the comparison table. Results come from the lab's own run
// (data/results-baseline.json) unless this browser has a newer run of a scenario (localStorage, written
// by the scenario pages), which then replaces it.

const SC = [
  { id: 'A', href: './a-osm-three.html', name: 'three.js + OpenStreetMap', engine: 'Our engine (three.js r170) · OSM footprints and heights saved once to a static file',
    cost: 'Free · no key · OSM attribution', needs: null,
    realism: 'Clean architectural model: real footprints and heights, window grids, lit windows at night, roads, SkyTrain guideway, park and street trees. Not photographic.',
    offline: ['pass', 'Yes: everything is served from this site'],
    drone: ['pass', 'Native: the same three.js scene as fly mode (spinning rotors, nav lights, shadows)'],
    keycost: ['pass', 'None. Free, no account; OSM data under ODbL'] },
  { id: 'B', href: './b-google-tiles.html', name: 'Google Photorealistic 3D Tiles', engine: 'three.js + 3d-tiles-renderer 0.4.9 (vendored, as fly mode) · Google Map Tiles API',
    cost: 'Your Google key + billing account · billed per 3D-tiles session after a monthly free allowance', needs: 'Google Maps Platform key',
    realism: 'Photographic: real textures of every building, tree and car (as captured). The most realistic by far; daylight and shadows are baked in.',
    offline: ['fail', 'No: every view streams from Google'],
    drone: ['pass', 'Native: three.js, same drone; the tiles are unlit photos so the drone\'s lighting does not match them exactly'],
    keycost: ['partial', 'Google key + billing; per-session cost after the free allowance; logo and data credits required'] },
  { id: 'C', href: './c-maplibre.html', name: 'MapLibre GL JS + OpenFreeMap', engine: 'MapLibre GL JS 4.7.1 · OpenFreeMap vector tiles (building heights from OSM) · drone in a three.js custom layer',
    cost: 'Free · no key · donation-funded tiles (or self-host them)', needs: null,
    realism: 'A street map with flat-shaded extruded buildings (no windows, no roofs, no trees). Reads as a map, not a place.',
    offline: ['partial', 'No as built (tiles from OpenFreeMap); possible by self-hosting the tiles'],
    drone: ['partial', 'three.js custom layer sharing MapLibre\'s depth buffer; camera pitch capped at 85° (no horizon views), fixed 37° lens'],
    keycost: ['pass', 'None. Free, no account; OpenFreeMap / OpenMapTiles / OSM credits'] },
  { id: 'D', href: './d-cesium.html', name: 'CesiumJS + OSM Buildings + World Terrain', engine: 'CesiumJS 1.145 · Cesium ion: OSM Buildings, World Terrain, Bing imagery · drone exported to glTF',
    cost: 'Cesium ion token · free Community plan is non-commercial / evaluation; a company site needs a paid plan', needs: 'Cesium ion token',
    realism: 'Grey-white OSM extrusions on real terrain and satellite imagery, with a real sun and atmosphere. Accurate rather than pretty.',
    offline: ['fail', 'No: terrain, buildings and imagery stream from Cesium ion'],
    drone: ['partial', 'Exported from three.js to glTF in the page after load (about 15 MB uncompressed, 2–5 s, up to 30 s in a background tab); static rotors, Cesium\'s own lighting'],
    keycost: ['partial', 'Cesium ion token; free tier non-commercial, paid plan for a company site'] },
];
const TESTS = [['load', 'Load time'], ['frames', 'Frame time'], ['size', 'Download'], ['collide', 'Collision'], ['lidar', 'LiDAR raycast'], ['daynight', 'Day / night'], ['mobile', 'Phone 390 px'], ['attrib', 'Attribution']];
const ST = { pass: 'Pass', fail: 'Fail', partial: 'Partial', blocked: 'Needs key', skip: 'Skipped', pending: 'Not run', running: 'Not finished' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function load() {
  let base = {};
  try { base = await (await fetch('./data/results-baseline.json', { cache: 'no-cache' })).json(); } catch { /* none yet */ }
  const out = {}; let local = 0;
  for (const s of SC) {
    let mine = null;
    try { mine = JSON.parse(localStorage.getItem('flylab:v1:result:' + s.id) || 'null'); } catch { /* ignore */ }
    const b = base[s.id] || null;
    const useMine = mine && (!b || mine.at > b.at) && Object.keys(mine.tests || {}).length >= Object.keys(b?.tests || {}).length;
    out[s.id] = useMine ? { ...mine, source: 'your run' } : b ? { ...b, source: 'lab run' } : null;
    if (useMine) local++;
  }
  return { res: out, local };
}

function keySaved(s) { try { return !!localStorage.getItem(s.id === 'B' ? 'flylab:key:google' : s.id === 'D' ? 'flylab:key:cesium' : '_'); } catch { return false; } }

function statusOf(s, r) {
  if (!r) return ['pending', 'Not run yet'];
  if (s.needs && (r.mode === 'nokey' || r.mode === 'fallback')) return ['blocked', r.mode === 'fallback' ? 'Needs token (fallback tested)' : 'Needs key'];
  const t = r.tests || {};
  if (t.load?.status === 'fail' && /did not start/.test(t.load.value || '')) return ['fail', 'Failed'];
  return ['pass', 'Works'];
}

function cell(t, fallbackText) {
  if (!t) return `<span class="v dim">${esc(fallbackText || 'not run')}</span>`;
  return `<span class="dot" data-s="${t.status}" aria-hidden="true"></span><span class="v">${esc(t.value || ST[t.status])}${t.hidden ? ' <em class="hid">hidden tab</em>' : ''}</span>`;
}

function render({ res, local }) {
  if (local) document.getElementById('hub-src').textContent = `Results: ${local} scenario${local > 1 ? 's' : ''} from your own runs in this browser, the rest from the lab's run (hidden browser tab).`;
  document.getElementById('hub-cards').innerHTML = SC.map((s) => {
    const r = res[s.id]; const [st, label] = statusOf(s, r);
    const t = r?.tests || {};
    const pass = TESTS.filter(([k]) => t[k]?.status === 'pass').length;
    const when = r?.at ? new Date(r.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
    return `<article class="card" data-id="${s.id}">
      <header class="card__head"><span class="card__id">${s.id}</span><div><h3>${esc(s.name)}</h3><p class="card__eng">${esc(s.engine)}</p></div></header>
      <div class="card__meta"><span class="pill" data-s="${st}">${esc(label)}</span><span class="card__score">${r ? `${pass} / ${TESTS.length} tests pass` : ''}</span></div>
      <p class="card__cost"><b>Cost:</b> ${esc(s.cost)}</p>
      ${r?.mode === 'fallback' ? '<p class="card__fb">Tested without a token on a <b>fallback</b>: Cesium with our own OSM extrusions instead of Cesium OSM Buildings and World Terrain. Engine numbers are real; the city is not the real candidate.</p>' : ''}
      ${s.needs ? `<p class="card__key">${keySaved(s) ? 'A key is saved in this browser: open the scenario and press <b>Run tests</b>.' : `Needs your <b>${esc(s.needs)}</b>: paste it in the box on the scenario page (stored only in this browser).`}</p>` : ''}
      <ul class="card__tests">${TESTS.map(([k, n]) => `<li><span class="n">${n}</span>${cell(t[k])}</li>`).join('')}</ul>
      <footer class="card__foot"><a class="hub-btn" href="${s.href}">Open scenario ${s.id} &rarr;</a><span class="card__when">${r ? esc(r.source) + ' · ' + esc(when) : ''}</span></footer>
    </article>`;
  }).join('');

  const rows = [
    ['Realism', 'assessed', (s) => `<span class="v">${esc(s.realism)}</span>`],
    ['Load time', 'measured', (s, t) => cell(t.load)],
    ['Frame time (20 s route)', 'measured', (s, t) => cell(t.frames)],
    ['Download size', 'measured', (s, t) => cell(t.size)],
    ['Key / cost', 'assessed', (s) => `<span class="dot" data-s="${s.keycost[0]}"></span><span class="v">${esc(s.keycost[1])}</span>`],
    ['Works offline', 'assessed', (s) => `<span class="dot" data-s="${s.offline[0]}"></span><span class="v">${esc(s.offline[1])}</span>`],
    ['Collision with buildings', 'measured', (s, t) => cell(t.collide)],
    ['LiDAR raycast possible', 'measured', (s, t) => cell(t.lidar)],
    ['Drone-model integration', 'assessed', (s) => `<span class="dot" data-s="${s.drone[0]}"></span><span class="v">${esc(s.drone[1])}</span>`],
    ['Day / night', 'measured', (s, t) => cell(t.daynight)],
    ['Mobile (390 px)', 'measured', (s, t) => cell(t.mobile)],
    ['Attribution', 'measured', (s, t) => cell(t.attrib)],
  ];
  document.getElementById('hub-table').innerHTML = `<thead><tr><th scope="col"><span class="sr">Criterion</span></th>${SC.map((s) => `<th scope="col"><a href="${s.href}"><span class="card__id sm">${s.id}</span>${esc(s.name)}</a>${res[s.id]?.mode === 'fallback' ? '<span class="fb">measured on fallback data</span>' : res[s.id]?.mode === 'nokey' ? '<span class="fb">no key yet</span>' : ''}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([name, kind, f]) => `<tr><th scope="row">${name}<i>${kind}</i></th>${SC.map((s) => `<td>${f(s, res[s.id]?.tests || {})}</td>`).join('')}</tr>`).join('')}</tbody>`;
}

load().then(render);
addEventListener('storage', () => load().then(render));
