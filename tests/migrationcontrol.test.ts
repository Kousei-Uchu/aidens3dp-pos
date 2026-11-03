// Location: tests/migrationcontrol.test.ts
// CloudKit patch 7, wiring: the controller the "Setting up sync" screen uses. Only the owner starts the import, practice mode and a second
// press are refused without any write, progress reaches a listener, a stop leaves the lease to lapse, and a finished import reads as done.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMigrationControl } from '../src/lib/cloudkit/migrationControl';
import { drawerRow, ent, fakeDrawer, fakeLease, fakeSource, fakeTarget, row, sales } from './migrationFakes';

const closed = { open: false, floatCents: 0, paidInCents: 0, paidOutCents: 0 };
const data = () => ({
  settings: [row('shared', { settings_key: 'shared', version: '1', settings_json: '{}' }), drawerRow(closed, { counts: { '1000': 1 }, entries: [ent('e1', '2026-11-01T09:00:00Z')] })],
  layout: [row('main', { layout_key: 'main', version: '1' })], cart: [row('c1', { cart_uuid: 'C1' })], sale: sales(130), rollup: [row('r', { rollup_key: 'A|2026-11-01' })],
});
function make(o: { role?: 'owner' | 'participant' | 'none'; training?: boolean; id?: string; lease?: ReturnType<typeof fakeLease>; ensureFails?: boolean } = {}) {
  const lease = o.lease ?? fakeLease(); const drawer = fakeDrawer(); const source = fakeSource(data()); const target = fakeTarget();
  let ensured = 0; const clock = { t: 1_800_000_000_000 };
  const c = createMigrationControl({
    native: async () => ({ ...lease.native, ...drawer.n }), source: () => source.src, target: () => target.tgt,
    ensure: async () => { ensured++; if (o.ensureFails) throw new Error('CloudKit is not available.'); },
    who: () => ({ id: o.id ?? 'A', name: `Till ${o.id ?? 'A'}` }), role: async () => o.role ?? 'owner', training: () => !!o.training, now: () => clock.t,
  });
  return { c, lease, target, source, ensured: () => ensured };
}

test('a fresh owner iPad can start; the sentence says so', async () => {
  const m = make(); const v = await m.c.view();
  assert.equal(v.canStart, true); assert.equal(v.done, false); assert.equal(v.running, false); assert.match(v.line, /Ready to set up sync/);
});

test('starting runs the whole import, ends done, and the view then reads done and cannot start again', async () => {
  const m = make(); const seen: string[] = []; m.c.subscribe(() => seen.push('x'));
  const r = await m.c.start();
  assert.equal(r.kind, 'done'); assert.equal(m.lease.peek()!.status, 'done'); assert.equal(m.ensured(), 1);
  assert.ok(seen.length >= 3, 'listeners hear the start, progress and the end');
  const v = await m.c.view(); assert.equal(v.done, true); assert.equal(v.canStart, false); assert.equal(v.running, false); assert.equal(v.last?.kind, 'done'); assert.equal(v.line, 'Sync is set up.');
});

test('a participant, or an iPad with no role, is refused and writes nothing', async () => {
  for (const role of ['participant', 'none'] as const) {
    const m = make({ role }); const r = await m.c.start();
    assert.equal(r.kind, 'refused'); assert.equal(m.lease.writes.length, 0); assert.equal(m.target.puts.length, 0); assert.equal(m.ensured(), 0);
    assert.equal((await m.c.view()).canStart, false);
  }
});

test('practice mode is refused without a write, and cannot start', async () => {
  const m = make({ training: true }); assert.equal((await m.c.start()).kind, 'refused'); assert.equal(m.lease.writes.length, 0);
  assert.equal((await m.c.view()).canStart, false);
});

test('a second press while running is refused, and does not disturb the first', async () => {
  const m = make(); const first = m.c.start();
  const second = await m.c.start();
  assert.equal(second.kind, 'refused'); if (second.kind === 'refused') assert.match(second.why, /already running/);
  assert.equal((await first).kind, 'done'); assert.equal(m.c.isRunning(), false);
});

test('progress is visible while running: the phase and the count', async () => {
  const m = make(); const marks: Array<[string | null, number]> = [];
  const v0 = () => m.c.view().then(v => marks.push([v.phase, v.imported]));
  m.c.subscribe(() => { void v0(); });
  await m.c.start(); await new Promise(r => setTimeout(r, 20));
  assert.ok(marks.some(([p, n]) => p === 'sales' && n > 0));
});

test('stop leaves the lease running for another iPad, and the next start carries on', async () => {
  const m = make(); let pages = 0;
  const realList = m.source.src.list.bind(m.source.src);
  m.source.src.list = async (t, o) => { if (t === 'sale' && ++pages === 1) m.c.stop(); return realList(t, o); };
  const r = await m.c.start(); assert.equal(r.kind, 'stopped'); assert.equal(m.lease.peek()!.status, 'running');
  const again = await m.c.start(); assert.equal(again.kind, 'done');
});

test('a setup failure (CloudKit not available) is reported, not thrown, and the controller is usable again', async () => {
  const m = make({ ensureFails: true }); const r = await m.c.start();
  assert.equal(r.kind, 'refused'); if (r.kind === 'refused') assert.match(r.why, /not available/);
  assert.equal(m.c.isRunning(), false); assert.equal(m.lease.writes.length, 0);
});

test('another iPad\'s run in progress reads as busy to an owner, who cannot start', async () => {
  const lease = fakeLease();
  await lease.native.putMigrationIfUnchanged({ v: 1, status: 'running', holder: 'B', holderName: 'Till B', phase: 'carts', cursor: '', counts: '{}', startedAt: 1, finishedAt: 0, error: '' }, null);
  const m = make({ lease }); const v = await m.c.view();
  assert.equal(v.canStart, false); assert.match(v.line, /Till B is setting up sync, step 4 of 6/);
});

test('a read failure becomes a sentence, never an exception', async () => {
  const lease = fakeLease(); lease.native.getMigration = async () => { throw new Error('offline'); };
  const m = make({ lease }); const v = await m.c.view();
  assert.match(v.line, /Could not read the setup state: offline/); assert.equal(v.canStart, false);
});
