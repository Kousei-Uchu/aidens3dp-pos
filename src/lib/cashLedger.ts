// Location: src/lib/cashLedger.ts
// B1a: what notes and coins are physically in the drawer, and the tap-to-enter / undo logic used by the denomination pad.
// All amounts are integer cents. A `Counts` map is {"2000": 3} = three $20 notes; the same shape findCombinations() takes.
// Pure (no React, no store), unit-tested in tests/cashledger.test.ts.
import { uid } from './ids';

export type Denom = { cents: number; label: string; kind: 'note' | 'coin' };
/** Australian notes and coins, largest first. There is no 1c or 2c coin; 5c is the smallest (cash is rounded to 5c). */
export const DENOMS: readonly Denom[] = [
  { cents: 10000, label: '$100', kind: 'note' }, { cents: 5000, label: '$50', kind: 'note' }, { cents: 2000, label: '$20', kind: 'note' },
  { cents: 1000, label: '$10', kind: 'note' }, { cents: 500, label: '$5', kind: 'note' },
  { cents: 200, label: '$2', kind: 'coin' }, { cents: 100, label: '$1', kind: 'coin' }, { cents: 50, label: '50c', kind: 'coin' },
  { cents: 20, label: '20c', kind: 'coin' }, { cents: 10, label: '10c', kind: 'coin' }, { cents: 5, label: '5c', kind: 'coin' },
];
export const denomLabel = (cents: number): string => DENOMS.find(d => d.cents === cents)?.label ?? `${cents}c`;

export type Counts = Record<string, number>;
const k = (cents: number) => String(cents);

export const totalOf = (c: Counts): number => Object.entries(c).reduce((s, [v, n]) => s + Number(v) * n, 0);
export const countOf = (c: Counts, cents: number): number => c[k(cents)] ?? 0;
/** Drops zeros and anything that is not a whole number of a positive denomination. */
export function cleanCounts(c: Counts): Counts {
  const out: Counts = {};
  for (const [v, n] of Object.entries(c)) if (Number(v) > 0 && Number.isInteger(n) && n !== 0) out[v] = n;
  return out;
}
export function addCounts(a: Counts, b: Counts): Counts {
  const out: Counts = { ...a }; for (const [v, n] of Object.entries(b)) out[v] = (out[v] ?? 0) + n; return cleanCounts(out);
}
/** to − from, per denomination (can be negative). */
export function diffCounts(to: Counts, from: Counts): Counts {
  const out: Counts = { ...to }; for (const v of new Set([...Object.keys(to), ...Object.keys(from)])) out[v] = (to[v] ?? 0) - (from[v] ?? 0); return cleanCounts(out);
}
/** "2 × $20, 1 × $5" largest first. Negative counts print as "-2 × $20". Empty → "nothing". */
export function summariseCounts(c: Counts): string {
  const parts = Object.entries(cleanCounts(c)).sort((a, b) => Number(b[0]) - Number(a[0])).map(([v, n]) => `${n} × ${denomLabel(Number(v))}`);
  return parts.length ? parts.join(', ') : 'nothing';
}
/** Denominations where `take` asks for more than `have` holds. */
export function shortfall(have: Counts, take: Counts): { cents: number; have: number; need: number }[] {
  return Object.entries(cleanCounts(take)).filter(([v, n]) => n > 0 && n > (have[v] ?? 0)).map(([v, n]) => ({ cents: Number(v), have: have[v] ?? 0, need: n })).sort((a, b) => b.cents - a.cents);
}

// ── tap entry with undo ──────────────────────────────────────────────────────
/** One tap on the pad: n > 0 adds, n < 0 removes. A draft is the list of taps so far, so every step can be undone. */
export type Tap = { cents: number; n: number };
export type Draft = Tap[];
/** The counts shown while entering: `base` (what was already there, for open/adjust) plus every tap. Never below zero. */
export function draftCounts(d: Draft, base: Counts = {}): Counts {
  const out: Counts = { ...base };
  for (const t of d) out[k(t.cents)] = Math.max(0, (out[k(t.cents)] ?? 0) + t.n);
  return cleanCounts(out);
}
/** Add (n > 0) or remove (n < 0) notes or coins. Removing more than are there removes what is there; removing from zero changes nothing (returns the same draft). */
export function tapDenom(d: Draft, base: Counts, cents: number, n: number): Draft {
  if (!Number.isInteger(n) || n === 0) return d;
  const have = countOf(draftCounts(d, base), cents);
  const eff = n < 0 ? -Math.min(have, -n) : n;
  return eff === 0 ? d : [...d, { cents, n: eff }];
}
/** Takes back the most recent tap. `undone` says what was reversed, so the screen can tell the cashier what changed. */
export function undoLast(d: Draft): { draft: Draft; undone?: Tap } {
  return d.length ? { draft: d.slice(0, -1), undone: d[d.length - 1] } : { draft: d };
}
/** "Added 2 × $20 ($40.00)" / "Removed $5 ($5.00)". Pass `undo` to word it as the reverse. */
export function describeTap(t: Tap, undo = false): string {
  const added = (t.n > 0) !== undo; const n = Math.abs(t.n); const cents = t.cents * n;
  const money = `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
  return `${added ? 'Added' : 'Removed'} ${n > 1 ? `${n} × ` : ''}${denomLabel(t.cents)} (${money})`;
}

// ── the ledger ───────────────────────────────────────────────────────────────
export type LedgerKind = 'open' | 'paid_in' | 'paid_out' | 'adjust' | 'close' | 'sale_in' | 'sale_change';
export const LEDGER_LABEL: Record<LedgerKind, string> = { open: 'Opened drawer', paid_in: 'Paid in', paid_out: 'Paid out', adjust: 'Contents corrected', close: 'Counted at close', sale_in: 'Cash received', sale_change: 'Change given' };
/** delta: what changed in the drawer (positive = went in, negative = came out). */
export type LedgerEntry = { id: string; ts: string; kind: LedgerKind; delta: Counts; staff?: string; note?: string; saleUuid?: string };
/** `counts` is what the drawer holds now; `entries` is the history, newest first. */
export type CashLedger = { counts: Counts; entries: LedgerEntry[] };
export const MAX_ENTRIES = 1000;
export const emptyLedger = (): CashLedger => ({ counts: {}, entries: [] });

export function newEntry(kind: LedgerKind, delta: Counts, o: { staff?: string; note?: string; saleUuid?: string; ts?: string } = {}): LedgerEntry {
  const e: LedgerEntry = { id: uid(), ts: o.ts ?? new Date().toISOString(), kind, delta: cleanCounts(delta) };
  if (o.staff) e.staff = o.staff; if (o.note) e.note = o.note; if (o.saleUuid) e.saleUuid = o.saleUuid; // no undefined keys, so a saved copy equals the original
  return e;
}
/**
 * Records an entry and moves the counts by its delta. The counts never go below zero: if the ledger did not know about
 * a note that came out, the count stops at 0 rather than showing "-1 × $5" (the entry itself keeps what was entered).
 */
export function applyEntry(l: CashLedger, e: LedgerEntry): CashLedger {
  const counts: Counts = { ...l.counts };
  for (const [v, n] of Object.entries(e.delta)) counts[v] = Math.max(0, (counts[v] ?? 0) + n);
  return { counts: cleanCounts(counts), entries: [e, ...l.entries].slice(0, MAX_ENTRIES) };
}
export const entryTotal = (e: LedgerEntry): number => totalOf(e.delta);
/** Older saved state, or something unreadable, becomes an empty ledger. */
export function readLedger(raw: unknown): CashLedger {
  const r = raw as any;
  if (!r || typeof r !== 'object' || typeof r.counts !== 'object' || !Array.isArray(r.entries)) return emptyLedger();
  return { counts: cleanCounts(r.counts), entries: r.entries.filter((e: any) => e && typeof e.id === 'string' && typeof e.ts === 'string' && e.delta && typeof e.delta === 'object' && e.kind in LEDGER_LABEL).slice(0, MAX_ENTRIES) };
}
