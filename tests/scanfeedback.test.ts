// Location: tests/scanfeedback.test.ts
// S4 + S5: the scan popup's timing and slopes, what the scanner says about a code, and the wobble a miss gets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MISS_GONE_MS, MISS_HOLD_MS, POPUP_FADE_MS, POPUP_GONE_MS, POPUP_HOLD_MS, feedbackLevel, popupAlive, popupOpacity, popupTiming, scanReply, shakeOffset } from '../src/lib/scanFeedback';

test('a hit is opaque for 3 seconds and gone by 5', () => {
  assert.equal(POPUP_HOLD_MS, 3000); assert.equal(POPUP_FADE_MS, 2000); assert.equal(POPUP_GONE_MS, 5000);
  assert.equal(popupOpacity(0, true), 1);
  assert.equal(popupOpacity(2999, true), 1);
  assert.equal(popupOpacity(3000, true), 1); // the hold includes its last moment
  assert.equal(popupOpacity(5000, true), 0);
  assert.equal(popupOpacity(9000, true), 0);
});

test('a miss clears itself sooner than a hit', () => {
  assert.ok(MISS_HOLD_MS < POPUP_HOLD_MS);
  assert.equal(MISS_GONE_MS, MISS_HOLD_MS + 2000);
  assert.equal(popupOpacity(MISS_HOLD_MS, false), 1);
  assert.equal(popupOpacity(MISS_GONE_MS, false), 0);
});

test('the fade only ever falls', () => {
  let prev = 2;
  for (let t = POPUP_HOLD_MS; t <= POPUP_GONE_MS; t += 50) { const o = popupOpacity(t, true); assert.ok(o <= prev + 1e-9, `rose at ${t}`); prev = o; }
});

test('the slope rises: barely falls at first, then drops away', () => {
  const q1 = popupOpacity(POPUP_HOLD_MS + POPUP_FADE_MS * 0.25, true);
  const q2 = popupOpacity(POPUP_HOLD_MS + POPUP_FADE_MS * 0.5, true);
  const q3 = popupOpacity(POPUP_HOLD_MS + POPUP_FADE_MS * 0.75, true);
  // A straight line would give .75, .5 and .25 here. A rising slope sits above it early and below it late.
  assert.ok(q1 > 0.75, `early too quick: ${q1}`);
  assert.ok(q2 > 0.5, `half too quick: ${q2}`);
  assert.ok(q3 < 0.5, `late too slow: ${q3}`);
  // The fall gets steeper as it goes: each quarter drops more than the one before it.
  assert.ok(q1 - q2 < q2 - q3, `fall is not steepening: ${q1} ${q2} ${q3}`);
  assert.ok(q2 - q3 < q3 - 0, `last quarter is not the steepest: ${q3}`);
});

test('alive until the fade is done', () => {
  assert.equal(popupAlive(0, true), true);
  assert.equal(popupAlive(POPUP_GONE_MS - 1, true), true);
  assert.equal(popupAlive(POPUP_GONE_MS, true), false);
});

test('a hit is the confirmation text, a miss says what was not found', () => {
  assert.deepEqual(scanReply('Added Dragon plush', '123'), { ok: true, text: 'Added Dragon plush' });
  assert.deepEqual(scanReply(null, ' 123 '), { ok: false, text: 'No item for 123' });
  assert.deepEqual(scanReply('', '9'), { ok: false, text: 'No item for 9' });
});

test('the feedback ladder puts a hit at the top and a miss as far down as its strength says', () => {
  assert.equal(feedbackLevel(true, 5), 4);
  assert.equal(feedbackLevel(false, 5, 1), 0);
  assert.equal(feedbackLevel(false, 5, 0), 4); // a code that is only out of place, not wrong
  assert.equal(feedbackLevel(false, 5, 0.5), 2);
  // Never outside the ladder, however it is called.
  assert.equal(feedbackLevel(false, 1), 0);
  assert.equal(feedbackLevel(false, 0), 0);
  assert.equal(feedbackLevel(false, 5, 9), 0);
  assert.equal(feedbackLevel(false, 5, -9), 4);
});

test('the wobble starts at nothing, crosses zero, and settles', () => {
  assert.equal(shakeOffset(0), 0);
  assert.equal(shakeOffset(-5), 0);
  assert.equal(shakeOffset(520), 0);
  assert.equal(shakeOffset(900), 0);
  const early = shakeOffset(44, 12, 3, 520); // an eighth of the way in: the first crest
  assert.ok(early > 0, `expected a crest, got ${early}`);
  // It comes back through zero, so it really is a wobble rather than a shove.
  const signs = new Set<number>();
  for (let t = 1; t < 520; t += 4) { const v = shakeOffset(t); if (v) signs.add(Math.sign(v)); }
  assert.deepEqual([...signs].sort(), [-1, 1]);
  // And it dies down: the last crest is smaller than the first.
  assert.ok(Math.abs(shakeOffset(468, 12, 3, 520)) < Math.abs(early));
});
