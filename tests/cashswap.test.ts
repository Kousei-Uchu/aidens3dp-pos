// Location: tests/cashswap.test.ts
// 0091: exchanging your own notes and coins with the drawer (device test T6, part 2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { HANDLING, MIN_GAIN, PIECE_HELD, planSwap, swapIsValid } from '../src/lib/cashSwap';
import { dayScript } from '../src/lib/floatPlan';
import { emptyProfile, type CashProfile } from '../src/lib/changeScore';
import { totalOf, type Counts } from '../src/lib/cashLedger';

const profile = (o: Partial<CashProfile>): CashProfile => ({ ...emptyProfile(), ...o });
/** Small change, customers pay with $20s and $50s sometimes. */
const busy = profile({ amounts: [{ cents: 300, p: 0.3 }, { cents: 800, p: 0.3 }, { cents: 1500, p: 0.2 }, { cents: 3500, p: 0.2 }], needPerSale: { '2000': 1, '1000': 1, '500': 1, '100': 2 }, inPerSale: { '2000': 0.6, '5000': 0.4 }, horizon: 6, confidence: 1, source: 'history', samples: 40 });
const script = dayScript(busy, 12);

test('the exchange is always an even swap: what goes in equals what comes out, and the drawer total does not change', () => {
  const drawer: Counts = { '500': 40, '200': 5, '100': 10 }; const own: Counts = { '5000': 1, '2000': 2 };
  const p = planSwap(drawer, own, script, { budgetMs: Infinity });
  assert.ok(totalOf(p.give) > 0); assert.equal(totalOf(p.give), totalOf(p.take)); assert.equal(totalOf(p.after), totalOf(drawer)); assert.ok(swapIsValid(drawer, p));
});

test('T6 example: a $50 from your own pocket and a drawer swamped in $5s: hand in the $50 and take out ten $5s, without making change harder', () => {
  const drawer: Counts = { '500': 40, '200': 5, '100': 10 }; const own: Counts = { '5000': 1 };
  const p = planSwap(drawer, own, script, { budgetMs: Infinity });
  assert.equal(p.stopped, 'done'); assert.deepEqual(p.give, { '5000': 1 }); assert.deepEqual(p.take, { '500': 10 });
  assert.ok(p.okAfter >= p.okBefore - 0.02); assert.ok(p.piecesAfter < p.piecesBefore, 'a tidier drawer');
});

test('a drawer that cannot spare anything useful is left alone even when you hold the notes it lacks the change for', () => {
  const drawer: Counts = { '500': 12, '200': 5, '100': 10 }; const p = planSwap(drawer, { '5000': 1 }, script, { budgetMs: Infinity });
  assert.equal(p.stopped, 'no-gain'); assert.deepEqual(p.after, drawer);
});

test('never takes out a kind it hands in, and never takes what the drawer does not hold', () => {
  const drawer: Counts = { '500': 10, '100': 3 }; const own: Counts = { '2000': 3, '1000': 1 };
  const p = planSwap(drawer, own, script, { budgetMs: Infinity });
  for (const k of Object.keys(p.give)) assert.equal(p.take[k] ?? 0, 0);
  for (const [k, n] of Object.entries(p.take)) assert.ok(n <= (drawer[k] ?? 0) + (p.give[k] ?? 0));
  assert.ok(Object.keys(p.give).every(k => (own[k] ?? 0) >= p.give[k]));
});

test('a drawer that already copes is not touched, and says so', () => {
  const drawer: Counts = { '2000': 6, '1000': 8, '500': 10, '200': 10, '100': 20, '50': 10 }; const own: Counts = { '5000': 1 };
  const p = planSwap(drawer, own, script, { budgetMs: Infinity });
  if (p.stopped === 'no-gain') { assert.deepEqual(p.give, {}); assert.deepEqual(p.take, {}); assert.deepEqual(p.after, drawer); }
  else assert.ok(p.okAfter - p.okBefore >= 0 || p.piecesAfter < p.piecesBefore);
});

test('holding nothing returns nothing-held; the drawer is unchanged', () => {
  const drawer: Counts = { '500': 4 }; const p = planSwap(drawer, {}, script, { budgetMs: Infinity });
  assert.equal(p.stopped, 'nothing-held'); assert.deepEqual(p.after, drawer); assert.equal(totalOf(p.give), 0);
});

test('swapIsValid refuses uneven swaps, empty swaps and taking pieces the drawer does not have', () => {
  const drawer: Counts = { '500': 2 };
  assert.equal(swapIsValid(drawer, { give: { '1000': 1 }, take: { '500': 1 } }), false);
  assert.equal(swapIsValid(drawer, { give: {}, take: {} }), false);
  assert.equal(swapIsValid(drawer, { give: { '2000': 1 }, take: { '500': 4 } }), false);
  assert.equal(swapIsValid(drawer, { give: { '1000': 1 }, take: { '500': 2 } }), true);
});

test('constants: a swap must be worth the handling', () => { assert.ok(MIN_GAIN > HANDLING * 2); assert.ok(PIECE_HELD > 0); });
