// Location: tests/trainingoffline.test.ts
// The "When the internet is down" course: valid, registered after the reader-trouble course, the Guide takes a cash
// sale offline and then hunts the queue, each Check goal is won only by the right state, the practice outbox is made
// up and never uploaded, and the offline spots live on the right pages.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { offlineModule } from '../src/training/modules/offline';
import { MODULES, getModule } from '../src/training';
import { validateModule, type TrainSnap } from '../src/lib/trainingModule';
import { SPOT, isKnownSpot, outboxRetrySpot } from '../src/lib/trainingSpots';
import { screenOfSpot } from '../src/lib/appControls';
import { isMet, noEvents, snapOf, type Events } from '../src/lib/trainingConds';
import { FIXTURE_OUTBOX_SALE, applyInjections, buildSandbox } from '../src/lib/trainingSandbox';

const real: any = { settings: { staff: [], requirePin: false, receipt: { serverUrl: 'https://real.example' }, inventory: {} }, data: {}, grid: {}, gridVersion: 0, pos: { saved: [] }, sync: {}, zeller: {}, staffId: undefined, unlocked: true };
const snap = (o: { tab?: string; route?: string; sheets?: number; reader?: { ready: boolean; message?: string }; outbox?: { stuck: number; queued: number }; sales?: number; lastSaleKinds?: string[]; cash?: { received: number; due: number; step: 'receive' | 'change' } } = {}): TrainSnap =>
  snapOf({ tab: o.tab ?? 'checkout', route: o.route ?? '', sheets: o.sheets ?? 0, reader: o.reader, outbox: o.outbox, cart: { lines: [] }, sales: o.sales ?? 0, paying: false, lastSaleKinds: o.lastSaleKinds, cash: o.cash });
const ev = (...pressed: string[]): Events => ({ pressed: new Set(pressed), visible: new Set() });
const step = (list: { id: string; until: any }[], id: string) => list.find(x => x.id === id)!.until;
const won = (list: { id: string; until: any }[], id: string, s: TrainSnap, e: Events = noEvents()) => isMet(step(list, id), s, e);
const queued = (n: number) => ({ stuck: 0, queued: n });

test('the course is registered after the reader-trouble course, valid, and starts offline', () => {
  assert.equal(getModule('offline'), offlineModule);
  assert.equal(MODULES.findIndex(m => m.id === 'offline'), MODULES.findIndex(m => m.id === 'reader-trouble') + 1);
  assert.deepEqual(validateModule(offlineModule, isKnownSpot), []);
  assert.equal(offlineModule.startSync, 'offline');
  assert.deepEqual(offlineModule.tabs, ['checkout', 'notifications', 'more']);
  assert.deepEqual(offlineModule.routes, ['cart', 'pay', 'diagnostics']);
});

test('the Info and Show are valid, and the Show walks the queue and a stuck Retry', () => {
  assert.ok(offlineModule.show.steps.some(s => s.tap === 'q-retry'));
  assert.ok(offlineModule.show.screens.some(s => s.id === 'queue'));
  assert.ok(offlineModule.info.steps.length >= 3 && offlineModule.recap.length >= 3);
});

test('the Guide takes a cash sale, finds it queued, then pushes it from Support & diagnostics', () => {
  assert.ok(!won(offlineModule.guide, 'g-queued', snap({ tab: 'checkout' })));
  assert.ok(won(offlineModule.guide, 'g-queued', snap({ tab: 'notifications' })));
  assert.ok(!won(offlineModule.guide, 'g-more', snap({ tab: 'notifications' })));
  assert.ok(won(offlineModule.guide, 'g-more', snap({ tab: 'more' })));
  assert.ok(!won(offlineModule.guide, 'g-diag', snap({ tab: 'more', route: '' })));
  assert.ok(won(offlineModule.guide, 'g-diag', snap({ tab: 'more', route: 'diagnostics' })));
  assert.ok(!won(offlineModule.guide, 'g-sync', snap({ tab: 'more', route: 'diagnostics' })));
  assert.ok(won(offlineModule.guide, 'g-sync', snap({ tab: 'more', route: 'diagnostics' }), ev(SPOT.diagnosticsSync)));
  assert.ok(!won(offlineModule.guide, 'g-twenty', snap({ cash: { received: 1000, due: 1400, step: 'receive' } })));
  assert.ok(won(offlineModule.guide, 'g-twenty', snap({ cash: { received: 2000, due: 1400, step: 'receive' } })));
});

test('Check 1 goals are won only by the right state', () => {
  const done = snap({ sheets: 0, sales: 1, lastSaleKinds: ['cash'], outbox: queued(1) });
  assert.ok(won(offlineModule.check1, 'o-cash', done), 'a closed cash sale with a queued outbox wins');
  assert.ok(!won(offlineModule.check1, 'o-cash', snap({ sheets: 0, sales: 1, lastSaleKinds: ['cash'], outbox: queued(0) })), 'no queued sale yet');
  assert.ok(!won(offlineModule.check1, 'o-cash', snap({ sheets: 1, sales: 1, lastSaleKinds: ['cash'], outbox: queued(1) })), 'the receipt is still open');
  assert.ok(!won(offlineModule.check1, 'r-find', snap({ tab: 'checkout', outbox: queued(1) })));
  assert.ok(won(offlineModule.check1, 'r-find', snap({ tab: 'notifications', outbox: queued(1) })));
});

test('Check 2 goals are won only by the right state, and Check 2 makes something go wrong', () => {
  assert.ok(offlineModule.check2.every(g => g.inject?.length), 'something must go wrong in Check 2');
  const taughtIds = new Set([...offlineModule.info.steps, ...offlineModule.show.steps].map(s => s.id));
  for (const g of offlineModule.check2) assert.ok(g.taughtBy && taughtIds.has(g.taughtBy), `${g.id} says which step taught it`);

  // An offline card is not usable, so the sale is taken by cash.
  assert.ok(!won(offlineModule.check2, 'r-card-offline', snap({ sheets: 0, sales: 1, lastSaleKinds: ['card'], outbox: queued(1) })), 'a card sale is not a cash sale');
  assert.ok(won(offlineModule.check2, 'r-card-offline', snap({ sheets: 0, sales: 1, lastSaleKinds: ['cash'], outbox: queued(1) })));
  // A stuck sale is retried, not duplicated.
  assert.ok(!won(offlineModule.check2, 'r-retry', snap({ outbox: { stuck: 1, queued: 1 } })), 'a stuck sale is not already retried');
  assert.ok(won(offlineModule.check2, 'r-retry', snap({ outbox: { stuck: 0, queued: 1 } })));
});

test('the practice outbox starts empty, offline is a real state, and a stuck injection holds a made-up sale', () => {
  assert.equal(buildSandbox(real).sync.state, 'idle');
  assert.equal(buildSandbox(real, { sync: 'offline' }).sync.state, 'offline');
  assert.equal(buildSandbox(real).pos.outbox.length, 0, 'the practice outbox starts empty');

  const seeded = applyInjections(buildSandbox(real), [{ kind: 'outbox', stuck: 1 }]);
  assert.equal(seeded.pos.outbox.length, 1);
  assert.equal(seeded.pos.outbox[0].blocked, true);
  assert.equal(seeded.pos.outbox[0].sale.uuid, FIXTURE_OUTBOX_SALE);
  assert.ok(seeded.pos.outbox[0].id.startsWith('train-'), 'practice outbox items start with train-');
  // A plain queue is not stuck, and ready again is a plain empty outbox.
  assert.equal(applyInjections(buildSandbox(real), [{ kind: 'outbox', queued: 2 }]).pos.outbox.filter(o => o.blocked).length, 0);
  assert.equal(buildSandbox(real).pos.outbox.length, 0);
});

test('the offline spots live on the right pages, and the retry spot is on Notifications', () => {
  assert.equal(screenOfSpot(SPOT.tabNotifications), 'tab_notifications');
  assert.equal(screenOfSpot(SPOT.moreDiagnostics), 'tab_more');
  assert.equal(screenOfSpot(SPOT.diagnosticsSync), 'page_diagnostics');
  assert.equal(screenOfSpot(outboxRetrySpot(FIXTURE_OUTBOX_SALE)), 'tab_notifications');
  assert.ok(isKnownSpot(outboxRetrySpot(FIXTURE_OUTBOX_SALE)), 'the per-sale Retry spot is a known spot');
});

test('in practice the outbox is never uploaded', () => {
  const sync = fs.readFileSync('src/lib/sync.ts', 'utf8');
  const send = sync.slice(sync.indexOf('export async function processOutbox'), sync.indexOf('export const retryBlocked'));
  assert.ok(send.includes('hasCreds()') && send.indexOf('hasCreds()') < send.indexOf('for (const o of'), 'processOutbox does nothing without credentials, so practice sales never upload');
});
