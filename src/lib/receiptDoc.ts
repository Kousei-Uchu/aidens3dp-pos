// Location: src/lib/receiptDoc.ts
// Pure builder for the customer-facing receipt / tax invoice snapshot (Shopify order lines + Zeller card details).
// The snapshot is uploaded to the receipt server (receipt-server/) and rendered there as a page with PDF/PNG download.
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import type { ReceiptDoc, ReceiptPayment } from '../../receipt-server/src/types';
import { CURRENCY } from './money';
import type { SaleRecord, Tender } from './types';

export type ReceiptProfile = {
  serverUrl: string; name: string; abn: string; address: string; phone: string; email: string; website: string; returnPolicy: string;
  gstRegistered: boolean; // true → documents are titled "Tax invoice" and show GST (prices are GST-inclusive, 1/11)
};
export const defaultReceiptProfile = (): ReceiptProfile => ({ serverUrl: '', name: '', abn: '', address: '', phone: '', email: '', website: '', returnPolicy: '', gstRegistered: false });

/** Deterministic, unguessable id (80 bits) derived from the sale uuid: no extra state to store or sync. */
export const receiptId = (saleUuid: string): string => bytesToHex(sha256(utf8ToBytes(`rcpt:${saleUuid}`))).slice(0, 20);
export const receiptNumber = (id: string) => `R-${id.slice(0, 8).toUpperCase()}`;
export const receiptUrl = (base: string, id: string) => `${base.trim().replace(/\/+$/, '')}/r/${id}`;

/** GST included in a GST-inclusive total. Gift-card lines are excluded (GST applies when the card is redeemed). */
export const gstIncluded = (lines: { netCents: number; kind: string }[], registered: boolean): number =>
  registered ? Math.round(lines.filter(l => l.kind !== 'gift_card').reduce((s, l) => s + l.netCents, 0) / 11) : 0;

const last4 = (m?: string) => (m ? m.replace(/\D/g, '').slice(-4) : '');
function payment(t: Tender): ReceiptPayment {
  const amountCents = t.amountCents + (t.roundingCents ?? 0); // cash rounding is part of what was actually paid
  switch (t.kind) {
    case 'card': {
      const c = t.card; const l4 = last4(c?.panMasked);
      return { kind: 'card', label: `${c?.scheme || 'Card'}${l4 ? ` •••• ${l4}` : ''}${c?.cardMedia ? ` (${c.cardMedia})` : ''}`, amountCents,
        card: { scheme: c?.scheme, masked: c?.panMasked, approval: c?.approvalCode, rrn: c?.rrn, txn: c?.transactionUuid?.slice(0, 8), ref: c?.externalReference, at: c?.timestampLocal, link: c?.receiptLink } };
    }
    case 'cash': return { kind: 'cash', label: 'Cash', amountCents, tenderedCents: t.tenderedCents, changeCents: t.changeCents };
    case 'gift_card': return { kind: 'gift_card', label: `Gift card${t.giftCardCode ? ` ${t.giftCardCode}` : ''}`, amountCents };
    default: return { kind: 'credit', label: 'Exchange credit', amountCents };
  }
}

export function buildReceiptDoc(sale: SaleRecord, profile: ReceiptProfile, opts: { shopName?: string; tz?: string } = {}): ReceiptDoc {
  const id = receiptId(sale.uuid); const refund = sale.type === 'refund';
  const itemsCents = sale.lines.reduce((s, l) => s + l.grossCents, 0);
  const discountCents = sale.lines.reduce((s, l) => s + l.discountCents, 0);
  const totalCents = refund ? sale.totalCents : sale.totalCents + sale.roundingCents;
  return {
    v: 1, id, kind: refund ? 'refund' : 'sale', number: receiptNumber(id), order: sale.orderName, issuedAt: sale.ts, tz: opts.tz || 'Australia/Sydney', currency: CURRENCY,
    seller: { name: profile.name.trim() || opts.shopName?.trim() || 'Receipt', abn: profile.abn.trim() || undefined, address: profile.address.trim() || undefined, phone: profile.phone.trim() || undefined,
      email: profile.email.trim() || undefined, website: profile.website.trim() || undefined, returnPolicy: profile.returnPolicy.trim() || undefined, gstRegistered: profile.gstRegistered },
    register: sale.registerName, staff: sale.staff, billedTo: sale.customer?.name || undefined, refundOf: refund ? sale.orderName : undefined, reason: refund ? sale.reason : undefined,
    lines: sale.lines.map(l => ({ title: l.title, variant: l.variantTitle || undefined, qty: l.qty, unitCents: l.baseUnitCents, grossCents: l.grossCents, discountCents: l.discountCents, netCents: l.netCents,
      discounts: l.discountLabels.length ? l.discountLabels : undefined, note: l.note, gift: l.kind === 'gift_card' || undefined })),
    itemsCents, discountCents, roundingCents: refund ? 0 : sale.roundingCents, tipCents: sale.tipCents, totalCents, gstCents: gstIncluded(sale.lines, profile.gstRegistered),
    payments: sale.tenders.map(payment),
  };
}
