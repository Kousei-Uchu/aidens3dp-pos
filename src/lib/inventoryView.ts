// Location: src/lib/inventoryView.ts
// Pure logic behind the Inventory list: filter, sort, group variants under their product, and flatten to rows. Unit-tested.
import type { Variant } from './types';

export type StockFilter = 'all' | 'low' | 'zero' | 'neg' | 'tracked' | 'untracked';
export type StatusFilter = 'active' | 'draft' | 'archived' | 'all';
export type InvSort = 'name' | 'stock-asc' | 'stock-desc' | 'price-asc' | 'price-desc' | 'updated';
export type InvPrefs = { stock: StockFilter; status: StatusFilter; sort: InvSort; grouped: boolean; collectionId: string | null; lowAt: number };
export const defaultInvPrefs = (): InvPrefs => ({ stock: 'all', status: 'active', sort: 'stock-asc', grouped: false, collectionId: null, lowAt: 2 });

export const statusOf = (v: Variant): 'ACTIVE' | 'DRAFT' | 'ARCHIVED' => v.status ?? (v.active ? 'ACTIVE' : 'DRAFT');
const nameOf = (v: Variant) => `${v.productTitle} ${v.variantTitle}`.trim();
const cmpText = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/** Search text matches name, variant, SKU or barcode; every word must match somewhere. */
export function matchesQuery(v: Variant, q: string): boolean {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean); if (!words.length) return true;
  const hay = `${v.productTitle} ${v.variantTitle} ${v.sku ?? ''} ${v.barcode ?? ''}`.toLowerCase();
  return words.every(w => hay.includes(w));
}
export function matchesStock(v: Variant, f: StockFilter, lowAt: number): boolean {
  switch (f) {
    case 'all': return true;
    case 'tracked': return v.stock !== null;
    case 'untracked': return v.stock === null;
    case 'neg': return v.stock !== null && v.stock < 0;
    case 'zero': return v.stock === 0;
    case 'low': return v.stock !== null && v.stock >= 0 && v.stock <= lowAt;
  }
}
/** `productIdsInCollection`: pass the set for prefs.collectionId (or null for no category filter). */
export function filterVariants(all: Variant[], prefs: InvPrefs, q: string, productIdsInCollection: Set<string> | null): Variant[] {
  return all.filter(v =>
    (prefs.status === 'all' || statusOf(v) === prefs.status.toUpperCase()) &&
    (!productIdsInCollection || productIdsInCollection.has(v.productId)) &&
    matchesStock(v, prefs.stock, prefs.lowAt) && matchesQuery(v, q));
}

/** Untracked stock (null) always sorts last, in both directions. */
const stockCmp = (a: number | null, b: number | null, dir: 1 | -1) => (a === null && b === null ? 0 : a === null ? 1 : b === null ? -1 : (a - b) * dir);
export function sortVariants(list: Variant[], sort: InvSort): Variant[] {
  const by: Record<InvSort, (a: Variant, b: Variant) => number> = {
    name: (a, b) => cmpText(nameOf(a), nameOf(b)),
    'stock-asc': (a, b) => stockCmp(a.stock, b.stock, 1) || cmpText(nameOf(a), nameOf(b)),
    'stock-desc': (a, b) => stockCmp(a.stock, b.stock, -1) || cmpText(nameOf(a), nameOf(b)),
    'price-asc': (a, b) => a.priceCents - b.priceCents || cmpText(nameOf(a), nameOf(b)),
    'price-desc': (a, b) => b.priceCents - a.priceCents || cmpText(nameOf(a), nameOf(b)),
    updated: (a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || cmpText(nameOf(a), nameOf(b)),
  };
  return [...list].sort(by[sort]);
}

export type Group = { productId: string; title: string; image?: string; variants: Variant[]; stock: number | null; minPrice: number; maxPrice: number; updatedAt?: string };
/** Variants → one group per product. Group order follows the chosen sort using the group's total stock / lowest price / newest update. */
export function groupVariants(list: Variant[], sort: InvSort): Group[] {
  const map = new Map<string, Group>();
  for (const v of sortVariants(list, 'name')) {
    let g = map.get(v.productId);
    if (!g) { g = { productId: v.productId, title: v.productTitle, image: v.image, variants: [], stock: null, minPrice: v.priceCents, maxPrice: v.priceCents, updatedAt: v.updatedAt }; map.set(v.productId, g); }
    g.variants.push(v); g.image ??= v.image;
    if (v.stock !== null) g.stock = (g.stock ?? 0) + v.stock;
    g.minPrice = Math.min(g.minPrice, v.priceCents); g.maxPrice = Math.max(g.maxPrice, v.priceCents);
    if ((v.updatedAt ?? '') > (g.updatedAt ?? '')) g.updatedAt = v.updatedAt;
  }
  const groups = [...map.values()];
  const by: Record<InvSort, (a: Group, b: Group) => number> = {
    name: (a, b) => cmpText(a.title, b.title),
    'stock-asc': (a, b) => stockCmp(a.stock, b.stock, 1) || cmpText(a.title, b.title),
    'stock-desc': (a, b) => stockCmp(a.stock, b.stock, -1) || cmpText(a.title, b.title),
    'price-asc': (a, b) => a.minPrice - b.minPrice || cmpText(a.title, b.title),
    'price-desc': (a, b) => b.maxPrice - a.maxPrice || cmpText(a.title, b.title),
    updated: (a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || cmpText(a.title, b.title),
  };
  return groups.sort(by[sort]);
}

export type InvRow =
  | { kind: 'group'; key: string; group: Group; expanded: boolean }
  | { kind: 'variant'; key: string; v: Variant; nested: boolean };
/** Flat list for the FlatList. Single-variant products show as a plain variant row; multi-variant ones as an expandable header. */
export function buildRows(groups: Group[], expanded: ReadonlySet<string>, expandAll: boolean): InvRow[] {
  const rows: InvRow[] = [];
  for (const g of groups) {
    if (g.variants.length === 1) { rows.push({ kind: 'variant', key: `v:${g.variants[0].id}`, v: g.variants[0], nested: false }); continue; }
    const open = expandAll || expanded.has(g.productId);
    rows.push({ kind: 'group', key: `g:${g.productId}`, group: g, expanded: open });
    if (open) for (const v of g.variants) rows.push({ kind: 'variant', key: `v:${v.id}`, v, nested: true });
  }
  return rows;
}

/** How many filters differ from the defaults (shown as a badge on the Filters button). */
export function activeFilterCount(p: InvPrefs): number {
  const d = defaultInvPrefs();
  return (p.stock !== d.stock ? 1 : 0) + (p.status !== d.status ? 1 : 0) + (p.collectionId ? 1 : 0) + (p.lowAt !== d.lowAt && p.stock === 'low' ? 1 : 0);
}
