// Location: src/lib/assistantCashIO.ts
// Takes the snapshot the assistant's cash and cart tools read (patch 0172). The only file that connects them to the store; everything
// the tools do with it is in assistantCash.ts. It only reads: the drawer ledger, the shift and the cart are copied by reference into a
// plain `CashState` and the tools never get anything they could call to change them. Nothing here goes to Shopify or the card reader.
import { useApp } from '../state/store';
import { isTraining } from './trainingGuard';
import { priceCart } from './pricing';
import { bundleConfig } from './sync';
import { matchCartWarnings } from './cartWarnings';
import type { Variant } from './types';
import type { CashState } from './assistantCash';

/**
 * The drawer and the cart as they are now, or null while the till is on practice data (the assistant is switched off in practice
 * mode, and this is a second lock: the practice drawer and cart must never be described as the shop's, and the calculators are off in
 * practice mode, plan 3.7). Called when a question is asked. A fault while pricing the cart gives null, so the tools say they could
 * not read the till and never guess.
 */
export function takeCashState(now: number = Date.now()): CashState | null {
  if (isTraining()) return null;
  try {
    const s = useApp.getState(); const st = s.settings; const cart = s.pos.cart;
    const variants = s.data.variants; const collectionsOfProduct: Record<string, string[]> = {};
    for (const c of s.data.collections) for (const p of c.productIds) (collectionsOfProduct[p] ??= []).push(c.id);
    const priced = priceCart(cart, { variants, collectionsOfProduct, autoDiscounts: s.data.autos, bundles: bundleConfig() });
    const warnings = matchCartWarnings(cart, st.cartWarnings, { variants, collectionsOfProduct });
    return {
      now, rounding: !!st.cashRounding,
      drawer: { shift: s.pos.shift, ledger: s.pos.ledger, sales: s.pos.sales, prices: Object.values(variants).map((v: Variant) => v.priceCents) },
      cart: { cart, priced, warnings },
    };
  } catch { return null; }
}
