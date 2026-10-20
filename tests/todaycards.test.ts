// Location: tests/todaycards.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { LOW_SHOWN, todayCards } from '../src/lib/todayCards';

const v = (id: string, stock: number | null, productTitle = id) => ({ id, productTitle, variantTitle: '', stock });
const base = { variants: [], outbox: [], unread: 0, role: 'owner' };

test('money follows the Reports rule: everyone but a cashier sees it', () => {
  for (const role of ['owner', 'manager']) assert.equal(todayCards({ ...base, role }).money, true, role);
  assert.equal(todayCards({ ...base, role: 'cashier' }).money, false);
});

test('low stock lists low, out and oversold items, worst first, and counts them all', () => {
  const c = todayCards({ ...base, variants: [v('ok', 9), v('untracked', null), v('two', 2), v('out', 0), v('neg', -3), v('three', 3)] });
  assert.deepEqual(c.low.map(x => x.id), ['neg', 'out', 'two']);
  assert.equal(c.lowCount, 3);
});

test('only the first few are listed, but the count is the whole story', () => {
  const many = Array.from({ length: 12 }, (_, i) => v(`v${i}`, 1, `Item ${String(i).padStart(2, '0')}`));
  const c = todayCards({ ...base, variants: many });
  assert.equal(c.low.length, LOW_SHOWN); assert.equal(c.lowCount, 12);
});

test('stuck sales are the blocked ones, the rest are queued', () => {
  const c = todayCards({ ...base, outbox: [{ blocked: true }, {}, { blocked: false }, { blocked: true }], unread: 4 });
  assert.equal(c.stuck, 2); assert.equal(c.queued, 2); assert.equal(c.unread, 4);
  assert.deepEqual(todayCards(base), { money: true, low: [], lowCount: 0, stuck: 0, queued: 0, unread: 0 });
});

test('the companion tabs and the new routes are wired into the shell', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync('App.tsx', 'utf8');
  for (const needle of ["<Today />", "<ScanTab />", "case 'notices'", 'routeAllowed(mode, features, top.name)', 'deviceTabs(devMode, devFeatures, TAB_ORDER)']) assert.ok(app.includes(needle), needle);
  assert.ok(fs.readFileSync('src/screens/More.tsx', 'utf8').includes('rowAllowed(devMode, devFeatures, id)'));
});
