/**
 * <SurveyHero /> — scroll-driven 3D hero for Underhill Geomatics.
 *
 * Every chapter's first frame is a finished, still composition. One scroll/swipe/click/arrow key
 * plays the transition to the next chapter as a single 3–5 s shot and rests there (checkpoints),
 * on desktop and phones alike. Pass navigation="scrub" for continuous scroll-scrubbing on desktop.
 * Reduced motion / no WebGL: one still frame of the final chapter, captions stacked as content.
 * Debug: ?frame=0..1 renders that exact progress with a frozen ambient clock.
 */
import { deviceTier } from './device'
import PlateStage, { type PlateHandle } from './PlateStage'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './SurveyHero.css'
import './tablet/ch1-3.css'
import './tablet/ch4-5.css'
import './tablet/ch6-7.css'
import { DEFAULT_CHAPTERS, MERGED_CAPTURE_MODEL, REGION_LABELS, REGION_LABELS_SHORT, SCENE_LABELS, type ChapterCopy } from './content'
import type { FrameState, HeroEngine, Quality } from './engine/Engine'
import { CHAPTER_COUNT, STEP_SECONDS_MAX, STEP_SECONDS_MIN, STEP_SECONDS_PER_CHAPTER, STEP_WEIGHTS, STOPS, stopAt, chapterToProgress as chapterPosToProgress } from './engine/timeline'
/** progress of a stop (the stepper's chapters are STOPS, not every chapter position) */
const chapterToProgress = (k: number) => chapterPosToProgress(STOPS[Math.min(STOPS.length - 1, Math.max(0, Math.round(k)))])
import { NORTH_SITES, OFFICES } from './engine/places'

export type SurveyHeroProps = {
  chapters?: ChapterCopy[]
  /** static image shown before the 3D scene starts and whenever WebGL is unavailable */
  posterSrc?: string
  posterAlt?: string
  id?: string
  /** 'checkpoints' (default): one gesture = one chapter on every device. 'scrub': desktop scroll scrubs. */
  navigation?: 'checkpoints' | 'scrub'
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const LAST = STOPS.length - 1

function detectQuality(): Quality {
  const coarse = matchMedia('(pointer: coarse)').matches
  const cores = navigator.hardwareConcurrency || 4
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  // low = genuinely weak hardware (few cores or little memory), not just a small screen: a recent phone stays sharp
  if (coarse && (cores <= 4 || mem <= 4)) return 'low'
  if (coarse || cores <= 4 || mem <= 4) return 'mid'
  return 'high'
}
/** phone layout: caption band at the bottom, short labels (tablets get their own tier, see device.ts) */
const isCompact = () => deviceTier() === 'phone'
const isTablet = () => deviceTier() === 'tablet'

function readDebugFrame(): number | null {
  if (typeof location === 'undefined') return null
  const q = new URLSearchParams(location.search).get('frame')
  if (q === null) return null
  const v = Number(q)
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null
}

/* ---------- screen-space label layout: first free spot around each anchor, else hidden ---------- */
type Box = { x0: number; y0: number; x1: number; y1: number }
type Spots = (w: number, h: number) => [number, number][]
const overlaps = (a: Box, list: Box[]) => list.some((b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0)
const labelSize = new WeakMap<HTMLElement, [number, number]>()
const sizeOf = (el: HTMLElement) => {
  let s = labelSize.get(el)
  if (!s || s[0] === 0) { s = [el.offsetWidth, el.offsetHeight]; labelSize.set(el, s) }
  return s
}
const ABOVE: Spots = (w, h) => [[-w / 2, -h - 12], [14, -h / 2], [-w - 14, -h / 2], [-w / 2, 12]]
const SIDE: Spots = (w, h) => [[16, -h / 2], [-w - 16, -h / 2], [-w / 2, -h - 16], [-w / 2, 16]]
/** tablets: the northern sites sit close on the planet, so each also tries the four diagonals before giving up */
const SIDE_TABLET: Spots = (w, h) => [[16, -h / 2], [-w - 16, -h / 2], [12, -h - 6], [-w - 12, -h - 6], [12, 6], [-w - 12, 6], [-w / 2, -h - 16], [-w / 2, 16]]
/** measured coordinates: up and to the right of the point, clear of the incoming beam */
const COORDS: Spots = (w, h) => [[18, -h - 18], [-w - 18, -h - 18], [18, 14], [-w / 2, -h - 24]]
const CENTRE: Spots = (w, h) => [[-w / 2, -h / 2], [-w / 2, -h * 1.8], [-w / 2, h * 0.8]]

export default function SurveyHero({ chapters = DEFAULT_CHAPTERS, posterSrc, posterAlt = '', id = 'hero', navigation = 'checkpoints' }: SurveyHeroProps) {
  // CAPTURE and MODEL are one chapter: its copy speaks for both
  const copy = STOPS.map((i) => (i === 5 && chapters === DEFAULT_CHAPTERS ? MERGED_CAPTURE_MODEL : chapters[i]))
  const debugFrame = useMemo(readDebugFrame, [])
  const [reduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).get('reduced') === '1')
  const wantsStepper = () => navigation === 'checkpoints' || deviceTier() !== 'desktop'
  const [mode, setMode] = useState<'scrub' | 'step'>(() => (wantsStepper() ? 'step' : 'scrub'))
  const [compact, setCompact] = useState(isCompact)
  const [tablet, setTablet] = useState(isTablet)
  const [gl, setGl] = useState<'pending' | 'live' | 'failed'>('pending')
  const [coords, setCoords] = useState<string[]>([])
  const [contours, setContours] = useState<string[]>([])
  const isStatic = reduced || gl === 'failed'

  const rootRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const plateRef = useRef<PlateHandle>(null)
  // generated artwork plates for FIELD and CAPTURE; ?plates=0 shows the WebGL scene alone
  const platesOn = useMemo(() => new URLSearchParams(location.search).get('plates') !== '0', [])
  const engineRef = useRef<HeroEngine | null>(null)
  const capRefs = useRef<(HTMLElement | null)[]>([])
  const footRefs = useRef<(HTMLElement | null)[]>([])
  const railRefs = useRef<(HTMLButtonElement | null)[]>([])
  const numRef = useRef<HTMLSpanElement>(null)
  const tagRefs = useRef<(HTMLElement | null)[]>([])
  const regionRefs = useRef<(HTMLElement | null)[]>([])
  const siteRefs = useRef<(HTMLElement | null)[]>([])
  const officeRefs = useRef<(HTMLElement | null)[]>([])
  const stepBarRef = useRef<HTMLDivElement>(null)

  const modeRef = useRef(mode)
  modeRef.current = mode
  const chapterRef = useRef(0) // the chapter we rest on (checkpoint mode)
  const targetRef = useRef(0) // the chapter a running step is heading to
  const steppingRef = useRef(false)
  const stepEnd = useRef(0)
  const stepRun = useRef(0) // id of the running step: a rail jump mid-step takes over from it
  const queuedRef = useRef<number | null>(null) // the chapter a mid-step scroll asked for next
  const speedRef = useRef(1) // playback rate of the running step (raised when the viewer is ahead)
  const stepToRef = useRef<(k: number, jump?: boolean, speed?: number) => void>(() => {})
  /** the chapter the next gesture counts from: where a running step is heading, else where we rest */
  const baseChapter = () => (steppingRef.current ? targetRef.current : chapterRef.current)
  const last = useRef({ rail: -1 })
  const swipeRef = useRef<HTMLDivElement>(null) // touch screens: the ‹ swipe › control at the bottom

  /* ---------------- labels: first free spot around each anchor ---------------- */
  const tabletRef = useRef(tablet)
  tabletRef.current = tablet
  const layoutLabels = useCallback((s: FrameState) => {
    const stage = stageRef.current
    const tab = tabletRef.current
    const groups: [(HTMLElement | null)[], { x: number; y: number; a: number }[], (i: number) => Spots][] = [
      [tagRefs.current, s.tags, (i) => (i === 1 ? COORDS : i >= 6 ? CENTRE : ABOVE)],
      [officeRefs.current, s.offices, () => SIDE],
      [siteRefs.current, s.sites, () => (tab ? SIDE_TABLET : SIDE)],
      [regionRefs.current, s.regions, () => CENTRE],
    ]
    const hide = (el: HTMLElement | null) => { if (el && el.style.visibility !== 'hidden') { el.style.visibility = 'hidden'; el.style.opacity = '0' } }
    if (!stage || !groups.some(([, pts]) => pts.some((p) => p.a > 0.02))) { groups.forEach(([els]) => els.forEach(hide)); return }
    const sr = stage.getBoundingClientRect()
    const taken: Box[] = []
    const obstacle = (el: Element | null | undefined, pad = 8) => {
      if (!el) return
      const r = el.getBoundingClientRect()
      if (r.width && r.height && getComputedStyle(el).opacity !== '0') taken.push({ x0: r.left - sr.left - pad, y0: r.top - sr.top - pad, x1: r.right - sr.left + pad, y1: r.bottom - sr.top + pad })
    }
    stage.querySelectorAll('.sh-head, .sh-mark, .sh-caption, .sh-foot > *').forEach((el) => obstacle(el))
    s.offices.forEach((o) => { if (o.a > 0.02) taken.push({ x0: o.x - 11, y0: o.y - 11, x1: o.x + 11, y1: o.y + 11 }) })
    if (tab) { // tablets: names stay out from under the site header and the Skip pill, and off each other's site markers
      obstacle(document.querySelector('.site-head'), 4)
      obstacle(stage.querySelector('.sh-skip'))
      s.sites.forEach((o) => { if (o.a > 0.02) taken.push({ x0: o.x - 7, y0: o.y - 7, x1: o.x + 7, y1: o.y + 7 }) })
    }
    const inStage = (b: Box) => b.x0 >= 6 && b.y0 >= 6 && b.x1 <= sr.width - 6 && b.y1 <= sr.height - 6
    for (const [els, pts, spotsFor] of groups) {
      pts.forEach((p, i) => {
        const el = els[i]
        if (!el) return
        if (p.a <= 0.02) { hide(el); return }
        const [w, h] = sizeOf(el)
        for (const [dx, dy] of spotsFor(i)(w, h)) {
          const b = { x0: p.x + dx, y0: p.y + dy, x1: p.x + dx + w, y1: p.y + dy + h }
          if (!inStage(b) || overlaps(b, taken)) continue
          taken.push({ x0: b.x0 - 4, y0: b.y0 - 4, x1: b.x1 + 4, y1: b.y1 + 4 })
          el.style.transform = `translate3d(${b.x0.toFixed(1)}px, ${b.y0.toFixed(1)}px, 0)`
          el.style.opacity = p.a.toFixed(3)
          el.style.visibility = 'visible'
          return
        }
        hide(el)
      })
    }
  }, [])

  /* ---------------- per-frame DOM paint (called by the engine after each render) ---------------- */
  const paint = useCallback((s: FrameState) => {
    // captions: scrub mode (and ?frame= review) follows sp; checkpoint mode is driven by the step timeline
    if (modeRef.current === 'scrub' || debugFrame !== null) {
      for (let k = 0; k < STOPS.length; k++) {
        const o = 1 - sstep(0.12, 0.3, Math.abs(s.sp - STOPS[k]))
        for (const el of [capRefs.current[k], footRefs.current[k]]) {
          if (!el) continue
          el.style.opacity = o.toFixed(3)
          el.style.visibility = o > 0.001 ? 'visible' : 'hidden'
          el.toggleAttribute('inert', o < 0.5)
        }
      }
    }
    const rail = modeRef.current === 'step' && debugFrame === null ? (steppingRef.current ? targetRef.current : chapterRef.current) : stopAt(s.sp)
    if (rail !== last.current.rail) {
      last.current.rail = rail
      railRefs.current.forEach((b, i) => b?.setAttribute('aria-current', i === rail ? 'step' : 'false'))
      if (numRef.current) numRef.current.textContent = pad2(rail + 1)
      swipeRef.current?.setAttribute('data-at', rail <= 0 ? 'first' : rail >= LAST ? 'last' : '')
    }
    // artwork plates: where they cover the frame, the GL draw is skipped and scene labels step aside
    if (debugFrame !== null) (window as unknown as { __alt: number[] }).__alt = [s.sp, s.alt, s.site.x, s.site.y, s.site.a]
    const cover = plateRef.current?.update(s.sp, s.site) ?? 0
    engineRef.current?.setSkipGL(cover >= 0.999)
    hostRef.current?.classList.toggle('is-covered', cover >= 0.999)
    if (cover > 0) for (const t of s.tags) t.a *= 1 - cover
    layoutLabels(s)
  }, [debugFrame, layoutLabels])

  /* ---------------- checkpoint captions: out instantly, fade in on arrival ---------------- */
  const showCaption = useCallback((k: number | null) => {
    for (const refs of [capRefs.current, footRefs.current]) {
      refs.forEach((el, i) => {
        if (!el) return
        el.classList.toggle('is-in', i === k)
        el.style.opacity = ''
        el.style.visibility = ''
        el.toggleAttribute('inert', i !== k)
      })
    }
  }, [])

  const scrollRange = () => {
    const r = rootRef.current!
    return { top: window.scrollY + r.getBoundingClientRect().top, range: Math.max(1, r.offsetHeight - window.innerHeight) }
  }
  const scrollProgress = () => {
    const { top, range } = scrollRange()
    return Math.min(1, Math.max(0, (window.scrollY - top) / range))
  }

  /** play the authored path from the resting chapter to chapter `k` as one timed shot */
  const stepTo = useCallback((k: number, jump = false, speed = 1) => {
    const eng = engineRef.current
    if (!eng) return
    if (k < 0 || k > LAST) return
    // a scroll during a step is queued, never cut in: the running move speeds up and still plays in
    // full, then the next one plays with its own authored pacing (a little brisker). One step can queue.
    if (steppingRef.current && !jump) {
      if (k === targetRef.current) return
      queuedRef.current = k
      speedRef.current = Math.max(speedRef.current, 1.7)
      return
    }
    // a click on the rail mid-step takes over from wherever the camera is right now
    const interrupt = steppingRef.current
    const from = interrupt ? targetRef.current : chapterRef.current
    if (k === from) return
    queuedRef.current = null
    speedRef.current = speed
    const run0 = ++stepRun.current
    steppingRef.current = true
    showCaption(null)
    targetRef.current = k // the counter and rail show where we're going, not where we were
    paint(eng.state)
    const n = Math.abs(k - from)
    const a = interrupt ? eng.state.sp : STOPS[from], b = STOPS[k]
    // a single forward step plays each chapter position it crosses at its authored length (the capture
    // flight is longer); jumps and rewinds stay brisk and linear
    const forward = n === 1 && k > from && !jump && !interrupt
    const w = forward ? STEP_WEIGHTS.slice(a, b) : []
    const wSum = w.reduce((x, y) => x + y, 0)
    const pathAt = (t: number) => {
      if (interrupt) return a + (b - a) * (1 - Math.pow(1 - t, 2)) // already moving: carry on, then settle
      if (!forward) return a + (b - a) * t
      let acc = t * wSum
      for (let i = 0; i < w.length; i++) { if (acc <= w[i]) return a + i + acc / w[i]; acc -= w[i] }
      return b
    }
    const dur = (interrupt
      ? Math.min(2.4, Math.max(1.1, Math.abs(b - a) * 1.1)) // brisk: the viewer asked to move on
      : forward
      ? STEP_SECONDS_PER_CHAPTER * wSum
      : jump ? Math.min(2.2, 0.9 + 0.25 * n) // a click on the rail: get there fast
      : Math.min(STEP_SECONDS_MAX * (n > 1 ? 1.5 : 1), Math.max(STEP_SECONDS_MIN, STEP_SECONDS_PER_CHAPTER * Math.min(n, 1.2)))) * 1000
    const bar = stepBarRef.current
    bar?.classList.add('is-on')
    const t0 = performance.now()
    let captionEarly = false, t = 0, last = t0
    const run = (now: number) => {
      if (engineRef.current !== eng || stepRun.current !== run0) return // superseded by a rail jump
      t = Math.min(1, t + ((now - last) / dur) * speedRef.current)
      last = now
      eng.setProgress(chapterPosToProgress(pathAt(t)), true)
      // long moves: the destination's caption arrives before the move ends, so the text is never missing for long
      if (!captionEarly && (t > 0.6 || (now - t0) > 4500)) { captionEarly = true; showCaption(k) }
      if (bar) bar.style.transform = `scaleX(${t.toFixed(4)})`
      if (t < 1) requestAnimationFrame(run)
      else {
        chapterRef.current = k
        steppingRef.current = false
        stepEnd.current = performance.now()
        bar?.classList.remove('is-on')
        showCaption(k)
        paint(eng.state)
        const q = queuedRef.current
        queuedRef.current = null
        if (q !== null && q !== k) stepToRef.current(q, false, 1.3)
      }
    }
    requestAnimationFrame(run)
  }, [paint, showCaption])
  stepToRef.current = stepTo

  const goTo = useCallback((k: number) => {
    k = Math.min(LAST, Math.max(0, k))
    if (modeRef.current === 'step') { stepTo(k, true); return }
    const { top, range } = scrollRange()
    window.scrollTo({ top: top + chapterToProgress(k) * range, behavior: 'smooth' })
  }, [stepTo])

  /* ---------------- auto tour: plays through the chapters on its own ----------------
   * Any click, tap, wheel, swipe or key hands control to the visitor; after a few quiet seconds the
   * tour carries on from wherever they are. "Skip intro" jumps to the last chapter and ends it. */
  const [touring, setTouring] = useState(true)
  const tourRef = useRef(true)
  const lastInput = useRef(0)
  const arrivedAt = useRef(0)
  const skipTour = useCallback(() => {
    tourRef.current = false
    setTouring(false)
    if (modeRef.current === 'step') stepTo(LAST, true)
    else goTo(LAST)
  }, [stepTo, goTo])
  useEffect(() => {
    if (isStatic || debugFrame !== null) return
    const IDLE_MS = 2500 // quiet time before the tour resumes
    const DWELL_MS = 3800 // how long it rests on each chapter before moving on
    const touched = () => { lastInput.current = performance.now() }
    const opts = { capture: true, passive: true } as const
    const events = ['pointerdown', 'wheel', 'touchstart', 'keydown'] as const
    events.forEach((e) => window.addEventListener(e, touched, opts))
    let wasStepping = false
    const id = window.setInterval(() => {
      const now = performance.now()
      const stepping = steppingRef.current
      if (wasStepping && !stepping) arrivedAt.current = now
      wasStepping = stepping
      if (!tourRef.current || stepping || modeRef.current !== 'step') return
      if (document.querySelector('.uh-intro:not(.is-leaving)')) { arrivedAt.current = now; return } // the film plays first
      const r = rootRef.current?.getBoundingClientRect()
      if (!r || Math.abs(r.top) > 2) return // only while the hero fills the screen
      if (now - lastInput.current < IDLE_MS) return
      const here = chapterRef.current
      if (here >= LAST) { tourRef.current = false; setTouring(false); return }
      // after the visitor's own input it resumes once they've been quiet for IDLE_MS; otherwise it rests DWELL_MS
      if (lastInput.current < arrivedAt.current && now - arrivedAt.current < DWELL_MS) return
      stepTo(here + 1)
    }, 200)
    arrivedAt.current = performance.now()
    return () => { clearInterval(id); events.forEach((e) => window.removeEventListener(e, touched, opts)) }
  }, [isStatic, debugFrame, stepTo])

  /* ---------------- artwork plates follow the stage size ---------------- */
  useEffect(() => {
    const el = stageRef.current
    if (!el || !platesOn) return
    const ro = new ResizeObserver(() => plateRef.current?.layout())
    ro.observe(el)
    return () => ro.disconnect()
  }, [platesOn])

  /* ---------------- engine lifecycle ---------------- */
  useEffect(() => {
    let disposed = false
    const cleanups: (() => void)[] = []
    // the engine's build is one long main-thread task (seconds on a low-end phone): let the poster, the first
    // plate and the intro film get going first, then build it when the browser is idle
    const idle = () => new Promise<void>((res) => {
      if (debugFrame !== null) return res()
      const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
      requestAnimationFrame(() => (ric ? ric(() => res(), { timeout: 1500 }) : setTimeout(res, 300)))
    })
    idle().then(() => import('./engine/Engine')).then(({ HeroEngine }) => {
      if (disposed || !hostRef.current) return
      let eng: HeroEngine
      try {
        eng = new HeroEngine(hostRef.current, {
          quality: detectQuality(),
          // ?t=<s> picks the ambient-clock moment for review frames (default 8 s)
          frozenTime: debugFrame !== null || reduced ? Number(new URLSearchParams(location.search).get('t') ?? 8) || 8 : null,
          onFrame: paint,
          onFirstFrame: () => setGl('live'),
        })
      } catch (err) {
        console.warn('[SurveyHero] WebGL unavailable, showing the static fallback.', err)
        setGl('failed')
        return
      }
      engineRef.current = eng
      setCoords(eng.coordsText)
      setContours(eng.contourTexts)
      const stage = stageRef.current!
      const portrait = () => stage.clientWidth / Math.max(1, stage.clientHeight) < 0.9
      eng.setPortrait(portrait())

      if (reduced) eng.seek(1)
      else if (debugFrame !== null) eng.seek(debugFrame)
      else {
        if (modeRef.current === 'step') eng.setProgress(chapterToProgress(chapterRef.current), true)
        else eng.setProgress(scrollProgress(), true)
        eng.start()
      }
      ;(window as unknown as { __hero?: unknown }).__hero = { seek: (p: number) => eng.seek(p), engine: eng }

      const io = new IntersectionObserver(([en]) => eng.setVisible(en.isIntersecting), { rootMargin: '120px' })
      io.observe(rootRef.current!)
      const onVis = () => eng.setPageVisible(!document.hidden)
      document.addEventListener('visibilitychange', onVis)
      onVis()
      const ro = new ResizeObserver(() => { eng.setPortrait(portrait()); eng.resize() })
      ro.observe(stage)
      cleanups.push(() => { io.disconnect(); ro.disconnect(); document.removeEventListener('visibilitychange', onVis) })
    }).catch((err) => { console.warn('[SurveyHero] failed to load the scene', err); if (!disposed) setGl('failed') })
    return () => {
      disposed = true
      cleanups.forEach((f) => f())
      engineRef.current?.dispose()
      engineRef.current = null
      delete (window as unknown as { __hero?: unknown }).__hero
    }
  }, [debugFrame, reduced, paint])

  // label texts change after the engine starts: re-measure them on the next layout
  useEffect(() => { tagRefs.current.forEach((el) => el && labelSize.delete(el)) }, [coords, contours, compact, tablet])

  /* ---------------- layout + mode on resize ---------------- */
  useEffect(() => {
    if (isStatic) return
    const onResize = () => {
      setCompact(isCompact())
      setTablet(isTablet())
      const next = wantsStepper() ? 'step' : 'scrub'
      if (next !== modeRef.current) {
        const eng = engineRef.current
        if (next === 'step') chapterRef.current = eng ? stopAt(eng.progress * CHAPTER_COUNT - 0.5) : 0
        setMode(next)
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [isStatic])

  /* ---------------- scrub mode: scroll position drives progress ---------------- */
  useEffect(() => {
    if (isStatic || debugFrame !== null || mode !== 'scrub') return
    const onScroll = () => engineRef.current?.setProgress(scrollProgress())
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    document.addEventListener('visibilitychange', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      document.removeEventListener('visibilitychange', onScroll)
    }
  }, [mode, isStatic, debugFrame])

  /* ---------------- checkpoint mode: one gesture = one chapter ---------------- */
  useEffect(() => {
    if (isStatic || debugFrame !== null || mode !== 'step') return
    const k = Math.min(LAST, Math.max(0, chapterRef.current))
    chapterRef.current = k
    engineRef.current?.setProgress(chapterToProgress(k), true)
    showCaption(k)

    // engaged = the hero fills the viewport from the top; otherwise the page scrolls natively
    const engaged = () => Math.abs(rootRef.current!.getBoundingClientRect().top) <= 2
    const releases = (dir: number) => (dir > 0 && chapterRef.current >= LAST) || (dir < 0 && chapterRef.current <= 0)

    // touch: a sideways swipe on the hero moves between chapters, like a carousel (left → next, right → previous);
    // an up/down swipe is left to the browser, so the page scrolls on past the hero as any page would
    let x0 = 0, y0 = 0, fired = false, kind: 'none' | 'step' | 'native' = 'none'
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; kind = 'none'; fired = false
    }
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 1 || kind === 'native') return
      const dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0
      if (kind === 'none') {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
        const onStage = stageRef.current!.contains(e.target as Node) && !(e.target as Element).closest?.('.sh-ui')
        kind = onStage && Math.abs(dx) > Math.abs(dy) * 1.2 ? 'step' : 'native'
        if (kind === 'native') return
      }
      e.preventDefault()
      if (!fired && Math.abs(dx) > 40 && performance.now() - stepEnd.current > 120) {
        fired = true // one step per gesture
        stepTo(baseChapter() + (dx < 0 ? 1 : -1))
        swipeRef.current?.classList.add('is-used')
      }
    }
    const onEnd = () => { kind = 'none' }

    // wheel/trackpad: one gesture = one step; a new gesture mid-step moves on at once (its inertia tail is ignored)
    let acc = 0, lastWheel = 0, blocked = false
    const onWheel = (e: WheelEvent) => {
      if (!engaged() || e.ctrlKey) return
      const dir = Math.sign(e.deltaY)
      if (!dir) return
      const now = performance.now()
      const gap = now - lastWheel
      lastWheel = now
      if (blocked && gap < 180) { e.preventDefault(); return }
      blocked = false
      if (releases(dir) && !steppingRef.current) return // hand control back to the page
      e.preventDefault()
      if (gap > 220) acc = 0
      acc += e.deltaY
      if (Math.abs(acc) > 36) { acc = 0; blocked = true; const k = baseChapter() + dir; if (k >= 0 && k <= LAST) stepTo(k) }
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onEnd, { passive: true })
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
      window.removeEventListener('wheel', onWheel)
    }
  }, [mode, isStatic, debugFrame, showCaption, stepTo])

  /* ---------------- pointer: drag to orbit (desktop) ---------------- */
  useEffect(() => {
    const stage = stageRef.current
    if (!stage || isStatic) return
    let dragging = false, lastX = 0
    const move = (e: PointerEvent) => { if (dragging) { engineRef.current?.dragBy(e.clientX - lastX); lastX = e.clientX } }
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.button !== 0 || (e.target as Element).closest('.sh-ui')) return
      dragging = true; lastX = e.clientX
      stage.setPointerCapture(e.pointerId)
      stage.classList.add('is-dragging')
    }
    const up = (e: PointerEvent) => {
      if (!dragging) return
      dragging = false
      stage.releasePointerCapture?.(e.pointerId)
      stage.classList.remove('is-dragging')
      engineRef.current?.dragEnd()
    }
    stage.addEventListener('pointermove', move)
    stage.addEventListener('pointerdown', down)
    stage.addEventListener('pointerup', up)
    stage.addEventListener('pointercancel', up)
    return () => {
      stage.removeEventListener('pointermove', move)
      stage.removeEventListener('pointerdown', down)
      stage.removeEventListener('pointerup', up)
      stage.removeEventListener('pointercancel', up)
    }
  }, [isStatic])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (isStatic) return
    const next = ['ArrowDown', 'ArrowRight', 'PageDown'].includes(e.key)
    const prev = ['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)
    if (!next && !prev) return
    const cur = modeRef.current === 'step' ? baseChapter() : stopAt(engineRef.current?.state.sp ?? 0)
    const target = cur + (next ? 1 : -1)
    if (target < 0 || target > LAST) return // let the page take it
    e.preventDefault()
    if (modeRef.current === 'step') stepTo(target) // keys play the chapter; rail clicks jump
    else goTo(target)
  }

  const cls = ['sh-root', platesOn ? 'has-plates' : '', isStatic ? 'is-static' : mode === 'step' ? 'is-stepper' : 'is-scrub',
    compact ? 'is-compact' : '', tablet ? 'is-tablet' : '', gl === 'live' ? 'is-live' : '', reduced ? 'is-reduced' : ''].join(' ')

  const lines = (t: string) => t.split('\n').map((l, i) => <span key={i}>{l}</span>)
  const caption = (c: ChapterCopy, i: number, stacked = false) => (
    <article
      key={i}
      className={`sh-caption${stacked ? ' is-stacked' : ''}`}
      ref={stacked ? undefined : (el) => { capRefs.current[i] = el }}
      aria-labelledby={`${id}-cap-${i}${stacked ? '-s' : ''}`}
    >
      {stacked && <p className="sh-eyebrow">{pad2(i + 1)}</p>}
      <h2 id={`${id}-cap-${i}${stacked ? '-s' : ''}`} className="sh-headline">{c.headline}</h2>
      <p className="sh-body">{lines(c.body)}</p>
      {c.cta && <a className="sh-cta sh-ui" href={c.cta.href}>{c.cta.label}<span aria-hidden="true">→</span></a>}
    </article>
  )
  const tagText = (i: number) => (i === 1 ? coords : i >= 6 ? [contours[i - 6] ?? ''] : SCENE_LABELS[i])

  return (
    <section ref={rootRef} id={id} className={cls} style={{ ['--sh-chapters' as string]: CHAPTER_COUNT }} aria-label="Introduction">
      <div
        ref={stageRef}
        className="sh-stage"
        tabIndex={isStatic ? -1 : 0}
        role="region"
        aria-roledescription="interactive scene"
        aria-label="Survey story. Use the arrow keys to move between chapters."
        onKeyDown={onKeyDown}
      >
        <div className="sh-poster" aria-hidden={gl === 'live'}>
          {posterSrc && <img src={posterSrc} alt={posterAlt} decoding="async" />}
        </div>
        <div ref={hostRef} className="sh-host" />
        <PlateStage ref={plateRef} enabled={platesOn} coords={coords} onReady={() => { const e = engineRef.current; if (e) paint(e.state) }} />
        <div className="sh-shade" aria-hidden="true" />

        {!isStatic && (
          <>
            <div className="sh-head">
              <div className="sh-count">
                <span className="sh-num" ref={numRef}>01</span>
                <nav className="sh-rail sh-ui" aria-label="Chapters">
                  {copy.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      ref={(el) => { railRefs.current[i] = el }}
                      aria-label={`Chapter ${i + 1}: ${c.headline}`}
                      aria-current={i === 0 ? 'step' : 'false'}
                      onClick={() => goTo(i)}
                    />
                  ))}
                </nav>
              </div>
            </div>
            <div className="sh-captions" aria-live="polite">{copy.map((c, i) => caption(c, i))}</div>
            <div className="sh-mark" aria-label="Underhill">
              <span className="sh-mark-word">Underhill</span>
              <img className="sh-mark-icon" src="/underhill-icon.png" alt="" width={233} height={183} />
            </div>

            {copy.map((c, i) => (
              <div className="sh-foot" key={i} ref={(el) => { footRefs.current[i] = el }} aria-hidden="true">
                {c.footer?.left && <span className="sh-foot-l">{c.footer.left}</span>}
                {c.footer?.right && <span className="sh-foot-r">{lines(c.footer.right)}</span>}
              </div>
            ))}

            {Array.from({ length: 6 + contours.length }, (_, i) => (
              <div
                key={i}
                className={`sh-tag${i === 0 ? ' is-control' : ''}${i === 1 ? ' is-coords' : ''}${i >= 6 ? ' is-contour' : ''}`}
                ref={(el) => { tagRefs.current[i] = el }}
                aria-hidden="true"
              >
                {tagText(i).map((l, j) => <span key={j}>{l}</span>)}
              </div>
            ))}
            {(compact ? REGION_LABELS_SHORT : REGION_LABELS).map((r, i) => (
              <div className="sh-region" key={r} ref={(el) => { regionRefs.current[i] = el }} aria-hidden="true">{r}</div>
            ))}
            {OFFICES.map((o, i) => (
              <div className={`sh-office${o.name === 'Vancouver Island' ? ' is-minor' : ''}`} key={o.name} ref={(el) => { officeRefs.current[i] = el }} aria-hidden="true">{o.name}</div>
            ))}
            {NORTH_SITES.map((o, i) => (
              <div className="sh-office sh-site" key={o.name} ref={(el) => { siteRefs.current[i] = el }} aria-hidden="true">{o.name}</div>
            ))}

            <div className="sh-stepbar" aria-hidden="true"><div ref={stepBarRef} /></div>
            {(compact || tablet) && (
              <div ref={swipeRef} className="sh-swipe sh-ui" data-at="first">
                <button type="button" className="sh-swipe-prev" aria-label="Previous chapter" onClick={() => stepTo(baseChapter() - 1)}>
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 L5 8 L10 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <span className="sh-swipe-hint" aria-hidden="true">Swipe</span>
                <button type="button" className="sh-swipe-next" aria-label="Next chapter" onClick={() => { swipeRef.current?.classList.add('is-used'); stepTo(baseChapter() + 1) }}>
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3 L11 8 L6 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>
            )}
            {touring && mode === 'step' && (
              <button type="button" className="sh-skip sh-ui" onClick={skipTour}>Skip intro <span aria-hidden="true">→</span></button>
            )}
          </>
        )}
      </div>

      {isStatic && <div className="sh-stack">{copy.map((c, i) => caption(c, i, true))}</div>}
    </section>
  )
}
