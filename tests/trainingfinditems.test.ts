// Location: tests/trainingfinditems.test.ts
// The "Find the right item" course: registered, valid, and each step and goal is finished only by the right thing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { findItems } from '../src/training/modules/find-items';
import { MODULES, getModule } from '../src/training';
import { validateModule, type TrainSnap } from '../src/lib/trainingModule';
import { SPOT, findTabSpot, gridCatSpot, gridItemSpot, gridPageSpot, isKnownSpot, isWindowSpot, pickVariantSpot, searchResultSpot } from '../src/lib/trainingSpots';
import { isMet, noEvents, snapOf } from '../src/lib/trainingConds';
import { diagnose, stepRules } from '../src/lib/trainingCourse';
import { applyInjections, buildSandbox, fixtureGrid, PRACTICE_PAGE_EXTRAS } from '../src/lib/trainingSandbox';
import { viewTiles } from '../src/lib/gridNav';
import { FIXTURE_COLLECTIONS } from '../src/lib/trainingSandbox';

const line = (variantId: string, qty = 1) => ({ variantId, title: variantId, kind: 'item' as const, qty });
const custom = { title: 'Custom amount', kind: 'custom' as const, qty: 1 };
const snap = (lines: any[], o: { sheets?: number } = {}): TrainSnap => snapOf({ tab: 'checkout', route: '', sheets: o.sheets ?? 0, cart: { lines }, sales: 0, paying: false });
const by = (list: any[], id: string) => list.find(x => x.id === id);
const real: any = { settings: { staff: [], requirePin: false, receipt: {} }, data: {}, grid: {}, gridVersion: 0, pos: {}, sync: {}, zeller: {}, staffId: undefined, unlocked: true };
const ev = (pressed: string[] = [], visible: string[] = []) => ({ pressed: new Set(pressed), visible: new Set(visible) });

test('the course is registered after the cart course and is valid', () => {
  assert.equal(getModule('find-items'), findItems); assert.equal(MODULES.findIndex(m => m.id === 'find-items'), MODULES.findIndex(m => m.id === 'cart') + 1);
  assert.deepEqual(validateModule(findItems, isKnownSpot), []);
});

test('the practice grid has what the course needs: a second page, categories, and a product in two sizes', () => {
  const g = fixtureGrid(); assert.ok(g.pages.length >= 2); assert.equal(g.pages[1].id, PRACTICE_PAGE_EXTRAS);
  assert.ok(g.pages[1].tiles.some(t => t.type === 'item' && t.variantId === 'train-v-sticker') && g.pages[1].tiles.some(t => t.type === 'item' && t.variantId === 'train-v-key'));
  const animals = g.pages[0].tiles.find(t => t.type === 'category' && t.collectionId === 'train-c-animals')!; assert.ok(animals);
  const shown = viewTiles(animals as any, FIXTURE_COLLECTIONS, () => true).map(t => (t.type === 'item' ? t.productId : ''));
  assert.ok(shown.includes('train-p-cow') && shown.includes('train-p-bee'), 'the Animals category shows the cow and the bee');
});

test('Guide steps are finished by the right press or cart', () => {
  const g = (id: string) => by(findItems.guide, id).until;
  assert.ok(isMet(g('g-extras'), snap([]), ev([gridPageSpot(PRACTICE_PAGE_EXTRAS)]))); assert.ok(!isMet(g('g-extras'), snap([]), ev()));
  assert.ok(isMet(g('g-sticker'), snap([line('train-v-sticker')]), noEvents())); assert.ok(!isMet(g('g-sticker'), snap([line('train-v-egg')]), noEvents()));
  assert.ok(isMet(g('g-category'), snap([]), ev([gridCatSpot('train-c-animals')])));
  assert.ok(isMet(g('g-cow'), snap([]), ev([gridItemSpot('train-p-cow')])), 'tapping the product opens its sizes and adds nothing');
  assert.ok(isMet(g('g-large'), snap([line('train-v-cow-l')]), noEvents())); assert.ok(!isMet(g('g-large'), snap([line('train-v-cow-s')]), noEvents()), 'the Small is not the Large');
  assert.ok(isMet(g('g-back-sizes'), snap([]), ev([SPOT.findBack])));
  assert.ok(isMet(g('g-type'), snap([]), ev([], [searchResultSpot('train-v-egg')]))); assert.ok(!isMet(g('g-type'), snap([]), ev()));
  assert.ok(isMet(g('g-result'), snap([line('train-v-egg')]), noEvents()));
  assert.ok(isMet(g('g-keypad-tab'), snap([]), ev([findTabSpot('keypad')]))); assert.ok(!isMet(g('g-keypad-tab'), snap([]), ev([findTabSpot('all')])));
  assert.ok(isMet(g('g-add'), snap([custom]), noEvents())); assert.ok(!isMet(g('g-add'), snap([line('train-v-key')]), noEvents()), 'only a custom amount finishes it');
});

test('windows are allowed exactly on the steps that live in the Search window', () => {
  const inWindow = findItems.guide.filter(s => s.target && isWindowSpot(s.target)).map(s => s.id); assert.deepEqual(inWindow, ['g-type', 'g-result']);
  for (const id of inWindow) assert.equal(stepRules(by(findItems.guide, id)).at?.sheets, true);
  for (const id of ['g-extras', 'g-large', 'g-add']) assert.equal(stepRules(by(findItems.guide, id)).at?.sheets, false, `${id}: a window opening is off course`);
  // So a window that opens on the Extras step is reported, with Close pointed at.
  const base = snap([]); const d = diagnose(stepRules(by(findItems.guide, 'g-extras')), { tabs: ['checkout'], routes: ['cart'] }, base, snap([], { sheets: 1 }))!; assert.equal(d.kind, 'sheet');
});

test('Check 1 goals are each finished only by their own item, and none starts finished', () => {
  const win: Record<string, any[]> = { 'other-page': [line('train-v-sticker')], 'find-egg': [line('train-v-egg')], size: [line('train-v-cow-l')], repair: [custom] };
  for (const gl of findItems.check1) {
    assert.ok(!isMet(gl.until, snap([]), noEvents()), `${gl.id} must not be finished by an empty cart`); assert.ok(isMet(gl.until, snap(win[gl.id]), noEvents()), `${gl.id} is won by its own item`);
    for (const [other, lines] of Object.entries(win)) if (other !== gl.id) assert.ok(!isMet(gl.until, snap(lines), noEvents()), `${gl.id} must not be won by the ${other} item`);
  }
});

test('Check 2: the swap starts unfinished and needs both halves; the dragon goal rejects the egg; each says where it was taught', () => {
  const swap = by(findItems.check2, 'swap-size'); const start = applyInjections(buildSandbox(real), swap.inject);
  const lines = start.pos.cart.lines.map((l: any) => line(l.variantId, l.qty)); assert.deepEqual(lines.map((l: any) => l.variantId), ['train-v-cow-s']); assert.ok(!isMet(swap.until, snap(lines), noEvents()));
  assert.ok(!isMet(swap.until, snap([line('train-v-cow-s'), line('train-v-cow-l')]), noEvents()), 'adding the Large without removing the Small is not enough');
  assert.ok(!isMet(swap.until, snap([]), noEvents())); assert.ok(isMet(swap.until, snap([line('train-v-cow-l')]), noEvents()));
  const two = by(findItems.check2, 'two-matches'); assert.ok(!isMet(two.until, snap([line('train-v-dragon'), line('train-v-egg')]), noEvents())); assert.ok(isMet(two.until, snap([line('train-v-dragon')]), noEvents()));
  assert.ok(two.watch[0].when(snap([line('train-v-egg')]))); assert.ok(!two.watch[0].when(snap([line('train-v-dragon')])));
  const ex = by(findItems.check2, 'two-extras'); assert.ok(!isMet(ex.until, snap([line('train-v-key')]), noEvents())); assert.ok(isMet(ex.until, snap([line('train-v-key'), line('train-v-sticker')]), noEvents()));
  for (const g of findItems.check2) assert.ok(g.taughtBy, `${g.id} says where it was taught`);
});

test('every spot the course points at is known, and the picker tiles and search rows are named after real practice items', () => {
  for (const id of [pickVariantSpot('train-v-cow-l'), searchResultSpot('train-v-egg'), gridPageSpot(PRACTICE_PAGE_EXTRAS), gridCatSpot('train-c-animals'), findTabSpot('keypad')]) assert.ok(isKnownSpot(id), id);
  assert.ok(isWindowSpot(searchResultSpot('x')) && isWindowSpot(SPOT.searchField) && !isWindowSpot(SPOT.findSearch));
});
