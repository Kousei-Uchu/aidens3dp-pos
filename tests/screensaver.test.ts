// Location: tests/screensaver.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { contrastOn, defaultScreensaver, logoSource, normaliseHex, paymentActive, shouldShowScreensaver } from '../src/lib/screensaver';
import { buildBackup, mergeSettings, validateBackup } from '../src/lib/backupFile';

const base = { enabled: true, showWhenLoggedOut: true, locked: false, idleMs: 0, idleMinutes: 3, lockedSeconds: 15, paymentActive: false };
const MIN = 60_000;

test('hex colours: short, long, with or without #, junk', () => {
  assert.equal(normaliseHex('#ABC'), '#aabbcc'); assert.equal(normaliseHex('1E3A5F'), '#1e3a5f'); assert.equal(normaliseHex(' #1e3a5f '), '#1e3a5f');
  for (const bad of ['', '#12', '#12345', 'ggg', '#1234567', 'red']) assert.equal(normaliseHex(bad), null, bad);
});

test('text colour is readable on light and dark backgrounds', () => {
  assert.equal(contrastOn('#111111'), '#FFFFFF'); assert.equal(contrastOn('#ffffff'), '#111111');
  assert.equal(contrastOn('#1e3a5f'), '#FFFFFF'); assert.equal(contrastOn('#f5efe6'), '#111111'); assert.equal(contrastOn('nonsense'), '#FFFFFF');
});

test('logo: uploaded file beats link; only https links are used', () => {
  assert.deepEqual(logoSource({ logoFile: 'file:///a.png', logoUrl: 'https://x.dev/l.png' }), { uri: 'file:///a.png' });
  assert.deepEqual(logoSource({ logoFile: '', logoUrl: ' https://x.dev/l.png ' }), { uri: 'https://x.dev/l.png' });
  assert.equal(logoSource({ logoFile: '', logoUrl: 'http://x.dev/l.png' }), null); assert.equal(logoSource({ logoFile: '', logoUrl: '' }), null);
});

test('shows only after the idle time, never when disabled', () => {
  assert.equal(shouldShowScreensaver({ ...base, idleMs: 3 * MIN - 1 }), false);
  assert.equal(shouldShowScreensaver({ ...base, idleMs: 3 * MIN }), true);
  assert.equal(shouldShowScreensaver({ ...base, idleMs: 99 * MIN, enabled: false }), false);
});

test('logged out: uses the short wait, unless that option is off', () => {
  assert.equal(shouldShowScreensaver({ ...base, locked: true, idleMs: 15_000 }), true);
  assert.equal(shouldShowScreensaver({ ...base, locked: true, idleMs: 14_000 }), false);
  assert.equal(shouldShowScreensaver({ ...base, locked: true, showWhenLoggedOut: false, idleMs: 60_000 }), false);
  assert.equal(shouldShowScreensaver({ ...base, locked: true, showWhenLoggedOut: false, idleMs: 3 * MIN }), true);
  assert.equal(shouldShowScreensaver({ ...base, locked: true, lockedSeconds: 600, idleMs: 3 * MIN }), true); // never longer than the normal idle time
});

test('never covers the screen while a card payment is waiting on the reader', () => {
  const now = Date.parse('2026-10-09T05:00:00Z');
  assert.equal(paymentActive([{ status: 'started', ts: '2026-10-09T04:58:00Z' }], now), true);
  assert.equal(paymentActive([{ status: 'started', ts: '2026-10-09T04:50:00Z' }], now), false, 'a stale attempt must not block the screensaver forever');
  assert.equal(paymentActive([{ status: 'approved', ts: '2026-10-09T04:59:00Z' }, { status: 'declined', ts: '2026-10-09T04:59:30Z' }], now), false);
  assert.equal(shouldShowScreensaver({ ...base, idleMs: 99 * MIN, paymentActive: true }), false);
});

test('backup: the uploaded logo path is never exported or imported, but the rest of the screensaver is', () => {
  const ss = { ...defaultScreensaver(), enabled: true, bgColor: '#1e3a5f', logoFile: 'file:///var/mobile/Containers/x/logo.png' };
  const b = buildBackup({ settings: { screensaver: ss, registerId: 'r' }, credentials: { shopifyDomain: '', shopifyClientId: '', shopifyClientSecret: '', passSecret: '', receiptSecret: '' } });
  assert.ok(!('logoFile' in (b.settings.screensaver as object)));
  assert.equal((b.settings.screensaver as any).bgColor, '#1e3a5f');
  const hostile = validateBackup({ ...b, settings: { screensaver: { ...ss } } });
  assert.ok(!('logoFile' in (hostile.settings.screensaver as object)));
  const merged = mergeSettings({ screensaver: { ...defaultScreensaver(), logoFile: 'file:///this-device/own.png', idleMinutes: 9 } } as any, hostile.settings);
  assert.equal((merged.screensaver as any).logoFile, 'file:///this-device/own.png'); assert.equal((merged.screensaver as any).bgColor, '#1e3a5f'); assert.equal((merged.screensaver as any).enabled, true);
});
