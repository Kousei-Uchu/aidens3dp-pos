// Location: tests/stepup.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AUTO_LOCK_CHOICES, MAX_STEP_UP_TRIES, STEP_UP_CHOICES, STEP_UP_INFO, STEP_UP_ROUTES, lockDue, readMinutes, stepUpForRoute, stepUpNeeded, tooManyTries } from '../src/lib/stepUp';
import { lockRequired } from '../src/lib/appMode';
import { DEVICE_KEYS } from '../src/lib/backupFile';
import { defaultSettings } from '../src/state/store';
import { sandboxSettings } from '../src/lib/trainingSandbox';

const MIN = 60_000;
const base = { companion: true, staffCount: 2, now: 1_000_000_000, minutes: 5 };

test('a Register never asks for a step-up PIN, and neither does a team with no PINs', () => {
  assert.equal(stepUpNeeded({ ...base, companion: false }), false);
  assert.equal(stepUpNeeded({ ...base, staffCount: 0 }), false);
  assert.equal(stepUpNeeded({ ...base, companion: false, minutes: 0 }), false);
});

test('a Companion asks when no PIN was typed yet, or the last one is older than the window', () => {
  assert.equal(stepUpNeeded({ ...base, lastPinAt: undefined }), true);
  assert.equal(stepUpNeeded({ ...base, lastPinAt: base.now - 4 * MIN }), false);
  assert.equal(stepUpNeeded({ ...base, lastPinAt: base.now - 5 * MIN }), false); // exactly the window is still fine
  assert.equal(stepUpNeeded({ ...base, lastPinAt: base.now - 5 * MIN - 1 }), true);
  assert.equal(stepUpNeeded({ ...base, lastPinAt: base.now, minutes: 0 }), true); // 0 means every time
});

test('auto-lock: only a Companion with a PIN, signed in, quiet long enough, and not mid card payment', () => {
  const idle = { companion: true, staffCount: 1, unlocked: true, paymentActive: false, quietMs: 2 * MIN, minutes: 2 };
  assert.equal(lockDue(idle), true);
  assert.equal(lockDue({ ...idle, quietMs: 2 * MIN - 1 }), false);
  assert.equal(lockDue({ ...idle, companion: false }), false);
  assert.equal(lockDue({ ...idle, staffCount: 0 }), false);
  assert.equal(lockDue({ ...idle, unlocked: false }), false);
  assert.equal(lockDue({ ...idle, paymentActive: true }), false);
  assert.equal(lockDue({ ...idle, minutes: 0 }), false); // never
});

test('stored minutes: only an offered choice counts', () => {
  assert.equal(readMinutes(10, AUTO_LOCK_CHOICES, 2), 10);
  assert.equal(readMinutes(0, AUTO_LOCK_CHOICES, 2), 0);
  for (const bad of [3, -1, '5', null, undefined, NaN]) assert.equal(readMinutes(bad, STEP_UP_CHOICES, 5), 5);
});

test('every page that asks has words to show, and the sensitive pages are the planned ones', () => {
  for (const [route, action] of Object.entries(STEP_UP_ROUTES)) { assert.ok(STEP_UP_INFO[action].why.length > 10, route); assert.equal(stepUpForRoute(route), action); }
  for (const route of ['pay', 'createItem', 'editItem', 'drawer', 'settings', 'staff', 'deviceMode']) assert.ok(stepUpForRoute(route), route);
  for (const route of ['orders', 'items', 'customers', 'reports', 'help', 'training', 'giftcards', 'export']) assert.equal(stepUpForRoute(route), undefined, route);
});

test('five wrong PINs lock the app', () => { assert.equal(tooManyTries(MAX_STEP_UP_TRIES - 1), false); assert.equal(tooManyTries(MAX_STEP_UP_TRIES), true); });

test('a Companion always locks and a Register follows the shared Require PIN setting', () => {
  assert.equal(lockRequired({ requirePin: false }), false);
  assert.equal(lockRequired({ requirePin: true }), true);
  assert.equal(lockRequired({ requirePin: false, appMode: 'register' }), false);
  assert.equal(lockRequired({ requirePin: false, appMode: 'companion' }), true);
  assert.equal(lockRequired({ requirePin: false, appMode: 'nonsense' }), false);
});

test('the locking choices are per device, and setup never touches the shared Require PIN setting', () => {
  for (const k of ['autoLockMinutes', 'stepUpMinutes']) assert.ok((DEVICE_KEYS as readonly string[]).includes(k), k);
  assert.equal(defaultSettings().autoLockMinutes, 2); assert.equal(defaultSettings().stepUpMinutes, 5);
  assert.equal(/requirePin/.test(fs.readFileSync('src/screens/Setup.tsx', 'utf8').replace(/\/\/[^\n]*/g, '')), false);
});

test('practice and demo show every feature whatever this device is, so they never lock themselves', () => {
  const companion = { ...defaultSettings(), appMode: 'companion' as const, registerFeatures: { selling: false, cardReader: false, cashDrawer: false, staffTools: false, tillDisplay: false, tillTraining: false } };
  const s = sandboxSettings(companion);
  assert.equal(s.appMode, 'register'); assert.equal(Object.values(s.registerFeatures).every(Boolean), true);
});
