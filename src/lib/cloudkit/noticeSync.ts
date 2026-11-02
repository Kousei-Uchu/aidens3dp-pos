// Location: src/lib/cloudkit/noticeSync.ts
// CloudKit sync, patch 6a (notices, call sites): when a cash or refund notice is uploaded, when the ones that were missed are
// caught up, and when other registers' notices are read back in.
// As with events and attempts, everything the app supplies is passed in, so the rules are tested without an iPad
// (tests/noticesync.test.ts). The app's one instance is made in sync.ts. Decisions: dev_docs/CLOUDKIT_SYNC_DECISIONS.md item 10, Q2.
import type { Notice } from '../types';
import { importNotices, isSharedNoticeKind } from '../noticeShared';
import { pullCloudNotices, pushCloudNotice, pushCloudNotices, type NoticeNative } from './noticeCloud';

export type NoticeSyncDeps = {
  /** True only when the CloudKit backend is the one in use. */
  active: () => boolean;
  /** True in practice mode, when nothing is ever sent or taken in. */
  training: () => boolean;
  /** This register's id and name. An empty id means the register is not set up yet, so nothing is sent. */
  who: () => { id: string; name: string };
  native: () => Promise<NoticeNative>;
  /** This register's notices, newest first, as the app holds them now. */
  local: () => Notice[];
  setLocal: (list: Notice[]) => void;
  /** The record names already taken in (device only), and where they are kept. */
  seen: () => string[];
  setSeen: (names: string[]) => void;
  /** Whether this device holds the feature a kind of notice belongs to. */
  allowed: (kind: Notice['kind']) => boolean;
  now?: () => number;
};

export function createNoticeSync(d: NoticeSyncDeps) {
  const now = d.now ?? Date.now;
  // Starts true so each launch sends this register's own unread notices once. A failed upload sets it again.
  // Nothing is stored: the app's own list is the record, CloudKit is the copy.
  let behind = true;
  const ready = (): { id: string; name: string } | null => { if (!d.active() || d.training()) return null; const w = d.who(); return w.id ? w : null; };
  return {
    /** Upload a notice just raised here. Only cash and refund are sent. Never throws: the app already holds it, and the catch-up covers a failure. */
    async upload(n: Notice): Promise<void> {
      const w = ready(); if (!w || !isSharedNoticeKind(n.kind) || behind) return; // while a catch-up is due it sends this one with the rest
      try { await pushCloudNotice(await d.native(), w.id, w.name, n); } catch { behind = true; }
    },
    /** Send this register's unread cash and refund notices that CloudKit lacks, if a catch-up is due. Returns how many were new, or null when nothing was attempted or it failed. */
    async catchUp(): Promise<number | null> {
      const w = ready(); if (!w || !behind) return null;
      try { const sent = await pushCloudNotices(await d.native(), w.id, w.name, d.local(), now()); behind = false; return sent; } catch { return null; }
    },
    /**
     * Read every register's shared notices and take in the ones not taken in yet (see `importNotices`). Returns how many notices
     * were added to the list, or null when nothing was attempted or the read failed. Never throws: the next poll tries again.
     */
    async pull(): Promise<number | null> {
      const w = ready(); if (!w) return null;
      try {
        const remote = await pullCloudNotices(await d.native());
        // The list and the taken-in names are read only now, after the await, so a notice raised or cleared while CloudKit was answering is not undone.
        const r = importNotices({ remote, local: d.local(), seen: d.seen(), registerId: w.id, now: now(), allowed: d.allowed });
        if (r.changed) { if (r.added) d.setLocal(r.notices); d.setSeen(r.seen); }
        return r.added;
      } catch { return null; }
    },
    /** For tests and diagnostics: whether a catch-up is waiting. */
    isBehind: () => behind,
  };
}
export type NoticeSync = ReturnType<typeof createNoticeSync>;
