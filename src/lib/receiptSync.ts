// Location: src/lib/receiptSync.ts
// Uploads receipt snapshots to the receipt server. Idempotent (PUT overwrites), so retries and the "final" upload (adds the Shopify order number) are safe.
import { useApp } from '../state/store';
import { ShopifyNetworkError, getReceiptSecret } from './shopify/client';
import { buildReceiptDoc, receiptId, receiptUrl } from './receiptDoc';
import { uid } from './ids';
import type { SaleRecord } from './types';

export class ReceiptConfigError extends Error { constructor(m: string) { super(m); this.name = 'ReceiptConfigError'; } }
export const receiptsEnabled = () => !!useApp.getState().settings.receipt.serverUrl.trim();
const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } };

export async function uploadReceipt(sale: SaleRecord): Promise<string> {
  const s = useApp.getState().settings; const base = s.receipt.serverUrl.trim();
  if (!base) throw new ReceiptConfigError('Receipt server URL is not set (Settings ▸ Receipts).');
  const secret = await getReceiptSecret();
  if (!secret) throw new ReceiptConfigError('Receipt server secret is not set (Settings ▸ Receipts).');
  const doc = buildReceiptDoc(sale, s.receipt, { shopName: s.shopName, tz: tz() });
  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/+$/, '')}/api/r/${doc.id}`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` }, body: JSON.stringify(doc) });
  } catch (e: any) { throw new ShopifyNetworkError(`Receipt server unreachable: ${e?.message ?? e}`); }
  if (res.status >= 500) throw new ShopifyNetworkError(`Receipt server error ${res.status}`);
  if (!res.ok) throw new ReceiptConfigError(`Receipt server rejected the receipt (${res.status}). Check the URL and secret in Settings ▸ Receipts.`);
  return receiptUrl(base, doc.id);
}

/** Settings ▸ Receipts ▸ Send test receipt: uploads a made-up $11 sale so you can see the page. */
export async function uploadSampleReceipt(): Promise<string> {
  const now = new Date().toISOString();
  const sale = { uuid: `sample-${uid()}`, type: 'sale', ts: now, registerId: 'x', registerName: 'Register 1', staff: 'Test', lines: [{ title: 'Sample item', variantTitle: 'Blue', qty: 1, baseUnitCents: 1100, grossCents: 1100, discountCents: 0, netCents: 1100, costCents: 0, discountLabels: [], kind: 'item' }],
    itemsCents: 1100, discountCents: 0, netCents: 1100, tipCents: 0, totalCents: 1100, cogsCents: 0, feesCents: 0, roundingCents: 0, deals: [], orderName: '#TEST',
    tenders: [{ id: 't', kind: 'card', amountCents: 1100, at: now, card: { scheme: 'Visa', panMasked: '************1234', approvalCode: '123456', rrn: '000000000001', transactionUuid: 'abcd1234-0000', externalReference: 'sample', timestampLocal: now, receiptLink: undefined } }] } as unknown as SaleRecord;
  return uploadReceipt(sale);
}
export { receiptId };
