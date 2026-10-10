// Location: src/lib/cartOps.ts
// Pure cart operations (immutable). The store just calls these.
import { cleanReason } from './adjustReason';
import { uid } from './ids';
import { NO_DISCOUNT_TAG } from './pricing';
import type { Cart, CartLine, GiftRecipient, LineAdjust, ManualDiscount, OrderAdjust, Variant } from './types';

export const emptyCart = (): Cart => ({ id: uid(), lines: [] });
export const itemCount = (c: Cart) => c.lines.reduce((s, l) => s + l.qty, 0);

const sameLine = (l: CartLine, v: Variant) =>
  l.kind === 'item' && l.variantId === v.id && (l.overrideCents === undefined || !!l.overrideAll) && !l.discount && !l.note && !l.adjust;

/** A16.3 "All in cart": variant id -> the unit price set for every unit of that item (the first such line wins). */
const allInCartPrices = (lines: CartLine[]): Map<string, { cents: number; reason?: string }> => {
  const m = new Map<string, { cents: number; reason?: string }>();
  for (const l of lines) if (l.kind === 'item' && l.variantId && l.overrideAll && l.overrideCents !== undefined && !m.has(l.variantId)) m.set(l.variantId, { cents: l.overrideCents, reason: l.overrideReason });
  return m;
};
/** Plain lines of an item that has an "All in cart" price take that price too (a line with its own fixed-quantity price keeps it). */
const withAllInCart = (lines: CartLine[], m: Map<string, { cents: number; reason?: string }>): CartLine[] =>
  m.size === 0 ? lines : lines.map(l => (l.kind === 'item' && l.variantId && l.overrideCents === undefined && m.has(l.variantId) ? { ...l, overrideCents: m.get(l.variantId)!.cents, overrideAll: true, overrideReason: m.get(l.variantId)!.reason } : l));

export function addVariant(c: Cart, v: Variant, qty = 1, consolidate = true): Cart {
  const idx = consolidate ? c.lines.findIndex(l => sameLine(l, v)) : -1;
  if (idx >= 0) return { ...c, lines: c.lines.map((l, i) => (i === idx ? { ...l, qty: l.qty + qty } : l)) };
  const line: CartLine = {
    id: uid(), kind: 'item', variantId: v.id, title: v.productTitle, variantTitle: v.variantTitle || undefined, qty, unitCents: v.priceCents,
    noDiscount: v.tags.some(t => t.toLowerCase() === NO_DISCOUNT_TAG) || undefined,
  };
  return { ...c, lines: withAllInCart([...c.lines, line], allInCartPrices(c.lines)) };
}
export const addCustom = (c: Cart, cents: number, title = 'Custom amount', note?: string): Cart =>
  ({ ...c, lines: [...c.lines, { id: uid(), kind: 'custom', title, qty: 1, unitCents: cents, noDiscount: true, note }] });
export const addGiftCardLine = (c: Cart, cents: number, code: string, giftRecipient?: GiftRecipient): Cart =>
  ({ ...c, lines: [...c.lines, { id: uid(), kind: 'gift_card', title: 'Gift card', qty: 1, unitCents: cents, giftCardCode: code, noDiscount: true, ...(giftRecipient ? { giftRecipient } : {}) }] });

export const setQty = (c: Cart, id: string, qty: number): Cart =>
  qty <= 0 ? removeLine(c, id) : { ...c, lines: c.lines.map(l => (l.id === id ? { ...l, qty } : l)) };
export const removeLine = (c: Cart, id: string): Cart => ({ ...c, lines: c.lines.filter(l => l.id !== id) });
export const patchLine = (c: Cart, id: string, p: Partial<CartLine>): Cart => ({ ...c, lines: c.lines.map(l => (l.id === id ? { ...l, ...p } : l)) });
export const swapVariant = (c: Cart, id: string, v: Variant): Cart =>
  patchLine(c, id, { variantId: v.id, variantTitle: v.variantTitle || undefined, unitCents: v.priceCents, overrideCents: undefined, overrideAll: undefined, overrideSeenQty: undefined, overrideReason: undefined });
const noItemPrice = { overrideCents: undefined, overrideAll: undefined, overrideSeenQty: undefined, overrideReason: undefined } as const;
export type ItemPriceScope = { scope: 'qty'; qty: number } | { scope: 'all' };
/**
 * A16.3 Item price adjustment: a new unit price for this sale.
 *  - Fixed quantity: the price is for `qty` units of the line. Fewer than the whole line splits it, the adjusted units becoming their own line
 *    (the rest stays as it was); `overrideSeenQty` remembers the count so changing it later is flagged.
 *  - All in cart: every line of this item gets the price, and units added later get it too.
 * Gift cards are never adjusted; a custom amount has no "item", so it always uses Fixed quantity.
 */
export function setItemPrice(c: Cart, id: string, cents: number, how: ItemPriceScope, reason?: string): Cart {
  const why = cleanReason(reason);
  const l = c.lines.find(x => x.id === id);
  if (!l || l.kind === 'gift_card' || !Number.isInteger(cents) || cents < 0) return c;
  if (how.scope === 'all' && l.kind === 'item' && l.variantId) {
    return { ...c, lines: c.lines.map(x => (x.kind === 'item' && x.variantId === l.variantId ? { ...x, overrideCents: cents, overrideAll: true, overrideSeenQty: undefined, overrideReason: why } : x)) };
  }
  const n = how.scope === 'qty' ? Math.min(l.qty, Math.max(1, Math.floor(how.qty))) : l.qty;
  if (n >= l.qty) return patchLine(c, id, { overrideCents: cents, overrideAll: undefined, overrideSeenQty: l.qty, overrideReason: why });
  const adjusted: CartLine = { ...l, id: uid(), qty: n, overrideCents: cents, overrideAll: undefined, overrideSeenQty: n, overrideReason: why, discount: undefined, adjust: undefined };
  const lines: CartLine[] = [];
  for (const x of c.lines) { lines.push(x.id === id ? { ...x, qty: x.qty - n } : x); if (x.id === id) lines.push(adjusted); }
  return { ...c, lines };
}
/** A16.3: take the item price off. For an "All in cart" price that means every line that follows it; a fixed-quantity line is on its own. */
export function clearItemPrice(c: Cart, id: string): Cart {
  const l = c.lines.find(x => x.id === id);
  if (!l) return c;
  return { ...c, lines: c.lines.map(x => (x.id === id || (l.overrideAll && x.kind === 'item' && x.variantId === l.variantId && x.overrideAll) ? { ...x, ...noItemPrice } : x)) };
}
/** A16.3 "Keep": the fixed-quantity price stays and now counts as set for the line's current quantity. */
export const keepItemPrice = (c: Cart, id: string): Cart => ({ ...c, lines: c.lines.map(x => (x.id === id && x.overrideSeenQty !== undefined ? { ...x, overrideSeenQty: x.qty } : x)) });
/** A16.1: set (or with undefined, remove) the line's price adjustment. */
export const setLineAdjust = (c: Cart, id: string, a?: LineAdjust): Cart => patchLine(c, id, { adjust: a });
/** A16.4: set (or with undefined, remove) the whole-order adjustment. A16.7: the caller removes line adjustments first (see `clearLineAdjusts`). */
export const setOrderAdjust = (c: Cart, a?: OrderAdjust): Cart => ({ ...c, orderAdjust: a });
/** A16.7: a whole-order adjustment and line adjustments are never both active. */
export const hasLineAdjusts = (c: Cart): boolean => c.lines.some(l => !!l.adjust);
export const clearLineAdjusts = (c: Cart): Cart => (hasLineAdjusts(c) ? { ...c, lines: c.lines.map(l => (l.adjust ? { ...l, adjust: undefined } : l)) } : c);
export const setCartDiscount = (c: Cart, d?: ManualDiscount): Cart => ({ ...c, discount: d });
export const setLineDiscount = (c: Cart, id: string, d?: ManualDiscount) => patchLine(c, id, { discount: d });

/** "Merge Carts?" – lines of `from` are appended into `into` (identical plain lines consolidate). */
export function mergeCarts(into: Cart, from: Cart, consolidate = true): Cart {
  // A16.3: an "All in cart" price on either side covers that item on both, so the units can consolidate.
  const allPrices = allInCartPrices([...into.lines, ...from.lines]);
  let lines = withAllInCart([...into.lines], allPrices);
  for (const l of withAllInCart(from.lines, allPrices)) {
    const i = consolidate && l.kind === 'item'
      ? lines.findIndex(x => x.kind === 'item' && x.variantId === l.variantId && x.overrideCents === l.overrideCents && !!x.overrideAll === !!l.overrideAll && !x.discount && !l.discount && !x.note && !l.note && !x.adjust && !l.adjust) : -1;
    if (i >= 0) lines[i] = { ...lines[i], qty: lines[i].qty + l.qty }; else lines.push({ ...l, id: uid() });
  }
  // A16.7: merging can bring in line adjustments; the whole-order price no longer applies to the merged order, so it goes.
  return { ...into, lines, customer: into.customer ?? from.customer, discount: into.discount ?? from.discount, orderAdjust: lines.some(l => l.adjust) ? undefined : into.orderAdjust };
}

/** Barcode lookup with EAN/UPC leading-zero handling: 12-digit UPC-A == 13-digit EAN-13 with a leading 0, GTIN-14 etc. */
export const normaliseBarcode = (s: string) => s.trim().replace(/\s+/g, '').replace(/^0+/, '');
export function findByBarcode(variants: Iterable<Variant>, scanned: string): Variant | undefined {
  const n = normaliseBarcode(scanned); if (!n) return undefined;
  const t = scanned.trim().toLowerCase();
  for (const v of variants) {
    if (v.barcode && normaliseBarcode(v.barcode) === n) return v;
  }
  for (const v of variants) if (v.sku && v.sku.toLowerCase() === t) return v;
  return undefined;
}
