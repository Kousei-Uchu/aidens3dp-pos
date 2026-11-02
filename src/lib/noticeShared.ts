// Location: src/lib/noticeShared.ts
// CloudKit sync, patch 6a (notices): the cash and refund notices, shared between registers.
//
// Decisions (dev_docs/CLOUDKIT_SYNC_DECISIONS.md item 10, Q2): only the two kinds that need a person wherever they are sync.
// `cash` (cash taken outside a drawer, which is now a shared drawer, so any register can add it to a count) and `refund` (a
// refund Shopify did not record needs a manager). The other six kinds describe one iPad or are worked out from Shopify on each
// iPad, so they stay local. Reading or dismissing a notice is per iPad: nothing about a notice changing on one register is ever sent.
//
// Each notice is one record, written once and never edited, named `notice-<register id>-<notice id>`. Because nothing is edited or
// deleted in CloudKit, a register that clears its notices would see them come back on the next read. `noticesSeen`, a device-only
// list of the record names this register has already taken in, stops that: a name in it is never brought in again, whether the
// notice is still on the list or was cleared. No React, no store, no native module: tested on its own (tests/noticeshared.test.ts).
import type { Notice } from './types';

type Fields = Record<string, string>;

export const SHARED_NOTICE_KINDS: readonly Notice['kind'][] = ['cash', 'refund'];
export const isSharedNoticeKind = (kind: unknown): kind is 'cash' | 'refund' => SHARED_NOTICE_KINDS.includes(kind as Notice['kind']);

/** A notice older than this is not sent and not brought in. A register that has just joined should not open on a pile of old ones. */
export const NOTICE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** The most notices one read brings in. Anything beyond it is marked taken in too, so it never arrives later as a late flood. */
export const IMPORT_LIMIT = 50;
/** How many record names `noticesSeen` keeps, newest last. Past this the oldest are forgotten, which is safe because they are past the age limit. */
export const SEEN_CAP = 500;
/** The same size as the local list in `notify`. */
export const NOTICE_LIST_CAP = 200;

/** A notice as read back: who raised it is part of it. `handle` is the record's name without its `notice-` prefix. */
export type SharedNotice = { handle: string; kind: 'cash' | 'refund'; title: string; body?: string; route?: string; ts: string; registerId: string; registerName: string };

export const noticeHandle = (registerId: string, noticeId: string): string => `${registerId}-${noticeId}`;
export const noticeRecordName = (handle: string): string => `notice-${handle}`;
export const noticeHandleFromRecord = (name: string): string | null => (name.startsWith('notice-') && name.length > 7 ? name.slice(7) : null);

/** The notice as record fields, labelled with the register that raised it. Notices hold no card or customer detail. */
export function noticeToFields(registerId: string, registerName: string, n: Notice): Fields {
  const f: Fields = { kind: n.kind, title: n.title, ts: n.ts, registerId, registerName };
  if (n.body) f.body = n.body; if (n.route) f.route = n.route;
  return f;
}

/** Null for a record that is not a readable shared notice, so one bad record cannot break the read. */
export function noticeFromFields(handle: string, f: Record<string, unknown>): SharedNotice | null {
  if (!handle || !isSharedNoticeKind(f.kind) || typeof f.title !== 'string' || !f.title) return null;
  if (typeof f.ts !== 'string' || Number.isNaN(Date.parse(f.ts)) || typeof f.registerId !== 'string' || !f.registerId) return null;
  const n: SharedNotice = { handle, kind: f.kind, title: f.title, ts: f.ts, registerId: f.registerId, registerName: typeof f.registerName === 'string' ? f.registerName : '' };
  if (typeof f.body === 'string' && f.body) n.body = f.body; if (typeof f.route === 'string' && f.route) n.route = f.route;
  return n;
}

const fresh = (ts: string, now: number): boolean => { const t = Date.parse(ts); return !Number.isNaN(t) && now - t <= NOTICE_MAX_AGE_MS; };

/**
 * This register's own notices that CloudKit lacks, oldest first: still unread, of a shared kind, and not past the age limit.
 * A notice already read here has been dealt with here, so sending it late would only raise a flag nobody needs.
 */
export function noticesToUpload(registerId: string, local: Notice[], remoteHandles: Set<string>, now: number): Notice[] {
  const seen = new Set<string>(); const out: Notice[] = [];
  for (const n of local) {
    if (n.read || !isSharedNoticeKind(n.kind) || !fresh(n.ts, now)) continue;
    const h = noticeHandle(registerId, n.id);
    if (remoteHandles.has(h) || seen.has(h)) continue;
    seen.add(h); out.push(n);
  }
  return out.sort((a, b) => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id));
}

export type ImportInput = {
  remote: SharedNotice[];
  /** This register's notices, newest first, as the app holds them now. */
  local: Notice[];
  /** The record names already taken in (`noticesSeen`). */
  seen: string[];
  registerId: string;
  now: number;
  /** False for a kind this device does not hold (a companion without the drawer raises no cash notices). */
  allowed: (kind: Notice['kind']) => boolean;
};
export type ImportResult = { notices: Notice[]; seen: string[]; added: number; changed: boolean };

/** The id a notice brought in from another register gets here. Worked out from the record, so it is the same however many times it is read. */
export const importedNoticeId = (handle: string): string => `shared-${handle}`;

/**
 * Take in the notices other registers raised that this register has not taken in yet. Rules:
 * - this register's own notices are never brought back (they are already here, or were cleared here on purpose);
 * - a record name in `seen` is never brought in again, so clearing or reading one stays per iPad;
 * - a notice past the age limit, of a kind this device does not hold, or the same as an unread one already listed is not shown,
 *   but is still marked taken in, so it does not come back later;
 * - at most IMPORT_LIMIT arrive at once, the newest, and the list stays newest first and capped.
 */
export function importNotices(i: ImportInput): ImportResult {
  const seen = new Set(i.seen); const have = new Set(i.local.map(n => n.id));
  const todo = i.remote.filter(r => r.registerId !== i.registerId && !seen.has(r.handle)).sort((a, b) => b.ts.localeCompare(a.ts) || a.handle.localeCompare(b.handle));
  if (!todo.length) return { notices: i.local, seen: i.seen, added: 0, changed: false };
  const added: Notice[] = []; const taken: string[] = []; const list = [...i.local];
  for (const r of todo) {
    taken.push(r.handle);
    const id = importedNoticeId(r.handle);
    if (have.has(id) || !fresh(r.ts, i.now) || !i.allowed(r.kind) || added.length >= IMPORT_LIMIT) continue;
    if (list.some(x => !x.read && x.kind === r.kind && x.title === r.title && x.body === r.body)) continue;
    const n: Notice = { id, ts: r.ts, kind: r.kind, title: r.title, from: r.registerName || 'another register', read: false };
    if (r.body) n.body = r.body; if (r.route) n.route = r.route;
    added.push(n); list.unshift(n); have.add(id);
  }
  const nextSeen = [...i.seen, ...taken.reverse()].slice(-SEEN_CAP);
  const notices = added.length ? list.sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, NOTICE_LIST_CAP) : i.local;
  return { notices, seen: nextSeen, added: added.length, changed: true };
}
