// Location: tests/trainingscroll.test.ts
// Training knows when a spot is off screen or cut off, and says which way to scroll.
import test from 'node:test';
import assert from 'node:assert/strict';
import { onScreen, scrollNeed, scrollSay } from '../src/lib/trainingGeometry';

const screen = { w: 400, h: 800 };
test('a spot wholly below or above the screen needs a scroll that way', () => {
  assert.deepEqual(scrollNeed({ x: 20, y: 900, w: 100, h: 40 }, screen), { dir: 'down', fully: true });
  assert.deepEqual(scrollNeed({ x: 20, y: -80, w: 100, h: 40 }, screen), { dir: 'up', fully: true });
  assert.equal(onScreen({ x: 20, y: 900, w: 100, h: 40 }, screen), false, 'it is not drawn as a ring');
});
test('a spot cut off at an edge needs a small scroll, and one fully in view needs none', () => {
  assert.deepEqual(scrollNeed({ x: 20, y: 770, w: 100, h: 60 }, screen), { dir: 'down', fully: false });
  assert.deepEqual(scrollNeed({ x: 20, y: -20, w: 100, h: 60 }, screen), { dir: 'up', fully: false });
  assert.equal(scrollNeed({ x: 20, y: 300, w: 100, h: 60 }, screen), null);
  assert.equal(onScreen({ x: 20, y: 770, w: 100, h: 60 }, screen), true, 'a cut off spot is still ringed');
});
test('an unmeasurable spot or one off to the side gives no scroll advice', () => {
  assert.equal(scrollNeed(null, screen), null); assert.equal(scrollNeed({ x: 0, y: 0, w: 0, h: 0 }, screen), null); assert.equal(scrollNeed({ x: 500, y: 900, w: 50, h: 50 }, screen)?.dir, 'down');
  assert.equal(scrollNeed({ x: -200, y: 300, w: 100, h: 50 }, screen), null);
});
test('the words say which way, and keep what the step already said', () => {
  assert.equal(scrollSay('Tap Add.', { dir: 'down', fully: true }), 'Scroll down until you can see it. Tap Add.');
  assert.equal(scrollSay('Tap Add.', { dir: 'up', fully: false }), 'Tap Add. Scroll up a little so all of it is on screen.');
});
