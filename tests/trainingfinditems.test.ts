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
const custom = { title: 'Custom amount', kind: 'custom' as const, qty: 1, unitCents: 450 };
const customWrong = { ...custom, unitCents: 500 };
const snap = (lines: any[], o: { sheets?: number; typed?: TrainSnap['typed']; where?: TrainSnap['where'] } = {}): TrainSnap => snapOf({ tab: 'checkout', route: '', sheets: o.sheets ?? 0, typed: o.typed, where: o.where, cart: { lines }, sales: 0, paying: false });
const by = (list: any[], id: string) => list.find(x => x.id === id);
const real: any = { settings: { staff: [], requirePin: false, receipt: {} }, data: {}, grid: {}, gridVersion: 0, pos: {}, sync: {}, zeller: {}, staffId: undefined, unlocked: true };
const ev = (pressed: string[] = [], visible: string[] = []) => ({ pressed: new Set(pressed), visible: new Set(visible) });

test('the Keypad step needs 4, 5, 0 and points at the next key, or at C after a wrong key', () => {
  const k = by(findItems.guide, 'g-keys'); const typed = (keypad: string) => snap([], { typed: { keypad } });
  assert.ok(!isMet(k.until, typed('4'), ev(['find.keypad'])), 'one key (or any key) is not enough'); assert.ok(!isMet(k.until, typed('7'), ev())); assert.ok(isMet(k.until, typed('450'), ev()));
  assert.equal(k.aim(typed('')).target, 'find.key:4'); assert.equal(k.aim(typed('4')).target, 'find.key:5'); assert.equal(k.aim(typed('45')).target, 'find.key:0');
  assert.equal(k.aim(typed('47')).target, 'find.key:C'); assert.equal(k.aim(typed('450')), null);
  assert.ok(!isMet(by(findItems.guide, 'g-add').until, snap([customWrong]), noEvents()), 'a custom amount of $5.00 does not finish the Add step'); assert.ok(isMet(by(findItems.guide, 'g-add').until, snap([custom]), noEvents()));
});
test('the Search step needs egg typed and says what to do when something else is typed', () => {
  const t = by(findItems.guide, 'g-type'); const typed = (search: string) => snap([], { typed: { search } });
  assert.equal(t.aim(typed('')), null); assert.equal(t.aim(typed('eg')).target, 'search.field'); assert.match(t.aim(typed('dra')).say, /not egg/);
});
test('a step on the grid steers the person back from the Keypad tab, a category or the sizes (the retry bug)', () => {
  const x = by(findItems.guide, 'g-extras'); const at = (tab: any, depth = 0, sizes = false) => snap([], { where: { tab, depth, sizes } });
  assert.equal(x.aim(at('quick')), null); assert.equal(x.aim(at('keypad')).target, findTabSpot('quick')); assert.equal(x.aim(at('all')).target, findTabSpot('quick'));
  assert.equal(x.aim(at('quick', 1)).target, SPOT.findBack); assert.equal(x.aim(at('quick', 1, true)).target, SPOT.findBack);
  const cow = by(findItems.guide, 'g-cow'); assert.equal(cow.aim(at('quick', 1)), null, 'inside Animals is where the cow step happens');
  const large = by(findItems.guide, 'g-large'); assert.equal(large.aim(at('quick', 1, true)), null, 'the sizes step wants the sizes open');
  assert.equal(x.aim(snap([])), null, 'with no view of Checkout it leaves the step as written');
});
test('the tab steps point at one tab of the switch, not the whole switch', () => {
  assert.equal(by(findItems.guide, 'g-keypad-tab').target, findTabSpot('keypad')); assert.equal(by(findItems.guide, 'g-all-tab').target, findTabSpot('all')); assert.equal(by(findItems.guide, 'g-quick-tab').target, findTabSpot('quick'));
});
test('the repair goal wants exactly $4.50 and flags another amount', () => {
  const r = by(findItems.check1, 'repair'); assert.ok(isMet(r.until, snap([custom]), noEvents())); assert.ok(!isMet(r.until, snap([customWrong]), noEvents()));
  const w = r.watch.find((x: any) => x.id === 'wrong-amount'); assert.ok(w.when(snap([customWrong]))); assert.ok(!w.when(snap([custom]))); assert.ok(!w.when(snap([])));
});
test('the probe reports what Checkout publishes and resets it on demand', async () => {
  const { setProbe, getTyped, getWhere, clearProbe, registerCheckoutReset, resetCheckout } = await import('../src/lib/trainingProbe');
  setProbe({ keypad: '45' }, { tab: 'keypad', depth: 0, sizes: false }); assert.equal(getTyped().keypad, '45'); assert.equal(getWhere()?.tab, 'keypad'); clearProbe(); assert.equal(getWhere(), undefined);
  let n = 0; const off = registerCheckoutReset(() => { n++; }); resetCheckout(); assert.equal(n, 1); off(); resetCheckout(); assert.equal(n, 1, 'an unmounted Checkout is not reset');
  registerCheckoutReset(() => { throw new Error('boom'); }); assert.doesNotThrow(() => resetCheckout());
});
test('a slice is one equal part of its box', async () => {
  const { sliceRect } = await import('../src/lib/trainingGeometry'); const box = { x: 10, y: 20, w: 300, h: 40 };
  assert.deepEqual(sliceRect(box, 0, 3), { x: 10, y: 20, w: 100, h: 40 }); assert.deepEqual(sliceRect(box, 2, 3), { x: 210, y: 20, w: 100, h: 40 });
});
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
  assert.ok(isMet(g('g-type'), snap([], { typed: { search: ' Egg ' } }), ev())); assert.ok(!isMet(g('g-type'), snap([], { typed: { search: 'dragon' } }), ev([], [searchResultSpot('train-v-egg')])), 'a result being visible is not enough, egg has to be typed'); assert.ok(!isMet(g('g-type'), snap([]), ev()));
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
