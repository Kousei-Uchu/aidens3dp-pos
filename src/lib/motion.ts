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

/**
 * Pages that may be drawn a second time while they slide away. The leaving page is a fresh copy of the screen, so it must look right from the data alone:
 * lists and read-only screens do. Pages that depend on a sale in flight or an unsaved form (Pay, the item forms) are never redrawn: they simply give way
 * to the page that arrives, which still slides in. (0073)
 */
export const LEAVE_DRAWN: ReadonlySet<string> = new Set(['saved', 'orders', 'items', 'customers', 'reports', 'giftcards', 'drawer', 'settings', 'staff', 'diagnostics', 'help', 'training', 'trainingRun', 'cart']);
/** The Training pages, which are always safe and are ranked for direction (below). */
export const TRANSITION_ROUTES: ReadonlySet<string> = new Set(['training', 'trainingRun']);

// ---- Page changes with the old page leaving as the new one arrives (0071) ----
/** How long the new page takes to arrive, and how long the old page takes to leave. */
export const ROUTE_ENTER_MS = 380; export const ROUTE_LEAVE_MS = 260;
/** How far a page slides: a little over a tenth of the window, kept between 48 and 140 points, so it feels the same on a phone and on an iPad. */
export const slideDistance = (width: number): number => Math.round(Math.max(48, Math.min(140, (Number.isFinite(width) ? width : 0) * 0.14)));

/**
 * Where the page that is going away ends up. `dir` is the direction the NEW page arrives from:
 * going forward ('right') the old page drifts a little to the left, under the new one; going back ('left') it slides off to the right.
 */
export function leaveOffset(dir: From, distance: number): { x: number; y: number } {
  switch (dir) {
    case 'right': return { x: -Math.round(distance * 0.3), y: 0 };
    case 'left': return { x: distance, y: 0 };
    case 'up': return { x: 0, y: -Math.round(distance * 0.12) };
    case 'down': return { x: 0, y: distance };
    default: return { x: 0, y: 0 };
  }
}
/** Going back, the old page is the one that slides away, so it has to be drawn on top. Going forward the new page is on top. */
export const leavingOnTop = (dir: From): boolean => dir === 'left' || dir === 'down';

/** Pages that sit one above the other in the Training area, so moving down the list goes forward and up the list goes back even at the same depth. */
const ROUTE_RANK: Readonly<Record<string, number>> = { training: 0, trainingRun: 1 };
type Where = { name: string; depth: number } | null;
/** Which way a change from `prev` to `next` moves. Depth decides first (pushing is forward, popping is back); at the same depth the rank above decides. */
export function transitionDir(prev: Where, next: Where): From {
  const pd = prev ? prev.depth : 0; const nd = next ? next.depth : 0;
  if (nd !== pd) return pageDirection(pd, nd);
  const pr = prev ? ROUTE_RANK[prev.name] : undefined; const nr = next ? ROUTE_RANK[next.name] : undefined;
  if (pr !== undefined && nr !== undefined && pr !== nr) return nr > pr ? 'right' : 'left';
  return 'up';
}
/** Every named page animates its arrival (0073). `practice` is kept for older callers: it no longer decides anything. */
export const isAnimatedRoute = (name: string | null | undefined, _practice?: readonly string[]): boolean => !!name;
/** A change is animated when either side is a page, so leaving or arriving at a page is never half done. Tab to tab changes have their own fade (TabPane). */
export const transitionNeeded = (prev: string | null | undefined, next: string | null | undefined, practice?: readonly string[]): boolean => isAnimatedRoute(prev, practice) || isAnimatedRoute(next, practice);
/** Whether the old page stays drawn while it leaves. A page the running course allows is safe too, because practice data is on and nothing real can show. */
export const canLeaveDrawn = (name: string | null | undefined, practice?: readonly string[]): boolean => !!name && (LEAVE_DRAWN.has(name) || !!practice?.includes(name));

/** The dip to the page colour used when practice starts or ends and the whole screen changes underneath: fade up, switch, fade away. */
export const VEIL = { inMs: 160, holdMs: 90, outMs: 360 } as const;

/** Tab to tab and guided-step changes: a short fade and rise. Shorter than a page change, because nothing moves across the screen. */
export const TAB_ENTER_MS = 280; export const TAB_RISE = 10;
