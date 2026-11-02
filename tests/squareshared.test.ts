// Location: tests/squareshared.test.ts
// CloudKit patch 6a, Square history shards: the pure rules (what leaves the iPad, how the manifest reads back, and what to do about each month).
import test from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync, strFromU8 } from 'fflate';
import type { HistSale } from '../src/lib/squareConvert';
import {
  decideMonth, manifestFromFields, manifestToFields, monthFileName, monthOfFile, packStable, parseBase, planSquare, serializeBase, shardHandle, stripCustomers,
  type LocalMonth, type ShardEntry,
} from '../src/lib/squareHistoryShared';

const sale = (uuid: string, customer?: { id: string; name: string; email?: string; phone?: string }): HistSale => ({ uuid, type: 'sale', ts: '2025-03-04T01:00:00.000Z', registerId: 'square', registerName: 'Square', customer, lines: [], tenders: [], source: 'square', squareOrderId: 'o' } as unknown as HistSale);
const lm = (month: string, hash: string, sales = 10): LocalMonth => ({ month, hash, bytes: 100, sales });
const re = (month: string, sid: string, sales = 10): ShardEntry => ({ month, sid, bytes: 90, sales });

test('the copy for iCloud has no customer name, email or phone, and keeps the sale otherwise', () => {
  const out = stripCustomers([sale('a', { id: 'square:C1', name: 'Jo Citizen', email: 'jo@example.com', phone: '0400 000 000' }), sale('b')]);
  assert.deepEqual(out[0].customer, { id: 'square:C1', name: '' });
  assert.equal(out[1].customer, undefined);
  assert.equal(out[0].uuid, 'a');
  const text = JSON.stringify(out); assert.ok(!/Jo Citizen|jo@example|0400/.test(text));
});
test('stripping does not change the sales it was given', () => {
  const input = [sale('a', { id: 'square:C1', name: 'Jo', email: 'j@x.au' })];
  stripCustomers(input); assert.equal(input[0].customer?.name, 'Jo'); assert.equal(input[0].customer?.email, 'j@x.au');
});
test('packing is the same every time, so the same sales always hash the same', async () => {
  const a = packStable([sale('a')]); await new Promise(r => setTimeout(r, 1100)); const b = packStable([sale('a')]);
  assert.deepEqual(Array.from(a), Array.from(b));
  assert.deepEqual(JSON.parse(strFromU8(gunzipSync(a))), JSON.parse(JSON.stringify([sale('a')])));
});

test('names: month files are told from the manifest and the rollups, and a shard is named by month and id', () => {
  assert.equal(monthFileName('2025-03'), 'sales-2025-03.json.gz');
  assert.equal(monthOfFile('sales-2025-03.json.gz'), '2025-03');
  for (const n of ['manifest.json', 'rollups.json.gz', 'sales-2025-13.json.gz', 'sales-2025-03 2.json.gz', '../sales-2025-03.json.gz']) assert.equal(monthOfFile(n), null, n);
  assert.equal(shardHandle('2025-03', 'abc123'), '2025-03-abc123');
});

test('the manifest round trips, and one bad month does not hide the others', () => {
  const entries = { '2025-03': re('2025-03', 'aaa', 5), '2025-04': re('2025-04', 'bbb', 7) };
  const f = manifestToFields(entries, { createdAt: 'c', from: '2025-03-01', to: '2025-04-30', locations: ['Shop'] }, 'reg-a', 'Front', 't');
  const back = manifestFromFields({ ...f, tag: 'T1' });
  assert.equal(back.kind, 'manifest'); if (back.kind !== 'manifest') return;
  assert.deepEqual(back.entries, entries); assert.equal(back.tag, 'T1'); assert.deepEqual(back.meta, { createdAt: 'c', from: '2025-03-01', to: '2025-04-30', locations: ['Shop'] });
  const dirty = manifestFromFields({ files: JSON.stringify([{ m: '2025-03', s: 'ok', b: 10, n: 1 }, { m: 'nope', s: 'ok', b: 10, n: 1 }, { m: '2025-05', s: '../x', b: 10, n: 1 }, { m: '2025-06', s: 'ok', b: -4, n: 1 }, { m: '2025-07', s: 'ok', b: 10, n: 1.5 }]) });
  assert.equal(dirty.kind, 'manifest'); if (dirty.kind === 'manifest') assert.deepEqual(Object.keys(dirty.entries), ['2025-03']);
});
test('no record is absent, and a record that cannot be understood is unreadable, never empty', () => {
  assert.deepEqual(manifestFromFields(null), { kind: 'absent' });
  assert.deepEqual(manifestFromFields({ files: 'not json' }), { kind: 'unreadable' });
  assert.deepEqual(manifestFromFields({}), { kind: 'unreadable' });
  assert.deepEqual(manifestFromFields({ files: '{"a":1}' }), { kind: 'unreadable' });
});

test('decideMonth: nothing changed means nothing to do', () => assert.equal(decideMonth(lm('2025-03', 'h1'), re('2025-03', 's1'), { l: 'h1', s: 's1' }), 'none'));
test('decideMonth: a month only this register has is sent, and a month only the shop has is taken', () => {
  assert.equal(decideMonth(lm('2025-03', 'h1'), undefined, undefined), 'push');
  assert.equal(decideMonth(undefined, re('2025-03', 's1'), undefined), 'pull');
});
test('decideMonth: a change on one side only goes to the other', () => {
  assert.equal(decideMonth(lm('2025-03', 'h2'), re('2025-03', 's1'), { l: 'h1', s: 's1' }), 'push');
  assert.equal(decideMonth(lm('2025-03', 'h1'), re('2025-03', 's2'), { l: 'h1', s: 's1' }), 'pull');
});
test('decideMonth: a removal is only carried to a side that had not changed the month', () => {
  assert.equal(decideMonth(undefined, re('2025-03', 's1'), { l: 'h1', s: 's1' }), 'removeRemote');
  assert.equal(decideMonth(lm('2025-03', 'h1'), undefined, { l: 'h1', s: 's1' }), 'removeLocal');
  assert.equal(decideMonth(lm('2025-03', 'h2'), undefined, { l: 'h1', s: 's1' }), 'push'); // the shop removed it, but this register changed it since
  assert.equal(decideMonth(undefined, re('2025-03', 's2'), { l: 'h1', s: 's1' }), 'pull'); // deleted here, but the shop changed it since
});
test('decideMonth: with no base a month is never deleted on a guess', () => {
  assert.equal(decideMonth(lm('2025-03', 'h1'), undefined, undefined), 'push');
  assert.equal(decideMonth(undefined, re('2025-03', 's1'), undefined), 'pull');
});
test('decideMonth: both sides changed the same month, the one with more sales wins and a tie keeps this register\'s', () => {
  const b = { l: 'h1', s: 's1' };
  assert.equal(decideMonth(lm('2025-03', 'h2', 5), re('2025-03', 's2', 9), b), 'pull');
  assert.equal(decideMonth(lm('2025-03', 'h2', 9), re('2025-03', 's2', 5), b), 'push');
  assert.equal(decideMonth(lm('2025-03', 'h2', 7), re('2025-03', 's2', 7), b), 'push');
  assert.equal(decideMonth(lm('2025-03', 'h2', 5), re('2025-03', 's2', 9), undefined), 'pull'); // a register that has just joined
});
test('decideMonth: a month that is gone from both sides is forgotten', () => {
  assert.equal(decideMonth(undefined, undefined, { l: 'h1', s: 's1' }), 'forget');
  assert.equal(decideMonth(undefined, undefined, undefined), 'none');
});
test('planSquare lists only months with something to do, oldest first', () => {
  const plan = planSquare([lm('2025-05', 'h5'), lm('2025-03', 'h3')], { '2025-04': re('2025-04', 's4'), '2025-03': re('2025-03', 's3') }, { '2025-03': { l: 'h3', s: 's3' } });
  assert.deepEqual(plan, [{ month: '2025-04', action: 'pull' }, { month: '2025-05', action: 'push' }]);
});

test('the base reads back, and bad text gives an empty base instead of an error', () => {
  const b = { '2025-04': { l: 'x', s: 'y' }, '2025-03': { l: 'a', s: 'b' } };
  assert.deepEqual(parseBase(serializeBase(b)), b);
  assert.equal(serializeBase(b), '{"2025-03":{"l":"a","s":"b"},"2025-04":{"l":"x","s":"y"}}');
  for (const bad of [undefined, '', 'nope', 'null', '[]', '{"2025-03":5,"bad":{"l":"a","s":"b"}}']) assert.deepEqual(parseBase(bad as string | undefined), {});
});
