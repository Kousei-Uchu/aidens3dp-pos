import test from 'node:test';
import assert from 'node:assert/strict';
import { HOLD_MS, glideMs, irisStart, isTinyMove, pointerRest, pointerTap, segments } from '../src/lib/guideMotion';

const r = (x: number, y: number, w = 100, h = 40) => ({ x, y, w, h });
test('a short hop glides quickly, a long one a little slower, and never past half a second', () => {
  const near = glideMs(r(100, 100), r(110, 100)); const far = glideMs(r(0, 0), r(900, 700));
  assert.ok(near >= 240 && near < far); assert.equal(far, 520); assert.equal(glideMs(null, r(5, 5)), 480, 'the first appearance closes in');
});
test('a move of a couple of points is a re-measure and snaps', () => {
  assert.equal(isTinyMove(r(10, 10), r(11, 12)), true); assert.equal(isTinyMove(r(10, 10), r(20, 10)), false); assert.equal(isTinyMove(null, r(1, 1)), false);
});
test('the first spotlight starts as a wider ring that stays on screen', () => {
  const s = { w: 400, h: 300 }; const t = r(20, 30, 100, 40); const a = irisStart(t, s);
  assert.ok(a.x <= t.x && a.y <= t.y && a.x + a.w >= t.x + t.w && a.y + a.h >= t.y + t.h);
  assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= s.w && a.y + a.h <= s.h);
});
test('the pointer rests beside the middle of the target and taps the middle', () => {
  const t = r(100, 100, 200, 60); assert.deepEqual(pointerTap(t), { x: 200, y: 130 });
  const p = pointerRest(t); assert.ok(p.x > 200 && p.x <= 214 && p.y > 130 && p.y <= 146);
  const tiny = pointerRest(r(0, 0, 20, 20)); assert.ok(tiny.x - 10 <= 4 && tiny.y - 10 <= 5, 'a small target keeps the pointer close');
});
test('progress segments mark done, now and to do', () => {
  assert.deepEqual(segments(1, 4), ['done', 'now', 'todo', 'todo']); assert.deepEqual(segments(0, 1), ['now']); assert.deepEqual(segments(0, 0), []);
  assert.ok(HOLD_MS > 300 && HOLD_MS < 1500);
});
