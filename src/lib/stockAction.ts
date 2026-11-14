// Location: src/lib/stockAction.ts
// 0182: the maths and rules behind "Receive, adjust or count" on a Scan result. Pure, so it can be tested without the screen.
// The Inventory screen has the same three modes; this is the same behaviour for the companion's Scan tab.
import type { AdjustReason } from './shopify/inventory';

export type StockMode = 'receive' | 'adjust' | 'count';
export const ADJUST_REASONS: AdjustReason[] = ['correction', 'damaged', 'shrinkage', 'other'];

export type StockInput = { mode: StockMode; digits: string; remove: boolean; reason: AdjustReason; current: number | null };
export type StockPlan =
  | { kind: 'adjust'; delta: number; reason: AdjustReason; next: number }
  | { kind: 'count'; quantity: number; reason: AdjustReason; next: number };

const qty = (digits: string): number => Math.min(99999, Math.max(0, Math.floor(Number(digits) || 0)));

/** What pressing Apply would do, or null when there is nothing to apply yet. */
export function planStockAction(i: StockInput): StockPlan | null {
  const cur = i.current ?? 0; const n = qty(i.digits);
  if (i.mode === 'count') return i.digits === '' ? null : { kind: 'count', quantity: n, reason: 'cycle_count_available', next: n };
  if (n === 0) return null;
  if (i.mode === 'receive') return { kind: 'adjust', delta: n, reason: 'received', next: cur + n };
  const delta = i.remove ? -n : n;
  return { kind: 'adjust', delta, reason: i.reason, next: cur + delta };
}

/** One line telling the person what will happen, shown above Apply. */
export function planSummary(p: StockPlan | null, current: number | null): string {
  if (!p) return '';
  const was = current ?? 0;
  if (p.kind === 'count') return `Count: set stock to ${p.quantity} (was ${was}).`;
  return `${p.delta > 0 ? 'Add' : 'Remove'} ${Math.abs(p.delta)}: ${was} becomes ${p.next}.`;
}

/** A retry after a dropped connection must reuse the same key so Shopify applies it only once; any change of input gets a new one. */
export function attemptKey(sig: string, last: { sig: string; key: string } | null, make: () => string): { sig: string; key: string } {
  return last && last.sig === sig ? last : { sig, key: make() };
}
export const planSignature = (variantId: string, p: StockPlan): string => `${variantId}|${p.kind}|${p.kind === 'count' ? p.quantity : p.delta}|${p.reason}`;
