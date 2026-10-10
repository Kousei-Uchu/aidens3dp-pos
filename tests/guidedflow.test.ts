// Location: tests/guidedflow.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, STEP_IDS, back, barState, canAdvance, next, progress, settle, stepInfo } from '../src/lib/guidedFlow';

const empty = { itemCount: 0, payStarted: false }; const some = { itemCount: 2, payStarted: false }; const part = { itemCount: 2, payStarted: true };

test('five steps in the order a sale goes', () => {
  assert.deepEqual(STEP_IDS, ['items', 'customer', 'discount', 'review', 'pay']);
  for (const s of STEPS) { assert.ok(s.question.endsWith('?')); assert.ok(s.help.length > 20); }
  assert.equal(stepInfo('review').label, 'Check'); assert.deepEqual(progress('discount'), { n: 3, total: 5 });
});
test('Next walks forward and stops at Pay', () => {
  let s = STEP_IDS[0]; const seen = [s]; for (let i = 0; i < 8; i++) { s = next(s); seen.push(s); }
  assert.deepEqual(seen.slice(0, 5), STEP_IDS); assert.equal(s, 'pay');
});
test('cannot leave Items with an empty cart, and says why in plain words', () => {
  const r = canAdvance('items', empty); assert.equal(r.ok, false); assert.match(r.why ?? '', /Add at least one item/);
  assert.equal(canAdvance('items', some).ok, true); assert.equal(canAdvance('customer', empty).ok, true); assert.equal(canAdvance('review', some).ok, true);
});
test('Back goes one step; from Pay it returns to the check', () => {
  assert.equal(back('review', some), 'discount'); assert.equal(back('pay', some), 'review'); assert.equal(back('items', some), 'items');
});
test('a part-paid sale cannot be walked back into editing', () => {
  assert.equal(settle('items', part), 'pay'); assert.equal(settle('review', part), 'pay'); assert.equal(back('pay', part), 'review');
});
test('an empty cart (new sale, or the sale just finished) restarts at Items; otherwise the step is kept', () => {
  for (const s of STEP_IDS) assert.equal(settle(s, empty), 'items');
  for (const s of STEP_IDS) assert.equal(settle(s, some), s);
});
test('step bar marks done, current and to come', () => {
  assert.deepEqual(barState('discount'), ['done', 'done', 'current', 'todo', 'todo']); assert.deepEqual(barState('items'), ['current', 'todo', 'todo', 'todo', 'todo']);
});
