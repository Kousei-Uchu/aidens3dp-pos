// Location: tests/uimode.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { MORE_EXPLAIN, MORE_GROUPS, STANDARD_PROFILE, effectiveTab, isSoleAdmin, readCustom, readUi, resolveUi, visibleMoreRows, withCustom, withMode } from '../src/lib/uiMode';

const flat = (g: string[][]) => g.flat();

test('no mode saved = Standard: nothing changes from today', () => {
  for (const raw of [undefined, null, {}, 'simple', 7, { mode: 'nonsense' }]) assert.deepEqual(resolveUi(raw), STANDARD_PROFILE);
  assert.equal(STANDARD_PROFILE.textScale, 1); assert.equal(STANDARD_PROFILE.explain, false); assert.equal(STANDARD_PROFILE.tabs.length, 5);
  assert.deepEqual(flat(visibleMoreRows(STANDARD_PROFILE, 'owner', true)), MORE_GROUPS.flat());
});
test('Simple keeps every tab and every row, with bigger text and explanations', () => {
  const p = resolveUi({ mode: 'simple' });
  assert.equal(p.tabs.length, 5); assert.ok(p.textScale > 1); assert.equal(p.explain, true);
  assert.deepEqual(flat(visibleMoreRows(p, 'owner', true)), MORE_GROUPS.flat());
});
test('Minimal: three tabs, essentials only, biggest text', () => {
  const p = resolveUi({ mode: 'minimal' });
  assert.deepEqual(p.tabs, ['checkout', 'transactions', 'more']);
  assert.deepEqual(flat(visibleMoreRows(p, 'cashier', true)).sort(), ['diagnostics', 'drawer', 'giftcards', 'lock', 'orders', 'saved']);
  assert.ok(p.textScale > resolveUi({ mode: 'simple' }).textScale);
});
test('a mode never widens what a role allows', () => {
  for (const mode of ['standard', 'simple', 'minimal', 'custom'] as const) {
    const rows = flat(visibleMoreRows(resolveUi({ mode, custom: { more: 'all' } }), 'cashier', true));
    for (const r of ['reports', 'staff', 'settings']) assert.ok(!rows.includes(r), `${mode} cashier sees ${r}`);
  }
  assert.ok(!flat(visibleMoreRows(STANDARD_PROFILE, 'owner', false)).includes('lock'), 'no lock row when locking is not set up');
});
test('Custom uses its own dials and falls back per dial when a value is bad', () => {
  const p = resolveUi({ mode: 'custom', custom: { textSize: 'large', explain: true, tabs: 'core', more: 'everyday' } });
  assert.deepEqual(p.tabs, ['checkout', 'inventory', 'transactions', 'more']); assert.equal(p.moreLevel, 'everyday');
  assert.deepEqual(readCustom({ textSize: 'huge', explain: 'yes', tabs: 'none', more: 3, guided: 'yes' }), { textSize: 'normal', explain: false, tabs: 'all', more: 'all', guided: false });
  assert.deepEqual(readUi({ mode: 'custom' }), { mode: 'custom', custom: readCustom(undefined) });
  assert.deepEqual(readUi({ mode: 'simple', custom: { more: 'essential' } }), { mode: 'simple' });
});
test('Checkout and More are in every tab set', () => {
  for (const tabs of ['all', 'core', 'basic'] as const) { const t = resolveUi({ mode: 'custom', custom: { tabs } }).tabs; assert.ok(t.includes('checkout') && t.includes('more'), tabs); }
});
test('the only manager or owner can never hide Staff and Settings from themselves', () => {
  const staff = [{ id: 'a', role: 'owner' as const }, { id: 'b', role: 'cashier' as const }];
  assert.equal(isSoleAdmin(staff, 'a'), true); assert.equal(isSoleAdmin(staff, 'b'), false); assert.equal(isSoleAdmin(staff, undefined), false);
  assert.equal(isSoleAdmin([...staff, { id: 'c', role: 'manager' as const }], 'a'), false);
  const restricted = { mode: 'minimal' };
  assert.ok(!flat(visibleMoreRows(resolveUi(restricted), 'owner', true)).includes('settings'));
  assert.ok(flat(visibleMoreRows(resolveUi(restricted, { soleAdmin: true }), 'owner', true)).includes('settings'));
  assert.ok(flat(visibleMoreRows(resolveUi(restricted, { soleAdmin: true }), 'owner', true)).includes('staff'));
});
test('switching mode starts Custom from what the person was using', () => {
  assert.deepEqual(withMode(undefined, 'simple'), { mode: 'simple' });
  assert.deepEqual(withMode({ mode: 'minimal' }, 'custom'), { mode: 'custom', custom: { textSize: 'xlarge', explain: true, tabs: 'basic', more: 'essential', guided: true } });
  assert.deepEqual(withCustom({ mode: 'simple' }, { tabs: 'core' }), { mode: 'custom', custom: { textSize: 'large', explain: true, tabs: 'core', more: 'all', guided: false } });
  assert.deepEqual(withMode({ mode: 'custom', custom: { tabs: 'core' } }, 'standard'), { mode: 'standard' });
});
test('a hidden tab falls back to Checkout; a shown one stays', () => {
  const p = resolveUi({ mode: 'minimal' });
  assert.equal(effectiveTab('notifications', p), 'checkout'); assert.equal(effectiveTab('inventory', p), 'checkout');
  assert.equal(effectiveTab('transactions', p), 'transactions'); assert.equal(effectiveTab('more', p), 'more');
});
test('every More row has an explanation and nothing is listed twice', () => {
  const all = MORE_GROUPS.flat(); assert.equal(new Set(all).size, all.length);
  for (const id of all) assert.ok(MORE_EXPLAIN[id].length > 10, id);
});
test('only Minimal (and Custom with the dial on) gets the guided checkout', () => {
  assert.equal(resolveUi({ mode: 'standard' }).guided, false); assert.equal(resolveUi({ mode: 'simple' }).guided, false); assert.equal(resolveUi({ mode: 'minimal' }).guided, true);
  assert.equal(resolveUi({ mode: 'custom', custom: { guided: true } }).guided, true); assert.equal(resolveUi({ mode: 'custom', custom: {} }).guided, false);
  assert.equal(resolveUi(withCustom({ mode: 'minimal' }, { guided: false })).guided, false);
});
