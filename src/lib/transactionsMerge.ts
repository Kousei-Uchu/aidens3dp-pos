// Location: src/lib/transactionsMerge.ts
// The Transactions tab lists this register's own sales and, now, the other registers' sales that the shop-wide pull holds
// (pos.shared.sales, filled by pullSalesHistory). A sale is listed once: this register's own copy wins, and a shared row that
// is this register's own, or one whose uuid is already listed, is dropped. Pure, so tests/transactionsmerge.test.ts covers it.
import type { SaleRecord } from './types';

export function mergeSales(own: SaleRecord[], shared: SaleRecord[] | undefined, ownRegisterId: string): SaleRecord[] {
  const seen = new Set(own.map(s => s.uuid));
  const out = [...own];
  for (const s of shared ?? []) {
    if (!s || !s.uuid || seen.has(s.uuid) || (ownRegisterId && s.registerId === ownRegisterId)) continue;
    seen.add(s.uuid); out.push(s);
  }
  return out;
}

/** The register's name for a sale made on another register, or '' for this register's own (and for a sale with no name). */
export const otherRegisterName = (s: SaleRecord, ownRegisterId: string): string =>
  ownRegisterId && s.registerId && s.registerId !== ownRegisterId ? (s.registerName || 'Another register') : '';
