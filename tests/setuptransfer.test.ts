// Location: tests/setuptransfer.test.ts
// 0246: the QR setup transfer's pure rules, and the way it reuses the encrypted backup and the Square share server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CODE_LENGTH, SETUP_FILE, describeFetchFailure, isSetupCode, looksLikeSetupQr, newSetupCode, parseSetupQr, privateLanIp, setupQr } from '../src/lib/setupTransfer';
import { answerRequest, newShareKey } from '../src/lib/squareShare';
import { buildBackup, decryptBackup, encryptBackup, validateBackup } from '../src/lib/backupFile';

const bytes = (n: number, f = (i: number) => i * 7 + 3) => Uint8Array.from({ length: n }, (_, i) => f(i) & 255);
const KEY = 'a1b2c3d4e5f60718';

test('the code is 16 unambiguous symbols and is made from the supplied bytes', () => {
  const c = newSetupCode(bytes(16)); assert.equal(c.length, CODE_LENGTH); assert.ok(isSetupCode(c)); assert.equal(c, newSetupCode(bytes(16)));
  assert.ok(!/[01OI]/.test(newSetupCode(bytes(16, i => i * 13 + 1))));
  assert.throws(() => newSetupCode(bytes(8)));
  assert.ok(!isSetupCode('short')); assert.ok(!isSetupCode('0'.repeat(16)));
});
test('only home and shop Wi-Fi addresses are followed', () => {
  for (const ip of ['192.168.1.20', '10.0.0.5', '172.20.10.5', '172.16.0.1', '172.31.255.1']) assert.ok(privateLanIp(ip), ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '172.15.0.1', '127.0.0.1', '169.254.1.1', '0.0.0.0', '192.169.1.1', 'localhost', '']) assert.ok(!privateLanIp(ip), ip);
});
test('the QR round-trips, and builds the address the server will answer', () => {
  const code = newSetupCode(bytes(16)); const qr = setupQr('192.168.1.20', 8787, KEY, code);
  assert.ok(looksLikeSetupQr(qr));
  assert.deepEqual(parseSetupQr(qr), { ip: '192.168.1.20', port: 8787, key: KEY, code, url: `http://192.168.1.20:8787/${KEY}/${SETUP_FILE}` });
  assert.deepEqual(parseSetupQr(`  ${qr}\n`)?.key, KEY);
});
test('anything else is refused', () => {
  const code = newSetupCode(bytes(16)); const good = setupQr('10.0.0.5', 8787, KEY, code);
  const bad = [good.replace('POSSETUP1', 'POSSETUP2'), good.replace('10.0.0.5', '8.8.8.8'), good.replace('8787', '80'), good.replace('8787', '99999'), good.replace(KEY, 'zz'), good + '|x', 'http://10.0.0.5:8787/x/manifest.json', '', good.replace(code, 'abc')];
  for (const b of bad) assert.equal(parseSetupQr(b), null, b);
  assert.throws(() => setupQr('8.8.8.8', 8787, KEY, code)); assert.throws(() => setupQr('10.0.0.5', 80, KEY, code)); assert.throws(() => setupQr('10.0.0.5', 8787, 'nope', code));
});
test('the existing share server answers only the setup file behind the right key', () => {
  const allowed = new Set([SETUP_FILE]); const get = (p: string) => answerRequest(`GET ${p} HTTP/1.1\r\nHost: x\r\n\r\n`, KEY, allowed);
  assert.deepEqual(get(`/${KEY}/${SETUP_FILE}`), { kind: 'file', name: SETUP_FILE });
  assert.deepEqual(get(`/${KEY}/manifest.json`), { kind: 'error', status: 404 });
  assert.deepEqual(get(`/0000000000000000/${SETUP_FILE}`), { kind: 'error', status: 404 });
  assert.deepEqual(answerRequest(`POST /${KEY}/${SETUP_FILE} HTTP/1.1\r\n\r\n`, KEY, allowed), { kind: 'error', status: 405 });
  assert.equal(newShareKey(bytes(8)).length, 16);
});
test('the code is the backup passphrase: right code opens it, a wrong one does not, and it validates', async () => {
  const code = newSetupCode(bytes(16)); const other = newSetupCode(bytes(16, i => i * 5 + 9));
  const b = buildBackup({ settings: { shopName: 'Aiden', registerId: 'device-specific', staff: [] }, credentials: { shopifyDomain: 'x.myshopify.com', shopifyClientId: 'id', shopifyClientSecret: 's', passSecret: 'p', receiptSecret: 'r' } });
  const sealed = await encryptBackup(JSON.stringify(b), code);
  assert.ok(!sealed.includes('x.myshopify.com') && !sealed.includes('"s"'));
  const back = validateBackup(JSON.parse(await decryptBackup(sealed, code)));
  assert.equal(back.settings.shopName, 'Aiden'); assert.ok(!('registerId' in back.settings)); assert.equal(back.credentials.shopifyDomain, 'x.myshopify.com');
  await assert.rejects(decryptBackup(sealed, other), /Wrong passphrase/);
});
test('failures are explained in plain words', () => {
  assert.match(describeFetchFailure(404, ''), /already been used or has expired/);
  assert.match(describeFetchFailure(null, 'timeout'), /same Wi-Fi/);
  assert.match(describeFetchFailure(500, ''), /500/);
});
