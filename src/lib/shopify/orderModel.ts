// Location: src/lib/shopify/orderModel.ts
// Pure order model: builds the orderCreate input and maps Shopify orders. No network, no native modules (unit-tested).
import { CURRENCY, toCents, toDecimal } from '../money';
import { splitLineForOrder } from '../pricing';
import { decodeTender, encodeTender } from '../saleCodec';
import { decodeAdjustments, encodeAdjustments } from '../adjustReason';
import type { SaleAdjustment, SaleRecord, Tender } from '../types';

const money = (c: number) => ({ shopMoney: { amount: toDecimal(c), currencyCode: CURRENCY } });
export const GATEWAY: Record<Tender['kind'], string> = { card: 'Zeller', cash: 'Cash', gift_card: 'Gift card', exchange_credit: 'Exchange credit' };

// Shopify order tags are limited to 40 chars; 'pos-' + 32 hex (dashes stripped) = 36.
export const saleTag = (uuid: string) => `pos-${uuid.replace(/-/g, '')}`.slice(0, 40);

export type OrderCtx = { locationId?: string; markFulfilled: boolean };

export function buildOrderInput(sale: SaleRecord, ctx: OrderCtx) {
  const lineItems: any[] = [];
  for (const l of sale.lines) {
    const props: { name: string; value: string }[] = [];
    if (l.baseUnitCents !== Math.round(l.netCents / Math.max(1, l.qty))) props.push({ name: '_pos_unit_price', value: toDecimal(l.baseUnitCents) });
    if (l.discountLabels.length) props.push({ name: '_pos_discount', value: l.discountLabels.join(', ').slice(0, 200) });
    if (l.costCents) props.push({ name: '_pos_cost', value: toDecimal(Math.round(l.costCents / Math.max(1, l.qty))) }); // PER-UNIT cost (parts of a split line share props)
    if (l.note) props.push({ name: 'Note', value: l.note.slice(0, 200) });
    if (l.giftCardCode) props.push({ name: '_pos_gift_card', value: `••••${l.giftCardCode.slice(-4)}` });
    for (const part of splitLineForOrder(l.netCents, l.qty)) {
      const base: any = { quantity: part.qty, priceSet: money(part.unitCents), requiresShipping: false, taxable: false };
      if (props.length) base.properties = props;
      if (l.variantId) lineItems.push({ ...base, variantId: l.variantId });
      else lineItems.push({ ...base, title: l.kind === 'gift_card' ? 'Gift card' : l.title });
    }
  }
  const transactions = sale.tenders.map(t => ({
    kind: 'SALE', status: 'SUCCESS', gateway: GATEWAY[t.kind], amountSet: money(t.amountCents), processedAt: t.card?.timestampLocal ?? t.at ?? sale.ts,
    ...(t.card?.approvalCode ? { authorizationCode: t.card.approvalCode } : {}),
    ...(t.card ? { receiptJson: JSON.stringify({ transactionUuid: t.card.transactionUuid, externalReference: t.card.externalReference, rrn: t.card.rrn, scheme: t.card.scheme, panMasked: t.card.panMasked, cardMedia: t.card.cardMedia, receiptLink: t.card.receiptLink }) } : {}),
  }));
  const attrs: { key: string; value: string }[] = [
    { key: 'pos_sale_uuid', value: sale.uuid }, { key: 'pos_register', value: sale.registerName }, { key: 'pos_staff', value: sale.staff ?? '' },
    { key: 'pos_rounding_cents', value: String(sale.roundingCents) }, { key: 'pos_cogs_cents', value: String(sale.cogsCents) }, { key: 'pos_fees_cents', value: String(sale.feesCents) },
    { key: 'pos_deals', value: sale.deals.map(d => `${d.label}:${-d.cents}`).join('; ').slice(0, 240) }, { key: 'pos_receipt_link', value: sale.receiptLink ?? '' },
    ...(sale.adjustments?.length ? [{ key: 'pos_adjustments', value: encodeAdjustments(sale.adjustments) }] : []),
    ...sale.tenders.map((t, i) => ({ key: `pos_tender_${i + 1}`, value: encodeTender(t) })),
  ].filter(a => a.value !== '');
  const order: any = {
    currency: CURRENCY, sourceName: 'custom-pos', financialStatus: 'PAID', processedAt: sale.ts, test: false,
    lineItems, transactions, customAttributes: attrs, tags: ['pos', saleTag(sale.uuid)],
    ...(sale.note ? { note: sale.note } : {}),
    ...(sale.customer ? { customer: { toAssociate: { id: sale.customer.id } } } : {}),
    ...(ctx.markFulfilled && ctx.locationId ? { fulfillment: { locationId: ctx.locationId, notifyCustomer: false } } : {}),
  };
  const options = { inventoryBehaviour: 'DECREMENT_IGNORING_POLICY', sendReceipt: false, sendFulfillmentReceipt: false };
  return { order, options };
}


// ── reading orders ───────────────────────────────────────────────────────────
export type PosOrderLine = { id: string; title: string; variantTitle?: string; qty: number; refundableQty: number; unitCents: number; originalUnitCents: number; variantId?: string; costCents: number; discount?: string };
export type PosOrder = {
  id: string; name: string; createdAt: string; financial: string; fulfillment: string; totalCents: number; refundedCents: number;
  note?: string; tags: string[]; customer?: { id: string; name: string; email?: string; phone?: string };
  attrs: Record<string, string>; lines: PosOrderLine[]; tenders: Tender[]; saleUuid?: string; receiptLink?: string;
  transactions: { id: string; kind: string; status: string; gateway: string; amountCents: number }[];
  registerName?: string; staff?: string; roundingCents: number;
  /** A16.8: the price adjustments made on the sale, with reasons (read from the pos_adjustments attribute). */
  adjustments?: SaleAdjustment[];
};

export function mapOrder(n: any): PosOrder {
  const attrs: Record<string, string> = {};
  for (const a of n.customAttributes ?? []) attrs[a.key] = a.value;
  const tenders = Object.keys(attrs).filter(k => /^pos_tender_\d+$/.test(k)).sort().map(k => decodeTender(attrs[k], n.createdAt)).filter(Boolean) as Tender[];
  return {
    id: n.id, name: n.name, createdAt: n.createdAt, financial: n.displayFinancialStatus, fulfillment: n.displayFulfillmentStatus,
    totalCents: toCents(n.totalPriceSet.shopMoney.amount), refundedCents: toCents(n.totalRefundedSet.shopMoney.amount),
    note: n.note || undefined, tags: n.tags ?? [], attrs, tenders, saleUuid: attrs.pos_sale_uuid, receiptLink: attrs.pos_receipt_link || tenders.find(t => t.card?.receiptLink)?.card?.receiptLink,
    customer: n.customer ? { id: n.customer.id, name: n.customer.displayName, email: n.customer.email ?? undefined, phone: n.customer.phone ?? undefined } : undefined,
    registerName: attrs.pos_register, staff: attrs.pos_staff, roundingCents: Number(attrs.pos_rounding_cents ?? 0), adjustments: decodeAdjustments(attrs.pos_adjustments),
    lines: n.lineItems.nodes.map((l: any): PosOrderLine => {
      const props: Record<string, string> = {};
      for (const p of l.customAttributes ?? []) props[p.key] = p.value;
      return {
        id: l.id, title: l.title, variantTitle: l.variantTitle || undefined, qty: l.quantity, refundableQty: l.refundableQuantity,
        unitCents: toCents(l.discountedUnitPriceSet.shopMoney.amount), originalUnitCents: props._pos_unit_price ? toCents(props._pos_unit_price) : toCents(l.originalUnitPriceSet.shopMoney.amount),
        variantId: l.variant?.id, costCents: props._pos_cost ? toCents(props._pos_cost) : 0, discount: props._pos_discount,
      };
    }),
    transactions: n.transactions.map((t: any) => ({ id: t.id, kind: t.kind, status: t.status, gateway: t.gateway, amountCents: toCents(t.amountSet.shopMoney.amount) })),
  };
}

