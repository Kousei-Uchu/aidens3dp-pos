import test from 'node:test';
import assert from 'node:assert/strict';
import { refundOperationKey } from '../src/lib/refundKey';

const base = {
  orderId: 'order-1', refundedCents: 0, refundable: [{ id: 'line-1', qty: 3 }],
  lines: [{ lineId: 'line-1', qty: 1 }], amountCents: 1200, method: 'original', reason: 'Returned Goods',
};

test('a retry of the same order snapshot produces the same refund operation key', () => {
  assert.equal(refundOperationKey(base), refundOperationKey({ ...base, lines: [...base.lines] }));
});

test('a changed refund amount, selection, or post-refund order snapshot gets a new key', () => {
  const key = refundOperationKey(base);
  assert.notEqual(refundOperationKey({ ...base, amountCents: 1100 }), key);
  assert.notEqual(refundOperationKey({ ...base, lines: [{ lineId: 'line-1', qty: 2 }] }), key);
  assert.notEqual(refundOperationKey({ ...base, refundedCents: 1200, refundable: [{ id: 'line-1', qty: 2 }] }), key);
  assert.notEqual(refundOperationKey({ ...base, method: 'gift_card:original' }), refundOperationKey({ ...base, method: 'gift_card:new' }));
});
