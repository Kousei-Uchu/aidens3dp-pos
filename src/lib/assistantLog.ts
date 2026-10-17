// Location: src/lib/assistantLog.ts
// The assistant's audit log (patch 0152, plan 3.6): a record of every exchange with the model, kept on this device only,
// so the manager can see what was asked, what was sent and what came back. Pure logic over a tiny file interface, so it
// runs in the node tests; assistantLogIO.ts gives it the real (hidden) folder on the iPad. Nothing here is synced or backed up.
//
// Format: one JSON line per event. The current month is one plain text file per day (d-YYYY-MM-DD.jsonl). Finished months are
// packed into one gzip file each (m-YYYY-MM.jsonl.gz). When the folder passes its cap, the oldest files are removed and a
// purge event says so. The log never holds more than the model was sent: withheld data is counted by category, never kept.
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import type { Role } from './types';
import { classifyEndpoint, parseBaseUrl, type EndpointClass, type EndpointMode } from './assistantConfig';
import { AssistantError, redactSecrets, type FetchLike } from './assistantClient';
import { prepare, runPrepared, type AskInput, type AskResult, type ChatEntry, type Detail, type Masked, type Prepared } from './assistantChat';

// ---------- events ----------
export type LogStaff = { id: string; name: string; role: Role | 'none' };
export type LogEndpoint = { host: string; model: string; scope: EndpointClass };
/** One message that went to the model. The text is only stored when this log has not already got it as an earlier question or reply. */
export type SentPart = { id: string; role: 'user' | 'assistant'; text?: string };
export type SentRecord = { sys: string; parts: SentPart[]; hash: string };
export type LogEvent = {
  v: 1; id: string; at: number; kind: 'ask' | 'error' | 'purge';
  staff: LogStaff; practice: boolean; endpoint?: LogEndpoint; detail?: Detail;
  user?: { id: string; text: string }; reply?: { id: string; text: string };
  /** What the model received: the system prompt by hash (the text is in the log's prompt list) and the messages by id. */
  sent?: SentRecord;
  /** What the scrubber hid, by category. */
  masked?: Masked;
  /** What the data gate withheld, by category (patch 5). The items themselves are never kept. */
  withheld?: Record<string, number>;
  ms?: number; error?: { kind: string; message: string };
  purge?: { from: string; to: string; events: number; bytes: number };
};
export const TEXT_CLIP = 20000;
const clip = (s: string): string => (s.length > TEXT_CLIP ? `${s.slice(0, TEXT_CLIP)}[cut]` : s);

/** A short checksum, so the viewer can say whether it rebuilt a request exactly. Not a security feature. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export const logStaff = (staffId: string | undefined, staff: { id: string; name: string }[], role: Role | 'none'): LogStaff => {
  const m = staffId ? staff.find(x => x.id === staffId) : undefined;
  return { id: staffId && staffId.trim() ? staffId : 'owner', name: m?.name ?? 'Owner', role };
};
/** Host only: never the path, the port's query or the key. */
export function logEndpoint(baseUrl: string, model: string, mode: EndpointMode): LogEndpoint {
  const p = parseBaseUrl(baseUrl);
  return { host: p.ok ? p.host : '', model, scope: classifyEndpoint(baseUrl, mode) };
}

export type BuildInput = {
  id: string; now: number; staff: LogStaff; practice: boolean; endpoint?: LogEndpoint; detail: Detail; p: Prepared;
  /** True when the log already holds this message's text. */
  known: (id: string) => boolean; reply?: ChatEntry; error?: { kind: string; message: string }; ms: number; apiKey?: string;
};
/** Builds one event. Every text is clipped and run through the key remover, so the key can never reach a line. */
export function buildEvent(i: BuildInput): { event: LogEvent; prompt: { hash: string; text: string } } {
  const key = (t: string) => clip(redactSecrets(t, i.apiKey));
  const sysHash = fnv1a(i.p.system);
  const parts: SentPart[] = i.p.included.map(e => ({ id: e.id, role: e.role, ...(e.id === i.p.user.id || i.known(e.id) ? {} : { text: key(e.text) }) }));
  const event: LogEvent = {
    v: 1, id: i.id, at: i.now, kind: i.error ? 'error' : 'ask', staff: i.staff, practice: i.practice,
    ...(i.endpoint ? { endpoint: i.endpoint } : {}), detail: i.detail,
    user: { id: i.p.user.id, text: key(i.p.user.text) },
    ...(i.reply ? { reply: { id: i.reply.id, text: key(i.reply.text) } } : {}),
    sent: { sys: sysHash, parts, hash: fnv1a(JSON.stringify(i.p.messages)) },
    ...(Object.keys(i.p.masked).length ? { masked: i.p.masked } : {}),
    ms: i.ms,
    ...(i.error ? { error: { kind: i.error.kind, message: key(i.error.message) } } : {}),
  };
  return { event, prompt: { hash: sysHash, text: i.p.system } };
}

// ---------- asking, with the log ----------
export type LogSink = (e: LogEvent, prompt?: { hash: string; text: string }) => Promise<void>;
export type LogContext = { staff: LogStaff; practice: boolean; endpoint?: LogEndpoint; apiKey: string; known: (id: string) => boolean; sink: LogSink; newId: () => string };
export const LOG_FAIL_LINE = 'This conversation could not be added to the log. Tell a manager.';
export type LoggedAsk =
  | { ok: true; result: AskResult; logError?: string }
  | { ok: false; error: unknown; logError?: string };

/**
 * Asks the model and logs the exchange. A log problem never stops the question or the answer (the owner's choice): it is
 * reported in `logError` so the cashier can tell a manager. A failed request is logged too, with what was going to be sent.
 */
export async function askLogged(f: FetchLike, a: AskInput, c: LogContext): Promise<LoggedAsk> {
  const p = prepare(a); const t0 = a.now();
  const base = { id: c.newId(), staff: c.staff, practice: c.practice, endpoint: c.endpoint, detail: a.detail, p, known: c.known, apiKey: c.apiKey };
  let result: AskResult | undefined; let failure: unknown;
  try { result = await runPrepared(f, a, p); } catch (e) { failure = e; }
  const now = a.now();
  const b = result
    ? buildEvent({ ...base, now, reply: result.reply, ms: now - t0 })
    : buildEvent({ ...base, now, ms: now - t0, error: failure instanceof AssistantError ? { kind: failure.kind, message: failure.message } : { kind: 'server_error', message: String((failure as Error)?.message ?? 'Something went wrong.') } });
  let logError: string | undefined;
  try { await c.sink(b.event, b.prompt); } catch { logError = LOG_FAIL_LINE; }
  return result ? { ok: true, result, ...(logError ? { logError } : {}) } : { ok: false, error: failure, ...(logError ? { logError } : {}) };
}

// ---------- the store ----------
export type LogFs = {
  read(name: string): Promise<Uint8Array | null>;
  write(name: string, data: Uint8Array): Promise<void>;
  remove(name: string): Promise<void>;
  list(): Promise<{ name: string; size: number }[]>;
};
export const DEFAULT_LOG_CAP_BYTES = 200 * 1024 * 1024;
export const LOG_WARN_AT = 0.8;
/** After a purge the folder is brought down to this share of the cap, so it does not purge on every message. */
export const LOG_PURGE_TO = 0.9;
export const META_NAME = 'meta.json';
export type LogMeta = { v: 1; prompts: Record<string, string>; purgedThrough?: string; purgedEvents: number; lastPurgeAt?: number };
export type LogStatus = { bytes: number; capBytes: number; percent: number; warn: boolean; purgedThrough?: string; purgedEvents: number; lastPurgeAt?: number };

const DAY_FILE = /^d-(\d{4}-\d{2}-\d{2})\.jsonl$/;
const MONTH_FILE = /^m-(\d{4}-\d{2})\.jsonl\.gz$/;
export const dayName = (day: string): string => `d-${day}.jsonl`;
export const monthName = (month: string): string => `m-${month}.jsonl.gz`;
const two = (n: number): string => String(n).padStart(2, '0');
/** The shop's local day, as YYYY-MM-DD. */
export const localDay = (ms: number): string => { const d = new Date(ms); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; };

/** Where the log lives. On iOS a sibling of Documents, so Files.app cannot see it; elsewhere the app's private files folder. */
export function logDirFromDocuments(documentDirectory: string | null | undefined): string | null {
  const d = documentDirectory ?? ''; if (!d) return null;
  if (/\/Documents\/$/.test(d)) return `${d.replace(/Documents\/$/, '')}Library/Application Support/assistant-log/`;
  return d.endsWith('/') ? `${d}assistant-log/` : `${d}/assistant-log/`;
}

const joinBytes = (a: Uint8Array, b: Uint8Array): Uint8Array => { const o = new Uint8Array(a.length + b.length); o.set(a, 0); o.set(b, a.length); return o; };
const linesOf = (text: string): string[] => text.split('\n').filter(l => l.trim() !== '');
const idOf = (line: string): string | null => { try { const j = JSON.parse(line); return typeof j?.id === 'string' ? j.id : null; } catch { return null; } };
const countLines = (bytes: Uint8Array): number => linesOf(strFromU8(bytes)).length;

export type LogStore = {
  append: LogSink;
  knows: (id: string) => boolean;
  status: () => Promise<LogStatus>;
  meta: () => Promise<LogMeta>;
  /** For the viewer (patch 0153): every event on the given days (inclusive, YYYY-MM-DD), oldest first. `bad` counts lines that could not be read. */
  events: (range?: { from?: string; to?: string }) => Promise<{ events: LogEvent[]; bad: number }>;
  days: () => Promise<string[]>;
  /** Packs finished months and applies the cap. Runs after every append; exported so the app can run it at start up. */
  maintain: () => Promise<void>;
  /** For the viewer (patch 0153): clears the whole log. The caller must confirm first. */
  clear: () => Promise<void>;
  /** For the viewer (patch 0153): writes every event to one export file, oldest first. */
  exportAll: () => Promise<{ name: string; bytes: number }>;
};

export function createLogStore(fs: LogFs, o: { now?: () => number; capBytes?: () => number } = {}): LogStore {
  const now = o.now ?? Date.now; const cap = o.capBytes ?? (() => DEFAULT_LOG_CAP_BYTES);
  const known = new Set<string>(); let chain: Promise<unknown> = Promise.resolve();
  const queue = <T,>(fn: () => Promise<T>): Promise<T> => { const r = chain.then(fn); chain = r.catch(() => undefined); return r; };

  const readMeta = async (): Promise<LogMeta> => {
    try { const b = await fs.read(META_NAME); if (b) { const j = JSON.parse(strFromU8(b)); return { v: 1, prompts: j && typeof j.prompts === 'object' && j.prompts ? j.prompts : {}, purgedThrough: typeof j.purgedThrough === 'string' ? j.purgedThrough : undefined, purgedEvents: Number.isFinite(j.purgedEvents) ? j.purgedEvents : 0, lastPurgeAt: Number.isFinite(j.lastPurgeAt) ? j.lastPurgeAt : undefined }; } } catch { /* unreadable: start again */ }
    return { v: 1, prompts: {}, purgedEvents: 0 };
  };
  const writeMeta = (m: LogMeta) => fs.write(META_NAME, strToU8(JSON.stringify(m)));

  const writeLine = async (ev: LogEvent) => {
    const name = dayName(localDay(ev.at)); const old = await fs.read(name);
    await fs.write(name, joinBytes(old ?? new Uint8Array(0), strToU8(`${JSON.stringify(ev)}\n`)));
  };

  /** Finished months go into one gzip file each. Lines are de-duplicated by id, so a crash half way through repeats nothing. */
  const pack = async () => {
    const thisMonth = localDay(now()).slice(0, 7);
    const files = await fs.list(); const byMonth = new Map<string, string[]>();
    for (const f of files) { const m = DAY_FILE.exec(f.name); if (m && m[1].slice(0, 7) < thisMonth) byMonth.set(m[1].slice(0, 7), [...(byMonth.get(m[1].slice(0, 7)) ?? []), m[1]]); }
    for (const [month, days] of [...byMonth.entries()].sort()) {
      const seen = new Set<string>(); const out: string[] = [];
      const take = (text: string) => { for (const l of linesOf(text)) { const id = idOf(l); if (id) { if (seen.has(id)) continue; seen.add(id); } out.push(l); } };
      const existing = await fs.read(monthName(month)); if (existing) take(strFromU8(gunzipSync(existing)));
      for (const d of days.sort()) { const b = await fs.read(dayName(d)); if (b) take(strFromU8(b)); }
      await fs.write(monthName(month), gzipSync(strToU8(`${out.join('\n')}\n`)));
      for (const d of days) await fs.remove(dayName(d));
    }
  };

  /** Oldest files go first, never today's. Says so in the log and in the meta, so nobody thinks the log is complete. */
  const enforceCap = async () => {
    const limit = cap(); let files = await fs.list(); let total = files.reduce((n, f) => n + f.size, 0);
    if (total <= limit) return;
    const today = dayName(localDay(now()));
    const order = files.filter(f => MONTH_FILE.test(f.name) || (DAY_FILE.test(f.name) && f.name !== today))
      .sort((a, b) => (MONTH_FILE.test(a.name) ? 0 : 1) - (MONTH_FILE.test(b.name) ? 0 : 1) || a.name.localeCompare(b.name));
    const target = limit * LOG_PURGE_TO; let events = 0; let bytes = 0; let from = ''; let to = '';
    for (const f of order) {
      if (total <= target) break;
      const raw = await fs.read(f.name); const m = MONTH_FILE.exec(f.name); const d = DAY_FILE.exec(f.name);
      if (raw) { try { events += countLines(m ? gunzipSync(raw) : raw); } catch { /* count what we can */ } }
      const label = (m ? m[1] : d ? d[1] : f.name); if (!from) from = label; to = label; bytes += f.size; total -= f.size;
      await fs.remove(f.name);
    }
    if (!from) return;
    const meta = await readMeta(); meta.purgedThrough = to; meta.purgedEvents += events; meta.lastPurgeAt = now(); await writeMeta(meta);
    await writeLine({ v: 1, id: `purge-${now()}`, at: now(), kind: 'purge', staff: { id: 'system', name: 'System', role: 'none' }, practice: false, purge: { from, to, events, bytes } });
  };

  const maintain = () => queue(async () => { await pack(); await enforceCap(); });

  const append: LogSink = (ev, prompt) => queue(async () => {
    if (prompt) { const m = await readMeta(); if (m.prompts[prompt.hash] === undefined) { m.prompts[prompt.hash] = prompt.text; await writeMeta(m); } }
    await writeLine(ev);
    if (ev.user) known.add(ev.user.id); if (ev.reply) known.add(ev.reply.id);
    try { await pack(); await enforceCap(); } catch { /* the line is safe; maintenance tries again next time */ }
  });

  const status = async (): Promise<LogStatus> => {
    const files = await fs.list(); const bytes = files.reduce((n, f) => n + f.size, 0); const m = await readMeta(); const c = cap();
    return { bytes, capBytes: c, percent: c > 0 ? Math.min(100, Math.round((bytes / c) * 100)) : 100, warn: c > 0 && bytes >= c * LOG_WARN_AT, purgedThrough: m.purgedThrough, purgedEvents: m.purgedEvents, lastPurgeAt: m.lastPurgeAt };
  };

  const days = async (): Promise<string[]> => {
    const out = new Set<string>(); for (const f of await fs.list()) { const d = DAY_FILE.exec(f.name); if (d) out.add(d[1]); }
    return [...out].sort();
  };

  const events: LogStore['events'] = async (range = {}) => {
    const files = await fs.list(); const out: LogEvent[] = []; let bad = 0;
    const inRange = (day: string) => (!range.from || day >= range.from) && (!range.to || day <= range.to);
    const monthIn = (month: string) => (!range.from || `${month}-31` >= range.from) && (!range.to || `${month}-01` <= range.to);
    const parse = (text: string) => { for (const l of linesOf(text)) { try { const e = JSON.parse(l) as LogEvent; if (e && typeof e.at === 'number' && inRange(localDay(e.at))) out.push(e); else if (!e || typeof e.at !== 'number') bad++; } catch { bad++; } } };
    for (const f of files) {
      const m = MONTH_FILE.exec(f.name); const d = DAY_FILE.exec(f.name);
      if (m && monthIn(m[1])) { const b = await fs.read(f.name); if (b) { try { parse(strFromU8(gunzipSync(b))); } catch { bad++; } } }
      else if (d && inRange(d[1])) { const b = await fs.read(f.name); if (b) parse(strFromU8(b)); }
    }
    return { events: out.sort((a, b) => a.at - b.at), bad };
  };

  const clear = async (): Promise<void> => {
    const files = await fs.list();
    for (const f of files) await fs.remove(f.name);
    await writeMeta({ v: 1, prompts: {}, purgedEvents: 0 });
    known.clear();
  };

  const exportAll = async (): Promise<{ name: string; bytes: number }> => {
    const r = await events();
    const lines = r.events.map(e => JSON.stringify(e)).join('\n') + '\n';
    const name = `assistant-log-export-${localDay(now())}.jsonl`;
    const data = strToU8(lines);
    await fs.write(name, data);
    return { name, bytes: data.length };
  };

  return { append, knows: id => known.has(id), status, meta: readMeta, events, days, maintain, clear, exportAll };
}
