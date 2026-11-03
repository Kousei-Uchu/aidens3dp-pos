// Location: tests/backendswitch.test.ts
// CloudKit patch 8, the switch: install at start-up, move to CloudKit once the import is done and send the sales finished in the gap, the way
// back, and that a failure never leaves a till half switched. Plus source pins for the start-up, the poll, the flag store and the page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBackendSwitch, type BackendSwitchDeps } from '../src/lib/cloudkit/backendSwitch';
import type { BackendFlag } from '../src/lib/backendChoice';
import type { MigrationRead } from '../src/lib/migrationLease';
import type { SaleRecord } from '../src/lib/types';

const T = Date.parse('2026-11-02T10:00:00.000Z');
const done = (startedAt = T): MigrationRead => ({ kind: 'ok', state: { status: 'done', holder: 'a', holderName: 'A', phase: 'rollups', cursor: '', counts: {}, startedAt, finishedAt: startedAt + 1, error: '', tag: 't' } as any });
const running: MigrationRead = { kind: 'ok', state: { status: 'running', holder: 'a', holderName: 'A', phase: 'sales', cursor: '', counts: {}, startedAt: T, finishedAt: 0, error: '', tag: 't' } as any };
const sale = (uuid: string, ts: string, registerId = 'me'): SaleRecord => ({ uuid, ts, registerId, type: 'sale' } as SaleRecord);

function make(all: Partial<BackendSwitchDeps> & { initial?: BackendFlag; kind?: 'metaobject' | 'cloudkit' | 'none'; read?: MigrationRead; have?: string[]; caught?: boolean } = {}) {
  const { initial, kind: kind0, read, have: have0, caught: caught0, ...o } = all;
  let flag: BackendFlag = initial ?? null; let kind: 'metaobject' | 'cloudkit' | 'none' = kind0 ?? 'metaobject'; let caught = caught0 ?? false;
  const log: string[] = []; const sent: string[] = []; const notices: string[] = []; const have = new Set(have0 ?? []);
  const deps: BackendSwitchDeps = {
    flag: { get: async () => flag, set: async v => { log.push(`flag:${v}`); flag = v; } },
    install: async k => { log.push(`install:${k}`); kind = k; }, activeKind: () => kind, role: async () => 'participant', readMigration: async () => read ?? done(),
    training: () => false, who: () => ({ id: 'me' }), sales: () => [sale('s1', '2026-11-02T10:05:00.000Z'), sale('s2', '2026-11-02T10:20:00.000Z'), sale('before', '2026-11-02T08:00:00.000Z')],
    outboxIds: () => new Set(), inCloudKit: async u => have.has(u), catchUpSale: async s => { sent.push(s.uuid); }, markPending: () => { log.push('pending'); },
    caughtUp: { get: async () => caught, set: async () => { caught = true; log.push('caughtUp'); } }, notify: n => notices.push(n.title), ...o,
  } as BackendSwitchDeps;
  return { sw: createBackendSwitch(deps), log, sent, notices, state: () => ({ flag, kind, caught }) };
}

test('at start-up the flag decides: cloudkit installs CloudKit, anything else Shopify, and an unreadable flag means Shopify', async () => {
  assert.equal(await make({ initial: 'cloudkit' }).sw.install(), 'cloudkit'); assert.equal(await make({ initial: 'force_meta' }).sw.install(), 'metaobject'); assert.equal(await make().sw.install(), 'metaobject');
  const broken = make({ flag: { get: async () => { throw new Error('x'); }, set: async () => {} } as any }); assert.equal(await broken.sw.install(), 'metaobject');
});

test('when the import is done the till moves: flag first, then the backend, then the drawer is marked, then its gap sales go, then it says so', async () => {
  const m = make({ have: ['s1'] }); assert.equal(await m.sw.check(), true);
  assert.deepEqual(m.log, ['flag:cloudkit', 'install:cloudkit', 'pending', 'caughtUp']);
  assert.deepEqual(m.sent, ['s2'], 'only its own sale since the import began that CloudKit does not have; "before" was copied by the import, s1 is already there');
  assert.deepEqual(m.notices, ['Now using iCloud']); assert.deepEqual(m.state(), { flag: 'cloudkit', kind: 'cloudkit', caught: true });
});

test('it does nothing while the import is running, has not started, or cannot be read', async () => {
  for (const read of [running, { kind: 'none' } as MigrationRead, { kind: 'newer', tag: 't' } as MigrationRead, { kind: 'damaged', tag: 't' } as MigrationRead]) {
    const m = make({ read }); assert.equal(await m.sw.check(), false); assert.deepEqual(m.log, []); assert.equal(m.state().kind, 'metaobject');
  }
  const failing = make({ readMigration: async () => { throw new Error('offline'); } }); assert.equal(await failing.sw.check(), false); assert.deepEqual(failing.log, []);
});

test('after a rollback it stays on Shopify until the owner allows it again, then moves on the next check', async () => {
  const m = make({ initial: 'force_meta' }); assert.equal(await m.sw.check(), false); assert.equal(m.state().kind, 'metaobject');
  await m.sw.allowSwitch(); assert.equal(m.state().flag, null); assert.equal(await m.sw.check(), true); assert.equal(m.state().kind, 'cloudkit');
});

test('rolling back sets the flag, installs Shopify, and tells the person to do every till', async () => {
  const m = make({ initial: 'cloudkit', kind: 'cloudkit', caught: true }); await m.sw.rollBack();
  assert.deepEqual(m.log, ['flag:force_meta', 'install:metaobject']); assert.deepEqual(m.state(), { flag: 'force_meta', kind: 'metaobject', caught: true }); assert.deepEqual(m.notices, ['Back on Shopify storage']);
  assert.equal(await m.sw.check(), false, 'and it does not move back by itself');
});

test('a till not in the shop, and a practice run, never move', async () => {
  const outside = make({ role: async () => 'none' }); assert.equal(await outside.sw.check(), false); assert.deepEqual(outside.log, []);
  const practice = make({ training: () => true }); assert.equal(await practice.sw.check(), false); assert.deepEqual(practice.log, []);
});

test('a failed gap send leaves the till on CloudKit with the catch-up undone, and the next check tries again and finishes', async () => {
  let fail = true; const sent: string[] = [];
  const m = make({ catchUpSale: async s => { if (fail) throw new Error('Shopify down'); sent.push(s.uuid); } });
  assert.equal(await m.sw.check(), true); assert.equal(m.state().kind, 'cloudkit'); assert.equal(m.state().caught, false);
  fail = false; assert.equal(await m.sw.check(), false, 'already moved, so no second switch'); assert.equal(m.state().caught, true); assert.deepEqual(sent, ['s1', 's2']);
});

test('once settled, a poll reads nothing from CloudKit', async () => {
  let reads = 0; const m = make({ initial: 'cloudkit', kind: 'cloudkit', caught: true, readMigration: async () => { reads++; return done(); } });
  assert.equal(await m.sw.check(), false); assert.equal(reads, 0);
});

test('two checks at once switch only once', async () => {
  const m = make(); const [a, b] = await Promise.all([m.sw.check(), m.sw.check()]); assert.equal([a, b].filter(Boolean).length, 1); assert.equal(m.log.filter(l => l === 'install:cloudkit').length, 1);
});

test('the view says what is in use and what the flag is', async () => assert.deepEqual(await make({ initial: 'force_meta' }).sw.view(), { kind: 'metaobject', flag: 'force_meta' }));

test('start-up reads the flag through the switch, the poll runs the check first, the flag store checks the guard, and the page has the way back', () => {
  const app = readFileSync('App.tsx', 'utf8'); assert.match(app, /await backendSwitch\.install\(\)/); assert.match(app, /forceMetaobjectBackend\(\(await backendFlagStore\.get\(\)\) === 'force_meta'\)/);
  const sync = readFileSync('src/lib/sync.ts', 'utf8'); assert.ok(sync.indexOf('await backendSwitch.check()') < sync.indexOf('if (s.settings.sharedSettingsPending) await pushSharedSettings()'));
  const io = readFileSync('src/lib/cloudkit/backendFlagIO.ts', 'utf8'); assert.equal((io.match(/isTraining\(\)\) throw new TrainingBlockedError/g) ?? []).length, 2);
  const page = readFileSync('src/screens/CloudSync.tsx', 'utf8'); assert.match(page, /title="Go back to Shopify storage"[^/]*disabled=\{practice\}/); assert.match(page, /title="Use iCloud again"/);
  assert.ok(page.slice(page.indexOf('const goBack'), page.indexOf('const useICloudAgain')).indexOf('await confirm(') < page.slice(page.indexOf('const goBack')).indexOf('backendSwitch.rollBack()'));
});
