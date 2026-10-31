// Location: src/lib/cloudkit/attemptSync.ts
// CloudKit sync, patch 4 (call sites): when a payment attempt is uploaded, when the ones that were missed are caught up, and
// when every register's attempts are read back (0200).
// As with events (eventSync.ts), everything the app supplies is passed in, so the rules are tested without an iPad
// (tests/attemptsync.test.ts). The app's one instance is made in sync.ts. Decisions: dev_docs/CLOUDKIT_SYNC_DECISIONS.md item 9, Q10, Q13.
import type { Attempt } from '../../state/store';
import type { SharedAttempt } from '../eventRecords';
import { applyRemoteResolutions } from '../attemptShared';
import { pullCloudAttempts, pushCloudAttempt, type EventNative } from './eventCloud';

export type AttemptSyncDeps = {
  /** True only when the CloudKit backend is the one in use. */
  active: () => boolean;
  /** True in practice mode, when nothing is ever sent. */
  training: () => boolean;
  /** This register's id and name. An empty id means the register is not set up yet, so nothing is sent. */
  who: () => { id: string; name: string };
  native: () => Promise<EventNative>;
  /** This register's own attempts, as the app holds them now. */
  local: () => Attempt[];
  /** Where the shop-wide list of attempts is kept. It is held in memory only: CloudKit is the record. */
  setShared: (list: SharedAttempt[]) => void;
  /** Replace this register's own attempts. Used only when another register resolved one of them. */
  setLocal: (list: Attempt[]) => void;
  /** Tell the cashier that another register resolved one of this register's payments. */
  notifyResolved: (a: Attempt) => void;
};

export function createAttemptSync(d: AttemptSyncDeps) {
  // Starts true so each launch sends the register's own attempts once (decisions Q13). A failed upload sets it again.
  // Nothing is stored: the app's own list of attempts is the record, CloudKit is the copy.
  let behind = true;
  const ready = (): { id: string; name: string } | null => { if (!d.active() || d.training()) return null; const w = d.who(); return w.id ? w : null; };
  return {
    /**
     * Upload an attempt that has just changed in the app. Never throws: the app already holds it, and the catch-up covers a failure.
     * Returns the attempt as CloudKit now holds it (so a register that lost a resolution can see who won), or null when nothing was
     * sent or it could not be.
     */
    async push(a: Attempt): Promise<SharedAttempt | null> {
      const w = ready(); if (!w || behind) return null; // while a catch-up is due it sends this one with the rest
      try { return await pushCloudAttempt(await d.native(), w.id, w.name, a); } catch { behind = true; return null; }
    },
    /** Send every attempt this register holds, if a catch-up is due. Returns how many were sent, or null when nothing was attempted or one failed. */
    async catchUp(): Promise<number | null> {
      const w = ready(); if (!w || !behind) return null;
      try {
        const n = await d.native(); const list = d.local();
        for (const a of list) await pushCloudAttempt(n, w.id, w.name, a);
        behind = false; return list.length;
      } catch { return null; }
    },
    /**
     * Read every register's attempts from CloudKit. Keeps the shop-wide list, and if another register resolved a payment that is
     * still waiting on this one, marks it resolved here and says so (a local notice, decisions item 10). Returns how many attempts
     * CloudKit holds, or null when nothing was attempted or the read failed. Never throws: the next poll tries again.
     */
    async pull(): Promise<number | null> {
      if (!d.active() || d.training()) return null;
      try {
        const all = await pullCloudAttempts(await d.native());
        d.setShared(all);
        // Read this register's own list only now, after the await, so a change made while CloudKit was answering is not overwritten.
        const { list, resolved } = applyRemoteResolutions(d.local(), all);
        if (resolved.length) { d.setLocal(list); for (const a of resolved) d.notifyResolved(a); }
        return all.length;
      } catch { return null; }
    },
    isBehind: () => behind,
  };
}
export type AttemptSync = ReturnType<typeof createAttemptSync>;
