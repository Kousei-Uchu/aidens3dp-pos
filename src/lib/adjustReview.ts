// Location: src/lib/adjustReview.ts
// A16.5: the checkout review of price adjustments. Every adjustment on the sale (item price, line price, whole order
// price) becomes one row; rows that need a second look (A16.2 style flags) come first. Charge shows this once before
// payment, and again only if an adjustment, or anything it depends on, changes. Pure, so it is testable.
import * as ops from './cartOps';
import { fmt } from './money';
import { hasItemPrice, itemReviewReasons } from './itemAdjust';
import { beforeAdjustCents, keepAdjust, reviewReasons } from './lineAdjust';
import { keepOrderAdjust, orderBeforeCents, orderReviewReasons } from './orderAdjust';
import type { Cart, PricedCart, SaleAdjustment } from './types';

export type AdjustKind = 'item' | 'line' | 'order';
export type AdjustRow = {
  id: string; kind: AdjustKind; lineId?: string;
  title: string; detail: string;
  /** What it changes the sale by: positive = takes money off, negative = adds money (an item price can go up). */
  cents: number;
  /** Why it needs a second look. Empty = nothing to resolve. */
  reasons: string[];
  /** The cashier's optional reason for the adjustment (A16.8). */
  reason?: string;
};

/** "−$2.00" for money taken off, "+$1.00" for money added. */
export const signedSaving = (cents: number): string => (cents >= 0 ? `−${fmt(cents)}` : `+${fmt(-cents)}`);

/** Every adjustment on the cart, flagged ones first, the rest in cart order (whole order last). Empty when there are none. */
export function adjustmentRows(cart: Cart, priced: PricedCart): AdjustRow[] {
  const rows: AdjustRow[] = [];
  for (const pl of priced.lines) {
    const l = pl.line; const name = l.qty > 1 ? `${l.title} × ${l.qty}` : l.title;
    if (hasItemPrice(l)) {
      const scope = l.overrideAll ? 'all in cart' : l.overrideSeenQty !== undefined ? `for ${l.overrideSeenQty} unit${l.overrideSeenQty === 1 ? '' : 's'}` : 'this line';
      rows.push({ id: `item:${l.id}`, kind: 'item', lineId: l.id, title: name, detail: `Item price ${fmt(l.overrideCents!)} (was ${fmt(l.unitCents)}) · ${scope}`, cents: (l.unitCents - l.overrideCents!) * l.qty, reasons: itemReviewReasons(pl), reason: l.overrideReason });
    }
    if (pl.adjustment && l.adjust) {
      rows.push({ id: `line:${l.id}`, kind: 'line', lineId: l.id, title: name,
        detail: pl.adjustment.cents > 0 ? `Line price ${fmt(pl.adjustment.finalCents)} (was ${fmt(beforeAdjustCents(pl))} after deals)` : `Line price ${fmt(pl.adjustment.finalCents)} (no longer lowers the price)`,
        cents: pl.adjustment.cents, reasons: reviewReasons(pl), reason: l.adjust.reason });
    }
  }
  if (priced.adjustment && cart.orderAdjust) {
    rows.push({ id: 'order', kind: 'order', title: 'Whole order', detail: priced.adjustment.cents > 0 ? `Total ${fmt(priced.adjustment.finalCents)} (was ${fmt(orderBeforeCents(priced))})` : `Total ${fmt(priced.adjustment.finalCents)} (no longer lowers the total)`, cents: priced.adjustment.cents, reasons: orderReviewReasons(cart, priced), reason: cart.orderAdjust.reason });
  }
  return [...rows.filter(r => r.reasons.length), ...rows.filter(r => !r.reasons.length)];
}

/** A16.8: the sale's adjustments as saved on the SaleRecord and the Shopify order. */
export const saleAdjustments = (cart: Cart, priced: PricedCart): SaleAdjustment[] =>
  adjustmentRows(cart, priced).map(r => ({ kind: r.kind, title: r.title, detail: r.detail, cents: r.cents, ...(r.reason ? { reason: r.reason } : {}) }));

/** Stable fingerprint of the rows; the checkout review only returns when this changes. '' = no adjustments. */
export const adjustReviewKey = (rows: AdjustRow[]): string => rows.map(r => `${r.id}|${r.detail}|${r.cents}|${r.reasons.length}`).sort().join('~');
export const needsAdjustReview = (rows: AdjustRow[], acknowledged: string): boolean => { const k = adjustReviewKey(rows); return k !== '' && k !== acknowledged; };
/** Rows that must be Kept, Adjusted or Removed before payment can start. */
export const unresolvedRows = (rows: AdjustRow[]): AdjustRow[] => rows.filter(r => r.reasons.length > 0);

/** Keep: the same price, now confirmed against the sale as it is. */
export function keepRow(cart: Cart, priced: PricedCart, row: AdjustRow): Cart {
  const pl = row.lineId ? priced.lines.find(x => x.line.id === row.lineId) : undefined;
  if (row.kind === 'line') return pl?.line.adjust ? ops.setLineAdjust(cart, row.lineId!, keepAdjust(pl.line.adjust, pl)) : cart;
  if (row.kind === 'item') return ops.keepItemPrice(cart, row.lineId!);
  return cart.orderAdjust ? ops.setOrderAdjust(cart, keepOrderAdjust(cart.orderAdjust, cart, priced)) : cart;
}
/** Remove: back to the price without this adjustment. */
export function removeRow(cart: Cart, row: AdjustRow): Cart {
  if (row.kind === 'line') return ops.setLineAdjust(cart, row.lineId!, undefined);
  if (row.kind === 'item') return ops.clearItemPrice(cart, row.lineId!);
  return ops.setOrderAdjust(cart, undefined);
}
