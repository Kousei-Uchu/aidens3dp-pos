// Location: tests/cloudkitswift.test.ts
// The Swift module cannot be built here, so this reads its source and pins the one mistake that already happened once:
// saving a freshly made CKRecord over a name that exists fails with serverRecordChanged. Only the two helpers that handle
// that case may call save() on a record they built themselves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('modules/cloudkit-sync/ios/CloudKitSyncModule.swift', 'utf8');
const body = (name: string): string => { const i = src.indexOf(`private func ${name}(`); assert.ok(i >= 0, `${name} exists`); const next = src.indexOf('\n  private func ', i + 10); return src.slice(i, next < 0 ? undefined : next); };

test('putRecord goes through upsertRecord, so a second write of the same record does not fail', () => {
  assert.match(body('putRecord'), /upsertRecord\(/);
  assert.doesNotMatch(body('putRecord'), /\.save\(/);
});
test('upsertRecord fetches the existing record and retries a conflict', () => {
  const b = body('upsertRecord');
  assert.match(b, /\.record\(for: id\)/); assert.match(b, /serverRecordChanged/); assert.match(b, /\.unknownItem/);
});
test('putRecordOnce hands back the stored record when the name is taken, and never edits it', () => {
  const b = body('putRecordOnce');
  assert.match(b, /serverRecordChanged/); assert.match(b, /\.record\(for: id\)/);
});
test('save() is only called in the helpers that deal with an existing record', () => {
  const callers = src.split('\n  private func ').slice(1).filter(f => /\.save\(record\)/.test(f)).map(f => f.slice(0, f.indexOf('(')));
  // putLogo (0207) is one other: it fetches the record first like upsertRecord, because an asset cannot go through copyFields.
  // putSquareShardOnce and putSquareManifest (0209) are the others: a shard is written once and handed back if the name is taken, and the manifest is compared with its change tag first.
  // putMigrationIfUnchanged (0212) is the migration lease: like the manifest, it is compared with its change tag before it is saved.
  assert.deepEqual(callers.sort(), ['putLogo', 'putMigrationIfUnchanged', 'putRecordOnce', 'putSquareManifest', 'putSquareShardOnce', 'upsertRecord']);
  assert.match(body('putLogo'), /database\(\)\.record\(for: logoRecordID\)[\s\S]*\.save\(record\)[\s\S]*serverRecordChanged/);
});

// Encrypted sale fields (decisions item 17). The Swift cannot be built here, so these pin the rules by reading it.
test('an encrypted key is never written as a plain field, and only listed keys are written as encrypted ones', () => {
  assert.match(src, /cloudKitEncryptedKeys: \[String: \[String\]\] = \["Sale": \["secure_json"\], "Audit": \["secure_json"\], "Secret": \["secure_json"\]\]/);
  assert.match(src, /AsyncFunction\("putSecret"\)[\s\S]*?recordType: "Secret", recordName: "secret-\\\(handle\)", fields: fields, encrypted: encrypted/);
  assert.match(src, /AsyncFunction\("listSecrets"\)[\s\S]*?recordType: "Secret"/);
  assert.doesNotMatch(src, /recordType: "Secret"[^\n]*delete/i, 'nothing deletes a secret record');
  assert.match(body('copyFields'), /cloudKitNeverPlainKeys\.contains\(k\) \{ continue \}/);
  const e = body('copyEncrypted');
  assert.match(e, /allowed\.contains\(k\)/); assert.match(e, /record\.encryptedValues\[k\] = s/);
  assert.doesNotMatch(e, /record\[k\]/);
});
test('upsertRecord writes the encrypted values before saving, and putSale passes them', () => {
  const b = body('upsertRecord');
  assert.ok(b.indexOf('copyEncrypted(encrypted, into: record)') > b.indexOf('copyFields(fields, into: record)'));
  assert.ok(b.indexOf('copyEncrypted(encrypted, into: record)') < b.indexOf('.save(record)'));
  assert.match(src, /AsyncFunction\("putSale"\) \{ \(handle: String, fields: \[String: Any\], encrypted: \[String: Any\]\)/);
});
test('recordToDict reads the encrypted values by name and hands them back under `encrypted`', () => {
  const b = body('recordToDict');
  assert.match(b, /cloudKitEncryptedKeys\[record\.recordType\]/); assert.match(b, /record\.encryptedValues\[key\]/); assert.match(b, /out\["encrypted"\] = enc/);
});

// Events and payment attempts. A resolution and an event must be written once (the first one stays); an attempt is updated in place.
const fn = (name: string): string => { const i = src.indexOf(`AsyncFunction("${name}")`); assert.ok(i >= 0, `${name} exists`); return src.slice(i, src.indexOf('\n    }', i)); };
test('events and resolutions are written once, and attempts are updated in place', () => {
  assert.match(fn('putEvent'), /putRecordOnce\(recordType: "Event", recordName: "event-/);
  assert.match(fn('putResolution'), /putRecordOnce\(recordType: "Resolution", recordName: "resolve-/);
  assert.match(fn('putAttempt'), /upsertRecord\(recordType: "Attempt", recordName: "attempt-/);
});
test('the names the JavaScript side builds match the names the Swift reads', () => {
  for (const [name, prefix, type] of [['getAttempt', 'attempt-', 'Attempt'], ['getResolution', 'resolve-', 'Resolution']] as const) assert.match(fn(name), new RegExp(`getRecord\\(recordType: "${type}", recordName: "${prefix}`));
  for (const [name, type] of [['listEvents', 'Event'], ['listAttempts', 'Attempt'], ['listResolutions', 'Resolution']] as const) assert.match(fn(name), new RegExp(`listRecords\\(recordType: "${type}"`));
});

// The migration lease (0212). Two owner iPads must never both win, so every write is checked against the change tag the caller read.
test('the migration record is only written through the checked helper, never by an unconditional put', () => {
  assert.doesNotMatch(src, /AsyncFunction\("putMigration"\)/);
  assert.match(fn('putMigrationIfUnchanged'), /putMigrationIfUnchanged\(fields: fields, expectedTag: expectedTag\)/);
  assert.doesNotMatch(src, /putRecord\(recordType: "Migration"/);
  assert.doesNotMatch(src, /upsertRecord\(recordType: "Migration"/);
});
test('putMigrationIfUnchanged compares the change tag first, and treats a lost race as changed', () => {
  const b = body('putMigrationIfUnchanged');
  assert.match(b, /current\.recordChangeTag == expected/);
  assert.match(b, /guard !expected\.isEmpty/);
  assert.match(b, /if !expected\.isEmpty \{ return \["changed": true\] \}/);
  assert.match(b, /serverRecordChanged/);
  assert.ok(b.indexOf('recordChangeTag == expected') < b.indexOf('.save(record)'), 'compare before save');
  assert.match(b, /plain\["tag"\] = nil/);
});
test('getMigration returns the change tag, without changing what other records read', () => {
  assert.match(fn('getMigration'), /getMigrationFields\(\)/);
  assert.match(body('getMigrationFields'), /out\["tag"\] = record\.recordChangeTag/);
  assert.doesNotMatch(body('recordToDict'), /recordChangeTag/);
});

// ---- 8b: change pushes ----
const subscriber = readFileSync('modules/cloudkit-sync/ios/CloudKitPushSubscriber.swift', 'utf8');
test('startSubscriptions subscribes both databases with fixed ids, silently, and says whether both are in place', () => {
  assert.match(src, /AsyncFunction\("startSubscriptions"\)[\s\S]*?ensureSubscriptions\(\)/);
  const b = body('ensureSubscriptions');
  assert.match(b, /c\.privateCloudDatabase, cloudKitPrivateSubscriptionID/); assert.match(b, /c\.sharedCloudDatabase, cloudKitSharedSubscriptionID/);
  assert.match(b, /shouldSendContentAvailable = true/); assert.doesNotMatch(b, /alertBody|soundName|shouldBadge/, 'a silent push carries no alert, sound or badge');
  assert.match(b, /registerForRemoteNotifications\(\)/); assert.match(b, /database\.subscription\(for: id\)/, 'an existing subscription is found, not saved again');
  assert.match(b, /allInPlace = false/); assert.match(b, /return allInPlace/);
  assert.match(src, /cloudKitPrivateSubscriptionID = "aidens3dp-private-changes"/); assert.match(src, /cloudKitSharedSubscriptionID = "aidens3dp-shared-changes"/);
});
test('a database push becomes the onRemoteChange event, and anything else is reported as no data', () => {
  assert.match(src, /Events\("onShareJoined", "onRemoteChange"\)/);
  assert.match(src, /forName: cloudKitRemoteChangeNotification[\s\S]*?sendEvent\("onRemoteChange"/);
  assert.match(src, /removeObserver\(observer\)[\s\S]*?changeObserver = nil/);
  assert.match(subscriber, /class CloudKitPushSubscriber: ExpoAppDelegateSubscriber/);
  assert.match(subscriber, /note\.notificationType == \.database/); assert.match(subscriber, /post\(name: cloudKitRemoteChangeNotification/);
  assert.match(subscriber, /completionHandler\(\.noData\)[\s\S]*?completionHandler\(\.newData\)/);
  assert.deepEqual(JSON.parse(readFileSync('modules/cloudkit-sync/expo-module.config.json', 'utf8')).apple.appDelegateSubscribers, ['CloudKitPushSubscriber']);
  assert.match(readFileSync('modules/cloudkit-sync/index.ts', 'utf8'), /export async function startSubscriptions[\s\S]*export function onRemoteChange/);
});

// Patch 0227: a joined till must use the owner's zone in the shared database, not an empty zone of its own in the private one.
test('the database and zone come from the role, worked out by resolveStore (0227)', () => {
  const d = body('database');
  assert.match(d, /sharedCloudDatabase/); assert.match(d, /privateCloudDatabase/); assert.match(d, /participant/);
  assert.match(src, /private var storeZoneID: CKRecordZone\.ID \{[\s\S]*?storeSharedZoneID[\s\S]*?ownerZoneID/);
  const r = body('resolveStore');
  assert.match(r, /privateCloudDatabase\.allRecordZones\(\)/); assert.match(r, /sharedCloudDatabase\.allRecordZones\(\)/);
  assert.match(r, /storeSharedZoneID = zone\.zoneID/, 'the participant keeps the zone ID CloudKit listed, not one built from its own Apple ID');
});
test('every function that reads or writes a record resolves the store first (0227)', () => {
  for (const f of ['putLogo', 'getLogoFields', 'downloadLogoFile', 'putSquareShardOnce', 'getSquareManifestFields', 'putSquareManifest', 'downloadSquareShardFile',
    'getMigrationFields', 'putMigrationIfUnchanged', 'upsertRecord', 'putRecordOnce', 'listCreatedSince', 'getRecord', 'listRecords']) {
    const b = body(f);
    assert.match(b, /try await resolveStore\(\)/, `${f} resolves the store`);
    assert.ok(b.indexOf('resolveStore()') < Math.min(...['database()', 'storeZoneID', 'makeRecord(', 'logoRecordID', 'squareManifestID'].map(k => b.indexOf(k) < 0 ? Infinity : b.indexOf(k))), `${f} resolves before it uses the database or zone`);
  }
});
test('only the owner-only code names the zone under the current Apple ID (0227)', () => {
  for (const f of ['shareLink', 'createZoneAndShare', 'resolveStore']) assert.match(body(f), /ownerZoneID/, `${f} is owner-side`);
  for (const f of ['makeRecord', 'getRecord', 'upsertRecord', 'putRecordOnce', 'listRecords', 'runQuery', 'putLogo', 'getMigrationFields']) assert.doesNotMatch(body(f), /ownerZoneID/, `${f} uses the resolved zone`);
  assert.equal(src.split('CKRecordZone(zoneName: cloudKitZoneName)').length - 1, 1, 'the default zone ID is built in one place');
});
test('a join, a set-up and an Apple ID change make the next call look again (0227)', () => {
  assert.match(body('accept'), /defer \{ forgetStore\(\) \}/);
  assert.match(body('createZoneAndShare'), /defer \{ forgetStore\(\) \}/);
  assert.match(src, /\.CKAccountChanged[\s\S]*?forgetStore\(\)/);
  assert.match(body('state'), /resolveStore\(refresh: true\)/);
});
