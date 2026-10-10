// Location: src/lib/cashSale.ts
// B1: the maths behind taking cash with the denomination pad (0019). Pure, tested in tests/cashsale.test.ts.
//  - what the customer has handed over vs what is due,
//  - which notes and coins to give back, found from the drawer ledger plus what was just received (your findCombinations),
//  - the ledger entries a cash sale (or a cancelled one) writes.
import { addCounts, applyEntry, cleanCounts, diffCounts, newEntry, totalOf, type CashLedger, type Counts, type Draft } from './cashLedger';
import { findCombinationsLimited } from './changeFinder';
import { roundCash } from './money';
import type { Tender } from './types';

/** What the customer owes in cash: the last payment on a sale is rounded to 5c when cash rounding is on. */
export const cashDue = (target: number, remaining: number, rounding: boolean): number => (rounding && target === remaining ? roundCash(target) : target);

export type CashStatus = { state: 'empty' } | { state: 'short'; shortBy: number } | { state: 'exact' } | { state: 'change'; change: number };
export function cashStatus(due: number, received: number): CashStatus {
  if (received <= 0) return due <= 0 ? { state: 'exact' } : { state: 'empty' };
  if (received < due) return { state: 'short', shortBy: due - received };
  return received === due ? { state: 'exact' } : { state: 'change', change: received - due };
}

export const piecesOf = (c: Counts): number => Object.values(c).reduce((s, n) => s + Math.max(0, n), 0);
const positive = (c: Counts): Counts => cleanCounts(Object.fromEntries(Object.entries(c).filter(([, n]) => n > 0)));

/** Largest-first fallback for when the exhaustive search is cut short. Returns null if it does not land exactly. */
export function greedyChange(pool: Counts, owed: number): Counts | null {
  const out: Counts = {}; let left = owed;
  for (const v of Object.keys(pool).map(Number).sort((a, b) => b - a)) {
    const n = Math.min(pool[String(v)] ?? 0, Math.floor(left / v)); if (n > 0) { out[String(v)] = n; left -= n * v; }
  }
  return left === 0 ? out : null;
}

export type ChangePlan = { kind: 'none' } | { kind: 'exact'; counts: Counts; truncated: boolean } | { kind: 'impossible'; truncated: boolean };
/**
 * The notes and coins to give back for `owed` cents. `pool` is what is physically available: the drawer plus what the customer just handed over.
 * Picks, of all exact combinations, the one using the fewest pieces (quickest to count out). "impossible" means no exact combination exists.
 */
export function planChange(pool: Counts, owed: number, maxNodes = 150000): ChangePlan {
  if (owed <= 0) return { kind: 'none' };
  const avail = positive(pool);
  const { results, truncated } = findCombinationsLimited(avail, owed, 0, { maxNodes });
  let best: Counts | null = null; let bestPieces = Infinity;
  for (const r of results) {
    if (!r.exact) continue;
    const counts: Counts = {}; let pieces = 0;
    for (const [v, q] of Object.entries(r.values)) if (q.qty_used > 0) { counts[v] = q.qty_used; pieces += q.qty_used; }
    if (pieces < bestPieces) { best = counts; bestPieces = pieces; }
  }
  if (!best && truncated) best = greedyChange(avail, owed);
  return best ? { kind: 'exact', counts: best, truncated } : { kind: 'impossible', truncated };
}

/** Writes a cash sale into the ledger: what came in, then what went back out as change. Untracked sides are simply skipped. */
export function postCashSale(l: CashLedger, o: { saleUuid: string; received?: Counts | null; given?: Counts | null; staff?: string }): CashLedger {
  let out = l;
  const inn = cleanCounts(o.received ?? {}); const giv = cleanCounts(o.given ?? {});
  if (totalOf(inn)) out = applyEntry(out, newEntry('sale_in', inn, { saleUuid: o.saleUuid, staff: o.staff }));
  if (totalOf(giv)) out = applyEntry(out, newEntry('sale_change', Object.fromEntries(Object.entries(giv).map(([v, n]) => [v, -n])), { saleUuid: o.saleUuid, staff: o.staff }));
  return out;
}
/** A cancelled sale hands the cash back by hand: take out what came in, put back what went out as change. */
export function reverseCashTender(l: CashLedger, t: Tender, o: { saleUuid?: string; staff?: string } = {}): CashLedger {
  if (t.kind !== 'cash' || (!t.cashIn && !t.cashOut)) return l;
  const delta: Counts = {};
  for (const [v, n] of Object.entries(t.cashIn ?? {})) delta[v] = (delta[v] ?? 0) - n;
  for (const [v, n] of Object.entries(t.cashOut ?? {})) delta[v] = (delta[v] ?? 0) + n;
  return totalOf(cleanCounts(delta)) || Object.keys(cleanCounts(delta)).length ? applyEntry(l, newEntry('sale_change', delta, { saleUuid: o.saleUuid, staff: o.staff, note: 'Sale cancelled: cash handed back' })) : l;
}

/** A counts map as a pad draft (so the pad can show and edit it). */
export const countsToDraft = (c: Counts): Draft => Object.entries(cleanCounts(c)).filter(([, n]) => n > 0).sort((a, b) => Number(b[0]) - Number(a[0])).map(([v, n]) => ({ cents: Number(v), n }));
/** The ledger knows of no cash at all (drawer never opened or counted), so change cannot be suggested. */
export const ledgerEmpty = (drawer: Counts): boolean => totalOf(positive(drawer)) === 0;

/** Cash refund: the notes and coins handed to the customer come out of the drawer. */
export function postCashRefund(l: CashLedger, o: { saleUuid?: string; given: Counts | null; staff?: string }): CashLedger {
  const g = cleanCounts(o.given ?? {}); if (!totalOf(g)) return l;
  return applyEntry(l, newEntry('refund_out', Object.fromEntries(Object.entries(g).map(([v, n]) => [v, -n])), { saleUuid: o.saleUuid, staff: o.staff }));
}

// ── when the drawer cannot make the change ───────────────────────────────────
export type HandBack = { take: Counts; handBack: Counts; change: Counts };
/**
 * "Ask for less": a smaller part of what the customer handed over that still covers the bill and whose change the drawer CAN make
 * (the rest goes back to the customer). Picks the smallest such amount, then the fewest pieces. null if there is none.
 */
export function handBackOptions(drawer: Counts, received: Counts, due: number, maxSubsets = 600): HandBack | null {
  const items = Object.entries(positive(received)).sort((a, b) => Number(b[0]) - Number(a[0]));
  const recTotal = totalOf(received); let best: { take: Counts; total: number; pieces: number; change: Counts } | null = null; let seen = 0;
  const take: Counts = {};
  const walk = (i: number, total: number) => {
    if (++seen > maxSubsets) return;
    if (i === items.length) {
      if (total < due || total === recTotal) return;
      const plan = planChange(addCounts(drawer, take), total - due, 20000); if (plan.kind === 'impossible') return;
      const pieces = piecesOf(take); if (!best || total < best.total || (total === best.total && pieces < best.pieces)) best = { take: cleanCounts({ ...take }), total, pieces, change: plan.kind === 'exact' ? plan.counts : {} };
      return;
    }
    const [v, n] = items[i];
    for (let q = 0; q <= n; q++) { if (q) take[v] = q; else delete take[v]; walk(i + 1, total + Number(v) * q); }
    delete take[v];
  };
  walk(0, 0);
  const b = best as { take: Counts; total: number; pieces: number; change: Counts } | null;
  return b ? { take: b.take, handBack: diffCounts(received, b.take), change: b.change } : null;
}

/** Every amount the notes and coins in `pool` can add up to (up to `max`). Used to ask "can this change be made at all?" for many amounts quickly. */
export function reachableSums(pool: Counts, max: number, cap = 50000): Set<number> {
  let sums = new Set<number>([0]);
  for (const [vs, n] of Object.entries(positive(pool))) {
    const v = Number(vs); const next = new Set(sums);
    for (const s of sums) for (let k = 1; k <= n && s + k * v <= max; k++) next.add(s + k * v);
    sums = next; if (sums.size > cap) break;
  }
  return sums;
}
export type PartCash = { cashCents: number; restCents: number };
/**
 * "Part in cash": the largest cash amount below the bill (5c steps) whose change the drawer can make from the drawer plus what the customer
 * handed over, so the rest can go on card. null if no amount works.
 */
export function partCashOption(drawer: Counts, received: Counts, due: number): PartCash | null {
  const have = totalOf(received); if (have <= due) return null;
  const reach = reachableSums(addCounts(drawer, received), have);
  for (let x = Math.floor((due - 5) / 5) * 5; x >= 5; x -= 5) if (reach.has(have - x)) return { cashCents: x, restCents: due - x };
  return null;
}
