// Location: tests/adjustreview.test.ts
// A16.5: the checkout review of price adjustments (rows, order, key, Keep / Remove).
import test from 'node:test';
import assert from 'node:assert/strict';
import { priceCart, type PricingContext } from '../src/lib/pricing';
import { adjustReviewKey, adjustmentRows, keepRow, needsAdjustReview, removeRow, signedSaving, unresolvedRows } from '../src/lib/adjustReview';
import { addVariant, setItemPrice, setLineAdjust, setOrderAdjust, setQty } from '../src/lib/cartOps';
import { makeAdjust } from '../src/lib/lineAdjust';
import { makeOrderAdjust, stripAdjustments } from '../src/lib/orderAdjust';
import type { Cart, CartLine, Variant } from '../src/lib/types';

const P = (n: number) => `gid://shopify/Product/${n}`;
const V = (n: number) => `gid://shopify/ProductVariant/${n}`;
const variant = (id: number, prod: number, cents: number): Variant => ({
  id: V(id), productId: P(prod), productTitle: `P${prod}`, variantTitle: '', priceCents: cents, tracked: true, stock: 99, tags: [], active: true,
});
const tad = variant(2, 2, 400), cow = variant(1, 1, 1500);
const ctx = (): PricingContext => ({ variants: { [tad.id]: tad, [cow.id]: cow }, collectionsOfProduct: {}, autoDiscounts: [], bundles: null, now: Date.now() });
const price = (c: Cart) => priceCart(c, ctx());
const gift: CartLine = { id: 'gift', kind: 'gift_card', title: 'Gift card', qty: 1, unitCents: 5000, noDiscount: true };
const rowsOf = (c: Cart) => adjustmentRows(c, price(c));
const base = (): Cart => addVariant(addVariant({ id: 'c', lines: [] }, tad, 5), cow, 1);

/** Line price on the Tadling line, set the way the line editor sets it. */
const withLinePrice = (c: Cart, cents: number) => setLineAdjust(c, c.lines[0].id, makeAdjust(cents, price(c).lines[0]));
const withOrderPrice = (c: Cart, cents: number) => setOrderAdjust(c, makeOrderAdjust(cents, c, price(stripAdjustments(c))));

test('a cart with no adjustments has nothing to review and needs no check', () => {
  const c = base();
  assert.deepEqual(rowsOf(c), []);
  assert.equal(needsAdjustReview(rowsOf(c), ''), false);
  assert.equal(adjustReviewKey([]), '');
});

test('rows: item, line and whole order, in cart order with the whole order last', () => {
  const b = base();
  let c = setItemPrice(b, b.lines[0].id, 300, { scope: 'qty', qty: 5 }); // Tadlings $3.00 each: $15.00 (was $20.00)
  c = setLineAdjust(c, c.lines[0].id, makeAdjust(1000, price(c).lines[0])); // the line to $10.00
  assert.deepEqual(rowsOf(c).map(r => [r.kind, r.title, r.cents]), [['item', 'P2 × 5', 500], ['line', 'P2 × 5', 500]]);
  assert.match(rowsOf(c)[0].detail, /Item price \$3\.00 \(was \$4\.00\) · for 5 units/);
  assert.match(rowsOf(c)[1].detail, /Line price \$10\.00 \(was \$15\.00 after deals\)/);
  const o = withOrderPrice(setLineAdjust(c, c.lines[0].id, undefined), 2000);
  assert.deepEqual(rowsOf(o).map(r => r.kind), ['item', 'order']);
  assert.match(rowsOf(o)[1].detail, /Total \$20\.00 \(was \$30\.00\)/);
  assert.equal(rowsOf(o)[1].cents, 1000);
});

test('an item price that raises the price shows as money added', () => {
  const b = base();
  const c = setItemPrice(b, b.lines[0].id, 450, { scope: 'all' });
  const r = rowsOf(c)[0];
  assert.equal(r.cents, -250);
  assert.equal(signedSaving(r.cents), '+$2.50');
  assert.equal(signedSaving(500), '−$5.00');
  assert.match(r.detail, /all in cart/);
});

test('flagged rows come first, and they are the ones that must be resolved before payment', () => {
  const b = base();
  let c = withLinePrice(b, 1000); // line price on the Tadlings, not flagged
  c = withOrderPrice(c, 2200); // would clash with line prices in the UI; built directly here only to test ordering
  c = setQty(c, c.lines[1].id, 3); // 2 more Cows: flags the whole order price
  const rows = rowsOf(c);
  assert.deepEqual(rows.map(r => r.kind), ['order', 'line']);
  assert.deepEqual(unresolvedRows(rows).map(r => r.kind), ['order']);
  assert.match(rows[0].reasons.join('|'), /more items added/);
});

test('Keep clears the flag without changing the price; Remove takes the adjustment off', () => {
  const b = base();
  let c = withLinePrice(b, 1000);
  c = setQty(c, c.lines[0].id, 7);
  let p = price(c);
  assert.equal(unresolvedRows(adjustmentRows(c, p)).length, 1);
  const row = adjustmentRows(c, p)[0];
  const kept = keepRow(c, p, row);
  assert.equal(price(kept).netCents, p.netCents);
  assert.equal(unresolvedRows(adjustmentRows(kept, price(kept))).length, 0);
  const removed = removeRow(c, row);
  assert.equal(removed.lines[0].adjust, undefined);
  assert.deepEqual(adjustmentRows(removed, price(removed)), []);
});

test('Keep and Remove for a fixed-quantity item price and for the whole order price', () => {
  const b = base();
  let c = setItemPrice(b, b.lines[0].id, 300, { scope: 'qty', qty: 5 });
  c = setQty(c, c.lines[0].id, 6);
  let p = price(c);
  const item = adjustmentRows(c, p).find(r => r.kind === 'item')!;
  assert.equal(item.reasons.length, 1);
  const kept = keepRow(c, p, item);
  assert.equal(adjustmentRows(kept, price(kept))[0].reasons.length, 0);
  assert.equal(removeRow(c, item).lines[0].overrideCents, undefined);
  let o = withOrderPrice(base(), 2000);
  o = setQty(o, o.lines[1].id, 4);
  p = price(o);
  const order = adjustmentRows(o, p).find(r => r.kind === 'order')!;
  assert.equal(order.reasons.length, 1);
  const keptO = keepRow(o, p, order);
  assert.equal(adjustmentRows(keptO, price(keptO))[0].reasons.length, 0);
  assert.equal(price(keptO).netCents, 2000);
  assert.equal(removeRow(o, order).orderAdjust, undefined);
});

test('the review comes back only when an adjustment, or something it depends on, changes', () => {
  const c = withLinePrice(base(), 1000);
  const key = adjustReviewKey(rowsOf(c));
  assert.equal(needsAdjustReview(rowsOf(c), ''), true);
  assert.equal(needsAdjustReview(rowsOf(c), key), false); // acknowledged
  const other = addVariant(c, cow, 1); // an unrelated item: the Tadling line's price is unchanged
  assert.equal(needsAdjustReview(rowsOf(other), key), false);
  const changed = withLinePrice(setLineAdjust(c, c.lines[0].id, undefined), 800);
  assert.equal(needsAdjustReview(rowsOf(changed), key), true); // a different price
  const bumped = setQty(c, c.lines[0].id, 6);
  assert.equal(needsAdjustReview(rowsOf(bumped), key), true); // quantity changed, so it is flagged
});

test('gift cards never appear as adjusted, even with a stray price on them', () => {
  const c: Cart = { id: 'c', lines: [{ ...gift, overrideCents: 100, overrideAll: true }] };
  assert.deepEqual(rowsOf(c), []);
});

test('rows are stable between renders: the same cart gives the same key', () => {
  const c = withOrderPrice(base(), 2000);
  assert.equal(adjustReviewKey(rowsOf(c)), adjustReviewKey(rowsOf(c)));
  assert.notEqual(adjustReviewKey(rowsOf(c)), '');
});
