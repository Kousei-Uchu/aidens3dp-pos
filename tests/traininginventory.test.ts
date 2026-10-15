// Location: tests/traininginventory.test.ts
// The "Inventory" course: registered, valid, each step and goal is finished only by the right change, the stock it sets up, and the practice never reaches Shopify.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inventory } from '../src/training/modules/inventory';
import { MODULES, getModule } from '../src/training';
import { validateModule, type InvSnap, type TrainSnap } from '../src/lib/trainingModule';
import { SPOT, isKnownSpot, isWindowSpot, invChipSpot, invGroupSpot, invModeSpot, invReasonSpot, invRowSpot } from '../src/lib/trainingSpots';
import { isMet, noEvents, snapOf } from '../src/lib/trainingConds';
import { diagnose, stepRules, fixCandidates } from '../src/lib/trainingCourse';
import { applyInjections, buildSandbox, sandboxSettings } from '../src/lib/trainingSandbox';
import { defaultInvPrefs } from '../src/lib/inventoryView';

const EGG = 'train-v-egg'; const KEY = 'train-v-key'; const STICKER = 'train-v-sticker'; const DRAGON = 'train-v-dragon';
const inv = (o: Partial<InvSnap> = {}): InvSnap => ({ q: '', expanded: [], stock: 'all', grouped: false, collectionId: null, status: 'active', sort: 'stock-asc', ...o });
const snap = (o: { stock?: Record<string, number | null>; inv?: Partial<InvSnap>; sheets?: number } = {}): TrainSnap => snapOf({ tab: 'inventory', route: '', sheets: o.sheets ?? 0, stock: o.stock, inv: inv(o.inv), cart: { lines: [] }, sales: 0, paying: false });
const by = (list: any[], id: string) => list.find(x => x.id === id);
const real: any = { settings: { staff: [], requirePin: false, receipt: { serverUrl: 'https://real.example' }, inventory: { ...defaultInvPrefs(), stock: 'neg', grouped: true } }, data: {}, grid: {}, gridVersion: 0, pos: {}, sync: {}, zeller: {}, staffId: undefined, unlocked: true };

test('the course is registered, is valid, and lives on the Inventory tab', () => {
  assert.equal(getModule('inventory'), inventory); assert.ok(MODULES.findIndex(m => m.id === 'inventory') >= 0);
  assert.deepEqual(validateModule(inventory, isKnownSpot), []); assert.deepEqual(inventory.tabs, ['inventory']);
});

test('the course sets its own stock: something low, something out and something negative, and the real prefs and Shopify location are not used', () => {
  const sb = buildSandbox(real, { stock: inventory.stock });
  assert.equal(sb.data.variants[EGG].stock, -3); assert.equal(sb.data.variants[KEY].stock, 0); assert.equal(sb.data.variants[STICKER].stock, 2); assert.equal(sb.data.variants[DRAGON].stock, 8, 'an item the course does not name keeps the fixture');
  assert.equal(buildSandbox(real).data.variants[EGG].stock, 25, 'other courses are unchanged');
  for (const v of Object.values(sb.data.variants)) assert.ok(v.inventoryItemId, `${v.id} is linked, so Apply works`);
  const st = sandboxSettings(real.settings); assert.ok(st.locationId); assert.deepEqual(st.inventory, defaultInvPrefs(), 'the real filters are not carried into practice');
});

test('the stock injection sets only the items it names', () => {
  const g = by(inventory.check2, 'negative-egg'); const sw = applyInjections(buildSandbox(real, { stock: inventory.stock }), g.inject);
  assert.equal(sw.data.variants[EGG].stock, -4); assert.equal(sw.data.variants[KEY].stock, 0);
  assert.equal(applyInjections(buildSandbox(real), [{ kind: 'stock', counts: { [KEY]: null } }]).data.variants[KEY].stock, null);
});

test('Guide steps are finished by the right filter, search, window and stock', () => {
  const g = (id: string) => by(inventory.guide, id).until;
  for (const [id, k] of [['g-low', 'low'], ['g-neg', 'neg'], ['g-all', 'all']] as const) { assert.ok(isMet(g(id), snap({ inv: { stock: k } }), noEvents()), id); assert.ok(!isMet(g(id), snap({ inv: { stock: k === 'all' ? 'low' : 'all' } }), noEvents()), `${id} not by another chip`); }
  assert.ok(isMet(g('g-search'), snap({ inv: { q: ' Sticker ' } }), noEvents())); assert.ok(!isMet(g('g-search'), snap({ inv: { q: 'stick' } }), noEvents()));
  assert.ok(isMet(g('g-open'), snap({ inv: { open: STICKER } }), noEvents())); assert.ok(!isMet(g('g-open'), snap({ inv: { open: EGG } }), noEvents()), 'the wrong item opened');
  assert.ok(isMet(g('g-receive-keys'), snap({ inv: { open: STICKER, mode: 'receive', digits: '10' } }), noEvents())); assert.ok(!isMet(g('g-receive-keys'), snap({ inv: { open: STICKER, mode: 'count', digits: '10' } }), noEvents()), 'wrong job');
  assert.ok(isMet(g('g-receive-apply'), snap({ stock: { [STICKER]: 12 } }), noEvents())); assert.ok(!isMet(g('g-receive-apply'), snap({ stock: { [STICKER]: 2 } }), noEvents()));
  assert.ok(isMet(g('g-sign'), snap({ inv: { mode: 'adjust', neg: true } }), noEvents())); assert.ok(!isMet(g('g-sign'), snap({ inv: { mode: 'adjust', neg: false } }), noEvents()));
  assert.ok(isMet(g('g-reason'), snap({ inv: { reason: 'damaged' } }), noEvents())); assert.ok(!isMet(g('g-reason'), snap({ inv: { reason: 'shrinkage' } }), noEvents()));
  assert.ok(isMet(g('g-adjust-apply'), snap({ stock: { [STICKER]: 11 } }), noEvents())); assert.ok(isMet(g('g-count-apply'), snap({ stock: { [STICKER]: 6 } }), noEvents()));
  assert.ok(isMet(g('g-clear'), snap({ inv: { q: '' } }), noEvents())); assert.ok(!isMet(g('g-clear'), snap({ inv: { q: 'x' } }), noEvents()));
  assert.ok(isMet(g('g-layout'), snap({ inv: { grouped: true } }), noEvents())); assert.ok(isMet(g('g-flat'), snap({ inv: { grouped: false } }), noEvents()));
  assert.ok(isMet(g('g-group'), snap({ inv: { expanded: ['train-p-cow'] } }), noEvents())); assert.ok(!isMet(g('g-group'), snap({ inv: { expanded: [] } }), noEvents()));
  for (const id of ['g-list', 'g-modes', 'g-done']) assert.equal(by(inventory.guide, id).until.kind, 'next');
});

test('a step with no Inventory state yet (no probe) is never finished by accident', () => {
  const bare: TrainSnap = snapOf({ tab: 'inventory', route: '', cart: { lines: [] }, sales: 0, paying: false });
  for (const s of inventory.guide.filter(x => x.until.kind === 'state')) assert.ok(!isMet(s.until, bare, noEvents()), `${s.id} stays open`);
});

test('every Inventory window control is a window spot, and every step that points at one allows a window', () => {
  for (const id of [SPOT.invModes, SPOT.invKeys, SPOT.invApply, SPOT.invSign, invModeSpot('count'), invReasonSpot('damaged')]) assert.ok(isWindowSpot(id), id);
  for (const id of [SPOT.invSearch, SPOT.invFilters, SPOT.invLayout, SPOT.tabInventory, invChipSpot('low'), invRowSpot(EGG), invGroupSpot('train-p-cow')]) { assert.ok(isKnownSpot(id), id); assert.ok(!isWindowSpot(id), `${id} is on the page`); }
  for (const s of inventory.guide.filter(x => x.target && (isWindowSpot(x.target) || x.target.startsWith('find.key:')))) assert.equal(stepRules(s).at?.sheets, true, s.id);
});

test('Check 1 and 2: each goal starts unfinished from its own stock and is finished by the right count', () => {
  const start = (g: any) => { const sw = applyInjections(buildSandbox(real, { stock: inventory.stock }), g.inject); return Object.fromEntries(Object.entries(sw.data.variants).map(([id, v]) => [id, v.stock])) as Record<string, number | null>; };
  for (const g of [...inventory.check1, ...inventory.check2]) assert.ok(!isMet(g.until, snap({ stock: start(g) }), noEvents()), `${g.id} does not start finished`);
  const done = (list: any[], id: string, stock: Record<string, number | null>, i: Partial<InvSnap> = {}) => isMet(by(list, id).until, snap({ stock, inv: i }), noEvents());
  assert.ok(done(inventory.check1, 'show-low', {}, { stock: 'low' })); assert.ok(!done(inventory.check1, 'show-low', {}, { stock: 'neg' }));
  assert.ok(done(inventory.check1, 'receive-keyrings', { [KEY]: 15 })); assert.ok(!done(inventory.check1, 'receive-keyrings', { [KEY]: 10 }), 'Adjust by 5 is not a delivery of 10');
  assert.ok(done(inventory.check1, 'count-dragons', { [DRAGON]: 6 })); assert.ok(!done(inventory.check1, 'count-dragons', { [DRAGON]: 7 }));
  assert.ok(done(inventory.check2, 'negative-egg', { [EGG]: 6 })); assert.ok(!done(inventory.check2, 'negative-egg', { [EGG]: 2 }), 'adding stock on top of a negative is not a count');
  assert.ok(done(inventory.check2, 'broken-keyrings', { [KEY]: 17 }, { reason: 'damaged' })); assert.ok(!done(inventory.check2, 'broken-keyrings', { [KEY]: 17 }, { reason: 'correction' }), 'the reason matters');
  assert.ok(done(inventory.check2, 'nearly-gone', { [STICKER]: 22 }));
  const w = by(inventory.check1, 'receive-keyrings'); assert.equal(w.stockAllow[0], KEY);
  const no = by(inventory.check2, 'broken-keyrings').watch.find((x: any) => x.id === 'no-reason'); assert.ok(no.when(snap({ stock: { [KEY]: 17 }, inv: { reason: 'correction' } }))); assert.ok(!no.when(snap({ stock: { [KEY]: 17 }, inv: { reason: 'damaged' } })));
  for (const g of inventory.check2) { assert.ok(g.taughtBy && by(inventory.guide, g.taughtBy), `${g.id} says which Guide step taught it`); assert.ok(g.inject?.some((i: any) => i.kind === 'stock'), g.id); }
});

test('changing the stock of an item the goal does not touch is off course, and says how to put it back', () => {
  const g = by(inventory.check1, 'receive-keyrings'); const frame = { tabs: inventory.tabs, routes: inventory.routes };
  const base = snap({ stock: { [KEY]: 5, [EGG]: -3, [DRAGON]: 8 } });
  assert.equal(diagnose(g, frame, base, snap({ stock: { [KEY]: 15, [EGG]: -3, [DRAGON]: 8 } })), null, 'the Keyring changing is the point');
  const off = diagnose(g, frame, base, snap({ stock: { [KEY]: 5, [EGG]: -3, [DRAGON]: 18 } }))!;
  assert.equal(off.kind, 'stock'); assert.equal(off.target, invRowSpot(DRAGON)); assert.match(off.say, /put it back to 8/); assert.ok(off.how!.length >= 2 && off.taughtIn === 'inventory');
  assert.equal(fixCandidates(off, true)[0].target, SPOT.sheetClose, 'with the item window open, close it first');
  assert.equal(fixCandidates(off, false)[0].target, invRowSpot(DRAGON));
  assert.equal(diagnose({ ...g, stockAllow: undefined }, frame, base, snap({ stock: { [KEY]: 5, [DRAGON]: 18 } })), null, 'stock is only watched when the goal lists what may change');
});

test('in practice Apply never reaches Shopify, and the Inventory screen carries every spot the course points at', () => {
  const src = fs.readFileSync('src/screens/Inventory.tsx', 'utf8'); const apply = src.slice(src.indexOf('const apply = async'), src.indexOf('const stockText'));
  assert.ok(apply.indexOf('isTraining()') >= 0 && apply.indexOf('isTraining()') < apply.indexOf('await setStock') && apply.indexOf('isTraining()') < apply.indexOf('await adjustStock'), 'the practice check comes before any Shopify call');
  for (const s of ['SPOT.invSearch', 'SPOT.invFilters', 'SPOT.invLayout', 'SPOT.invModes', 'SPOT.invKeys', 'SPOT.invApply', 'SPOT.invSign', 'invChipSpot(', 'invRowSpot(', 'invGroupSpot(', 'invReasonSpot(', 'invModeSpot(', 'setInvProbe(', 'clearInvProbe()']) assert.ok(src.includes(s), s);
  assert.ok(fs.readFileSync('App.tsx', 'utf8').includes('SPOT.tabInventory'));
  assert.ok(src.slice(src.indexOf('const pick ='), src.indexOf('const n =')).includes("setReason('correction')"), 'each item opens with a fresh reason');
});
