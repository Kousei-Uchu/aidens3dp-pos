// Location: src/lib/cloudkit/auditCloud.ts
// CloudKit sync, patch 6c (audit log, transport half): audit events written to and read from CloudKit records. It joins the pure pieces
// (auditShared.ts) to a small native interface, passed in, so the flow is tested with an in-memory fake and no iPad (tests/auditcloud.test.ts).
// Nothing reaches this unless the CloudKit backend is the active one. Decisions: dev_docs/CLOUDKIT_SYNC_DECISIONS.md item 13, Q4, Q13, N2.
import type { LogEvent } from '../assistantLog';
import { auditFromParts, auditHandleFromRecord, auditToParts, auditToUpload, type SharedAudit } from '../auditShared';
import type { CardMode } from '../saleRecords';
import { pageAll, PAGE_SIZE } from './drawerCloud';

type Rec = Record<string, any>;
type Page = { rows: Rec[]; next: string | null };

export type AuditNative = {
  /** Create or change one audit record. `encrypted` holds the `secure_json` field, stored as a CloudKit encrypted value. */
  putAudit(handle: string, fields: Rec, encrypted: Rec): Promise<Rec>;
  /** The labels only (register, day, time, kind): the encrypted content is not fetched, so a catch-up never downloads the log. */
  listAuditIndex(limit: number, after?: string | null): Promise<Page>;
  /** The newest records first, with the encrypted content this device can read under `encrypted`. */
  listAudit(limit: number, after?: string | null): Promise<Page>;
};

/** Send one event as it happens. Returns false when it was not sent because the mode is `omit` or the event is not one that syncs. */
export async function pushAuditEvent(n: AuditNative, registerId: string, registerName: string, e: LogEvent, mode: CardMode): Promise<boolean> {
  const p = auditToParts(registerId, registerName, e, mode); if (!p) return false;
  await n.putAudit(p.handle, p.plain, p.encrypted); return true;
}

/** Upload the events CloudKit does not hold yet, oldest first. Safe to repeat. Also the one-off upload of a register's own history after it joins (Q13). */
export async function pushAuditCatchUp(n: AuditNative, registerId: string, registerName: string, local: LogEvent[], mode: CardMode): Promise<number> {
  if (mode !== 'encrypted') return 0;
  const remote = new Set<string>();
  for (const r of await pageAll(after => n.listAuditIndex(PAGE_SIZE, after))) { const h = auditHandleFromRecord(String(r.recordName ?? '')); if (h) remote.add(h); }
  let sent = 0;
  for (const e of auditToUpload(registerId, local, remote)) if (await pushAuditEvent(n, registerId, registerName, e, mode)) sent++;
  return sent;
}

/** The newest `max` audit records from the other registers, with their content where this device can read it. Unreadable records are skipped. */
export async function pullAuditOthers(n: AuditNative, ownRegisterId: string, max = 500): Promise<SharedAudit[]> {
  const out: SharedAudit[] = [];
  for (const r of await pageAll(after => n.listAudit(PAGE_SIZE, after), max)) {
    const a = auditFromParts(String(r.recordName ?? ''), r, r.encrypted);
    if (a && a.registerId !== ownRegisterId) out.push(a);
  }
  return out.sort((a, b) => b.at - a.at).slice(0, max);
}
