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
  assert.deepEqual(callers.sort(), ['putRecordOnce', 'upsertRecord']);
});
