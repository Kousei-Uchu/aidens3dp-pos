// Location: src/lib/shopify/giftCardOnce.ts
// Shopify's giftCardDebit and giftCardCredit have no idempotency key, so a call whose reply is lost (a dropped connection after Shopify
// took it) looks like a failure, and a retry would take or give the money twice. The fix is the note: every charge and credit carries a
// reference that is the same on every retry of the same operation, and before sending one again the gift card's history is read for it.
// This file is only that decision, with no network, so tests/giftcardonce.test.ts covers it. Shopify returns a debit's amount as a
// negative number, so amounts are compared by size.
export type OnceTxn = { cents: number; note?: string; kind: 'credit' | 'debit' };

/** 'done' when a transaction of this kind with this reference already exists for this amount, 'todo' when none does. Throws when the reference exists for another amount. */
export function onceDecision(history: ReadonlyArray<OnceTxn>, kind: 'credit' | 'debit', cents: number, note: string): 'done' | 'todo' {
  const found = history.find(t => t.kind === kind && t.note === note);
  if (!found) return 'todo';
  if (Math.abs(found.cents) !== Math.abs(cents)) throw new Error(`A gift-card ${kind} with this reference already exists for a different amount. Check the card's history in Shopify before trying again.`);
  return 'done';
}

/** The reference for a gift-card payment: the Nth payment of one sale is the same on every retry, even after leaving the Payment screen. */
export const debitNote = (saleUuid: string, tenderIndex: number): string => `POS sale ${saleUuid.slice(0, 8)} tender ${tenderIndex + 1}`;
