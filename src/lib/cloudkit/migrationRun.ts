// Location: src/lib/cloudkit/migrationRun.ts
// CloudKit sync, patch 7 (import runner, running half): copies the shop's Shopify records into CloudKit, one phase at a time, under the
// migration lease. The Shopify side (`source`), the CloudKit side (`target`) and the drawer's native interface are all passed in, so the
// whole run is tested with in-memory fakes (tests/migrationimport.test.ts). Nothing calls this until the count check and the screen land
// (the next pieces) and CloudKit is switched on (patch 8).
// How it stays safe:
// - Every write to the lease is a compare-and-set (migrationCloud.ts), so a runner that was replaced finds out on its next progress write
//   and stops at once, before copying anything more. It never marks the run failed in that case, because the record is no longer its own.
// - Every copy is idempotent (an upsert by key, or a write-once record), so repeating the tail of a phase after a crash does no harm.
// - Each page of rows advances the cursor, which is also the heartbeat. The cursor carries the count, so a takeover carries on counting.
// Decisions: dev_docs/CLOUDKIT_SYNC_PLAN.md section 6, dev_docs/GUESSES.md under 0213.
import { MIGRATION_PHASES, type MigrationPhase, type MigrationState } from '../migrationLease';
import { saveProgress, finishPhase, failMigration, type MigrationNative, type MigrationWatch } from './migrationCloud';
import {
  DRAWER_ROW, IMPORT_PAGE, PHASE_TYPE, decodeCursor, encodeCursor, handleFor, importable, readDrawerBlob, readShiftValue, shouldWriteVersioned,
  type Cursor, type SourceRow,
} from '../migrationImport';
import { readLedger, type LedgerEntry } from '../cashLedger';
import { entryToFields } from '../drawerRecords';
import { checkpointToFields } from '../drawerCheckpoint';
import { pushCloudDrawer, type DrawerNative } from './drawerCloud';
import type { BackendPage, SharedType } from '../syncBackend';
import type { Shift } from '../../state/store';

/** Where the rows come from: Shopify, through the same seam the app already reads. */
export type ImportSource = {
  list(type: SharedType, o: { first: number; after: string | null }): Promise<BackendPage>;
  get(type: SharedType, handle: string): Promise<SourceRow | null>;
};
/** Where they go: CloudKit, through the same seam the app will read once it is switched on. */
export type ImportTarget = {
  put(type: SharedType, handle: string, fields: Record<string, string>): Promise<unknown>;
  get(type: SharedType, handle: string): Promise<SourceRow | null>;
};

export type RunDeps = {
  watch: MigrationWatch;
  native: MigrationNative;
  source: ImportSource;
  target: ImportTarget;
  drawer: DrawerNative;
  now: () => number;
  /** Checked between pages. When it returns true the run stops where it is and leaves the lease to lapse, so another iPad can carry on. */
  shouldStop?: () => boolean;
  /** For the "Setting up sync" screen: the phase and how many records it has imported so far. */
  onProgress?: (phase: MigrationPhase, imported: number) => void;
};

export type RunResult =
  | { kind: 'finished'; held: MigrationState }
  | { kind: 'wait'; why: 'owner' | 'busy' | 'newer'; state: MigrationState | null }
  | { kind: 'done'; state: MigrationState }
  | { kind: 'lost' }
  | { kind: 'stopped' }
  | { kind: 'failed'; phase: MigrationPhase; message: string };

class LeaseLost extends Error { constructor() { super('The import lease was taken over.'); this.name = 'LeaseLost'; } }
class Stopped extends Error { constructor() { super('stopped'); this.name = 'Stopped'; } }

type Held = { state: MigrationState };

/** Write progress and keep the new state. Throws LeaseLost when someone else wrote the record. */
async function checkpoint(n: MigrationNative, h: Held, cursor: Cursor): Promise<void> {
  const next = await saveProgress(n, h.state, { cursor: encodeCursor(cursor) });
  if (!next) throw new LeaseLost();
  h.state = next;
}

/** One page of rows into the target. Returns how many were written. A row with no usable key is skipped, not counted. */
async function copyPage(phase: MigrationPhase, rows: SourceRow[], d: RunDeps): Promise<number> {
  const type = PHASE_TYPE[phase]!; let written = 0;
  for (const row of rows) {
    if (!importable(phase, row)) continue;
    const handle = handleFor(phase, row)!;
    if (phase === 'settings' || phase === 'layout') {
      // Where both sides already hold the record, the higher version wins and Shopify's wins a tie (plan section 6, step 6).
      const existing = await d.target.get(type, handle);
      if (!shouldWriteVersioned(row.f, existing?.f)) { written += 1; continue; }
    }
    await d.target.put(type, handle, row.f);
    written += 1;
  }
  return written;
}

async function runPagedPhase(phase: MigrationPhase, h: Held, d: RunDeps): Promise<number> {
  const type = PHASE_TYPE[phase]!;
  let cur = decodeCursor(h.state.cursor);
  for (;;) {
    if (d.shouldStop?.()) throw new Stopped();
    const page = await d.source.list(type, { first: IMPORT_PAGE, after: cur.a });
    cur = { a: page.next, i: 0, n: cur.n + await copyPage(phase, page.rows, d) };
    d.onProgress?.(phase, cur.n);
    if (!page.next) return cur.n;
    await checkpoint(d.native, h, cur);
  }
}

const EPOCH_STAMP = '1970-01-01T00:00:00.000Z';

/**
 * The counts Shopify held are not always the replay of its entries (it only keeps the latest 1000), so they are written as the starting
 * checkpoint, stamped with the newest entry just uploaded. A register replays only entries stamped after it. An existing checkpoint is
 * never replaced here, so repeating the phase after a crash cannot move it.
 */
async function ensureStartingCheckpoint(n: DrawerNative, counts: Record<string, number>): Promise<void> {
  if (!Object.keys(counts).length) return;
  if (await n.getDrawerCheckpoint()) return;
  const newest = (await n.listLedgerEntries(1, null)).rows[0];
  const asOfStamp = newest ? new Date((Number(newest.createdAt) || 0) * 1000).toISOString() : EPOCH_STAMP;
  await n.putDrawerCheckpoint(checkpointToFields({ counts, asOfStamp }));
}

/**
 * The drawer phase. Shopify keeps the shift and the ledger as one blob; here each ledger entry becomes its own write-once record, the
 * counts become a checkpoint, and the shift becomes `drawer-shift` (all through pushCloudDrawer, the same code the app will use live).
 * Entries go in chunks first, so a long ledger still beats the heartbeat, and the cursor says how many are done.
 */
async function runDrawerPhase(h: Held, d: RunDeps): Promise<number> {
  const row = await d.source.get('settings', DRAWER_ROW);
  const blob = readDrawerBlob(row);
  if (!blob) return 0;
  const ledger = readLedger(blob.ledger);
  const shift = readShiftValue(blob.shift);
  const entries = [...ledger.entries].reverse(); // oldest first, so a stop part way leaves the older history in place
  let cur = decodeCursor(h.state.cursor);
  for (let i = cur.i; i < entries.length; i += IMPORT_PAGE) {
    if (d.shouldStop?.()) throw new Stopped();
    for (const e of entries.slice(i, i + IMPORT_PAGE) as LedgerEntry[]) await d.drawer.putLedgerEntry(e.id, entryToFields(e));
    cur = { a: null, i: Math.min(i + IMPORT_PAGE, entries.length), n: cur.n };
    await checkpoint(d.native, h, cur);
  }
  await ensureStartingCheckpoint(d.drawer, ledger.counts);
  if (shift) {
    await pushCloudDrawer(d.drawer, { shift: shift as unknown as Shift, ledger, version: Math.max(blob.version, 1), shiftPending: false });
  } else if (entries.length) {
    await pushCloudDrawer(d.drawer, { shift: { open: false, floatCents: 0, paidInCents: 0, paidOutCents: 0 } as unknown as Shift, ledger, version: 0, shiftPending: false });
  }
  d.onProgress?.('drawer', entries.length);
  return entries.length;
}

/**
 * Run (or carry on) the import. Claims the lease, then runs each phase from the stored one to the last, writing progress as it goes.
 * Stops at `finished` with the last phase's count recorded: checking the counts and marking the run done is the next piece, so no
 * client can switch over on the strength of this alone. A failure is written to the record (the next owner iPad picks it up at once);
 * losing the lease is never written, because the record is no longer this iPad's.
 */
export async function runMigration(d: RunDeps): Promise<RunResult> {
  const claim = await d.watch.claim();
  if (claim.act === 'done') return { kind: 'done', state: claim.state };
  if (claim.act === 'wait') return { kind: 'wait', why: claim.why, state: claim.state };
  if (claim.act === 'lost') return { kind: 'lost' };
  const h: Held = { state: claim.held };
  let phase = h.state.phase;
  try {
    for (;;) {
      const count = phase === 'drawer' ? await runDrawerPhase(h, d) : await runPagedPhase(phase, h, d);
      const next = await finishPhase(d.native, h.state, count);
      if (!next) throw new LeaseLost();
      h.state = next;
      if (phase === MIGRATION_PHASES[MIGRATION_PHASES.length - 1]) return { kind: 'finished', held: h.state };
      phase = h.state.phase;
    }
  } catch (e) {
    if (e instanceof LeaseLost) return { kind: 'lost' };
    if (e instanceof Stopped) return { kind: 'stopped' };
    const message = String((e as Error)?.message ?? e);
    const failed = await failMigration(d.native, h.state, message, d.now()).catch(() => null);
    return failed ? { kind: 'failed', phase, message } : { kind: 'lost' };
  }
}
