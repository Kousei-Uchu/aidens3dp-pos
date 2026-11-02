// Location: src/lib/gridMerge.ts
// CloudKit sync, patch 6a (layout): how two registers' edits to the shared grid layout are joined. Pure code, no store and no network,
// so the node tests pin every rule (tests/gridmerge.test.ts).
//
// Decisions (dev_docs/CLOUDKIT_SYNC_DECISIONS.md item 27): on CloudKit the grid's version counter is not needed to tell whether the
// shared layout is newer. Each register instead keeps `gridBase` (device only): the layout, as canonical text, that it and the shop last
// agreed on. Comparing this register's grid and the shop's against that base says who changed what, as shared settings (0205) do.
// The Shopify path keeps the counter and does not use any of this.
import { parseGrid, type Grid, type GridPage } from './grid';
import { canon } from './sharedSettings';

/** The text a grid is compared and remembered by. Page and tile key order does not matter. */
export const gridText = (g: Grid): string => canon(g);
/** A remembered base read back as a grid, or null when there is none or it cannot be read. */
export function readGridBase(text: string | undefined | null): Grid | null {
  if (!text) return null; try { return parseGrid(text).grid; } catch { return null; }
}

/**
 * Joins this register's grid with the shop's, page by page (by page id), against `base` (what both last agreed on).
 *  - A page only one side changed takes that side's version. Changed on both: this register's wins (it is the one sending).
 *    A page is one value: two registers editing different tiles of the same page, the later sender takes the whole page.
 *  - A page removed on either side stays removed, even if the other side edited it (the same rule as saved carts and staff).
 *  - A page added on either side is kept.
 *  - Order: if this register moved pages (relative to the base) its order is used, otherwise the shop's. Pages only in the other order are added after.
 *  - With no base nothing can be told to be a removal, so the two are joined, the shop's version of a page wins, and a page only here is kept.
 */
export function mergeGrid(base: Grid | null, local: Grid, remote: Grid): Grid {
  const byId = (g: Grid) => new Map(g.pages.map(p => [p.id, p]));
  const b = base ? byId(base) : null; const l = byId(local); const r = byId(remote);
  const pick = (id: string): GridPage | null => {
    const lp = l.get(id); const rp = r.get(id); const bp = b?.get(id);
    if (lp && rp) return bp && canon(lp) !== canon(bp) ? lp : rp;
    if (lp) return b && bp ? null : lp; // gone from the shop: removed there
    if (rp) return b && bp ? null : rp; // gone from here: removed here
    return null;
  };
  const baseIds = base ? base.pages.map(p => p.id) : [];
  const localIds = local.pages.map(p => p.id); const remoteIds = remote.pages.map(p => p.id);
  const inBase = new Set(baseIds); const inLocal = new Set(localIds);
  // Did this register reorder the pages both it and the base still have?
  const movedHere = !!base && localIds.filter(i => inBase.has(i)).join('\u0000') !== baseIds.filter(i => inLocal.has(i)).join('\u0000');
  const order = movedHere ? [...localIds, ...remoteIds] : [...remoteIds, ...localIds];
  const seen = new Set<string>(); const pages: GridPage[] = [];
  for (const id of order) { if (seen.has(id)) continue; seen.add(id); const p = pick(id); if (p) pages.push(p); }
  return pages.length ? { version: 1, pages } : remote; // never leave a grid with no page
}

export type LayoutPlan =
  | { action: 'same' }                  // identical: nothing to do except remember it
  | { action: 'take'; grid: Grid }      // only the shop changed: use its layout
  | { action: 'send'; grid: Grid }      // only this register changed (or the shop has none): send this register's layout
  | { action: 'merge'; grid: Grid };    // both changed: use the merged layout, and send it

/**
 * What to do with this register's grid and the shop's. `base` is `gridBase` as saved text. `remote` is null when the shop has no layout yet.
 * A layout the shop holds that cannot be read is passed as null too, which makes this register send its own: that repairs it.
 */
export function planLayout(baseText: string | undefined | null, local: Grid, remote: Grid | null): LayoutPlan {
  if (!remote) return { action: 'send', grid: local };
  const lt = gridText(local); const rt = gridText(remote);
  if (lt === rt) return { action: 'same' };
  if (baseText) {
    if (lt === baseText) return { action: 'take', grid: remote };
    if (rt === baseText) return { action: 'send', grid: local };
  }
  return { action: 'merge', grid: mergeGrid(readGridBase(baseText), local, remote) };
}

/**
 * After a layout was sent, edits made on this register while the send was running must not be undone by adopting what was sent.
 * `snapshot` is the grid as it was when the send started, `current` is the grid now, `written` is what the shop now holds.
 * Returns the grid this register should hold: `written` plus whatever was edited since the snapshot.
 */
export const adoptAfterSend = (snapshot: Grid, current: Grid, written: Grid): Grid => (gridText(snapshot) === gridText(current) ? written : mergeGrid(snapshot, current, written));
