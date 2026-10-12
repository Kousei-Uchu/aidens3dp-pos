// Location: src/lib/floatPlan.ts
// 0089: how the daily float report decides what a drawer is missing. Pure (no React, no store), tested in tests/floatplan.test.ts.
//
// The old report guessed a float SIZE (1.5 x a day of change) and filled the gap with whichever notes were worth the most. That ignored
// that the notes customers hand over are used again as change, so the size came out far too big, and it ranked by dollar value, so
// $20s were always asked for first (device test T6: a drawer holding $106 and no $20s or $10s was told to add six $20s and a $10).
//
// This asks the question that matters instead: "if I play a whole day of cash sales against this drawer, how many could not be given exact
// change?" (the simulator from 0088, src/lib/changeImpact.ts). Then:
//  1. planTopUp adds notes and coins one small step at a time, always the step that cuts that failure rate the most for what it costs,
//     and stops when the drawer is good enough or nothing left is worth adding. So a $20 is only asked for if $20s really fix failures.
//  2. rankTakeOuts re-ranks the ways of banking the day's takings by the failure rate of the drawer left behind, as well as how close each
//     is to the takings.
// The same seeded script is played against every drawer being compared, so the answer is repeatable and differences are real.
import { cleanCounts, diffCounts, type Counts } from './cashLedger';
import { genericProfile, makeScript, play, type Script } from './changeImpact';
import { profileUsable, type CashProfile } from './changeScore';

/** Imagined days played per drawer. Fewer than the 160 of the worth-it check, because many drawers are compared. */
export const DAY_TRIALS = 30;
/** What one dollar of float costs, in points of failure rate out of 100. A $20 note must cut failures by more than 0.8 points to be worth asking for. */
export const DOLLAR_COST = 0.04;
/** At or below this share of failed sales a drawer is good enough and nothing more is added. */
export const GOOD_ENOUGH = 0.03;
/** A step must gain at least this many points (cost already taken off) to be taken. */
export const MIN_NET = 0.5;
/** Most the report ever asks to be added, and most steps it takes. */
export const MAX_TOPUP = 20000;
const MAX_STEPS = 20;
/** Notes and coins that can be added. $50 and $100 notes are never added: they are not used as change. */
const PIECES = [2000, 1000, 500, 200, 100, 50, 20, 10, 5] as const;
/** How many of one piece a single step may add. Coins come in handfuls, because one coin alone often fixes nothing. */
const CHUNKS: Record<number, number[]> = { 2000: [1, 2], 1000: [1, 2], 500: [1, 2, 4], 200: [1, 2, 4], 100: [1, 2, 4, 8], 50: [1, 2, 4], 20: [1, 2, 4], 10: [1, 2, 4], 5: [1, 2, 4] };

/** A whole day of imagined cash sales for the profile (its horizon is half a day). With no usable profile: a generic $1 to $30 spread. */
export function dayScript(profile: CashProfile | null | undefined, trials = DAY_TRIALS): Script {
  const prof = profileUsable(profile) ? profile : genericProfile();
  return makeScript(prof, { trials, sales: prof.horizon * 2 });
}

/** Share (0 to 1) of a day's cash sales that could not be given exact change from this drawer. */
export const failRate = (drawer: Counts, script: Script): number => play(drawer, script).rate;

const addPiece = (d: Counts, piece: number, n: number): Counts => ({ ...d, [String(piece)]: (d[String(piece)] ?? 0) + n });

export type TopUpPlan = {
  /** Notes and coins to add. */
  add: Counts;
  /** Failure rate before and after adding them. */
  before: number; after: number;
  /** Why it stopped: already fine, now fine, nothing left worth adding, hit the size or step limit, or ran out of time. */
  stopped: 'already-good' | 'good' | 'no-gain' | 'limit' | 'time';
};

/**
 * Notes and coins worth adding to `keep` (what stays in the drawer). Greedy, one step at a time: among every piece (and small handful of
 * pieces) it could add, take the one with the best (failure points saved) minus (DOLLAR_COST per dollar), ties to the cheaper. Stops when
 * the drawer is good enough, no step gains MIN_NET, `maxAdd` cents would be passed, or `budgetMs` has run out (the best so far is returned).
 */
export function planTopUp(keep: Counts, script: Script, o: { maxAdd?: number; budgetMs?: number } = {}): TopUpPlan {
  const maxAdd = o.maxAdd ?? MAX_TOPUP; const budget = o.budgetMs ?? 1500; const t0 = Date.now();
  let cur = cleanCounts(Object.fromEntries(Object.entries(keep).filter(([, n]) => n > 0))); let rate = failRate(cur, script); const before = rate;
  const add: Counts = {}; let added = 0;
  const done = (stopped: TopUpPlan['stopped']): TopUpPlan => ({ add: cleanCounts(add), before, after: rate, stopped });
  if (rate <= GOOD_ENOUGH) return done('already-good');
  for (let step = 0; step < MAX_STEPS; step++) {
    if (Date.now() - t0 > budget) return done('time');
    let best: { piece: number; n: number; rate: number; net: number } | null = null;
    for (const piece of PIECES) {
      let prev = -Infinity; // handfuls of one piece are tried smallest first and given up on once a good one starts to get worse
      for (const n of CHUNKS[piece]) {
        const cost = piece * n; if (added + cost > maxAdd) break;
        const r = failRate(addPiece(cur, piece, n), script); const net = (rate - r) * 100 - (DOLLAR_COST * cost) / 100;
        if (net >= MIN_NET && (!best || net > best.net + 1e-9 || (Math.abs(net - best.net) <= 1e-9 && cost < best.piece * best.n))) best = { piece, n, rate: r, net };
        if (prev >= MIN_NET && net < prev) break; prev = net;
      }
    }
    if (!best) return done(added ? 'good' : 'no-gain');
    cur = addPiece(cur, best.piece, best.n); add[String(best.piece)] = (add[String(best.piece)] ?? 0) + best.n; added += best.piece * best.n; rate = best.rate;
    if (rate <= GOOD_ENOUGH) return done('good');
  }
  return done('limit');
}

export type TakeOut = { take: Counts; pieces: number; off: number };
/**
 * Orders ways of taking money out of `drawer` by how well the drawer left behind copes with a day of sales, plus how far each is from the
 * amount wanted (`closeWeight` points per dollar). Ties keep the incoming order, so put the preferred ones first. At most `keep` are returned.
 */
export function rankTakeOuts<T extends TakeOut>(drawer: Counts, candidates: T[], script: Script, closeWeight: number, keep = 3): (T & { fail: number })[] {
  return candidates.map(c => ({ ...c, fail: failRate(cleanCounts(diffCounts(drawer, c.take)), script) }))
    .map((c, i) => ({ c, i, cost: c.fail * 100 + (closeWeight * c.off) / 100 }))
    .sort((a, b) => a.cost - b.cost || a.i - b.i).slice(0, keep).map(x => x.c);
}
