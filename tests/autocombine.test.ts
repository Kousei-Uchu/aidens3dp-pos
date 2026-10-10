// Location: tests/autocombine.test.ts
// A12.4 to A12.6: several Shopify automatic discounts can combine in one order. Each unit takes at most one discount,
// the same discount can repeat, and the combination with the biggest total saving wins.
import test from 'node:test';
import assert from 'node:assert/strict';
import { priceCart, type PricingContext } from '../src/lib/pricing';
import type { AutoDiscount, Cart, CartLine, Variant } from '../src/lib/types';

const P = (n: number) => `gid://shopify/Product/${n}`;
const V = (n: number) => `gid://shopify/ProductVariant/${n}`;
const variant = (id: number, prod: number, cents: number): Variant => ({
  id: V(id), productId: P(prod), productTitle: `P${prod}`, variantTitle: '', priceCents: cents, tracked: true, stock: 99, tags: [], active: true,
});
const line = (v: Variant, qty: number): CartLine => ({ id: `l-${v.id}`, kind: 'item', variantId: v.id, title: v.productTitle, qty, unitCents: v.priceCents });
const cart = (lines: CartLine[]): Cart => ({ id: 'c', lines });

const cow = variant(1, 1, 1500), tad = variant(2, 2, 400);
const mk = (autos: AutoDiscount[], vs = [cow, tad], extra: Partial<PricingContext> = {}): PricingContext => ({
  variants: Object.fromEntries(vs.map(v => [v.id, v])), collectionsOfProduct: {}, autoDiscounts: autos, bundles: null, now: Date.now(), ...extra,
});
const t = (productId: string) => ({ productIds: [productId] });

// "Amount off when you buy N" style deals
const cows2: AutoDiscount = { id: 'cows2', title: '2 cows', kind: 'basic', amtCents: 200, minQty: 2, target: t(P(1)) };
const tad3: AutoDiscount = { id: 'tad3', title: '3x Tadlings', kind: 'basic', amtCents: 500, minQty: 3, target: t(P(2)) };
const tad5: AutoDiscount = { id: 'tad5', title: '5x Tadlings', kind: 'basic', amtCents: 1000, minQty: 5, target: t(P(2)) };
const AUTOS = [cows2, tad3, tad5];
const off = (p: ReturnType<typeof priceCart>, label: string) => p.deals.find(d => d.label === label)?.cents ?? 0;

test('8 Tadlings get the 5x deal AND the 3x deal', () => {
  const p = priceCart(cart([line(tad, 8)]), mk(AUTOS));
  assert.equal(off(p, '5x Tadlings'), 1000);
  assert.equal(off(p, '3x Tadlings'), 500);
  assert.equal(p.discountCents, 1500);
});

test('5 Tadlings + 2 cows get both the Tadling deal and the cow deal', () => {
  const p = priceCart(cart([line(tad, 5), line(cow, 2)]), mk(AUTOS));
  assert.equal(off(p, '5x Tadlings'), 1000);
  assert.equal(off(p, '2 cows'), 200);
  assert.equal(p.discountCents, 1200);
});

test('6 Tadlings use one 5x deal, not two 3x deals', () => {
  const p = priceCart(cart([line(tad, 6)]), mk(AUTOS));
  assert.equal(off(p, '5x Tadlings'), 1000);
  assert.equal(off(p, '3x Tadlings'), 0);
});

test('the same deal repeats: 10 Tadlings = two 5x, 13 Tadlings = two 5x + one 3x, tagged with how many times', () => {
  assert.equal(priceCart(cart([line(tad, 10)]), mk(AUTOS)).discountCents, 2000);
  const p = priceCart(cart([line(tad, 13)]), mk(AUTOS));
  assert.equal(p.discountCents, 2500);
  const l = p.lines[0];
  assert.equal(l.discounts.find(d => d.id === 'tad5')?.times, 2);
  assert.equal(l.discounts.find(d => d.id === 'tad3')?.times, undefined);
  assert.equal(l.discountCents, 2500);
});

test('no unit is used twice: discounts never exceed what the units are worth', () => {
  const p = priceCart(cart([line(tad, 8)]), mk(AUTOS));
  assert.ok(p.discountCents <= 8 * 400);
  assert.equal(p.netCents, 8 * 400 - 1500);
});

test('a lower deal still wins a leftover when a bigger one would waste units (7 units, 5x $10 / 3x $5.50)', () => {
  const odd: AutoDiscount = { ...tad3, id: 'odd3', title: '3x special', amtCents: 550 };
  const p = priceCart(cart([line(tad, 7)]), mk([tad5, odd]));
  assert.equal(p.discountCents, 1100); // two 3x lots ($11) beat one 5x ($10)
});

test('different lines for the same product (two variants) still combine into lots', () => {
  const tadB = variant(3, 2, 600);
  const p = priceCart(cart([line(tad, 4), line(tadB, 4)]), mk(AUTOS, [cow, tad, tadB]));
  assert.equal(p.discountCents, 1500); // 8 units: 5x + 3x
});

test('percentage deals keep their old meaning: every eligible unit once, not lots', () => {
  const pct: AutoDiscount = { id: 'pct', title: '10% off 3+', kind: 'basic', pct: 10, minQty: 3, target: t(P(2)) };
  const p = priceCart(cart([line(tad, 5)]), mk([pct]));
  assert.equal(p.discountCents, 200); // 10% of 5 x $4
});

test('buy X get Y still repeats and combines with a different deal on other items', () => {
  const b2g1: AutoDiscount = { id: 'b2g1', title: 'Buy 2 get 1 free', kind: 'bxgy', buys: { target: t(P(2)), qty: 2 }, gets: { target: t(P(2)), qty: 1, pct: 100 } };
  const p = priceCart(cart([line(tad, 6), line(cow, 2)]), mk([b2g1, cows2]));
  assert.equal(off(p, 'Buy 2 get 1 free'), 800); // 6 units = two sets, two free
  assert.equal(off(p, '2 cows'), 200);
});

test('lot behaviour can be switched off (Shopify-style once-per-order amount)', () => {
  const p = priceCart(cart([line(tad, 10)]), mk([tad5], [cow, tad], { lotDiscounts: false }));
  assert.equal(p.discountCents, 1000);
});

test('inactive or expired discounts are ignored', () => {
  const old: AutoDiscount = { ...tad5, endsAt: '2000-01-01T00:00:00Z' };
  assert.equal(priceCart(cart([line(tad, 5)]), mk([old])).discountCents, 0);
});
