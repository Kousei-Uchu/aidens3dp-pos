// Location: tests/bundleform.test.ts
// A8: bundle builder. Percent / dated deals, recommended pairs (status + matcher preference), the single-row
// bundle summary in priceCart, and the form <-> JSON round trip used by the GUI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { priceCart, type PricingContext } from '../src/lib/pricing';
import { bundleReviewKey, bundleStatus, bundleUnitName, matchBundles, needsBundleCheck, oddBundles, parseBundleConfig, validateBundleConfig, type BundleSource } from '../src/lib/bundles';
import {
  dealToForm, dealSummary, dealWindow, emptyBundleConfig, emptyDealForm, formProblems, formToDeal, isoToDateText, makeDealId,
  removeDeal, setDealEnabled, slotVariants, stringifyBundleConfig, unitSlots, upsertDeal, type DealForm,
} from '../src/lib/bundleForm';
import type { BundleConfig, Cart, CartLine, Variant } from '../src/lib/types';

const P = (n: number) => `gid://shopify/Product/${n}`;
const V = (n: number) => `gid://shopify/ProductVariant/${n}`;
const variant = (id: number, prod: number, cents: number, vt = ''): Variant => ({
  id: V(id), productId: P(prod), productTitle: `P${prod}`, variantTitle: vt, priceCents: cents, tracked: true, stock: 50, tags: [], active: true,
});
const line = (v: Variant, qty = 1): CartLine => ({ id: `l-${v.id}`, kind: 'item', variantId: v.id, title: v.productTitle, variantTitle: v.variantTitle, qty, unitCents: v.priceCents });
const cart = (lines: CartLine[]): Cart => ({ id: 'c', lines });
const ctxFor = (vs: Variant[], cfg: BundleConfig | null, now = Date.now()): PricingContext => ({
  variants: Object.fromEntries(vs.map(v => [v.id, v])), collectionsOfProduct: {}, autoDiscounts: [], bundles: cfg, now,
});
const cfgOf = (items: Record<string, string[]>, discounts: unknown[]) => parseBundleConfig(JSON.stringify({ version: 1, items, discounts })).cfg!;
const src = (key: string, v: Variant, avail = 1): BundleSource => ({ key, variantId: v.id, productId: v.productId, unitCents: v.priceCents, avail });

// ── percent + dates ──────────────────────────────────────────────────────────
test('percent mode takes a percentage off the matched units', () => {
  const a = variant(1, 1, 1000), b = variant(2, 2, 3000);
  const cfg = cfgOf({ x: [P(1)], y: [P(2)] }, [{ id: 'p', label: '10% off pair', sets: ['x', 'y'], mode: 'percent', percent: 10 }]);
  const p = priceCart(cart([line(a), line(b)]), ctxFor([a, b], cfg));
  assert.equal(p.discountCents, 400); // 10% of 4000
  assert.equal(p.bundles.length, 1);
});

test('percent mode with apply_to only discounts that group', () => {
  const a = variant(1, 1, 1000), b = variant(2, 2, 3000);
  const cfg = cfgOf({ x: [P(1)], y: [P(2)] }, [{ id: 'p', label: '50% off the cheap one', sets: ['x', 'y'], mode: 'percent', percent: 50, apply_to: 'x' }]);
  assert.equal(priceCart(cart([line(a), line(b)]), ctxFor([a, b], cfg)).discountCents, 500);
});

test('parse rejects a bad percent and a bad date', () => {
  const bad = (d: object) => parseBundleConfig(JSON.stringify({ items: { x: [P(1)] }, discounts: [{ id: 'd', sets: ['x'], ...d }] })).error;
  assert.match(bad({ mode: 'percent', percent: 0 })!, /percent/);
  assert.match(bad({ mode: 'percent', percent: 150 })!, /percent/);
  assert.match(bad({ price_delta_cents: -100, starts_at: 'not a date' })!, /starts_at/);
  assert.match(bad({ price_delta_cents: -100, recommended: 'x' })!, /recommended/);
});

test('deals outside their dates are ignored, inside they apply', () => {
  const a = variant(1, 1, 1000);
  const cfg = cfgOf({ x: [P(1)] }, [{ id: 'd', label: 'Summer', sets: ['x', 'x'], price_delta_cents: -300, starts_at: '2026-12-01T00:00:00.000Z', ends_at: '2026-12-31T00:00:00.000Z' }]);
  const c = cart([line(a, 2)]);
  assert.equal(priceCart(c, ctxFor([a], cfg, Date.parse('2026-11-30T00:00:00Z'))).discountCents, 0);
  assert.equal(priceCart(c, ctxFor([a], cfg, Date.parse('2026-12-15T00:00:00Z'))).discountCents, 300);
  assert.equal(priceCart(c, ctxFor([a], cfg, Date.parse('2027-01-02T00:00:00Z'))).discountCents, 0);
});

test('dealWindow labels scheduled / live / ended', () => {
  const d = { starts_at: '2026-12-01T00:00:00.000Z', ends_at: '2026-12-31T00:00:00.000Z' };
  assert.equal(dealWindow(d, Date.parse('2026-11-01T00:00:00Z')), 'scheduled');
  assert.equal(dealWindow(d, Date.parse('2026-12-10T00:00:00Z')), 'live');
  assert.equal(dealWindow(d, Date.parse('2027-02-01T00:00:00Z')), 'ended');
  assert.equal(dealWindow({}, Date.now()), 'live');
});

// ── recommended pairs ────────────────────────────────────────────────────────
// Product 1 = "Dragon" with Red / Blue variants, product 2 = "Egg" with Red / Blue. Recommended: matching colours.
const dragonRed = variant(1, 1, 2000, 'Red'), dragonBlue = variant(2, 1, 2000, 'Blue');
const eggRed = variant(3, 2, 1000, 'Red'), eggBlue = variant(4, 2, 1000, 'Blue');
const PAIR_CFG = () => cfgOf({ d: [P(1)], e: [P(2)] }, [{ id: 'combo', label: 'Dragon + Egg', sets: ['d', 'e'], price_delta_cents: -500, recommended: [[V(1), V(3)], [V(2), V(4)]] }]);

test('bundleStatus: recommended / other / none', () => {
  const deal = PAIR_CFG().discounts[0];
  assert.equal(bundleStatus(deal, [V(3), V(1)]), 'recommended'); // order does not matter
  assert.equal(bundleStatus(deal, [V(1), V(4)]), 'other');
  assert.equal(bundleStatus({ ...deal, recommended: undefined }, [V(1), V(4)]), 'none');
});

test('any variant still qualifies for the deal, and a non-recommended pair is flagged', () => {
  const cfg = PAIR_CFG();
  const p = priceCart(cart([line(dragonRed), line(eggBlue)]), ctxFor([dragonRed, dragonBlue, eggRed, eggBlue], cfg));
  assert.equal(p.discountCents, 500);
  assert.equal(p.bundles[0].status, 'other');
  assert.deepEqual(p.bundles[0].units.map(u => u.variantTitle).sort(), ['Blue', 'Red']);
});

test('a recommended pair is flagged recommended', () => {
  const p = priceCart(cart([line(dragonBlue), line(eggBlue)]), ctxFor([dragonRed, dragonBlue, eggRed, eggBlue], PAIR_CFG()));
  assert.equal(p.bundles[0].status, 'recommended');
});

test('the matcher prefers recommended pairs when the saving is the same', () => {
  // Red dragon, Blue dragon, Blue egg, Red egg (eggs deliberately in the "wrong" order so a first-come pairing would
  // cross the colours). Pairing Red+Red and Blue+Blue saves the same $10 as crossing them, so the preference decides.
  const sources = [src('dr', dragonRed), src('db', dragonBlue), src('eb', eggBlue), src('er', eggRed)];
  const m = matchBundles(sources, PAIR_CFG());
  assert.equal(m.length, 2);
  assert.ok(m.every(x => x.status === 'recommended'), JSON.stringify(m.map(x => x.status)));
  const keys = m.map(x => x.picks.map(p => p.sourceKey).sort().join('+')).sort();
  assert.deepEqual(keys, ['db+eb', 'dr+er']);
});

test('the preference never costs the customer money: a bigger saving beats a recommended pair', () => {
  // Dragon (Red $20) + Egg Red ($10) is recommended but the deal is 10% off, so pairing the dearer cross-colour units saves more.
  const dragonPricey = variant(1, 1, 5000, 'Red');
  const cfg = cfgOf({ d: [P(1)], e: [P(2)] }, [{ id: 'c', label: 'C', sets: ['d', 'e'], mode: 'percent', percent: 10, recommended: [[V(1), V(3)]] }]);
  const m = matchBundles([src('d', dragonPricey), src('eRed', eggRed), src('eBlue', { ...eggBlue, priceCents: 4000 })], cfg);
  assert.equal(m.length, 1);
  assert.equal(m[0].discountCents, 900); // 10% of ($50 + $40), the non-recommended pairing
  assert.equal(m[0].status, 'other');
});

test('deals without recommended pairs behave exactly as before (status none)', () => {
  const cfg = cfgOf({ d: [P(1)], e: [P(2)] }, [{ id: 'c', label: 'C', sets: ['d', 'e'], price_delta_cents: -500 }]);
  const m = matchBundles([src('d', dragonRed), src('e', eggBlue)], cfg);
  assert.equal(m[0].status, 'none');
});

test('compound example still holds with the new fields (2 cows + 8 Tadlings)', () => {
  const cow = variant(1, 1, 1500), tad = variant(2, 2, 700);
  const cfg = cfgOf({ cow: [P(1)], tad: [P(2)] }, [
    { id: 'c2', label: '2 cows', sets: ['cow', 'cow'], price_delta_cents: -200 },
    { id: 't3', label: '3 Tadlings', sets: ['tad', 'tad', 'tad'], price_delta_cents: -500 },
    { id: 't5', label: '5 Tadlings', sets: ['tad', 'tad', 'tad', 'tad', 'tad'], price_delta_cents: -1000 },
  ]);
  const p = priceCart(cart([line(cow, 2), line(tad, 8)]), ctxFor([cow, tad], cfg));
  assert.equal(p.discountCents, 1700);
  assert.equal(p.bundles.length, 3);
  assert.deepEqual(p.bundles.map(b => b.label).sort(), ['2 cows', '3 Tadlings', '5 Tadlings']);
  assert.equal(p.bundles.reduce((a, b) => a + b.discountCents, 0), 1700);
});

test('validate: wrong-sized recommended pair and reversed dates are reported', () => {
  const cfg = cfgOf({ d: [P(1)], e: [P(2)] }, [{ id: 'c', label: 'C', sets: ['d', 'e'], price_delta_cents: -500, recommended: [[V(1)]], starts_at: '2026-12-31T00:00:00Z', ends_at: '2026-12-01T00:00:00Z' }]);
  const w = validateBundleConfig(cfg, new Set());
  assert.ok(w.some(x => /recommended pair has 1/.test(x)));
  assert.ok(w.some(x => /starts after it ends/.test(x)));
});

// ── form <-> JSON ────────────────────────────────────────────────────────────
const formOf = (over: Partial<DealForm> = {}): DealForm => ({ ...emptyDealForm(emptyBundleConfig()), id: 'dragon_egg', label: 'Dragon + Egg', slots: [{ ids: [P(1)], qty: 1 }, { ids: [P(2), V(9)], qty: 2 }], mode: 'delta', amountCents: 500, ...over });

test('form → deal: slots become sets, qty repeats the set, delta is stored negative', () => {
  const { deal, items } = formToDeal(formOf());
  assert.deepEqual(deal.sets, ['dragon_egg_1', 'dragon_egg_2', 'dragon_egg_2']);
  assert.deepEqual(items, { dragon_egg_1: [P(1)], dragon_egg_2: [P(2), V(9)] });
  assert.equal(deal.price_delta_cents, -500);
  assert.equal(deal.apply_to, null);
});

test('form → deal: apply-to-group, fixed price, percent, cap', () => {
  assert.equal(formToDeal(formOf({ applyToSlot: 1 })).deal.apply_to, 'dragon_egg_2');
  const fx = formToDeal(formOf({ mode: 'fixed_price', amountCents: 2500 })).deal; assert.equal(fx.price_delta_cents, 2500); assert.equal(fx.mode, 'fixed_price');
  const pc = formToDeal(formOf({ mode: 'percent', percent: 15 })).deal; assert.equal(pc.percent, 15); assert.equal(pc.mode, 'percent');
  assert.equal(formToDeal(formOf({ maxPerCart: 3 })).deal.max_per_cart, 3);
  assert.equal(formToDeal(formOf({ maxPerCart: 0 })).deal.max_per_cart, null);
});

test('round trip: form → config → JSON text → parse → form gives the same form', () => {
  const f = formOf({ applyToSlot: 1, maxPerCart: 4, startsOn: '2026-12-01', endsOn: '2026-12-24', recommended: [[P(1), V(9), V(9)]] });
  const cfg = upsertDeal(emptyBundleConfig(), f);
  const text = stringifyBundleConfig(cfg);
  const back = parseBundleConfig(text).cfg!;
  const f2 = dealToForm(back, back.discounts[0]);
  assert.deepEqual(f2, f);
});

test('a deal built in the GUI is what the pricing engine runs', () => {
  const dragon = variant(1, 1, 2000, 'Red'), egg = variant(3, 2, 1000, 'Blue');
  const f = formOf({ slots: [{ ids: [P(1)], qty: 1 }, { ids: [P(2)], qty: 1 }], amountCents: 700 });
  const cfg = parseBundleConfig(stringifyBundleConfig(upsertDeal(emptyBundleConfig(), f))).cfg!;
  assert.equal(priceCart(cart([line(dragon), line(egg)]), ctxFor([dragon, egg], cfg)).discountCents, 700);
});

test('hand-written JSON with a repeated, shared set loads as one slot with a quantity', () => {
  const cfg = cfgOf({ cow: [P(1)], tad: [P(2)] }, [{ id: 'mix', label: 'Mix', sets: ['cow', 'tad', 'cow'], price_delta_cents: -300, apply_to: 'tad' }]);
  const f = dealToForm(cfg, cfg.discounts[0]);
  assert.deepEqual(f.slots, [{ ids: [P(1)], qty: 2 }, { ids: [P(2)], qty: 1 }]);
  assert.equal(f.applyToSlot, 1);
  assert.equal(f.amountCents, 300);
});

test('upsert replaces by id (keeps position), prunes unused sets, remove and toggle work', () => {
  let cfg = upsertDeal(emptyBundleConfig(), formOf({ id: 'a', label: 'A' }));
  cfg = upsertDeal(cfg, formOf({ id: 'b', label: 'B', slots: [{ ids: [P(5)], qty: 1 }] }));
  assert.deepEqual(cfg.discounts.map(d => d.id), ['a', 'b']);
  cfg = upsertDeal(cfg, formOf({ id: 'a', label: 'A2', slots: [{ ids: [P(7)], qty: 1 }] })); // shrinks from 2 slots to 1
  assert.deepEqual(cfg.discounts.map(d => d.id), ['a', 'b']);
  assert.deepEqual(Object.keys(cfg.items).sort(), ['a_1', 'b_1']); // a_2 pruned
  cfg = setDealEnabled(cfg, 'a', false); assert.equal(cfg.discounts[0].enabled, false);
  cfg = removeDeal(cfg, 'a'); assert.deepEqual(Object.keys(cfg.items), ['b_1']);
  assert.equal(stringifyBundleConfig(removeDeal(cfg, 'b')), '');
});

test('formProblems: the things that stop a save', () => {
  assert.deepEqual(formProblems(formOf()), []);
  assert.ok(formProblems(formOf({ label: ' ' })).some(x => /name/.test(x)));
  assert.ok(formProblems(formOf({ slots: [{ ids: [], qty: 1 }] })).some(x => /no items/.test(x)));
  assert.ok(formProblems(formOf({ amountCents: 0 })).some(x => /takes off/.test(x)));
  assert.ok(formProblems(formOf({ mode: 'percent', percent: 120 })).some(x => /Percent/.test(x)));
  assert.ok(formProblems(formOf({ startsOn: '2026-13-40' })).some(x => /Start date/.test(x)));
  assert.ok(formProblems(formOf({ startsOn: '2026-12-24', endsOn: '2026-12-01' })).some(x => /ends before/.test(x)));
  assert.ok(formProblems(formOf({ recommended: [[V(1)]] })).some(x => /needs 3/.test(x)));
});

test('dates: end date is inclusive of the whole day and round-trips to the same text', () => {
  const f = formOf({ startsOn: '2026-12-01', endsOn: '2026-12-24' });
  const { deal } = formToDeal(f);
  assert.equal(isoToDateText(deal.starts_at), '2026-12-01');
  assert.equal(isoToDateText(deal.ends_at), '2026-12-24');
  const lateOnLastDay = new Date(2026, 11, 24, 23, 30).getTime();
  assert.equal(dealWindow(deal, lateOnLastDay), 'live');
  assert.equal(dealWindow(deal, new Date(2026, 11, 25, 0, 1).getTime()), 'ended');
});

test('helpers: unit positions, ids, slot variants, summary text', () => {
  assert.deepEqual(unitSlots(formOf()), [0, 1, 1]);
  assert.equal(makeDealId('Dragon 2 for $5!', []), 'dragon_2_for_5');
  assert.equal(makeDealId('Dragon 2 for $5!', ['dragon_2_for_5', 'dragon_2_for_5_2']), 'dragon_2_for_5_3');
  assert.equal(makeDealId('!!!', []), 'deal');
  const vs = Object.fromEntries([dragonRed, dragonBlue, eggRed].map(v => [v.id, v]));
  assert.deepEqual(slotVariants({ ids: [P(1)], qty: 1 }, vs).map(v => v.variantTitle), ['Blue', 'Red']);
  assert.deepEqual(slotVariants({ ids: [V(3)], qty: 1 }, vs).map(v => v.id), [V(3)]);
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;
  assert.equal(dealSummary(formOf({ slots: [{ ids: [P(1)], qty: 2 }], amountCents: 200 }), vs, money), '2 × P1 (all variations) → $2.00 off');
});

// ── checkout check (A8.4) ────────────────────────────────────────────────────
test('checkout check: asks once for a non-recommended pair, again only when the cart changes', () => {
  const all = [dragonRed, dragonBlue, eggRed, eggBlue];
  const odd = priceCart(cart([line(dragonRed), line(eggBlue)]), ctxFor(all, PAIR_CFG())).bundles;
  assert.equal(oddBundles(odd).length, 1);
  assert.equal(needsBundleCheck(odd, ''), true);
  const key = bundleReviewKey(odd);
  assert.equal(needsBundleCheck(odd, key), false); // cashier chose "Continue to payment"
  const changed = priceCart(cart([line(dragonBlue), line(eggRed)]), ctxFor(all, PAIR_CFG())).bundles; // still not recommended, different items
  assert.equal(needsBundleCheck(changed, key), true);
});

test('checkout check: nothing to ask for recommended pairs, deals with no pairs, or an empty cart', () => {
  const all = [dragonRed, dragonBlue, eggRed, eggBlue];
  assert.equal(needsBundleCheck(priceCart(cart([line(dragonRed), line(eggRed)]), ctxFor(all, PAIR_CFG())).bundles, ''), false);
  const plain = cfgOf({ d: [P(1)], e: [P(2)] }, [{ id: 'c', label: 'C', sets: ['d', 'e'], price_delta_cents: -500 }]);
  assert.equal(needsBundleCheck(priceCart(cart([line(dragonRed), line(eggBlue)]), ctxFor(all, plain)).bundles, ''), false);
  assert.equal(needsBundleCheck(priceCart(cart([]), ctxFor(all, PAIR_CFG())).bundles, ''), false);
});

test('bundleUnitName leaves out a default variation title', () => {
  assert.equal(bundleUnitName({ title: 'Dragon', variantTitle: 'Red' }), 'Dragon - Red');
  assert.equal(bundleUnitName({ title: 'Dragon', variantTitle: '' }), 'Dragon');
  assert.equal(bundleUnitName({ title: 'Dragon', variantTitle: 'Default Title' }), 'Dragon');
});
