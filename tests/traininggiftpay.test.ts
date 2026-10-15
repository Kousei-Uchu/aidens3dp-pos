// Location: tests/traininggiftpay.test.ts
// The "Check and pay with a gift card" course: valid, registered, the Guide follows the card window, each Check goal is
// won only by the right card and tender, and the practice gift cards behave without Shopify.
import test from 'node:test';
import assert from 'node:assert/strict';
import { giftPay } from '../src/training/modules/gift-pay';
import { MODULES, getModule } from '../src/training';
import { validateModule, type TrainSnap } from '../src/lib/trainingModule';
import { isKnownSpot, SPOT } from '../src/lib/trainingSpots';
import { isMet, noEvents, snapOf, type Events } from '../src/lib/trainingConds';
import { capturePracticeGifts, practiceDebitGiftCard, practiceGiftCardHistory, practiceLookupGiftCard, resetPracticeGifts, restorePracticeGifts } from '../src/lib/trainingGifts';

const BEE = 'train-v-bee', EGG = 'train-v-egg';
const snap = (o: { lines?: string[]; sales?: number; sheets?: number; giftCode?: string; giftCheck?: TrainSnap['giftCheck']; kinds?: string[] } = {}): TrainSnap => snapOf({
  tab: 'checkout', route: 'pay', sheets: o.sheets ?? 0, giftCode: o.giftCode, giftCheck: o.giftCheck, lastSaleKinds: o.kinds,
  cart: { lines: (o.lines ?? []).map(variantId => ({ variantId, qty: 1 })) }, sales: o.sales ?? 0, paying: true,
});
const ev = (...pressed: string[]): Events => ({ pressed: new Set(pressed), visible: new Set() });
const until = (list: any[], id: string) => list.find(x => x.id === id).until;
const won = (list: any[], id: string, s: TrainSnap, e: Events = noEvents()) => isMet(until(list, id), s, e);
const full = { code: 'GIFT25', found: true, enabled: true, balanceCents: 2500 };
const off = { code: 'GIFTOFF', found: true, enabled: false, balanceCents: 1000 };

test('the course is registered next to Sell a gift card, is valid, and covers the cart and the Payment page', () => {
  assert.equal(getModule('gift-pay'), giftPay); assert.ok(MODULES.findIndex(m => m.id === 'gift-pay') > MODULES.findIndex(m => m.id === 'gift-sell'));
  assert.deepEqual(validateModule(giftPay, isKnownSpot), []); assert.ok(giftPay.routes.includes('cart') && giftPay.routes.includes('pay'));
});

test('Guide steps follow the card window and the gift card paying the sale', () => {
  assert.ok(!won(giftPay.guide, 'g-add-bee', snap())); assert.ok(won(giftPay.guide, 'g-add-bee', snap({ lines: [BEE] })));
  assert.ok(!won(giftPay.guide, 'g-gift', snap(), ev(SPOT.payCard))); assert.ok(won(giftPay.guide, 'g-gift', snap(), ev(SPOT.payGift)));
  assert.ok(!won(giftPay.guide, 'g-code', snap({ giftCode: 'GIF' }))); assert.ok(won(giftPay.guide, 'g-code', snap({ giftCode: 'gift25' })), 'the code is read in any case');
  assert.ok(!won(giftPay.guide, 'g-check', snap({ giftCode: 'GIFT25' })), 'keying the code is not enough, the balance has to be checked');
  assert.ok(won(giftPay.guide, 'g-check', snap({ giftCheck: full })));
  assert.ok(!won(giftPay.guide, 'g-use', snap())); assert.ok(won(giftPay.guide, 'g-use', snap({ sales: 1 })));
  assert.ok(!won(giftPay.guide, 'g-wait', snap(), ev())); assert.ok(won(giftPay.guide, 'g-wait', snap(), { pressed: new Set(), visible: new Set([SPOT.receiptNone]) }));
  assert.ok(!won(giftPay.guide, 'g-receipt', snap({ sales: 1, sheets: 1 }))); assert.ok(won(giftPay.guide, 'g-receipt', snap({ sales: 1, sheets: 0 })));
});

test('Check goals are won only by the right card and the right tenders', () => {
  assert.ok(!won(giftPay.check1, 'balance', snap({ giftCheck: { code: 'GIFT05', found: true, enabled: true, balanceCents: 500 } })), 'another card is not the goal');
  assert.ok(won(giftPay.check1, 'balance', snap({ giftCheck: full })));
  assert.ok(!won(giftPay.check1, 'pay-full', snap({ sales: 1, kinds: ['gift_card', 'card'] })), 'a partly paid sale is not paid in full from the card');
  assert.ok(won(giftPay.check1, 'pay-full', snap({ sales: 1, kinds: ['gift_card'] })));
});

test('Check 2 needs the short card taken first, and the disabled card checked before paying by card', () => {
  assert.ok(!won(giftPay.check2, 'part', snap({ sales: 1, kinds: ['card'] })), 'the card has to be used first');
  assert.ok(won(giftPay.check2, 'part', snap({ sales: 1, kinds: ['gift_card', 'card'] })));
  assert.ok(!won(giftPay.check2, 'off', snap({ sales: 2, kinds: ['card'] })), 'the disabled card has to be checked');
  assert.ok(!won(giftPay.check2, 'off', snap({ sales: 2, kinds: ['card'], giftCheck: full })), 'an active card is not the goal');
  assert.ok(won(giftPay.check2, 'off', snap({ sales: 2, kinds: ['card'], giftCheck: off })));
  assert.equal(giftPay.check2.find(x => x.id === 'off')!.taughtBy, 'off');
});

test('the practice cards are checked, charged, and put back when a part starts again', () => {
  resetPracticeGifts();
  const found = practiceLookupGiftCard('GIFT25');
  assert.equal(found?.balanceCents, 2500); assert.equal(found?.enabled, true);
  assert.equal(practiceLookupGiftCard('no-such-card'), null);
  assert.equal(practiceLookupGiftCard('GIFT25')?.verified, true, 'a practice card is verified, so nothing is checked with Shopify');

  const small = practiceLookupGiftCard('gift05'); assert.ok(small); practiceDebitGiftCard(small.id, 500);
  assert.equal(practiceLookupGiftCard('GIFT05')?.balanceCents, 0, 'a card is charged down');
  const hist = practiceGiftCardHistory(small.id);
  assert.equal(hist.length, 1); assert.equal(hist[0].cents, 500); assert.equal(hist[0].kind, 'debit');

  const offCard = practiceLookupGiftCard('GIFTOFF'); assert.ok(offCard); practiceDebitGiftCard(offCard.id, 1000);
  assert.equal(practiceLookupGiftCard('GIFTOFF')?.balanceCents, 1000, 'a disabled card is never charged');

  const held = capturePracticeGifts(); const card = practiceLookupGiftCard('GIFT25'); assert.ok(card);
  practiceDebitGiftCard(card.id, 1000); assert.equal(practiceLookupGiftCard('GIFT25')?.balanceCents, 1500);
  restorePracticeGifts(held); assert.equal(practiceLookupGiftCard('GIFT25')?.balanceCents, 2500, 'putting the cards back undoes a charge');

  resetPracticeGifts(); assert.equal(practiceLookupGiftCard('GIFT25')?.balanceCents, 2500, 'a fresh run puts the cards back as new');
});
