// Location: src/lib/lookup.ts
// Pure helpers for the grid's Price check and Stock check tiles, and for the in-grid variation picker.
// Nothing here touches the cart. No React, no Shopify: unit-tested in tests/lookup.test.ts.
import { findByBarcode } from './cartOps';
import { dealLive } from './bundles';
import { isGiftQr } from './giftCode';
import { isBadgeCode } from './badge';
import { NO_DISCOUNT_TAG } from './pricing';
import type { AutoDiscount, BundleConfig, Target, Variant } from './types';

// ── What a scan or a typed code is ───────────────────────────────────────────
export type ScanResolution = { kind: 'variant'; variant: Variant } | { kind: 'gift' } | { kind: 'pass' } | { kind: 'none' };
/** Order matters: a cashier pass or a gift card QR must never be mistaken for an item, and a real barcode wins over both. */
export function resolveScan(code: string, variants: Iterable<Variant>): ScanResolution {
  const v = findByBarcode(variants, code);
  if (v) return { kind: 'variant', variant: v };
  if (isBadgeCode(code)) return { kind: 'pass' };
  if (isGiftQr(code)) return { kind: 'gift' };
  return { kind: 'none' };
}
export function scanProblem(r: ScanResolution, code: string): string | null {
  switch (r.kind) {
    case 'variant': return null;
    case 'pass': return 'That is a cashier pass, not an item.';
    case 'gift': return 'That is a gift card. Check its balance from Charge ▸ Gift card.';
    case 'none': return `No item for ${code.trim()}`;
  }
}

// ── Stock check ──────────────────────────────────────────────────────────────
export type StockTone = 'none' | 'ok' | 'low' | 'out' | 'neg';
/** Same thresholds as the stock dot on grid tiles (≤2 is low), with 0 split out as "out". */
export const stockToneOf = (stock: number | null): StockTone => (stock === null ? 'none' : stock < 0 ? 'neg' : stock === 0 ? 'out' : stock <= 2 ? 'low' : 'ok');
export const stockText = (stock: number | null): string =>
  stock === null ? 'Not tracked' : stock < 0 ? `${Math.abs(stock)} oversold` : stock === 0 ? 'Out of stock' : `${stock} in stock`;

export type StockRow = { variant: Variant; stock: number | null; isScanned: boolean };
export type StockCheck = {
  productId: string; title: string;
  rows: StockRow[];            // the scanned variation first, then the others in catalogue order
  single: boolean;             // the product has only this one variation (a plain item)
  totalTracked: number | null; // sum of tracked, non-negative stock across the rows; null when none are tracked
  untracked: number;           // how many rows have no stock tracking
};
/**
 * Stock of a scanned variation and its siblings (the other variations of the same product).
 * `siblings` is whatever the catalogue holds for that product; the scanned one is always included, once.
 * A variation with no sibling is a plain item, so only its own stock is shown (`single`).
 */
export function stockCheck(scanned: Variant, siblings: Variant[]): StockCheck {
  const others = siblings.filter(v => v.id !== scanned.id && v.productId === scanned.productId);
  const rows: StockRow[] = [scanned, ...others].map((v, i) => ({ variant: v, stock: v.stock, isScanned: i === 0 }));
  const tracked = rows.filter(r => r.stock !== null);
  return {
    productId: scanned.productId, title: scanned.productTitle, rows, single: rows.length === 1,
    totalTracked: tracked.length ? tracked.reduce((a, r) => a + Math.max(0, r.stock as number), 0) : null,
    untracked: rows.length - tracked.length,
  };
}

// ── Price check ──────────────────────────────────────────────────────────────
export type DealNote = { kind: 'auto' | 'bundle'; label: string };
export type PriceCheck = { priceCents: number; compareAtCents?: number; wasCents?: number; deals: DealNote[]; excluded: boolean };

const targetHit = (t: Target | undefined, v: Variant, collectionIds: string[]): boolean =>
  !!t && (!!t.all || !!t.variantIds?.includes(v.id) || !!t.productIds?.includes(v.productId) || !!t.collectionIds?.some(c => collectionIds.includes(c)));

/** Live Shopify automatic discounts and bundle deals that this variation can take part in. A hint for the cashier, not a promise: minimum quantities still apply. */
export function dealsFor(v: Variant, ctx: { autos: AutoDiscount[]; bundles: BundleConfig | null; collectionIds: string[]; now?: number }): DealNote[] {
  const now = ctx.now ?? Date.now(); const out: DealNote[] = [];
  if (v.tags.includes(NO_DISCOUNT_TAG)) return out;
  for (const d of ctx.autos) {
    if (d.startsAt && Date.parse(d.startsAt) > now) continue;
    if (d.endsAt && Date.parse(d.endsAt) < now) continue;
    const hit = d.kind === 'bxgy' ? targetHit(d.buys?.target, v, ctx.collectionIds) || targetHit(d.gets?.target, v, ctx.collectionIds) : targetHit(d.target, v, ctx.collectionIds);
    if (hit) out.push({ kind: 'auto', label: d.title });
  }
  if (ctx.bundles) for (const d of ctx.bundles.discounts) {
    if (!dealLive(d, now)) continue;
    // a product id in a set matches all of its variations, a variant id only that one (same rule as matchBundles)
    if (d.sets.some(sid => (ctx.bundles!.items[sid] ?? []).some(id => id === v.id || id === v.productId))) out.push({ kind: 'bundle', label: d.label });
  }
  return out;
}

export function priceCheck(v: Variant, ctx: { autos: AutoDiscount[]; bundles: BundleConfig | null; collectionIds: string[]; now?: number }): PriceCheck {
  const was = v.compareAtCents && v.compareAtCents > v.priceCents ? v.compareAtCents : undefined;
  return { priceCents: v.priceCents, compareAtCents: v.compareAtCents, wasCents: was, deals: dealsFor(v, ctx), excluded: v.tags.includes(NO_DISCOUNT_TAG) };
}

// ── Search (typed lookups) ───────────────────────────────────────────────────
/** One row per product (first matching variation), every word must match title, variation, SKU or barcode. Capped, because it is a search box. */
export function searchVariants(list: Variant[], query: string, limit = 30): Variant[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean); if (!words.length) return [];
  const out: Variant[] = []; const seen = new Set<string>();
  for (const v of list) {
    if (seen.has(v.productId)) continue;
    const hay = `${v.productTitle} ${v.variantTitle} ${v.sku ?? ''} ${v.barcode ?? ''}`.toLowerCase();
    if (!words.every(w => hay.includes(w))) continue;
    seen.add(v.productId); out.push(v); if (out.length >= limit) break;
  }
  return out;
}

// ── Variation picker (the in-grid sub-page) ──────────────────────────────────
/** Title for the last breadcrumb and header of the picker. */
export const pickerTitle = (vs: Variant[]): string => vs[0]?.productTitle ?? 'Choose variation';
/** Variations as shown on the picker: catalogue order, but never a duplicate id. */
export const pickerVariants = (vs: Variant[]): Variant[] => { const seen = new Set<string>(); return vs.filter(v => !seen.has(v.id) && (seen.add(v.id), true)); };
/** The path shown above the grid while the picker is open: the normal crumbs, then the product (not tappable, it is where you are). */
export function pickerCrumbs<C extends { label: string }>(crumbs: C[], vs: Variant[]): (C | { label: string; here: true })[] {
  return [...crumbs, { label: pickerTitle(vs), here: true as const }];
}
