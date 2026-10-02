/**
 * Full-screen brand intro that plays once per visit while the hero's WebGL scene loads underneath,
 * then fades away. Skippable (button, Esc, Enter, Space). Never shown with prefers-reduced-motion,
 * under the ?frame= review hook, or if autoplay is blocked. ?intro=1 forces it, ?intro=0 disables it.
 * The film is cut in three shapes; the one closest to the viewport's is chosen once, on mount.
 */
import { useEffect, useRef, useState } from 'react'
import { deviceTier } from './device'

const SEEN_KEY = 'uh-intro-seen'

function shouldPlay() {
  const q = new URLSearchParams(location.search)
  if (q.get('intro') === '1') return true
  if (q.get('intro') === '0' || q.has('frame') || q.get('reduced') === '1') return false
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  try { return sessionStorage.getItem(SEEN_KEY) !== '1' } catch { return true }
}

/** the cut that crops least: 16:9 (desktop, landscape iPads), 3:4 (portrait iPads, near-square windows),
 *  9:16 (phones); the switch points are the geometric means of neighbouring shapes. A tablet never gets
 *  the phone cut (iPad mini in portrait sits right at that line). */
function pickFormat() {
  const a = innerWidth / Math.max(1, innerHeight)
  const f = a >= 1.155 ? 'desktop' : a >= 0.65 ? 'tablet' : 'mobile'
  return f === 'mobile' && deviceTier() === 'tablet' ? 'tablet' : f
}

export default function IntroVideo({ base = '/intro' }: { base?: string }) {
  const [format, setFormat] = useState(pickFormat)
  const src = `${base}-${format}.mp4`, poster = `${base}-${format}.jpg`
  const [state, setState] = useState<'playing' | 'leaving' | 'done'>(() => (shouldPlay() ? 'playing' : 'done'))
  const video = useRef<HTMLVideoElement>(null)
  const resumeAt = useRef(0) // a rotation mid-film swaps the cut and carries on from the same moment

  const finish = () => {
    setState((s) => (s === 'playing' ? 'leaving' : s))
    try { sessionStorage.setItem(SEEN_KEY, '1') } catch { /* private mode: fine */ }
  }

  useEffect(() => {
    if (state !== 'playing') return
    const prev = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden' // the hero waits underneath
    const v = video.current
    v?.play().catch(finish) // autoplay blocked → straight to the site
    // never trap a visitor: if the film hasn't actually started within 7 s (slow network, stalled
    // decode, background tab), go straight to the site
    const watchdog = setTimeout(() => { if (!v || v.currentTime < 0.1) finish() }, 7000)
    const onKey = (e: KeyboardEvent) => { if (['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); finish() } }
    // a scroll or swipe during the intro means "skip" — and must not also step the hero underneath
    const onGesture = (e: Event) => { e.stopImmediatePropagation(); if (e.cancelable) e.preventDefault(); finish() }
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onGesture, { capture: true, passive: false })
    window.addEventListener('touchmove', onGesture, { capture: true, passive: false })
    return () => {
      clearTimeout(watchdog)
      document.documentElement.style.overflow = prev
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onGesture, { capture: true })
      window.removeEventListener('touchmove', onGesture, { capture: true })
    }
  }, [state])

  useEffect(() => {
    if (state !== 'leaving') return
    const t = setTimeout(() => setState('done'), 700)
    return () => clearTimeout(t)
  }, [state])

  useEffect(() => {
    if (state !== 'playing') return
    const onResize = () => {
      const f = pickFormat()
      if (f !== format) { resumeAt.current = video.current?.currentTime ?? 0; setFormat(f) }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [state, format])
  const onMeta = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    if (!resumeAt.current) return
    const v = e.currentTarget
    v.currentTime = resumeAt.current
    resumeAt.current = 0
    v.play().catch(finish)
  }

  if (state === 'done') return null
  return (
    <div className={`uh-intro${state === 'leaving' ? ' is-leaving' : ''}${deviceTier() === 'tablet' ? ' is-tablet' : deviceTier() === 'phone' ? ' is-phone' : ''}`} role="dialog" aria-label="Underhill intro">
      <video ref={video} src={src} poster={poster} muted playsInline preload="auto" onEnded={finish} onLoadedMetadata={onMeta} aria-hidden="true" />
      <button type="button" className="uh-intro-skip" onClick={finish}>Skip intro <span aria-hidden="true">→</span></button>
      <style>{`
        .uh-intro { position: fixed; inset: 0; z-index: 1000; background: #04070c; opacity: 1; transition: opacity 0.7s ease; }
        .uh-intro.is-leaving { opacity: 0; pointer-events: none; }
        .uh-intro video { width: 100%; height: 100%; object-fit: cover; display: block; }
        .uh-intro-skip {
          position: absolute; right: clamp(16px, 3.4vw, 56px); bottom: clamp(20px, 4vh, 40px);
          font: 600 12px/1 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: 0.2em; text-transform: uppercase;
          color: #fff; background: #0082ca; border: 1px solid rgba(143, 216, 242, 0.75);
          border-radius: 999px; padding: 12px 20px; cursor: pointer;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35); transition: background 0.2s ease, transform 0.2s ease;
        }
        .uh-intro-skip:hover { background: #1196e0; transform: translateY(-1px); }
        .uh-intro-skip:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
        /* phones: a quiet text link in the corner, like the hero's, not a button over the film */
        .uh-intro.is-phone .uh-intro-skip {
          bottom: calc(10px + env(safe-area-inset-bottom, 0px)); right: 8px; padding: 10px;
          background: none; border: 0; border-radius: 0; box-shadow: none;
          font-size: 10px; font-weight: 500; letter-spacing: 0.18em; color: rgba(214, 228, 238, 0.6);
          -webkit-tap-highlight-color: transparent;
        }
        .uh-intro.is-phone .uh-intro-skip::after { display: none; }
        .uh-intro.is-phone .uh-intro-skip:hover, .uh-intro.is-phone .uh-intro-skip:active { background: none; color: #eef4f8; transform: none; }
        .uh-intro.is-tablet .uh-intro-skip { min-height: 44px; padding: 0 22px; bottom: calc(clamp(20px, 4vh, 40px) + env(safe-area-inset-bottom, 0px)); }
        .uh-intro-skip::after {
          content: ''; position: absolute; inset: -1px; border-radius: inherit; pointer-events: none;
          border: 1.5px solid rgba(143, 216, 242, 0.9); animation: uh-skip-ring 2.8s ease-out infinite;
        }
        @keyframes uh-skip-ring { 0% { transform: scale(1); opacity: 0.9; } 60%, 100% { transform: scale(1.12, 1.4); opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { .uh-intro { transition: none; } .uh-intro-skip::after { animation: none; opacity: 0; } }
      `}</style>
    </div>
  )
}
