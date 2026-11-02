// Location: tests/migrationlease.test.ts
// CloudKit patch 7, migration lease: how the record is read, who may run the import, when a quiet holder can be replaced, and that two
// iPads racing for the lease cannot both win. The native module is an in-memory fake that behaves like CloudKit's change tags.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HEARTBEAT_MS, LEASE_MS, MIGRATION_PHASES, MIGRATION_VERSION, decideMigration, firstPhase, freshState, isStale, migrationLine, migrationToFields,
  nextPhase, observe, parseCounts, phaseNumber, readMigration, takenOver, type MigrationRead, type MigrationState,
} from '../src/lib/migrationLease';
import {
  completeMigration, createMigrationWatch, failMigration, finishPhase, loadMigration, saveProgress, type MigrationNative,
} from '../src/lib/cloudkit/migrationCloud';

/** CloudKit in miniature: one record, a tag that changes on every write, and a write that is refused when the caller's tag is old. */
function fakeNative(opts: { omitTag?: boolean } = {}) {
  let rec: Record<string, any> | null = null; let n = 0;
  const log: string[] = [];
  const native: MigrationNative = {
    async getMigration() { return rec ? { ...rec } : null; },
    async putMigrationIfUnchanged(fields, expectedTag) {
      assert.ok(!('tag' in fields), 'the tag is never written as a field');
      if (rec) { if (!expectedTag || rec.tag !== expectedTag) { log.push('refused'); return { changed: true }; } }
      else if (expectedTag) { log.push('refused'); return { changed: true }; }
      rec = { ...(rec ?? {}), ...fields, tag: `t${++n}` }; log.push(`wrote ${fields.status}/${fields.phase}`);
      return opts.omitTag ? { changed: false } : { changed: false, tag: rec.tag };
    },
  };
  return { native, log, peek: () => rec, set: (r: Record<string, any> | null) => { rec = r; } };
}

const T0 = 1_800_000_000_000;
const clock = (start = T0) => { let t = start; return { now: () => t, tick: (ms: number) => { t += ms; } }; };
const watch = (f: ReturnType<typeof fakeNative>, id: string, c: ReturnType<typeof clock>, owner = true) =>
  createMigrationWatch({ native: async () => f.native, registerId: () => id, registerName: () => `Till ${id}`, isOwner: () => owner, now: c.now });

test('the phases run in the planned order, drawer after settings, and there is no phase for Square history', () => {
  assert.deepEqual([...MIGRATION_PHASES], ['settings', 'drawer', 'layout', 'carts', 'sales', 'rollups']);
  assert.equal(firstPhase(), 'settings'); assert.equal(nextPhase('settings'), 'drawer'); assert.equal(nextPhase('rollups'), null);
  assert.equal(phaseNumber('settings'), 1); assert.equal(phaseNumber('rollups'), 6);
  assert.ok(HEARTBEAT_MS * 3 <= LEASE_MS, 'a holder can miss two heartbeats and keep the lease');
});

test('reading the record: none, ok, a newer layout, damage, and bad counts', () => {
  assert.deepEqual(readMigration(null), { kind: 'none' });
  const good = { v: 1, status: 'running', holder: 'a', holderName: 'Front', phase: 'sales', cursor: 'c9', counts: '{"settings":4,"sales":120,"nope":3}', startedAt: 5, finishedAt: 0, error: '', tag: 'x1' };
  const r = readMigration(good); assert.equal(r.kind, 'ok');
  if (r.kind === 'ok') { assert.equal(r.state.phase, 'sales'); assert.equal(r.state.cursor, 'c9'); assert.deepEqual(r.state.counts, { settings: 4, sales: 120 }); assert.equal(r.state.tag, 'x1'); }
  assert.deepEqual(readMigration({ ...good, v: MIGRATION_VERSION + 1 }), { kind: 'newer', tag: 'x1' });
  for (const bad of [{ ...good, status: 'paused' }, { ...good, phase: 'cleanup' }, { ...good, v: 0 }, { ...good, v: undefined }]) assert.deepEqual(readMigration(bad), { kind: 'damaged', tag: 'x1' });
  assert.deepEqual(parseCounts('not json'), {}); assert.deepEqual(parseCounts('[1]'), {}); assert.deepEqual(parseCounts('{"sales":-1,"carts":1.5,"layout":2}'), { layout: 2 });
});

test('a state round trips through its fields, without the tag', () => {
  const s = { ...freshState('a', 'Front', T0), phase: 'carts' as const, cursor: 'p3', counts: { settings: 2, layout: 1 } };
  const f = migrationToFields(s); assert.ok(!('tag' in f)); assert.equal(f.v, MIGRATION_VERSION);
  const back = readMigration({ ...f, tag: 'z' }); assert.equal(back.kind, 'ok');
  if (back.kind === 'ok') assert.deepEqual({ ...back.state, tag: undefined }, { ...s, tag: undefined });
});

test('observe keeps the first time for a tag and restarts the count on a new one', () => {
  const a = observe(null, 't1', 100); assert.deepEqual(a, { tag: 't1', since: 100 });
  assert.equal(observe(a, 't1', 900), a, 'same tag, same object');
  assert.deepEqual(observe(a, 't2', 900), { tag: 't2', since: 900 });
  assert.equal(isStale(null, 1e12), false);
  assert.equal(isStale({ tag: 't', since: 0 }, LEASE_MS - 1), false); assert.equal(isStale({ tag: 't', since: 0 }, LEASE_MS), true);
});

const ok = (o: Partial<MigrationState> = {}): MigrationRead => ({ kind: 'ok', state: { ...freshState('a', 'Front', T0), tag: 't1', ...o } });
const ctx = (o: Partial<{ registerId: string; isOwner: boolean; since: number; now: number }> = {}) => ({ registerId: o.registerId ?? 'b', isOwner: o.isOwner ?? true, seen: { tag: 't1', since: o.since ?? T0 }, now: o.now ?? T0 });

test('decisions: who starts, who waits, who takes over', () => {
  assert.deepEqual(decideMigration({ kind: 'none' }, ctx()), { act: 'start' });
  assert.deepEqual(decideMigration({ kind: 'none' }, ctx({ isOwner: false })), { act: 'wait', why: 'owner', state: null });
  assert.equal(decideMigration(ok({ status: 'done' }), ctx({ isOwner: false })).act, 'done', 'a participant sees done and can switch over');
  assert.equal(decideMigration(ok({ status: 'done' }), ctx()).act, 'done');
  assert.equal(decideMigration(ok(), ctx({ registerId: 'a' })).act, 'resume', 'own running lease after a restart');
  const busy = decideMigration(ok(), ctx({ now: T0 + LEASE_MS - 1 })); assert.equal(busy.act, 'wait'); if (busy.act === 'wait') assert.equal(busy.why, 'busy');
  assert.equal(decideMigration(ok(), ctx({ now: T0 + LEASE_MS })).act, 'takeover');
  const part = decideMigration(ok(), ctx({ isOwner: false, now: T0 + LEASE_MS * 5 })); assert.equal(part.act, 'wait'); if (part.act === 'wait') assert.equal(part.why, 'owner');
  assert.equal(decideMigration(ok({ status: 'failed', error: 'offline' }), ctx()).act, 'takeover', 'a failed run is picked up at once');
  assert.equal(decideMigration({ kind: 'newer', tag: 'q' }, ctx()).act, 'wait', 'a newer build\'s record is left alone');
  assert.equal(decideMigration({ kind: 'damaged', tag: 'q' }, ctx({ now: T0 + 1 })).act, 'wait');
  assert.equal(decideMigration({ kind: 'damaged', tag: 'q' }, ctx({ now: T0 + LEASE_MS })).act, 'takeover');
});

test('taking over keeps the phase, cursor and counts, and clears the old failure', () => {
  const prev = { ...freshState('a', 'Front', T0), phase: 'sales' as const, cursor: 'cur', counts: { settings: 3, carts: 7 }, status: 'failed' as const, error: 'offline', finishedAt: T0 + 5, tag: 't9' };
  const t = takenOver(prev, 'b', 'Back', T0 + 100);
  assert.equal(t.holder, 'b'); assert.equal(t.status, 'running'); assert.equal(t.phase, 'sales'); assert.equal(t.cursor, 'cur'); assert.deepEqual(t.counts, { settings: 3, carts: 7 });
  assert.equal(t.error, ''); assert.equal(t.finishedAt, 0); assert.equal(t.startedAt, T0);
  assert.deepEqual(takenOver(null, 'b', 'Back', T0 + 100), freshState('b', 'Back', T0 + 100));
});

test('two owner iPads that both saw no record: one wins, the other is refused', async () => {
  const f = fakeNative(); const c = clock();
  const a = watch(f, 'a', c);
  // b's first read happens before a writes, so b still sees no record when a's write has landed
  let staleOnce = true;
  const bNative: MigrationNative = {
    getMigration: async () => { if (staleOnce) { staleOnce = false; return null; } return f.native.getMigration(); },
    putMigrationIfUnchanged: (fields, tag) => f.native.putMigrationIfUnchanged(fields, tag),
  };
  const b = createMigrationWatch({ native: async () => bNative, registerId: () => 'b', registerName: () => 'Till b', isOwner: () => true, now: c.now });
  assert.equal((await a.claim()).act, 'held');
  assert.deepEqual(await b.claim(), { act: 'lost' });
  const r = readMigration(f.peek()); assert.equal(r.kind, 'ok'); if (r.kind === 'ok') assert.equal(r.state.holder, 'a');
  // and b, looking again, now sees a busy holder and waits instead of fighting
  assert.equal((await b.claim()).act, 'wait');
});

test('a refused write reports lost and changes nothing', async () => {
  const f = fakeNative(); const c = clock();
  const a = await watch(f, 'a', c).claim(); assert.equal(a.act, 'held');
  const before = JSON.stringify(f.peek());
  const stale = a.act === 'held' ? { ...a.held, tag: 'old' } : (null as never);
  assert.equal(await saveProgress(f.native, stale, { cursor: 'x' }), null);
  assert.equal(JSON.stringify(f.peek()), before);
});

test('a holder that goes quiet is replaced after a full lease, and then stops itself', async () => {
  const f = fakeNative(); const ca = clock(); const cb = clock(T0 + 7 * 60_000); // b's clock is minutes off: that must not matter
  const a = watch(f, 'a', ca); const b = watch(f, 'b', cb);
  const held = await a.claim(); assert.equal(held.act, 'held');
  let h = held.act === 'held' ? held.held : (null as never);
  h = (await saveProgress(f.native, h, { phase: 'carts', cursor: 'page4', counts: { settings: 2, layout: 1 } }))!; assert.ok(h);
  // b looks, sees a live-looking record, waits
  assert.equal((await b.claim()).act, 'wait');
  cb.tick(LEASE_MS - 1); assert.equal((await b.claim()).act, 'wait');
  // a writes again: b's count restarts
  h = (await saveProgress(f.native, h, { cursor: 'page5' }))!; assert.ok(h);
  cb.tick(LEASE_MS - 1); assert.equal((await b.claim()).act, 'wait', 'the clock count restarted when a wrote');
  cb.tick(LEASE_MS); const took = await b.claim();
  assert.equal(took.act, 'held'); if (took.act === 'held') { assert.equal(took.how, 'takeover'); assert.equal(took.held.phase, 'carts'); assert.equal(took.held.cursor, 'page5'); assert.deepEqual(took.held.counts, { settings: 2, layout: 1 }); assert.equal(took.held.holder, 'b'); }
  // a wakes up, tries to carry on, and is told it lost the lease
  assert.equal(await saveProgress(f.native, h, { cursor: 'page6' }), null);
  assert.equal(await finishPhase(f.native, h, 9), null);
  assert.equal(await failMigration(f.native, h, 'late', ca.now()), null);
});

test('a participant never writes, and sees done once the owner has finished', async () => {
  const f = fakeNative(); const c = clock();
  const owner = watch(f, 'a', c); const part = watch(f, 'p', c, false);
  assert.equal((await part.claim()).act, 'wait');
  assert.equal(f.peek(), null);
  const got = await owner.claim(); let h = got.act === 'held' ? got.held : (null as never);
  assert.equal((await part.claim()).act, 'wait'); c.tick(LEASE_MS * 3); assert.equal((await part.claim()).act, 'wait', 'never takes over');
  for (const p of MIGRATION_PHASES) { h = (await finishPhase(f.native, h, 1))!; assert.ok(h, p); }
  assert.equal(h.phase, 'rollups', 'stays on the last phase after finishing it');
  assert.deepEqual(h.counts, { settings: 1, drawer: 1, layout: 1, carts: 1, sales: 1, rollups: 1 });
  await assert.rejects(() => completeMigration(f.native, h, false, c.now()), /counts have been checked/);
  const done = (await completeMigration(f.native, h, true, c.now()))!; assert.equal(done.status, 'done'); assert.equal(done.finishedAt, c.now());
  const seen = await part.claim(); assert.equal(seen.act, 'done');
  assert.equal((await owner.claim()).act, 'done', 'a finished import is not started again');
});

test('done cannot be written before the last phase', async () => {
  const f = fakeNative(); const c = clock();
  const got = await watch(f, 'a', c).claim(); const h = got.act === 'held' ? got.held : (null as never);
  await assert.rejects(() => completeMigration(f.native, h, true, c.now()), /last phase/);
});

test('a failed run says why, and the next owner iPad carries on at once', async () => {
  const f = fakeNative(); const ca = clock(); const cb = clock();
  const got = await watch(f, 'a', ca).claim(); let h = got.act === 'held' ? got.held : (null as never);
  h = (await finishPhase(f.native, h, 4))!; h = (await saveProgress(f.native, h, { cursor: 'k' }))!;
  const failed = (await failMigration(f.native, h, 'x'.repeat(500), ca.now()))!;
  assert.equal(failed.status, 'failed'); assert.equal(failed.error.length, 300);
  const r = readMigration(f.peek()); assert.equal(r.kind, 'ok');
  const t = await watch(f, 'b', cb).claim(); assert.equal(t.act, 'held');
  if (t.act === 'held') { assert.equal(t.held.phase, 'drawer'); assert.equal(t.held.cursor, 'k'); assert.equal(t.held.error, ''); assert.deepEqual(t.held.counts, { settings: 4 }); }
});

test('an iPad that restarts resumes its own lease from the stored place', async () => {
  const f = fakeNative(); const c = clock();
  const got = await watch(f, 'a', c).claim(); let h = got.act === 'held' ? got.held : (null as never);
  h = (await saveProgress(f.native, h, { phase: 'sales', cursor: 'abc' }))!; assert.ok(h);
  const again = await watch(f, 'a', c).claim(); // a fresh watcher, as after a relaunch
  assert.equal(again.act, 'held'); if (again.act === 'held') { assert.equal(again.how, 'resume'); assert.equal(again.held.phase, 'sales'); assert.equal(again.held.cursor, 'abc'); }
});

test('a record from a newer build is never written, even by the owner', async () => {
  const f = fakeNative(); const c = clock();
  f.set({ v: MIGRATION_VERSION + 1, status: 'running', phase: 'sales', tag: 'n1' });
  const r = await watch(f, 'a', c).claim(); assert.deepEqual(r, { act: 'wait', why: 'newer', state: null });
  assert.equal(f.log.length, 0);
});

test('a write that comes back without a tag counts as not held, so two holders cannot appear', async () => {
  const f = fakeNative({ omitTag: true }); const c = clock();
  assert.equal((await watch(f, 'a', c).claim()).act, 'lost');
});

test('the screen sentence names the step and who is working', async () => {
  const c = ctx({ isOwner: false });
  assert.equal(migrationLine({ kind: 'none' }, c), 'The shop owner\'s iPad is setting up sync. This iPad will join when it is done.');
  assert.equal(migrationLine(ok({ phase: 'carts', holderName: 'Front' }), { ...ctx({ now: T0 + 1 }) }), 'Front is setting up sync, step 4 of 6.');
  assert.equal(migrationLine(ok({ status: 'done' }), c), 'Sync is set up.');
  assert.match(migrationLine({ kind: 'newer', tag: '' }, c), /latest version/);
  const f = fakeNative(); const clk = clock(); const w = watch(f, 'a', clk);
  assert.equal(await w.line(), 'Ready to set up sync from this iPad.');
  assert.equal((await loadMigration(f.native)).kind, 'none');
});

test('looksStuck turns true only after a full lease with no new tag', async () => {
  const f = fakeNative(); const ca = clock(); const cb = clock();
  const a = watch(f, 'a', ca); const b = watch(f, 'b', cb);
  await a.claim(); await b.check(); assert.equal(b.looksStuck(), false);
  cb.tick(LEASE_MS); assert.equal(b.looksStuck(), true);
  b.forget(); assert.equal(b.looksStuck(), false);
});
