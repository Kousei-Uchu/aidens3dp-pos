// Location: src/lib/cartOps.ts
// Pure cart operations (immutable). The store just calls these.
import { uid } from './ids';
import { NO_DISCOUNT_TAG } from './pricing';
import type { Cart, CartLine, GiftRecipient, ManualDiscount, Variant } from './types';

export const emptyCart = (): Cart => ({ id: uid(), lines: [] });
export const itemCount = (c: Cart) => c.lines.reduce((s, l) => s + l.qty, 0);

const sameLine = (l: CartLine, v: Variant) =>
  l.kind === 'item' && l.variantId === v.id && l.overrideCents === undefined && !l.discount && !l.note;

export function addVariant(c: Cart, v: Variant, qty = 1, consolidate = true): Cart {
  const idx = consolidate ? c.lines.findIndex(l => sameLine(l, v)) : -1;
  if (idx >= 0) return { ...c, lines: c.lines.map((l, i) => (i === idx ? { ...l, qty: l.qty + qty } : l)) };
  const line: CartLine = {
    id: uid(), kind: 'item', variantId: v.id, title: v.productTitle, variantTitle: v.variantTitle || undefined, qty, unitCents: v.priceCents,
    noDiscount: v.tags.some(t => t.toLowerCase() === NO_DISCOUNT_TAG) || undefined,
  };
  return { ...c, lines: [...c.lines, line] };
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
  patchLine(c, id, { variantId: v.id, variantTitle: v.variantTitle || undefined, unitCents: v.priceCents, overrideCents: undefined });
export const setCartDiscount = (c: Cart, d?: ManualDiscount): Cart => ({ ...c, discount: d });
export const setLineDiscount = (c: Cart, id: string, d?: ManualDiscount) => patchLine(c, id, { discount: d });

/** "Merge Carts?" – lines of `from` are appended into `into` (identical plain lines consolidate). */
export function mergeCarts(into: Cart, from: Cart, consolidate = true): Cart {
  let lines = [...into.lines];
  for (const l of from.lines) {
    const i = consolidate && l.kind === 'item'
      ? lines.findIndex(x => x.kind === 'item' && x.variantId === l.variantId && x.overrideCents === l.overrideCents && !x.discount && !l.discount && !x.note && !l.note) : -1;
    if (i >= 0) lines[i] = { ...lines[i], qty: lines[i].qty + l.qty }; else lines.push({ ...l, id: uid() });
  }
  return { ...into, lines, customer: into.customer ?? from.customer, discount: into.discount ?? from.discount };
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
