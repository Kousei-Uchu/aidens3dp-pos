// Location: tests/appnavgraph.test.ts
// The app graph and the guidance engine. Checks the file parses and validates, that every place can be reached from
// somewhere, that every spot training can point at has a home on the graph, and that the engine adds the walk to a
// fix only when the person is not already where the fix lives (so the old behaviour is never changed).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { APP_NAVGRAPH, APP_NAVSCHEMA } from '../src/lib/appNavgraph.generated';
import { SPOT, STATIC_SPOTS, DYNAMIC_PREFIXES, gridItemSpot, cartLineSpot, lineMinusSpot, lineNoteSpot, scanCardSpot } from '../src/lib/trainingSpots';
import { screenOfSpot, gestureOfSpot } from '../src/lib/appControls';
import { tree, stateNode, reachable, roleCanReach, guidanceCandidates, routeNavSteps, planToSpot, nodeForSpot, hasSpotNode, registerRuntimeSpots, syncRuntimeFromSnap, clearRuntimeSpots, scopeForModule, scopeForReal, metaInScope, screenInScope } from '../src/lib/appGraph';
import { fixCandidates, type Deviation } from '../src/lib/trainingCourse';

const root = path.resolve(import.meta.dirname, '..');

test('the embedded graph matches src/app.navgraph', () => {
  const onDisk = fs.readFileSync(path.join(root, 'src', 'app.navgraph'), 'utf8');
  assert.equal(APP_NAVGRAPH, onDisk, 'run npm run graph:build');
});

test('the graph loads and validates', () => {
  const t = tree();
  assert.ok(t, 'the graph must load');
  for (const id of ['tab_checkout', 'tab_inventory', 'tab_transactions', 'tab_notifications', 'tab_more']) assert.ok(t!.screen(id), `missing ${id}`);
  for (const id of ['page_pay', 'page_cart', 'page_orders', 'page_reports', 'page_settings', 'page_staff', 'page_diagnostics', 'page_help', 'page_training', 'page_terminal_play']) assert.ok(t!.screen(id), `missing ${id}`);
  assert.ok(t!.edges.length > 100, 'the graph should be substantial');
});

test('every tab and page is reachable from Checkout', () => {
  const seen = new Set(reachable('tab_checkout'));
  for (const id of ['tab_inventory', 'tab_transactions', 'tab_notifications', 'tab_more', 'page_pay', 'page_orders', 'page_training', 'page_terminal_play']) assert.ok(seen.has(id), `${id} not reachable from Checkout`);
});

test('the bottom bar is a direct tap between every pair of tabs', () => {
  const t = tree()!;
  for (const a of ['tab_checkout', 'tab_inventory', 'tab_transactions', 'tab_notifications', 'tab_more'])
    for (const b of ['tab_checkout', 'tab_inventory', 'tab_transactions', 'tab_notifications', 'tab_more'])
      if (a !== b) assert.ok(t.outgoing(a).some(e => e.to === b), `${a} -> ${b} missing`);
});

test('every static spot has a home on the graph', () => {
  for (const spot of STATIC_SPOTS) {
    if (spot === SPOT.back || spot === SPOT.sheetClose) { assert.equal(screenOfSpot(spot), undefined); continue; }
    assert.ok(screenOfSpot(spot), `no screen for static spot ${spot}`);
  }
});

test('every dynamic spot prefix has a home on the graph', () => {
  for (const prefix of DYNAMIC_PREFIXES) assert.ok(screenOfSpot(`${prefix}x`), `no screen for prefix ${prefix}`);
});

test('controls know their gesture', () => {
  assert.equal(gestureOfSpot(cartLineSpot('bee')), 'swipe-left');
  assert.equal(gestureOfSpot(gridItemSpot('bee')), 'tap');
  assert.equal(gestureOfSpot(lineMinusSpot('bee')), 'tap');
});

test('stateNode reads where the person is', () => {
  assert.equal(stateNode({ tab: 'checkout', route: '', where: undefined, locked: false }), 'tab_checkout');
  assert.equal(stateNode({ tab: 'more', route: 'orders', where: undefined, locked: false }), 'page_orders');
  assert.equal(stateNode({ tab: 'checkout', route: '', where: { tab: 'keypad', depth: 0, sizes: false }, locked: false }), 'view_keypad');
  assert.equal(stateNode({ tab: 'checkout', route: '', where: { tab: 'all', depth: 0, sizes: false }, locked: false }), 'view_all');
  assert.equal(stateNode({ tab: 'checkout', route: '', where: undefined, locked: true }), 'overlay_lock');
});

test('roles gate the admin pages', () => {
  assert.equal(roleCanReach('cashier', 'page_staff'), false);
  assert.equal(roleCanReach('manager', 'page_staff'), true);
  assert.equal(roleCanReach('owner', 'page_settings'), true);
  assert.equal(roleCanReach('cashier', 'tab_checkout'), true);
});

function deviation(over: Partial<Deviation>): Deviation {
  return { id: 'x', kind: 'lost', title: 't', say: 'Do the thing.', fix: 'undo', ...over };
}

test('when the person is already where the fix lives, nothing is added', () => {
  const d = deviation({ target: gridItemSpot('bee') });
  const snap = { tab: 'checkout', route: '', where: undefined, locked: false, sheets: 0 };
  const got = guidanceCandidates(d, snap, false);
  assert.deepEqual(got, fixCandidates(d, false));
  assert.deepEqual(routeNavSteps(d, snap, false), []);
});

test('a cart fix from another tab is walked back to Checkout', () => {
  const d = deviation({ target: gridItemSpot('bee'), say: 'Tap its tile to add it back.' });
  const snap = { tab: 'more', route: '', where: undefined, locked: false, sheets: 0 };
  const nav = routeNavSteps(d, snap, false);
  assert.ok(nav.length >= 1, 'expected a walk');
  assert.equal(nav[nav.length - 1].target, SPOT.tabCheckout);
  assert.match(nav[nav.length - 1].say, /Tap its tile to add it back\./);
});

test('the plain fix always leads, in its own words, and the graph only adds behind it', () => {
  const d = deviation({ target: SPOT.tabCheckout, say: 'That is not where this part happens.' });
  const snap = { tab: 'more', route: '', where: undefined, locked: false, sheets: 1 };
  const got = guidanceCandidates(d, snap, true);
  assert.equal(got[0].say, d.say, 'the leading candidate keeps the exact wording');
  const closeCand = got.find(c => c.target === SPOT.sheetClose);
  assert.ok(closeCand, 'closing the window is still offered');
  assert.match(closeCand!.say, /^Close this window first\./);
});

test('routeNavSteps offers closing the window first when a fix sits under one', () => {
  const d = deviation({ target: SPOT.tabCheckout, say: 'That is not where this part happens.' });
  const snap = { tab: 'more', route: '', where: undefined, locked: false, sheets: 1 };
  const nav = routeNavSteps(d, snap, true);
  assert.equal(nav[0].target, SPOT.sheetClose);
  assert.match(nav[0].say, /^Close this window first\./);
});

test('a fix inside the window is not told to close it', () => {
  const d = deviation({ target: SPOT.customerCreate, say: 'Tap Create customer.' });
  const snap = { tab: 'checkout', route: '', where: undefined, locked: false, sheets: 1 };
  assert.deepEqual(routeNavSteps(d, snap, true).filter(c => c.target === SPOT.sheetClose), []);
});

test('runtime controls join the graph and carry their gesture', () => {
  registerRuntimeSpots([cartLineSpot('bee')]);
  assert.ok(hasSpotNode(cartLineSpot('bee')));
  const steps = planToSpot(cartLineSpot('bee'), 'tab_checkout');
  assert.ok(steps.length >= 1, 'expected a route to the cart line');
  assert.equal(steps[steps.length - 1].target, cartLineSpot('bee'));
  assert.equal(steps[steps.length - 1].gesture, 'swipe-left');
});

test('the sale on the till puts its cart lines on the graph', () => {
  syncRuntimeFromSnap({ cart: [{ variantId: 'bee', title: 'Bumble Bee', kind: 'item', qty: 2, discounted: false, adjusted: false }, { title: 'Custom amount', kind: 'custom', qty: 1, discounted: false, adjusted: false, lineId: 'c1' }] });
  assert.ok(hasSpotNode(cartLineSpot('bee')), 'a real cart line is on the graph');
  assert.ok(hasSpotNode(lineMinusSpot('bee')), "a line's window controls are on the graph");
  assert.ok(hasSpotNode(lineMinusSpot('c1')), 'a custom line, keyed by its own id, is on the graph too');
});

test('an unknown spot is placed nowhere and guided honestly', () => {
  assert.equal(screenOfSpot('not.a.real.spot'), undefined);
  const d = deviation({ target: 'not.a.real.spot' });
  const snap = { tab: 'checkout', route: '', where: undefined, locked: false, sheets: 0 };
  assert.deepEqual(routeNavSteps(d, snap, false), []);
  assert.deepEqual(guidanceCandidates(d, snap, false), fixCandidates(d, false));
});

test('nodeForSpot is a safe screen id', () => {
  assert.match(nodeForSpot('line.minus:bee'), /^[A-Za-z_][A-Za-z0-9_]*$/);
  assert.equal(nodeForSpot(gridItemSpot('bee')), 'do_grid_item_bee');
});

// ----------------------------------------------------------------- scopes ----
// The same control can live on a different place in a course and in the everyday till, and a course only ever exists on
// the tabs and routes it allows. A scope says which run a plan is for, so guidance never walks a person through a place
// outside it (a practice-only window in the real till, the real camera in practice, a page the course never opens).
const scanning = scopeForModule({ id: 'scanning', tabs: ['checkout'], routes: ['cart', 'pay'] });
const signIn = scopeForModule({ id: 'sign-in', tabs: ['checkout'], routes: [] });
const cartOnly = scopeForModule({ id: 'cart', tabs: ['checkout'], routes: ['cart'] });

test('a place with no scope tag is in every run', () => {
  assert.equal(metaInScope({}, scopeForReal()), true);
  assert.equal(metaInScope({}, cartOnly), true);
  assert.equal(metaInScope({ modules: ['scanning'] }, cartOnly), false);
  assert.equal(metaInScope({ modules: ['scanning'] }, scanning), true);
  assert.equal(screenInScope('tab_checkout', cartOnly), true);
  assert.equal(screenInScope('page_pay', cartOnly), false);
});

test('the real camera and the practice camera are kept apart by scope', () => {
  const practice = new Set(reachable('tab_checkout', scanning));
  assert.ok(practice.has('overlay_practice_camera'), 'practice reaches the practice camera');
  assert.ok(!practice.has('overlay_camera'), 'practice never reaches the real camera');
  const real = new Set(reachable('tab_checkout', scopeForReal()));
  assert.ok(real.has('overlay_camera'), 'the everyday till reaches the real camera');
  assert.ok(!real.has('overlay_practice_camera'), 'the everyday till never reaches the practice camera');
});

test('the practice pass exists only in the sign-in course', () => {
  assert.ok(new Set(reachable('overlay_lock', signIn)).has('overlay_practice_pass'));
  assert.ok(!new Set(reachable('overlay_lock', cartOnly)).has('overlay_practice_pass'));
});

test('a course never reaches a page its routes do not allow', () => {
  const cart = new Set(reachable('tab_checkout', cartOnly));
  assert.ok(cart.has('page_cart'), 'the cart page is in the cart course');
  assert.ok(!cart.has('page_pay'), 'payment is not in a cart-only course');
  assert.ok(!cart.has('page_orders'), 'orders is not in a cart-only course');
  assert.ok(new Set(reachable('tab_checkout', scanning)).has('page_pay'), 'payment is in a course that allows it');
});

test('a fix whose place is outside the run adds no walk', () => {
  const d = deviation({ target: SPOT.payCash, say: 'Tap Cash.' });
  const snap = { tab: 'more', route: '', where: undefined, locked: false, sheets: 0 };
  assert.ok(routeNavSteps(d, snap, false).length >= 1, 'without a scope the walk is planned');
  assert.deepEqual(routeNavSteps(d, snap, false, cartOnly), []);
  assert.deepEqual(guidanceCandidates(d, snap, false, cartOnly), fixCandidates(d, false));
});

test('a practice-only control walks in through the practice camera, and is refused elsewhere', () => {
  const d = deviation({ target: scanCardSpot('bee'), say: 'Scan the Bumble Bee.' });
  const snap = { tab: 'checkout', route: '', where: undefined, locked: false, sheets: 0 };
  const steps = routeNavSteps(d, snap, false, scanning);
  assert.ok(steps.some(c => c.target === SPOT.scanCamera), 'the walk opens the camera');
  assert.deepEqual(routeNavSteps(d, snap, false, cartOnly), []);
  const toSpot = planToSpot(scanCardSpot('bee'), 'tab_checkout', scanning);
  assert.equal(toSpot[toSpot.length - 1].target, scanCardSpot('bee'));
});

test('runtime controls can be forgotten when the practice data is swapped out', () => {
  registerRuntimeSpots([cartLineSpot('moth')]);
  assert.ok(hasSpotNode(cartLineSpot('moth')));
  clearRuntimeSpots();
  assert.equal(hasSpotNode(cartLineSpot('moth')), false);
});

test('a runtime instance can carry a run tag, so another run never names it', () => {
  clearRuntimeSpots();
  registerRuntimeSpots([{ spot: gridItemSpot('bee'), modules: ['scanning'] }]);
  const node = nodeForSpot(gridItemSpot('bee'));
  assert.equal(screenInScope(node, scanning), true, 'it is in the scanning run');
  assert.equal(screenInScope(node, scopeForReal()), false, 'it is not in the everyday till');
  assert.equal(screenInScope(node, cartOnly), false, 'it is not in a cart-only course');
  assert.deepEqual(planToSpot(gridItemSpot('bee'), 'tab_checkout', scopeForReal()), [], 'the everyday till cannot walk to a course-only tile');
  const mine = planToSpot(gridItemSpot('bee'), 'tab_checkout', scanning);
  assert.equal(mine[mine.length - 1]?.target, gridItemSpot('bee'), 'the scanning run can');
  clearRuntimeSpots();
});

test('a runtime instance with no run tag is in every run', () => {
  clearRuntimeSpots();
  registerRuntimeSpots([gridItemSpot('tad')]);
  const node = nodeForSpot(gridItemSpot('tad'));
  assert.equal(screenInScope(node, scopeForReal()), true);
  assert.equal(screenInScope(node, cartOnly), true);
  const walk = planToSpot(gridItemSpot('tad'), 'tab_checkout', scopeForReal());
  assert.equal(walk[walk.length - 1]?.target, gridItemSpot('tad'));
  clearRuntimeSpots();
});

// ------------------------------------------------------- per line windows ----
// Each cart line's editor is its own node (sheet_line:<key>, a copy of the sheet_line template), so a walk names the
// exact window a fix is in: it points at that line to open its window, and, while the window is open, it knows the
// person is already there rather than telling them to close it.
test('each item window is its own node, named by the line it is for', () => {
  clearRuntimeSpots();
  registerRuntimeSpots([lineNoteSpot('bee')]);
  assert.equal(stateNode({ tab: 'checkout', route: '', where: undefined, locked: false, openLine: 'bee' }), 'sheet_line:bee');
  const steps = planToSpot(lineNoteSpot('bee'), 'tab_checkout');
  assert.equal(steps[0].target, cartLineSpot('bee'), 'the walk points at that line to open its window');
  assert.match(steps[0].say, /Open the item's window first\./);
  assert.equal(steps[steps.length - 1].target, lineNoteSpot('bee'));
  clearRuntimeSpots();
});

test('a fix inside the open item window is not told to close it, and one outside walks out through it', () => {
  clearRuntimeSpots();
  registerRuntimeSpots([lineMinusSpot('bee')]);
  const open = { tab: 'checkout', route: '', where: undefined, locked: false, sheets: 1, openLine: 'bee' };
  const inside = deviation({ target: cartLineSpot('bee'), window: { say: 'Tap the minus button.', target: lineMinusSpot('bee') } });
  assert.deepEqual(routeNavSteps(inside, open, true).filter(c => c.target === SPOT.sheetClose), [], 'no close step for a fix in the open window');
  const outside = deviation({ target: gridItemSpot('bee') });
  const nav = routeNavSteps(outside, open, true);
  assert.equal(nav[0].target, SPOT.sheetClose, 'a fix outside the window closes it first');
  assert.ok(nav.some(c => c.target === SPOT.lineDone), 'and walks out through Done');
  clearRuntimeSpots();
});
