// Location: tests/eventcloud.test.ts
// CloudKit patch 4, transport half: events and payment attempts pushed and pulled through an in-memory fake of the native module.
// Pins that an event is uploaded once however often it is pushed, that two registers' events are both kept, that a status never
// goes backwards, that the first resolution wins and is the one reported, and that the first writer's label is kept.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pullCloudAttempts, pullCloudEvents, pushCloudAttempt, pushCloudEvents, type EventNative } from '../src/lib/cloudkit/eventCloud';
import { eventId, type EventInput } from '../src/lib/eventRecords';
import type { Attempt } from '../src/state/store';

type Rec = Record<string, any>;
function fake() {
  const events: Rec[] = [], attempts = new Map<string, Rec>(), resolutions = new Map<string, Rec>(); const calls = { eventWrites: 0, resolutionWrites: 0 };
  const page = (rows: Rec[], after: string | null | undefined, limit: number) => { const from = after ? Number(after) : 0; return { rows: rows.slice(from, from + limit), next: from + limit < rows.length ? String(from + limit) : null }; };
  const n: EventNative = {
    async putEvent(h, f) { const name = `event-${h}`; const had = events.find(r => r.recordName === name); if (had) return had; calls.eventWrites++; const r = { ...f, recordName: name }; events.push(r); return r; },
    async listEvents(limit, after) { return page([...events].reverse(), after, limit); },
    async putAttempt(h, f) { const r = { ...f, recordName: `attempt-${h}` }; attempts.set(h, r); return r; },
    async getAttempt(h) { return attempts.get(h) ?? null; },
    async listAttempts(limit, after) { return page([...attempts.values()], after, limit); },
    async putResolution(h, f) { const had = resolutions.get(h); if (had) return had; calls.resolutionWrites++; const r = { ...f, recordName: `resolve-${h}` }; resolutions.set(h, r); return r; },
    async getResolution(h) { return resolutions.get(h) ?? null; },
    async listResolutions(limit, after) { return page([...resolutions.values()], after, limit); },
  };
  return { n, calls, events, attempts };
}
const ev = (ref: string, o: Partial<EventInput> = {}): EventInput => ({ ts: `2026-10-31T0${ref.length}:00:00.000Z`, kind: 'declined', reference: ref, amountCents: 100, ...o });
const att = (o: Partial<Attempt> = {}): Attempt => ({ ref: 'ref-1', saleUuid: 's1', amountCents: 2500, ts: '2026-10-31T03:00:00.000Z', status: 'started', ...o });

test('pushing events uploads each once, and pushing again uploads nothing', async () => {
  const { n, calls } = fake();
  const list = [ev('a'), ev('bb'), ev('a')];
  assert.equal(await pushCloudEvents(n, 'reg-a', 'Front', list), 2);
  assert.equal(await pushCloudEvents(n, 'reg-a', 'Front', list), 0);
  assert.equal(calls.eventWrites, 2);
});
test('two registers events are both kept, labelled, even for the same row', async () => {
  const { n } = fake();
  await pushCloudEvents(n, 'reg-a', 'Front', [ev('a')]);
  await pushCloudEvents(n, 'reg-b', 'Back', [ev('a'), ev('ccc')]);
  const all = await pullCloudEvents(n);
  assert.equal(all.length, 3);
  assert.deepEqual(all.filter(e => e.reference === 'a').map(e => e.registerName).sort(), ['Back', 'Front']);
  assert.ok(all.find(e => e.id === eventId('reg-a', ev('a'))));
});
test('more than a page of events is all read back and all uploaded', async () => {
  const { n } = fake();
  const many = Array.from({ length: 450 }, (_, i) => ev(`r${i}`, { ts: `2026-10-31T00:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000Z` }));
  assert.equal(await pushCloudEvents(n, 'reg-a', 'Front', many), 450);
  assert.equal((await pullCloudEvents(n)).length, 450);
  assert.equal(await pushCloudEvents(n, 'reg-a', 'Front', many), 0);
});
test('an unreadable event record is skipped', async () => {
  const { n, events } = fake();
  events.push({ recordName: 'event-junk', kind: 'nope' });
  await pushCloudEvents(n, 'reg-a', 'Front', [ev('a')]);
  assert.equal((await pullCloudEvents(n)).length, 1);
});

test('an attempt is written with its register and read back', async () => {
  const { n } = fake();
  const saved = await pushCloudAttempt(n, 'reg-a', 'Front', att({ status: 'unknown' }));
  assert.equal(saved?.status, 'unknown'); assert.equal(saved?.registerName, 'Front');
  const all = await pullCloudAttempts(n);
  assert.equal(all.length, 1); assert.equal(all[0].ref, 'ref-1');
});
test('a late upload of an earlier status cannot undo a later one', async () => {
  const { n } = fake();
  await pushCloudAttempt(n, 'reg-a', 'Front', att({ status: 'approved' }));
  const out = await pushCloudAttempt(n, 'reg-b', 'Back', att({ status: 'started' }));
  assert.equal(out?.status, 'approved');
});
test('the register that first wrote an attempt stays its label', async () => {
  const { n } = fake();
  await pushCloudAttempt(n, 'reg-a', 'Front', att({ status: 'unknown' }));
  const out = await pushCloudAttempt(n, 'reg-b', 'Back', att({ status: 'declined' }));
  assert.equal(out?.registerName, 'Front'); assert.equal(out?.status, 'declined');
});
test('the first resolution wins, and the second register is told who resolved it', async () => {
  const { n, calls } = fake();
  await pushCloudAttempt(n, 'reg-a', 'Front', att({ status: 'unknown' }));
  const first = await pushCloudAttempt(n, 'reg-a', 'Front', att({ status: 'resolved', resolvedBy: 'Sam' }));
  const second = await pushCloudAttempt(n, 'reg-b', 'Back', att({ status: 'resolved', resolvedBy: 'Alex' }));
  assert.equal(first?.resolvedBy, 'Sam');
  assert.equal(second?.status, 'resolved'); assert.equal(second?.resolvedBy, 'Sam');
  assert.equal(calls.resolutionWrites, 1);
  assert.equal((await pullCloudAttempts(n))[0].resolvedBy, 'Sam');
});
test('an unresolved attempt reads as still open on every register, and resolved once someone resolves it', async () => {
  const { n } = fake();
  await pushCloudAttempt(n, 'reg-a', 'Front', att({ status: 'unknown' }));
  assert.equal((await pullCloudAttempts(n))[0].status, 'unknown');
  await pushCloudAttempt(n, 'reg-b', 'Back', att({ status: 'resolved', resolvedBy: 'Alex' }));
  const [a] = await pullCloudAttempts(n);
  assert.equal(a.status, 'resolved'); assert.equal(a.resolvedBy, 'Alex');
});
test('attempts for different sales do not mix', async () => {
  const { n } = fake();
  await pushCloudAttempt(n, 'reg-a', 'Front', att({ saleUuid: 's1', status: 'resolved', resolvedBy: 'Sam' }));
  await pushCloudAttempt(n, 'reg-a', 'Front', att({ saleUuid: 's2', status: 'unknown' }));
  const all = await pullCloudAttempts(n);
  assert.equal(all.find(a => a.saleUuid === 's1')?.status, 'resolved');
  assert.equal(all.find(a => a.saleUuid === 's2')?.status, 'unknown');
});
