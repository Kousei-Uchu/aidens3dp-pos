// Location: tests/trainingsavedcarts.test.ts
// The "Park and resume a sale" course: valid, registered next to the gift card courses, the Guide follows saving,
// opening, merging and handing a cart over, each Check goal is won only by the right state, and the practice saved
// carts are made up and never reach Shopify.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { savedCarts } from '../src/training/modules/saved-carts';
import { MODULES, getModule } from '../src/training';
import { validateModule, type SavedSnap, type TrainSnap } from '../src/lib/trainingModule';
import { SPOT, isKnownSpot, isWindowSpot, savedAssignSpot, savedRowSpot } from '../src/lib/trainingSpots';
import { isMet, noEvents, savedCartsOf, snapOf, type Events } from '../src/lib/trainingConds';
import { applyInjections, buildSandbox, fixtureSavedCarts, PRACTICE_CASEY, PRACTICE_MORGAN, PRACTICE_SAVED_PRIYA, PRACTICE_SAVED_SAM } from '../src/lib/trainingSandbox';

const EGG = 'train-v-egg', BEE = 'train-v-bee', KEY = 'train-v-key';
const real: any = { settings: { staff: [], requirePin: false, receipt: { serverUrl: 'https://real.example' }, inventory: {} }, data: {}, grid: {}, gridVersion: 0, pos: { saved: [] }, sync: {}, zeller: {}, staffId: undefined, unlocked: true };

/** One saved cart as training sees it. `qty` follows the variants unless a test says otherwise. */
const saved = (id: string, variants: string[], assignedTo?: string, qty = variants.length): SavedSnap => ({ id, name: id, variants, qty, assignedTo, status: 'open' });
const snap = (o: { lines?: string[]; saved?: SavedSnap[]; savedNameDraft?: string; savedFrom?: string; tab?: string; route?: string; sheets?: number; staffId?: string } = {}): TrainSnap => snapOf({
  tab: o.tab ?? 'checkout', route: o.route ?? 'cart', sheets: o.sheets ?? 0, staffId: o.staffId,
  cart: { lines: (o.lines ?? []).map(variantId => ({ variantId, qty: 1 })), savedFrom: o.savedFrom },
  saved: o.saved, savedNameDraft: o.savedNameDraft, sales: 0, paying: false,
});
const ev = (...pressed: string[]): Events => ({ pressed: new Set(pressed), visible: new Set() });
const step = (list: { id: string; until: any }[], id: string) => list.find(x => x.id === id)!.until;
const won = (list: { id: string; until: any }[], id: string, s: TrainSnap, e: Events = noEvents()) => isMet(step(list, id), s, e);

test('the course is registered right after Pay with a gift card, is valid, and lives on Checkout and More', () => {
  assert.equal(getModule('saved-carts'), savedCarts);
  assert.equal(MODULES.findIndex(m => m.id === 'saved-carts'), MODULES.findIndex(m => m.id === 'gift-pay') + 1, 'it sits next to the gift card courses, not at the end');
  assert.ok(MODULES.findIndex(m => m.id === 'saved-carts') > MODULES.findIndex(m => m.id === 'gift-sell'));
  assert.deepEqual(validateModule(savedCarts, isKnownSpot), []);
  assert.deepEqual(savedCarts.tabs, ['checkout', 'more']); assert.deepEqual(savedCarts.routes, ['cart', 'saved']);
  assert.equal(savedCarts.practiceStaff, true, 'the handover needs practice staff, never the real list');
});

test('Guide steps follow saving a sale, opening it, merging, and handing one over', () => {
  assert.ok(!won(savedCarts.guide, 'g-add', snap())); assert.ok(won(savedCarts.guide, 'g-add', snap({ lines: [BEE] })));
  assert.ok(!won(savedCarts.guide, 'g-menu', snap(), ev(SPOT.tabCheckout))); assert.ok(won(savedCarts.guide, 'g-menu', snap(), ev(SPOT.cartMenu)));
  assert.ok(won(savedCarts.guide, 'g-save-row', snap(), ev(SPOT.cartMenuSave)));
  assert.ok(!won(savedCarts.guide, 'g-name', snap({ savedNameDraft: '  ' }))); assert.ok(won(savedCarts.guide, 'g-name', snap({ savedNameDraft: 'Sam - holding for Friday' })));
  assert.ok(!won(savedCarts.guide, 'g-save', snap({ lines: [BEE] })), 'a line in the till is not a parked sale');
  assert.ok(won(savedCarts.guide, 'g-save', snap({ saved: [saved(PRACTICE_SAVED_SAM, [BEE])] })));
  assert.ok(!won(savedCarts.guide, 'g-open', snap({ saved: [saved(PRACTICE_SAVED_SAM, [EGG])] })), 'saved is not opened');
  assert.ok(won(savedCarts.guide, 'g-open', snap({ savedFrom: PRACTICE_SAVED_SAM, lines: [EGG] })));
  assert.ok(won(savedCarts.guide, 'g-pick', snap(), ev(savedRowSpot(PRACTICE_SAVED_SAM))));
  assert.ok(!won(savedCarts.guide, 'g-merge', snap({ lines: [EGG, BEE] })), 'the second cart has not merged yet');
  assert.ok(won(savedCarts.guide, 'g-merge', snap({ lines: [EGG, BEE, KEY] })));
  assert.ok(!won(savedCarts.guide, 'g-assign', snap({ saved: [saved(PRACTICE_SAVED_SAM, [EGG], PRACTICE_MORGAN)] })), 'the wrong person is not the goal');
  assert.ok(won(savedCarts.guide, 'g-assign', snap({ saved: [saved(PRACTICE_SAVED_SAM, [EGG], PRACTICE_CASEY)] })));
  for (const id of ['g-intro', 'g-list', 'g-back', 'g-done']) assert.equal(step(savedCarts.guide, id).kind, 'next');
});

test('Check goals are won only by the right saved cart and the right assignment', () => {
  assert.ok(!won(savedCarts.check1, 'save', snap())); assert.ok(won(savedCarts.check1, 'save', snap({ saved: [saved('x', [BEE])] })));
  assert.ok(!won(savedCarts.check1, 'open', snap({ savedFrom: PRACTICE_SAVED_PRIYA, lines: [KEY] })), 'a different saved cart is not the goal');
  assert.ok(won(savedCarts.check1, 'open', snap({ savedFrom: PRACTICE_SAVED_SAM, lines: [EGG] })));
  assert.ok(!won(savedCarts.check1, 'merge', snap({ lines: [BEE] }))); assert.ok(won(savedCarts.check1, 'merge', snap({ lines: [BEE, EGG] })));
  assert.ok(!won(savedCarts.check1, 'assign', snap({ saved: [saved(PRACTICE_SAVED_SAM, [EGG])] })));
  assert.ok(won(savedCarts.check1, 'assign', snap({ saved: [saved(PRACTICE_SAVED_SAM, [EGG], PRACTICE_CASEY)] })));
  assert.ok(!won(savedCarts.check2, 'c2-merge', snap({ lines: [BEE] }))); assert.ok(won(savedCarts.check2, 'c2-merge', snap({ lines: [BEE, EGG] })));
  assert.ok(!won(savedCarts.check2, 'c2-assign', snap({ saved: [saved(PRACTICE_SAVED_PRIYA, [KEY], PRACTICE_MORGAN)] })), 'assigning to the wrong person is not the goal');
  assert.ok(won(savedCarts.check2, 'c2-assign', snap({ saved: [saved(PRACTICE_SAVED_PRIYA, [KEY], PRACTICE_CASEY)] })));
});

test('Check 2 makes something go wrong, says which Show step taught it, and starts as Morgan for the handover', () => {
  assert.ok(savedCarts.check2.length >= 1);
  const showIds = new Set(savedCarts.show.steps.map(s => s.id));
  for (const g of savedCarts.check2) {
    assert.ok(g.inject?.length, `${g.id} must inject a problem`); assert.ok(g.taughtBy && showIds.has(g.taughtBy), `${g.id} says which Show step taught it`);
    assert.ok(!isMet(g.until, snap({ lines: [BEE] }), noEvents()), `${g.id} does not start finished`);
  }
  const sw = applyInjections(buildSandbox(real, { practiceStaff: true }), savedCarts.check2.find(g => g.id === 'c2-assign')!.inject);
  assert.equal(sw.staffId, PRACTICE_MORGAN, 'the sign-in is a practice manager, never a real one'); assert.equal(sw.unlocked, true);
  assert.equal(sw.settings.requirePin, true); assert.equal(sw.settings.staff.length, 2, 'only the two practice people');
  assert.ok(sw.settings.staff.every(m => m.id.startsWith('train-')));
});

test('the sandbox starts with the two made-up saved carts, both open and unassigned', () => {
  const sb = buildSandbox(real);
  const list = savedCartsOf(sb.pos.saved);
  assert.equal(list.length, 2);
  const sam = list.find(c => c.id === PRACTICE_SAVED_SAM)!, priya = list.find(c => c.id === PRACTICE_SAVED_PRIYA)!;
  assert.ok(sam && priya);
  assert.equal(sam.name, 'Sam, holding for Friday'); assert.equal(priya.name, 'Priya, pickup Tuesday');
  assert.deepEqual(sam.variants, [EGG]); assert.equal(sam.qty, 2);
  assert.deepEqual(priya.variants, [KEY]); assert.equal(priya.qty, 1);
  assert.equal(sam.status, 'open'); assert.equal(priya.status, 'open');
  assert.equal(sam.assignedTo, undefined); assert.equal(priya.assignedTo, undefined, 'nobody owns a cart until the course hands it over');
  assert.ok(list.every(c => c.id.startsWith('train-')), 'practice carts are never mistaken for the real thing');
  const fresh = fixtureSavedCarts(); fresh[0].name = 'changed';
  assert.equal(fixtureSavedCarts()[0].name, 'Sam, holding for Friday', 'each run gets its own made-up carts');
});

test('the Saved carts screen, cart menu and Save cart window carry every spot the course points at', () => {
  const savedSrc = fs.readFileSync('src/screens/SavedCarts.tsx', 'utf8');
  for (const s of ['savedRowSpot(', 'savedAssignSpot(', 'SPOT.savedOpen', 'openSavedCart', 'assignSavedCart']) assert.ok(savedSrc.includes(s), s);
  const sheetsSrc = fs.readFileSync('src/screens/sheets.tsx', 'utf8');
  for (const s of ['SPOT.savedName', 'SPOT.savedSave', 'setSavedNameProbe', 'saveCartLocal', 'screen="sheet_save_cart"']) assert.ok(sheetsSrc.includes(s), s);
  const pane = fs.readFileSync('src/screens/CartPane.tsx', 'utf8');
  assert.ok(pane.includes('SPOT.cartMenuSave'));
  const saveSheet = pane.slice(pane.indexOf('<SaveCartSheet'), pane.indexOf('/>', pane.indexOf('<SaveCartSheet')));
  assert.ok(saveSheet.includes('setCart(ops.emptyCart())'), 'saving a cart frees the till');
  assert.ok(fs.readFileSync('src/screens/More.tsx', 'utf8').includes('SPOT.moreSaved'));
});

test('the saved rows are on the page, the window buttons are window spots, and opening a cart is placed on its page', () => {
  for (const id of [SPOT.moreSaved, SPOT.cartMenuSave, SPOT.savedName, SPOT.savedSave, SPOT.savedOpen, savedRowSpot(PRACTICE_SAVED_SAM), savedAssignSpot(PRACTICE_CASEY)]) assert.ok(isKnownSpot(id), id);
  for (const id of [SPOT.cartMenuSave, SPOT.savedName, SPOT.savedSave, SPOT.savedOpen, savedAssignSpot(PRACTICE_CASEY)]) assert.ok(isWindowSpot(id), `${id} is inside a window`);
  for (const id of [SPOT.moreSaved, savedRowSpot(PRACTICE_SAVED_SAM)]) assert.ok(!isWindowSpot(id), `${id} is on the page`);
  // A step that points at a window spot must say windows are allowed; the rows and the More tab do not need to.
  for (const s of savedCarts.guide.filter(x => x.target && isWindowSpot(x.target))) assert.equal(s.at?.sheets, true, s.id);
});
