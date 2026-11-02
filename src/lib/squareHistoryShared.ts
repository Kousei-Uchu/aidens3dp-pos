// Location: src/lib/squareHistoryShared.ts
// CloudKit sync, patch 6a (Square history shards): the imported Square history, shared between registers one month at a time.
//
// Decisions (dev_docs/CLOUDKIT_SYNC_PLAN.md, "Square history structure and size"): the shard is the month file the app already keeps
// (`sales-<YYYY-MM>.json.gz`), one CloudKit asset per month, and one manifest record lists them. No new packing is needed, except for one
// change this patch makes to the plan: the copy that goes to iCloud has the customer's name, email and phone taken out. The history files
// hold them (squareConvert.ts keeps `customer` from Square), and the plan says no customer name, email or phone reaches CloudKit.
// The month files on this iPad are never changed by sending.
//
// Two ids per month, because the copy in iCloud is not the same bytes as the file on the iPad:
//  - `hash` is the hash of this register's own month file.
//  - `sid` (shared id) is the hash of the copy in iCloud, with the customer details removed.
// Each register keeps `squareBase` (device only): for every month, the pair (`l`, `s`) both sides last agreed on. A month changed here
// is told from one changed elsewhere by comparing against it, as the logo and the grid layout do. No React, no files, no native module:
// tested on its own (tests/squareshared.test.ts).
import { gzipSync, strToU8 } from 'fflate';
import { hash53 } from './eventRecords';
import type { HistSale } from './squareConvert';

export const SQUARE_MANIFEST_RECORD = 'square-manifest';
/** A month file bigger than this is neither sent nor taken in. A busy month is a few hundred KB packed. */
export const MAX_SHARD_BYTES = 8_000_000;
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const isMonth = (x: unknown): x is string => typeof x === 'string' && MONTH_RE.test(x);
export const monthFileName = (month: string): string => `sales-${month}.json.gz`;
/** The month a stored file holds, or null when the name is not a month file (manifest.json and rollups.json.gz are not). */
export const monthOfFile = (name: string): string | null => { const m = /^sales-(\d{4}-\d{2})\.json\.gz$/.exec(name); return m && isMonth(m[1]) ? m[1] : null; };
/** The name of a shard record, without the fixed prefix the native module adds. The id is part of the name, so a shard is never rewritten. */
export const shardHandle = (month: string, sid: string): string => `${month}-${sid}`;
const SID_RE = /^[A-Za-z0-9_-]{1,40}$/;

/** What this register holds for one month. `sales` is the number of records in the file (0 when the register only knows the file name). */
export type LocalMonth = { month: string; hash: string; bytes: number; sales: number };
/** What the shop's manifest says about one month. */
export type ShardEntry = { month: string; sid: string; bytes: number; sales: number };
export type ShardMeta = { createdAt?: string; from?: string; to?: string; locations: string[] };
/**
 * The shop's side as read back. `unreadable` is a manifest that exists but cannot be understood: nothing is done on it, because reading it
 * as empty would look like every month had been removed.
 */
export type RemoteSquare = { kind: 'absent' } | { kind: 'unreadable' } | { kind: 'manifest'; tag: string; entries: Record<string, ShardEntry>; meta: ShardMeta };

export type BaseEntry = { l: string; s: string };
export type SquareBase = Record<string, BaseEntry>;

// ── the copy that goes to iCloud ─────────────────────────────────────────────────────────────────
/**
 * Customer name, email and phone removed. The Square customer id stays (it is Square's own opaque id, as a Shopify id is for a sale), so a
 * sale is still told apart from a walk-in. Free text a cashier typed (an order's ticket name, a line note) is not touched, the same known
 * minor exception as a note on a sale (decisions item 18).
 */
export function stripCustomers(sales: HistSale[]): HistSale[] {
  return sales.map(s => (s.customer ? { ...s, customer: { id: s.customer.id, name: '' } } : s));
}
/** Packed the same way every time. `packJson` in squareHistory.ts stamps the current time into the gzip header, so the same sales would hash differently on every call. */
export const packStable = (v: unknown): Uint8Array => gzipSync(strToU8(JSON.stringify(v)), { level: 9, mtime: 0 });
/** A short name for a file's bytes. It is taken over the file's base64 text, so the same file hashes the same on every iPad. */
export const shardHash = (base64: string): string => hash53(base64);

// ── the manifest record ──────────────────────────────────────────────────────────────────────────
type Fields = Record<string, string | number | boolean>;

/** The plain fields of the manifest record. The month list is one JSON text, because CloudKit fields are flat. */
export function manifestToFields(entries: Record<string, ShardEntry>, meta: ShardMeta, registerId: string, registerName: string, ts: string): Fields {
  const list = Object.values(entries).sort((a, b) => a.month.localeCompare(b.month)).map(e => ({ m: e.month, s: e.sid, b: e.bytes, n: e.sales }));
  return { files: JSON.stringify(list), count: list.length, locations: JSON.stringify(meta.locations), createdAt: meta.createdAt ?? '', from: meta.from ?? '', to: meta.to ?? '', ts, registerId, registerName };
}
/** The plain fields of one shard record. The image is the asset. */
export const shardToFields = (e: ShardEntry, registerId: string, registerName: string, ts: string): Fields => ({ month: e.month, sid: e.sid, bytes: e.bytes, sales: e.sales, ts, registerId, registerName });

const text = (x: unknown): string | undefined => (typeof x === 'string' && x ? x : undefined);

/** Reads the manifest. Entries that are not understood are dropped one by one, so one bad month cannot hide the rest. */
export function manifestFromFields(f: Record<string, unknown> | null | undefined): RemoteSquare {
  if (!f) return { kind: 'absent' };
  let list: unknown;
  try { list = JSON.parse(typeof f.files === 'string' ? f.files : 'null'); } catch { return { kind: 'unreadable' }; }
  if (!Array.isArray(list)) return { kind: 'unreadable' };
  const entries: Record<string, ShardEntry> = {};
  for (const x of list) {
    const e = x as { m?: unknown; s?: unknown; b?: unknown; n?: unknown } | null;
    if (!e || !isMonth(e.m) || typeof e.s !== 'string' || !SID_RE.test(e.s)) continue;
    const bytes = Number(e.b); const sales = Number(e.n);
    if (!Number.isInteger(bytes) || bytes <= 0 || bytes > MAX_SHARD_BYTES || !Number.isInteger(sales) || sales < 0) continue;
    entries[e.m] = { month: e.m, sid: e.s, bytes, sales };
  }
  let locations: string[] = [];
  try { const l = JSON.parse(typeof f.locations === 'string' ? f.locations : '[]'); if (Array.isArray(l)) locations = l.filter((v): v is string => typeof v === 'string'); } catch { /* the list is optional */ }
  return { kind: 'manifest', tag: typeof f.tag === 'string' ? f.tag : '', entries, meta: { createdAt: text(f.createdAt), from: text(f.from), to: text(f.to), locations } };
}

// ── deciding ─────────────────────────────────────────────────────────────────────────────────────
export type MonthAction = 'none' | 'push' | 'pull' | 'removeRemote' | 'removeLocal' | 'forget';

/**
 * What to do about one month, given this register's file, the shop's entry and `b` (what both last agreed on; absent when they never have).
 * "Changed here" means this register's file differs from the base. "Changed there" means the shop's entry does.
 *  - Neither changed: nothing.
 *  - Only here: send it. A file deleted here is removed from the shop.
 *  - Only there: take it. A month the shop removed is deleted here, but only because this register had not changed it since the base.
 *  - Both: never lose a month that exists on one side. If both have it, the one with more sales wins and a tie keeps this register's.
 *  - Neither side has it any more but a base is held: forget the base.
 * A month never seen before cannot be deleted by a guess, because a delete needs a base that both sides agreed on.
 */
export function decideMonth(l: LocalMonth | undefined, r: ShardEntry | undefined, b: BaseEntry | undefined): MonthAction {
  const lc = (l?.hash ?? '') !== (b?.l ?? ''); const rc = (r?.sid ?? '') !== (b?.s ?? '');
  if (!l && !r) return b ? 'forget' : 'none';
  if (!lc && !rc) return 'none';
  if (lc && !rc) return l ? 'push' : 'removeRemote';
  if (!lc && rc) return r ? 'pull' : 'removeLocal';
  if (!l) return 'pull';
  if (!r) return 'push';
  return r.sales > l.sales ? 'pull' : 'push';
}

/** Every month that needs something done, oldest first. */
export function planSquare(local: LocalMonth[], remote: Record<string, ShardEntry>, base: SquareBase): { month: string; action: MonthAction }[] {
  const lm = new Map(local.map(m => [m.month, m] as const));
  const months = new Set<string>([...lm.keys(), ...Object.keys(remote), ...Object.keys(base)]);
  const out: { month: string; action: MonthAction }[] = [];
  for (const month of [...months].sort()) { const action = decideMonth(lm.get(month), remote[month], base[month]); if (action !== 'none') out.push({ month, action }); }
  return out;
}

// ── the device-only base ─────────────────────────────────────────────────────────────────────────
export function parseBase(text: string | undefined | null): SquareBase {
  if (!text) return {};
  try {
    const raw = JSON.parse(text) as Record<string, unknown>; const out: SquareBase = {};
    if (!raw || typeof raw !== 'object') return {};
    for (const [m, v] of Object.entries(raw)) {
      const e = v as { l?: unknown; s?: unknown } | null;
      if (isMonth(m) && e && typeof e.l === 'string' && typeof e.s === 'string') out[m] = { l: e.l, s: e.s };
    }
    return out;
  } catch { return {}; }
}
export const serializeBase = (b: SquareBase): string => JSON.stringify(Object.fromEntries(Object.entries(b).sort(([a], [c]) => a.localeCompare(c))));
