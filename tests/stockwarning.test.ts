// Location: tests/stockwarning.test.ts
// 0245: the built-in "stock running out" cart warning.
import test from 'node:test';
import assert from 'node:assert/strict';
import { shortfallLine, stockShortfalls, stockWarningPage } from '../src/lib/stockWarning';
import { pendingCartWarnings, warningKey } from '../src/lib/cartWarnings';
import type { Cart, CartLine, Variant } from '../src/lib/types';

const V = (id: string, stock: number | null): Variant => ({ id, productId: 'p' + id, productTitle: 'Item ' + id, variantTitle: '', priceCents: 1000, tracked: stock !== null, stock, tags: [], active: true } as Variant);
const L = (id: string, variantId: string | undefined, qty: number, kind: CartLine['kind'] = 'item'): CartLine => ({ id, kind, variantId, title: 'Item ' + (variantId ?? id), qty, unitCents: 1000 } as CartLine);
const cart = (...lines: CartLine[]): Cart => ({ lines } as Cart);
const vars = (...v: Variant[]) => Object.fromEntries(v.map(x => [x.id, x]));

test('only items left at 0 or below are listed', () => {
  const r = stockShortfalls(cart(L('a', 'v1', 2), L('b', 'v2', 2), L('c', 'v3', 3)), vars(V('v1', 5), V('v2', 2), V('v3', 1)));
  assert.deepEqual(r.map(x => [x.variantId, x.after]), [['v2', 0], ['v3', -2]]);
});
test('lines for the same variation are added together', () => {
  const r = stockShortfalls(cart(L('a', 'v1', 2), L('b', 'v1', 2)), vars(V('v1', 3)));
  assert.equal(r.length, 1); assert.equal(r[0].qty, 4); assert.equal(r[0].after, -1); assert.deepEqual(r[0].lineIds, ['a', 'b']);
});
test('untracked, custom, gift card and unknown items never count', () => {
  const r = stockShortfalls(cart(L('a', 'v1', 9), L('b', undefined, 9, 'custom'), L('c', 'v9', 9), L('d', 'v2', 9, 'gift_card')), vars(V('v1', null), V('v2', 0)));
  assert.deepEqual(r, []);
});
test('an item already at 0 or oversold is listed, with plain wording', () => {
  const [a] = stockShortfalls(cart(L('a', 'v1', 1)), vars(V('v1', 0))); assert.match(shortfallLine(a), /already out of stock.*-1/);
  const [b] = stockShortfalls(cart(L('a', 'v1', 1)), vars(V('v1', -2))); assert.match(shortfallLine(b), /already 2 oversold.*-3/);
  const [c] = stockShortfalls(cart(L('a', 'v1', 3)), vars(V('v1', 3))); assert.match(shortfallLine(c), /3 in stock, this sale uses them all/);
});
test('the page is null when off or nothing runs short, and shaped like a warning when it applies', () => {
  const c = cart(L('a', 'v1', 3)); const v = vars(V('v1', 3));
  assert.equal(stockWarningPage(c, v, undefined), null);
  assert.equal(stockWarningPage(c, v, { enabled: false, requireAcknowledgement: true }), null);
  assert.equal(stockWarningPage(cart(L('a', 'v1', 1)), v, { enabled: true, requireAcknowledgement: false }), null);
  const p = stockWarningPage(c, v, { enabled: true, requireAcknowledgement: true })!;
  assert.equal(p.warning.requireAcknowledgement, true); assert.equal(p.warning.mode, 'charge'); assert.deepEqual(p.matches.map(m => m.lineId), ['a']);
});
test('braces in a product name are removed so they are not read as a template', () => {
  const l = { ...L('a', 'v1', 1), title: 'Odd {{staff}} name' };
  const [s] = stockShortfalls(cart(l), vars(V('v1', 1))); assert.ok(!shortfallLine(s).includes('{{'));
});
test('the page comes back when the cart changes, and not when it is the same', () => {
  const cfg = { enabled: true, requireAcknowledgement: false }; const v = vars(V('v1', 3));
  const a = stockWarningPage(cart(L('a', 'v1', 3)), v, cfg)!; const same = stockWarningPage(cart(L('a', 'v1', 3)), v, cfg)!; const more = stockWarningPage(cart(L('a', 'v1', 4)), v, cfg)!;
  assert.equal(warningKey(a), warningKey(same)); assert.notEqual(warningKey(a), warningKey(more));
  assert.equal(pendingCartWarnings([a], [warningKey(a)]).length, 0); assert.equal(pendingCartWarnings([more], [warningKey(a)]).length, 1);
});
