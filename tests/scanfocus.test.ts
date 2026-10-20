// Location: tests/scanfocus.test.ts
// B3 + S3: asking the Bluetooth scanner's capture box to take focus again, and handing a barcode that arrived while no
// box was mounted over to the screen that takes scans (Checkout).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldFocused, isUserTyping, resetFocusGuard } from '../src/lib/focusGuard';
import { onRefocusAsked, onScanFlush, offerScan, refocusRequests, requestScanFocus, resetScanFocus } from '../src/lib/scanFocus';

test('asking for focus clears a stuck typing guard and calls every listener', () => {
  resetScanFocus(); resetFocusGuard(); fieldFocused(); // the field that was covered and never blurred
  const seen: string[] = [];
  const offA = onRefocusAsked(() => seen.push('a')); const offB = onRefocusAsked(() => seen.push('b'));
  assert.equal(requestScanFocus(1_000), 2);
  assert.deepEqual(seen, ['a', 'b']);
  assert.equal(isUserTyping(1e12), false);
  offA(); offB();
});

test('an unregistered input is never asked again', () => {
  resetScanFocus(); resetFocusGuard();
  let calls = 0; const off = onRefocusAsked(() => { calls += 1; });
  requestScanFocus(1_000); off(); requestScanFocus(1_001);
  assert.equal(calls, 1);
});

test('a listener that throws does not stop the others', () => {
  resetScanFocus(); resetFocusGuard();
  let second = 0; const offA = onRefocusAsked(() => { throw new Error('gone'); }); const offB = onRefocusAsked(() => { second += 1; });
  assert.equal(requestScanFocus(1_000), 2);
  assert.equal(second, 1);
  offA(); offB();
});

test('the request count rises and is readable without a listener', () => {
  resetScanFocus(); resetFocusGuard();
  assert.equal(refocusRequests(), 0);
  assert.equal(requestScanFocus(1_000), 0); // nothing mounted, the screensaver was up in front of the scanner box
  assert.equal(refocusRequests(), 1);
  // An input that mounts later reads the count and takes focus, which is how the box on the screen behind the saver wakes.
  const off = onRefocusAsked(() => {});
  assert.equal(refocusRequests(), 1);
  off();
});

test('a barcode is offered to every screen that takes scans', () => {
  resetScanFocus(); resetFocusGuard();
  const got: string[] = [];
  const off = onScanFlush(c => got.push(c));
  assert.equal(offerScan('123456', 1_000), 1);
  assert.deepEqual(got, ['123456']);
  off();
  assert.equal(offerScan('789', 1_001), 0);
});

test('offering a barcode also clears a stuck typing guard', () => {
  resetScanFocus(); resetFocusGuard(); fieldFocused();
  const off = onScanFlush(() => {});
  offerScan('123456', 1_000);
  assert.equal(isUserTyping(1e12), false);
  off();
});

test('a screen that throws on a barcode does not stop the others', () => {
  resetScanFocus(); resetFocusGuard();
  let second = '';
  const offA = onScanFlush(() => { throw new Error('unmounted'); }); const offB = onScanFlush(c => { second = c; });
  assert.equal(offerScan('4242', 1_000), 2);
  assert.equal(second, '4242');
  offA(); offB();
});
