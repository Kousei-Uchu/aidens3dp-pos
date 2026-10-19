// Location: tests/cloudkit.test.ts
// The pure half of the CloudKit bridge (patch 1 of docs/CLOUDKIT_SYNC_PLAN.md). The important case is the missing
// native module: an old build, or a test run, must get a clear "unavailable" answer rather than a crash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCloudKit } from '../modules/cloudkit-sync/status';

test('no native module: unavailable, not supported, and no crash', async () => {
  const ck = makeCloudKit(null);
  assert.equal(ck.available, false);
  assert.equal(ck.isSupported(), false);
  assert.equal(await ck.getAccountStatus(), 'unavailable');
});

test('a native module: the answers pass straight through', async () => {
  const ck = makeCloudKit({ isSupported: () => true, getAccountStatus: async () => 'noAccount' });
  assert.equal(ck.available, true);
  assert.equal(ck.isSupported(), true);
  assert.equal(await ck.getAccountStatus(), 'noAccount');
});
