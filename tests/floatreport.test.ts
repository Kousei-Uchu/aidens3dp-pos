// Location: tests/floatreport.test.ts
// 0023: the daily float report: takings, what to take out, what to leave, top-up, banking big notes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { idealFloat, ledgerTakings, recommendFloat } from '../src/lib/floatReport';
import { emptyProfile, type CashProfile } from '../src/lib/changeScore';
import { findCombinations, findCombinationsLimited } from '../src/lib/changeFinder';
import { newEntry, totalOf, type Counts } from '../src/lib/cashLedger';

const profile = (o: Partial<CashProfile>): CashProfile => ({ ...emptyProfile(), ...o });
const prof = profile({ amounts: [{ cents: 500, p: 0.4 }, { cents: 800, p: 0.3 }, { cents: 1500, p: 0.3 }], needPerSale: { '500': 0.8, '200': 0.6, '100': 1.2, '1000': 0.3 }, inPerSale: {}, horizon: 6, confidence: 1, source: 'history', samples: 30 });
const ts = (h: number) => new Date(Date.UTC(2026, 9, 10, h)).toISOString();

test('ledgerTakings: received minus change minus cash refunds since a time, and how many sales', () => {
  const since = Date.UTC(2026, 9, 10, 0);
  const e = [
    newEntry('sale_in', { '2000': 1 }, { saleUuid: 'A', ts: ts(9) }), newEntry('sale_change', { '500': -1, '100': -3 }, { saleUuid: 'A', ts: ts(9) }),
    newEntry('sale_in', { '1000': 1 }, { saleUuid: 'B', ts: ts(10) }), newEntry('refund_out', { '500': -1 }, { saleUuid: 'R', ts: ts(11) }),
    newEntry('sale_in', { '5000': 1 }, { saleUuid: 'OLD', ts: new Date(Date.UTC(2026, 9, 9, 12)).toISOString() }), newEntry('paid_in', { '2000': 1 }, { ts: ts(12) }),
  ];
  assert.deepEqual(ledgerTakings(e, since), { cents: 2000 - 800 + 1000 - 500, sales: 2 });
});
test('idealFloat: 1.5 × a day of usual change, to the nearest $10 up, kept in $50-$300; null with no profile', () => {
  assert.equal(idealFloat(null), null); assert.equal(idealFloat(emptyProfile()), null);
  const p = profile({ amounts: [{ cents: 1000, p: 1 }], horizon: 5 }); assert.equal(idealFloat(p), 15000); // 1000 × 10 sales × 1.5
  assert.equal(idealFloat(profile({ amounts: [{ cents: 100, p: 1 }], horizon: 4 })), 5000); assert.equal(idealFloat(profile({ amounts: [{ cents: 5000, p: 1 }], horizon: 12 })), 30000);
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
  assert.ok((r.coverageKeep ?? 0) >= 0.7, `coverage ${r.coverageKeep}`);
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
test('recommendFloat: a short float gets a top-up list that stays inside the gap and uses change denominations only', () => {
  const r = recommendFloat({ drawer: { '5000': 1, '500': 1 }, takings: 5000, profile: prof });
  assert.ok(r.ideal !== null && r.best.keepTotal < r.ideal); const up = totalOf(r.topUp); assert.ok(up > 0 && up <= r.ideal - r.best.keepTotal);
  for (const v of Object.keys(r.topUp)) assert.ok(Number(v) <= 2000);
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
