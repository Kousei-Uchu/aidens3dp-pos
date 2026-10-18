// Location: tests/drawersync.test.ts
// 0168: the cash drawer is one shared drawer, so a register folds another register's ledger entries into its own.
// These tests pin the pure half (src/lib/drawerSync.ts): which entries are new to us, and how the counts and the
// history come out of merging. The upload and download (src/lib/sync.ts) are not covered here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeDrawer, missingEntries } from '../src/lib/drawerSync';
import { emptyLedger, MAX_ENTRIES, type CashLedger, type LedgerEntry } from '../src/lib/cashLedger';

const e = (id: string, ts: string, kind: LedgerEntry['kind'], delta: Record<string, number>): LedgerEntry => ({ id, ts, kind, delta });
const ledger = (counts: Record<string, number>, entries: LedgerEntry[]): CashLedger => ({ counts, entries });

// ── missingEntries: only what we do not already hold, oldest first ──
test('missingEntries keeps only entries we do not have, oldest first', () => {
  const mine = [e('a', '2026-10-18T09:00:00Z', 'sale_in', { '2000': 1 })];
  const theirs = [e('c', '2026-10-18T11:00:00Z', 'sale_in', { '1000': 1 }), e('a', '2026-10-18T09:00:00Z', 'sale_in', { '2000': 1 }), e('b', '2026-10-18T10:00:00Z', 'paid_in', { '500': 2 })];
  assert.deepEqual(missingEntries(mine, theirs).map(x => x.id), ['b', 'c']);
});
test('missingEntries ignores a remote entry with no id', () => {
  assert.deepEqual(missingEntries([], [e('', '', 'sale_in', {}) , { ts: 'x', kind: 'sale_in', delta: {} } as unknown as LedgerEntry]), []);
});

// ── mergeDrawer: another register moved the same shared drawer ──
test('a cash sale on the other register moves our counts and joins our history', () => {
  const mine = ledger({ '2000': 1 }, [e('a', '2026-10-18T09:00:00Z', 'sale_in', { '2000': 1 })]);
  const theirs = ledger({ '1000': 1 }, [e('b', '2026-10-18T10:00:00Z', 'sale_in', { '1000': 1 })]);
  const out = mergeDrawer(mine, theirs);
  assert.deepEqual(out.counts, { '2000': 1, '1000': 1 });
  assert.deepEqual(out.entries.map(x => x.id), ['b', 'a']); // newest first
});
test('the same entry on both registers is folded in once', () => {
  const a = e('a', '2026-10-18T09:00:00Z', 'sale_in', { '2000': 1 });
  const mine = ledger({ '2000': 1 }, [a]);
  const theirs = ledger({ '2000': 1 }, [a]);
  const out = mergeDrawer(mine, theirs);
  assert.equal(out.entries.length, 1);
  assert.deepEqual(out.counts, { '2000': 1 }); // not doubled
});
test('our counts are the starting point, not the remote ones', () => {
  const mine = ledger({ '2000': 1 }, [e('a', '2026-10-18T09:00:00Z', 'sale_in', { '2000': 1 })]);
  // remote says it holds $90, but that number is not folded in; only the entry we lack is
  const theirs = ledger({ '1000': 9 }, [e('b', '2026-10-18T10:00:00Z', 'sale_in', { '1000': 1 })]);
  assert.deepEqual(mergeDrawer(mine, theirs).counts, { '2000': 1, '1000': 1 });
});
test('a change given on the other register comes out of the shared drawer', () => {
  const mine = ledger({ '500': 3 }, []);
  const theirs = ledger({}, [e('b', '2026-10-18T10:00:00Z', 'sale_change', { '500': -1 })]);
  assert.deepEqual(mergeDrawer(mine, theirs).counts, { '500': 2 });
});
test('counts never go below zero when folding in a taken-out note we did not have', () => {
  const mine = ledger({}, []);
  const theirs = ledger({}, [e('b', '2026-10-18T10:00:00Z', 'paid_out', { '500': -2 })]);
  assert.deepEqual(mergeDrawer(mine, theirs).counts, {}); // clamped, as when the entry is applied locally
});
test('our own entries are kept even when the remote copy does not have them yet', () => {
  const mine = ledger({ '2000': 1, '500': 1 }, [e('a', '2026-10-18T11:00:00Z', 'sale_in', { '2000': 1, '500': 1 })]);
  const theirs = ledger({ '100': 5 }, [e('b', '2026-10-18T09:00:00Z', 'sale_in', { '100': 5 })]);
  const out = mergeDrawer(mine, theirs);
  assert.deepEqual(out.entries.map(x => x.id).sort(), ['a', 'b']);
  assert.deepEqual(out.counts, { '2000': 1, '500': 1, '100': 5 });
});
test('the merged history is capped like the local one', () => {
  const many = (p: string): LedgerEntry[] => Array.from({ length: MAX_ENTRIES }, (_, i) => e(`${p}${i}`, `2026-10-18T${String(i % 24).padStart(2, '0')}:00:0${i % 10}Z`, 'sale_in', { '5': 1 }));
  const out = mergeDrawer(emptyLedger(), ledger({}, many('x')));
  assert.equal(out.entries.length, MAX_ENTRIES);
});
test('merging an empty remote drawer changes nothing', () => {
  const mine = ledger({ '2000': 2 }, [e('a', '2026-10-18T09:00:00Z', 'sale_in', { '2000': 2 })]);
  const out = mergeDrawer(mine, emptyLedger());
  assert.deepEqual(out.counts, { '2000': 2 });
  assert.deepEqual(out.entries.map(x => x.id), ['a']);
});

test('a remote entry already trimmed from our full history is not applied again', () => {
  const old = e('old', '2026-10-01T00:00:00Z', 'sale_in', { '2000': 1 });
  const mine = ledger({ '2000': 5 }, Array.from({ length: MAX_ENTRIES }, (_, i) => e('m' + i, new Date(Date.UTC(2026, 9, 2, 0, 0, i)).toISOString(), 'sale_in', {})));
  assert.deepEqual(mergeDrawer(mine, ledger({}, [old])).counts, { '2000': 5 });
});
test('ledgerCashSince counts sale-linked entries from any register', async () => {
  const { ledgerCashSince } = await import('../src/lib/drawerSync');
  const l = ledger({}, [{ ...e('a', '2026-10-18T10:00:00Z', 'sale_in', { '2000': 1 }), saleUuid: 's' }, { ...e('b', '2026-10-18T10:00:00Z', 'sale_change', { '500': -1 }), saleUuid: 's' }, e('c', '2026-10-18T10:00:00Z', 'paid_in', { '1000': 1 }), { ...e('d', '2026-10-17T10:00:00Z', 'sale_in', { '1000': 1 }), saleUuid: 'z' }]);
  assert.equal(ledgerCashSince(l, '2026-10-18T00:00:00Z'), 1500);
});
