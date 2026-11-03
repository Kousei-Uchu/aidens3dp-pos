// Location: src/lib/orderRecovery.ts
// CloudKit sync, item 8 (Q11): if an iPad dies with sales still queued for Shopify, another register finds the sales that have no Shopify
// order and creates it. The rules are here, pure, so they are tested in Node (tests/orderrecovery.test.ts); the job that uses them is
// cloudkit/orderRecoverySync.ts.
// How it fits: with CloudKit on, a sale is written to CloudKit as soon as it is queued (the "early" step in the outbox), before its order
// exists. That record is what another register can find. Creating the order is already safe to repeat (Shopify is searched by the sale's
// tag first), but two registers searching at the same moment could both find nothing, so a register first claims the sale with a
// write-once record. The first claim wins; a claim older than half an hour is treated as abandoned and the next number is tried.
import type { SaleRecord } from './types';

/** A sale is left alone for this long, so the register that took it has time to finish its own queue first. */
export const RECOVERY_MIN_AGE_MS = 15 * 60_000;
/** A claim this old, with the order still missing, means the claimer stopped. */
export const CLAIM_STALE_MS = 30 * 60_000;
/** How many claim numbers a sale gets before it is left for a person. */
export const MAX_CLAIMS = 4;
/** Sales recovered in one run, so one register does not spend a poll creating dozens of orders. */
export const MAX_PER_RUN = 3;
/** How often the job looks, at most. */
export const RECOVERY_EVERY_MS = 10 * 60_000;
/** The newest sales read per run (pages of 100). Older ones than this are not looked at. */
export const READ_PAGES = 5;

export type Who = { id: string; name: string };

/**
 * The sales that look stranded: a sale (not a refund, whose order is made in the refund flow) with no order, older than the minimum age,
 * that is not in this register's own queue (that register is still working on it). Oldest first, so the longest-waiting goes first.
 */
export function strandedSales(sales: SaleRecord[], o: { outboxIds: ReadonlySet<string>; nowMs: number; minAgeMs?: number }): SaleRecord[] {
  const min = o.minAgeMs ?? RECOVERY_MIN_AGE_MS;
  return sales
    .filter(s => s.type === 'sale' && !s.orderGid && !o.outboxIds.has(s.uuid) && Number.isFinite(Date.parse(s.ts)) && o.nowMs - Date.parse(s.ts) >= min)
    .sort((a, b) => a.ts.localeCompare(b.ts));
}

/**
 * Why a stranded sale cannot be finished by another register, or null when it can. A gift card sold or spent on the sale needs its code, and
 * the code is only in iCloud as an encrypted field (decisions item 17), which is off until the two-Apple-ID test passes. Without it another
 * register would create an order but could not create or credit the card, so the sale is left for a person.
 */
export function unrecoverableReason(s: SaleRecord): string | null {
  if (s.lines.some(l => l.kind === 'gift_card' && !l.giftCardCode)) return 'it sold a gift card and the card code is not in iCloud';
  if (s.tenders.some(t => t.kind === 'gift_card' && !t.giftCardCode)) return 'it was paid with a gift card and the card code is not in iCloud';
  return null;
}

/** The claim's handle in the write-once resolution records. `order-` keeps it apart from a payment's `<sale>-<ref>` handle. */
export const claimHandle = (uuid: string, n: number): string => `order-${uuid}-${n}`;

/** The claim's fields, using the resolution record's existing field names so no new field is needed in the CloudKit schema. */
export const claimFields = (me: Who, uuid: string, nowMs: number): Record<string, string> =>
  ({ ref: 'order-claim', saleUuid: uuid, resolvedBy: me.name, resolvedAt: new Date(nowMs).toISOString(), registerId: me.id, registerName: me.name });

/** Whether a claim already in CloudKit blocks this register: someone else's, and not yet stale. */
export function claimBlocks(existing: Record<string, unknown>, me: Who, nowMs: number): boolean {
  if (existing.registerId === me.id) return false;
  const at = Date.parse(String(existing.resolvedAt ?? ''));
  return !Number.isFinite(at) || nowMs - at < CLAIM_STALE_MS;
}

/** The notice raised on the register that created the order. */
export const recoveredNotice = (s: SaleRecord, orderName: string): { title: string; body: string } => ({
  title: 'Created a missing Shopify order',
  body: `${s.registerName || 'Another register'}'s ${new Date(s.ts).toLocaleString()} sale had no Shopify order, so this register created it (${orderName}).`,
});
