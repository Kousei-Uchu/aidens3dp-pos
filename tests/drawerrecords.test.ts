// Location: tests/drawerrecords.test.ts
// CloudKit patch 6b (pure half): the shared drawer as records. Pins the names, the field round trips (including the 0188
// loan), that a bad record is skipped, and that every iPad replaying the same entries gets the same counts and history.
import test from 'node:test';
import assert from 'node:assert/strict';
import { entriesToUpload, entryFromFields, entryIdFromRecord, entryToFields, ledgerFromEntries, ledgerRecordName, shiftFromFields, shiftToFields, SHIFT_RECORD } from '../src/lib/drawerRecords';
import { MAX_ENTRIES, type LedgerEntry } from '../src/lib/cashLedger';

const e = (id: string, ts: string, kind: LedgerEntry['kind'], delta: Record<string, number>, more: Partial<LedgerEntry> = {}): LedgerEntry => ({ id, ts, kind, delta, ...more });

test('record names are deterministic and reversible', () => {
  assert.equal(SHIFT_RECORD, 'drawer-shift');
  assert.equal(ledgerRecordName('abc'), 'ledger-abc');
  assert.equal(entryIdFromRecord('ledger-abc'), 'abc');
  assert.equal(entryIdFromRecord('ledger-'), null);
  assert.equal(entryIdFromRecord('sale-abc'), null);
});
test('the shift round trips, including a loan still owed', () => {
  const s = { open: true, openedAt: '2026-10-31T09:00:00Z', floatCents: 20000, paidInCents: 5000, paidOutCents: 0, staff: 'Sam', loanCents: 5000 };
  assert.deepEqual(shiftFromFields(shiftToFields(s, 7)), { shift: s, version: 7 });
});
test('takings not yet taken out travel with the shift, and a closed shift keeps them', () => {
  const s = { open: false, floatCents: 0, paidInCents: 0, paidOutCents: 0, collectSince: '2026-11-03T09:00:00.000Z', loanCents: 2000 };
  assert.deepEqual(shiftFromFields(shiftToFields(s, 3)), { shift: s, version: 3 });
  assert.equal('collectSince' in shiftToFields({ open: true, floatCents: 1, paidInCents: 0, paidOutCents: 0 }, 1), false);
});
test('a shift with no loan has no loan field, and a closed one reads as closed', () => {
  const f = shiftToFields({ open: false, floatCents: 0, paidInCents: 0, paidOutCents: 0 }, 1);
  assert.equal('loanCents' in f, false);
  assert.equal(shiftFromFields(f).shift.open, false);
  assert.equal('loanCents' in shiftFromFields(f).shift, false);
});
test('a shift with unreadable numbers reads as zeros, not NaN', () => {
  const { shift } = shiftFromFields({ open: 1, floatCents: 'x', paidInCents: -5, paidOutCents: NaN });
  assert.deepEqual(shift, { open: true, floatCents: 0, paidInCents: 0, paidOutCents: 0 });
});
test('an entry round trips with its optional fields', () => {
  const x = e('id1', '2026-10-31T10:00:00Z', 'sale_in', { '2000': 1, '500': -1 }, { staff: 'Sam', note: 'n', saleUuid: 'u1' });
  assert.deepEqual(entryFromFields('id1', entryToFields(x)), x);
  const bare = e('id2', '2026-10-31T10:01:00Z', 'paid_in', { '1000': 2 });
  assert.deepEqual(entryFromFields('id2', entryToFields(bare)), bare);
});
test('a record that is not a readable entry is skipped', () => {
  assert.equal(entryFromFields('i', { ts: 'x', kind: 'nonsense', delta: '{}' }), null);
  assert.equal(entryFromFields('i', { ts: 'x', kind: 'open', delta: '{bad' }), null);
  assert.equal(entryFromFields('i', { ts: 'x', kind: 'open', delta: '[]' }), null);
  assert.equal(entryFromFields('', { ts: 'x', kind: 'open', delta: '{}' }), null);
});
test('the counts come from replaying the entries, in the same order on every iPad', () => {
  const list = [e('b', '2026-10-31T10:00:00Z', 'sale_in', { '1000': 1 }), e('a', '2026-10-31T09:00:00Z', 'open', { '2000': 2 }), e('c', '2026-10-31T10:00:00Z', 'sale_change', { '1000': -1 })];
  const one = ledgerFromEntries(list), two = ledgerFromEntries([...list].reverse());
  assert.deepEqual(one, two);
  assert.deepEqual(one.counts, { '2000': 2 });
  assert.deepEqual(one.entries.map(x => x.id), ['c', 'b', 'a']); // newest first
});
test('a duplicate entry is counted once', () => {
  const a = e('a', '2026-10-31T09:00:00Z', 'open', { '2000': 1 });
  assert.deepEqual(ledgerFromEntries([a, a]).counts, { '2000': 1 });
});
test('a base stands in for entries that were not loaded', () => {
  assert.deepEqual(ledgerFromEntries([e('a', '2026-10-31T09:00:00Z', 'sale_in', { '500': 1 })], { '2000': 3 }).counts, { '2000': 3, '500': 1 });
});
test('history is capped at the local limit, newest kept', () => {
  const many = Array.from({ length: MAX_ENTRIES + 5 }, (_, i) => e(`e${i}`, new Date(Date.UTC(2026, 9, 1, 0, 0, i)).toISOString(), 'sale_in', { '500': 1 }));
  const l = ledgerFromEntries(many);
  assert.equal(l.entries.length, MAX_ENTRIES);
  assert.equal(l.entries[0].id, `e${MAX_ENTRIES + 4}`);
});
test('only entries CloudKit lacks are uploaded, oldest first', () => {
  const local = [e('b', '2026-10-31T10:00:00Z', 'paid_in', { '500': 1 }), e('a', '2026-10-31T09:00:00Z', 'open', { '500': 1 }), e('c', '2026-10-31T11:00:00Z', 'paid_out', { '500': -1 })];
  assert.deepEqual(entriesToUpload(local, new Set(['b'])).map(x => x.id), ['a', 'c']);
});
