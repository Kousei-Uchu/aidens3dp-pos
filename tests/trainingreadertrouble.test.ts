// Location: tests/trainingreadertrouble.test.ts
// The "When the reader is not ready" course: valid, registered after the swap-cash course, the Guide opens Support &
// diagnostics and uses the two reader buttons, each Check goal is won only by the right state, the reader really can be
// made not-ready without touching the real terminal, and the reader spots live on the right pages.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readerTroubleModule } from '../src/training/modules/reader-trouble';
import { MODULES, getModule } from '../src/training';
import { validateModule, type TrainSnap } from '../src/lib/trainingModule';
import { SPOT, isKnownSpot, isWindowSpot } from '../src/lib/trainingSpots';
import { screenOfSpot } from '../src/lib/appControls';
import { isMet, noEvents, snapOf, type Events } from '../src/lib/trainingConds';
import { applyInjections, buildSandbox } from '../src/lib/trainingSandbox';

const real: any = { settings: { staff: [], requirePin: false, receipt: { serverUrl: 'https://real.example' }, inventory: {} }, data: {}, grid: {}, gridVersion: 0, pos: { saved: [] }, sync: {}, zeller: {}, staffId: undefined, unlocked: true };
const snap = (o: { tab?: string; route?: string; sheets?: number; reader?: { ready: boolean; message?: string }; sales?: number; lastSaleKinds?: string[] } = {}): TrainSnap =>
  snapOf({ tab: o.tab ?? 'more', route: o.route ?? 'diagnostics', sheets: o.sheets ?? 0, reader: o.reader, cart: { lines: [] }, sales: o.sales ?? 0, paying: false, lastSaleKinds: o.lastSaleKinds });
const ev = (...pressed: string[]): Events => ({ pressed: new Set(pressed), visible: new Set() });
const step = (list: { id: string; until: any }[], id: string) => list.find(x => x.id === id)!.until;
const won = (list: { id: string; until: any }[], id: string, s: TrainSnap, e: Events = noEvents()) => isMet(step(list, id), s, e);

test('the course is registered after Swap my cash, is valid, and lives on Checkout and More', () => {
  assert.equal(getModule('reader-trouble'), readerTroubleModule);
  assert.equal(MODULES.findIndex(m => m.id === 'reader-trouble'), MODULES.findIndex(m => m.id === 'swap-cash') + 1, 'it sits after the swap-cash course');
  assert.deepEqual(validateModule(readerTroubleModule, () => true), []);
  assert.deepEqual(readerTroubleModule.tabs, ['checkout', 'more']);
  assert.deepEqual(readerTroubleModule.routes, ['cart', 'pay', 'diagnostics']);
  assert.equal(readerTroubleModule.practiceStaff, false);
});

test('the Info and Show pictures are valid, and the Show uses both reader buttons', () => {
  assert.ok(readerTroubleModule.info.steps.length >= 3);
  assert.ok(readerTroubleModule.show.steps.some(s => s.tap === 'd-setup'));
  assert.ok(readerTroubleModule.show.steps.some(s => s.tap === 'd-check'));
  assert.ok(readerTroubleModule.show.steps.some(s => s.screen === 'diag'));
});

test('Guide steps open Support & diagnostics and use Check reader and Setup (pair terminal)', () => {
  assert.ok(!won(readerTroubleModule.guide, 'g-open', snap({ tab: 'checkout', route: '' })));
  assert.ok(won(readerTroubleModule.guide, 'g-open', snap({ tab: 'more', route: 'diagnostics' })));
  assert.ok(!won(readerTroubleModule.guide, 'g-check', snap()));
  assert.ok(won(readerTroubleModule.guide, 'g-check', snap(), ev('diagnostics.check')));
  assert.ok(!won(readerTroubleModule.guide, 'g-setup', snap()));
  assert.ok(won(readerTroubleModule.guide, 'g-setup', snap(), ev('diagnostics.setup')));
});

test('Check goals are won only by the right state, and Check 2 makes something go wrong', () => {
  // Check 1: pair the reader, then take a card payment.
  assert.ok(!won(readerTroubleModule.check1, 'r-pair', snap({ reader: { ready: false } })));
  assert.ok(won(readerTroubleModule.check1, 'r-pair', snap({ reader: { ready: true } })));
  assert.ok(!won(readerTroubleModule.check1, 'r-card', snap({ lastSaleKinds: ['card'] })));
  assert.ok(won(readerTroubleModule.check1, 'r-card', snap({ sales: 1, lastSaleKinds: ['card'] })));
  assert.ok(!won(readerTroubleModule.check1, 'r-card', snap({ sales: 1, lastSaleKinds: ['cash'] })));

  // Check 2: a declined card is not reader trouble; an offline reader means cash.
  assert.ok(readerTroubleModule.check2.some(g => g.inject?.length), 'something must go wrong in Check 2');
  const taughtIds = new Set([...readerTroubleModule.info.steps, ...readerTroubleModule.show.steps].map(s => s.id));
  for (const g of readerTroubleModule.check2) {
    assert.ok(g.taughtBy && taughtIds.has(g.taughtBy), `${g.id} says which step taught it`);
  }
  assert.ok(!won(readerTroubleModule.check2, 'r-decline', snap()), 'a declined-card goal does not start finished');
  assert.ok(won(readerTroubleModule.check2, 'r-decline', snap({ sales: 1, sheets: 0, lastSaleKinds: ['card'] })));
  assert.ok(!won(readerTroubleModule.check2, 'r-offline', snap({ sales: 1, sheets: 0, lastSaleKinds: ['card'] })), 'cash and card are not the same');
  assert.ok(won(readerTroubleModule.check2, 'r-offline', snap({ sales: 1, sheets: 0, lastSaleKinds: ['cash'] })));
});

test('the practice reader starts ready, and a reader injection makes it not ready without touching the real terminal', () => {
  assert.equal(buildSandbox(real).zeller.ready, true);
  const start = applyInjections(buildSandbox(real), [{ kind: 'reader', ready: false, message: 'Terminal not paired' }]);
  assert.equal(start.zeller.ready, false);
  assert.equal(start.zeller.message, 'Terminal not paired');
  // Offline is a different message, and ready again is a plain true.
  assert.equal(applyInjections(buildSandbox(real), [{ kind: 'reader', ready: false, message: 'No internet' }]).zeller.message, 'No internet');
  assert.equal(applyInjections(buildSandbox(real), [{ kind: 'reader', ready: true }]).zeller.ready, true);
});

test('the reader spots live on the More tab and Support & diagnostics, not in a window', () => {
  assert.equal(screenOfSpot(SPOT.moreDiagnostics), 'tab_more');
  assert.equal(screenOfSpot(SPOT.diagnosticsSetup), 'page_diagnostics');
  assert.equal(screenOfSpot(SPOT.diagnosticsCheck), 'page_diagnostics');
  for (const id of [SPOT.moreDiagnostics, SPOT.diagnosticsSetup, SPOT.diagnosticsCheck]) {
    assert.ok(isKnownSpot(id), `${id} is a known spot`);
    assert.ok(!isWindowSpot(id), `${id} is a page spot, not a window spot`);
  }
});

test('in practice, checking and pairing the reader never touch the real terminal', () => {
  const b = fs.readFileSync('src/zellerBridge.tsx', 'utf8');
  const check = b.slice(b.indexOf('export async function checkReader'), b.indexOf('export async function pairReader'));
  assert.ok(check.includes('isTraining()') && check.indexOf('isTraining()') < check.indexOf('handle.initialise'), 'checkReader reads the practice reader, not the real one');
  const pair = b.slice(b.indexOf('export async function pairReader'));
  assert.ok(pair.includes('isTraining()') && pair.indexOf('isTraining()') < pair.indexOf('handle.setup'), 'pairReader never pairs the real terminal during practice');
});
