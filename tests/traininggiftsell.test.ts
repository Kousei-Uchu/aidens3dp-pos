// Location: tests/traininggiftsell.test.ts
// The "Sell a gift card" course: valid, registered, the Guide follows the Sell gift card window, each Check goal is won
// only by the right kind of gift card, and the practice injects behave.
import test from 'node:test';
import assert from 'node:assert/strict';
import { giftSell } from '../src/training/modules/gift-sell';
import { MODULES, getModule } from '../src/training';
import { validateModule, type TrainSnap } from '../src/lib/trainingModule';
import { isKnownSpot, SPOT, giftHowSpot, giftPresetSpot } from '../src/lib/trainingSpots';
import { isMet, noEvents, snapOf, type Events } from '../src/lib/trainingConds';
import { applyInjections, buildSandbox } from '../src/lib/trainingSandbox';

const real: any = { settings: { staff: [], requirePin: false, receipt: {} }, data: {}, grid: {}, gridVersion: 0, pos: {}, sync: {}, zeller: {}, staffId: undefined, unlocked: true };
const snap = (o: { lines?: { kind?: 'item' | 'custom' | 'gift_card'; unitCents?: number }[]; sales?: number; sheets?: number; lastGift?: TrainSnap['lastGift'] } = {}): TrainSnap =>
  snapOf({ tab: 'checkout', route: 'pay', sheets: o.sheets, lastGift: o.lastGift, cart: { lines: (o.lines ?? []).map(l => ({ qty: 1, ...l })) }, sales: o.sales ?? 0, paying: true });
const gift = (cents: number) => ({ kind: 'gift_card' as const, unitCents: cents });
const ev = (...ids: string[]): Events => ({ pressed: new Set(ids), visible: new Set() });
const until = (list: any[], id: string) => list.find(x => x.id === id).until;
const won = (list: any[], id: string, s: TrainSnap, e: Events = noEvents()) => isMet(until(list, id), s, e);

test('the course is registered with the checkout courses, is valid, and covers the cart and the Payment page', () => {
  assert.equal(getModule('gift-sell'), giftSell); assert.ok(MODULES.findIndex(m => m.id === 'gift-sell') > MODULES.findIndex(m => m.id === 'pay-card'));
  assert.deepEqual(validateModule(giftSell, isKnownSpot), []); assert.ok(giftSell.routes.includes('cart') && giftSell.routes.includes('pay'));
});

test('Guide steps follow the cart menu, the Sell gift card window, and the card sale finishing', () => {
  assert.ok(!won(giftSell.guide, 'g-gift', snap(), ev())); assert.ok(won(giftSell.guide, 'g-gift', snap(), ev(SPOT.cartMenuGift)));
  assert.ok(!won(giftSell.guide, 'g-window', snap(), ev()));
  assert.ok(!won(giftSell.guide, 'g-preset', snap(), ev(giftPresetSpot(5000)))); // only the $25.00 preset moves the step on
  assert.ok(won(giftSell.guide, 'g-preset', snap(), ev(giftPresetSpot(2500))));
  assert.ok(!won(giftSell.guide, 'g-add', snap({ lines: [] }))); assert.ok(won(giftSell.guide, 'g-add', snap({ lines: [gift(2500)] })));
  assert.ok(!won(giftSell.guide, 'g-wait', snap(), ev())); assert.ok(won(giftSell.guide, 'g-wait', snap(), { pressed: new Set(), visible: new Set([SPOT.receiptNone]) }));
  assert.ok(!won(giftSell.guide, 'g-receipt', snap({ sales: 1, sheets: 1 }))); assert.ok(won(giftSell.guide, 'g-receipt', snap({ sales: 1, sheets: 0 })));
});

test('Check goals are won only by the right kind of gift card', () => {
  assert.ok(won(giftSell.check1, 'keyed-amount', snap({ lines: [gift(3000)] })));
  assert.ok(!won(giftSell.check1, 'keyed-amount', snap({ lines: [gift(2500)] })), 'a different amount is not the goal');
  assert.ok(!won(giftSell.check1, 'keyed-amount', snap({ lines: [gift(3000)], sheets: 1 })), 'the window must be closed');
  assert.ok(!won(giftSell.check1, 'sell-and-pay', snap({ sales: 1, sheets: 1 }))); assert.ok(won(giftSell.check1, 'sell-and-pay', snap({ sales: 1, sheets: 0 })));
});

test('the emailed goal needs an emailed card, and the declined goal just needs the sale to finish', () => {
  assert.ok(!won(giftSell.check2, 'emailed-card', snap({ sales: 2, sheets: 0, lastGift: { cents: 5000, how: 'hand', email: '' } })), 'a handover card is not an emailed one');
  assert.ok(!won(giftSell.check2, 'emailed-card', snap({ sales: 1, sheets: 0, lastGift: { cents: 5000, how: 'email', email: 'priya@example.com' } })), 'the sale still has to finish');
  assert.ok(won(giftSell.check2, 'emailed-card', snap({ sales: 2, sheets: 0, lastGift: { cents: 5000, how: 'email', email: 'priya@example.com' } })));
  assert.ok(!won(giftSell.check2, 'declined-card', snap({ sales: 1, sheets: 1 }))); assert.ok(won(giftSell.check2, 'declined-card', snap({ sales: 1, sheets: 0 })));
});

test('Check 2 problems are injected, and each says where it was taught', () => {
  for (const g of giftSell.check2) { assert.ok(g.inject?.length && g.taughtBy, g.id); assert.ok([...giftSell.info.steps, ...giftSell.show.steps, ...giftSell.guide].some(s => s.id === g.taughtBy), `${g.id} names a real step`); }
  assert.ok(giftSell.check2.some(g => g.inject?.some(i => i.kind === 'decline')), 'a declined card is practised');
});

test('the practice cart for the first goal starts empty, so the card must be added', () => {
  const g = giftSell.check1.find(x => x.id === 'keyed-amount')!;
  const cart = applyInjections(buildSandbox(real), g.inject).pos.cart;
  assert.equal(cart.lines.length, 0);
});

test('the gift window spots are the ones the module points at', () => {
  assert.ok(isKnownSpot(SPOT.cartMenuGift)); assert.ok(isKnownSpot(giftPresetSpot(2500)));
  assert.ok(isKnownSpot(giftHowSpot('hand'))); assert.ok(isKnownSpot(giftHowSpot('email')));
  assert.ok(isKnownSpot(SPOT.giftKeys)); assert.ok(isKnownSpot(SPOT.giftNext)); assert.ok(isKnownSpot(SPOT.giftAdd)); assert.ok(isKnownSpot(SPOT.giftChange)); assert.ok(isKnownSpot(SPOT.giftEmail));
});
