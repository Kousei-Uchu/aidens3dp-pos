import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStartingStock } from '../src/lib/startingStock';

test('blank starting stock leaves Shopify default unchanged', () => {
  assert.deepEqual(parseStartingStock(''), { ok: true });
  assert.deepEqual(parseStartingStock('   '), { ok: true });
});

test('accepts zero and whole-number starting quantities', () => {
  assert.deepEqual(parseStartingStock('0'), { ok: true, quantity: 0 });
  assert.deepEqual(parseStartingStock('17'), { ok: true, quantity: 17 });
});

test('rejects negative, fractional, non-numeric, and unsafe quantities', () => {
  for (const value of ['-1', '2.5', 'abc', '9007199254740992']) assert.equal(parseStartingStock(value).ok, false);
});
