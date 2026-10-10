// Location: src/lib/squareHistoryIO.ts
// Device side of the one-off Square history import. Files land in Documents/square-history/ (visible in Files.app),
// stay gzip-compressed on disk, and are only decompressed one month at a time. Never talks to Square or Shopify.
import * as FS from 'expo-file-system/legacy';
import { useApp } from '../state/store';
import { kvDel, kvGet, kvSet } from './kv';
import { emptyTotals, type RollupRow, type Totals } from './rollup';
import type { SaleRecord } from './types';
import type { HistSale } from './squareConvert';
import { addToRollups, buildLinkIndex, canonicalName, finishRollups, linkSale, linkedStats, packJson, parseManifest, safeName, unpackJson, type SquareManifest } from './squareHistory';

const dir = () => `${FS.documentDirectory ?? ''}square-history/`;
const META_KEY = 'squareHistoryMeta';
export type SquareMeta = { installedAt: string; relinkedAt: string; sales: number; refunds: number; from?: string; to?: string; lines: number; linkedLines: number; days: number };
let cache: { rows?: RollupRow[] } = {};

const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOK = (() => { const m = new Uint8Array(128); for (let i = 0; i < A.length; i++) m[A.charCodeAt(i)] = i; return m; })();
export function b64ToBytes(b64: string): Uint8Array {
  const s = b64.replace(/[^A-Za-z0-9+/]/g, ''); const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0; for (let i = 0; i < s.length; i += 4) { const a = LOOK[s.charCodeAt(i)], b = LOOK[s.charCodeAt(i + 1)], c = LOOK[s.charCodeAt(i + 2)] || 0, d = LOOK[s.charCodeAt(i + 3)] || 0;
    out[o++] = (a << 2) | (b >> 4); if (i + 2 < s.length) out[o++] = ((b & 15) << 4) | (c >> 2); if (i + 3 < s.length) out[o++] = ((c & 3) << 6) | d; }
  return out.subarray(0, o);
}
export function bytesToB64(b: Uint8Array): string {
  let s = ''; for (let i = 0; i < b.length; i += 3) { const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += A[(n >> 18) & 63] + A[(n >> 12) & 63] + (i + 1 < b.length ? A[(n >> 6) & 63] : '=') + (i + 2 < b.length ? A[n & 63] : '='); }
  return s;
}
const readBytes = async (name: string) => b64ToBytes(await FS.readAsStringAsync(dir() + name, { encoding: FS.EncodingType.Base64 }));
const exists = async (name: string) => (await FS.getInfoAsync(dir() + name)).exists;

export const squareMeta = () => kvGet<SquareMeta | null>(META_KEY, null);

/** Fetches the manifest from the PC script's address, downloads every file next to it, then links and builds rollups. */
export async function installFromUrl(manifestUrl: string, progress: (m: string) => void): Promise<SquareMeta> {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 20000);
  let text: string;
  try { const res = await fetch(manifestUrl, { signal: ctl.signal }); if (!res.ok) throw new Error(`The PC said ${res.status}.`); text = await res.text(); }
  catch (e: any) { throw new Error(`Could not reach the PC (${e.name === 'AbortError' ? 'timed out' : e.message}). Check it is on the same Wi-Fi, the script is still running, and Local Network is allowed for this app in iOS Settings.`); }
  finally { clearTimeout(timer); }
  const m = parseManifest(text); const base = manifestUrl.replace(/manifest\.json$/, '');
  await FS.makeDirectoryAsync(dir(), { intermediates: true }).catch(() => {});
  let n = 0;
  for (const f of m.files) { progress(`Downloading ${++n} of ${m.files.length}…`); const r = await FS.downloadAsync(base + encodeURIComponent(f.name), dir() + f.name); if (r.status !== 200) throw new Error(`Download of ${f.name} failed (${r.status}).`); }
  await FS.writeAsStringAsync(dir() + 'manifest.json', text);
  return rebuild(progress);
}

/** Fallback: files picked from Files.app (AirDrop / iCloud / USB from the PC's `out` folder). */
export async function installFromPicked(files: { name: string; uri: string }[], progress: (m: string) => void): Promise<SquareMeta> {
  await FS.makeDirectoryAsync(dir(), { intermediates: true }).catch(() => {});
  let got = 0, hasManifest = false;
  for (const f of files) { const name = canonicalName(f.name); if (!name) continue; progress(`Copying ${name}…`); await FS.deleteAsync(dir() + name, { idempotent: true }); await FS.copyAsync({ from: f.uri, to: dir() + name }); got++; if (name === 'manifest.json') hasManifest = true; }
  if (!got) throw new Error('None of those files looked like Square history (expected manifest.json and sales-YYYY-MM.json.gz).');
  if (!hasManifest) await FS.writeAsStringAsync(dir() + 'manifest.json', JSON.stringify(await inferManifest()));
  return rebuild(progress);
}
async function inferManifest(): Promise<SquareManifest> {
  const names = (await FS.readDirectoryAsync(dir())).filter(n => /^sales-\d{4}-\d{2}\.json\.gz$/.test(n)).sort();
  return { v: 1, createdAt: new Date().toISOString(), sales: 0, refunds: 0, locations: [], files: names.map(name => ({ name, bytes: 0, sales: 0, month: name.slice(6, 13) })) };
}

/** Re-reads every stored month, links lines to the current Shopify catalogue, and rewrites the daily rollups. Safe to run again after "Import from Shopify". */
export async function rebuild(progress: (m: string) => void): Promise<SquareMeta> {
  const m = parseManifest(await FS.readAsStringAsync(dir() + 'manifest.json'));
  const st = useApp.getState(); const idx = buildLinkIndex(st.data.variants, st.data.collections);
  const roll: Record<string, Totals> = {}; let sales = 0, refunds = 0, lines = 0, linked = 0, from: string | undefined, to: string | undefined; let i = 0;
  for (const f of m.files) {
    if (!safeName(f.name) || !(await exists(f.name))) throw new Error(`Missing file ${f.name}. Copy it across and try again.`);
    progress(`Reading ${f.month} (${++i} of ${m.files.length})…`);
    const list = unpackJson<HistSale[]>(await readBytes(f.name)).map(s => linkSale(s, idx));
    addToRollups(roll, list); const ls = linkedStats(list); lines += ls.total; linked += ls.linked;
    for (const s of list) { s.type === 'sale' ? sales++ : refunds++; if (!from || s.ts < from) from = s.ts; if (!to || s.ts > to) to = s.ts; }
  }
  finishRollups(roll);
  await FS.writeAsStringAsync(dir() + 'rollups.json.gz', bytesToB64(packJson(roll)), { encoding: FS.EncodingType.Base64 });
  const old = await squareMeta(); const now = new Date().toISOString();
  const meta: SquareMeta = { installedAt: old?.installedAt ?? now, relinkedAt: now, sales, refunds, from, to, lines, linkedLines: linked, days: Object.keys(roll).length };
  await kvSet(META_KEY, meta); cache = {};
  return meta;
}

/** Daily rollups for Reports (a few hundred KB at most; cached after the first read). */
export async function loadSquareRollups(): Promise<RollupRow[]> {
  if (cache.rows) return cache.rows;
  try {
    if (!(await exists('rollups.json.gz'))) return (cache.rows = []);
    const r = unpackJson<Record<string, Totals>>(await readBytes('rollups.json.gz'));
    return (cache.rows = Object.entries(r).map(([k, t]) => { const [registerId, date] = k.split('|'); return { registerId, date, totals: { ...emptyTotals(), ...t } }; }));
  } catch { return (cache.rows = []); }
}

/** Every imported sale and refund, linked to the current catalogue, for the Transactions list (read-only). */
export async function loadSquareSales(): Promise<SaleRecord[]> {
  if (!(await exists('manifest.json'))) return [];
  const m = parseManifest(await FS.readAsStringAsync(dir() + 'manifest.json'));
  const st = useApp.getState(); const idx = buildLinkIndex(st.data.variants, st.data.collections); const out: SaleRecord[] = [];
  for (const f of m.files) { if (!safeName(f.name) || !(await exists(f.name))) continue; for (const s of unpackJson<HistSale[]>(await readBytes(f.name))) out.push(linkSale(s, idx)); }
  return out;
}

export async function removeSquareHistory() { await FS.deleteAsync(dir(), { idempotent: true }); await kvDel(META_KEY); cache = {}; }
