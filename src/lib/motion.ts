// Location: src/lib/motion.ts
// Small pure helpers for entrance animations (B6 polish). The drawing is in src/ui/Motion.tsx.
export type From = 'up' | 'down' | 'left' | 'right' | 'none';

/** Where a thing starts, relative to where it ends up. 'right' means it slides in from the right, 'up' means it rises from below. */
export function enterOffset(from: From, distance: number): { x: number; y: number } {
  switch (from) {
    case 'right': return { x: distance, y: 0 };
    case 'left': return { x: -distance, y: 0 };
    case 'up': return { x: 0, y: distance };
    case 'down': return { x: 0, y: -distance };
    default: return { x: 0, y: 0 };
  }
}

/** Delay for the i-th item of a list that comes in one after another. Later items are capped so a long list never makes anyone wait. */
export const stagger = (i: number, base = 0, step = 60, cap = 420): number => base + Math.min(Math.max(0, i) * step, cap);

/** Which way a page change moves: a new page slides in from the right, going back slides in from the left, anything else just rises. */
export function pageDirection(prevDepth: number, depth: number): From {
  return depth > prevDepth ? 'right' : depth < prevDepth ? 'left' : 'up';
}

/** The routes that get a page transition. Training only, for now: the rest of the app is left exactly as it was. */
export const TRANSITION_ROUTES: ReadonlySet<string> = new Set(['training', 'trainingRun']);
