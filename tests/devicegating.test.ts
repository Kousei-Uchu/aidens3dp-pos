// Location: tests/devicegating.test.ts
// Help, the assistant and Training follow the device's features (patch 0181): a companion does not see pages, screens or courses for
// a feature it does not hold, and a register sees everything exactly as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { builtinHelp, helpSetForDevice } from '../src/lib/helpBuiltin';
import { pageAvailable, pagesForDevice, validatePages, parsePage } from '../src/lib/helpDocs';
import { builtinScreens, screensFor } from '../src/lib/assistantScreens';
import { offlineSearch } from '../src/lib/assistantOffline';
import { MODULES } from '../src/training';
import { FEATURE_IDS, moduleAvailable } from '../src/lib/appMode';

const pages = builtinHelp().pages;
const ids = (list: { id: string }[]) => list.map(p => p.id);

test('a register sees every help page, and the index is the one it always was', () => {
  assert.equal(pagesForDevice(pages, 'register', {}).length, pages.length);
  assert.equal(pagesForDevice(pages, undefined, undefined).length, pages.length);
  assert.equal(helpSetForDevice(builtinHelp(), 'register', {}), builtinHelp());
});

test('a companion with nothing switched on has no cash, card or selling pages', () => {
  const shown = ids(pagesForDevice(pages, 'companion', {}));
  for (const id of ['cash', 'cash/open-close', 'cash/float-report', 'pay', 'pay/card', 'pay/cash', 'sales/cart-and-prices', 'sales/saved-carts', 'fix/reader', 'fix/cant-make-change']) assert.ok(!shown.includes(id), id);
  for (const id of ['start', 'device-mode', 'sales', 'sales/scanners', 'sales/variants-and-stock', 'orders', 'settings', 'concepts']) assert.ok(shown.includes(id), id);
});

test('switching a feature on brings its pages back, and only its pages', () => {
  const withDrawer = ids(pagesForDevice(pages, 'companion', { cashDrawer: true }));
  assert.ok(withDrawer.includes('cash') && withDrawer.includes('cash/swap-cash') && !withDrawer.includes('pay/card'));
  const withReader = ids(pagesForDevice(pages, 'companion', { cardReader: true }));
  assert.ok(!withReader.includes('pay/card') && !withReader.includes('cash')); // the card page sits under Pay, a Selling section, so it waits for Selling too
  assert.ok(ids(pagesForDevice(pages, 'companion', { selling: true, cardReader: true })).includes('pay/card'));
  const all = Object.fromEntries(FEATURE_IDS.map(f => [f, true]));
  assert.equal(pagesForDevice(pages, 'companion', all).length, pages.length);
});

test('no shown page hangs from a hidden parent, and every needs value is a real feature', () => {
  for (const f of [{}, { cardReader: true }, { cashDrawer: true }, { selling: true }]) {
    const shown = pagesForDevice(pages, 'companion', f); const have = new Set(ids(shown));
    for (const p of shown) assert.ok(!p.parent || have.has(p.parent), `${p.id} under ${p.parent}`);
  }
  for (const p of pages) for (const n of p.needs ?? []) assert.ok((FEATURE_IDS as readonly string[]).includes(n), `${p.id}: ${n}`);
  const bad = parsePage('x.md', '---\nid: x\ntitle: X\nparent: start\nneeds: [nonsense]\nsummary: s\n---\n## Basic\nhi\n');
  assert.ok('page' in bad && validatePages([{ ...bad.page, file: 'x.md' }]).some(i => /not a feature/.test(i.problem)));
  assert.equal(pageAvailable({ needs: undefined }, 'companion', {}), true);
});

test('the assistant knows no screen of a feature the device does not hold', () => {
  const reg = screensFor('register', {});
  assert.ok(!ids(reg).includes('tab_today') && !ids(reg).includes('tab_scan'), 'a register has no Today or Scan');
  assert.ok(ids(reg).includes('tab_checkout') && ids(reg).includes('page_drawer'));
  const comp = ids(screensFor('companion', {}));
  for (const id of ['tab_checkout', 'page_drawer', 'sheet_cash_receive', 'sheet_cash_change']) assert.ok(!comp.includes(id), id);
  for (const id of ['tab_today', 'tab_scan', 'tab_inventory', 'tab_more']) assert.ok(comp.includes(id), id);
  assert.ok(ids(screensFor('companion', { selling: true })).includes('tab_checkout'));
  assert.ok(ids(screensFor('companion', { cashDrawer: true })).includes('page_drawer'));
});

test('searching for the cash drawer finds nothing on a companion without it, and finds it with it', () => {
  const find = (features: object) => offlineSearch({ pages: pagesForDevice(pages, 'companion', features), screens: screensFor('companion', features), role: 'owner' }, 'cash drawer float');
  const none = find({}); assert.equal(none.screens.filter(s => /drawer/i.test(s.name)).length, 0); assert.equal(none.pages.filter(p => /^cash/.test(p.id)).length, 0);
  const some = find({ cashDrawer: true }); assert.ok(some.screens.some(s => /drawer/i.test(s.name)) || some.pages.some(p => /^cash/.test(p.id)));
});

test('Training lists every course on a register, and a companion only the ones it can use', () => {
  assert.equal(MODULES.filter(m => moduleAvailable('register', {}, m)).length, MODULES.length);
  const bare = MODULES.filter(m => moduleAvailable('companion', {}, m));
  for (const m of bare) { assert.ok(!m.tabs.includes('checkout'), m.id); assert.ok(!m.routes.includes('drawer'), m.id); }
  assert.ok(bare.length < MODULES.length, 'the register courses are hidden');
  assert.equal(MODULES.filter(m => moduleAvailable('companion', { tillTraining: true }, m)).length, MODULES.length); // the Till training group brings them all back
});

test('the screens that show these lists ask the device gate', () => {
  const read = (p: string) => fs.readFileSync(p, 'utf8');
  assert.ok(read('src/screens/Help.tsx').includes('helpSetForDevice(helpSet, devMode, devFeatures)'));
  assert.ok(read('src/screens/Assistant.tsx').includes('pagesForDevice(builtinHelp().pages, devMode, devFeatures)') && read('src/screens/Assistant.tsx').includes('screensFor(devMode, devFeatures)'));
  assert.ok(read('src/screens/Training.tsx').includes('moduleAvailable(devMode, devFeatures, m)'));
});
