// Location: tests/floatplan.test.ts
// 0089: the float planner. Device test T6: a drawer holding $106 with no $20s or $10s was told to add six $20s and a $10, valued by note size
// and by a float size guess. The planner now adds only what cuts the failure rate of a whole day of imagined cash sales.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DOLLAR_COST, GOOD_ENOUGH, MAX_TOPUP, dayScript, failRate, planTopUp, rankTakeOuts, type TakeOut } from '../src/lib/floatPlan';
import { recommendFloat } from '../src/lib/floatReport';
import { emptyProfile, type CashProfile } from '../src/lib/changeScore';
import { diffCounts, totalOf, type Counts } from '../src/lib/cashLedger';

const profile = (o: Partial<CashProfile>): CashProfile => ({ ...emptyProfile(), ...o });
/** A small stall: mostly small change, customers pay with $20s and the odd $10. */
const light = profile({ amounts: [{ cents: 300, p: 0.4 }, { cents: 500, p: 0.3 }, { cents: 800, p: 0.3 }], needPerSale: { '500': 0.7, '200': 1, '100': 1 }, inPerSale: { '2000': 0.8, '1000': 0.2 }, horizon: 6, confidence: 1, source: 'history', samples: 30 });
/** T6's drawer: $106, no $20s or $10s. */
const t6: Counts = { '500': 10, '200': 10, '100': 25, '50': 20, '20': 5 };

test('T6: a drawer that already copes with the day is not asked for anything, however few $20s and $10s it holds', () => {
  assert.equal(totalOf(t6), 10600);
  const r = recommendFloat({ drawer: t6, takings: 0, profile: light, budgetMs: Infinity });
  assert.deepEqual(r.topUp, {}); assert.ok((r.failNow ?? 1) <= GOOD_ENOUGH + 0.05); assert.equal(r.suggestedFloat, 10600);
});
test('planTopUp: a thin drawer is topped up with what cuts failures, the failure rate falls, and it never asks for $50 or $100 notes', () => {
  const script = dayScript(light); const keep: Counts = { '500': 6, '100': 6 };
  const p = planTopUp(keep, script, { budgetMs: Infinity }); assert.ok(totalOf(p.add) > 0); assert.ok(p.after < p.before);
  for (const v of Object.keys(p.add)) assert.ok(Number(v) <= 2000);
  const merged: Counts = { ...keep }; for (const [v, n] of Object.entries(p.add)) merged[v] = (merged[v] ?? 0) + n; assert.equal(failRate(merged, script), p.after);
});
test('planTopUp: asks for coins and small notes, not a pile of $20s, when small change is what fails (not valued by note size)', () => {
  const script = dayScript(light); const p = planTopUp({ '500': 6, '100': 6 }, script, { budgetMs: Infinity });
  assert.ok((p.add['2000'] ?? 0) * 2000 <= totalOf(p.add) / 2, `top-up ${JSON.stringify(p.add)}`);
});
test('planTopUp: respects maxAdd, is repeatable, and reports why it stopped', () => {
  const script = dayScript(light); const a = planTopUp({}, script, { maxAdd: 3000, budgetMs: Infinity }); assert.ok(totalOf(a.add) <= 3000);
  assert.deepEqual(a, planTopUp({}, script, { maxAdd: 3000, budgetMs: Infinity }));
  assert.equal(planTopUp(t6, script, { budgetMs: Infinity }).stopped, 'already-good');
  assert.ok(totalOf(planTopUp({}, script, { budgetMs: Infinity }).add) <= MAX_TOPUP);
});
test('planTopUp: with no time it stops at once and returns what it has (nothing yet)', () => {
  const p = planTopUp({}, dayScript(light), { budgetMs: -1 }); assert.equal(p.stopped, 'time'); assert.deepEqual(p.add, {});
});
test('planTopUp: a note that does not pay for its dollars is left out (the cost per dollar is real)', () => {
  assert.ok(DOLLAR_COST > 0); const script = dayScript(light);
  const p = planTopUp({ '500': 6, '100': 6 }, script, { budgetMs: Infinity }); const dollars = totalOf(p.add) / 100; assert.ok((p.before - p.after) * 100 > DOLLAR_COST * dollars * 0.5);
});
test('rankTakeOuts: prefers the way of banking that leaves a drawer coping with the day, then the one nearer the takings', () => {
  const drawer: Counts = { '2000': 2, '500': 6, '200': 6, '100': 8 }; const script = dayScript(light);
  const cands: TakeOut[] = [{ take: { '500': 6 }, pieces: 6, off: 0 }, { take: { '2000': 1, '500': 2 }, pieces: 3, off: 0 }, { take: { '2000': 2 }, pieces: 2, off: 1000 }];
  const r = rankTakeOuts(drawer, cands, script, 1.5, 3); assert.equal(r.length, 3);
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].fail * 100 + (1.5 * r[i - 1].off) / 100 <= r[i].fail * 100 + (1.5 * r[i].off) / 100 + 1e-9);
  for (const c of r) assert.ok(c.fail >= 0 && c.fail <= 1);
  const same = rankTakeOuts(drawer, [cands[0], { ...cands[0] }], script, 1.5); assert.deepEqual(same[0].take, cands[0].take);
});
test('recommendFloat with a profile: banking stays within $10 of takings, never over-draws, and the top-up is on top of what stays', () => {
  const drawer: Counts = { '5000': 1, '2000': 4, '1000': 6, '500': 8, '200': 10, '100': 12, '50': 6 }; const takings = 18000;
  const r = recommendFloat({ drawer, takings, profile: light, budgetMs: Infinity });
  assert.ok(Math.abs(r.gap) <= 1000); assert.deepEqual(diffCounts(drawer, r.best.takeOut), r.best.keep);
  assert.equal(r.suggestedFloat, r.best.keepTotal + totalOf(r.topUp)); assert.ok(r.failTopUp !== null && r.failKeep !== null && r.failTopUp <= r.failKeep + 1e-9);
});
test('banking keeps the coins and small notes a day of sales needs (a search cut short must not bank them)', () => {
  const drawer: Counts = { '5000': 1, '2000': 4, '1000': 6, '500': 8, '200': 10, '100': 12, '50': 6, '20': 5, '10': 5, '5': 5 };
  const p = profile({ amounts: [{ cents: 500, p: 0.4 }, { cents: 800, p: 0.3 }, { cents: 1500, p: 0.3 }], needPerSale: { '500': 0.8, '200': 0.6, '100': 1.2, '1000': 0.3 }, inPerSale: {}, horizon: 6, confidence: 1, source: 'history', samples: 30 });
  const r = recommendFloat({ drawer, takings: 18000, profile: p, budgetMs: Infinity });
  assert.ok((r.failKeep ?? 1) <= 0.15, `failure rate ${r.failKeep}`); assert.ok((r.best.keep['100'] ?? 0) >= 6 && (r.best.keep['500'] ?? 0) >= 4, JSON.stringify(r.best.keep));
  const cut = recommendFloat({ drawer, takings: 18000, profile: p, maxNodes: 3000, budgetMs: Infinity }); assert.ok((cut.failKeep ?? 1) <= 0.3, `cut short: ${cut.failKeep}`);
});
