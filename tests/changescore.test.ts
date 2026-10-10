// Location: tests/changescore.test.ts
// 0022: weighted ("smart") change: the profile learned from the ledger, the score, and the planner.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProfile, coverage, depth, emptyProfile, explainChoice, horizonFrom, planChangeSmart, profileNote, profileUsable, scoreAfter, smartTightness, type CashProfile } from '../src/lib/changeScore';
import { newEntry, totalOf, type Counts, type LedgerEntry } from '../src/lib/cashLedger';
import { planChange } from '../src/lib/cashSale';
import { checkChange } from '../src/lib/checkChange';

const NOW = Date.parse('2026-10-10T00:00:00Z'); const DAY = 86400000;
const at = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
const change = (id: string, given: Counts, daysAgo = 0, note?: string): LedgerEntry => newEntry('sale_change', Object.fromEntries(Object.entries(given).map(([v, n]) => [v, -n])), { saleUuid: id, ts: at(daysAgo), note });
const received = (id: string, got: Counts, daysAgo = 0): LedgerEntry => newEntry('sale_in', got, { saleUuid: id, ts: at(daysAgo) });
const profile = (o: Partial<CashProfile>): CashProfile => ({ ...emptyProfile(), ...o });

test('buildProfile: nothing to go on gives an unusable profile; the horizon still has a default', () => {
  const p = buildProfile({ entries: [], now: NOW }); assert.equal(profileUsable(p), false); assert.equal(p.source, 'none'); assert.equal(p.horizon, 6);
});
test('buildProfile: change amounts and notes used per sale come from the ledger', () => {
  const entries = [change('A', { '500': 1, '200': 1 }), change('B', { '500': 1, '200': 1 }), change('C', { '1000': 1 }), received('A', { '2000': 1 })];
  const p = buildProfile({ entries, now: NOW }); assert.equal(p.source, 'history'); assert.equal(p.confidence > 0 && p.confidence < 1, true);
  assert.deepEqual(p.amounts.map(a => a.cents), [700, 1000]); assert.ok(Math.abs(p.amounts[0].p - 2 / 3) < 1e-9);
  assert.ok(Math.abs(p.needPerSale['500'] - 2 / 3) < 1e-9); assert.ok(Math.abs(p.needPerSale['1000'] - 1 / 3) < 1e-9); assert.equal(p.inPerSale['2000'], 1);
  assert.ok(Math.abs(p.amounts.reduce((s, a) => s + a.p, 0) - 1) < 1e-9);
});
test('buildProfile: newer sales weigh more than old ones (14 day half-life)', () => {
  const entries = [change('NEW', { '500': 1 }, 0), change('OLD', { '1000': 1 }, 14)];
  const p = buildProfile({ entries, now: NOW }); const get = (c: number) => p.amounts.find(a => a.cents === c)!.p;
  assert.ok(Math.abs(get(500) - 2 / 3) < 1e-9); assert.ok(Math.abs(get(1000) - 1 / 3) < 1e-9);
});
test('buildProfile: cancelled sales, untracked entries and refunds are not demand', () => {
  const cancelled = newEntry('sale_change', { '500': 1 }, { saleUuid: 'X', ts: at(0), note: 'Sale cancelled: cash handed back' });
  const untracked = newEntry('sale_change', { '500': -1 }, { ts: at(0) }); const refund = newEntry('refund_out', { '500': -1 }, { saleUuid: 'R', ts: at(0) });
  assert.equal(profileUsable(buildProfile({ entries: [cancelled, untracked, refund], now: NOW })), false);
});
test('buildProfile: item prices stand in until there is history, then history takes over', () => {
  const prices = [1200, 1200, 450]; const p0 = buildProfile({ entries: [], prices, now: NOW });
  assert.equal(p0.source, 'prices'); assert.equal(p0.confidence, 0); assert.ok(p0.amounts.some(a => a.cents === 800)); // $12 paid with $20 = $8 back
  assert.ok((p0.needPerSale['500'] ?? 0) > 0);
  const many = Array.from({ length: 200 }, (_, i) => change('S' + i, { '1000': 1 }));
  const p1 = buildProfile({ entries: many, prices, now: NOW }); assert.equal(p1.source, 'blend'); assert.ok(p1.confidence > 0.9);
  assert.equal(p1.amounts[0].cents, 1000); assert.ok(p1.amounts[0].p > 0.9);
  assert.equal(buildProfile({ entries: [], prices: [0, -5, 99999], now: NOW }).source, 'none');
});
test('horizonFrom: half an average cash-sale day, kept between 4 and 12', () => {
  const day = (d: string, n: number) => Array.from({ length: n }, () => ({ ts: `${d}T10:00:00Z`, type: 'sale', tenders: [{ kind: 'cash' }] }));
  assert.equal(horizonFrom([...day('2026-10-09', 20), ...day('2026-10-08', 20)], NOW), 10);
  assert.equal(horizonFrom(day('2026-10-09', 2), NOW), 4); assert.equal(horizonFrom(day('2026-10-09', 90), NOW), 12);
  assert.equal(horizonFrom([{ ts: '2026-10-09T10:00:00Z', type: 'sale', tenders: [{ kind: 'card' }] }, { ts: '2026-10-09T10:00:00Z', type: 'refund', tenders: [{ kind: 'cash' }] }], NOW), 6);
  assert.equal(horizonFrom(day('2026-08-01', 30), NOW), 6); // too old to count
});
test('coverage: share of the usual change amounts the drawer could still make', () => {
  const p = profile({ amounts: [{ cents: 100, p: 0.5 }, { cents: 300, p: 0.5 }] });
  assert.equal(coverage({ '200': 1, '100': 3 }, p), 1); assert.equal(coverage({ '500': 1 }, p), 0); assert.equal(coverage({ '100': 1 }, p), 0.5); assert.equal(coverage({}, emptyProfile()), 1);
});
test('depth: 0 when stocked for the next sales, towards 1 as notes run out; only used notes count', () => {
  const p = profile({ horizon: 4, needPerSale: { '500': 1 }, inPerSale: {} });
  assert.equal(depth({ '500': 4 }, p), 0); assert.equal(depth({ '500': 2 }, p), 0.5); assert.equal(depth({}, p), 1); assert.equal(depth({ '1000': 9 }, p), 1);
  assert.equal(depth({ '500': 2 }, profile({ horizon: 4, needPerSale: { '500': 1 }, inPerSale: { '500': 1 } })), 0); // half of 4 expected in-flow covers the gap
});
test('planChangeSmart: with no usable profile it is exactly planChange', () => {
  const pool = { '1000': 1, '500': 1, '200': 2, '100': 3 };
  const quick = planChange(pool, 700); const s = planChangeSmart(pool, 700, null); const e = planChangeSmart(pool, 700, emptyProfile());
  for (const x of [s, e]) { assert.equal(x.kind, 'exact'); if (x.kind === 'exact' && quick.kind === 'exact') { assert.deepEqual(x.counts, quick.counts); assert.equal(x.smart, false); assert.deepEqual(x.alternatives, []); } }
  assert.equal(planChangeSmart({ '2000': 3 }, 500, emptyProfile()).kind, 'impossible'); assert.equal(planChangeSmart({ '500': 1 }, 0, null).kind, 'none');
});
test('planChangeSmart: keeps the notes the next sales will need, even if that is a few more pieces', () => {
  const pool = { '500': 1, '100': 5, '2000': 1 }; // $5 owed: a $5 note (1 piece) or five $1 coins
  const wantsFives = profile({ amounts: [{ cents: 500, p: 1 }], needPerSale: { '500': 2 }, horizon: 6, confidence: 1, source: 'history', samples: 20 });
  const wantsCoins = profile({ amounts: [{ cents: 100, p: 0.5 }, { cents: 300, p: 0.5 }], needPerSale: { '100': 2 }, horizon: 6, confidence: 1, source: 'history', samples: 20 });
  const a = planChangeSmart(pool, 500, wantsFives); const b = planChangeSmart(pool, 500, wantsCoins);
  assert.equal(a.kind, 'exact'); assert.equal(b.kind, 'exact');
  if (a.kind === 'exact') { assert.deepEqual(a.counts, { '100': 5 }); assert.equal(a.smart, true); assert.match(a.why, /more \$5/); assert.deepEqual(a.alternatives[0], { '500': 1 }); }
  if (b.kind === 'exact') { assert.deepEqual(b.counts, { '500': 1 }); assert.match(b.why, /Quickest way/); }
});
test('planChangeSmart: always exact, never uses more than exists, alternatives are other exact answers (random drawers)', () => {
  let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const dens = [2000, 1000, 500, 200, 100, 50, 20, 10, 5];
  const prof = profile({ amounts: [{ cents: 800, p: 0.4 }, { cents: 1500, p: 0.3 }, { cents: 250, p: 0.3 }], needPerSale: { '500': 0.8, '1000': 0.3, '200': 1, '100': 1.5 }, horizon: 6, confidence: 0.8, source: 'blend', samples: 12 });
  for (let i = 0; i < 60; i++) {
    const pool: Counts = {}; for (const d of dens) if (rnd() < 0.7) pool[String(d)] = Math.floor(rnd() * 5); const owed = 5 * (1 + Math.floor(rnd() * 300));
    const quick = planChange(pool, owed); const smart = planChangeSmart(pool, owed, prof);
    assert.equal(smart.kind, quick.kind, `pool ${JSON.stringify(pool)} owed ${owed}`);
    if (smart.kind === 'exact') for (const c of [smart.counts, ...smart.alternatives]) { assert.equal(totalOf(c), owed); for (const [v, n] of Object.entries(c)) assert.ok(n <= (pool[v] ?? 0)); }
  }
});
test('planChangeSmart: the chosen way never scores worse than the quickest way', () => {
  const pool = { '1000': 2, '500': 3, '200': 4, '100': 6, '50': 4, '20': 5, '10': 5, '5': 5 };
  const prof = profile({ amounts: [{ cents: 700, p: 0.5 }, { cents: 1300, p: 0.5 }], needPerSale: { '500': 1, '200': 1, '100': 1 }, horizon: 8, confidence: 1, source: 'history', samples: 30 });
  const quick = planChange(pool, 1350); const smart = planChangeSmart(pool, 1350, prof);
  assert.ok(quick.kind === 'exact' && smart.kind === 'exact');
  if (quick.kind === 'exact' && smart.kind === 'exact') {
    const after = (c: Counts) => Object.fromEntries(Object.entries(pool).map(([v, n]) => [v, n - (c[v] ?? 0)]));
    const pieces = (c: Counts) => Object.values(c).reduce((s, n) => s + n, 0);
    assert.ok(scoreAfter(after(smart.counts), pieces(smart.counts), prof) >= scoreAfter(after(quick.counts), pieces(quick.counts), prof) - 1e-9);
  }
});
test('explainChoice: says what is kept, or that it is the quickest way', () => {
  assert.match(explainChoice({ '500': 1, '100': 5 }, { '100': 5 }, { '500': 1 }), /4 more pieces to count, but keeps 1 more \$5/);
  assert.match(explainChoice({ '500': 1 }, { '500': 1 }, { '500': 1 }), /Quickest/);
});
test('smartTightness: warns when the change would leave the drawer unable to cover usual sales, quiet otherwise', () => {
  const prof = profile({ amounts: [{ cents: 500, p: 0.6 }, { cents: 1000, p: 0.4 }], needPerSale: { '500': 1 }, horizon: 4, confidence: 1, source: 'history', samples: 20 });
  const tight = smartTightness({ '500': 2, '1000': 1 }, { '500': 2 }, prof); assert.ok(tight.length >= 1); assert.match(tight.join(' '), /usual|short of \$5/);
  assert.deepEqual(smartTightness({ '500': 6, '1000': 3 }, { '500': 1 }, prof), []); assert.deepEqual(smartTightness({ '500': 1 }, { '500': 1 }, emptyProfile()), []);
});
test('checkChange: with a profile the warning comes from the profile; without one it is the plain rule, unchanged', () => {
  const drawer = { '500': 2, '1000': 1 }; const offered = { '2000': 1 }; // $15 due, $20 handed over: $5 change
  const prof = profile({ amounts: [{ cents: 500, p: 1 }], needPerSale: { '500': 1 }, horizon: 4, confidence: 1, source: 'history', samples: 20 });
  const plain = checkChange(drawer, offered, 1500); const smart = checkChange(drawer, offered, 1500, undefined, prof);
  assert.equal(plain.verdict, 'change'); assert.equal(smart.verdict, 'change');
  if (plain.verdict === 'change' && smart.verdict === 'change') { assert.deepEqual(plain.take, smart.take); assert.equal(totalOf(plain.change), totalOf(smart.change)); assert.ok(smart.tight.length >= 1); assert.match(smart.tight.join(' '), /usual|short of \$5/); }
  assert.deepEqual(checkChange(drawer, offered, 1500, undefined, null), plain);
});
test('profileNote: says where the numbers came from', () => {
  assert.match(profileNote(emptyProfile()), /no history/); assert.match(profileNote(profile({ amounts: [{ cents: 100, p: 1 }], source: 'prices' })), /item prices/);
  assert.match(profileNote(profile({ amounts: [{ cents: 100, p: 1 }], source: 'history', samples: 12.4 })), /about 12/); assert.match(profileNote(profile({ amounts: [{ cents: 100, p: 1 }], source: 'blend', samples: 3 })), /item prices/);
});
