export type TileSizePreference = 'S' | 'M' | 'L';

/** Tile width that fills a measured pane while keeping the selected size as the column-count target. */
export function tileSizeForPane(width: number, preference: TileSizePreference): number {
  const target = preference === 'S' ? 96 : preference === 'L' ? 160 : 124;
  const columns = Math.max(2, Math.floor((width - 16) / target));
  return (width - 16) / columns;
}
