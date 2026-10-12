// Location: src/lib/pointerGesture.ts
// What the animated cursor does in Guide and Show (B6): a tap, a double or triple tap, press and hold, a swipe in any direction, or a scroll.
// This file only works out the movements (where the finger goes, when it is down, when a ripple plays). The drawing is in
// src/ui/TrainingOverlay.tsx (Guide) and src/ui/DemoView.tsx (Show), and both play the same plan. Pure, tested (tests/pointergesture.test.ts).
import type { Rect } from './trainingGeometry';

export type Gesture = 'tap' | 'double' | 'triple' | 'hold' | 'swipe-left' | 'swipe-right' | 'swipe-up' | 'swipe-down' | 'scroll-up' | 'scroll-down';
export const GESTURES: readonly Gesture[] = ['tap', 'double', 'triple', 'hold', 'swipe-left', 'swipe-right', 'swipe-up', 'swipe-down', 'scroll-up', 'scroll-down'];
export const isGesture = (g: unknown): g is Gesture => typeof g === 'string' && (GESTURES as readonly string[]).includes(g);

/** The gestures that are a press on one spot (as opposed to a drag across it). */
export const isPress = (g: Gesture): boolean => g === 'tap' || g === 'double' || g === 'triple' || g === 'hold';

/** Plain words for a gesture, for labels and for what a screen reader says. */
export const GESTURE_LABEL: Record<Gesture, string> = {
  tap: 'Tap', double: 'Tap twice', triple: 'Tap three times', hold: 'Press and hold',
  'swipe-left': 'Swipe left', 'swipe-right': 'Swipe right', 'swipe-up': 'Swipe up', 'swipe-down': 'Swipe down',
  'scroll-up': 'Scroll up', 'scroll-down': 'Scroll down',
};
/** How many times the finger touches down for a press gesture (shown as a small count by the cursor). */
export const tapCount = (g: Gesture): number => (g === 'double' ? 2 : g === 'triple' ? 3 : 1);

export type Point = { x: number; y: number };
/**
 * One movement of the cursor: glide to (x, y) over `ms`, ending with the finger down or up.
 * `ripple` plays the touch ripple as the move begins (a tap lands), `hold` plays the slow ring that fills while the finger stays down,
 * and `drag` marks a move made with the finger down across the screen (a trail follows it).
 */
export type Move = Point & { ms: number; down: boolean; ripple?: boolean; hold?: boolean; drag?: boolean };
export type GesturePlan = { gesture: Gesture; start: Point; moves: Move[]; /** Rest at the end before it plays again. */ restMs: number; /** Total of the moves, for tests and for the loop. */ totalMs: number };

const centre = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
export const HOLD_PRESS_MS = 900;

/** How far a drag travels: about half the target, but never so short it looks like a twitch or so long it leaves a small target. */
export function travelOf(extent: number, lo = 60, hi = 220): number { return clamp(extent * 0.56, lo, hi); }

/** The movements for `gesture` over `hole`. `start` is where the cursor first appears (offset from the target so it visibly glides in). */
export function gesturePlan(gesture: Gesture, hole: Rect): GesturePlan {
  const c = centre(hole); const at = (p: Point, ms: number, down: boolean, extra: Partial<Move> = {}): Move => ({ x: p.x, y: p.y, ms, down, ...extra });
  const start: Point = { x: c.x + 64, y: c.y + 56 }; const moves: Move[] = [];
  const press = (n: number): void => {
    moves.push(at(c, 480, false));
    for (let i = 0; i < n; i++) { moves.push(at(c, 110, true, { ripple: true })); moves.push(at(c, i === n - 1 ? 150 : 90, false)); }
  };
  switch (gesture) {
    case 'tap': press(1); break;
    case 'double': press(2); break;
    case 'triple': press(3); break;
    case 'hold':
      moves.push(at(c, 480, false), at(c, 130, true, { ripple: true }), at(c, HOLD_PRESS_MS, true, { hold: true }), at(c, 160, false));
      break;
    case 'swipe-left': case 'swipe-right': case 'swipe-up': case 'swipe-down': {
      const horiz = gesture === 'swipe-left' || gesture === 'swipe-right'; const sign = gesture === 'swipe-left' || gesture === 'swipe-up' ? -1 : 1;
      const d = travelOf(horiz ? hole.w : hole.h) / 2;
      const a = horiz ? { x: c.x - sign * d, y: c.y } : { x: c.x, y: c.y - sign * d }; const b = horiz ? { x: c.x + sign * d, y: c.y } : { x: c.x, y: c.y + sign * d };
      moves.push(at(a, 440, false), at(a, 110, true, { ripple: true }), at(b, 520, true, { drag: true }), at(b, 150, false));
      break;
    }
    case 'scroll-up': case 'scroll-down': {
      // Scrolling DOWN reveals what is below, so the finger drags UP the screen; scrolling UP is the other way. Two short strokes read as a scroll rather than a swipe.
      const sign = gesture === 'scroll-down' ? -1 : 1; const d = travelOf(hole.h, 50, 150) / 2;
      const top = { x: c.x, y: c.y - d }; const bottom = { x: c.x, y: c.y + d }; const from = sign === -1 ? bottom : top; const to = sign === -1 ? top : bottom;
      moves.push(at(from, 440, false), at(from, 100, true, { ripple: true }), at(to, 360, true, { drag: true }), at(to, 110, false), at(from, 220, false), at(from, 90, true), at(to, 360, true, { drag: true }), at(to, 150, false));
      break;
    }
  }
  const totalMs = moves.reduce((n, m) => n + m.ms, 0);
  return { gesture, start, moves, restMs: gesture === 'hold' ? 700 : 600, totalMs };
}

/**
 * What a Guide step lets the person do inside the ringed box. A press step lets the person press it; a swipe or scroll step lets them drag across it
 * and never open the thing underneath with a tap. Everything outside the box is dimmed and blocked already (see TrainingOverlay).
 */
export type Gate = { gestures: readonly Gesture[]; spots: readonly string[] } | null;
export const gateFor = (gesture: Gesture, target?: string): Gate => ({ gestures: [gesture], spots: target ? [target] : [] });
/** May a plain tap act here? `spot` is the id of the control being tapped, if it has one. With no gate (outside Guide), everything is allowed. */
export function tapAllowed(gate: Gate, spot?: string): boolean {
  if (!gate) return true;
  if (!gate.gestures.some(isPress)) return false;
  if (gate.spots.length === 0) return true;
  return !!spot && gate.spots.includes(spot);
}
