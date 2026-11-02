// Location: tests/migrationverify.test.ts
// CloudKit patch 7, count check: the import is marked done only when CloudKit holds everything Shopify does, a shortfall rewinds the run to
// the earliest short phase and says why, and losing the lease during the check never marks anything done.
import test from 'node:test';
import assert from 'node:assert/strict';
import { completeImport, runImport, shortfallMessage, verifyImport } from '../src/lib/cloudkit/migrationVerify';
import { HEARTBEAT_MS, readMigration } from '../src/lib/migrationLease';
import { drawerRow, ent, fakeLease, harness, row, sales, T0 } from './migrationFakes';

const closed = { open: false, floatCents: 0, paidInCents: 0, paidOutCents: 0 };
const shop = () => ({
  settings: [row('shared', { settings_key: 'shared', version: '2', settings_json: '{}' }), drawerRow(closed, { counts: { '1000': 2 }, entries: [ent('e2', '2026-11-01T10:00:00Z'), ent('e1', '2026-11-01T09:00:00Z')] })],
  layout: [row('main', { layout_key: 'main', version: '5', layout_json: '{}' })],
  cart: [row('c1', { cart_uuid: 'C1' }), row('c2', { cart_uuid: 'C2' })],
  sale: sales(230),
  rollup: [row('a-d', { rollup_key: 'A|2026-11-01', totals_json: '{}' })],
});
const vdeps = (h: ReturnType<typeof harness>) => ({ source: h.deps.source, target: h.deps.target as any, drawer: h.deps.drawer });

test('a full import then the count check marks the run done, and a participant then sees done', async () => {
  const h = harness(shop());
  const r = await runImport(h.deps as any);
  assert.equal(r.kind, 'done');
  if (r.kind === 'done') {
    assert.equal(r.held.status, 'done'); assert.ok(r.held.finishedAt > 0);
    assert.deepEqual(r.checks.map(c => [c.phase, c.expected, c.found]), [['settings', 1, 1], ['drawer', 4, 4], ['layout', 1, 1], ['carts', 2, 2], ['sales', 230, 230], ['rollups', 1, 1]]);
  }
  assert.equal(readMigration(h.lease.peek()).kind, 'ok');
  const participant = harness({}, { id: 'P', owner: false, lease: h.lease });
  assert.equal((await participant.deps.watch.check()).decision.act, 'done');
});

test('the check reads only: it writes nothing to CloudKit and nothing to Shopify', async () => {
  const h = harness(shop()); await runImport(h.deps as any);
  const before = h.target.puts.length; const drawerWrites = h.drawer.calls.entryWrites;
  assert.equal((await verifyImport(vdeps(h))).ok, true);
  assert.equal(h.target.puts.length, before); assert.equal(h.drawer.calls.entryWrites, drawerWrites);
});

test('a missing sale makes the sales short; the run is rewound to sales, recorded as failed with the shortfall, and not done', async () => {
  const h = harness(shop());
  let dropped = false; const realPut = h.deps.target.put.bind(h.deps.target);
  h.deps.target = { ...h.deps.target, put: async (t, k, f) => { if (t === 'sale' && k === 'u57' && !dropped) { dropped = true; return null; } return realPut(t, k, f); } } as any;
  const r = await runImport(h.deps as any);
  assert.equal(r.kind, 'short');
  if (r.kind === 'short') { assert.deepEqual(r.short.map(c => [c.phase, c.expected, c.found]), [['sales', 230, 229]]); assert.equal(r.message, 'Count check failed: sales 229 of 230.'); }
  const rec = h.lease.peek()!; assert.equal(rec.status, 'failed'); assert.equal(rec.phase, 'sales'); assert.equal(rec.cursor, ''); assert.match(rec.error, /sales 229 of 230/);
  // the next run repeats from sales, finds the sale now written, and finishes
  const again = await runImport({ ...h.deps, target: { ...h.deps.target, put: realPut } } as any);
  assert.equal(again.kind, 'done');
});

test('with two phases short, the run is rewound to the earlier one', async () => {
  const h = harness(shop());
  const realPut = h.deps.target.put.bind(h.deps.target);
  h.deps.target = { ...h.deps.target, put: async (t, k, f) => (t === 'sale' && k === 'u1') || (t === 'cart' && k === 'C2') ? null : realPut(t, k, f) } as any;
  const r = await runImport(h.deps as any);
  assert.equal(r.kind, 'short');
  if (r.kind === 'short') assert.deepEqual(r.short.map(c => c.phase), ['carts', 'sales']);
  assert.equal(h.lease.peek()!.phase, 'carts');
});

test('the drawer is checked by entry, by shift and by counts', async () => {
  const h = harness(shop()); await runImport(h.deps as any);
  // a counts mismatch: change the checkpoint after the import
  await h.drawer.n.putDrawerCheckpoint({ counts: JSON.stringify({ '1000': 99 }), asOfStamp: '1970-01-01T00:00:00.000Z' });
  const v = await verifyImport(vdeps(h));
  assert.equal(v.ok, false); assert.deepEqual(v.short.map(c => c.phase), ['drawer']);
  assert.equal(v.short[0].expected - v.short[0].found, 1);
});

test('extra records in CloudKit are not a fault, and a kept higher-version settings row still passes', async () => {
  const seed = { settings: { shared: row('shared', { settings_key: 'shared', version: '9', settings_json: '{"kept":1}' }), extra: row('extra', { settings_key: 'extra' }) } };
  const h = harness(shop(), { seed });
  assert.equal((await runImport(h.deps as any)).kind, 'done');
});

test('rows with no usable key are left out of both sides, so they never fail the check', async () => {
  const data = shop(); data.cart.push(row('', {}));
  const h = harness(data);
  const r = await runImport(h.deps as any);
  assert.equal(r.kind, 'done');
  if (r.kind === 'done') assert.equal(r.checks.find(c => c.phase === 'carts')!.expected, 2);
});

test('a lost lease during the check never marks anything done, and writes nothing', async () => {
  const h = harness(shop());
  const ran = await (await import('../src/lib/cloudkit/migrationRun')).runMigration(h.deps);
  assert.equal(ran.kind, 'finished'); if (ran.kind !== 'finished') return;
  h.lease.steal();
  const clock = { t: T0 }; let reads = 0; const real = h.deps.source.list.bind(h.deps.source);
  const source = { ...h.deps.source, list: async (t: any, o: any) => { if (++reads === 2) clock.t += HEARTBEAT_MS + 1; return real(t, o); } };
  const r = await completeImport({ ...vdeps(h), source }, h.deps.native, ran.held, () => clock.t);
  assert.deepEqual(r, { kind: 'lost' }); assert.equal(h.lease.peek()!.holder, 'thief'); assert.notEqual(h.lease.peek()!.status, 'done');
});

test('a read error during the check is recorded as failed, not done', async () => {
  const h = harness(shop());
  const ran = await (await import('../src/lib/cloudkit/migrationRun')).runMigration(h.deps);
  if (ran.kind !== 'finished') return assert.fail('should have finished');
  const source = { ...h.deps.source, list: async () => { throw new Error('Shopify unreachable'); } };
  const r = await completeImport({ ...vdeps(h), source }, h.deps.native, ran.held, () => T0);
  assert.equal(r.kind, 'failed'); assert.equal(h.lease.peek()!.status, 'failed'); assert.match(h.lease.peek()!.error, /Shopify unreachable/);
});

test('a long check keeps the lease alive: a heartbeat is written when a read page takes longer than the heartbeat', async () => {
  const h = harness({ ...shop(), sale: sales(500) });
  const ran = await (await import('../src/lib/cloudkit/migrationRun')).runMigration(h.deps);
  if (ran.kind !== 'finished') return assert.fail('should have finished');
  const clock = { t: T0 }; const real = h.deps.source.list.bind(h.deps.source);
  const source = { ...h.deps.source, list: async (t: any, o: any) => { clock.t += HEARTBEAT_MS + 1; return real(t, o); } };
  const writesBefore = h.lease.writes.length;
  const r = await completeImport({ ...vdeps(h), source }, h.deps.native, ran.held, () => clock.t);
  assert.equal(r.kind, 'done'); assert.ok(h.lease.writes.length - writesBefore > 2, 'heartbeats plus the done write');
});

test('the shortfall sentence fits in the record\'s error field', () => {
  const all = ['settings', 'drawer', 'layout', 'carts', 'sales', 'rollups'].map(p => ({ phase: p as any, expected: 123456, found: 0 }));
  assert.ok(shortfallMessage(all).length <= 300);
});
