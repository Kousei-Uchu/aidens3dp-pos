// Location: tests/pointergesture.test.ts
// The cursor's gestures (tap, double, triple, hold, swipe, scroll) and the gate that stops a stray tap inside the ringed box.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GESTURES, GESTURE_LABEL, HOLD_PRESS_MS, gateFor, gesturePlan, isGesture, isPress, tapAllowed, tapCount, travelOf } from '../src/lib/pointerGesture';

const hole = { x: 100, y: 200, w: 300, h: 80 }; const cx = 250; const cy = 240;
const ripples = (g: Parameters<typeof gesturePlan>[0]) => gesturePlan(g, hole).moves.filter(m => m.ripple).length;

test('every gesture has a label and a plan that ends with the finger up', () => {
  for (const g of GESTURES) {
    assert.ok(GESTURE_LABEL[g], g); const p = gesturePlan(g, hole);
    assert.ok(p.moves.length >= 3, `${g} has movements`); assert.equal(p.moves[p.moves.length - 1].down, false, `${g} ends with the finger up`);
    assert.equal(p.totalMs, p.moves.reduce((n, m) => n + m.ms, 0)); assert.ok(p.totalMs > 600 && p.totalMs < 4000, `${g} takes a sensible time (${p.totalMs} ms)`);
    assert.ok(p.start.x !== cx || p.start.y !== cy, `${g} glides in from beside the target`);
  }
  assert.ok(isGesture('swipe-left') && !isGesture('pinch') && !isGesture(3));
});

test('taps: one, two or three touches, each with its own ripple, all on the middle of the target', () => {
  assert.equal(ripples('tap'), 1); assert.equal(ripples('double'), 2); assert.equal(ripples('triple'), 3);
  assert.deepEqual([tapCount('tap'), tapCount('double'), tapCount('triple'), tapCount('hold')], [1, 2, 3, 1]);
  for (const g of ['tap', 'double', 'triple'] as const) for (const m of gesturePlan(g, hole).moves) assert.deepEqual([m.x, m.y], [cx, cy]);
});

test('hold: one touch that stays down for the hold, with the filling ring', () => {
  const p = gesturePlan('hold', hole); const h = p.moves.filter(m => m.hold);
  assert.equal(h.length, 1); assert.equal(h[0].ms, HOLD_PRESS_MS); assert.equal(h[0].down, true); assert.equal(ripples('hold'), 1);
  const i = p.moves.indexOf(h[0]); assert.equal(p.moves[i + 1].down, false, 'lets go after the hold');
});

test('swipes drag across the target in the named direction and stay inside it', () => {
  const dragOf = (g: Parameters<typeof gesturePlan>[0]) => { const p = gesturePlan(g, hole); const d = p.moves.find(m => m.drag)!; const from = p.moves[p.moves.indexOf(d) - 1]; return { from, to: d }; };
  const l = dragOf('swipe-left'); assert.ok(l.to.x < l.from.x && l.to.y === l.from.y); assert.equal((l.from.x + l.to.x) / 2, cx);
  const r = dragOf('swipe-right'); assert.ok(r.to.x > r.from.x);
  const u = dragOf('swipe-up'); assert.ok(u.to.y < u.from.y && u.to.x === u.from.x);
  const d = dragOf('swipe-down'); assert.ok(d.to.y > d.from.y);
  for (const g of ['swipe-left', 'swipe-right', 'swipe-up', 'swipe-down'] as const) for (const m of gesturePlan(g, hole).moves) {
    assert.ok(m.x >= hole.x && m.x <= hole.x + hole.w && m.y >= hole.y && m.y <= hole.y + hole.h, `${g} stays inside the target`);
  }
  assert.ok(travelOf(8) >= 60 && travelOf(5000) <= 220, 'travel is neither a twitch nor a long way');
});

test('scrolling is two strokes, and scrolling down drags the finger up the screen', () => {
  const tall = { x: 0, y: 0, w: 300, h: 400 };
  for (const [g, dir] of [['scroll-down', -1], ['scroll-up', 1]] as const) {
    const p = gesturePlan(g, tall); const drags = p.moves.filter(m => m.drag); assert.equal(drags.length, 2, `${g} strokes twice`);
    const first = drags[0]; const before = p.moves[p.moves.indexOf(first) - 1];
    assert.equal(Math.sign(first.y - before.y), dir, `${g} drags ${dir < 0 ? 'up' : 'down'}`);
  }
});

test('press gestures are the ones that tap; swipes and scrolls are not', () => {
  for (const g of ['tap', 'double', 'triple', 'hold'] as const) assert.ok(isPress(g)); for (const g of ['swipe-left', 'swipe-right', 'swipe-up', 'swipe-down', 'scroll-up', 'scroll-down'] as const) assert.ok(!isPress(g));
});

test('the gate: no gate allows everything; a swipe step allows no tap; a tap step allows only its own target', () => {
  assert.equal(tapAllowed(null, 'cart.line:x'), true); assert.equal(tapAllowed(null), true);
  const swipe = gateFor('swipe-left', 'cart.line:train-v-bee'); assert.equal(tapAllowed(swipe, 'cart.line:train-v-bee'), false, 'a tap must not open the line a swipe step points at'); assert.equal(tapAllowed(swipe), false);
  const tap = gateFor('tap', 'grid.item:a'); assert.equal(tapAllowed(tap, 'grid.item:a'), true); assert.equal(tapAllowed(tap, 'grid.item:b'), false); assert.equal(tapAllowed(tap), false);
  assert.equal(tapAllowed(gateFor('double', 'x'), 'x'), true); assert.equal(tapAllowed(gateFor('scroll-down', 'x'), 'x'), false);
  assert.equal(tapAllowed(gateFor('hold'), 'anything'), true, 'a gate with no named target lets presses through');
});
