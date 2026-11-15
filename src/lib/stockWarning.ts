// Location: src/lib/stockWarning.ts
// 0245: a built-in cart warning for stock. When Charge is pressed, any item in the sale that would be left at 0 or below in
// stock is listed, so the cashier can say so before the sale goes through. It reuses the cart warning pages, so it looks and
// behaves like the others. Pure, so the node tests pin it.
import type { Cart, CartWarning, Variant } from './types';
import type { MatchedCartWarning } from './cartWarnings';

export type StockWarningSettings = { enabled: boolean; requireAcknowledgement: boolean };
export const DEFAULT_STOCK_WARNING: StockWarningSettings = { enabled: false, requireAcknowledgement: false };
export const STOCK_WARNING_ID = 'builtin:stock';

export type StockShortfall = { variantId: string; lineIds: string[]; title: string; stock: number; qty: number; after: number };

/**
 * The tracked items this sale would leave at 0 or below. Lines for the same variation are added together. Items that are not
 * tracked (stock unknown), custom amounts and gift cards never count, and neither does an item missing from the catalogue.
 */
export function stockShortfalls(cart: Cart, variants: Record<string, Variant>): StockShortfall[] {
  const by = new Map<string, StockShortfall>();
  for (const l of cart.lines) {
    if (l.kind !== 'item' || !l.variantId || !(l.qty > 0)) continue;
    const v = variants[l.variantId]; if (!v || v.stock === null || v.stock === undefined) continue;
    const cur = by.get(l.variantId);
    if (cur) { cur.qty += l.qty; cur.lineIds.push(l.id); cur.after = cur.stock - cur.qty; continue; }
    by.set(l.variantId, { variantId: l.variantId, lineIds: [l.id], title: l.title, stock: v.stock, qty: l.qty, after: v.stock - l.qty });
  }
  return [...by.values()].filter(s => s.after <= 0);
}

/** `{{ }}` in a product name must not be read as a template when the page is drawn. */
const plain = (s: string): string => s.replace(/\{\{|\}\}/g, '');

/** One plain sentence per item: what is in stock, and what it will be after this sale. */
export function shortfallLine(s: StockShortfall): string {
  const name = plain(s.title);
  if (s.stock <= 0) return `${name}: already ${s.stock === 0 ? 'out of stock' : `${-s.stock} oversold`}, this sale leaves it at ${s.after}.`;
  return s.after === 0 ? `${name}: ${s.stock} in stock, this sale uses them all.` : `${name}: ${s.stock} in stock, this sale takes ${s.qty} and leaves it at ${s.after}.`;
}

/** The warning page for the cart, or null when it is off or nothing runs short. Shaped like a matched cart warning so the existing sheet shows it. */
export function stockWarningPage(cart: Cart, variants: Record<string, Variant>, cfg: StockWarningSettings | undefined): MatchedCartWarning | null {
  const c = { ...DEFAULT_STOCK_WARNING, ...cfg }; if (!c.enabled) return null;
  const short = stockShortfalls(cart, variants); if (!short.length) return null;
  const warning: CartWarning = {
    id: STOCK_WARNING_ID, enabled: true, title: 'Stock running out', body: short.map(shortfallLine).join('\n'),
    scope: 'variant', targetId: '', alwaysShow: false, requireAcknowledgement: c.requireAcknowledgement, mode: 'charge',
  };
  return { warning, matches: short.flatMap(s => s.lineIds.map(lineId => ({ lineId, title: s.title, variantId: s.variantId }))) };
}
