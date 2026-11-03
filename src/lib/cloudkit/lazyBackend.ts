// Location: src/lib/cloudkit/lazyBackend.ts
// CloudKit sync, patch 7 and later: a handle on one of the two shared-state backends that is reached directly rather than through the
// seam's "active backend". The migration reads Shopify and writes CloudKit whichever backend the app is using, and the missing-order job
// reads CloudKit. The seam (syncBackend.ts) only ever reaches the active one, so these are the one other way in. Reads are free; a write
// checks the same guard the seam does (practice and Demo mode switch it off), so tests/demoguard.test.ts keeps it whole.
// Both backends are loaded on demand, so a node test can import the files that use this without the native module.
import { BackendBlockedError, backendWritable, type SharedBackend } from '../syncBackend';
import type { VerifyTarget } from './migrationVerify';

export type BackendKind = 'metaobject' | 'cloudkit';

export const loadBackend = async (kind: BackendKind): Promise<SharedBackend> =>
  kind === 'cloudkit' ? (await import('./cloudkitBackend')).cloudkitBackend : (await import('../shopify/metaobjectBackend')).metaobjectBackend;

/** The list, get and put the migration needs, over a backend loaded when first used. `put` stops on the guard. */
export const lazyBackend = (kind: BackendKind): VerifyTarget => ({
  list: async (t, o) => (await loadBackend(kind)).list(t, o),
  get: async (t, h) => (await loadBackend(kind)).get(t, h),
  put: async (t, h, f) => {
    if (!backendWritable()) throw new BackendBlockedError(`Writing ${t}`);
    return (await loadBackend(kind)).put(t, h, f);
  },
});
