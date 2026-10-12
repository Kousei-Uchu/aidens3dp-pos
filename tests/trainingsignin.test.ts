// Location: tests/trainingsignin.test.ts
// The "Sign in, lock and switch staff" course: it is valid, its practice staff really sign in, and each goal can be won (and only by the right thing).
import test from 'node:test';
import assert from 'node:assert/strict';
import { signIn } from '../src/training/modules/sign-in';
import { getModule } from '../src/training';
import { validateModule, type TrainSnap } from '../src/lib/trainingModule';
import { isKnownSpot } from '../src/lib/trainingSpots';
import { isMet, noEvents, snapOf } from '../src/lib/trainingConds';
import { PRACTICE_CASEY, PRACTICE_MORGAN, PRACTICE_PINS, applyInjections, buildSandbox, practiceStaff } from '../src/lib/trainingSandbox';
import { CANCELLED_PASS_CODE, PRACTICE_PASS_CODE, passStateOf } from '../src/lib/trainingPass';
import { findByBadge } from '../src/lib/badge';
import { verifyPin } from '../src/lib/pin';

const real: any = { settings: { staff: [], requirePin: false, receipt: {} }, data: {}, grid: {}, gridVersion: 0, pos: {}, sync: {}, zeller: {}, staffId: undefined, unlocked: true };
const base = (over: Partial<TrainSnap> = {}): TrainSnap => ({ ...snapOf({ tab: 'checkout', route: '', cart: { lines: [] }, sales: 0, paying: false }), ...over });

test('the course is registered and valid', () => {
  assert.equal(getModule('sign-in'), signIn); assert.equal(signIn.practiceStaff, true);
  assert.deepEqual(validateModule(signIn, isKnownSpot), []);
});
test('practice staff have the PINs and the pass the course teaches', async () => {
  const st = practiceStaff();
  for (const [m, pin] of [[st[0], PRACTICE_PINS.casey], [st[1], PRACTICE_PINS.morgan]] as const) { assert.ok(await verifyPin(m.salt, pin, m.pinHash)); assert.ok(!(await verifyPin(m.salt, '0000', m.pinHash))); }
  assert.equal(findByBadge(st, PRACTICE_PASS_CODE)?.id, PRACTICE_MORGAN);
  assert.equal(findByBadge(st, CANCELLED_PASS_CODE), null, 'a cancelled pass matches nobody');
  assert.equal(st[0].badgeHash, undefined, 'Casey has no pass');
});
test('the practice till starts as Casey, and injections move between people', () => {
  const sb = buildSandbox(real, { practiceStaff: true });
  assert.equal(sb.staffId, PRACTICE_CASEY); assert.equal(sb.unlocked, true); assert.equal(sb.settings.staff.length, 2); assert.equal(sb.settings.requirePin, true);
  const locked = applyInjections(sb, [{ kind: 'staff', who: 'locked' }]); assert.equal(locked.unlocked, false); assert.equal(locked.staffId, undefined);
  const m = applyInjections(locked, [{ kind: 'staff', who: 'morgan' }]); assert.equal(m.staffId, PRACTICE_MORGAN); assert.equal(m.unlocked, true);
  assert.equal(applyInjections(m, [{ kind: 'staff', who: 'casey' }]).staffId, PRACTICE_CASEY);
});
test('a course without practice staff can never lock or change the real till', () => {
  const plain = buildSandbox(real); assert.equal(plain.settings.staff.length, 0);
  const out = applyInjections(plain, [{ kind: 'staff', who: 'locked' }, { kind: 'staff', who: 'morgan' }]);
  assert.equal(out.unlocked, true); assert.equal(out.staffId, undefined);
});
test('the pass injection only applies while its goal runs', () => {
  assert.equal(passStateOf([{ kind: 'pass', state: 'cancelled' }]), 'cancelled'); assert.equal(passStateOf([]), 'good'); assert.equal(passStateOf(undefined), 'good');
});
test('each goal is won only by the right sign-in state', () => {
  const won = (id: string, s: TrainSnap, list = [...signIn.check1, ...signIn.check2]) => isMet(list.find(g => g.id === id)!.until, s, noEvents());
  assert.ok(won('c1-pass', base({ staffId: PRACTICE_MORGAN, locked: false }))); assert.ok(!won('c1-pass', base({ staffId: PRACTICE_CASEY, locked: false })));
  assert.ok(won('c1-lock', base({ staffId: undefined, locked: true }))); assert.ok(!won('c1-lock', base({ staffId: PRACTICE_MORGAN, locked: false })));
  assert.ok(won('c1-pin', base({ staffId: PRACTICE_CASEY, locked: false }))); assert.ok(!won('c1-pin', base({ staffId: PRACTICE_MORGAN, locked: false })));
  assert.ok(won('c2-cancelled', base({ staffId: PRACTICE_MORGAN, locked: false })));
  const line = { title: 'x', kind: 'item' as const, qty: 1, discounted: false, adjusted: false };
  assert.ok(won('c2-mid-sale', base({ staffId: PRACTICE_MORGAN, locked: false, lines: 2, cart: [line, line] })));
  assert.ok(!won('c2-mid-sale', base({ staffId: PRACTICE_MORGAN, locked: false, lines: 0 })), 'switching must not cost the cart');
});
test('Check 2 problems are customer or staff side, and each says where it was taught', () => {
  for (const g of signIn.check2) { assert.ok(g.inject?.length, g.id); assert.ok(g.taughtBy, g.id); }
  assert.ok(signIn.check2.some(g => g.inject?.some(i => i.kind === 'pass')));
});

test('the sign in steps fall back to the tile that opens the window, deepest first, instead of a dead end', async () => {
  const { SPOT, gridActionSpot } = await import('../src/lib/trainingSpots'); const { signIn } = await import('../src/training/modules/sign-in');
  const step = (id: string) => signIn.guide.find(s => s.id === id)!; const SWITCH = gridActionSpot('switch_staff');
  assert.deepEqual(step('g-pass-open').recoverFrom!.map(r => r.target), [SWITCH]);
  assert.deepEqual(step('g-pass-scan').recoverFrom!.map(r => r.target), [SPOT.loginScanPass, SWITCH]);
  assert.deepEqual(step('g-pin').recoverFrom!.map(r => r.target), [SWITCH], 'signed in as someone else: reopen the switch window');
  assert.equal(typeof step('g-lock').aim, 'function'); assert.equal(step('g-lock').recover!.target, SPOT.tabCheckout);
  for (const id of ['g-pass-open', 'g-pass-scan', 'g-lock', 'g-pin']) assert.ok(step(id).gesture, `${id} says how to reach its target`);
});
