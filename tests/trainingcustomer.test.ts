// Location: tests/trainingcustomer.test.ts
// The "Customers and notes" course: valid, registered, and each goal is won only by the right thing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { customer } from '../src/training/modules/customer';
import { getModule } from '../src/training';
import { validateModule, type TrainSnap } from '../src/lib/trainingModule';
import { isKnownSpot } from '../src/lib/trainingSpots';
import { isMet, noEvents, snapOf } from '../src/lib/trainingConds';
import { FIXTURE_CUSTOMERS, applyInjections, buildSandbox } from '../src/lib/trainingSandbox';

const real: any = { settings: { staff: [], requirePin: false, receipt: {} }, data: {}, grid: {}, gridVersion: 0, pos: {}, sync: {}, zeller: {}, staffId: undefined, unlocked: true };
const snap = (o: { customer?: string; lines?: { variantId: string; note?: string }[]; query?: string; draft?: string } = {}): TrainSnap =>
  snapOf({ tab: 'checkout', route: '', customerQuery: o.query, noteDraft: o.draft, cart: { lines: (o.lines ?? []).map(l => ({ variantId: l.variantId, title: l.variantId, kind: 'item' as const, qty: 1, id: l.variantId, note: l.note })), customer: o.customer ? { id: o.customer } : undefined }, sales: 0, paying: false });
const until = (list: any[], id: string) => list.find(x => x.id === id).until;
const won = (list: any[], id: string, s: TrainSnap) => isMet(until(list, id), s, noEvents());

test('the course is registered and valid', () => {
  assert.equal(getModule('customer'), customer); assert.deepEqual(validateModule(customer, isKnownSpot), []);
});
test('Guide steps finish on the right thing', () => {
  assert.ok(!won(customer.guide, 'g-search', snap({ query: 'sam' }))); assert.ok(won(customer.guide, 'g-search', snap({ query: 'Priya' })));
  assert.ok(!won(customer.guide, 'g-pick', snap({ customer: 'train-cu-1' }))); assert.ok(won(customer.guide, 'g-pick', snap({ customer: 'train-cu-2' })));
  assert.ok(!won(customer.guide, 'g-note', snap({ draft: '  ' }))); assert.ok(won(customer.guide, 'g-note', snap({ draft: 'Gift wrap' })));
  assert.ok(!won(customer.guide, 'g-note-done', snap({ lines: [{ variantId: 'train-v-bee' }] }))); assert.ok(won(customer.guide, 'g-note-done', snap({ lines: [{ variantId: 'train-v-bee', note: 'Gift wrap' }] })));
  assert.ok(!won(customer.guide, 'g-remove', snap({ customer: 'train-cu-2' }))); assert.ok(won(customer.guide, 'g-remove', snap()));
  assert.ok(!won(customer.guide, 'g-save', snap({ customer: 'train-cu-2' }))); assert.ok(won(customer.guide, 'g-save', snap({ customer: 'train-cu-new-1700000000000' })));
});
test('Check 1 goals are won only by the right customer or note', () => {
  assert.ok(!won(customer.check1, 'c1-attach', snap({ customer: 'train-cu-2' }))); assert.ok(won(customer.check1, 'c1-attach', snap({ customer: 'train-cu-3' })));
  assert.ok(!won(customer.check1, 'c1-note', snap({ lines: [{ variantId: 'train-v-bee' }] }))); assert.ok(won(customer.check1, 'c1-note', snap({ lines: [{ variantId: 'train-v-bee', note: 'x' }] })));
  assert.ok(!won(customer.check1, 'c1-off', snap({ customer: 'train-cu-3' }))); assert.ok(won(customer.check1, 'c1-off', snap()));
});
test('Check 2 starts unfinished: the wrong customer is already on the sale', () => {
  const g = customer.check2.find(x => x.id === 'c2-swap')!; const start = applyInjections(buildSandbox(real), g.inject);
  assert.equal((start.pos.cart.customer as any)?.id, 'train-cu-1'); assert.ok(FIXTURE_CUSTOMERS.some(c => c.id === 'train-cu-1'));
  const s0 = snap({ customer: 'train-cu-1', lines: start.pos.cart.lines.map(l => ({ variantId: l.variantId! })) });
  assert.ok(!isMet(g.until, s0, noEvents()), 'the injected cart must not already finish the goal'); assert.ok(isMet(g.until, snap({ customer: 'train-cu-2' }), noEvents()));
  const n = customer.check2.find(x => x.id === 'c2-new')!; assert.equal(applyInjections(buildSandbox(real), n.inject).pos.cart.customer, undefined, 'a new goal starts with nobody attached');
  assert.ok(!isMet(n.until, snap({ customer: 'train-cu-2' }), noEvents())); assert.ok(isMet(n.until, snap({ customer: 'train-cu-new-9' }), noEvents()));
  for (const x of customer.check2) { assert.ok(x.inject?.length && x.taughtBy, x.id); assert.ok(customer.guide.some(s => s.id === x.taughtBy), `${x.id} names a real Guide step`); }
});
