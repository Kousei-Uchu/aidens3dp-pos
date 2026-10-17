// Location: tests/scanspeed.test.ts
// Timing a scan, turning samples into a range, refusing a bad calibration, and reading a shared one back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MIN_SAMPLES, SPEED_IDS, SPEED_TEST_TEXT, calibrationProblems, canCalibrate, effectiveRanges, measure, newTiming, noteChange, rangeFromSamples, readCalibration, withRange } from '../src/lib/scanSpeed';
import { DEFAULT_SPEED_RANGES, speedForInterval } from '../src/lib/scannerCodes';

test('timing: first to last change over the number of gaps', () => {
  let t = newTiming(); const code = SPEED_TEST_TEXT; // 22 characters, 21 gaps
  for (let i = 1; i <= code.length; i++) t = noteChange(t, code.slice(0, i), 1000 + i * 4);
  const m = measure(t, code)!; assert.equal(m.chars, 22); assert.equal(m.totalMs, 84); assert.equal(m.msPerChar, 4);
  assert.equal(speedForInterval(m.msPerChar).codeId, 'speed-fast');
});
test('timing: a shorter text starts again, empty resets, tiny scans are not timed', () => {
  let t = noteChange(newTiming(), 'abc', 10); t = noteChange(t, 'abcd', 20); assert.equal(t.first, 10);
  t = noteChange(t, 'x', 100); assert.equal(t.first, 100); assert.equal(t.len, 1);
  assert.deepEqual(noteChange(t, '', 200), newTiming());
  assert.equal(measure(newTiming(), 'ABC'), null); assert.equal(measure(noteChange(newTiming(), 'A', 5), 'A'), null);
});
test('rangeFromSamples: lowest to highest, widened, needs enough scans', () => {
  assert.throws(() => rangeFromSamples([10, 11]), new RegExp(`${MIN_SAMPLES}`));
  const r = rangeFromSamples([40, 44, 42]); assert.ok(r.minMs < 40 && r.maxMs > 44); assert.ok(r.maxMs - 44 <= 4.3 + 0.1);
  assert.deepEqual(rangeFromSamples([0, 0, 0]), { minMs: 0, maxMs: 0.5 }); // never below zero, at least 0.5 ms of padding
});
test('calibrationProblems: ordered speeds pass, backwards or swapped speeds do not', () => {
  assert.deepEqual(calibrationProblems(DEFAULT_SPEED_RANGES), []);
  assert.equal(calibrationProblems(withRange(DEFAULT_SPEED_RANGES, 'speed-slow', { minMs: 50, maxMs: 40 })).length, 1);
  assert.ok(calibrationProblems(withRange(DEFAULT_SPEED_RANGES, 'speed-fast', { minMs: 100, maxMs: 110 })).length >= 1);
  assert.ok(calibrationProblems(withRange(DEFAULT_SPEED_RANGES, 'speed-fast', { minMs: -1, maxMs: 4 })).length >= 1);
});
test('a calibration changes what a measurement means', () => {
  const r = withRange(DEFAULT_SPEED_RANGES, 'speed-medium', { minMs: 8, maxMs: 12 });
  assert.equal(speedForInterval(10, DEFAULT_SPEED_RANGES).codeId, 'speed-fast'); // 4 ms from Fast's top, 7 from Medium's bottom
  assert.equal(speedForInterval(10, r).codeId, 'speed-medium');
  assert.equal(effectiveRanges(null), DEFAULT_SPEED_RANGES);
});
test('readCalibration: round trip, and anything unusable is null', () => {
  const cal = { version: 1 as const, ranges: withRange(DEFAULT_SPEED_RANGES, 'speed-medium', { minMs: 15, maxMs: 23 }), updatedBy: 'Aiden', updatedAt: '2026-10-17T09:00:00.000Z' };
  assert.deepEqual(readCalibration(JSON.stringify(cal)), cal); assert.deepEqual(readCalibration(cal), cal);
  for (const bad of [null, undefined, 'nope', '{}', { version: 2, ranges: cal.ranges }, { version: 1, ranges: {} }, { ...cal, ranges: withRange(cal.ranges, 'speed-fast', { minMs: 90, maxMs: 95 }) }]) assert.equal(readCalibration(bad), null);
  assert.equal(SPEED_IDS.length, 4);
});
test('only managers and owners may calibrate', () => {
  assert.equal(canCalibrate('cashier'), false); assert.equal(canCalibrate('manager'), true); assert.equal(canCalibrate('owner'), true);
});
