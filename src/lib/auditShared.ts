// Location: src/lib/auditShared.ts
// CloudKit sync, patch 6c (second half, pure): the assistant's audit log as CloudKit records. One record per logged event, named
// `audit-<register id>-<event id>`, written by the register that made the event and never edited (decisions item 13, Q4, N2).
// The whole event travels in ONE encrypted field, `secure_json`, because it holds what the model was sent and a local model can be sent
// customer names. Only a few labels are plain, so the shop can find and order records without reading them: register, day, time, kind.
// Nothing readable is ever written plain, and in `omit` mode (the default, until the two-Apple-ID test T85 passes) nothing is written.
// No React, no files, no native module: tested on its own (tests/auditshared.test.ts).
import type { CardMode } from './saleRecords';
import type { LogEvent } from './assistantLog';

type Fields = Record<string, string | number>;

/** The one encrypted field an audit record carries. The native module lists it as encrypted for the `Audit` type. */
export const AUDIT_FIELD = 'secure_json';
/** The plain fields. Labels only: who made it, when, and what kind of line it is. */
export const AUDIT_PLAIN_KEYS = ['registerId', 'registerName', 'at', 'day', 'kind'] as const;
const KINDS: readonly string[] = ['ask', 'error', 'offline'];
const ID_RE = /^[A-Za-z0-9_.-]{1,80}$/;
export const isAuditId = (x: unknown): x is string => typeof x === 'string' && ID_RE.test(x);

/** CloudKit refuses a record over 1 MB. The event is kept well under that, counted in UTF-8 bytes. */
export const AUDIT_MAX_BYTES = 600_000;

/** The part of the record name after `audit-`. Both ids are checked, so the name cannot be bent into another one. */
export const auditHandle = (registerId: string, eventId: string): string => { if (!isAuditId(registerId) || !isAuditId(eventId)) throw new Error('Bad audit id.'); return `${registerId}-${eventId}`; };
export const auditRecordName = (handle: string): string => `audit-${handle}`;
export const auditHandleFromRecord = (name: string): string | null => (name.startsWith('audit-') && name.length > 6 ? name.slice(6) : null);

export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1; else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; } else n += 3;
  }
  return n;
}

const CUT = (n: number) => `[cut for iCloud: ${n} characters]`;
/**
 * The event as it will be written, shrunk only if it would not fit. First the tool results go (their names, arguments and status stay),
 * then the text of earlier messages the model was sent, then the question and reply are clipped. `cut` says which, so the viewer can say so.
 */
export function fitEvent(e: LogEvent, max = AUDIT_MAX_BYTES): { event: LogEvent; cut?: 'tools' | 'more' } {
  const size = (x: LogEvent) => utf8Length(JSON.stringify({ v: 1, event: x, cut: 'more' }));
  if (size(e) <= max) return { event: e };
  let x: LogEvent = e;
  if (x.tools?.length) x = { ...x, tools: x.tools.map(t => ({ ...t, result: CUT(t.result.length) })) };
  if (size(x) <= max) return { event: x, cut: 'tools' };
  if (x.sent) x = { ...x, sent: { ...x.sent, parts: x.sent.parts.map(p => (p.text !== undefined ? { id: p.id, role: p.role } : p)) } };
  const clip = (t: string) => (t.length > 2000 ? `${t.slice(0, 2000)}${CUT(t.length - 2000)}` : t);
  if (size(x) > max) x = { ...x, ...(x.user ? { user: { ...x.user, text: clip(x.user.text) } } : {}), ...(x.reply ? { reply: { ...x.reply, text: clip(x.reply.text) } } : {}), ...(x.error ? { error: { ...x.error, message: clip(x.error.message) } } : {}) };
  return { event: x, cut: 'more' };
}

export type AuditParts = { handle: string; plain: Fields; encrypted: Fields };
/**
 * The record for one event, or null when it must not be sent: a purge line (it describes this iPad's own folder), an event with an id that
 * cannot be a record name, or `omit` mode. In `omit` nothing is written at all, because the content is the whole point of the record.
 */
export function auditToParts(registerId: string, registerName: string, e: LogEvent, mode: CardMode = 'omit'): AuditParts | null {
  if (mode !== 'encrypted' || e.kind === 'purge' || !KINDS.includes(e.kind) || !isAuditId(e.id) || !isAuditId(registerId)) return null;
  const { event, cut } = fitEvent(e);
  return {
    handle: auditHandle(registerId, e.id),
    plain: { registerId, registerName, at: e.at, day: dayOf(e.at), kind: e.kind },
    encrypted: { [AUDIT_FIELD]: JSON.stringify({ v: 1, event, ...(cut ? { cut } : {}) }) },
  };
}
const two = (n: number) => String(n).padStart(2, '0');
const dayOf = (ms: number): string => { const d = new Date(ms); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; };

/** One record read back. `event` is null when this iPad could not read the encrypted field (or it is damaged): the label still shows. */
export type SharedAudit = { handle: string; registerId: string; registerName: string; at: number; kind: string; event: LogEvent | null; cut?: 'tools' | 'more' };

/** Null for a record that is not a readable audit label, so one bad record cannot break the list. `encrypted` is what the module could decrypt. */
export function auditFromParts(name: string, plain: Record<string, unknown>, encrypted?: Record<string, unknown>): SharedAudit | null {
  const handle = auditHandleFromRecord(name);
  if (!handle || typeof plain.registerId !== 'string' || !plain.registerId || typeof plain.at !== 'number' || !Number.isFinite(plain.at) || typeof plain.kind !== 'string') return null;
  const out: SharedAudit = { handle, registerId: plain.registerId, registerName: typeof plain.registerName === 'string' ? plain.registerName : '', at: plain.at, kind: plain.kind, event: null };
  const raw = encrypted?.[AUDIT_FIELD];
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw);
      const ev = j?.event;
      if (j?.v === 1 && ev && typeof ev.id === 'string' && typeof ev.at === 'number' && typeof ev.kind === 'string' && ev.staff && typeof ev.staff.name === 'string') {
        out.event = ev as LogEvent; if (j.cut === 'tools' || j.cut === 'more') out.cut = j.cut;
      }
    } catch { /* unreadable: the label is kept */ }
  }
  return out;
}

/** The local events CloudKit does not hold yet, oldest first. `remote` is the set of handles already there. Purge lines and unusable ids are left out. */
export function auditToUpload(registerId: string, local: LogEvent[], remote: ReadonlySet<string>): LogEvent[] {
  if (!isAuditId(registerId)) return [];
  return local.filter(e => e.kind !== 'purge' && KINDS.includes(e.kind) && isAuditId(e.id) && !remote.has(`${registerId}-${e.id}`)).sort((a, b) => a.at - b.at);
}
