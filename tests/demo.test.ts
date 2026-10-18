// Location: tests/demo.test.ts
// Demo mode (F8): the guard, the catalogue of every feature, the made-up sales and notices, and the swap in and out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { useApp, flushPersist } from '../src/state/store';
import { kvGet, kvUseMemory } from '../src/lib/kv';
import { isTraining, isDemo, setDemoGuard, setTrainingGuard } from '../src/lib/trainingGuard';
import { DEMO_ENTRIES, DEMO_AREAS, entriesByArea, getDemoEntry, demoOf } from '../src/lib/demoCatalog';
import { demoSales, demoRollups, demoNotices, DEMO_OWNER_ID } from '../src/lib/demoFixtures';
import { isTrainId } from '../src/lib/trainingSandbox';
import { useDemo } from '../src/state/demoSession';
import { useTraining } from '../src/state/trainingSession';
import { startRun } from '../src/lib/trainingRun';

kvUseMemory();

test('the guard treats Demo mode as practice data, and keeps the two ways in separate', () => {
  assert.equal(isTraining(), false); assert.equal(isDemo(), false);
  setDemoGuard(true);
  try { assert.equal(isDemo(), true); assert.equal(isTraining(), true); } finally { setDemoGuard(false); }
  assert.equal(isTraining(), false); assert.equal(isDemo(), false);
  // A training run turns the same question on but never shows as Demo mode, and leaving the run leaves Demo mode alone.
  setTrainingGuard(true);
  try { assert.equal(isTraining(), true); assert.equal(isDemo(), false); }
  finally { setTrainingGuard(false); }
  assert.equal(isTraining(), false); assert.equal(isDemo(), false);
});

test('the catalogue covers every feature: complete, unique, and every Show plays', () => {
  assert.ok(DEMO_ENTRIES.length >= 28, 'every course, plus a few screens that have none');
  const ids = new Set<string>();
  for (const e of DEMO_ENTRIES) {
    assert.ok(e.id && e.title && e.summary && e.icon, `entry ${e.id} is missing a field`);
    assert.ok(DEMO_AREAS.includes(e.area), `${e.id} is in no known area`);
    assert.ok(!ids.has(e.id), `duplicate entry ${e.id}`); ids.add(e.id);
    assert.ok(e.module || e.tab || e.route, `${e.id} has nothing to watch or open`);
    const d = demoOf(e);
    if (e.module) assert.ok(d && d.steps.length > 0, `${e.id} has no Show steps`);
    else assert.equal(d, undefined, `${e.id} has no module, so it must have no Show`);
  }
  // Every entry lands in exactly one drawn area, and the area list has no empty one.
  const grouped = entriesByArea(); assert.equal(grouped.flatMap(g => g.entries).length, DEMO_ENTRIES.length);
  assert.deepEqual(grouped.map(g => g.area), DEMO_AREAS.filter(a => DEMO_ENTRIES.some(e => e.area === a)));
  assert.equal(getDemoEntry('reports')?.route, 'reports'); assert.equal(getDemoEntry('terminal')?.route, 'terminalPlay');
  assert.equal(getDemoEntry('cart')?.module, 'cart'); assert.equal(getDemoEntry('not-a-feature'), undefined);
});

test('the demo fixtures are practice sales and notices, and Reports can total them', () => {
  const sales = demoSales('train-reg', 'Demo register');
  assert.ok(sales.length >= 5);
  for (const s of sales) {
    assert.ok(isTrainId(s.uuid), s.uuid);
    assert.equal(s.totalCents, s.itemsCents - s.discountCents, s.uuid);
    assert.ok(s.tenders.length > 0, s.uuid);
    for (const t of s.tenders) assert.ok(isTrainId(t.id), t.id);
  }
  assert.ok(sales.some(s => s.type === 'refund'), 'a refund is there for the Refund course to point at');
  const rollups = demoRollups(sales); const keys = Object.keys(rollups);
  assert.ok(keys.length >= 2, 'a few days have takings, so Reports is not empty');
  for (const k of keys) assert.match(k, /^train-reg\|\d{4}-\d{2}-\d{2}$/);
  for (const n of demoNotices()) assert.ok(isTrainId(n.id) && n.title, n.id);
  assert.ok(demoNotices().length >= 2);
});

test('Demo mode swaps the till onto fixtures and puts it back exactly, writing nothing while on', async () => {
  useApp.getState().patchSettings({ shopName: 'Real Shop' }); await flushPersist();
  const before = useApp.getState();
  const msg = await useDemo.getState().enter();
  assert.equal(msg, null); assert.equal(useDemo.getState().active, true); assert.equal(isTraining(), true);
  const during = useApp.getState();
  assert.equal(during.settings.requirePin, false); assert.equal(during.unlocked, true);
  assert.equal(during.staffId, DEMO_OWNER_ID, 'signed in as the made-up owner, so every feature is on show');
  assert.equal(during.settings.staff.find(m => m.id === DEMO_OWNER_ID)?.role, 'owner');
  for (const v of Object.values(during.data.variants)) assert.ok(isTrainId(v.id), v.id);
  assert.ok(during.pos.sales.length >= 5, 'Transactions has sales'); assert.ok(Object.keys(during.pos.rollups).length >= 2, 'Reports has takings');
  assert.ok(during.pos.notices.filter(n => !n.read).length >= 1, 'Notifications has unread items');
  // A change made in Demo mode is never stored, and leaving puts the real till back exactly.
  useApp.getState().patchSettings({ shopName: 'Practice' }); await new Promise(r => setTimeout(r, 500)); await flushPersist();
  assert.equal(((await kvGet<any>('settings', null)) ?? {}).shopName, 'Real Shop', 'the demo change never reached storage');
  useDemo.getState().leave();
  assert.equal(useDemo.getState().active, false); assert.equal(isTraining(), false);
  const after = useApp.getState();
  assert.equal(after.settings.shopName, 'Real Shop'); assert.equal(after.pos, before.pos); assert.equal(after.data, before.data);
  assert.equal(await useDemo.getState().enter().then(() => useDemo.getState().active), true);
  useDemo.getState().leave();
  useApp.getState().patchSettings({ shopName: '' }); await flushPersist();
});

test('Demo mode will not start while a training course is on practice data', async () => {
  useTraining.getState().setRun(startRun('cart', 'guide'));
  const why = await useTraining.getState().startPractice();
  assert.equal(why, null, 'the course is on practice data');
  assert.equal(isTraining(), true);
  const msg = await useDemo.getState().enter();
  assert.ok((msg ?? '').length > 0, 'so Demo mode refuses'); assert.equal(useDemo.getState().active, false);
  useTraining.getState().leave(); // back off practice data (this also drops the training guard)
  assert.equal(await useDemo.getState().enter(), null);
  useDemo.getState().leave();
});

