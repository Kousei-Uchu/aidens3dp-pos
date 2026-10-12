// Location: src/lib/changeImpact.ts
// 0088: the "is this change worth giving?" judge, and the small sales simulator behind it (the float report uses the same simulator, 0089).
// Pure (no React, no store), tested in tests/changeimpact.test.ts. All amounts are integer cents.
//
// The old rule asked "is the drawer short of anything after this?", so a drawer that was already out of $20s warned about $4 of change.
// This one asks the only question that matters: does giving THIS change make the next sales harder than saying no (card) would?
//  1. A fixed, seeded script of upcoming cash sales is drawn from the profile (the change amounts you usually give, and the note
//     customers usually hand over for each). Seeded, so the same drawer always gets the same answer.
//  2. The script is played twice: against the drawer as it is now ("decline"), and against the drawer after taking the customer's
//     notes in and giving the change out ("accept"). Each sale is made exactly from what is in the drawer plus the note just handed
//     over; a sale that cannot be made exactly counts as a failure and the drawer is left as it was.
//  3. Only the difference matters. Out of $20s already, and the change does not touch $20s: both runs fail the same sales, no warning.
//  4. If the difference is big enough, the change is re-run with each note or coin it spent put back, one at a time, to find which
//     ones are to blame, and the warning names them.
// With no profile (smart change off, or no history yet) a generic spread of change amounts is used, so the rule still works.
import { cleanCounts, denomLabel, type Counts } from './cashLedger';
import { profileUsable, type CashProfile } from './changeScore';

const NOTES = [500, 1000, 2000, 5000, 10000];
const TRIALS = 160;
const SEED = 20261012;
/** Warn when giving the change makes at least this share of the next sales fail more often than declining would (8 points). */
export const WARN_DELTA = 0.08;
/** A note or coin counts as "to blame" when putting it back removes at least this share of the extra failures. */
const BLAME_SHARE = 0.3;
const NODE_CAP = 4000;

/** Small seeded generator (mulberry32): the same seed always gives the same numbers. */
function rng(seed: number): () => number {
  let a = seed | 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Exact change for `owed` from `pool`, largest notes first with backtracking (so a drawer short of $10s still finds $5 + $5).
 * null when it cannot be made exactly (or the search cap is hit, which for a cash drawer means it is not worth the cashier's time).
 */
export function makeChange(pool: Counts, owed: number, cap = NODE_CAP): Counts | null {
  if (owed <= 0) return {};
  const ds = Object.keys(pool).map(Number).filter(v => v > 0 && (pool[String(v)] ?? 0) > 0).sort((a, b) => b - a);
  const reach = new Array(ds.length + 1).fill(0); for (let i = ds.length - 1; i >= 0; i--) reach[i] = reach[i + 1] + ds[i] * pool[String(ds[i])];
  if (reach[0] < owed) return null;
  const picked: [number, number][] = []; let nodes = 0;
  const go = (i: number, left: number): boolean => {
    if (left === 0) return true; if (i === ds.length || reach[i] < left || ++nodes > cap) return false;
    const v = ds[i];
    for (let q = Math.min(pool[String(v)], Math.floor(left / v)); q >= 0; q--) { if (q) picked.push([v, q]); if (go(i + 1, left - q * v)) return true; if (q) picked.pop(); }
    return false;
  };
  if (!go(0, owed)) return null;
  const out: Counts = {}; for (const [v, q] of picked) out[String(v)] = q; return out;
}

/** What to plan for when there is no profile: any change amount from $1 to $30 in 50c steps is equally likely. */
export function genericProfile(): CashProfile {
  const cents: number[] = []; for (let c = 100; c <= 3000; c += 50) cents.push(c);
  return { amounts: cents.map(c => ({ cents: c, p: 1 / cents.length })), needPerSale: {}, inPerSale: {}, horizon: 6, confidence: 0, source: 'none', samples: 0 };
}

export type Sale = { change: number; tender: number };
export type Script = Sale[][];

/** The note a customer hands over for a sale that needs `change` back: what the history says they hand over, else the next note up (70%) or the one above it (30%). 0 = no note can cover it. */
function tenderFor(change: number, profile: CashProfile, u: number): number {
  const higher = NOTES.filter(n => n > change); if (!higher.length) return 0;
  const learned = higher.map(n => profile.inPerSale[String(n)] ?? 0); const useLearned = learned.some(w => w > 0);
  const w = useLearned ? learned.map((x, i) => x + (i === 0 ? 0.02 : 0)) : higher.map((n, i) => (i === 0 ? 0.7 : i === 1 && n <= 5000 ? 0.3 : 0));
  const total = w.reduce((a, b) => a + b, 0); let r = u * total;
  for (let i = 0; i < higher.length; i++) { r -= w[i]; if (r < 0) return higher[i]; }
  return higher[0];
}

/** `trials` imagined runs of `sales` cash sales each (default: the profile's horizon). Build it once and play it against every drawer being compared. */
export function makeScript(profile: CashProfile, o: { trials?: number; sales?: number; seed?: number } = {}): Script {
  const rnd = rng(o.seed ?? SEED); const trials = o.trials ?? TRIALS; const sales = o.sales ?? profile.horizon;
  const amounts = profile.amounts.length ? profile.amounts : genericProfile().amounts; const out: Script = [];
  for (let t = 0; t < trials; t++) {
    const run: Sale[] = [];
    for (let s = 0; s < sales; s++) {
      let r = rnd(); let change = amounts[amounts.length - 1].cents; for (const a of amounts) { r -= a.p; if (r < 0) { change = a.cents; break; } }
      const tender = tenderFor(change, profile, rnd()); if (tender > 0) run.push({ change, tender });
    }
    out.push(run);
  }
  return out;
}

export type PlayResult = { rate: number; failed: number; total: number };
/** Plays the script against `drawer`. A sale that cannot be made exactly is a failure (the customer pays by card and the drawer is left alone). */
export function play(drawer: Counts, script: Script): PlayResult {
  const start = cleanCounts(Object.fromEntries(Object.entries(drawer).filter(([, n]) => n > 0))); let failed = 0; let total = 0;
  for (const run of script) {
    const d: Counts = { ...start };
    for (const s of run) {
      total++; const pool: Counts = { ...d }; pool[String(s.tender)] = (pool[String(s.tender)] ?? 0) + 1;
      const give = makeChange(pool, s.change);
      if (!give) { failed++; continue; }
      for (const [v, n] of Object.entries(pool)) d[v] = n - (give[v] ?? 0);
    }
  }
  return { rate: total ? failed / total : 0, failed, total };
}

export type Judgement = {
  /** Reasons it may not be worth it, as phrases that follow "That ...". Empty = fine. */
  tight: string[];
  /** Share (0 to 1) of the next sales that could not be given exact change if we say no (card) and if we say yes. */
  declineRate: number; acceptRate: number;
  /** The notes and coins to blame (cents), most to blame first. */
  culprits: number[];
  /** True when there was no profile and the generic spread of change amounts was used. */
  generic: boolean;
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
/** A later way of making the same change has to be at least this much better (2 points) to replace the first, so noise never flips the choice. */
const SWITCH_GAIN = 0.02;

const drawerAfter = (pool: Counts, change: Counts): Counts => { const after: Counts = { ...pool }; for (const [v, n] of Object.entries(change)) after[v] = (after[v] ?? 0) - n; return after; };

/**
 * `drawer`: what the ledger holds now. `take`: the notes and coins the customer hands over. `options`: different exact ways of giving the same
 * change, the preferred one first. Plays the next sales against the drawer as it is (card) and against each way of giving the change, uses the
 * first way unless a later one is clearly kinder to the next sales, and warns only if the chosen way still makes sales fail noticeably more often
 * than declining would. `index` is the way chosen.
 */
export function judgeChoices(o: { drawer: Counts; take: Counts; options: Counts[]; profile?: CashProfile | null }): Judgement & { index: number } {
  const generic = !profileUsable(o.profile); const prof = generic ? genericProfile() : (o.profile as CashProfile);
  const before = cleanCounts(Object.fromEntries(Object.entries(o.drawer).filter(([, n]) => n > 0)));
  const pool: Counts = { ...before }; for (const [v, n] of Object.entries(o.take)) pool[v] = (pool[v] ?? 0) + n;
  const script = makeScript(prof); const decline = play(before, script);
  let index = 0; let accept = play(drawerAfter(pool, o.options[0] ?? {}), script);
  for (let i = 1; i < o.options.length && accept.rate - decline.rate >= WARN_DELTA; i++) { // only look for a kinder way when the first one would warn
    const alt = play(drawerAfter(pool, o.options[i]), script); if (accept.rate - alt.rate >= SWITCH_GAIN) { index = i; accept = alt; }
  }
  const change = o.options[index] ?? {}; const after = drawerAfter(pool, change); const delta = accept.rate - decline.rate;
  const quiet = { tight: [] as string[], declineRate: decline.rate, acceptRate: accept.rate, culprits: [] as number[], generic, index };
  if (delta < WARN_DELTA) return quiet;
  // who is to blame: put each spent note or coin back (up to what the drawer held before) and see how many of the extra failures go away
  const blame = Object.keys(change).map(Number).filter(v => (change[String(v)] ?? 0) > 0).map(v => {
    const restored = { ...after, [String(v)]: Math.max(after[String(v)] ?? 0, pool[String(v)] ?? 0) };
    return { v, gain: accept.rate - play(restored, script).rate };
  }).filter(x => x.gain > 0).sort((a, b) => b.gain - a.gain);
  const culprits = blame.filter(x => x.gain >= BLAME_SHARE * delta).slice(0, 2).map(x => x.v);
  const gone = culprits.filter(v => (after[String(v)] ?? 0) <= 0 && (pool[String(v)] ?? 0) > 0);
  const lead = gone.length ? `uses up the last ${gone.map(denomLabel).join(' and ')}` : culprits.length ? `uses ${culprits.map(v => `${change[String(v)]} × ${denomLabel(v)}`).join(' and ')}, which your next sales are likely to need` : 'leaves the drawer thin';
  const tail = `about ${pct(accept.rate)} of ${generic ? 'typical' : 'your usual'} sales would then get no exact change (${pct(decline.rate)} if you ask for card)`;
  return { ...quiet, tight: [`${lead}, so ${tail}`], culprits };
}

/** One way of giving the change: `judgeChoices` with a single option. */
export function judgeChange(o: { drawer: Counts; take: Counts; change: Counts; profile?: CashProfile | null }): Judgement {
  const { index: _index, ...j } = judgeChoices({ drawer: o.drawer, take: o.take, options: [o.change], profile: o.profile }); return j;
}
