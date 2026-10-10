// Location: src/lib/gridNav.ts
// Pure helpers for nested grid categories: walking a path of tiles, editing the list at the end of a path,
// and working out which items a category or group shows. No React, no Shopify, unit-tested.
//
// A "container" is a category or a display group. A path is the list of tile indexes taken from the page's tile list,
// one per level: [2, 0] means "tile 2 of the page, then tile 0 inside it". [] is the page itself.
import type { Tile } from './grid';

export type Container = Extract<Tile, { type: 'category' | 'group' }>;
export type Path = number[];
export type CollectionLite = { id: string; productIds: string[] };

export const isContainer = (t: Tile | undefined): t is Container => !!t && (t.type === 'category' || t.type === 'group');
/** The tiles stored inside a container (sub-categories for a category, its own tiles for a group). */
export const childTiles = (t: Tile): Tile[] => (t.type === 'category' ? t.subs ?? [] : t.type === 'group' ? t.tiles : []);
export const withChildren = (t: Container, kids: Tile[]): Container => (t.type === 'category' ? { ...t, subs: kids } : { ...t, tiles: kids });
/** The Shopify collection a container shows items from. Plain groups have none. */
export const ownCollectionId = (t: Tile): string | undefined => (t.type === 'category' || t.type === 'group' ? t.collectionId : undefined);

/** The containers along a path. Stops at the first step that no longer exists (for example after the layout changed), and says how far it got. */
export function resolvePath(root: Tile[], path: Path): { nodes: Container[]; valid: Path } {
  const nodes: Container[] = []; let list = root;
  for (const i of path) {
    const t = list[i];
    if (!isContainer(t)) break;
    nodes.push(t); list = childTiles(t);
  }
  return { nodes, valid: path.slice(0, nodes.length) };
}
/** The tile list a path points into: the page's list for [], otherwise the children of the last container. */
export function listAt(root: Tile[], path: Path): Tile[] {
  const { nodes } = resolvePath(root, path);
  return nodes.length ? childTiles(nodes[nodes.length - 1]) : root;
}
/** Returns a copy of `root` where the list at `path` has been replaced by fn(list). A path that no longer resolves leaves root unchanged. */
export function editListAt(root: Tile[], path: Path, fn: (list: Tile[]) => Tile[]): Tile[] {
  if (!path.length) return fn(root);
  const [i, ...rest] = path; const t = root[i];
  if (!isContainer(t)) return root;
  const kids = editListAt(childTiles(t), rest, fn);
  if (kids === childTiles(t)) return root;
  return root.map((x, k) => (k === i ? withChildren(t, kids) : x));
}
/** Replaces one tile in the list at `path`. */
export const updateTileAt = (root: Tile[], path: Path, idx: number, fn: (t: Tile) => Tile): Tile[] => editListAt(root, path, l => (idx >= 0 && idx < l.length ? l.map((t, k) => (k === idx ? fn(t) : t)) : l));
export const removeTileAt = (root: Tile[], path: Path, idx: number): Tile[] => editListAt(root, path, l => l.filter((_, k) => k !== idx));
export const addTileAt = (root: Tile[], path: Path, t: Tile): Tile[] => editListAt(root, path, l => [...l, t]);
export const moveTileAt = (root: Tile[], path: Path, from: number, to: number): Tile[] => editListAt(root, path, l => {
  if (from === to || from < 0 || from >= l.length || to < 0 || to >= l.length) return l;
  const a = [...l]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a;
});

/** Collection ids used by everything nested inside a container, at any depth. Pinned item tiles do not count. */
export function descendantCollectionIds(node: Container): Set<string> {
  const out = new Set<string>();
  const walk = (t: Tile) => { for (const k of childTiles(t)) if (isContainer(k)) { const id = ownCollectionId(k); if (id) out.add(id); walk(k); } };
  walk(node); return out;
}
/**
 * Products a container shows from its own collection. A product that is also in any nested sub-category (any depth)
 * is left out here and only shows inside that sub-category, so it never appears in the parents.
 */
export function ownProductIds(node: Container, collections: CollectionLite[]): string[] {
  const id = ownCollectionId(node); if (!id) return [];
  const mine = collections.find(c => c.id === id); if (!mine) return [];
  const nested = new Set<string>();
  for (const cid of descendantCollectionIds(node)) for (const p of collections.find(c => c.id === cid)?.productIds ?? []) nested.add(p);
  const seen = new Set<string>();
  return mine.productIds.filter(p => !nested.has(p) && !seen.has(p) && (seen.add(p), true));
}
/**
 * Everything a container shows when opened (not editing): its own tiles first, then the items of its collection.
 * An item that is already pinned as a tile inside the container is not repeated.
 */
export function viewTiles(node: Container, collections: CollectionLite[], hasProduct: (productId: string) => boolean): Tile[] {
  const kids = childTiles(node);
  const pinned = new Set(kids.filter((t): t is Extract<Tile, { type: 'item' }> => t.type === 'item' && !!t.productId).map(t => t.productId!));
  const items: Tile[] = ownProductIds(node, collections).filter(p => hasProduct(p) && !pinned.has(p)).map(p => ({ type: 'item' as const, productId: p }));
  return [...kids, ...items];
}

export type Crumb = { label: string; path: Path };
/** `Home > Dragons > Extreme Dragons > Rose`: one entry per level, each carrying the path that jumps back to it. `path` is the resolved one from resolvePath. */
export function breadcrumbs(rootLabel: string, nodes: Container[], path: Path, labelOf: (t: Container) => string): Crumb[] {
  return [{ label: rootLabel, path: [] }, ...nodes.map((n, i) => ({ label: labelOf(n), path: path.slice(0, i + 1) }))];
}
