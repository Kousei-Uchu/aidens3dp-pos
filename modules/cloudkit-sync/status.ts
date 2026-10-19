// The pure half of the CloudKit bridge (patch 1 of docs/CLOUDKIT_SYNC_PLAN.md). It holds the types and the "no native
// module" fallback, with no import of expo, so the node tests can check the fallback without a device. index.ts is the
// thin layer that hands it the real native module.

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

/** The shape the Swift module exposes. Null when the running build carries no CloudKit module. */
export type CloudKitSyncNative = {
  isSupported(): boolean;
  getAccountStatus(): Promise<CloudKitNativeStatus>;
};

/** What the rest of the app calls, whichever build it is in. */
export type CloudKitBridge = {
  /** True when this build carries the native module. */
  available: boolean;
  /** Whether CloudKit sync can run in this build and on this device. */
  isSupported(): boolean;
  /** The device's iCloud account state. */
  getAccountStatus(): Promise<CloudKitAccountStatus>;
};

/** Wrap a native module, or the absence of one, so callers always get a clear answer instead of a crash. */
export function makeCloudKit(native: CloudKitSyncNative | null): CloudKitBridge {
  return {
    available: native !== null,
    isSupported: () => native?.isSupported() ?? false,
    getAccountStatus: async () => (native ? native.getAccountStatus() : 'unavailable'),
  };
}
