// Location: tests/assistantsettings.test.ts
// The rules around the assistant settings: never shared between registers, travel in backups (key included), role gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildBackup, decryptBackup, encryptBackup, mergeSettings, validateBackup } from '../src/lib/backupFile';
import { defaultAssistant, normaliseAssistant } from '../src/lib/assistantConfig';
import { actingRole, canEditAdjustPerms } from '../src/lib/adjustPerms';

const creds = { shopifyDomain: 'shop.myshopify.com', shopifyClientId: 'id', shopifyClientSecret: 'secret', passSecret: 'p', receiptSecret: 'r', claimSecret: 'c' };
const assistant = { ...defaultAssistant(), baseUrl: 'http://192.168.1.20:11434/v1', model: 'llama3.1:8b', contextSize: 32000, treatAsLocal: true };
const KEY = 'sk-test-BACKUPKEY-1234';

test('the assistant settings are never part of the shared settings that go to other registers', () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'lib', 'sync.ts'), 'utf8');
  const pushLine = src.split('\n').find(l => l.includes('const shared = {')); assert.ok(pushLine, 'pushSharedSettings builds an explicit list');
  const stillLine = src.split('\n').find(l => l.includes('const stillMatches')); assert.ok(stillLine);
  for (const l of [pushLine!, stillLine!]) assert.ok(!/assistant/i.test(l), l);
  assert.ok(!/assistant/i.test(src.slice(src.indexOf('export async function pushSharedSettings'), src.indexOf('export const bundleConfig'))), 'nothing about the assistant between pushSharedSettings and pullSettings');
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
  const v = validateBackup({ app: 'shopify-zeller-pos', v: 1, settings: { assistant: { baseUrl: 5, model: ' m ', temperature: 99, timeoutSec: -3, contextSize: 'huge', toolCallLimit: 0, treatAsLocal: 'true', apiKey: KEY } }, credentials: { ...creds, assistantKey: 42 } });
  const a: any = v.settings.assistant;
  assert.equal(a.baseUrl, ''); assert.equal(a.model, 'm'); assert.equal(a.temperature, 2); assert.equal(a.timeoutSec, 5); assert.equal(a.contextSize, 8000); assert.equal(a.toolCallLimit, 1); assert.equal(a.treatAsLocal, false); assert.ok(!('apiKey' in a));
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
