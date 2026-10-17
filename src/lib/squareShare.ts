// Location: src/lib/squareShare.ts
// Pure logic for sharing imported Square history from one register to another over the shop Wi-Fi.
// The sharing register plays the part the PC script plays: it serves manifest.json and the monthly files behind a random key,
// and shows one small QR code holding the address. The other register scans it with the same importer the PC route uses.
// No file, socket or React access here (see squareShareIO.ts), so all of it is tested in Node.
import { isManifestUrl, safeName, type SquareManifest } from './squareHistory';

export const SHARE_PORT = 8787;
/** Tries this many ports upward from SHARE_PORT when the first is busy. */
export const SHARE_PORT_TRIES = 10;
/** Sharing stops by itself after this long, so the address never stays open all day. */
export const SHARE_TTL_MS = 10 * 60 * 1000;
/** A request line and headers longer than this are not from the importer. */
export const MAX_HEAD_BYTES = 8192;

const hex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
/** 16 hex characters from 8 random bytes. The caller supplies the bytes so tests do not depend on a random source. */
export function newShareKey(random: Uint8Array): string {
  if (random.length < 8) throw new Error('Need 8 random bytes for the share key.');
  return hex(random.subarray(0, 8));
}

/** A Wi-Fi address another register could reach. Rejects "not connected" (0.0.0.0), loopback and link-local (169.254) addresses. */
export function usableLanIp(ip: string | null | undefined): ip is string {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec((ip ?? '').trim()); if (!m) return false;
  const p = m.slice(1).map(Number); if (p.some(n => n > 255)) return false;
  if (p[0] === 0 || p[0] === 127 || p[0] >= 224) return false;
  return !(p[0] === 169 && p[1] === 254);
}

/** The address in the QR code. It has the same shape as the PC script's, so the existing scanner and importer accept it unchanged. */
export function shareUrl(ip: string, port: number, key: string): string {
  const u = `http://${ip.trim()}:${port}/${key}/manifest.json`;
  if (!isManifestUrl(u)) throw new Error('Could not build a valid share address.');
  return u;
}

/** The only names the server will ever hand out: the manifest, and the files the manifest lists. */
export function shareableNames(m: SquareManifest): Set<string> {
  const out = new Set<string>(['manifest.json']);
  for (const f of m.files) if (safeName(f.name)) out.add(f.name);
  return out;
}

// ── a tiny HTTP/1.1 reader and writer (just enough for GET) ────────────────────────────────────
export type ParsedRequest = { kind: 'more' } | { kind: 'bad' } | { kind: 'ok'; method: string; target: string };
/** `head` is everything received so far on one connection. Waits for the blank line that ends the headers. */
export function parseRequest(head: string): ParsedRequest {
  const end = head.indexOf('\r\n\r\n');
  if (end < 0) return head.length > MAX_HEAD_BYTES ? { kind: 'bad' } : { kind: 'more' };
  if (end > MAX_HEAD_BYTES) return { kind: 'bad' };
  const m = /^([A-Z]{3,7}) (\S{1,300}) HTTP\/1\.[01]\r\n/.exec(head.slice(0, end + 2)); if (!m) return { kind: 'bad' };
  return { kind: 'ok', method: m[1], target: m[2] };
}

export type Route = { status: 200; name: string } | { status: 400 | 404 | 405 };
/** Checks the method, the random key and the file name. Anything else is a plain 404, so a wrong key reveals nothing. */
export function route(method: string, target: string, key: string, allowed: Set<string>): Route {
  if (method !== 'GET') return { status: 405 };
  const path = target.split('?')[0].split('#')[0];
  const m = /^\/([a-f0-9]{8,64})\/([A-Za-z0-9._-]{1,80})$/.exec(path); if (!m) return { status: 404 };
  if (m[1] !== key || !allowed.has(m[2]) || !safeName(m[2])) return { status: 404 };
  return { status: 200, name: m[2] };
}

export type Answer = { kind: 'more' } | { kind: 'error'; status: 400 | 404 | 405 } | { kind: 'file'; name: string };
/** One call that turns what a connection has sent so far into "wait", "refuse" or "send this file". Both the app and the tests use it. */
export function answerRequest(head: string, key: string, allowed: Set<string>): Answer {
  const req = parseRequest(head); if (req.kind === 'more') return { kind: 'more' }; if (req.kind === 'bad') return { kind: 'error', status: 400 };
  const r = route(req.method, req.target, key, allowed); return r.status === 200 ? { kind: 'file', name: r.name } : { kind: 'error', status: r.status };
}

export const contentTypeOf = (name: string) => (name.endsWith('.json') ? 'application/json' : 'application/gzip');
const REASON: Record<number, string> = { 200: 'OK', 400: 'Bad Request', 404: 'Not Found', 405: 'Method Not Allowed' };
/** Status line and headers. `Connection: close` means each request gets its own connection, which keeps the server simple. */
export function responseHead(status: 200 | 400 | 404 | 405, length: number, contentType?: string): string {
  return `HTTP/1.1 ${status} ${REASON[status]}\r\n${contentType ? `Content-Type: ${contentType}\r\n` : ''}Content-Length: ${length}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n`;
}

/** Splits bytes for writing to a socket, so a large month file does not sit in one huge write. */
export function chunkBytes(b: Uint8Array, size = 32768): Uint8Array[] {
  const out: Uint8Array[] = []; for (let i = 0; i < b.length; i += size) out.push(b.subarray(i, Math.min(b.length, i + size))); return out;
}

// ── who has received what ──────────────────────────────────────────────────────────────────────
/** Which files each requesting device has been sent. Keyed by the other device's address. */
export type ShareLog = Map<string, Set<string>>;
export const noteServed = (log: ShareLog, who: string, name: string): ShareLog => { (log.get(who) ?? log.set(who, new Set()).get(who)!).add(name); return log; };
export type ShareStatus = { devices: number; finished: number; files: number };
/** A device is finished once it has been sent the manifest and every file the manifest lists. */
export function shareStatus(m: SquareManifest, log: ShareLog): ShareStatus {
  const need = [...shareableNames(m)]; let finished = 0, files = 0;
  for (const got of log.values()) { files += got.size; if (need.every(n => got.has(n))) finished++; }
  return { devices: log.size, finished, files };
}
export function statusLine(s: ShareStatus): string {
  if (!s.devices) return 'Waiting for another register to scan this code…';
  if (s.finished) return s.finished === 1 ? 'Sent to 1 register. You can stop sharing, or let another register scan it.' : `Sent to ${s.finished} registers. You can stop sharing now.`;
  return `Sending… ${s.files} file${s.files === 1 ? '' : 's'} so far.`;
}
