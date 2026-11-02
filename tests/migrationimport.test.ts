// Location: tests/migrationimport.test.ts
// CloudKit patch 7, import runner: what is copied, under which key, in what order, and that a crash, a takeover, a lost lease or a
// stop never loses or doubles anything. Shopify, CloudKit, the drawer and the lease record are all in-memory fakes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DRAWER_ROW, IMPORT_PAGE, decodeCursor, encodeCursor, handleFor, importable, readDrawerBlob, readShiftValue, shouldWriteVersioned, versionOf, type SourceRow } from '../src/lib/migrationImport';
import { createMigrationWatch, type MigrationNative } from '../src/lib/cloudkit/migrationCloud';
import { runMigration, type ImportSource, type ImportTarget, type RunDeps } from '../src/lib/cloudkit/migrationRun';
import { pullCloudDrawer, type DrawerNative } from '../src/lib/cloudkit/drawerCloud';
import { LEASE_MS } from '../src/lib/migrationLease';
import type { SharedType } from '../src/lib/syncBackend';

type Rec = Record<string, any>;
const row = (handle: string, f: Record<string, string>): SourceRow => ({ id: `gid-${handle}`, handle, updatedAt: '2026-11-02T00:00:00Z', f });

function fakeLease() {
  let rec: Rec | null = null; let n = 0; const writes: string[] = [];
  const native: MigrationNative = {
    async getMigration() { return rec ? { ...rec } : null; },
    async putMigrationIfUnchanged(fields, expected) {
      if (rec) { if (!expected || rec.tag !== expected) return { changed: true }; } else if (expected) return { changed: true };
      rec = { ...(rec ?? {}), ...fields, tag: `t${++n}` }; writes.push(`${fields.status}/${fields.phase}`); return { changed: false, tag: rec.tag };
    },
  };
  return { native, peek: () => rec, steal: () => { rec = { ...rec!, tag: `t${++n}`, holder: 'thief' }; }, writes };
}

function fakeDrawer() {
  let clock = 1_000_000; const entries: Rec[] = []; let shift: Rec | null = null; let cp: Rec | null = null; const calls = { entryWrites: 0 };
  const page = (rows: Rec[], after: string | null | undefined, limit: number) => { const from = after ? Number(after) : 0; return { rows: rows.slice(from, from + limit), next: from + limit < rows.length ? String(from + limit) : null }; };
  const n: DrawerNative = {
    async putDrawerShift(f) { shift = { ...f, recordName: 'drawer-shift' }; return shift; },
    async getDrawerShift() { return shift; },
    async putLedgerEntry(h, f) { const name = `ledger-${h}`; const had = entries.find(r => r.recordName === name); if (had) return had; calls.entryWrites++; clock += 1; const r = { ...f, recordName: name, createdAt: clock }; entries.push(r); return r; },
    async listLedgerEntries(limit, after) { return page([...entries].reverse(), after, limit); },
    async listLedgerSince(since, limit, after) { return page(entries.filter(r => r.createdAt > since), after, limit); },
    async putDrawerCheckpoint(f) { cp = { ...f, recordName: 'drawer-checkpoint' }; return cp; },
    async getDrawerCheckpoint() { return cp; },
  };
  return { n, calls, entries, cp: () => cp };
}

/** Shopify: lists by type, paged by `pageSize` with a numeric cursor. `failOnce` makes the next list of a type throw once. */
function fakeSource(data: Partial<Record<SharedType, SourceRow[]>>, pageSize = IMPORT_PAGE) {
  const failOnce = new Set<SharedType>(); const listCalls: string[] = [];
  const src: ImportSource = {
    async list(type, o) {
      listCalls.push(`${type}@${o.after ?? 'start'}`);
      if (failOnce.delete(type)) throw new Error(`Shopify ${type} unreachable`);
      const rows = data[type] ?? []; const from = o.after ? Number(o.after) : 0;
      return { rows: rows.slice(from, from + pageSize), next: from + pageSize < rows.length ? String(from + pageSize) : null };
    },
    async get(type, handle) { return (data[type] ?? []).find(r => r.handle === handle || r.f.settings_key === handle) ?? null; },
  };
  return { src, failOnce, listCalls };
}

function fakeTarget(seed: Partial<Record<SharedType, Record<string, SourceRow>>> = {}) {
  const store: Record<string, Record<string, SourceRow>> = { cart: {}, layout: {}, sale: {}, rollup: {}, settings: {} };
  for (const [t, rows] of Object.entries(seed)) store[t] = { ...rows };
  const puts: string[] = [];
  const tgt: ImportTarget = {
    async put(type, handle, fields) { puts.push(`${type}:${handle}`); store[type][handle] = row(handle, fields); return null; },
    async get(type, handle) { return store[type][handle] ?? null; },
  };
  return { tgt, store, puts };
}

const T0 = 1_800_000_000_000;
function harness(data: Partial<Record<SharedType, SourceRow[]>>, o: { id?: string; owner?: boolean; pageSize?: number; seed?: Partial<Record<SharedType, Record<string, SourceRow>>>; lease?: ReturnType<typeof fakeLease>; clock?: { t: number } } = {}) {
  const lease = o.lease ?? fakeLease(); const clock = o.clock ?? { t: T0 };
  const source = fakeSource(data, o.pageSize); const target = fakeTarget(o.seed); const drawer = fakeDrawer();
  const watch = createMigrationWatch({ native: async () => lease.native, registerId: () => o.id ?? 'A', registerName: () => `Till ${o.id ?? 'A'}`, isOwner: () => o.owner ?? true, now: () => clock.t });
  const deps: RunDeps = { watch, native: lease.native, source: source.src, target: target.tgt, drawer: drawer.n, now: () => clock.t };
  return { deps, lease, source, target, drawer, clock };
}

const sale = (i: number): SourceRow => row(`s${i}`, { sale_uuid: `u${i}`, register_id: 'A', total_cents: String(100 * i), sale_json: JSON.stringify({ uuid: `u${i}`, totalCents: 100 * i }) });
const sales = (n: number) => Array.from({ length: n }, (_, i) => sale(i + 1));
const drawerRow = (shift: Rec, ledger: Rec, version = 4): SourceRow => row('drawer', { settings_key: 'drawer', version: String(version), settings_json: JSON.stringify({ shift, ledger }) });
const ent = (id: string, ts: string, kind = 'sale_in', delta: Rec = { '1000': 1 }) => ({ id, ts, kind, delta });

test('rows are keyed by their own field, not by Shopify\'s rewritten handle', () => {
  assert.equal(handleFor('rollups', row('a-2026-11-01', { rollup_key: 'A|2026-11-01' })), 'A|2026-11-01');
  assert.equal(handleFor('carts', row('abc', { cart_uuid: 'ABC-1' })), 'ABC-1');
  assert.equal(handleFor('sales', row('x', { sale_uuid: 'U1' })), 'U1');
  assert.equal(handleFor('sales', row('x', { sale_json: '{"uuid":"U2"}' })), 'U2');
  assert.equal(handleFor('sales', row('fallback', {})), 'fallback');
  assert.equal(handleFor('settings', row('shared', { settings_key: 'shared' })), 'shared');
  assert.equal(handleFor('sales', row('', {})), null);
});

test('the settings phase leaves the drawer row to the drawer phase, and a row with no key is skipped', () => {
  assert.equal(importable('settings', row('drawer', { settings_key: DRAWER_ROW })), false);
  assert.equal(importable('settings', row('shared', { settings_key: 'shared' })), true);
  assert.equal(importable('sales', row('', {})), false);
});

test('cursors round-trip, and anything unreadable means the start of the phase', () => {
  assert.deepEqual(decodeCursor(encodeCursor({ a: '100', i: 0, n: 100 })), { a: '100', i: 0, n: 100 });
  for (const bad of ['', 'nope', '[1]', '{"a":5,"i":-1,"n":1.5}']) assert.deepEqual(decodeCursor(bad), { a: null, i: 0, n: 0 });
});

test('settings and layout: the higher version wins, Shopify wins a tie, a missing record is written', () => {
  assert.equal(shouldWriteVersioned({ version: '3' }, null), true);
  assert.equal(shouldWriteVersioned({ version: '3' }, { version: '3' }), true);
  assert.equal(shouldWriteVersioned({ version: '3' }, { version: '2' }), true);
  assert.equal(shouldWriteVersioned({ version: '3' }, { version: '4' }), false);
  assert.equal(shouldWriteVersioned({}, {}), true);
  assert.equal(versionOf({ version: 'x' }), 0);
});

test('the drawer blob and the shift are read safely', () => {
  assert.equal(readDrawerBlob(null), null);
  assert.equal(readDrawerBlob(row('drawer', { settings_json: 'not json' })), null);
  assert.equal(readDrawerBlob(row('drawer', { settings_json: '5' })), null);
  assert.equal(readDrawerBlob(drawerRow({ open: true }, {}, 7))?.version, 7);
  assert.equal(readShiftValue({ nope: 1 }), null);
  assert.deepEqual(readShiftValue({ open: true, floatCents: '500' }), { open: true, floatCents: 500, paidInCents: 0, paidOutCents: 0 });
});

test('a whole import runs the six phases in order and records each count', async () => {
  const h = harness({
    settings: [row('shared', { settings_key: 'shared', version: '2', settings_json: '{}' }), drawerRow({ open: false, floatCents: 0, paidInCents: 0, paidOutCents: 0 }, { counts: { '1000': 2 }, entries: [ent('e2', '2026-11-01T10:00:00Z'), ent('e1', '2026-11-01T09:00:00Z')] })],
    layout: [row('main', { layout_key: 'main', version: '5', layout_json: '{}' })],
    cart: [row('c1', { cart_uuid: 'C1' }), row('c2', { cart_uuid: 'C2' })],
    sale: sales(3), rollup: [row('a-d', { rollup_key: 'A|2026-11-01', totals_json: '{}' })],
  });
  const r = await runMigration(h.deps);
  assert.equal(r.kind, 'finished');
  if (r.kind === 'finished') {
    assert.deepEqual(r.held.counts, { settings: 1, drawer: 2, layout: 1, carts: 2, sales: 3, rollups: 1 });
    assert.equal(r.held.status, 'running', 'marking it done is the count check\'s job, not the runner\'s');
  }
  assert.deepEqual(Object.keys(h.target.store.settings), ['shared']);
  assert.ok(h.target.store.rollup['A|2026-11-01']);
  assert.deepEqual(Object.keys(h.target.store.cart).sort(), ['C1', 'C2']);
  assert.ok(h.target.puts.indexOf('settings:shared') < h.target.puts.indexOf('layout:main'));
  assert.ok(h.target.puts.indexOf('layout:main') < h.target.puts.indexOf('cart:C1'));
  assert.ok(h.target.puts.indexOf('cart:C2') < h.target.puts.indexOf('sale:u1'));
  assert.ok(h.target.puts.indexOf('sale:u3') < h.target.puts.indexOf('rollup:A|2026-11-01'));
});

test('the drawer becomes one record per entry, a starting checkpoint with the shop\'s counts, and the shift', async () => {
  const h = harness({ settings: [drawerRow({ open: true, openedAt: '2026-11-01T08:00:00Z', floatCents: 20000, paidInCents: 0, paidOutCents: 0, staff: 'Sam' }, { counts: { '1000': 5, '2000': 3 }, entries: [ent('e2', '2026-11-01T10:00:00Z'), ent('e1', '2026-11-01T09:00:00Z')] }, 4)] });
  assert.equal((await runMigration(h.deps)).kind, 'finished');
  assert.deepEqual(h.drawer.entries.map(e => e.recordName), ['ledger-e1', 'ledger-e2'], 'oldest first');
  const cloud = await pullCloudDrawer(h.drawer.n);
  assert.deepEqual(cloud.ledger.counts, { '1000': 5, '2000': 3 }, 'counts are the shop\'s, not a replay of the two entries');
  assert.equal(cloud.shift?.shift.open, true); assert.equal(cloud.shift?.shift.staff, 'Sam');
  assert.ok((cloud.shift?.version ?? 0) >= 4);
});

test('no drawer row is a drawer phase of zero, not an error', async () => {
  const h = harness({ settings: [row('shared', { settings_key: 'shared' })] });
  const r = await runMigration(h.deps);
  assert.equal(r.kind, 'finished'); if (r.kind === 'finished') assert.equal(r.held.counts.drawer, 0);
  assert.equal(h.drawer.entries.length, 0); assert.equal(h.drawer.cp(), null);
});

test('a long ledger goes in chunks, each one a checkpoint, and a repeat of the phase writes nothing twice', async () => {
  const entries = Array.from({ length: 250 }, (_, i) => ent(`e${String(i).padStart(3, '0')}`, `2026-11-01T${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`)).reverse();
  const h = harness({ settings: [drawerRow({ open: false, floatCents: 0, paidInCents: 0, paidOutCents: 0 }, { counts: { '1000': 250 }, entries })] });
  await runMigration(h.deps);
  assert.equal(h.drawer.calls.entryWrites, 250);
  assert.ok(h.lease.writes.length >= 3 + 6, 'a lease write per chunk plus one per phase');
  const again = harness({ settings: [drawerRow({ open: false, floatCents: 0, paidInCents: 0, paidOutCents: 0 }, { counts: { '1000': 250 }, entries })] });
  await runMigration(again.deps); await runMigration({ ...again.deps });
  assert.equal(again.drawer.calls.entryWrites, 250);
});

test('sales go in pages of the import size, the cursor and count are kept, and every row arrives once', async () => {
  const total = IMPORT_PAGE * 2 + 30;
  const h = harness({ sale: sales(total) });
  const r = await runMigration(h.deps);
  assert.equal(r.kind, 'finished'); if (r.kind === 'finished') assert.equal(r.held.counts.sales, total);
  assert.equal(Object.keys(h.target.store.sale).length, total);
  assert.equal(h.target.puts.filter(p => p.startsWith('sale:')).length, total);
});

test('a crash part way through sales: the next owner iPad takes over at once, resumes at the stored page and finishes with the right count', async () => {
  const total = IMPORT_PAGE * 3;
  const first = harness({ sale: sales(total) });
  let calls = 0; // the third sales page fails
  const realList = first.deps.source.list.bind(first.deps.source);
  first.deps.source = { ...first.deps.source, list: async (t, o) => { if (t === 'sale' && ++calls === 3) throw new Error('Shopify went away'); return realList(t, o); } };
  const r1 = await runMigration(first.deps);
  assert.deepEqual(r1, { kind: 'failed', phase: 'sales', message: 'Shopify went away' });
  assert.equal(first.lease.peek()?.status, 'failed');
  assert.equal(Object.keys(first.target.store.sale).length, IMPORT_PAGE * 2);
  // Another owner iPad, same shared lease and same CloudKit.
  const second = harness({ sale: sales(total) }, { id: 'B', lease: first.lease });
  second.deps.target = first.deps.target;
  const r2 = await runMigration(second.deps);
  assert.equal(r2.kind, 'finished');
  if (r2.kind === 'finished') { assert.equal(r2.held.counts.sales, total); assert.equal(r2.held.holder, 'B'); }
  assert.equal(Object.keys(first.target.store.sale).length, total);
  assert.equal(first.target.puts.filter(p => p.startsWith('sale:')).length, total, 'the pages already copied were not copied again');
  assert.equal(second.source.listCalls.filter(c => c.startsWith('settings')).length, 0, 'finished phases are not read again');
});

test('a holder that goes quiet is replaced after the lease, not before', async () => {
  const lease = fakeLease(); const clock = { t: T0 };
  const a = harness({ sale: sales(5) }, { id: 'A', lease, clock });
  a.deps.shouldStop = () => true; // A dies after claiming
  assert.deepEqual(await runMigration(a.deps), { kind: 'stopped' });
  const b = harness({ sale: sales(5) }, { id: 'B', lease, clock });
  b.deps.target = a.deps.target;
  const early = await runMigration(b.deps);
  assert.equal(early.kind, 'wait'); if (early.kind === 'wait') assert.equal(early.why, 'busy');
  clock.t += LEASE_MS + 1;
  assert.equal((await runMigration(b.deps)).kind, 'finished');
});

test('a runner that lost the lease stops copying and writes nothing to the lease record', async () => {
  const total = IMPORT_PAGE * 3; const h = harness({ sale: sales(total) });
  let seen = 0; const realPut = h.deps.target.put.bind(h.deps.target);
  h.deps.target = { ...h.deps.target, put: async (t, k, f) => { if (t === 'sale' && ++seen === IMPORT_PAGE + 1) h.lease.steal(); return realPut(t, k, f); } };
  const r = await runMigration(h.deps);
  assert.deepEqual(r, { kind: 'lost' });
  assert.equal(h.lease.peek()?.holder, 'thief'); assert.notEqual(h.lease.peek()?.status, 'failed', 'a replaced runner must not mark the new holder\'s run failed');
  assert.ok(Object.keys(h.target.store.sale).length <= IMPORT_PAGE * 2, 'it stopped at the next checkpoint');
});

test('stopping leaves the lease as it was, to lapse', async () => {
  const h = harness({ sale: sales(IMPORT_PAGE * 2) }); let pages = 0;
  h.deps.shouldStop = () => ++pages > 5; // let settings, drawer... run, stop during sales
  assert.deepEqual(await runMigration(h.deps), { kind: 'stopped' });
  assert.equal(h.lease.peek()?.status, 'running');
});

test('a participant waits and never writes; a finished import says done', async () => {
  const p = harness({ sale: sales(2) }, { id: 'P', owner: false });
  assert.equal((await runMigration(p.deps)).kind, 'wait'); assert.equal(p.lease.writes.length, 0); assert.equal(p.target.puts.length, 0);
  const lease = fakeLease(); await lease.native.putMigrationIfUnchanged({ v: 1, status: 'done', holder: 'A', holderName: 'A', phase: 'rollups', cursor: '', counts: '{}', startedAt: 1, finishedAt: 2, error: '' }, null);
  assert.equal((await runMigration(harness({}, { lease }).deps)).kind, 'done');
});

test('a row that cannot be keyed is skipped and left out of the count; the rest still go', async () => {
  const h = harness({ cart: [row('c1', { cart_uuid: 'C1' }), row('', {}), row('c3', { cart_uuid: 'C3' })] });
  const r = await runMigration(h.deps);
  assert.equal(r.kind, 'finished'); if (r.kind === 'finished') assert.equal(r.held.counts.carts, 2);
});

test('settings and layout already in CloudKit with a higher version are kept; equal or lower are replaced', async () => {
  const seed = { settings: { shared: row('shared', { settings_key: 'shared', version: '9', settings_json: '{"new":1}' }) }, layout: { main: row('main', { layout_key: 'main', version: '1', layout_json: '{"old":1}' }) } };
  const h = harness({ settings: [row('shared', { settings_key: 'shared', version: '4', settings_json: '{"old":1}' })], layout: [row('main', { layout_key: 'main', version: '2', layout_json: '{"shop":1}' })] }, { seed });
  const r = await runMigration(h.deps);
  assert.equal(r.kind, 'finished'); if (r.kind === 'finished') assert.equal(r.held.counts.settings, 1, 'a kept row still counts as imported');
  assert.equal(h.target.store.settings.shared.f.settings_json, '{"new":1}');
  assert.equal(h.target.store.layout.main.f.layout_json, '{"shop":1}');
});
