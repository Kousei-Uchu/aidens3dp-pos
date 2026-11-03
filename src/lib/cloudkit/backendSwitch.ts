// Location: src/lib/cloudkit/backendSwitch.ts
// CloudKit sync, patch 8 (the switch, running half): installs the backend this till uses, moves it to CloudKit once the import is done, and
// puts it back on Shopify when the owner asks. Everything the app supplies is passed in, so the rules are tested without an iPad
// (tests/backendswitch.test.ts). The app's one instance is made in sync.ts; `check` runs from the poll and `install` at start-up.
// How it cuts over (decided here, plan section 6 step 7): in one go, no dual-write. A till moves when it sees the import `done`; Shopify's
// records are left untouched as the way back. The gap between the import finishing and each till moving is closed by sending, once, the
// till's own sales finished since the import began that are not in CloudKit yet, through the same idempotent steps the queue uses.
import { decideSwitch, salesToCatchUp, startupKind, CATCHUP_DONE, type BackendFlag } from '../backendChoice';
import type { SaleRecord } from '../types';
import type { MigrationRead } from '../migrationLease';

export type BackendSwitchDeps = {
  flag: { get(): Promise<BackendFlag>; set(v: BackendFlag): Promise<void> };
  /** Installs a backend in the seam. */
  install: (kind: 'metaobject' | 'cloudkit') => Promise<void>;
  activeKind: () => 'metaobject' | 'cloudkit' | 'none';
  role: () => Promise<'owner' | 'participant' | 'none'>;
  readMigration: () => Promise<MigrationRead>;
  training: () => boolean;
  who: () => { id: string };
  /** This till's finished sales, newest first or not. */
  sales: () => SaleRecord[];
  outboxIds: () => ReadonlySet<string>;
  /** Whether CloudKit already holds the sale. */
  inCloudKit: (uuid: string) => Promise<boolean>;
  /** Send a sale's CloudKit record and totals (the outbox steps that remain). Throws on failure. */
  catchUpSale: (s: SaleRecord, done: typeof CATCHUP_DONE) => Promise<void>;
  /** Mark the till's own drawer and settings as having something to send, so the first poll on CloudKit uploads what changed during the gap. */
  markPending: () => void;
  /** Whether the one-time catch-up has been done on this till, and a way to record it. */
  caughtUp: { get(): Promise<boolean>; set(): Promise<void> };
  notify: (n: { title: string; body: string }) => void;
};

export function createBackendSwitch(d: BackendSwitchDeps) {
  let busy = false;

  /** Send this till's own gap sales to CloudKit, once. A failure leaves it undone so the next poll tries again. */
  async function catchUp(importStartedAt: number): Promise<number | null> {
    if (await d.caughtUp.get()) return 0;
    try {
      const mine = salesToCatchUp(d.sales(), { registerId: d.who().id, importStartedAt, outboxIds: d.outboxIds() });
      let sent = 0;
      for (const s of mine) { if (await d.inCloudKit(s.uuid)) continue; await d.catchUpSale(s, CATCHUP_DONE); sent += 1; }
      await d.caughtUp.set(); return sent;
    } catch { return null; }
  }

  return {
    /** At start-up: put the backend the flag says into the seam. Returns the kind installed. Never throws. */
    async install(): Promise<'metaobject' | 'cloudkit'> {
      let flag: BackendFlag = null; try { flag = await d.flag.get(); } catch { /* an unreadable flag means unset */ }
      const kind = startupKind(flag); await d.install(kind); return kind;
    },

    /**
     * Called from the poll. If this till is on Shopify, in the shop's share, and the import is done, move it to CloudKit and send the sales
     * it finished during the gap. Returns true when it switched. Never throws: the next poll tries again.
     */
    async check(): Promise<boolean> {
      if (busy) return false;
      busy = true;
      try {
        if (d.activeKind() === 'cloudkit' && (await d.caughtUp.get())) return false; // nothing left to do, and no read of CloudKit every poll
        const flag = await d.flag.get();
        const role = await d.role();
        const read = await d.readMigration();
        const migration = read.kind === 'ok' ? (read.state.status === 'done' ? 'done' : 'not_done') : read.kind === 'none' ? 'not_done' : 'unknown';
        const decision = decideSwitch({ flag, active: d.activeKind(), role, migration, practice: d.training() });
        if (decision.act !== 'switch') {
          // A till already on CloudKit that has not sent its gap sales (the first try failed) tries again.
          if (decision.why === 'already' && d.activeKind() === 'cloudkit' && read.kind === 'ok' && read.state.status === 'done' && !d.training()) await catchUp(read.state.startedAt);
          return false;
        }
        await d.flag.set('cloudkit'); await d.install('cloudkit'); d.markPending();
        if (read.kind === 'ok') await catchUp(read.state.startedAt);
        d.notify({ title: 'Now using iCloud', body: 'The shop\'s shared data is now kept in iCloud. Shopify keeps its copy as a backup.' });
        return true;
      } catch { return false; } finally { busy = false; }
    },

    /** The owner's way back: keep this till's shared data in Shopify again. Local to this till (decisions item 16). */
    async rollBack(): Promise<void> {
      await d.flag.set('force_meta'); await d.install('metaobject');
      d.notify({ title: 'Back on Shopify storage', body: 'This till now keeps the shop\'s shared data in Shopify. Do the same on every till, or the tills will not see each other\'s changes.' });
    },

    /** After a rollback, let this till move to iCloud again (the next poll does it, if the import is still done). */
    async allowSwitch(): Promise<void> { await d.flag.set(null); },

    async view(): Promise<{ kind: 'metaobject' | 'cloudkit' | 'none'; flag: BackendFlag }> {
      let flag: BackendFlag = null; try { flag = await d.flag.get(); } catch { /* unset */ }
      return { kind: d.activeKind(), flag };
    },
  };
}
export type BackendSwitch = ReturnType<typeof createBackendSwitch>;
