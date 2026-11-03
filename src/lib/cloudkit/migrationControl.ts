// Location: src/lib/cloudkit/migrationControl.ts
// CloudKit sync, patch 7 (wiring): the one object the "Setting up sync" screen and, later, patch 8 talk to. It joins the lease watch
// (migrationCloud.ts), the import runner and the count check (migrationRun.ts, migrationVerify.ts) behind four questions: what is the
// state, may this iPad run the import, run it, and stop it. Everything the app supplies (the two backends, the native module, who this
// register is, the iCloud role, practice mode) is passed in, so the guards are tested without an iPad (tests/migrationcontrol.test.ts).
// The app's one instance is made in sync.ts. Nothing runs by itself: the import starts only when something calls `start`.
// Decisions: dev_docs/CLOUDKIT_SYNC_PLAN.md section 6, dev_docs/GUESSES.md under 0215.
import { createMigrationWatch, type MigrationNative } from './migrationCloud';
import type { ImportSource } from './migrationRun';
import { runImport, type ImportResult, type VerifyTarget } from './migrationVerify';
import type { DrawerNative } from './drawerCloud';
import { MIGRATION_PHASES, readMigration, type MigrationPhase } from '../migrationLease';

export type MigrationControlDeps = {
  /** The CloudKit module, as the lease and the drawer both need it. Loaded on demand. */
  native: () => Promise<MigrationNative & DrawerNative>;
  /** Shopify through the seam, always the metaobject backend, whichever backend the app is using. */
  source: () => ImportSource;
  /** CloudKit through the seam. */
  target: () => VerifyTarget;
  /** Make sure both sides' storage exists before anything is read or written. */
  ensure: () => Promise<void>;
  who: () => { id: string; name: string };
  /** This till's role in the shop's share, from the account state. Only an owner runs the import. */
  role: () => Promise<'owner' | 'participant' | 'none'>;
  training: () => boolean;
  now?: () => number;
};

/** What a screen shows. `line` is the plain sentence, `running` is true while this iPad is importing, `phase` and `imported` say how far. */
export type MigrationView = {
  line: string;
  running: boolean;
  phase: MigrationPhase | null;
  imported: number;
  /** True when this iPad could start (or carry on) the import now. */
  canStart: boolean;
  done: boolean;
  /** The last run's outcome on this iPad, for a message after it ends. */
  last: ImportResult | { kind: 'refused'; why: string } | null;
};

export function createMigrationControl(d: MigrationControlDeps) {
  const now = d.now ?? (() => Date.now());
  let running = false; let stopRequested = false;
  let phase: MigrationPhase | null = null; let imported = 0; let last: MigrationView['last'] = null;
  const listeners = new Set<() => void>();
  const emit = (): void => { for (const l of [...listeners]) { try { l(); } catch { /* a screen's mistake must not stop the import */ } } };
  let watch: ReturnType<typeof createMigrationWatch> | null = null; let watchRole = false;
  const getWatch = async (owner: boolean) => {
    if (!watch || watchRole !== owner) { // a new watch forgets what was seen, which only matters if the role changed
      const n = await d.native();
      watch = createMigrationWatch({ native: async () => n, registerId: () => d.who().id, registerName: () => d.who().name, isOwner: () => owner, now });
      watchRole = owner;
    }
    return watch;
  };

  return {
    /** Read the lease and say where things are. Writes nothing. Never throws: a failure becomes a sentence. */
    async view(): Promise<MigrationView> {
      const base = { running, phase, imported, last };
      try {
        const owner = (await d.role()) === 'owner';
        const w = await getWatch(owner);
        const { decision } = await w.check();
        const line = running ? (phase ? `Setting up sync, step ${MIGRATION_PHASES.indexOf(phase) + 1} of ${MIGRATION_PHASES.length}.` : 'Setting up sync.') : await w.line();
        const done = decision.act === 'done';
        const canStart = owner && !running && !d.training() && !done && decision.act !== 'wait';
        return { ...base, line, done, canStart };
      } catch (e) {
        return { ...base, line: `Could not read the setup state: ${String((e as Error)?.message ?? e)}`, done: false, canStart: false };
      }
    },
    /**
     * Start (or carry on) the import on this iPad. Refused, with a reason and no write, unless this iPad is the owner, is not in practice
     * mode, and is not already running. Returns the outcome; the same outcome is in the next `view().last`.
     */
    async start(): Promise<NonNullable<MigrationView['last']>> {
      const refuse = (why: string, release = true) => { if (release) running = false; last = { kind: 'refused', why }; emit(); return last; };
      if (running) return refuse('The setup is already running on this iPad.', false);
      running = true; stopRequested = false; phase = null; imported = 0; // taken before any await, so a second press cannot slip in
      if (d.training()) return refuse('Sync is not set up during a practice run.');
      let owner: string; try { owner = await d.role(); } catch (e) { return refuse(`Could not read this iPad's role: ${String((e as Error)?.message ?? e)}`); }
      if (owner !== 'owner') return refuse('Only the shop owner\'s iPad sets up sync.');
      emit();
      try {
        await d.ensure();
        const n = await d.native();
        const result = await runImport({
          watch: await getWatch(true), native: n, source: d.source(), target: d.target(), drawer: n, now,
          shouldStop: () => stopRequested || d.training(),
          onProgress: (p, c) => { phase = p; imported = c; emit(); },
        });
        last = result;
      } catch (e) {
        last = { kind: 'refused', why: `Could not start: ${String((e as Error)?.message ?? e)}` };
      } finally { running = false; emit(); }
      return last!;
    },
    /** Ask a running import to stop at its next page. The lease is left to lapse, so another owner iPad can carry on. */
    stop(): void { if (running) stopRequested = true; },
    /** The raw lease record, for diagnostics. */
    async raw() { return readMigration(await (await d.native()).getMigration()); },
    subscribe(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; },
    isRunning: (): boolean => running,
  };
}
export type MigrationControl = ReturnType<typeof createMigrationControl>;
