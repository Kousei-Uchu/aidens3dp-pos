// Location: src/lib/checkChange.ts
// B1d: "Check Change". The customer says what notes and coins they have; can the drawer make the change for this bill, is it worth it,
// or should we ask for card? Pure, tested in tests/checkchange.test.ts. Uses the drawer ledger and your change finder (via planChange).
import { addCounts, cleanCounts, denomLabel, diffCounts, summariseCounts, totalOf, type Counts } from './cashLedger';
import { partCashOption, piecesOf, planChange, type PartCash } from './cashSale';

export type CheckChangeResult =
  | { verdict: 'short'; shortBy: number; part: PartCash | null }
  /** They can pay the bill exactly with `take`; no change needed. */
  | { verdict: 'exact'; take: Counts; handBack: Counts }
  /** They pay with `take` (the rest stays with them) and we give `change` from the drawer. `tight` lists reasons it may not be worth it. */
  | { verdict: 'change'; take: Counts; handBack: Counts; change: Counts; tight: string[] }
  /** No part of what they hold lets us make the change: ask for card (or part cash + card). */
  | { verdict: 'card'; part: PartCash | null };

/** Why making this change might not be a good idea, given what is in the drawer. Empty = no concerns. */
export function tightness(drawer: Counts, take: Counts, change: Counts): string[] {
  const out: string[] = []; const before = cleanCounts(drawer); const after = diffCounts(addCounts(before, take), change);
  const lastOnes = Object.keys(change).map(Number).filter(v => v <= 2000 && (before[String(v)] ?? 0) + (take[String(v)] ?? 0) > 0 && (after[String(v)] ?? 0) <= 0).sort((a, b) => b - a);
  if (lastOnes.length) out.push(`uses up the last ${lastOnes.map(denomLabel).join(', ')}`);
  const drawerTotal = totalOf(before); if (drawerTotal > 0 && totalOf(change) * 2 > drawerTotal + totalOf(take)) out.push('takes more than half the cash in the drawer');
  return out;
}

/**
 * `offered` is everything the customer says they have. Looks at every part of it (up to `maxSubsets`) that covers the bill:
 * an exact payment wins (fewest pieces); otherwise the smallest handover whose change the drawer can make (so they keep the most).
 */
export function checkChange(drawer: Counts, offered: Counts, due: number, maxSubsets = 2000): CheckChangeResult {
  const have = totalOf(offered);
  if (have < due) return { verdict: 'short', shortBy: due - have, part: null };
  const items = Object.entries(cleanCounts(offered)).filter(([, n]) => n > 0).sort((a, b) => Number(b[0]) - Number(a[0]));
  let best: { take: Counts; total: number; pieces: number; change: Counts } | null = null; let seen = 0; const take: Counts = {};
  const walk = (i: number, total: number) => {
    if (++seen > maxSubsets) return;
    if (i === items.length) {
      if (total < due) return;
      const owed = total - due; const plan = owed === 0 ? { kind: 'none' as const } : planChange(addCounts(drawer, take), owed, 20000);
      if (plan.kind === 'impossible') return;
      const pieces = piecesOf(take); const change = plan.kind === 'exact' ? plan.counts : {};
      const rank = (t: number, p: number) => (t === due ? 0 : 1) * 1e9 + t * 100 + p; // exact first, then least change, then fewest pieces
      if (!best || rank(total, pieces) < rank(best.total, best.pieces)) best = { take: cleanCounts({ ...take }), total, pieces, change };
      return;
    }
    const [v, n] = items[i];
    for (let q = 0; q <= n; q++) { if (q) take[v] = q; else delete take[v]; walk(i + 1, total + Number(v) * q); }
    delete take[v];
  };
  walk(0, 0);
  const b = best as { take: Counts; total: number; pieces: number; change: Counts } | null;
  if (!b) return { verdict: 'card', part: partCashOption(drawer, offered, due) };
  const handBack = diffCounts(offered, b.take);
  return b.total === due ? { verdict: 'exact', take: b.take, handBack } : { verdict: 'change', take: b.take, handBack, change: b.change, tight: tightness(drawer, b.take, b.change) };
}

/** One-line advice for the cashier. */
export function adviceFor(r: CheckChangeResult, fmt: (c: number) => string): { tone: 'good' | 'warn' | 'bad'; title: string; detail: string } {
  switch (r.verdict) {
    case 'short': return { tone: 'bad', title: `They're ${fmt(r.shortBy)} short in cash`, detail: 'Ask for card, or take what they have as a part payment and put the rest on card.' };
    case 'exact': return { tone: 'good', title: 'Cash works: no change needed', detail: `Ask for ${summariseCounts(r.take)}${totalOf(r.handBack) ? ` (they keep ${summariseCounts(r.handBack)})` : ''}.` };
    case 'change': return r.tight.length
      ? { tone: 'warn', title: `We can make ${fmt(totalOf(r.change))} change, but it may not be worth it`, detail: `Ask for ${summariseCounts(r.take)} and give ${summariseCounts(r.change)}. That ${r.tight.join(' and ')}. Card is the safer choice.` }
      : { tone: 'good', title: `Cash works: ${fmt(totalOf(r.change))} change`, detail: `Ask for ${summariseCounts(r.take)}${totalOf(r.handBack) ? ` (they keep ${summariseCounts(r.handBack)})` : ''} and give ${summariseCounts(r.change)}.` };
    case 'card': return { tone: 'bad', title: "We can't make the change", detail: r.part ? `Ask for card, or take ${fmt(r.part.cashCents)} in cash and put the other ${fmt(r.part.restCents)} on card.` : 'Ask for card.' };
  }
}
