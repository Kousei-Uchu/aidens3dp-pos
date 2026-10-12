// Location: tests/trainingpaycard.test.ts
// The "Take a card payment" course: registered, valid, and each step and goal is finished only by the right thing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { payCard } from '../src/training/modules/pay-card';
import { MODULES, getModule } from '../src/training';
import { validateModule, type TrainSnap } from '../src/lib/trainingModule';
import { SPOT, isKnownSpot, isWindowSpot } from '../src/lib/trainingSpots';
import { isMet, noEvents, snapOf } from '../src/lib/trainingConds';
import { diagnose, stepRules } from '../src/lib/trainingCourse';
import { applyInjections, buildSandbox, declineCodeOf, declinesOf } from '../src/lib/trainingSandbox';
import { CONTACTLESS_LIMIT_CENTS } from '../src/lib/virtualTerminal';
import { RESPONSE_CODES } from '../src/lib/responseCodes';

const line = (variantId: string, qty = 1) => ({ variantId, title: variantId, kind: 'item' as const, qty });
const snap = (lines: any[], o: { sheets?: number; sales?: number; route?: string } = {}): TrainSnap => snapOf({ tab: 'checkout', route: o.route ?? '', sheets: o.sheets ?? 0, cart: { lines }, sales: o.sales ?? 0, paying: false });
const by = (list: any[], id: string) => list.find(x => x.id === id);
const real: any = { settings: { staff: [], requirePin: false, receipt: {} }, data: {}, grid: {}, gridVersion: 0, pos: {}, sync: {}, zeller: {}, staffId: undefined, unlocked: true };
const ev = (pressed: string[] = [], visible: string[] = []) => ({ pressed: new Set(pressed), visible: new Set(visible) });

test('the course is registered after find-items, is valid, and has the customer play the terminal', () => {
  assert.equal(getModule('pay-card'), payCard); assert.equal(MODULES.findIndex(m => m.id === 'pay-card'), MODULES.findIndex(m => m.id === 'find-items') + 1);
  assert.deepEqual(validateModule(payCard, isKnownSpot), []); assert.equal(payCard.card, 'manual'); assert.ok(payCard.routes.includes('pay'));
});

test('Guide steps are finished by the right press, cart or window', () => {
  const g = (id: string) => by(payCard.guide, id).until;
  assert.ok(isMet(g('g-add'), snap([line('train-v-bee')]), noEvents())); assert.ok(!isMet(g('g-add'), snap([line('train-v-egg')]), noEvents()));
  assert.ok(isMet(g('g-charge'), snap([]), ev([SPOT.cartCharge]))); assert.ok(!isMet(g('g-charge'), snap([]), ev([SPOT.payCard])));
  assert.ok(isMet(g('g-card'), snap([]), ev([SPOT.payCard]))); assert.ok(!isMet(g('g-card'), snap([]), ev([SPOT.cartCharge])));
  assert.ok(isMet(g('g-tap'), snap([]), ev([SPOT.terminalTap]))); assert.ok(!isMet(g('g-tap'), snap([]), ev([SPOT.terminalInsert])));
  assert.ok(isMet(g('g-wait'), snap([]), ev([], [SPOT.receiptNone]))); assert.ok(!isMet(g('g-wait'), snap([]), ev()));
  assert.ok(isMet(g('g-receipt'), snap([]), ev([SPOT.receiptNone])));
});

test('the Receipt and Not approved buttons are window spots, so steps that point at them must allow windows', () => {
  for (const id of [SPOT.payRetry, SPOT.payOther, SPOT.receiptNone]) assert.ok(isWindowSpot(id), id);
  for (const id of [SPOT.payTotal, SPOT.payCard, SPOT.terminalTap]) assert.ok(!isWindowSpot(id), id);
  const inWindow = payCard.guide.filter(s => s.target && isWindowSpot(s.target)).map(s => s.id); assert.deepEqual(inWindow, ['g-receipt']);
  assert.equal(stepRules(by(payCard.guide, 'g-receipt')).at?.sheets, true); assert.equal(stepRules(by(payCard.guide, 'g-wait')).at?.sheets, true);
  assert.equal(stepRules(by(payCard.guide, 'g-card')).at?.sheets, false);
});

test('a payment and the finished sale are expected during the steps that cause them, and a stray payment elsewhere is caught', () => {
  assert.ok(stepRules(by(payCard.guide, 'g-card')).allow.includes('tender'));
  for (const id of ['g-tap', 'g-wait', 'g-receipt']) { const a = stepRules(by(payCard.guide, id)).allow; assert.ok(a.includes('tender') && a.includes('sale'), id); }
  const add = stepRules(by(payCard.guide, 'g-add')); const base = snap([line('train-v-bee')]); const paid = { ...base, tenders: 1 };
  const d = diagnose(add, { tabs: ['checkout'], routes: ['cart', 'pay'] }, base, paid); assert.equal(d?.kind, 'tender');
});

test('Check 1: neither goal starts finished, and each is finished by a sale with the Receipt window closed', () => {
  const [a, b] = payCard.check1; assert.equal(a.id, 'card-sale');
  for (const gl of payCard.check1) { assert.ok(!isMet(gl.until, snap([]), noEvents()), `${gl.id} does not start finished`); assert.ok(!isMet(gl.until, snap([]), noEvents())); }
  assert.ok(!isMet(a.until, snap([], { sales: 1, sheets: 1 }), noEvents()), 'the Receipt window is still open'); assert.ok(isMet(a.until, snap([], { sales: 1 }), noEvents()));
  assert.ok(!isMet(b.until, snap([], { sales: 1 }), noEvents()), 'the second goal needs the second sale'); assert.ok(isMet(b.until, snap([], { sales: 2 }), noEvents()));
});

test('Check 1: the second sale is over the contactless limit, so the customer must key a PIN', () => {
  const start = applyInjections(buildSandbox(real), by(payCard.check1, 'pin-sale').inject); const total = start.pos.cart.lines.reduce((n: number, l: any) => n + l.qty * (start.data.variants[l.variantId]?.priceCents ?? 0), 0);
  assert.ok(total > CONTACTLESS_LIMIT_CENTS, `total ${total}`);
  const first = applyInjections(buildSandbox(real), by(payCard.check1, 'card-sale').inject); const under = first.pos.cart.lines.reduce((n: number, l: any) => n + l.qty * (first.data.variants[l.variantId]?.priceCents ?? 0), 0); assert.ok(under <= CONTACTLESS_LIMIT_CENTS);
});

test('Check 2: the card is declined the stated number of times, with a real response code, and each goal says where the fix was taught', () => {
  const [once, twice] = payCard.check2; assert.equal(declinesOf(once.inject), 1); assert.equal(declineCodeOf(once.inject), '51'); assert.equal(declinesOf(twice.inject), 2); assert.equal(declineCodeOf(twice.inject), '54'); assert.ok(RESPONSE_CODES['54']);
  for (const g of payCard.check2) assert.ok(g.taughtBy, `${g.id} says where it was taught`);
  assert.ok(payCard.show.steps.some(s => s.id === once.taughtBy) && payCard.show.steps.some(s => s.id === twice.taughtBy));
  for (const g of payCard.check2) { const start = applyInjections(buildSandbox(real), g.inject); assert.ok(start.pos.cart.lines.length > 0, `${g.id} starts with a cart to pay for`); assert.ok(!isMet(g.until, snap([]), noEvents())); }
  assert.ok(isMet(twice.until, snap([], { sales: 2 }), noEvents())); assert.ok(!isMet(twice.until, snap([], { sales: 1 }), noEvents()));
});

test('hints point at spots that exist, and every goal can be reached from the Payment page', () => {
  for (const g of [...payCard.check1, ...payCard.check2]) { assert.ok(isKnownSpot(g.reveal!), g.id); if (g.via) assert.ok(isKnownSpot(g.via), g.id); assert.ok(g.at?.routes?.includes('pay'), `${g.id} may use the Payment page`); assert.equal(g.at?.sheets, true, `${g.id} may use the Receipt and Not approved windows`); }
});
