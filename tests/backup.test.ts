// Location: tests/backup.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_APP, buildBackup, decryptBackup, detectBackup, encryptBackup, mergeSettings, validateBackup, backupFileName } from '../src/lib/backupFile';

const creds = { shopifyDomain: 'shop.myshopify.com', shopifyClientId: 'id-123', shopifyClientSecret: 'shpss_secret', passSecret: 'pass-s', receiptSecret: 'rcpt-s', claimSecret: 'claim-s' };
const settings = { shopName: 'Aiden 3D', registerId: 'abcd1234', registerName: 'Register 1', sharedVersion: 7, cashRounding: true, fees: { cardPresentRate: 0.0165, keyedRate: 0.025 },
  receipt: { serverUrl: 'https://r.example.dev', abn: '12 345 678 901', gstRegistered: true }, staff: [{ id: 's1', name: 'Aiden', role: 'owner', salt: 'x', pinHash: 'y' }], theme: 'dark' };
const grid = { version: 1, pages: [{ id: 'p1', name: 'Home', tiles: [] }] };

test('build strips device identity but keeps everything else', () => {
  const b = buildBackup({ settings, grid, gridVersion: 3, credentials: creds, now: new Date('2026-10-09T01:00:00Z') });
  assert.equal(b.app, BACKUP_APP); assert.equal(b.createdAt, '2026-10-09T01:00:00.000Z');
  for (const k of ['registerId', 'registerName', 'sharedVersion']) assert.ok(!(k in b.settings), k);
  assert.equal(b.settings.shopName, 'Aiden 3D'); assert.equal(b.settings.theme, 'dark'); assert.equal(b.grid?.version, 3);
  assert.deepEqual(b.credentials, creds);
});

test('validate: accepts our own output, rejects strangers and newer versions', () => {
  const b = buildBackup({ settings, credentials: creds });
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(b))).credentials, creds);
  assert.throws(() => validateBackup({ foo: 1 }), /not a backup/);
  assert.throws(() => validateBackup({ ...b, v: 99 }), /newer version/);
  assert.throws(() => validateBackup({ ...b, settings: null }), /no settings/);
});

test('validate drops device keys even if a hand-edited file contains them', () => {
  const v = validateBackup({ ...buildBackup({ settings, credentials: creds }), settings: { ...settings } });
  assert.ok(!('registerId' in v.settings));
});

test('merge keeps this device identity, overlays the rest, and fills new nested fields from current', () => {
  const current = { registerId: 'NEW-DEVICE', registerName: 'iPad 2', sharedVersion: 0, cashRounding: false, fees: { cardPresentRate: 0.01, keyedRate: 0.02, extra: 5 }, receipt: { serverUrl: '', abn: '', brandNew: 'x' }, theme: 'light' };
  const m = mergeSettings(current, buildBackup({ settings, credentials: creds }).settings);
  assert.equal(m.registerId, 'NEW-DEVICE'); assert.equal(m.registerName, 'iPad 2'); assert.equal(m.sharedVersion, 0);
  assert.equal(m.cashRounding, true); assert.equal(m.theme, 'dark');
  assert.deepEqual(m.fees, { cardPresentRate: 0.0165, keyedRate: 0.025, extra: 5 });
  assert.equal((m.receipt as any).abn, '12 345 678 901'); assert.equal((m.receipt as any).brandNew, 'x');
});

test('encrypt then decrypt round-trips, including unicode', async () => {
  const text = JSON.stringify(buildBackup({ settings: { ...settings, shopName: 'Café 🦊 日本' }, grid, credentials: creds }));
  const enc = await encryptBackup(text, 'correct horse battery');
  assert.equal(detectBackup(enc), 'encrypted');
  assert.ok(!enc.includes('shpss_secret') && !enc.includes('Aiden'), 'ciphertext must not leak plaintext');
  assert.equal(await decryptBackup(enc, 'correct horse battery'), text);
});

test('wrong passphrase and tampering are both rejected', async () => {
  const enc = await encryptBackup('{"hello":"world"}', 'correct horse battery');
  await assert.rejects(() => decryptBackup(enc, 'wrong passphrase!'), /Wrong passphrase/);
  const e = JSON.parse(enc); e.ct = e.ct.slice(0, -2) + (e.ct.endsWith('00') ? '01' : '00');
  await assert.rejects(() => decryptBackup(JSON.stringify(e), 'correct horse battery'), /Wrong passphrase|changed/);
  const e2 = JSON.parse(enc); e2.N = 2 ** 14; // header is authenticated: changing KDF params must fail, not silently succeed
  await assert.rejects(() => decryptBackup(JSON.stringify(e2), 'correct horse battery'));
});

test('each encryption uses a fresh salt and nonce', async () => {
  const a = JSON.parse(await encryptBackup('same', 'passphrase-1')), b = JSON.parse(await encryptBackup('same', 'passphrase-1'));
  assert.notEqual(a.salt, b.salt); assert.notEqual(a.nonce, b.nonce); assert.notEqual(a.ct, b.ct);
});

test('short passphrase refused; absurd KDF cost in a hostile file refused', async () => {
  await assert.rejects(() => encryptBackup('x', 'short'), /at least 8/);
  const e = JSON.parse(await encryptBackup('x', 'passphrase-1')); e.N = 2 ** 30;
  await assert.rejects(() => decryptBackup(JSON.stringify(e), 'passphrase-1'), /unsupported encryption/);
});

test('detect: plain, encrypted, junk', async () => {
  assert.equal(detectBackup(JSON.stringify(buildBackup({ settings, credentials: creds }))), 'plain');
  assert.throws(() => detectBackup('not json'), /not valid JSON/);
  assert.throws(() => detectBackup('{"x":1}'), /not a backup/);
});

test('file names', () => {
  assert.equal(backupFileName(true, new Date('2026-10-09T00:00:00Z')), 'pos-backup-2026-10-09.posbackup');
  assert.equal(backupFileName(false, new Date('2026-10-09T00:00:00Z')), 'pos-backup-2026-10-09.json');
});
