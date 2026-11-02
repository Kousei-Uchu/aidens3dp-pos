// Location: src/lib/cloudkit/auditSync.ts
// CloudKit sync, patch 6c (audit log, call sites): when a logged event is uploaded, when the ones that were missed are caught up, and when
// the manager asks to see the other registers' events. Everything the app supplies is passed in, so the rules are tested without an iPad
// (tests/auditsync.test.ts). The app's one instance is made in sync.ts. Decisions: item 13, Q4, Q13, N2.
import type { LogEvent } from '../assistantLog';
import type { SharedAudit } from '../auditShared';
import { pullAuditOthers, pushAuditCatchUp, pushAuditEvent, type AuditNative } from './auditCloud';
import type { CardMode } from '../saleRecords';

export type AuditSyncDeps = {
  active: () => boolean;
  /** True in practice mode. Events logged then are kept here and sent at the first catch-up afterwards. */
  training: () => boolean;
  who: () => { id: string; name: string };
  native: () => Promise<AuditNative>;
  /** `encrypted` only once encrypted fields have been shown to work across Apple IDs (T85). Until then nothing is sent. */
  mode: () => CardMode | Promise<CardMode>;
  /** Every event in this iPad's own log, oldest first or not. */
  readLocal: () => Promise<LogEvent[]>;
};

export function createAuditSync(d: AuditSyncDeps) {
  // Starts true so that each launch uploads the register's own log once (decisions Q13). A failed or skipped live upload sets it again.
  let behind = true;
  const ready = (): { id: string; name: string } | null => { if (!d.active()) return null; const w = d.who(); return w.id ? w : null; };
  async function catchUp(): Promise<number | null> {
    const w = ready(); if (!w || !behind || d.training()) return null;
    try {
      const mode = await d.mode(); if (mode !== 'encrypted') return null;
      const sent = await pushAuditCatchUp(await d.native(), w.id, w.name, await d.readLocal(), mode);
      behind = false; return sent;
    } catch { return null; }
  }
  return {
    /** Upload one event just after it was written to the local log. Never throws: the local log has it, and the catch-up covers a failure. */
    async upload(e: LogEvent): Promise<void> {
      const w = ready(); if (!w) return;
      if (d.training() || behind) { behind = true; return; } // a catch-up is due and will send this one with the rest
      try { if (!(await pushAuditEvent(await d.native(), w.id, w.name, e, await d.mode()))) behind = true; } catch { behind = true; }
    },
    catchUp,
    /**
     * The newest events other registers logged, for the manager's viewer. Unlike the poll this throws when CloudKit cannot be read, because
     * someone asked to see them and must be told it failed. Returns null when CloudKit is not the active backend or in practice mode.
     */
    async others(max = 500): Promise<SharedAudit[] | null> {
      const w = ready(); if (!w || d.training()) return null;
      await catchUp();
      return pullAuditOthers(await d.native(), w.id, max);
    },
    isBehind: () => behind,
  };
}
export type AuditSync = ReturnType<typeof createAuditSync>;
