// Location: src/lib/floatReport.ts
// B1f: the daily float report. At the end of the day: how much cash came in, which notes and coins to take out (bank) so the amount taken is as
// close to the day's cash takings as possible, and what that leaves in the drawer as tomorrow's float. Since 0089 the float is judged by playing
// a day of imagined cash sales against it (src/lib/floatPlan.ts), not by a size guess. Also says what to top up and which notes are better
// banked. Pure, tested in tests/floatreport.test.ts. All amounts are integer cents.
import { DENOMS, cleanCounts, denomLabel, diffCounts, totalOf, type Counts, type LedgerEntry } from './cashLedger';
import { findCombinationsLimited } from './changeFinder';
import { profileUsable, selectSmartCandidates, type CashProfile } from './changeScore';
import { greedyChange } from './cashSale';
import { dayScript, failRate, planTopUp, rankTakeOuts } from './floatPlan';

/** 0228: the least share of the day's takings that is ever taken out. The float search may leave a little of the takings behind to keep the float stocked, but never more than a quarter of them. */
export const MIN_TAKEN_SHARE = 0.75;
/** Points lost per dollar the amount taken out is away from the day's takings (100 points = every usual change amount covered). */
export const CLOSE_WEIGHT = 1.5;
const NEAR = 1000; // how far from the takings (cents) an amount taken out may be
const MAX_EXACT = 300; const MAX_NEAR = 100; // ways of banking looked at: spread across the exact ones and the near ones
/** Every way is first played against a short day (QUICK_TRIALS imagined days); the best FINALISTS are then played against the full set. */
const QUICK_TRIALS = 10; const FINALISTS = 30;

/** What the ledger saw come in from tracked cash sales since `sinceMs`: received minus change minus cash refunds. Also how many sales that was. */
export function ledgerTakings(entries: LedgerEntry[], sinceMs: number): { cents: number; sales: number } {
  let cents = 0; const sales = new Set<string>();
  for (const e of entries) {
    if (new Date(e.ts).getTime() < sinceMs) continue;
    if (e.kind === 'sale_in' || e.kind === 'sale_change' || e.kind === 'refund_out') { cents += totalOf(e.delta); if (e.kind === 'sale_in' && e.saleUuid) sales.add(e.saleUuid); }
  }
  return { cents, sales: sales.size };
}

export type FloatOption = { takeOut: Counts; keep: Counts; takeOutTotal: number; keepTotal: number };
export type FloatReport = {
  takings: number; drawerTotal: number; usedProfile: boolean;
  best: FloatOption; alternatives: FloatOption[];
  /** takeOutTotal − takings: 0 = exactly the day's takings, positive = taking a little more. */
  gap: number;
  /** Notes and coins to add to the float (from the bank or safe) because a day of sales would otherwise often go without exact change. */
  topUp: Counts;
  /** Share (0 to 1) of a typical day's cash sales that could NOT be given exact change: with the drawer as it is now, with the float after
   *  banking, and with the float after the top-up. null with no profile (nothing to base a typical day on). */
  failNow: number | null; failKeep: number | null; failTopUp: number | null;
  /** What the float would hold after the top-up (keep plus top-up), in cents. */
  suggestedFloat: number;
  /** $50 and $100 notes left in the drawer: never used as change, so usually better banked. */
  bankable: Counts;
  /** 0223: cents of the drawer's cash that is a loan to the drawer, still owed back to the owner (0 when there is none). */
  loanOwed: number;
  /** 0228: the part of the loan the amount to take out covers (the loan, or less when the drawer cannot hold the takings and the loan together). It is an amount only: nothing says which notes were the loan. */
  loanBack: number;
  /** 0228: what the take-out is aiming at: takings plus the loan to take back. */
  takeOutTarget: number;
  /** 0228: the least the take-out may come to: three quarters of the takings, plus the whole loan. */
  takeOutFloor: number;
  notes: string[];
  truncated: boolean;
};

const option = (drawer: Counts, takeOut: Counts): FloatOption => { const keep = cleanCounts(diffCounts(drawer, takeOut)); return { takeOut: cleanCounts(takeOut), keep, takeOutTotal: totalOf(takeOut), keepTotal: totalOf(keep) }; };

/**
 * `drawer`: what the ledger says is in the drawer now. `takings`: the day's net cash (cash sales minus cash refunds). With a usable `profile`
 * it plays a short day of imagined cash sales against every way of banking about `takings` (within $10), then a full day against
 * the best 30, and picks the one whose float copes best, with a penalty for each dollar away from the takings. It then asks `planTopUp` what, if anything, is worth adding. Without a profile it takes the largest notes first. It never takes
 * out more than the drawer holds. `budgetMs` caps the top-up search (the best so far is used when it runs out).
 */
export function recommendFloat(o: { drawer: Counts; takings: number; profile?: CashProfile | null; maxNodes?: number; budgetMs?: number; /** 0223: cents of a loan to the drawer still owed back (Shift.loanCents). 0228: it is added to what is taken out. */ loanOwed?: number }): FloatReport {
  const drawer = cleanCounts(Object.fromEntries(Object.entries(o.drawer).filter(([, n]) => n > 0))); const drawerTotal = totalOf(drawer);
  const takings = Math.max(0, Math.min(o.takings, drawerTotal)); const prof = profileUsable(o.profile) ? o.profile : null;
  // 0228: the loan is yours, so it comes out with the takings. Only the amount is tracked, so it is just added to what is aimed at, and the whole
  // of it is always taken (the floor below includes it). Three quarters of the takings is the least that may come out.
  const loanOwed = Number.isFinite(o.loanOwed) ? Math.max(0, Math.round(o.loanOwed ?? 0)) : 0;
  const loanWanted = Math.min(loanOwed, drawerTotal - takings); const target = takings + loanWanted;
  const floor = Math.min(target, Math.ceil(takings * MIN_TAKEN_SHARE) + loanWanted);
  const day: CashProfile | null = prof ? { ...prof, horizon: prof.horizon * 2 } : null; // the profile's horizon is half a day
  const script = prof ? dayScript(prof) : null;
  let best = option(drawer, {}); let alternatives: FloatOption[] = []; let truncated = false;
  if (target > 0) {
    if (day && script) {
      const { results, truncated: t } = findCombinationsLimited(drawer, target, NEAR, { maxNodes: o.maxNodes ?? 150000, all: true, bigFirst: true }); truncated = t;
      const all = results.filter(r => r.total >= floor).map(r => { const take: Counts = {}; let pieces = 0; for (const [v, q] of Object.entries(r.values)) if (q.qty_used > 0) { take[v] = q.qty_used; pieces += q.qty_used; } return { take, pieces, off: Math.abs(r.total - target) }; });
      // spread over the whole search (quickest ways and fuller ones), exact amounts first, then near ones
      const cands = [...selectSmartCandidates(all.filter(c => c.off === 0), MAX_EXACT), ...selectSmartCandidates(all.filter(c => c.off > 0), MAX_NEAR)];
      const shortlist = rankTakeOuts(drawer, cands, dayScript(prof, QUICK_TRIALS), CLOSE_WEIGHT, FINALISTS);
      const ranked = rankTakeOuts(drawer, shortlist, script, CLOSE_WEIGHT, 3);
      if (ranked.length) { best = option(drawer, ranked[0].take); alternatives = ranked.slice(1).map(s => option(drawer, s.take)); }
      else { const g = greedyTake(drawer, target, floor); best = option(drawer, g); }
    } else best = option(drawer, greedyTake(drawer, target, floor));
  }
  const plan = script ? planTopUp(best.keep, script, { budgetMs: o.budgetMs }) : null;
  const topUp: Counts = plan ? plan.add : {};
  const bankable: Counts = {}; for (const d of DENOMS) if (d.cents >= 5000 && (best.keep[String(d.cents)] ?? 0) > 0) bankable[String(d.cents)] = best.keep[String(d.cents)];
  const gap = best.takeOutTotal - target;
  const failNow = script ? failRate(drawer, script) : null; const failKeep = plan ? plan.before : null; const failTopUp = plan ? plan.after : null;
  const loanBack = Math.min(loanWanted, best.takeOutTotal);
  const notes: string[] = [];
  if (!prof) notes.push('No cash history or item prices to learn from yet, so this just takes the largest notes first. It improves as you track more cash sales.');
  if (target <= 0) notes.push('No cash takings to bank, so nothing needs to come out.');
  else if (gap !== 0) notes.push(`${gap > 0 ? 'Takes' : 'Leaves'} ${fmtMoney(Math.abs(gap))} ${gap > 0 ? 'more' : 'less'} than ${loanBack > 0 ? "the day's takings and your loan" : "the day's takings"} so the float keeps the notes and coins you'll need.`);
  if (o.takings > drawerTotal) notes.push('The ledger holds less than the takings, so it may be out of date. Count the drawer first.');
  if (plan && failTopUp !== null && failTopUp > 0.1) notes.push(`Even with the top-up, about ${Math.round(failTopUp * 100)}% of a typical day's cash sales would get no exact change. More of the same notes and coins would not fix it cheaply.`);
  // 0228: a loan to the drawer is yours, so it is taken out as well as the takings. Only the amount is tracked (the ledger counts notes and coins, not whose
  // they are), so this says how much of the take-out is the loan and does not try to pick out which notes it was.
  if (loanBack > 0) notes.push(`${fmtMoney(loanBack)} of this is your loan, so you take it back with the takings (${fmtMoney(takings)} takings + ${fmtMoney(loanBack)} loan). The float below is what is left without it.`);
  if (loanOwed > loanBack) notes.push(`The drawer holds less than the takings and the whole loan together, so ${fmtMoney(loanOwed - loanBack)} of the loan is still owed back.`);
  return { takings, drawerTotal, usedProfile: !!prof, best, alternatives, gap, topUp: cleanCounts(topUp), failNow, failKeep, failTopUp, suggestedFloat: best.keepTotal + totalOf(topUp), bankable, loanOwed, loanBack, takeOutTarget: target, takeOutFloor: floor, notes, truncated };
}

const fmtMoney = (c: number) => `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
/** Largest notes first, up to `target` without going over; if that lands short, as close below as the notes allow. */
function greedyBelow(pool: Counts, target: number): Counts {
  const exact = greedyChange(pool, target); if (exact) return exact;
  const out: Counts = {}; let left = target;
  for (const v of Object.keys(pool).map(Number).sort((a, b) => b - a)) { const n = Math.min(pool[String(v)] ?? 0, Math.floor(left / v)); if (n > 0) { out[String(v)] = n; left -= n * v; } }
  return out;
}
/**
 * 0228: `greedyBelow`; if that lands under `floor` (the least allowed), the way of at least `floor` nearest `target` with the fewest pieces, found by search;
 * and failing that, extra pieces added one at a time. So a take-out never falls below the least allowed while the drawer holds enough.
 */
function greedyTake(pool: Counts, target: number, floor: number): Counts {
  const out = greedyBelow(pool, target); if (totalOf(out) >= floor) return out;
  const { results } = findCombinationsLimited(pool, target, Math.max(NEAR, target), { maxNodes: 60000, all: true, bigFirst: true });
  const ways = results.filter(r => r.total >= floor).map(r => { const take: Counts = {}; let pieces = 0; for (const [v, q] of Object.entries(r.values)) if (q.qty_used > 0) { take[v] = q.qty_used; pieces += q.qty_used; } return { take, pieces, off: Math.abs(r.total - target) }; })
    .sort((a, b) => a.off - b.off || a.pieces - b.pieces);
  if (ways.length) return ways[0].take;
  let total = totalOf(out); const values = Object.keys(pool).map(Number).sort((a, b) => a - b);
  while (total < floor) {
    const left = floor - total; const free = (v: number) => (pool[String(v)] ?? 0) - (out[String(v)] ?? 0);
    const v = values.find(x => x >= left && free(x) > 0) ?? [...values].reverse().find(x => free(x) > 0);
    if (v === undefined) break; out[String(v)] = (out[String(v)] ?? 0) + 1; total += v;
  }
  return out;
}
