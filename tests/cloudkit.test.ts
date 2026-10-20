// Location: tests/cloudkit.test.ts
// The pure half of the CloudKit bridge (patches 1 and 2 of dev_docs/CLOUDKIT_SYNC_PLAN.md). The important case is the
// missing native module: an old build, or a test run, must get a clear "unavailable" answer rather than a crash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOUDKIT_MISSING,
  accountLine,
  cloudKitRole,
  makeCloudKit,
  type CloudKitAccountStatus,
  type CloudKitSyncNative,
} from '../modules/cloudkit-sync/status';

const ALL_STATUSES: CloudKitAccountStatus[] = ['available', 'noAccount', 'restricted', 'couldNotDetermine', 'temporarilyUnavailable', 'unavailable'];

/** A stand-in for the running Swift module, so every path can be checked without a device. */
function fakeNative(over: Partial<CloudKitSyncNative> = {}): CloudKitSyncNative {
  return {
    isSupported: () => true,
    getAccountStatus: async () => 'noAccount',
    getState: async () => ({ account: 'noAccount', role: 'none', shareURL: null }),
    createZoneAndShare: async () => 'https://www.icloud.com/share/abc',
    acceptShare: async () => true,
    takePendingInvite: async () => null,
    ...over,
  };
}

test('no native module: unavailable, not supported, and no crash', async () => {
  const ck = makeCloudKit(null);
  assert.equal(ck.available, false);
  assert.equal(ck.isSupported(), false);
  assert.equal(await ck.getAccountStatus(), 'unavailable');
});

test('no native module: reading the state is empty rather than an error', async () => {
  const ck = makeCloudKit(null);
  assert.deepEqual(await ck.getState(), { account: 'unavailable', role: 'none', shareURL: null });
  assert.equal(await ck.takePendingInvite(), null);
});

test('no native module: setting up and joining say what to do instead of failing oddly', async () => {
  const ck = makeCloudKit(null);
  await assert.rejects(() => ck.createZoneAndShare(), new Error(CLOUDKIT_MISSING));
  await assert.rejects(() => ck.acceptShare('https://www.icloud.com/share/abc'), new Error(CLOUDKIT_MISSING));
});

test('a native module: the answers pass straight through', async () => {
  const ck = makeCloudKit(fakeNative());
  assert.equal(ck.available, true);
  assert.equal(ck.isSupported(), true);
  assert.equal(await ck.getAccountStatus(), 'noAccount');
  assert.equal(await ck.createZoneAndShare(), 'https://www.icloud.com/share/abc');
  await ck.acceptShare('https://www.icloud.com/share/abc');
});

test('the state carries the role and the invite link', async () => {
  const owner = makeCloudKit(fakeNative({ getState: async () => ({ account: 'available', role: 'owner', shareURL: 'https://www.icloud.com/share/abc' }) }));
  assert.deepEqual(await owner.getState(), { account: 'available', role: 'owner', shareURL: 'https://www.icloud.com/share/abc' });
  const joined = makeCloudKit(fakeNative({ getState: async () => ({ account: 'available', role: 'participant', shareURL: null }) }));
  assert.deepEqual(await joined.getState(), { account: 'available', role: 'participant', shareURL: null });
});

test('a role the app does not know reads as none, not a crash', async () => {
  const ck = makeCloudKit(fakeNative({ getState: async () => ({ account: 'available', role: 'something else', shareURL: null }) }));
  assert.equal((await ck.getState()).role, 'none');
  assert.equal(cloudKitRole('owner'), 'owner');
  assert.equal(cloudKitRole('participant'), 'participant');
  assert.equal(cloudKitRole(''), 'none');
});

test('an invite link a cold launch left behind is handed back', async () => {
  const pending = makeCloudKit(fakeNative({ takePendingInvite: async () => 'https://www.icloud.com/share/abc' }));
  assert.equal(await pending.takePendingInvite(), 'https://www.icloud.com/share/abc');
});

test('every iCloud state has a plain sentence, and the missing one says what to do', () => {
  for (const status of ALL_STATUSES) assert.ok(accountLine(status).length > 10, `no wording for ${status}`);
  assert.equal(accountLine('unavailable'), CLOUDKIT_MISSING);
  assert.match(CLOUDKIT_MISSING, /Update the app/);
});
