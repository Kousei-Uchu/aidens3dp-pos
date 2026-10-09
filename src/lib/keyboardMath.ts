// Location: src/lib/keyboardMath.ts
// Pure geometry for "keep the focused field visible above the on-screen keyboard". Unit-tested; no React Native imports.

/** How many points of the window the keyboard covers. screenY = top edge of the keyboard (window coords). */
export function keyboardOverlap(windowHeight: number, screenY: number, keyboardHeight: number): number {
  if (!(keyboardHeight > 0) || !(screenY < windowHeight)) return 0;
  return Math.max(0, Math.min(keyboardHeight, windowHeight - screenY));
}

/**
 * How far to scroll (positive = further down, i.e. content moves up) so a field sits fully inside the visible band.
 * All numbers are window coordinates. A field taller than the band is aligned to its top edge.
 */
export function revealDelta(o: { fieldTop: number; fieldBottom: number; viewTop: number; viewBottom: number; margin?: number }): number {
  const m = o.margin ?? 12; const top = o.viewTop + m; const bottom = o.viewBottom - m;
  if (o.fieldBottom - o.fieldTop >= bottom - top) return o.fieldTop - top;
  if (o.fieldBottom > bottom) return o.fieldBottom - bottom;
  if (o.fieldTop < top) return o.fieldTop - top;
  return 0;
}

/** Height a sheet may use: the lesser of its preferred share of the screen and the space left above the keyboard. */
export function sheetMaxHeight(windowHeight: number, overlap: number, share: number, topGap: number): number {
  return Math.max(160, Math.min(windowHeight * share, windowHeight - overlap - topGap));
}
