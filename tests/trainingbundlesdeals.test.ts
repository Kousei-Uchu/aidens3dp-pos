// Location: tests/trainingbundlesdeals.test.ts
// The "How deals show up" course: registered, valid, the practice deals really price the way the course says, and each step and goal is finished by the right thing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bundlesDeals } from '../src/training/modules/bundles-deals';
import { MODULES, getModule } from '../src/training';
import { validateModule, type TrainSnap } from '../src/lib/trainingModule';
import { SPOT, dealRowSpot, gridItemSpot, isKnownSpot, isWindowSpot, pickVariantSpot } from '../src/lib/trainingSpots';
import { isMet, noEvents, snapOf } from '../src/lib/trainingConds';
import { FIXTURE_AUTOS, FIXTURE_VARIANTS, PRACTICE_BUNDLES, applyInjections, buildSandbox } from '../src/lib/trainingSandbox';
import { priceCart } from '../src/lib/pricing';
import { parseBundleConfig } from '../src/lib/bundles';
import { invoiceRows } from '../src/lib/invoiceRows';

const variants: any = Object.fromEntries(FIXTURE_VARIANTS.map(v => [v.id, v]));
const cart = (items: [string, number][]): any => ({ lines: items.map(([id, q], i) => ({ id: `l${i}`, kind: 'item', variantId: id, title: variants[id].productTitle, variantTitle: variants[id].variantTitle, qty: q, unitCents: variants[id].priceCents })) });
const price = (items: [string, number][], bundles = true) => priceCart(cart(items), { variants, collectionsOfProduct: {}, autoDiscounts: FIXTURE_AUTOS, bundles: bundles ? parseBundleConfig(PRACTICE_BUNDLES).cfg! : null } as any);
const line = (variantId: string, qty = 1) => ({ variantId, title: variantId, kind: 'item' as const, qty, discounted: false, adjusted: false });
const snap = (lines: any[], o: { sheets?: number } = {}): TrainSnap => snapOf({ tab: 'checkout', route: '', sheets: o.sheets ?? 0, cart: { lines: lines.map(l => ({ ...l, id: l.variantId })) }, sales: 0, paying: false });
const by = (list: any[], id: string) => list.find(x => x.id === id);
const real: any = { settings: { staff: [], requirePin: false, receipt: {} }, data: {}, grid: {}, gridVersion: 0, pos: {}, sync: {}, zeller: {}, staffId: undefined, unlocked: true };
const ev = (pressed: string[] = [], visible: string[] = []) => ({ pressed: new Set(pressed), visible: new Set(visible) });

test('the course is registered after refunds, is valid, and may use the Payment page', () => {
  assert.equal(getModule('bundles-deals'), bundlesDeals); assert.equal(MODULES[MODULES.length - 1], bundlesDeals); assert.deepEqual(validateModule(bundlesDeals, isKnownSpot), []); assert.ok(bundlesDeals.routes.includes('pay'));
});

test('the practice deals price exactly as the course says: eight Tadlings take the 5 deal and the 3 deal, as two rows', () => {
  const p = price([['train-v-tad', 8]], false); assert.equal(p.netCents, 3200 - 1500);
  assert.deepEqual(invoiceRows(p.lines[0]).map(r => [r.label, r.cents]), [['5 Tadlings', 1000], ['3 Tadlings', 500]]);
  const four = price([['train-v-tad', 4]], false); assert.deepEqual(invoiceRows(four.lines[0]).map(r => r.label), ['3 Tadlings']); assert.equal(price([['train-v-tad', 2]], false).discountCents, 0);
  assert.equal(price([['train-v-cow-s', 1], ['train-v-cow-l', 1]], false).discountCents, 200);
});

test('a cow with a Tadling is a bundle, which uses up a Tadling; the Small cow is the recommended pair and the Large is not', () => {
  const small = price([['train-v-cow-s', 1], ['train-v-tad', 1]]); assert.equal(small.bundles.length, 1); assert.equal(small.bundles[0].status, 'recommended'); assert.equal(small.bundles[0].discountCents, 300);
  const large = price([['train-v-cow-l', 1], ['train-v-tad', 1]]); assert.equal(large.bundles[0].status, 'other');
  const eightWithCow = price([['train-v-tad', 8], ['train-v-cow-s', 1]]); const rows = invoiceRows(eightWithCow.lines.find(l => l.line.variantId === 'train-v-tad')!).map(r => r.label);
  assert.ok(rows.includes('5 Tadlings') && !rows.includes('3 Tadlings'), rows.join(','));
});

test('the Check these bundles window is reached only for a pair that is not recommended', async () => {
  const { needsBundleCheck } = await import('../src/lib/bundles');
  assert.equal(needsBundleCheck(price([['train-v-cow-l', 1], ['train-v-tad', 1]]).bundles, ''), true); assert.equal(needsBundleCheck(price([['train-v-cow-s', 1], ['train-v-tad', 1]]).bundles, ''), false);
});

test('the deal rows, the bundle box and the bundle window all have spots, and the window buttons are window spots', () => {
  assert.equal(dealRowSpot('train-v-tad', '5 Tadlings'), 'cart.deal:train-v-tad:5-tadlings'); assert.ok(isKnownSpot(dealRowSpot('train-v-tad', '3 Tadlings')));
  for (const id of [SPOT.cartBundles, SPOT.cartDeals, SPOT.bundleContinue, SPOT.bundleEdit]) assert.ok(isKnownSpot(id), id);
  assert.ok(isWindowSpot(SPOT.bundleContinue) && isWindowSpot(SPOT.bundleEdit)); assert.ok(!isWindowSpot(SPOT.cartBundles) && !isWindowSpot(dealRowSpot('train-v-tad', '5 Tadlings')));
  for (const s of bundlesDeals.guide.filter(x => x.target && isWindowSpot(x.target))) assert.equal(s.at?.sheets, true, s.id);
});

test('Guide steps are finished by the right cart change or press', () => {
  const g = (id: string) => by(bundlesDeals.guide, id).until;
  assert.ok(!isMet(g('g-tad'), snap([line('train-v-tad', 7)]), noEvents())); assert.ok(isMet(g('g-tad'), snap([line('train-v-tad', 8)]), noEvents()));
  assert.ok(isMet(g('g-cow'), snap([]), ev([gridItemSpot('train-p-cow')]))); assert.ok(!isMet(g('g-cow'), snap([]), ev([gridItemSpot('train-v-bee')])));
  assert.ok(isMet(g('g-small'), snap([line('train-v-cow-s')]), noEvents())); assert.ok(!isMet(g('g-small'), snap([line('train-v-cow-l')]), noEvents()));
  for (const id of ['g-row5', 'g-row3', 'g-totals', 'g-bundle', 'g-pair']) assert.equal(by(bundlesDeals.guide, id).until.kind, 'next', id);
  assert.equal(by(bundlesDeals.guide, 'g-row5').target, dealRowSpot('train-v-tad', '5 Tadlings')); assert.equal(by(bundlesDeals.guide, 'g-row3').target, dealRowSpot('train-v-tad', '3 Tadlings'));
});

test('Check 1 chains: three Tadlings, then five, then a Small cow; none starts finished', () => {
  const [three, five, bundle] = bundlesDeals.check1; const start = applyInjections(buildSandbox(real), three.inject); assert.equal(start.pos.cart.lines[0].qty, 1);
  assert.ok(!isMet(three.until, snap([line('train-v-tad', 1)]), noEvents())); assert.ok(isMet(three.until, snap([line('train-v-tad', 3)]), noEvents())); assert.ok(!isMet(three.until, snap([line('train-v-tad', 4)]), noEvents()), 'exactly three');
  assert.ok(!isMet(five.until, snap([line('train-v-tad', 3)]), noEvents())); assert.ok(isMet(five.until, snap([line('train-v-tad', 5)]), noEvents()));
  assert.ok(!isMet(bundle.until, snap([line('train-v-tad', 5)]), noEvents())); assert.ok(isMet(bundle.until, snap([line('train-v-tad', 5), line('train-v-cow-s')]), noEvents()));
});

test('Check 2: four Tadlings, a Large cow to swap, and a not-recommended pair to continue past; each says where it was taught', () => {
  const [short, swap, odd] = bundlesDeals.check2;
  assert.equal(applyInjections(buildSandbox(real), short.inject).pos.cart.lines[0].qty, 4); assert.ok(!isMet(short.until, snap([line('train-v-tad', 4)]), noEvents())); assert.ok(isMet(short.until, snap([line('train-v-tad', 5)]), noEvents()));
  assert.ok(!isMet(swap.until, snap([line('train-v-cow-l'), line('train-v-tad')]), noEvents())); assert.ok(!isMet(swap.until, snap([line('train-v-cow-l'), line('train-v-cow-s')]), noEvents()), 'the Large must go'); assert.ok(isMet(swap.until, snap([line('train-v-cow-s'), line('train-v-tad')]), noEvents()));
  assert.ok(isMet(odd.until, snap([]), ev([SPOT.bundleContinue]))); assert.ok(!isMet(odd.until, snap([]), ev([SPOT.bundleEdit])));
  const start = applyInjections(buildSandbox(real), odd.inject); assert.deepEqual(start.pos.cart.lines.map((l: any) => l.variantId).sort(), ['train-v-cow-l', 'train-v-tad']);
  for (const g of bundlesDeals.check2) { assert.ok(g.taughtBy, g.id); assert.ok(bundlesDeals.show.steps.some(s => s.id === g.taughtBy) || bundlesDeals.guide.some(s => s.id === g.taughtBy), g.id); assert.ok(isKnownSpot(g.reveal!), g.id); }
  assert.equal(odd.at?.sheets, true); assert.ok(odd.at?.routes?.includes('pay')); assert.equal(pickVariantSpot('train-v-cow-s'), 'pick.variant:train-v-cow-s');
});
