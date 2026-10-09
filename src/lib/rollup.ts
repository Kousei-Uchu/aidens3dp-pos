// Daily rollups + report maths (research doc §7). Pure and unit-tested.
//   Net Sales      = Items − Returns − Discounts            (tax is 0 for this shop)
//   Total Collected= Net Sales + Tips + Gift-card sales − other refunds
//   Net after fees = Total Collected − Fees                  (separate metric)
//   Gross profit   = Net Sales − COGS                        (COGS never subtracted from Net Total)
import type { SaleRecord } from './types';

export type Bucket = { count: number; grossCents: number };
export type Totals = {
  orders: number; refunds: number; itemsCents: number; discountsCents: number; returnsCents: number; giftCardSalesCents: number; otherRefundsCents: number;
  tipsCents: number; feesCents: number; cogsCents: number; roundingCents: number;
  tenders: Record<string, number>; refundTenders: Record<string, number>; byCategory: Record<string, Bucket>; byItem: Record<string, Bucket>; applied: string[];
};
export const emptyTotals = (): Totals => ({
  orders: 0, refunds: 0, itemsCents: 0, discountsCents: 0, returnsCents: 0, giftCardSalesCents: 0, otherRefundsCents: 0, tipsCents: 0, feesCents: 0, cogsCents: 0, roundingCents: 0,
  tenders: {}, refundTenders: {}, byCategory: {}, byItem: {}, applied: [],
});

const bump = (m: Record<string, Bucket>, k: string, count: number, gross: number) => {
  const b = (m[k] ??= { count: 0, grossCents: 0 }); b.count += count; b.grossCents += gross;
};
const add = (m: Record<string, number>, k: string, v: number) => { m[k] = (m[k] ?? 0) + v; };

/** What one sale/refund record adds to the day's totals. */
export function contribution(r: SaleRecord): Totals {
  const t = emptyTotals();
  t.applied = [r.uuid];
  const sign = r.type === 'sale' ? 1 : -1;
  for (const l of r.lines) {
    if (l.kind === 'gift_card') { if (r.type === 'sale') t.giftCardSalesCents += l.netCents; continue; }
    if (r.type === 'sale') { t.itemsCents += l.grossCents; t.discountsCents += l.discountCents; }
    else t.returnsCents += l.netCents;
    t.cogsCents += sign * l.costCents;
    const cat = l.collectionTitles?.[0] ?? 'Uncategorised';
    bump(t.byCategory, cat, sign * l.qty, sign * l.grossCents);
    bump(t.byItem, l.variantTitle ? `${l.title} – ${l.variantTitle}` : l.title, sign * l.qty, sign * l.grossCents);
  }
  if (r.type === 'sale') {
    t.orders = 1; t.tipsCents = r.tipCents; t.feesCents = r.feesCents; t.roundingCents = r.roundingCents;
    for (const x of r.tenders) add(t.tenders, x.kind, x.amountCents);
  } else {
    t.refunds = 1;
    const paidOut = r.tenders.filter(x => x.kind !== 'exchange_credit').reduce((s, x) => s + x.amountCents, 0);
    t.otherRefundsCents = Math.max(0, paidOut - t.returnsCents);
    t.feesCents = r.feesCents; // negative only when "refundReturnsFee" is on
    for (const x of r.tenders) add(t.refundTenders, x.kind, x.amountCents);
  }
  return t;
}

export function merge(a: Totals, b: Totals): Totals {
  const m = emptyTotals();
  for (const k of ['orders', 'refunds', 'itemsCents', 'discountsCents', 'returnsCents', 'giftCardSalesCents', 'otherRefundsCents', 'tipsCents', 'feesCents', 'cogsCents', 'roundingCents'] as const) m[k] = a[k] + b[k];
  for (const src of [a, b]) {
    for (const [k, v] of Object.entries(src.tenders)) add(m.tenders, k, v);
    for (const [k, v] of Object.entries(src.refundTenders)) add(m.refundTenders, k, v);
    for (const [k, v] of Object.entries(src.byCategory)) bump(m.byCategory, k, v.count, v.grossCents);
    for (const [k, v] of Object.entries(src.byItem)) bump(m.byItem, k, v.count, v.grossCents);
  }
  m.applied = [...a.applied, ...b.applied];
  return m;
}

/** Idempotent: a record already applied to this rollup is ignored. */
export function applyRecord(t: Totals, r: SaleRecord): Totals {
  return t.applied.includes(r.uuid) ? t : merge(t, contribution(r));
}

export function derived(t: Totals) {
  const netSales = t.itemsCents - t.returnsCents - t.discountsCents;
  const totalCollected = netSales + t.tipsCents + t.giftCardSalesCents - t.otherRefundsCents;
  return {
    grossSales: t.itemsCents, discounts: t.discountsCents, refunds: t.returnsCents, netSales, totalCollected,
    fees: t.feesCents, netAfterFees: totalCollected - t.feesCents, cogs: t.cogsCents, grossProfit: netSales - t.cogsCents,
    avgSale: t.orders ? Math.round(netSales / t.orders) : 0,
  };
}

// ── periods ──────────────────────────────────────────────────────────────────
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const rollupKey = (registerId: string, ts: string | Date) => `${registerId}|${dayKey(typeof ts === 'string' ? new Date(ts) : ts)}`;
export const parseDay = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export type Period = '1D' | '1W' | '1M' | '3M' | '1Y';
export type Range = { from: string; to: string }; // inclusive YYYY-MM-DD
export function periodRange(p: Period, anchor: Date = new Date()): Range {
  const to = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const from = p === '1D' ? to : p === '1W' ? addDays(to, -6) : p === '1M' ? addDays(to, -29) : p === '3M' ? addDays(to, -89) : addDays(to, -364);
  return { from: dayKey(from), to: dayKey(to) };
}
const spanDays = (r: Range) => Math.round((parseDay(r.to).getTime() - parseDay(r.from).getTime()) / 86400000) + 1;
export const previousRange = (r: Range): Range => { const n = spanDays(r); return { from: dayKey(addDays(parseDay(r.from), -n)), to: dayKey(addDays(parseDay(r.from), -1)) }; };
export const lastYearRange = (r: Range): Range => {
  const f = parseDay(r.from), t = parseDay(r.to);
  return { from: dayKey(new Date(f.getFullYear() - 1, f.getMonth(), f.getDate())), to: dayKey(new Date(t.getFullYear() - 1, t.getMonth(), t.getDate())) };
};

export type RollupRow = { registerId: string; date: string; totals: Totals };
export function sumRange(rows: RollupRow[], r: Range, registerId?: string): Totals {
  return rows.filter(x => x.date >= r.from && x.date <= r.to && (!registerId || x.registerId === registerId)).reduce((a, x) => merge(a, x.totals), emptyTotals());
}
export const pctChange = (now: number, before: number) => (before === 0 ? (now === 0 ? 0 : null) : ((now - before) / Math.abs(before)) * 100);
