// Location: tests/assistantdata.test.ts
// The assistant's shop data tools (patch 0163, patch 7 in the plan): the queries, the field maps through the data gate, and the rules
// that make them read-only. Dates are built from local time, the way the till reads them, so the tests do not depend on the time zone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyGate, resolvePolicy, type GatePolicy } from '../src/lib/assistantGate';
import { ASSISTANT_TOOLS, makeToolSet, runToolCall, toolDefs, type AssistantTool } from '../src/lib/assistantTools';
import { DATA_TOOLS } from '../src/lib/assistantDataTools';
import { buildSystemPrompt } from '../src/lib/assistantChat';
import { cleanDay, findCustomers, findOrders, giftCardActivity, listDeals, localRollupRows, orderRef, rangeFor, resolveRange, salesReport, words, type AssistantData } from '../src/lib/assistantData';
import { applyRecord, emptyTotals, rollupKey, type RollupRow } from '../src/lib/rollup';
import type { AutoDiscount, BundleConfig, SaleLine, SaleRecord, Variant } from '../src/lib/types';

const at = (d: number, h = 12, m = 0, mon = 9) => new Date(2026, mon, d, h, m).toISOString(); // October 2026 unless a month is given
const NOW = new Date(2026, 9, 18, 15, 0).getTime(); // Sunday 18 October 2026

const line = (title: string, qty: number, gross: number, disc: number, cost: number, over: Partial<SaleLine> = {}): SaleLine =>
  ({ title, qty, baseUnitCents: Math.round(gross / qty), grossCents: gross, discountCents: disc, netCents: gross - disc, costCents: cost, discountLabels: [], kind: 'item', ...over });
const sale = (over: Partial<SaleRecord>): SaleRecord => ({
  uuid: 'u-0000', type: 'sale', ts: at(18), registerId: 'reg1', registerName: 'Front', lines: [], itemsCents: 0, discountCents: 0, netCents: 0, tipCents: 0, totalCents: 0, cogsCents: 0, feesCents: 0, roundingCents: 0, tenders: [], deals: [], ...over,
});
const JO = { id: 'c1', name: 'Jo Smith', email: 'jo@example.com', phone: '0412 345 678' };

const S1 = sale({
  uuid: 'aaaa1111-1', orderName: '#1042', ts: at(18, 10, 15), staff: 'Maya Chen', customer: JO,
  lines: [line('Highland Cow', 2, 2400, 200, 800, { variantTitle: 'Red' }), line('Tadling', 3, 900, 0, 300)],
  itemsCents: 3300, discountCents: 200, netCents: 3100, totalCents: 3100, cogsCents: 1100,
  tenders: [{ id: 't1', kind: 'card', amountCents: 3100, card: { last4: '4242', scheme: 'visa', approvalCode: 'A1B2C3' }, at: at(18, 10, 15) }],
  deals: [{ type: 'bundle', label: '2 cows', cents: 200 }],
  adjustments: [{ kind: 'item', title: 'Tadling', detail: '', cents: 50, reason: 'Called 0412 345 678 to confirm' }],
  note: 'Customer jo@example.com collects Friday',
});
const S2 = sale({
  uuid: 'bbbb2222-2', orderName: '#1043', ts: at(18, 11, 30), staff: 'Maya Chen',
  lines: [line('Gift card', 1, 5000, 0, 0, { kind: 'gift_card', giftCardCode: 'GC-ABCD-1234-WXYZ', giftRecipient: { email: 'amy@example.com', name: 'Amy Lee' } })],
  netCents: 5000, totalCents: 5000, tenders: [{ id: 't2', kind: 'cash', amountCents: 5000, tenderedCents: 5000, at: at(18, 11, 30) }],
});
const R1 = sale({
  uuid: 'cccc3333-3', orderName: '#1045', type: 'refund', refundOf: S1.uuid, ts: at(18, 13), staff: 'Maya Chen', customer: JO, reason: 'Wrong colour',
  lines: [line('Highland Cow', 1, 1200, 100, 400, { variantTitle: 'Red' })], netCents: 1100, totalCents: 1100, tenders: [{ id: 't3', kind: 'card', amountCents: 1100, at: at(18, 13) }],
});
const S3 = sale({
  uuid: 'dddd4444-4', orderName: '#1044', ts: at(17, 14), staff: 'Sam Ito',
  lines: [line('Tadling', 5, 1500, 0, 500)], itemsCents: 1500, netCents: 1500, totalCents: 1500, cogsCents: 500,
  tenders: [{ id: 't4', kind: 'gift_card', amountCents: 1500, giftCardCode: 'GC-ABCD-1234-WXYZ', at: at(17, 14) }],
});
const S4 = sale({ uuid: 'eeee5555-5', orderName: '#1001', ts: at(20, 9, 0, 8), staff: 'Sam Ito', lines: [line('Plain Mug', 1, 2000, 0, 900)], itemsCents: 2000, netCents: 2000, totalCents: 2000, cogsCents: 900, tenders: [{ id: 't5', kind: 'cash', amountCents: 2000, at: at(20, 9, 0, 8) }] });
const SALES = [R1, S2, S1, S3, S4];

const rollupsOf = (sales: SaleRecord[]): RollupRow[] => {
  const m: Record<string, ReturnType<typeof emptyTotals>> = {};
  for (const s of sales) { const k = rollupKey(s.registerId, s.ts); m[k] = applyRecord(m[k] ?? emptyTotals(), s); }
  return localRollupRows(m, [], []);
};

const variant = (id: string, productId: string, productTitle: string, variantTitle = ''): Variant => ({ id, productId, productTitle, variantTitle, priceCents: 1200, tracked: true, stock: 5, tags: [], active: true });
const VARIANTS: Record<string, Variant> = { v1: variant('v1', 'p1', 'Highland Cow', 'Red'), v2: variant('v2', 'p1', 'Highland Cow', 'Blue'), v3: variant('v3', 'p2', 'Tadling') };
const BUNDLES: BundleConfig = { version: 1, items: { cows: ['p1'], tads: ['v3'] }, discounts: [
  { id: 'd1', label: 'Cow and Tadling', sets: ['cows', 'tads'], price_delta_cents: -300, mode: 'delta', max_per_cart: 2 },
  { id: 'd2', label: 'Tadling trio', sets: ['tads', 'tads', 'tads'], price_delta_cents: 0, mode: 'percent', percent: 10 },
  { id: 'd3', label: 'Winter special', sets: ['cows'], price_delta_cents: 900, mode: 'fixed_price', ends_at: at(1, 12, 0, 8) },
  { id: 'd4', label: 'Switched off', sets: ['cows'], price_delta_cents: -100, enabled: false },
] };
const AUTOS: AutoDiscount[] = [
  { id: 'a1', title: 'Spring sale', kind: 'basic', pct: 15, target: { productIds: ['p2'] }, startsAt: at(1, 0, 0, 8) },
  { id: 'a2', title: 'Buy 2 cows get 1 half price', kind: 'bxgy', buys: { target: { productIds: ['p1'] }, qty: 2 }, gets: { target: { productIds: ['p1'] }, qty: 1, pct: 50 } },
];
const CUSTOMERS = [JO, { id: 'c2', name: 'Priya Raman', email: 'priya@example.com', phone: '0299 887 766', orders: 4, spentCents: 12050, note: 'Likes the blue cows' }, { id: 'c3', name: 'Joanne Li', orders: 1, spentCents: 900 }];

const data = (over: Partial<AssistantData> = {}): AssistantData => ({
  now: NOW, sales: SALES, rollups: rollupsOf(SALES), customers: CUSTOMERS, autos: AUTOS, presets: [{ id: 'm1', kind: 'pct', value: 10, label: 'Staff 10%' }, { id: 'm2', kind: 'amt', value: 500, label: '$5 off damaged' }],
  bundles: BUNDLES, variants: VARIANTS, collections: [], ...over,
});
const ALL = { personal: true, email: true };
const NONE = { personal: false, email: false };
const LOCAL = resolvePolicy('local'); const REMOTE = resolvePolicy('remote');

// ---------- dates ----------
test('named periods are counted from now, and weeks start on Monday', () => {
  assert.deepEqual(rangeFor('today', NOW), { from: '2026-10-18', to: '2026-10-18' });
  assert.deepEqual(rangeFor('yesterday', NOW), { from: '2026-10-17', to: '2026-10-17' });
  assert.deepEqual(rangeFor('last_7_days', NOW), { from: '2026-10-12', to: '2026-10-18' });
  assert.deepEqual(rangeFor('last_30_days', NOW), { from: '2026-09-19', to: '2026-10-18' });
  assert.deepEqual(rangeFor('this_week', NOW), { from: '2026-10-12', to: '2026-10-18' }, 'Sunday is the last day of the week');
  assert.deepEqual(rangeFor('last_week', NOW), { from: '2026-10-05', to: '2026-10-11' });
  assert.deepEqual(rangeFor('this_month', NOW), { from: '2026-10-01', to: '2026-10-18' });
  assert.deepEqual(rangeFor('last_month', NOW), { from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(rangeFor('this_year', NOW), { from: '2026-01-01', to: '2026-10-18' });
});
test('dates are checked: real days only, from before to, one day alone is that day, and a bad period is refused', () => {
  assert.equal(cleanDay('2026-02-30'), null); assert.equal(cleanDay('18/10/2026'), null); assert.equal(cleanDay('2026-10-18'), '2026-10-18'); assert.equal(cleanDay(5), null);
  assert.deepEqual(resolveRange({ from: '2026-10-01', to: '2026-10-05' }, NOW), { range: { from: '2026-10-01', to: '2026-10-05' } });
  assert.deepEqual(resolveRange({ from: '2026-10-05' }, NOW), { range: { from: '2026-10-05', to: '2026-10-05' } });
  assert.deepEqual(resolveRange({ to: '2026-10-05' }, NOW), { range: { from: '2026-10-05', to: '2026-10-05' } });
  assert.match((resolveRange({ from: '2026-10-09', to: '2026-10-01' }, NOW) as any).error, /after/);
  assert.match((resolveRange({ from: 'last tuesday' }, NOW) as any).error, /real days/);
  assert.match((resolveRange({ period: 'fortnight' }, NOW) as any).error, /Unknown period/);
  assert.deepEqual(resolveRange({}, NOW), { range: null }); assert.deepEqual(resolveRange({}, NOW, 'today'), { range: { from: '2026-10-18', to: '2026-10-18' } });
  assert.deepEqual(resolveRange({ from: '2026-10-01', period: 'today' }, NOW), { range: { from: '2026-10-01', to: '2026-10-01' } }, 'dates win over a period');
});
test('search words are lower case without a trailing s', () => { assert.deepEqual(words('Tadlings, RED cows!'), ['tadling', 'red', 'cow']); assert.deepEqual(words(undefined), []); });

// ---------- sales report ----------
test('sales_report: today is added up the way Reports adds it up, and money is text', () => {
  const r: any = salesReport(data(), { period: 'today' }, true);
  assert.equal(r.from, '2026-10-18'); assert.equal(r.to, '2026-10-18'); assert.equal(r.orders, 2); assert.equal(r.refunds, 1);
  assert.equal(r.gross_sales, '$33.00'); assert.equal(r.discounts, '$2.00'); assert.equal(r.refunded, '$11.00'); assert.equal(r.net_sales, '$20.00'); assert.equal(r.average_sale, '$10.00');
  assert.equal(r.gift_cards_sold, '$50.00'); assert.equal(r.total_collected, '$70.00'); assert.equal(r.cost_of_goods, '$7.00'); assert.equal(r.gross_profit, '$13.00');
  assert.deepEqual([...r.takings].sort((a: any, b: any) => a.method.localeCompare(b.method)), [{ method: 'Card', amount: '$31.00' }, { method: 'Cash', amount: '$50.00' }]);
  assert.deepEqual(r.top_items[0], { name: 'Tadling', sold: 3, sales: '$9.00' }); assert.equal(r.top_items[1].name, 'Highland Cow - Red'); assert.equal(r.top_items[1].sold, 1);
  assert.deepEqual(r.days, [{ date: '2026-10-18', orders: 2, net: '$20.00' }]);
  assert.match(r.note, /this till and any imported Square history/); assert.match(r.note, /not taken off net sales/);
  for (const k of ['gross_sales', 'discounts', 'refunded', 'net_sales', 'average_sale', 'total_collected', 'cost_of_goods', 'gross_profit']) assert.match(r[k], /^-?\$\d+\.\d{2}$/, `${k} is dollars as text`);
});
test('sales_report: a week adds the days, with a line for each day that had sales, and staff when they may be listed', () => {
  const r: any = salesReport(data(), { period: 'last_7_days' }, true);
  assert.equal(r.orders, 3); assert.deepEqual(r.days.map((d: any) => d.date), ['2026-10-17', '2026-10-18']);
  assert.deepEqual(r.staff.map((s: any) => s.name).sort(), ['Maya Chen', 'Sam Ito']);
  assert.equal(r.top_items[0].sold, 8);
  assert.equal((salesReport(data(), { period: 'last_7_days' }, false) as any).staff, undefined, 'staff are left out at the source when names may not be sent');
});
test('sales_report: how many of an item sold, by a word from its name, refunds taken off', () => {
  const r: any = salesReport(data(), { item: 'tadlings', period: 'last_7_days' }, true);
  assert.deepEqual(r.matches, [{ name: 'Tadling', sold: 8, sales: '$24.00' }]); assert.equal(r.total_sold, 8); assert.equal(r.total_sales, '$24.00');
  const cow: any = salesReport(data(), { item: 'cow', period: 'today' }, true); assert.equal(cow.total_sold, 1, 'two sold, one refunded');
  const none: any = salesReport(data(), { item: 'unicorn', period: 'today' }, true); assert.deepEqual(none.matches, []); assert.match(none.note, /No item with that name/);
  assert.match((salesReport(data(), { item: '!!', period: 'today' }, true) as any).error, /item name/);
});
test('sales_report: no sales says so, a long range leaves the daily lines out, and a bad date is an error', () => {
  const empty: any = salesReport(data(), { from: '2026-01-01', to: '2026-01-03' }, true); assert.equal(empty.orders, 0); assert.equal(empty.net_sales, '$0.00'); assert.match(empty.note, /No sales were saved/);
  const year: any = salesReport(data(), { period: 'this_year' }, true); assert.equal(year.days, undefined); assert.match(year.note, /Daily figures are left out/); assert.equal(year.orders, 4);
  assert.ok((salesReport(data(), { from: 'nope' }, true) as any).error);
  assert.equal((salesReport(data(), {}, true) as any).from, '2026-10-18', 'today when nothing is given');
});
test('localRollupRows merges Square history, saved totals and sales still in the outbox, once each', () => {
  const sq: RollupRow = { registerId: 'square', date: '2024-05-01', totals: { ...emptyTotals(), orders: 9, itemsCents: 90000 } };
  const saved = { [rollupKey('reg1', S4.ts)]: applyRecord(emptyTotals(), S4) };
  const rows = localRollupRows(saved, [{ done: { rollup: false }, sale: S1 }, { done: { rollup: true }, sale: S2 }], [sq]);
  assert.equal(rows.length, 3); assert.ok(rows.some(r => r.registerId === 'square')); assert.equal(rows.find(r => r.date === '2026-10-18')!.totals.orders, 1, 'only the outbox sale not yet counted');
});

// ---------- orders ----------
test('find_orders: newest first, by order number with or without the hash, by item words, by date and by type', () => {
  const all: any = findOrders(data(), {}, ALL); assert.equal(all.found, 5); assert.deepEqual(all.orders.map((o: any) => o.order), ['#1045', '#1043', '#1042', '#1044', '#1001']);
  assert.deepEqual((findOrders(data(), { query: '#1042' }, ALL) as any).orders.map((o: any) => o.order), ['#1042']);
  assert.deepEqual((findOrders(data(), { query: '1042' }, ALL) as any).orders.map((o: any) => o.order), ['#1042']);
  assert.deepEqual((findOrders(data(), { query: 'tadlings' }, ALL) as any).orders.map((o: any) => o.order), ['#1042', '#1044']);
  assert.deepEqual((findOrders(data(), { query: 'cow red' }, ALL) as any).orders.map((o: any) => o.order), ['#1045', '#1042']);
  assert.deepEqual((findOrders(data(), { from: '2026-10-17' }, ALL) as any).orders.map((o: any) => o.order), ['#1044']);
  assert.deepEqual((findOrders(data(), { period: 'today', type: 'refund' }, ALL) as any).orders.map((o: any) => o.order), ['#1045']);
  assert.equal((findOrders(data(), { query: 'zzz' }, ALL) as any).found, 0);
  assert.ok((findOrders(data(), { from: 'x' }, ALL) as any).error);
});
test('find_orders: the summary is short, and detail adds items, prices, deals, adjustments, how it was paid and the notes', () => {
  const o: any = (findOrders(data(), { query: '1042' }, ALL) as any).orders[0];
  assert.deepEqual(o.items, [{ name: 'Highland Cow - Red', qty: 2 }, { name: 'Tadling', qty: 3 }]); assert.equal(o.total, '$31.00'); assert.equal(o.discount, '$2.00'); assert.equal(o.paid_with, undefined); assert.equal(o.note, undefined);
  assert.deepEqual(o.customer, { name: 'Jo Smith' }, 'the summary names the customer and nothing more');
  const d: any = (findOrders(data(), { query: '1042', detail: true }, ALL) as any).orders[0];
  assert.deepEqual(d.items[0], { name: 'Highland Cow - Red', qty: 2, paid: '$22.00', discount: '$2.00', cost: '$8.00' });
  assert.deepEqual(d.paid_with, ['Card']); assert.deepEqual(d.deals, [{ label: '2 cows', amount: '$2.00' }]); assert.equal(d.adjustments[0].title, 'Tadling'); assert.equal(d.customer.email, 'jo@example.com'); assert.match(d.note, /collects Friday/);
  assert.equal(JSON.stringify(d).includes('4242'), false, 'card details are never in the result at all'); assert.equal(JSON.stringify(d).includes('A1B2C3'), false);
  const rf: any = (findOrders(data(), { query: '1045', detail: true }, ALL) as any).orders[0]; assert.equal(rf.type, 'refund'); assert.equal(rf.refund_of, '#1042'); assert.equal(rf.reason, 'Wrong colour');
});
test('find_orders: ten rows, or three with detail, and it says how many more there are', () => {
  const many = Array.from({ length: 25 }, (_, i) => sale({ uuid: `m${i}-xxxxxxxx`, orderName: `#2${String(i).padStart(3, '0')}`, ts: at(1 + (i % 17), 9 + (i % 5)), lines: [line('Tadling', 1, 300, 0, 100)], netCents: 300, totalCents: 300 }));
  const r: any = findOrders(data({ sales: many }), {}, ALL); assert.equal(r.orders.length, 10); assert.equal(r.found, 25); assert.match(r.note, /newest 10 of 25/);
  assert.equal((findOrders(data({ sales: many }), { detail: true }, ALL) as any).orders.length, 3);
  assert.equal(orderRef(sale({ uuid: 'abcdef12-3456' })), 'abcdef12', 'an order with no name is called by the start of its id');
});
test('find_orders: a customer is only searched, and a match only possible, where customer details may be sent', () => {
  assert.deepEqual((findOrders(data(), { query: 'jo smith' }, ALL) as any).orders.map((o: any) => o.order), ['#1045', '#1042']);
  assert.equal((findOrders(data(), { query: 'jo smith' }, NONE) as any).found, 0, 'no match, so the model cannot learn who bought what');
  assert.equal((findOrders(data(), { query: 'jo@example.com' }, { personal: false, email: true }) as any).found, 2);
  assert.equal((findOrders(data(), { query: 'jo@example.com' }, { personal: true, email: false }) as any).found, 0);
});

// ---------- deals ----------
test('list_deals: bundles, automatic discounts and manual discounts, each saying what it does and whether it is running', () => {
  const r: any = listDeals(data(), {}); const by = (n: string) => r.deals.find((d: any) => d.name === n);
  assert.equal(r.found, 8);
  assert.equal(by('Cow and Tadling').how, '$3.00 off'); assert.equal(by('Cow and Tadling').limit, '2 per sale'); assert.match(by('Cow and Tadling').applies_to, /cows \(Highland Cow\).*tads \(Tadling\)/);
  assert.equal(by('Tadling trio').how, '10% off the matched items'); assert.equal(by('Winter special').how, 'the matched items together cost $9.00');
  assert.equal(by('Winter special').live, false, 'it ended on 1 September'); assert.equal(by('Winter special').ends, '2026-09-01'); assert.equal(by('Switched off').live, false);
  assert.equal(by('Spring sale').how, '15% off'); assert.equal(by('Spring sale').applies_to, 'Tadling'); assert.equal(by('Spring sale').starts, '2026-09-01'); assert.equal(by('Spring sale').live, true);
  assert.match(by('Buy 2 cows get 1 half price').how, /buy 2 of Highland Cow, get 1 of Highland Cow 50% off/);
  assert.equal(by('Staff 10%').kind, 'manual discount'); assert.equal(by('Staff 10%').how, '10% off, chosen by staff'); assert.equal(by('$5 off damaged').how, '$5.00 off, chosen by staff');
  assert.ok(r.deals.slice(0, 4).every((d: any) => d.live), 'running deals come first'); assert.match(r.note, /Only one discount applies to each item/);
});
test('list_deals: only running deals, a word from the name or what it applies to, and a shop with none', () => {
  assert.equal((listDeals(data(), { only_live: true }) as any).deals.every((d: any) => d.live), true);
  assert.deepEqual((listDeals(data(), { query: 'spring' }) as any).deals.map((d: any) => d.name), ['Spring sale']);
  assert.ok((listDeals(data(), { query: 'tadling' }) as any).deals.length >= 3);
  const none: any = listDeals(data({ bundles: null, autos: [], presets: [] }), {}); assert.equal(none.found, 0); assert.match(none.note, /No deals are set up/);
  assert.equal((listDeals(data(), { query: 'nothing here' }) as any).found, 0);
});

// ---------- customers ----------
test('find_customers: by name, phone digits or email, only what may be sent, with spend as text', () => {
  assert.deepEqual((findCustomers(data(), { query: 'jo' }, ALL) as any).customers.map((c: any) => c.name), ['Jo Smith', 'Joanne Li']);
  const p: any = (findCustomers(data(), { query: '0299 887' }, ALL) as any).customers[0]; assert.equal(p.name, 'Priya Raman'); assert.equal(p.orders, 4); assert.equal(p.spent, '$120.50'); assert.equal(p.note, 'Likes the blue cows');
  assert.equal((findCustomers(data(), { query: 'priya@example.com' }, ALL) as any).customers[0].name, 'Priya Raman');
  assert.equal((findCustomers(data(), { query: '12' }, ALL) as any).found, 0, 'a short number is not a phone search');
  assert.equal((findCustomers(data(), { query: 'joanne' }, { personal: false, email: true }) as any).found, 0, 'names are not searched when they may not be sent');
  assert.equal((findCustomers(data(), { query: 'jo' }, { personal: false, email: true }) as any).found, 1, 'an email may still be searched, and the gate then leaves only the email in the row (tested through the tool below)');
  assert.equal((findCustomers(data(), { query: 'priya@example.com' }, { personal: true, email: false }) as any).found, 0);
  assert.ok((findCustomers(data(), { query: '  ' }, ALL) as any).error);
});

// ---------- gift cards ----------
test('gift_card_activity: cards sold and payments made with a card, newest first, totals added up, and no balance', () => {
  const r: any = giftCardActivity(data(), {}, { code: true, personal: true, email: true });
  assert.equal(r.found, 2); assert.equal(r.total_sold, '$50.00'); assert.equal(r.total_redeemed, '$15.00');
  assert.deepEqual(r.activity.map((e: any) => e.event), ['sold', 'redeemed']); assert.equal(r.activity[0].order, '#1043'); assert.deepEqual(r.activity[0].recipient, { name: 'Amy Lee', email: 'amy@example.com' });
  assert.match(r.note, /remaining balance is not shown/); assert.match(r.note, /Gift cards screen/); assert.equal(JSON.stringify(r).includes('balance":'), false);
  assert.equal((giftCardActivity(data(), { kind: 'sold' }, { code: true, personal: true, email: true }) as any).found, 1);
  assert.equal((giftCardActivity(data(), { kind: 'redeemed', period: 'yesterday' }, { code: true, personal: true, email: true }) as any).found, 1);
  assert.equal((giftCardActivity(data(), { period: 'last_month' }, { code: true, personal: true, email: true }) as any).found, 0);
});
test('gift_card_activity: a code is matched by its last characters, short or switched off is refused, and a recipient is only listed where it may be sent', () => {
  const ok = { code: true, personal: true, email: true };
  assert.equal((giftCardActivity(data(), { code: 'wxyz' }, ok) as any).found, 2); assert.equal((giftCardActivity(data(), { code: 'GC-ABCD-1234-WXYZ' }, ok) as any).found, 2);
  assert.equal((giftCardActivity(data(), { code: 'shopify-giftcard-v1-GCABCD1234WXYZ' }, ok) as any).found, 2); assert.equal((giftCardActivity(data(), { code: 'ZZZZ' }, ok) as any).found, 0);
  assert.match((giftCardActivity(data(), { code: 'XYZ' }, ok) as any).error, /last 4/);
  assert.match((giftCardActivity(data(), { code: 'WXYZ' }, { ...ok, code: false }) as any).error, /privacy rules/);
  assert.equal((giftCardActivity(data(), { kind: 'sold' }, { code: true, personal: false, email: false }) as any).activity[0].recipient, undefined);
});

// ---------- through the tools and the gate ----------
const call = (name: string, args: unknown) => ({ id: 'c1', type: 'function' as const, function: { name, arguments: JSON.stringify(args) } });
const runTool = (name: string, args: unknown, policy: GatePolicy | undefined, d: AssistantData | null = data()) =>
  runToolCall(call(name, args), { tools: ASSISTANT_TOOLS, ctx: { pages: [], role: 'cashier', maxChars: 6000, ...(policy ? { policy } : {}), ...(d ? { data: d } : {}) } });
const text = (r: ReturnType<typeof runTool>) => r.message.content ?? '';
const REALISTIC: Record<string, unknown> = {
  sales_report: { period: 'last_7_days' }, find_orders: { query: '1042', detail: true }, list_deals: {}, find_customers: { query: 'jo' }, gift_card_activity: {},
};

test('every data tool declares a field map, and a realistic result has no field the map does not name', () => {
  assert.deepEqual(DATA_TOOLS.map(t => t.def.function.name), ['sales_report', 'find_orders', 'list_deals', 'find_customers', 'gift_card_activity']);
  for (const t of DATA_TOOLS) {
    assert.ok(typeof t.gate === 'object', `${t.def.function.name} needs a field map`);
    const out = (t as AssistantTool).run(REALISTIC[t.def.function.name] as Record<string, unknown>, { pages: [], role: 'owner', maxChars: 6000, data: data() });
    const g = applyGate(out, t.gate, LOCAL); assert.deepEqual(g.unknown, [], `${t.def.function.name} returned fields the gate does not know: ${g.unknown.join(', ')}`);
  }
  for (const [name, args] of [['sales_report', { item: 'cow' }], ['find_orders', {}], ['gift_card_activity', { code: 'WXYZ' }]] as const) {
    const t = DATA_TOOLS.find(x => x.def.function.name === name)!; const g = applyGate(t.run(args as any, { pages: [], role: 'owner', maxChars: 6000, data: data() }), t.gate, LOCAL); assert.deepEqual(g.unknown, [], name);
  }
});
test('on a local endpoint the model reads names and the last four of a gift card code, and never card or tender details', () => {
  const o = text(runTool('find_orders', { query: '1042', detail: true }, LOCAL));
  assert.match(o, /Jo Smith/); assert.match(o, /jo@example\.com/); assert.doesNotMatch(o, /4242|A1B2C3|visa/i); assert.match(o, /privacy_note/); assert.match(o, /payment details/);
  const g = text(runTool('gift_card_activity', {}, LOCAL)); assert.match(g, /\*\*\*\*WXYZ/); assert.doesNotMatch(g, /ABCD-1234|GC-ABCD/); assert.match(g, /amy@example\.com/);
  assert.match(text(runTool('find_customers', { query: 'priya' }, LOCAL)), /Priya Raman/);
});
test('on a remote endpoint no customer, staff, email, phone, gift code or payment detail reaches the model, in any tool', () => {
  const secret = /Jo Smith|Priya|Amy Lee|Maya Chen|Sam Ito|jo@example|amy@example|priya@|0412|0299|WXYZ|GC-ABCD|visa|4242/;
  for (const [name, args] of Object.entries(REALISTIC)) assert.doesNotMatch(text(runTool(name, args, REMOTE)), secret, name);
  const o: any = JSON.parse(text(runTool('find_orders', { query: '1042', detail: true }, REMOTE)));
  assert.equal(o.orders.length, 1); assert.equal(o.orders[0].customer, undefined); assert.equal(o.orders[0].staff, undefined); assert.equal(o.orders[0].paid_with, undefined);
  assert.match(o.privacy_note, /customer details/); assert.match(o.privacy_note, /payment details/); assert.equal(o.orders[0].total, '$31.00', 'what was sold is still sent');
  assert.doesNotMatch(JSON.stringify(o), /0412|jo@example/, 'a phone number or email a cashier typed into a reason or note is masked');
  assert.match(o.orders[0].adjustments[0].reason, /\[phone number\]/); assert.match(o.orders[0].note, /\[email address\]/);
  const rep: any = JSON.parse(text(runTool('sales_report', { period: 'last_7_days' }, REMOTE))); assert.equal(rep.staff, undefined); assert.equal(rep.net_sales, '$35.00'); assert.ok(rep.top_items.length);
});
test('with no policy given the strictest rules apply to every data tool', () => {
  for (const [name, args] of Object.entries(REALISTIC)) assert.doesNotMatch(text(runTool(name, args, undefined)), /Jo Smith|Maya Chen|Amy Lee|WXYZ|jo@example/, name);
});
test('customer lookup on a remote endpoint returns an empty list and the privacy note, never a row, a count or a name', () => {
  const r: any = JSON.parse(text(runTool('find_customers', { query: 'Jo Smith' }, REMOTE)));
  assert.deepEqual(r.customers, []); assert.equal(r.found, undefined); assert.match(r.privacy_note, /customer details/);
  const same: any = JSON.parse(text(runTool('find_customers', { query: 'zzzz nobody' }, REMOTE))); assert.deepEqual(same, r, 'a customer who exists and one who does not look exactly alike');
  const toggled = resolvePolicy('local', { personal: 'never', email: 'never' }); assert.deepEqual(JSON.parse(text(runTool('find_customers', { query: 'jo' }, toggled))).customers, []);
  const emailOnly = resolvePolicy('remote', { email: 'allow' }); const e: any = JSON.parse(text(runTool('find_customers', { query: 'priya@example.com' }, emailOnly)));
  assert.deepEqual(e.customers, [{ email: 'priya@example.com' }]);
});
test('a toggle can switch off one category and the rest still works', () => {
  const noCost = resolvePolicy('local', { cost: 'never' }); const r: any = JSON.parse(text(runTool('sales_report', { period: 'today' }, noCost)));
  assert.equal(r.cost_of_goods, undefined); assert.equal(r.gross_profit, undefined); assert.equal(r.net_sales, '$20.00'); assert.match(r.privacy_note, /costs and profit/);
  const noShop = resolvePolicy('local', { shop: 'never' }); const d: any = JSON.parse(text(runTool('list_deals', {}, noShop))); assert.deepEqual(d.deals, []); assert.match(d.privacy_note, /shop data/);
  const dtl: any = JSON.parse(text(runTool('find_orders', { query: '1042', detail: true }, noCost))); assert.equal(dtl.orders[0].items[0].cost, undefined); assert.equal(dtl.orders[0].items[0].paid, '$22.00');
});
test('the record shows which categories the result held and what was hidden, as counts', () => {
  const r = runTool('find_orders', { query: '1042', detail: true }, REMOTE);
  assert.ok(r.record.used?.includes('order')); assert.ok(!r.record.used?.includes('personal')); assert.ok((r.record.withheld?.personal ?? 0) >= 2); assert.ok((r.record.withheld?.payment ?? 0) >= 1);
});
test('without a snapshot every data tool says there is no shop data, and a bad argument is an error the model can read', () => {
  for (const t of DATA_TOOLS) { const r = runTool(t.def.function.name, REALISTIC[t.def.function.name], LOCAL, null); assert.match(text(r), /No shop data is available/); assert.equal(r.record.ok, false); }
  const bad = runTool('sales_report', { from: 'soon' }, LOCAL); assert.equal(bad.record.ok, false); assert.match(text(bad), /real days/);
  assert.equal(runTool('find_customers', {}, LOCAL).record.ok, false);
});
test('the tools are read only: they do not change the snapshot, and none is given anything that writes', () => {
  const d = data(); const before = JSON.stringify(d);
  for (const [name, args] of Object.entries(REALISTIC)) for (const p of [LOCAL, REMOTE]) runTool(name, args, p, d);
  assert.equal(JSON.stringify(d), before);
  const frozen = JSON.parse(before) as AssistantData; const deep = (o: any): void => { if (o && typeof o === 'object') { Object.freeze(o); Object.values(o).forEach(deep); } }; deep(frozen);
  for (const [name, args] of Object.entries(REALISTIC)) assert.doesNotThrow(() => runTool(name, args, LOCAL, frozen), name);
  for (const t of DATA_TOOLS) assert.ok(t.run.length <= 2, 'a tool takes its arguments and the context, and nothing else');
});
test('results fit the size limit and stay valid JSON, even when cut', () => {
  const r = runToolCall(call('find_orders', { detail: true }), { tools: ASSISTANT_TOOLS, ctx: { pages: [], role: 'owner', maxChars: 500, policy: LOCAL, data: data() } });
  assert.ok((r.message.content ?? '').length <= 500); assert.doesNotThrow(() => JSON.parse(r.message.content ?? ''));
});
test('the gate drops a row whose fields were all hidden, so the model is not told how many rows there were', () => {
  const map = { rows: { name: 'personal' as const, email: 'email' as const } };
  const g = applyGate({ rows: [{ name: 'A', email: 'a@x.com' }, { name: 'B' }, { name: 'C', email: 'c@x.com' }] }, map, resolvePolicy('remote')) as any;
  assert.deepEqual(g.value.rows, []); assert.match(g.value.privacy_note, /customer details/);
  const half = applyGate({ rows: [{ name: 'A', email: 'a@x.com' }, { name: 'B' }] }, map, resolvePolicy('remote', { email: 'allow' })) as any; assert.deepEqual(half.value.rows, [{ email: 'a@x.com' }]);
  const kept = applyGate({ rows: [{ name: 'A' }, {}] }, map, resolvePolicy('local')) as any; assert.deepEqual(kept.value.rows, [{ name: 'A' }, {}], 'a row that was already empty is not a hidden row');
});

// ---------- the definitions and the prompt ----------
test('the data tool definitions are short, take only plain arguments, and carry no dashes', () => {
  const defs = toolDefs(DATA_TOOLS);
  for (const d of defs) {
    assert.ok(d.function.description.length > 40 && d.function.description.length < 520, d.function.name); assert.equal((d.function.parameters as any).type, 'object');
    assert.doesNotMatch(JSON.stringify(d), /[\u2013\u2014]/); assert.equal((d.function.parameters as any).additionalProperties, false);
  }
  assert.deepEqual((toolDefs(DATA_TOOLS).find(d => d.function.name === 'find_customers')!.function.parameters as any).required, ['query']);
});
test('the prompt with tools names the data tools, says what cannot be looked up yet, and still names no restricted thing', () => {
  const p = buildSystemPrompt('short', true);
  assert.match(p, /ten tools/); for (const n of ['sales_report', 'find_orders', 'list_deals', 'find_customers', 'gift_card_activity']) assert.match(p, new RegExp(n));
  assert.match(p, /cannot yet look up products, prices or stock levels/); assert.match(p, /never add up figures yourself/i); assert.match(p, /privacy rules/); assert.doesNotMatch(p, /have no access to the shop/);
  assert.doesNotMatch(p, /manager|owner|printer|hardware|reports page|staff page|settings page/i); assert.doesNotMatch(p, /[\u2013\u2014]/);
  const none = buildSystemPrompt('short', false); assert.match(none, /no access to the shop's data/); assert.doesNotMatch(none, /sales_report/);
});
test('makeToolSet hands the snapshot to the tools, and leaving it out leaves the other tools as they were', () => {
  const set = makeToolSet({ pages: [], role: 'cashier', contextSize: 8000, data: data() }); assert.ok(set.ctx.data); assert.equal(set.tools.length, 10);
  assert.equal(makeToolSet({ pages: [], role: 'cashier', contextSize: 8000 }).ctx.data, undefined);
});
