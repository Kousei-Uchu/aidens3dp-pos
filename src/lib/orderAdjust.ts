// Location: src/lib/orderAdjust.ts
// A16.4 / A16.7 / A16.2-style review for the Whole order adjustment: the cashier says what the whole cart should cost.
// The pricing engine (step 6 in pricing.ts) shares the difference over the lines. These pure helpers build and check it,
// and work out when it needs another look.
import { cleanReason } from './adjustReason';
import { fmt } from './money';
import type { Cart, OrderAdjust, PricedCart } from './types';

/** The cart total with no adjustment of either kind. The adjustment sheet prices the cart this way, so the numbers it shows never depend on an adjustment already there. */
export const stripAdjustments = (c: Cart): Cart => ({ ...c, orderAdjust: undefined, lines: c.lines.map(l => (l.adjust ? { ...l, adjust: undefined } : l)) });

/** The cart total before the whole-order adjustment (for a cart priced as it is, with no line adjustments). */
export const orderBeforeCents = (p: PricedCart): number => p.netCents + (p.adjustment?.cents ?? 0);

/** What a gift card line is worth: gift cards are never reduced, so the order total cannot go below them. */
export const giftCardCents = (p: PricedCart): number => p.lines.filter(l => l.line.kind === 'gift_card').reduce((a, l) => a + l.netCents, 0);

/** Why a final order total can't be used (`base` = the cart priced with no adjustments), or null when it is fine. */
export function orderAdjustProblem(finalCents: number, base: PricedCart): string | null {
  if (!Number.isFinite(finalCents) || !Number.isInteger(finalCents)) return 'Enter an amount.';
  if (finalCents < 0) return 'An order cannot cost less than $0.00.';
  const gift = giftCardCents(base);
  if (finalCents < gift) return `The order includes gift cards worth ${fmt(gift)}, which cannot be reduced, so the total cannot go below that.`;
  const before = base.netCents;
  if (finalCents >= before) return `That is not lower than the order's current total of ${fmt(before)}. To charge more, change the item prices instead.`;
  return null;
}

/** The adjustment as the cart stores it, with a snapshot of the cart so later changes can be noticed. */
export const makeOrderAdjust = (finalCents: number, cart: Cart, base: PricedCart, reason?: string): OrderAdjust => ({
  ...(cleanReason(reason) ? { reason: cleanReason(reason) } : {}), finalCents, seenQty: cart.lines.reduce((a, l) => a + l.qty, 0), seenBeforeCents: base.netCents,
});

/** "Keep": the same final total, with the snapshot taken again from the order as it is now. */
export const keepOrderAdjust = (a: OrderAdjust, cart: Cart, p: PricedCart): OrderAdjust => ({ ...a, seenQty: cart.lines.reduce((x, l) => x + l.qty, 0), seenBeforeCents: orderBeforeCents(p) });

/** Plain-English reasons the cashier should look at the whole-order price again. Empty = nothing to review. */
export function orderReviewReasons(cart: Cart, p: PricedCart): string[] {
  const a = cart.orderAdjust;
  if (!a || cart.lines.length === 0) return [];
  const out: string[] = [];
  const q = cart.lines.reduce((x, l) => x + l.qty, 0);
  if (q > a.seenQty) out.push(`${q - a.seenQty} more item${q - a.seenQty === 1 ? '' : 's'} added`);
  else if (q < a.seenQty) out.push(`${a.seenQty - q} item${a.seenQty - q === 1 ? '' : 's'} removed`);
  else if (orderBeforeCents(p) !== a.seenBeforeCents) out.push('Prices or discounts changed');
  if (p.adjustment && p.adjustment.cents === 0) out.push(`The adjustment no longer lowers the total (the order is already ${fmt(orderBeforeCents(p))})`);
  return out;
}
