// Location: tests/salerecords.test.ts
// CloudKit patch 4 (pure half): a sale as a CloudKit record. Pins the names, that the customer's details and the card and gift
// secrets never appear in a plain field, that the secrets come back when the encrypted field can be read, that the `omit`
// setting leaves them out rather than writing them plain, and that a bad record is skipped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { saleFromParts, saleRecordName, saleToParts, saleUuidFromRecord, SALE_SECURE_FIELD, SECRET_CARD_KEYS } from '../src/lib/saleRecords';
import type { SaleRecord } from '../src/lib/types';

const PAN = 'XXXXXXXXXXXX4242';
const sale = (): SaleRecord => ({
  uuid: 'u-1', type: 'sale', ts: '2026-10-31T03:00:00.000Z', registerId: 'reg-a', registerName: 'Front till', staff: 'Sam',
  customer: { id: 'gid://shopify/Customer/9', name: 'Jane Citizen', email: 'jane@example.com', phone: '0400111222' },
  lines: [
    { variantId: 'v1', title: 'Benchy', qty: 2, baseUnitCents: 500, grossCents: 1000, discountCents: 0, netCents: 1000, costCents: 300, discountLabels: [], kind: 'item' },
    { title: 'Gift card', qty: 1, baseUnitCents: 2500, grossCents: 2500, discountCents: 0, netCents: 2500, costCents: 0, discountLabels: [], kind: 'gift_card', giftCardCode: 'GIFT-SECRET-77', giftRecipient: { email: 'friend@example.com', name: 'Friend', message: 'Happy birthday' } },
  ],
  itemsCents: 3500, discountCents: 0, netCents: 3500, tipCents: 0, totalCents: 3500, cogsCents: 300, feesCents: 40, roundingCents: 0,
  tenders: [
    { id: 't-cash', kind: 'cash', amountCents: 1000, tenderedCents: 1000, changeCents: 0, at: '2026-10-31T03:00:01.000Z' },
    { id: 't-card', kind: 'card', amountCents: 2500, at: '2026-10-31T03:00:02.000Z', feeCents: 40, feeRate: 0.016,
      card: { transactionUuid: 'txn-1', externalReference: 'ext-1', approvalCode: '123456', scheme: 'Visa', panMasked: PAN, last4: '4242', rrn: 'RRN-9', receiptLink: 'https://pay.example/r/abc', responseCode: '00', cardMedia: 'chip', timestampLocal: '31/10 14:00', tipAmount: 0, surchargeAmount: 40 } },
    { id: 't-gift', kind: 'gift_card', amountCents: 0, at: '2026-10-31T03:00:03.000Z', giftCardId: 'gc1', giftCardCode: 'GIFT-TENDER-55' },
  ],
  deals: [], note: 'for the open day', receiptLink: 'https://receipts.example/s/xyz', orderGid: 'gid://shopify/Order/1', orderName: '#1001',
});
const everything = (p: Record<string, unknown>): string => JSON.stringify(p);
const SECRETS = [PAN, '4242', '123456', 'RRN-9', 'https://pay.example/r/abc', 'txn-1', 'ext-1', 'GIFT-SECRET-77', 'GIFT-TENDER-55', 'friend@example.com', 'https://receipts.example/s/xyz'];
const PII = ['Jane Citizen', 'jane@example.com', '0400111222'];

test('record names are deterministic and reversible', () => {
  assert.equal(saleRecordName('u-1'), 'sale-u-1');
  assert.equal(saleUuidFromRecord('sale-u-1'), 'u-1');
  assert.equal(saleUuidFromRecord('sale-'), null);
  assert.equal(saleUuidFromRecord('ledger-u-1'), null);
});
test('the secret card fields are the ones the decisions list', () => {
  assert.deepEqual([...SECRET_CARD_KEYS].sort(), ['approvalCode', 'externalReference', 'last4', 'panMasked', 'responseCode', 'receiptLink', 'rrn', 'transactionUuid'].sort());
});
test('no secret and no customer detail is ever in a plain field, in any mode', () => {
  for (const mode of ['encrypted', 'omit'] as const) {
    const { plain } = saleToParts(sale(), mode);
    const text = everything(plain);
    for (const s of SECRETS) assert.equal(text.includes(s), false, `${mode}: plain fields leak ${s}`);
    for (const s of PII) assert.equal(text.includes(s), false, `${mode}: plain fields leak ${s}`);
  }
});
test('amounts, kind, tendered and change stay plain so reports can add them up', () => {
  const { plain } = saleToParts(sale(), 'encrypted');
  assert.equal(plain.total_cents, 3500); assert.equal(plain.fees_cents, 40); assert.equal(plain.register_name, 'Front till'); assert.equal(plain.employee, 'Sam');
  assert.deepEqual(JSON.parse(String(plain.tenders_json)), [
    { id: 't-cash', k: 'cash', a: 1000, t: 1000, c: 0 }, { id: 't-card', k: 'card', a: 2500 }, { id: 't-gift', k: 'gift_card', a: 0 },
  ]);
  const body = JSON.parse(String(plain.sale_json));
  assert.equal(body.tenders[1].amountCents, 2500);
  assert.equal(body.tenders[1].card.scheme, 'Visa'); // not a secret field, stays plain
  assert.equal(body.tenders[1].card.surchargeAmount, 40);
});
test('only the Shopify customer id remains, and a note is kept as written', () => {
  const { plain } = saleToParts(sale(), 'encrypted');
  assert.equal(plain.customer_gid, 'gid://shopify/Customer/9');
  assert.equal('customer' in JSON.parse(String(plain.sale_json)), false);
  assert.equal(JSON.parse(String(plain.sale_json)).note, 'for the open day');
});
test('encrypted mode puts the secrets in one encrypted field, and nothing else there', () => {
  const { encrypted } = saleToParts(sale(), 'encrypted');
  assert.deepEqual(Object.keys(encrypted), [SALE_SECURE_FIELD]);
  const text = String(encrypted[SALE_SECURE_FIELD]);
  for (const s of SECRETS) assert.ok(text.includes(s), `missing ${s}`);
  for (const s of PII) assert.equal(text.includes(s), false);
  assert.equal(text.includes('"amountCents"'), false);
});
test('omit mode writes no encrypted field and the secrets go nowhere', () => {
  const { plain, encrypted } = saleToParts(sale(), 'omit');
  assert.deepEqual(encrypted, {});
  assert.equal(everything(plain).includes('GIFT-SECRET-77'), false);
  assert.equal(saleToParts(sale()).encrypted[SALE_SECURE_FIELD], undefined); // omit is the default
});
test('the sale round trips with the encrypted field, apart from the customer name', () => {
  const s = sale();
  const { plain, encrypted } = saleToParts(s, 'encrypted');
  const back = saleFromParts(plain, encrypted)!;
  assert.deepEqual(back.customer, { id: 'gid://shopify/Customer/9', name: '' });
  const expected = { ...s, customer: { id: 'gid://shopify/Customer/9', name: '' } };
  assert.deepEqual(back, expected);
});
test('without the encrypted field the sale still reads, minus its secrets', () => {
  const { plain } = saleToParts(sale(), 'encrypted');
  const back = saleFromParts(plain)!;
  assert.equal(back.totalCents, 3500);
  assert.equal(back.tenders[1].card?.panMasked, undefined);
  assert.equal(back.tenders[1].card?.scheme, 'Visa');
  assert.equal(back.tenders[2].giftCardCode, undefined);
  assert.equal(back.lines[1].giftCardCode, undefined);
  assert.equal(back.receiptLink, undefined);
});
test('a sale with no secrets and no customer has no encrypted field and no customer', () => {
  const s: SaleRecord = { ...sale(), customer: undefined, receiptLink: undefined, lines: [sale().lines[0]], tenders: [sale().tenders[0]] };
  const { plain, encrypted } = saleToParts(s, 'encrypted');
  assert.deepEqual(encrypted, {});
  assert.equal('customer_gid' in plain, false);
  assert.equal(saleFromParts(plain, encrypted)!.customer, undefined);
});
test('the sale given is not changed', () => {
  const s = sale(); const before = JSON.stringify(s);
  saleToParts(s, 'encrypted');
  assert.equal(JSON.stringify(s), before);
});
test('a bad record is skipped, not thrown', () => {
  assert.equal(saleFromParts({}), null);
  assert.equal(saleFromParts({ sale_json: 'not json' }), null);
  assert.equal(saleFromParts({ sale_json: '[]' }), null);
  assert.equal(saleFromParts({ sale_json: JSON.stringify({ uuid: 'x' }) }), null);
});
test('an unreadable or wrong-version encrypted field is ignored, the sale still reads', () => {
  const { plain } = saleToParts(sale(), 'encrypted');
  assert.equal(saleFromParts(plain, { [SALE_SECURE_FIELD]: 'garbage' })!.totalCents, 3500);
  assert.equal(saleFromParts(plain, { [SALE_SECURE_FIELD]: JSON.stringify({ v: 2, receiptLink: 'x' }) })!.receiptLink, undefined);
});

// The backend's read and write path, as the native side would hand records back.
import { saleRowFields, saleWriteFromFields } from '../src/lib/saleRecords';
import { decodeSaleRow } from '../src/lib/salesHistory';

test('write then read: the seam gets the whole sale back with the card details, through decodeSaleRow', () => {
  const s = sale();
  const { plain, encrypted } = saleWriteFromFields({ sale_uuid: s.uuid, receipt_link: s.receiptLink, tenders_json: '[{"r":"ext-1"}]', sale_json: JSON.stringify(s) }, 'encrypted');
  const record = { recordName: 'sale-u-1', updatedAt: 1, ...plain, encrypted };
  const back = decodeSaleRow(saleRowFields(record))!;
  assert.equal(back.tenders[1].card?.panMasked, PAN);
  assert.equal(back.tenders[2].giftCardCode, 'GIFT-TENDER-55');
  assert.equal(back.receiptLink, 'https://receipts.example/s/xyz');
  assert.equal(back.customer?.id, 'gid://shopify/Customer/9');
  assert.equal(back.customer?.name, '');
});
test('write then read in omit mode: the sale reads, with no card details anywhere', () => {
  const s = sale();
  const { plain, encrypted } = saleWriteFromFields({ sale_json: JSON.stringify(s) }, 'omit');
  const row = saleRowFields({ recordName: 'sale-u-1', ...plain, encrypted });
  const text = JSON.stringify(row);
  for (const x of SECRETS) assert.equal(text.includes(x), false, `leaks ${x}`);
  assert.equal(decodeSaleRow(row)!.totalCents, 3500);
});

test('a row with no whole sale writes its amounts as numbers, not text (0233)', () => {
  const { plain } = saleWriteFromFields({ sale_uuid: 'u-9', total_cents: '1250', cogs_cents: '400', rounding_cents: '-5', order_name: '1001', employee: 'Sam' }, 'omit');
  assert.equal(plain.total_cents, 1250);
  assert.equal(plain.cogs_cents, 400);
  assert.equal(plain.rounding_cents, -5);
  assert.equal(plain.order_name, '1001');
  assert.equal(plain.sale_uuid, 'u-9');
});
