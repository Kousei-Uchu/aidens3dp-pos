// Location: tests/trainingsync.test.ts
// CloudKit patch 6c, training progress: the merge rules, the record shape, who may reset, and two registers settling on an in-memory fake.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canResetProgress, completeModule, emptyProgress, mergeModule, mergeProgress, readProgress, recordStage, resetAllFully, resetModuleFully, type Progress } from '../src/lib/trainingProgress';
import { progressFromRecords, trainingFromFields, trainingHandle, trainingToFields } from '../src/lib/trainingShared';
import { createTrainingSync, type TrainingNative } from '../src/lib/cloudkit/trainingSync';
import { DEVICE_KEYS } from '../src/lib/backupFile';

const T = new Date('2026-11-02T10:00:00.000Z');
const finish = (p: Progress, who: string, id: string, at = T): Progress => completeModule(recordStage(recordStage(p, who, id, 'check1'), who, id, 'check2'), who, id, { hints: 2, secs: 90 }, at);

test('work done on two registers is kept from both, and the earliest finish stands', () => {
  const a = recordStage(emptyProgress(), 'u1', 'cash', 'info'); const b = finish(recordStage(emptyProgress(), 'u1', 'cash', 'show'), 'u1', 'cash', T);
  const m = mergeProgress(a, b).by.u1.cash; assert.deepEqual(m.stages, ['info', 'show', 'check1', 'check2', 'gratify'].filter(s => m.stages.includes(s as any)));
  assert.ok(m.stages.includes('info') && m.stages.includes('show') && m.stages.includes('check2')); assert.equal(m.done, T.toISOString());
  const later = finish(emptyProgress(), 'u1', 'cash', new Date('2026-12-01T00:00:00Z'));
  assert.equal(mergeProgress(later, b).by.u1.cash.done, T.toISOString());
});
test('merging is the same whichever way round, and joining the same thing twice changes nothing', () => {
  const a = finish(emptyProgress(), 'u1', 'cash'); const b = recordStage(emptyProgress(), 'u1', 'refund', 'info');
  assert.deepEqual(mergeProgress(a, b), mergeProgress(b, a)); assert.deepEqual(mergeProgress(mergeProgress(a, b), b), mergeProgress(a, b));
});
test('a reset beats older work from another register, and work after the reset is kept', () => {
  const done = finish(emptyProgress(), 'u1', 'cash'); const reset = resetModuleFully(done, 'u1', 'cash');
  assert.deepEqual(reset.by.u1.cash, { stages: [], hints: 0, secs: 0, runs: 0, epoch: 1 });
  assert.deepEqual(mergeProgress(done, reset).by.u1.cash, reset.by.u1.cash);
  const again = recordStage(reset, 'u1', 'cash', 'info'); assert.deepEqual(mergeProgress(reset, again).by.u1.cash.stages, ['info']);
  assert.equal(mergeProgress(done, again).by.u1.cash.epoch, 1);
});
test('a full reset clears the tick, unlike the old resetModule, and only touches that person', () => {
  const p = finish(finish(emptyProgress(), 'u1', 'cash'), 'u2', 'cash');
  const r = resetAllFully(p, 'u1'); assert.equal(r.by.u1.cash.done, undefined); assert.ok(r.by.u2.cash.done);
  assert.equal(resetModuleFully(p, 'u1', 'nothing'), p);
});
test('who may reset: owners anyone, managers only cashiers, cashiers nobody', () => {
  for (const t of ['cashier', 'manager', 'owner'] as const) { assert.equal(canResetProgress('owner', t), true); assert.equal(canResetProgress('cashier', t), false); }
  assert.equal(canResetProgress('manager', 'cashier'), true); assert.equal(canResetProgress('manager', 'manager'), false); assert.equal(canResetProgress('manager', 'owner'), false);
});
test('the reset count survives being stored and read back, and an unreset module reads as before', () => {
  const p = resetModuleFully(finish(emptyProgress(), 'u1', 'cash'), 'u1', 'cash'); assert.equal(readProgress(JSON.parse(JSON.stringify(p))).by.u1.cash.epoch, 1);
  assert.equal('epoch' in readProgress(JSON.parse(JSON.stringify(finish(emptyProgress(), 'u1', 'cash')))).by.u1.cash, false);
});
test('a record round trips, and one that is not readable is dropped, not thrown', () => {
  const m = finish(emptyProgress(), 'u1', 'cash').by.u1.cash; const f = trainingToFields('u1', 'cash', m, 'reg-a', 'Front', 't');
  assert.deepEqual(trainingFromFields(f), { who: 'u1', module: 'cash', mod: m });
  assert.equal(trainingFromFields({ ...f, who: '../x' }), null); assert.equal(trainingFromFields({}), null);
  assert.deepEqual(trainingFromFields({ ...f, stages: 'bogus,info', hints: -3 })?.mod, { stages: ['info'], done: m.done, hints: 0, secs: m.secs, runs: m.runs });
  assert.deepEqual(progressFromRecords([f, { who: 5 }]).by.u1.cash, m);
  assert.equal(trainingHandle('u1', 'cash'), 'u1-cash'); assert.throws(() => trainingHandle('u/1', 'cash'));
});

type Rec = Record<string, any>;
function cloud() {
  const rows = new Map<string, Rec>(); const calls = { puts: 0 }; let fail = false;
  const native: TrainingNative = {
    async putTraining(h, f) { if (fail) throw new Error('offline'); calls.puts++; rows.set(h, { ...f, recordName: `training-${h}` }); return f; },
    async listTraining() { if (fail) throw new Error('offline'); return { rows: [...rows.values()].map(r => ({ ...r })), next: null }; },
  };
  return { native, rows, calls, setFail: (b: boolean) => { fail = b; } };
}
function register(c: ReturnType<typeof cloud>, id: string, over: Partial<Parameters<typeof createTrainingSync>[0]> = {}) {
  const me = { p: emptyProgress() as Progress };
  const sync = createTrainingSync({ active: () => true, training: () => false, who: () => ({ id, name: id }), native: async () => c.native, getLocal: async () => me.p, setLocal: async p => { me.p = p; }, now: () => 't', ...over });
  return { me, sync };
}
const settle = async (...rs: ReturnType<typeof register>[]) => { for (let i = 0; i < 3; i++) for (const r of rs) await r.sync.run(); };

test('nothing happens when CloudKit is not active, in practice mode, or before the register has an id', async () => {
  for (const over of [{ active: () => false }, { training: () => true }, { who: () => ({ id: '', name: '' }) }]) {
    const c = cloud(); const a = register(c, 'a', over); a.me.p = finish(emptyProgress(), 'u1', 'cash'); assert.equal(await a.sync.run(), null); assert.equal(c.calls.puts, 0);
  }
});
test('a tick earned on one register shows on the other, and settled registers write nothing more', async () => {
  const c = cloud(); const a = register(c, 'a'); const b = register(c, 'b'); a.me.p = finish(emptyProgress(), 'u1', 'cash');
  assert.deepEqual(await a.sync.run(), { taken: 0, sent: 1 }); assert.deepEqual(await b.sync.run(), { taken: 1, sent: 0 });
  assert.ok(b.me.p.by.u1.cash.done); const puts = c.calls.puts; await settle(a, b); assert.equal(c.calls.puts, puts);
});
test('marks earned on both registers join, and neither is lost', async () => {
  const c = cloud(); const a = register(c, 'a'); const b = register(c, 'b');
  a.me.p = recordStage(emptyProgress(), 'u1', 'cash', 'info'); b.me.p = recordStage(emptyProgress(), 'u1', 'cash', 'show'); await settle(a, b);
  for (const r of [a, b]) assert.deepEqual(r.me.p.by.u1.cash.stages, ['info', 'show']);
});
test('a reset made on one register clears the other, even though it still held the old tick', async () => {
  const c = cloud(); const a = register(c, 'a'); const b = register(c, 'b'); a.me.p = finish(emptyProgress(), 'u1', 'cash'); await settle(a, b);
  a.me.p = resetModuleFully(a.me.p, 'u1', 'cash'); await settle(a, b);
  for (const r of [a, b]) assert.equal(r.me.p.by.u1.cash.done, undefined);
});
test('a reset made while the other register was offline wins when it comes back', async () => {
  const c = cloud(); const a = register(c, 'a'); const b = register(c, 'b'); a.me.p = recordStage(emptyProgress(), 'u1', 'cash', 'info'); await settle(a, b);
  a.me.p = resetModuleFully(a.me.p, 'u1', 'cash'); await a.sync.run(); b.me.p = recordStage(b.me.p, 'u1', 'cash', 'show'); await settle(a, b);
  for (const r of [a, b]) assert.deepEqual(r.me.p.by.u1.cash.stages, []);
});
test('a mark made while a poll is running is kept', async () => {
  const c = cloud(); const b = register(c, 'b'); b.me.p = finish(emptyProgress(), 'u2', 'cash'); await b.sync.run();
  const me = { p: emptyProgress() as Progress }; let reads = 0;
  const a = createTrainingSync({ active: () => true, training: () => false, who: () => ({ id: 'a', name: 'a' }), native: async () => c.native, now: () => 't',
    getLocal: async () => { const p = me.p; if (++reads === 1) me.p = recordStage(me.p, 'u1', 'cash', 'info'); return p; }, // a mark lands after the first read
    setLocal: async p => { me.p = p; } });
  await a.run(); assert.ok(me.p.by.u2.cash.done, 'the shop\'s mark was taken'); assert.deepEqual(me.p.by.u1.cash.stages, ['info'], 'the mark made meanwhile was kept');
});
test('a failure is not thrown and changes nothing; the next poll finishes', async () => {
  const c = cloud(); const a = register(c, 'a'); a.me.p = finish(emptyProgress(), 'u1', 'cash'); c.setFail(true); assert.equal(await a.sync.run(), null); c.setFail(false); assert.deepEqual(await a.sync.run(), { taken: 0, sent: 1 });
});
test('a person with an unsafe id is never written under a bent name', async () => {
  const c = cloud(); const a = register(c, 'a'); a.me.p = finish(emptyProgress(), '../evil', 'cash'); const r = await a.sync.run(); assert.equal(r?.sent, 0); assert.equal(c.calls.puts, 0);
});
test('mergeModule keeps the larger run count with its own hints and time', () => {
  const m = mergeModule({ stages: ['info'], hints: 1, secs: 10, runs: 1 }, { stages: [], hints: 5, secs: 50, runs: 3 })!; assert.deepEqual([m.hints, m.secs, m.runs], [5, 50, 3]);
});
test('the wiring: the poll runs it, the session store has the actions, the Swift and module export it, and the screen checks the role', () => {
  const sync = readFileSync('src/lib/sync.ts', 'utf8'); assert.match(sync, /await trainingSync\.run\(\)/); assert.match(sync, /createTrainingSync\(\{/);
  const ts = readFileSync('src/state/trainingSession.ts', 'utf8'); assert.match(ts, /adoptProgress: async/); assert.match(ts, /resetProgress: \(staffId, moduleId\)/);
  for (const f of ['putTraining', 'listTraining']) { assert.match(readFileSync('modules/cloudkit-sync/index.ts', 'utf8'), new RegExp(`export async function ${f}\\(`)); assert.match(readFileSync('modules/cloudkit-sync/ios/CloudKitSyncModule.swift', 'utf8'), new RegExp(`AsyncFunction\\("${f}"\\)`)); }
  assert.match(readFileSync('src/screens/Training.tsx', 'utf8'), /canResetProgress\(me\.role, x\.role\)/);
  assert.ok(!(DEVICE_KEYS as readonly string[]).includes('training.progress.v1'));
});
