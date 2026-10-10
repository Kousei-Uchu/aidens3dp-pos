// Location: tests/lookup.test.ts
// 0017: Price check, Stock check, the in-grid variation picker and the Lock POS rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dealsFor, pickerCrumbs, pickerTitle, pickerVariants, priceCheck, resolveScan, scanProblem, searchVariants, stockCheck, stockText, stockToneOf } from '../src/lib/lookup';
import { isLockScreen, lockDecision } from '../src/lib/posLock';
import { newBadgeCode } from '../src/lib/badge';
import { ACTIONS, ACTION_LABEL, parseGrid } from '../src/lib/grid';
import type { AutoDiscount, BundleConfig, Variant } from '../src/lib/types';

let n = 0;
const V = (o: Partial<Variant> & { productId: string; productTitle: string }): Variant => ({ id: `gid://v${++n}`, variantTitle: '', priceCents: 1000, tracked: true, stock: 5, tags: [], active: true, ...o });
const cow = (t: string, stock: number | null, extra: Partial<Variant> = {}) => V({ productId: 'p-cow', productTitle: 'Highland cow', variantTitle: t, stock, priceCents: 1500, ...extra });
const small = cow('Small', 3, { barcode: '9300000000011' }), large = cow('Large', 0, { barcode: '9300000000028' }), giant = cow('Giant', -2), plain = cow('Plain', null);
const tad = V({ productId: 'p-tad', productTitle: 'Tadling', stock: 12, barcode: '9300000000035', sku: 'TAD-1' });
const all = [small, large, giant, plain, tad];

// ── scan resolution ──
test('resolveScan: a barcode finds the variant, with or without leading zeros', () => {
  const r = resolveScan('9300000000011', all); assert.equal(r.kind === 'variant' && r.variant.id, small.id);
  const z = resolveScan('009300000000011', all); assert.equal(z.kind === 'variant' && z.variant.id, small.id);
  const s = resolveScan('tad-1', all); assert.equal(s.kind === 'variant' && s.variant.id, tad.id); // SKU, any case
});
test('resolveScan: cashier passes and gift card QRs are named, not "no item"', () => {
  assert.equal(resolveScan(newBadgeCode(), all).kind, 'pass');
  assert.equal(resolveScan('shopify-giftcard-v1-ABCD1234', all).kind, 'gift');
  assert.equal(resolveScan('nothing-like-this', all).kind, 'none');
  assert.match(scanProblem(resolveScan(newBadgeCode(), all), 'x')!, /cashier pass/);
  assert.match(scanProblem(resolveScan('shopify-giftcard-v1-AB', all), 'x')!, /gift card/);
  assert.equal(scanProblem(resolveScan('nothing', all), '  nothing '), 'No item for nothing');
  assert.equal(scanProblem(resolveScan('9300000000011', all), 'x'), null);
});
test('resolveScan: a real item whose barcode looks like a pass is still an item', () => {
  const odd = V({ productId: 'p-odd', productTitle: 'Odd', barcode: 'P0123456789AB' });
  assert.equal(resolveScan('P0123456789AB', [odd]).kind, 'variant');
});

// ── stock check ──
test('stockCheck: scanned variation first, then its siblings; scanned never repeated', () => {
  const r = stockCheck(large, [small, large, giant, plain]);
  assert.deepEqual(r.rows.map(x => x.variant.variantTitle), ['Large', 'Small', 'Giant', 'Plain']);
  assert.deepEqual(r.rows.map(x => x.isScanned), [true, false, false, false]);
  assert.equal(r.single, false); assert.equal(r.title, 'Highland cow');
});
test('stockCheck: total counts tracked stock only, negatives count as 0, untracked are reported', () => {
  const r = stockCheck(small, [small, large, giant, plain]);
  assert.equal(r.totalTracked, 3); // 3 + 0 + max(0,-2); Plain is not tracked
  assert.equal(r.untracked, 1);
  assert.equal(stockCheck(plain, [plain]).totalTracked, null);
});
test('stockCheck: a plain item with no siblings shows only itself', () => {
  const r = stockCheck(tad, [tad]); assert.equal(r.single, true); assert.equal(r.rows.length, 1); assert.equal(r.totalTracked, 12);
});
test('stockCheck: a scanned draft variation missing from the catalogue list is still included, and other products are ignored', () => {
  const draft = cow('Draft', 1, { active: false });
  const r = stockCheck(draft, [small, tad]); // tad belongs to another product
  assert.deepEqual(r.rows.map(x => x.variant.id), [draft.id, small.id]);
});
test('stock wording and tone', () => {
  assert.equal(stockText(null), 'Not tracked'); assert.equal(stockText(0), 'Out of stock'); assert.equal(stockText(4), '4 in stock'); assert.equal(stockText(-2), '2 oversold');
  assert.deepEqual([null, -1, 0, 1, 2, 3].map(stockToneOf), ['none', 'neg', 'out', 'low', 'low', 'ok']);
});

// ── price check ──
const bxgy: AutoDiscount = { id: 'a1', title: 'Buy 2 cows', kind: 'bxgy', buys: { target: { productIds: ['p-cow'] }, qty: 2 }, gets: { target: { productIds: ['p-cow'] }, qty: 1, pct: 50 } };
const coll: AutoDiscount = { id: 'a2', title: 'Dragon week', kind: 'basic', pct: 10, target: { collectionIds: ['c-dragon'] } };
const ended: AutoDiscount = { id: 'a3', title: 'Old sale', kind: 'basic', pct: 20, target: { all: true }, endsAt: '2020-01-01T00:00:00Z' };
const future: AutoDiscount = { id: 'a4', title: 'Soon', kind: 'basic', pct: 20, target: { all: true }, startsAt: '2999-01-01T00:00:00Z' };
const bundles: BundleConfig = { version: 1, items: { cows: ['p-cow'], onlyLarge: [large.id], tads: ['p-tad'] },
  discounts: [{ id: 'b1', label: '2 cows $2 off', sets: ['cows', 'cows'], price_delta_cents: -200 }, { id: 'b2', label: 'Large cow + Tadling', sets: ['onlyLarge', 'tads'], price_delta_cents: -300 }, { id: 'b3', label: 'Off bundle', sets: ['cows'], price_delta_cents: -100, enabled: false }] };
test('dealsFor: lists live automatic discounts and bundles that include the variation, nothing else', () => {
  const d = dealsFor(small, { autos: [bxgy, coll, ended, future], bundles, collectionIds: [], now: Date.UTC(2026, 9, 10) });
  assert.deepEqual(d.map(x => x.label), ['Buy 2 cows', '2 cows $2 off']); // collection deal misses, ended/future skipped, disabled bundle skipped, Large-only bundle skipped
  const l = dealsFor(large, { autos: [coll], bundles, collectionIds: ['c-dragon'], now: Date.UTC(2026, 9, 10) });
  assert.deepEqual(l.map(x => x.label), ['Dragon week', '2 cows $2 off', 'Large cow + Tadling']);
  assert.deepEqual(l.map(x => x.kind), ['auto', 'bundle', 'bundle']);
});
test('dealsFor: a no-discount item has no deals, and says so', () => {
  const nd = cow('NoDisc', 1, { tags: ['no-discount'] });
  assert.deepEqual(dealsFor(nd, { autos: [bxgy], bundles, collectionIds: [] }), []);
  assert.equal(priceCheck(nd, { autos: [bxgy], bundles, collectionIds: [] }).excluded, true);
});
test('priceCheck: price, and a "was" price only when compare-at is higher', () => {
  const on = priceCheck(cow('Sale', 1, { priceCents: 1200, compareAtCents: 1800 }), { autos: [], bundles: null, collectionIds: [] });
  assert.equal(on.priceCents, 1200); assert.equal(on.wasCents, 1800);
  assert.equal(priceCheck(cow('Same', 1, { priceCents: 1200, compareAtCents: 1200 }), { autos: [], bundles: null, collectionIds: [] }).wasCents, undefined);
  assert.equal(priceCheck(small, { autos: [], bundles: null, collectionIds: [] }).deals.length, 0);
});

// ── search ──
test('searchVariants: every word must match, one row per product, empty query gives nothing', () => {
  assert.deepEqual(searchVariants(all, 'cow giant').map(v => v.variantTitle), ['Giant']);
  assert.equal(searchVariants(all, 'cow').length, 1); // one row for the cow product
  assert.deepEqual(searchVariants(all, 'tad-1').map(v => v.id), [tad.id]);
  assert.deepEqual(searchVariants(all, '   '), []);
  assert.equal(searchVariants(Array.from({ length: 100 }, (_, i) => V({ productId: `p${i}`, productTitle: 'Thing' })), 'thing').length, 30);
});

// ── in-grid variation picker ──
test('picker: path is the grid path plus the product; title falls back sensibly; duplicate ids are dropped', () => {
  const crumbs = [{ label: 'Home', path: [] as number[] }, { label: 'Dragons', path: [0] }];
  const t = pickerCrumbs(crumbs, [small, large]);
  assert.deepEqual(t.map(x => x.label), ['Home', 'Dragons', 'Highland cow']);
  assert.equal('here' in t[2], true); assert.equal('here' in t[1], false);
  assert.equal(pickerTitle([]), 'Choose variation');
  assert.deepEqual(pickerVariants([small, small, large]).map(v => v.id), [small.id, large.id]);
});

// ── Lock POS ──
test('lockDecision: needs staff, refuses mid card payment or when already locked, otherwise ok', () => {
  assert.deepEqual(lockDecision({ staffCount: 2, unlocked: true, paymentActive: false }), { ok: true });
  const none = lockDecision({ staffCount: 0, unlocked: true, paymentActive: false }); assert.equal(none.ok, false); assert.match((none as any).message, /More ▸ Staff/);
  const pay = lockDecision({ staffCount: 2, unlocked: true, paymentActive: true }); assert.equal(pay.ok, false); assert.equal((pay as any).title, 'Payment in progress');
  assert.equal(lockDecision({ staffCount: 2, unlocked: false, paymentActive: false }).ok, false);
  assert.equal(lockDecision({ staffCount: 0, unlocked: true, paymentActive: true }).ok, false);
});
test('isLockScreen: only when staff exist and nobody is signed in (works without "Require PIN")', () => {
  assert.equal(isLockScreen({ staffCount: 1, unlocked: false }), true);
  assert.equal(isLockScreen({ staffCount: 1, unlocked: true }), false);
  assert.equal(isLockScreen({ staffCount: 0, unlocked: false }), false);
});

// ── layout ──
test('grid: the three new actions load from grid.json, have labels, and an older layout still loads untouched', () => {
  for (const a of ['lock_pos', 'price_check', 'stock_check', 'check_change'] as const) { assert.ok(ACTIONS.includes(a)); assert.ok(ACTION_LABEL[a]); }
  const g = parseGrid({ version: 1, pages: [{ id: 'p', name: 'Home', tiles: [{ type: 'action', action: 'lock_pos' }, { type: 'action', action: 'price_check', label: 'Price?' }, { type: 'action', action: 'stock_check' }, { type: 'action', action: 'nope' }] }] });
  assert.equal(g.grid.pages[0].tiles.length, 3); assert.equal(g.dropped, 1);
  assert.equal(parseGrid({ version: 1, pages: [{ id: 'p', name: 'Home', tiles: [{ type: 'action', action: 'clear_cart' }] }] }).dropped, 0);
});
