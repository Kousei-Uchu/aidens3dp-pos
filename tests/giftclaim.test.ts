// Location: tests/giftclaim.test.ts
// A10: claim links. The app (noble hmac) and the Worker (WebCrypto) must produce and accept the same signatures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { claimSig as appSig, claimUrl } from '../src/lib/giftClaim';
import { claimSig as workerSig, verifyClaimToken, validateClaim, codeChecksum, formPage, messagePage } from '../gift-claim-server/src/claim';

const secret = 'test-claim-secret-0123456789abcdef'; const code = 'ABCD1234EFGH5678';

test('app and Worker agree on the signature', async () => {
  assert.equal(appSig(secret, code), await workerSig(secret, code));
  assert.equal(appSig(secret, 'abcd-1234 efgh-5678'), appSig(secret, code), 'normalised before signing');
  assert.equal(appSig(secret, 'shopify-giftcard-v1-ABCD1234EFGH5678'), appSig(secret, code), 'QR prefix ignored');
});
test('claimUrl builds a link the Worker accepts', async () => {
  const u = claimUrl('https://gift.example.workers.dev/', secret, code)!;
  assert.match(u, /^https:\/\/gift\.example\.workers\.dev\/c\/ABCD1234EFGH5678\.[0-9a-f]{32}$/);
  assert.equal(await verifyClaimToken(secret, u.split('/c/')[1]), code);
});
test('claimUrl refuses to build an unusable link', () => {
  assert.equal(claimUrl('', secret, code), null);
  assert.equal(claimUrl('http://insecure.example', secret, code), null);
  assert.equal(claimUrl('https://x.example', '', code), null);
  assert.equal(claimUrl('https://x.example', secret, 'SHORT'), null);
});
test('the Worker rejects forged, edited or malformed tokens', async () => {
  const good = `${code}.${await workerSig(secret, code)}`;
  assert.equal(await verifyClaimToken(secret, good), code);
  assert.equal(await verifyClaimToken('other-secret', good), null, 'wrong secret');
  assert.equal(await verifyClaimToken(secret, `ZZZZ1234EFGH5678.${await workerSig(secret, code)}`), null, 'edited code');
  assert.equal(await verifyClaimToken(secret, `${code}.${'0'.repeat(32)}`), null, 'bad signature');
  assert.equal(await verifyClaimToken(secret, code), null, 'no signature');
  assert.equal(await verifyClaimToken('', good), null, 'no secret configured');
  assert.equal(await verifyClaimToken(secret, `${code}.${(await workerSig(secret, code)).toUpperCase()}`), null, 'uppercase hex');
});
test('claim form validation', () => {
  const ok = validateClaim({ name: '  Sam   Lee ', email: ' Sam@Example.COM ', message: 'Happy birthday' });
  assert.deepEqual(ok, { ok: true, value: { name: 'Sam Lee', email: 'sam@example.com', message: 'Happy birthday' } });
  for (const bad of [{ name: '' }, { name: 'x'.repeat(101) }, { email: 'nope' }, { email: 'a@b' }, { email: 'a b@c.com' }, { message: 'm'.repeat(201) }]) {
    assert.equal(validateClaim({ name: 'Sam', email: 'sam@example.com', message: '', ...bad }).ok, false, JSON.stringify(bad));
  }
});
test('checksum matches the POS note format (first 10 hex of SHA-256 of the normalised code)', async () => {
  const { createHash } = await import('node:crypto');
  assert.equal(await codeChecksum('abcd-1234-efgh-5678'), createHash('sha256').update(code).digest('hex').slice(0, 10));
});
test('pages escape visitor input', () => {
  const html = formPage('Shop <b>', '1234', { name: '"><script>x</script>', email: 'a@b.co', message: '' }, '<i>err</i>');
  assert.ok(!html.includes('<script>x</script>') && !html.includes('<i>err</i>') && !html.includes('Shop <b>'));
  assert.ok(messagePage('S', 'T<', 'x').includes('T&lt;'));
});
