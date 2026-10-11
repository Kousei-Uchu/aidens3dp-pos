import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUTE_ENTER_MS, ROUTE_LEAVE_MS, TRANSITION_ROUTES, VEIL, enterOffset, isAnimatedRoute, leaveOffset, leavingOnTop, pageDirection, slideDistance, stagger, transitionDir, transitionNeeded } from '../src/lib/motion';

test('a thing starts where "from" says and ends where it belongs', () => {
  assert.deepEqual(enterOffset('right', 30), { x: 30, y: 0 });
  assert.deepEqual(enterOffset('left', 30), { x: -30, y: 0 });
  assert.deepEqual(enterOffset('up', 12), { x: 0, y: 12 }, 'up means it rises from below');
  assert.deepEqual(enterOffset('down', 12), { x: 0, y: -12 });
  assert.deepEqual(enterOffset('none', 99), { x: 0, y: 0 });
});

test('staggered lists wait longer for later items, but never more than the cap', () => {
  assert.equal(stagger(0), 0); assert.equal(stagger(2, 100, 50), 200); assert.equal(stagger(-3, 10), 10);
  assert.equal(stagger(500, 0, 60, 420), 420);
});

test('a page change slides forward, back, or rises when the depth is unchanged', () => {
  assert.equal(pageDirection(0, 1), 'right'); assert.equal(pageDirection(2, 1), 'left'); assert.equal(pageDirection(1, 1), 'up');
});

test('only Training pages get a page transition', () => {
  assert.deepEqual([...TRANSITION_ROUTES].sort(), ['training', 'trainingRun']);
});

test('the slide distance scales with the window but stays between 48 and 140 points', () => {
  assert.equal(slideDistance(0), 48); assert.equal(slideDistance(NaN), 48); assert.equal(slideDistance(390), 55); assert.equal(slideDistance(1024), 140); assert.equal(slideDistance(5000), 140);
});

test('the page that leaves drifts under the new one going forward, and slides off going back', () => {
  assert.deepEqual(leaveOffset('right', 100), { x: -30, y: 0 }, 'forward: a little to the left');
  assert.deepEqual(leaveOffset('left', 100), { x: 100, y: 0 }, 'back: all the way off to the right');
  assert.deepEqual(leaveOffset('none', 100), { x: 0, y: 0 });
  assert.equal(leavingOnTop('left'), true, 'going back the leaving page must be above the one revealed');
  assert.equal(leavingOnTop('right'), false); assert.equal(leavingOnTop('up'), false);
});

test('direction: depth decides, then the Training page order, and anything else rises', () => {
  const at = (name: string, depth: number) => ({ name, depth });
  assert.equal(transitionDir(null, at('training', 1)), 'right', 'a page opened from a tab arrives from the right');
  assert.equal(transitionDir(at('trainingRun', 1), null), 'left', 'closing back to a tab goes back');
  assert.equal(transitionDir(at('training', 1), at('trainingRun', 2)), 'right');
  assert.equal(transitionDir(at('trainingRun', 1), at('training', 1)), 'left', 'the course page back to the list at the same depth still reads as back');
  assert.equal(transitionDir(at('training', 1), at('trainingRun', 1)), 'right');
  assert.equal(transitionDir(at('pay', 1), at('cart', 1)), 'up', 'unranked pages at one depth just rise');
});

test('a page animates when it is a Training page or a page the running course allows, and a change needs only one of the two', () => {
  assert.equal(isAnimatedRoute('training'), true); assert.equal(isAnimatedRoute('trainingRun'), true);
  assert.equal(isAnimatedRoute('pay'), false, 'ordinary pages are drawn exactly as before');
  assert.equal(isAnimatedRoute('pay', ['cart', 'pay']), true, 'while a course runs, its pages animate too');
  assert.equal(isAnimatedRoute(null), false); assert.equal(isAnimatedRoute(undefined, ['pay']), false);
  assert.equal(transitionNeeded('help', 'training'), true); assert.equal(transitionNeeded('training', null), true);
  assert.equal(transitionNeeded('settings', 'help'), false); assert.equal(transitionNeeded(null, null), false);
  assert.equal(transitionNeeded('cart', null, ['cart']), true); assert.equal(transitionNeeded('cart', null), false, 'once the course ends the cart page is not animated');
});

test('timings: the new page takes longer to settle than the old one takes to go, and the dip is short', () => {
  assert.ok(ROUTE_ENTER_MS > ROUTE_LEAVE_MS); assert.ok(ROUTE_ENTER_MS <= 450);
  assert.ok(VEIL.inMs + VEIL.holdMs + VEIL.outMs < 700, 'the whole dip is well under a second');
});
