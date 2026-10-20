// CloudKit sync, the JavaScript side (patches 1 and 2 of dev_docs/CLOUDKIT_SYNC_PLAN.md).
//
// The native module is optional on purpose. A build that carries no CloudKit module (an older native build, or a
// test run in Node) must still start, so every caller gets a clear "unavailable" answer instead of a crash. The
// fallback lives in status.ts so it can be tested without a device.
import { requireOptionalNativeModule } from 'expo';
import {
  makeCloudKit,
  CLOUDKIT_MISSING,
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

// Patch 4: sales and rollups (CloudKit backend)
export async function putSale(handle: string, fields: Record<string, any>): Promise<Record<string, any>> {
  if (!native?.putSale) throw new Error(CLOUDKIT_MISSING);
  return native.putSale(handle, fields);
}
export async function getSale(handle: string): Promise<Record<string, any> | null> {
  if (!native?.getSale) return null;
  return native.getSale(handle);
}
export async function listSales(limit = 100, after?: string | null): Promise<{ rows: Record<string, any>[]; next: string | null }> {
  if (!native?.listSales) return { rows: [], next: null };
  return native.listSales(limit, after ?? null);
}
export async function putRollup(handle: string, fields: Record<string, any>): Promise<Record<string, any>> {
  if (!native?.putRollup) throw new Error(CLOUDKIT_MISSING);
  return native.putRollup(handle, fields);
}
export async function getRollup(handle: string): Promise<Record<string, any> | null> {
  if (!native?.getRollup) return null;
  return native.getRollup(handle);
}
export async function listRollups(limit = 100, after?: string | null): Promise<{ rows: Record<string, any>[]; next: string | null }> {
  if (!native?.listRollups) return { rows: [], next: null };
  return native.listRollups(limit, after ?? null);
}

// Patch 5: saved carts
export async function putCart(handle: string, fields: Record<string, any>): Promise<Record<string, any>> {
  if (!native?.putCart) throw new Error(CLOUDKIT_MISSING);
  return native.putCart(handle, fields);
}
export async function getCart(handle: string): Promise<Record<string, any> | null> {
  if (!native?.getCart) return null;
  return native.getCart(handle);
}
export async function listCarts(limit = 100, after?: string | null): Promise<{ rows: Record<string, any>[]; next: string | null }> {
  if (!native?.listCarts) return { rows: [], next: null };
  return native.listCarts(limit, after ?? null);
}

// Patch 6: settings and layout
export async function putSettings(handle: string, fields: Record<string, any>): Promise<Record<string, any>> {
  if (!native?.putSettings) throw new Error(CLOUDKIT_MISSING);
  return native.putSettings(handle, fields);
}
export async function getSettings(handle: string): Promise<Record<string, any> | null> {
  if (!native?.getSettings) return null;
  return native.getSettings(handle);
}
export async function listSettings(limit = 100, after?: string | null): Promise<{ rows: Record<string, any>[]; next: string | null }> {
  if (!native?.listSettings) return { rows: [], next: null };
  return native.listSettings(limit, after ?? null);
}
export async function putLayout(handle: string, fields: Record<string, any>): Promise<Record<string, any>> {
  if (!native?.putLayout) throw new Error(CLOUDKIT_MISSING);
  return native.putLayout(handle, fields);
}
export async function getLayout(handle: string): Promise<Record<string, any> | null> {
  if (!native?.getLayout) return null;
  return native.getLayout(handle);
}
export async function listLayout(limit = 100, after?: string | null): Promise<{ rows: Record<string, any>[]; next: string | null }> {
  if (!native?.listLayout) return { rows: [], next: null };
  return native.listLayout(limit, after ?? null);
}

export async function putSquareHistory(handle: string, fields: Record<string, any>): Promise<Record<string, any>> {
  if (!native?.putSquareHistory) throw new Error(CLOUDKIT_MISSING);
  return native.putSquareHistory(handle, fields);
}
export async function getSquareHistory(handle: string): Promise<Record<string, any> | null> {
  if (!native?.getSquareHistory) return null;
  return native.getSquareHistory(handle);
}
export async function listSquareHistory(limit = 100, after?: string | null): Promise<{ rows: Record<string, any>[]; next: string | null }> {
  if (!native?.listSquareHistory) return { rows: [], next: null };
  return native.listSquareHistory(limit, after ?? null);
}

export async function putMigration(fields: Record<string, any>): Promise<Record<string, any>> {
  if (!native?.putMigration) throw new Error(CLOUDKIT_MISSING);
  return native.putMigration(fields);
}
export async function getMigration(): Promise<Record<string, any> | null> {
  if (!native?.getMigration) return null;
  return native.getMigration();
}
