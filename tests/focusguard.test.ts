// Location: tests/focusguard.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { TYPING_GRACE_MS, fieldBlurred, fieldFocused, isUserTyping, resetFocusGuard } from '../src/lib/focusGuard';

test('not typing by default', () => { resetFocusGuard(); assert.equal(isUserTyping(1_000_000), false); });
test('typing while a field is focused, however long', () => { resetFocusGuard(); fieldFocused(); assert.equal(isUserTyping(Date.now() + 60 * 60_000), true); });
test('grace period after blur, then released', () => {
  resetFocusGuard(); fieldFocused(); fieldBlurred(10_000);
  assert.equal(isUserTyping(10_000 + TYPING_GRACE_MS - 1), true);
  assert.equal(isUserTyping(10_000 + TYPING_GRACE_MS + 1), false);
});
test('moving between two fields never reports "not typing"', () => {
  resetFocusGuard(); fieldFocused(); fieldBlurred(5_000); fieldFocused(); assert.equal(isUserTyping(5_001 + TYPING_GRACE_MS * 10), true);
});
test('extra blur events never go negative', () => { resetFocusGuard(); fieldBlurred(1); fieldBlurred(2); fieldFocused(); assert.equal(isUserTyping(1e12), true); });
