// Location: src/lib/simpleLabels.ts
// Plain-English wording for Simple mode (and anyone with "explanations" on) inside Checkout, Cart, Pay and Cash (B5c).
// With explanations off every function returns today's wording, so Standard mode reads exactly as before.
import { fmt } from './money';

export type PayMethod = 'card' | 'cash' | 'gift' | 'split';
export function payTitle(m: PayMethod, explain: boolean, targetCents: number): string {
  if (!explain) return m === 'card' ? `Card — ${fmt(targetCents)}` : m === 'cash' ? 'Cash' : m === 'gift' ? 'Gift card' : 'Split amount';
  return m === 'card' ? `Pay by card  ${fmt(targetCents)}` : m === 'cash' ? 'Pay with cash' : m === 'gift' ? 'Pay with a gift card' : 'Split the payment';
}
const PAY_HINT: Record<PayMethod, string> = {
  card: 'The customer taps, inserts or swipes their card on the reader.',
  cash: 'Tap the notes and coins they hand you. The change is worked out for you.',
  gift: 'Scan or type the gift card code. Whatever is on the card is used.',
  split: 'Take part of the bill now and the rest another way, or split it equally between people.',
};
/** The line under a payment button, or nothing when explanations are off. */
export const payHint = (m: PayMethod, explain: boolean): string | undefined => (explain ? PAY_HINT[m] : undefined);
export const PAY_QUESTION = 'How is the customer paying?';
export const payQuestion = (explain: boolean, remainingOwed: boolean): string | undefined => (explain && remainingOwed ? PAY_QUESTION : undefined);

export const qtyHint = (explain: boolean): string | undefined => (explain ? 'Pick how many first (×2, ×3 …), then tap an item. It goes straight into the cart.' : undefined);
export const cartEmptyText = (explain: boolean): string => (explain ? 'Nothing in the cart yet. Tap an item, or scan one, to start the sale.' : 'Cart is empty');
export const customerRowText = (explain: boolean, name?: string, has?: boolean): string => name || (has ? 'Customer' : explain ? 'Add a customer (optional)' : 'Add customer');
export const chargeHint = (explain: boolean): string | undefined => (explain ? 'Charge takes you to the payment screen. Nothing is taken until the customer pays.' : undefined);
export const cashHint = (explain: boolean): string | undefined => (explain ? 'Tap each note and coin the customer hands you. The screen works out the change and which notes and coins to give back.' : undefined);
