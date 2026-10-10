// Location: src/lib/squareConvert.ts
// Pure: turns Square Orders API objects (as returned by the `square` Node SDK, BigInts already converted to numbers)
// into this app's SaleRecord shape. Runs on the PC export script and in tests - never inside the app, never touches Shopify.
// Money is integer cents (AUD). Square's own ids are kept in `sq` so the app can link lines to Shopify later.
import type { SaleLine, SaleRecord, Tender, TenderKind, AppliedDiscount } from './types';

type Num = number | string | bigint | null | undefined;
type Money = { amount?: Num } | null | undefined;
type SqDiscount = { uid?: string | null; name?: string | null; appliedMoney?: Money };
type SqApplied = { discountUid?: string | null; appliedMoney?: Money };
export type SqLine = {
  uid?: string | null; name?: string | null; variationName?: string | null; quantity: Num; note?: string | null; catalogObjectId?: string | null; itemType?: string;
  basePriceMoney?: Money; grossSalesMoney?: Money; totalDiscountMoney?: Money; totalMoney?: Money; appliedDiscounts?: SqApplied[] | null; modifiers?: { name?: string | null }[] | null;
};
export type SqReturnLine = Omit<SqLine, 'grossSalesMoney'> & { grossReturnMoney?: Money };
export type SqTender = {
  id?: string; type?: string; createdAt?: string; amountMoney?: Money; tipMoney?: Money; processingFeeMoney?: Money; paymentId?: string | null;
  cardDetails?: { card?: { cardBrand?: string | null; last4?: string | null } | null; entryMethod?: string | null } | null;
  cashDetails?: { buyerTenderedMoney?: Money; changeBackMoney?: Money } | null;
};
export type SqRefund = { id: string; tenderId?: string | null; createdAt?: string; reason?: string; amountMoney?: Money; status?: string };
export type SqOrder = {
  id: string; locationId: string; customerId?: string | null; state?: string; createdAt?: string; closedAt?: string; ticketName?: string | null; referenceId?: string | null;
  lineItems?: SqLine[] | null; discounts?: SqDiscount[] | null; serviceCharges?: { name?: string | null; totalMoney?: Money; appliedMoney?: Money; totalTaxMoney?: Money }[] | null;
  tenders?: SqTender[] | null; refunds?: SqRefund[] | null; roundingAdjustment?: { amountMoney?: Money } | null; totalTipMoney?: Money;
  returns?: { sourceOrderId?: string | null; returnLineItems?: SqReturnLine[] | null }[] | null;
};

/** What the export script learns from the Square catalogue, keyed by ITEM_VARIATION id. */
export type CatalogIndex = { variations: Record<string, { sku?: string; upc?: string; item: string; variation: string; category?: string }> };
export type SqContext = { catalogue: CatalogIndex; customers: Record<string, { name: string; email?: string; phone?: string }>; locations: Record<string, string> };

/** Link info kept on each historical line so the app can map it to Shopify without asking Square again. */
export type SqRef = { variationId?: string; sku?: string; upc?: string; item: string; variation: string; note?: string; category?: string };
export type HistLine = SaleLine & { sq?: SqRef };
export type HistSale = Omit<SaleRecord, 'lines'> & { lines: HistLine[]; source: 'square'; squareOrderId: string };

export const SQUARE_REGISTER_ID = 'square';
const cents = (m: Money): number => (m?.amount === undefined || m.amount === null ? 0 : Math.round(Number(m.amount)));
const isDefaultVariation = (v: string) => !v.trim() || /^regular$/i.test(v.trim());

/** `Item Name - Variant Name - Item Notes` (parts left out when empty; Square's default "Regular" variation is not repeated). */
export function customTitle(item: string, variation: string, note?: string): string {
  return [item.trim() || 'Item', isDefaultVariation(variation) ? '' : variation.trim(), note?.trim() ?? ''].filter(Boolean).join(' - ');
}

function tenderKind(type?: string): TenderKind {
  if (type === 'CASH') return 'cash';
  if (type === 'SQUARE_GIFT_CARD') return 'gift_card';
  if (type === 'CARD' || type === 'WALLET' || type === 'BUY_NOW_PAY_LATER' || type === 'SQUARE_ACCOUNT' || type === 'BANK_ACCOUNT') return 'card';
  return 'exchange_credit'; // OTHER / unknown: shown as "Exchange credit" in Reports
}
const MEDIA: Record<string, string> = { SWIPED: 'SWIPE', KEYED: 'MANUAL', EMV: 'CHIP', CONTACTLESS: 'NFC', ON_FILE: 'MANUAL' };

function convertTender(t: SqTender): Tender {
  const kind = tenderKind(t.type); const tip = cents(t.tipMoney); const total = cents(t.amountMoney);
  const out: Tender = { id: t.id ?? `sqt-${total}`, kind, amountCents: total - tip, at: t.createdAt ?? '' };
  const fee = cents(t.processingFeeMoney); if (fee) out.feeCents = fee;
  if (kind === 'card') out.card = { transactionUuid: t.paymentId ?? t.id, scheme: t.cardDetails?.card?.cardBrand ?? undefined, panMasked: t.cardDetails?.card?.last4 ?? undefined, cardMedia: MEDIA[t.cardDetails?.entryMethod ?? ''] };
  if (kind === 'cash') { out.tenderedCents = cents(t.cashDetails?.buyerTenderedMoney) || undefined; out.changeCents = cents(t.cashDetails?.changeBackMoney) || undefined; }
  return out;
}

function lineKind(l: SqLine | SqReturnLine): 'custom' | 'gift_card' { return l.itemType === 'GIFT_CARD' ? 'gift_card' : 'custom'; }

function convertLine(l: SqLine | SqReturnLine, ctx: SqContext, discounts: Map<string, string>, returned: boolean): HistLine {
  const qty = Number(l.quantity) || 1;
  const gross = returned ? cents((l as SqReturnLine).grossReturnMoney) || cents(l.basePriceMoney) * qty : cents((l as SqLine).grossSalesMoney) || cents(l.basePriceMoney) * qty;
  const disc = cents(l.totalDiscountMoney);
  const cat = l.catalogObjectId ? ctx.catalogue.variations[l.catalogObjectId] : undefined;
  const item = cat?.item || l.name || 'Custom amount'; const variation = cat?.variation ?? l.variationName ?? '';
  const mods = (l.modifiers ?? []).map(m => m.name).filter(Boolean).join(', ');
  const note = [l.note, mods].filter(Boolean).join(' · ') || undefined;
  const labels = (l.appliedDiscounts ?? []).map(a => (a.discountUid ? discounts.get(a.discountUid) : undefined)).filter((x): x is string => !!x);
  return {
    title: customTitle(item, variation, note), qty, baseUnitCents: Math.round(gross / qty), grossCents: gross, discountCents: disc, netCents: gross - disc, costCents: 0,
    discountLabels: labels, note, kind: lineKind(l),
    sq: { variationId: l.catalogObjectId ?? undefined, sku: cat?.sku || undefined, upc: cat?.upc || undefined, item, variation, note, category: cat?.category },
  };
}

const person = (ctx: SqContext, id?: string | null) => { const c = id ? ctx.customers[id] : undefined; return c ? { id: `square:${id}`, name: c.name, email: c.email, phone: c.phone } : undefined; };
const orderName = (id: string) => `Sq ${id.slice(-6).toUpperCase()}`;

function base(o: SqOrder, ctx: SqContext, uuid: string, type: 'sale' | 'refund', ts: string): Omit<HistSale, 'lines' | 'tenders'> {
  return {
    uuid, type, ts, registerId: SQUARE_REGISTER_ID, registerName: `Square${ctx.locations[o.locationId] ? ' – ' + ctx.locations[o.locationId] : ''}`, customer: person(ctx, o.customerId),
    itemsCents: 0, discountCents: 0, netCents: 0, tipCents: 0, totalCents: 0, cogsCents: 0, feesCents: 0, roundingCents: 0, deals: [], orderName: orderName(o.id),
    note: [o.ticketName, o.referenceId].filter(Boolean).join(' | ') || undefined, source: 'square', squareOrderId: o.id,
  };
}
const totals = (lines: HistLine[]) => lines.reduce((a, l) => ({ items: a.items + l.grossCents, disc: a.disc + l.discountCents }), { items: 0, disc: 0 });

/** The sale half of an order (orders that only contain a return have no line items, so return nothing). */
export function convertSale(o: SqOrder, ctx: SqContext): HistSale | null {
  if (!o.lineItems?.length) return null;
  const discounts = new Map((o.discounts ?? []).filter(d => d.uid).map(d => [d.uid as string, d.name ?? 'Discount']));
  const lines = o.lineItems.map(l => convertLine(l, ctx, discounts, false));
  for (const sc of o.serviceCharges ?? []) { const c = cents(sc.appliedMoney) || cents(sc.totalMoney) - cents(sc.totalTaxMoney); if (c) lines.push({ title: sc.name ?? 'Service charge', qty: 1, baseUnitCents: c, grossCents: c, discountCents: 0, netCents: c, costCents: 0, discountLabels: [], kind: 'custom' }); }
  const tenders = (o.tenders ?? []).map(convertTender); const t = totals(lines);
  const tip = cents(o.totalTipMoney) || (o.tenders ?? []).reduce((s, x) => s + cents(x.tipMoney), 0); const net = t.items - t.disc;
  const deals: AppliedDiscount[] = (o.discounts ?? []).map(d => ({ type: 'manual' as const, label: d.name ?? 'Discount', cents: cents(d.appliedMoney), id: d.uid ?? undefined })).filter(d => d.cents);
  return { ...base(o, ctx, `sq:${o.id}`, 'sale', o.closedAt ?? o.createdAt ?? ''), lines, tenders, itemsCents: t.items, discountCents: t.disc, netCents: net, tipCents: tip, totalCents: net + tip,
    feesCents: tenders.reduce((s, x) => s + (x.feeCents ?? 0), 0), roundingCents: cents(o.roundingAdjustment?.amountMoney), deals };
}

/**
 * Every sale and refund in a set of orders. Square records an itemised refund as its own order (with `returns`), and lists the same
 * refund on the original order too, so refund ids claimed by an itemised return are not counted a second time.
 */
export function convertAll(orders: SqOrder[], ctx: SqContext): HistSale[] {
  const out: HistSale[] = [];
  const tenderKinds = new Map<string, TenderKind>();
  for (const o of orders) for (const t of o.tenders ?? []) if (t.id) tenderKinds.set(t.id, tenderKind(t.type));
  const claimed = new Set<string>();
  for (const o of orders) if (o.returns?.length) for (const r of o.refunds ?? []) claimed.add(r.id);

  const refundTenders = (o: SqOrder, only?: SqRefund[]): Tender[] => (only ?? o.refunds ?? []).filter(r => !r.status || r.status === 'COMPLETED' || r.status === 'APPROVED').map(r => (
    { id: r.id, kind: (r.tenderId && tenderKinds.get(r.tenderId)) || 'card', amountCents: cents(r.amountMoney), at: r.createdAt ?? '' } as Tender));

  for (const o of orders) {
    if (o.state && o.state !== 'COMPLETED') continue;
    const sale = convertSale(o, ctx); if (sale) out.push(sale);
    if (o.returns?.length) {
      const discounts = new Map<string, string>(); const lines: HistLine[] = [];
      for (const r of o.returns) for (const l of r.returnLineItems ?? []) lines.push(convertLine(l, ctx, discounts, true));
      if (lines.length) {
        const t = totals(lines); const src = o.returns[0].sourceOrderId;
        out.push({ ...base(o, ctx, `sq:${o.id}:return`, 'refund', o.closedAt ?? o.createdAt ?? ''), refundOf: src ? `sq:${src}` : undefined, lines, tenders: refundTenders(o),
          itemsCents: t.items, discountCents: t.disc, netCents: t.items - t.disc, totalCents: t.items - t.disc });
      }
    }
    for (const r of o.refunds ?? []) {   // amount-only refunds (no items chosen) that no itemised return accounts for
      if (claimed.has(r.id) || (r.status && r.status !== 'COMPLETED' && r.status !== 'APPROVED')) continue;
      const amt = cents(r.amountMoney); if (!amt) continue;
      out.push({ ...base(o, ctx, `sq:${o.id}:refund:${r.id}`, 'refund', r.createdAt ?? o.closedAt ?? o.createdAt ?? ''), refundOf: `sq:${o.id}`, reason: r.reason || undefined,
        lines: [{ title: 'Refund (amount only)', qty: 1, baseUnitCents: amt, grossCents: amt, discountCents: 0, netCents: amt, costCents: 0, discountLabels: [], kind: 'custom' }],
        tenders: refundTenders(o, [r]), itemsCents: amt, netCents: amt, totalCents: amt });
    }
  }
  return out.filter(s => s.ts).sort((a, b) => a.ts.localeCompare(b.ts));
}
