// Location: src/lib/cashSwap.ts
// 0091: "Swap my cash" (device test T6, part 2). You enter the notes and coins you hold yourself, and it suggests which to hand into
// the drawer and which to take out in exchange, so the drawer is better stocked for the next sales. Pure (no React, no store), tested
// in tests/cashswap.test.ts. All amounts are integer cents.
//
// Rules of an exchange:
//  - It is always an even swap: the value handed in equals the value taken out, so the drawer total, the float and the Z-report never change.
//  - It only ever hands in pieces you said you hold, and only takes out pieces the drawer really has.
//  - It never takes out a piece of the same kind it hands in (swapping a $20 for a $20 is nothing).
//
// How it chooses: the same imagined day of cash sales as the float report (src/lib/floatPlan.ts, 0090) is played against the drawer before
// and after each candidate swap. A swap is scored as
//     failure points (share of imagined sales that could not get exact change, x100)
//   + PIECE_HELD per note or coin sitting in the drawer afterwards (a drawer stuffed with fives is slower to count and to find change in)
//   + HANDLING per note or coin that has to change hands (a swap must be worth the walk to the bank or your pocket).
// It takes the best swap, then looks again with what is left of your cash, and stops when nothing gains MIN_GAIN points.
// So "excess fives, but the drawer wants a $50" works out as: hand in the $50, take out ten $5s, and the report says why.
import { cleanCounts, totalOf, type Counts } from './cashLedger';
import { findCombinationsLimited } from './changeFinder';
import { failRate } from './floatPlan';
import type { Script } from './changeImpact';

/** Points of failure rate (out of 100) that one note or coin sitting in the drawer costs. 10 spare fives cost 2 points. */
export const PIECE_HELD = 0.2;
/** Points that one note or coin changing hands costs. */
export const HANDLING = 0.05;
/** A step has to improve the score by at least this many points to be taken. */
export const MIN_GAIN = 0.4;
/** Most steps, and most ways of making each amount that are looked at. */
const MAX_STEPS = 6;
const MAX_WAYS = 12;
const NODE_CAP = 3000;

const piecesOf = (c: Counts): number => Object.values(c).reduce((s, n) => s + n, 0);
const add = (a: Counts, b: Counts): Counts => { const o: Counts = { ...a }; for (const [k, n] of Object.entries(b)) o[k] = (o[k] ?? 0) + n; return o; };
const sub = (a: Counts, b: Counts): Counts => { const o: Counts = { ...a }; for (const [k, n] of Object.entries(b)) o[k] = (o[k] ?? 0) - n; return o; };
const score = (drawer: Counts, script: Script): number => failRate(drawer, script) * 100 + PIECE_HELD * piecesOf(drawer);

export type SwapPlan = {
  /** Notes and coins of yours to put into the drawer. */
  give: Counts;
  /** Notes and coins to take out of the drawer in exchange. Same total as `give`. */
  take: Counts;
  /** The drawer once the swap is done. */
  after: Counts;
  /** Share (0 to 1) of an imagined day's cash sales that could get exact change, before and after. */
  okBefore: number; okAfter: number;
  /** Notes and coins in the drawer before and after. */
  piecesBefore: number; piecesAfter: number;
  /** Why the plan ended: it found something, nothing was worth swapping, you hold nothing, or time ran out (best so far shown). */
  stopped: 'done' | 'no-gain' | 'nothing-held' | 'time';
};

/**
 * Best even exchange of `own` (what the person holds) with `drawer`, judged against `script`.
 * `budgetMs` caps the thinking; the best swap found so far is returned.
 */
export function planSwap(drawer: Counts, own: Counts, script: Script, o: { budgetMs?: number } = {}): SwapPlan {
  const budget = o.budgetMs ?? 2000; const t0 = Date.now();
  const start = cleanCounts(Object.fromEntries(Object.entries(drawer).filter(([, n]) => n > 0)));
  let mine: Counts = cleanCounts(Object.fromEntries(Object.entries(own).filter(([, n]) => n > 0)));
  const failBefore = failRate(start, script);
  let cur = start; let give: Counts = {}; let take: Counts = {}; let stopped: SwapPlan['stopped'] = 'no-gain';
  if (!totalOf(mine)) return finish();
  stopped = 'no-gain';
  for (let step = 0; step < MAX_STEPS; step++) {
    if (Date.now() - t0 > budget) { stopped = 'time'; break; }
    const base = score(cur, script); let best: { g: Counts; t: Counts; next: Counts; net: number } | null = null;
    for (const key of Object.keys(mine)) {
      const have = mine[key]; const piece = Number(key);
      const sizes = [...new Set([1, 2, 4, 5, 10, have].filter(n => n >= 1 && n <= have))];
      for (const n of sizes) {
        if (Date.now() - t0 > budget) break;
        const g: Counts = { [key]: n }; const pool = add(cur, g); delete pool[key]; // never take out the kind being handed in
        const found = findCombinationsLimited(pool, piece * n, 0, { maxNodes: NODE_CAP, bigFirst: true });
        const ways = found.results.filter(r => r.exact).map(r => cleanCounts(Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, v.qty_used])))).filter(t => totalOf(t) === piece * n)
          .sort((a, b) => piecesOf(a) - piecesOf(b)).slice(0, MAX_WAYS);
        for (const t of ways) {
          const next = cleanCounts(sub(add(cur, g), t)); const net = base - score(next, script) - HANDLING * (n + piecesOf(t));
          if (net >= MIN_GAIN && (!best || net > best.net + 1e-9)) best = { g, t, next, net };
        }
      }
    }
    if (!best) break;
    cur = best.next; give = add(give, best.g); take = add(take, best.t); stopped = 'done';
    for (const [k, n] of Object.entries(best.g)) mine[k] -= n; mine = cleanCounts(mine);
    if (!totalOf(mine)) break;
  }
  return finish();

  function finish(): SwapPlan {
    // steps can hand in a kind that a later step takes out: cancel those, leaving one plain list each way (the total stays even)
    const g: Counts = {}; const t: Counts = {};
    for (const k of new Set([...Object.keys(give), ...Object.keys(take)])) { const d = (give[k] ?? 0) - (take[k] ?? 0); if (d > 0) g[k] = d; else if (d < 0) t[k] = -d; }
    const after = cleanCounts(sub(add(start, g), t)); const none = !totalOf(g);
    return { give: g, take: t, after: none ? start : after, okBefore: 1 - failBefore, okAfter: 1 - failRate(none ? start : after, script), piecesBefore: piecesOf(start), piecesAfter: piecesOf(none ? start : after),
      stopped: !totalOf(own) ? 'nothing-held' : none && stopped === 'done' ? 'no-gain' : stopped };
  }
}

/** Does the plan leave the drawer holding what it should? Used by the screen before writing the ledger: even value, nothing taken that is not there. */
export function swapIsValid(drawer: Counts, plan: Pick<SwapPlan, 'give' | 'take'>): boolean {
  if (totalOf(plan.give) !== totalOf(plan.take) || !totalOf(plan.give)) return false;
  return Object.entries(plan.take).every(([k, n]) => n > 0 && (drawer[k] ?? 0) + (plan.give[k] ?? 0) >= n);
}
