/**
 * Which layout the hero composes for. Three tiers, decided by the screen rather than the input alone:
 *   phone   — the short side is under 600 px: caption band at the bottom, short labels, portrait crops
 *   tablet  — iPads and other touch screens, and narrow desktop windows: full cards and captions,
 *             framed for a 3:4 / 4:3 screen
 *   desktop — everything else
 * `?device=phone|tablet|desktop` forces a tier, so a desktop browser can review the tablet layout.
 */
export type Device = 'phone' | 'tablet' | 'desktop'

export function deviceTier(): Device {
  if (typeof window === 'undefined') return 'desktop'
  const q = new URLSearchParams(location.search).get('device')
  if (q === 'phone' || q === 'tablet' || q === 'desktop') return q
  if (Math.min(innerWidth, innerHeight) < 600) return 'phone'
  if (matchMedia('(pointer: coarse)').matches || innerWidth <= 1024) return 'tablet'
  return 'desktop'
}
