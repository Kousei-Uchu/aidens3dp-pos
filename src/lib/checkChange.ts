// Location: src/lib/checkChange.ts
// B1d: "Check Change". The customer says what notes and coins they have; can the drawer make the change for this bill, is it worth it,
// or should we ask for card? Pure, tested in tests/checkchange.test.ts. Uses the drawer ledger and your change finder (via planChange).
import { addCounts, cleanCounts, diffCounts, summariseCounts, totalOf, type Counts } from './cashLedger';
import { partCashOption, piecesOf, planChange, type PartCash } from './cashSale';
import { planChangeSmart, profileUsable, type CashProfile } from './changeScore';
import { judgeChoices } from './changeImpact';

export type CheckChangeResult =
  | { verdict: 'short'; shortBy: number; part: PartCash | null }
  /** They can pay the bill exactly with `take`; no change needed. */
  | { verdict: 'exact'; take: Counts; handBack: Counts }
  /** They pay with `take` (the rest stays with them) and we give `change` from the drawer. `tight` lists reasons it may not be worth it (judgeChange, 0088). */
  | { verdict: 'change'; take: Counts; handBack: Counts; change: Counts; tight: string[] }
  /** No part of what they hold lets us make the change: ask for card (or part cash + card). */
  | { verdict: 'card'; part: PartCash | null };

/**
 * `offered` is everything the customer says they have. Looks at every part of it (up to `maxSubsets`) that covers the bill:
 * an exact payment wins (fewest pieces); otherwise the smallest handover whose change the drawer can make (so they keep the most).
 * With a usable `profile` (smart change on) the notes and coins of the change are chosen to suit the next sales (0022). The "worth it?" warning
 * (0088) is judged with or without a profile: it plays out the next sales with and without this change and warns only if the change itself hurts.
 */
export function checkChange(drawer: Counts, offered: Counts, due: number, maxSubsets = 2000, profile?: CashProfile | null): CheckChangeResult {
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
  const handBack = diffCounts(offered, b.take); if (b.total === due) return { verdict: 'exact', take: b.take, handBack };
  const pool = addCounts(drawer, b.take); const smart = profileUsable(profile) ? planChangeSmart(pool, b.total - due, profile, 20000) : null;
  // the ways of giving this change, the preferred first: smart change's pick and its runners-up, then the fewest-pieces way. The judge uses the first
  // unless a later one is clearly kinder to the next sales, and warns only if the way it settles on still hurts (0088).
  const ways: Counts[] = []; const known = new Set<string>();
  for (const c of [...(smart && smart.kind === 'exact' ? [smart.counts, ...smart.alternatives] : []), b.change]) { const key = JSON.stringify(Object.entries(cleanCounts(c)).sort()); if (!known.has(key)) { known.add(key); ways.push(c); } }
  const j = judgeChoices({ drawer, take: b.take, options: ways, profile });
  return { verdict: 'change', take: b.take, handBack, change: ways[j.index], tight: j.tight };
}

/** Advice for the cashier: a verdict, plain words, and the notes and coins to show as squares (`groups`). `detail` is the same advice as one line of text. */
export type Advice = { tone: 'good' | 'warn' | 'bad'; title: string; detail: string; groups: { label: string; counts: Counts }[]; note: string };
export function adviceFor(r: CheckChangeResult, fmt: (c: number) => string): Advice {
  const ask = (take: Counts, back: Counts) => [{ label: 'Ask for', counts: take }, ...(totalOf(back) ? [{ label: 'They keep', counts: back }] : [])];
  switch (r.verdict) {
    case 'short': { const note = 'Ask for card, or take what they have as a part payment and put the rest on card.'; return { tone: 'bad', title: `They're ${fmt(r.shortBy)} short in cash`, detail: note, groups: [], note }; }
    case 'exact': return { tone: 'good', title: 'Cash works: no change needed', detail: `Ask for ${summariseCounts(r.take)}${totalOf(r.handBack) ? ` (they keep ${summariseCounts(r.handBack)})` : ''}.`, groups: ask(r.take, r.handBack), note: '' };
    case 'change': return r.tight.length
      ? { tone: 'warn', title: `We can make ${fmt(totalOf(r.change))} change, but it may not be worth it`, detail: `Ask for ${summariseCounts(r.take)} and give ${summariseCounts(r.change)}. That ${r.tight.join(' and ')}. Card is the safer choice.`, groups: [...ask(r.take, r.handBack), { label: 'Give as change', counts: r.change }], note: `That ${r.tight.join(' and ')}. Card is the safer choice.` }
      : { tone: 'good', title: `Cash works: ${fmt(totalOf(r.change))} change`, detail: `Ask for ${summariseCounts(r.take)}${totalOf(r.handBack) ? ` (they keep ${summariseCounts(r.handBack)})` : ''} and give ${summariseCounts(r.change)}.`, groups: [...ask(r.take, r.handBack), { label: 'Give as change', counts: r.change }], note: '' };
    case 'card': { const note = r.part ? `Ask for card, or take ${fmt(r.part.cashCents)} in cash and put the other ${fmt(r.part.restCents)} on card.` : 'Ask for card.'; return { tone: 'bad', title: "We can't make the change", detail: note, groups: [], note }; }
  }
}
