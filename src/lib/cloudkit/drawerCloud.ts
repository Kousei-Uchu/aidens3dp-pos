// Location: src/lib/cloudkit/drawerCloud.ts
// CloudKit sync, patch 6b (transport half): reading and writing the one shared cash drawer as CloudKit records.
// It joins the pure pieces (drawerRecords.ts, drawerCheckpoint.ts) to a small native interface. The native module is
// passed in, so the whole flow is tested here with an in-memory fake and no iPad. Nothing reaches this file unless the
// CloudKit backend is the active one (sync.ts checks), so the Shopify drawer is untouched until cut-over.
// Decisions: dev_docs/CLOUDKIT_SYNC_DECISIONS.md item 6, Q12, O3.
import type { CashLedger, LedgerEntry } from '../cashLedger';
import type { Shift } from '../../state/store';
import { checkpointFromFields, checkpointToFields, ledgerFromRemote, makeCheckpoint, newestStamp, shouldReplaceCheckpoint, type Checkpoint, type StampedEntry } from '../drawerCheckpoint';
import { entriesToUpload, entryFromFields, entryIdFromRecord, entryToFields, shiftFromFields, shiftToFields } from '../drawerRecords';

type Rec = Record<string, any>;
type Page = { rows: Rec[]; next: string | null };

/** What the drawer needs of the native module. `createdAt` on a returned record is CloudKit's creation time, in seconds. */
export type DrawerNative = {
  putDrawerShift(fields: Rec): Promise<Rec>;
  getDrawerShift(): Promise<Rec | null>;
  /** Write one ledger entry if it is not there yet. An entry that already exists is returned as it is, never changed. */
  putLedgerEntry(handle: string, fields: Rec): Promise<Rec>;
  /** The newest entries first. */
  listLedgerEntries(limit: number, after?: string | null): Promise<Page>;
  /** Entries created after `since` (seconds), oldest first. */
  listLedgerSince(since: number, limit: number, after?: string | null): Promise<Page>;
  putDrawerCheckpoint(fields: Rec): Promise<Rec>;
  getDrawerCheckpoint(): Promise<Rec | null>;
};

export const PAGE_SIZE = 200;
export const HISTORY_LIMIT = 1000; // the same cap as the local ledger
const EPOCH_STAMP = '1970-01-01T00:00:00.000Z';
const toStamp = (seconds: unknown): string => new Date((Number(seconds) || 0) * 1000).toISOString();

export async function pageAll(read: (after: string | null) => Promise<Page>, max = Infinity): Promise<Rec[]> {
  const out: Rec[] = []; let after: string | null = null;
  for (;;) {
    const page = await read(after); out.push(...(page.rows ?? []));
    if (!page.next || out.length >= max) break;
    after = page.next;
  }
  return out;
}
function stamped(rows: Rec[]): StampedEntry[] {
  const out: StampedEntry[] = [];
  for (const r of rows) {
    const id = entryIdFromRecord(String(r.recordName ?? '')); const entry = id ? entryFromFields(id, r) : null;
    if (entry) out.push({ entry, stamp: toStamp(r.createdAt) });
  }
  return out;
}

/** The shared drawer as CloudKit holds it. `replay` is the entries counted on top of the checkpoint, for writing the next one. */
export type CloudDrawer = { shift: { shift: Shift; version: number } | null; ledger: CashLedger; checkpoint: Checkpoint | null; replay: StampedEntry[]; knownIds: Set<string>; empty: boolean };

export async function pullCloudDrawer(n: DrawerNative): Promise<CloudDrawer> {
  const cpRec = await n.getDrawerCheckpoint();
  const checkpoint = cpRec ? checkpointFromFields(cpRec) : null; // an unreadable checkpoint means replay everything
  const since = checkpoint ? Date.parse(checkpoint.asOfStamp) / 1000 : 0;
  const replay = stamped(await pageAll(after => n.listLedgerSince(since, PAGE_SIZE, after)));
  const history = stamped(await pageAll(after => n.listLedgerEntries(PAGE_SIZE, after), HISTORY_LIMIT)).map(s => s.entry).slice(0, HISTORY_LIMIT);
  const shiftRec = await n.getDrawerShift();
  const ledger = ledgerFromRemote(checkpoint, replay, history);
  const knownIds = new Set<string>([...history, ...replay.map(s => s.entry)].map(e => e.id));
  return { shift: shiftRec ? shiftFromFields(shiftRec) : null, ledger, checkpoint, replay, knownIds, empty: !checkpoint && replay.length === 0 && history.length === 0 };
}

export type DrawerPush = { shift: Shift; ledger: CashLedger; version: number; shiftPending: boolean };

/**
 * Send this register's drawer to CloudKit and return what the shared drawer now is.
 * 1. Upload the ledger entries CloudKit lacks (each is written once, so a retry never doubles one).
 * 2. First writer into an empty drawer: write a checkpoint holding our counts, so the counts survive without the history.
 * 3. Read back, so the counts are the replay of everything every register wrote.
 * 4. The shift: write ours if we changed it (or none exists), otherwise follow a newer shared one.
 * 5. If the drawer opened or closed, write a fresh checkpoint so counts stay cheap to read.
 */
export async function pushCloudDrawer(n: DrawerNative, input: DrawerPush): Promise<{ shift: Shift; version: number; ledger: CashLedger }> {
  let remote = await pullCloudDrawer(n);
  const saved: StampedEntry[] = [];
  for (const e of entriesToUpload(input.ledger.entries, remote.knownIds)) {
    const rec = await n.putLedgerEntry(e.id, entryToFields(e));
    saved.push({ entry: e as LedgerEntry, stamp: toStamp(rec.createdAt) });
  }
  if (remote.empty && (saved.length > 0 || Object.keys(input.ledger.counts).length > 0)) {
    await n.putDrawerCheckpoint(checkpointToFields({ counts: input.ledger.counts, asOfStamp: newestStamp(saved) || EPOCH_STAMP }));
  }
  if (saved.length > 0 || remote.empty) remote = await pullCloudDrawer(n);

  const rs = remote.shift; let shift = input.shift; let version = Math.max(input.version, rs?.version ?? 0);
  let wroteShift = false;
  if (input.shiftPending || !rs) { version += 1; await n.putDrawerShift(shiftToFields(shift, version)); wroteShift = true; }
  else if (rs.version > input.version) { shift = rs.shift; version = rs.version; }

  if (wroteShift && (!rs || rs.shift.open !== shift.open)) {
    const cp = makeCheckpoint(remote.ledger, remote.replay);
    if (cp && shouldReplaceCheckpoint(remote.checkpoint, cp)) await n.putDrawerCheckpoint(checkpointToFields(cp));
  }
  return { shift, version, ledger: remote.ledger };
}

/**
 * What a pull brings in: the shared shift and ledger, or null when nothing has been shared yet. The ledger is always read,
 * not only when the shift version moved, because a cash sale on another register adds entries without touching the shift.
 */
export async function pullCloudDrawerState(n: DrawerNative): Promise<{ shift: Shift | null; version: number; ledger: CashLedger } | null> {
  const remote = await pullCloudDrawer(n);
  if (remote.empty && !remote.shift) return null;
  return { shift: remote.shift?.shift ?? null, version: remote.shift?.version ?? 0, ledger: remote.ledger };
}
