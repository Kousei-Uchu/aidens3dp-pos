// Location: tests/itemadjust.test.ts
// A16.3: Item price adjustment, Fixed quantity or All in cart, with the review flag for a fixed quantity.
import test from 'node:test';
import assert from 'node:assert/strict';
import { priceCart, splitLineForOrder, type PricingContext } from '../src/lib/pricing';
import { addVariant, clearItemPrice, keepItemPrice, mergeCarts, patchLine, setItemPrice, setQty, swapVariant } from '../src/lib/cartOps';
import { itemReviewReasons } from '../src/lib/itemAdjust';
import { flaggedLines } from '../src/lib/lineAdjust';
import type { Cart, CartLine, Variant } from '../src/lib/types';

const P = (n: number) => `gid://shopify/Product/${n}`;
const V = (n: number) => `gid://shopify/ProductVariant/${n}`;
const variant = (id: number, prod: number, cents: number): Variant => ({
  id: V(id), productId: P(prod), productTitle: `P${prod}`, variantTitle: '', priceCents: cents, tracked: true, stock: 99, tags: [], active: true,
});
const tad = variant(2, 2, 400), cow = variant(1, 1, 1500), tadBig = variant(3, 2, 900);
const ctx = (): PricingContext => ({ variants: { [tad.id]: tad, [cow.id]: cow, [tadBig.id]: tadBig }, collectionsOfProduct: {}, autoDiscounts: [], bundles: null, now: Date.now() });
const price = (c: Cart) => priceCart(c, ctx());
const cartWith = (v: Variant, qty: number): Cart => addVariant({ id: 'c', lines: [] }, v, qty);
/** Item price on the first line of a cart (each cartWith() makes fresh line ids, so build the cart once and adjust that one). */
const adjFirst = (c: Cart, cents: number, how: Parameters<typeof setItemPrice>[3]) => setItemPrice(c, c.lines[0].id, cents, how);
const gift: CartLine = { id: 'gift', kind: 'gift_card', title: 'Gift card', qty: 1, unitCents: 5000, noDiscount: true };

test('Fixed quantity for part of a line splits it: the adjusted units become their own line, the rest stay as they were', () => {
  const c0 = cartWith(tad, 5);
  const c1 = setItemPrice(c0, c0.lines[0].id, 300, { scope: 'qty', qty: 2 });
  assert.deepEqual(c1.lines.map(l => [l.qty, l.overrideCents, l.overrideSeenQty]), [[3, undefined, undefined], [2, 300, 2]]);
  assert.equal(price(c1).netCents, 3 * 400 + 2 * 300);
  assert.deepEqual(flaggedLines(price(c1)), []);
});

test('Fixed quantity for the whole line (or more than it has) adjusts the line in place', () => {
  const c0 = cartWith(tad, 3);
  for (const n of [3, 9]) {
    const c1 = setItemPrice(c0, c0.lines[0].id, 250, { scope: 'qty', qty: n });
    assert.equal(c1.lines.length, 1);
    assert.deepEqual([c1.lines[0].qty, c1.lines[0].overrideCents, c1.lines[0].overrideSeenQty, c1.lines[0].overrideAll], [3, 250, 3, undefined]);
    assert.equal(price(c1).netCents, 750);
  }
});

test('splitting keeps the note and drops the line discount and line adjustment from the new line only', () => {
  let c0 = cartWith(tad, 4);
  c0 = patchLine(c0, c0.lines[0].id, { note: 'for Sam', discount: { kind: 'pct', value: 10, label: '10%' } });
  const c1 = setItemPrice(c0, c0.lines[0].id, 300, { scope: 'qty', qty: 1 });
  assert.equal(c1.lines[0].discount?.value, 10);
  assert.equal(c1.lines[1].discount, undefined);
  assert.equal(c1.lines[1].note, 'for Sam');
  assert.equal(c1.lines[0].id === c1.lines[1].id, false);
});

test('All in cart: every line of that item gets the price, other items are untouched', () => {
  let c0 = addVariant(cartWith(tad, 2), cow, 1);
  c0 = addVariant(c0, tadBig, 1);
  c0 = patchLine(c0, c0.lines[0].id, { note: 'x' });
  c0 = addVariant(c0, tad, 1); // a second Tadling line (the first has a note)
  const c1 = setItemPrice(c0, c0.lines[0].id, 100, { scope: 'all' });
  const byVariant = (id: string) => c1.lines.filter(l => l.variantId === id).map(l => [l.overrideCents, l.overrideAll]);
  assert.deepEqual(byVariant(tad.id), [[100, true], [100, true]]);
  assert.deepEqual(byVariant(cow.id), [[undefined, undefined]]);
  assert.deepEqual(byVariant(tadBig.id), [[undefined, undefined]]);
  assert.equal(price(c1).netCents, 3 * 100 + 1500 + 900);
});

test('All in cart: a unit added later gets the price and merges into the adjusted line', () => {
  const c0 = cartWith(tad, 2);
  const c1 = setItemPrice(c0, c0.lines[0].id, 100, { scope: 'all' });
  const c2 = addVariant(c1, tad, 3);
  assert.equal(c2.lines.length, 1);
  assert.equal(c2.lines[0].qty, 5);
  assert.equal(price(c2).netCents, 500);
  assert.deepEqual(flaggedLines(price(c2)), []); // it follows every unit, so nothing to flag
  const c3 = addVariant(c1, tad, 1, false); // consolidation off: a new line, still at the price
  assert.deepEqual(c3.lines.map(l => [l.qty, l.overrideCents, l.overrideAll]), [[2, 100, true], [1, 100, true]]);
});

test('Fixed quantity: a unit added later is NOT at the adjusted price (new full-price line)', () => {
  const c0 = cartWith(tad, 2);
  const c1 = setItemPrice(c0, c0.lines[0].id, 100, { scope: 'qty', qty: 2 });
  const c2 = addVariant(c1, tad, 1);
  assert.deepEqual(c2.lines.map(l => [l.qty, l.overrideCents]), [[2, 100], [1, undefined]]);
  assert.equal(price(c2).netCents, 200 + 400);
});

test('Fixed quantity review flag: a changed quantity flags the line, Keep clears it, price stays', () => {
  const c0 = cartWith(tad, 2);
  const c1 = setItemPrice(c0, c0.lines[0].id, 100, { scope: 'qty', qty: 2 });
  const more = setQty(c1, c1.lines[0].id, 5);
  const p = price(more);
  assert.deepEqual(itemReviewReasons(p.lines[0]), ['The adjusted price was set for 2 P2, the line now has 5']);
  assert.equal(p.netCents, 500); // the adjusted price now covers all 5 until the cashier decides
  assert.equal(flaggedLines(p).length, 1);
  const kept = keepItemPrice(more, more.lines[0].id);
  assert.deepEqual(flaggedLines(price(kept)), []);
  assert.equal(price(kept).netCents, 500);
  const fewer = setQty(c1, c1.lines[0].id, 1);
  assert.equal(itemReviewReasons(price(fewer).lines[0]).length, 1);
});

test('a price set before this existed (no unit count) is not flagged and prices as before', () => {
  const base = cartWith(tad, 3);
  const c = { ...base, lines: base.lines.map(l => ({ ...l, overrideCents: 250 })) };
  assert.equal(price(c).netCents, 750);
  assert.deepEqual(flaggedLines(price(setQty(c, c.lines[0].id, 6))), []);
});

test('Reset: an All in cart price comes off every line that follows it, a fixed one only its own line', () => {
  let c0 = cartWith(tad, 4);
  c0 = setItemPrice(c0, c0.lines[0].id, 300, { scope: 'qty', qty: 1 }); // fixed on its own line
  const fixedId = c0.lines[1].id, restId = c0.lines[0].id;
  const all = setItemPrice(c0, restId, 100, { scope: 'all' }); // replaces the fixed price too (same item)
  assert.deepEqual(all.lines.map(l => [l.overrideCents, l.overrideAll]), [[100, true], [100, true]]);
  const cleared = clearItemPrice(all, restId);
  assert.deepEqual(cleared.lines.map(l => l.overrideCents), [undefined, undefined]);
  const justOne = clearItemPrice(c0, fixedId);
  assert.deepEqual(justOne.lines.map(l => l.overrideCents), [undefined, undefined]);
  const keepFixed = clearItemPrice(setItemPrice(addVariant(c0, tad, 1, false), c0.lines[0].id, 100, { scope: 'all' }), c0.lines[0].id);
  assert.equal(keepFixed.lines.length, 3);
  assert.equal(keepFixed.lines.every(l => l.overrideCents === undefined && l.overrideAll === undefined && l.overrideSeenQty === undefined), true);
});

test('swapping the variation takes the item price off', () => {
  const c0 = adjFirst(cartWith(tad, 2), 100, { scope: 'all' });
  assert.equal(c0.lines[0].overrideAll, true);
  const c1 = swapVariant(c0, c0.lines[0].id, tadBig);
  assert.deepEqual([c1.lines[0].overrideCents, c1.lines[0].overrideAll, c1.lines[0].overrideSeenQty], [undefined, undefined, undefined]);
  assert.equal(price(c1).netCents, 1800);
});

test('merging carts: an All in cart price covers the same item on both sides and the units consolidate', () => {
  const a = adjFirst(cartWith(tad, 2), 100, { scope: 'all' });
  const plain = cartWith(tad, 3);
  const m1 = mergeCarts(a, plain, true);
  assert.deepEqual(m1.lines.map(l => [l.qty, l.overrideCents, l.overrideAll]), [[5, 100, true]]);
  const m2 = mergeCarts(plain, a, true);
  assert.deepEqual(m2.lines.map(l => [l.qty, l.overrideCents, l.overrideAll]), [[5, 100, true]]);
  const fixed = adjFirst(cartWith(tad, 3), 300, { scope: 'qty', qty: 3 });
  assert.equal(mergeCarts(a, fixed, true).lines.length, 2); // a line with its own fixed price keeps it and stays separate
});

test('gift cards cannot have an item price, and the engine ignores one on a gift card', () => {
  const c: Cart = { id: 'c', lines: [gift] };
  assert.equal(setItemPrice(c, 'gift', 100, { scope: 'qty', qty: 1 }), c);
  const forced = price({ ...c, lines: [{ ...gift, overrideCents: 100, overrideAll: true }] });
  assert.equal(forced.netCents, 5000);
});

test('a custom amount takes a fixed price; "All in cart" falls back to fixed for it; bad prices are refused', () => {
  const custom: CartLine = { id: 'cu', kind: 'custom', title: 'Custom amount', qty: 2, unitCents: 1000, noDiscount: true };
  const c: Cart = { id: 'c', lines: [custom] };
  const c1 = setItemPrice(c, 'cu', 800, { scope: 'all' });
  assert.deepEqual([c1.lines[0].overrideCents, c1.lines[0].overrideAll, c1.lines[0].overrideSeenQty], [800, undefined, 2]);
  assert.equal(setItemPrice(c, 'cu', -1, { scope: 'qty', qty: 1 }), c);
  assert.equal(setItemPrice(c, 'cu', 1.5, { scope: 'qty', qty: 1 }), c);
  assert.equal(setItemPrice(c, 'nope', 100, { scope: 'qty', qty: 1 }), c);
});

test('an item price can also go up, and totals and Shopify order lines stay exact', () => {
  const c0 = cartWith(tad, 3);
  const c1 = setItemPrice(c0, c0.lines[0].id, 433, { scope: 'qty', qty: 3 });
  const p = price(c1);
  assert.equal(p.netCents, 1299);
  assert.equal(p.itemsCents - p.discountCents, p.netCents);
  assert.equal(splitLineForOrder(p.lines[0].netCents, 3).reduce((a, x) => a + x.qty * x.unitCents, 0), 1299);
});
