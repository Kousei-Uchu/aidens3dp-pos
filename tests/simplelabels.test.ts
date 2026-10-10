// Location: tests/simplelabels.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { cartEmptyText, cashHint, chargeHint, customerRowText, payHint, payQuestion, payTitle, qtyHint } from '../src/lib/simpleLabels';

test('with explanations off the wording is exactly today\'s', () => {
  assert.equal(payTitle('card', false, 1250), 'Card — $12.50'); assert.equal(payTitle('cash', false, 1250), 'Cash');
  assert.equal(payTitle('gift', false, 1250), 'Gift card'); assert.equal(payTitle('split', false, 1250), 'Split amount');
  assert.equal(cartEmptyText(false), 'Cart is empty'); assert.equal(customerRowText(false), 'Add customer');
  for (const m of ['card', 'cash', 'gift', 'split'] as const) assert.equal(payHint(m, false), undefined);
  assert.equal(qtyHint(false), undefined); assert.equal(chargeHint(false), undefined); assert.equal(cashHint(false), undefined); assert.equal(payQuestion(false, true), undefined);
});
test('with explanations on every payment button says what it does', () => {
  assert.equal(payTitle('card', true, 1250), 'Pay by card  $12.50');
  for (const m of ['card', 'cash', 'gift', 'split'] as const) assert.ok((payHint(m, true) ?? '').length > 25, m);
  assert.equal(payQuestion(true, true), 'How is the customer paying?'); assert.equal(payQuestion(true, false), undefined);
  assert.match(customerRowText(true), /optional/); assert.equal(customerRowText(true, 'Sam'), 'Sam'); assert.equal(customerRowText(true, '', true), 'Customer');
  assert.match(cartEmptyText(true), /Tap an item/); assert.match(chargeHint(true) ?? '', /Nothing is taken/);
});
