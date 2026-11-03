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

// Patch 8b: change pushes. `startSubscriptions` asks CloudKit to push when the shop's records change and resolves true when both the private
// and the shared database are subscribed (it is safe to call on every launch). `onRemoteChange` fires when such a push arrives.
export async function startSubscriptions(): Promise<boolean> {
  if (!native?.startSubscriptions) return false;
  return native.startSubscriptions();
}
export function onRemoteChange(listener: () => void): () => void {
  const subscription = native?.addListener?.('onRemoteChange', listener);
  return () => subscription?.remove();
}

// Patch 4: sales and rollups (CloudKit backend)
export async function putSale(handle: string, fields: Record<string, any>, encrypted: Record<string, any> = {}): Promise<Record<string, any>> {
  if (!native?.putSale) throw new Error(CLOUDKIT_MISSING);
  return native.putSale(handle, fields, encrypted);
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

// Patch 7: the migration lease. Writes are always checked against the change tag the caller read (see MigrationNative in
// src/lib/cloudkit/migrationCloud.ts), so there is no unconditional put. The old putMigration was removed in 0212 for that reason.
export async function putMigrationIfUnchanged(fields: Record<string, any>, expectedTag: string | null): Promise<{ changed: boolean; tag?: string }> {
  if (!native?.putMigrationIfUnchanged) throw new Error(CLOUDKIT_MISSING);
  return native.putMigrationIfUnchanged(fields, expectedTag);
}
/** The migration record's plain fields with its change tag as `tag`, or null when there is none. */
export async function getMigration(): Promise<Record<string, any> | null> {
  if (!native?.getMigration) return null;
  return native.getMigration();
}

// Patch 6b: the shared cash drawer. The names match DrawerNative in src/lib/cloudkit/drawerCloud.ts, so this module
// can be handed to it as it is.
type Page = { rows: Record<string, any>[]; next: string | null };
export async function putDrawerShift(fields: Record<string, any>): Promise<Record<string, any>> {
  if (!native?.putDrawerShift) throw new Error(CLOUDKIT_MISSING);
  return native.putDrawerShift(fields);
}
export async function getDrawerShift(): Promise<Record<string, any> | null> {
  if (!native?.getDrawerShift) return null;
  return native.getDrawerShift();
}
export async function putLedgerEntry(handle: string, fields: Record<string, any>): Promise<Record<string, any>> {
  if (!native?.putLedgerEntry) throw new Error(CLOUDKIT_MISSING);
  return native.putLedgerEntry(handle, fields);
}
export async function listLedgerEntries(limit = 100, after?: string | null): Promise<Page> {
  if (!native?.listLedgerEntries) return { rows: [], next: null };
  return native.listLedgerEntries(limit, after ?? null);
}
export async function listLedgerSince(since: number, limit = 100, after?: string | null): Promise<Page> {
  if (!native?.listLedgerSince) return { rows: [], next: null };
  return native.listLedgerSince(since, limit, after ?? null);
}
export async function putDrawerCheckpoint(fields: Record<string, any>): Promise<Record<string, any>> {
  if (!native?.putDrawerCheckpoint) throw new Error(CLOUDKIT_MISSING);
  return native.putDrawerCheckpoint(fields);
}
export async function getDrawerCheckpoint(): Promise<Record<string, any> | null> {
  if (!native?.getDrawerCheckpoint) return null;
  return native.getDrawerCheckpoint();
}

// Patch 4: events and payment attempts. The names match EventNative in src/lib/cloudkit/eventCloud.ts, so this module can be
// handed to it as it is.
export async function putEvent(handle: string, fields: Record<string, any>): Promise<Record<string, any>> {
  if (!native?.putEvent) throw new Error(CLOUDKIT_MISSING);
  return native.putEvent(handle, fields);
}
export async function listEvents(limit = 100, after?: string | null): Promise<Page> {
  if (!native?.listEvents) return { rows: [], next: null };
  return native.listEvents(limit, after ?? null);
}
export async function putAttempt(handle: string, fields: Record<string, any>): Promise<Record<string, any>> {
  if (!native?.putAttempt) throw new Error(CLOUDKIT_MISSING);
  return native.putAttempt(handle, fields);
}
export async function getAttempt(handle: string): Promise<Record<string, any> | null> {
  if (!native?.getAttempt) return null;
  return native.getAttempt(handle);
}
export async function listAttempts(limit = 100, after?: string | null): Promise<Page> {
  if (!native?.listAttempts) return { rows: [], next: null };
  return native.listAttempts(limit, after ?? null);
}
// Patch 6a: the shared cash and refund notices. The names match NoticeNative in src/lib/cloudkit/noticeCloud.ts.
export async function putNotice(handle: string, fields: Record<string, any>): Promise<Record<string, any>> {
  if (!native?.putNotice) throw new Error(CLOUDKIT_MISSING);
  return native.putNotice(handle, fields);
}
export async function listNotices(limit = 100, after?: string | null): Promise<Page> {
  if (!native?.listNotices) return { rows: [], next: null };
  return native.listNotices(limit, after ?? null);
}
// Patch 6c: training progress. The names match TrainingNative in src/lib/cloudkit/trainingSync.ts.
export async function putTraining(handle: string, fields: Record<string, any>): Promise<Record<string, any>> {
  if (!native?.putTraining) throw new Error(CLOUDKIT_MISSING);
  return native.putTraining(handle, fields);
}
export async function listTraining(limit = 200, after?: string | null): Promise<Page> {
  if (!native?.listTraining) return { rows: [], next: null };
  return native.listTraining(limit, after ?? null);
}
// Patch 6c: the shared audit log. The names match AuditNative in src/lib/cloudkit/auditCloud.ts. `encrypted` holds `secure_json`.
export async function putAudit(handle: string, fields: Record<string, any>, encrypted: Record<string, any> = {}): Promise<Record<string, any>> {
  if (!native?.putAudit) throw new Error(CLOUDKIT_MISSING);
  return native.putAudit(handle, fields, encrypted);
}
export async function listAuditIndex(limit = 200, after?: string | null): Promise<Page> {
  if (!native?.listAuditIndex) return { rows: [], next: null };
  return native.listAuditIndex(limit, after ?? null);
}
export async function listAudit(limit = 200, after?: string | null): Promise<Page> {
  if (!native?.listAudit) return { rows: [], next: null };
  return native.listAudit(limit, after ?? null);
}
// Patch 6d: shared secrets. The names match SecretNative in src/lib/cloudkit/secretCloud.ts. `encrypted` holds `secure_json`.
export async function putSecret(handle: string, fields: Record<string, any>, encrypted: Record<string, any> = {}): Promise<Record<string, any>> {
  if (!native?.putSecret) throw new Error(CLOUDKIT_MISSING);
  return native.putSecret(handle, fields, encrypted);
}
export async function listSecrets(limit = 200, after?: string | null): Promise<Page> {
  if (!native?.listSecrets) return { rows: [], next: null };
  return native.listSecrets(limit, after ?? null);
}
// Patch 6a: the shared logo. The names match LogoNative in src/lib/cloudkit/logoCloud.ts.
export async function putLogo(fields: Record<string, any>, filePath: string | null): Promise<Record<string, any>> {
  if (!native?.putLogo) throw new Error(CLOUDKIT_MISSING);
  return native.putLogo(fields, filePath);
}
export async function getLogo(): Promise<Record<string, any> | null> {
  if (!native?.getLogo) return null;
  return native.getLogo();
}
export async function downloadLogo(): Promise<string | null> {
  if (!native?.downloadLogo) return null;
  return native.downloadLogo();
}
// Patch 6a: the shared Square history. The names match SquareNative in src/lib/cloudkit/squareCloud.ts.
export async function putSquareShard(handle: string, fields: Record<string, any>, filePath: string): Promise<Record<string, any>> {
  if (!native?.putSquareShard) throw new Error(CLOUDKIT_MISSING);
  return native.putSquareShard(handle, fields, filePath);
}
export async function getSquareManifest(): Promise<Record<string, any> | null> {
  if (!native?.getSquareManifest) return null;
  return native.getSquareManifest();
}
export async function putSquareManifest(fields: Record<string, any>, expectedTag: string | null): Promise<{ changed: boolean; tag?: string }> {
  if (!native?.putSquareManifest) throw new Error(CLOUDKIT_MISSING);
  return native.putSquareManifest(fields, expectedTag);
}
export async function downloadSquareShard(handle: string): Promise<string | null> {
  if (!native?.downloadSquareShard) return null;
  return native.downloadSquareShard(handle);
}
export async function putResolution(handle: string, fields: Record<string, any>): Promise<Record<string, any>> {
  if (!native?.putResolution) throw new Error(CLOUDKIT_MISSING);
  return native.putResolution(handle, fields);
}
export async function getResolution(handle: string): Promise<Record<string, any> | null> {
  if (!native?.getResolution) return null;
  return native.getResolution(handle);
}
export async function listResolutions(limit = 100, after?: string | null): Promise<Page> {
  if (!native?.listResolutions) return { rows: [], next: null };
  return native.listResolutions(limit, after ?? null);
}
