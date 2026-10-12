// Location: tests/trainingcontext.test.ts
// Course correction that knows what is open: a mistake and its fix must never contradict each other (the "too many, use minus" then "close this window" bug).
import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnose, fixCandidates, stepRules } from '../src/lib/trainingCourse';
import { snapOf } from '../src/lib/trainingConds';
import { SPOT, WINDOW_SPOTS, isWindowSpot, cartLineSpot, gridItemSpot, lineMinusSpot, lineRemoveSpot, lineDiscountOffSpot, lineDiscountSpot, linePriceOffSpot, lineAdjustOffSpot, lineNoteSpot, findTabSpot } from '../src/lib/trainingSpots';
import { validateModule, type Step, type TrainingModule } from '../src/lib/trainingModule';
import { isKnownSpot } from '../src/lib/trainingSpots';
import { welcome } from '../src/training/modules/welcome';

const frame = { tabs: ['checkout'], routes: ['cart'] };
const line = (variantId: string, qty = 1) => ({ variantId, title: variantId.replace('train-v-', ''), kind: 'item' as const, qty });
const snap = (o: { sheets?: number; lines?: any[]; route?: string; where?: any } = {}) => snapOf({ tab: 'checkout', route: o.route ?? '', sheets: o.sheets ?? 0, where: o.where, cart: { lines: o.lines ?? [] }, sales: 0, paying: false });
// The welcome course's first Check: add things, no windows.
const goal = { allow: ['add', 'remove'] as const, at: { tabs: ['checkout'], routes: [], sheets: false } };

test('the reported bug: too many of an item, then the line window opens. One message, and it is about the minus button', () => {
  const base = snap({ lines: [line('train-v-bee')] }); const tooMany = snap({ lines: [line('train-v-bee', 3)] });
  const page = diagnose({ ...goal, allow: ['add', 'remove'] }, frame, base, tooMany)!; assert.equal(page.kind, 'qty');
  const open = diagnose({ ...goal, allow: ['add', 'remove'] }, frame, base, snap({ lines: [line('train-v-bee', 3)], sheets: 1 }))!;
  assert.equal(open.kind, 'qty', 'opening the window to fix it is not a new mistake (it used to flip to "not needed, close it")');
  const c = fixCandidates(open, true); assert.equal(c[0].target, lineMinusSpot('train-v-bee')); assert.match(c[0].say, /minus/i); assert.doesNotMatch(c[0].say, /does not need this window/i);
  assert.equal(c[0].gesture, 'tap');
});

test('with no mistake in the cart, a window this task does not need is still reported', () => {
  const base = snap({ lines: [line('train-v-bee')] }); const d = diagnose({ ...goal, allow: ['add', 'remove'] }, frame, base, snap({ lines: [line('train-v-bee')], sheets: 1 }))!;
  assert.equal(d.kind, 'sheet'); assert.equal(d.target, SPOT.sheetClose);
});

test('page first, then the bar that opens the cart, when no window is open', () => {
  const d = diagnose({ allow: [] }, frame, snap(), snap({ lines: [line('train-v-egg')] }))!; assert.equal(d.kind, 'extra');
  const c = fixCandidates(d, false); assert.equal(c[0].target, cartLineSpot('train-v-egg')); assert.equal(c[0].gesture, 'swipe-left', 'the cursor shows the swipe that removes a line');
  assert.equal(c[1].target, SPOT.cartOpen); assert.match(c[1].say, /^Open the cart first/);
});

test('an extra item with the line window open points at Remove item in that window', () => {
  const d = diagnose({ allow: [] }, frame, snap(), snap({ lines: [line('train-v-egg')], sheets: 1 }))!; const c = fixCandidates(d, true);
  assert.equal(c[0].target, lineRemoveSpot('train-v-egg')); assert.match(c[0].say, /Remove item/); assert.equal(c[1].target, SPOT.sheetClose, 'falls back to closing a window that is not the line window');
  assert.match(c[1].say, /^Close this window first\./);
});

test('a removed item cannot be fixed under a window, so it asks for the window to close first', () => {
  const d = diagnose({ allow: [] }, frame, snap({ lines: [line('train-v-bee')] }), snap({ sheets: 1 }))!; assert.equal(d.kind, 'lost');
  const c = fixCandidates(d, true); assert.equal(c[0].target, SPOT.sheetClose); assert.match(c[0].say, /Close this window first/); assert.match(c[0].say, /tile/);
  assert.equal(fixCandidates(d, false)[0].target, gridItemSpot('train-v-bee'));
});

test('no candidate ever tells the person to close the window that holds the fix', () => {
  const cases = [
    diagnose({ allow: [] }, frame, snap(), snap({ lines: [line('train-v-egg')], sheets: 1 })), diagnose({ allow: [] }, frame, snap({ lines: [line('train-v-egg')] }), snap({ lines: [line('train-v-egg', 4)], sheets: 1 })),
    diagnose({ allow: [] }, frame, snap({ lines: [line('train-v-egg')] }), snap({ sheets: 1 })),
  ];
  for (const d of cases) { assert.ok(d); const c = fixCandidates(d!, true)[0]; if (d!.window && d!.window.target !== SPOT.sheetClose) assert.ok(isWindowSpot(c.target!) && c.target !== SPOT.sheetClose, `${d!.kind}: the first thing shown is the fix inside the window`); }
});

test('a Guide step does not allow windows unless it says so, or waits for one to open', () => {
  const step = (o: Partial<Step>): Step => ({ id: 's', say: 'x', until: { kind: 'next' }, ...o });
  assert.equal(stepRules(step({})).at?.sheets, false); assert.equal(stepRules(step({ until: { kind: 'visible', id: 'sheet.close' } })).at?.sheets, true);
  assert.equal(stepRules(step({ at: { sheets: true } })).at?.sheets, true); assert.equal(stepRules(step({ at: { tabs: ['checkout'] } })).at?.tabs?.[0], 'checkout');
  // So the swipe step: the line window opening is off course, and the card points at Close.
  const rules = stepRules(welcome.guide.find(s => s.id === 'g-remove')!); const base = snap({ lines: [line('train-v-bee')] });
  const d = diagnose(rules, frame, base, snap({ lines: [line('train-v-bee')], sheets: 1 }))!; assert.equal(d.kind, 'sheet'); assert.equal(d.target, SPOT.sheetClose);
});

// Rebuild the real module with one step swapped, so the checker sees exactly what an author would write.
const withStep = (s: Step): TrainingModule => ({ ...welcome, guide: [...welcome.guide.filter(g => g.id !== s.id), s] });
test('the checker: gestures are known, a state step says how to reach its target, window controls say windows are allowed', () => {
  assert.deepEqual(validateModule(welcome, isKnownSpot), []);
  const remove = welcome.guide.find(s => s.id === 'g-remove')!;
  assert.ok(validateModule(withStep({ ...remove, gesture: undefined }), isKnownSpot).some(e => /how to reach it \(gesture\)/.test(e)));
  assert.ok(validateModule(withStep({ ...remove, gesture: 'pinch' as never }), isKnownSpot).some(e => /unknown gesture/.test(e)));
  const win: Step = { id: 'g-minus', say: 'x', target: lineMinusSpot('train-v-bee'), until: { kind: 'press', id: lineMinusSpot('train-v-bee') } };
  assert.ok(validateModule(withStep(win), isKnownSpot).some(e => /inside a window/.test(e)));
  assert.ok(!validateModule(withStep({ ...win, at: { sheets: true, tabs: ['checkout'], routes: [] } }), isKnownSpot).some(e => /inside a window/.test(e)));
});

test('each line has its own window buttons, so the guide can tell which item is open', () => {
  assert.notEqual(lineRemoveSpot('train-v-egg'), lineRemoveSpot('train-v-bee')); assert.ok(isKnownSpot(lineRemoveSpot('train-v-egg'))); assert.ok(WINDOW_SPOTS.includes(SPOT.sheetClose));
  // The extra item is the egg. With the BEE's window open, the egg's Remove button does not exist, so the person is told to close this window first, naming the egg.
  const d = diagnose({ allow: [] }, frame, snap({ lines: [line('train-v-bee')] }), snap({ lines: [line('train-v-bee'), line('train-v-egg')], sheets: 1 }))!; const c = fixCandidates(d, true);
  assert.equal(c[0].target, lineRemoveSpot('train-v-egg')); assert.equal(c[1].target, SPOT.sheetClose); assert.match(c[1].say, /^Close this window first\./); assert.match(c[1].say, /egg|train-v-egg/i);
});

test('a discount or price change that was not asked for is walked back down the fix, deepest step first', () => {
    const disc = { ...line('train-v-egg'), discount: {} }; const base = snap({ lines: [line('train-v-egg')] });
  const d = diagnose({ allow: [] }, frame, base, snap({ lines: [disc] }))!; assert.equal(d.kind, 'discount');
  const open = fixCandidates(d, true).map(c => c.target); assert.deepEqual(open, [lineDiscountOffSpot('train-v-egg'), lineDiscountSpot('train-v-egg'), SPOT.sheetClose]);
  const shut = fixCandidates(d, false).map(c => c.target); assert.equal(shut[0], lineDiscountOffSpot('train-v-egg')); assert.ok(shut.includes(cartLineSpot('train-v-egg'))); assert.equal(shut[shut.length - 1], SPOT.cartOpen);
  const priced = { ...line('train-v-egg'), overrideCents: 100 }; const dp = diagnose({ allow: [] }, frame, base, snap({ lines: [priced] }))!; assert.equal(dp.kind, 'adjust');
  assert.equal(fixCandidates(dp, true)[0].target, linePriceOffSpot('train-v-egg'));
  const adjusted = { ...line('train-v-egg'), adjust: { finalCents: 100 } }; assert.equal(fixCandidates(diagnose({ allow: [] }, frame, base, snap({ lines: [adjusted] }))!, true)[0].target, lineAdjustOffSpot('train-v-egg'));
  const cust = diagnose({ allow: [] }, frame, base, snapOf({ tab: 'checkout', route: '', cart: { lines: [line('train-v-egg')], customer: {} }, sales: 0, paying: false }))!; assert.equal(cust.target, SPOT.cartCustomerOff);
});
test('wandering off the grid on a goal that lives on the grid is corrected one move at a time', () => {
  const goal = { allow: [], at: { tabs: ['checkout'], routes: ['cart'], view: 'top' as const } }; const at = (tab: string, depth = 0, sizes = false) => snap({ where: { tab, depth, sizes } });
  assert.equal(diagnose(goal, frame, snap(), at('quick')), null);
  assert.equal(diagnose(goal, frame, snap(), at('keypad'))!.target, findTabSpot('quick')); assert.equal(diagnose(goal, frame, snap(), at('quick', 1, true))!.target, SPOT.findBack); assert.equal(diagnose(goal, frame, snap(), at('quick', 2))!.target, SPOT.findBack);
  assert.equal(diagnose({ ...goal, at: { ...goal.at, view: 'grid' as const } }, frame, snap(), at('quick', 2)), null, 'grid allows being inside a category');
  assert.equal(diagnose({ allow: [], at: { tabs: ['checkout'], routes: ['cart'] } }, frame, snap(), at('keypad')), null, 'a goal with no view rule is left alone');
});

test('a cart discount, a whole order price and a note are walked back through the cart menu, deepest step first', () => {
  const base = snap({ lines: [line('train-v-egg')] }); const mk = (o: any) => snapOf({ tab: 'checkout', route: '', cart: { lines: [line('train-v-egg')], ...o }, sales: 0, paying: false });
  const d = diagnose({ allow: [] }, frame, base, mk({ discount: {} }))!; assert.equal(d.kind, 'discount');
  assert.deepEqual(fixCandidates(d, false).slice(0, 3).map(c => c.target), [SPOT.cartDiscountOff, SPOT.cartMenuDiscount, SPOT.cartMenu]);
  assert.deepEqual(fixCandidates(d, true).map(c => c.target), [SPOT.cartDiscountOff, SPOT.cartMenuDiscount, SPOT.cartMenu, SPOT.sheetClose]);
  const o = diagnose({ allow: [] }, frame, base, mk({ orderAdjust: {} }))!; assert.equal(o.kind, 'adjust'); assert.deepEqual(fixCandidates(o, false).slice(0, 3).map(c => c.target), [SPOT.cartOrderOff, SPOT.cartMenuOrder, SPOT.cartMenu]);
  const n = diagnose({ allow: [] }, frame, base, snap({ lines: [{ ...line('train-v-egg'), note: 'gift' }] }))!; assert.equal(n.kind, 'note');
  assert.equal(fixCandidates(n, true)[0].target, lineNoteSpot('train-v-egg')); assert.equal(n.target, cartLineSpot('train-v-egg'));
  assert.equal(diagnose({ allow: ['note'] }, frame, base, snap({ lines: [{ ...line('train-v-egg'), note: 'gift' }] })), null, 'a goal that allows notes is not corrected');
  assert.ok(WINDOW_SPOTS.includes(SPOT.cartDiscountOff) && WINDOW_SPOTS.includes(SPOT.cartMenuDiscount) && !WINDOW_SPOTS.includes(SPOT.cartMenu));
});
test('the shared grid fallbacks steer the cart and find items steps back', async () => {
  const { gridAim, tabsAim } = await import('../src/training/aims'); const { cart } = await import('../src/training/modules/cart'); const { welcome } = await import('../src/training/modules/welcome');
  const at = (tab: any, depth = 0, sizes = false) => snap({ where: { tab, depth, sizes } });
  assert.equal(gridAim('inside')(at('keypad'))!.target, findTabSpot('quick')); assert.equal(gridAim('inside')(at('quick', 2)), null); assert.equal(tabsAim(at('quick', 0, true))!.target, SPOT.findBack); assert.equal(tabsAim(at('quick')), null);
  for (const id of ['g-add-second', 'g-add-third', 'g-qty']) assert.equal(typeof cart.guide.find(s => s.id === id)!.aim, 'function', id);
  assert.equal(welcome.guide.find(s => s.id === 'g-tile')!.gesture, 'tap');
});
