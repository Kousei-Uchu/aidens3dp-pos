// Location: tests/transactionsmerge.test.ts
// The Transactions tab lists this register's sales and the other registers' sales once each, and labels the other registers' ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSales, otherRegisterName } from '../src/lib/transactionsMerge';
import type { SaleRecord } from '../src/lib/types';

const sale = (uuid: string, registerId: string, registerName = ''): SaleRecord => ({ uuid, registerId, registerName, type: 'sale', ts: '2026-11-11T01:00:00.000Z' } as unknown as SaleRecord);

test('another register\'s sales are added after this register\'s own, each once', () => {
  const out = mergeSales([sale('a', 'r1', 'Front')], [sale('b', 'r2', 'Back'), sale('b', 'r2', 'Back'), sale('c', 'r2', 'Back')], 'r1');
  assert.deepEqual(out.map(s => s.uuid), ['a', 'b', 'c']);
});
test('a shared row that is this register\'s own, or already listed, is dropped', () => {
  const out = mergeSales([sale('a', 'r1')], [sale('a', 'r2'), sale('x', 'r1'), sale('y', 'r2')], 'r1');
  assert.deepEqual(out.map(s => s.uuid), ['a', 'y']);
});
test('nothing shared, or a half-written row, changes nothing', () => {
  assert.deepEqual(mergeSales([sale('a', 'r1')], undefined, 'r1').map(s => s.uuid), ['a']);
  assert.deepEqual(mergeSales([sale('a', 'r1')], [null as unknown as SaleRecord, { registerId: 'r2' } as unknown as SaleRecord], 'r1').map(s => s.uuid), ['a']);
});
test('only a sale from another register gets a register label', () => {
  assert.equal(otherRegisterName(sale('a', 'r1', 'Front'), 'r1'), '');
  assert.equal(otherRegisterName(sale('b', 'r2', 'Back'), 'r1'), 'Back');
  assert.equal(otherRegisterName(sale('c', 'r2', ''), 'r1'), 'Another register');
  assert.equal(otherRegisterName(sale('d', 'r2', 'Back'), ''), '');
});
