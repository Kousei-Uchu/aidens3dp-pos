// Location: tests/trainingpaycash.test.ts
// The "Take cash and give change" course: valid, registered, each goal is won only by the right cash sale, and the practice scenarios behave as the course says.
import test from 'node:test';
import assert from 'node:assert/strict';
import { payCash } from '../src/training/modules/pay-cash';
import { MODULES, getModule } from '../src/training';
import { validateModule, type TrainSnap } from '../src/lib/trainingModule';
import { isKnownSpot } from '../src/lib/trainingSpots';
import { isMet, noEvents, snapOf } from '../src/lib/trainingConds';
import { FIXTURE_VARIANTS, applyInjections, buildSandbox } from '../src/lib/trainingSandbox';
import { priceCart } from '../src/lib/pricing';
import { cashDue, cashStatus, partCashOption, planChange } from '../src/lib/cashSale';
import { addCounts } from '../src/lib/cashLedger';

const real: any = { settings: { staff: [], requirePin: false, receipt: {} }, data: {}, grid: {}, gridVersion: 0, pos: {}, sync: {}, zeller: {}, staffId: undefined, unlocked: true };
const snap = (o: { cash?: TrainSnap['cash']; sales?: number; sheets?: number; last?: { tendered: number; change: number }; kinds?: string[] } = {}): TrainSnap =>
  snapOf({ tab: 'checkout', route: 'pay', sheets: o.sheets, cash: o.cash, lastSaleCash: o.last, lastSaleKinds: o.kinds, cart: { lines: [] }, sales: o.sales ?? 0, paying: true });
const until = (list: any[], id: string) => list.find(x => x.id === id).until;
const won = (list: any[], id: string, s: TrainSnap) => isMet(until(list, id), s, noEvents());
const price = (cart: any) => priceCart(cart, { variants: Object.fromEntries(FIXTURE_VARIANTS.map(v => [v.id, v])), collectionsOfProduct: {}, autoDiscounts: [], bundles: null });

test('the course is registered after the card course, is valid, and the terminal taps the card by itself', () => {
  assert.equal(getModule('pay-cash'), payCash); assert.ok(MODULES.findIndex(m => m.id === 'pay-cash') > MODULES.findIndex(m => m.id === 'pay-card'));
  assert.deepEqual(validateModule(payCash, isKnownSpot), []); assert.equal(payCash.card, 'auto'); assert.ok(payCash.routes.includes('pay'));
});
test('Guide steps follow what has been tapped into the Cash window', () => {
  const at = (received: number, step: 'receive' | 'change' = 'receive') => snap({ cash: { received, due: 1400, step } });
  assert.ok(!won(payCash.guide, 'g-ten', at(500))); assert.ok(won(payCash.guide, 'g-ten', at(1000))); assert.ok(!won(payCash.guide, 'g-ten', at(1000, 'change')), 'only on the receive step');
  assert.ok(won(payCash.guide, 'g-five', at(1500))); assert.ok(won(payCash.guide, 'g-undo', at(1000))); assert.ok(!won(payCash.guide, 'g-undo', at(1500)));
  assert.ok(won(payCash.guide, 'g-ten2', at(2000))); assert.ok(!won(payCash.guide, 'g-ten2', snap()), 'a closed window is not a total');
  assert.ok(!won(payCash.guide, 'g-give', snap())); assert.ok(won(payCash.guide, 'g-give', snap({ sales: 1 })));
  assert.ok(!won(payCash.guide, 'g-receipt', snap({ sales: 1, sheets: 1 }))); assert.ok(won(payCash.guide, 'g-receipt', snap({ sales: 1, sheets: 0 })));
});
test('Check goals are won only by the right cash sale, with the receipt closed', () => {
  const done = (tendered: number, change: number, sheets = 0) => snap({ sales: 1, sheets, last: { tendered, change } });
  assert.ok(won(payCash.check1, 'c1-exact', done(800, 0))); assert.ok(!won(payCash.check1, 'c1-exact', done(1000, 200))); assert.ok(!won(payCash.check1, 'c1-exact', done(800, 0, 1)), 'the Receipt window must be closed');
  assert.ok(won(payCash.check1, 'c1-change', done(2000, 600))); assert.ok(!won(payCash.check1, 'c1-change', done(1500, 100)));
  assert.ok(won(payCash.check2, 'c2-short', done(1500, 100))); assert.ok(!won(payCash.check2, 'c2-short', done(2000, 600)), 'the $20 route is not the one asked for');
  assert.ok(won(payCash.check2, 'c2-rounding', done(745, 0))); assert.ok(!won(payCash.check2, 'c2-rounding', done(744, 0)));
  assert.ok(won(payCash.check2, 'c2-no-change', snap({ sales: 1, sheets: 0 })), 'any finished sale counts once the problem is dealt with'); assert.ok(!won(payCash.check2, 'c2-no-change', snap({ sales: 0 })));
});
test('the "cash only" goals walk a person back from the wrong way of paying', () => {
  const w = payCash.check1[0].watch!; const open = w.find(x => x.id === 'wrong-way-open')!; const doneW = w.find(x => x.id === 'wrong-way-done')!;
  assert.ok(open.when(snap({}) as any) === false); assert.ok(open.when({ ...snap({}), payOpen: 'gift' } as any)); assert.ok(!open.when({ ...snap({}), payOpen: 'cash' } as any), 'the Cash window itself is fine');
  assert.ok(doneW.when({ ...snap({}), lastSaleKinds: ['card'] } as any)); assert.ok(!doneW.when({ ...snap({}), lastSaleKinds: ['cash'] } as any));
});
test('the rounding scenario really is $7.44 in the cart and $7.45 in cash', () => {
  const g = payCash.check2.find(x => x.id === 'c2-rounding')!; const cart = applyInjections(buildSandbox(real), g.inject).pos.cart;
  const net = price(cart).netCents; assert.equal(net, 744); assert.equal(cashDue(net, net, true), 745); assert.equal(cashDue(net, net, false), 744, 'card is not rounded');
});
test('the no-change scenario really cannot make $6.00 change, and offers $10.00 cash plus the rest', () => {
  const g = payCash.check2.find(x => x.id === 'c2-no-change')!; const sb = applyInjections(buildSandbox(real), g.inject); const drawer = sb.pos.ledger.counts;
  assert.equal(cashStatus(1400, 2000).state, 'change'); assert.equal(planChange(addCounts(drawer, { '2000': 1 }), 600).kind, 'impossible');
  assert.deepEqual(partCashOption(drawer, { '2000': 1 }, 1400), { cashCents: 1000, restCents: 400 });
  const normal = buildSandbox(real).pos.ledger.counts; assert.notEqual(planChange(addCounts(normal, { '2000': 1 }), 600).kind, 'impossible', 'the normal practice drawer can make the change the Guide asks for');
});
test('Check 2 problems are injected, and each says where it was taught', () => {
  for (const g of payCash.check2) { assert.ok(g.inject?.length && g.taughtBy, g.id); assert.ok([...payCash.info.steps, ...payCash.show.steps, ...payCash.guide].some(s => s.id === g.taughtBy), `${g.id} names a real step`); }
});
