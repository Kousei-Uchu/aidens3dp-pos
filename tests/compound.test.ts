// Location: tests/compound.test.ts
// A12: compound per-unit discounts. Each physical unit receives at most one deal, several deals can apply in one
// order, and the combination that saves the customer the most wins.
import test from 'node:test';
import assert from 'node:assert/strict';
import { priceCart, type PricingContext } from '../src/lib/pricing';
import { parseBundleConfig } from '../src/lib/bundles';
import type { Cart, CartLine, Variant } from '../src/lib/types';

const P = (n: number) => `gid://shopify/Product/${n}`;
const V = (n: number) => `gid://shopify/ProductVariant/${n}`;
const variant = (id: number, prod: number, cents: number): Variant => ({
  id: V(id), productId: P(prod), productTitle: `P${prod}`, variantTitle: '', priceCents: cents, tracked: true, stock: 50, tags: [], active: true,
});
const line = (v: Variant, qty = 1): CartLine => ({ id: `l-${v.id}`, kind: 'item', variantId: v.id, title: v.productTitle, qty, unitCents: v.priceCents });
const ctxFor = (vs: Variant[], deals: unknown[]): PricingContext => ({
  variants: Object.fromEntries(vs.map(v => [v.id, v])), collectionsOfProduct: {}, autoDiscounts: [], now: Date.now(),
  bundles: parseBundleConfig(JSON.stringify({ version: 1, items: { cow: [P(1)], tad: [P(2)] }, discounts: deals })).cfg!,
});
const cart = (lines: CartLine[]): Cart => ({ id: 'c', lines });

// 2 highland cows: $2 off. 3 Tadlings: $5 off. 5 Tadlings: $10 off.
const DEALS = [
  { id: 'cows2', label: '2 cows', sets: ['cow', 'cow'], price_delta_cents: -200 },
  { id: 'tad3', label: '3 Tadlings', sets: ['tad', 'tad', 'tad'], price_delta_cents: -500 },
  { id: 'tad5', label: '5 Tadlings', sets: ['tad', 'tad', 'tad', 'tad', 'tad'], price_delta_cents: -1000 },
];
const cow = variant(1, 1, 1500), tad = variant(2, 2, 700);
const ctx = ctxFor([cow, tad], DEALS);
const dealCents = (p: ReturnType<typeof priceCart>, label: string) => p.deals.find(d => d.label === label)?.cents ?? 0;

test('the example: 2 cows + 8 Tadlings = $2 + $10 + $5', () => {
  const p = priceCart(cart([line(cow, 2), line(tad, 8)]), ctx);
  assert.equal(dealCents(p, '2 cows'), 200);
  assert.equal(dealCents(p, '5 Tadlings'), 1000);
  assert.equal(dealCents(p, '3 Tadlings'), 500);
  assert.equal(p.discountCents, 1700);
});

test('each unit gets one deal only: line discounts never exceed the line value and units are not reused', () => {
  const p = priceCart(cart([line(cow, 2), line(tad, 8)]), ctx);
  const tadLine = p.lines.find(l => l.line.variantId === tad.id)!;
  assert.equal(tadLine.bundleUnits, 8); // 5 + 3, no unit counted twice
  assert.equal(tadLine.discountCents, 1500);
  assert.equal(p.netCents, 2 * 1500 + 8 * 700 - 1700);
});

test('6 Tadlings use ONE 5-unit deal, not two 3-unit deals (same $10, fewer lots)', () => {
  const p = priceCart(cart([line(tad, 6)]), ctx);
  assert.equal(p.discountCents, 1000);
  assert.equal(dealCents(p, '5 Tadlings'), 1000);
  assert.equal(dealCents(p, '3 Tadlings'), 0);
  assert.equal(p.lines[0].bundleUnits, 5);
});

test('7 Tadlings: 5-deal beats 3+3 ($10 vs $10, fewer lots wins), leftover unit pays full price', () => {
  const p = priceCart(cart([line(tad, 7)]), ctx);
  assert.equal(p.discountCents, 1000);
  assert.equal(p.lines[0].bundleUnits, 5);
});

test('9 Tadlings: 5 + 3 ($15) beats 3+3+3 ($15 tie) and keeps lots to a minimum', () => {
  const p = priceCart(cart([line(tad, 9)]), ctx);
  assert.equal(p.discountCents, 1500);
  assert.equal(dealCents(p, '5 Tadlings'), 1000);
});

test('10 Tadlings: two 5-deals ($20) beat 5 + 3 + leftover', () => {
  const p = priceCart(cart([line(tad, 10)]), ctx);
  assert.equal(p.discountCents, 2000);
});

test('3 Tadlings only: just the 3-deal; 4 Tadlings: still the 3-deal and one full price', () => {
  assert.equal(priceCart(cart([line(tad, 3)]), ctx).discountCents, 500);
  assert.equal(priceCart(cart([line(tad, 4)]), ctx).discountCents, 500);
});

test('units split across several cart lines (two variants of one product) still combine', () => {
  const tadB = variant(3, 2, 900);
  const c2 = ctxFor([cow, tad, tadB], DEALS);
  const p = priceCart(cart([line(tad, 4), line(tadB, 4)]), c2);
  assert.equal(p.discountCents, 1500); // 8 units: 5 + 3
});

test('a manual line discount is blocked on lines that received a deal (existing rule kept)', () => {
  const l = { ...line(tad, 3), discount: { kind: 'pct' as const, value: 50, label: 'half' } };
  const p = priceCart(cart([l]), ctx);
  assert.equal(p.discountCents, 500);
});
