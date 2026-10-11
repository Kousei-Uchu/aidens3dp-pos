import test from 'node:test';
import assert from 'node:assert/strict';
import { planRefund, refundableByGateway, splitAcrossGiftCards } from '../src/lib/returns';
import type { Tender } from '../src/lib/types';

const giftTender = (id: string, amountCents: number, giftCardId: string): Tender => ({ id, kind: 'gift_card', amountCents, giftCardId, at: 'now' });

test('original-method refunds are limited to successful gift-card payments', () => {
  const refundable = refundableByGateway([
    { kind: 'SALE', status: 'SUCCESS', gateway: 'Gift card', amountCents: 2500 },
    { kind: 'REFUND', status: 'SUCCESS', gateway: 'Gift card', amountCents: 500 },
  ]);
  assert.deepEqual(refundable, { card: 0, cash: 0, gift_card: 2000 });
  assert.deepEqual(planRefund(1800, 'original', refundable), { plan: { gift_card: 1800 }, shortBy: 0 });
});

test('refund credits are split across the original cards and capped at each tender', () => {
  const tenders: Tender[] = [giftTender('g1', 700, 'card-1'), { id: 'cash', kind: 'cash', amountCents: 1000, at: 'now' }, giftTender('g2', 900, 'card-2')];
  assert.deepEqual(splitAcrossGiftCards(1200, tenders).map(x => [x.tender.id, x.cents]), [['g1', 700], ['g2', 500]]);
});

test('a return cannot credit more to original gift cards than those cards funded', () => {
  assert.equal(splitAcrossGiftCards(2000, [giftTender('g1', 750, 'card-1')]).reduce((sum, part) => sum + part.cents, 0), 750);
});

test('later original-method refunds account for prior credits to each original card', () => {
  const parts = splitAcrossGiftCards(500, [giftTender('g1', 700, 'card-1'), giftTender('g2', 900, 'card-2')], { 'g1:0': 600 });
  assert.deepEqual(parts.map(x => [x.tender.id, x.cents]), [['g1', 100], ['g2', 400]]);
});
