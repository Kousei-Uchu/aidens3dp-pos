// Location: tests/cloudkitbackend.test.ts
// CloudKit sync plan, patch 4: customer PII must never reach CloudKit, and a sale's private parts are never written plain.
// Only the Shopify customer id as an opaque reference may remain. These used to read the backend's source for the strip;
// the strip now lives in saleRecords.ts (tests/salerecords.test.ts covers it in full), so these check what the backend sends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { saleWriteFromFields, saleRowFields, SALE_SECURE_FIELD } from '../src/lib/saleRecords';

const rowFields = (): Record<string, string | number> => ({
  sale_uuid: 'u-1', register_id: 'r', ts: '2026-10-31T03:00:00.000Z', entry_type: 'sale', total_cents: 500, customer_gid: 'gid://shopify/Customer/9',
  receipt_link: 'https://receipts.example/s/xyz', tenders_json: JSON.stringify([{ k: 'card', a: 500, r: 'ext-ref-1' }]), customer_json: '{"name":"Jane"}', customer: 'Jane',
});

test('a row with no whole sale loses its customer, receipt link and card reference, and keeps the rest', () => {
  const { plain, encrypted } = saleWriteFromFields(rowFields(), 'encrypted');
  assert.deepEqual(encrypted, {});
  for (const k of ['customer', 'customer_json', 'receipt_link']) assert.equal(k in plain, false, k);
  assert.equal(plain.customer_gid, 'gid://shopify/Customer/9');
  assert.equal(plain.total_cents, 500);
  assert.deepEqual(JSON.parse(String(plain.tenders_json)), [{ k: 'card', a: 500 }]);
});
test('an unreadable sale_json is dropped rather than sent as it is', () => {
  const { plain } = saleWriteFromFields({ ...rowFields(), sale_json: '{not json' });
  assert.equal('sale_json' in plain, false);
});
test('a row cannot smuggle an encrypted field in as a plain one', () => {
  const { plain } = saleWriteFromFields({ ...rowFields(), [SALE_SECURE_FIELD]: '{"v":1}' }, 'encrypted');
  assert.equal(SALE_SECURE_FIELD in plain, false);
});
test('reading a record back never prints the encrypted object as a field', () => {
  const f = saleRowFields({ recordName: 'sale-u-1', total_cents: 500, encrypted: { [SALE_SECURE_FIELD]: '{"v":1}' } });
  assert.equal(f.total_cents, '500');
  assert.equal('encrypted' in f, false);
  assert.equal(SALE_SECURE_FIELD in f, false);
});

test('the backend sends sales through the sale record helpers, defaults to omit, and reports detail as ready', () => {
  const src = readFileSync('src/lib/cloudkit/cloudkitBackend.ts', 'utf8');
  assert.match(src, /saleWriteFromFields\(fields, cardMode\)/);
  assert.match(src, /ck\.putSale\(h, plain, encrypted\)/);
  assert.match(src, /let cardMode: CardMode = 'omit'/);
  assert.match(src, /async detailReady\(\)/);
  assert.ok(src.includes('customers live in Shopify'));
  assert.ok(src.includes('opaque reference'));
});
