import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ZOOM, cameraFor, demoStateAfter, noteFor, planStep, validateDemo } from '../src/lib/trainingDemo';
import type { Demo } from '../src/lib/trainingModule';
import { MODULES } from '../src/training';

const demo = (): Demo => ({
  canvas: { w: 600, h: 400 },
  screens: [
    { id: 'a', nodes: [
      { id: 'btn', kind: 'button', x: 20, y: 20, w: 80, h: 30, label: 'Go' },
      { id: 'row', kind: 'row', x: 300, y: 300, w: 200, h: 40, label: 'Item', hidden: true },
      { id: 'big', kind: 'panel', x: 0, y: 0, w: 600, h: 400 },
    ] },
    { id: 'b', nodes: [{ id: 'ok', kind: 'text', x: 250, y: 150, w: 100, h: 30, label: 'Saved' }] },
  ],
  steps: [
    { say: 'one', focus: 'btn' },
    { say: 'two', tap: 'btn', focus: 'row', set: { row: { hidden: false, value: '$5' } } },
    { say: 'three', screen: 'b', focus: 'ok' },
  ],
});

test('the picture after each step is built from the changes so far', () => {
  const d = demo();
  const s0 = demoStateAfter(d, -1); assert.equal(s0.screen, 'a'); assert.equal(s0.nodes.get('row')!.hidden, true);
  const s1 = demoStateAfter(d, 1); assert.equal(s1.nodes.get('row')!.hidden, false); assert.equal(s1.nodes.get('row')!.value, '$5'); assert.equal(s1.screen, 'a');
  assert.equal(demoStateAfter(d, 2).screen, 'b'); assert.equal(demoStateAfter(d, 99).screen, 'b');
  assert.equal(d.screens[0].nodes[1].hidden, true, 'the demo itself is never changed');
});

test('the camera zooms in on small targets, stays out for big ones, and never leaves the canvas', () => {
  const c = { w: 600, h: 400 };
  assert.deepEqual(cameraFor(c, null), { zoom: 1, cx: 300, cy: 200 });
  const small = cameraFor(c, { x: 20, y: 20, w: 80, h: 30 });
  assert.ok(small.zoom > 1.5 && small.zoom <= MAX_ZOOM);
  assert.ok(small.cx >= 300 / small.zoom && small.cy >= 200 / small.zoom, 'a target in the corner is pulled back so no empty space shows');
  assert.equal(cameraFor(c, { x: 0, y: 0, w: 600, h: 400 }).zoom, 1);
  assert.equal(cameraFor(c, { x: 100, y: 100, w: 10, h: 10 }, 5).zoom, MAX_ZOOM, 'a requested zoom is capped');
  assert.equal(cameraFor(c, { x: 100, y: 100, w: 300, h: 300 }, 0.2).zoom, 1);
});

test('a step plan says where to look, where to tap and where to settle', () => {
  const d = demo();
  const p0 = planStep(d, 0); assert.equal(p0.tap, null); assert.equal(p0.tapPoint, null); assert.deepEqual(p0.look, p0.focus); assert.equal(p0.changes, false);
  const p1 = planStep(d, 1); assert.deepEqual(p1.tapPoint, { x: 60, y: 35 }); assert.equal(p1.tapId, 'btn'); assert.deepEqual(p1.look, { x: 20, y: 20, w: 80, h: 30 }); assert.deepEqual(p1.focus, { x: 300, y: 300, w: 200, h: 40 }); assert.equal(p1.changes, true);
  assert.equal(planStep(d, 2).changes, true); assert.equal(planStep(d, 99).index, 2); assert.equal(planStep(d, -4).index, 0);
  assert.equal(planStep({ ...d, steps: [{ say: 'whole screen' }, ...d.steps] }, 0).focus, null);
});

test('a note sits beside the ringed area and stays inside the canvas', () => {
  const c = { w: 600, h: 400 };
  for (const r of [{ x: 10, y: 10, w: 60, h: 30 }, { x: 540, y: 360, w: 50, h: 30 }, { x: 280, y: 180, w: 40, h: 40 }]) {
    const n = noteFor(c, r, 'Tap here to add the item');
    assert.ok(n.x >= 0 && n.y >= 0 && n.x + n.w <= c.w && n.y + n.h <= c.h, JSON.stringify(n));
    const clear = n.side === 'below' ? n.y >= r.y + r.h : n.y + n.h <= r.y; assert.ok(clear, 'the note does not cover what it points at');
  }
});

test('the demo checker names each kind of mistake', () => {
  const bad = (f: (d: Demo) => void) => { const d = demo(); f(d); return validateDemo(d); };
  assert.deepEqual(validateDemo(demo()), []);
  assert.ok(bad(d => { d.steps = d.steps.slice(0, 2); }).some(e => e.includes('at least 3 steps')));
  assert.ok(bad(d => { d.steps[0].focus = 'ghost'; }).some(e => e.includes('ghost')));
  assert.ok(bad(d => { d.steps[1].set = { ghost: { hidden: false } }; }).some(e => e.includes('ghost')));
  assert.ok(bad(d => { d.steps[2].screen = 'nowhere'; }).some(e => e.includes('nowhere')));
  assert.ok(bad(d => { d.steps[0].say = ' '; }).some(e => e.includes('says nothing')));
  assert.ok(bad(d => { d.screens[1].nodes[0].id = 'btn'; }).some(e => e.includes('used twice')));
  assert.ok(bad(d => { d.screens[0].nodes[0].x = 590; }).some(e => e.includes('inside the canvas')));
  assert.ok(bad(d => { d.steps[0].tap = 'row'; }).some(e => e.includes('not on screen')), 'tapping something that is still hidden');
  assert.ok(bad(d => { d.steps[2].focus = 'btn'; }).some(e => e.includes('not on screen')), 'ringing something on the screen that was just left');
  assert.ok(bad(d => { d.steps[0].zoom = 9; }).some(e => e.includes('zoom')));
  assert.ok(bad(d => { d.steps[0] = { say: 'x', note: 'hi' }; }).some(e => e.includes('nothing to point at')));
  assert.ok(validateDemo((() => { const d = demo(); d.screens[0].nodes[0].icon = 'nope'; return d; })(), () => false).some(e => e.includes('icon')));
});

test('every course demo is a real demonstration: it taps something, changes something, and has no autoplay', () => {
  for (const m of MODULES) {
    assert.deepEqual(validateDemo(m.show), [], m.id);
    assert.ok(m.show.steps.some(s => s.tap), `${m.id}: the Show never taps anything`);
    assert.ok(m.show.steps.some(s => s.set || s.screen), `${m.id}: the Show never changes anything`);
    assert.ok(m.show.steps.some(s => s.zoom || s.focus), `${m.id}: the Show never directs the eye`);
  }
});
