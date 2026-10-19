// Location: tests/saleshistory.test.ts
// The pure helpers behind the shop-wide sales view (the assistant across every till). They decide what a pos_sale row gives the
// tools, which rows this till keeps of another till's sales, and how the shared sales and daily totals join this till's own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afterPull, allSales, decodeSaleRow, emptySharedHistory, MAX_SHARED_SALES, mergeSharedRollups, sharedSalesOnly } from '../src/lib/salesHistory';
import { emptyTotals, type RollupRow } from '../src/lib/rollup';
import type { SaleRecord } from '../src/lib/types';

const at = (h: number, mon = 9, d = 18) => new Date(2026, mon, d, h, 0).toISOString();
const sale = (uuid: string, registerId: string, ts: string, over: Partial<SaleRecord> = {}): SaleRecord => ({
  uuid, type: 'sale', ts, registerId, registerName: `reg ${registerId}`, lines: [], itemsCents: 0, discountCents: 0, netCents: 0,
  tipCents: 0, totalCents: 0, cogsCents: 0, feesCents: 0, roundingCents: 0, tenders: [], deals: [], ...over,
});
const row = (registerId: string, date: string, over: Partial<ReturnType<typeof emptyTotals>> = {}): RollupRow =>
  ({ registerId, date, totals: { ...emptyTotals(), ...over } });

test('decodeSaleRow: the whole record from sale_json, nothing when the row has none or is broken', () => {
  const s = sale('u1', 'reg2', at(10), { orderName: '#1042', lines: [{ title: 'Tadling', qty: 2, baseUnitCents: 100, grossCents: 200, discountCents: 0, netCents: 200, costCents: 50, discountLabels: [], kind: 'item' }] });
  assert.deepEqual(decodeSaleRow({ sale_json: JSON.stringify(s) }), sale('u1', 'reg2', at(10), { orderName: '#1042', lines: s.lines }));
  assert.equal(decodeSaleRow({}), null); // a row from before the field existed: totals only
  assert.equal(decodeSaleRow({ sale_json: '{oops' }), null);
  assert.equal(decodeSaleRow({ sale_json: JSON.stringify({ uuid: 'u', type: 'sale' }) }), null); // missing the pieces the tools read
});

test('sharedSalesOnly: another till only, newest first, no uuid twice, and never more than the cap', () => {
  const old = sale('a', 'reg2', at(9));
  const late = sale('b', 'reg3', at(17));
  const mine = sale('c', 'reg1', at(12));
  assert.deepEqual(sharedSalesOnly([old, late, mine, { ...late }], 'reg1').map(s => s.uuid), ['b', 'a']);
  const many = Array.from({ length: MAX_SHARED_SALES + 5 }, (_, i) => sale(`u${i}`, 'reg2', at(1, 9, 1 + (i % 27))));
  assert.equal(sharedSalesOnly(many, 'reg1').length, MAX_SHARED_SALES);
});

test('allSales: this till and the shared ones, newest first, one row per uuid with this till\'s own copy winning', () => {
  const mine = sale('x', 'reg1', at(10), { orderName: '#1' });
  const same = sale('x', 'reg1', at(10), { orderName: '#1-different' });
  const other = sale('y', 'reg2', at(20));
  const got = allSales([mine], [same, other]);
  assert.deepEqual(got.map(s => s.uuid), ['y', 'x']);
  assert.equal(got[1].orderName, '#1');
});

test('mergeSharedRollups: another till\'s day is added, this till\'s own key is left alone', () => {
  const cur = { 'reg1|2026-10-18': { ...emptyTotals(), orders: 3 } };
  const got = mergeSharedRollups(cur, [row('reg1', '2026-10-18', { orders: 99 }), row('reg2', '2026-10-18', { orders: 4 })], 'reg1');
  assert.equal(got['reg1|2026-10-18'].orders, 3);
  assert.equal(got['reg2|2026-10-18'].orders, 4);
});

test('afterPull: adds only the other tills, keeps what was there, merges totals and stamps the time', () => {
  const before = afterPull(emptySharedHistory(), [sale('a', 'reg2', at(9))], [row('reg2', '2026-10-18', { orders: 2 })], 'reg1', at(8));
  assert.deepEqual(before.sales.map(s => s.uuid), ['a']);
  assert.equal(before.at, at(8));
  const after = afterPull(before, [sale('b', 'reg1', at(11)), sale('c', 'reg3', at(16))], [row('reg3', '2026-10-18', { orders: 1 })], 'reg1', at(18));
  assert.deepEqual(after.sales.map(s => s.uuid), ['c', 'a']); // newest first, this till's own left out
  assert.equal(before.sales.length, 1, 'the earlier state is not changed');
  assert.equal(after.rollups['reg2|2026-10-18'].orders, 2);
  assert.equal(after.rollups['reg3|2026-10-18'].orders, 1);
  assert.equal(after.at, at(18));
});
