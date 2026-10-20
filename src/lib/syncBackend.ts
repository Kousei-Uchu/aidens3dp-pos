// Location: src/lib/syncBackend.ts
// CloudKit sync plan, patch 3: the seam between the app and wherever the shop's shared state lives.
//
// Everything shared between registers today goes through Shopify metaobjects, called directly from sync.ts. Patch 4 adds a
// CloudKit backend beside it, so sync.ts must not care which one is answering. This file is the interface both backends
// implement, plus the selector that picks one and the training guard that stops practice data ever reaching either.
//
// It holds no network code and no store, so the node tests pin the contract: a missing backend, a backend that is off, and
// training mode all behave the same way whatever is plugged in. The metaobject implementation is next door in
// src/lib/shopify/metaobjectBackend.ts, because that file carries the Shopify client.
import { isTraining } from './trainingGuard';

/**
 * The shared record types, named as the shop sees them rather than as Shopify or CloudKit store them. A backend maps each
 * name onto its own thing: the metaobject type (`pos_sale`) or the CloudKit record type (`Sale`).
 */
export type SharedType = 'cart' | 'layout' | 'sale' | 'rollup' | 'settings';
export const SHARED_TYPES: SharedType[] = ['cart', 'layout', 'sale', 'rollup', 'settings'];

/** One shared record, whatever the backend. `f` is the flat field bag the rest of the app already reads. */
export type BackendRow = { id: string; handle: string; updatedAt: string; f: Record<string, string> };

/** A page of records, newest first, plus the cursor for the next page (null when there is none). */
export type BackendPage = { rows: BackendRow[]; next: string | null };

/** What a list call asks for. Only what both backends can honour: page size and a cursor. */
export type BackendListOptions = { first?: number; after?: string | null };

/** Which backend is in use. Metaobject is the one that exists today; CloudKit arrives in patch 4. */
export type BackendKind = 'metaobject' | 'cloudkit';

/**
 * The operations sync.ts and the reports need of shared state. Small on purpose: read one, write one, page a list, make
 * sure the storage exists, and delete. A CloudKit backend implements the same five, so nothing above this line changes.
 */
export type SharedBackend = {
  kind: BackendKind;
  /** Make sure the storage for every shared type exists. Idempotent: safe to call on every start. */
  ensure(): Promise<void>;
  /** One record by key, or null when there is none. */
  get(type: SharedType, handle: string): Promise<BackendRow | null>;
  /** Write one record by key, creating or replacing. Returns the stored row. */
  put(type: SharedType, handle: string, fields: Record<string, string | number | undefined | null>): Promise<BackendRow>;
  /** A page of records, newest first. */
  list(type: SharedType, options?: BackendListOptions): Promise<BackendPage>;
  /** Delete one record by its row id. */
  remove(id: string): Promise<void>;
  /**
   * Whether an extra, later-added field can be written for this type. The metaobject backend adds the `sale_json` field on
   * demand and answers once it knows; a backend that always accepts its fields answers true. A caller that gets false still
   * writes the record, just without the extra field, so a sale is never lost to a schema that could not be widened.
   */
  detailReady?(type: SharedType): Promise<boolean>;
};

/** What is wrong when a write is asked for in practice mode. Read paths stay open so a course can teach on real history. */
export class BackendBlockedError extends Error {
  constructor(what: string) {
    super(`Training mode: ${what} is not written to the shop.`);
    this.name = 'BackendBlockedError';
  }
}

/** True when this backend may accept a write at all. CloudKit and metaobjects share the one training rule. */
export const backendWritable = (): boolean => !isTraining();

let current: SharedBackend | null = null;

/**
 * Point the app at a backend. The metaobject backend installs itself here at start-up; patch 4 will swap in CloudKit once
 * the owner's zone has migrated, and patch 8 adds the flag that switches back for a rollback.
 */
export function setBackend(backend: SharedBackend | null): void {
  current = backend;
}

/** The backend in use, or null before one is installed (a test, or a build with no shared storage wired up yet). */
export function activeBackend(): SharedBackend | null {
  return current;
}

/** The kind in use, for a screen that has to say where the records are kept. `none` before one is installed. */
export function activeBackendKind(): BackendKind | 'none' {
  return current?.kind ?? 'none';
}

/**
 * Fail with a clear reason, rather than an undefined-method crash, when a caller reaches for shared storage before any
 * backend exists. Every call below funnels through this, so the app has one sentence to show in that state.
 */
function requireBackend(): SharedBackend {
  if (!current) throw new Error('Shared storage is not connected on this till.');
  return current;
}

/** Make sure the storage exists, through whichever backend is in use. */
export const ensureShared = (): Promise<void> => requireBackend().ensure();

/** Read one shared record. Read-only, so it is allowed in practice mode. */
export const getShared = (type: SharedType, handle: string): Promise<BackendRow | null> => requireBackend().get(type, handle);

/**
 * Write one shared record. Refused in practice mode, so a course or Demo mode can never leak into the shop's real data,
 * which is the same rule kvWriteAllowed applies to local storage.
 */
export function putShared(type: SharedType, handle: string, fields: Record<string, string | number | undefined | null>): Promise<BackendRow> {
  if (!backendWritable()) throw new BackendBlockedError(`Writing ${type}`);
  return requireBackend().put(type, handle, fields);
}

/** A page of shared records. Read-only. */
export const listShared = (type: SharedType, options?: BackendListOptions): Promise<BackendPage> => requireBackend().list(type, options);

/** Delete one shared record. Refused in practice mode. */
export function removeShared(id: string): Promise<void> {
  if (!backendWritable()) throw new BackendBlockedError('Deleting a record');
  return requireBackend().remove(id);
}

/** Whether the backend can write a type's extra field. A backend with no such concern answers true, so the caller keeps its detail. */
export function detailReadyShared(type: SharedType): Promise<boolean> {
  return current?.detailReady ? current.detailReady(type) : Promise.resolve(true);
}
