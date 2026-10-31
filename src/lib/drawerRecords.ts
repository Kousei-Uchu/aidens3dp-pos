// Location: src/lib/drawerRecords.ts
// CloudKit sync, patch 6b (pure half): how the one shared cash drawer is laid out as CloudKit records.
// The shift is one small record (`drawer-shift`). Every ledger entry is its own record named by its id (`ledger-<id>`),
// written once and never edited, so two iPads can only add lines and nothing collides. The counts are not stored: they
// are worked out by replaying the entries. No React, no store, no native module, so it is tested on its own
// (tests/drawerrecords.test.ts). Decisions: dev_docs/CLOUDKIT_SYNC_DECISIONS.md item 6, Q12, O3.
import { applyEntry, cleanCounts, emptyLedger, LEDGER_LABEL, MAX_ENTRIES, type CashLedger, type Counts, type LedgerEntry } from './cashLedger';
import type { Shift } from '../state/store';

export const SHIFT_RECORD = 'drawer-shift';
export const ledgerRecordName = (entryId: string): string => `ledger-${entryId}`;
export const entryIdFromRecord = (name: string): string | null => (name.startsWith('ledger-') && name.length > 7 ? name.slice(7) : null);

type Fields = Record<string, string | number>;

/** The shift as record fields. `version` is how the app tells which copy is newer; CloudKit's change tag guards the write. */
export function shiftToFields(s: Shift, version: number): Fields {
  const f: Fields = { open: s.open ? 1 : 0, floatCents: s.floatCents, paidInCents: s.paidInCents, paidOutCents: s.paidOutCents, version };
  if (s.openedAt) f.openedAt = s.openedAt;
  if (s.staff) f.staff = s.staff;
  if (s.loanCents) f.loanCents = s.loanCents; // 0188: the part of paid in still owed back; absent means none
  return f;
}
const int = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
export function shiftFromFields(f: Record<string, unknown>): { shift: Shift; version: number } {
  const shift: Shift = { open: f.open === 1 || f.open === true, floatCents: int(f.floatCents), paidInCents: int(f.paidInCents), paidOutCents: int(f.paidOutCents) };
  if (typeof f.openedAt === 'string' && f.openedAt) shift.openedAt = f.openedAt;
  if (typeof f.staff === 'string' && f.staff) shift.staff = f.staff;
  if (int(f.loanCents)) shift.loanCents = int(f.loanCents);
  return { shift, version: int(f.version) };
}

/** A ledger entry as record fields. `delta` travels as JSON text; the other fields stay plain so they can be queried. */
export function entryToFields(e: LedgerEntry): Fields {
  const f: Fields = { ts: e.ts, kind: e.kind, delta: JSON.stringify(e.delta) };
  if (e.staff) f.staff = e.staff; if (e.note) f.note = e.note; if (e.saleUuid) f.saleUuid = e.saleUuid;
  return f;
}
/** Null for a record that is not a readable entry, so one bad record cannot break the drawer. */
export function entryFromFields(entryId: string, f: Record<string, unknown>): LedgerEntry | null {
  if (!entryId || typeof f.ts !== 'string' || typeof f.kind !== 'string' || !(f.kind in LEDGER_LABEL) || typeof f.delta !== 'string') return null;
  let delta: unknown; try { delta = JSON.parse(f.delta); } catch { return null; }
  if (!delta || typeof delta !== 'object' || Array.isArray(delta)) return null;
  const e: LedgerEntry = { id: entryId, ts: f.ts, kind: f.kind as LedgerEntry['kind'], delta: cleanCounts(delta as Counts) };
  if (typeof f.staff === 'string' && f.staff) e.staff = f.staff; if (typeof f.note === 'string' && f.note) e.note = f.note; if (typeof f.saleUuid === 'string' && f.saleUuid) e.saleUuid = f.saleUuid;
  return e;
}

/** Oldest first, ties broken by id, so every iPad replays the same entries in the same order and gets the same counts. */
const oldestFirst = (a: LedgerEntry, b: LedgerEntry): number => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id);

/**
 * The shared ledger from the entries CloudKit holds: duplicates by id dropped, counts replayed from `base` (empty by
 * default), history newest first and capped at MAX_ENTRIES like the local ledger. Pass every entry for exact counts.
 * If only the newest MAX_ENTRIES were loaded, the counts cover those alone, unless `base` holds the counts just before
 * the oldest entry loaded (see the open point in dev_docs/CLOUDKIT_SYNC_DECISIONS.md, item 6, O3).
 */
export function ledgerFromEntries(entries: LedgerEntry[], base: Counts = {}): CashLedger {
  const byId = new Map<string, LedgerEntry>();
  for (const e of entries) if (e && e.id && !byId.has(e.id)) byId.set(e.id, e);
  let l: CashLedger = { counts: cleanCounts(base), entries: [] };
  for (const e of Array.from(byId.values()).sort(oldestFirst)) l = applyEntry(l, e);
  return l.entries.length ? l : { ...emptyLedger(), counts: l.counts };
}

/** Entries we hold that CloudKit does not (by id), oldest first: what still has to be uploaded. */
export function entriesToUpload(local: LedgerEntry[], remoteIds: Set<string>): LedgerEntry[] {
  return local.filter(e => e.id && !remoteIds.has(e.id)).sort(oldestFirst).slice(-MAX_ENTRIES);
}
