// Location: tests/eventscsv.test.ts
// CloudKit patch 4, call sites: events.csv read back into events. The whole point is that a row read back gets the same id it had
// when it was written, so the catch-up upload never makes a second record for an event the live upload already sent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { csvRows, parseEventsCsv } from '../src/lib/eventsCsvParse';
import { EVENTS_HEADER, eventRow, line } from '../src/lib/csvFormat';
import { EVENT_KINDS, eventId, type EventInput } from '../src/lib/eventRecords';

const file = (...rows: EventInput[]) => line([...EVENTS_HEADER]) + rows.map(r => eventRow(r)).join('');

test('every kind of event reads back with the id it was written with', () => {
  for (const kind of EVENT_KINDS) {
    const e: EventInput = { ts: '2026-10-31T09:15:30.123Z', kind, saleUuid: 'sale-1', reference: 'ref-9', amountCents: 1250, code: '05', message: 'Do not honour', staff: 'Sam', detail: 'x' };
    const [back] = parseEventsCsv(file(e));
    assert.deepEqual(back, e, kind);
    assert.equal(eventId('reg-a', back), eventId('reg-a', e), kind);
  }
});
test('an event with only a time and a kind reads back the same, and so does one with an amount of zero or a negative one', () => {
  for (const e of [{ ts: '2026-10-31T01:00:00.000Z', kind: 'no_sale' }, { ts: '2026-10-31T01:00:01.000Z', kind: 'paid_out', amountCents: 0 }, { ts: '2026-10-31T01:00:02.000Z', kind: 'refund_failed', amountCents: -500 }] as EventInput[]) {
    const [back] = parseEventsCsv(file(e));
    assert.equal(eventId('r', back), eventId('r', e));
    assert.equal(back.amountCents, e.amountCents);
  }
});
test('a comma, a quote and a line break in a message survive, and the id is unchanged', () => {
  const e: EventInput = { ts: '2026-10-31T02:00:00.000Z', kind: 'error', message: 'Reader said "no", twice,\nthen stopped\r\nagain', detail: 'a,b' };
  const rows = parseEventsCsv(file(e, { ...e, ts: '2026-10-31T02:00:01.000Z', kind: 'void' }));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].message, e.message);
  assert.equal(eventId('r', rows[0]), eventId('r', e));
});
test('the header, blank lines, rows with no time and rows of an unknown kind are left out', () => {
  const good: EventInput = { ts: '2026-10-31T03:00:00.000Z', kind: 'declined', amountCents: 100 };
  const text = file(good) + '\n' + ',declined,,,,,,,\n2026-10-31T03:00:01.000Z,teleport,,,,,,,\n';
  assert.deepEqual(parseEventsCsv(text), [good]);
});
test('a file with no final newline, and an empty file, read as expected', () => {
  const e: EventInput = { ts: '2026-10-31T04:00:00.000Z', kind: 'shift_open', staff: 'Sam' };
  assert.deepEqual(parseEventsCsv(file(e).trimEnd()), [e]);
  assert.deepEqual(parseEventsCsv(''), []);
});
test('csvRows handles quotes and keeps empty fields', () => {
  assert.deepEqual(csvRows('a,"b ""c"" d",,e\n'), [['a', 'b "c" d', '', 'e']]);
});
