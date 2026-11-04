// Location: tests/drawerbanking.test.ts
// 0228: takings still to be taken out survive closing and opening the drawer, and banking resets them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bankedShift, closedShift, openedShift, takingsSince } from '../src/lib/drawerBanking';
import type { Shift } from '../src/state/store';

const open: Shift = { open: true, openedAt: '2026-11-03T09:00:00.000Z', floatCents: 20000, paidInCents: 3000, paidOutCents: 0, staff: 'Sam', loanCents: 2000 };
const NOW = Date.UTC(2026, 10, 4, 1, 0);

test('takings run from the drawer opening, then from the last banking or close', () => {
  assert.equal(takingsSince(open, NOW), open.openedAt);
  assert.equal(takingsSince({ ...open, collectSince: '2026-11-03T12:00:00.000Z' }, NOW), '2026-11-03T12:00:00.000Z');
  const old: Shift = { open: false, floatCents: 0, paidInCents: 0, paidOutCents: 0 };
  const d = new Date(NOW); d.setHours(0, 0, 0, 0); assert.equal(takingsSince(old, NOW), d.toISOString());
});
test('closing keeps the period start and a loan still owed, and clears the day\'s sums', () => {
  const c = closedShift(open);
  assert.deepEqual(c, { open: false, floatCents: 0, paidInCents: 0, paidOutCents: 0, collectSince: open.openedAt, loanCents: 2000 });
  // the next day the report still looks back to the opening, not to the start of that day
  assert.equal(takingsSince(c, NOW), open.openedAt);
});
test('closing after a banking keeps the banking time, and drops a loan that was taken back', () => {
  const banked = bankedShift(open, { takenOut: 15000, loanBack: 2000, nowISO: '2026-11-03T17:00:00.000Z' });
  assert.equal(banked.loanCents, undefined); assert.equal(banked.collectSince, '2026-11-03T17:00:00.000Z'); assert.equal(banked.paidOutCents, 15000);
  assert.equal(closedShift(banked).collectSince, '2026-11-03T17:00:00.000Z'); assert.equal('loanCents' in closedShift(banked), false);
});
test('banking a closed shift marks the takings as taken without adding a paid out', () => {
  const c = closedShift(open); const b = bankedShift(c, { takenOut: 9000, loanBack: 1500, nowISO: '2026-11-04T08:00:00.000Z' });
  assert.equal(b.open, false); assert.equal(b.paidOutCents, 0); assert.equal(b.loanCents, 500); assert.equal(b.collectSince, '2026-11-04T08:00:00.000Z');
});
test('a put-off banking is carried into the next shift', () => {
  const next = openedShift(closedShift(open), { openedAt: '2026-11-04T09:00:00.000Z', floatCents: 10000, staff: 'Alex' });
  assert.equal(next.open, true); assert.equal(next.collectSince, open.openedAt); assert.equal(next.loanCents, 2000); assert.equal(next.paidInCents, 0);
  const clean = openedShift({ open: false, floatCents: 0, paidInCents: 0, paidOutCents: 0 }, { openedAt: '2026-11-04T09:00:00.000Z', floatCents: 10000 });
  assert.equal('collectSince' in clean, false); assert.equal('loanCents' in clean, false);
});
