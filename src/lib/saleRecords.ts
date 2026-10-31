// Location: src/lib/saleRecords.ts
// CloudKit sync, patch 4 (pure half): how one finished sale is laid out as a CloudKit record.
// A sale becomes plain fields (amounts, who, when, the sale itself without its private parts) and, when the switch allows it,
// one encrypted field `secure_json` holding what must not sit readable in iCloud: the card details of each card tender
// (masked number, last four, approval code, retrieval reference, receipt link, response code, transaction references), gift
// card codes and recipients, and the sale's receipt link. Amounts, kind, tendered and change stay plain so reports can add
// them up (decisions item 17, Q6). The customer is never written: only the Shopify customer id stays, as `customer_gid`
// (plan section 7, 20 October). No React, no store, no native module, so it is tested on its own (tests/salerecords.test.ts).
// Decisions: dev_docs/CLOUDKIT_SYNC_DECISIONS.md items 17, 18, Q6, O4.
import type { CardInfo, GiftRecipient, SaleRecord } from './types';
import { looksLikeSale } from './salesHistory';

export const saleRecordName = (uuid: string): string => `sale-${uuid}`;
export const saleUuidFromRecord = (name: string): string | null => (name.startsWith('sale-') && name.length > 5 ? name.slice(5) : null);

/** The one encrypted field a sale record carries. */
export const SALE_SECURE_FIELD = 'secure_json';

/**
 * What to do with the private parts of a sale.
 * - `encrypted`: write them in `secure_json` as a CloudKit encrypted field.
 * - `omit`: leave them out altogether. They are never written as plain fields. This is the safe setting until the
 *   two-Apple-ID encryption test (decisions O4) has shown a participant on another Apple ID can read encrypted fields.
 */
export type CardMode = 'encrypted' | 'omit';

type Fields = Record<string, string | number>;
export type SaleParts = { plain: Fields; encrypted: Fields };

/** The card fields that are encrypted. Everything else on a card (scheme, media, local time, tip, surcharge) stays plain. */
export const SECRET_CARD_KEYS = ['panMasked', 'last4', 'approvalCode', 'rrn', 'receiptLink', 'responseCode', 'transactionUuid', 'externalReference'] as const;
type SecretCardKey = (typeof SECRET_CARD_KEYS)[number];

/** The private parts, keyed so they can be put back on the right tender or line. `v` is the layout version. */
type Secure = {
  v: 1;
  cards?: Record<string, Partial<Pick<CardInfo, SecretCardKey>>>; // by tender id
  gifts?: Record<string, string>; // gift card code by tender id
  lines?: Record<string, { giftCardCode?: string; giftRecipient?: GiftRecipient }>; // by line position
  receiptLink?: string;
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const put = (f: Fields, k: string, v: string | number | undefined | null): void => { if (v !== undefined && v !== null && v !== '') f[k] = v; };

/**
 * Splits a sale into what CloudKit holds plainly and what it holds encrypted. The sale passed in is not changed.
 * The plain `sale_json` is the whole sale minus its private parts and minus the customer, so a register that cannot read
 * the encrypted field still shows the sale, only without the card details.
 */
export function saleToParts(sale: SaleRecord, mode: CardMode = 'omit'): SaleParts {
  const body = clone(sale) as SaleRecord & { customer?: unknown };
  const secure: Secure = { v: 1 };

  delete body.customer; // the customer lives in Shopify; only the id goes into customer_gid below
  if (body.receiptLink) { secure.receiptLink = body.receiptLink; delete body.receiptLink; }

  for (const t of body.tenders ?? []) {
    if (t.card) {
      const secret: Partial<Pick<CardInfo, SecretCardKey>> = {};
      for (const k of SECRET_CARD_KEYS) { if (t.card[k] !== undefined && t.card[k] !== '') secret[k] = t.card[k]; delete t.card[k]; }
      if (Object.keys(secret).length) (secure.cards ??= {})[t.id] = secret;
      if (!Object.keys(t.card).length) delete t.card;
    }
    if (t.giftCardCode) { (secure.gifts ??= {})[t.id] = t.giftCardCode; delete t.giftCardCode; }
  }
  (body.lines ?? []).forEach((l, i) => {
    const p: { giftCardCode?: string; giftRecipient?: GiftRecipient } = {};
    if (l.giftCardCode) p.giftCardCode = l.giftCardCode;
    if (l.giftRecipient) p.giftRecipient = l.giftRecipient;
    if (Object.keys(p).length) (secure.lines ??= {})[String(i)] = p;
    delete l.giftCardCode; delete l.giftRecipient;
  });

  const plain: Fields = {};
  put(plain, 'sale_uuid', sale.uuid); put(plain, 'entry_type', sale.type); put(plain, 'refund_of', sale.refundOf); put(plain, 'ts', sale.ts);
  put(plain, 'register_id', sale.registerId); put(plain, 'register_name', sale.registerName); put(plain, 'employee', sale.staff);
  put(plain, 'order_gid', sale.orderGid); put(plain, 'order_name', sale.orderName); put(plain, 'customer_gid', sale.customer?.id);
  put(plain, 'items_cents', sale.itemsCents); put(plain, 'discounts_cents', sale.discountCents); put(plain, 'net_cents', sale.netCents);
  put(plain, 'tip_cents', sale.tipCents); put(plain, 'total_cents', sale.totalCents); put(plain, 'cogs_cents', sale.cogsCents);
  put(plain, 'fees_cents', sale.feesCents); put(plain, 'rounding_cents', sale.roundingCents); plain.status = 'complete';
  // Kind, amount, tendered and change in the clear, so a report can add the cash and the card up. No references here.
  plain.tenders_json = JSON.stringify((sale.tenders ?? []).map(t => ({ id: t.id, k: t.kind, a: t.amountCents, t: t.tenderedCents, c: t.changeCents })));
  plain.lines_json = JSON.stringify((sale.lines ?? []).map(l => ({ v: l.variantId, q: l.qty, n: l.netCents })));
  plain.sale_json = JSON.stringify(body);

  const hasSecure = !!(secure.cards || secure.gifts || secure.lines || secure.receiptLink);
  const encrypted: Fields = mode === 'encrypted' && hasSecure ? { [SALE_SECURE_FIELD]: JSON.stringify(secure) } : {};
  return { plain, encrypted };
}

const parseObject = (s: unknown): Record<string, unknown> | null => {
  if (typeof s !== 'string' || !s) return null;
  try { const v: unknown = JSON.parse(s); return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null; } catch { return null; }
};

/**
 * The sale a record holds, with its private parts put back when the encrypted field could be read. Null for a record that
 * is not a readable sale, so one bad record cannot break a list. A customer comes back as the Shopify id with no name:
 * the till resolves the name from its own Shopify cache, as the shop-wide sales view already does.
 */
export function saleFromParts(plain: Record<string, unknown>, encrypted?: Record<string, unknown>): SaleRecord | null {
  const body = parseObject(plain?.sale_json);
  if (!body || !looksLikeSale(body)) return null;
  const sale = body as SaleRecord;
  const gid = plain.customer_gid;
  if (typeof gid === 'string' && gid) sale.customer = { id: gid, name: '' };

  const secure = parseObject(encrypted?.[SALE_SECURE_FIELD]) as Secure | null;
  if (secure && secure.v === 1) {
    if (typeof secure.receiptLink === 'string') sale.receiptLink = secure.receiptLink;
    for (const t of sale.tenders) {
      const c = secure.cards?.[t.id];
      if (c && typeof c === 'object') t.card = { ...(t.card ?? {}), ...c };
      const g = secure.gifts?.[t.id];
      if (typeof g === 'string' && g) t.giftCardCode = g;
    }
    sale.lines.forEach((l, i) => {
      const p = secure.lines?.[String(i)];
      if (!p || typeof p !== 'object') return;
      if (typeof p.giftCardCode === 'string' && p.giftCardCode) l.giftCardCode = p.giftCardCode;
      if (p.giftRecipient && typeof p.giftRecipient.email === 'string') l.giftRecipient = p.giftRecipient;
    });
  }
  return sale;
}
