// Location: src/lib/squareHistory.ts
// Pure logic for imported Square history: link lines to Shopify variants (read-only lookup), build report rollups,
// and pack / unpack the compressed files. No file or network access here (see squareHistoryIO.ts).
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import { applyRecord, emptyTotals, rollupKey, type Totals } from './rollup';
import type { Collection, SaleRecord, Variant } from './types';
import type { HistLine, HistSale } from './squareConvert';

export type SquareManifest = {
  v: 1; createdAt: string; from?: string; to?: string; sales: number; refunds: number; locations: string[];
  files: { name: string; bytes: number; sales: number; month: string }[];
};

// ── compression ──────────────────────────────────────────────────────────────
export const packJson = (v: unknown): Uint8Array => gzipSync(strToU8(JSON.stringify(v)), { level: 9 });
export const unpackJson = <T,>(b: Uint8Array): T => JSON.parse(strFromU8(gunzipSync(b))) as T;
export const monthOf = (ts: string) => ts.slice(0, 7);

/** One gzip file per month (`sales-2025-03.json.gz`) so the app can read just the months it needs. */
export function packMonths(sales: HistSale[]): { files: { name: string; data: Uint8Array; sales: number; month: string }[] } {
  const by = new Map<string, HistSale[]>();
  for (const s of sales) { const m = monthOf(s.ts); (by.get(m) ?? by.set(m, []).get(m)!).push(s); }
  return { files: [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, list]) => ({ name: `sales-${month}.json.gz`, data: packJson(list), sales: list.length, month })) };
}
export function buildManifest(sales: HistSale[], files: { name: string; data: Uint8Array; sales: number; month: string }[], locations: string[], now = new Date()): SquareManifest {
  return { v: 1, createdAt: now.toISOString(), from: sales[0]?.ts, to: sales[sales.length - 1]?.ts, sales: sales.filter(s => s.type === 'sale').length, refunds: sales.filter(s => s.type === 'refund').length,
    locations, files: files.map(f => ({ name: f.name, bytes: f.data.length, sales: f.sales, month: f.month })) };
}
/** File names are checked before anything touches disk. */
export const safeName = (n: string) => /^[A-Za-z0-9._-]{1,80}$/.test(n) && !n.includes('..');
/** Files.app may rename a duplicate ("sales-2025-03 2.json.gz"); this puts the proper name back. */
export function canonicalName(picked: string): string | null {
  const s = /^sales-(\d{4}-\d{2})\b.*\.gz$/i.exec(picked); if (s) return `sales-${s[1]}.json.gz`;
  return /^manifest\b.*\.json$/i.test(picked) ? 'manifest.json' : null;
}
export function parseManifest(text: string): SquareManifest {
  const m = JSON.parse(text) as SquareManifest;
  if (!m || m.v !== 1 || !Array.isArray(m.files)) throw new Error('This is not a Square history manifest.');
  for (const f of m.files) if (!safeName(f.name)) throw new Error(`Unsafe file name in manifest: ${f.name}`);
  return m;
}
/** The address a QR code from the PC script carries. */
export const isManifestUrl = (s: string) => /^http:\/\/[\w.\-:]+\/[a-f0-9]{8,}\/manifest\.json$/i.test(s.trim());

// ── linking to Shopify (reads the catalogue already on the device; never writes to it) ──────────
export type LinkIndex = { bySku: Map<string, Variant>; byBarcode: Map<string, Variant>; collectionOf: Map<string, string> };
const norm = (s?: string) => (s ?? '').trim().toLowerCase();
export function buildLinkIndex(variants: Record<string, Variant>, collections: Collection[]): LinkIndex {
  const bySku = new Map<string, Variant>(); const byBarcode = new Map<string, Variant>(); const collectionOf = new Map<string, string>();
  for (const v of Object.values(variants)) { if (norm(v.sku) && !bySku.has(norm(v.sku))) bySku.set(norm(v.sku), v); if (norm(v.barcode) && !byBarcode.has(norm(v.barcode))) byBarcode.set(norm(v.barcode), v); }
  for (const c of collections) for (const p of c.productIds) if (!collectionOf.has(p)) collectionOf.set(p, c.title);
  return { bySku, byBarcode, collectionOf };
}

/**
 * Square variation → SKU → Shopify variant. A matched line becomes a normal catalogue line (with the Shopify cost, for profit reports);
 * anything else stays a custom line titled `Item - Variation - Notes`, with Square's category for the category report.
 */
export function linkLine(l: HistLine, idx: LinkIndex): HistLine {
  if (l.kind === 'gift_card') return l;
  const v = (l.sq?.sku && idx.bySku.get(norm(l.sq.sku))) || (l.sq?.upc && idx.byBarcode.get(norm(l.sq.upc))) || undefined;
  if (!v) return { ...l, collectionTitles: l.sq?.category ? [l.sq.category] : undefined };
  const col = idx.collectionOf.get(v.productId);
  return { ...l, kind: 'item', variantId: v.id, title: v.productTitle, variantTitle: v.variantTitle || undefined, costCents: Math.round((v.costCents ?? 0) * l.qty), collectionTitles: col ? [col] : l.sq?.category ? [l.sq.category] : undefined };
}
export function linkSale(s: HistSale, idx: LinkIndex): HistSale {
  const lines = s.lines.map(l => linkLine(l, idx));
  return { ...s, lines, cogsCents: lines.reduce((a, l) => a + l.costCents, 0) };
}
export const linkedStats = (sales: HistSale[]) => { let linked = 0, total = 0; for (const s of sales) for (const l of s.lines) { if (l.kind === 'gift_card') continue; total++; if (l.variantId) linked++; } return { linked, total }; };

// ── report rollups ───────────────────────────────────────────────────────────
/** Daily rollups in the same shape the Reports screen already reads, under register "square". */
export function addToRollups(into: Record<string, Totals>, sales: SaleRecord[]): Record<string, Totals> {
  for (const s of sales) { const k = rollupKey(s.registerId, s.ts); into[k] = applyRecord(into[k] ?? emptyTotals(), s); }
  return into;
}
/** The `applied` id lists are only for de-duplicating live sales, so they are dropped from imported history to keep it small. */
export function finishRollups(r: Record<string, Totals>): Record<string, Totals> { for (const t of Object.values(r)) t.applied = []; return r; }
