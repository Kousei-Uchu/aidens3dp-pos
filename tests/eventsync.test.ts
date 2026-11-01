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

// ── The combined CSV (0201) ──────────────────────────────────────────────────────────────────────────────────────────────
// Two registers share one fake CloudKit. Register B's events are written straight into the fake, as if B had uploaded them.
function twoRegisters(csvA: string) {
  const a = world({}, csvA);
  const putB = async (e: EventInput) => { const { eventId, eventToFields } = await import('../src/lib/eventRecords'); a.events.push({ ...eventToFields('reg-b', 'Back', e), recordName: `event-${eventId('reg-b', e)}` }); };
  return { ...a, putB };
}
test('the combined CSV holds every register\'s events, oldest first, each once, with the register\'s name', async () => {
  const w = twoRegisters(csvOf(ev(1), ev(3)));
  await w.putB(ev(2, { kind: 'void', reference: 'rb' }));
  const text = await w.sync.exportCsv();
  assert.ok(text);
  const rows = text!.trim().split('\n');
  assert.equal(rows.length, 4, 'a header and three events');
  assert.match(rows[0], /,register$/);
  assert.deepEqual(rows.slice(1).map(r => r.split(',')[0]), [ev(1).ts, ev(2).ts, ev(3).ts], 'oldest first');
  assert.deepEqual(rows.slice(1).map(r => r.split(',').pop()), ['Front', 'Back', 'Front']);
});
test('exporting first sends this register\'s own history, so the file is not missing events made here', async () => {
  const w = world({}, csvOf(ev(1), ev(2)));
  assert.equal(w.sync.isBehind(), true);
  const text = await w.sync.exportCsv();
  assert.equal(w.events.length, 2); assert.equal(w.sync.isBehind(), false);
  assert.equal(text!.trim().split('\n').length, 3);
});
test('exporting twice gives the same file and writes nothing more', async () => {
  const w = world({}, csvOf(ev(1), ev(2)));
  const one = await w.sync.exportCsv(); const writes = w.calls.writes; const two = await w.sync.exportCsv();
  assert.equal(one, two); assert.equal(w.calls.writes, writes);
});
test('no file is made when CloudKit is not the active backend, in practice mode, or before the register has an id', async () => {
  for (const over of [{ active: () => false }, { training: () => true }, { who: () => ({ id: '', name: '' }) }]) {
    const w = world(over, csvOf(ev(1)));
    assert.equal(await w.sync.exportCsv(), null); assert.equal(w.events.length, 0); assert.equal(w.calls.lists, 0);
  }
});
test('a CloudKit read that fails is reported to the person who asked, not hidden', async () => {
  const w = world({ native: async () => { throw new Error('iCloud is not reachable'); } }, csvOf(ev(1)));
  await assert.rejects(w.sync.exportCsv(), /iCloud is not reachable/);
});
test('the Cloud sync page offers the export only when CloudKit is the backend, and keeps it off in practice mode', () => {
  const screen = readFileSync('src/screens/CloudSync.tsx', 'utf8');
  assert.match(screen, /activeBackendKind\(\) === 'cloudkit'/);
  assert.match(screen, /spot=\{SPOT\.cloudSyncEvents\}[^>]*disabled=\{practice\}/);
  assert.match(screen, /eventSync\.exportCsv\(\)/);
  assert.match(readFileSync('src/lib/sync.ts', 'utf8'), /export const eventSync = events;/);
});
