// Location: src/lib/cloudkit/eventCloud.ts
// CloudKit sync, patch 4 (transport half): events and payment attempts written to and read from CloudKit records.
// It joins the pure pieces (eventRecords.ts) to a small native interface. The native module is passed in, so the flow is tested
// with an in-memory fake and no iPad (tests/eventcloud.test.ts). Nothing calls this until a later patch wires the call sites in
// csvStore and Pay, and nothing reaches it unless the CloudKit backend is the active one, so today's behaviour is unchanged.
// Decisions: dev_docs/CLOUDKIT_SYNC_DECISIONS.md items 9 and 12, Q3, Q10, Q13.
import type { Attempt } from '../../state/store';
import { attemptFromFields, attemptToFields, eventFromFields, eventIdFromRecord, eventToFields, eventsToUpload, furtherStatus, isOpenStatus, type EventInput, type OpenStatus, type SharedAttempt, type SharedEvent } from '../eventRecords';
import { pageAll, PAGE_SIZE } from './drawerCloud';

type Rec = Record<string, any>;
type Page = { rows: Rec[]; next: string | null };

/** What events and attempts need of the native module. */
export type EventNative = {
  /** Write one event if it is not there yet. An event that already exists is returned as it is, never changed. */
  putEvent(handle: string, fields: Rec): Promise<Rec>;
  listEvents(limit: number, after?: string | null): Promise<Page>;
  /** Create or update an attempt. */
  putAttempt(handle: string, fields: Rec): Promise<Rec>;
  getAttempt(handle: string): Promise<Rec | null>;
  listAttempts(limit: number, after?: string | null): Promise<Page>;
  /** Write a resolution if there is none yet. If there is one, it is returned untouched: the first resolution wins. */
  putResolution(handle: string, fields: Rec): Promise<Rec>;
  getResolution(handle: string): Promise<Rec | null>;
  listResolutions(limit: number, after?: string | null): Promise<Page>;
};

/** Every event in CloudKit, from every register. Records that cannot be read are skipped. */
export async function pullCloudEvents(n: EventNative): Promise<SharedEvent[]> {
  const out: SharedEvent[] = [];
  for (const r of await pageAll(after => n.listEvents(PAGE_SIZE, after))) {
    const id = eventIdFromRecord(String(r.recordName ?? '')); const e = id ? eventFromFields(id, r) : null;
    if (e) out.push(e);
  }
  return out;
}

/**
 * Upload the events CloudKit does not hold yet, each written once, oldest first. Safe to repeat: an event already there is left
 * alone. This is also the one-off upload of a register's own history after it joins (decisions Q13). Returns how many were new.
 */
export async function pushCloudEvents(n: EventNative, registerId: string, registerName: string, local: EventInput[]): Promise<number> {
  const remoteIds = new Set<string>();
  for (const r of await pageAll(after => n.listEvents(PAGE_SIZE, after))) { const id = eventIdFromRecord(String(r.recordName ?? '')); if (id) remoteIds.add(id); }
  const todo = eventsToUpload(registerId, local, remoteIds);
  for (const { id, event } of todo) await n.putEvent(id, eventToFields(registerId, registerName, event));
  return todo.length;
}

const handleOf = (a: { saleUuid: string; ref: string }): string => `${a.saleUuid}-${a.ref}`;

/**
 * Write one payment attempt. Its status only moves forward, so an older copy cannot undo a newer one, and the attempt keeps the
 * register that first wrote it. If this register resolved it, the resolution is written once: when another register got there
 * first, theirs is kept and returned here, so the caller can say who resolved it. Returns the attempt as CloudKit now holds it.
 */
export async function pushCloudAttempt(n: EventNative, registerId: string, registerName: string, a: Attempt): Promise<SharedAttempt | null> {
  const h = handleOf(a);
  const { attempt, resolution } = attemptToFields(registerId, registerName, a);
  const stored = await n.getAttempt(h);
  if (stored) {
    if (isOpenStatus(stored.status)) attempt.status = furtherStatus(stored.status, attempt.status as OpenStatus);
    if (typeof stored.registerId === 'string' && stored.registerId) { attempt.registerId = stored.registerId; attempt.registerName = typeof stored.registerName === 'string' ? stored.registerName : ''; }
  }
  const saved = await n.putAttempt(h, attempt);
  const winner = resolution ? await n.putResolution(h, resolution) : await n.getResolution(h);
  return attemptFromFields(saved, winner);
}

/** Every attempt in CloudKit with its resolution, from every register: what a manager sees. Unreadable records are skipped. */
export async function pullCloudAttempts(n: EventNative): Promise<SharedAttempt[]> {
  const resolutions = new Map<string, Rec>();
  for (const r of await pageAll(after => n.listResolutions(PAGE_SIZE, after))) { const name = String(r.recordName ?? ''); if (name.startsWith('resolve-')) resolutions.set(name.slice(8), r); }
  const out: SharedAttempt[] = [];
  for (const r of await pageAll(after => n.listAttempts(PAGE_SIZE, after))) {
    const name = String(r.recordName ?? ''); if (!name.startsWith('attempt-')) continue;
    const a = attemptFromFields(r, resolutions.get(name.slice(8)));
    if (a) out.push(a);
  }
  return out;
}
