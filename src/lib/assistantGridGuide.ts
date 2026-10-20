// Location: src/lib/assistantGridGuide.ts
// "Guide me to an item" (B1): which page, category and tile of the Quick Menu grid hold an item, and the taps from the
// Checkout tab that reach it. Pure (no React, no store), so it runs in the node tests.
//
// The grid can only be walked through controls the pointer can ring. A category tile carries a spot, a display group tile
// does not (see tileSpotId), so an item that only shows inside a group has no walk here: the caller falls back to the
// All products guide, which is what the assistant offered before this existed.
import { hasAll, words } from './assistantData';
import type { CatalogueView } from './assistantProducts';
import type { Guide } from './assistantGuide';
import type { GuideStep } from './assistantScreens';
import type { Grid, GridPage, Tile } from './grid';
import { childTiles, isContainer, ownCollectionId, ownProductIds, type CollectionLite, type Container } from './gridNav';
import { findTabSpot, gridCatSpot, gridItemSpot, gridPageSpot, tileSpotId } from './trainingSpots';
import type { Variant } from './types';

/** The guide a button for an item falls back to: the All products view on the Checkout tab, where the person can search. */
export const ALL_PRODUCTS_SCREEN = 'view_all';
/** The id a guide button for an item carries, so the walk is worked out again from the grid every time the button is drawn. */
export const GRID_ITEM_PREFIX = 'grid.item:';

/** Where one item sits in the grid, ready to be walked to. */
export type GridPlace = {
  /** The key the tile carries in its spot: the variant id, or the product id for a tile that stands for the whole product. */
  key: string;
  /** The item's name from the catalogue, for the button and the words said while pointing. */
  name: string;
  page: { id: string; name: string };
  /** The containers to open on the way, outermost first. Empty when the tile sits on the page itself. */
  containers: { collectionId: string; label: string }[];
};

const nameOf = (v: Variant): string => (v.variantTitle ? `${v.productTitle} - ${v.variantTitle}` : v.productTitle);
const collectionsLite = (c: CatalogueView): CollectionLite[] => c.collections.map(x => ({ id: x.id, productIds: x.productIds }));
/** The words a match looks in: name, variation, SKU and barcode (what the till's own searches look in). */
const hayOf = (v: Variant): string => `${v.productTitle} ${v.variantTitle} ${v.sku ?? ''} ${v.barcode ?? ''}`;

/** The sellable variant these words are about: every word has to be in its name, SKU or barcode. Draft and archived items are left out, because the grid never shows them. A product's own variant (one with no variation name) wins over its variations, so "latte" means the plain one. */
export function variantForWords(c: CatalogueView, wanted: string): Variant | null {
  const terms = words(wanted); if (!terms.length) return null;
  const hits = Object.values(c.variants).filter(v => v.active && hasAll(hayOf(v), terms));
  return hits.find(v => !v.variantTitle) ?? hits[0] ?? null;
}

/** Whether a pinned tile in the grid is this item. A tile pinned by product stands for every variation of it. */
const pinMatches = (t: Extract<Tile, { type: 'item' }>, v: Variant): boolean => (t.variantId ? t.variantId === v.id : t.productId === v.productId);

const containerLabel = (t: Container, c: CatalogueView): string => (t.type === 'group' ? t.name : t.label ?? c.collections.find(x => x.id === t.collectionId)?.title ?? 'Category');

/** The place for a hit, or null when a step of the way cannot be pointed at (a group tile carries no spot, so nothing behind one can be walked to). */
function placeOf(page: GridPage, path: Container[], hit: { key: string; name: string }, c: CatalogueView): GridPlace | null {
  if (!path.every(t => !!tileSpotId(t))) return null;
  return { key: hit.key, name: hit.name, page: { id: page.id, name: page.name }, containers: path.map(t => ({ collectionId: ownCollectionId(t)!, label: containerLabel(t, c) })) };
}

/**
 * Walks one container, a level down from `path`. A container is shown by the same rule the grid uses: a category is the
 * highest level that still displays the item on its own (deepest category that shows it directly), while a group is held
 * whenever it sits in the tile list on the way.
 */
function scanNode(t: Container, path: Container[], page: GridPage, c: CatalogueView, collections: CollectionLite[], v: Variant): GridPlace | null {
  const kids = childTiles(t);
  if (t.type === 'category') {
    if (ownProductIds(t, collections).includes(v.productId)) return placeOf(page, path, { key: v.productId, name: nameOf(v) }, c);
    for (const kid of kids) if (isContainer(kid)) { const inner = scanNode(kid, [...path, kid], page, c, collections, v); if (inner) return inner; }
    const placed = kids.find(k => k.type === 'item' && pinMatches(k, v)) as Extract<Tile, { type: 'item' }> | undefined;
    return placed ? placeOf(page, path, { key: placed.variantId ?? placed.productId!, name: placed.label ?? nameOf(v) }, c) : null;
  }
  const fit = [...kids, ...ownProductIds(t, collections).map(p => ({ type: 'item' as const, productId: p }))];
  return scanList(fit, path, page, c, collections, v);
}

/**
 * Looks through one tile list (a page's own, or a group's tiles) for the product: a pinned tile first, because it is the
 * fewest taps, then the containers in tile order.
 */
function scanList(tiles: Tile[], path: Container[], page: GridPage, c: CatalogueView, collections: CollectionLite[], v: Variant): GridPlace | null {
  for (const t of tiles) {
    if (t.type !== 'item' || !pinMatches(t, v)) continue;
    const place = placeOf(page, path, { key: t.variantId ?? t.productId!, name: t.label ?? nameOf(v) }, c);
    if (place) return place;
  }
  for (const t of tiles) {
    if (!isContainer(t)) continue;
    const inner = scanNode(t, [...path, t], page, c, collections, v);
    if (inner) return inner;
  }
  return null;
}

/** Where an item sits in the grid, or null when it has no walkable place (or the grid or the catalogue was not given). */
export function placeForVariant(grid: Grid | undefined, c: CatalogueView | undefined, v: Variant): GridPlace | null {
  if (!grid || !c) return null;
  const collections = collectionsLite(c);
  for (const page of grid.pages) { const found = scanList(page.tiles, [], page, c, collections, v); if (found) return found; }
  return null;
}

/** Where these words sit in the grid: the first sellable variant they match, then where it is. */
export function placeForWords(grid: Grid | undefined, c: CatalogueView | undefined, wanted: string): GridPlace | null {
  if (!grid || !c) return null;
  const v = variantForWords(c, wanted); if (!v) return null;
  return placeForVariant(grid, c, v);
}

/** Where a saved button's item sits now. The key is the variant id or the product id the button carried when it was made. */
export function placeForLink(grid: Grid | undefined, c: CatalogueView | undefined, key: string): GridPlace | null {
  if (!grid || !c) return null;
  const all = Object.values(c.variants);
  const v = all.find(x => x.id === key) ?? all.find(x => x.productId === key && x.active) ?? all.find(x => x.productId === key);
  return v ? placeForVariant(grid, c, v) : null;
}

/**
 * The taps to a place: the Quick Menu tab, the page chip when the grid has more than one page, each container on the way,
 * then the item's own tile. There is no target and no arrive list, so the guide ends when that last tile is tapped.
 */
export function placeGuide(place: GridPlace, pageCount: number): Guide {
  const steps: GuideStep[] = [{ spot: findTabSpot('quick'), say: 'Tap Quick Menu.' }];
  if (pageCount > 1) steps.push({ spot: gridPageSpot(place.page.id), say: `Tap ${place.page.name}.` });
  for (const ct of place.containers) steps.push({ spot: gridCatSpot(ct.collectionId), say: `Tap ${ct.label}.` });
  steps.push({ spot: gridItemSpot(place.key), say: `Tap ${place.name}.` });
  return { screen: gridItemSpot(place.key), name: place.name, steps };
}

/** The whole walk for a saved button, worked out again from the grid and the catalogue as they are now. Null when the item no longer has a place in the grid. */
export function itemGuide(grid: Grid | undefined, c: CatalogueView | undefined, key: string): Guide | null {
  const place = placeForLink(grid, c, key);
  return place && grid ? placeGuide(place, grid.pages.length) : null;
}
