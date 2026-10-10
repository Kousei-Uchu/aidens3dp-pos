// Location: tests/lineadjust.test.ts
// A16.1 / A16.2 / A16.6 (line part): the Line price adjustment and its review flag.
import test from 'node:test';
import assert from 'node:assert/strict';
import { priceCart, splitLineForOrder, ADJUST_LABEL, type PricingContext } from '../src/lib/pricing';
import { adjustProblem, beforeAdjustCents, flaggedLines, keepAdjust, makeAdjust, reviewReasons } from '../src/lib/lineAdjust';
import { invoiceRows } from '../src/lib/invoiceRows';
import { addVariant, mergeCarts, patchLine, setLineAdjust, setQty } from '../src/lib/cartOps';
import type { AutoDiscount, Cart, CartLine, Variant } from '../src/lib/types';

const P = (n: number) => `gid://shopify/Product/${n}`;
const V = (n: number) => `gid://shopify/ProductVariant/${n}`;
const variant = (id: number, prod: number, cents: number): Variant => ({
  id: V(id), productId: P(prod), productTitle: `P${prod}`, variantTitle: '', priceCents: cents, tracked: true, stock: 99, tags: [], active: true,
});
const line = (v: Variant, qty: number, extra: Partial<CartLine> = {}): CartLine => ({ id: `l-${v.id}`, kind: 'item', variantId: v.id, title: v.productTitle, qty, unitCents: v.priceCents, ...extra });
const cart = (lines: CartLine[], extra: Partial<Cart> = {}): Cart => ({ id: 'c', lines, ...extra });
const tad = variant(2, 2, 400), cow = variant(1, 1, 1500);
const ctx = (autos: AutoDiscount[] = []): PricingContext => ({ variants: { [tad.id]: tad, [cow.id]: cow }, collectionsOfProduct: {}, autoDiscounts: autos, bundles: null, now: Date.now() });
const tad5: AutoDiscount = { id: 'tad5', title: '5x Tadlings', kind: 'basic', amtCents: 1000, minQty: 5, target: { productIds: [P(2)] } };
const tad3: AutoDiscount = { id: 'tad3', title: '3x Tadlings', kind: 'basic', amtCents: 500, minQty: 3, target: { productIds: [P(2)] } };

/** Price a cart whose first line gets an adjustment to `finalCents`, set the way the line editor sets it. */
function adjusted(qty: number, finalCents: number, autos: AutoDiscount[] = [], extra: Partial<Cart> = {}) {
  const c0 = cart([line(tad, qty)], extra);
  const p0 = priceCart(c0, ctx(autos));
  const c1 = setLineAdjust(c0, c0.lines[0].id, makeAdjust(finalCents, p0.lines[0]));
  return { c1, p1: priceCart(c1, ctx(autos)) };
}

test('the line costs exactly the adjusted price, shown as a "Line price adjustment" row', () => {
  const { p1 } = adjusted(13, 4000);
  assert.equal(p1.lines[0].netCents, 4000);
  assert.equal(p1.lines[0].discounts.at(-1)?.label, ADJUST_LABEL);
  assert.equal(p1.lines[0].discounts.at(-1)?.cents, 1200);
  assert.equal(p1.netCents, 4000);
});

test('worked out after other discounts: the A12.8 example (13 Tadlings, 5x twice + 3x, then $40.00 final)', () => {
  const d5: AutoDiscount = { ...tad5, amtCents: 400 }, d3: AutoDiscount = { ...tad3, amtCents: 200 }; // $4 off per 5, $2 off per 3
  const { p1 } = adjusted(13, 4000, [d5, d3]);
  assert.deepEqual(invoiceRows(p1.lines[0]).map(r => [r.label, r.cents]), [['5x Tadlings (x2)', 800], ['3x Tadlings', 200], [ADJUST_LABEL, 200]]);
  assert.equal(p1.lines[0].netCents, 4000); // 52 - 8 - 2 - 2
});

test('an adjustment never raises a price: a final price at or above the current price does nothing', () => {
  const c0 = cart([line(tad, 2, { adjust: { finalCents: 9999, seenQty: 2, seenGrossCents: 800, seenDiscountCents: 0 } })]);
  const p = priceCart(c0, ctx());
  assert.equal(p.lines[0].netCents, 800);
  assert.deepEqual(p.lines[0].adjustment, { finalCents: 9999, cents: 0 });
  assert.match(reviewReasons(p.lines[0]).join('|'), /no longer lowers the price/);
});

test('it cannot take a line below $0, and a $0.00 final is allowed to price (line is free)', () => {
  const p0 = priceCart(cart([line(tad, 2)]), ctx());
  assert.match(adjustProblem(-1, p0.lines[0])!, /less than \$0/);
  const free = priceCart(cart([line(tad, 2, { adjust: { finalCents: 0, seenQty: 2, seenGrossCents: 800, seenDiscountCents: 0 } })]), ctx());
  assert.equal(free.lines[0].netCents, 0);
  const neg = priceCart(cart([line(tad, 2, { adjust: { finalCents: -500, seenQty: 2, seenGrossCents: 800, seenDiscountCents: 0 } })]), ctx());
  assert.equal(neg.lines[0].netCents, 0); // a corrupt negative value is clamped, never pays the customer
});

test('adjustProblem: only lower prices are accepted, with the current price in the message', () => {
  const p0 = priceCart(cart([line(tad, 13)]), ctx([tad5, tad3]));
  const before = beforeAdjustCents(p0.lines[0]);
  assert.equal(adjustProblem(before, p0.lines[0])?.includes('not lower'), true);
  assert.equal(adjustProblem(before - 1, p0.lines[0]), null);
  assert.equal(adjustProblem(1.5, p0.lines[0]), 'Enter an amount.');
});

test('gift cards cannot be adjusted (the engine ignores an adjustment on one)', () => {
  const gift: CartLine = { id: 'g', kind: 'gift_card', title: 'Gift card', qty: 1, unitCents: 5000, noDiscount: true, adjust: { finalCents: 100, seenQty: 1, seenGrossCents: 5000, seenDiscountCents: 0 } };
  const p = priceCart(cart([gift]), ctx());
  assert.equal(p.lines[0].netCents, 5000);
  assert.equal(p.lines[0].adjustment, undefined);
  assert.deepEqual(reviewReasons(p.lines[0]), []);
});

test('the cart discount skips an adjusted line and shares out over the others', () => {
  const c0 = cart([line(tad, 10), line(cow, 2)], { discount: { kind: 'pct', value: 10, label: '10% off' } });
  const p0 = priceCart(c0, ctx());
  const c1 = setLineAdjust(c0, l(c0, tad), makeAdjust(2000, p0.lines[0]));
  const p1 = priceCart(c1, ctx());
  assert.equal(p1.lines[0].netCents, 2000);
  assert.equal(p1.lines[1].discountCents, 300); // 10% of the cows' $30.00 only
  const p2 = priceCart(setLineAdjust(c1, l(c1, tad), undefined), ctx());
  assert.equal(p2.lines[0].netCents, 4000 - 400); // back to its share of the 10%
});
const l = (c: Cart, v: Variant) => c.lines.find(x => x.variantId === v.id)!.id;

test('setting an adjustment does not flag the line straight away, even with a cart discount', () => {
  const { p1 } = adjusted(10, 2000, [], { discount: { kind: 'pct', value: 10, label: '10% off' } });
  assert.deepEqual(flaggedLines(p1), []);
});

test('A16.2: changing the quantity flags the line, Keep clears it, the price stays the same', () => {
  const { c1 } = adjusted(5, 1500);
  const more = setQty(c1, c1.lines[0].id, 7);
  const pMore = priceCart(more, ctx());
  assert.deepEqual(reviewReasons(pMore.lines[0]), ['2 more P2 added']);
  assert.equal(pMore.lines[0].netCents, 1500); // the extra units are not charged until the cashier reviews: flagged, not hidden
  assert.equal(flaggedLines(pMore).length, 1);
  const kept = patchLine(more, more.lines[0].id, { adjust: keepAdjust(more.lines[0].adjust!, pMore.lines[0]) });
  assert.deepEqual(flaggedLines(priceCart(kept, ctx())), []);
  const fewer = priceCart(setQty(c1, c1.lines[0].id, 4), ctx());
  assert.deepEqual(reviewReasons(fewer.lines[0]), ['1 P2 removed']);
});

test('A16.2: a change in the discounts on the line flags it', () => {
  const { c1 } = adjusted(5, 500, []);
  const withDeal = priceCart(c1, ctx([tad5]));
  assert.deepEqual(reviewReasons(withDeal.lines[0]), ['The discounts on this line changed']);
});

test('A16.2: a changed unit price flags it', () => {
  const { c1 } = adjusted(5, 1500);
  const changed = priceCart(patchLine(c1, c1.lines[0].id, { overrideCents: 450 }), ctx());
  assert.deepEqual(reviewReasons(changed.lines[0]), ['The unit price changed']);
});

test('adding the same item again makes a new line, so a fixed price never covers extra units; merging carts the same', () => {
  const c1 = adjusted(5, 1500).c1;
  const added = addVariant(c1, tad, 1, true);
  assert.equal(added.lines.length, 2);
  assert.equal(added.lines[0].qty, 5);
  const merged = mergeCarts(c1, cart([line(tad, 2, { id: 'other' })]), true);
  assert.equal(merged.lines.length, 2);
});

test('refund and Shopify order lines: an adjusted line splits into unit prices that add up exactly', () => {
  const { p1 } = adjusted(3, 1000); // $10.00 over 3 units
  const parts = splitLineForOrder(p1.lines[0].netCents, 3);
  assert.equal(parts.reduce((a, x) => a + x.qty * x.unitCents, 0), 1000);
  assert.deepEqual(parts.map(x => x.qty).reduce((a, b) => a + b, 0), 3);
});

test('totals stay consistent: items − discounts = net, and the deals roll-up includes the adjustment', () => {
  const { p1 } = adjusted(13, 4000, [tad5, tad3]);
  assert.equal(p1.itemsCents - p1.discountCents, p1.netCents);
  assert.equal(p1.deals.reduce((a, d) => a + d.cents, 0), p1.discountCents);
});
