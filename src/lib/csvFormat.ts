// Pure CSV formatting for the local, never-auto-cleared log (research doc §7).
import { toDecimal } from './money';
import type { SaleRecord } from './types';

export const q = (v: unknown): string => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const line = (vals: unknown[]) => vals.map(q).join(',') + '\n';

export const SALES_HEADER = ['sale_uuid', 'shopify_order_gid', 'shopify_order_name', 'register_id', 'employee', 'timestamp_iso', 'type', 'customer', 'items_count', 'gross_items', 'discounts', 'net_sales', 'tax', 'tip', 'total', 'tender_summary', 'fees_estimated', 'net_after_fees', 'cogs', 'gross_profit', 'status', 'zeller_refs', 'rounding_adjustment', 'notes'];
export const LINES_HEADER = ['sale_uuid', 'line_no', 'type', 'title', 'variant', 'qty', 'unit_price', 'gross', 'discount', 'net', 'cogs', 'discounts_applied', 'note'];
export const EVENTS_HEADER = ['timestamp_iso', 'kind', 'sale_uuid', 'reference', 'amount', 'code', 'message', 'employee', 'detail'];

const d = (c: number) => toDecimal(c);

export function salesRow(r: SaleRecord, status = 'complete'): string {
  const sign = r.type === 'refund' ? -1 : 1;
  const net = sign * (r.itemsCents - r.discountCents);
  const tenders = r.tenders.map(t => `${t.kind}:${d(t.amountCents)}${t.card?.scheme ? `(${t.card.scheme}${t.card.panMasked ? ' ' + t.card.panMasked : ''})` : ''}`).join(' + ');
  const total = sign * r.totalCents;
  return line([r.uuid, r.orderGid, r.orderName, r.registerId, r.staff, r.ts, r.type, r.customer?.name, r.lines.reduce((s, l) => s + l.qty, 0), d(sign * r.itemsCents), d(sign * r.discountCents), d(net), '0.00', d(r.tipCents),
    d(total), tenders, d(r.feesCents), d(total - r.feesCents), d(sign * r.cogsCents), d(net - sign * r.cogsCents), status,
    r.tenders.map(t => t.card?.externalReference).filter(Boolean).join(' '), d(r.roundingCents), [r.note, r.reason].filter(Boolean).join(' | ')]);
}
export function linesRows(r: SaleRecord): string {
  return r.lines.map((l, i) => line([r.uuid, i + 1, r.type, l.title, l.variantTitle, l.qty, d(l.baseUnitCents), d(l.grossCents), d(l.discountCents), d(l.netCents), d(l.costCents), l.discountLabels.join('; '), l.note])).join('');
}
export type EventKind = 'declined' | 'unknown_payment' | 'unknown_resolved' | 'void' | 'override' | 'error' | 'paid_in' | 'paid_out' | 'shift_open' | 'shift_close' | 'no_sale' | 'cancelled' | 'refund_failed' | 'staff_switch';
export function eventRow(e: { ts?: string; kind: EventKind; saleUuid?: string; reference?: string; amountCents?: number; code?: string; message?: string; staff?: string; detail?: string }): string {
  return line([e.ts ?? new Date().toISOString(), e.kind, e.saleUuid, e.reference, e.amountCents === undefined ? '' : d(e.amountCents), e.code, e.message, e.staff, e.detail]);
}
