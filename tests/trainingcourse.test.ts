import test from 'node:test';
import assert from 'node:assert/strict';
import { STRAY_GRACE_MS, STRAY_OFFER_RESTART_MS, diagnose, freshStray, stepRules, trackStray } from '../src/lib/trainingCourse';
import { snapOf } from '../src/lib/trainingConds';
import { SPOT, cartLineSpot, gridItemSpot } from '../src/lib/trainingSpots';
import { validateModule, type Goal, type TrainSnap } from '../src/lib/trainingModule';
import { welcome } from '../src/training/modules/welcome';
import { isKnownSpot } from '../src/lib/trainingSpots';

const frame = { tabs: ['checkout'], routes: ['cart'] };
const line = (variantId: string, qty = 1, extra: object = {}) => ({ variantId, title: variantId.replace('train-v-', ''), kind: 'item' as const, qty, ...extra });
const snap = (o: Partial<{ tab: string; route: string; sheets: number; lines: ReturnType<typeof line>[]; sales: number; customer: boolean; tenders: number; discount: boolean; note: string }> = {}): TrainSnap =>
  snapOf({ tab: o.tab ?? 'checkout', route: o.route ?? '', sheets: o.sheets ?? 0, cart: { lines: o.lines ?? [], customer: o.customer ? {} : undefined, tenders: Array(o.tenders ?? 0).fill({}), discount: o.discount ? {} : undefined, note: o.note }, sales: o.sales ?? 0, paying: false });
const goal = (allow: Goal['allow'], rest: Partial<Goal> = {}): Pick<Goal, 'allow' | 'at' | 'watch'> => ({ allow, ...rest });

test('on course: nothing changed, or only what the goal allows', () => {
  const b = snap({ lines: [line('train-v-bee')] });
  assert.equal(diagnose(goal([]), frame, b, b), null);
  assert.equal(diagnose(goal(['add']), frame, snap(), snap({ lines: [line('train-v-egg')] })), null);
  assert.equal(diagnose(goal(['remove']), frame, b, snap()), null);
});
test('a sale that completes unasked can only be fixed by starting again', () => {
  const d = diagnose(goal([]), frame, snap(), snap({ sales: 1 }))!; assert.equal(d.kind, 'sale'); assert.equal(d.fix, 'restart');
  assert.equal(diagnose(goal(['sale']), frame, snap(), snap({ sales: 1 })), null);
});
test('taking out something the sale needs says how to put it back', () => {
  const b = snap({ lines: [line('train-v-bee'), line('train-v-dragon')] });
  const d = diagnose(goal([]), frame, b, snap({ lines: [line('train-v-dragon')] }))!;
  assert.equal(d.kind, 'lost'); assert.equal(d.target, gridItemSpot('train-v-bee')); assert.match(d.say, /add it back/);
  const q = diagnose(goal([]), frame, snap({ lines: [line('train-v-bee', 3)] }), snap({ lines: [line('train-v-bee', 1)] }))!; assert.equal(q.kind, 'lost'); assert.match(q.say, /3/);
});
test('an item that should not be there points at its line, via the cart on a phone', () => {
  const d = diagnose(goal([]), frame, snap(), snap({ lines: [line('train-v-egg')] }))!;
  assert.equal(d.kind, 'extra'); assert.equal(d.target, cartLineSpot('train-v-egg')); assert.equal(d.via, SPOT.cartOpen); assert.match(d.say, /Swipe/);
});
test('too many of one item is caught only when quantity changes are not allowed', () => {
  const d = diagnose(goal(['add']), frame, snap(), snap({ lines: [line('train-v-egg', 2)] }))!; assert.equal(d.kind, 'qty'); assert.match(d.say, /one is enough/);
  assert.equal(diagnose(goal(['add', 'qty']), frame, snap(), snap({ lines: [line('train-v-egg', 2)] })), null);
  const b = snap({ lines: [line('train-v-bee', 2)] }); assert.equal(diagnose(goal([]), frame, b, snap({ lines: [line('train-v-bee', 3)] }))!.kind, 'qty');
});
test('discounts, price changes, customers, notes and payments the goal did not ask for', () => {
  const b = snap({ lines: [line('train-v-bee')] });
  assert.equal(diagnose(goal([]), frame, b, snap({ lines: [line('train-v-bee')], discount: true }))!.kind, 'discount');
  assert.equal(diagnose(goal([]), frame, b, snap({ lines: [line('train-v-bee', 1, { discount: {} })] }))!.kind, 'discount');
  assert.equal(diagnose(goal([]), frame, b, snap({ lines: [line('train-v-bee', 1, { overrideCents: 100 })] }))!.kind, 'adjust');
  assert.equal(diagnose(goal([]), frame, b, snap({ lines: [line('train-v-bee')], customer: true }))!.kind, 'customer');
  assert.equal(diagnose(goal([]), frame, b, snap({ lines: [line('train-v-bee')], note: 'hi' }))!.kind, 'note');
  const t = diagnose(goal([]), frame, b, snap({ lines: [line('train-v-bee')], tenders: 1 }))!; assert.equal(t.kind, 'tender'); assert.equal(t.fix, 'restart');
  for (const a of ['discount', 'adjust', 'customer', 'note', 'tender'] as const) assert.ok(goal([a]).allow.includes(a));
  assert.equal(diagnose(goal(['discount']), frame, b, snap({ lines: [line('train-v-bee')], discount: true })), null);
});
test('the wrong tab, page or window', () => {
  const b = snap();
  const tab = diagnose(goal([]), { tabs: ['checkout', 'more'], routes: [] }, b, snap({ tab: 'more' }), )!; assert.equal(tab, null);
  const t2 = diagnose(goal([], { at: { tabs: ['checkout'] } }), { tabs: ['checkout', 'more'], routes: [] }, b, snap({ tab: 'more' }))!; assert.equal(t2.kind, 'place'); assert.equal(t2.target, SPOT.tabCheckout);
  const r = diagnose(goal([], { at: { routes: [] } }), frame, b, snap({ route: 'cart' }))!; assert.equal(r.target, SPOT.back);
  const sh = diagnose(goal([], { at: { sheets: false } }), frame, b, snap({ sheets: 1 }))!; assert.equal(sh.kind, 'sheet'); assert.equal(sh.target, SPOT.sheetClose);
  assert.equal(diagnose(goal([]), frame, b, snap({ sheets: 2 })), null, 'sheets are allowed unless the goal says otherwise');
});
test('a module author can name a mistake that is specific to a goal, and it wins over the generic ones', () => {
  const w = { id: 'dup', when: (s: TrainSnap) => s.cart.some(l => l.qty > 1), say: 'The same item twice. Add a different one.', target: gridItemSpot('train-v-key') };
  const d = diagnose(goal(['add'], { watch: [w] }), frame, snap(), snap({ lines: [line('train-v-egg', 2)] }))!; assert.equal(d.kind, 'watch'); assert.equal(d.say, w.say);
  const bad = diagnose(goal(['add'], { watch: [{ id: 'x', when: () => { throw new Error('no'); }, say: 's' }] }), frame, snap(), snap())!; assert.equal(bad, null, 'a broken watch is never a deviation');
});
test('the person is told only after a deviation lasts, the same mistake keeps its clock, and a fix clears it', () => {
  const d = diagnose(goal([]), frame, snap(), snap({ lines: [line('train-v-egg')] }))!;
  let r = trackStray(freshStray(), d, 1000); assert.equal(r.show, null);
  r = trackStray(r.tracker, d, 1000 + STRAY_GRACE_MS); assert.equal(r.show?.id, d.id); assert.equal(r.offerRestart, false);
  r = trackStray(r.tracker, d, 1000 + STRAY_OFFER_RESTART_MS); assert.equal(r.offerRestart, true, 'stuck for a while: offer starting again');
  r = trackStray(r.tracker, null, 20000); assert.equal(r.show, null); assert.equal(r.tracker.id, null);
  const sale = diagnose(goal([]), frame, snap(), snap({ sales: 1 }))!; assert.equal(trackStray(freshStray(), sale, 5).offerRestart, true, 'a finished sale always offers it');
  const other = diagnose(goal([]), frame, snap(), snap({ lines: [line('train-v-key')] }))!; const r2 = trackStray(trackStray(freshStray(), d, 0).tracker, other, 5000); assert.equal(r2.show, null, 'a different mistake starts a new clock');
});
test('the welcome course declares what may change and its mistakes are specific', () => {
  assert.deepEqual(validateModule(welcome, isKnownSpot), []);
  const g = welcome.check2[0]; const start = snap({ lines: [line('train-v-bee'), line('train-v-dragon')] });
  assert.equal(g.until.kind === 'state' && g.until.test(snap({ lines: [line('train-v-bee')] })), true);
  assert.equal(g.until.kind === 'state' && g.until.test(snap({ lines: [line('train-v-dragon')] })), false, 'taking out the wrong item does not pass');
  assert.equal(diagnose(g, { tabs: welcome.tabs, routes: welcome.routes }, start, snap({ lines: [line('train-v-dragon')] }))!.kind, 'watch');
});
test('the validator insists on allow, and on known tabs, pages and spots', () => {
  const m = JSON.parse(JSON.stringify(welcome, (_k, v) => (typeof v === 'function' ? undefined : v)));
  const clone = { ...welcome, check1: [{ ...welcome.check1[0], allow: undefined as any }], check2: welcome.check2 };
  assert.ok(validateModule(clone, isKnownSpot).some(e => e.includes('must say what may change')));
  const c2 = { ...welcome, check1: [{ ...welcome.check1[0], allow: ['fly' as any], at: { tabs: ['more'], routes: ['pay'] } }] };
  const errs = validateModule(c2, isKnownSpot); assert.ok(errs.some(e => e.includes('"fly"')) && errs.some(e => e.includes('"more"')) && errs.some(e => e.includes('"pay"')));
});

test('a Guide step is checked with the same rules as a Check goal', () => {
  const press = stepRules({ until: { kind: 'press', id: gridItemSpot('train-v-bee') } });
  assert.deepEqual(press.allow, ['add']);
  assert.deepEqual(stepRules({ until: { kind: 'press', id: cartLineSpot('train-v-bee') } }).allow, ['remove']);
  assert.deepEqual(stepRules({ until: { kind: 'next' } }).allow, []);
  assert.deepEqual(stepRules({ until: { kind: 'press', id: gridItemSpot('x') }, allow: [] }).allow, [], 'an explicit allow always wins');
  // On the "tap the bee" step, adding the bee is fine, but a second one, a discount or a window is not.
  const at = { tabs: ['checkout'], routes: [], sheets: false };
  const rules = stepRules({ until: { kind: 'press', id: gridItemSpot('train-v-bee') }, at });
  assert.equal(diagnose(rules, frame, snap(), snap({ lines: [line('train-v-bee')] })), null);
  assert.equal(diagnose(rules, frame, snap(), snap({ lines: [line('train-v-bee', 2)] }))!.kind, 'qty');
  assert.equal(diagnose(rules, frame, snap(), snap({ sheets: 1 }))!.kind, 'sheet');
  // On a Next-only step nothing may change at all.
  const next = stepRules({ until: { kind: 'next' } }); const b = snap({ lines: [line('train-v-bee')] });
  assert.equal(diagnose(next, frame, b, b), null);
  assert.equal(diagnose(next, frame, b, snap())!.kind, 'lost');
  assert.equal(diagnose(next, frame, b, snap({ lines: [line('train-v-bee'), line('train-v-egg')] }))!.kind, 'extra');
});
test('a step can carry its own watch rule', () => {
  const rules = stepRules({ until: { kind: 'next' }, watch: [{ id: 'bee-gone', when: s => !s.cart.some(l => l.variantId === 'train-v-bee'), say: 'Add the bee back.', target: gridItemSpot('train-v-bee') }] });
  const d = diagnose(rules, frame, snap(), snap())!; assert.equal(d.kind, 'watch'); assert.equal(d.target, gridItemSpot('train-v-bee'));
});
test('the validator holds Guide steps to the same rules as goals', () => {
  const ok = () => isKnownSpot;
  const good = { ...welcome }; assert.deepEqual(validateModule(good, ok()), []);
  const bad = (f: (g: typeof welcome.guide) => void) => { const g = welcome.guide.map(s => ({ ...s })); f(g); return validateModule({ ...welcome, guide: g }, ok()); };
  assert.match(bad(g => { delete g[3].allow; }).join('\n'), /must say what may change/);
  assert.match(bad(g => { g[1].allow = ['explode' as never]; }).join('\n'), /unknown change/);
  assert.match(bad(g => { g[1].at = { tabs: ['more'] }; }).join('\n'), /does not allow/);
  assert.match(bad(g => { g[2].watch = [{ id: 'a', when: () => false, say: '', target: 'nope' }]; }).join('\n'), /says nothing/);
});
