// Location: tests/statusinset.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { latchTopInset } from '../src/lib/statusInset';

test('first reading is kept', () => {
  assert.deepEqual(latchTopInset(null, 'portrait', 24), { key: 'portrait', top: 24 });
  assert.deepEqual(latchTopInset(null, 'portrait', 0), { key: 'portrait', top: 0 });
});

test('the inset falls to 0 when the iOS bar is hidden, and a later rise (the iOS bar coming back) is ignored', () => {
  let s = latchTopInset(null, 'landscape', 24);   // first render, iOS bar still showing
  s = latchTopInset(s, 'landscape', 0);             // iOS bar hidden
  assert.equal(s.top, 0);
  s = latchTopInset(s, 'landscape', 24);            // screensaver opens, iOS bar flashes back
  assert.equal(s.top, 0);
});

test('a notch inset that never changes stays as it is', () => {
  let s = latchTopInset(null, 'portrait', 47);
  s = latchTopInset(s, 'portrait', 47); assert.equal(s.top, 47);
});

test('rotating starts again, so a notch is respected in the new orientation', () => {
  let s = latchTopInset(null, 'landscape', 0);
  s = latchTopInset(s, 'portrait', 47);
  assert.deepEqual(s, { key: 'portrait', top: 47 });
});

test('junk insets count as 0', () => {
  assert.equal(latchTopInset(null, 'portrait', NaN).top, 0);
  assert.equal(latchTopInset(null, 'portrait', -5).top, 0);
});
