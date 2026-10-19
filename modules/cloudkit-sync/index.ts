// CloudKit sync, the JavaScript side (patches 1 and 2 of docs/CLOUDKIT_SYNC_PLAN.md).
//
// The native module is optional on purpose. A build that carries no CloudKit module (an older native build, or a
// test run in Node) must still start, so every caller gets a clear "unavailable" answer instead of a crash. The
// fallback lives in status.ts so it can be tested without a device.
import { requireOptionalNativeModule } from 'expo';
import {
  makeCloudKit,
  type CloudKitAccountStatus,
  type CloudKitRole,
  type CloudKitState,
  type CloudKitSyncNative,
} from './status';

export type { CloudKitAccountStatus, CloudKitRole, CloudKitState } from './status';
export { accountLine, CLOUDKIT_MISSING } from './status';

const native = requireOptionalNativeModule<CloudKitSyncNative>('CloudKitSync');
const bridge = makeCloudKit(native);

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

/** The account state, this till's role, and the invite link when this till owns the shop. */
export async function getState(): Promise<CloudKitState> {
  return bridge.getState();
}

/** Create the shop's zone and invite link (or hand back the existing link). Throws with a plain reason on failure. */
export async function createZoneAndShare(): Promise<string> {
  return bridge.createZoneAndShare();
}

/** Join the shop from an invite link. Throws with a plain reason when the link cannot be used. */
export async function acceptShare(url: string): Promise<void> {
  return bridge.acceptShare(url);
}

/** An invite link that opened the app before this page was open, if there is one. Reading it clears it. */
export async function takePendingInvite(): Promise<string | null> {
  return bridge.takePendingInvite();
}

/** Listen for a share joined through an invite link the system handed the app. Returns an unsubscribe function. */
export function onShareJoined(listener: (payload: { ok: boolean; message: string }) => void): () => void {
  const subscription = native?.addListener?.('onShareJoined', listener);
  return () => subscription?.remove();
}
