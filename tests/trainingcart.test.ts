// Location: tests/trainingcart.test.ts
// The "Build a cart" course: registered, valid, and each goal is won only by the right cart.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cart } from '../src/training/modules/cart';
import { MODULES, getModule } from '../src/training';
import { validateModule, type TrainSnap } from '../src/lib/trainingModule';
import { isKnownSpot } from '../src/lib/trainingSpots';
import { isMet, noEvents, snapOf } from '../src/lib/trainingConds';
import { applyInjections, buildSandbox } from '../src/lib/trainingSandbox';

const line = (variantId: string, qty = 1) => ({ variantId, title: variantId, kind: 'item' as const, qty });
const snap = (lines: ReturnType<typeof line>[]): TrainSnap => snapOf({ tab: 'checkout', route: '', cart: { lines }, sales: 0, paying: false });
const until = (list: typeof cart.guide | typeof cart.check1, id: string) => (list as any[]).find(x => x.id === id).until;
const real: any = { settings: { staff: [], requirePin: false, receipt: {} }, data: {}, grid: {}, gridVersion: 0, pos: {}, sync: {}, zeller: {}, staffId: undefined, unlocked: true };

test('the course is registered after sign-in and is valid', () => {
  assert.equal(getModule('cart'), cart); assert.deepEqual(MODULES.map(m => m.id), ['welcome', 'sign-in', 'cart']);
  assert.deepEqual(validateModule(cart, isKnownSpot), []);
});
test('Guide steps finish on the right cart', () => {
  assert.ok(isMet(until(cart.guide, 'g-add-first'), snap([line('train-v-bee')]), noEvents())); assert.ok(!isMet(until(cart.guide, 'g-add-first'), snap([line('train-v-egg')]), noEvents()));
  assert.ok(isMet(until(cart.guide, 'g-qty'), snap([line('train-v-bee', 2), line('train-v-dragon'), line('train-v-egg')]), noEvents()));
  assert.ok(!isMet(until(cart.guide, 'g-qty'), snap([line('train-v-bee'), line('train-v-dragon'), line('train-v-egg')]), noEvents()));
  assert.ok(!isMet(until(cart.guide, 'g-remove'), snap([line('train-v-dragon')]), noEvents())); assert.ok(isMet(until(cart.guide, 'g-remove'), snap([line('train-v-bee')]), noEvents()));
});
test('Check 1 needs three different items, not three of one', () => {
  assert.ok(!isMet(until(cart.check1, 'build'), snap([line('train-v-bee', 3)]), noEvents()));
  assert.ok(isMet(until(cart.check1, 'build'), snap([line('train-v-bee'), line('train-v-dragon'), line('train-v-key')]), noEvents()));
});
test('Check 2 starts unfinished and is won by the swap', () => {
  const g = cart.check2[0]; const start = applyInjections(buildSandbox(real), g.inject);
  const lines = start.pos.cart.lines.map(l => line(l.variantId!, l.qty));
  assert.ok(lines.length === 2 && !isMet(g.until, snap(lines), noEvents()), 'the injected cart must not already finish the goal');
  assert.ok(!isMet(g.until, snap([line('train-v-bee', 2), line('train-v-dragon')]), noEvents()));
  assert.ok(!isMet(g.until, snap([line('train-v-bee', 2)]), noEvents()), 'removing without adding is not enough');
  assert.ok(isMet(g.until, snap([line('train-v-bee', 2), line('train-v-egg')]), noEvents()));
  const bee = g.watch!.find(w => w.id === 'bee-gone')!; assert.ok(bee.when(snap([line('train-v-egg')]))); assert.ok(!bee.when(snap([line('train-v-bee'), line('train-v-egg')])));
  assert.equal(g.taughtBy, 'g-remove');
});
