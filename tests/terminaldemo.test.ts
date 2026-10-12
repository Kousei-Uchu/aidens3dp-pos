// Tests for the terminal as a picture in Show and Info demos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoStateAfter, validateDemo } from '../src/lib/trainingDemo';
import type { Demo, DemoNode } from '../src/lib/trainingModule';

const term = (o: Partial<DemoNode> = {}): DemoNode => ({ id: 'term', kind: 'terminal', x: 400, y: 20, w: 150, h: 308, value: 'sleep', ...o });
const demo = (nodes: DemoNode[] = [term()]): Demo => ({
  canvas: { w: 640, h: 400 }, screens: [{ id: 'main', nodes: [{ id: 'btn', kind: 'button', x: 40, y: 300, w: 200, h: 36, label: 'Charge card' }, ...nodes] }],
  steps: [
    { say: 'The customer pays at the terminal.', tap: 'btn', set: { term: { value: 'amount', amount: 4500 } }, focus: 'term' },
    { say: 'They tap their card.', focus: 'term', set: { term: { value: 'processing' } } },
    { say: 'The terminal shows it was approved.', focus: 'term', set: { term: { value: 'approved' } }, note: 'Approved' },
  ],
});

test('a terminal node changes screen, amount and mode step by step', () => {
  const d = demo(); assert.deepEqual(validateDemo(d), []);
  assert.equal(demoStateAfter(d, -1).nodes.get('term')?.value, 'sleep'); const a = demoStateAfter(d, 0).nodes.get('term'); assert.equal(a?.value, 'amount'); assert.equal(a?.amount, 4500);
  assert.equal(demoStateAfter(d, 2).nodes.get('term')?.value, 'approved');
  d.steps[1].set = { term: { on: true } }; assert.equal(demoStateAfter(d, 1).nodes.get('term')?.on, true);
});
test('the checker refuses a terminal that shows a screen that does not exist, in the node or in a step', () => {
  assert.ok(validateDemo(demo([term({ value: 'welcome' })])).some(p => /terminal screen "welcome" does not exist/.test(p)));
  const d = demo(); d.steps[2].set = { term: { value: 'paid' } }; assert.ok(validateDemo(d).some(p => /step 3 makes .*"paid" does not exist/.test(p)));
});
test('the checker refuses a squashed or stretched terminal and a negative amount', () => {
  assert.ok(validateDemo(demo([term({ h: 150 })])).some(p => /about twice as tall/.test(p)));
  assert.ok(validateDemo(demo([term({ w: 100, h: 308 })])).some(p => /about twice as tall/.test(p)));
  assert.ok(validateDemo(demo([term({ amount: -5 })])).some(p => /zero or more cents/.test(p)));
});
