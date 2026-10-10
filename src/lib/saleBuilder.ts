// Location: src/lib/saleBuilder.ts
// Pure helpers that turn a priced cart + tenders into the SaleRecord every other module consumes.
import { saleAdjustments } from './adjustReview';
import { roundCash } from './money';
import { feeFor, type FeeSettings } from './fees';
import { txnToCard, type ZellerTxn } from './zeller';
import { uid } from './ids';
import type { Cart, PricedCart, SaleLine, SaleRecord, Tender, Variant, Collection } from './types';

export function collectionTitlesByProduct(collections: Collection[]): Record<string, string[]> {
  const m: Record<string, string[]> = {};
  for (const c of collections) for (const p of c.productIds) (m[p] ??= []).push(c.title);
  return m;
}

export function buildSale(a: {
  uuid: string; cart: Cart; priced: PricedCart; variants: Record<string, Variant>; titles: Record<string, string[]>;
  tenders: Tender[]; registerId: string; registerName: string; staff?: string; ts?: string; reason?: string;
}): SaleRecord {
  const lines: SaleLine[] = a.priced.lines.map(pl => {
    const v = pl.line.variantId ? a.variants[pl.line.variantId] : undefined;
    return {
      variantId: pl.line.variantId, title: pl.line.title, variantTitle: pl.line.variantTitle, qty: pl.line.qty, baseUnitCents: pl.baseUnitCents,
      grossCents: pl.grossCents, discountCents: pl.discountCents, netCents: pl.netCents, costCents: (v?.costCents ?? 0) * pl.line.qty,
      discountLabels: pl.discounts.map(d => d.label), note: pl.line.note, kind: pl.line.kind, giftCardCode: pl.line.giftCardCode, giftRecipient: pl.line.giftRecipient,
      collectionTitles: v ? a.titles[v.productId] : undefined,
    };
  });
  const adjustments = saleAdjustments(a.cart, a.priced);
  const feesCents = a.tenders.reduce((s, t) => s + (t.feeCents ?? 0), 0);
  return {
    uuid: a.uuid, type: 'sale', ts: a.ts ?? new Date().toISOString(), registerId: a.registerId, registerName: a.registerName, staff: a.staff,
    customer: a.cart.customer, lines, itemsCents: a.priced.itemsCents, discountCents: a.priced.discountCents, netCents: a.priced.netCents, tipCents: 0,
    totalCents: a.priced.netCents, cogsCents: lines.reduce((s, l) => s + l.costCents, 0), feesCents,
    roundingCents: a.tenders.reduce((s, t) => s + (t.roundingCents ?? 0), 0), tenders: a.tenders, deals: a.priced.deals, ...(adjustments.length ? { adjustments } : {}), note: a.cart.note, reason: a.reason,
    receiptLink: a.tenders.find(t => t.card?.receiptLink)?.card?.receiptLink,
  };
}

export const paidTotal = (tenders: Tender[]) => tenders.reduce((s, t) => s + t.amountCents, 0);
export const remainingDue = (total: number, tenders: Tender[]) => Math.max(0, total - paidTotal(tenders));

export function cardTender(txn: ZellerTxn, amountCents: number, fees: FeeSettings): Tender {
  const f = feeFor(amountCents, txn.cardMedia, fees);
  return { id: txn.externalReference ?? uid(), kind: 'card', amountCents, card: txnToCard(txn), feeCents: f.cents, feeRate: f.rate, at: new Date().toISOString() };
}

/**
 * Cash tender with 5c rounding applied to the cash-DUE amount only (card amounts stay exact).
 * If the customer hands over at least the (rounded) due amount, the bill settles; otherwise it's a part-payment.
 */
export function cashTender(remainingCents: number, tenderedCents: number, rounding: boolean): { tender: Tender; settles: boolean } {
  const due = rounding ? roundCash(remainingCents) : remainingCents;
  const at = new Date().toISOString();
  if (tenderedCents >= due) {
    return { settles: true, tender: { id: uid(), kind: 'cash', amountCents: remainingCents, tenderedCents, changeCents: tenderedCents - due, roundingCents: due - remainingCents, at } };
  }
  return { settles: false, tender: { id: uid(), kind: 'cash', amountCents: tenderedCents, tenderedCents, changeCents: 0, roundingCents: 0, at } };
}

/** Cash chips: nearest sensible note denominations above the due amount. */
export function cashChips(dueCents: number): number[] {
  const notes = [500, 1000, 2000, 5000, 10000];
  const out = new Set<number>();
  for (const n of notes) { const up = Math.ceil(dueCents / n) * n; if (up >= dueCents) out.add(up); }
  const above = [...out].sort((a, b) => a - b).filter(v => v !== dueCents);
  return above.slice(0, 4);
}
