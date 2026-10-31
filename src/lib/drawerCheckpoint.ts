// Location: src/lib/drawerCheckpoint.ts
// CloudKit sync, patch 6b (pure half, part 2): the drawer checkpoint.
// The drawer counts are a running total, so replaying only the newest 1000 entries gives the wrong answer once the
// drawer has more history than that. A checkpoint is one small record (`drawer-checkpoint`) holding the counts at a
// point in time plus the server stamp of the newest entry it covers. A register reads the checkpoint, then replays only
// the entries stamped after it. The stamp is CloudKit's own creation time for the record, NOT the entry's `ts`, because
// a register that was offline uploads entries late, with an old `ts`, and those must still be counted.
// No React, no store, no native code. Tested in tests/drawercheckpoint.test.ts. Decisions: item 6, O3.
import { cleanCounts, type CashLedger, type Counts, type LedgerEntry } from './cashLedger';
import { ledgerFromEntries } from './drawerRecords';

export const CHECKPOINT_RECORD = 'drawer-checkpoint';

/** An entry as CloudKit returned it: the entry plus the server's creation stamp (ISO text, sorts as time). */
export type StampedEntry = { entry: LedgerEntry; stamp: string };
export type Checkpoint = { counts: Counts; asOfStamp: string };

export function checkpointToFields(c: Checkpoint): Record<string, string> {
  return { counts: JSON.stringify(cleanCounts(c.counts)), asOfStamp: c.asOfStamp };
}
/** Null when the record is unreadable, so a bad checkpoint falls back to replaying everything instead of breaking. */
export function checkpointFromFields(f: Record<string, unknown>): Checkpoint | null {
  if (typeof f.counts !== 'string' || typeof f.asOfStamp !== 'string' || !f.asOfStamp) return null;
  try {
    const counts = JSON.parse(f.counts);
    if (!counts || typeof counts !== 'object' || Array.isArray(counts)) return null;
    return { counts: cleanCounts(counts as Counts), asOfStamp: f.asOfStamp };
  } catch { return null; }
}

/** The newest stamp among the entries, or '' for none. */
export const newestStamp = (all: StampedEntry[]): string => all.reduce((m, s) => (s.stamp > m ? s.stamp : m), '');

/**
 * The shared ledger from what CloudKit holds. With a checkpoint, only entries stamped after it are replayed on top of
 * its counts; without one (none written yet, or unreadable), every entry given is replayed from empty. `history` is the
 * entries to show (the newest 1000 are enough, and may be older than the checkpoint); the counts never depend on how
 * many of them were loaded.
 */
export function ledgerFromRemote(checkpoint: Checkpoint | null, replay: StampedEntry[], history: LedgerEntry[] = []): CashLedger {
  const after = checkpoint ? replay.filter(s => s.stamp > checkpoint.asOfStamp) : replay;
  const counted = ledgerFromEntries(after.map(s => s.entry), checkpoint ? checkpoint.counts : {});
  const shown = ledgerFromEntries([...history, ...after.map(s => s.entry)]);
  return { counts: counted.counts, entries: shown.entries };
}

/**
 * The checkpoint to write now, from the ledger as it stands and every stamped entry it covers. Null when there is nothing
 * to cover. Written when a shift opens or closes, when nobody is mid-sale, so no entry is in flight behind its stamp.
 */
export function makeCheckpoint(ledger: CashLedger, covered: StampedEntry[]): Checkpoint | null {
  const asOfStamp = newestStamp(covered);
  return asOfStamp ? { counts: cleanCounts(ledger.counts), asOfStamp } : null;
}

/** A checkpoint only ever moves forward: never replace one with an older one, whichever register wrote it. */
export const shouldReplaceCheckpoint = (existing: Checkpoint | null, candidate: Checkpoint): boolean => !existing || candidate.asOfStamp > existing.asOfStamp;
