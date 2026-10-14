import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contribution, emptyTotals, merge, staffSummary } from '../src/lib/rollup';
import type { SaleRecord } from '../src/lib/types';

const sale = (over: Partial<SaleRecord> = {}): SaleRecord => ({
  uuid: 's1', type: 'sale', ts: '2026-10-15T02:00:00Z', registerId: 'r1', registerName: 'Front', staff: 'Aiden',
  lines: [{ title: 'Mug', qty: 1, baseUnitCents: 2000, grossCents: 2000, discountCents: 0, netCents: 2000, costCents: 500, discountLabels: [], kind: 'item' }],
  itemsCents: 2000, discountCents: 0, netCents: 2000, tipCents: 0, totalCents: 2000, cogsCents: 500, feesCents: 0, roundingCents: 0,
  tenders: [{ id: 't', kind: 'card', amountCents: 2000, at: '2026-10-15T02:00:00Z' }], deals: [], ...over,
});

test('contribution records the cashier and their signed net', () => {
  const t = contribution(sale());
  assert.equal(t.byStaff?.Aiden.count, 1);
  assert.equal(t.byStaff?.Aiden.grossCents, 2000);
});

test('a sale with no cashier is attributed rather than dropped', () => {
  const t = contribution(sale({ staff: undefined }));
  assert.equal(t.byStaff?.Unattributed.count, 1);
  assert.equal(t.byStaff?.Unattributed.grossCents, 2000);
});

test('staff totals merge and a refund subtracts from the same cashier', () => {
  const refund = sale({ uuid: 's2', type: 'refund', refundOf: 's1', netCents: 2000, tenders: [{ id: 't2', kind: 'card', amountCents: 2000, at: '2026-10-15T03:00:00Z' }] });
  const t = merge(contribution(sale()), contribution(refund));
  assert.equal(t.byStaff?.Aiden.count, 2);
  assert.equal(t.byStaff?.Aiden.grossCents, 0);
  assert.deepEqual(staffSummary(t), [{ name: 'Aiden', count: 2, cents: 0 }]);
});

test('older totals with no byStaff still merge without a cashier', () => {
  const old = { ...emptyTotals(), byStaff: undefined } as unknown as ReturnType<typeof emptyTotals>;
  const t = merge(old, contribution(sale()));
  assert.equal(t.byStaff?.Aiden.grossCents, 2000);
  assert.deepEqual(staffSummary(emptyTotals()), []);
});
