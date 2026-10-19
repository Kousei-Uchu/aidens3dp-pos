// Location: tests/export.test.ts
// The report export: the tables it builds and the file bytes it makes. Pure, so it runs in the node suite with no app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPORT_GROUPS, EXPORT_TOPICS, buildIndexSheet, buildSheets, sheetToCsv, topicById, type ExportInput, type Sheet } from '../src/lib/exportSheets';
import { buildXlsx, colName, uniqueSheetName } from '../src/lib/xlsx';
import { emptyTotals } from '../src/lib/rollup';
import type { SaleLine, SaleRecord } from '../src/lib/types';

const line = (o: Partial<SaleLine>): SaleLine => ({ title: 'Thing', qty: 1, baseUnitCents: 0, grossCents: 0, discountCents: 0, netCents: 0, costCents: 0, discountLabels: [], kind: 'item', ...o });
const sale = (o: Partial<SaleRecord>): SaleRecord => ({
  uuid: 'u', type: 'sale', ts: '2026-10-19T10:00:00.000Z', registerId: 'r1', registerName: 'Front', lines: [],
  itemsCents: 0, discountCents: 0, netCents: 0, tipCents: 0, totalCents: 0, cogsCents: 0, feesCents: 0, roundingCents: 0, tenders: [], deals: [], ...o,
});

const input = (o: Partial<ExportInput> = {}): ExportInput => ({
  now: '2026-10-19T12:00:00.000Z', shopName: 'The Shop', registerName: 'Front', registerId: 'r1',
  sales: [
    sale({ uuid: 's1', staff: 'Ada', lines: [line({ variantId: 'v1', title: 'Cow', qty: 2, baseUnitCents: 500, grossCents: 1000, netCents: 1000, costCents: 600, collectionTitles: ['Animals'] })], itemsCents: 1000, netCents: 1000, totalCents: 1000, cogsCents: 600, tenders: [{ id: 't1', kind: 'cash', amountCents: 1000, at: '2026-10-19T10:00:01.000Z' }] }),
    sale({ uuid: 's2', type: 'refund', ts: '2026-10-19T11:00:00.000Z', staff: 'Ada', lines: [line({ variantId: 'v1', title: 'Cow', qty: 1, baseUnitCents: 500, grossCents: 500, netCents: 500, costCents: 300, collectionTitles: ['Animals'] })], itemsCents: 500, netCents: 500, totalCents: 500, cogsCents: 300, tenders: [{ id: 't2', kind: 'cash', amountCents: 500, at: '2026-10-19T11:00:01.000Z' }] }),
  ],
  variants: { v1: { id: 'v1', productId: 'p1', productTitle: 'Cow', variantTitle: '', priceCents: 500, tracked: true, stock: 3, tags: [], active: true, sku: 'COW' } },
  collections: [{ id: 'c1', title: 'Animals', productIds: ['p1'] }],
  customers: [{ id: 'cust1', name: 'Sam', email: 'sam@example.com', orders: 1, spentCents: 1000 }],
  autos: [], presets: [], bundles: [], outbox: [], attempts: [], notices: [],
  rollups: {}, shift: { open: true, openedAt: '2026-10-19T09:00:00.000Z', floatCents: 10000, paidInCents: 0, paidOutCents: 0 },
  ledger: { counts: { '1000': 1, '100': 2 }, entries: [{ id: 'e1', ts: '2026-10-19T09:05:00.000Z', kind: 'open', delta: { 1000: 1 }, staff: 'Ada' }] },
  saved: [], cartWarnings: [], warningList: [], rawFiles: [{ name: 'sales.csv', text: 'uuid,type\na,b\n' }], ...o,
});

// Every table must be a rectangle: a row that does not match its header would shear the sheet in a spreadsheet.
test('topic list is sound: unique ids, every group used, and each depth has a note', () => {
  const ids = EXPORT_TOPICS.map(t => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of EXPORT_TOPICS) {
    assert.ok(EXPORT_GROUPS.some(g => g.id === t.group), `${t.id} has no group`);
    assert.ok(t.depths.length >= 1, `${t.id} has no depth`);
    for (const d of t.depths) assert.ok((d === 'summary' ? t.summaryNote : t.fullNote).length > 0, `${t.id} ${d} has no note`);
  }
  assert.equal(topicById('transactions').group, 'sales');
});

test('every table a selection builds is rectangular, and the order follows the selection', () => {
  const sheets = buildSheets(input(), [
    { topic: 'transactions', depth: 'summary' }, { topic: 'transactions', depth: 'full' },
    { topic: 'items', depth: 'summary' }, { topic: 'raw', depth: 'full' },
  ]);
  assert.deepEqual(sheets.map(s => s.name), ['transactions', 'transactions_lines', 'item_sales', 'sales']);
  for (const s of sheets) assert.equal(s.rows.every(r => r.length === s.header.length), true, `${s.name} row width`);
});

test('every topic at every depth builds a rectangular sheet', () => {
  for (const t of EXPORT_TOPICS) for (const d of t.depths) {
    const sheets = buildSheets(input({ rollups: { 'r1|2026-10-19': { ...emptyTotals(), itemsCents: 1000, orders: 1 } } }), [{ topic: t.id, depth: d }]);
    assert.ok(sheets.length >= 1, `${t.id} ${d}`);
    for (const s of sheets) assert.equal(s.rows.every(r => r.length === s.header.length), true, `${t.id} ${d} ${s.name}`);
  }
});

test('a depth a topic does not have is skipped', () => {
  assert.deepEqual(buildSheets(input(), [{ topic: 'notices', depth: 'summary' }]), []);
});

test('transactions summary signs a refund negative and writes money as a plain decimal', () => {
  const s = buildSheets(input(), [{ topic: 'transactions', depth: 'summary' }])[0];
  assert.equal(s.rows.length, 2);
  assert.equal(s.rows[0][2], 'sale'); assert.equal(s.rows[1][2], 'refund');
  assert.equal(s.rows[0][s.header.indexOf('total')], '10.00');
  assert.equal(s.rows[1][s.header.indexOf('total')], '-5.00');
});

test('item totals subtract refunds and read categories from the collection', () => {
  const s = buildSheets(input(), [{ topic: 'items', depth: 'summary' }])[0];
  assert.equal(s.rows.length, 1);
  assert.equal(s.rows[0][s.header.indexOf('item')], 'Cow');
  assert.equal(s.rows[0][s.header.indexOf('qty')], '1');
  assert.equal(s.rows[0][s.header.indexOf('net')], '5.00');
  assert.equal(s.rows[0][s.header.indexOf('categories')], 'Animals');
});

test('daily totals add the registers on the same day for the summary, and keep them apart for the full version', () => {
  const rollups = {
    'r1|2026-10-19': { ...emptyTotals(), itemsCents: 1000, cogsCents: 600, orders: 1, feesCents: 14 },
    'r2|2026-10-19': { ...emptyTotals(), itemsCents: 2000, cogsCents: 900, orders: 2, feesCents: 28 },
  };
  const summary = buildSheets(input({ rollups }), [{ topic: 'rollups', depth: 'summary' }])[0];
  assert.equal(summary.rows.length, 1);
  assert.equal(summary.rows[0][summary.header.indexOf('gross')], '30.00');
  assert.equal(summary.rows[0][summary.header.indexOf('cogs')], '15.00');
  const full = buildSheets(input({ rollups }), [{ topic: 'rollups', depth: 'full' }])[0];
  assert.equal(full.rows.length, 2);
});

test('the cash drawer summary lists the denominations and the shift figures', () => {
  const s = buildSheets(input(), [{ topic: 'cash', depth: 'summary' }])[0];
  assert.ok(s.rows.some(r => r[0] === '$10 in drawer' && r[1] === '1' && r[2] === '10.00'));
  assert.ok(s.rows.some(r => r[0] === 'float' && r[2] === '100.00'));
});

test('raw history files are split back into a header and rows, keeping quoted commas', () => {
  const files = [{ name: 'sale_lines.csv', text: 'title,qty\n"Bear, large",2\n' }];
  const s = buildSheets(input({ rawFiles: files }), [{ topic: 'raw', depth: 'full' }])[0];
  assert.equal(s.name, 'sale_lines');
  assert.deepEqual(s.header, ['title', 'qty']);
  assert.deepEqual(s.rows, [['Bear, large', '2']]);
});

test('CSV quotes only the fields that need it, and ends with a newline', () => {
  const csv = sheetToCsv({ name: 'x', header: ['a', 'b'], rows: [['x,y', 'he said "hi"'], ['line\nbreak', '']] });
  assert.equal(csv, 'a,b\n"x,y","he said ""hi"""\n"line\nbreak",\n');
});

test('the workbook index counts the sheets it lists', () => {
  const sheets: Sheet[] = [{ name: 'one', header: ['a'], rows: [] }, { name: 'two', header: ['a', 'b'], rows: [['1', '2']] }];
  const idx = buildIndexSheet(sheets, { when: 'now', shop: 'Shop', register: 'Front' });
  assert.ok(idx.rows.some(r => r[0] === 'two' && r[1] === '2' && r[2] === '1'));
  assert.ok(idx.rows.some(r => r[0] === 'Sheets' && r[1] === '2'));
});

test('the workbook is a zip, and it holds a worksheet per table plus the index', () => {
  const book = buildXlsx([{ name: 'One', header: ['a'], rows: [['1']] }, { name: 'Two', header: ['b'], rows: [] }]);
  assert.equal(String.fromCharCode(book[0], book[1]), 'PK');
  const text = Buffer.from(book).toString('latin1');
  for (const part of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/styles.xml']) assert.ok(text.includes(part), part);
});

test('worksheet names are sanitised, cut to 31 characters and made unique', () => {
  const used = new Set<string>();
  assert.equal(colName(1), 'A'); assert.equal(colName(26), 'Z'); assert.equal(colName(27), 'AA'); assert.equal(colName(52), 'AZ');
  assert.equal(uniqueSheetName('a/b:c*d', used), 'a b c d');
  const long = uniqueSheetName('x'.repeat(40), used);
  assert.equal(long.length, 31);
  assert.equal(uniqueSheetName('x'.repeat(40), used), `${'x'.repeat(29)} 2`);
  assert.equal(uniqueSheetName('', used), 'Sheet');
});
