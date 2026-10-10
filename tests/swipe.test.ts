// Location: tests/swipe.test.ts
// A13 swipe maths + A12.8 invoice rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clampSwipe, swipeDecision } from '../src/lib/swipe';
import { invoiceRows, unitLine } from '../src/lib/invoiceRows';
import type { PricedLine } from '../src/lib/types';

const W = 400, OPEN = 96;
const decide = (x: number, vx = 0, fullSwipe?: boolean) => swipeDecision({ x, vx, width: W, openWidth: OPEN, fullSwipe });

test('clamp: never to the right, never past the row width', () => {
  assert.equal(clampSwipe(30, OPEN, W), 0);
  assert.equal(clampSwipe(-50, OPEN, W), -50);
  assert.equal(clampSwipe(-999, OPEN, W), -W);
  assert.equal(clampSwipe(-999, OPEN, 0), -OPEN * 4); // width not measured yet
});

test('a small slow drag springs back, a drag past half the button stays open', () => {
  assert.equal(decide(-20), 'close');
  assert.equal(decide(-47), 'close');
  assert.equal(decide(-48), 'open');
  assert.equal(decide(-90), 'open');
});

test('dragging most of the way across deletes', () => {
  assert.equal(decide(-239), 'open');
  assert.equal(decide(-240), 'delete');
  assert.equal(decide(-399), 'delete');
});

test('a hard fast flick past the button deletes, a gentle flick just opens', () => {
  assert.equal(decide(-130, -1.5), 'delete');
  assert.equal(decide(-130, -0.8), 'open');
  assert.equal(decide(-30, -0.8), 'open');
  assert.equal(decide(-4, -0.8), 'close'); // barely moved
});

test('flicking right closes even from open', () => {
  assert.equal(decide(-90, 0.9), 'close');
});

test('with full swipe off, the far end only opens the button', () => {
  assert.equal(decide(-390, 0, false), 'open');
  assert.equal(decide(-130, -1.5, false), 'open');
});

const line = (over: Partial<PricedLine> = {}): PricedLine => ({
  line: { id: 'l', kind: 'item', title: 'Tadling', qty: 13, unitCents: 400 }, baseUnitCents: 400, grossCents: 5200, discounts: [], discountCents: 0, netCents: 5200, bundleUnits: 0, ...over,
});

test('invoice rows: one row per discount, repeats shown as (xN), zero rows hidden', () => {
  const rows = invoiceRows(line({ discounts: [
    { type: 'auto', label: '5x Tadlings', cents: 800, id: 'a', times: 2 },
    { type: 'auto', label: '3x Tadlings', cents: 200, id: 'b' },
    { type: 'manual', label: 'Nothing', cents: 0 },
  ] }));
  assert.deepEqual(rows.map(r => [r.label, r.cents]), [['5x Tadlings (x2)', 800], ['3x Tadlings', 200]]);
});

test('invoice rows: a line with no discounts has no rows; unit line shows qty x price', () => {
  assert.deepEqual(invoiceRows(line()), []);
  assert.equal(unitLine(line()), '13 × $4.00');
  assert.equal(unitLine(line({ line: { id: 'l', kind: 'item', title: 'T', qty: 2, unitCents: 400, overrideCents: 300 }, baseUnitCents: 300 })), '2 × $3.00 (adjusted)');
});
