// Location: src/lib/swipe.ts
// Pure maths for the swipe-to-delete row (A13). `x` is how far the row has slid: 0 = closed, negative = to the left.
export type SwipeOutcome = 'delete' | 'open' | 'close';

/** Keeps the row between "closed" and "slid fully off to the left". It never slides to the right. */
export const clampSwipe = (x: number, openWidth: number, width: number): number => Math.min(0, Math.max(x, -(width > 0 ? width : openWidth * 4)));

/**
 * What to do when the finger lifts.
 *  - dragged most of the way across (or a hard fast flick past the button): delete (only when fullSwipe is on)
 *  - a flick left: open, a flick right: close
 *  - otherwise: whichever side of halfway the row is on
 * `vx` is the finger speed in px/ms, negative when moving left.
 */
export function swipeDecision(o: { x: number; vx: number; width: number; openWidth: number; fullSwipe?: boolean }): SwipeOutcome {
  const dist = -o.x; const full = o.fullSwipe !== false;
  if (full && o.width > 0 && (dist >= o.width * 0.6 || (o.vx < -1.2 && dist > o.openWidth * 1.2))) return 'delete';
  if (o.vx < -0.5 && dist > 8) return 'open';
  if (o.vx > 0.5) return 'close';
  return dist >= o.openWidth / 2 ? 'open' : 'close';
}
