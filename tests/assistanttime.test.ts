// Location: tests/assistanttime.test.ts
// The assistant's date and time tool (patch 0166): the dates it hands the model, that it needs no shop data, and that it is read only.
// Times are built from local time, the way the till reads them, so the tests do not depend on the time zone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyGate, resolvePolicy } from '../src/lib/assistantGate';
import { ASSISTANT_TOOLS, makeToolSet, runToolCall } from '../src/lib/assistantTools';
import { buildSystemPrompt } from '../src/lib/assistantChat';
import { clockText, currentTimeTool, timeInfo } from '../src/lib/assistantTime';

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const NOW = at(2026, 10, 18, 15, 5); // Sunday 18 October 2026, 3:05 pm

test('today, the weekday, the time and the starts of the periods', () => {
  const t: any = timeInfo(NOW, 'Australia/Sydney');
  assert.equal(t.date, '2026-10-18'); assert.equal(t.weekday, 'Sunday'); assert.equal(t.time, '3:05 pm'); assert.equal(t.time_zone, 'Australia/Sydney');
  assert.equal(t.yesterday, '2026-10-17'); assert.equal(t.this_week_from, '2026-10-12', 'weeks start on Monday, so a Sunday belongs to the week before');
  assert.equal(t.this_month_from, '2026-10-01'); assert.equal(t.last_month_from, '2026-09-01'); assert.equal(t.last_month_to, '2026-09-30');
  assert.match(t.note, /sales_report/);
});
test('the 12 hour clock reads midnight and noon right, and the new year rolls the months back', () => {
  assert.equal(clockText(new Date(2026, 0, 1, 0, 7)), '12:07 am'); assert.equal(clockText(new Date(2026, 0, 1, 12, 0)), '12:00 pm'); assert.equal(clockText(new Date(2026, 0, 1, 23, 59)), '11:59 pm');
  const t: any = timeInfo(at(2027, 1, 1, 9, 0), 'x'); assert.equal(t.yesterday, '2026-12-31'); assert.equal(t.last_month_from, '2026-12-01'); assert.equal(t.last_month_to, '2026-12-31'); assert.equal(t.this_week_from, '2026-12-28');
});
test('a bad clock is an error the model can read, not a crash', () => { assert.match(String((timeInfo(NaN) as any).error), /clock/); });
test('the tool works with no shop data, uses the time it is given, and every field it returns is in its field map', () => {
  const out = currentTimeTool.run({}, { pages: [], role: 'cashier', maxChars: 6000, now: NOW }) as any; assert.equal(out.date, '2026-10-18');
  const g = applyGate(out, currentTimeTool.gate, resolvePolicy('remote')); assert.deepEqual(g.unknown, []); assert.equal((g.value as any).date, '2026-10-18');
  const viaData = currentTimeTool.run({}, { pages: [], role: 'cashier', maxChars: 6000, data: { now: at(2026, 3, 2) } as any }) as any; assert.equal(viaData.date, '2026-03-02');
  assert.match(String((currentTimeTool.run({}, { pages: [], role: 'cashier', maxChars: 6000 }) as any).date), /^\d{4}-\d{2}-\d{2}$/);
});
test('it is offered with the other tools, takes no arguments, and the time reaches it through makeToolSet', () => {
  assert.ok(ASSISTANT_TOOLS.some(t => t.def.function.name === 'current_time')); assert.deepEqual(currentTimeTool.def.function.parameters, { type: 'object', properties: {}, additionalProperties: false });
  assert.doesNotMatch(JSON.stringify(currentTimeTool.def), /[\u2013\u2014]/);
  const set = makeToolSet({ pages: [], role: 'cashier', contextSize: 8000, now: NOW }); assert.equal(set.ctx.now, NOW);
  const r = runToolCall({ id: 'c1', type: 'function', function: { name: 'current_time', arguments: '{}' } }, set); assert.equal(r.record.ok, true); assert.match(r.message.content ?? '', /2026-10-18/); assert.match(r.message.content ?? '', /Sunday/);
  assert.equal(makeToolSet({ pages: [], role: 'cashier', contextSize: 8000 }).ctx.now, undefined);
});
test('the prompt names it, and it still names no restricted thing', () => {
  const p = buildSystemPrompt('short', true); assert.match(p, /current_time/); assert.match(p, /never guess the date/i); assert.match(p, /eighteen tools/); assert.doesNotMatch(p, /[\u2013\u2014]/);
});
