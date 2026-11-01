// Location: tests/sharedsettings.test.ts
// CloudKit patch 6a (0205): the wider set of shared settings, how a record is read safely, and how two registers' edits merge.
// The rules are in src/lib/sharedSettings.ts; the wiring is in src/lib/sync.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLOUD_EXTRA_KEYS, CLOUD_KEYS, SHOPIFY_KEYS, applyShared, canon, mergeShared, mergeStaff, needsSending, parseShared, pickShared, readBase, sharedKeys } from '../src/lib/sharedSettings';
import { DEVICE_KEYS } from '../src/lib/backupFile';
import { defaultSettings, type Settings } from '../src/state/store';
import type { StaffMember } from '../src/lib/types';

const person = (id: string, o: Partial<StaffMember> = {}): StaffMember => ({ id, name: `Person ${id}`, role: 'cashier', salt: 's', pinHash: 'h', ...o });
const mk = (o: Partial<Settings> = {}): Settings => ({ ...defaultSettings(), ...o });
const rec = (p: Record<string, unknown>) => JSON.stringify(p);

test('Shopify shares exactly the original seven keys, CloudKit those plus eight more', () => {
  assert.deepEqual([...SHOPIFY_KEYS], ['staff', 'bundlesJson', 'fees', 'cashRounding', 'requirePin', 'adjustPerms', 'cartWarnings']);
  assert.deepEqual([...CLOUD_EXTRA_KEYS], ['shopName', 'receipt', 'passServerUrl', 'giftClaimUrl', 'autoReceipt', 'smartChange', 'consolidate', 'assistant']);
  assert.equal(CLOUD_KEYS.length, 15); assert.deepEqual([...sharedKeys('metaobject')], [...SHOPIFY_KEYS]); assert.deepEqual([...sharedKeys('cloudkit')], [...CLOUD_KEYS]);
});

test('what a register sends: the Shopify record is unchanged, the CloudKit one carries the new keys and never a device or secret key', () => {
  const s = mk({ shopName: 'Aiden', smartChange: true, passServerUrl: 'https://pass.example', registerName: 'Till 2', theme: 'dark', accent: '#ff0000', inventory: { ...defaultSettings().inventory } });
  assert.deepEqual(Object.keys(pickShared(s, 'metaobject')).sort(), [...SHOPIFY_KEYS].sort());
  const c = pickShared(s, 'cloudkit'); assert.deepEqual(Object.keys(c).sort(), [...CLOUD_KEYS].sort());
  assert.equal(c.shopName, 'Aiden'); assert.equal(c.smartChange, true);
  for (const k of ['registerId', 'registerName', 'theme', 'accent', 'tileSize', 'inventory', 'screensaver', 'appMode', 'sharedVersion', 'sharedBase', 'drawerVersion', 'locationId', 'scannerCal']) assert.ok(!(k in c), k);
  assert.ok(!/secret|apikey|key/i.test(Object.keys(c).join(',')));
});

test('the assistant is shared as its connection only: the log cap and the data gate stay on the iPad', () => {
  const s = mk(); s.assistant = { ...s.assistant, baseUrl: 'http://192.168.1.20:11434/v1', model: 'llama', logCapMB: 50 };
  const a = pickShared(s, 'cloudkit').assistant as Record<string, unknown>;
  assert.equal(a.baseUrl, 'http://192.168.1.20:11434/v1'); assert.equal(a.model, 'llama');
  assert.ok(!('logCapMB' in a)); assert.ok(!('gate' in a));
  const mine = mk(); mine.assistant = { ...mine.assistant, logCapMB: 77 };
  const patch = applyShared({ assistant: a }, mine) as { assistant: Settings['assistant'] };
  assert.equal(patch.assistant.baseUrl, 'http://192.168.1.20:11434/v1'); assert.equal(patch.assistant.logCapMB, 77); assert.deepEqual(patch.assistant.gate, mine.assistant.gate);
});

test('reading a record takes only this backend\'s keys, checks each type and never fills in a missing key', () => {
  const json = rec({ shopName: 'X', smartChange: true, cashRounding: false, evil: 1, registerId: 'stolen', staff: [person('a')], theme: 'dark' });
  assert.deepEqual(parseShared(json, 'metaobject'), { cashRounding: false, staff: [person('a')] });
  assert.deepEqual(parseShared(json, 'cloudkit'), { shopName: 'X', smartChange: true, cashRounding: false, staff: [person('a')] });
  assert.deepEqual(parseShared(rec({ cashRounding: 'yes', requirePin: 1, bundlesJson: 5, autoReceipt: 'sometimes', staff: 'x', fees: 3, receipt: [] }), 'cloudkit'), {});
  assert.equal(parseShared('{not json', 'cloudkit'), null); assert.equal(parseShared('[1]', 'cloudkit'), null); assert.equal(parseShared(undefined, 'cloudkit'), null); assert.equal(parseShared('"x"', 'cloudkit'), null);
});

test('a staff entry that is not a real person is dropped, so a bad record cannot add a login', () => {
  const good = person('ok'); const odd = [good, { id: 'b', name: 'B', role: 'god', salt: 's', pinHash: 'h' }, { id: '', name: 'C', role: 'owner', salt: 's', pinHash: 'h' }, { id: 'd', name: 'D', role: 'owner' }, null, 7];
  assert.deepEqual(parseShared(rec({ staff: odd }), 'cloudkit')!.staff, [good]);
  const rich = person('p', { badgeSalt: 'bs', badgeHash: 'bh', ui: { mode: 'simple' } as any, preferences: { theme: 'dark', accent: '#123456', tileSize: 'L' } });
  assert.deepEqual(parseShared(rec({ staff: [rich] }), 'cloudkit')!.staff, [rich]); // display mode, theme, accent and tile size travel with the person (decisions item 2)
});

test('fees and the receipt details are read with their defaults filled, and bad numbers fall back', () => {
  const p = parseShared(rec({ fees: { cardPresentRate: 0.02, keyedRate: 'x', refundReturnsFee: true }, receipt: { name: 'Shop', abn: 5, gstRegistered: true, extra: 'no' } }), 'cloudkit')!;
  assert.deepEqual(p.fees, { cardPresentRate: 0.02, keyedRate: 0.017, refundReturnsFee: true });
  const r = p.receipt as Record<string, unknown>; assert.equal(r.name, 'Shop'); assert.equal(r.abn, ''); assert.equal(r.gstRegistered, true); assert.equal(r.serverUrl, ''); assert.ok(!('extra' in r));
});

test('merge: a key only the shop changed takes the shop\'s value, a key edited here keeps ours, also when both changed', () => {
  const base = { shopName: 'Old', smartChange: false, cashRounding: true };
  assert.deepEqual(mergeShared(base, { shopName: 'Old', smartChange: false, cashRounding: true }, { shopName: 'Shop', smartChange: true, cashRounding: true }), { shopName: 'Shop', smartChange: true, cashRounding: true });
  assert.deepEqual(mergeShared(base, { shopName: 'Mine', smartChange: false, cashRounding: true }, { shopName: 'Old', smartChange: true, cashRounding: true }), { shopName: 'Mine', smartChange: true, cashRounding: true });
  assert.equal(mergeShared(base, { shopName: 'Mine' }, { shopName: 'Theirs' }).shopName, 'Mine');
});

test('merge: a key only one side has is kept, and with no base the shop\'s value wins', () => {
  assert.deepEqual(mergeShared({}, { a: 1 }, { b: 2 }), { a: 1, b: 2 });
  assert.equal(mergeShared(null, { shopName: 'Mine' }, { shopName: 'Theirs' }).shopName, 'Theirs');
  assert.equal(mergeShared({ x: 1 }, { shopName: 'Mine' }, { shopName: 'Theirs' }).shopName, 'Theirs'); // a key the base never had is no evidence of an edit here
});

test('merge: key order and undefined never look like a change', () => {
  assert.equal(canon({ b: 1, a: { d: 1, c: undefined } }), canon({ a: { d: 1 }, b: 1 }));
  // the same fees written in another key order are not an edit here, so the shop's new value is taken
  const merged = mergeShared({ fees: { a: 1, b: 2 } }, { fees: { b: 2, a: 1 } }, { fees: { a: 9, b: 2 } });
  assert.deepEqual(merged.fees, { a: 9, b: 2 });
});

test('staff merge: people added on two registers both stay, an edit to one person and a new person do not collide', () => {
  const base = [person('a'), person('b')];
  const mine = [person('a', { name: 'A edited' }), person('b'), person('c')];
  const theirs = [person('a'), person('b', { role: 'manager' }), person('d')];
  const out = mergeStaff(base, mine, theirs);
  assert.deepEqual(out.map(m => m.id).sort(), ['a', 'b', 'c', 'd']);
  assert.equal(out.find(m => m.id === 'a')!.name, 'A edited'); assert.equal(out.find(m => m.id === 'b')!.role, 'manager');
});

test('staff merge: a person removed on either side stays removed, even if the other side edited them', () => {
  const base = [person('a'), person('b')];
  assert.deepEqual(mergeStaff(base, [person('a'), person('b', { name: 'edited' })], [person('a')]).map(m => m.id), ['a']); // removed there, edited here
  assert.deepEqual(mergeStaff(base, [person('a')], [person('a'), person('b', { name: 'edited' })]).map(m => m.id), ['a']); // removed here, edited there
});

test('staff merge: changed on both sides keeps the sender\'s version, and with no base the lists are joined with the shop\'s version of a person', () => {
  const base = [person('a')];
  assert.equal(mergeStaff(base, [person('a', { name: 'Mine' })], [person('a', { name: 'Theirs' })])[0].name, 'Mine');
  const joined = mergeStaff(null, [person('a', { name: 'Mine' }), person('x')], [person('a', { name: 'Theirs' }), person('y')]);
  assert.deepEqual(joined.map(m => m.id).sort(), ['a', 'x', 'y']); assert.equal(joined.find(m => m.id === 'a')!.name, 'Theirs');
});

test('two registers: a stale one pushing its own edit does not undo a setting the other changed', () => {
  const agreed = mk({ shopName: 'Aiden', cashRounding: true }); const base = pickShared(agreed, 'cloudkit');
  const a = mk({ ...agreed, shopName: 'Aiden 3D' }); // register A renamed the shop and pushed
  const b = mk({ ...agreed, cashRounding: false, staff: [person('new')] }); // register B, which never saw that, changed rounding and added a person
  const merged = mergeShared(base, pickShared(b, 'cloudkit'), pickShared(a, 'cloudkit'));
  assert.equal(merged.shopName, 'Aiden 3D'); assert.equal(merged.cashRounding, false); assert.deepEqual((merged.staff as StaffMember[]).map(m => m.id), ['new']);
});

test('no echo: after a register takes the shop\'s record it has nothing to send, and an edit makes it send', () => {
  const remote = mk({ shopName: 'Shop', smartChange: true, passServerUrl: 'https://p.example', staff: [person('a', { preferences: { theme: 'dark' } })], assistant: { ...defaultSettings().assistant, model: 'm', baseUrl: 'http://10.0.0.5:11434/v1' } });
  let here = mk({ registerName: 'Till 3' });
  here = { ...here, ...applyShared(parseShared(JSON.stringify(pickShared(remote, 'cloudkit')), 'cloudkit')!, here) };
  here.sharedBase = canon(pickShared(here, 'cloudkit'));
  assert.equal(needsSending(here, 'cloudkit'), false); assert.equal(here.shopName, 'Shop'); assert.equal(here.registerName, 'Till 3');
  assert.equal(needsSending({ ...here, shopName: 'Shop 2' }, 'cloudkit'), true);
  assert.equal(needsSending({ ...here, receipt: { ...here.receipt, abn: '12' } }, 'cloudkit'), true);
  assert.equal(needsSending({ ...here, theme: 'dark', accent: '#000000', registerName: 'x' }, 'cloudkit'), false); // this iPad's own look and name are never sent
  assert.equal(needsSending({ ...mk(), shopName: 'Unsent' }, 'metaobject'), false); // Shopify has no watcher
  assert.equal(readBase('nope'), null); assert.equal(readBase(undefined), null);
});

test('source pins: the push merges on CloudKit only, pulls take only known keys, and the new base is a device key', () => {
  const sync = readFileSync('src/lib/sync.ts', 'utf8');
  const push = sync.slice(sync.indexOf('export async function pushSharedSettings'), sync.indexOf('async function pullSettings'));
  assert.ok(/pickShared\(snapshot, kind\)/.test(push) && /kind === 'cloudkit'/.test(push) && /mergeShared\(/.test(push), 'push picks by backend and merges on CloudKit');
  assert.ok(push.indexOf("getShared('settings', 'shared')") < push.indexOf("putShared('settings', 'shared'"), 'the shop\'s record is read before ours is written');
  const pull = sync.slice(sync.indexOf('async function pullSettings'), sync.indexOf('// ── scanner calibration'));
  assert.ok(/parseShared\(/.test(pull) && /applyShared\(/.test(pull) && !/JSON\.parse\(row\.f\.settings_json\)/.test(pull), 'pull reads through the whitelist, not a raw spread');
  assert.ok(/useApp\.subscribe\(/.test(sync) && /needsSending\(/.test(sync) && /isTraining\(\)/.test(sync.slice(sync.indexOf('useApp.subscribe('), sync.indexOf('useApp.subscribe(') + 400)), 'the watcher exists and skips practice mode');
  assert.ok((DEVICE_KEYS as readonly string[]).includes('sharedBase'));
  const store = readFileSync('src/state/store.ts', 'utf8'); assert.ok(/sharedBase\?: string/.test(store));
});
