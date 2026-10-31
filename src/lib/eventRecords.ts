// Location: src/lib/eventRecords.ts
// CloudKit sync, patch 4 (pure half): events and payment attempts as CloudKit records.
//
// Events are the rows of `events.csv` (declined and unknown payments, voids, overrides, errors, paid in and out, shift opens and
// closes, no-sales, cancelled and failed refunds, staff switches). Each becomes one record, written once and never edited, named
// by an id worked out from the row itself, so the same event uploaded twice (a retry, or the one-off upload of a register's own
// history after it joins) lands on the same record. The local CSV stays as it is; the shared copy is these records, and
// `eventsCsv` builds a combined CSV from them on demand (decisions item 12, Q3).
//
// A payment attempt changes status over time, so it is two kinds of record: `attempt-<sale>-<ref>`, whose status only moves forward,
// and `resolve-<sale>-<ref>`, written once by whichever register resolves an unresolved payment first (decisions item 9, Q10).
// Because the resolution is its own write-once record, "the first resolution wins" holds by construction, with no merge needed.
// No React, no store, no native module: tested on its own (tests/eventrecords.test.ts).
import { EVENTS_HEADER, eventRow, line, type EventKind } from './csvFormat';
import { toDecimal } from './money';
import type { Attempt } from '../state/store';

type Fields = Record<string, string | number>;

// ── Events ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

export const EVENT_KINDS: readonly EventKind[] = ['declined', 'unknown_payment', 'unknown_resolved', 'void', 'override', 'error', 'paid_in', 'paid_out', 'shift_open', 'shift_close', 'no_sale', 'cancelled', 'refund_failed', 'staff_switch'];
/** An event as csvStore writes it, but with the time always set: the id is worked out from the time, so it must be the one written to the CSV. */
export type EventInput = { ts: string; kind: EventKind; saleUuid?: string; reference?: string; amountCents?: number; code?: string; message?: string; staff?: string; detail?: string };
/** An event as read back: who made it is part of it. */
export type SharedEvent = EventInput & { id: string; registerId: string; registerName: string };

/** A 53-bit string hash (cyrb53). Not a secret, only a stable short name for the same text. */
function hash53(text: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/**
 * The id of an event: this register plus a hash of its CSV row. The row already holds the time, kind, sale, reference, amount, code,
 * message, staff and detail, so the same row gives the same id whether it was just made or read back from `events.csv` later, and
 * two registers never share an id because the register id is part of it.
 */
export const eventId = (registerId: string, e: EventInput): string => `${registerId}-${hash53(eventRow(e))}`;
export const eventRecordName = (id: string): string => `event-${id}`;
export const eventIdFromRecord = (name: string): string | null => (name.startsWith('event-') && name.length > 6 ? name.slice(6) : null);

/** The event as record fields, labelled with the register that made it. Nothing here is encrypted: events hold no card or customer detail. */
export function eventToFields(registerId: string, registerName: string, e: EventInput): Fields {
  const f: Fields = { ts: e.ts, kind: e.kind, registerId, registerName };
  if (e.saleUuid) f.saleUuid = e.saleUuid; if (e.reference) f.reference = e.reference; if (e.amountCents !== undefined) f.amountCents = e.amountCents;
  if (e.code) f.code = e.code; if (e.message) f.message = e.message; if (e.staff) f.staff = e.staff; if (e.detail) f.detail = e.detail;
  return f;
}
/** Null for a record that is not a readable event, so one bad record cannot break the list. */
export function eventFromFields(id: string, f: Record<string, unknown>): SharedEvent | null {
  if (!id || typeof f.ts !== 'string' || typeof f.kind !== 'string' || !EVENT_KINDS.includes(f.kind as EventKind) || typeof f.registerId !== 'string') return null;
  const e: SharedEvent = { id, ts: f.ts, kind: f.kind as EventKind, registerId: f.registerId, registerName: typeof f.registerName === 'string' ? f.registerName : '' };
  for (const k of ['saleUuid', 'reference', 'code', 'message', 'staff', 'detail'] as const) if (typeof f[k] === 'string' && f[k]) e[k] = f[k] as string;
  if (typeof f.amountCents === 'number' && Number.isFinite(f.amountCents)) e.amountCents = Math.round(f.amountCents);
  return e;
}

const oldestFirst = (a: { ts: string; id: string }, b: { ts: string; id: string }): number => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id);
/** Events this register holds that CloudKit does not (by id), oldest first: what is still to upload. */
export function eventsToUpload(registerId: string, local: EventInput[], remoteIds: Set<string>): { id: string; event: EventInput }[] {
  const seen = new Set<string>(); const out: { id: string; event: EventInput }[] = [];
  for (const event of local) { const id = eventId(registerId, event); if (!remoteIds.has(id) && !seen.has(id)) { seen.add(id); out.push({ id, event }); } }
  return out.sort((a, b) => oldestFirst({ ts: a.event.ts, id: a.id }, { ts: b.event.ts, id: b.id }));
}

/** The combined CSV of every register's events, oldest first, duplicates by id once: the `events.csv` columns plus the register's name. */
export function eventsCsv(events: SharedEvent[]): string {
  const byId = new Map<string, SharedEvent>(); for (const e of events) if (e?.id && !byId.has(e.id)) byId.set(e.id, e);
  const rows = Array.from(byId.values()).sort(oldestFirst).map(e => line([e.ts, e.kind, e.saleUuid, e.reference, e.amountCents === undefined ? '' : toDecimal(e.amountCents), e.code, e.message, e.staff, e.detail, e.registerName]));
  return line([...EVENTS_HEADER, 'register']) + rows.join('');
}

// ── Payment attempts ─────────────────────────────────────────────────────────────────────────────────────────────────────

export const attemptRecordName = (saleUuid: string, ref: string): string => `attempt-${saleUuid}-${ref}`;
export const resolutionRecordName = (saleUuid: string, ref: string): string => `resolve-${saleUuid}-${ref}`;
export type SharedAttempt = Attempt & { registerId: string; registerName: string; resolvedAt?: string };

type Open = Exclude<Attempt['status'], 'resolved'>;
const OPEN: readonly Open[] = ['started', 'unknown', 'cancelled', 'declined', 'approved'];
/** How far along an attempt is. A status only ever moves to a higher number, so a late upload from an offline register cannot undo a newer one. */
const RANK: Record<Open, number> = { started: 0, unknown: 1, cancelled: 2, declined: 2, approved: 2 };
/** The status to keep when two copies of an attempt meet: the further along one, and the one already stored when they tie. */
export const furtherStatus = (stored: Open, incoming: Open): Open => (RANK[incoming] > RANK[stored] ? incoming : stored);

/**
 * An attempt as its two records' fields. A resolved attempt writes its open status as `unknown` (it was unresolved until someone
 * resolved it) and adds the resolution fields, which are written once.
 */
export function attemptToFields(registerId: string, registerName: string, a: Attempt): { attempt: Fields; resolution?: Fields } {
  const open: Open = a.status === 'resolved' ? 'unknown' : a.status;
  const attempt: Fields = { ref: a.ref, saleUuid: a.saleUuid, amountCents: a.amountCents, ts: a.ts, status: open, registerId, registerName };
  if (a.note) attempt.note = a.note;
  if (a.status !== 'resolved') return { attempt };
  const resolution: Fields = { ref: a.ref, saleUuid: a.saleUuid, resolvedBy: a.resolvedBy ?? registerName, resolvedAt: new Date().toISOString(), registerId, registerName };
  return { attempt, resolution };
}

/** The attempt as read back, with its resolution if one was written. Null for a record that is not a readable attempt. */
export function attemptFromFields(f: Record<string, unknown>, resolution?: Record<string, unknown> | null): SharedAttempt | null {
  if (typeof f.ref !== 'string' || typeof f.saleUuid !== 'string' || typeof f.ts !== 'string' || typeof f.registerId !== 'string') return null;
  if (typeof f.amountCents !== 'number' || !Number.isFinite(f.amountCents) || !OPEN.includes(f.status as Open)) return null;
  const a: SharedAttempt = { ref: f.ref, saleUuid: f.saleUuid, amountCents: Math.round(f.amountCents), ts: f.ts, status: f.status as Open, registerId: f.registerId, registerName: typeof f.registerName === 'string' ? f.registerName : '' };
  if (typeof f.note === 'string' && f.note) a.note = f.note;
  if (resolution && typeof resolution.resolvedBy === 'string' && resolution.resolvedBy) {
    a.status = 'resolved'; a.resolvedBy = resolution.resolvedBy;
    if (typeof resolution.resolvedAt === 'string') a.resolvedAt = resolution.resolvedAt;
  }
  return a;
}

/** Attempts that still need someone, shop-wide: started or unknown and not resolved, newest first. */
export const unresolvedAttempts = (list: SharedAttempt[]): SharedAttempt[] =>
  list.filter(a => a.status === 'started' || a.status === 'unknown').sort((a, b) => b.ts.localeCompare(a.ts));
