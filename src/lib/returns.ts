// Return / exchange / refund math (pure). Everything is "what the customer actually paid".
import type { Tender } from './types';

export type RefundMethod = 'original' | 'cash' | 'gift_card';
export type Refundable = { card: number; cash: number; gift_card: number };

export const returnValue = (lines: { qty: number; unitPaidCents: number }[]) => lines.reduce((s, l) => s + l.qty * l.unitPaidCents, 0);

/** return credit vs replacement items → what happens to the till */
export function exchangeSummary(returnCents: number, replacementNetCents: number): { mode: 'refund' | 'charge' | 'even'; amountCents: number } {
  const diff = replacementNetCents - returnCents;
  if (diff === 0) return { mode: 'even', amountCents: 0 };
  return diff > 0 ? { mode: 'charge', amountCents: diff } : { mode: 'refund', amountCents: -diff };
}

/** SALE minus REFUND per gateway, from the Shopify order transactions. */
export function refundableByGateway(txs: { kind: string; status: string; gateway: string; amountCents: number }[]): Refundable {
  const r: Refundable = { card: 0, cash: 0, gift_card: 0 };
  const key = (g: string): keyof Refundable | null => (g === 'Zeller' ? 'card' : g === 'Cash' ? 'cash' : g === 'Gift card' ? 'gift_card' : null);
  for (const t of txs) {
    if (t.status !== 'SUCCESS') continue;
    const k = key(t.gateway); if (!k) continue;
    if (t.kind === 'SALE') r[k] += t.amountCents; else if (t.kind === 'REFUND') r[k] -= t.amountCents;
  }
  return { card: Math.max(0, r.card), cash: Math.max(0, r.cash), gift_card: Math.max(0, r.gift_card) };
}

/** Where does `amount` go? 'original' = back to the tenders that paid (card → gift card → cash). */
export function planRefund(amount: number, method: RefundMethod, refundable: Refundable): { plan: Partial<Record<Tender['kind'], number>>; shortBy: number } {
  if (method === 'cash') return { plan: { cash: amount }, shortBy: 0 };
  if (method === 'gift_card') return { plan: { gift_card: amount }, shortBy: 0 };
  let left = amount;
  const plan: Partial<Record<Tender['kind'], number>> = {};
  for (const k of ['card', 'gift_card', 'cash'] as const) {
    const take = Math.min(left, refundable[k]);
    if (take > 0) { plan[k] = take; left -= take; }
  }
  return { plan, shortBy: left };
}

/** Spread a card refund over the original card tenders (each capped at what that card paid). */
export function splitAcrossCards(cents: number, tenders: Tender[]): { tender: Tender; cents: number }[] {
  let left = cents; const out: { tender: Tender; cents: number }[] = [];
  for (const t of tenders.filter(x => x.kind === 'card')) { const take = Math.min(left, t.amountCents); if (take > 0) { out.push({ tender: t, cents: take }); left -= take; } }
  return out;
}

