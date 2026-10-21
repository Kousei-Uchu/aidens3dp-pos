// Location: tests/demodata.test.ts
// Patch 0187: Demo mode runs on a copy of the till's own data, with practice data only where the till has none.
// What is pinned here: which data is the till's own, that nothing done in the demo can reach the real objects, that everything
// pointing outside the iPad stays blank, and that a card payment in flight keeps Demo mode from starting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { useApp, flushPersist } from '../src/state/store';
import { kvGet, kvUseMemory } from '../src/lib/kv';
import { isTraining } from '../src/lib/trainingGuard';
import { FIXTURE_VARIANTS, PRACTICE_BUNDLES, PRACTICE_RECEIPT_URL, fixtureGrid, fixtureOutbox, takeSnapshot, type Swap } from '../src/lib/trainingSandbox';
import { allPractice, buildDemoSwap, demoBannerText, demoIntro, partsText } from '../src/lib/demoData';
import { DEMO_OWNER_ID, demoRollups, demoSales } from '../src/lib/demoFixtures';
import { addVariant, emptyCart } from '../src/lib/cartOps';
import { useDemo } from '../src/state/demoSession';
import type { Variant } from '../src/lib/types';

kvUseMemory();
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const realise = <T>(x: T): T => JSON.parse(JSON.stringify(x).replaceAll('train-', 'real-'));
const hasTrain = (x: unknown): boolean => JSON.stringify(x).includes('train-');
const base = takeSnapshot(useApp.getState());

const cow: Variant = { ...FIXTURE_VARIANTS[0], id: 'gid://shopify/ProductVariant/11', productId: 'gid://shopify/Product/1', productTitle: 'Real Cow', variantTitle: '', sku: 'RC1', priceCents: 1500, stock: 7, inventoryItemId: 'gid://shopify/InventoryItem/11' };
const owl: Variant = { ...FIXTURE_VARIANTS[1], id: 'gid://shopify/ProductVariant/12', productId: 'gid://shopify/Product/2', productTitle: 'Real Owl', variantTitle: '', sku: 'RO1', priceCents: 900, stock: 3, inventoryItemId: 'gid://shopify/InventoryItem/12' };
const REG = 'reg-real';

/** A till with a catalogue, customers, sales, a drawer, saved carts and a waiting upload, all its own. */
function fullTill(): Swap {
  const sales = realise(demoSales(REG, 'Front counter'));
  // Built through JSON, the way the till's state really arrives: loaded from storage, so no key holds `undefined`.
  return clone({
    ...base,
    settings: {
      ...base.settings, shopName: 'Real Shop', registerId: REG, registerName: 'Front counter', locationId: 'gid://shopify/Location/1', locationName: 'Front shop',
      passServerUrl: 'https://pass.example', giftClaimUrl: 'https://claim.example', receipt: { ...base.settings.receipt, serverUrl: 'https://receipts.example' },
      bundlesJson: '{"version":1,"real":true}', cartWarnings: [{ id: 'w1' }] as any, smartChange: true, cashRounding: false,
      staff: [{ id: 'staff-1', name: 'Real Person', role: 'manager', salt: 's', pinHash: 'h' }], requirePin: true,
    },
    data: {
      variants: { [cow.id]: cow, [owl.id]: owl }, collections: [{ id: 'gid://shopify/Collection/1', title: 'Real animals', productIds: [cow.productId] }],
      customers: [{ id: 'gid://shopify/Customer/1', name: 'Real Customer', email: 'real@example.com', orders: 2, spentCents: 3000 }],
      autos: [{ id: 'auto-real', title: 'Real deal', kind: 'basic', pct: 10, target: { variantIds: [cow.id] }, minQty: 2 }] as any, presets: [{ id: 'pre-real', kind: 'pct', value: 15, label: 'Real 15% off' }],
    },
    grid: { version: 1, pages: [{ id: 'page-real', name: 'Real home', tiles: [{ type: 'item', variantId: cow.id }, { type: 'item', variantId: owl.id }] }] } as any, gridVersion: 4,
    pos: {
      saved: [{ id: 'saved-real', name: 'Real holding', cart: addVariant(emptyCart(), cow, 1), ts: '2026-10-14T09:00:00.000Z', status: 'open' }],
      outbox: realise(fixtureOutbox({ stuck: 1 })), sales, rollups: demoRollups(sales),
      attempts: [{ ref: 'r1', saleUuid: 'real-sale-open', amountCents: 500, ts: new Date().toISOString(), status: 'approved' }],
      notices: [{ id: 'n-real', ts: new Date().toISOString(), kind: 'sync', title: 'Real notice', body: 'Real body', route: 'transactions', read: false }],
      shift: { open: true, openedAt: '2026-10-19T09:00:00.000Z', floatCents: 20000, paidInCents: 0, paidOutCents: 0 },
      cart: addVariant(emptyCart(), owl, 2), ledger: { counts: { '2000': 3, '500': 4 }, entries: [] }, shared: base.pos.shared,
    } as any,
    staffId: 'staff-1', unlocked: true,
  });
}
/** A till that has never been used. */
const emptyTill = (): Swap => ({ ...base, settings: { ...base.settings, registerId: REG, registerName: 'Front counter' } });

test('a till with its own data: the demo uses its catalogue, grid, deals, customers, sales, drawer, saved carts and queue', () => {
  const real = fullTill(); const { swap, source } = buildDemoSwap(real);
  assert.deepEqual(swap.data.variants, real.data.variants);
  assert.deepEqual(swap.data.collections, real.data.collections); assert.deepEqual(swap.data.autos, real.data.autos); assert.deepEqual(swap.data.presets, real.data.presets);
  assert.deepEqual(swap.data.customers, real.data.customers);
  assert.deepEqual(swap.grid, real.grid); assert.equal(swap.gridVersion, 4);
  assert.deepEqual(swap.pos.sales, real.pos.sales); assert.deepEqual(swap.pos.rollups, real.pos.rollups);
  assert.deepEqual(swap.pos.notices, real.pos.notices); assert.deepEqual(swap.pos.saved, real.pos.saved);
  assert.deepEqual(swap.pos.outbox, real.pos.outbox, 'the real upload queue, not a pretend one');
  assert.deepEqual(swap.pos.ledger, real.pos.ledger); assert.deepEqual(swap.pos.shift, real.pos.shift);
  // Settings that describe the shop are the shop's own too.
  assert.equal(swap.settings.bundlesJson, '{"version":1,"real":true}'); assert.equal(swap.settings.locationName, 'Front shop');
  assert.equal(swap.settings.smartChange, true); assert.equal(swap.settings.cashRounding, false); assert.deepEqual(swap.settings.cartWarnings, [{ id: 'w1' }]);
  assert.equal(hasTrain({ data: swap.data, grid: swap.grid, pos: swap.pos }), false, 'practice ids never mix into the till\'s own data');
  assert.equal(allPractice(source), false); assert.equal(source.practice.length, 0);
  assert.deepEqual(source.real.sort(), ['catalogue', 'customers', 'drawer', 'notices', 'outbox', 'reports', 'sales', 'saved'].sort());
  assert.equal(source.products, 2); assert.equal(source.customers, 1); assert.equal(source.sales, real.pos.sales.length);
});

test('a copy shares nothing with the real till, so nothing done in the demo can reach it', () => {
  const real = fullTill(); const before = clone({ data: real.data, grid: real.grid, pos: real.pos, settings: real.settings });
  const { swap } = buildDemoSwap(real);
  // Mutate the demo in place, the worst case: code that edits an object without copying it first.
  Object.values(swap.data.variants)[0].stock = 999; swap.data.variants[cow.id].priceCents = 1;
  swap.data.customers[0].name = 'Changed'; swap.pos.sales.length = 0; swap.pos.ledger.counts['2000'] = 0;
  (swap.grid as any).pages[0].tiles.length = 0; swap.settings.staff.length = 0; swap.pos.saved[0].name = 'Changed'; swap.pos.outbox.length = 0;
  assert.deepEqual(clone({ data: real.data, grid: real.grid, pos: real.pos, settings: real.settings }), before, 'the real objects are exactly as they were');
});

test('the cart being rung up and card payment attempts belong to a real sale, so the demo starts without them', () => {
  const real = fullTill(); assert.ok(real.pos.cart.lines.length > 0 && real.pos.attempts.length > 0);
  const { swap } = buildDemoSwap(real);
  assert.equal(swap.pos.cart.lines.length, 0); assert.equal(swap.pos.attempts.length, 0);
  assert.equal(real.pos.cart.lines.length > 0, true, 'and the real cart is still there');
});

test('everything that points outside the iPad stays blank or practice, whatever else is real', () => {
  const { swap } = buildDemoSwap(fullTill());
  assert.equal(swap.settings.receipt.serverUrl, PRACTICE_RECEIPT_URL); assert.equal(swap.settings.passServerUrl, ''); assert.equal(swap.settings.giftClaimUrl, '');
  assert.match(swap.settings.locationId ?? '', /^train-/, 'a practice location, never the shop\'s real one');
  assert.equal(swap.sync.state, 'idle'); assert.equal(swap.zeller.ready, true, 'the card reader is the practice terminal');
  // The same on a till with nothing of its own.
  const empty = buildDemoSwap(emptyTill()).swap;
  assert.equal(empty.settings.passServerUrl, ''); assert.equal(empty.settings.receipt.serverUrl, PRACTICE_RECEIPT_URL);
});

test('signed in as a made-up owner with no PIN, with the real staff kept in the list', () => {
  const { swap } = buildDemoSwap(fullTill());
  assert.equal(swap.staffId, DEMO_OWNER_ID); assert.equal(swap.unlocked, true); assert.equal(swap.settings.requirePin, false);
  assert.equal(swap.settings.staff[0].id, DEMO_OWNER_ID); assert.equal(swap.settings.staff[0].role, 'owner');
  assert.ok(swap.settings.staff.some(m => m.id === 'staff-1' && m.name === 'Real Person'), 'the real people are on the Staff page');
});

test('a till with nothing of its own gets practice data for every group, as before', () => {
  const { swap, source } = buildDemoSwap(emptyTill());
  for (const v of Object.values(swap.data.variants)) assert.match(v.id, /^train-/);
  assert.deepEqual(swap.grid, fixtureGrid()); assert.equal(swap.settings.bundlesJson, PRACTICE_BUNDLES);
  assert.ok(swap.pos.sales.length >= 5 && swap.pos.sales.every(s => s.uuid.startsWith('train-')));
  assert.ok(Object.keys(swap.pos.rollups).length >= 2); assert.ok(swap.pos.notices.length >= 2);
  assert.ok(swap.pos.saved.length > 0, 'saved carts for the Saved carts feature'); assert.ok(swap.pos.outbox.length > 0, 'an upload queue for the offline feature');
  assert.ok(Object.values(swap.pos.ledger.counts).some(n => n > 0) && swap.pos.shift.open, 'a drawer with cash in it');
  assert.equal(allPractice(source), true); assert.equal(source.real.length, 0);
  assert.equal(demoBannerText(source), 'DEMO MODE  ·  nothing here is real');
  assert.match(demoIntro(source).using, /everything here is practice data/);
});

test('a real catalogue with nothing else yet: practice fills the gaps, but never pretend queued sales, and ids never mix', () => {
  const real: Swap = { ...emptyTill(), data: { ...fullTill().data, customers: [] }, grid: fullTill().grid, settings: { ...emptyTill().settings, bundlesJson: '{"version":1,"real":true}' } };
  const { swap, source } = buildDemoSwap(real);
  assert.deepEqual(swap.data.variants, real.data.variants);
  assert.deepEqual(source.real.sort(), ['catalogue', 'outbox'].sort(), 'a healthy till has an empty queue, and that is its own');
  assert.deepEqual(source.practice.sort(), ['customers', 'drawer', 'notices', 'reports', 'sales', 'saved'].sort());
  assert.equal(swap.pos.outbox.length, 0, 'no pretend sales waiting to upload on a real catalogue');
  assert.equal(swap.pos.saved.length, 0, 'saved carts built on practice items would point at nothing');
  assert.ok(swap.pos.sales.length >= 5, 'but there are sales to look at'); assert.ok(Object.keys(swap.pos.rollups).length >= 2);
  assert.ok(swap.data.customers.every(c => c.id.startsWith('train-')));
  assert.equal(hasTrain({ variants: swap.data.variants, collections: swap.data.collections, autos: swap.data.autos, presets: swap.data.presets, grid: swap.grid, bundles: swap.settings.bundlesJson }), false);
});

test('real sales with no daily totals yet: Reports is worked out from the real sales', () => {
  const sales = realise(demoSales(REG, 'Front counter'));
  const { swap, source } = buildDemoSwap({ ...emptyTill(), pos: { ...base.pos, sales } });
  assert.deepEqual(swap.pos.rollups, demoRollups(sales)); assert.ok(source.real.includes('sales') && source.real.includes('reports'));
  assert.ok(!source.practice.includes('reports'));
});

test('the words the person reads say what is real and what is practice', () => {
  const { source } = buildDemoSwap(fullTill());
  assert.equal(demoBannerText(source), 'DEMO MODE  ·  your real data, nothing is saved or sent');
  const i = demoIntro(source);
  assert.match(i.using, /^This is a copy of your till's own data: catalogue, customers, sales, reports, cash drawer, saved carts, upload queue and notifications \(/);
  assert.match(i.using, /\(2 products, 1 customer and \d+ sales\)/); assert.equal(i.gaps, '');
  assert.match(i.rules, /dropped when you leave/); assert.match(i.rules, /nothing is sent to Shopify/);
  const mixed = demoIntro(buildDemoSwap({ ...emptyTill(), data: fullTill().data }).source);
  assert.match(mixed.gaps, /^Practice data fills in what the till has none of yet: .*sales/);
  assert.equal(partsText(['notices', 'catalogue']), 'catalogue and notifications'); assert.equal(partsText([]), '');
});

// ---- on the live store ----
const reset = () => { if (useDemo.getState().active) useDemo.getState().leave(); useApp.setState({ ...base }); };

test('on the live store: the demo shows the real catalogue, a change is never stored or leaked, and leaving restores it exactly', async () => {
  const real = fullTill(); useApp.setState({ ...real, pos: { ...real.pos, cart: emptyCart(), attempts: [] } });
  try {
    await flushPersist(); const before = useApp.getState(); const beforeJson = JSON.stringify({ d: before.data, p: before.pos, s: before.settings, g: before.grid });
    assert.equal(await useDemo.getState().enter(), null); assert.equal(isTraining(), true);
    const during = useApp.getState();
    assert.deepEqual(Object.keys(during.data.variants).sort(), [cow.id, owl.id].sort(), 'the real catalogue is on the till');
    assert.equal(useDemo.getState().source?.real.includes('catalogue'), true);
    // Edit in the demo, both ways: a proper state change and an in-place mutation.
    during.patchData({ variants: { ...during.data.variants, [cow.id]: { ...during.data.variants[cow.id], priceCents: 1 } } });
    during.patchPos({ sales: [] }); useApp.getState().data.variants[owl.id].stock = 999;
    await new Promise(r => setTimeout(r, 500)); await flushPersist();
    assert.equal(await kvGet('data', null), null, 'the changed catalogue was never written'); assert.equal(await kvGet('pos', null), null, 'nor the sales');
    useDemo.getState().leave(); assert.equal(isTraining(), false); assert.equal(useDemo.getState().source, null);
    const after = useApp.getState();
    assert.equal(after.data, before.data); assert.equal(after.pos, before.pos); assert.equal(after.settings, before.settings); assert.equal(after.grid, before.grid);
    assert.equal(JSON.stringify({ d: after.data, p: after.pos, s: after.settings, g: after.grid }), beforeJson, 'and not one value in it changed');
  } finally { reset(); }
});

test('Demo mode will not start while a card payment is in flight or a sale is part paid, and says how to carry on', async () => {
  const real = fullTill();
  try {
    useApp.setState({ ...real, pos: { ...real.pos, cart: emptyCart(), attempts: [{ ref: 'r1', saleUuid: 'real-s', amountCents: 500, ts: new Date().toISOString(), status: 'started' }] } });
    const why = await useDemo.getState().enter();
    assert.match(why ?? '', /still waiting on the reader/); assert.match(why ?? '', /start Demo mode/); assert.doesNotMatch(why ?? '', /training/i);
    assert.equal(useDemo.getState().active, false); assert.equal(isTraining(), false);
    useApp.setState({ ...real, pos: { ...real.pos, attempts: [], cart: { ...emptyCart(), tenders: [{ id: 't', kind: 'cash', amountCents: 100, at: 'x' }] as any } } });
    assert.match((await useDemo.getState().enter()) ?? '', /part-paid sale/); assert.equal(useDemo.getState().active, false);
    useApp.setState({ ...real, pos: { ...real.pos, attempts: [], cart: emptyCart() } });
    assert.equal(await useDemo.getState().enter(), null, 'and it starts once they are done'); assert.equal(useDemo.getState().active, true);
  } finally { reset(); }
});
