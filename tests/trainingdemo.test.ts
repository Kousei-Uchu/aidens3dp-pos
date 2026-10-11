import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ZOOM, cameraFor, demoLayout, demoStateAfter, fitBox, noteFor, planStep, renderScale, settleOn, textProblems, validateDemo, viewRect } from '../src/lib/trainingDemo';
import type { Demo, DemoNode } from '../src/lib/trainingModule';
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

test('a note sits beside the ringed area, never on it, and always inside what the camera can see', () => {
  const canvas = { w: 600, h: 400 };
  for (const r of [{ x: 10, y: 10, w: 60, h: 30 }, { x: 540, y: 360, w: 50, h: 30 }, { x: 280, y: 180, w: 40, h: 40 }, { x: 20, y: 170, w: 90, h: 60 }]) {
    for (const zoom of [undefined, 1, 1.5, 2.2]) {
      const { cam, note } = settleOn(canvas, r, 'Tap here to add the item', zoom); const v = viewRect(canvas, cam);
      assert.ok(note, JSON.stringify({ r, zoom }));
      assert.ok(note!.x >= v.x && note!.y >= v.y && note!.x + note!.w <= v.x + v.w && note!.y + note!.h <= v.y + v.h, `note outside the view: ${JSON.stringify({ r, zoom, note, v })}`);
      assert.ok(r.x >= v.x && r.y >= v.y && r.x + r.w <= v.x + v.w && r.y + r.h <= v.y + v.h, `target outside the view: ${JSON.stringify({ r, zoom, v })}`);
      const overlap = note!.x < r.x + r.w && note!.x + note!.w > r.x && note!.y < r.y + r.h && note!.y + note!.h > r.y; assert.ok(!overlap, `note covers its target: ${JSON.stringify({ r, zoom, note })}`);
    }
  }
  assert.equal(noteFor({ x: 0, y: 0, w: 100, h: 60 }, { x: 40, y: 20, w: 20, h: 20 }, 'A long note that cannot possibly fit in here'), null, 'no room means null, so the camera can zoom out');
});

test('the camera never crops the thing it is pointing at, even when a deep zoom was asked for', () => {
  const canvas = { w: 640, h: 400 };
  for (const r of [{ x: 14, y: 56, w: 104, h: 82 }, { x: 372, y: 52, w: 254, h: 250 }, { x: 0, y: 340, w: 640, h: 60 }]) {
    const cam = cameraFor(canvas, r, MAX_ZOOM); const v = viewRect(canvas, cam);
    assert.ok(r.x >= v.x - 1e-6 && r.y >= v.y - 1e-6 && r.x + r.w <= v.x + v.w + 1e-6 && r.y + r.h <= v.y + v.h + 1e-6, JSON.stringify({ r, cam }));
  }
});

test('text that will not fit its box is caught when the course is written', () => {
  const n = (o: Partial<DemoNode>): DemoNode => ({ id: 'n', kind: 'button', x: 0, y: 0, w: 80, h: 30, ...o });
  assert.deepEqual(textProblems(n({ label: 'Charge' })), []);
  assert.ok(textProblems(n({ label: 'Take payment now please' })).some(e => e.includes('too long')));
  assert.ok(textProblems(n({ kind: 'tile', w: 100, h: 80, label: 'Highland Cow', sub: '$12.00' })).length === 0);
  assert.ok(textProblems(n({ kind: 'tile', w: 70, h: 80, label: 'Extra Large Dragon' })).length > 0);
  assert.ok(textProblems(n({ kind: 'text', w: 100, h: 20, size: 13, label: 'This sentence is far too long to wrap into one short line of text' })).some(e => e.includes('height')));
  assert.deepEqual(textProblems(n({ kind: 'text', w: 300, h: 40, size: 13, label: 'Short and sweet' })), []);
  assert.ok(textProblems(n({ kind: 'row', w: 200, h: 24, label: 'Item', sub: 'two lines' })).some(e => e.includes('at least 30')));
  const d = demo(); d.steps[1].set = { row: { hidden: false, label: 'A name that is much too long to fit in its row at all' } };
  assert.ok(validateDemo(d).some(e => e.includes('step 2') && e.includes('too long')), 'a step that makes text too long is caught');
});

test('every course picture keeps its target and its note fully visible at every step', () => {
  for (const m of MODULES) for (const d of [m.info, m.show]) for (let i = 0; i < d.steps.length; i++) {
    const p = planStep(d, i); const v = viewRect(d.canvas, p.focusCam);
    if (p.focus) assert.ok(p.focus.x >= v.x - 1e-6 && p.focus.y >= v.y - 1e-6 && p.focus.x + p.focus.w <= v.x + v.w + 1e-6 && p.focus.y + p.focus.h <= v.y + v.h + 1e-6, `${m.id} step ${i + 1}: target cropped`);
    if (p.note) assert.ok(p.note.x >= v.x - 1e-6 && p.note.y >= v.y - 1e-6 && p.note.x + p.note.w <= v.x + v.w + 1e-6 && p.note.y + p.note.h <= v.y + v.h + 1e-6, `${m.id} step ${i + 1}: note cropped`);
    if (d.steps[i].note) assert.ok(p.note, `${m.id} step ${i + 1}: the note was dropped`);
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

test('every course Info is a valid animated picture that changes as it goes', () => {
  for (const m of MODULES) {
    assert.deepEqual(validateDemo(m.info), [], m.id);
    assert.ok(m.info.steps.some(s => s.set || s.screen), `${m.id}: the Info never changes anything`);
    assert.ok(m.info.steps.filter(s => s.focus || s.tap).length >= 2, `${m.id}: the Info never directs the eye`);
  }
});

test('every course Show is a real demonstration: it taps something, changes something, and directs the eye', () => {
  for (const m of MODULES) {
    assert.deepEqual(validateDemo(m.show), [], m.id);
    assert.ok(m.show.steps.some(s => s.tap), `${m.id}: the Show never taps anything`);
    assert.ok(m.show.steps.some(s => s.set || s.screen), `${m.id}: the Show never changes anything`);
    assert.ok(m.show.steps.some(s => s.zoom || s.focus), `${m.id}: the Show never directs the eye`);
  }
});

test('the picture is laid out at the biggest size it is shown, so the camera only ever shrinks it', () => {
  const canvas = { w: 640, h: 400 };
  for (const vw of [260, 340, 480, 760]) {
    const k = renderScale(vw, canvas.w); const fit = vw / canvas.w;
    assert.ok(Math.abs(k - fit * MAX_ZOOM) < 1e-9, 'layout scale is the fit times the deepest zoom');
    for (const rect of [null, { x: 20, y: 20, w: 80, h: 30 }, { x: 300, y: 200, w: 10, h: 10 }, { x: 0, y: 0, w: 640, h: 400 }]) {
      const cam = cameraFor(canvas, rect); const onScreenScale = k * (cam.zoom / MAX_ZOOM);
      assert.ok(cam.zoom / MAX_ZOOM <= 1 + 1e-9, 'never scaled up after layout');
      assert.ok(Math.abs(onScreenScale - fit * cam.zoom) < 1e-9, 'what you see is still the zoom the camera asked for');
    }
  }
  assert.ok(renderScale(0, 640) > 0, 'a not-yet-measured view does not break');
});

test('the picture is fitted into the room that is left, whole and in shape', () => {
  const canvas = { w: 640, h: 400 };
  assert.deepEqual(fitBox({ w: 800, h: 1000 }, canvas), { w: 800, h: 500 }, 'width limits it');
  assert.deepEqual(fitBox({ w: 1000, h: 250 }, canvas), { w: 400, h: 250 }, 'height limits it');
  for (const a of [{ w: 320, h: 200 }, { w: 1180, h: 640 }, { w: 390, h: 300 }]) { const f = fitBox(a, canvas); assert.ok(f.w <= a.w + 1e-9 && f.h <= a.h + 1e-9, 'never bigger than the room'); assert.ok(Math.abs(f.w / f.h - 1.6) < 1e-9, 'same shape'); }
  assert.deepEqual(fitBox({ w: 0, h: 500 }, canvas), { w: 0, h: 0 }, 'not measured yet');
});

test('wide windows put the words beside the picture, tall ones underneath', () => {
  assert.equal(demoLayout({ w: 1180, h: 820 }), 'side'); assert.equal(demoLayout({ w: 820, h: 1180 }), 'stack'); assert.equal(demoLayout({ w: 390, h: 844 }), 'stack'); assert.equal(demoLayout({ w: 844, h: 390 }), 'side');
});
