// Location: tests/appMode.test.ts
// The device mode gate (Companion plan, patch 0176). Two rules matter here: a Register has every feature whatever is
// stored, and a Companion only narrows what a person's role and display mode already allow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_FEATURES, DEFAULT_FEATURES, DEVICE_MODES, FEATURE_GROUPS, FEATURE_IDS,
  featureOn, readDeviceMode, readFeatures, readMode, resolveFeatures, routeAllowed, rowAllowed, tabAllowed,
} from '../src/lib/appMode';
import { TAB_ORDER, MORE_GROUPS } from '../src/lib/uiMode';
import { COMPANION_TAB_ORDER, deviceTabs, homeTab, isCompanionTab } from '../src/lib/appMode';

test('only the two known modes are read, anything else is a register', () => {
  assert.deepEqual(DEVICE_MODES, ['register', 'companion']);
  assert.equal(readMode('companion'), 'companion');
  assert.equal(readMode('register'), 'register');
  for (const odd of [undefined, null, '', 'Companion', 'tablet', 1, {}, []]) assert.equal(readMode(odd), 'register');
});

test('every group has a title, a summary and at least one item', () => {
  assert.deepEqual(FEATURE_GROUPS.map(g => g.id), FEATURE_IDS);
  for (const g of FEATURE_GROUPS) {
    assert.ok(g.title.length > 0);
    assert.ok(g.summary.length > 0);
    assert.ok(g.items.length > 0);
  }
});

test('a companion starts with every group off, a register with every group on', () => {
  assert.deepEqual(DEFAULT_FEATURES, { selling: false, cardReader: false, cashDrawer: false, staffTools: false, tillDisplay: false, tillTraining: false });
  assert.deepEqual(resolveFeatures('companion', undefined), DEFAULT_FEATURES);
  assert.deepEqual(resolveFeatures('register', undefined), ALL_FEATURES);
  // a register keeps every feature even when a leftover companion switch is stored as off
  assert.deepEqual(resolveFeatures('register', DEFAULT_FEATURES), ALL_FEATURES);
  assert.deepEqual(resolveFeatures('nonsense', DEFAULT_FEATURES), ALL_FEATURES);
});

test('stored switches are read one by one, with anything odd falling back to off', () => {
  assert.deepEqual(readFeatures({ selling: true, cashDrawer: true }), { ...DEFAULT_FEATURES, selling: true, cashDrawer: true });
  assert.deepEqual(readFeatures({ selling: 'yes', cashDrawer: 1, staffTools: null }), DEFAULT_FEATURES);
  assert.deepEqual(readFeatures(undefined), DEFAULT_FEATURES);
  assert.deepEqual(readFeatures(['selling']), DEFAULT_FEATURES);
  assert.equal(featureOn('companion', { selling: true }, 'selling'), true);
  assert.equal(featureOn('companion', { selling: true }, 'cashDrawer'), false);
  assert.equal(featureOn('register', {}, 'cashDrawer'), true);
});

test('the store view keeps the mode and the raw switches apart', () => {
  assert.deepEqual(readDeviceMode({ appMode: 'companion', registerFeatures: { selling: true } }), { mode: 'companion', features: { ...DEFAULT_FEATURES, selling: true } });
  assert.deepEqual(readDeviceMode({}), { mode: 'register', features: DEFAULT_FEATURES });
});

test('a register allows every tab, row and page', () => {
  for (const tab of TAB_ORDER) assert.equal(tabAllowed('register', {}, tab), !isCompanionTab(tab));
  for (const row of MORE_GROUPS.flat()) assert.equal(rowAllowed('register', {}, row), true);
  for (const route of ['cart', 'pay', 'saved', 'drawer', 'staff', 'terminalPlay', 'training', 'trainingRun', 'settings', 'help', 'orders', 'items', 'cloudSync']) {
    assert.equal(routeAllowed('register', {}, route), true);
  }
});

test('a companion keeps browsing, history, notices and More, and loses selling until it is switched on', () => {
  assert.equal(tabAllowed('companion', {}, 'checkout'), false);
  assert.equal(tabAllowed('companion', {}, 'inventory'), true);
  assert.equal(tabAllowed('companion', {}, 'transactions'), true);
  assert.equal(tabAllowed('companion', {}, 'notifications'), true);
  assert.equal(tabAllowed('companion', {}, 'more'), true);
  assert.equal(tabAllowed('companion', { selling: true }, 'checkout'), true);
});

test('a companion row and page follow their group', () => {
  const off = {};
  const on = { cashDrawer: true, staffTools: true, tillTraining: true, cardReader: true, selling: true };
  assert.equal(rowAllowed('companion', off, 'drawer'), false);
  assert.equal(rowAllowed('companion', off, 'staff'), true); // Staff stays open: the lock needs an owner PIN, made and reset there
  assert.equal(rowAllowed('companion', off, 'training'), false);
  assert.equal(rowAllowed('companion', off, 'settings'), true);
  assert.equal(rowAllowed('companion', off, 'help'), true);
  assert.equal(rowAllowed('companion', off, 'reports'), true);
  assert.equal(rowAllowed('companion', on, 'drawer'), true);
  assert.equal(rowAllowed('companion', on, 'staff'), true);
  assert.equal(rowAllowed('companion', on, 'training'), true);
  assert.equal(routeAllowed('companion', off, 'drawer'), false);
  assert.equal(routeAllowed('companion', off, 'staff'), true);
  assert.equal(routeAllowed('companion', off, 'terminalPlay'), false);
  assert.equal(routeAllowed('companion', off, 'training'), false);
  assert.equal(routeAllowed('companion', off, 'trainingRun'), false);
  assert.equal(routeAllowed('companion', off, 'cart'), false);
  assert.equal(routeAllowed('companion', off, 'pay'), false);
  assert.equal(routeAllowed('companion', off, 'saved'), false);
  // pages a companion keeps whatever it has switched off
  for (const route of ['settings', 'help', 'orders', 'items', 'customers', 'giftcards', 'reports', 'export', 'cloudSync', 'diagnostics', 'notifications', 'assistant', 'demoHome']) {
    assert.equal(routeAllowed('companion', off, route), true, route);
  }
  assert.equal(routeAllowed('companion', on, 'drawer'), true);
  assert.equal(routeAllowed('companion', on, 'cart'), true);
});

test('Today and Scan are companion tabs: a register never shows them', () => {
  for (const t of ['today', 'scan'] as const) { assert.equal(isCompanionTab(t), true); assert.equal(tabAllowed('register', {}, t), false); assert.equal(tabAllowed('companion', {}, t), true); }
  assert.equal(isCompanionTab('checkout'), false);
  assert.equal(tabAllowed('nonsense', {}, 'today'), false); // an unknown mode is a register
});

test('the tab bar: a register keeps its five, a companion gets Today and Scan, and Selling adds Checkout', () => {
  assert.deepEqual(deviceTabs('register', {}, TAB_ORDER), TAB_ORDER);
  assert.deepEqual(deviceTabs(undefined, undefined, TAB_ORDER), TAB_ORDER);
  assert.deepEqual(deviceTabs('companion', {}, TAB_ORDER), ['today', 'scan', 'inventory', 'transactions', 'more']);
  assert.deepEqual(deviceTabs('companion', { selling: true }, TAB_ORDER), ['today', 'scan', 'checkout', 'inventory', 'transactions', 'more']);
  for (const t of deviceTabs('companion', { selling: true }, TAB_ORDER)) assert.ok(COMPANION_TAB_ORDER.includes(t), t);
  assert.equal(deviceTabs('companion', {}, TAB_ORDER).includes('notifications'), false); // a bell on Today opens it
});

test('the app opens on Checkout on a register and Today on a companion, and both are always shown', () => {
  assert.equal(homeTab('register'), 'checkout'); assert.equal(homeTab(undefined), 'checkout'); assert.equal(homeTab('companion'), 'today');
  for (const [mode, f] of [['register', {}], ['companion', {}], ['companion', { selling: true }]] as const) assert.equal(tabAllowed(mode, f, homeTab(mode)), true);
});
