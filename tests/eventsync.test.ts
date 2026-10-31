// Location: tests/eventsync.test.ts
// CloudKit patch 4, call sites: when an event is uploaded and when the ones that were missed are caught up, on an in-memory fake of
// the native module. Also pins, from the source, that csvStore sets an event's time once for both the CSV row and the upload.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEventSync, type EventSyncDeps } from '../src/lib/cloudkit/eventSync';
import type { EventNative } from '../src/lib/cloudkit/eventCloud';
import { EVENTS_HEADER, eventRow, line } from '../src/lib/csvFormat';
import { eventIdFromRecord, type EventInput } from '../src/lib/eventRecords';

type Rec = Record<string, any>;
function world(over: Partial<EventSyncDeps> = {}, csvText = '') {
  const events: Rec[] = []; const calls = { writes: 0, lists: 0 }; let failWrites = 0;
  const n = {
    async putEvent(h: string, f: Rec) { if (failWrites > 0) { failWrites--; throw new Error('offline'); } const name = `event-${h}`; const had = events.find(r => r.recordName === name); if (had) return had; calls.writes++; const r = { ...f, recordName: name }; events.push(r); return r; },
    async listEvents(limit: number, after?: string | null) { calls.lists++; const from = after ? Number(after) : 0; return { rows: events.slice(from, from + limit), next: from + limit < events.length ? String(from + limit) : null }; },
  } as unknown as EventNative;
  const state = { csv: csvText };
  const deps: EventSyncDeps = { active: () => true, training: () => false, who: () => ({ id: 'reg-a', name: 'Front' }), native: async () => n, readCsv: async () => state.csv, ...over };
  return { sync: createEventSync(deps), events, calls, state, failNext: (k: number) => { failWrites = k; } };
}
const ev = (n: number, o: Partial<EventInput> = {}): EventInput => ({ ts: `2026-10-31T0${n}:00:00.000Z`, kind: 'declined', reference: `r${n}`, amountCents: 100 * n, ...o });
const csvOf = (...es: EventInput[]) => line([...EVENTS_HEADER]) + es.map(e => eventRow(e)).join('');

test('nothing is sent when CloudKit is not the active backend, in practice mode, or before the register has an id', async () => {
  for (const over of [{ active: () => false }, { training: () => true }, { who: () => ({ id: '', name: '' }) }]) {
    const w = world(over, csvOf(ev(1)));
    assert.equal(await w.sync.catchUp(), null); await w.sync.upload(ev(2));
    assert.equal(w.events.length, 0);
  }
});
test('a register that has just joined uploads its own history once, and nothing is written twice', async () => {
  const w = world({}, csvOf(ev(1), ev(2), ev(3)));
  assert.equal(await w.sync.catchUp(), 3);
  assert.equal(w.events.length, 3);
  assert.equal(await w.sync.catchUp(), null, 'no second pass until something fails');
  assert.equal(w.calls.writes, 3);
});
test('after the catch-up an event is written straight away, with no listing', async () => {
  const w = world({}, csvOf(ev(1)));
  await w.sync.catchUp(); const lists = w.calls.lists;
  await w.sync.upload(ev(2));
  assert.equal(w.events.length, 2); assert.equal(w.calls.lists, lists);
  assert.ok(w.events.every(r => r.registerId === 'reg-a' && r.registerName === 'Front'));
});
test('an event made before the first catch-up waits for it, and still arrives once', async () => {
  const w = world({}, csvOf(ev(1), ev(2)));
  await w.sync.upload(ev(2)); assert.equal(w.events.length, 0);
  await w.sync.catchUp(); assert.equal(w.events.length, 2);
});
test('a live upload that fails is caught up later, and the one already sent is not sent again', async () => {
  const w = world({}, csvOf(ev(1)));
  await w.sync.catchUp();
  w.state.csv = csvOf(ev(1), ev(2), ev(3));
  await w.sync.upload(ev(2));                // ok
  w.failNext(1); await w.sync.upload(ev(3)); // fails: the app must not throw
  assert.equal(w.sync.isBehind(), true); assert.equal(w.events.length, 2);
  assert.equal(await w.sync.catchUp(), 1);
  assert.equal(w.events.length, 3); assert.equal(w.calls.writes, 3);
  assert.equal(new Set(w.events.map(r => eventIdFromRecord(r.recordName))).size, 3);
});
test('a failed catch-up reports nothing sent, does not throw, and is tried again', async () => {
  const w = world({}, csvOf(ev(1)));
  w.failNext(1); assert.equal(await w.sync.catchUp(), null); assert.equal(w.sync.isBehind(), true);
  assert.equal(await w.sync.catchUp(), 1);
});

test('csvStore sets the time once for the CSV row and the upload, and sends nothing in practice mode', () => {
  const src = readFileSync('src/lib/csvStore.ts', 'utf8');
  const i = src.indexOf('async event('); assert.ok(i >= 0); const body = src.slice(i, src.indexOf('async readEvents', i));
  assert.match(body, /ts: e\.ts \?\? new Date\(\)\.toISOString\(\)/);
  assert.match(body, /eventRow\(full\)/); assert.match(body, /if \(!isTraining\(\)\) eventSink\?\.\(full\)/);
  assert.equal((body.match(/new Date\(\)/g) ?? []).length, 1, 'the time is made in one place only');
});
