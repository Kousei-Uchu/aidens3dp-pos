// Location: tests/trainingdiscounts.test.ts
// The "Discounts" course: registered, valid, and each step and goal is finished only by the right thing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { discounts } from '../src/training/modules/discounts';
import { MODULES, getModule } from '../src/training';
import { validateModule, type TrainSnap } from '../src/lib/trainingModule';
import { SPOT, discountPresetSpot, isKnownSpot, isWindowSpot, lineDiscountSpot } from '../src/lib/trainingSpots';
import { isMet, noEvents, snapOf } from '../src/lib/trainingConds';
import { FIXTURE_AUTOS, FIXTURE_PRESETS, FIXTURE_VARIANTS, applyInjections, buildSandbox } from '../src/lib/trainingSandbox';
import { NO_DISCOUNT_TAG } from '../src/lib/pricing';

const line = (variantId: string, qty = 1, discounted = false) => ({ variantId, title: variantId, kind: 'item' as const, qty, discounted, adjusted: false });
const snap = (lines: any[], o: { sheets?: number; discount?: boolean } = {}): TrainSnap => snapOf({ tab: 'checkout', route: '', sheets: o.sheets ?? 0, cart: { lines: lines.map(l => ({ ...l, id: l.variantId, discount: l.discounted ? { kind: 'pct', value: 10, label: '10% off' } : undefined })), discount: o.discount ? { kind: 'pct', value: 10, label: '10% off' } : undefined }, sales: 0, paying: false });
const by = (list: any[], id: string) => list.find(x => x.id === id);
const real: any = { settings: { staff: [], requirePin: false, receipt: {} }, data: {}, grid: {}, gridVersion: 0, pos: {}, sync: {}, zeller: {}, staffId: undefined, unlocked: true };
const ev = (pressed: string[] = [], visible: string[] = []) => ({ pressed: new Set(pressed), visible: new Set(visible) });

test('the course is registered after customers, is valid, and uses the cart page', () => {
  assert.equal(getModule('discounts'), discounts); assert.equal(MODULES.findIndex(m => m.id === 'discounts'), MODULES.findIndex(m => m.id === 'customer') + 1);
  assert.deepEqual(validateModule(discounts, isKnownSpot), []);
});

test('practice data has a no-discount item, two presets and an automatic deal with a minimum quantity', () => {
  const print = FIXTURE_VARIANTS.find(v => v.id === 'train-v-print')!; assert.ok(print.tags.includes(NO_DISCOUNT_TAG));
  assert.ok(FIXTURE_PRESETS.some(p => p.id === 'train-pre-10') && FIXTURE_PRESETS.length >= 2);
  assert.equal(FIXTURE_AUTOS[0].minQty, 3); assert.deepEqual(FIXTURE_AUTOS[0].target?.variantIds, ['train-v-key']);
  const sb = buildSandbox(real); assert.equal(sb.data.autos.length, 1); assert.ok(sb.data.autos.every(a => a.id.startsWith('train-')));
});

test('Guide steps are finished by the right press, window or cart change', () => {
  const g = (id: string) => by(discounts.guide, id).until;
  assert.ok(isMet(g('g-add'), snap([line('train-v-dragon')]), noEvents())); assert.ok(!isMet(g('g-add'), snap([line('train-v-bee')]), noEvents()));
  assert.ok(isMet(g('g-line'), snap([]), ev([], [lineDiscountSpot('train-v-dragon')]))); assert.ok(!isMet(g('g-line'), snap([]), ev([], [lineDiscountSpot('train-v-bee')])));
  assert.ok(isMet(g('g-keys'), snap([]), ev([SPOT.discountKeys]))); assert.ok(!isMet(g('g-keys'), snap([]), ev([SPOT.discountApply])));
  assert.ok(isMet(g('g-apply'), snap([line('train-v-dragon', 1, true)]), noEvents())); assert.ok(!isMet(g('g-apply'), snap([line('train-v-dragon')]), noEvents()));
  assert.ok(isMet(g('g-line-done'), snap([]), noEvents())); assert.ok(!isMet(g('g-line-done'), snap([], { sheets: 1 }), noEvents()));
  assert.ok(isMet(g('g-menu-item'), snap([]), ev([], [discountPresetSpot('train-pre-10')]))); assert.ok(isMet(g('g-preset'), snap([], { discount: true }), noEvents())); assert.ok(!isMet(g('g-preset'), snap([]), noEvents()));
  assert.ok(isMet(g('g-remove'), snap([]), noEvents())); assert.ok(!isMet(g('g-remove'), snap([], { discount: true }), noEvents()));
});

test('the discount keys, Apply and preset chips are window spots, and each step that points at one allows windows', () => {
  for (const id of [SPOT.discountKeys, SPOT.discountApply, discountPresetSpot('train-pre-10')]) assert.ok(isWindowSpot(id) && isKnownSpot(id), id);
  for (const s of discounts.guide.filter(x => x.target && isWindowSpot(x.target))) assert.equal(s.at?.sheets, true, s.id);
});

test('Check 1: each goal starts unfinished and is finished only by its own discount', () => {
  const [line1, cart, off] = discounts.check1; const start = snap([line('train-v-dragon'), line('train-v-bee')]);
  for (const gl of [line1, cart]) assert.ok(!isMet(gl.until, start, noEvents()), gl.id);
  assert.ok(isMet(line1.until, snap([line('train-v-dragon', 1, true), line('train-v-bee')]), noEvents())); assert.ok(!isMet(line1.until, snap([line('train-v-dragon', 1, true), line('train-v-bee', 1, true)]), noEvents()), 'the Bee must stay full price');
  assert.ok(isMet(cart.until, snap([], { discount: true }), noEvents())); assert.ok(isMet(off.until, snap([]), noEvents())); assert.ok(!isMet(off.until, snap([], { discount: true }), noEvents()));
});

test('Check 2: the print cannot be discounted, the deal needs three Keyrings, and a mistaken cart discount can be taken off', () => {
  const [never, deal, mistake] = discounts.check2;
  const a = applyInjections(buildSandbox(real), never.inject); assert.ok(a.pos.cart.lines.some((l: any) => l.variantId === 'train-v-print' && l.noDiscount)); assert.ok(!isMet(never.until, snap([line('train-v-print'), line('train-v-bee')]), noEvents()));
  assert.ok(isMet(never.until, snap([line('train-v-print'), line('train-v-bee', 1, true)]), noEvents())); assert.ok(!isMet(never.until, snap([line('train-v-print', 1, true), line('train-v-bee')]), noEvents()));
  const b = applyInjections(buildSandbox(real), deal.inject); assert.equal(b.pos.cart.lines[0].qty, 2); assert.ok(!isMet(deal.until, snap([line('train-v-key', 2)]), noEvents())); assert.ok(isMet(deal.until, snap([line('train-v-key', 3)]), noEvents()));
  const c = applyInjections(buildSandbox(real), mistake.inject); assert.equal(c.pos.cart.discount?.value, 15); assert.ok(!isMet(mistake.until, snap([], { discount: true }), noEvents())); assert.ok(isMet(mistake.until, snap([]), noEvents()));
  for (const g of discounts.check2) { assert.ok(g.taughtBy, g.id); assert.equal(g.at?.sheets, true, g.id); assert.ok(isKnownSpot(g.reveal!), g.id); }
  assert.ok(discounts.show.steps.some(s => s.id === never.taughtBy) && discounts.show.steps.some(s => s.id === deal.taughtBy) && discounts.guide.some(s => s.id === mistake.taughtBy));
});
