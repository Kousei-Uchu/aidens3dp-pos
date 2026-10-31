// Location: tests/drawercloud.test.ts
// CloudKit patch 6b, transport half: the shared drawer pushed and pulled through an in-memory fake of the native module.
// Pins first-writer bootstrap, two registers agreeing, an offline register's late entry, idempotent retries, paging,
// the shift (including the 0188 loan), and that a checkpoint is written on open/close only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pullCloudDrawer, pullCloudDrawerState, pushCloudDrawer, type DrawerNative } from '../src/lib/cloudkit/drawerCloud';
import { entryToFields } from '../src/lib/drawerRecords';
import type { CashLedger, LedgerEntry } from '../src/lib/cashLedger';
import type { Shift } from '../src/state/store';

type Rec = Record<string, any>;
function fake() {
  let clock = 1_000_000; const entries: Rec[] = []; let shift: Rec | null = null; let cp: Rec | null = null; const calls = { cpWrites: 0, entryWrites: 0, shiftWrites: 0 };
  const page = (rows: Rec[], after: string | null | undefined, limit: number) => { const from = after ? Number(after) : 0; const next = from + limit < rows.length ? String(from + limit) : null; return { rows: rows.slice(from, from + limit), next }; };
  const n: DrawerNative = {
    async putDrawerShift(f) { calls.shiftWrites++; shift = { ...f, recordName: 'drawer-shift' }; return shift; },
    async getDrawerShift() { return shift; },
    async putLedgerEntry(handle, f) { const name = `ledger-${handle}`; const had = entries.find(r => r.recordName === name); if (had) return had; calls.entryWrites++; clock += 1; const r = { ...f, recordName: name, createdAt: clock }; entries.push(r); return r; },
    async listLedgerEntries(limit, after) { return page([...entries].reverse(), after, limit); },
    async listLedgerSince(since, limit, after) { return page(entries.filter(r => r.createdAt > since), after, limit); },
    async putDrawerCheckpoint(f) { calls.cpWrites++; cp = { ...f, recordName: 'drawer-checkpoint' }; return cp; },
    async getDrawerCheckpoint() { return cp; },
  };
  return { n, calls, entries };
}
const e = (id: string, ts: string, kind: LedgerEntry['kind'], delta: Record<string, number>): LedgerEntry => ({ id, ts, kind, delta });
const ledger = (counts: Record<string, number>, entries: LedgerEntry[]): CashLedger => ({ counts, entries: [...entries].sort((a, b) => b.ts.localeCompare(a.ts)) });
const closed: Shift = { open: false, floatCents: 0, paidInCents: 0, paidOutCents: 0 };
const opened: Shift = { open: true, openedAt: '2026-10-31T09:00:00Z', floatCents: 20000, paidInCents: 0, paidOutCents: 0, staff: 'Sam' };

test('nothing shared yet reads as null', async () => { assert.equal(await pullCloudDrawerState(fake().n), null); });

test('the first register to push becomes the starting point, counts included', async () => {
  const { n } = fake();
  const mine = ledger({ '2000': 3 }, [e('a', '2026-10-31T09:00:00Z', 'open', { '2000': 3 })]);
  const out = await pushCloudDrawer(n, { shift: opened, ledger: mine, version: 0, shiftPending: true });
  assert.deepEqual(out.ledger.counts, { '2000': 3 });
  assert.equal(out.shift.open, true); assert.equal(out.version, 1);
  assert.deepEqual((await pullCloudDrawerState(n))?.ledger.counts, { '2000': 3 });
});
test('counts held with no history survive the first push', async () => {
  const { n } = fake();
  await pushCloudDrawer(n, { shift: closed, ledger: ledger({ '1000': 4 }, []), version: 0, shiftPending: true });
  assert.deepEqual((await pullCloudDrawerState(n))?.ledger.counts, { '1000': 4 });
});
test('two registers end up with the same drawer', async () => {
  const { n } = fake();
  const a = await pushCloudDrawer(n, { shift: opened, ledger: ledger({ '2000': 3 }, [e('a', '2026-10-31T09:00:00Z', 'open', { '2000': 3 })]), version: 0, shiftPending: true });
  // register B takes a cash sale without knowing about A's entries
  const b = await pushCloudDrawer(n, { shift: closed, ledger: ledger({ '1000': 1 }, [e('b', '2026-10-31T10:00:00Z', 'sale_in', { '1000': 1 })]), version: 0, shiftPending: false });
  assert.deepEqual(b.ledger.counts, { '2000': 3, '1000': 1 });
  assert.equal(b.shift.open, true); // B follows A's open drawer, it did not change the shift
  const again = await pushCloudDrawer(n, { shift: a.shift, ledger: a.ledger, version: a.version, shiftPending: false });
  assert.deepEqual(again.ledger.counts, b.ledger.counts);
  assert.deepEqual(again.ledger.entries.map(x => x.id), ['b', 'a']);
});
test('pushing again does not double an entry', async () => {
  const { n, calls } = fake();
  const l = ledger({ '500': 1 }, [e('a', '2026-10-31T09:00:00Z', 'sale_in', { '500': 1 })]);
  await pushCloudDrawer(n, { shift: opened, ledger: l, version: 0, shiftPending: true });
  const out = await pushCloudDrawer(n, { shift: opened, ledger: l, version: 1, shiftPending: false });
  assert.equal(calls.entryWrites, 1); assert.deepEqual(out.ledger.counts, { '500': 1 });
});
test('an entry a register held back offline is still counted after a checkpoint exists', async () => {
  const { n } = fake();
  await pushCloudDrawer(n, { shift: opened, ledger: ledger({ '2000': 3 }, [e('a', '2026-10-31T09:00:00Z', 'open', { '2000': 3 })]), version: 0, shiftPending: true });
  await pushCloudDrawer(n, { shift: closed, ledger: ledger({ '2000': 3 }, [e('a', '2026-10-31T09:00:00Z', 'open', { '2000': 3 })]), version: 1, shiftPending: true }); // close writes a checkpoint
  const late = e('late', '2026-10-31T08:00:00Z', 'sale_in', { '1000': 2 }); // happened before, uploaded now
  const out = await pushCloudDrawer(n, { shift: closed, ledger: ledger({ '1000': 2 }, [late]), version: 0, shiftPending: false });
  assert.deepEqual(out.ledger.counts, { '2000': 3, '1000': 2 });
});
test('counts stay right with more entries than one page, and past the 1000 history cap', async () => {
  const { n } = fake();
  const many = Array.from({ length: 1200 }, (_, i) => e(`e${i}`, new Date(Date.UTC(2026, 9, 1, 0, 0, i)).toISOString(), 'sale_in', { '500': 1 }));
  for (let i = 0; i < 1200; i += 400) await pushCloudDrawer(n, { shift: opened, ledger: ledger(i === 0 ? { '500': 400 } : {}, many.slice(i, i + 400)), version: 0, shiftPending: i === 0 }); // a real ledger's counts include its entries
  const state = await pullCloudDrawerState(n);
  assert.equal(state?.ledger.counts['500'], 1200);
  assert.equal(state?.ledger.entries.length, 1000);
});
test('the shift carries the loan, and a register that did not change it follows a newer shared one', async () => {
  const { n } = fake();
  const loaned: Shift = { ...opened, paidInCents: 5000, loanCents: 5000 };
  await pushCloudDrawer(n, { shift: loaned, ledger: ledger({}, []), version: 0, shiftPending: true });
  const other = await pushCloudDrawer(n, { shift: closed, ledger: ledger({}, []), version: 0, shiftPending: false });
  assert.equal(other.shift.loanCents, 5000);
  assert.equal(other.version, 1);
});
test('a checkpoint is written when the drawer opens or closes, not on every push', async () => {
  const { n, calls } = fake();
  await pushCloudDrawer(n, { shift: opened, ledger: ledger({ '500': 1 }, [e('a', '2026-10-31T09:00:00Z', 'open', { '500': 1 })]), version: 0, shiftPending: true });
  const afterOpen = calls.cpWrites;
  await pushCloudDrawer(n, { shift: opened, ledger: ledger({ '500': 2 }, [e('b', '2026-10-31T09:30:00Z', 'sale_in', { '500': 1 }), e('a', '2026-10-31T09:00:00Z', 'open', { '500': 1 })]), version: 1, shiftPending: false });
  assert.equal(calls.cpWrites, afterOpen);
  await pushCloudDrawer(n, { shift: closed, ledger: ledger({ '500': 2 }, [e('b', '2026-10-31T09:30:00Z', 'sale_in', { '500': 1 }), e('a', '2026-10-31T09:00:00Z', 'open', { '500': 1 })]), version: 2, shiftPending: true });
  assert.equal(calls.cpWrites, afterOpen + 1);
});
test('an unreadable entry record is skipped and the rest still reads', async () => {
  const { n, entries } = fake();
  await pushCloudDrawer(n, { shift: opened, ledger: ledger({ '500': 1 }, [e('a', '2026-10-31T09:00:00Z', 'sale_in', { '500': 1 })]), version: 0, shiftPending: true });
  entries.push({ recordName: 'ledger-bad', createdAt: 2_000_000, ts: 'x', kind: 'nonsense', delta: '{}', ...entryToFields(e('z', 't', 'open', {})), kind2: 1 });
  entries[entries.length - 1].kind = 'nonsense';
  const d = await pullCloudDrawer(n);
  assert.deepEqual(d.ledger.counts, { '500': 1 });
});
