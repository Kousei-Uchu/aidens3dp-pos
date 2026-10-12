import test from 'node:test';
import assert from 'node:assert/strict';
import { placeNotice, type Rect } from '../src/lib/trainingGeometry';

const phone = { w: 390, h: 760 }; const tablet = { w: 1180, h: 820 };
const card = { w: 360, h: 110 };
const at = (x: number, y: number, w = 80, h = 50): Rect => ({ x, y, w, h });

test('with nothing in the way the notice goes where it was asked to', () => {
  assert.equal(placeNotice({ screen: phone, size: card, avoid: [] }).slot, 'top');
  assert.equal(placeNotice({ screen: phone, size: card, avoid: [], prefer: 'bottom' }).slot, 'bottom');
});
test('a target at the top sends the notice to the bottom, and the other way round', () => {
  assert.equal(placeNotice({ screen: phone, size: card, avoid: [at(150, 20)] }).slot, 'bottom');
  assert.equal(placeNotice({ screen: phone, size: card, avoid: [at(150, 690)], prefer: 'bottom' }).slot, 'top');
});
test('the notice is never drawn over the target when somewhere else is free', () => {
  for (const y of [0, 100, 300, 380, 500, 700]) for (const x of [0, 150, 310]) for (const scr of [phone, tablet]) {
    const hole = at(Math.min(x, scr.w - 80), y); const p = placeNotice({ screen: scr, size: card, avoid: [hole] });
    const hit = !(p.x + p.w <= hole.x - 10 || hole.x + hole.w + 10 <= p.x || p.y + p.h <= hole.y - 10 || hole.y + hole.h + 10 <= p.y);
    // the middle of a phone has the target in neither band, so top or bottom is always free
    assert.equal(hit, false, `${scr.w}x${scr.h} hole at ${hole.x},${hole.y} -> ${p.slot}`);
  }
});
test('it stays inside the screen', () => {
  for (const scr of [phone, tablet]) for (const s of ['top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right'] as const) {
    const p = placeNotice({ screen: scr, size: card, avoid: [], stick: s }); assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= scr.w && p.y + p.h <= scr.h, s);
  }
});
test('on a wide screen, a target spanning the top and bottom bands sends it to a corner', () => {
  const tall = at(480, 0, 220, 820); // a tall pane in the middle
  const p = placeNotice({ screen: tablet, size: card, avoid: [tall] }); assert.match(p.slot, /-(left|right)$/); assert.ok(p.w < 520);
});
test('a corner card is taller, because the words wrap', () => {
  const tall = at(480, 0, 220, 820); const p = placeNotice({ screen: tablet, size: card, avoid: [tall] }); const full = placeNotice({ screen: tablet, size: card, avoid: [] });
  assert.ok(p.h > full.h);
});
test('it keeps its last place while that is still clear, so it does not hop about', () => {
  const p = placeNotice({ screen: phone, size: card, avoid: [at(150, 690)], prefer: 'top', stick: 'bottom' });
  assert.equal(p.slot, 'top', 'bottom is blocked, so it must move');
  const q = placeNotice({ screen: phone, size: card, avoid: [at(150, 300)], prefer: 'top', stick: 'bottom' }); assert.equal(q.slot, 'bottom', 'bottom is still clear, so it stays');
});
test('buttons that are always on screen are avoided too', () => {
  const buttons = at(200, 6, 184, 44); const p = placeNotice({ screen: phone, size: card, avoid: [buttons, at(150, 400)], top: 56 });
  assert.equal(p.slot === 'top' ? p.y >= 56 : true, true);
  const only = placeNotice({ screen: phone, size: card, avoid: [buttons] }); assert.equal(only.slot, 'bottom');
});
test('with nowhere clear it picks the least covered place', () => {
  const everything = at(0, 0, 390, 760); const p = placeNotice({ screen: phone, size: card, avoid: [everything] }); assert.ok(['top', 'bottom'].includes(p.slot));
  const mostlyTop = at(0, 0, 390, 500); assert.equal(placeNotice({ screen: phone, size: card, avoid: [mostlyTop] }).slot, 'bottom');
});
