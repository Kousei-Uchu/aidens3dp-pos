// Location: tests/secretsshared.test.ts
// CloudKit patch 6d, secrets (pure half): the record shape (one encrypted field, plain labels only), what is never written, reading a record
// back, the Shopify login as one secret, and every case of joining this register's copy with the shop's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SECRET_FIELD, SECRET_MAX_BYTES, SECRET_PLAIN_KEYS, badgeSecretName, fingerprint, mergeSecret, packShopify, secretFromParts, secretNameFromRecord, secretRecordName, secretToParts, unpackShopify } from '../src/lib/secretsShared';

test('the secret goes in the one encrypted field and only labels are plain', () => {
  const p = secretToParts('pass', 'hunter2-SECRET', 'reg-a', 1000, 'encrypted')!;
  assert.equal(p.handle, 'pass'); assert.deepEqual(Object.keys(p.plain).sort(), [...SECRET_PLAIN_KEYS].sort()); assert.deepEqual(Object.keys(p.encrypted), [SECRET_FIELD]);
  for (const v of Object.values(p.plain)) assert.ok(!String(v).includes('hunter2'), 'no secret in a plain field');
  assert.ok(String(p.encrypted[SECRET_FIELD]).includes('hunter2-SECRET'));
});
test('omit mode, bad names, empty values and oversized values write nothing', () => {
  assert.equal(secretToParts('pass', 'x', 'r', 1, 'omit'), null);
  assert.equal(secretToParts('bad name', 'x', 'r', 1, 'encrypted'), null); assert.equal(secretToParts('a/b', 'x', 'r', 1, 'encrypted'), null);
  assert.equal(secretToParts('pass', '', 'r', 1, 'encrypted'), null);
  assert.equal(secretToParts('pass', 'x'.repeat(SECRET_MAX_BYTES + 1), 'r', 1, 'encrypted'), null);
  assert.ok(secretToParts('pass', 'x'.repeat(1000), 'r', 1, 'encrypted'));
});
test('record names round trip, and a name that is not a secret record is refused', () => {
  assert.equal(secretRecordName('badge.u1'), 'secret-badge.u1'); assert.equal(secretNameFromRecord('secret-badge.u1'), 'badge.u1');
  assert.equal(secretNameFromRecord('audit-x'), null); assert.equal(secretNameFromRecord('secret-'), null); assert.equal(secretNameFromRecord('secret-a b'), null);
  assert.throws(() => secretRecordName('../x'));
  assert.equal(badgeSecretName('u 1/../x'), 'badge.u1..x');
});
test('a record reads back, and an unreadable or malformed one is null', () => {
  const p = secretToParts('claim', 'abc', 'r', 1, 'encrypted')!;
  assert.deepEqual(secretFromParts('secret-claim', p.encrypted), { name: 'claim', value: 'abc' });
  assert.equal(secretFromParts('secret-claim', undefined), null); assert.equal(secretFromParts('secret-claim', {}), null);
  assert.equal(secretFromParts('secret-claim', { [SECRET_FIELD]: 'not json' }), null); assert.equal(secretFromParts('secret-claim', { [SECRET_FIELD]: JSON.stringify({ v: 2, value: 'x' }) }), null);
  assert.equal(secretFromParts('secret-claim', { [SECRET_FIELD]: JSON.stringify({ v: 1, value: '' }) }), null); assert.equal(secretFromParts('audit-claim', p.encrypted), null);
});
test('the Shopify login packs into one secret and needs all three parts back', () => {
  const login = { domain: 'shop.myshopify.com', clientId: 'id1', clientSecret: 'sec1' };
  assert.deepEqual(unpackShopify(packShopify(login)), login);
  assert.equal(unpackShopify(JSON.stringify({ domain: 'a', clientId: 'b' })), null); assert.equal(unpackShopify('nope'), null); assert.equal(unpackShopify(JSON.stringify({ domain: 'a', clientId: '', clientSecret: 'c' })), null);
});
test('a fingerprint is short, stable, differs per value and does not hold the value', () => {
  assert.equal(fingerprint('abc'), fingerprint('abc')); assert.notEqual(fingerprint('abc'), fingerprint('abd')); assert.equal(fingerprint('abc').length, 24); assert.ok(!fingerprint('abc').includes('abc'));
});

// ---- joining ----
const f = fingerprint;
test('same on both sides: nothing to do, and that is the new base', () => {
  assert.deepEqual(mergeSecret('a', 'a', null), { kind: 'none', base: f('a') }); assert.deepEqual(mergeSecret(null, null, f('a')), { kind: 'none', base: null });
});
test('only this register has it: send it', () => { assert.deepEqual(mergeSecret('a', null, null), { kind: 'send', base: f('a') }); assert.deepEqual(mergeSecret('a', null, f('a')), { kind: 'send', base: f('a') }); });
test('only the shop has it: take it, unless this register removed it and the shop has not changed', () => {
  assert.deepEqual(mergeSecret(null, 'a', null), { kind: 'take', base: f('a') });
  assert.deepEqual(mergeSecret(null, 'a', f('a')), { kind: 'none', base: f('a') }, 'removed here, the removal stands');
  assert.deepEqual(mergeSecret(null, 'b', f('a')), { kind: 'take', base: f('b') }, 'the shop changed it since, so take the new one');
});
test('both have it and differ: the side that did not change follows the one that did', () => {
  assert.deepEqual(mergeSecret('a', 'b', f('a')), { kind: 'take', base: f('b') }); assert.deepEqual(mergeSecret('c', 'b', f('b')), { kind: 'send', base: f('c') });
});
test('both changed, or they never agreed: the shop wins and it is called a conflict', () => {
  assert.deepEqual(mergeSecret('c', 'b', f('a')), { kind: 'take', conflict: true, base: f('b') }); assert.deepEqual(mergeSecret('c', 'b', null), { kind: 'take', conflict: true, base: f('b') });
});
test('a removal is never a send: nothing here ever asks to delete the shop copy', () => {
  for (const [l, c, b] of [[null, 'a', null], [null, 'a', f('a')], [null, 'b', f('a')], [null, null, f('a')]] as const) assert.notEqual(mergeSecret(l, c, b).kind, 'send');
});
