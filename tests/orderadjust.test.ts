// Location: tests/orderadjust.test.ts
// A16.4 / A16.7: the Whole order adjustment, its review flag, and the "never both kinds" rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { priceCart, splitLineForOrder, ORDER_ADJUST_LABEL, type PricingContext } from '../src/lib/pricing';
import { giftCardCents, keepOrderAdjust, makeOrderAdjust, orderAdjustProblem, orderBeforeCents, orderReviewReasons, stripAdjustments } from '../src/lib/orderAdjust';
import { makeAdjust } from '../src/lib/lineAdjust';
import { addVariant, clearLineAdjusts, hasLineAdjusts, mergeCarts, setLineAdjust, setOrderAdjust, setQty } from '../src/lib/cartOps';
import { invoiceRows } from '../src/lib/invoiceRows';
import type { AutoDiscount, Cart, CartLine, Variant } from '../src/lib/types';

const P = (n: number) => `gid://shopify/Product/${n}`;
const V = (n: number) => `gid://shopify/ProductVariant/${n}`;
const variant = (id: number, prod: number, cents: number): Variant => ({
  id: V(id), productId: P(prod), productTitle: `P${prod}`, variantTitle: '', priceCents: cents, tracked: true, stock: 99, tags: [], active: true,
});
const line = (v: Variant, qty: number, extra: Partial<CartLine> = {}): CartLine => ({ id: `l-${v.id}`, kind: 'item', variantId: v.id, title: v.productTitle, qty, unitCents: v.priceCents, ...extra });
const gift = (cents: number): CartLine => ({ id: 'gift', kind: 'gift_card', title: 'Gift card', qty: 1, unitCents: cents, noDiscount: true });
const cart = (lines: CartLine[], extra: Partial<Cart> = {}): Cart => ({ id: 'c', lines, ...extra });
const tad = variant(2, 2, 400), cow = variant(1, 1, 1500);
const TAD_LINE = `l-${tad.id}`; // line() builds ids from the variant id
const ctx = (autos: AutoDiscount[] = []): PricingContext => ({ variants: { [tad.id]: tad, [cow.id]: cow }, collectionsOfProduct: {}, autoDiscounts: autos, bundles: null, now: Date.now() });
const tad5: AutoDiscount = { id: 'tad5', title: '5x Tadlings', kind: 'basic', amtCents: 1000, minQty: 5, target: { productIds: [P(2)] } };

/** Set an order total the way the sheet does: price the cart with no adjustments, then store the final total with a snapshot. */
function ordered(c0: Cart, finalCents: number, autos: AutoDiscount[] = []) {
  const base = priceCart(stripAdjustments(c0), ctx(autos));
  const c1 = setOrderAdjust(c0, makeOrderAdjust(finalCents, c0, base));
  return { c1, base, p1: priceCart(c1, ctx(autos)) };
}

test('the order costs exactly the adjusted total and the difference is shared over the lines by value', () => {
  const { p1 } = ordered(cart([line(tad, 10), line(cow, 2)]), 6000); // $40 + $30 = $70 -> $60
  assert.equal(p1.netCents, 6000);
  assert.equal(p1.lines[0].discountCents + p1.lines[1].discountCents, 1000);
  assert.equal(p1.lines[0].discountCents, 571); // 4/7 of $10.00 (largest-remainder rounding)
  assert.equal(p1.lines[1].discountCents, 429);
  assert.deepEqual(p1.adjustment, { finalCents: 6000, cents: 1000 });
  assert.equal(p1.deals.find(d => d.label === ORDER_ADJUST_LABEL)?.cents, 1000);
  assert.equal(invoiceRows(p1.lines[0]).at(-1)?.label, ORDER_ADJUST_LABEL);
});

test('worked out after every other discount (deals, line discounts, cart discount)', () => {
  const c0 = cart([line(tad, 5), line(cow, 1, { discount: { kind: 'amt', value: 300, label: '$3 off' } })], { discount: { kind: 'pct', value: 10, label: '10% off' } });
  const base = priceCart(stripAdjustments(c0), ctx([tad5]));
  const { p1 } = ordered(c0, base.netCents - 250, [tad5]);
  assert.equal(p1.netCents, base.netCents - 250);
  assert.equal(orderBeforeCents(p1), base.netCents);
});

test('gift cards are never reduced: the difference comes off the other lines only', () => {
  const { p1 } = ordered(cart([line(tad, 5), gift(5000)]), 6000); // $20 + $50 gift = $70 -> $60
  assert.equal(p1.netCents, 6000);
  assert.equal(p1.lines[1].netCents, 5000);
  assert.equal(p1.lines[0].netCents, 1000);
  assert.equal(giftCardCents(p1), 5000);
});

test('the total cannot go below the gift cards, below $0, or up', () => {
  const c0 = cart([line(tad, 5), gift(5000)]);
  const base = priceCart(c0, ctx());
  assert.match(orderAdjustProblem(4999, base)!, /gift cards worth \$50\.00/);
  assert.equal(orderAdjustProblem(5000, base), null); // the other items go to $0, the gift card stays
  assert.match(orderAdjustProblem(-1, base)!, /less than \$0/);
  assert.match(orderAdjustProblem(base.netCents, base)!, /not lower/);
  assert.match(orderAdjustProblem(base.netCents + 1, base)!, /current total of \$70\.00/);
  assert.equal(orderAdjustProblem(1.5, base), 'Enter an amount.');
  // a corrupt value in a saved or synced cart is clamped in the engine and never pays the customer
  const bad = priceCart(setOrderAdjust(c0, { finalCents: 100, seenQty: 6, seenBeforeCents: 7000 }), ctx());
  assert.equal(bad.netCents, 5000);
  const neg = priceCart(setOrderAdjust(c0, { finalCents: -500, seenQty: 6, seenBeforeCents: 7000 }), ctx());
  assert.equal(neg.netCents, 5000);
});

test('an adjustment that no longer lowers the total does nothing and is flagged', () => {
  const c0 = cart([line(tad, 5)]);
  const p = priceCart(setOrderAdjust(c0, { finalCents: 9999, seenQty: 5, seenBeforeCents: 2000 }), ctx());
  assert.equal(p.netCents, 2000);
  assert.deepEqual(p.adjustment, { finalCents: 9999, cents: 0 });
  assert.match(orderReviewReasons(setOrderAdjust(c0, { finalCents: 9999, seenQty: 5, seenBeforeCents: 2000 }), p).join('|'), /no longer lowers the total/);
});

test('setting the order total does not flag it straight away', () => {
  const { c1, p1 } = ordered(cart([line(tad, 10), line(cow, 2)], { discount: { kind: 'pct', value: 10, label: '10% off' } }), 5000);
  assert.deepEqual(orderReviewReasons(c1, p1), []);
});

test('review flag: items added or removed, prices or discounts changed; Keep clears it and keeps the total', () => {
  const { c1 } = ordered(cart([line(tad, 5), line(cow, 1)]), 2000);
  const more = setQty(c1, TAD_LINE, 7);
  const pMore = priceCart(more, ctx());
  assert.deepEqual(orderReviewReasons(more, pMore), ['2 more items added']);
  assert.equal(pMore.netCents, 2000); // flagged, not hidden: the total stays until the cashier decides
  const kept = setOrderAdjust(more, keepOrderAdjust(more.orderAdjust!, more, pMore));
  assert.deepEqual(orderReviewReasons(kept, priceCart(kept, ctx())), []);
  const one = setQty(c1, TAD_LINE, 4);
  assert.deepEqual(orderReviewReasons(one, priceCart(one, ctx())), ['1 item removed']);
  const deal = priceCart(c1, ctx([tad5])); // a deal now applies: same items, different prices
  assert.deepEqual(orderReviewReasons(c1, deal), ['Prices or discounts changed']);
});

test('A16.7: line adjustments are cleared when an order total is set, and the order total is dropped when a merge brings line adjustments', () => {
  const c0 = cart([line(tad, 5)]);
  const p0 = priceCart(c0, ctx());
  const withLine = setLineAdjust(c0, TAD_LINE, makeAdjust(1500, p0.lines[0]));
  assert.equal(hasLineAdjusts(withLine), true);
  const cleared = clearLineAdjusts(withLine);
  assert.equal(hasLineAdjusts(cleared), false);
  assert.equal(clearLineAdjusts(c0), c0); // nothing to clear returns the same cart
  const withOrder = ordered(cart([line(cow, 1)]), 1000).c1;
  const merged = mergeCarts(withOrder, withLine, true);
  assert.equal(merged.orderAdjust, undefined);
  assert.equal(merged.lines.length, 2);
  assert.equal(mergeCarts(withOrder, cart([line(tad, 1, { id: 'x' })]), true).orderAdjust?.finalCents, 1000); // no conflict: it stays (and is flagged)
});

test('a new item still merges into the plain lines of an order that has a total set', () => {
  const { c1 } = ordered(cart([line(tad, 5)]), 1000);
  const added = addVariant(c1, tad, 1, true);
  assert.equal(added.lines.length, 1);
  assert.equal(added.lines[0].qty, 6);
  assert.equal(added.orderAdjust?.finalCents, 1000);
});

test('totals and Shopify order lines stay exact: items − discounts = net, roll-up matches, unit prices add up', () => {
  const { p1 } = ordered(cart([line(tad, 3), line(cow, 1)]), 1234);
  assert.equal(p1.itemsCents - p1.discountCents, p1.netCents);
  assert.equal(p1.netCents, 1234);
  assert.equal(p1.deals.reduce((a, d) => a + d.cents, 0), p1.discountCents);
  for (const pl of p1.lines) assert.equal(splitLineForOrder(pl.netCents, pl.line.qty).reduce((a, x) => a + x.qty * x.unitCents, 0), pl.netCents);
});

test('an order total on an empty cart is ignored', () => {
  const p = priceCart(setOrderAdjust(cart([]), { finalCents: 100, seenQty: 0, seenBeforeCents: 0 }), ctx());
  assert.equal(p.netCents, 0);
  assert.deepEqual(orderReviewReasons(setOrderAdjust(cart([]), { finalCents: 100, seenQty: 0, seenBeforeCents: 0 }), p), []);
});
