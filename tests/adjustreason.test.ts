// Location: tests/adjustreason.test.ts
// A16.8: the optional reason for a price adjustment: kept on the cart, listed in the review, saved on the sale and the
// Shopify order, and added up by reason for Reports.
import test from 'node:test';
import assert from 'node:assert/strict';
import { priceCart, type PricingContext } from '../src/lib/pricing';
import { cleanReason, decodeAdjustments, encodeAdjustments, reasonKey, reasonLabel, REASON_MAX } from '../src/lib/adjustReason';
import { adjustmentRows, saleAdjustments } from '../src/lib/adjustReview';
import { addVariant, clearItemPrice, mergeCarts, setItemPrice, setLineAdjust, setOrderAdjust, swapVariant } from '../src/lib/cartOps';
import { keepAdjust, makeAdjust } from '../src/lib/lineAdjust';
import { keepOrderAdjust, makeOrderAdjust, stripAdjustments } from '../src/lib/orderAdjust';
import { adjustmentSummary, applyRecord, contribution, derived, emptyTotals, merge } from '../src/lib/rollup';
import { buildOrderInput, mapOrder } from '../src/lib/shopify/orderModel';
import type { Cart, SaleAdjustment, SaleRecord, Variant } from '../src/lib/types';

const P = (n: number) => `gid://shopify/Product/${n}`;
const V = (n: number) => `gid://shopify/ProductVariant/${n}`;
const variant = (id: number, prod: number, cents: number): Variant => ({
  id: V(id), productId: P(prod), productTitle: `P${prod}`, variantTitle: '', priceCents: cents, tracked: true, stock: 99, tags: [], active: true,
});
const tad = variant(2, 2, 400), cow = variant(1, 1, 1500), tadBig = variant(3, 2, 900);
const ctx = (): PricingContext => ({ variants: { [tad.id]: tad, [cow.id]: cow, [tadBig.id]: tadBig }, collectionsOfProduct: {}, autoDiscounts: [], bundles: null, now: Date.now() });
const price = (c: Cart) => priceCart(c, ctx());
const cartWith = (v: Variant, qty: number): Cart => addVariant({ id: 'c', lines: [] }, v, qty);

test('cleanReason tidies what was typed, cuts it to the limit, and treats blank as no reason', () => {
  assert.equal(cleanReason('  Damaged   box '), 'Damaged box');
  assert.equal(cleanReason('   '), undefined);
  assert.equal(cleanReason(undefined), undefined);
  assert.equal(cleanReason('x'.repeat(200))?.length, REASON_MAX);
  assert.equal(reasonKey('Damaged  Box'), 'damaged box');
  assert.equal(reasonKey(undefined), '');
  assert.equal(reasonLabel('damaged box'), 'Damaged box');
  assert.equal(reasonLabel(''), 'No reason given');
});

test('a line price keeps its reason through Keep; a blank reason is not stored', () => {
  const c = cartWith(tad, 5); const p = price(c);
  const a = makeAdjust(1000, p.lines[0], ' Price match ');
  assert.equal(a.reason, 'Price match');
  assert.equal('reason' in makeAdjust(1000, p.lines[0], '  '), false);
  const c1 = setLineAdjust(c, c.lines[0].id, a);
  assert.equal(keepAdjust(c1.lines[0].adjust!, price(c1).lines[0]).reason, 'Price match');
  assert.equal(price(c1).lines[0].netCents, 1000); // the reason never changes a price
});

test('the whole order price keeps its reason through Keep', () => {
  const c = cartWith(tad, 5);
  const o = setOrderAdjust(c, makeOrderAdjust(1500, c, price(stripAdjustments(c)), 'Regular customer'));
  assert.equal(o.orderAdjust?.reason, 'Regular customer');
  assert.equal(keepOrderAdjust(o.orderAdjust!, o, price(o)).reason, 'Regular customer');
});

test('item prices: the reason goes on a fixed-quantity line, on every line of an All in cart price, and on units added later', () => {
  const c = cartWith(tad, 4);
  const fixed = setItemPrice(c, c.lines[0].id, 300, { scope: 'qty', qty: 1 }, 'Faded colour');
  assert.deepEqual(fixed.lines.map(l => l.overrideReason), [undefined, 'Faded colour']); // the split-off line carries it, the rest do not
  const all = setItemPrice(c, c.lines[0].id, 300, { scope: 'all' }, 'Staff pick');
  assert.deepEqual(all.lines.map(l => l.overrideReason), ['Staff pick']);
  const more = addVariant(all, tad, 2, false);
  assert.deepEqual(more.lines.map(l => l.overrideReason), ['Staff pick', 'Staff pick']);
  const merged = mergeCarts(cartWith(tad, 1), all, true);
  assert.deepEqual(merged.lines.map(l => [l.qty, l.overrideReason]), [[5, 'Staff pick']]);
});

test('taking an item price off, or swapping the variation, takes the reason with it', () => {
  const c = cartWith(tad, 2);
  const priced = setItemPrice(c, c.lines[0].id, 300, { scope: 'all' }, 'Staff pick');
  assert.equal(clearItemPrice(priced, priced.lines[0].id).lines[0].overrideReason, undefined);
  assert.equal(swapVariant(priced, priced.lines[0].id, tadBig).lines[0].overrideReason, undefined);
});

test('the checkout review rows carry the reasons, and the sale saves them', () => {
  const c0 = cartWith(tad, 5);
  const c1 = setItemPrice(c0, c0.lines[0].id, 300, { scope: 'qty', qty: 5 }, 'Faded colour');
  const c2 = setLineAdjust(c1, c1.lines[0].id, makeAdjust(1000, price(c1).lines[0], 'Bulk'));
  const rows = adjustmentRows(c2, price(c2));
  assert.deepEqual(rows.map(r => [r.kind, r.reason]), [['item', 'Faded colour'], ['line', 'Bulk']]);
  const saved = saleAdjustments(c2, price(c2));
  assert.deepEqual(saved.map(a => [a.kind, a.cents, a.reason]), [['item', 500, 'Faded colour'], ['line', 500, 'Bulk']]);
  assert.deepEqual(saleAdjustments(c0, price(c0)), []);
  const noReason = setLineAdjust(c0, c0.lines[0].id, makeAdjust(1000, price(c0).lines[0]));
  assert.equal('reason' in saleAdjustments(noReason, price(noReason))[0], false);
});

test('adjustments encode into one Shopify attribute (<= 255) and read back; junk and unknown kinds are ignored', () => {
  const list: SaleAdjustment[] = [
    { kind: 'item', title: 'Tadling × 5', detail: 'x', cents: 500, reason: 'Faded, colour; "odd" | chars é' },
    { kind: 'order', title: 'Whole order', detail: 'y', cents: 1000 },
  ];
  const s = encodeAdjustments(list);
  assert.ok(s.length <= 255);
  const back = decodeAdjustments(s);
  assert.deepEqual(back.map(a => [a.kind, a.cents, a.title, a.reason]), [['item', 500, 'Tadling × 5', 'Faded, colour; "odd" | chars é'], ['order', 1000, 'Whole order', undefined]]);
  assert.deepEqual(decodeAdjustments(undefined), []);
  assert.deepEqual(decodeAdjustments('nonsense;;a|b'), []);
  assert.deepEqual(decodeAdjustments('weird|100|T|r'), []);
  assert.equal(decodeAdjustments('line|NaN|T|r').length, 0);
});

test('a long list is cut to fit 255 characters, keeps the first entries and counts the rest', () => {
  const many: SaleAdjustment[] = Array.from({ length: 12 }, (_, i) => ({ kind: 'line', title: `Item number ${i}`, detail: '', cents: 100 + i, reason: 'Customer was unhappy with the colour of this one' }));
  const s = encodeAdjustments(many);
  assert.ok(s.length <= 255, String(s.length));
  const back = decodeAdjustments(s);
  assert.ok(back.length >= 1 && back.length < 12);
  assert.equal(back[0].cents, 100);
  assert.match(s, /;\+\d+$/);
  const huge: SaleAdjustment = { kind: 'item', title: 'T'.repeat(100), detail: '', cents: 1, reason: 'é'.repeat(REASON_MAX) };
  assert.ok(encodeAdjustments([huge]).length <= 255);
});

/** A minimal sale record, enough for the order model and the rollup. */
const sale = (adjustments?: SaleAdjustment[]): SaleRecord => ({
  uuid: 'S1', type: 'sale', ts: '2026-10-11T02:00:00Z', registerId: 'r1', registerName: 'Front', staff: 'Sam',
  lines: [{ variantId: tad.id, title: 'P2', qty: 2, baseUnitCents: 400, grossCents: 800, discountCents: 100, netCents: 700, costCents: 100, discountLabels: ['Order price adjustment'], kind: 'item' }],
  itemsCents: 800, discountCents: 100, netCents: 700, tipCents: 0, totalCents: 700, cogsCents: 100, feesCents: 0, roundingCents: 0,
  tenders: [{ id: 't', kind: 'cash', amountCents: 700, tenderedCents: 700, at: '2026-10-11T02:00:00Z' }], deals: [{ type: 'orderadjust', label: 'Order price adjustment', cents: 100 }],
  ...(adjustments ? { adjustments } : {}),
});

test('the Shopify order carries the adjustments as pos_adjustments, only when there are some, and mapOrder reads them back', () => {
  const adj: SaleAdjustment[] = [{ kind: 'order', title: 'Whole order', detail: 'Total $7.00 (was $8.00)', cents: 100, reason: 'Regular customer' }];
  const { order } = buildOrderInput(sale(adj), { markFulfilled: false });
  const attr = order.customAttributes.find((a: any) => a.key === 'pos_adjustments');
  assert.ok(attr && attr.value.length <= 255);
  assert.equal(buildOrderInput(sale(), { markFulfilled: false }).order.customAttributes.some((a: any) => a.key === 'pos_adjustments'), false);
  const o = mapOrder({
    id: 'gid://shopify/Order/1', name: '#1001', createdAt: '2026-10-11T02:00:00Z', displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'FULFILLED', note: null, tags: order.tags,
    totalPriceSet: { shopMoney: { amount: '7.00' } }, totalRefundedSet: { shopMoney: { amount: '0.00' } }, customer: null, customAttributes: order.customAttributes,
    lineItems: { nodes: [] }, transactions: [],
  });
  assert.deepEqual(o.adjustments?.map(a => [a.kind, a.cents, a.reason]), [['order', 100, 'Regular customer']]);
});

test('Reports: adjustments are added up by reason (case and spacing ignored), refunds add none, and old stored totals still work', () => {
  const a = (reason: string | undefined, cents: number): SaleAdjustment => ({ kind: 'line', title: 'x', detail: '', cents, reason });
  let t = emptyTotals();
  t = applyRecord(t, { ...sale([a('Damaged box', 300), a('damaged  BOX', 200), a(undefined, 100), a('Price match', -50)]), uuid: 'A' });
  t = applyRecord(t, { ...sale([a('Price match', 400)]), uuid: 'B' });
  t = applyRecord(t, { ...sale([a('Price match', 400)]), uuid: 'B' }); // idempotent
  const s = adjustmentSummary(t);
  assert.deepEqual(s.rows, [{ key: 'price match', count: 2, cents: 350 }, { key: 'damaged box', count: 2, cents: 500 }, { key: '', count: 1, cents: 100 }].sort((x, y) => Math.abs(y.cents) - Math.abs(x.cents)));
  assert.equal(s.count, 5);
  assert.equal(s.cents, 950);
  assert.deepEqual(adjustmentSummary(contribution({ ...sale(), type: 'refund' })).rows, []);
  const old = { ...emptyTotals() } as any; delete old.byAdjustReason; // totals stored before this existed
  assert.deepEqual(adjustmentSummary(old).rows, []);
  assert.deepEqual(adjustmentSummary(merge(old, t)).rows.length, 3);
  assert.equal(derived(t).discounts, t.discountsCents); // the Discounts figure is not changed by any of this
});
