// Location: tests/drawercheckpoint.test.ts
// CloudKit patch 6b, part 2: the drawer checkpoint. Pins that counts stay right past 1000 entries, that an entry
// uploaded late by an offline register (old `ts`, new server stamp) is still counted, and that a checkpoint never goes back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkpointFromFields, checkpointToFields, ledgerFromRemote, makeCheckpoint, newestStamp, shouldReplaceCheckpoint, type StampedEntry } from '../src/lib/drawerCheckpoint';
import { ledgerFromEntries } from '../src/lib/drawerRecords';
import type { LedgerEntry } from '../src/lib/cashLedger';

const en = (id: string, ts: string, kind: LedgerEntry['kind'], delta: Record<string, number>): LedgerEntry => ({ id, ts, kind, delta });
const st = (entry: LedgerEntry, stamp: string): StampedEntry => ({ entry, stamp });

test('a checkpoint round trips, and an unreadable one is null', () => {
  const c = { counts: { '2000': 3, '500': 0 }, asOfStamp: '2026-10-31T09:00:00.000Z' };
  assert.deepEqual(checkpointFromFields(checkpointToFields(c)), { counts: { '2000': 3 }, asOfStamp: c.asOfStamp });
  assert.equal(checkpointFromFields({ counts: '{bad', asOfStamp: 'x' }), null);
  assert.equal(checkpointFromFields({ counts: '[]', asOfStamp: 'x' }), null);
  assert.equal(checkpointFromFields({ counts: '{}', asOfStamp: '' }), null);
});
test('with no checkpoint every entry is replayed', () => {
  const a = st(en('a', '2026-10-31T09:00:00Z', 'open', { '2000': 2 }), 's1'), b = st(en('b', '2026-10-31T10:00:00Z', 'sale_in', { '500': 1 }), 's2');
  assert.deepEqual(ledgerFromRemote(null, [a, b]).counts, { '2000': 2, '500': 1 });
});
test('with a checkpoint only later entries are replayed on top of its counts', () => {
  const old = st(en('a', '2026-10-31T09:00:00Z', 'open', { '2000': 2 }), 's1'), fresh = st(en('b', '2026-10-31T10:00:00Z', 'sale_in', { '500': 1 }), 's3');
  const out = ledgerFromRemote({ counts: { '2000': 2 }, asOfStamp: 's2' }, [old, fresh], [old.entry]);
  assert.deepEqual(out.counts, { '2000': 2, '500': 1 }); // the old entry is not counted twice
  assert.deepEqual(out.entries.map(x => x.id), ['b', 'a']);
});
test('an entry an offline register uploads late is counted even though its ts is old', () => {
  const late = st(en('late', '2026-10-31T08:00:00Z', 'sale_in', { '1000': 1 }), 's9'); // ts before the checkpoint, stamp after it
  assert.deepEqual(ledgerFromRemote({ counts: { '2000': 1 }, asOfStamp: 's5' }, [late]).counts, { '2000': 1, '1000': 1 });
});
test('counts stay right when history is longer than the 1000 the app loads', () => {
  const all = Array.from({ length: 1500 }, (_, i) => st(en(`e${i}`, new Date(Date.UTC(2026, 9, 1, 0, 0, i)).toISOString(), 'sale_in', { '500': 1 }), `s${String(i).padStart(5, '0')}`));
  const truth = ledgerFromEntries(all.map(s => s.entry)).counts; // { '500': 1500 }
  const cp = makeCheckpoint({ counts: ledgerFromEntries(all.slice(0, 1400).map(s => s.entry)).counts, entries: [] }, all.slice(0, 1400));
  const newest1000 = all.slice(500).map(s => s.entry);
  const out = ledgerFromRemote(cp, all.slice(1400), newest1000);
  assert.deepEqual(out.counts, truth);
  assert.equal(out.entries.length, 1000);
});
test('makeCheckpoint covers up to the newest stamp, and is null when nothing is covered', () => {
  assert.equal(makeCheckpoint({ counts: {}, entries: [] }, []), null);
  const covered = [st(en('a', 't', 'open', { '500': 1 }), 's1'), st(en('b', 't', 'paid_in', { '500': 1 }), 's7')];
  assert.equal(newestStamp(covered), 's7');
  assert.deepEqual(makeCheckpoint({ counts: { '500': 2 }, entries: [] }, covered), { counts: { '500': 2 }, asOfStamp: 's7' });
});
test('a checkpoint never goes backwards', () => {
  const now = { counts: {}, asOfStamp: 's5' };
  assert.equal(shouldReplaceCheckpoint(null, now), true);
  assert.equal(shouldReplaceCheckpoint(now, { counts: {}, asOfStamp: 's4' }), false);
  assert.equal(shouldReplaceCheckpoint(now, { counts: {}, asOfStamp: 's6' }), true);
});
