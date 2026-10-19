// CloudKit sync, the JavaScript side (patch 1 of docs/CLOUDKIT_SYNC_PLAN.md).
//
// The native module is optional on purpose. A build that carries no CloudKit module (an older native build, or a
// test run in Node) must still start, so every caller gets a clear "unavailable" answer instead of a crash. The
// fallback lives in status.ts so it can be tested without a device. Patch 2 adds the zone, the share and the account
// screen on top of this.
import { requireOptionalNativeModule } from 'expo';
import { makeCloudKit, type CloudKitAccountStatus, type CloudKitSyncNative } from './status';

export type { CloudKitAccountStatus } from './status';

const bridge = makeCloudKit(requireOptionalNativeModule<CloudKitSyncNative>('CloudKitSync'));

/** True when this build actually carries the native CloudKit module. */
export const cloudKitAvailable = bridge.available;

/** Whether CloudKit sync can run in this build and on this device. */
export function isSupported(): boolean {
  return bridge.isSupported();
}

/** The device's iCloud account state, or "unavailable" when the native module is missing. */
export async function getAccountStatus(): Promise<CloudKitAccountStatus> {
  return bridge.getAccountStatus();
}
