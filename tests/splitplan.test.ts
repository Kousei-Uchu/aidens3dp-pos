// Location: tests/splitplan.test.ts
// 0086: split plans and the choices offered when cash does not cover a part.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyShortChoice, equalPlan, firstPlan, isSplit, planAfter, planTarget, shortChoices } from '../src/lib/splitPlan';

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

test('equal and first-amount plans always add up to what remains', () => {
  assert.deepEqual(equalPlan(10000, 3), [3334, 3333, 3333]); assert.deepEqual(equalPlan(9000, 3), [3000, 3000, 3000]);
  assert.deepEqual(firstPlan(10000, 2000), [2000, 8000]); assert.deepEqual(firstPlan(10000, 10000), []); assert.deepEqual(firstPlan(10000, 0), []);
  assert.equal(equalPlan(5, 1).length, 0); assert.equal(isSplit(equalPlan(100, 2)), true); assert.equal(isSplit([5000]), false);
});

test('planTarget: the first part of a split, never more than remains; the whole remainder otherwise', () => {
  assert.equal(planTarget([3000, 6000], 9000), 3000); assert.equal(planTarget([3000, 6000], 2500), 2500); assert.equal(planTarget([], 7000), 7000); assert.equal(planTarget([7000], 7000), 7000);
});

test('planAfter shares what is left across the later parts like before (equal stays equal, cents to the first)', () => {
  // $90.00 in 3: first pays $30.00, second pays only $20.00 and counts as a share: $40.00 left for one person
  let p = equalPlan(9000, 3); p = planAfter(p, 6000); assert.deepEqual(p, [3000, 3000]);
  p = planAfter(p, 4000); assert.deepEqual(p, []);
  // 4 equal on $100.01 after a $10.00 payment: 9001 left over 3
  assert.deepEqual(planAfter(equalPlan(10001, 4), 9001), [3001, 3000, 3000]);
  assert.equal(sum(planAfter([2000, 3000, 5000], 7000)), 7000);
});

test('two payments left: offer the other part into payment 2, or change the split', () => {
  const c = shortChoices([5000, 5000], 3000);
  assert.deepEqual(c.map(x => x.kind), ['next', 'modify']);
  assert.deepEqual(c[0], { kind: 'next', shortBy: 2000, part: 2, was: 5000, now: 7000 });
  assert.deepEqual(applyShortChoice([5000, 5000], c[0]), [7000]);
});

test('more than two: any later payment, spread when each later one rises by whole dollars, or change the split', () => {
  const plan = [3000, 3000, 3000, 3000]; const c = shortChoices(plan, 0);
  assert.deepEqual(c.map(x => x.kind), ['part', 'part', 'part', 'spread', 'modify']);
  assert.deepEqual(applyShortChoice(plan, c[1]), [3000, 6000, 3000]);       // into payment 3
  assert.deepEqual(applyShortChoice(plan, c[3]), [4000, 4000, 4000]);       // $30.00 over 3 = $10.00 each
  for (const x of c) if (x.kind !== 'modify') assert.equal(sum(applyShortChoice(plan, x)), sum(plan) - plan[0] + (plan[0] - 0));
});

test('spread is refused when it would not be a whole dollar per payment', () => {
  assert.equal(shortChoices([3000, 3000, 3000, 3000], 500).some(x => x.kind === 'spread'), false);           // $25.00 over 3
  assert.equal(shortChoices([3000, 3000, 3000], 1000).some(x => x.kind === 'spread'), true);                // $20.00 over 2 = $10.00
  assert.equal(shortChoices([3000, 3000, 3000], 1100).some(x => x.kind === 'spread'), false);               // $19.00 over 2 = $9.50
  assert.equal(shortChoices([3334, 3333, 3333], 0).some(x => x.kind === 'spread'), false);                  // $33.34 over 2
});

test('nothing is offered when it is not a split or the part is covered', () => {
  assert.deepEqual(shortChoices([], 100), []); assert.deepEqual(shortChoices([5000], 100), []); assert.deepEqual(shortChoices([5000, 5000], 5000), []); assert.deepEqual(shortChoices([5000, 5000], 6000), []);
});
