// Location: tests/trainingstocklookup.test.ts
// "Price check and Stock check": valid module after inventory, Guide steps open both sheets and read results,
// Check goals verify price, deals, stock words, and other variations. Practice variants never reach Shopify.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stockLookupModule } from '../src/training/modules/stock-lookup';
import { MODULES, getModule } from '../src/training';
import { validateModule, type TrainSnap } from '../src/lib/trainingModule';
import { SPOT, isKnownSpot, isWindowSpot } from '../src/lib/trainingSpots';
import { isMet, noEvents, snapOf, type Events } from '../src/lib/trainingConds';

const BEE = 'train-v-bee';
const EGG = 'train-v-egg';
const KEY = 'train-v-key';
const STICKER = 'train-v-sticker';
const DRAGON = 'train-v-dragon';
const TAD = 'train-v-tad';
const COW_S = 'train-v-cow-s';
const COW_L = 'train-v-cow-l';

const real: any = { settings: { staff: [], requirePin: false, receipt: { serverUrl: 'https://real.example' }, inventory: {} }, data: {}, grid: {}, gridVersion: 0, pos: { saved: [] }, sync: {}, zeller: {}, staffId: undefined, unlocked: true };

const snap = (o: { lookupMode?: 'price' | 'stock'; lookupResult?: { variantId: string; productTitle: string; stock: number | null; priceCents: number }; tab?: string; route?: string; sheets?: number; staffId?: string } = {}): TrainSnap => snapOf({
  tab: o.tab ?? 'checkout', route: o.route ?? '', sheets: o.sheets ?? 0, staffId: o.staffId,
  cart: { lines: [] }, sales: 0, paying: false,
  lookupMode: o.lookupMode, lookupResult: o.lookupResult,
});

const ev = (...pressed: string[]): Events => ({ pressed: new Set(pressed), visible: new Set() });
const step = (list: { id: string; until: any }[], id: string) => list.find(x => x.id === id)!.until;
const won = (list: { id: string; until: any }[], id: string, s: TrainSnap, e: Events = noEvents()) => isMet(step(list, id), s, e);

test('the course is registered right after inventory, is valid, and lives on Checkout', () => {
  assert.equal(getModule('stock-lookup'), stockLookupModule);
  assert.equal(MODULES.findIndex(m => m.id === 'stock-lookup'), MODULES.findIndex(m => m.id === 'inventory') + 1, 'it sits right after inventory');
  assert.deepEqual(validateModule(stockLookup, isKnownSpot), []);
  assert.deepEqual(stockLookupModule.tabs, ['checkout']); assert.deepEqual(stockLookupModule.routes, []);
  assert.equal(stockLookupModule.tier, 3);
  assert.equal(stockLookupModule.order, 17);
});

test('Guide steps open Price check and Stock check and read results', () => {
  // g1: open price check, scan bee
  assert.ok(!won(stockLookupModule.guide, 'g1', snap()));
  assert.ok(won(stockLookupModule.guide, 'g1', snap(), ev('grid.action:price_check')));
  // g2: read price check result for bee
  assert.ok(won(stockLookupModule.guide, 'g2', snap({ lookupMode: 'price', lookupResult: { variantId: BEE, productTitle: 'Bee keyring', stock: 800, priceCents: 800 } })));
  // g3: clear, open stock check, scan bee
  assert.ok(!won(stockLookupModule.guide, 'g3', snap(), ev(SPOT.lookupClear)));
  assert.ok(won(stockLookupModule.guide, 'g3', snap(), ev(SPOT.lookupClear, 'grid.action:stock_check')));
  // g4: read stock check result for bee
  assert.ok(won(stockLookupModule.guide, 'g4', snap({ lookupMode: 'stock', lookupResult: { variantId: BEE, productTitle: 'Bee keyring', stock: 800, priceCents: 800 } })));
});

test('Check 1 goals verify price and stock lines', () => {
  // c1: price check egg - $6.00, 600 in stock
  assert.ok(!won(stockLookupModule.check1, 'c1', snap()));
  assert.ok(won(stockLookupModule.check1, 'c1', snap({ lookupMode: 'price', lookupResult: { variantId: EGG, productTitle: 'Egg timer', stock: 600, priceCents: 600 } })));
  // c2: stock check sticker - 300 in stock
  assert.ok(!won(stockLookupModule.check1, 'c2', snap()));
  assert.ok(won(stockLookupModule.check1, 'c2', snap({ lookupMode: 'stock', lookupResult: { variantId: STICKER, productTitle: 'Sticker pack', stock: 300, priceCents: 300 } })));
});

test('Check 2 goals verify deals, other variations, stock words meaning', () => {
  // c3: price check cow small - $12.00, no deal badge
  assert.ok(!won(stockLookupModule.check2, 'c3', snap()));
  assert.ok(won(stockLookupModule.check2, 'c3', snap({ lookupMode: 'price', lookupResult: { variantId: COW_S, productTitle: 'Small cow plush', stock: 1200, priceCents: 1200 } })));
  // c4: stock check cow large - 2 variations, 3000 total
  assert.ok(!won(stockLookupModule.check2, 'c4', snap()));
  assert.ok(won(stockLookupModule.check2, 'c4', snap({ lookupMode: 'stock', lookupResult: { variantId: COW_L, productTitle: 'Large cow plush', stock: 1800, priceCents: 1800 } })));
  // c5: price check tadpole - stock words
  assert.ok(!won(stockLookupModule.check2, 'c5', snap()));
  assert.ok(won(stockLookupModule.check2, 'c5', snap({ lookupMode: 'price', lookupResult: { variantId: TAD, productTitle: 'Tadpole toy', stock: 400, priceCents: 400 } })));
});

test('Check 2 makes something go wrong, says which Show step taught it, and practice staff is used', () => {
  assert.ok(stockLookupModule.check2.length >= 1);
  const showIds = new Set(stockLookupModule.show.steps.map(s => s.id));
  for (const g of stockLookupModule.check2) {
    assert.ok(g.inject?.length, `${g.id} must inject a problem`);
    assert.ok(g.taughtBy && showIds.has(g.taughtBy), `${g.id} says which Show step taught it`);
    assert.ok(!isMet(g.until, snap(), noEvents()), `${g.id} does not start finished`);
  }
});

test('the Lookup sheet and Checkout carry every spot the course points at', () => {
  const lookupSrc = fs.readFileSync('src/screens/Lookup.tsx', 'utf8');
  for (const s of ['SPOT.lookupSearch', 'SPOT.lookupScan', 'SPOT.lookupClear', 'setLookupModeProbe', 'setLookupResultProbe', 'screen="sheet_lookup"']) {
    assert.ok(lookupSrc.includes(s), `${s} is in Lookup.tsx`);
  }
  const checkoutSrc = fs.readFileSync('src/screens/Checkout.tsx', 'utf8');
  for (const s of ['setSheet', 'price_check', 'stock_check', 'LookupSheet']) {
    assert.ok(checkoutSrc.includes(s), `${s} is in Checkout.tsx`);
  }
});

test('the spots are known, window spots are marked, and guide steps allow sheets', () => {
  for (const id of [SPOT.lookupSearch, SPOT.lookupScan, SPOT.lookupClear, 'grid.action:price_check', 'grid.action:stock_check']) {
    assert.ok(isKnownSpot(id), `${id} is a known spot`);
  }
  for (const id of [SPOT.lookupSearch, SPOT.lookupScan, SPOT.lookupClear]) {
    assert.ok(isWindowSpot(id), `${id} is inside a window`);
  }
  // A step that points at a window spot must say windows are allowed
  for (const s of stockLookupModule.guide.filter(x => x.target && isWindowSpot(x.target))) {
    assert.equal(s.at?.sheets, true, s.id);
  }
});