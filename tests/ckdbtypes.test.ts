// Location: tests/ckdbtypes.test.ts
// scripts/cloudkit-record-types.json lists every CloudKit record type the app uses, and the schema script adds any that is missing (with the
// two indexes every list needs). A type the Swift uses that is not in the list would be created by CloudKit with no indexes on first write.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const swift = readFileSync('modules/cloudkit-sync/ios/CloudKitSyncModule.swift', 'utf8');
const listed: string[] = JSON.parse(readFileSync('scripts/cloudkit-record-types.json', 'utf8'));

test('every record type the Swift writes or lists is in scripts/cloudkit-record-types.json', () => {
  const used = [...new Set([...swift.matchAll(/recordType: "([A-Za-z]+)"/g)].map(m => m[1]))].sort();
  assert.ok(used.length >= 15, 'found the types');
  assert.deepEqual(used.filter(t => !listed.includes(t)), []);
});
test('the schema script adds a missing type with its indexes, fixes a weak one, leaves a good one, and is a no-op the second time', () => {
  const sample = 'DEFINE SCHEMA\n\n    RECORD TYPE Event (\n        "___modTime"    TIMESTAMP,\n        "___recordID"   REFERENCE,\n        kind            STRING,\n        GRANT READ TO "_world"\n    );\n';
  const run = (input: string) => execFileSync('python3', ['-c', 'import sys; sys.path.insert(0, "scripts"); import ckdb_add_indexes as m; o, c = m.fix(sys.stdin.read()); sys.stdout.write(o); sys.stderr.write("\\n".join(c))'], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const once = run(sample);
  assert.match(once, /RECORD TYPE Event \([\s\S]*?"___recordID"   REFERENCE QUERYABLE,[\s\S]*?\);/);
  assert.match(once, /kind            STRING/, 'the type\'s own fields are kept');
  for (const t of listed) assert.match(once, new RegExp(`RECORD TYPE ${t} \\(`), t);
  assert.equal(run(once), once, 'a second run changes nothing');
});
