// Location: tests/trainingcustomerslist.test.ts
// The "Customers on file" course: valid and registered, the Guide follows finding, editing and starting a sale, each
// Check goal is won only by the right state, and the practice customers are made up and never reach Shopify.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { customersList } from '../src/training/modules/customers-list';
import { MODULES, getModule } from '../src/training';
import { validateModule, type CustomerSnap, type TrainSnap } from '../src/lib/trainingModule';
import { SPOT, customersRowSpot, isKnownSpot, isWindowSpot } from '../src/lib/trainingSpots';
import { screenOfSpot } from '../src/lib/appControls';
import { isMet, noEvents, snapOf, type Events } from '../src/lib/trainingConds';
import { applyInjections, buildSandbox, FIXTURE_CUSTOMERS } from '../src/lib/trainingSandbox';

const BEE = 'train-v-bee', EGG = 'train-v-egg';
const SAM = 'train-cu-1', PRIYA = 'train-cu-2';
const real: any = { settings: { staff: [], requirePin: false, receipt: { serverUrl: 'https://real.example' }, inventory: {} }, data: {}, grid: {}, gridVersion: 0, pos: { saved: [] }, sync: {}, zeller: {}, staffId: undefined, unlocked: true };

/** The practice customers as training sees them. Sam has no mobile on file, so an edit is a real change. */
const CUSTOMERS: CustomerSnap[] = FIXTURE_CUSTOMERS.map(c => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, note: c.note }));
const withPhone = (id: string, phone: string): CustomerSnap[] => [...CUSTOMERS, { id, name: 'Edited', phone }];
const snap = (o: { lines?: string[]; customerId?: string; customers?: CustomerSnap[]; customersDraft?: TrainSnap['customersDraft']; tab?: string; route?: string; sheets?: number } = {}): TrainSnap => snapOf({
  tab: o.tab ?? 'checkout', route: o.route ?? '',
  sheets: o.sheets ?? 0,
  cart: { lines: (o.lines ?? []).map(variantId => ({ variantId, qty: 1 })), customer: o.customerId ? { id: o.customerId } : undefined },
  customers: o.customers ?? CUSTOMERS, customersDraft: o.customersDraft, sales: 0, paying: false,
});
const ev = (visible: string[] = [], pressed: string[] = []): Events => ({ pressed: new Set(pressed), visible: new Set(visible) });
const step = (list: { id: string; until: any }[], id: string) => list.find(x => x.id === id)!.until;
const won = (list: { id: string; until: any }[], id: string, s: TrainSnap, e: Events = noEvents()) => isMet(step(list, id), s, e);

test('the course is registered last, is valid, and lives on Checkout and the Customers page', () => {
  assert.equal(getModule('customers-list'), customersList);
  assert.equal(MODULES[MODULES.length - 1].id, 'customers-list', 'it is the newest course in the hub');
  assert.deepEqual(validateModule(customersList, isKnownSpot), []);
  assert.deepEqual(customersList.tabs, ['checkout', 'more']);
  assert.deepEqual(customersList.routes, ['customers']);
});

test('Guide steps follow finding a customer, fixing their details, and starting a sale', () => {
  assert.ok(!won(customersList.guide, 'g-intro', snap()), 'the intro waits on Next');
  assert.ok(!won(customersList.guide, 'g-more', snap())); assert.ok(won(customersList.guide, 'g-more', snap({ tab: 'more' })));
  assert.ok(!won(customersList.guide, 'g-open', snap({ tab: 'more' }))); assert.ok(won(customersList.guide, 'g-open', snap({ tab: 'more', route: 'customers' })));
  assert.ok(!won(customersList.guide, 'g-sam', snap({ tab: 'more', route: 'customers' })));
  assert.ok(won(customersList.guide, 'g-sam', snap({ tab: 'more', route: 'customers', sheets: 1 }), ev([SPOT.customersEdit])));
  assert.ok(!won(customersList.guide, 'g-edit', snap({ tab: 'more', route: 'customers', sheets: 1 })));
  assert.ok(won(customersList.guide, 'g-edit', snap({ tab: 'more', route: 'customers', sheets: 1 }), ev([SPOT.customersForm])));
  const draftStep = customersList.guide.find(s => s.id === 'g-edit-form')!;
  assert.ok(draftStep.ready && !draftStep.ready(snap({ customersDraft: { first: 'Sam', last: '', email: '', phone: '  ' } })), 'Next waits for a mobile');
  assert.ok(draftStep.ready!(snap({ customersDraft: { first: 'Sam', last: '', email: '', phone: '0400 123 456' } })));
  assert.ok(!won(customersList.guide, 'g-edit-save', snap({ tab: 'more', route: 'customers', sheets: 1 })), 'Sam has no mobile yet');
  assert.ok(won(customersList.guide, 'g-edit-save', snap({ tab: 'more', route: 'customers', sheets: 1, customers: withPhone(SAM, '0400 123 456') })));
  assert.ok(!won(customersList.guide, 'g-start', snap({ tab: 'more', route: 'customers', sheets: 1, customerId: PRIYA })), 'the wrong customer is not the goal');
  assert.ok(won(customersList.guide, 'g-start', snap({ tab: 'checkout', customerId: SAM })));
});

test('Check 1 is won only by making a customer and starting their sale', () => {
  assert.ok(!won(customersList.check1, 'c1-new', snap())); assert.ok(won(customersList.check1, 'c1-new', snap({ customers: withPhone('train-cu-new-1', '0400 000 000') })));
  assert.ok(!won(customersList.check1, 'c1-sale', snap({ customerId: SAM })), 'a fixture customer is not the one they made');
  assert.ok(!won(customersList.check1, 'c1-sale', snap({ customerId: 'train-cu-new-1', tab: 'more', route: 'customers', sheets: 1 })), 'the sale has not started until Checkout');
  assert.ok(won(customersList.check1, 'c1-sale', snap({ customerId: 'train-cu-new-1', tab: 'checkout' })));
});

test('Check 2 is won only by fixing Sam, and by starting Priya\'s sale without losing her items', () => {
  assert.ok(!won(customersList.check2, 'c2-edit', snap())); assert.ok(won(customersList.check2, 'c2-edit', snap({ customers: withPhone(SAM, '0400 777 888') })));
  assert.ok(!won(customersList.check2, 'c2-sale', snap({ customerId: PRIYA, lines: [BEE] })), 'her items must stay on the sale');
  assert.ok(!won(customersList.check2, 'c2-sale', snap({ customerId: SAM, lines: [BEE, EGG] })), 'the wrong customer is not the goal');
  assert.ok(won(customersList.check2, 'c2-sale', snap({ customerId: PRIYA, lines: [BEE, EGG], tab: 'checkout' })));
});

test('Check 2 makes something go wrong, and names the Guide step that taught the fix', () => {
  const guideIds = new Set(customersList.guide.map(s => s.id));
  assert.ok(customersList.check2.some(g => g.inject?.length));
  for (const g of customersList.check2) if (g.inject?.length) assert.ok(g.taughtBy && guideIds.has(g.taughtBy), `${g.id} names where it was taught`);
  const sw = applyInjections(buildSandbox(real), customersList.check2.find(g => g.id === 'c2-sale')!.inject);
  assert.deepEqual(sw.pos.cart.lines.map(l => l.variantId), [BEE, EGG]);
  assert.equal(customersList.check2.find(g => g.id === 'c2-edit')!.inject, undefined, 'fixing Sam is not a seeded problem');
  for (const g of customersList.check2) assert.ok(!isMet(g.until, snap(), noEvents()), `${g.id} does not start already finished`);
});

test('the practice customers are made up, so nothing here can reach a real customer', () => {
  const sb = buildSandbox(real);
  assert.equal(sb.data.customers.length, 3);
  assert.ok(sb.data.customers.every(c => c.id.startsWith('train-')));
  assert.equal(sb.data.customers.find(c => c.id === SAM)?.name, 'Sam Rivera');
  assert.equal(sb.data.customers.find(c => c.id === SAM)?.phone, undefined, 'Sam starts with no mobile, so the edit is real work');
});

test('the Customers page, the More tab and the New/Edit window carry every spot the course points at', () => {
  for (const id of [SPOT.moreCustomers, SPOT.customersNew, SPOT.customersSearch, SPOT.customersStart, SPOT.customersEdit, SPOT.customersForm, SPOT.customersSave, customersRowSpot(SAM)]) assert.ok(isKnownSpot(id), id);
  for (const id of [SPOT.customersStart, SPOT.customersEdit, SPOT.customersForm, SPOT.customersSave]) assert.ok(isWindowSpot(id), `${id} is inside a window`);
  for (const id of [SPOT.moreCustomers, SPOT.customersNew, SPOT.customersSearch, customersRowSpot(SAM)]) assert.ok(!isWindowSpot(id), `${id} is on the page`);
  // The page spots and its window spots all fold onto the Customers page, like the saved cart list folds onto its page.
  for (const id of [SPOT.customersNew, SPOT.customersSearch, SPOT.customersStart, SPOT.customersEdit, SPOT.customersForm, SPOT.customersSave, customersRowSpot(SAM)]) assert.equal(screenOfSpot(id), 'page_customers', id);
  assert.equal(screenOfSpot(SPOT.moreCustomers), 'tab_more');
  // A step that points at a window spot must say windows are allowed.
  for (const s of customersList.guide.filter(x => x.target && isWindowSpot(x.target))) assert.equal(s.at?.sheets, true, s.id);
});

test('the Customers screen is training-aware and wires the new spots and probe', () => {
  const page = fs.readFileSync('src/screens/Customers.tsx', 'utf8');
  for (const s of ['SPOT.customersNew', 'SPOT.customersSearch', 'customersRowSpot(', 'SPOT.customersStart', 'SPOT.customersEdit', 'SPOT.customersForm', 'SPOT.customersSave', 'setCustomersDraftProbe', 'isTraining', 'train-cu-new-']) assert.ok(page.includes(s), s);
  assert.ok(fs.readFileSync('src/screens/More.tsx', 'utf8').includes('SPOT.moreCustomers'));
  assert.ok(fs.readFileSync('src/lib/appControls.ts', 'utf8').includes("prefix: 'customers.row:'"));
});
