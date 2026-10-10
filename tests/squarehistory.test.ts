// Location: tests/squarehistory.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { convertAll, customTitle, type SqContext, type SqOrder } from '../src/lib/squareConvert';
import { addToRollups, buildLinkIndex, buildManifest, canonicalName, finishRollups, isManifestUrl, linkSale, linkedStats, packMonths, parseManifest, safeName, unpackJson } from '../src/lib/squareHistory';
import { derived, emptyTotals, sumRange } from '../src/lib/rollup';
import type { Variant } from '../src/lib/types';

const M = (amount: number) => ({ amount, currency: 'AUD' });
const ctx: SqContext = {
  catalogue: { variations: {
    V1: { sku: 'DRG-S', item: 'Dragon', variation: 'Small', category: 'Dragons' },
    V2: { sku: 'OLD-1', item: 'Retired Thing', variation: 'Regular', category: 'Misc' },
    V3: { item: 'No SKU Item', variation: 'Big' },
  } },
  customers: { C1: { name: 'Sam Smith', email: 's@x.com' } }, locations: { L1: 'Market' },
};
const orders: SqOrder[] = [
  { id: 'ORDERAAAAAA', locationId: 'L1', state: 'COMPLETED', createdAt: '2025-03-01T01:00:00Z', closedAt: '2025-03-01T01:02:00Z', customerId: 'C1',
    lineItems: [
      { uid: 'a', catalogObjectId: 'V1', name: 'Dragon', variationName: 'Small', quantity: '2', basePriceMoney: M(1000), grossSalesMoney: M(2000), totalDiscountMoney: M(200), appliedDiscounts: [{ discountUid: 'd1' }] },
      { uid: 'b', catalogObjectId: 'V3', name: 'No SKU Item', variationName: 'Big', quantity: '1', note: 'blue', basePriceMoney: M(500), grossSalesMoney: M(500), totalDiscountMoney: M(0) },
      { uid: 'c', name: 'Custom Amount', quantity: '1', basePriceMoney: M(300), grossSalesMoney: M(300), totalDiscountMoney: M(0) },
      { uid: 'd', name: 'Gift Card', quantity: '1', itemType: 'GIFT_CARD', basePriceMoney: M(5000), grossSalesMoney: M(5000), totalDiscountMoney: M(0) },
    ],
    discounts: [{ uid: 'd1', name: '10% off', appliedMoney: M(200) }],
    tenders: [{ id: 'T1', type: 'CARD', createdAt: '2025-03-01T01:02:00Z', amountMoney: M(5700), tipMoney: M(200), processingFeeMoney: M(90), cardDetails: { card: { cardBrand: 'VISA', last4: '1234' }, entryMethod: 'CONTACTLESS' } },
      { id: 'T2', type: 'CASH', amountMoney: M(1000), cashDetails: { buyerTenderedMoney: M(2000), changeBackMoney: M(1000) } }], totalTipMoney: M(200) },
  // itemised refund order (own order with `returns`) + the same refund listed on the original order
  { id: 'RETURNBBBBB', locationId: 'L1', state: 'COMPLETED', createdAt: '2025-03-05T01:00:00Z', closedAt: '2025-03-05T01:01:00Z',
    returns: [{ sourceOrderId: 'ORDERAAAAAA', returnLineItems: [{ catalogObjectId: 'V1', name: 'Dragon', variationName: 'Small', quantity: '1', basePriceMoney: M(1000), grossReturnMoney: M(1000), totalDiscountMoney: M(100) }] }],
    refunds: [{ id: 'R1', tenderId: 'T1', amountMoney: M(900), status: 'COMPLETED', createdAt: '2025-03-05T01:01:00Z' }] },
  { id: 'ORDERCCCCCC', locationId: 'L1', state: 'COMPLETED', createdAt: '2025-04-02T01:00:00Z', lineItems: [{ catalogObjectId: 'V2', name: 'Retired Thing', variationName: 'Regular', quantity: '1', basePriceMoney: M(800), grossSalesMoney: M(800), totalDiscountMoney: M(0) }],
    tenders: [{ id: 'T3', type: 'OTHER', amountMoney: M(800) }],
    refunds: [{ id: 'R1', tenderId: 'T1', amountMoney: M(900), status: 'COMPLETED' }, { id: 'R2', tenderId: 'T3', amountMoney: M(300), status: 'COMPLETED', reason: 'goodwill' }, { id: 'R3', amountMoney: M(50), status: 'FAILED' }] },
  { id: 'CANCELLEDDDD', locationId: 'L1', state: 'CANCELED', createdAt: '2025-04-03T01:00:00Z', lineItems: [{ name: 'x', quantity: '1', grossSalesMoney: M(100) }] },
];
const all = convertAll(orders, ctx);

test('custom title format: Item - Variation - Notes, default "Regular" not repeated', () => {
  assert.equal(customTitle('Dragon', 'Small', 'blue'), 'Dragon - Small - blue');
  assert.equal(customTitle('Dragon', 'Regular'), 'Dragon');
  assert.equal(customTitle('Dragon', '', 'blue'), 'Dragon - blue');
});

test('sale conversion: lines, discounts, tip, tenders, fee, customer', () => {
  const s = all.find(x => x.uuid === 'sq:ORDERAAAAAA')!;
  assert.equal(s.type, 'sale'); assert.equal(s.itemsCents, 7800); assert.equal(s.discountCents, 200); assert.equal(s.netCents, 7600); assert.equal(s.tipCents, 200); assert.equal(s.totalCents, 7800);
  assert.deepEqual(s.lines[0].discountLabels, ['10% off']); assert.equal(s.lines[0].sq?.sku, 'DRG-S'); assert.equal(s.lines[0].baseUnitCents, 1000);
  assert.equal(s.lines[1].title, 'No SKU Item - Big - blue'); assert.equal(s.lines[2].title, 'Custom Amount'); assert.equal(s.lines[3].kind, 'gift_card');
  assert.equal(s.tenders[0].kind, 'card'); assert.equal(s.tenders[0].amountCents, 5500); assert.equal(s.tenders[0].feeCents, 90); assert.equal(s.tenders[0].card?.scheme, 'VISA'); assert.equal(s.tenders[0].card?.cardMedia, 'NFC');
  assert.equal(s.tenders[1].kind, 'cash'); assert.equal(s.tenders[1].tenderedCents, 2000); assert.equal(s.tenders[1].changeCents, 1000); assert.equal(s.feesCents, 90);
  assert.equal(s.customer?.name, 'Sam Smith'); assert.equal(s.registerId, 'square'); assert.equal(s.registerName, 'Square – Market'); assert.equal(s.deals[0].cents, 200);
});

test('refunds: itemised return counted once; amount-only refund kept; failed + cancelled skipped', () => {
  const refunds = all.filter(x => x.type === 'refund');
  assert.equal(refunds.length, 2);
  const ret = refunds.find(r => r.uuid === 'sq:RETURNBBBBB:return')!; assert.equal(ret.refundOf, 'sq:ORDERAAAAAA'); assert.equal(ret.netCents, 900); assert.equal(ret.tenders[0].kind, 'card'); assert.equal(ret.tenders[0].amountCents, 900);
  const amt = refunds.find(r => r.uuid.endsWith(':refund:R2'))!; assert.equal(amt.netCents, 300); assert.equal(amt.reason, 'goodwill'); assert.equal(amt.tenders[0].kind, 'exchange_credit');
  assert.ok(!all.some(x => x.uuid.includes('R1') || x.uuid.includes('R3') || x.uuid.includes('CANCELLED')));
  assert.deepEqual(all.map(x => x.ts), [...all.map(x => x.ts)].sort());
});

const v = (id: number, sku: string | undefined, cost: number, productId = id): Variant => ({ id: `gid://shopify/ProductVariant/${id}`, productId: `gid://shopify/Product/${productId}`, productTitle: `Shopify ${id}`, variantTitle: 'Small', sku, priceCents: 1000, costCents: cost, tracked: true, stock: 1, tags: [], active: true });
const variants = { a: v(1, ' drg-s ', 400), b: v(2, undefined, 0) };
const collections = [{ id: 'c1', title: 'Dragon Collection', image: undefined, productIds: ['gid://shopify/Product/1'] }];

test('linking: SKU (case/space-insensitive) → Shopify variant with cost + collection; others stay custom with Square category', () => {
  const s = linkSale(all.find(x => x.uuid === 'sq:ORDERAAAAAA')!, buildLinkIndex(variants, collections));
  assert.equal(s.lines[0].kind, 'item'); assert.equal(s.lines[0].variantId, 'gid://shopify/ProductVariant/1'); assert.equal(s.lines[0].title, 'Shopify 1'); assert.equal(s.lines[0].variantTitle, 'Small');
  assert.equal(s.lines[0].costCents, 800); assert.deepEqual(s.lines[0].collectionTitles, ['Dragon Collection']);
  assert.equal(s.lines[1].kind, 'custom'); assert.equal(s.lines[1].variantId, undefined); assert.equal(s.lines[1].title, 'No SKU Item - Big - blue');
  assert.equal(s.lines[3].kind, 'gift_card'); assert.equal(s.cogsCents, 800);
  assert.deepEqual(linkedStats([s]), { linked: 1, total: 3 });
  const other = linkSale(all.find(x => x.uuid === 'sq:ORDERCCCCCC')!, buildLinkIndex(variants, collections)); assert.deepEqual(other.lines[0].collectionTitles, ['Misc']);
});

test('linking never changes the Shopify catalogue objects it reads', () => {
  const before = JSON.stringify([variants, collections]); linkSale(all[0], buildLinkIndex(variants, collections)); assert.equal(JSON.stringify([variants, collections]), before);
});

test('rollups: reports maths match the imported records (sales, discounts, refunds, gift cards, fees, tips)', () => {
  const idx = buildLinkIndex(variants, collections); const linked = all.map(s => linkSale(s, idx));
  const r = finishRollups(addToRollups({}, linked));
  const days = Object.keys(r).sort(); assert.ok(days.every(k => k.startsWith('square|')));
  const rows = Object.entries(r).map(([k, t]) => ({ registerId: 'square', date: k.split('|')[1], totals: t }));
  const t = sumRange(rows, { from: '2025-01-01', to: '2025-12-31' }); const d = derived(t);
  assert.equal(t.orders, 2); assert.equal(t.refunds, 2); assert.equal(t.giftCardSalesCents, 5000);
  assert.equal(t.itemsCents, 2000 + 500 + 300 + 800); assert.equal(t.discountsCents, 200); assert.equal(t.returnsCents, 900 + 300);
  assert.equal(d.netSales, 3600 - 200 - 1200); assert.equal(t.tipsCents, 200); assert.equal(t.feesCents, 90);
  assert.equal(t.byCategory['Dragon Collection'].count, 2 - 1); assert.deepEqual(t.applied, []);
  assert.ok(emptyTotals().orders === 0);
});

test('packing: monthly gzip files round-trip and are much smaller than JSON', () => {
  const many = Array.from({ length: 400 }, (_, i) => ({ ...all[0], uuid: `sq:${i}`, ts: `2025-0${1 + (i % 3)}-1${i % 9}T01:00:00Z` }));
  const { files } = packMonths(many); assert.deepEqual(files.map(f => f.name), ['sales-2025-01.json.gz', 'sales-2025-02.json.gz', 'sales-2025-03.json.gz']);
  assert.equal(files.reduce((s, f) => s + f.sales, 0), 400);
  assert.equal(unpackJson<typeof many>(files[0].data).length, files[0].sales);
  assert.ok(files.reduce((s, f) => s + f.data.length, 0) < JSON.stringify(many).length / 8);
  const m = buildManifest(all, packMonths(all).files, ['Market']); assert.equal(m.sales, 2); assert.equal(m.refunds, 2); assert.equal(parseManifest(JSON.stringify(m)).files.length, 2);
});

test('file name + url safety', () => {
  assert.ok(safeName('sales-2025-03.json.gz')); assert.ok(!safeName('../x')); assert.ok(!safeName('a/b')); assert.ok(!safeName('a..b'));
  assert.throws(() => parseManifest(JSON.stringify({ v: 1, files: [{ name: '../../etc' }] })));
  assert.equal(canonicalName('sales-2025-03 2.json.gz'), 'sales-2025-03.json.gz'); assert.equal(canonicalName('manifest 3.json'), 'manifest.json'); assert.equal(canonicalName('photo.png'), null);
  assert.ok(isManifestUrl('http://192.168.1.20:8787/0123456789abcdef/manifest.json')); assert.ok(!isManifestUrl('https://evil.com/x')); assert.ok(!isManifestUrl('http://192.168.1.20:8787/zz/manifest.json'));
});
