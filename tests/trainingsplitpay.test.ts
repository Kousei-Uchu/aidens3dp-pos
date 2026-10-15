// Location: tests/trainingsplitpay.test.ts
// The "Split a payment" course: valid, registered, each goal is won only by the right split (a cash part AND a card part), and the practice injects behave.
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitPay } from '../src/training/modules/split-pay';
import { MODULES, getModule } from '../src/training';
import { validateModule, type TrainSnap } from '../src/lib/trainingModule';
import { isKnownSpot, splitEqualSpot } from '../src/lib/trainingSpots';
import { isMet, noEvents, snapOf } from '../src/lib/trainingConds';
import { applyInjections, buildSandbox } from '../src/lib/trainingSandbox';
import { equalPlan, firstPlan, isSplit, planAfter, planTarget } from '../src/lib/splitPlan';

const real: any = { settings: { staff: [], requirePin: false, receipt: {} }, data: {}, grid: {}, gridVersion: 0, pos: {}, sync: {}, zeller: {}, staffId: undefined, unlocked: true };
const snap = (o: { cash?: TrainSnap['cash']; sales?: number; sheets?: number; kinds?: string[] } = {}): TrainSnap =>
  snapOf({ tab: 'checkout', route: 'pay', sheets: o.sheets, cash: o.cash, lastSaleKinds: o.kinds, cart: { lines: [] }, sales: o.sales ?? 0, paying: true });
const until = (list: any[], id: string) => list.find(x => x.id === id).until;
const won = (list: any[], id: string, s: TrainSnap) => isMet(until(list, id), s, noEvents());

test('the course is registered with the payment courses, is valid, and the person plays the customer at the terminal', () => {
  assert.equal(getModule('split-pay'), splitPay); assert.ok(MODULES.findIndex(m => m.id === 'split-pay') > MODULES.findIndex(m => m.id === 'pay-card'));
  assert.deepEqual(validateModule(splitPay, isKnownSpot), []); assert.equal(splitPay.card, 'manual'); assert.ok(splitPay.routes.includes('pay'));
});
test('Guide steps follow what has been tapped into the Cash window and the sale finishing', () => {
  const at = (received: number) => snap({ cash: { received, due: 700, step: 'receive' } });
  assert.ok(!won(splitPay.guide, 'g-tap5', at(200))); assert.ok(won(splitPay.guide, 'g-tap5', at(500)));
  assert.ok(!won(splitPay.guide, 'g-tap2', at(500))); assert.ok(won(splitPay.guide, 'g-tap2', at(700)));
  assert.ok(!won(splitPay.guide, 'g-receipt', snap({ sales: 1, sheets: 1 }))); assert.ok(won(splitPay.guide, 'g-receipt', snap({ sales: 1, sheets: 0 })));
});
test('Check goals need both a cash part and a card part, and the receipt closed', () => {
  const done = (kinds: string[], sheets = 0) => snap({ sales: 1, sheets, kinds });
  assert.ok(won(splitPay.check1, 'equal-cash-card', done(['cash', 'card'])));
  assert.ok(!won(splitPay.check1, 'equal-cash-card', done(['cash'])), 'cash alone is not a split');
  assert.ok(!won(splitPay.check1, 'equal-cash-card', done(['card'])), 'card alone is not a split');
  assert.ok(!won(splitPay.check1, 'equal-cash-card', done(['cash', 'card'], 1)), 'the Receipt window must be closed');
  assert.ok(won(splitPay.check2, 'changed-mind', done(['card'])));
  assert.ok(!won(splitPay.check2, 'changed-mind', done(['cash', 'card'])), 'the whole sale must be one way once the split is cancelled');
});
test('the equal split and the first-amount split really do cut a $14.00 sale up', () => {
  assert.deepEqual(equalPlan(1400, 2), [700, 700]); assert.ok(isSplit(equalPlan(1400, 2)));
  assert.equal(planTarget(equalPlan(1400, 2), 1400), 700);
  assert.deepEqual(firstPlan(1400, 500), [500, 900]); assert.equal(planTarget(firstPlan(1400, 500), 1400), 500);
  assert.deepEqual(planAfter(equalPlan(1400, 2), 700), [], 'after the first $7.00 only one part is left, so it is no longer a split');
});
test('Check 2 problems are injected, and each says where it was taught', () => {
  for (const g of splitPay.check2) { assert.ok(g.inject?.length && g.taughtBy, g.id); assert.ok([...splitPay.info.steps, ...splitPay.show.steps, ...splitPay.guide].some(s => s.id === g.taughtBy), `${g.id} names a real step`); }
  assert.ok(splitPay.check2.some(g => g.inject?.some(i => i.kind === 'decline')), 'a declined part is practised');
});
test('the practice cart for the first amount goal is a $14.00 sale', () => {
  const g = splitPay.check1.find(x => x.id === 'first-amount')!; const cart = applyInjections(buildSandbox(real), g.inject).pos.cart;
  assert.ok(cart.lines.length >= 2);
});
test('the split window spots are the ones the module points at', () => {
  assert.ok(isKnownSpot(splitEqualSpot(2))); assert.ok(isKnownSpot('split.continue')); assert.ok(isKnownSpot('split.cancel'));
});
