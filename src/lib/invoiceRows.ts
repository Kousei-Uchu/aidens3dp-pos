// Location: src/lib/invoiceRows.ts
// A12.8: a cart line reads like an invoice. Top row: name and price. Then the unit maths. Then one indented row per
// discount, each with its own amount on the right. A deal that applied several times on the line shows "(x2)".
import { fmt } from './money';
import type { AppliedDiscount, PricedLine } from './types';

export type InvoiceRow = { label: string; cents: number; kind: AppliedDiscount['type'] };

/** A16.1: the "Line price adjustment" row is always last (it is worked out after every other row). */
export function invoiceRows(pl: PricedLine): InvoiceRow[] {
  return pl.discounts.filter(d => d.cents !== 0).map(d => ({ label: d.times && d.times > 1 ? `${d.label} (x${d.times})` : d.label, cents: d.cents, kind: d.type }));
}

/** "13 × $4.00", with "(adjusted)" when the cashier changed the unit price. */
export const unitLine = (pl: PricedLine): string => `${pl.line.qty} × ${fmt(pl.baseUnitCents)}${pl.line.overrideCents !== undefined ? ' (adjusted)' : ''}`;
