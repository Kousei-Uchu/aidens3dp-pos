// Location: tests/trainingswapcash.test.ts
// The "Swap my cash" course: valid, registered next to the other cash and till courses, the Guide follows opening the
// drawer, opening the swap window, entering what you hold, reading the swap and recording it, each Check goal is won only
// by the right state, the practice drawer is made up and never reaches Shopify, and the probe round-trips.
import test from 'node:test';
import assert from 'node:assert/strict';
import { swapCashModule } from '../src/training/modules/swap-cash';
import { MODULES, getModule } from '../src/training';
import { validateModule, type TrainSnap } from '../src/lib/trainingModule';
import { SPOT, isKnownSpot, isWindowSpot } from '../src/lib/trainingSpots';
import { screenOfSpot } from '../src/lib/appControls';
import { isMet, noEvents, snapOf, type Events } from '../src/lib/trainingConds';
import { applyInjections, buildSandbox } from '../src/lib/trainingSandbox';
import { getSwapProbe, setSwapProbe } from '../src/lib/trainingProbe';
import { planSwap } from '../src/lib/cashSwap';
import { dayScript } from '../src/lib/floatPlan';
import { buildProfile } from '../src/lib/changeScore';

const real: any = { settings: { staff: [], requirePin: false, receipt: { serverUrl: 'https://real.example' }, inventory: {} }, data: {}, grid: {}, gridVersion: 0, pos: { saved: [] }, sync: {}, zeller: {}, staffId: undefined, unlocked: true };
const snap = (o: { tab?: string; route?: string; sheets?: number; sheet?: string; swap?: { own: number; found: boolean; stopped?: 'done' | 'no-gain' | 'nothing-held' | 'time' } } = {}): TrainSnap =>
  snapOf({ tab: o.tab ?? 'more', route: o.route ?? 'drawer', sheets: o.sheets ?? 0, sheet: o.sheet, swap: o.swap, cart: { lines: [] }, sales: 0, paying: false });
const ev = (...pressed: string[]): Events => ({ pressed: new Set(pressed), visible: new Set() });
const step = (list: { id: string; until: any }[], id: string) => list.find(x => x.id === id)!.until;
const won = (list: { id: string; until: any }[], id: string, s: TrainSnap, e: Events = noEvents()) => isMet(step(list, id), s, e);

test('the course is registered after Check change, is valid, and lives on More and the Cash drawer', () => {
  assert.equal(getModule('swap-cash'), swapCashModule);
  assert.equal(MODULES.findIndex(m => m.id === 'swap-cash'), MODULES.findIndex(m => m.id === 'check-change') + 1, 'it sits after the check-change course');
  assert.deepEqual(validateModule(swapCashModule, () => true), []);
  assert.deepEqual(swapCashModule.tabs, ['more']); assert.deepEqual(swapCashModule.routes, ['drawer']);
  assert.equal(swapCashModule.practiceStaff, false);
});

test('the Info and Show pictures are valid and end on the Swap my cash window', () => {
  assert.ok(swapCashModule.info.steps.length >= 3);
  assert.ok(swapCashModule.show.steps.some(s => s.tap === 'swap-btn'));
  assert.ok(swapCashModule.show.steps.some(s => s.screen === 'swap-window'));
  assert.ok(swapCashModule.show.steps.some(s => s.tap === 'record-btn'));
});

test('Guide steps follow opening the drawer, the swap window, entering cash, reading the swap and recording it', () => {
  assert.ok(!won(swapCashModule.guide, 'g1', snap({ tab: 'checkout', route: '' })));
  assert.ok(won(swapCashModule.guide, 'g1', snap({ tab: 'more', route: 'drawer' })));
  assert.ok(!won(swapCashModule.guide, 'g2', snap()));
  assert.ok(won(swapCashModule.guide, 'g2', snap({ sheet: 'sheet_drawer_swap' })));
  assert.ok(!won(swapCashModule.guide, 'g3', snap({ sheet: 'sheet_drawer_swap', swap: { own: 0, found: false } })));
  assert.ok(won(swapCashModule.guide, 'g3', snap({ sheet: 'sheet_drawer_swap', swap: { own: 5000, found: false } })));
  assert.ok(!won(swapCashModule.guide, 'g4', snap({ sheet: 'sheet_drawer_swap', swap: { own: 5000, found: false } })));
  assert.ok(won(swapCashModule.guide, 'g4', snap({ sheet: 'sheet_drawer_swap', swap: { own: 5000, found: true } })));
  assert.ok(!won(swapCashModule.guide, 'g5', snap({ sheet: 'sheet_drawer_swap' })));
  assert.ok(won(swapCashModule.guide, 'g5', snap({ sheet: 'sheet_drawer_swap' }), ev('swap.record')));
});

test('Check goals are won only by the right state, and Check 2 makes something go wrong', () => {
  assert.ok(!won(swapCashModule.check1, 'c1', snap()));
  assert.ok(won(swapCashModule.check1, 'c1', snap({ sheet: 'sheet_drawer_swap' })));
  assert.ok(!won(swapCashModule.check1, 'c2', snap({ sheet: 'sheet_drawer_swap', swap: { own: 5000, found: false } })));
  assert.ok(won(swapCashModule.check1, 'c2', snap({ sheet: 'sheet_drawer_swap', swap: { own: 5000, found: true } })));
  assert.ok(won(swapCashModule.check1, 'c3', snap({ sheet: 'sheet_drawer_swap' }), ev('swap.record')));

  assert.ok(swapCashModule.check2.some(g => g.inject?.length), 'something must go wrong in Check 2');
  const showIds = new Set(swapCashModule.show.steps.map(s => s.id));
  for (const g of swapCashModule.check2) {
    assert.ok(g.taughtBy && showIds.has(g.taughtBy), `${g.id} says which Show step taught it`);
    assert.ok(!won(swapCashModule.check2, g.id, snap({ sheet: 'sheet_drawer_swap', swap: { own: 0, found: false } })), `${g.id} does not start finished`);
  }
  // The no-gain goal only wins when the drawer really cannot spare anything useful.
  assert.ok(!won(swapCashModule.check2, 'c4', snap({ sheet: 'sheet_drawer_swap', swap: { own: 5000, found: true } })));
  assert.ok(won(swapCashModule.check2, 'c4', snap({ sheet: 'sheet_drawer_swap', swap: { own: 5000, found: false, stopped: 'no-gain' } })));
});

test('the Check 2 ledger injection really makes the practice drawer unable to swap a $50', () => {
  const goal = swapCashModule.check2.find(g => g.id === 'c4')!;
  const start = applyInjections(buildSandbox(real), goal.inject);
  const script = dayScript(buildProfile({ entries: [], sales: [], prices: Object.values(start.data.variants).map((v: any) => v.priceCents) }));
  const p = planSwap(start.pos.ledger.counts, { '5000': 1 }, script, { budgetMs: 2000 });
  assert.equal(p.stopped, 'no-gain', 'the practice drawer has nothing it can spare');
  assert.deepEqual(p.give, {}); assert.deepEqual(p.take, {});
});

test('the practice ledger always has a within-it swap, so the Guide and Check 1 can be won', () => {
  const start = buildSandbox(real);
  const script = dayScript(buildProfile({ entries: [], sales: [], prices: Object.values(start.data.variants).map((v: any) => v.priceCents) }));
  const p = planSwap(start.pos.ledger.counts, { '5000': 1 }, script, { budgetMs: 2000 });
  assert.equal(p.stopped, 'done');
  assert.ok(p.give['5000'] === 1);
});

test('the swap spots live in the Swap my cash window and the probe round-trips', () => {
  for (const id of [SPOT.swapPad, SPOT.swapRecord, SPOT.swapClose]) {
    assert.ok(isKnownSpot(id), `${id} is a known spot`);
    assert.ok(isWindowSpot(id), `${id} is a window spot`);
    assert.equal(screenOfSpot(id), 'sheet_drawer_swap', `${id} lives in the Swap my cash window`);
  }
  // The probe is a plain read/write window onto the open swap window.
  setSwapProbe({ own: 5000, found: true, stopped: 'done' });
  assert.deepEqual(getSwapProbe(), { own: 5000, found: true, stopped: 'done' });
  setSwapProbe(undefined);
  assert.equal(getSwapProbe(), undefined);
});
