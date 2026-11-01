// Location: tests/assistantsettings.test.ts
// The rules around the assistant settings: shared between registers only as the connection and only on CloudKit (0205), travel in backups (key included), role gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pickShared } from '../src/lib/sharedSettings';
import { defaultSettings } from '../src/state/store';
import { buildBackup, decryptBackup, encryptBackup, mergeSettings, validateBackup } from '../src/lib/backupFile';
import { defaultAssistant, normaliseAssistant } from '../src/lib/assistantConfig';
import { actingRole, canEditAdjustPerms } from '../src/lib/adjustPerms';

const creds = { shopifyDomain: 'shop.myshopify.com', shopifyClientId: 'id', shopifyClientSecret: 'secret', passSecret: 'p', receiptSecret: 'r', claimSecret: 'c' };
const assistant = { ...defaultAssistant(), baseUrl: 'http://192.168.1.20:11434/v1', model: 'llama3.1:8b', contextSize: 32000, endpointMode: 'local' as const };
const KEY = 'sk-test-BACKUPKEY-1234';

// 0205 (decisions O2) replaced the old rule that the assistant was never shared. On Shopify it still is not. On CloudKit the connection
// (address, model name, options) is shared so a new register works at once; the key follows in patch 6d, and the log cap and the data gate stay local.
test('the assistant is not shared through Shopify, and through CloudKit only as its connection, never the key, the log cap or the data gate', () => {
  const shop = pickShared(defaultSettings(), 'metaobject'); assert.ok(!('assistant' in shop));
  const cloud = pickShared(defaultSettings(), 'cloudkit'); assert.ok('assistant' in cloud);
  const shared = Object.keys(cloud.assistant as object);
  for (const k of ['logCapMB', 'gate', 'apiKey', 'key', 'assistantKey']) assert.ok(!shared.includes(k), k);
  const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'lib', 'sharedSettings.ts'), 'utf8');
  assert.ok(!/assistantKey|apiKey/.test(src), 'the shared settings code never touches the key');
});

test('the settings object has no place for a key, and a stray key field is dropped', () => {
  assert.ok(!('apiKey' in defaultAssistant()));
  const n = normaliseAssistant({ ...assistant, apiKey: KEY, key: KEY, secret: KEY });
  assert.ok(!JSON.stringify(n).includes(KEY)); assert.deepEqual(Object.keys(n).sort(), Object.keys(defaultAssistant()).sort());
});

test('backup: the address, model, options and the key all travel', () => {
  const b = buildBackup({ settings: { shopName: 'x', assistant }, credentials: { ...creds, assistantKey: KEY } });
  assert.deepEqual(b.settings.assistant, assistant); assert.equal(b.credentials.assistantKey, KEY);
  const v = validateBackup(JSON.parse(JSON.stringify(b)));
  assert.deepEqual(v.settings.assistant, assistant); assert.equal(v.credentials.assistantKey, KEY);
});

test('backup: with no key set, the credentials are unchanged from before', () => {
  const b = buildBackup({ settings: { assistant }, credentials: creds });
  assert.ok(!('assistantKey' in validateBackup(JSON.parse(JSON.stringify(b))).credentials));
  const old = validateBackup({ app: 'shopify-zeller-pos', v: 1, createdAt: '', settings: { shopName: 'old' }, credentials: creds });
  assert.ok(!('assistant' in old.settings)); assert.deepEqual(old.credentials, creds);
});

test('backup: the encrypted file carries the key, and the key is not readable in the file', async () => {
  const b = buildBackup({ settings: { assistant }, credentials: { ...creds, assistantKey: KEY } });
  const file = await encryptBackup(JSON.stringify(b), 'a long passphrase');
  assert.ok(!file.includes('BACKUPKEY')); assert.ok(!file.includes('llama3'));
  assert.equal(validateBackup(JSON.parse(await decryptBackup(file, 'a long passphrase'))).credentials.assistantKey, KEY);
});

test('backup: odd values in a file are cleaned before they reach the settings', () => {
  const v = validateBackup({ app: 'shopify-zeller-pos', v: 1, settings: { assistant: { baseUrl: 5, model: ' m ', temperature: 99, timeoutSec: -3, contextSize: 'huge', toolCallLimit: 0, treatAsLocal: 'true', endpointMode: 7, apiKey: KEY } }, credentials: { ...creds, assistantKey: 42 } });
  const a: any = v.settings.assistant;
  assert.equal(a.baseUrl, ''); assert.equal(a.model, 'm'); assert.equal(a.temperature, 2); assert.equal(a.timeoutSec, 5); assert.equal(a.contextSize, 8000); assert.equal(a.toolCallLimit, 1); assert.equal(a.endpointMode, 'auto'); assert.ok(!('apiKey' in a));
  assert.ok(!('assistantKey' in v.credentials));
});

test('restoring merges the assistant group, so a newer app version keeps its own new fields', () => {
  const current: any = { assistant: { ...defaultAssistant(), futureField: 7 }, registerId: 'mine' };
  const out = mergeSettings(current, { assistant: { model: 'restored' }, registerId: 'theirs' }) as any;
  assert.equal(out.assistant.model, 'restored'); assert.equal(out.assistant.futureField, 7); assert.equal(out.registerId, 'mine');
});

test('who sees the page: an owner, or a manager only when the team has no owner, and a cashier never', () => {
  const m = { id: 'm', role: 'manager' as const }, o = { id: 'o', role: 'owner' as const }, c = { id: 'c', role: 'cashier' as const };
  const can = (staff: any[], id: string | undefined, pin = true) => canEditAdjustPerms(actingRole(pin, staff, id), staff);
  assert.equal(can([o, m, c], 'o'), true); assert.equal(can([o, m, c], 'm'), false); assert.equal(can([o, m, c], 'c'), false);
  assert.equal(can([m, c], 'm'), true); assert.equal(can([m, c], 'c'), false);
  assert.equal(can([], undefined, false), true); // a till with no accounts acts as the owner
  assert.equal(can([o, c], undefined), false); // locked and nobody signed in
});
