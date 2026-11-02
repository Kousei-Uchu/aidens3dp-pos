// Location: src/lib/cloudkit/migrationCloud.ts
// CloudKit sync, patch 7 (migration lease, transport half): reads and writes the shop's one `migration-v1` record through a small native
// interface that is passed in, so the whole flow is tested with an in-memory fake and no iPad (tests/migrationlease.test.ts). The rules
// (who may run, when a stalled holder can be replaced) are in ../migrationLease.ts.
// Every write is a compare-and-set against CloudKit's change tag, so two iPads that both decide to take the lease cannot both win, and a
// holder that was replaced finds out on its next write and stops. Nothing here is called until the import runner exists (patch 7, next
// piece) and CloudKit is switched on (patch 8). Decisions: dev_docs/CLOUDKIT_SYNC_PLAN.md section 6.
import {
  decideMigration, firstPhase, freshState, isStale, migrationLine, migrationToFields, nextPhase, observe, readMigration, takenOver,
  MIGRATION_PHASES, type MigrationCounts, type MigrationDecision, type MigrationPhase, type MigrationRead, type MigrationState, type Seen,
} from '../migrationLease';

type Rec = Record<string, any>;

export type MigrationNative = {
  /** The record's plain fields, with CloudKit's change tag for it as `tag`. Null when there is no record. */
  getMigration(): Promise<Rec | null>;
  /**
   * Save the record only if it is still the one the caller read. `expectedTag` is that record's change tag, or null when the caller saw
   * none (the record is then created, and fails if someone else got there first). `changed` is true when nothing was written because the
   * record is no longer what the caller saw.
   */
  putMigrationIfUnchanged(fields: Rec, expectedTag: string | null): Promise<{ changed: boolean; tag?: string }>;
};

export const loadMigration = async (n: MigrationNative): Promise<MigrationRead> => readMigration(await n.getMigration());

/** Write a state if the record is still at `expectedTag`. Null when it is not, or when CloudKit did not say what the new tag is. */
async function write(n: MigrationNative, next: Omit<MigrationState, 'tag'>, expectedTag: string | null): Promise<MigrationState | null> {
  const r = await n.putMigrationIfUnchanged(migrationToFields(next), expectedTag || null);
  // A write with no tag back cannot be followed by another checked write, so it counts as not held rather than risk two holders.
  if (r.changed || !r.tag) return null;
  return { ...next, tag: r.tag };
}

const body = (s: MigrationState): Omit<MigrationState, 'tag'> => { const { tag: _tag, ...rest } = s; return rest; };

/**
 * Record progress, which is also the heartbeat. Returns the held state with its new tag, or null when the lease has been lost (someone
 * else wrote the record), in which case the caller must stop importing at once. Counts are merged, never dropped.
 */
export async function saveProgress(n: MigrationNative, held: MigrationState, change: { phase?: MigrationPhase; cursor?: string; counts?: MigrationCounts }): Promise<MigrationState | null> {
  const next = { ...body(held), counts: { ...held.counts, ...(change.counts ?? {}) } };
  if (change.phase) { next.phase = change.phase; next.cursor = ''; }
  if (change.cursor !== undefined) next.cursor = change.cursor;
  return write(n, next, held.tag);
}

/** Finish the current phase and move to the next one, recording how many records the phase imported. Null when the lease was lost. */
export async function finishPhase(n: MigrationNative, held: MigrationState, count: number): Promise<MigrationState | null> {
  const counts = { ...held.counts, [held.phase]: count };
  const to = nextPhase(held.phase);
  return write(n, { ...body(held), counts, phase: to ?? held.phase, cursor: '' }, held.tag);
}

/**
 * Mark the whole import done. Only allowed from the last phase, and only when the caller says the counts were checked, so a bug in the
 * runner cannot switch the shop over early (clients switch to CloudKit once they see `done`).
 */
export async function completeMigration(n: MigrationNative, held: MigrationState, verified: boolean, now: number): Promise<MigrationState | null> {
  if (!verified) throw new Error('The import cannot be marked done before its counts have been checked.');
  const last = MIGRATION_PHASES[MIGRATION_PHASES.length - 1];
  if (held.phase !== last) throw new Error('The import cannot be marked done before its last phase.');
  return write(n, { ...body(held), status: 'done', cursor: '', finishedAt: now, error: '' }, held.tag);
}

/** Stop the run and say why, so the next owner iPad can carry on from here. Null when the lease was lost. */
export async function failMigration(n: MigrationNative, held: MigrationState, message: string, now: number): Promise<MigrationState | null> {
  return write(n, { ...body(held), status: 'failed', finishedAt: now, error: message.slice(0, 300) }, held.tag);
}

export type MigrationWatchDeps = {
  native: () => Promise<MigrationNative>;
  registerId: () => string;
  registerName: () => string;
  isOwner: () => boolean;
  /** This iPad's clock, in milliseconds. Only ever compared with itself (see `observe`). */
  now: () => number;
};

export type ClaimOutcome =
  | { act: 'held'; held: MigrationState; how: 'start' | 'resume' | 'takeover' }
  | { act: 'lost' }
  | { act: 'done'; state: MigrationState }
  | { act: 'wait'; why: 'owner' | 'busy' | 'newer'; state: MigrationState | null };

/** One iPad's view of the migration: it remembers what it has seen, so it can tell a holder that went quiet from one that is working. */
export function createMigrationWatch(d: MigrationWatchDeps) {
  let seen: Seen = null;
  async function look(): Promise<{ read: MigrationRead; decision: MigrationDecision }> {
    const read = await loadMigration(await d.native());
    const now = d.now();
    seen = read.kind === 'none' ? null : observe(seen, read.kind === 'ok' ? read.state.tag : read.tag, now);
    return { read, decision: decideMigration(read, { registerId: d.registerId(), isOwner: d.isOwner(), seen, now }) };
  }
  return {
    /** Read the record and say what this iPad should do. Writes nothing. */
    check: look,
    /** The sentence for the "Setting up sync" screen. */
    async line(): Promise<string> {
      const { read } = await look();
      return migrationLine(read, { registerId: d.registerId(), isOwner: d.isOwner(), seen, now: d.now() });
    },
    /**
     * Try to become the one iPad that runs the import. Reads, decides, and when the answer is start, resume or takeover writes the lease
     * with a compare-and-set. `lost` means another iPad wrote first: look again later, do not retry in a loop.
     */
    async claim(): Promise<ClaimOutcome> {
      const { decision } = await look();
      if (decision.act === 'done') return { act: 'done', state: decision.state };
      if (decision.act === 'wait') return decision;
      const n = await d.native(); const id = d.registerId(); const name = d.registerName(); const now = d.now();
      let next: Omit<MigrationState, 'tag'>; let expected: string | null;
      if (decision.act === 'start') { next = freshState(id, name, now); expected = null; }
      else if (decision.act === 'resume') { next = { ...body(decision.state), holderName: name }; expected = decision.state.tag; }
      else { next = takenOver(decision.state, id, name, now); expected = decision.tag; }
      const held = await write(n, next, expected);
      if (!held) return { act: 'lost' };
      seen = observe(null, held.tag, now);
      return { act: 'held', held, how: decision.act };
    },
    /** True when what this iPad last saw has not moved for a full lease. For a screen that wants to say "looks stuck". */
    looksStuck: (): boolean => isStale(seen, d.now()),
    /** Forget what was seen, for a test or after the record was deleted by hand in the dashboard. */
    forget: (): void => { seen = null; },
    firstPhase,
  };
}
export type MigrationWatch = ReturnType<typeof createMigrationWatch>;
