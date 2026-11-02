// Location: tests/noticesync.test.ts
// CloudKit patch 6a, notices: the transport and the call sites on an in-memory fake of the native module, plus source pins for the
// wiring that cannot be run without an iPad (the store's sink, the poll, the Swift and the module's exports).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createNoticeSync, type NoticeSyncDeps } from '../src/lib/cloudkit/noticeSync';
import { pullCloudNotices, pushCloudNotices, type NoticeNative } from '../src/lib/cloudkit/noticeCloud';
import { importedNoticeId, noticeHandle } from '../src/lib/noticeShared';
import { DEVICE_KEYS } from '../src/lib/backupFile';
import type { Notice } from '../src/lib/types';

type Rec = Record<string, any>;
const NOW = Date.parse('2026-11-02T10:00:00.000Z');
const HOUR = 3600_000;
const ago = (ms: number): string => new Date(NOW - ms).toISOString();
const notice = (id: string, o: Partial<Notice> = {}): Notice => ({ id, ts: ago(HOUR), kind: 'cash', title: 'Cash outside the drawer', body: `cash from ${id}`, ...o });

function cloud() {
  const records: Rec[] = []; const calls = { writes: 0, lists: 0 }; let failWrites = 0; let failLists = false;
  const native = {
    async putNotice(h: string, f: Rec) { if (failWrites > 0) { failWrites--; throw new Error('offline'); } const name = `notice-${h}`; const had = records.find(r => r.recordName === name); if (had) return had; calls.writes++; const r = { recordName: name, ...f }; records.push(r); return r; },
    async listNotices(limit: number, after?: string | null) { calls.lists++; if (failLists) throw new Error('offline'); const from = after ? Number(after) : 0; return { rows: records.slice(from, from + limit), next: from + limit < records.length ? String(from + limit) : null }; },
  } as unknown as NoticeNative;
  return { native, records, calls, failNext: (k: number) => { failWrites = k; }, failLists: (b: boolean) => { failLists = b; } };
}

function register(c: ReturnType<typeof cloud>, id: string, name: string, over: Partial<NoticeSyncDeps> = {}) {
  const state = { notices: [] as Notice[], seen: [] as string[] };
  const deps: NoticeSyncDeps = {
    active: () => true, training: () => false, who: () => ({ id, name }), native: async () => c.native,
    local: () => state.notices, setLocal: l => { state.notices = l; }, seen: () => state.seen, setSeen: s => { state.seen = s; }, allowed: () => true, now: () => NOW, ...over,
  };
  return { sync: createNoticeSync(deps), state };
}

test('nothing is sent or read when CloudKit is not active, in practice mode, or before the register has an id', async () => {
  for (const over of [{ active: () => false }, { training: () => true }, { who: () => ({ id: '', name: '' }) }]) {
    const c = cloud(); const a = register(c, 'reg-a', 'Front', over); a.state.notices = [notice('n1')];
    assert.equal(await a.sync.catchUp(), null); assert.equal(await a.sync.pull(), null); await a.sync.upload(notice('n2'));
    assert.equal(c.records.length, 0); assert.equal(c.calls.lists, 0);
  }
});

test('a register that has just launched sends its own unread cash and refund notices once, and nothing is written twice', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front');
  a.state.notices = [notice('n1'), notice('n2', { kind: 'refund' }), notice('n3', { kind: 'info' }), notice('n4', { read: true })];
  assert.equal(await a.sync.catchUp(), 2);
  assert.deepEqual(c.records.map(r => r.recordName).sort(), ['notice-reg-a-n1', 'notice-reg-a-n2']);
  assert.ok(c.records.every(r => r.registerId === 'reg-a' && r.registerName === 'Front'));
  assert.equal(await a.sync.catchUp(), null, 'no second pass until something fails'); assert.equal(c.calls.writes, 2);
});

test('after the catch-up a cash or refund notice is written straight away with no listing, and other kinds never are', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); await a.sync.catchUp(); const lists = c.calls.lists;
  await a.sync.upload(notice('n1')); await a.sync.upload(notice('n2', { kind: 'refund' }));
  await a.sync.upload(notice('n3', { kind: 'sync' })); await a.sync.upload(notice('n4', { kind: 'reader' })); await a.sync.upload(notice('n5', { kind: 'info' }));
  assert.equal(c.records.length, 2); assert.equal(c.calls.lists, lists);
});

test('a notice raised before the first catch-up waits for it and still arrives once', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); a.state.notices = [notice('n1')];
  await a.sync.upload(notice('n1')); assert.equal(c.records.length, 0);
  await a.sync.catchUp(); assert.equal(c.records.length, 1);
});

test('a live upload that fails is caught up later, and the one already sent is not sent again', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); await a.sync.catchUp();
  a.state.notices = [notice('n2'), notice('n1')];
  await a.sync.upload(notice('n1'));
  c.failNext(1); await a.sync.upload(notice('n2'));
  assert.equal(a.sync.isBehind(), true); assert.equal(c.records.length, 1);
  assert.equal(await a.sync.catchUp(), 1); assert.equal(c.records.length, 2); assert.equal(c.calls.writes, 2);
});

test('a failed catch-up reports null and is tried again next time', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); a.state.notices = [notice('n1')];
  c.failNext(1); assert.equal(await a.sync.catchUp(), null); assert.equal(a.sync.isBehind(), true);
  assert.equal(await a.sync.catchUp(), 1);
});

test('a notice raised on one register reaches the other, unread and labelled with who raised it', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); const b = register(c, 'reg-b', 'Back');
  await a.sync.catchUp(); await b.sync.catchUp();
  await a.sync.upload(notice('n1', { kind: 'refund', title: 'Refund not recorded in Shopify', route: 'notifications' }));
  assert.equal(await b.sync.pull(), 1);
  assert.equal(b.state.notices.length, 1);
  assert.deepEqual(b.state.notices[0], { id: importedNoticeId('reg-a-n1'), ts: ago(HOUR), kind: 'refund', title: 'Refund not recorded in Shopify', body: 'cash from n1', route: 'notifications', from: 'Front', read: false });
  assert.deepEqual(b.state.seen, ['reg-a-n1']);
  assert.equal(await a.sync.pull(), 0, 'the register that raised it does not get it back'); assert.deepEqual(a.state.notices, []);
});

test('reading or clearing a notice on one register leaves the other register\'s copy alone, and a cleared one does not return', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); const b = register(c, 'reg-b', 'Back');
  await a.sync.catchUp(); await a.sync.upload(notice('n1'));
  await b.sync.pull(); await a.sync.pull();
  b.state.notices = b.state.notices.map(n => ({ ...n, read: true })); await b.sync.pull();
  assert.equal(b.state.notices[0].read, true);
  b.state.notices = []; assert.equal(await b.sync.pull(), 0); assert.deepEqual(b.state.notices, [], 'cleared stays cleared');
  assert.equal(c.records.length, 1, 'nothing was sent about reading or clearing it');
});

test('a device that does not hold the feature takes in no notice of that kind, and an unreadable read changes nothing', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); await a.sync.catchUp(); await a.sync.upload(notice('n1'));
  const b = register(c, 'reg-b', 'Back', { allowed: () => false });
  assert.equal(await b.sync.pull(), 0); assert.deepEqual(b.state.notices, []);
  const d = register(c, 'reg-d', 'Phone'); c.failLists(true);
  assert.equal(await d.sync.pull(), null); assert.deepEqual(d.state.notices, []); assert.deepEqual(d.state.seen, []);
});

test('a notice cleared or raised while CloudKit was answering is not undone', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); await a.sync.catchUp(); await a.sync.upload(notice('n1'));
  const b = register(c, 'reg-b', 'Back'); const orig = c.native.listNotices.bind(c.native);
  (c.native as any).listNotices = async (l: number, after?: string | null) => { const p = await orig(l, after); b.state.notices = [notice('late', { kind: 'info' })]; return p; };
  await b.sync.pull();
  assert.deepEqual(b.state.notices.map(n => n.id), [importedNoticeId('reg-a-n1'), 'late']);
});

test('pulling skips records it cannot read, and reads every page', async () => {
  const c = cloud();
  c.records.push({ recordName: 'notice-junk', kind: 'info', title: 'x', ts: ago(0), registerId: 'r' }, { recordName: 'other-1' }, { recordName: 'notice-r-1', kind: 'cash', title: 'ok', ts: ago(0), registerId: 'r' });
  for (let i = 0; i < 450; i++) c.records.push({ recordName: `notice-r-p${i}`, kind: 'refund', title: `t${i}`, ts: ago(0), registerId: 'r' });
  const got = await pullCloudNotices(c.native);
  assert.equal(got.length, 451); assert.ok(c.calls.lists >= 3);
});

test('uploading in bulk lists first and only writes what CloudKit lacks', async () => {
  const c = cloud(); c.records.push({ recordName: noticeHandle('reg-a', 'n1').replace(/^/, 'notice-') });
  const sent = await pushCloudNotices(c.native, 'reg-a', 'Front', [notice('n1'), notice('n2')], NOW);
  assert.equal(sent, 1); assert.equal(c.calls.writes, 1);
});

// ── source pins: the wiring that needs an iPad to run ───────────────────────────────────────────────────────────────────────
const read = (p: string): string => readFileSync(p, 'utf8');

test('notify hands each notice it adds to the sink, and notices taken in from elsewhere are not sent back', () => {
  const store = read('src/state/store.ts');
  assert.match(store, /export const setNoticeSink/);
  assert.match(store, /get\(\)\.patchPos\(\{ notices: \[notice, \.\.\.pos\.notices\]\.slice\(0, 200\) \}\);\s*noticeSink\?\.\(notice\);/);
  const sync = read('src/lib/sync.ts');
  assert.match(sync, /setNoticeSink\(n => \{ void noticeSync\.upload\(n\); \}\);/);
  assert.doesNotMatch(read('src/lib/cloudkit/noticeSync.ts'), /\.notify\(/, 'taking one in must not go through notify, or it would be sent again');
});

test('the poll sends missed notices and takes in new ones, only outside practice mode', () => {
  const sync = read('src/lib/sync.ts'); const poll = sync.slice(sync.indexOf('export async function pollShared'));
  const i = poll.indexOf('if (!isTraining()) {'); const j = poll.indexOf('// stock');
  const block = poll.slice(i, j);
  assert.ok(block.includes('noticeSync.catchUp()') && block.includes('noticeSync.pull()'));
  assert.ok(block.indexOf('noticeSync.catchUp()') < block.indexOf('noticeSync.pull()'));
});

test('what a device has taken in is a device-only setting, never restored from a backup or shared', () => {
  assert.ok(DEVICE_KEYS.includes('noticesSeen'));
  assert.match(read('src/state/store.ts'), /noticesSeen\?: string\[\]/);
});

test('the native module exposes putNotice and listNotices, written once and listed, with the names the transport expects', () => {
  const swift = read('modules/cloudkit-sync/ios/CloudKitSyncModule.swift');
  assert.match(swift, /AsyncFunction\("putNotice"\)[\s\S]*?putRecordOnce\(recordType: "Notice", recordName: "notice-\\\(handle\)"/);
  assert.match(swift, /AsyncFunction\("listNotices"\)[\s\S]*?listRecords\(recordType: "Notice"/);
  const idx = read('modules/cloudkit-sync/index.ts'); assert.match(idx, /export async function putNotice/); assert.match(idx, /export async function listNotices/);
  assert.match(read('modules/cloudkit-sync/status.ts'), /putNotice\?\(/);
});

test('the Notifications list says which register a shared notice came from', () => {
  assert.match(read('src/screens/Notifications.tsx'), /n\.from \? `From \$\{n\.from\}` : ''/);
});
