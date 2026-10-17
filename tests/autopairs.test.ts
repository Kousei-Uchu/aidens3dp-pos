// Location: tests/autopairs.test.ts
// A8.3: the Auto button on recommended pairs. Style and colour matching, tier order, the Green rule,
// one-to-one use, leftovers, hand-picked pairs kept, and a result the deal accepts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { autoRecommendedPairs } from '../src/lib/autoPairs';
import { importRecommendedPairs, recommendedPairsExport, type DealForm } from '../src/lib/bundleForm';
import type { Variant } from '../src/lib/types';

let n = 1000;
const P = (id: number) => `gid://shopify/Product/${id}`;
const v = (productId: number, productTitle: string, variantTitle: string): Variant => ({
  id: `gid://shopify/ProductVariant/${n++}`, productId: P(productId), productTitle, variantTitle, priceCents: 1000, tracked: true, stock: 5, tags: [], active: true,
});
const EGG_G = 1, EGG_R = 2, MINI_G = 3, MINI_R = 4;
const egg = (style: 'Gemstone' | 'Rose', colour: string) => v(style === 'Gemstone' ? EGG_G : EGG_R, `${style} Egg Dragon (Outer Egg)`, colour);
const mini = (style: 'Gemstone' | 'Rose', colour: string) => v(style === 'Gemstone' ? MINI_G : MINI_R, `Mini ${style} Dragon`, colour);
const byId = (vs: Variant[]) => Object.fromEntries(vs.map(x => [x.id, x]));
// Position 1 = both outer egg products, position 2 = both mini products.
const form = (recommended: string[][] = []): DealForm => ({
  id: 'dragon_egg_combo', label: 'Dragon egg combo', enabled: true, mode: 'delta', amountCents: 500, percent: 10, applyToSlot: null, maxPerCart: null,
  startsOn: '', endsOn: '', recommended, slots: [{ ids: [P(EGG_G), P(EGG_R)], qty: 1 }, { ids: [P(MINI_G), P(MINI_R)], qty: 1 }],
});
const names = (r: { pairs: string[][] }, all: Variant[]) => r.pairs.map(p => p.map(id => all.find(x => x.id === id)!).map(x => `${x.productTitle}:${x.variantTitle}`));

test('pairs the same style and colour, and never crosses styles', () => {
  const vs = [egg('Gemstone', 'Crushed Blue'), egg('Rose', 'Crushed Blue'), mini('Gemstone', 'Crushed Blue'), mini('Rose', 'Crushed Blue')];
  const r = autoRecommendedPairs(form(), byId(vs));
  assert.equal(r.pairs.length, 2);
  for (const [a, b] of r.pairs) assert.equal(vs.find(x => x.id === a)!.productTitle.includes('Rose'), vs.find(x => x.id === b)!.productTitle.includes('Rose'));
});

test('Green never pairs with Green Black Dual Colour', () => {
  const vs = [egg('Gemstone', 'Green'), mini('Gemstone', 'Green Black Dual Colour')];
  const r = autoRecommendedPairs(form(), byId(vs));
  assert.equal(r.pairs.length, 0);
  assert.equal(r.leftovers[0].length, 1);
  assert.equal(r.leftovers[1].length, 1);
});

test('different spellings of the same colours match: / & and order', () => {
  const vs = [egg('Gemstone', 'Black/Red Dual Colour'), egg('Gemstone', 'Blue/Red Dual Colour'), mini('Gemstone', 'Black & Red Dual Colour'), mini('Gemstone', 'Red Blue Dual Colour')];
  const r = autoRecommendedPairs(form(), byId(vs));
  assert.equal(r.pairs.length, 2);
  assert.equal(r.byTier.exact, 1);
  assert.equal(r.byTier['any order'], 1);
});

test('brackets and "Dual Colour" are ignored only as a last resort, and "Assorted" is dropped', () => {
  const vs = [egg('Rose', 'Purple Yellow Blue (EOP)'), egg('Rose', 'Rainbow Candy'), mini('Rose', 'Purple Yellow Blue'), mini('Rose', 'Rainbow Candy - Assorted')];
  const r = autoRecommendedPairs(form(), byId(vs));
  assert.equal(r.pairs.length, 2);
  assert.equal(r.byTier['ignoring filler'], 1);
});

test('different colours with the same style stay apart', () => {
  const vs = [egg('Rose', 'Purple Yellow Blue (EOP)'), mini('Rose', 'Purple Yellow Green (EOP)'), egg('Gemstone', 'Mint Matte'), mini('Gemstone', 'Mint Silk')];
  assert.equal(autoRecommendedPairs(form(), byId(vs)).pairs.length, 0);
});

test('every variation is used once, extras are left over, output follows position 1 order', () => {
  const e1 = egg('Gemstone', 'Titanium'), e2 = egg('Gemstone', 'Oceania'), m1 = mini('Gemstone', 'Oceania'), m2 = mini('Gemstone', 'Oceania'), m3 = mini('Gemstone', 'Pink');
  const r = autoRecommendedPairs(form(), byId([e1, e2, m1, m2, m3]));
  assert.deepEqual(r.pairs.map(p => p[0]), [e2.id]);
  assert.equal(new Set(r.pairs.flat()).size, 2);
  assert.equal(r.leftovers[0].length, 1);
  assert.equal(r.leftovers[1].length, 2);
});

test('pairs already on the deal are kept and their variations are not reused', () => {
  const e1 = egg('Rose', 'Red'), m1 = mini('Rose', 'Red'), e2 = egg('Rose', 'Pink'), m2 = mini('Rose', 'Pink');
  const r = autoRecommendedPairs(form([[e1.id, m1.id]]), byId([e1, m1, e2, m2]));
  assert.deepEqual(r.pairs, [[e2.id, m2.id]]);
  assert.equal(autoRecommendedPairs(form([[e1.id, m1.id], [e2.id, m2.id]]), byId([e1, m1, e2, m2])).pairs.length, 0);
});

test('groups that share no style fall back to colour only', () => {
  const cow = v(10, 'Highland Cow', 'Pink'), tad = v(11, 'Tadling', 'Pink'), tad2 = v(11, 'Tadling', 'Blue');
  const f: DealForm = { ...form(), slots: [{ ids: [P(10)], qty: 1 }, { ids: [P(11)], qty: 1 }] };
  const r = autoRecommendedPairs(f, byId([cow, tad, tad2]));
  assert.deepEqual(r.pairs, [[cow.id, tad.id]]);
});

test('nothing to do for a one item deal or an empty group', () => {
  const e = egg('Rose', 'Red');
  assert.equal(autoRecommendedPairs({ ...form(), slots: [{ ids: [P(EGG_R)], qty: 1 }] }, byId([e])).pairs.length, 0);
  assert.equal(autoRecommendedPairs(form(), byId([e])).pairs.length, 0);
});

test('the result passes the same checks as an imported list', () => {
  const vs = [egg('Gemstone', 'Silver Silk'), mini('Gemstone', 'Silver Silk'), egg('Rose', 'Pink Silk'), mini('Rose', 'Pink Silk')];
  const variants = byId(vs); const f = form();
  const r = autoRecommendedPairs(f, variants);
  const text = JSON.stringify({ ...JSON.parse(recommendedPairsExport(f, variants)), recommended: r.pairs });
  assert.deepEqual(importRecommendedPairs(text, f, variants).pairs, r.pairs);
  assert.deepEqual(names(r, vs).map(p => p.map(x => x.split(':')[1])), [['Silver Silk', 'Silver Silk'], ['Pink Silk', 'Pink Silk']]);
});
