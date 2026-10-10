// Location: src/lib/lineAdjust.ts
// A16.1 / A16.2 / A16.6 (line part): the Line price adjustment. The cashier says what a whole line should cost; the
// pricing engine (step 5 in pricing.ts) stores the difference as a "Line price adjustment" row. These pure helpers
// build the adjustment, check it, and work out when a line needs the cashier to look at it again.
import { fmt } from './money';
import { cleanReason } from './adjustReason';
import { itemReviewReasons } from './itemAdjust';
import type { CartLine, LineAdjust, PricedCart, PricedLine } from './types';

/**
 * Discounts that come before the adjustment on THIS line: bundles, Shopify automatic discounts and the line's own manual
 * discount. The cart discount and a whole-order adjustment are left out on purpose: the first skips a line whose price is
 * fixed by an adjustment, so counting it would change the numbers the moment an adjustment is set; the second comes after.
 */
const discountsBefore = (pl: PricedLine) => pl.discounts.filter(d => d.type !== 'adjust' && d.type !== 'cart' && d.type !== 'orderadjust').reduce((a, d) => a + d.cents, 0);

/** What the line costs before the adjustment: gross minus the discounts above. */
export const beforeAdjustCents = (pl: PricedLine): number => pl.grossCents - discountsBefore(pl);

/** Gift cards are never adjusted (their value is the money received). */
export const canAdjustLine = (l: CartLine): boolean => l.kind !== 'gift_card';

/** Why a final price can't be used, or null when it is fine. The line price can only go down; to raise a price, change the unit price. */
export function adjustProblem(finalCents: number, pl: PricedLine): string | null {
  if (!Number.isFinite(finalCents) || !Number.isInteger(finalCents)) return 'Enter an amount.';
  if (finalCents < 0) return 'A line cannot cost less than $0.00.';
  const before = beforeAdjustCents(pl);
  if (finalCents >= before) return `That is not lower than the line's current price of ${fmt(before)}. To raise a price, change the unit price instead.`;
  return null;
}

/** The adjustment as the cart stores it: the final price plus a snapshot of the line, so later changes can be noticed. */
export const makeAdjust = (finalCents: number, pl: PricedLine, reason?: string): LineAdjust => ({
  ...(cleanReason(reason) ? { reason: cleanReason(reason) } : {}), finalCents, seenQty: pl.line.qty, seenGrossCents: pl.grossCents, seenDiscountCents: discountsBefore(pl),
});

/** "Keep": the same final price, with the snapshot taken again from the line as it is now. */
export const keepAdjust = (a: LineAdjust, pl: PricedLine): LineAdjust => makeAdjust(a.finalCents, pl, a.reason);

/** Plain-English reasons the cashier should look at this line's adjustment again. Empty = nothing to review. */
export function reviewReasons(pl: PricedLine): string[] {
  const a = pl.line.adjust;
  if (!a || !canAdjustLine(pl.line)) return [];
  const out: string[] = [];
  const q = pl.line.qty;
  const name = pl.line.title;
  if (q > a.seenQty) out.push(`${q - a.seenQty} more ${name} added`);
  else if (q < a.seenQty) out.push(`${a.seenQty - q} ${name} removed`);
  else if (pl.grossCents !== a.seenGrossCents) out.push('The unit price changed');
  else if (discountsBefore(pl) !== a.seenDiscountCents) out.push('The discounts on this line changed');
  if (pl.adjustment && pl.adjustment.cents === 0) out.push(`The adjustment no longer lowers the price (the line is already ${fmt(beforeAdjustCents(pl))})`);
  return out;
}

export type FlaggedLine = { lineId: string; title: string; reasons: string[] };
/** Every line that needs review (a line price adjustment or a fixed-quantity item price), in cart order, for the cart header count and the highlighted rows. */
export function flaggedLines(priced: PricedCart): FlaggedLine[] {
  const out: FlaggedLine[] = [];
  for (const pl of priced.lines) { const reasons = [...reviewReasons(pl), ...itemReviewReasons(pl)]; if (reasons.length) out.push({ lineId: pl.line.id, title: pl.line.title, reasons }); }
  return out;
}
