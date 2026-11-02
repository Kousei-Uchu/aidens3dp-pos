// Location: src/lib/cloudkit/migrationVerify.ts
// CloudKit sync, patch 7 (count check): after the import runner has copied everything, compare what Shopify holds with what CloudKit now
// holds, and only then mark the import done. Clients switch to CloudKit when they see `done` (plan section 6, step 4), so a mismatch must
// never reach it. A mismatch rewinds the run to the earliest phase that is short and records why, so the next run repeats only from there.
// Like the runner, the sources are passed in and the whole thing is tested with in-memory fakes (tests/migrationverify.test.ts).
// Decisions: dev_docs/CLOUDKIT_SYNC_PLAN.md section 6 step 4, dev_docs/GUESSES.md under 0214.
import { HEARTBEAT_MS, MIGRATION_PHASES, type MigrationPhase, type MigrationState } from '../migrationLease';
import { completeMigration, failMigration, saveProgress, type MigrationNative } from './migrationCloud';
import { IMPORT_PAGE, PHASE_TYPE, DRAWER_ROW, handleFor, importable, readDrawerBlob, readShiftValue } from '../migrationImport';
import { cleanCounts, readLedger } from '../cashLedger';
import { pullCloudDrawer, type DrawerNative } from './drawerCloud';
import { runMigration, type ImportSource, type ImportTarget, type RunDeps, type RunResult } from './migrationRun';
import type { BackendPage, SharedType } from '../syncBackend';

/** CloudKit side of the check: the same seam, with the list the check needs. */
export type VerifyTarget = ImportTarget & { list(type: SharedType, o: { first: number; after: string | null }): Promise<BackendPage> };

/** The prefix each CloudKit record name carries over the app's own key (the CloudKit backend adds it on write). */
const NAME_PREFIX: Partial<Record<SharedType, string>> = { sale: 'sale-', cart: 'cart-', rollup: 'rollup-', settings: 'settings-', layout: 'layout-' };
const keyOfRecord = (type: SharedType, name: string): string => { const p = NAME_PREFIX[type]; return p && name.startsWith(p) ? name.slice(p.length) : name; };

export type PhaseCheck = { phase: MigrationPhase; expected: number; found: number };
export type VerifyResult = { ok: boolean; checks: PhaseCheck[]; short: PhaseCheck[] };

export type VerifyDeps = {
  source: ImportSource;
  target: VerifyTarget;
  drawer: DrawerNative;
  /** Called between pages, so a long check can keep the lease alive. May throw to stop the check. */
  beat?: () => Promise<void>;
};

/** Every key the import should have written for a paged phase, read from Shopify with the runner's own rules. */
async function expectedKeys(phase: MigrationPhase, d: VerifyDeps): Promise<Set<string>> {
  const type = PHASE_TYPE[phase]!; const keys = new Set<string>(); let after: string | null = null;
  for (;;) {
    const page = await d.source.list(type, { first: IMPORT_PAGE, after });
    for (const r of page.rows) if (importable(phase, r)) keys.add(handleFor(phase, r)!);
    if (!page.next) return keys;
    after = page.next; await d.beat?.();
  }
}

/** Every key CloudKit holds for a type. */
async function foundKeys(type: SharedType, d: VerifyDeps): Promise<Set<string>> {
  const keys = new Set<string>(); let after: string | null = null;
  for (;;) {
    const page = await d.target.list(type, { first: 200, after });
    for (const r of page.rows) keys.add(keyOfRecord(type, r.handle || r.id));
    if (!page.next) return keys;
    after = page.next; await d.beat?.();
  }
}

/** A paged phase passes when every key Shopify has is in CloudKit. Extra records in CloudKit are not a fault (another owner iPad may have written one). */
async function checkPaged(phase: MigrationPhase, d: VerifyDeps): Promise<PhaseCheck> {
  const want = await expectedKeys(phase, d); const have = await foundKeys(PHASE_TYPE[phase]!, d);
  let found = 0; for (const k of want) if (have.has(k)) found += 1;
  return { phase, expected: want.size, found };
}

/**
 * The drawer passes when every ledger entry Shopify holds is in CloudKit, the shift is there when Shopify had one, and the shop's
 * counts read back the same. `expected` is the number of things checked (entries, plus one for the shift, plus one for the counts).
 */
async function checkDrawer(d: VerifyDeps): Promise<PhaseCheck> {
  const blob = readDrawerBlob(await d.source.get('settings', DRAWER_ROW));
  if (!blob) return { phase: 'drawer', expected: 0, found: 0 };
  const ledger = readLedger(blob.ledger); const shift = readShiftValue(blob.shift);
  const cloud = await pullCloudDrawer(d.drawer);
  let expected = ledger.entries.length; let found = ledger.entries.filter(e => cloud.knownIds.has(e.id)).length;
  if (shift) { expected += 1; if (cloud.shift) found += 1; }
  const want = cleanCounts(ledger.counts); const got = cleanCounts(cloud.ledger.counts);
  expected += 1; if (JSON.stringify(sorted(want)) === JSON.stringify(sorted(got))) found += 1;
  return { phase: 'drawer', expected, found };
}
const sorted = (o: Record<string, number>): Array<[string, number]> => Object.entries(o).filter(([, v]) => v !== 0).sort(([a], [b]) => a.localeCompare(b));

/** Compare Shopify with CloudKit, phase by phase, in the lease's order. Reads only. */
export async function verifyImport(d: VerifyDeps): Promise<VerifyResult> {
  const checks: PhaseCheck[] = [];
  for (const phase of MIGRATION_PHASES) checks.push(phase === 'drawer' ? await checkDrawer(d) : await checkPaged(phase, d));
  const short = checks.filter(c => c.found < c.expected);
  return { ok: short.length === 0, checks, short };
}

/** The sentence recorded when the check fails, for the record's `error` field (300 characters at most) and the setup screen. */
export function shortfallMessage(short: PhaseCheck[]): string {
  return `Count check failed: ${short.map(c => `${c.phase} ${c.found} of ${c.expected}`).join(', ')}.`;
}

export type CompleteResult =
  | { kind: 'done'; held: MigrationState; checks: PhaseCheck[] }
  | { kind: 'short'; held: MigrationState | null; short: PhaseCheck[]; message: string }
  | { kind: 'lost' }
  | { kind: 'failed'; message: string };

/**
 * Check the counts and, only if they all match, mark the import done. If any phase is short, the run is rewound to the earliest short
 * phase (so the next run repeats only from there) and recorded as failed with the shortfall, which the next owner iPad picks up at once.
 * A lease lost during the check, or a read error, never marks anything done.
 */
export async function completeImport(d: VerifyDeps, native: MigrationNative, held: MigrationState, now: () => number): Promise<CompleteResult> {
  let cur = held; let last = now();
  const beat = async (): Promise<void> => {
    if (now() - last < HEARTBEAT_MS) return;
    const next = await saveProgress(native, cur, {}); if (!next) throw new Error('lease-lost');
    cur = next; last = now();
  };
  let result: VerifyResult;
  try { result = await verifyImport({ ...d, beat }); }
  catch (e) {
    if ((e as Error)?.message === 'lease-lost') return { kind: 'lost' };
    const message = `Count check could not run: ${String((e as Error)?.message ?? e)}`;
    return (await failMigration(native, cur, message, now()).catch(() => null)) ? { kind: 'failed', message } : { kind: 'lost' };
  }
  if (result.ok) {
    const done = await completeMigration(native, cur, true, now());
    return done ? { kind: 'done', held: done, checks: result.checks } : { kind: 'lost' };
  }
  const message = shortfallMessage(result.short);
  const rewound = await saveProgress(native, cur, { phase: result.short[0].phase });
  if (!rewound) return { kind: 'lost' };
  const failed = await failMigration(native, rewound, message, now());
  return failed ? { kind: 'short', held: failed, short: result.short, message } : { kind: 'lost' };
}

export type ImportResult = RunResult | CompleteResult;

/** The whole import: run the phases, then check and complete. A run that did not finish returns the runner's own result. */
export async function runImport(d: RunDeps & { target: VerifyTarget }): Promise<ImportResult> {
  const ran = await runMigration(d);
  if (ran.kind !== 'finished') return ran;
  return completeImport({ source: d.source, target: d.target, drawer: d.drawer }, d.native, ran.held, d.now);
}
