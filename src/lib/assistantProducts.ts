// Location: src/lib/assistantProducts.ts
// The product and stock lookups the assistant uses (patch 0164, plan 3.2 tools 5 and 6, patch 6 in 3.10), and the same lookups for the
// offline mode (plan 3.3), so there is one implementation of each. Pure functions over the catalogue saved on this iPad: no network, no
// store, no React Native imports, so they run in the node tests. Never Shopify live (plan question 12).
//
// The words used for stock are the till's own (`stockText` in lookup.ts, the Stock check tile), and the stock filters are the ones the
// Inventory list uses (`inventoryView.ts`), so the assistant can never say "low" or "out" differently from the screen. Nothing here decides
// what may be sent to the model: every field returned is sorted into a category by the field maps in assistantDataTools.ts, and the data
// gate applies the endpoint rules to it. Money is returned as text like "$12.50".
import { fmt } from './money';
import { dealsFor, stockText } from './lookup';
import { defaultInvPrefs, filterVariants, matchesStock, sortVariants, statusOf, type StockFilter, type StatusFilter } from './inventoryView';
import { MAX_DETAIL, MAX_ROWS, hasAll, words, type AssistantData } from './assistantData';
import type { Collection, Variant } from './types';

/** What the product tools read. A slice of the snapshot, so the offline mode can use it without the sales and customers. */
export type CatalogueView = Pick<AssistantData, 'now' | 'variants' | 'collections' | 'autos' | 'bundles'>;

export const STATUS_WORDS = ['active', 'draft', 'archived', 'all'] as const;
export const STOCK_FILTERS = ['low', 'out', 'oversold', 'untracked', 'tracked'] as const;
export type StockWord = typeof STOCK_FILTERS[number];
/** The Inventory list's own filter for each word the model may use. */
const INV_FILTER: Record<StockWord, StockFilter> = { low: 'low', out: 'zero', oversold: 'neg', untracked: 'untracked', tracked: 'tracked' };
const MAX_VARIANT_ROWS = 12;
const MAX_VARIANT_ROWS_DETAIL = 8;
export const CATALOGUE_NOTE = 'From the catalogue saved on this till, so stock is as of the last sync. Not tracked means the till does not count stock for that item.';

// ---------- shared pieces ----------
const nameOf = (v: Variant): string => (v.variantTitle ? `${v.productTitle} - ${v.variantTitle}` : v.productTitle);
const allVariants = (view: CatalogueView): Variant[] => Object.values(view.variants);
const STATUS_TEXT: Record<string, string> = { UNLISTED: 'unlisted', DRAFT: 'draft', ARCHIVED: 'archived' };

/** The words of a variant a search looks in: product, variation, SKU and barcode (what the Inventory search box looks in). */
const hayOf = (v: Variant): string => `${v.productTitle} ${v.variantTitle} ${v.sku ?? ''} ${v.barcode ?? ''}`;

/** The product ids of the categories whose name has these words in it, or null when no category was asked for. `names` lists the real ones when none matched. */
function categoryIds(view: CatalogueView, raw: unknown): { ids: Set<string> | null; matched: Collection[]; none?: string } {
  const text = typeof raw === 'string' ? raw.trim() : ''; if (!text) return { ids: null, matched: [] };
  const terms = words(text); if (!terms.length) return { ids: null, matched: [] };
  const matched = view.collections.filter(c => hasAll(c.title, terms));
  if (!matched.length) {
    const names = view.collections.map(c => c.title).slice(0, 12);
    return { ids: new Set<string>(), matched, none: names.length ? `No category matched. The categories are: ${names.join(', ')}${view.collections.length > names.length ? ` and ${view.collections.length - names.length} more` : ''}.` : 'No category matched, and no categories are saved on this till.' };
  }
  return { ids: new Set(matched.flatMap(c => c.productIds)), matched };
}

/** Checks the status word, or says what is wrong. Active is the till's own default: it means active and unlisted, the sellable products. */
function readStatus(v: unknown): StatusFilter | { error: string } {
  if (v === undefined || v === null || v === '') return 'active';
  return (STATUS_WORDS as readonly unknown[]).includes(v) ? (v as StatusFilter) : { error: `Unknown status. Use one of: ${STATUS_WORDS.join(', ')}.` };
}
const statusNote = (s: StatusFilter): string => (s === 'active' ? 'Only active and unlisted products are included (the ones for sale). Ask for status draft, archived or all to include others.' : s === 'all' ? 'Products of every status are included.' : `Only ${s} products are included.`);

const total = (vs: Variant[]): number | null => { const t = vs.filter(v => v.stock !== null); return t.length ? t.reduce((a, v) => a + Math.max(0, v.stock as number), 0) : null; };
const priceText = (vs: Variant[]): string => { const lo = Math.min(...vs.map(v => v.priceCents)), hi = Math.max(...vs.map(v => v.priceCents)); return lo === hi ? fmt(lo) : `${fmt(lo)} to ${fmt(hi)}`; };

// ---------- find_products ----------
export type ProductArgs = { query?: unknown; category?: unknown; status?: unknown; detail?: unknown };

/** One variation as a row. The detail fields are SKU, barcode, the usual price when it is on sale, and what it cost. */
function variantRow(v: Variant, detail: boolean, withName: boolean): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (withName) o.name = v.variantTitle || 'Default';
  o.price = fmt(v.priceCents); o.stock = stockText(v.stock);
  if (detail) {
    if (v.sku) o.sku = v.sku; if (v.barcode) o.barcode = v.barcode;
    if (v.compareAtCents && v.compareAtCents > v.priceCents) o.compare_at = fmt(v.compareAtCents);
    if (typeof v.costCents === 'number') o.cost = fmt(v.costCents);
  }
  return o;
}

/** Products of the variations given, one row each: a plain item gets its price and stock on the row, a product with variations gets a total and a row for each. */
export function productRows(view: CatalogueView, vs: Variant[], detail: boolean, limit: number): { rows: Record<string, unknown>[]; found: number; /** Some product has more variations than matched, so only the matching ones are shown and there is no total for it. */ partial: boolean } {
  const byProduct = new Map<string, Variant[]>();
  for (const v of vs) { const l = byProduct.get(v.productId); if (l) l.push(v); else byProduct.set(v.productId, [v]); }
  const groups = [...byProduct.values()].sort((a, b) => a[0].productTitle.localeCompare(b[0].productTitle, undefined, { numeric: true, sensitivity: 'base' }));
  const cols = new Map<string, string[]>(); for (const c of view.collections) for (const p of c.productIds) { const l = cols.get(p); if (l) l.push(c.title); else cols.set(p, [c.title]); }
  // How many variations each product has in the catalogue, so a total is only given when every one of them is in the group.
  const sizes = new Map<string, number>(); for (const v of Object.values(view.variants)) sizes.set(v.productId, (sizes.get(v.productId) ?? 0) + 1);
  let partial = false;
  const rows = groups.slice(0, limit).map(g => {
    const first = g[0]; const st = statusOf(first); const o: Record<string, unknown> = { name: first.productTitle };
    if (STATUS_TEXT[st]) o.status = STATUS_TEXT[st];
    if (g.length === 1) { Object.assign(o, variantRow(first, detail, false)); if (first.variantTitle) o.name = nameOf(first); }
    else {
      o.price = priceText(g);
      if (g.length >= (sizes.get(first.productId) ?? g.length)) o.total_stock = stockText(total(g)); else partial = true;
      const cap = detail ? MAX_VARIANT_ROWS_DETAIL : MAX_VARIANT_ROWS;
      o.variants = g.slice(0, cap).map(v => variantRow(v, detail, true));
      if (g.length > cap) o.more_variants = g.length - cap;
    }
    if (detail) {
      const tags = first.tags.slice(0, 8); if (tags.length) o.tags = tags;
      const cl = cols.get(first.productId); if (cl && cl.length) o.categories = cl.slice(0, 5);
      const deals = [...new Set(g.flatMap(v => dealsFor(v, { autos: view.autos, bundles: view.bundles, collectionIds: view.collections.filter(c => c.productIds.includes(v.productId)).map(c => c.id), now: view.now }).map(d => d.label)))].slice(0, 5);
      if (deals.length) o.deals = deals;
    }
    return o;
  });
  return { rows, found: groups.length, partial };
}

/**
 * Finds products by words in the name, a variation, the SKU or the barcode (every word has to match, as in the Inventory search box),
 * and/or by category. Active and unlisted products by default, as the till shows them. Cost is only in the detail form, and the data
 * gate takes it out where cost prices may not be sent.
 */
export function findProducts(view: CatalogueView, args: ProductArgs): Record<string, unknown> {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  const terms = words(query);
  const cat = categoryIds(view, args.category);
  if (!terms.length && !cat.ids) return { error: 'Give a product name, a SKU or a barcode, or a category to look in.' };
  const status = readStatus(args.status); if (typeof status !== 'string') return status;
  const detail = args.detail === true;
  const lowAt = defaultInvPrefs().lowAt;
  const pool = cat.none ? [] : filterVariants(allVariants(view), { ...defaultInvPrefs(), stock: 'all', status, lowAt }, '', cat.ids);
  const hits = terms.length ? pool.filter(v => hasAll(hayOf(v), terms)) : pool;
  const limit = detail ? MAX_DETAIL : MAX_ROWS;
  const { rows, found, partial } = productRows(view, hits, detail, limit);
  const notes: string[] = [CATALOGUE_NOTE, statusNote(status)];
  if (cat.none) notes.push(cat.none);
  else if (!found) notes.push('No product matched.');
  if (partial) notes.push('Where only some variations of a product matched, only those are shown, with no total for the product.');
  if (found > limit) notes.push(`Showing ${limit} of ${found}. Add more words to narrow it${detail ? '' : ', or set detail to true for SKU, barcode, deals and categories of fewer products'}.`);
  if (detail && rows.some(r => r.deals)) notes.push('Deals are a hint: a deal may need more than one item. Use list_deals for what each needs.');
  return { found, products: rows, note: notes.join(' ') };
}

// ---------- stock_levels ----------
export type StockArgs = { filter?: unknown; category?: unknown; query?: unknown; status?: unknown };
/**
 * Stock levels: counts for the whole range asked about (how many tracked, out of stock, low, oversold, not tracked, and units in stock),
 * and the variations that match the filter, lowest first. Low is the Inventory list's own: the low-stock level or fewer, which includes
 * out of stock. The default is low.
 */
export function stockLevels(view: CatalogueView, args: StockArgs): Record<string, unknown> {
  const filter = args.filter === undefined || args.filter === null || args.filter === '' ? 'low' : args.filter;
  if (!(STOCK_FILTERS as readonly unknown[]).includes(filter)) return { error: `Unknown filter. Use one of: ${STOCK_FILTERS.join(', ')}.` };
  const status = readStatus(args.status); if (typeof status !== 'string') return status;
  const cat = categoryIds(view, args.category);
  const terms = words(args.query);
  const lowAt = defaultInvPrefs().lowAt;
  const base = cat.none ? [] : filterVariants(allVariants(view), { ...defaultInvPrefs(), stock: 'all', status, lowAt }, '', cat.ids).filter(v => !terms.length || hasAll(hayOf(v), terms));
  const hits = base.filter(v => matchesStock(v, INV_FILTER[filter as StockWord], lowAt));
  const tracked = base.filter(v => v.stock !== null);
  const notes: string[] = [CATALOGUE_NOTE, statusNote(status), `Low means ${lowAt} or fewer, which includes out of stock.`];
  if (cat.none) notes.push(cat.none);
  else if (!base.length) notes.push('No product matched.');
  else if (!hits.length) notes.push('Nothing matched that filter.');
  if (hits.length > MAX_ROWS) notes.push(`Showing the lowest ${MAX_ROWS} of ${hits.length}. Add a category or words to narrow it.`);
  return {
    filter, matching: hits.length, variations: base.length, tracked: tracked.length, not_tracked: base.length - tracked.length,
    out_of_stock: tracked.filter(v => v.stock === 0).length, low: tracked.filter(v => (v.stock as number) >= 0 && (v.stock as number) <= lowAt).length, oversold: tracked.filter(v => (v.stock as number) < 0).length,
    units_in_stock: tracked.reduce((a, v) => a + Math.max(0, v.stock as number), 0),
    items: sortVariants(hits, 'stock-asc').slice(0, MAX_ROWS).map(v => ({ name: nameOf(v), stock: stockText(v.stock) })),
    note: notes.join(' '),
  };
}

// ---------- the offline mode ----------
/** Words that are part of asking, not part of a product's name. They are left out of an offline search, so \"how many red cows have we got in stock\" looks for red and cow. */
const NOISE = new Set(('a an and any are at be can do does for got had has have how i in is it many much me my of on or our the there this to we what whats which with you ' +
  'stock price cost left level available avail check sell sold sale item product variant variation low out running oversold tracked untracked qty quantity count').split(' ').flatMap(w => [w, words(w)[0] ?? w]));
export type ProductHit = { name: string; price: string; stock: string; variants: { name: string; stock: string }[] };
export type OfflineStock = { title: string; rows: { name: string; stock: string }[]; more: number };
export const OFFLINE_PRODUCT_MAX = 5;

/** What an offline search looks for in the catalogue: the words of a question that could be in a product's name, and which stock list (if any) it asked for. */
export function offlineProductTerms(text: string): { terms: string[]; stock: StockWord | null } {
  const raw = (text ?? '').toLowerCase();
  const stock: StockWord | null = /\boversold\b/.test(raw) ? 'oversold' : /\b(out of stock|sold out)\b/.test(raw) ? 'out' : /\b(low|running low|running out)\b/.test(raw) && /\b(stock|inventory|items?|products?|running)\b/.test(raw) ? 'low' : null;
  return { terms: words(raw).filter(t => !NOISE.has(t) && t.length > 1), stock };
}

/**
 * Looks up products and stock with no model (plan 3.3), from the same rows the model's tools use. One or two words must all match; with three or more,
 * half is enough, because a typed sentence rarely has every word in a product's name, and the products with more of the words come first.
 * Active and unlisted products only. The data never leaves the device, so the data gate does not apply here.
 */
export function offlineProductSearch(view: CatalogueView, text: string): { products: ProductHit[]; stock: OfflineStock | null } {
  const { terms, stock } = offlineProductTerms(text);
  const pool = filterVariants(allVariants(view), { ...defaultInvPrefs(), stock: 'all', status: 'active' }, '', null);
  let products: ProductHit[] = [];
  if (terms.length) {
    const need = terms.length <= 2 ? terms.length : Math.ceil(terms.length / 2);
    const scored = pool.map(v => ({ v, hit: terms.filter(t => hayOf(v).toLowerCase().includes(t)).length })).filter(x => x.hit >= need);
    const best = new Map<string, number>(); for (const x of scored) best.set(x.v.productId, Math.max(best.get(x.v.productId) ?? 0, x.hit));
    const ids = [...best.entries()].sort((a, b) => b[1] - a[1]);
    const order = new Map(ids.map(([id], i) => [id, i] as const));
    const vs = scored.map(x => x.v).sort((a, b) => (order.get(a.productId) ?? 0) - (order.get(b.productId) ?? 0));
    const byProduct = new Map<string, Variant[]>(); for (const v of vs) { const l = byProduct.get(v.productId); if (l) l.push(v); else byProduct.set(v.productId, [v]); }
    products = [...byProduct.values()].slice(0, OFFLINE_PRODUCT_MAX).map(g => ({
      name: g[0].productTitle, price: priceText(g), stock: g.length === 1 ? stockText(g[0].stock) : stockText(total(g)),
      variants: g.length > 1 ? g.slice(0, MAX_VARIANT_ROWS).map(v => ({ name: v.variantTitle || 'Default', stock: stockText(v.stock) })) : [],
    }));
  }
  let list: OfflineStock | null = null;
  if (stock) {
    const hits = sortVariants(pool.filter(v => matchesStock(v, INV_FILTER[stock], defaultInvPrefs().lowAt)), 'stock-asc');
    list = { title: stock === 'low' ? 'Low on stock (2 or fewer)' : stock === 'out' ? 'Out of stock' : 'Oversold', rows: hits.slice(0, MAX_ROWS).map(v => ({ name: nameOf(v), stock: stockText(v.stock) })), more: Math.max(0, hits.length - MAX_ROWS) };
  }
  return { products, stock: list };
}
