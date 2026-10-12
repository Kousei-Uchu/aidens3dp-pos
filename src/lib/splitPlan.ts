// Location: src/lib/splitPlan.ts
// 0086 (device test T4.4): the plan for a split payment, and what to offer when the cash handed over does not cover this part.
// A plan is the list of payments still to take, in cents, in order. The first is the one being taken now. Pure, tested in tests/splitplan.test.ts.
//   [3334, 3333, 3333]  = "Split equally 3" on $100.00
//   [2000, 8000]        = "First payment $20.00" on $100.00
// An empty plan, or a plan of one, is not a split: the payment is simply whatever remains.
import { allocate } from './money';

export type SplitPlan = number[];

/** Split equally: cents that do not divide evenly go to the first payments (same as before). */
export const equalPlan = (remaining: number, n: number): SplitPlan => (n > 1 && remaining > 0 ? allocate(remaining, Array(n).fill(1)) : []);
/** "First payment $x": that amount, then everything else. Not a split unless 0 < first < remaining. */
export const firstPlan = (remaining: number, first: number): SplitPlan => (first > 0 && first < remaining ? [first, remaining - first] : []);
/** Is there more than one payment planned? */
export const isSplit = (p: SplitPlan): boolean => p.length > 1;
/** What this payment aims for: the first part of a split, never more than remains. */
export const planTarget = (p: SplitPlan, remaining: number): number => (isSplit(p) ? Math.min(remaining, p[0]) : remaining);

/**
 * The plan after a payment has been taken. Whatever its size, it uses up the first part, and the rest is shared across the later parts
 * in proportion to what was planned (equal parts stay equal). `newRemaining` is what is still owed after the payment.
 */
export function planAfter(p: SplitPlan, newRemaining: number): SplitPlan {
  const rest = p.slice(1); if (rest.length < 2 || newRemaining <= 0) return [];
  return allocate(newRemaining, rest);
}

/** The ways the cashier can cover a shortfall on the current part of a split, besides asking for more money. */
export type ShortChoice =
  | { kind: 'next'; shortBy: number; part: 2; was: number; now: number }                          // two payments left: the other goes into the second
  | { kind: 'part'; shortBy: number; part: number; was: number; now: number }                     // more than two: into one chosen later part (part is 2, 3, ...)
  | { kind: 'spread'; shortBy: number; each: number; parts: number }                              // more than two: spread evenly over all later parts
  | { kind: 'modify' };                                                                           // go back to the split sheet

/**
 * What to offer when `got` cents of cash do not cover the current part (`plan[0]`).
 *  - two payments left: put the shortfall into payment 2, or change the split;
 *  - more than two: put it into any one later payment, or spread it over all of them, or change the split.
 * Spreading is offered only when every later payment would rise by a whole number of dollars; otherwise it is left out.
 * Returns [] when there is no split, or the cash covers the part.
 */
export function shortChoices(plan: SplitPlan, got: number): ShortChoice[] {
  if (!isSplit(plan) || got >= plan[0]) return [];
  const shortBy = plan[0] - Math.max(0, got); const out: ShortChoice[] = [];
  if (plan.length === 2) out.push({ kind: 'next', shortBy, part: 2, was: plan[1], now: plan[1] + shortBy });
  else {
    for (let i = 1; i < plan.length; i++) out.push({ kind: 'part', shortBy, part: i + 1, was: plan[i], now: plan[i] + shortBy });
    const later = plan.length - 1;
    if (shortBy % later === 0 && (shortBy / later) % 100 === 0) out.push({ kind: 'spread', shortBy, each: shortBy / later, parts: later });
  }
  out.push({ kind: 'modify' });
  return out;
}

/** The plan to carry on with once the cash is taken and the cashier chose `choice` (not 'modify', which leaves the plan alone). */
export function applyShortChoice(plan: SplitPlan, choice: ShortChoice): SplitPlan {
  const rest = plan.slice(1);
  switch (choice.kind) {
    case 'next': return [rest[0] + choice.shortBy];
    case 'part': return rest.map((v, i) => (i === choice.part - 2 ? v + choice.shortBy : v));
    case 'spread': return rest.map(v => v + choice.each);
    case 'modify': return plan;
  }
}
