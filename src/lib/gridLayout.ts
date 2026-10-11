export type TileSizePreference = 'S' | 'M' | 'L';

/** Space the grid keeps for its own side padding (8 on each side). */
export const GRID_PADDING = 16;
/** The tile width each size preference aims for. The real width is nudged up or down from this to fill the pane. */
export const TILE_TARGET: Record<TileSizePreference, number> = { S: 96, M: 124, L: 160 };
const MIN_COLUMNS = 2;
/** Tile widths are rounded down to this step so the row can never add up to a hair more than the pane and wrap early. */
const STEP = 0.25;

/**
 * How many columns to use for a pane. It tries the two column counts either side of the preferred tile width
 * (as many as fit, and one more) and picks the one that changes the tile size the least, measured as a ratio so
 * "10% bigger" and "10% smaller" count the same. Roughly: if less than about half a tile of space would be left
 * over, the tiles grow to use it. If more, one more column is added and the tiles shrink a little to fit it.
 */
export function tileColumnsForPane(width: number, preference: TileSizePreference): number {
  const target = TILE_TARGET[preference];
  const room = Math.max(0, width - GRID_PADDING);
  const fit = Math.floor(room / target);
  if (fit < MIN_COLUMNS) return MIN_COLUMNS;
  const grow = room / (fit * target); // >= 1: how much each tile would have to stretch with `fit` columns
  const shrink = ((fit + 1) * target) / room; // > 1: how much each tile would have to squash with one more
  return shrink < grow ? fit + 1 : fit;
}

/** Tile width (height follows from the tile's fixed shape, so the aspect ratio never changes) that fills a measured pane. */
export function tileSizeForPane(width: number, preference: TileSizePreference): number {
  const room = Math.max(0, width - GRID_PADDING);
  const columns = tileColumnsForPane(width, preference);
  return Math.floor((room / columns) / STEP) * STEP;
}
