// Location: src/lib/trainingGeometry.ts
// Spotlight maths: the four dim blocks around a hole, and where the bubble goes. Pure.
export type Rect = { x: number; y: number; w: number; h: number };
export type Size = { w: number; h: number };
export const grow = (r: Rect, p: number): Rect => ({ x: r.x - p, y: r.y - p, w: r.w + p * 2, h: r.h + p * 2 });
/** A hidden screen (display none) or an unmounted spot measures as 0 by 0. Off screen counts as not visible. */
export function onScreen(r: Rect | null | undefined, screen: Size): r is Rect {
  return !!r && r.w > 1 && r.h > 1 && r.x + r.w > 0 && r.y + r.h > 0 && r.x < screen.w && r.y < screen.h;
}
const clip = (r: Rect, s: Size): Rect => { const x = Math.max(0, r.x), y = Math.max(0, r.y); return { x, y, w: Math.max(0, Math.min(s.w, r.x + r.w) - x), h: Math.max(0, Math.min(s.h, r.y + r.h) - y) }; };
/** Four rectangles that cover the whole screen except the hole. They swallow touches; the hole lets them through. */
export function blockers(hole: Rect, screen: Size): Rect[] {
  const h = clip(hole, screen);
  return [
    { x: 0, y: 0, w: screen.w, h: h.y },
    { x: 0, y: h.y + h.h, w: screen.w, h: Math.max(0, screen.h - (h.y + h.h)) },
    { x: 0, y: h.y, w: h.x, h: h.h },
    { x: h.x + h.w, y: h.y, w: Math.max(0, screen.w - (h.x + h.w)), h: h.h },
  ];
}
export type Bubble = { x: number; y: number; side: 'above' | 'below'; arrowX: number };
/** Puts a bubble of size `b` under the hole (or over it when there is no room), kept on screen, with the arrow pointing at the hole's centre. */
export function placeBubble(hole: Rect, screen: Size, b: Size, gap = 14, edge = 12): Bubble {
  const below = hole.y + hole.h + gap + b.h <= screen.h - edge; const above = hole.y - gap - b.h >= edge;
  const side: 'above' | 'below' = below || !above ? 'below' : 'above';
  const rawY = side === 'below' ? hole.y + hole.h + gap : hole.y - gap - b.h;
  const y = Math.max(edge, Math.min(rawY, screen.h - b.h - edge));
  const cx = hole.x + hole.w / 2; const x = Math.max(edge, Math.min(cx - b.w / 2, screen.w - b.w - edge));
  return { x, y, side, arrowX: Math.max(18, Math.min(cx - x, b.w - 18)) };
}
/** Centre of the screen, for steps with nothing to point at. */
export const centred = (screen: Size, b: Size): { x: number; y: number } => ({ x: (screen.w - b.w) / 2, y: Math.max(12, (screen.h - b.h) / 2) });
export const same = (a: Rect | null, b: Rect | null): boolean => (!a || !b ? a === b : Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.w - b.w) < 1 && Math.abs(a.h - b.h) < 1);
