// Location: tests/eventrecords.test.ts
// CloudKit patch 4 (pure half): events and payment attempts as records. Pins that an event's id is stable and per register, that
// the same event uploaded twice is one record, that a bad record is skipped, that the combined CSV carries the register, that an
// attempt's status only moves forward, and that a resolution is its own write-once record, so the first resolver is the one kept.
import test from 'node:test';
import assert from 'node:assert/strict';
import { attemptFromFields, attemptRecordName, attemptToFields, eventFromFields, eventId, eventIdFromRecord, eventRecordName, eventsCsv, eventsToUpload, eventToFields, furtherStatus, resolutionRecordName, unresolvedAttempts, EVENT_KINDS, type EventInput, type SharedAttempt } from '../src/lib/eventRecords';
import { EVENTS_HEADER, eventRow } from '../src/lib/csvFormat';
import type { Attempt } from '../src/state/store';

const ev = (o: Partial<EventInput> = {}): EventInput => ({ ts: '2026-10-31T03:00:00.000Z', kind: 'declined', saleUuid: 's1', reference: 'ref-1', amountCents: 1250, code: '05', message: 'Do not honour', staff: 'Sam', detail: 'visa, "chip"', ...o });

test('the kinds match the CSV kinds', () => {
  assert.equal(EVENT_KINDS.length, 14);
  assert.ok(EVENT_KINDS.includes('staff_switch') && EVENT_KINDS.includes('refund_failed') && EVENT_KINDS.includes('paid_in'));
});
test('an event id is stable, per register, and the same for the same row', () => {
  assert.equal(eventId('reg-a', ev()), eventId('reg-a', ev()));
  assert.notEqual(eventId('reg-a', ev()), eventId('reg-b', ev()));
  assert.notEqual(eventId('reg-a', ev()), eventId('reg-a', ev({ amountCents: 1251 })));
  assert.notEqual(eventId('reg-a', ev()), eventId('reg-a', ev({ ts: '2026-10-31T03:00:00.001Z' })));
  assert.match(eventId('reg-a', ev()), /^reg-a-[0-9a-f]{14}$/);
});
test('the id is worked out from the CSV row, so a row read back later gives the same id', () => {
  const e = ev();
  const rebuilt: EventInput = { ts: e.ts, kind: e.kind, saleUuid: e.saleUuid, reference: e.reference, amountCents: 1250, code: e.code, message: e.message, staff: e.staff, detail: e.detail };
  assert.equal(eventRow(e), eventRow(rebuilt));
  assert.equal(eventId('r', e), eventId('r', rebuilt));
});
test('record names are deterministic and reversible', () => {
  assert.equal(eventRecordName('reg-a-abc'), 'event-reg-a-abc');
  assert.equal(eventIdFromRecord('event-reg-a-abc'), 'reg-a-abc');
  assert.equal(eventIdFromRecord('event-'), null);
  assert.equal(eventIdFromRecord('ledger-x'), null);
  assert.equal(attemptRecordName('s1', 'ref-1'), 'attempt-s1-ref-1');
  assert.equal(resolutionRecordName('s1', 'ref-1'), 'resolve-s1-ref-1');
});
test('an event round trips with the register that made it, and a zero amount is kept', () => {
  const e = ev({ amountCents: 0 });
  const id = eventId('reg-a', e);
  const back = eventFromFields(id, eventToFields('reg-a', 'Front till', e))!;
  assert.deepEqual(back, { ...e, id, registerId: 'reg-a', registerName: 'Front till' });
  const bare = eventFromFields('x', eventToFields('r', 'R', { ts: 't', kind: 'no_sale' }))!;
  assert.deepEqual(bare, { id: 'x', ts: 't', kind: 'no_sale', registerId: 'r', registerName: 'R' });
});
test('a bad event record is skipped', () => {
  assert.equal(eventFromFields('x', {}), null);
  assert.equal(eventFromFields('x', { ts: 't', kind: 'not_a_kind', registerId: 'r' }), null);
  assert.equal(eventFromFields('x', { ts: 't', kind: 'void' }), null);
  assert.equal(eventFromFields('', { ts: 't', kind: 'void', registerId: 'r' }), null);
});
test('only events CloudKit lacks are uploaded, once each, oldest first', () => {
  const a = ev({ ts: '2026-10-31T01:00:00.000Z', reference: 'a' }), b = ev({ ts: '2026-10-31T02:00:00.000Z', reference: 'b' }), c = ev({ ts: '2026-10-31T00:00:00.000Z', reference: 'c' });
  const have = new Set([eventId('r', b)]);
  const up = eventsToUpload('r', [a, b, c, a], have);
  assert.deepEqual(up.map(u => u.event.reference), ['c', 'a']);
  assert.equal(up[0].id, eventId('r', c));
});
test('the combined CSV has the events columns plus the register, oldest first, each event once', () => {
  const mk = (reg: string, name: string, e: EventInput) => eventFromFields(eventId(reg, e), eventToFields(reg, name, e))!;
  const e1 = mk('a', 'Front', ev({ ts: '2026-10-31T02:00:00.000Z', reference: 'late' })), e2 = mk('b', 'Back', ev({ ts: '2026-10-31T01:00:00.000Z', reference: 'early', amountCents: 500 }));
  const rows = eventsCsv([e1, e2, e1]).trimEnd().split('\n');
  assert.equal(rows[0], [...EVENTS_HEADER, 'register'].join(','));
  assert.equal(rows.length, 3);
  assert.match(rows[1], /early/); assert.match(rows[1], /5\.00/); assert.match(rows[1], /Back$/);
  assert.match(rows[2], /late/); assert.match(rows[2], /Front$/);
  assert.equal(eventsCsv([]).trimEnd(), [...EVENTS_HEADER, 'register'].join(','));
});

const att = (o: Partial<Attempt> = {}): Attempt => ({ ref: 'ref-1', saleUuid: 's1', amountCents: 2500, ts: '2026-10-31T03:00:00.000Z', status: 'started', ...o });
test('an open attempt is one record with the register, and no resolution', () => {
  const { attempt, resolution } = attemptToFields('reg-a', 'Front till', att({ status: 'declined', note: 'n' }));
  assert.equal(resolution, undefined);
  const back = attemptFromFields(attempt)!;
  assert.deepEqual(back, { ...att({ status: 'declined', note: 'n' }), registerId: 'reg-a', registerName: 'Front till' });
});
test('a resolved attempt writes an open status and a separate resolution, and reads back as resolved', () => {
  const { attempt, resolution } = attemptToFields('reg-b', 'Back till', att({ status: 'resolved', resolvedBy: 'Sam' }));
  assert.equal(attempt.status, 'unknown');
  assert.equal(resolution!.resolvedBy, 'Sam');
  const back = attemptFromFields(attempt, resolution)!;
  assert.equal(back.status, 'resolved'); assert.equal(back.resolvedBy, 'Sam'); assert.equal(back.registerName, 'Back till');
  assert.equal(attemptFromFields(attempt)!.status, 'unknown'); // no resolution record yet: still open
});
test('a resolution with no name falls back to the register that wrote it', () => {
  const { resolution } = attemptToFields('reg-b', 'Back till', att({ status: 'resolved' }));
  assert.equal(resolution!.resolvedBy, 'Back till');
});
test('an attempt status only moves forward, and ties keep the stored one', () => {
  assert.equal(furtherStatus('started', 'unknown'), 'unknown');
  assert.equal(furtherStatus('unknown', 'approved'), 'approved');
  assert.equal(furtherStatus('approved', 'started'), 'approved'); // a late upload cannot undo it
  assert.equal(furtherStatus('unknown', 'started'), 'unknown');
  assert.equal(furtherStatus('declined', 'approved'), 'declined');
});
test('a bad attempt record is skipped', () => {
  assert.equal(attemptFromFields({}), null);
  assert.equal(attemptFromFields({ ref: 'r', saleUuid: 's', ts: 't', registerId: 'x', amountCents: 5, status: 'resolved' }), null); // resolved is never stored on the attempt itself
  assert.equal(attemptFromFields({ ref: 'r', saleUuid: 's', ts: 't', registerId: 'x', amountCents: 'five', status: 'started' }), null);
});
test('the shop-wide unresolved list holds started and unknown attempts only, newest first', () => {
  const mk = (ref: string, status: Attempt['status'], ts: string): SharedAttempt => ({ ...att({ ref, status, ts }), registerId: 'r', registerName: 'R' });
  const list = unresolvedAttempts([mk('a', 'approved', '2026-10-31T05:00:00Z'), mk('b', 'unknown', '2026-10-31T01:00:00Z'), mk('c', 'started', '2026-10-31T02:00:00Z'), mk('d', 'resolved', '2026-10-31T06:00:00Z'), mk('e', 'declined', '2026-10-31T07:00:00Z')]);
  assert.deepEqual(list.map(a => a.ref), ['c', 'b']);
});
