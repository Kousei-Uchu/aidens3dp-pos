// Location: tests/trainingcontext.test.ts
// Course correction that knows what is open: a mistake and its fix must never contradict each other (the "too many, use minus" then "close this window" bug).
import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnose, fixCandidates, stepRules } from '../src/lib/trainingCourse';
import { snapOf } from '../src/lib/trainingConds';
import { SPOT, WINDOW_SPOTS, isWindowSpot, cartLineSpot, gridItemSpot, lineMinusSpot, lineRemoveSpot } from '../src/lib/trainingSpots';
import { validateModule, type Step, type TrainingModule } from '../src/lib/trainingModule';
import { isKnownSpot } from '../src/lib/trainingSpots';
import { welcome } from '../src/training/modules/welcome';

const frame = { tabs: ['checkout'], routes: ['cart'] };
const line = (variantId: string, qty = 1) => ({ variantId, title: variantId.replace('train-v-', ''), kind: 'item' as const, qty });
const snap = (o: { sheets?: number; lines?: ReturnType<typeof line>[]; route?: string } = {}) => snapOf({ tab: 'checkout', route: o.route ?? '', sheets: o.sheets ?? 0, cart: { lines: o.lines ?? [] }, sales: 0, paying: false });
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
