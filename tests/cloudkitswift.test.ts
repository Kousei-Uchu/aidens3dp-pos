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
  assert.deepEqual(callers.sort(), ['putLogo', 'putRecordOnce', 'putSquareManifest', 'putSquareShardOnce', 'upsertRecord']);
  assert.match(body('putLogo'), /database\(\)\.record\(for: logoRecordID\)[\s\S]*\.save\(record\)[\s\S]*serverRecordChanged/);
});

// Encrypted sale fields (decisions item 17). The Swift cannot be built here, so these pin the rules by reading it.
test('an encrypted key is never written as a plain field, and only listed keys are written as encrypted ones', () => {
  assert.match(src, /cloudKitEncryptedKeys: \[String: \[String\]\] = \["Sale": \["secure_json"\]\]/);
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
