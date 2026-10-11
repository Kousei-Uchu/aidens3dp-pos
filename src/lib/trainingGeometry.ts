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

// Where a floating notice (the "off course" card, the Check's goal bar) sits so it never covers what the person needs to tap.
export type Slot = 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type Placed = { slot: Slot; x: number; y: number; w: number; h: number };
const overlapArea = (a: Rect, b: Rect): number => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
/**
 * Picks a place around the edges of the screen for a notice, away from `avoid` (the control to tap, the buttons that are always on screen).
 * `size` is the notice as last measured. Where it is narrower than the full width its height is scaled up, because the words wrap more.
 * The first place with no overlap wins, in the order `prefer` gives (top or bottom first, then the four corners when the screen is wide enough for a narrower card).
 * `stick` is the place used last time: it is kept while it is still clear, so the notice does not hop around as the target moves a little.
 * When nowhere is clear, the place with the least overlap is used.
 */
export function placeNotice(o: { screen: Size; size: Size; avoid: readonly Rect[]; prefer?: 'top' | 'bottom'; top?: number; bottom?: number; edge?: number; margin?: number; maxW?: number; stick?: Slot }): Placed {
  const { screen, size } = o; const edge = o.edge ?? 12; const margin = o.margin ?? 10; const top = o.top ?? edge; const bottom = o.bottom ?? edge;
  const full = Math.max(120, Math.min(o.maxW ?? 520, screen.w - edge * 2));
  const narrow = Math.max(240, Math.min(full, 360, Math.floor(screen.w / 2 - edge * 1.5)));
  const area = size.w * size.h; const hAt = (w: number): number => Math.min(screen.h / 2, Math.ceil(area / Math.max(1, w)));
  const fullH = hAt(full); const narrowH = hAt(narrow);
  const cx = Math.round((screen.w - full) / 2);
  const make = (slot: Slot): Placed => {
    const t = slot.startsWith('top'); const isNarrow = slot.includes('-'); const w = isNarrow ? narrow : full; const h = isNarrow ? narrowH : fullH;
    const x = slot.endsWith('left') ? edge : slot.endsWith('right') ? screen.w - edge - w : cx;
    return { slot, x, y: t ? top : Math.max(top, screen.h - bottom - h), w, h };
  };
  const wide = narrow < full - 40 && narrow * 2 + edge * 3 <= screen.w;
  const order: Slot[] = o.prefer === 'bottom' ? ['bottom', 'top', ...(wide ? (['bottom-left', 'bottom-right', 'top-left', 'top-right'] as Slot[]) : [])] : ['top', 'bottom', ...(wide ? (['top-left', 'top-right', 'bottom-left', 'bottom-right'] as Slot[]) : [])];
  const grown = o.avoid.map(r => grow(r, margin));
  const cost = (p: Placed): number => grown.reduce((n, r) => n + overlapArea(p, r), 0);
  if (o.stick && order.includes(o.stick)) { const s = make(o.stick); if (cost(s) === 0) return s; }
  let best = make(order[0]); let bestCost = cost(best);
  for (const slot of order) { const p = make(slot); const c = cost(p); if (c === 0) return p; if (c < bestCost) { best = p; bestCost = c; } }
  return best;
}
