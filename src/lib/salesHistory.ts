// Location: src/lib/salesHistory.ts
// Other tills' sales, for the assistant's shop-wide view. Every finished sale already uploads to the pos_sale metaobject, but
// until now nothing pulled it back down, so the assistant's data tools only ever saw this till's own sales. These pure helpers
// decode the rows another till wrote and merge them into what this till keeps. sync.ts does the calls; assistantDataIO.ts uses
// the result. No network, no store, no React Native, so they run in the node tests.
//
// Sales carry their full record in `sale_json` (see metaobjects.ts). A row written before that field existed still counts in
// the daily totals it fed, but it has no line detail, so it is left out of the list the tools read.
import type { RollupRow, Totals } from './rollup';
import type { SaleRecord } from './types';

/** How many of another till's sales the shared cache keeps (newest first). */
export const MAX_SHARED_SALES = 2000;
/** How often the shared sales/rollup pull may run, in milliseconds. */
export const SALES_PULL_MS = 5 * 60 * 1000;

/** What this till keeps of the other tills: their recent sales and their daily totals. */
export type SharedHistory = { sales: SaleRecord[]; rollups: Record<string, Totals>; at?: string };

export const emptySharedHistory = (): SharedHistory => ({ sales: [], rollups: {} });

/** True when a decoded row looks like a whole sale record, so a bad or half-written row never reaches the tools. */
function looksLikeSale(v: unknown): v is SaleRecord {
  const x = v as SaleRecord;
  return !!x && typeof x.uuid === 'string' && (x.type === 'sale' || x.type === 'refund') && typeof x.ts === 'string'
    && typeof x.registerId === 'string' && Array.isArray(x.lines) && Array.isArray(x.tenders);
}

/** The full sale a pos_sale row carries, or null when the row has no `sale_json` (a sale made before this patch). */
export function decodeSaleRow(f: Record<string, string>): SaleRecord | null {
  if (!f?.sale_json) return null;
  try { const v: unknown = JSON.parse(f.sale_json); return looksLikeSale(v) ? v : null; } catch { return null; }
}

const byNewest = (list: SaleRecord[]): SaleRecord[] => [...list].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));

/** Another till's sales, newest first and never this till's own (its own live copy is the one it keeps). */
export function sharedSalesOnly(remote: SaleRecord[], ownRegisterId: string): SaleRecord[] {
  const seen = new Set<string>(); const out: SaleRecord[] = [];
  for (const r of remote) {
    if (r.registerId === ownRegisterId || seen.has(r.uuid)) continue;
    seen.add(r.uuid); out.push(r);
  }
  return byNewest(out).slice(0, MAX_SHARED_SALES);
}

/** This till's sales and the shared ones as one list, newest first, no uuid twice (this till's own copy wins). */
export function allSales(local: SaleRecord[], shared: SaleRecord[]): SaleRecord[] {
  const seen = new Set<string>(); const out: SaleRecord[] = [];
  for (const r of [...local, ...shared]) { if (seen.has(r.uuid)) continue; seen.add(r.uuid); out.push(r); }
  return byNewest(out);
}

/** Adds the other tills' daily totals to the shared cache. This till's own keys are left to its local copy. */
export function mergeSharedRollups(cur: Record<string, Totals>, remote: RollupRow[], ownRegisterId: string): Record<string, Totals> {
  const out = { ...cur };
  for (const r of remote) { if (r.registerId && r.registerId !== ownRegisterId) out[`${r.registerId}|${r.date}`] = r.totals; }
  return out;
}

/** The shared cache after a pull: the new sales folded in, the daily totals merged, and the pull time recorded. */
export function afterPull(cur: SharedHistory, remoteSales: SaleRecord[], remoteRollups: RollupRow[], ownRegisterId: string, now: string): SharedHistory {
  return { sales: sharedSalesOnly([...remoteSales, ...cur.sales], ownRegisterId), rollups: mergeSharedRollups(cur.rollups, remoteRollups, ownRegisterId), at: now };
}
