// Location: tests/trainingrefund.test.ts
// The "Refunds and exchanges" course: registered, valid, finished only by the right thing, and the practice orders behave like real ones.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { refund } from '../src/training/modules/refund';
import { MODULES, getModule } from '../src/training';
import { validateModule, type TrainSnap } from '../src/lib/trainingModule';
import { SPOT, isKnownSpot, isWindowSpot, orderRowSpot, refundMethodSpot, refundModeSpot, refundPickSpot, refundPlusSpot, refundReasonSpot, refundReplSpot } from '../src/lib/trainingSpots';
import { isMet, noEvents, snapOf } from '../src/lib/trainingConds';
import { stepRules } from '../src/lib/trainingCourse';
import { FIXTURE_VARIANTS, declinesOf, declineCodeOf } from '../src/lib/trainingSandbox';
import { PRACTICE_ORDER_CARD, PRACTICE_ORDER_CARD2, PRACTICE_ORDER_CASH, applyPracticeRefund, capturePracticeOrders, fixtureOrders, getLastPracticeRefund, getPracticeOrder, listPracticeOrders, resetPracticeOrders, restorePracticeOrders } from '../src/lib/trainingOrders';
import { refundableByGateway } from '../src/lib/returns';
import { RESPONSE_CODES } from '../src/lib/responseCodes';

type R = NonNullable<TrainSnap['refund']>;
const snap = (o: { sheets?: number; route?: string; tab?: string; refund?: R; lines?: any[] } = {}): TrainSnap => snapOf({ tab: o.tab ?? 'more', route: o.route ?? '', sheets: o.sheets ?? 0, cart: { lines: o.lines ?? [] }, sales: 0, paying: false, refund: o.refund });
const rf = (n: number, orderId: string, cents: number, kinds: string[], items = 1, restock = true): R => ({ n, orderId, cents, kinds, items, restock });
const by = (list: any[], id: string) => list.find(x => x.id === id);
const ev = (pressed: string[] = [], visible: string[] = []) => ({ pressed: new Set(pressed), visible: new Set(visible) });
const O1 = PRACTICE_ORDER_CARD; const O2 = PRACTICE_ORDER_CASH; const O3 = PRACTICE_ORDER_CARD2;

test('the course is registered, comes before the deals course, and is valid', () => {
  assert.equal(getModule('refund'), refund); assert.equal(MODULES.indexOf(refund) + 1, MODULES.findIndex(m => m.id === 'bundles-deals'));
  assert.deepEqual(validateModule(refund, isKnownSpot), []); assert.ok(refund.tabs.includes('more')); assert.ok(refund.routes.includes('orders'));
});

test('every record spot the course names exists in the practice data', () => {
  const orders = fixtureOrders(); const lines = new Set(orders.flatMap(o => o.lines.map(l => l.id))); const ids = new Set(orders.map(o => o.id)); const variants = new Set(FIXTURE_VARIANTS.map(v => v.id));
  const all = [...refund.guide.flatMap(s => [s.target, s.recover?.target, ...(s.recoverFrom ?? []).map(r => r.target), s.until.kind === 'press' ? s.until.id : undefined]), ...[...refund.check1, ...refund.check2].flatMap(g => [g.reveal, g.via, g.until.kind === 'press' ? g.until.id : undefined])].filter(Boolean) as string[];
  for (const s of all) {
    if (s.startsWith('order.row:')) assert.ok(ids.has(s.slice(10)), s); if (s.startsWith('refund.plus:')) assert.ok(lines.has(s.slice(12)), s);
    if (s.startsWith('refund.pick:') || s.startsWith('refund.repl:')) assert.ok(variants.has(s.slice(12)), s);
  }
  assert.ok(isWindowSpot(refundPickSpot('x')) && isWindowSpot(SPOT.ordersRefund) && isWindowSpot(SPOT.refundDone) && isWindowSpot(SPOT.cashGave));
  for (const s of refund.guide.filter(x => x.target && isWindowSpot(x.target))) assert.equal(stepRules(s).at?.sheets, true, s.id);
});

test('the refund screens carry the spots the course points at', () => {
  const ref = fs.readFileSync('src/screens/Refund.tsx', 'utf8'); const ord = fs.readFileSync('src/screens/Orders.tsx', 'utf8'); const more = fs.readFileSync('src/screens/More.tsx', 'utf8'); const cash = fs.readFileSync('src/screens/CashSheet.tsx', 'utf8');
  for (const t of ['SPOT.refundMode', 'SPOT.refundMethod', 'SPOT.refundRestock', 'SPOT.refundReplace', 'SPOT.refundGo', 'SPOT.refundDone', 'refundPlusSpot(', 'refundMinusSpot(', 'refundReasonSpot(', 'refundPickSpot(', 'refundReplSpot(', 'refundModeSpot(', 'refundMethodSpot(']) assert.ok(ref.includes(t), t);
  assert.ok(ord.includes('orderRowSpot(') && ord.includes('SPOT.ordersRefund')); assert.ok(more.includes('SPOT.moreOrders')); assert.ok(cash.includes('SPOT.cashGave'));
});

test('Orders and the refund run on practice data only while training: no Shopify call is reachable', () => {
  const ord = fs.readFileSync('src/screens/Orders.tsx', 'utf8'); assert.ok(ord.indexOf('isTraining() ? listPracticeOrders') >= 0); assert.ok(ord.indexOf('if (isTraining()) markPracticeFulfilled') >= 0);
  const flow = fs.readFileSync('src/lib/refundFlow.ts', 'utf8'); assert.ok(flow.indexOf('if (isTraining()) applyPracticeRefund') < flow.indexOf('await refundOrderInShopify')); assert.ok(flow.indexOf('plan.gift_card && isTraining()') < flow.indexOf('creditGiftCardOnce('));
});

test('Guide steps are finished by the right press or state', () => {
  const g = (id: string) => by(refund.guide, id).until;
  assert.ok(isMet(g('g-more'), snap({ tab: 'more' }), noEvents())); assert.ok(!isMet(g('g-more'), snap({ tab: 'checkout' }), noEvents()));
  assert.ok(isMet(g('g-orders'), snap({ route: 'orders' }), noEvents())); assert.ok(!isMet(g('g-orders'), snap({ route: '' }), noEvents()));
  const presses: [string, string][] = [['g-open', orderRowSpot(O1)], ['g-refund-btn', SPOT.ordersRefund], ['g-plus', refundPlusSpot('train-ol-1001-b')], ['g-reason', refundReasonSpot('Returned Goods')], ['g-method-cash', refundMethodSpot('cash')], ['g-method-gift', refundMethodSpot('gift')], ['g-method-orig', refundMethodSpot('original')],
    ['g-amount', refundModeSpot('amount')], ['g-items-back', refundModeSpot('items')], ['g-replace', SPOT.refundReplace], ['g-pick', refundPickSpot('train-v-cow-l')], ['g-unswap', refundReplSpot('train-v-cow-l')], ['g-go', SPOT.refundGo], ['g-done', SPOT.refundDone], ['g-open2', orderRowSpot(O2)], ['g-plus2', refundPlusSpot('train-ol-1002-a')], ['g-cash', SPOT.cashGave], ['g-done2', SPOT.refundDone]];
  for (const [step, spot] of presses) { assert.ok(isMet(g(step), snap(), ev([spot])), step); assert.ok(!isMet(g(step), snap(), ev(['something.else'])), `${step} needs its own button`); }
  assert.ok(isMet(g('g-confirm'), snap({ refund: rf(1, O1, 600, ['card']) }), noEvents())); assert.ok(!isMet(g('g-confirm'), snap({ refund: rf(1, O2, 800, ['cash']) }), noEvents()), 'a refund of another order is not this one'); assert.ok(!isMet(g('g-confirm'), snap(), noEvents()));
  assert.ok(isMet(g('g-go2'), snap({ refund: rf(2, O2, 800, ['cash']) }), noEvents())); assert.ok(!isMet(g('g-go2'), snap({ refund: rf(1, O1, 600, ['card']) }), noEvents()));
});

test('Check goals start unfinished and are finished only by the right refund with the windows shut', () => {
  for (const gl of [...refund.check1, ...refund.check2]) assert.ok(!isMet(gl.until, snap(), noEvents()), `${gl.id} does not start finished`);
  const u = (list: any[], id: string, s: TrainSnap) => isMet(by(list, id).until, s, noEvents());
  assert.ok(u(refund.check1, 'refund-card', snap({ refund: rf(1, O1, 600, ['card']) }))); assert.ok(!u(refund.check1, 'refund-card', snap({ refund: rf(1, O1, 600, ['card']), sheets: 1 })), 'the Done window is still open');
  assert.ok(!u(refund.check1, 'refund-card', snap({ refund: rf(1, O1, 600, ['cash']) })), 'wrong money'); assert.ok(!u(refund.check1, 'refund-card', snap({ refund: rf(1, O1, 1200, ['card'], 2) })), 'two eggs');
  assert.ok(u(refund.check1, 'refund-cash', snap({ refund: rf(2, O2, 800, ['cash']) }))); assert.ok(!u(refund.check1, 'refund-cash', snap({ refund: rf(1, O2, 800, ['cash']) })), 'an old refund does not finish a later goal');
  assert.ok(u(refund.check1, 'refund-gift', snap({ refund: rf(3, O3, 2500, ['gift_card']) }))); assert.ok(!u(refund.check1, 'refund-gift', snap({ refund: rf(3, O3, 2500, ['card']) })));
  assert.ok(u(refund.check2, 'card-expired', snap({ refund: rf(1, O1, 1200, ['cash']) }))); assert.ok(!u(refund.check2, 'card-expired', snap({ refund: rf(1, O1, 1200, ['card']) })), 'card is the thing that fails');
  assert.ok(u(refund.check2, 'damaged', snap({ refund: rf(2, O2, 800, ['cash'], 1, false) }))); assert.ok(!u(refund.check2, 'damaged', snap({ refund: rf(2, O2, 800, ['cash'], 1, true) })), 'it must not be restocked');
  assert.ok(u(refund.check2, 'one-keyring', snap({ refund: rf(3, O2, 500, ['cash']) })));
});

test('a wrong refund or a started swap is spotted, and stale refunds from an earlier goal are not a mistake', () => {
  const w = (list: any[], id: string, wid: string) => by(by(list, id).watch, wid);
  const second = w(refund.check1, 'refund-cash', 'wrong-refund-2'); assert.ok(!second.when(snap({ refund: rf(1, O1, 600, ['card']) })), 'the first goal refund is history'); assert.ok(second.when(snap({ refund: rf(2, O1, 600, ['card']) }))); assert.ok(!second.when(snap({ refund: rf(2, O2, 800, ['cash']) }))); assert.equal(second.fix, 'restart');
  const swap = w(refund.check1, 'refund-card', 'swap-started'); assert.ok(swap.when({ ...snap(), tenders: 1 })); assert.ok(swap.when(snap({ lines: [{ variantId: 'x', title: 'x', kind: 'item', qty: 1 }] }))); assert.ok(!swap.when(snap()));
});

test('Check 2 makes the card refund fail with a real code, says where it was taught, and every goal can use the windows', () => {
  const g = by(refund.check2, 'card-expired'); assert.equal(declinesOf(g.inject), 5); assert.ok(RESPONSE_CODES[declineCodeOf(g.inject)]); assert.equal(declineCodeOf(g.inject), '33'); assert.equal(g.taughtBy, 'g-method-cash'); assert.ok(by(refund.guide, 'g-method-cash'));
  for (const gl of [...refund.check1, ...refund.check2]) { assert.equal(gl.at?.sheets, true, gl.id); assert.deepEqual(gl.allow, ['sale'], gl.id); assert.ok(isKnownSpot(gl.reveal!), gl.id); }
});

test('practice orders: a refund lowers what is left to refund, records the money, and can be put back', () => {
  resetPracticeOrders(); assert.equal(listPracticeOrders('open').length, 3); assert.deepEqual(listPracticeOrders('unfulfilled').map(o => o.id), [O1]); assert.deepEqual(listPracticeOrders('completed').map(o => o.id), [O2, O3]);
  const before = capturePracticeOrders();
  applyPracticeRefund(O1, [{ lineId: 'train-ol-1001-b', qty: 1 }], { card: 600 }, true);
  const o = getPracticeOrder(O1)!; assert.equal(o.lines[1].refundableQty, 1); assert.equal(o.refundedCents, 600); assert.equal(o.financial, 'PARTIALLY_REFUNDED'); assert.deepEqual(refundableByGateway(o.transactions), { card: 1800, cash: 0, gift_card: 0 });
  assert.deepEqual(getLastPracticeRefund(), { n: 1, cents: 600, restock: true, kinds: ['card'], items: 1, orderId: O1 });
  applyPracticeRefund(O2, [{ lineId: 'train-ol-1002-a', qty: 1 }], { cash: 800 }, false); assert.equal(getLastPracticeRefund()!.n, 2); assert.equal(getLastPracticeRefund()!.restock, false);
  restorePracticeOrders(before); assert.equal(getPracticeOrder(O1)!.refundedCents, 0); assert.equal(getLastPracticeRefund(), undefined);
  applyPracticeRefund(O1, [], { cash: 100 }, true); assert.equal(getLastPracticeRefund()!.n, 1, 'the count restarts with the restored history');
  resetPracticeOrders(); assert.equal(getPracticeOrder(O1)!.refundedCents, 0);
  for (const x of fixtureOrders()) { assert.ok(x.id.includes('train-')); for (const l of x.lines) assert.ok(l.id.includes('train-') && FIXTURE_VARIANTS.some(v => v.id === l.variantId)); assert.equal(x.totalCents, x.lines.reduce((n, l) => n + l.qty * l.unitCents, 0)); assert.equal(refundableByGateway(x.transactions).card + refundableByGateway(x.transactions).cash, x.totalCents); }
});

test('the newest sale is read from the front of the list (new sales are added at the front)', () => {
  const host = fs.readFileSync('src/ui/TrainingHost.tsx', 'utf8'); assert.ok(host.includes('app.pos.sales[0].tenders')); assert.ok(!host.includes('sales[app.pos.sales.length - 1]'));
  const sync = fs.readFileSync('src/lib/sync.ts', 'utf8'); assert.ok(sync.includes('sales: [sale, ...s.pos.sales]'));
});
