// Location: tests/scanorder.test.ts
// One scan box, one order: item (barcode, then SKU), cashier pass, gift card, saved discount, else nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { findDiscountPreset, resolveScan, scanProblem } from '../src/lib/lookup';
import { newBadgeCode } from '../src/lib/badge';
import { giftQrPayload } from '../src/lib/giftCode';
import { getCartScan, registerCartScan, resetCartScan } from '../src/lib/scanBridge';
import type { ManualPreset, Variant } from '../src/lib/types';

const V = (o: Partial<Variant>): Variant => ({ id: 'gid://v1', productId: 'p1', productTitle: 'Dragon', variantTitle: '', priceCents: 1000, tracked: true, stock: 5, tags: [], active: true, ...o } as Variant);
const P = (label: string): ManualPreset => ({ id: label, kind: 'pct', value: 10, label });
const presets = [P('STAFF10'), P('Summer Sale')];

test('a URL stored as a SKU is an item, not a discount or nothing', () => {
  const v = V({ sku: 'https://aidens3dp.com/p/dragon' });
  const r = resolveScan('https://aidens3dp.com/p/dragon', [v], presets); assert.equal(r.kind, 'variant');
});
test('an item beats everything else, even a code shaped like a pass, a gift card or a discount', () => {
  assert.equal(resolveScan('STAFF10', [V({ sku: 'staff10' })], presets).kind, 'variant');
  const pass = newBadgeCode(); assert.equal(resolveScan(pass, [V({ barcode: pass })], presets).kind, 'variant');
  const gift = giftQrPayload('ABCD1234'); assert.equal(resolveScan(gift, [V({ sku: gift })], presets).kind, 'variant');
});
test('order after items: pass, then gift card, then discount, then nothing', () => {
  assert.equal(resolveScan(newBadgeCode(), [], presets).kind, 'pass');
  assert.equal(resolveScan(giftQrPayload('ABCD1234'), [], presets).kind, 'gift');
  const d = resolveScan('staff-10', [], presets); assert.equal(d.kind, 'discount'); if (d.kind === 'discount') assert.equal(d.preset.label, 'STAFF10');
  assert.equal(resolveScan('https://example.com/nope', [], presets).kind, 'none');
});
test('a gift card prefix wins over a discount whose label would match the bare code', () => {
  assert.equal(resolveScan(giftQrPayload('STAFF10'), [], presets).kind, 'gift');
});
test('discounts are only recognised where presets are passed (the Price and Stock check tiles pass none)', () => {
  assert.equal(resolveScan('STAFF10', []).kind, 'none');
  assert.equal(scanProblem({ kind: 'discount', preset: P('X') }, 'x'), 'That is a discount code, not an item.');
});
test('a preset label with no letters or digits never matches', () => {
  assert.equal(findDiscountPreset([P('!!!')], '???'), undefined);
  assert.equal(findDiscountPreset([P('Summer Sale')], 'summer-sale')?.label, 'Summer Sale');
});
test('scan bridge: registered while the cart sits beside the grid, removed afterwards', () => {
  resetCartScan(); assert.equal(getCartScan(), null);
  const off = registerCartScan({ blocked: false, scan: c => `got ${c}` });
  assert.equal(getCartScan()?.scan('x'), 'got x'); off(); assert.equal(getCartScan(), null);
  const a = registerCartScan({ blocked: true, scan: () => null }); const b = registerCartScan({ blocked: false, scan: () => null });
  a(); assert.ok(getCartScan()); b(); assert.equal(getCartScan(), null); // an older registration cannot remove a newer one
});
