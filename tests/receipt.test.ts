// Location: tests/receipt.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReceiptDoc, defaultReceiptProfile, gstIncluded, receiptId, receiptNumber, receiptUrl } from '../src/lib/receiptDoc';
import { parseReceipt, ID_RE } from '../receipt-server/src/validate';
import { renderReceipt, titleFor } from '../receipt-server/src/render';
import type { SaleRecord } from '../src/lib/types';

const line = (o: any = {}) => ({ title: 'Widget', variantTitle: 'Blue', qty: 2, baseUnitCents: 5500, grossCents: 11000, discountCents: 0, netCents: 11000, costCents: 0, discountLabels: [], kind: 'item', ...o });
const sale = (o: any = {}): SaleRecord => ({ uuid: 'uuid-1', type: 'sale', ts: '2026-10-08T03:00:00.000Z', registerId: 'r', registerName: 'Register 1', staff: 'Aiden', lines: [line()], itemsCents: 11000, discountCents: 0,
  netCents: 11000, tipCents: 0, totalCents: 11000, cogsCents: 0, feesCents: 0, roundingCents: 0, deals: [], orderName: '#1001',
  tenders: [{ id: 't', kind: 'card', amountCents: 11000, at: 'x', card: { scheme: 'Visa', panMasked: '411111******1111', approvalCode: 'A1', rrn: 'R9', transactionUuid: 'abcdef12-3456', externalReference: 'ref1', timestampLocal: '8 Oct 2026 14:00', receiptLink: 'https://zeller.example/r/1' } }], ...o } as any);
const profile = { ...defaultReceiptProfile(), serverUrl: 'https://r.example.dev/', name: 'Aiden 3D', abn: '12 345 678 901', gstRegistered: true };

test('receipt id is deterministic, hex, unguessable length', () => {
  assert.equal(receiptId('uuid-1'), receiptId('uuid-1')); assert.notEqual(receiptId('uuid-1'), receiptId('uuid-2'));
  assert.ok(ID_RE.test(receiptId('uuid-1'))); assert.match(receiptNumber(receiptId('uuid-1')), /^R-[A-F0-9]{8}$/);
  assert.equal(receiptUrl('https://r.example.dev/', 'abc'), 'https://r.example.dev/r/abc');
});
test('GST is 1/11 of GST-inclusive taxable lines; gift cards excluded; off when not registered', () => {
  assert.equal(gstIncluded([{ netCents: 11000, kind: 'item' }], true), 1000);
  assert.equal(gstIncluded([{ netCents: 11000, kind: 'item' }, { netCents: 5000, kind: 'gift_card' }], true), 1000);
  assert.equal(gstIncluded([{ netCents: 11000, kind: 'item' }], false), 0);
});
test('receipt doc merges order lines with Zeller card details and balances', () => {
  const d = buildReceiptDoc(sale(), profile, { tz: 'Australia/Sydney' });
  assert.equal(d.order, '#1001'); assert.equal(d.totalCents, 11000); assert.equal(d.gstCents, 1000); assert.equal(d.seller.abn, '12 345 678 901');
  const p = d.payments[0]; assert.equal(p.label, 'Visa •••• 1111'); assert.equal(p.card?.approval, 'A1'); assert.equal(p.card?.txn, 'abcdef12'); assert.equal(p.card?.link, 'https://zeller.example/r/1');
  assert.equal(d.payments.reduce((s, x) => s + x.amountCents, 0), d.totalCents);
  assert.equal(titleFor(d), 'Tax invoice');
});
test('cash rounding is included in the total and in the cash payment', () => {
  const d = buildReceiptDoc(sale({ totalCents: 1098, netCents: 1098, roundingCents: 2, lines: [line({ qty: 1, baseUnitCents: 1098, grossCents: 1098, netCents: 1098 })], tenders: [{ id: 't', kind: 'cash', amountCents: 1098, roundingCents: 2, tenderedCents: 2000, changeCents: 900, at: 'x' }] }), { ...profile, gstRegistered: false });
  assert.equal(d.totalCents, 1100); assert.equal(d.payments[0].amountCents, 1100); assert.equal(d.gstCents, 0); assert.equal(titleFor(d), 'Receipt');
});
test('refund doc is titled as adjustment note / refund receipt', () => {
  const r = buildReceiptDoc(sale({ type: 'refund', reason: 'Faulty' }), profile); assert.equal(r.kind, 'refund'); assert.equal(r.refundOf, '#1001'); assert.equal(titleFor(r), 'Adjustment note (refund)');
  assert.equal(titleFor(buildReceiptDoc(sale({ type: 'refund' }), { ...profile, gstRegistered: false })), 'Refund receipt');
});
test('server validation accepts a built doc and rejects tampering', () => {
  const d = buildReceiptDoc(sale(), profile); assert.ok(parseReceipt(JSON.parse(JSON.stringify(d)), d.id));
  assert.equal(parseReceipt({ ...d, id: 'a'.repeat(20) }, d.id), null); assert.equal(parseReceipt({ ...d, v: 2 }, d.id), null); assert.equal(parseReceipt({ ...d, lines: 'x' }, d.id), null);
  const bad = parseReceipt({ ...d, payments: [{ ...d.payments[0], card: { link: 'javascript:alert(1)' } }] }, d.id); assert.equal(bad?.payments[0].card?.link, undefined);
});
test('rendered page escapes hostile text and embeds JSON safely', () => {
  const d = buildReceiptDoc(sale({ lines: [line({ title: '<script>alert(1)</script>', discountLabels: ['"><img src=x>'] })] }), { ...profile, name: '<b>Evil</b>' });
  const html = renderReceipt(parseReceipt(JSON.parse(JSON.stringify(d)), d.id)!, 'NONCE');
  assert.ok(!html.includes('<script>alert(1)</script>')); assert.ok(!html.includes('<b>Evil</b>')); assert.ok(!html.includes('"><img'));
  assert.ok(html.includes('TAX INVOICE') && html.includes('ABN 12 345 678 901') && html.includes('Original card receipt') && html.includes('Includes GST of') === false || html.includes('includes GST of'));
  assert.equal((html.match(/<script/g) ?? []).length, 2);
});
