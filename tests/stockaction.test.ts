// Location: tests/stockaction.test.ts
// 0182: stock actions from the Scan tab.
import test from 'node:test';
import assert from 'node:assert/strict';
import { attemptKey, planStockAction, planSignature, planSummary } from '../src/lib/stockAction';

const base = { mode: 'receive' as const, digits: '', remove: false, reason: 'correction' as const, current: 4 };

test('nothing to apply until a number is keyed', () => {
  assert.equal(planStockAction(base), null);
  assert.equal(planStockAction({ ...base, mode: 'adjust', digits: '0' }), null);
  assert.equal(planStockAction({ ...base, mode: 'count', digits: '' }), null);
});
test('receive always adds, with the received reason', () => {
  assert.deepEqual(planStockAction({ ...base, digits: '6', remove: true }), { kind: 'adjust', delta: 6, reason: 'received', next: 10 });
});
test('adjust adds or removes with the chosen reason and may go negative', () => {
  assert.deepEqual(planStockAction({ ...base, mode: 'adjust', digits: '2', reason: 'damaged', remove: true }), { kind: 'adjust', delta: -2, reason: 'damaged', next: 2 });
  assert.equal((planStockAction({ ...base, mode: 'adjust', digits: '9', remove: true }) as any).next, -5);
});
test('count sets the quantity, and 0 is a valid count', () => {
  assert.deepEqual(planStockAction({ ...base, mode: 'count', digits: '0' }), { kind: 'count', quantity: 0, reason: 'cycle_count_available', next: 0 });
});
test('an untracked item counts from 0', () => {
  assert.equal((planStockAction({ ...base, current: null, digits: '3' }) as any).next, 3);
});
test('summary reads plainly', () => {
  assert.equal(planSummary(planStockAction({ ...base, digits: '6' }), 4), 'Add 6: 4 becomes 10.');
  assert.equal(planSummary(planStockAction({ ...base, mode: 'count', digits: '7' }), 4), 'Count: set stock to 7 (was 4).');
  assert.equal(planSummary(null, 4), '');
});
test('a retry of the same action reuses its key, a changed one does not', () => {
  const p = planStockAction({ ...base, digits: '6' })!; const q = planStockAction({ ...base, digits: '7' })!;
  let k = 0; const make = () => `k${++k}`;
  const a = attemptKey(planSignature('v1', p), null, make);
  assert.equal(attemptKey(planSignature('v1', p), a, make).key, a.key);
  assert.notEqual(attemptKey(planSignature('v1', q), a, make).key, a.key);
  assert.notEqual(attemptKey(planSignature('v2', p), a, make).key, a.key);
});
