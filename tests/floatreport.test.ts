// Location: tests/floatreport.test.ts
// 0023: the daily float report: takings, what to take out, what to leave, top-up, banking big notes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ledgerTakings, recommendFloat } from '../src/lib/floatReport';
import { emptyProfile, type CashProfile } from '../src/lib/changeScore';
import { findCombinations, findCombinationsLimited } from '../src/lib/changeFinder';
import { newEntry, totalOf, type Counts } from '../src/lib/cashLedger';

const profile = (o: Partial<CashProfile>): CashProfile => ({ ...emptyProfile(), ...o });
const prof = profile({ amounts: [{ cents: 500, p: 0.4 }, { cents: 800, p: 0.3 }, { cents: 1500, p: 0.3 }], needPerSale: { '500': 0.8, '200': 0.6, '100': 1.2, '1000': 0.3 }, inPerSale: {}, horizon: 6, confidence: 1, source: 'history', samples: 30 });
const ts = (h: number) => new Date(Date.UTC(2026, 9, 10, h)).toISOString();

// 0228: a loan to the drawer is taken out with the takings, as an amount only, and the float is what is left without it
test('a loan owed back is added to what is taken out, and the float is reduced by it', () => {
  const drawer: Counts = { '5000': 1, '2000': 3, '1000': 4, '500': 2, '100': 10 }; // $170
  const plain = recommendFloat({ drawer, takings: 4000 });
  const loan = recommendFloat({ drawer, takings: 4000, loanOwed: 2000 });
  assert.equal(plain.loanOwed, 0); assert.equal(plain.loanBack, 0); assert.ok(!plain.notes.some(n => /loan/.test(n)));
  assert.equal(loan.loanOwed, 2000); assert.equal(loan.loanBack, 2000); assert.equal(loan.takeOutTarget, 6000); assert.equal(loan.best.takeOutTotal, 6000); assert.equal(loan.gap, 0);
  assert.equal(loan.suggestedFloat, plain.suggestedFloat - 2000); assert.equal(loan.best.keepTotal, totalOf(drawer) - 6000);
  assert.ok(loan.notes.some(n => /\$20\.00 of this is your loan/.test(n)));
});
test('a loan is taken back even when there are no takings', () => {
  const r = recommendFloat({ drawer: { '2000': 2, '500': 2 }, takings: 0, loanOwed: 2000 });
  assert.equal(r.best.takeOutTotal, 2000); assert.equal(r.loanBack, 2000); assert.ok(!r.notes.some(n => /No cash takings/.test(n)));
});
test('a loan amount that makes no sense is ignored, and one the drawer cannot cover is capped and still shown as owed', () => {
  const drawer: Counts = { '2000': 1 };
  for (const bad of [NaN, -500, undefined]) { const r = recommendFloat({ drawer, takings: 0, loanOwed: bad as number }); assert.equal(r.loanOwed, 0); assert.equal(r.loanBack, 0); }
  const big = recommendFloat({ drawer, takings: 0, loanOwed: 99900 });
  assert.equal(big.loanOwed, 99900); assert.equal(big.loanBack, 2000); assert.ok(big.notes.some(n => /still owed back/.test(n)));
});
test('the loan is always taken in full, with the profile too, and the takings floor sits on top of it', () => {
  const drawer: Counts = { '5000': 1, '2000': 4, '1000': 6, '500': 8, '200': 10, '100': 12 };
  const r = recommendFloat({ drawer, takings: 3000, loanOwed: 5000, profile: prof, budgetMs: 200, maxNodes: 30000 });
  assert.equal(r.takeOutFloor, Math.ceil(3000 * 0.75) + 5000);
  for (const o of [r.best, ...r.alternatives]) assert.ok(o.takeOutTotal >= r.takeOutFloor, `took ${o.takeOutTotal}`);
});

// 0228: never less than 75% of the takings goes to you
test('the take-out is never less than three quarters of the takings, with or without a history', () => {
  const drawer: Counts = { '5000': 1, '2000': 4, '1000': 6, '500': 8, '200': 10, '100': 12, '50': 6, '20': 5, '10': 5, '5': 5 };
  for (const takings of [800, 2300, 3900, 6500]) {
    const floor = Math.ceil(takings * 0.75);
    const withProfile = recommendFloat({ drawer, takings, profile: prof, budgetMs: 200, maxNodes: 30000 });
    assert.equal(withProfile.takeOutFloor, floor);
    for (const o of [withProfile.best, ...withProfile.alternatives]) assert.ok(o.takeOutTotal >= floor, `takings ${takings}: took ${o.takeOutTotal}`);
    assert.ok(recommendFloat({ drawer, takings }).best.takeOutTotal >= floor, `no history, takings ${takings}`);
  }
});
test('the takings floor holds when the notes in the drawer do not make the amount, and it says how far over it goes', () => {
  const r = recommendFloat({ drawer: { '5000': 1, '2000': 1 }, takings: 3000 }); // $20 is under 75% of $30, so $50 comes out instead
  assert.deepEqual(r.best.takeOut, { '5000': 1 }); assert.equal(r.gap, 2000); assert.ok(r.notes.some(n => /Takes \$20\.00 more/.test(n)));
  const short = recommendFloat({ drawer: { '500': 2 }, takings: 3000 }); // the drawer holds less than the takings: everything it holds, never more
  assert.equal(short.best.takeOutTotal, 1000);
});

test('ledgerTakings: received minus change minus cash refunds since a time, and how many sales', () => {
  const since = Date.UTC(2026, 9, 10, 0);
  const e = [
    newEntry('sale_in', { '2000': 1 }, { saleUuid: 'A', ts: ts(9) }), newEntry('sale_change', { '500': -1, '100': -3 }, { saleUuid: 'A', ts: ts(9) }),
    newEntry('sale_in', { '1000': 1 }, { saleUuid: 'B', ts: ts(10) }), newEntry('refund_out', { '500': -1 }, { saleUuid: 'R', ts: ts(11) }),
    newEntry('sale_in', { '5000': 1 }, { saleUuid: 'OLD', ts: new Date(Date.UTC(2026, 9, 9, 12)).toISOString() }), newEntry('paid_in', { '2000': 1 }, { ts: ts(12) }),
  ];
  assert.deepEqual(ledgerTakings(e, since), { cents: 2000 - 800 + 1000 - 500, sales: 2 });
});
test('recommendFloat: with no profile it takes the largest notes first, never more than the takings, and says so', () => {
  const drawer = { '5000': 1, '2000': 3, '500': 4, '100': 10 }; const r = recommendFloat({ drawer, takings: 9000 });
  assert.equal(r.usedProfile, false); assert.deepEqual(r.best.takeOut, { '5000': 1, '2000': 2 }); assert.equal(r.gap, 0); assert.equal(r.best.keepTotal, totalOf(drawer) - 9000); assert.match(r.notes.join(' '), /No cash history/);
});
test('recommendFloat: nothing to bank when there are no takings; takings above the drawer are capped and flagged', () => {
  const r0 = recommendFloat({ drawer: { '2000': 2 }, takings: 0, profile: prof }); assert.deepEqual(r0.best.takeOut, {}); assert.match(r0.notes.join(' '), /No cash takings/);
  const r1 = recommendFloat({ drawer: { '2000': 2 }, takings: 9000, profile: prof }); assert.equal(r1.best.takeOutTotal <= 4000, true); assert.match(r1.notes.join(' '), /out of date/);
});
test('recommendFloat: with a profile it stays within $10 of the takings, never over-draws, and keeps the float stocked', () => {
  const drawer = { '5000': 1, '2000': 4, '1000': 6, '500': 8, '200': 10, '100': 12, '50': 6, '20': 5, '10': 5, '5': 5 }; const takings = 18000;
  const r = recommendFloat({ drawer, takings, profile: prof }); assert.equal(r.usedProfile, true);
  assert.ok(Math.abs(r.gap) <= 1000, `gap ${r.gap}`); for (const [v, n] of Object.entries(r.best.takeOut)) assert.ok(n <= (drawer as Counts)[v]);
  assert.equal(r.best.keepTotal, totalOf(drawer) - r.best.takeOutTotal);
  for (const alt of r.alternatives) { assert.ok(Math.abs(alt.takeOutTotal - takings) <= 1000); for (const [v, n] of Object.entries(alt.takeOut)) assert.ok(n <= (drawer as Counts)[v]); }
  assert.ok((r.failKeep ?? 1) <= 0.3, `failure rate ${r.failKeep}`);
});
test('recommendFloat: banks the notes the float does not need rather than the coins it does', () => {
  const drawer = { '5000': 2, '500': 6, '200': 6, '100': 8 }; // takings $100: two $50 notes, or a mix of the small change the float needs
  const r = recommendFloat({ drawer, takings: 10000, profile: prof }); assert.deepEqual(r.best.takeOut, { '5000': 2 }); assert.deepEqual(r.bankable, {});
});
test('the change finder\'s new `all` option returns near amounts even when exact ones exist (default behaviour unchanged)', () => {
  const drawer = { '2000': 1, '500': 3, '1000': 2, '200': 2 }; assert.ok(findCombinations(drawer, 2000, 0).length > 0);
  const near = findCombinationsLimited(drawer, 2000, 1000, { all: true }).results; const plain = findCombinations(drawer, 2000, 1000);
  assert.ok(plain.every(r => r.exact)); assert.ok(near.length > plain.length); assert.ok(near.some(r => !r.exact));
  const r = recommendFloat({ drawer, takings: 2000, profile: prof }); assert.ok(Math.abs(r.gap) <= 1000);
});
test('recommendFloat: a short float gets a top-up that lowers the failure rate and uses change denominations only', () => {
  const r = recommendFloat({ drawer: { '5000': 1, '500': 1 }, takings: 5000, profile: prof, budgetMs: Infinity });
  assert.ok(totalOf(r.topUp) > 0); for (const v of Object.keys(r.topUp)) assert.ok(Number(v) <= 2000);
  assert.ok(r.failKeep !== null && r.failTopUp !== null && r.failTopUp < r.failKeep); assert.equal(r.suggestedFloat, r.best.keepTotal + totalOf(r.topUp));
});
test('recommendFloat: no profile means no failure figures and no top-up', () => {
  const r = recommendFloat({ drawer: { '5000': 1, '500': 1 }, takings: 5000 }); assert.equal(r.failNow, null); assert.equal(r.failKeep, null); assert.equal(r.failTopUp, null); assert.deepEqual(r.topUp, {});
});
test('recommendFloat: $50 and $100 notes left in the drawer are listed as better banked', () => {
  const r = recommendFloat({ drawer: { '10000': 1, '5000': 1, '500': 20 }, takings: 1000, profile: prof }); assert.equal(Object.keys(r.bankable).length > 0, true);
  for (const v of Object.keys(r.bankable)) assert.ok(Number(v) >= 5000);
});
test('recommendFloat: random drawers never over-draw and stay within the tolerance', () => {
  let seed = 5; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const dens = [5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5];
  for (let i = 0; i < 40; i++) {
    const drawer: Counts = {}; for (const d of dens) if (rnd() < 0.8) drawer[String(d)] = Math.floor(rnd() * 6); const takings = 5 * Math.floor(rnd() * 600);
    for (const p of [null, prof]) { const r = recommendFloat({ drawer, takings, profile: p }); for (const [v, n] of Object.entries(r.best.takeOut)) assert.ok(n <= (drawer[v] ?? 0)); assert.ok(r.best.takeOutTotal <= Math.max(takings + 1000, totalOf(drawer))); assert.equal(r.best.keepTotal + r.best.takeOutTotal, totalOf(drawer)); }
  }
});
test('findCombinationsLimited: bigFirst finds the same set of ways when not cut short, and reaches big-note ways first when it is', () => {
  const drawer = { '5000': 1, '2000': 4, '1000': 6, '500': 8, '200': 10, '100': 12 };
  const a = findCombinationsLimited(drawer, 18000, 0, { all: true }).results; const b = findCombinationsLimited(drawer, 18000, 0, { all: true, bigFirst: true }).results;
  const key = (r: { values: Record<string, { qty_used: number }> }) => JSON.stringify(Object.entries(r.values).map(([v, q]) => [v, q.qty_used]).sort()); assert.deepEqual(a.map(key).sort(), b.map(key).sort());
  const cutA = findCombinationsLimited(drawer, 18000, 0, { maxNodes: 400 }); const cutB = findCombinationsLimited(drawer, 18000, 0, { maxNodes: 400, bigFirst: true });
  assert.ok(cutA.truncated && cutB.truncated); const bigNotes = (r: { values: Record<string, { qty_used: number }> }) => (r.values['5000']?.qty_used ?? 0) + (r.values['2000']?.qty_used ?? 0);
  if (cutB.results.length && cutA.results.length) assert.ok(Math.max(...cutB.results.map(bigNotes)) >= Math.max(...cutA.results.map(bigNotes)));
});
