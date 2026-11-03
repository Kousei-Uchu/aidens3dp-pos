// Location: tests/backendchoice.test.ts
// CloudKit patch 8, rules: which backend a till uses at start-up, when it moves to CloudKit, and which of its own sales it still has to send.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CATCHUP_DONE, CATCHUP_MARGIN_MS, backendLine, decideSwitch, readFlag, salesToCatchUp, startupKind, type SwitchInput } from '../src/lib/backendChoice';
import type { SaleRecord } from '../src/lib/types';

const base: SwitchInput = { flag: null, active: 'metaobject', role: 'participant', migration: 'done', practice: false };
const sale = (uuid: string, ts: string, registerId = 'me'): SaleRecord => ({ uuid, ts, registerId, type: 'sale' } as SaleRecord);

test('the flag is read strictly: only the two known values count', () => {
  assert.equal(readFlag('force_meta'), 'force_meta'); assert.equal(readFlag('cloudkit'), 'cloudkit');
  for (const bad of [null, undefined, '', 'CloudKit', 'true', 5]) assert.equal(readFlag(bad), null);
});

test('at start-up a till uses CloudKit only when the flag says it has moved; the rollback and an unset flag mean Shopify', () => {
  assert.equal(startupKind('cloudkit'), 'cloudkit'); assert.equal(startupKind('force_meta'), 'metaobject'); assert.equal(startupKind(null), 'metaobject');
});

test('a till on Shopify, in the shop, with the import done, moves', () => {
  assert.deepEqual(decideSwitch(base), { act: 'switch' });
  assert.deepEqual(decideSwitch({ ...base, role: 'owner' }), { act: 'switch' });
});

test('it stays when the import is not done, is unreadable, or the till is not in the shop', () => {
  assert.deepEqual(decideSwitch({ ...base, migration: 'not_done' }), { act: 'stay', why: 'not_done' });
  assert.deepEqual(decideSwitch({ ...base, migration: 'unknown' }), { act: 'stay', why: 'unknown' });
  assert.deepEqual(decideSwitch({ ...base, role: 'none' }), { act: 'stay', why: 'not_in_shop' });
});

test('it stays in a practice run, after a rollback, and when it has already moved', () => {
  assert.deepEqual(decideSwitch({ ...base, practice: true }), { act: 'stay', why: 'practice' });
  assert.deepEqual(decideSwitch({ ...base, flag: 'force_meta' }), { act: 'stay', why: 'rolled_back' });
  assert.deepEqual(decideSwitch({ ...base, active: 'cloudkit' }), { act: 'stay', why: 'already' });
  assert.deepEqual(decideSwitch({ ...base, flag: 'cloudkit' }), { act: 'stay', why: 'already' });
});

test('the rollback wins over everything, even a done import and an owner', () => {
  assert.deepEqual(decideSwitch({ ...base, flag: 'force_meta', role: 'owner', migration: 'done' }), { act: 'stay', why: 'rolled_back' });
});

test('the sales to catch up are this register\'s own, from just before the import began, not in its queue, oldest first', () => {
  const start = Date.parse('2026-11-02T10:00:00.000Z');
  const list = [
    sale('old', '2026-11-02T08:00:00.000Z'), sale('edge', new Date(start - CATCHUP_MARGIN_MS).toISOString()), sale('late', '2026-11-02T12:00:00.000Z'),
    sale('mid', '2026-11-02T10:30:00.000Z'), sale('theirs', '2026-11-02T11:00:00.000Z', 'other'), sale('queued', '2026-11-02T11:30:00.000Z'), sale('bad', 'nope'),
  ];
  assert.deepEqual(salesToCatchUp(list, { registerId: 'me', importStartedAt: start, outboxIds: new Set(['queued']) }).map(s => s.uuid), ['edge', 'mid', 'late']);
});

test('a caught-up sale runs only the CloudKit record and the totals', () => {
  assert.deepEqual(Object.keys(CATCHUP_DONE).sort(), ['early', 'giftCards', 'order', 'receipt', 'receiptFinal', 'stock']);
  assert.ok(!('entry' in CATCHUP_DONE) && !('rollup' in CATCHUP_DONE));
});

test('the sentence says where the till keeps its data', () => {
  assert.match(backendLine('cloudkit', 'cloudkit'), /in iCloud/); assert.match(backendLine('metaobject', null), /in Shopify\./);
  assert.match(backendLine('metaobject', 'force_meta'), /switched back on purpose/); assert.match(backendLine('none', null), /not connected/);
});
