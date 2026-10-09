// Location: tests/sale.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSale, cashTender, cashChips, cardTender, remainingDue } from '../src/lib/saleBuilder';
import { priceCart } from '../src/lib/pricing';
import { exchangeSummary, planRefund, refundableByGateway, returnValue } from '../src/lib/returns';
import { contribution, derived, emptyTotals, applyRecord, merge, periodRange, previousRange, lastYearRange, sumRange, pctChange } from '../src/lib/rollup';
import { salesRow, linesRows, eventRow, SALES_HEADER, q } from '../src/lib/csvFormat';
import { decodeTender, encodeTender } from '../src/lib/saleCodec';
import { buildOrderInput, mapOrder } from '../src/lib/shopify/orderModel';
import { DEFAULT_FEES } from '../src/lib/fees';
import type { Cart, SaleRecord, Variant } from '../src/lib/types';

const v = (n: number, cents: number, cost?: number): Variant => ({ id: `gid://shopify/ProductVariant/${n}`, productId: `gid://shopify/Product/${n}`, productTitle: `Item ${n}`, variantTitle: '', priceCents: cents, costCents: cost, tracked: true, stock: 3, tags: [], active: true });
const v1 = v(1, 1000, 400), v2 = v(2, 333, 100);
const variants = { [v1.id]: v1, [v2.id]: v2 };
const mkCart = (): Cart => ({ id: 'c', lines: [
  { id: 'l1', kind: 'item', variantId: v1.id, title: v1.productTitle, qty: 3, unitCents: 1000 },
  { id: 'l2', kind: 'item', variantId: v2.id, title: v2.productTitle, qty: 2, unitCents: 333 },
], discount: { kind: 'pct', value: 10, label: '10% off' } });
const priced = () => priceCart(mkCart(), { variants, collectionsOfProduct: {}, autoDiscounts: [], bundles: null });

test('cash tender: exact, rounding down/up, change, part payment', () => {
  const r1 = cashTender(1997, 2000, true); // 7c rounds down to 5c → due 1995
  assert.equal(r1.settles, true); assert.equal(r1.tender.amountCents, 1997); assert.equal(r1.tender.roundingCents, -2); assert.equal(r1.tender.changeCents, 5);
  const r2 = cashTender(1998, 2000, true); assert.equal(r2.tender.roundingCents, 2); assert.equal(r2.tender.changeCents, 0);
  const r3 = cashTender(2001, 2100, true); // due 2000 → change 100, rounding −1
  assert.equal(r3.tender.roundingCents, -1); assert.equal(r3.tender.changeCents, 100); assert.equal(r3.tender.amountCents, 2001);
  const r4 = cashTender(2001, 1000, true); assert.equal(r4.settles, false); assert.equal(r4.tender.amountCents, 1000);
  const r5 = cashTender(2001, 2001, false); assert.equal(r5.tender.roundingCents, 0);
  assert.deepEqual(cashChips(1997).slice(0, 2), [2000, 5000]);
});

test('buildSale totals, COGS, fees and rounding add up', () => {
  const p = priced();
  const net = p.netCents; // 3666 − 10%
  assert.equal(p.itemsCents, 3666); assert.equal(net, 3666 - Math.round(3666 * 0.1) || net);
  const card = cardTender({ amount: 2000, $type: 'Approved', externalReference: 'U-1', approvalCode: 'AP', cardMedia: 'NFC', scheme: 'VISA', panMasked: '1234', receiptLink: 'https://r/1' }, 2000, DEFAULT_FEES);
  const cash = cashTender(net - 2000, net - 2000 + 100, true).tender;
  const sale = buildSale({ uuid: 'U', cart: mkCart(), priced: p, variants, titles: {}, tenders: [card, cash], registerId: 'R1', registerName: 'iPad', staff: 'Sam', ts: '2026-10-07T01:00:00.000Z' });
  assert.equal(sale.cogsCents, 3 * 400 + 2 * 100);
  assert.equal(sale.feesCents, 28); // 1.4% of 20.00
  assert.equal(sale.tenders.reduce((s, t) => s + t.amountCents, 0), sale.netCents);
  assert.equal(sale.receiptLink, 'https://r/1');
  assert.equal(remainingDue(sale.netCents, sale.tenders), 0);
  assert.equal(remainingDue(sale.netCents, [card]), sale.netCents - 2000);
});

test('returns: exchange summary, refund planning, refundable per gateway', () => {
  assert.deepEqual(exchangeSummary(2000, 2000), { mode: 'even', amountCents: 0 });
  assert.deepEqual(exchangeSummary(2000, 2500), { mode: 'charge', amountCents: 500 });
  assert.deepEqual(exchangeSummary(2000, 1500), { mode: 'refund', amountCents: 500 });
  assert.equal(returnValue([{ qty: 2, unitPaidCents: 450 }, { qty: 1, unitPaidCents: 100 }]), 1000);
  const refundable = refundableByGateway([
    { kind: 'SALE', status: 'SUCCESS', gateway: 'Zeller', amountCents: 3000 }, { kind: 'SALE', status: 'SUCCESS', gateway: 'Cash', amountCents: 1000 },
    { kind: 'REFUND', status: 'SUCCESS', gateway: 'Zeller', amountCents: 500 }, { kind: 'SALE', status: 'FAILURE', gateway: 'Zeller', amountCents: 999 },
  ]);
  assert.deepEqual(refundable, { card: 2500, cash: 1000, gift_card: 0 });
  assert.deepEqual(planRefund(3000, 'original', refundable), { plan: { card: 2500, cash: 500 }, shortBy: 0 });
  assert.deepEqual(planRefund(4000, 'original', refundable).shortBy, 500);
  assert.deepEqual(planRefund(700, 'cash', refundable).plan, { cash: 700 });
  assert.deepEqual(planRefund(700, 'gift_card', refundable).plan, { gift_card: 700 });
});

function sampleSale(): SaleRecord {
  const p = priced();
  return buildSale({ uuid: 'S1', cart: mkCart(), priced: p, variants, titles: { [v1.productId]: ['Dragons'] },
    tenders: [{ id: 't1', kind: 'card', amountCents: p.netCents, feeCents: 46, card: { externalReference: 'S1-1' }, at: '2026-10-07T01:00:00Z' }], registerId: 'R1', registerName: 'iPad', ts: '2026-10-07T01:00:00.000Z' });
}

test('rollup: sale, then partial refund; formulas keep COGS separate', () => {
  const sale = sampleSale();
  const t1 = applyRecord(emptyTotals(), sale);
  assert.equal(applyRecord(t1, sale), t1); // idempotent
  const d1 = derived(t1);
  assert.equal(d1.grossSales, 3666); assert.equal(d1.discounts, sale.discountCents); assert.equal(d1.netSales, 3666 - sale.discountCents);
  assert.equal(d1.cogs, 1400); assert.equal(d1.grossProfit, d1.netSales - 1400); assert.equal(d1.netAfterFees, d1.totalCollected - 46);
  assert.equal(t1.byCategory['Dragons'].count, 3); assert.equal(t1.byCategory['Uncategorised'].count, 2);

  // refund 1× item 1 (paid 900 after 10% off), restocked → COGS comes back
  const refund: SaleRecord = {
    ...sale, uuid: 'R1', type: 'refund', refundOf: 'S1',
    lines: [{ ...sale.lines[0], qty: 1, grossCents: 1000, discountCents: 100, netCents: 900, costCents: 400 }],
    tenders: [{ id: 'x', kind: 'card', amountCents: 900, at: '' }], feesCents: 0, roundingCents: 0, cogsCents: 400,
  };
  const t2 = applyRecord(t1, refund);
  const d2 = derived(t2);
  assert.equal(t2.returnsCents, 900); assert.equal(t2.refunds, 1); assert.equal(t2.cogsCents, 1000);
  assert.equal(d2.netSales, d1.netSales - 900);
  assert.equal(t2.otherRefundsCents, 0);
  assert.equal(t2.byCategory['Dragons'].count, 2);
  assert.equal(merge(t1, emptyTotals()).orders, 1);
});

test('periods and comparisons', () => {
  const anchor = new Date(2026, 9, 7); // 7 Oct 2026
  assert.deepEqual(periodRange('1D', anchor), { from: '2026-10-07', to: '2026-10-07' });
  assert.deepEqual(periodRange('1W', anchor), { from: '2026-10-01', to: '2026-10-07' });
  assert.deepEqual(previousRange(periodRange('1W', anchor)), { from: '2026-09-24', to: '2026-09-30' });
  assert.deepEqual(lastYearRange(periodRange('1W', anchor)), { from: '2025-10-01', to: '2025-10-07' });
  const t = applyRecord(emptyTotals(), sampleSale());
  const rows = [{ registerId: 'R1', date: '2026-10-07', totals: t }, { registerId: 'R2', date: '2026-10-07', totals: t }, { registerId: 'R1', date: '2026-09-01', totals: t }];
  assert.equal(sumRange(rows, periodRange('1D', anchor)).orders, 2);
  assert.equal(sumRange(rows, periodRange('1D', anchor), 'R2').orders, 1);
  assert.equal(pctChange(150, 100), 50); assert.equal(pctChange(5, 0), null); assert.equal(pctChange(0, 0), 0);
});

test('csv rows quote properly and keep columns aligned', () => {
  assert.equal(q('a,"b"'), '"a,""b"""');
  const row = salesRow(sampleSale());
  assert.equal(row.trim().split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).length, SALES_HEADER.length);
  assert.equal(linesRows(sampleSale()).trim().split('\n').length, 2);
  assert.ok(eventRow({ kind: 'declined', amountCents: 500, code: '51', message: 'Insufficient, funds' }).includes('"Insufficient, funds"'));
});

test('tender codec round-trips and stays under 255 chars', () => {
  const t = { id: 'x', kind: 'card' as const, amountCents: 1234, feeCents: 17, at: '', card: { externalReference: 'uuid-1-1', transactionUuid: 'abcd-efgh-ijkl', approvalCode: '123456', scheme: 'EFTPOS', panMasked: '4242', cardMedia: 'NFC', receiptLink: 'https://sdk.myzeller.com/receipt/abcdefghijklmnop' } };
  const s = encodeTender(t);
  assert.ok(s.length < 255, String(s.length));
  const back = decodeTender(s)!;
  assert.equal(back.kind, 'card'); assert.equal(back.amountCents, 1234); assert.equal(back.card?.externalReference, 'uuid-1-1'); assert.equal(back.card?.receiptLink, t.card.receiptLink);
  const g = decodeTender(encodeTender({ id: 'g', kind: 'gift_card', amountCents: 500, at: '', giftCardId: 'gid://shopify/GiftCard/1', giftCardCode: 'ABCD1234EFGH5678' }))!;
  assert.equal(g.giftCardCode, '••••5678'); assert.equal(g.giftCardId, 'gid://shopify/GiftCard/1');
});

test('orderCreate input: totals reconcile, discounts baked in, tags/attrs/tenders present', () => {
  const sale = sampleSale();
  sale.tenders = [
    { id: 'a', kind: 'card', amountCents: 2000, card: { externalReference: 'S1-1', approvalCode: 'AP1', transactionUuid: 'tu', scheme: 'VISA', receiptLink: 'https://r' }, at: '2026-10-07T01:00:00Z' },
    { id: 'b', kind: 'cash', amountCents: sale.netCents - 2000, roundingCents: 1, tenderedCents: sale.netCents - 2000, at: '2026-10-07T01:00:00Z' },
  ];
  const { order, options } = buildOrderInput(sale, { markFulfilled: true, locationId: 'gid://shopify/Location/1' });
  const lineTotal = order.lineItems.reduce((s: number, l: any) => s + l.quantity * Math.round(parseFloat(l.priceSet.shopMoney.amount) * 100), 0);
  const txTotal = order.transactions.reduce((s: number, t: any) => s + Math.round(parseFloat(t.amountSet.shopMoney.amount) * 100), 0);
  assert.equal(lineTotal, sale.netCents); assert.equal(txTotal, sale.netCents);
  assert.deepEqual(order.transactions.map((t: any) => t.gateway), ['Zeller', 'Cash']);
  assert.equal(order.transactions[0].authorizationCode, 'AP1');
  assert.ok(JSON.parse(order.transactions[0].receiptJson).receiptLink);
  assert.ok(order.tags.includes('pos-S1') && order.tags.every((t: string) => t.length <= 40)); assert.equal(order.sourceName, 'custom-pos'); assert.equal(order.financialStatus, 'PAID');
  assert.equal(order.fulfillment.locationId, 'gid://shopify/Location/1');
  assert.equal(options.inventoryBehaviour, 'DECREMENT_IGNORING_POLICY'); assert.equal(options.sendReceipt, false);
  const keys = order.customAttributes.map((a: any) => a.key);
  assert.ok(keys.includes('pos_sale_uuid') && keys.includes('pos_tender_1') && keys.includes('pos_tender_2') && keys.includes('pos_rounding_cents'));
  assert.ok(order.customAttributes.every((a: any) => a.value.length <= 255));
  assert.equal(order.lineItems.every((l: any) => l.taxable === false && l.requiresShipping === false), true);
  assert.ok(order.lineItems[0].properties.some((p: any) => p.name === '_pos_discount'));
});

test('mapOrder reads tenders and line detail back', () => {
  const sale = sampleSale();
  const { order } = buildOrderInput(sale, { markFulfilled: false });
  const gql = {
    id: 'gid://shopify/Order/1', name: '#1001', createdAt: sale.ts, displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'FULFILLED', note: null, tags: order.tags,
    totalPriceSet: { shopMoney: { amount: '33.00' } }, totalRefundedSet: { shopMoney: { amount: '0.00' } }, customer: null,
    customAttributes: order.customAttributes,
    lineItems: { nodes: order.lineItems.map((l: any, i: number) => ({ id: `li${i}`, title: 'X', variantTitle: null, quantity: l.quantity, refundableQuantity: l.quantity, variant: { id: l.variantId }, originalUnitPriceSet: l.priceSet, discountedUnitPriceSet: l.priceSet, customAttributes: (l.properties ?? []).map((p: any) => ({ key: p.name, value: p.value })) })) },
    transactions: order.transactions.map((t: any, i: number) => ({ id: `t${i}`, kind: t.kind, status: t.status, gateway: t.gateway, amountSet: t.amountSet })),
  };
  const o = mapOrder(gql);
  assert.equal(o.saleUuid, 'S1'); assert.equal(o.tenders[0].kind, 'card'); assert.equal(o.tenders[0].card?.externalReference, 'S1-1');
  assert.equal(o.lines[0].originalUnitCents, 1000); assert.equal(o.lines[0].costCents > 0 || o.lines[0].costCents === 0, true);
  assert.equal(o.transactions[0].gateway, 'Zeller');
});

import { parseGrid, defaultGrid, addPage, addTile, moveTile, removeTile, serialiseGrid } from '../src/lib/grid';
test('grid.json parse/round-trip/edit helpers', () => {
  const g = defaultGrid();
  const rt = parseGrid(serialiseGrid(g)); assert.equal(rt.dropped, 0); assert.equal(rt.grid.pages[0].tiles.length, g.pages[0].tiles.length);
  const bad = parseGrid({ version: 1, pages: [{ id: 'a', name: 'X', tiles: [{ type: 'action', action: 'nope' }, { type: 'category', collectionId: 'c1' }, { type: 'group', name: 'G', tiles: [{ type: 'item', variantId: 'v' }] }] }] });
  assert.equal(bad.dropped, 1); assert.equal(bad.grid.pages[0].tiles.length, 2);
  assert.throws(() => parseGrid({ version: 2, pages: [] }));
  let e = addPage(g, 'Two'); e = addTile(e, e.pages[1].id, { type: 'category', collectionId: 'a' }); e = addTile(e, e.pages[1].id, { type: 'category', collectionId: 'b' });
  e = moveTile(e, e.pages[1].id, 1, 0); assert.equal((e.pages[1].tiles[0] as any).collectionId, 'b');
  e = removeTile(e, e.pages[1].id, 0); assert.equal(e.pages[1].tiles.length, 1);
});

import * as cart from '../src/lib/cartOps';
test('cart ops: consolidate, no-discount tag, merge, barcode zero handling', () => {
  const a = { ...v(1, 1000), barcode: '012345678905' }; const nd = { ...v(2, 500), tags: ['No-Discount'], barcode: '4006381333931' };
  let c = cart.addVariant(cart.emptyCart(), a); c = cart.addVariant(c, a); assert.equal(c.lines.length, 1); assert.equal(c.lines[0].qty, 2);
  c = cart.addVariant(c, a, 1, false); assert.equal(c.lines.length, 2);
  c = cart.addVariant(c, nd); assert.equal(c.lines[2].noDiscount, true);
  c = cart.setQty(c, c.lines[1].id, 0); assert.equal(c.lines.length, 2);
  const m = cart.mergeCarts(c, cart.addVariant(cart.emptyCart(), a, 3)); assert.equal(m.lines[0].qty, 5);
  assert.equal(cart.itemCount(m), 6);
  const vs = [a, nd];
  assert.equal(cart.findByBarcode(vs, '0012345678905')?.id, a.id); assert.equal(cart.findByBarcode(vs, '12345678905')?.id, a.id);
  assert.equal(cart.findByBarcode(vs, '04006381333931')?.id, nd.id); assert.equal(cart.findByBarcode(vs, '999'), undefined);
});

import { hashPin, newSalt, verifyPin } from '../src/lib/pin';
import { splitAcrossCards } from '../src/lib/returns';
test('pin hashing and card refund split', async () => {
  const salt = newSalt(); const h = await hashPin(salt, '1234');
  assert.equal(await verifyPin(salt, '1234', h), true); assert.equal(await verifyPin(salt, '1235', h), false); assert.notEqual(await hashPin(newSalt(), '1234'), h);
  const t = (id: string, a: number) => ({ id, kind: 'card' as const, amountCents: a, at: '' });
  const parts = splitAcrossCards(1500, [t('a', 1000), t('b', 1000)]);
  assert.deepEqual(parts.map(p => p.cents), [1000, 500]); assert.equal(splitAcrossCards(0, [t('a', 5)]).length, 0);
});

import { signedPassUrl } from '../src/lib/passUrl';
import { verifyPassRequest, verifyShopifyWebhook, safeEqual } from '../pass-server/src/verify';
test('pass links: app signs, Worker verifies (expiry, tamper, wrong secret); webhook HMAC', async () => {
  const now = Date.now(); const u = new URL(signedPassUrl('https://p.example.dev/', 'topsecret', 'abcd-1234 efgh-5678', now));
  const code = u.searchParams.get('code')!, ts = u.searchParams.get('ts')!, sig = u.searchParams.get('sig')!;
  assert.equal(code, 'ABCD1234EFGH5678');
  assert.equal(await verifyPassRequest('topsecret', code, ts, sig, now), true);
  assert.equal(await verifyPassRequest('topsecret', code, ts, sig, now + 6 * 60_000), false); // expired
  assert.equal(await verifyPassRequest('topsecret', code, ts, sig, now - 120_000), false); // from the future
  assert.equal(await verifyPassRequest('topsecret', 'OTHERCODE', ts, sig, now), false); // tampered code
  assert.equal(await verifyPassRequest('wrong', code, ts, sig, now), false);
  assert.equal(await verifyPassRequest('', code, ts, sig, now), false);
  assert.equal(await verifyPassRequest('topsecret', code, ts, 'zz', now), false);
  const body = new TextEncoder().encode('{"last_characters":"5678"}'); const good = require('crypto').createHmac('sha256', 'whsec').update(body).digest('base64');
  assert.equal(await verifyShopifyWebhook('whsec', body, good), true); assert.equal(await verifyShopifyWebhook('whsec', body, 'AAAA'), false); assert.equal(await verifyShopifyWebhook('whsec', body, null), false);
  assert.equal(safeEqual('abc', 'abc'), true); assert.equal(safeEqual('abc', 'abd'), false); assert.equal(safeEqual('abc', 'abcd'), false);
});
