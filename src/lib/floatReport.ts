// Location: src/lib/floatReport.ts
// B1f: the daily float report. At the end of the day: how much cash came in, which notes and coins to take out (bank) so the amount taken is as
// close to the day's cash takings as possible, and what that leaves in the drawer as tomorrow's float, judged by the same learned profile as
// smart change (src/lib/changeScore.ts). Also says what to top up and which notes are better banked. Pure, tested in tests/floatreport.test.ts.
// All amounts are integer cents.
import { DENOMS, cleanCounts, denomLabel, diffCounts, totalOf, type Counts, type LedgerEntry } from './cashLedger';
import { findCombinationsLimited } from './changeFinder';
import { coverage, lowOn, profileUsable, scoreAfter, type CashProfile } from './changeScore';
import { greedyChange } from './cashSale';

/** Points lost per dollar the amount taken out is away from the day's takings (100 points = every usual change amount covered). */
export const CLOSE_WEIGHT = 1.5;
const NEAR = 1000; // how far from the takings (cents) an amount taken out may be
const MAX_CANDIDATES = 400;
const FLOAT_STEP = 1000; const FLOAT_MIN = 5000; const FLOAT_MAX = 30000;

/** What the ledger saw come in from tracked cash sales since `sinceMs`: received minus change minus cash refunds. Also how many sales that was. */
export function ledgerTakings(entries: LedgerEntry[], sinceMs: number): { cents: number; sales: number } {
  let cents = 0; const sales = new Set<string>();
  for (const e of entries) {
    if (new Date(e.ts).getTime() < sinceMs) continue;
    if (e.kind === 'sale_in' || e.kind === 'sale_change' || e.kind === 'refund_out') { cents += totalOf(e.delta); if (e.kind === 'sale_in' && e.saleUuid) sales.add(e.saleUuid); }
  }
  return { cents, sales: sales.size };
}

/** A float size that would cover a day's change with some room: 1.5 × the change you usually give in a day, to the nearest $10, between $50 and $300. null with no profile. */
export function idealFloat(profile: CashProfile | null | undefined): number | null {
  if (!profileUsable(profile)) return null;
  const perSale = profile.amounts.reduce((s, a) => s + a.p * a.cents, 0); const daily = perSale * profile.horizon * 2;
  return Math.max(FLOAT_MIN, Math.min(FLOAT_MAX, Math.ceil((daily * 1.5) / FLOAT_STEP) * FLOAT_STEP));
}

export type FloatOption = { takeOut: Counts; keep: Counts; takeOutTotal: number; keepTotal: number };
export type FloatReport = {
  takings: number; drawerTotal: number; usedProfile: boolean;
  best: FloatOption; alternatives: FloatOption[];
  /** takeOutTotal − takings: 0 = exactly the day's takings, positive = taking a little more. */
  gap: number;
  ideal: number | null;
  /** Notes and coins to add to the float (from the bank or safe) to get nearer the ideal, if the float is short. */
  topUp: Counts;
  /** $50 and $100 notes left in the drawer: never used as change, so usually better banked. */
  bankable: Counts;
  coverageNow: number | null; coverageKeep: number | null; low: number[];
  notes: string[];
  truncated: boolean;
};

const option = (drawer: Counts, takeOut: Counts): FloatOption => { const keep = cleanCounts(diffCounts(drawer, takeOut)); return { takeOut: cleanCounts(takeOut), keep, takeOutTotal: totalOf(takeOut), keepTotal: totalOf(keep) }; };

/**
 * `drawer`: what the ledger says is in the drawer now. `takings`: the day's net cash (cash sales minus cash refunds). With a usable `profile`
 * it picks, among the ways to take out about `takings` (within $10), the one that leaves the best-stocked float for a whole day of sales;
 * without one it takes the largest notes first. It never takes out more than the drawer holds.
 */
export function recommendFloat(o: { drawer: Counts; takings: number; profile?: CashProfile | null; maxNodes?: number }): FloatReport {
  const drawer = cleanCounts(Object.fromEntries(Object.entries(o.drawer).filter(([, n]) => n > 0))); const drawerTotal = totalOf(drawer);
  const takings = Math.max(0, Math.min(o.takings, drawerTotal)); const prof = profileUsable(o.profile) ? o.profile : null;
  const day: CashProfile | null = prof ? { ...prof, horizon: prof.horizon * 2 } : null; // the profile's horizon is half a day
  let best = option(drawer, {}); let alternatives: FloatOption[] = []; let truncated = false;
  if (takings > 0) {
    if (day) {
      const { results, truncated: t } = findCombinationsLimited(drawer, takings, NEAR, { maxNodes: o.maxNodes ?? 150000, all: true }); truncated = t;
      const cands = results.map(r => { const take: Counts = {}; let pieces = 0; for (const [v, q] of Object.entries(r.values)) if (q.qty_used > 0) { take[v] = q.qty_used; pieces += q.qty_used; } return { take, pieces, off: Math.abs(r.total - takings) }; })
        .sort((a, b) => a.off - b.off || a.pieces - b.pieces).slice(0, MAX_CANDIDATES);
      const scored = cands.map(c => ({ ...c, score: scoreAfter(cleanCounts(diffCounts(drawer, c.take)), c.pieces, day) - (CLOSE_WEIGHT * c.off) / 100 })).sort((a, b) => b.score - a.score || a.off - b.off);
      if (scored.length) { best = option(drawer, scored[0].take); alternatives = scored.slice(1, 3).map(s => option(drawer, s.take)); }
      else { const g = greedyBelow(drawer, takings); best = option(drawer, g); }
    } else best = option(drawer, greedyBelow(drawer, takings));
  }
  const ideal = idealFloat(prof);
  const topUp: Counts = {};
  if (day && ideal !== null && best.keepTotal < ideal) {
    let gap = ideal - best.keepTotal;
    const wants = Object.entries(day.needPerSale).map(([v, n]) => ({ v: Number(v), want: Math.ceil(n * day.horizon) - (best.keep[v] ?? 0) })).filter(x => x.want > 0 && x.v <= 2000).sort((a, b) => b.want * b.v - a.want * a.v);
    for (const w of wants) { const n = Math.min(w.want, Math.floor(gap / w.v)); if (n > 0) { topUp[String(w.v)] = n; gap -= n * w.v; } }
  }
  const bankable: Counts = {}; for (const d of DENOMS) if (d.cents >= 5000 && (best.keep[String(d.cents)] ?? 0) > 0) bankable[String(d.cents)] = best.keep[String(d.cents)];
  const gap = best.takeOutTotal - takings;
  const coverageNow = day ? coverage(drawer, day) : null; const coverageKeep = day ? coverage(best.keep, day) : null; const low = day ? lowOn(best.keep, day) : [];
  const notes: string[] = [];
  if (!prof) notes.push('No cash history or item prices to learn from yet, so this just takes the largest notes first. It improves as you track more cash sales.');
  if (takings <= 0) notes.push('No cash takings to bank, so nothing needs to come out.');
  else if (gap !== 0) notes.push(`${gap > 0 ? 'Takes' : 'Leaves'} ${fmtMoney(Math.abs(gap))} ${gap > 0 ? 'more' : 'less'} than the day's takings so the float keeps the notes and coins you'll need.`);
  if (o.takings > drawerTotal) notes.push('The ledger holds less than the takings, so it may be out of date. Count the drawer first.');
  if (low.length) notes.push(`Even so, the float is likely to run short of ${low.filter(v => v <= 2000).map(denomLabel).join(', ') || 'some notes and coins'}.`);
  return { takings, drawerTotal, usedProfile: !!prof, best, alternatives, gap, ideal, topUp: cleanCounts(topUp), bankable, coverageNow, coverageKeep, low, notes, truncated };
}

const fmtMoney = (c: number) => `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
/** Largest notes first, up to `target` without going over; if that lands short, as close below as the notes allow. */
function greedyBelow(pool: Counts, target: number): Counts {
  const exact = greedyChange(pool, target); if (exact) return exact;
  const out: Counts = {}; let left = target;
  for (const v of Object.keys(pool).map(Number).sort((a, b) => b - a)) { const n = Math.min(pool[String(v)] ?? 0, Math.floor(left / v)); if (n > 0) { out[String(v)] = n; left -= n * v; } }
  return out;
}
