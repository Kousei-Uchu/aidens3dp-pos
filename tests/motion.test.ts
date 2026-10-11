import test from 'node:test';
import assert from 'node:assert/strict';
import { TRANSITION_ROUTES, enterOffset, pageDirection, stagger } from '../src/lib/motion';

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
