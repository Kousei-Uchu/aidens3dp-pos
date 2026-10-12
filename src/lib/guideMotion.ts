// Location: src/lib/guideMotion.ts
// Pure maths for the animated Guide (B6): how long the spotlight takes to glide, where it starts when it first appears, and where the pointer rests.
// The drawing is in src/ui/TrainingOverlay.tsx.
import { grow, type Rect, type Size } from './trainingGeometry';

const centre = (r: Rect): { x: number; y: number } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
/** How long the spotlight takes to move from one target to the next: a short hop is quick, a long one is a little slower, never more than half a second. */
export function glideMs(from: Rect | null, to: Rect): number {
  if (!from) return 480;
  const a = centre(from); const b = centre(to); const d = Math.hypot(a.x - b.x, a.y - b.y) + Math.abs(from.w - to.w) * 0.5 + Math.abs(from.h - to.h) * 0.5;
  return Math.round(Math.max(240, Math.min(520, 240 + d * 0.35)));
}
/** A move this small is just a re-measure (scrolling, a layout settling), so the spotlight snaps instead of gliding. */
export const isTinyMove = (a: Rect | null, b: Rect): boolean => !!a && Math.abs(a.x - b.x) < 3 && Math.abs(a.y - b.y) < 3 && Math.abs(a.w - b.w) < 3 && Math.abs(a.h - b.h) < 3;
/** Where the spotlight starts the first time it appears: a wider ring that closes in on the target. */
export const irisStart = (hole: Rect, screen: Size): Rect => {
  const g = grow(hole, Math.max(40, Math.min(screen.w, screen.h) * 0.08)); const x = Math.max(0, g.x); const y = Math.max(0, g.y);
  return { x, y, w: Math.min(screen.w, g.x + g.w) - x, h: Math.min(screen.h, g.y + g.h) - y };
};
/** Where the pointer rests: just below and right of the middle of the target, so its tip is on the target and the tap lands in the middle. */
export function pointerRest(hole: Rect): { x: number; y: number } { const c = centre(hole); return { x: c.x + Math.min(14, hole.w * 0.2), y: c.y + Math.min(16, hole.h * 0.25) }; }
export const pointerTap = (hole: Rect): { x: number; y: number } => centre(hole);
/** How long a hold on the last target lasts when the next one is not on screen yet (a page still opening). After this the whole screen is dimmed instead. */
export const HOLD_MS = 700;
/** Segments for the little progress bar in the bubble: done, current and to do. */
export function segments(i: number, n: number): ('done' | 'now' | 'todo')[] { return Array.from({ length: Math.max(0, n) }, (_, k) => (k < i ? 'done' : k === i ? 'now' : 'todo')); }
