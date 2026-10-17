// Location: tests/scannerkeyboardhint.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { HINT_COOLDOWN_MS, HINT_IDLE_MS, SOFT_KEYBOARD_MIN_OVERLAP, hintDueIn, markHintShown, resetHintCooldown, softKeyboardHidden } from '../src/lib/scannerKeyboardHint';

test('no on-screen keyboard (or just a Done bar) counts as a hardware keyboard', () => {
  assert.equal(softKeyboardHidden(0), true);
  assert.equal(softKeyboardHidden(60), true);
  assert.equal(softKeyboardHidden(SOFT_KEYBOARD_MIN_OVERLAP), false);
  assert.equal(softKeyboardHidden(340), false);
  assert.equal(softKeyboardHidden(NaN), true);
});
test('due after the quiet spell, counted from focus or the last keystroke', () => {
  resetHintCooldown();
  assert.equal(hintDueIn({ now: 1000, idleSince: 1000, overlap: 0 }), HINT_IDLE_MS);
  assert.equal(hintDueIn({ now: 3000, idleSince: 1000, overlap: 0 }), HINT_IDLE_MS - 2000);
  assert.equal(hintDueIn({ now: 1000 + HINT_IDLE_MS + 500, idleSince: 1000, overlap: 0 }), 0);
});
test('never due while the on-screen keyboard is up', () => {
  resetHintCooldown(); assert.equal(hintDueIn({ now: 5000, idleSince: 0, overlap: 300 }), null);
});
test('cooldown holds back a second tip', () => {
  resetHintCooldown(); markHintShown(10_000);
  assert.equal(hintDueIn({ now: 20_000, idleSince: 0, overlap: 0 }), 10_000 + HINT_COOLDOWN_MS - 20_000);
  assert.equal(hintDueIn({ now: 10_000 + HINT_COOLDOWN_MS, idleSince: 0, overlap: 0 }), 0);
});
test('an explicit lastShown overrides the stored one', () => {
  resetHintCooldown(); markHintShown(10_000);
  assert.equal(hintDueIn({ now: 20_000, idleSince: 20_000, overlap: 0, lastShown: null }), HINT_IDLE_MS);
});
