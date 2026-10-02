/**
 * Caption content slots — one per chapter, in chapter order. Replace freely; shape is fixed.
 * Copy follows the approved storyboard for Underhill Geomatics (est. 1913).
 */
export type ChapterCopy = {
  headline: string
  body: string
  /** small print pinned to the bottom corners of the frame while this chapter rests */
  footer?: { left?: string; right?: string }
  cta?: { label: string; href: string }
}

export const DEFAULT_CHAPTERS: ChapterCopy[] = [
  {
    headline: 'Surveying since 1913.',
    body: 'Precision starts in the field.',
    footer: { left: 'Land  |  People  |  A higher perspective', right: 'Est. 1913' },
  },
  {
    headline: 'Establish the control.',
    body: 'Every reliable survey begins with a known position.',
    footer: { right: 'Accuracy today.\nOpportunity tomorrow.' },
  },
  {
    headline: 'Measure what matters.',
    body: 'Precise field observations turn terrain into data.',
  },
  {
    headline: 'More ways to see.',
    body: 'Ground. Air. Water.\nThe right technology for the site.',
  },
  {
    headline: 'Capture the existing world.',
    body: 'Dense spatial data creates a measurable record of the site.',
  },
  {
    headline: 'Turn data into understanding.',
    body: 'Contours. Boundaries. Surfaces. Models.',
  },
  {
    headline: 'From site to region.',
    body: 'One project. A bigger picture.',
  },
  {
    headline: 'From the coast to the Arctic.',
    body: 'More than a century of fieldwork across Western and Northern Canada.',
    cta: { label: 'Start a project', href: '#lets-talk' },
  },
]

/** In-scene labels (HTML, projected from 3D anchors). Order matches FrameState.tags 0–5. */
export const SCENE_LABELS = [
  ['Control point'],
  [], // measured point: filled with the real coordinates at runtime
  ['Ground', 'GNSS'],
  ['Total station', 'Robotic'],
  ['Air', 'RPAS / UAV'],
  ['Water', 'Hydrographic'],
]

/** Territory labels shown on the globe, in engine order (full / narrow screens). */
export const REGION_LABELS = ['British Columbia', 'Yukon', 'NWT', 'Nunavut']
export const REGION_LABELS_SHORT = ['BC', 'Yukon', 'NWT', 'Nunavut']

/** CAPTURE and MODEL play as one chapter (one gesture: the aerial capture, then the UAV's contour passes) */
export const MERGED_CAPTURE_MODEL: ChapterCopy = {
  ...DEFAULT_CHAPTERS[5],
  headline: 'Capture it. Model it.',
  body: 'Dense spatial data, resolved into\ncontours, surfaces and models.',
}
