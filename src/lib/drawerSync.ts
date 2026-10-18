// Location: src/lib/drawerSync.ts
// 0168: the cash drawer is one physical drawer for the shop, so its state is shared between registers. This is the
// pure half of that sync: folding in the ledger entries another register wrote, without losing ours. The upload and
// download live in src/lib/sync.ts; this file has no React, no store and no network, so it is tested on its own.
import { applyEntry, cleanCounts, entryTotal, MAX_ENTRIES, type CashLedger, type LedgerEntry } from './cashLedger';
import type { Shift } from '../state/store';

/** What a register shares about the drawer: the shift (open/closed, float, paid in and out) and the ledger. */
export type SharedDrawer = { shift: Shift; ledger: CashLedger };

/** Entries `remote` holds that `local` does not, oldest first, so they can be applied in the order they happened. */
export function missingEntries(local: LedgerEntry[], remote: LedgerEntry[]): LedgerEntry[] {
  const have = new Set(local.map(e => e.id));
  // Once our history is full the oldest entries are trimmed off. A remote copy that is behind may still hold them, and
  // they must not look new (they are already inside our counts), so at capacity only entries newer than our oldest count.
  const floor = local.length >= MAX_ENTRIES ? local.reduce((m, e) => (e.ts < m ? e.ts : m), local[0].ts) : '';
  return remote.filter(e => e && typeof e.id === 'string' && e.id && typeof e.ts === 'string' && !have.has(e.id) && e.ts >= floor).sort((a, b) => a.ts.localeCompare(b.ts));
}

/**
 * Our ledger with another register's entries folded in. The counts move by the deltas of the entries we had not seen
 * (a cash sale on the other register moved the same shared drawer), and the history becomes the two lists merged by
 * id, newest first, capped like the local ledger. Our own counts are the starting point, so nothing we recorded twice.
 *
 * Counts are a running total, not a replay of the history: an entry that sets the drawer (open, close, correct
 * contents) is stored as the change it made at the time. Folding in a remote "set the drawer" entry therefore moves
 * our total by that change rather than replacing it, which is right for the everyday entries (sales, change, refunds,
 * paid in and out) and the best we can do for two registers that set the drawer at once. Entries are never dropped.
 */
export function mergeDrawer(local: CashLedger, remote: CashLedger): CashLedger {
  const added = missingEntries(local.entries, remote.entries);
  let counts = local.counts;
  for (const e of added) counts = applyEntry({ counts, entries: [] }, e).counts;
  const byId = new Map<string, LedgerEntry>();
  for (const e of [...local.entries, ...added]) if (!byId.has(e.id)) byId.set(e.id, e);
  const entries = Array.from(byId.values()).sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, MAX_ENTRIES);
  return { counts: cleanCounts(counts), entries };
}

/**
 * Net cash from sales and refunds since the drawer opened, from EVERY register. Other registers' sales never reach this
 * register's sales list, but their cash moves are in the shared ledger, so expected cash is read from there: every entry
 * tied to a sale (cash received, change given, cash refund, a cancelled part-sale) counts, in physical cash.
 */
export function ledgerCashSince(ledger: CashLedger, sinceISO: string): number {
  return ledger.entries.filter(e => e.saleUuid && e.ts >= sinceISO).reduce((sum, e) => sum + entryTotal(e), 0);
}
