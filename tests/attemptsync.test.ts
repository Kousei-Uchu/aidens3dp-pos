// Location: tests/attemptsync.test.ts
// CloudKit patch 4, call sites: when a payment attempt is uploaded and caught up, on an in-memory fake of the native module, plus
// source pins that Pay.tsx pushes after every change to an attempt and says so when another register resolved a payment first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAttemptSync, type AttemptSyncDeps } from '../src/lib/cloudkit/attemptSync';
import type { EventNative } from '../src/lib/cloudkit/eventCloud';
import type { Attempt } from '../src/state/store';

type Rec = Record<string, any>;
function shop() { // one shared CloudKit zone, so two registers can be tested against it
  const attempts = new Map<string, Rec>(), resolutions = new Map<string, Rec>(); const calls = { attemptWrites: 0, resolutionWrites: 0 }; let fail = 0;
  const n = {
    async putAttempt(h: string, f: Rec) { if (fail > 0) { fail--; throw new Error('offline'); } calls.attemptWrites++; const r = { ...f, recordName: `attempt-${h}` }; attempts.set(h, r); return r; },
    async getAttempt(h: string) { return attempts.get(h) ?? null; },
    async putResolution(h: string, f: Rec) { const had = resolutions.get(h); if (had) return had; calls.resolutionWrites++; const r = { ...f, recordName: `resolve-${h}` }; resolutions.set(h, r); return r; },
    async getResolution(h: string) { return resolutions.get(h) ?? null; },
  } as unknown as EventNative;
  return { n, attempts, resolutions, calls, failNext: (k: number) => { fail = k; } };
}
function register(z: ReturnType<typeof shop>, id: string, local: Attempt[] = [], over: Partial<AttemptSyncDeps> = {}) {
  return createAttemptSync({ active: () => true, training: () => false, who: () => ({ id, name: `Reg ${id}` }), native: async () => z.n, local: () => local, ...over });
}
const att = (o: Partial<Attempt> = {}): Attempt => ({ ref: 'ref-1', saleUuid: 's1', amountCents: 2500, ts: '2026-10-31T03:00:00.000Z', status: 'started', ...o });

test('nothing is sent when CloudKit is not active, in practice mode, or before the register has an id', async () => {
  for (const over of [{ active: () => false }, { training: () => true }, { who: () => ({ id: '', name: '' }) }]) {
    const z = shop(); const s = register(z, 'a', [att()], over);
    assert.equal(await s.catchUp(), null); assert.equal(await s.push(att()), null);
    assert.equal(z.attempts.size, 0);
  }
});
test('the first launch sends the register\'s own attempts once, and a push before that waits for it', async () => {
  const z = shop(); const list = [att(), att({ ref: 'ref-2', status: 'unknown' })]; const s = register(z, 'a', list);
  assert.equal(await s.push(list[0]), null); assert.equal(z.attempts.size, 0);
  assert.equal(await s.catchUp(), 2); assert.equal(z.attempts.size, 2);
  assert.equal(await s.catchUp(), null);
});
test('after the catch-up a change goes up straight away, labelled with the register, and its status never moves backwards', async () => {
  const z = shop(); const s = register(z, 'a'); await s.catchUp();
  const first = await s.push(att({ status: 'unknown' }));
  assert.equal(first?.registerName, 'Reg a');
  const again = await s.push(att({ status: 'started' })); // an older status arriving late
  assert.equal(again?.status, 'unknown');
});
test('two registers resolving the same payment: the first wins, and the second is told who it was', async () => {
  const z = shop(); const a = register(z, 'a'), b = register(z, 'b'); await a.catchUp(); await b.catchUp();
  await a.push(att({ status: 'unknown' }));
  const ra = await a.push(att({ status: 'resolved', resolvedBy: 'Sam' }));
  const rb = await b.push(att({ status: 'resolved', resolvedBy: 'Alex' }));
  assert.equal(ra?.resolvedBy, 'Sam'); assert.equal(rb?.resolvedBy, 'Sam'); assert.equal(z.calls.resolutionWrites, 1);
  assert.equal(rb?.registerName, 'Reg a', 'the attempt keeps the register that first wrote it');
});
test('a failed upload is caught up later and leaves one record, never throws', async () => {
  const z = shop(); const list = [att()]; const s = register(z, 'a', list); await s.catchUp();
  z.failNext(1); assert.equal(await s.push(att({ status: 'unknown' })), null); assert.equal(s.isBehind(), true);
  list[0] = att({ status: 'unknown' });
  assert.equal(await s.catchUp(), 1); assert.equal(z.attempts.size, 1); assert.equal(z.attempts.get('s1-ref-1')?.status, 'unknown');
});
test('a failed catch-up reports nothing sent, does not throw, and is tried again', async () => {
  const z = shop(); const s = register(z, 'a', [att()]);
  z.failNext(1); assert.equal(await s.catchUp(), null); assert.equal(s.isBehind(), true);
  assert.equal(await s.catchUp(), 1);
});

const pay = readFileSync('src/screens/Pay.tsx', 'utf8');
test('Pay.tsx pushes an attempt when it starts and after every change, once the app has it', () => {
  const set = pay.slice(pay.indexOf('const setAttempt'), pay.indexOf('const blockedByUnknown'));
  assert.ok(set.indexOf('patchPos') >= 0 && set.indexOf('patchPos') < set.indexOf('attemptSync.push(merged)'), 'the app is changed before CloudKit is told');
  const started = pay.slice(pay.indexOf('onStarted:'), pay.indexOf('onEvent:'));
  assert.match(started, /patchPos/); assert.match(started, /attemptSync\.push\(started\)/);
  assert.equal((pay.match(/useApp\.getState\(\)\.patchPos\(\{ attempts:/g) ?? []).length, 2, 'only setAttempt and onStarted change attempts, and both push');
});
test('Pay.tsx says so when another register resolved the payment first', () => {
  const m = pay.slice(pay.indexOf('const manualResolve'), pay.indexOf('// ── cash'));
  assert.match(m, /r\.resolvedBy !== who/); assert.match(m, /notify\(\{ kind: 'info'/);
});
