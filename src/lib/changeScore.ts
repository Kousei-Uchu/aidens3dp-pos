// Location: src/lib/changeScore.ts
// B1c: weighted ("smart") change. Of all the exact ways to make some change, pick the one that leaves the drawer best placed for the NEXT sales,
// instead of only the one with the fewest pieces. Pure (no React, no store), tested in tests/changescore.test.ts.
//
// This is a small, transparent statistical model, not a neural network. It learns from your own data and you can read every number:
//  1. CashProfile: from the drawer ledger (what change you actually gave, and what customers actually handed over, newest weighted most)
//     it works out which change amounts come up and how many of each note and coin that uses per sale. With few cash sales so far it leans
//     on the item library instead (a customer buying a $12 item usually pays with a $20), and the lean fades as real sales build up.
//  2. Score of a candidate (higher is better), looking at the drawer AFTER the change is given:
//        100 × coverage      share of the usual change amounts the drawer could still make exactly
//      −  40 × depth         how far each note/coin is below what the next few sales are expected to use (0 = well stocked, 1 = out)
//      − 0.5 × pieces        a small nudge towards fewer pieces (quicker to count out); only decides near-ties
//  3. planChangeSmart picks the best-scoring exact combination and keeps the next best as alternatives.
// All amounts are integer cents.
import { DENOMS, cleanCounts, denomLabel, diffCounts, totalOf, type Counts, type LedgerEntry } from './cashLedger';
import { findCombinationsLimited } from './changeFinder';
import { piecesOf, planChange, reachableSums } from './cashSale';
import { roundCash } from './money';

export type CashProfile = {
  /** Usual change amounts (cents) with how likely each is, most likely first, adding up to 1. Empty = nothing to go on. */
  amounts: { cents: number; p: number }[];
  /** Average number of each note/coin given as change per sale that needed change. */
  needPerSale: Record<string, number>;
  /** Average number of each note/coin customers hand over per cash sale. */
  inPerSale: Record<string, number>;
  /** How many upcoming sales to plan for. */
  horizon: number;
  /** 0 = only item prices (or nothing), 1 = plenty of real cash sales. */
  confidence: number;
  /** Where the numbers came from. */
  source: 'none' | 'prices' | 'history' | 'blend';
  /** Decayed count of the real cash sales with change that the history side is built from. */
  samples: number;
};

export const SCORE_WEIGHTS = { coverage: 100, depth: 40, piece: 0.5 } as const;
const HALF_LIFE_DAYS = 14; // a sale this old counts half as much as one today
const CONFIDENCE_SAMPLES = 8; // at this many (decayed) sales, history and the item-price prior count equally
const NOTES_PAID = [500, 1000, 2000, 5000, 10000];
const CHANGE_DENOMS = DENOMS.map(d => d.cents).filter(c => c <= 2000); // change is never made from $50/$100 notes in this prior
const MAX_AMOUNTS = 60;
const DAY = 86400000;

export const emptyProfile = (): CashProfile => ({ amounts: [], needPerSale: {}, inPerSale: {}, horizon: 6, confidence: 0, source: 'none', samples: 0 });
export const profileUsable = (p: CashProfile | null | undefined): p is CashProfile => !!p && p.amounts.length > 0;

type Hist = { amounts: Map<number, number>; need: Record<string, number>; inn: Record<string, number>; nChange: number; nIn: number };

function fromLedger(entries: LedgerEntry[], now: number): Hist {
  const h: Hist = { amounts: new Map(), need: {}, inn: {}, nChange: 0, nIn: 0 };
  for (const e of entries) {
    if (!e.saleUuid) continue; // only tracked cash sales say anything about demand
    const age = Math.max(0, (now - new Date(e.ts).getTime()) / DAY); const w = Math.pow(0.5, age / HALF_LIFE_DAYS);
    if (!Number.isFinite(w)) continue;
    if (e.kind === 'sale_change') {
      const vals = Object.entries(e.delta);
      if ((e.note ?? '').startsWith('Sale cancelled') || vals.some(([, n]) => n > 0)) continue; // a cancelled sale handing money back is not demand
      const cents = -totalOf(e.delta); if (cents <= 0) continue;
      h.nChange += w; h.amounts.set(cents, (h.amounts.get(cents) ?? 0) + w);
      for (const [v, n] of vals) h.need[v] = (h.need[v] ?? 0) + w * -n;
    } else if (e.kind === 'sale_in') {
      h.nIn += w; for (const [v, n] of Object.entries(e.delta)) if (n > 0) h.inn[v] = (h.inn[v] ?? 0) + w * n;
    }
  }
  return h;
}

/** What a customer buying things from the item library probably hands over, and the change that makes. Used until there is real history. */
function fromPrices(prices: number[]): { amounts: Map<number, number>; need: Record<string, number>; total: number } {
  const amounts = new Map<number, number>(); const need: Record<string, number> = {}; let total = 0;
  for (const price of prices) {
    const p = roundCash(price); if (p <= 0 || p > 10000) continue;
    const i = NOTES_PAID.findIndex(n => n >= p); if (i < 0) continue;
    const next = NOTES_PAID[i + 1]; const picks: [number, number][] = next !== undefined && next <= 5000 ? [[NOTES_PAID[i], 0.7], [next, 0.3]] : [[NOTES_PAID[i], 1]];
    for (const [note, w] of picks) {
      const chg = note - p; if (chg <= 0) continue;
      total += w; amounts.set(chg, (amounts.get(chg) ?? 0) + w);
      let left = chg; for (const d of CHANGE_DENOMS) { const n = Math.floor(left / d); if (n > 0) { need[String(d)] = (need[String(d)] ?? 0) + w * n; left -= n * d; } }
    }
  }
  return { amounts, need, total };
}

type SaleLike = { ts: string; type: string; tenders?: { kind: string }[] };
/** About how many cash sales happen between visits to the safe: half the average cash-sale day, kept between 4 and 12. */
export function horizonFrom(sales: SaleLike[], now: number): number {
  const days = new Map<string, number>();
  for (const s of sales) {
    if (s.type !== 'sale' || !s.tenders?.some(t => t.kind === 'cash')) continue;
    const t = new Date(s.ts).getTime(); if (!Number.isFinite(t) || now - t > 28 * DAY) continue;
    const key = s.ts.slice(0, 10); days.set(key, (days.get(key) ?? 0) + 1);
  }
  if (!days.size) return 6;
  const avg = [...days.values()].reduce((a, b) => a + b, 0) / days.size;
  return Math.max(4, Math.min(12, Math.round(avg / 2)));
}

function normalise(m: Map<number, number>): { cents: number; p: number }[] {
  const total = [...m.values()].reduce((a, b) => a + b, 0); if (total <= 0) return [];
  const list = [...m.entries()].map(([cents, w]) => ({ cents, p: w / total })).sort((a, b) => b.p - a.p || a.cents - b.cents).slice(0, MAX_AMOUNTS);
  const kept = list.reduce((a, b) => a + b.p, 0); return list.map(x => ({ cents: x.cents, p: x.p / kept }));
}

/**
 * Builds the profile from the ledger history (`entries`, as in `ledger.entries`), the sales list (only used to size the horizon) and
 * the item library prices. `now` is passed in so tests are exact.
 */
export function buildProfile(o: { entries: LedgerEntry[]; sales?: SaleLike[]; prices?: number[]; now?: number }): CashProfile {
  const now = o.now ?? Date.now(); const h = fromLedger(o.entries, now); const prior = fromPrices(o.prices ?? []);
  const horizon = horizonFrom(o.sales ?? [], now);
  const haveHist = h.nChange > 0; const havePrior = prior.total > 0;
  if (!haveHist && !havePrior) return { ...emptyProfile(), horizon };
  const conf = haveHist ? h.nChange / (h.nChange + CONFIDENCE_SAMPLES) : 0; const amounts = new Map<number, number>(); const need: Record<string, number> = {};
  if (haveHist) { for (const [c, w] of h.amounts) amounts.set(c, (amounts.get(c) ?? 0) + (havePrior ? conf : 1) * (w / h.nChange)); for (const [v, n] of Object.entries(h.need)) need[v] = (need[v] ?? 0) + (havePrior ? conf : 1) * (n / h.nChange); }
  if (havePrior) { const pw = haveHist ? 1 - conf : 1; for (const [c, w] of prior.amounts) amounts.set(c, (amounts.get(c) ?? 0) + pw * (w / prior.total)); for (const [v, n] of Object.entries(prior.need)) need[v] = (need[v] ?? 0) + pw * (n / prior.total); }
  const inPer: Record<string, number> = {}; if (h.nIn > 0) for (const [v, n] of Object.entries(h.inn)) inPer[v] = n / h.nIn;
  return { amounts: normalise(amounts), needPerSale: need, inPerSale: inPer, horizon, confidence: conf, source: haveHist ? (havePrior ? 'blend' : 'history') : 'prices', samples: h.nChange };
}

/** Share (0 to 1) of the usual change amounts the drawer `after` could still make exactly. */
export function coverage(after: Counts, profile: CashProfile): number {
  if (!profile.amounts.length) return 1;
  const reach = reachableSums(after, Math.max(...profile.amounts.map(a => a.cents)));
  return profile.amounts.reduce((s, a) => s + (reach.has(a.cents) ? a.p : 0), 0);
}
/** Half of what customers are expected to hand over in the next few sales can be given back again, so it counts towards what is on hand. */
const IN_CREDIT = 0.5;
/** 0 = every note and coin is stocked for the next `horizon` sales, 1 = all are out. Notes and coins used more count more. */
export function depth(after: Counts, profile: CashProfile): number {
  const need = Object.entries(profile.needPerSale).map(([v, n]) => [v, n * profile.horizon] as const).filter(([, n]) => n >= 0.5);
  const sum = need.reduce((s, [, n]) => s + n, 0); if (sum <= 0) return 0;
  let out = 0;
  for (const [v, n] of need) { const have = (after[v] ?? 0) + IN_CREDIT * (profile.inPerSale[v] ?? 0) * profile.horizon; out += (n / sum) * Math.max(0, n - have) / n; }
  return out;
}
/** The number the planner maximises. */
export function scoreAfter(after: Counts, pieces: number, profile: CashProfile): number {
  return SCORE_WEIGHTS.coverage * coverage(after, profile) - SCORE_WEIGHTS.depth * depth(after, profile) - SCORE_WEIGHTS.piece * pieces;
}

/** Notes and coins the drawer is expected to run short of over the next few sales. */
export function lowOn(after: Counts, profile: CashProfile): number[] {
  return Object.entries(profile.needPerSale).map(([v, n]) => ({ v: Number(v), want: n * profile.horizon })).filter(x => x.want >= 1 && (after[String(x.v)] ?? 0) + IN_CREDIT * (profile.inPerSale[String(x.v)] ?? 0) * profile.horizon < x.want * 0.5).map(x => x.v).sort((a, b) => b - a);
}
const pct = (x: number) => `${Math.round(x * 100)}%`;
/**
 * Replacement for the plain "is this change worth giving" rule when smart change is on. Empty = no concerns.
 * `pool` is the drawer plus what the customer hands over; `change` is what would go back.
 */
export function smartTightness(pool: Counts, change: Counts, profile: CashProfile): string[] {
  if (!profileUsable(profile)) return [];
  const after = cleanCounts(diffCounts(pool, change)); const before = coverage(pool, profile); const now = coverage(after, profile); const out: string[] = [];
  if (now < 0.5) out.push(`leaves the drawer able to make change for only ${pct(now)} of your usual sales`);
  else if (before - now >= 0.15) out.push(`drops the share of usual change you could still make from ${pct(before)} to ${pct(now)}`);
  const low = lowOn(after, profile).filter(v => v <= 2000); if (low.length) out.push(`leaves you short of ${low.map(denomLabel).join(', ')} for the next few sales`);
  return out;
}

export type SmartPlan =
  | { kind: 'none' }
  | { kind: 'impossible'; truncated: boolean }
  | { kind: 'exact'; counts: Counts; truncated: boolean; alternatives: Counts[]; why: string; smart: boolean };

const MAX_CANDIDATES = 400;
/**
 * Same job as `planChange` (exact change from `pool`, which is the drawer plus what was just handed over), but picks the best-scoring exact
 * combination for the profile. It never changes WHETHER change can be made, only which notes and coins. With no usable profile it returns
 * the same answer as planChange (fewest pieces). `alternatives` are the next best, for a "show me another way" button.
 */
export function planChangeSmart(pool: Counts, owed: number, profile: CashProfile | null | undefined, maxNodes = 150000, keep = 3): SmartPlan {
  const quick = planChange(pool, owed, maxNodes);
  if (quick.kind !== 'exact') return quick;
  if (!profileUsable(profile)) return { ...quick, alternatives: [], why: '', smart: false };
  const avail = cleanCounts(Object.fromEntries(Object.entries(pool).filter(([, n]) => n > 0)));
  const { results, truncated } = findCombinationsLimited(avail, owed, 0, { maxNodes });
  const cands: { counts: Counts; pieces: number }[] = [];
  for (const r of results) {
    if (!r.exact) continue; const counts: Counts = {}; let pieces = 0;
    for (const [v, q] of Object.entries(r.values)) if (q.qty_used > 0) { counts[v] = q.qty_used; pieces += q.qty_used; }
    cands.push({ counts, pieces });
  }
  if (!cands.length) return { ...quick, alternatives: [], why: '', smart: false }; // search was cut short: keep the plain answer
  cands.sort((a, b) => a.pieces - b.pieces); const pool2 = cands.slice(0, MAX_CANDIDATES);
  const scored = pool2.map(c => ({ ...c, score: scoreAfter(cleanCounts(diffCounts(avail, c.counts)), c.pieces, profile) })).sort((a, b) => b.score - a.score || a.pieces - b.pieces);
  const best = scored[0]; const fewest = quick.counts;
  return { kind: 'exact', counts: best.counts, truncated: quick.truncated || truncated, alternatives: scored.slice(1, 1 + keep).map(s => s.counts), why: explainChoice(avail, best.counts, fewest), smart: true };
}

/** Plain-words reason for the choice, compared with the quickest way. */
export function explainChoice(pool: Counts, chosen: Counts, fewest: Counts): string {
  const same = Object.keys({ ...chosen, ...fewest }).every(v => (chosen[v] ?? 0) === (fewest[v] ?? 0));
  if (same) return 'Quickest way, and it keeps the drawer well stocked.';
  const keeps = Object.entries(diffCounts(diffCounts(pool, chosen), diffCounts(pool, fewest))).filter(([, n]) => n > 0).sort((a, b) => Number(b[0]) - Number(a[0])).slice(0, 2).map(([v, n]) => `${n} more ${denomLabel(Number(v))}`);
  const extra = piecesOf(chosen) - piecesOf(fewest);
  return `${extra > 0 ? `${extra} more piece${extra === 1 ? '' : 's'} to count, but keeps` : 'Keeps'} ${keeps.length ? keeps.join(' and ') : 'a better mix'} in the drawer for upcoming change.`;
}

/** One line saying what the smart-change numbers are based on (shown under the toggle and on Check change). */
export function profileNote(p: CashProfile | null | undefined): string {
  if (!profileUsable(p)) return 'Smart change is on, but there is no history or item prices to learn from yet, so it picks the fewest pieces.';
  if (p.source === 'prices') return 'Smart change is on. No tracked cash sales yet, so it is guessing from your item prices.';
  const n = Math.round(p.samples);
  return p.source === 'history' ? `Smart change is on, learned from your recent cash sales (about ${n} counted, newest weigh most).` : `Smart change is on, learned from about ${n} recent cash sales plus your item prices (history takes over as sales build up).`;
}
