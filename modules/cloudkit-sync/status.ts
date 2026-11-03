// The pure half of the CloudKit bridge (patches 1 and 2 of dev_docs/CLOUDKIT_SYNC_PLAN.md). It holds the types and the "no
// native module" fallback, with no import of expo, so the node tests can check the fallback without a device. index.ts
// is the thin layer that hands it the real native module.

/** The device's iCloud state, matching CloudKit's own account statuses, plus "unavailable" when the module is missing. */
export type CloudKitAccountStatus =
  | 'available'
  | 'noAccount'
  | 'restricted'
  | 'couldNotDetermine'
  | 'temporarilyUnavailable'
  | 'unavailable';

/** The statuses the native module itself can return (never "unavailable", which only the fallback produces). */
export type CloudKitNativeStatus = Exclude<CloudKitAccountStatus, 'unavailable'>;

/** Which side of the shop's share this till is on: the one that made it, one that joined, or neither. */
export type CloudKitRole = 'owner' | 'participant' | 'none';

/** What the Cloud sync page shows: the iCloud account state, this till's role, and the invite link when it owns the shop. */
export type CloudKitState = {
  account: CloudKitAccountStatus;
  role: CloudKitRole;
  shareURL: string | null;
};

/** The shape the Swift module exposes. Null when the running build carries no CloudKit module. */
export type CloudKitSyncNative = {
  isSupported(): boolean;
  getAccountStatus(): Promise<CloudKitNativeStatus>;
  getState(): Promise<{ account: CloudKitNativeStatus; role: string; shareURL: string | null }>;
  /** Create the shop's zone and invite link, or hand back the existing link. */
  createZoneAndShare(): Promise<string>;
  /** Join the shop from an invite link. */
  acceptShare(url: string): Promise<boolean>;
  /** An invite link that opened the app before the page was open, if there is one. */
  takePendingInvite(): Promise<string | null>;
  addListener?(event: 'onShareJoined', listener: (payload: { ok: boolean; message: string }) => void): { remove(): void };
  // Patch 4: sales and rollups
  /** `encrypted` holds the fields stored as CloudKit encrypted values (a sale's `secure_json`); the record it returns carries the ones this device could read under `encrypted`. */
  putSale?(handle: string, fields: Record<string, any>, encrypted: Record<string, any>): Promise<Record<string, any>>;
  getSale?(handle: string): Promise<Record<string, any> | null>;
  listSales?(limit: number, after?: string | null): Promise<{ rows: Record<string, any>[]; next: string | null }>;
  putRollup?(handle: string, fields: Record<string, any>): Promise<Record<string, any>>;
  getRollup?(handle: string): Promise<Record<string, any> | null>;
  listRollups?(limit: number, after?: string | null): Promise<{ rows: Record<string, any>[]; next: string | null }>;
  // Patch 4: events and payment attempts
  putEvent?(handle: string, fields: Record<string, any>): Promise<Record<string, any>>;
  listEvents?(limit: number, after?: string | null): Promise<{ rows: Record<string, any>[]; next: string | null }>;
  putAttempt?(handle: string, fields: Record<string, any>): Promise<Record<string, any>>;
  getAttempt?(handle: string): Promise<Record<string, any> | null>;
  listAttempts?(limit: number, after?: string | null): Promise<{ rows: Record<string, any>[]; next: string | null }>;
  putResolution?(handle: string, fields: Record<string, any>): Promise<Record<string, any>>;
  getResolution?(handle: string): Promise<Record<string, any> | null>;
  listResolutions?(limit: number, after?: string | null): Promise<{ rows: Record<string, any>[]; next: string | null }>;
  putNotice?(handle: string, fields: Record<string, any>): Promise<Record<string, any>>;
  listNotices?(limit: number, after?: string | null): Promise<{ rows: Record<string, any>[]; next: string | null }>;
  // Patch 6c: training progress (one record per person per module)
  putTraining?(handle: string, fields: Record<string, any>): Promise<Record<string, any>>;
  listTraining?(limit: number, after?: string | null): Promise<{ rows: Record<string, any>[]; next: string | null }>;
  // Patch 6c: the shared audit log (one record per event, content in one encrypted field)
  putAudit?(handle: string, fields: Record<string, any>, encrypted: Record<string, any>): Promise<Record<string, any>>;
  listAuditIndex?(limit: number, after?: string | null): Promise<{ rows: Record<string, any>[]; next: string | null }>;
  listAudit?(limit: number, after?: string | null): Promise<{ rows: Record<string, any>[]; next: string | null }>;
  // Patch 6d: shared secrets (one record per secret, content in one encrypted field)
  putSecret?(handle: string, fields: Record<string, any>, encrypted: Record<string, any>): Promise<Record<string, any>>;
  listSecrets?(limit: number, after?: string | null): Promise<{ rows: Record<string, any>[]; next: string | null }>;
  // Patch 6a: the shared logo (one record with an image asset)
  putLogo?(fields: Record<string, any>, filePath: string | null): Promise<Record<string, any>>;
  getLogo?(): Promise<Record<string, any> | null>;
  downloadLogo?(): Promise<string | null>;
  // Patch 6a: the shared Square history (one shard record per month with an asset, and one manifest record)
  putSquareShard?(handle: string, fields: Record<string, any>, filePath: string): Promise<Record<string, any>>;
  getSquareManifest?(): Promise<Record<string, any> | null>;
  putSquareManifest?(fields: Record<string, any>, expectedTag: string | null): Promise<{ changed: boolean; tag?: string }>;
  downloadSquareShard?(handle: string): Promise<string | null>;
  // Patch 6b: the shared cash drawer
  putDrawerShift?(fields: Record<string, any>): Promise<Record<string, any>>;
  getDrawerShift?(): Promise<Record<string, any> | null>;
  putLedgerEntry?(handle: string, fields: Record<string, any>): Promise<Record<string, any>>;
  listLedgerEntries?(limit: number, after?: string | null): Promise<{ rows: Record<string, any>[]; next: string | null }>;
  listLedgerSince?(since: number, limit: number, after?: string | null): Promise<{ rows: Record<string, any>[]; next: string | null }>;
  putDrawerCheckpoint?(fields: Record<string, any>): Promise<Record<string, any>>;
  getDrawerCheckpoint?(): Promise<Record<string, any> | null>;
  // Patch 5: saved carts
  putCart?(handle: string, fields: Record<string, any>): Promise<Record<string, any>>;
  getCart?(handle: string): Promise<Record<string, any> | null>;
  listCarts?(limit: number, after?: string | null): Promise<{ rows: Record<string, any>[]; next: string | null }>;
  // Patch 6: settings and layout
  putSettings?(handle: string, fields: Record<string, any>): Promise<Record<string, any>>;
  getSettings?(handle: string): Promise<Record<string, any> | null>;
  listSettings?(limit: number, after?: string | null): Promise<{ rows: Record<string, any>[]; next: string | null }>;
  putLayout?(handle: string, fields: Record<string, any>): Promise<Record<string, any>>;
  getLayout?(handle: string): Promise<Record<string, any> | null>;
  listLayout?(limit: number, after?: string | null): Promise<{ rows: Record<string, any>[]; next: string | null }>;
  putSquareHistory?(handle: string, fields: Record<string, any>): Promise<Record<string, any>>;
  getSquareHistory?(handle: string): Promise<Record<string, any> | null>;
  listSquareHistory?(limit: number, after?: string | null): Promise<{ rows: Record<string, any>[]; next: string | null }>;
  putMigrationIfUnchanged?(fields: Record<string, any>, expectedTag: string | null): Promise<{ changed: boolean; tag?: string }>;
  getMigration?(): Promise<Record<string, any> | null>;
};

/** What the rest of the app calls, whichever build it is in. */
export type CloudKitBridge = {
  /** True when this build carries the native module. */
  available: boolean;
  /** Whether CloudKit sync can run in this build and on this device. */
  isSupported(): boolean;
  /** The device's iCloud account state. */
  getAccountStatus(): Promise<CloudKitAccountStatus>;
  /** The account state, this till's role and the invite link. */
  getState(): Promise<CloudKitState>;
  /** Create the shop's zone and invite link, or hand back the existing link. */
  createZoneAndShare(): Promise<string>;
  /** Join the shop from an invite link. Throws with a plain reason when the link cannot be used. */
  acceptShare(url: string): Promise<void>;
  /** An invite link that opened the app before the page was open, if there is one. */
  takePendingInvite(): Promise<string | null>;
};

/** What a caller is told when the running build has no CloudKit module at all. */
export const CLOUDKIT_MISSING = 'This build has no CloudKit sync. Update the app to share records between tills.';

/** A plain sentence for the iCloud account state, so the page never has to spell out six cases itself. */
export function accountLine(status: CloudKitAccountStatus): string {
  switch (status) {
    case 'available': return 'Signed in to iCloud.';
    case 'noAccount': return 'This till is not signed in to iCloud. Sign in under Settings, then come back.';
    case 'restricted': return 'iCloud is restricted on this till, so records cannot be shared here.';
    case 'temporarilyUnavailable': return 'iCloud is busy right now. Try again in a moment.';
    case 'couldNotDetermine': return 'Could not reach iCloud. Check the connection and try again.';
    case 'unavailable': return CLOUDKIT_MISSING;
  }
}

/** The role, narrowed to the three the app knows. An unexpected word from native reads as "none" rather than crashing. */
export const cloudKitRole = (value: string): CloudKitRole => (value === 'owner' || value === 'participant' ? value : 'none');

/** Wrap a native module, or the absence of one, so callers always get a clear answer instead of a crash. */
export function makeCloudKit(native: CloudKitSyncNative | null): CloudKitBridge {
  return {
    available: native !== null,
    isSupported: () => native?.isSupported() ?? false,
    getAccountStatus: async () => (native ? native.getAccountStatus() : 'unavailable'),
    getState: async () => {
      if (!native) return { account: 'unavailable', role: 'none', shareURL: null };
      const state = await native.getState();
      return { account: state.account, role: cloudKitRole(state.role), shareURL: state.shareURL ?? null };
    },
    createZoneAndShare: async () => {
      if (!native) throw new Error(CLOUDKIT_MISSING);
      return native.createZoneAndShare();
    },
    acceptShare: async (url: string) => {
      if (!native) throw new Error(CLOUDKIT_MISSING);
      await native.acceptShare(url);
    },
    takePendingInvite: async () => (native ? native.takePendingInvite() : null),
  };
}
