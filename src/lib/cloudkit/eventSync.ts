// Location: src/lib/cloudkit/eventSync.ts
// CloudKit sync, patch 4 (call sites): when an event is uploaded, and when the ones that were missed are caught up.
// Everything the app supplies (is CloudKit the active backend, is this practice mode, which register, how to read events.csv, the
// native module) is passed in, so the rules are tested without an iPad (tests/eventsync.test.ts). The app's one instance is made
// in sync.ts. Decisions: dev_docs/CLOUDKIT_SYNC_DECISIONS.md item 12, Q3, Q13.
import { eventsCsv, type EventInput } from '../eventRecords';
import { parseEventsCsv } from '../eventsCsvParse';
import { pullCloudEvents, pushCloudEvent, pushCloudEvents, type EventNative } from './eventCloud';

export type EventSyncDeps = {
  /** True only when the CloudKit backend is the one in use. */
  active: () => boolean;
  /** True in practice mode, when nothing is ever sent. */
  training: () => boolean;
  /** This register's id and name. An empty id means the register is not set up yet, so nothing is sent. */
  who: () => { id: string; name: string };
  native: () => Promise<EventNative>;
  /** The text of `events.csv`, or an empty string when there is none. */
  readCsv: () => Promise<string>;
};

export function createEventSync(d: EventSyncDeps) {
  // Starts true so that each launch uploads the register's own history once (decisions Q13: a register that has just joined).
  // A failed live upload sets it again. Nothing is stored: the CSV is the record of what happened, CloudKit is the copy.
  let behind = true;
  const ready = (): { id: string; name: string } | null => { if (!d.active() || d.training()) return null; const w = d.who(); return w.id ? w : null; };
  /** Send every event in the CSV that CloudKit lacks, if a catch-up is due. Returns how many were new, or null when nothing was attempted. */
  async function catchUp(): Promise<number | null> {
    const w = ready(); if (!w || !behind) return null;
    try {
      const sent = await pushCloudEvents(await d.native(), w.id, w.name, parseEventsCsv(await d.readCsv()));
      behind = false; return sent;
    } catch { return null; }
  }
  return {
    /** Upload one event just after it was written to the CSV. Never throws: the CSV already has it, and the catch-up covers a failure. */
    async upload(e: EventInput): Promise<void> {
      const w = ready(); if (!w) return;
      if (behind) return; // a catch-up is due and will send this one with the rest, in order
      try { await pushCloudEvent(await d.native(), w.id, w.name, e); } catch { behind = true; }
    },
    catchUp,
    /**
     * The combined CSV of every register's events, built from CloudKit on demand (decisions item 12, Q3): the `events.csv` columns
     * plus the register's name, oldest first. This register's own history is sent first if a catch-up is due, so the file is not
     * missing events made here. Returns null when CloudKit is not the active backend or in practice mode. Unlike the poll this
     * throws when CloudKit cannot be read, because someone asked for the file and must be told it could not be made.
     */
    async exportCsv(): Promise<string | null> {
      if (!ready()) return null;
      await catchUp();
      return eventsCsv(await pullCloudEvents(await d.native()));
    },
    /** For tests and diagnostics: whether a catch-up is waiting. */
    isBehind: () => behind,
  };
}
export type EventSync = ReturnType<typeof createEventSync>;
