// Location: tests/giftcode.test.ts
// A9.5: gift card QR prefix handling.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stripGiftPrefix, normaliseCode, giftQrPayload, isGiftQr } from '../src/lib/giftCode';

test('strips the versioned prefix, any version number', () => {
  assert.equal(stripGiftPrefix('shopify-giftcard-v1-ABCD1234EFGH5678'), 'ABCD1234EFGH5678');
  assert.equal(stripGiftPrefix('shopify-giftcard-v2-ABCD'), 'ABCD');
  assert.equal(stripGiftPrefix('shopify-giftcard-v10-ABCD'), 'ABCD');
  assert.equal(stripGiftPrefix('  SHOPIFY-GIFTCARD-V3-ABCD \n'), 'ABCD');
});

test('leaves codes without the prefix alone, including codes that contain hyphens', () => {
  assert.equal(stripGiftPrefix('ABCD1234'), 'ABCD1234');
  assert.equal(stripGiftPrefix('ABCD-EFGH-IJKL'), 'ABCD-EFGH-IJKL'); // the loose "(?:.*-)?(.*)" regex would have cut this to IJKL
  assert.equal(stripGiftPrefix('shopify-giftcard-ABCD'), 'shopify-giftcard-ABCD'); // no version part = not our prefix
  assert.equal(stripGiftPrefix('xshopify-giftcard-v1-ABCD'), 'xshopify-giftcard-v1-ABCD'); // anchored at the start
});

test('normaliseCode strips the prefix first, then punctuation and case', () => {
  assert.equal(normaliseCode('shopify-giftcard-v1-abcd-1234'), 'ABCD1234');
  assert.equal(normaliseCode('abcd 1234'), 'ABCD1234');
  assert.equal(normaliseCode('ABCD1234'), 'ABCD1234');
});

test('QR payload round trips', () => {
  const q = giftQrPayload('abcd-1234');
  assert.equal(q, 'shopify-giftcard-v1-ABCD1234');
  assert.equal(normaliseCode(q), 'ABCD1234');
  assert.equal(giftQrPayload('abcd1234', 2), 'shopify-giftcard-v2-ABCD1234');
});

test('isGiftQr only matches the prefix', () => {
  assert.equal(isGiftQr('shopify-giftcard-v1-ABCD'), true);
  assert.equal(isGiftQr('9300675024235'), false);
  assert.equal(isGiftQr('ABCD-EFGH'), false);
});
