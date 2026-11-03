// Location: tests/pushpoll.test.ts
// CloudKit patch 8b: the decisions behind push-triggered reads, on a fake clock and a fake timer. Subscribe once, retry after a failure, a burst of
// pushes becomes one read, two reads never overlap, a push that arrives during a read is not lost, and nothing happens unless CloudKit is
// active and this is not a practice run. The Swift that delivers the pushes is checked as text in tests/cloudkitswift.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPushPoll, PUSH_MIN_GAP_MS, type PushPollDeps } from '../src/lib/cloudkit/pushPoll';

const world = (o: Partial<PushPollDeps> & { subscribeResults?: (boolean | 'throw')[] } = {}) => {
  let t = 1_000_000; const timers: { at: number; fn: () => void }[] = []; let listener: (() => void) | null = null; let listens = 0; let unlistens = 0;
  const calls = { subscribe: 0, run: 0 }; let release: (() => void) | null = null; let hold = false; let active = true; let training = false;
  const results = [...(o.subscribeResults ?? [true])];
  const deps: PushPollDeps = {
    active: () => active, training: () => training,
    subscribe: async () => { calls.subscribe += 1; const r = results.length > 1 ? results.shift()! : results[0]; if (r === 'throw') throw new Error('no iCloud'); return r; },
    listen: cb => { listens += 1; listener = cb; return () => { unlistens += 1; listener = null; }; },
    run: async () => { calls.run += 1; if (hold) await new Promise<void>(r => { release = r; }); },
    now: () => t, later: (fn, ms) => { timers.push({ at: t + ms, fn }); return 0; }, ...o,
  };
  const p = createPushPoll(deps);
  return {
    p, calls, push: () => listener?.(), listens: () => listens, unlistens: () => unlistens, timers: () => timers.length,
    advance: (ms: number) => { t += ms; for (const x of timers.splice(0).filter(x => x.at <= t)) x.fn(); },
    holdRuns: (v: boolean) => { hold = v; }, finishRun: async () => { release?.(); release = null; await new Promise(r => setImmediate(r)); },
    set: (k: 'active' | 'training', v: boolean) => { if (k === 'active') active = v; else training = v; }, tick: () => new Promise(r => setImmediate(r)),
  };
};

test('start subscribes once and listens once, however often it is called', async () => {
  const w = world(); await w.p.start(); await w.p.start(); await Promise.all([w.p.start(), w.p.start()]);
  assert.equal(w.calls.subscribe, 1); assert.equal(w.listens(), 1); assert.equal(w.p.status().state, 'listening');
});
test('a failed or refused subscription is reported, and the next start tries again without listening twice', async () => {
  const w = world({ subscribeResults: ['throw', false, true] });
  assert.equal(await w.p.start(), 'unavailable'); assert.equal(w.listens(), 0);
  assert.equal(await w.p.start(), 'unavailable'); assert.equal(await w.p.start(), 'listening'); assert.equal(w.calls.subscribe, 3); assert.equal(w.listens(), 1);
});
test('nothing is subscribed unless CloudKit is active, and never in practice mode', async () => {
  const a = world(); a.set('active', false); assert.equal(await a.p.start(), 'off'); assert.equal(a.calls.subscribe, 0);
  const b = world(); b.set('training', true); assert.equal(await b.p.start(), 'off'); assert.equal(b.calls.subscribe, 0);
});
test('a push reads the shop straight away', async () => {
  const w = world(); await w.p.start(); w.push(); await w.tick(); assert.equal(w.calls.run, 1); assert.equal(w.p.status().events, 1);
});
test('a burst of pushes inside the gap becomes one read now and one later', async () => {
  const w = world(); await w.p.start(); w.push(); await w.tick();
  for (let i = 0; i < 5; i++) w.push(); await w.tick();
  assert.equal(w.calls.run, 1, 'the extra pushes wait for the gap'); assert.equal(w.timers(), 1, 'and share a single timer');
  w.advance(PUSH_MIN_GAP_MS); await w.tick(); assert.equal(w.calls.run, 2); assert.equal(w.p.status().events, 6);
});
test('a push that arrives during a read is not lost, and reads never overlap', async () => {
  const w = world(); await w.p.start(); w.holdRuns(true); w.push(); await w.tick(); w.push(); w.push(); await w.tick();
  assert.equal(w.calls.run, 1, 'still the first read'); w.holdRuns(false); await w.finishRun();
  w.advance(PUSH_MIN_GAP_MS); await w.tick(); assert.equal(w.calls.run, 2, 'one more read owed for the pushes that came during the first');
  w.advance(PUSH_MIN_GAP_MS * 5); await w.tick(); assert.equal(w.calls.run, 2, 'and no more than that');
});
test('a read that fails does not stop later pushes', async () => {
  const w = world({ run: async () => { throw new Error('offline'); } }); await w.p.start(); w.push(); await w.tick(); w.advance(PUSH_MIN_GAP_MS); w.push(); await w.tick();
  assert.equal(w.p.status().reads, 2);
});
test('pushes are ignored once CloudKit is no longer active or practice mode starts', async () => {
  const w = world(); await w.p.start(); w.set('training', true); w.push(); await w.tick(); assert.equal(w.calls.run, 0);
  w.set('training', false); w.set('active', false); w.push(); await w.tick(); assert.equal(w.calls.run, 0);
});
test('stop removes the listener and a leftover timer then reads nothing', async () => {
  const w = world(); await w.p.start(); w.push(); await w.tick(); w.push(); await w.tick(); assert.equal(w.timers(), 1);
  w.p.stop(); assert.equal(w.unlistens(), 1); assert.equal(w.p.status().state, 'off'); w.advance(PUSH_MIN_GAP_MS); await w.tick(); assert.equal(w.calls.run, 1);
  assert.equal(await w.p.start(), 'listening'); assert.equal(w.listens(), 2, 'it can be started again');
});
