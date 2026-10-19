// Location: tests/trainingitems.test.ts
// The "Items and creating one" course: valid and registered, the Guide follows finding an item, fixing its price and
// creating a tracked product, each Check goal is won only by the right state, and the practice items are made up and
// never reach Shopify.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { items } from '../src/training/modules/items';
import { MODULES, getModule } from '../src/training';
import { validateModule, type ItemSnap, type TrainSnap } from '../src/lib/trainingModule';
import { SPOT, itemsRowSpot, isKnownSpot } from '../src/lib/trainingSpots';
import { screenOfSpot } from '../src/lib/appControls';
import { isMet, noEvents, snapOf, type Events } from '../src/lib/trainingConds';
import { applyInjections, buildSandbox, FIXTURE_VARIANTS } from '../src/lib/trainingSandbox';

const BEE = 'train-v-bee', COW = 'train-v-cow-s', PRINT = 'train-v-print';
const real: any = { settings: { staff: [], requirePin: false, receipt: { serverUrl: 'https://real.example' }, inventory: {} }, data: {}, grid: {}, gridVersion: 0, pos: { saved: [] }, sync: {}, zeller: {}, staffId: undefined, unlocked: true };

/** The practice catalogue as training sees it. Bumble Bee has no barcode, so adding one is real work. */
const ITEMS: ItemSnap[] = FIXTURE_VARIANTS.map(v => ({ id: v.id, title: v.productTitle, priceCents: v.priceCents, sku: v.sku, barcode: v.barcode, tracked: v.tracked, stock: v.stock }));
const withPrice = (id: string, priceCents: number): ItemSnap[] => ITEMS.map(i => (i.id === id ? { ...i, priceCents } : i));
const withSku = (id: string, sku: string): ItemSnap[] => ITEMS.map(i => (i.id === id ? { ...i, sku } : i));
const withBarcode = (id: string, barcode: string): ItemSnap[] => ITEMS.map(i => (i.id === id ? { ...i, barcode } : i));
const made = (tracked: boolean): ItemSnap[] => [...ITEMS, { id: 'train-v-new-1', title: 'Practice print', priceCents: 1500, tracked, stock: tracked ? 3 : null }];
const draft = (o: Partial<TrainSnap['itemDraft']>): TrainSnap['itemDraft'] => ({ mode: 'create', title: '', price: '', sku: '', barcode: '', cost: '', stock: '', ...o });
const snap = (o: { items?: ItemSnap[]; itemDraft?: TrainSnap['itemDraft']; tab?: string; route?: string } = {}): TrainSnap => snapOf({
  tab: o.tab ?? 'checkout', route: o.route ?? '', sheets: 0,
  cart: { lines: [] },
  items: o.items ?? ITEMS, itemDraft: o.itemDraft, sales: 0, paying: false,
});
const won = (list: { id: string; until: any }[], id: string, s: TrainSnap, e: Events = noEvents()) => isMet(list.find(x => x.id === id)!.until, s, e);
const ready = (id: string, s: TrainSnap): boolean => !!items.guide.find(x => x.id === id)!.ready?.(s);

test('the course is registered after the customers course, is valid, and lives on Checkout and the Items page', () => {
  assert.equal(getModule('items'), items);
  assert.equal(MODULES.findIndex(m => m.id === 'items'), MODULES.findIndex(m => m.id === 'customers-list') + 1, 'it sits right after the customers course');
  assert.deepEqual(validateModule(items, isKnownSpot), []);
  assert.deepEqual(items.tabs, ['checkout', 'more']);
  assert.deepEqual(items.routes, ['items', 'createItem', 'editItem']);
});

test('Guide steps follow finding an item, fixing its price, and making a tracked product', () => {
  assert.ok(!won(items.guide, 'g-intro', snap()), 'the intro waits on Next');
  assert.ok(!won(items.guide, 'g-more', snap())); assert.ok(won(items.guide, 'g-more', snap({ tab: 'more' })));
  assert.ok(!won(items.guide, 'g-items', snap({ tab: 'more' }))); assert.ok(won(items.guide, 'g-items', snap({ tab: 'more', route: 'items' })));
  assert.ok(!won(items.guide, 'g-open', snap({ tab: 'more', route: 'items' })));
  assert.ok(won(items.guide, 'g-open', snap({ tab: 'more', route: 'items', itemDraft: draft({ mode: 'edit', id: BEE, price: '8.00' }) })));
  assert.ok(!ready('g-price', snap({ itemDraft: draft({ mode: 'edit', id: BEE, price: '8.00' }) })), 'the price is still the old one');
  assert.ok(ready('g-price', snap({ itemDraft: draft({ mode: 'edit', id: BEE, price: '9.00' }) })));
  assert.ok(!won(items.guide, 'g-save', snap({ itemDraft: draft({ mode: 'edit', id: BEE, price: '9.00' }) })), 'the price has not been saved yet');
  assert.ok(won(items.guide, 'g-save', snap({ items: withPrice(BEE, 900) })));
  assert.ok(!ready('g-create', snap({ itemDraft: draft({}) })), 'an empty form is not ready');
  assert.ok(!ready('g-create', snap({ itemDraft: draft({ title: 'Print', price: '15.00', stock: '' }) })), 'a starting stock makes it tracked');
  assert.ok(ready('g-create', snap({ itemDraft: draft({ title: 'Print', price: '15.00', stock: '3' }) })));
  assert.ok(!won(items.guide, 'g-create-save', snap())); assert.ok(won(items.guide, 'g-create-save', snap({ items: made(true) })));
});

test('Check 1 is won only by changing the right SKU and by adding a tracked item', () => {
  assert.ok(!won(items.check1, 'c1-sku', snap()));
  assert.ok(!won(items.check1, 'c1-sku', snap({ items: withSku(BEE, 'TR-COW-S2') })), 'the wrong item does not count');
  assert.ok(!won(items.check1, 'c1-sku', snap({ items: withSku(COW, 'TR-COW-S') })), 'the same SKU is not a change');
  assert.ok(won(items.check1, 'c1-sku', snap({ items: withSku(COW, 'TR-COW-S2') })));
  assert.ok(!won(items.check1, 'c1-new', snap()), 'a fixture item is not a new one');
  assert.ok(!won(items.check1, 'c1-new', snap({ items: made(false) })), 'a new item with no starting stock is not tracked');
  assert.ok(won(items.check1, 'c1-new', snap({ items: made(true) })));
});

test('Check 2 is won only by putting a scan-ready barcode on the Clearance Print and by adding a tracked item', () => {
  assert.ok(!won(items.check2, 'c2-fix', snap()), 'the seeded fault has not happened yet');
  assert.ok(!won(items.check2, 'c2-fix', snap({ items: withBarcode(PRINT, '404404') })), 'the wrong barcode is the problem');
  assert.ok(won(items.check2, 'c2-fix', snap({ items: withBarcode(PRINT, 'TR-PRT-1') })));
  assert.ok(won(items.check2, 'c2-new', snap({ items: made(true) })));
});

test('Check 2 seeds a faulty barcode, names where it was taught, and never starts finished', () => {
  assert.ok(items.check2.some(g => g.inject?.length));
  const guideIds = new Set(items.guide.map(s => s.id));
  for (const g of items.check2) if (g.inject?.length) assert.ok(g.taughtBy && guideIds.has(g.taughtBy), `${g.id} names where it was taught`);
  const sw = applyInjections(buildSandbox(real), items.check2.find(g => g.id === 'c2-fix')!.inject);
  assert.equal(sw.data.variants[PRINT].barcode, '404404', 'the fault is on the practice catalogue');
  assert.equal(sw.data.variants[BEE].barcode, undefined, 'nothing else is touched');
  for (const g of items.check2) assert.ok(!isMet(g.until, snap(), noEvents()), `${g.id} does not start already finished`);
});

test('the practice items are made up, so nothing here can reach a real product', () => {
  const sb = buildSandbox(real);
  assert.ok(Object.keys(sb.data.variants).every(id => id.startsWith('train-')));
  assert.equal(sb.data.variants[BEE].productTitle, 'Bumble Bee');
  assert.equal(sb.data.variants[BEE].barcode, undefined, 'Bumble Bee starts with no barcode');
});

test('the Items screen, the More tab, the Create page and the Edit page carry every spot the course points at', () => {
  for (const id of [SPOT.moreItems, SPOT.itemsNew, SPOT.itemsSearch, SPOT.itemsForm, SPOT.itemsCreate, SPOT.itemsEditForm, SPOT.itemsEditSave, itemsRowSpot(BEE)]) assert.ok(isKnownSpot(id), id);
  assert.equal(screenOfSpot(SPOT.moreItems), 'tab_more');
  for (const id of [SPOT.itemsNew, SPOT.itemsSearch, itemsRowSpot(BEE)]) assert.equal(screenOfSpot(id), 'page_items', id);
  for (const id of [SPOT.itemsForm, SPOT.itemsCreate]) assert.equal(screenOfSpot(id), 'page_create_item', id);
  for (const id of [SPOT.itemsEditForm, SPOT.itemsEditSave]) assert.equal(screenOfSpot(id), 'page_edit_item', id);
  // None of these spots is inside a window, so no Guide step may claim sheets.
  for (const s of items.guide) assert.notEqual(s.at?.sheets, true, s.id);
});

test('the Items screen is training-aware and wires the new spots and probe', () => {
  const page = fs.readFileSync('src/screens/Items.tsx', 'utf8');
  for (const s of ['SPOT.itemsNew', 'SPOT.itemsSearch', 'itemsRowSpot(', 'SPOT.itemsForm', 'SPOT.itemsCreate', 'SPOT.itemsEditForm', 'SPOT.itemsEditSave', 'setItemDraftProbe', 'isTraining', 'train-v-new-']) assert.ok(page.includes(s), s);
  assert.ok(fs.readFileSync('src/screens/More.tsx', 'utf8').includes('SPOT.moreItems'));
  assert.ok(fs.readFileSync('src/lib/appControls.ts', 'utf8').includes("prefix: 'items.row:'"));
});
