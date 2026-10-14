// Location: tests/trainingpriceadjust.test.ts
// The "Change a price" course: valid, registered, each goal is won only by the right price, and the practice scenarios behave as the course says
// (checked with the app's own pricing and adjustment-review code).
import test from 'node:test';
import assert from 'node:assert/strict';
import { priceAdjust } from '../src/training/modules/price-adjust';
import { MODULES, getModule } from '../src/training';
import { validateModule, type TrainSnap } from '../src/lib/trainingModule';
import { isKnownSpot } from '../src/lib/trainingSpots';
import { isMet, noEvents, snapOf } from '../src/lib/trainingConds';
import { FIXTURE_VARIANTS, applyInjections, buildSandbox } from '../src/lib/trainingSandbox';
import { priceCart } from '../src/lib/pricing';
import { adjustmentRows, keepRow, removeRow, unresolvedRows } from '../src/lib/adjustReview';
import { setItemPrice } from '../src/lib/cartOps';

const real: any = { settings: { staff: [], requirePin: false, receipt: {} }, data: {}, grid: {}, gridVersion: 0, pos: {}, sync: {}, zeller: {}, staffId: undefined, unlocked: true };
const pricer = (cart: any) => priceCart(cart, { variants: Object.fromEntries(FIXTURE_VARIANTS.map(v => [v.id, v])), collectionsOfProduct: {}, autoDiscounts: [], bundles: null });
type Ln = { variantId: string; over?: number; all?: boolean; adjust?: number };
const snap = (o: { lines?: Ln[]; draft?: string; order?: number; sheets?: number; paying?: boolean } = {}): TrainSnap =>
  snapOf({ tab: 'checkout', route: o.paying ? 'pay' : '', sheets: o.sheets ?? 0, priceDraft: o.draft, cart: { lines: (o.lines ?? []).map(l => ({ variantId: l.variantId, title: l.variantId, kind: 'item' as const, qty: 1, id: l.variantId, overrideCents: l.over, overrideAll: l.all, adjust: l.adjust !== undefined ? { finalCents: l.adjust } : undefined })), orderAdjust: o.order !== undefined ? { finalCents: o.order } : undefined }, sales: 0, paying: !!o.paying });
const until = (list: any[], id: string) => list.find(x => x.id === id).until;
const won = (list: any[], id: string, s: TrainSnap) => isMet(until(list, id), s, noEvents());
const DRAGON = 'train-v-dragon'; const BEE = 'train-v-bee'; const STK = 'train-v-sticker';

test('the course is registered after discounts and is valid', () => {
  assert.equal(getModule('price-adjust'), priceAdjust); assert.ok(MODULES.findIndex(m => m.id === 'price-adjust') > MODULES.findIndex(m => m.id === 'discounts'));
  assert.deepEqual(validateModule(priceAdjust, isKnownSpot), []); assert.ok(priceAdjust.routes.includes('pay'));
});
test('Guide steps finish on what has been keyed and set', () => {
  assert.ok(!won(priceAdjust.guide, 'g-item-keys', snap({ draft: 'item:60' }))); assert.ok(won(priceAdjust.guide, 'g-item-keys', snap({ draft: 'item:600' }))); assert.ok(!won(priceAdjust.guide, 'g-item-keys', snap({ draft: 'line:600' })), 'the other window does not count');
  assert.ok(!won(priceAdjust.guide, 'g-item-set', snap({ lines: [{ variantId: BEE, over: 600 }] }))); assert.ok(won(priceAdjust.guide, 'g-item-set', snap({ lines: [{ variantId: BEE, over: 600, all: true }] })));
  assert.ok(!won(priceAdjust.guide, 'g-item-reset', snap({ lines: [{ variantId: BEE, over: 600, all: true }] }))); assert.ok(won(priceAdjust.guide, 'g-item-reset', snap({ lines: [{ variantId: BEE }] })));
  assert.ok(won(priceAdjust.guide, 'g-line-keys', snap({ draft: 'line:2000' }))); assert.ok(won(priceAdjust.guide, 'g-line-set', snap({ lines: [{ variantId: DRAGON, adjust: 2000 }] }))); assert.ok(won(priceAdjust.guide, 'g-line-rm', snap({ lines: [{ variantId: DRAGON }] })));
  assert.ok(won(priceAdjust.guide, 'g-order-keys', snap({ draft: 'order:3000' }))); assert.ok(!won(priceAdjust.guide, 'g-order-set', snap())); assert.ok(won(priceAdjust.guide, 'g-order-set', snap({ order: 3000 })));
  assert.ok(!won(priceAdjust.guide, 'g-continue', snap())); assert.ok(won(priceAdjust.guide, 'g-continue', snap({ paying: true })));
});
test('Check 1 goals are won only by the right price, with the window closed', () => {
  assert.ok(won(priceAdjust.check1, 'c1-item', snap({ lines: [{ variantId: DRAGON, over: 1800 }] }))); assert.ok(!won(priceAdjust.check1, 'c1-item', snap({ lines: [{ variantId: DRAGON, over: 1800 }], sheets: 1 }))); assert.ok(!won(priceAdjust.check1, 'c1-item', snap({ lines: [{ variantId: DRAGON, over: 1900 }] })));
  assert.ok(won(priceAdjust.check1, 'c1-line', snap({ lines: [{ variantId: BEE, adjust: 1200 }] }))); assert.ok(!won(priceAdjust.check1, 'c1-line', snap({ lines: [{ variantId: BEE, over: 1200 }] })), 'an item price is not a line price');
  assert.ok(won(priceAdjust.check1, 'c1-order', snap({ order: 3000 }))); assert.ok(!won(priceAdjust.check1, 'c1-order', snap({ order: 2900 })));
});
test('Check 2: the wrong-item problem starts in the cart and is won only by moving the price', () => {
  const g = priceAdjust.check2.find(x => x.id === 'c2-wrong-item')!; const cart = applyInjections(buildSandbox(real), g.inject).pos.cart;
  assert.equal(cart.lines.find(l => l.variantId === BEE)!.overrideCents, 600); assert.equal(cart.lines.find(l => l.variantId === DRAGON)!.overrideCents, undefined);
  assert.ok(!won(priceAdjust.check2, 'c2-wrong-item', snap({ lines: [{ variantId: BEE, over: 600 }, { variantId: DRAGON }] })));
  assert.ok(!won(priceAdjust.check2, 'c2-wrong-item', snap({ lines: [{ variantId: BEE }, { variantId: DRAGON }] })), 'taking it off is not enough');
  assert.ok(!won(priceAdjust.check2, 'c2-wrong-item', snap({ lines: [{ variantId: BEE, over: 600 }, { variantId: DRAGON, over: 2000 }] })), 'both priced is wrong');
  assert.ok(won(priceAdjust.check2, 'c2-wrong-item', snap({ lines: [{ variantId: BEE }, { variantId: DRAGON, over: 2000 }] })));
});
test('Check 2: "all in cart" really covers every Sticker Pack, including later ones', () => {
  const g = priceAdjust.check2.find(x => x.id === 'c2-all')!; let cart = applyInjections(buildSandbox(real), g.inject).pos.cart; const id = cart.lines[0].id;
  assert.equal(pricer(cart).netCents, 900, 'three at $3.00');
  cart = setItemPrice(cart, id, 200, { scope: 'all' }); assert.equal(pricer(cart).netCents, 600); assert.equal(cart.lines[0].overrideAll, true);
  assert.ok(won(priceAdjust.check2, 'c2-all', snap({ lines: [{ variantId: STK, over: 200, all: true }] }))); assert.ok(!won(priceAdjust.check2, 'c2-all', snap({ lines: [{ variantId: STK, over: 200 }] })), 'fixed quantity is not enough');
});
test('Check 2: the flagged-price scenario really is flagged at the review, and Keep or Remove clears it', () => {
  const g = priceAdjust.check2.find(x => x.id === 'c2-flagged')!; const cart = applyInjections(buildSandbox(real), g.inject).pos.cart; const bee = cart.lines[0];
  assert.equal(bee.qty, 2); assert.equal(bee.adjust?.finalCents, 600);
  const rows = adjustmentRows(cart, pricer(cart)); assert.equal(rows.length, 1); assert.equal(unresolvedRows(rows).length, 1, 'the price needs a second look');
  const kept = keepRow(cart, pricer(cart), rows[0]); assert.equal(unresolvedRows(adjustmentRows(kept, pricer(kept))).length, 0);
  const gone = removeRow(cart, rows[0]); assert.equal(adjustmentRows(gone, pricer(gone)).length, 0);
  assert.ok(!won(priceAdjust.check2, 'c2-flagged', snap())); assert.ok(won(priceAdjust.check2, 'c2-flagged', snap({ paying: true })));
});
test('the Guide order is clean: nothing is flagged when the course reaches the review', () => {
  let cart = applyInjections(buildSandbox(real), [{ kind: 'cart', items: [{ variantId: DRAGON, qty: 1 }, { variantId: BEE, qty: 1 }] }]).pos.cart;
  cart = { ...cart, orderAdjust: { finalCents: 3000, seenQty: 2, seenBeforeCents: pricer(cart).netCents } };
  const rows = adjustmentRows(cart, pricer(cart)); assert.equal(rows.length, 1); assert.equal(unresolvedRows(rows).length, 0, 'the review shows it but does not flag it');
});
test('Check 2 problems are injected, and each says where it was taught', () => {
  for (const g of priceAdjust.check2) { assert.ok(g.inject?.length && g.taughtBy, g.id); assert.ok([...priceAdjust.info.steps, ...priceAdjust.show.steps, ...priceAdjust.guide].some(s => s.id === g.taughtBy), `${g.id} names a real step`); }
});
