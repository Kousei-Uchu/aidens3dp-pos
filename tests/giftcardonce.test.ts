// Location: tests/giftcardonce.test.ts
// Gift-card charges and credits are retry-safe (0240, from the B8 review): Shopify has no idempotency key, so a call whose reply was
// lost must be recognised on the retry from its note in the card's history, and must never be sent twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onceDecision, debitNote } from '../src/lib/shopify/giftCardOnce';

test('a charge that is not in the history is sent; one that is, is not sent again', () => {
  assert.equal(onceDecision([], 'debit', 2000, 'POS sale abcd1234 tender 1'), 'todo');
  assert.equal(onceDecision([{ kind: 'debit', cents: -2000, note: 'POS sale abcd1234 tender 1' }], 'debit', 2000, 'POS sale abcd1234 tender 1'), 'done');
});
test('Shopify returns a debit as a negative amount, and it still matches', () => {
  assert.equal(onceDecision([{ kind: 'debit', cents: -2000, note: 'n' }], 'debit', 2000, 'n'), 'done');
  assert.equal(onceDecision([{ kind: 'credit', cents: 2000, note: 'n' }], 'credit', 2000, 'n'), 'done');
});
test('a credit with the same note does not count as the charge, and the reverse', () => {
  assert.equal(onceDecision([{ kind: 'credit', cents: 2000, note: 'n' }], 'debit', 2000, 'n'), 'todo');
  assert.equal(onceDecision([{ kind: 'debit', cents: -2000, note: 'n' }], 'credit', 2000, 'n'), 'todo');
});
test('the same note for another amount stops with a message, rather than guessing', () => {
  assert.throws(() => onceDecision([{ kind: 'debit', cents: -1500, note: 'n' }], 'debit', 2000, 'n'), /different amount/);
});
test('the Nth payment of a sale has the same reference on every retry, and the next payment has another', () => {
  assert.equal(debitNote('abcd1234-ffff', 0), 'POS sale abcd1234 tender 1');
  assert.equal(debitNote('abcd1234-ffff', 0), debitNote('abcd1234-ffff', 0));
  assert.notEqual(debitNote('abcd1234-ffff', 0), debitNote('abcd1234-ffff', 1));
});
test('the Payment screen charges through the retry-safe call, with that reference', () => {
  const pay = readFileSync('src/screens/Pay.tsx', 'utf8');
  assert.match(pay, /await debitGiftCardOnce\(info\.id, amt, debitNote\(uuid, tenders\.length\)\)/);
  assert.doesNotMatch(pay, /await debitGiftCard\(/);
  const g = readFileSync('src/lib/shopify/giftcards.ts', 'utf8');
  assert.match(g, /export async function debitGiftCardOnce[\s\S]*?onceDecision\([\s\S]*?'debit'/);
  assert.match(g, /export async function creditGiftCardOnce[\s\S]*?onceDecision\([\s\S]*?'credit'/);
});
