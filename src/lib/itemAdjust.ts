// Location: src/lib/itemAdjust.ts
// A16.3 (Item price adjustment): review flag for a Fixed quantity price. The price was set for a number of units; if the
// line's quantity changes afterwards the cashier is asked to look again. An "All in cart" price follows every unit, so it
// has nothing to flag. Prices set before this existed carry no count and are left alone.
import type { CartLine, PricedLine } from './types';

export const hasItemPrice = (l: CartLine): boolean => l.overrideCents !== undefined && l.kind !== 'gift_card';
/** Fixed quantity (a set number of units) rather than All in cart. */
export const isFixedQtyPrice = (l: CartLine): boolean => hasItemPrice(l) && !l.overrideAll && l.overrideSeenQty !== undefined;

/** Plain-English reasons to look at this line's item price again. Empty = nothing to review. */
export function itemReviewReasons(pl: PricedLine): string[] {
  const l = pl.line;
  if (!isFixedQtyPrice(l)) return [];
  const seen = l.overrideSeenQty!;
  return l.qty === seen ? [] : [`The adjusted price was set for ${seen} ${l.title}, the line now has ${l.qty}`];
}
