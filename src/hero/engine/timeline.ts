/**
 * The chapter timeline: chapter count, stops, step pacing and the easing helpers. Plain numbers, no
 * three.js, so the hero's first bundle can import it without pulling in the 3D engine.
 */
export const CHAPTER_COUNT = 8
export const PHASES = ['FIELD', 'CONTROL', 'MEASURE', 'METHODS', 'CAPTURE', 'MODEL', 'REGION', 'REACH'] as const
/** every chapter's first frame is a resting state; one gesture plays one transition */
export const CHECKPOINTS = [0, 1, 2, 3, 4, 5, 6, 7] as const
export const STEP_SECONDS_PER_CHAPTER = 4.0
export const STEP_SECONDS_MIN = 3.4
export const STEP_SECONDS_MAX = 4.8

/* ---------------- scalar helpers ---------------- */
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
export const win = (x: number, a: number, b: number) => clamp01((x - a) / (b - a))
export const sstep = (a: number, b: number, x: number) => { const t = win(x, a, b); return t * t * (3 - 2 * t) }
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
export const easeOutBack = (t: number, s = 1.9) => { const u = t - 1; return 1 + u * u * ((s + 1) * u + s) }
/** rises over [a,b], holds, falls over [c,d] */
export const bell = (x: number, a: number, b: number, c: number, d: number) => sstep(a, b, x) * (1 - sstep(c, d, x))

/** p → chapter position sp ∈ [0,7]; chapter k's resting frame is at p = (k + 0.5)/8 */
export const chapterPos = (p: number) => Math.min(CHAPTER_COUNT - 1, Math.max(0, p * CHAPTER_COUNT - 0.5))
export const chapterToProgress = (k: number) => (k + 0.5) / CHAPTER_COUNT
export const chapterAt = (sp: number) => Math.min(CHAPTER_COUNT - 1, Math.max(0, Math.round(sp)))

/** breathing room: hold the first/last 20% of each transition, act in the middle */
export const DWELL = 0.2
/** METHODS → CAPTURE is different: the camera arrives first, then holds while the UAV flies the parcel */
const MOVE_WINDOWS: Record<number, [number, number]> = { 3: [0.03, 0.3] }
export const moveEase = (f: number, i = -1) => { const w = MOVE_WINDOWS[i]; return easeInOutCubic(w ? win(f, w[0], w[1]) : win(f, DWELL, 1 - DWELL)) }
/** relative length of each forward step (transition i → i+1); the capture flight gets time to be watched */
export const STEP_WEIGHTS = [1, 1, 1, 1.3, 4.6, 1, 1] // METHODS → CAPTURE → MODEL plays as one move: the UAV flies three passes
/** where the stepper rests (chapter positions): CAPTURE is played through, so CAPTURE + MODEL read as one chapter */
export const STOPS: readonly number[] = [0, 1, 2, 3, 5, 6, 7]
/** the stop nearest a chapter position */
export const stopAt = (sp: number) => {
  let best = 0
  STOPS.forEach((s, i) => { if (Math.abs(s - sp) < Math.abs(STOPS[best] - sp)) best = i })
  return best
}
