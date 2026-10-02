# Underhill Geomatics — React + Vite port

A React 18 + TypeScript + Vite port of the static `website-skill` clone of
underhill.ca. The scroll-driven WebGL hero and the interactive Canada project
map are both ported at full fidelity; the three.js scenes remain plain,
imperative ES modules.

**This directory is now the deliverable.** The port was originally written
against a sibling `website-skill/` reference tree; that directory, along with
the other exploratory builds, has since been removed from the workspace. The
three.js sources under `src/three/` are therefore no longer a mirror of
anything — see *Performance work* below, which diverges from them deliberately.

---

## Running it

```bash
npm install
npm run dev        # http://localhost:5180  (--strictPort)
npm run build      # tsc -b && vite build  -> dist/
npm run preview    # serve dist/ on 5180
npm run typecheck  # tsc -b --force
```

Node 20+ / npm 10+ (developed on Node 24.16, npm 11.13).

`npm run build` and `npm run dev` both pass with zero TypeScript errors and no
runtime console errors.

### Debug hooks (preserved from the source)

- `?frame=<0..1>` — synchronous seek into the hero's 8-chapter timeline; the
  scroll driver is suppressed and one settled frame is rendered.
  e.g. <http://localhost:5180/?frame=0.72> lands on the globe.
- `window.__scene` — `{ seek, frame, view, stats, graph, cam, lit, shot }`,
  exactly as in `js/three/core.js`, plus a `__owner` back-reference so the
  React component can tell whether the global is still its own before deleting
  it on unmount.

---

## Routes

| Path | Component |
|---|---|
| `/` | `pages/Home` (hero + project map) |
| `/geospatial-services` | `pages/Services` |
| `/geospatial-services/aerial-surveying` | `pages/services/AerialSurveying` |
| `/geospatial-services/construction-surveying` | `pages/services/ConstructionSurveying` |
| `/geospatial-services/deformation-monitoring` | `pages/services/DeformationMonitoring` |
| `/geospatial-services/hydrographic-surveying` | `pages/services/HydrographicSurveying` |
| `/geospatial-services/3d-laser-scanning-reality-capture` | `pages/services/LaserScanning` |
| `/geospatial-services/cadastral-surveying` | `pages/services/CadastralSurveying` |
| `/geospatial-services/first-nations-land-claims-surveying` | `pages/services/FirstNationsSurveying` |
| `/geospatial-services/railway-surveying` | `pages/services/RailwaySurveying` |
| `/geospatial-services/topographic-surveying` | `pages/services/TopographicSurveying` |
| `/geospatial-services/boma-surveying` | `pages/services/BomaSurveying` |
| `/geospatial-services/bim-modelling-services` | `pages/services/BimModelling` |
| `/land-surveying-projects` | `pages/Projects` |
| `/category/land-survey-projects/construction` | `pages/projects/Construction` |
| `/category/land-survey-projects/environmental` | `pages/projects/Environmental` |
| `/category/land-survey-projects/first-nations` | `pages/projects/FirstNations` |
| `/category/land-survey-projects/historical` | `pages/projects/Historical` |
| `/category/land-survey-projects/infrastructure` | `pages/projects/Infrastructure` |
| `/category/land-survey-projects/mining` | `pages/projects/Mining` |
| `/category/land-survey-projects/energy` | `pages/projects/Energy` |
| `/about-underhill-geomatics` | `pages/About` |
| `/our-team` | `pages/Team` |
| `/our-approach` | `pages/Approach` |
| `/careers`, `/about-underhill-geomatics/careers` | `pages/Careers` |
| `/story`, `/history-of-underhill-geomatics` | `pages/Story` |
| `/about-underhill-geomatics/land-surveyors` | `pages/Industries` |
| `/about-underhill-geomatics/health-safety` | `pages/HealthSafety` |
| `/about-underhill-geomatics/affiliations` | `pages/Affiliations` |
| `/about-underhill-geomatics/underhill-brand` | `pages/UnderhillBrand` |
| `/vancouver-land-surveyors` | `pages/ContactPage` |
| `/vancouver-island-land-surveyors` | `pages/ContactPage` |
| `/kamloops-land-surveyors` | `pages/ContactPage` |
| `/whitehorse-land-surveyors` | `pages/ContactPage` |
| `*` | `pages/NotFound` |

**36 routes.** The eleven service detail pages, the seven project-category
pages, careers, the company history and the four About sub-pages (Industries,
Health and Safety, Affiliations, Underhill Brand) were added after the first
pass; the original port covered only the ten top-level pages.

Route paths are declared without a trailing slash; React Router v6 matches the
source site's trailing-slash URLs against them, so every link in the ported
markup keeps the exact `href` it had in the static clone.

`components/SmartLink` still routes around anything flagged `unported: true`
in `data/nav.ts`, rendering it as a plain `<a>` with the correct URL rather
than a dead client route. That set has shrunk to the handful of pages still
not built (privacy policy and similar).

---

## What was ported

### The three.js scenes — copied, not rewritten

`src/three/` holds `core.js`, `atmos.js`, `terrain.js`, `globe.js`,
`instrument.js`, `scancloud.js` and `landmask.js`. They started byte-for-byte
from `website-skill/js/three/`; they now differ in three porting changes plus
a round of performance work (documented separately below).

The three porting changes:

1. **`atmos.js`** — the five post-processing imports now resolve from the
   `three` npm package (`three/examples/jsm/postprocessing/…`) instead of the
   CDN importmap URLs the static page used. `three` is pinned to `^0.160.0` to
   match.
2. **`core.js`** — `SceneBase` gained `onCleanup()`, `listen()` and
   `dispose()`. Nothing about the render contract changed: the settled first
   frame, the DPR cap, the `?frame=` hook, `prefers-reduced-motion`, the
   IntersectionObserver pause and the WebGL fallback all behave as before.
   `dispose()` cancels the rAF, unregisters every listener/observer, disposes
   geometries, materials, textures, composer targets and the renderer, forces
   context loss and removes the canvas. React owns the element's lifetime, so
   unmount has to release the GPU context.
3. **`terrain.js`** — nine `addEventListener` calls became `this.listen(…)` so
   they are torn down by `dispose()`. No logic changed.

The scenes are **not** type-checked (`allowJs: true`, `checkJs: false`). That
is intentional: it keeps the port faithful and makes a future re-sync from the
static site a copy plus nine mechanical substitutions.

Zero asset files are involved in any scene — everything is still procedural,
including the run-length-encoded Natural Earth raster in `landmask.js`, which
is generated and must never be hand-edited.

### React components

| Component | Replaces |
|---|---|
| `components/HeroJourney` | the `.journey` markup in `index.html` + the boot script |
| `components/ProjectsMap` | `js/projects-map.js` (DOM half) |
| `components/SceneEmbed` | the `.scene-embed` boot script on service pages |
| `components/Header`, `MobileNav` | the header/burger half of `js/main.js` |
| `components/Footer`, `Toast` | the footer form + toast half of `js/main.js` |
| `hooks/useReveal` | the reveal-on-scroll half of `js/main.js` |
| `lib/projectsMap.ts` | `js/projects-map.js` (maths half), typed |

**`HeroJourney`** renders the chapter/rail/HUD markup and constructs
`TerrainScene` in an effect against its own stage element. It is `memo()`'d and
takes no props, because the scene writes directly into those DOM nodes every
frame (chapter `opacity` and `--enter`, rail `.on` and `aria-current`, HUD
coordinate readouts). A React re-render there would fight the render loop. The
scene logic was **not** converted to React state.

**`ProjectsMap`** keeps the canvas rendering imperative — it is a per-pixel
inverse projection written into an `ImageData`, which React has no business
owning — while pins, category filters, the project count and the detail card
are ordinary React state. Pins are real `<button>` elements with `aria-label`,
selected on click *and* on focus, exactly as the source did. The draw is still
deferred behind an `IntersectionObserver` with a 400 px root margin because it
costs ~1M inverse projections, and it still renders at the stage's real aspect
ratio rather than stretching a fixed 1200×840 raster.

### Styling

`src/styles/style.css` is `css/style.css` verbatim — same design system, same
brand colours (`#0082CA`, `#2A2F38`/`--navy: #3c3950`, `--lime: #e7ff89`), same
media queries. No Tailwind, no CSS modules, no renaming. Google Fonts are still
loaded from `index.html`.

### Mobile behaviour

Inherited unchanged from the ported stylesheet:

- sticky hero stage on `100svh` with a `100vh` fallback (`@supports`)
- ≤860 px: chapter copy bottom-anchored over a dark gradient scrim,
  left-aligned only, blur filter removed
- chapter rail becomes a horizontal row at the bottom centre, with the copy
  padded clear of it
- coarse-pointer (and ≤860 px) devices hide the reticle, hotspot tooltip and HUD
- `touch-action: pan-y` on the hero stage; the scene only claims clearly
  horizontal drags for its orbit (logic in `terrain.js`)
- the project map uses `aspect-ratio: 5/6` and 34 px pin hit targets below
  900 px, and the canvas is drawn at the container's real aspect ratio

### Accessibility

Preserved as-is: skip link, real `<button>` elements for map pins and the
chapter rail, `aria-label` / `aria-current` / `aria-live` / `aria-pressed`,
`role="group"` on the filters, `role="img"` + label on the map canvas, and the
`prefers-reduced-motion` path (the scene renders a settled final frame and the
`.journey.static` class unpins the scroll choreography).

### Assets

`public/assets/` is a straight copy of `website-skill/assets/` (403 files,
~33 MB). Nothing was re-downloaded, re-encoded or renamed, and every `src` in
the ported markup keeps its original `/assets/uploads/…` path.

---

## Total station model (v2, rebuilt)

`src/three/instrument.js` was rebuilt from scratch. The v1 model was a stack
of sharp boxes in near-black paint (`0x15171c`, envMapIntensity 0.9); under
a rig that lights the valley from 15 units out it rendered as a silhouette
with no readable form. v1 is kept at `.backup/instrument-v1/` alongside the
`terrain.js` / `core.js` of the same moment.

The contract is unchanged — `makeKit(env)`, `buildTotalStation(kit) ->
{ root, parts, pad }`, `layoutAssembly`, `InstrumentScene`; the telescope
axis stays at y = 1.37 because `terrain.js` builds the EDM beam and the
prism from that datum. Every kit material name survives (the prism and the
monuments use them). What changed:

- **Identity features.** Two rounded standards carrying the telescope on a
  visible trunnion axle; a carrying handle arched between them (TubeGeometry
  on a CatmullRom curve, bossed at both ends); a tilted display with an
  emissive screen and a 12-key instanced keypad; a fat telescope with
  sunshade, focus ring, objective glass, EDM dot and eyepiece cup; a
  triangular tribrach (Shape extrude) with three vertical knurled foot screws
  and a circular bubble; a wooden tripod — two hardwood slats per leg, a
  blue clamp bracket with wing screw, aluminium inner leg, steel shoe and
  foot-step plate.
- **Chamfers everywhere.** `chamferBox()` (ExtrudeGeometry with bevel)
  replaces BoxGeometry on every casting; the bevel is where the rim light
  lands. `knurledKnob()` builds a smooth core plus one InstancedMesh of ribs.
- **Materials lifted out of black.** `paintSatin` 0x2b2f37 with a light
  clearcoat, envMapIntensity 1.5, new `wood` / `keyCap` / `screen` /
  `laserRed` entries.
- **Its own lights.** Two SpotLights parented to the station in
  `terrain.js` (`stationKey` warm from upper front-left, `stationRim` cool
  from behind), no shadows — the contact sprite does that job.
- **Desktop macro framing** (chapter 2) tightened from radius 2.1 to 1.55,
  and the ENGAGE ripples now fade out over p 0.20–0.27 (was 0.28–0.40) so
  the close-up is not shot through a wall of rings. These are the only
  desktop-visible changes.
- **Desktop render quality.** Desktop `dprCap` 1.0 → 1.5 (Windows display
  scaling at 125–150% made the 1.0 cap a visible blur-up on every hard
  edge), the EffectComposer now renders into a **4× MSAA** target on desktop
  (`makePost({ samples })`; the canvas itself has `antialias:false` under a
  post chain, so edges had no AA at all), and the quality governor's floor is
  raised 0.55 → 0.8 — below that the scene is pixelated, which is worse than
  a dropped frame. Phones keep native DPR with no MSAA.
- The assembly groups `tribrach` / `alidade` / `telescope` are now actually
  registered in `parts`; v1 registered only the pad and the legs, so the
  services-page assembly animation only ever exploded the tripod.

---

## Checkpoint mode (phones and tablets)

On touch devices and any viewport 1024 px wide or narrower, the hero no longer
scrubs with the finger. `terrain.js` sets `this.stepped`, adds
`.journey.stepped`, and the track collapses to one viewport:

- **One swipe = one chapter.** A vertical swipe (or a wheel burst) calls
  `stepTo(k)`, which tweens `progress` from anchor `k/7` to the next over
  ~1.1 s. The camera follows the same authored path desktop takes, on the clock
  instead of the scroll position, so the only frames a user can *rest* on are
  the eight anchor frames. Horizontal drags still orbit.
- **Engaged only at the top of the page.** `touch-action` is `none` while
  `scrollY <= 4` and `pan-y` otherwise; a swipe past the last chapter
  (`exitDown`) smooth-scrolls into the page and hands control back to the
  browser. Scrolling back to the top re-engages at whatever chapter was last
  shown.
- **Captions are class-driven** (`.chapter.on`): cut out the instant a step
  starts, fade up on arrival. The scroll-fraction fade that produced half-faded
  ghosts and a blank beat at chapter 4 on the recording is desktop-only now.
- **Rail dots and arrow keys** route through `stepTo` as well.
- **Stepped devices render at native density** (`dprCap` 2.0, i.e. min(DPR, 2))
  at 24 fps idle / 48 fps active, on a 104² grid. The 0.85x / 20 fps / 88²
  phone budget that the free-scrub build used was tuned for a desktop iGPU;
  on a 3x retina phone it rendered every ring and edge as a pixel stair. A
  step only runs hot for ~1 s, and the viewport is a quarter of a desktop's,
  so the budget holds.

### Portrait composition

`fitDistance()` fits the subject to the *narrower* field of view, which in a
tall frame is the horizontal one: every shot backed off until the instrument
was a speck, except the globe legs, whose subject radius overran the frame.
`PORTRAIT_OVERRIDES` gives each chapter its own `radius` / `target` / `pad` /
`pitch` when `stepped && camera.aspect < 0.95`; `PORTRAIT` is the merged
table and `apply()` picks it without allocating. All eight anchors and all
seven mid-leg frames were checked at 360x780 and 820x1180.

Portrait also gets a small polish pass, all gated on `usePortrait`: the
horizon haze quad is hidden (its bottom edge read as a hard seam above the
valley), the ENGAGE ripples fade out before the INSTRUMENT macro instead of
sitting behind it, a point light (`portraitFill`) rides just off the camera
during the macro so the instrument is lit rather than silhouetted, and the
grade vignette is capped at 0.95. Steps take 1.25 s (`STEP_MS`). The globe's
footprint cues (Canada highlight, office markers, pulses) ramp earlier in
portrait so they are already on at the REACH anchor -- on the free scrub they
belong to the last leg, on a stepped phone that anchor is the whole chapter.

The REACH anchor (chapter 6) is the "national footprint" frame in portrait,
so its cues are retimed there: Canada highlight ramps over p 0.76-0.85 (desktop
0.84-0.96), office markers 0.79-0.86 (desktop 0.88-0.97), pulses 0.80-0.90.
On the free scrub those land late in the last leg; on a step they must already
be up when the anchor frame is the one the user rests on. The shot itself
looks straight down the BC axis (`dir [0.04, 0.93, 0.37]`, radius 50) so
Canada sits centred in the clear band above the caption.

Portrait also drives three uniforms from `apply()`: `uSizeMul` (0.7) and
`uSizeMax` (10 px) keep the close-range terrain sprites reading as a scan
rather than bokeh, and the valley fog is halved so the plan view can be shot
from far enough out for the parcel drawing to keep its shape. On desktop the
same uniforms resolve to 1.0 / 16 px / fog x1 -- the previous values.

Desktop (`stepped === false`) is byte-for-byte the previous behaviour: free
scrub on the 800vh track, `CHAPTERS` table, scroll-fraction captions.

`dev/_phone.html` is a dev-only harness (`/dev/_phone.html?w=360&h=780&frame=0.5`
under `npm run dev`) that loads the site in a phone-sized iframe; it is
outside `public/` on purpose and never ships.

The team page got a related fix: the leader photo column no longer stretches
to the length of the bio (the president's was a 240 x ~900 crop on tablets).
Tablet uses a fixed 4:5 portrait beside the text; phones use a profile header
(photo beside name, role and credentials) with the bio full-width beneath.

---

## Performance work

The scene was pinning an integrated GPU (Ryzen 7 5700G) at ~90% utilisation.
The cause was fill rate, not geometry: every layer is additively blended with
`depthWrite: false`, so there is no early-z anywhere and the cost is measured
in pixels written, not in points submitted.

All of the following live in `src/three/`. **None of it has been measured on
the target hardware** — the figures below are counts read out of the source
and the arithmetic that follows from them, not profiler output. There is no
GPU-timing HUD in this port; measuring properly means Chrome's frame profiler
or a `EXT_disjoint_timer_query_webgl2` harness, neither of which was run.

### Particle counts

| Emitter | Original | Now |
|---|---|---|
| Terrain grid (`terrain.js`) | 190² = 36 100 | 110² = **12 100** |
| Globe land points (`terrain.js` → `globe.js`) | 90 000 | **24 000** |
| Starfield (`atmos.js` via `terrain.js`) | 1 400 | **800** |
| **Hero total** | **127 500** | **36 900** (−71%) |

Phone/small tier falls from 49 550 to 23 236: grid 130² → 104², globe 32 000 →
12 000, stars 650 → 420. `globe.js` also carries a hard `MAX_LAND_POINTS =
24 000` ceiling, so no caller can ask for more regardless of what it passes.

The reality-capture cloud on the services page (`scancloud.js`) went from a
0.09 scan step to 0.16, and its ground slab from 0.22 to 0.34 — the slab is
backdrop, not subject.

### Point-size caps

`terrain.js` computed `gl_PointSize` with no upper bound. At close camera
range (`-mv.z ≈ 2`) that yields sprites about **70 px across**; tens of
thousands of those, additively blended, is the single worst overdraw case in
the scene. Now capped at 16 px. `scancloud.js` capped at 10 px; `globe.js`'s
existing clamp tightened from 7 px to 5 px.

### Structural changes

1. **Adaptive frame cap** (`core.js`) — the loop rendered on every
   `requestAnimationFrame`. It now renders at 24 fps idle / 40 fps active
   (20/32 on phones), where "active" means scroll progress changed or the
   pointer moved, held for 0.4 s. `tickMotion` receives real elapsed time, so
   drift and breathing run at identical wall-clock speed at any cap. Scenes
   set `idleFps` / `activeFps`; pointer handlers set `this.pointerMoved`.
2. **Quality-governor thresholds are now relative to the cap** (`core.js`) —
   `_tuneQuality` compared frame time against a hardcoded 21 ms. Under a
   30 fps cap every frame is 33 ms, which would have read as permanent
   overload and pinned `qualityScale` at its 0.55 floor forever.
3. **Pixel-ratio ceiling** — `dprCap` 1.75 → **1.0** globally; the hero 1.25 →
   1.0, and 0.85 on phones. Cost scales with the square of this number, so
   the hero draws ~36% fewer pixels per frame than it did at 1.25.
4. **No MSAA under post-processing** — scenes declare `static usesPost = true`
   (only `TerrainScene` does) and `SceneBase` passes `antialias: !usesPost`.
   The composer resolves into its own render target regardless, so the
   multisample buffer was pure cost.
5. **The globe is culled until it is on screen** (`terrain.js`) — its earliest
   fade-in begins at `p = 0.56`, so for the first half of the scroll 42 000
   additive points plus a body, an atmosphere shell, a graticule and six arcs
   were being blended at zero opacity. `group.visible = p > 0.55`, and the
   per-frame uniform writes are skipped with it. Three.js frustum-culls
   automatically but could not catch this: the globe was inside the frustum,
   merely invisible.

### Considered and rejected

- **Depth pre-pass** — useless here. Every layer is additive with
  `depthWrite: false`; there is no occlusion to exploit.
- **`pmndrs/postprocessing` in place of `UnrealBloomPass`** — genuinely
  cheaper (it merges effects into fewer passes), but it is a dependency swap
  and a rewrite of the post chain. Worth doing; too invasive to fold in here.
- **`frameloop="demand"` / render-on-demand** — not applicable, the scene has
  continuous idle motion. The adaptive cap is the usable form of it.
- **Instancing / draw-call reduction** — irrelevant; each point cloud is
  already a single draw call.

### Visible trade-offs

Idle motion runs at 24 fps rather than 60, DPR 1.0 is softer than 1.75, and
the terrain surface is markedly sparser at 110² than at 190² — that last one
is the most visible of the three. Each reverts in one line (`core.js`
`IDLE_FPS`, `terrain.js` `dprCap`, `terrain.js` `GRID`).

**Not visually verified.** `tsc -b && vite build` passes clean, but the
rendered result has not been inspected in a browser — the globe cull threshold
in particular is worth eyeballing mid-scroll before this ships.

---

## Decisions and intentional simplifications

- **Content pages are data-driven, not HTML-transcribed.** The four
  location/contact pages are structurally identical in the source, so they
  share `pages/ContactPage` and their real copy lives in `data/offices.tsx`
  (addresses, phone/fax numbers, service-area lists, staff names, featured
  project lists). Where the source page had no fax number (Vancouver Island)
  the field is simply absent — nothing was inferred or filled in.
- **No invented facts.** Every string on every page comes from the
  corresponding source file. `1913`, `Get It Right the First Time with
  Underhill`, `Advanced Geospatial Solutions Since 1913.` and the
  `BCLS` / `CLS` / `P.Eng.` credentials all survive verbatim. Where the source
  had an empty or stub section, the port drops the empty shell rather than
  writing filler.
- **Some near-empty source sections were merged.** The contact pages express
  each manager as two consecutive one-line `<section>`s (name, then role); the
  port renders those as a single "Office Managing Partner(s)" block with the
  same name/role strings. Same content, less dead scroll.
- **No content was added.** The project map lives only on the home page, as in
  the source; the Projects page does not get one.
- **Scope grew past the original port.** The eleven service detail pages, the
  seven project-category pages, careers and the company history are all built
  now. Anything still unbuilt (privacy policy and similar) keeps its correct
  URL via `SmartLink` and lands on the 404 page in this SPA.
- **`tools/render-map-preview.mjs` was not ported.** It imports the map maths
  from `js/projects-map.js`; here that module is TypeScript (`lib/projectsMap.ts`),
  which Node cannot import directly. `tools/build-landmask.mjs` **was** ported,
  with its output path repointed to `src/three/landmask.js`.
- **SPA, not SSR.** Per-route `<title>` and meta description are set from
  `hooks/useDocumentMeta`; crawlers see the `index.html` defaults first. A real
  deployment would want prerendering, and the server must rewrite unknown paths
  to `index.html`.
- **`StrictMode` is on.** Effects therefore double-invoke in development, which
  means each scene is constructed, disposed and reconstructed once on mount —
  a deliberate stress test of `SceneBase.dispose()`. Verified: navigating away
  from the home page leaves zero `<canvas>` elements behind.
- **Bundle size.** ~1 120 kB raw / ~287 kB gzipped in one chunk, dominated by
  three.js and the landmask, plus ~66 kB of CSS. It grew with the page count;
  `chunkSizeWarningLimit` is raised rather than code-split, since the hero is
  the first thing on the page.

## Note on re-syncing

The static source was being edited while this port was written. The React and
CSS layers are synced against `website-skill` as of **2026-08-01 23:19 local**
(`terrain.js` 46 264 B, `style.css` 39 089 B).

`src/three/` has since diverged and a copy-across would **destroy the
performance work**. If that reference tree is ever restored and you want to
re-sync: copy `css/style.css` and `js/three/*.js` across, then re-apply both
the three porting changes (the `atmos.js` imports, the `core.js` lifecycle
additions, `terrain.js`'s nine `addEventListener` → `this.listen`
substitutions) **and** everything under *Performance work* above. Diffing the
two trees first is the safer route.
