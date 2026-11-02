// Location: src/lib/migrationLease.ts
// CloudKit sync, patch 7 (migration lease, rules half): the one-off import of the shop's Shopify records into CloudKit must be run by
// exactly one owner iPad at a time, and must carry on from where it stopped if that iPad dies. The shop keeps a single `migration-v1`
// record that says who is running it, which phase it is in, and how far through that phase it got. This file is only the rules, with no
// storage and no clock of its own, so every decision is tested in Node. The transport is cloudkit/migrationCloud.ts.
// Decisions: dev_docs/CLOUDKIT_SYNC_PLAN.md section 6 (steps 2 to 5), dev_docs/GUESSES.md under 0212.

/** The order the import runs in. A phase is finished before the next one starts, so a crash only ever repeats one phase's tail. */
export const MIGRATION_PHASES = ['settings', 'drawer', 'layout', 'carts', 'sales', 'rollups'] as const;
export type MigrationPhase = (typeof MIGRATION_PHASES)[number];
export type MigrationStatus = 'running' | 'done' | 'failed';

/** A holder that has not written for this long is treated as gone. Measured on the watcher's own clock (see `observe`). */
export const LEASE_MS = 120_000;
/** How often the holder should write, even when it has no progress to report. Well inside the lease, so one slow request is not fatal. */
export const HEARTBEAT_MS = 20_000;
/** The record layout this build reads and writes. A higher number was written by a newer build, which this one must not touch. */
export const MIGRATION_VERSION = 1;

/** Imported record counts, by phase. Written as the phase finishes, and compared with the shop's own counts when the import is verified. */
export type MigrationCounts = Partial<Record<MigrationPhase, number>>;

export type MigrationState = {
  status: MigrationStatus;
  holder: string;
  holderName: string;
  phase: MigrationPhase;
  /** Where to carry on inside the phase. Opaque to this file: the importer decides what it means. Empty means the start of the phase. */
  cursor: string;
  counts: MigrationCounts;
  startedAt: number;
  finishedAt: number;
  /** The plain reason the last run stopped, when `status` is `failed`. */
  error: string;
  /** CloudKit's change tag for the record as it was read. Not stored in the record: it is what a write has to match. */
  tag: string;
};

/** What reading the record gave. `newer` is a record written by a later build, `damaged` one this build cannot make sense of. */
export type MigrationRead =
  | { kind: 'none' }
  | { kind: 'ok'; state: MigrationState }
  | { kind: 'newer'; tag: string }
  | { kind: 'damaged'; tag: string };

const isPhase = (v: unknown): v is MigrationPhase => typeof v === 'string' && (MIGRATION_PHASES as readonly string[]).includes(v);
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };

/** The counts as stored: a JSON object of phase to whole number. Anything else is dropped rather than trusted. */
export function parseCounts(raw: unknown): MigrationCounts {
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
    const out: MigrationCounts = {};
    for (const p of MIGRATION_PHASES) { const v = (o as Record<string, unknown>)[p]; if (typeof v === 'number' && Number.isInteger(v) && v >= 0) out[p] = v; }
    return out;
  } catch { return {}; }
}

/** Read what the native module returned for `migration-v1`. Never throws. */
export function readMigration(raw: Record<string, any> | null | undefined): MigrationRead {
  if (!raw) return { kind: 'none' };
  const tag = String(raw.tag ?? '');
  const v = num(raw.v);
  if (v > MIGRATION_VERSION) return { kind: 'newer', tag };
  const status = raw.status;
  if ((status !== 'running' && status !== 'done' && status !== 'failed') || v < 1 || !isPhase(raw.phase)) return { kind: 'damaged', tag };
  return {
    kind: 'ok',
    state: {
      status, holder: String(raw.holder ?? ''), holderName: String(raw.holderName ?? ''), phase: raw.phase,
      cursor: String(raw.cursor ?? ''), counts: parseCounts(raw.counts), startedAt: num(raw.startedAt), finishedAt: num(raw.finishedAt),
      error: String(raw.error ?? ''), tag,
    },
  };
}

/** The plain fields to write for a state. The change tag is never one of them. */
export function migrationToFields(s: Omit<MigrationState, 'tag'>): Record<string, string | number> {
  return {
    v: MIGRATION_VERSION, status: s.status, holder: s.holder, holderName: s.holderName, phase: s.phase, cursor: s.cursor,
    counts: JSON.stringify(s.counts), startedAt: s.startedAt, finishedAt: s.finishedAt, error: s.error,
  };
}

export const firstPhase = (): MigrationPhase => MIGRATION_PHASES[0];
/** The phase after `p`, or null after the last one. */
export const nextPhase = (p: MigrationPhase): MigrationPhase | null => MIGRATION_PHASES[MIGRATION_PHASES.indexOf(p) + 1] ?? null;
export const phaseNumber = (p: MigrationPhase): number => MIGRATION_PHASES.indexOf(p) + 1;

/**
 * What one iPad has noticed about the record: the change tag it last saw and when (on this iPad's clock) it first saw that tag. Every
 * write to the record changes its tag, so a holder that is alive keeps handing the watcher a new tag. A watcher therefore never compares
 * its own clock with the holder's: it only asks "how long has this tag been the newest one I can see?". A wrong clock on any iPad cannot
 * make a live holder look dead.
 */
export type Seen = { tag: string; since: number } | null;

/** Update what has been seen after a read. The same tag keeps its original time, a new one starts the count again. */
export function observe(seen: Seen, tag: string, now: number): Seen {
  return seen && seen.tag === tag ? seen : { tag, since: now };
}

/** True when the tag has not moved for a full lease. */
export const isStale = (seen: Seen, now: number, leaseMs = LEASE_MS): boolean => !!seen && now - seen.since >= leaseMs;

export type MigrationContext = {
  registerId: string;
  /** Only an iPad on the owner's Apple ID may create the zone, so only it may run the import (plan section 6, step 1). */
  isOwner: boolean;
  seen: Seen;
  now: number;
};

/**
 * What this iPad should do next.
 * - `start`:    there is no record. The owner creates it and takes the lease.
 * - `resume`:   the record is this iPad's own running lease (it restarted). Carry on from the stored phase and cursor.
 * - `takeover`: another holder has gone quiet for a full lease, or a run failed, or the record is damaged. The owner takes the lease over
 *               and carries on from the stored phase and cursor. Nothing is repeated that was recorded as finished.
 * - `done`:     the import finished and was checked. Switch over (patch 8).
 * - `wait`:     do nothing now and look again later. `why` says what is being waited for, for the "Setting up sync" screen.
 */
export type MigrationDecision =
  | { act: 'start' }
  | { act: 'resume'; state: MigrationState }
  | { act: 'takeover'; state: MigrationState | null; tag: string }
  | { act: 'done'; state: MigrationState }
  | { act: 'wait'; why: 'owner' | 'busy' | 'newer'; state: MigrationState | null };

export function decideMigration(read: MigrationRead, c: MigrationContext): MigrationDecision {
  if (read.kind === 'newer') return { act: 'wait', why: 'newer', state: null };
  if (read.kind === 'ok' && read.state.status === 'done') return { act: 'done', state: read.state };
  if (!c.isOwner) return { act: 'wait', why: 'owner', state: read.kind === 'ok' ? read.state : null };
  if (read.kind === 'none') return { act: 'start' };
  if (read.kind === 'damaged') return isStale(c.seen, c.now) ? { act: 'takeover', state: null, tag: read.tag } : { act: 'wait', why: 'busy', state: null };
  const s = read.state;
  if (s.status === 'failed') return { act: 'takeover', state: s, tag: s.tag };
  if (s.holder === c.registerId) return { act: 'resume', state: s };
  return isStale(c.seen, c.now) ? { act: 'takeover', state: s, tag: s.tag } : { act: 'wait', why: 'busy', state: s };
}

/** The state for a fresh run: first phase, nothing imported. */
export function freshState(registerId: string, registerName: string, now: number): Omit<MigrationState, 'tag'> {
  return { status: 'running', holder: registerId, holderName: registerName, phase: firstPhase(), cursor: '', counts: {}, startedAt: now, finishedAt: 0, error: '' };
}

/** The state after taking a lease over: same place, same counts, new holder. A failed run's reason is cleared because a new try has begun. */
export function takenOver(prev: MigrationState | null, registerId: string, registerName: string, now: number): Omit<MigrationState, 'tag'> {
  if (!prev) return freshState(registerId, registerName, now);
  return { status: 'running', holder: registerId, holderName: registerName, phase: prev.phase, cursor: prev.cursor, counts: { ...prev.counts }, startedAt: prev.startedAt || now, finishedAt: 0, error: '' };
}

/** Plain words for the "Setting up sync" screen. */
export function migrationLine(read: MigrationRead, c: MigrationContext): string {
  const d = decideMigration(read, c);
  switch (d.act) {
    case 'done': return 'Sync is set up.';
    case 'start': return 'Ready to set up sync from this iPad.';
    case 'resume': return `Setting up sync, step ${phaseNumber(d.state.phase)} of ${MIGRATION_PHASES.length}.`;
    case 'takeover': return d.state ? `Carrying on the setup from step ${phaseNumber(d.state.phase)} of ${MIGRATION_PHASES.length}.` : 'Starting the setup again.';
    case 'wait':
      if (d.why === 'newer') return 'This iPad needs the latest version of the app before it can join the setup.';
      if (d.why === 'owner') return 'The shop owner\'s iPad is setting up sync. This iPad will join when it is done.';
      return d.state ? `${d.state.holderName || 'Another iPad'} is setting up sync, step ${phaseNumber(d.state.phase)} of ${MIGRATION_PHASES.length}.` : 'Another iPad is setting up sync.';
  }
}
