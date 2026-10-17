// Location: tests/cartwarnings.test.ts
// Cart warnings: which warnings a cart sets off, their order, the "seen on this sale" memory, and always-show.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addVariant } from '../src/lib/cartOps';
import { matchCartWarnings, normaliseScope, pendingCartWarnings, triggerNames, unacknowledged, warningKey, warningTitle, type CartWarningCatalog } from '../src/lib/cartWarnings';
import type { Cart, CartLine, CartWarning, Variant } from '../src/lib/types';
import { SPOT, isKnownSpot } from '../src/lib/trainingSpots';
import { SPOT_SCREEN } from '../src/lib/appControls';

const P = (n: number) => `gid://shopify/Product/${n}`;
const V = (n: number) => `gid://shopify/ProductVariant/${n}`;
const variant = (id: number, prod: number, title: string, variantTitle = ''): Variant => ({ id: V(id), productId: P(prod), productTitle: title, variantTitle, priceCents: 1000, tracked: true, stock: 9, tags: [], active: true });
const dragonS = variant(1, 1, 'Mini Dragon', 'Small'), dragonL = variant(2, 1, 'Mini Dragon', 'Large'), cow = variant(3, 2, 'Highland Cow'), tad = variant(4, 3, 'Tadling');
const catalog: CartWarningCatalog = { variants: { [dragonS.id]: dragonS, [dragonL.id]: dragonL, [cow.id]: cow, [tad.id]: tad }, collectionsOfProduct: { [P(1)]: ['col-articulated'], [P(2)]: ['col-cows'] } };
const warn = (over: Partial<CartWarning>): CartWarning => ({ id: 'w', enabled: true, title: 'Customer Warning', body: 'Joints are fragile.', scope: 'product', targetId: P(1), alwaysShow: false, requireAcknowledgement: false, ...over });
const cartOf = (...vs: Variant[]): Cart => vs.reduce((c, v) => addVariant(c, v, 1), { id: 'c', lines: [] } as Cart);
const gift: CartLine = { id: 'gift', kind: 'gift_card', title: 'Gift card', qty: 1, unitCents: 5000, noDiscount: true };

test('a product warning is set off by any variation of it', () => {
  const m = matchCartWarnings(cartOf(dragonL, cow), [warn({})], catalog);
  assert.equal(m.length, 1);
  assert.deepEqual(triggerNames(m[0]), ['Mini Dragon']);
});

test('a variation warning only fires for that variation', () => {
  const w = warn({ scope: 'variant', targetId: dragonS.id });
  assert.equal(matchCartWarnings(cartOf(dragonL), [w], catalog).length, 0);
  assert.equal(matchCartWarnings(cartOf(dragonS), [w], catalog).length, 1);
});

test('a category (collection) warning fires for products in it, and "category" means collection', () => {
  const w = warn({ scope: 'collection', targetId: 'col-articulated' });
  assert.equal(matchCartWarnings(cartOf(dragonS), [w], catalog).length, 1);
  assert.equal(matchCartWarnings(cartOf(cow), [w], catalog).length, 0);
  assert.equal(matchCartWarnings(cartOf(dragonS), [{ ...w, scope: 'category' }], catalog).length, 1);
  assert.equal(normaliseScope('category'), 'collection');
});

test('nothing fires for an empty target, a warning that is off, or a cart without the item', () => {
  assert.equal(matchCartWarnings(cartOf(dragonS), [warn({ targetId: '' })], catalog).length, 0);
  assert.equal(matchCartWarnings(cartOf(dragonS), [warn({ enabled: false })], catalog).length, 0);
  assert.equal(matchCartWarnings(cartOf(cow, tad), [warn({})], catalog).length, 0);
  assert.equal(matchCartWarnings(cartOf(dragonS), undefined, catalog).length, 0);
});

test('gift cards and custom amounts never set a warning off', () => {
  const c: Cart = { id: 'c', lines: [gift] };
  assert.equal(matchCartWarnings(c, [warn({ scope: 'variant', targetId: gift.id })], catalog).length, 0);
});

test('a warning set to always show applies to every sale, with no items needed', () => {
  const w = warn({ alwaysShow: true, targetId: '' });
  const m = matchCartWarnings(cartOf(cow), [w], catalog);
  assert.equal(m.length, 1);
  assert.deepEqual(triggerNames(m[0]), []);
});

test('several lines of the same warning are listed once each by name', () => {
  const m = matchCartWarnings(cartOf(dragonS, dragonL), [warn({})], catalog);
  assert.equal(m[0].matches.length, 2);
  assert.deepEqual(triggerNames(m[0]), ['Mini Dragon']);
});

test('warnings come in order, ties in the order they were added', () => {
  const a = warn({ id: 'a', targetId: P(2) }), b = warn({ id: 'b', order: -1 }), c = warn({ id: 'c', targetId: P(3) });
  assert.deepEqual(matchCartWarnings(cartOf(dragonS, cow, tad), [a, b, c], catalog).map(m => m.warning.id), ['b', 'a', 'c']);
});

test('a warning already carried on from is not asked again, unless it changed or is set to always show', () => {
  const w = warn({});
  const first = matchCartWarnings(cartOf(dragonS), [w], catalog);
  const seen = first.map(warningKey);
  assert.equal(pendingCartWarnings(first, []).length, 1);
  assert.equal(pendingCartWarnings(first, seen).length, 0, 'seen on this sale');
  assert.equal(pendingCartWarnings(matchCartWarnings(cartOf(dragonS), [{ ...w, body: 'New text.' }], catalog), seen).length, 1, 'edited text comes back');
  assert.equal(pendingCartWarnings(matchCartWarnings(cartOf(dragonS, dragonL), [w], catalog), seen).length, 1, 'another line sets it off');
  const always = matchCartWarnings(cartOf(cow), [warn({ id: 'x', alwaysShow: true, targetId: '' })], catalog);
  assert.equal(pendingCartWarnings(always, always.map(warningKey)).length, 1, 'always shows on every Charge');
});

test('only warnings that must be ticked hold the cashier up, and ticking clears them', () => {
  const m = matchCartWarnings(cartOf(dragonS, cow), [warn({ id: 'a', requireAcknowledgement: true }), warn({ id: 'b', targetId: P(2) }), warn({ id: 'c', targetId: P(2), requireAcknowledgement: true })], catalog);
  assert.deepEqual(unacknowledged(m, []).map(x => x.warning.id), ['a', 'c']);
  assert.deepEqual(unacknowledged(m, [warningKey(m[0])]).map(x => x.warning.id), ['c']);
  assert.deepEqual(unacknowledged(m, m.map(warningKey)), []);
});

test('a blank header shows as Customer Warning', () => {
  assert.equal(warningTitle({ title: '   ' }), 'Customer Warning');
  assert.equal(warningTitle({ title: 'Fragile' }), 'Fragile');
});

// The window: the popup is the warning itself, paged like Show (0145). These read the source, like the spot tests do.
const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

test('the popup keeps every control as a spot on the warning window, including Back to cart', () => {
  for (const id of [SPOT.warningBack, SPOT.warningNext, SPOT.warningAcknowledge, SPOT.warningContinue, SPOT.warningCancel]) { assert.ok(isKnownSpot(id), id); assert.equal(SPOT_SCREEN[id], 'sheet_cart_warnings', id); }
  assert.match(src('src/app.navgraph'), /sheet_cart_warnings -> page_cart .*"target": "warning\.cancel"/);
});

test('the popup uses the shared dots, is a Sheet popup (so it keeps the open gap and Training layer) and has no card inside it', () => {
  const sheet = src('src/screens/CartWarningsSheet.tsx');
  assert.match(sheet, /<Sheet [^>]*\bpopup\b[^>]*screen="sheet_cart_warnings"/);
  assert.match(sheet, /<PageDots /); assert.doesNotMatch(sheet, /<Card\b/); assert.doesNotMatch(sheet, /<Modal\b/);
  assert.match(src('src/screens/TrainingRun.tsx'), /<PageDots /);
  const kit = src('src/ui/kit.tsx'); assert.match(kit, /export function PageDots/); assert.match(kit, /popup \? 'fade' : 'slide'/);
});

test('Next becomes Continue to payment on the last warning, on the same spots as before', () => {
  const sheet = src('src/screens/CartWarningsSheet.tsx');
  assert.match(sheet, /spot=\{SPOT\.warningNext\} title="Next"/); assert.match(sheet, /spot=\{SPOT\.warningContinue\} title="Continue to payment" disabled=\{need\.length > 0\}/);
});
