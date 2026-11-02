// Location: tests/noticeshared.test.ts
// CloudKit patch 6a, notices: which notices are shared, how one becomes a record and back, what is still to upload, and the rules for
// taking in other registers' notices (decisions item 10, Q2). Pure, no native module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { IMPORT_LIMIT, NOTICE_MAX_AGE_MS, SEEN_CAP, importNotices, importedNoticeId, isSharedNoticeKind, noticeFromFields, noticeHandle, noticeHandleFromRecord, noticeRecordName, noticeToFields, noticesToUpload, type SharedNotice } from '../src/lib/noticeShared';
import type { Notice } from '../src/lib/types';

const NOW = Date.parse('2026-11-02T10:00:00.000Z');
const ago = (ms: number): string => new Date(NOW - ms).toISOString();
const HOUR = 3600_000;
const notice = (id: string, o: Partial<Notice> = {}): Notice => ({ id, ts: ago(HOUR), kind: 'cash', title: 'Cash outside the drawer', body: `$5.00 cash from sale ${id}`, ...o });
const shared = (handle: string, o: Partial<SharedNotice> = {}): SharedNotice => ({ handle, kind: 'cash', title: 'Cash outside the drawer', body: `body ${handle}`, ts: ago(HOUR), registerId: 'reg-b', registerName: 'Back', ...o });
const allow = () => true;
const base = { local: [] as Notice[], seen: [] as string[], registerId: 'reg-a', now: NOW, allowed: allow };

test('only cash and refund notices are shared, the other six stay on the iPad', () => {
  assert.deepEqual(['cash', 'refund'].map(isSharedNoticeKind), [true, true]);
  for (const k of ['sync', 'queue', 'stock', 'reader', 'pass', 'info', 'nonsense', undefined]) assert.equal(isSharedNoticeKind(k), false, String(k));
});

test('a notice becomes a record and comes back, labelled with the register that raised it', () => {
  const n = notice('n1', { kind: 'refund', title: 'Refund not recorded in Shopify', body: '#1042: timeout', route: 'notifications', read: true });
  const f = noticeToFields('reg-a', 'Front', n);
  assert.deepEqual(f, { kind: 'refund', title: n.title, ts: n.ts, registerId: 'reg-a', registerName: 'Front', body: '#1042: timeout', route: 'notifications' });
  assert.ok(!('read' in f) && !('id' in f), 'whether it was read here is never sent');
  const back = noticeFromFields(noticeHandle('reg-a', 'n1'), f)!;
  assert.deepEqual(back, { handle: 'reg-a-n1', kind: 'refund', title: n.title, body: '#1042: timeout', route: 'notifications', ts: n.ts, registerId: 'reg-a', registerName: 'Front' });
  assert.equal(noticeRecordName(back.handle), 'notice-reg-a-n1');
  assert.equal(noticeHandleFromRecord('notice-reg-a-n1'), 'reg-a-n1');
  assert.equal(noticeHandleFromRecord('event-x'), null); assert.equal(noticeHandleFromRecord('notice-'), null);
});

test('optional parts are left out when empty, and a record that is not a readable shared notice is null', () => {
  assert.deepEqual(Object.keys(noticeToFields('r', 'R', { id: 'x', ts: ago(0), kind: 'cash', title: 'T' })).sort(), ['kind', 'registerId', 'registerName', 'title', 'ts']);
  const ok = noticeToFields('r', 'R', notice('x'));
  assert.ok(noticeFromFields('r-x', ok));
  for (const bad of [{ ...ok, kind: 'info' }, { ...ok, kind: 5 }, { ...ok, title: '' }, { ...ok, title: 7 }, { ...ok, ts: 'yesterday' }, { ...ok, ts: undefined }, { ...ok, registerId: '' }, {}]) assert.equal(noticeFromFields('r-x', bad as any), null);
  assert.equal(noticeFromFields('', ok), null);
  assert.equal(noticeFromFields('r-x', { ...ok, registerName: undefined })!.registerName, '');
});

test('to upload: own unread shared notices that CloudKit lacks and that are not too old, oldest first, each once', () => {
  const list: Notice[] = [
    notice('new', { ts: ago(HOUR) }), notice('old', { ts: ago(3 * HOUR) }), notice('dup', { ts: ago(2 * HOUR) }), notice('dup', { ts: ago(2 * HOUR) }),
    notice('read', { read: true }), notice('stale', { ts: ago(NOTICE_MAX_AGE_MS + HOUR) }), notice('info', { kind: 'info' }), notice('there'), notice('badts', { ts: 'nope' }),
  ];
  const up = noticesToUpload('reg-a', list, new Set(['reg-a-there']), NOW);
  assert.deepEqual(up.map(n => n.id), ['old', 'dup', 'new']);
});

test('taking in: another register\'s notice is added unread, labelled with who raised it, and marked taken in', () => {
  const r = importNotices({ ...base, remote: [shared('reg-b-1', { kind: 'refund', route: 'notifications' })] });
  assert.equal(r.added, 1); assert.equal(r.changed, true);
  assert.deepEqual(r.notices[0], { id: importedNoticeId('reg-b-1'), ts: ago(HOUR), kind: 'refund', title: 'Cash outside the drawer', from: 'Back', read: false, body: 'body reg-b-1', route: 'notifications' });
  assert.deepEqual(r.seen, ['reg-b-1']);
});

test('taking in: a register\'s own notices never come back, even after it cleared them', () => {
  const r = importNotices({ ...base, remote: [shared('reg-a-1', { registerId: 'reg-a' })], local: [] });
  assert.equal(r.added, 0); assert.equal(r.changed, false); assert.deepEqual(r.notices, []);
});

test('taking in: clearing or reading a notice here is per iPad, because a name already taken in is never added again', () => {
  const first = importNotices({ ...base, remote: [shared('reg-b-1')] });
  const cleared = importNotices({ ...base, remote: [shared('reg-b-1')], local: [], seen: first.seen });
  assert.equal(cleared.added, 0); assert.deepEqual(cleared.notices, []);
  const read = importNotices({ ...base, remote: [shared('reg-b-1')], local: first.notices.map(n => ({ ...n, read: true })), seen: first.seen });
  assert.equal(read.added, 0); assert.equal(read.changed, false); assert.equal(read.notices[0].read, true, 'a read notice stays read');
});

test('taking in: old ones, kinds this device does not hold and repeats of an unread notice are not shown but are still marked taken in', () => {
  const local = [notice('mine', { title: 'Same', body: 'same body' })];
  const r = importNotices({ ...base, local, allowed: k => k !== 'refund', remote: [
    shared('b-old', { ts: ago(NOTICE_MAX_AGE_MS + HOUR) }), shared('b-refund', { kind: 'refund' }), shared('b-same', { title: 'Same', body: 'same body' }), shared('b-ok'),
  ] });
  assert.deepEqual(r.notices.map(n => n.id), [importedNoticeId('b-ok'), 'mine']);
  assert.equal(r.added, 1); assert.deepEqual([...r.seen].sort(), ['b-ok', 'b-old', 'b-refund', 'b-same']);
  const again = importNotices({ ...base, local: r.notices, seen: r.seen, remote: [shared('b-old', { ts: ago(NOTICE_MAX_AGE_MS + HOUR) }), shared('b-refund', { kind: 'refund' }), shared('b-ok')] });
  assert.equal(again.changed, false);
});

test('taking in: a read notice does not hide a new one that looks the same', () => {
  const r = importNotices({ ...base, local: [notice('mine', { title: 'T', body: 'B', read: true })], remote: [shared('b-1', { title: 'T', body: 'B' })] });
  assert.equal(r.added, 1);
});

test('taking in: at most the newest IMPORT_LIMIT arrive at once, the rest are marked taken in so they do not arrive later', () => {
  const remote = Array.from({ length: IMPORT_LIMIT + 5 }, (_, i) => shared(`b-${String(i).padStart(3, '0')}`, { ts: ago(HOUR + i * 1000), body: `n${i}` }));
  const r = importNotices({ ...base, remote });
  assert.equal(r.added, IMPORT_LIMIT); assert.equal(r.seen.length, IMPORT_LIMIT + 5);
  assert.equal(r.notices[0].body, 'n0', 'newest first'); assert.ok(!r.notices.some(n => n.body === `n${IMPORT_LIMIT + 4}`));
});

test('taking in: the list stays newest first and capped at 200, and the taken-in names are capped', () => {
  const local = Array.from({ length: 200 }, (_, i) => notice(`l${i}`, { ts: ago(2 * HOUR + i * 1000), kind: 'info', body: `l${i}` }));
  const r = importNotices({ ...base, local, remote: [shared('b-new', { ts: ago(30 * 60_000) })] });
  assert.equal(r.notices.length, 200); assert.equal(r.notices[0].id, importedNoticeId('b-new')); assert.ok(!r.notices.some(n => n.id === 'l199'));
  const many = importNotices({ ...base, seen: Array.from({ length: SEEN_CAP }, (_, i) => `old-${i}`), remote: [shared('b-last')] });
  assert.equal(many.seen.length, SEEN_CAP); assert.equal(many.seen[many.seen.length - 1], 'b-last'); assert.equal(many.seen[0], 'old-1');
});

test('nothing changes and nothing is returned new when there is nothing to take in', () => {
  const local = [notice('mine')]; const seen = ['x'];
  const r = importNotices({ ...base, local, seen, remote: [] });
  assert.equal(r.notices, local); assert.equal(r.seen, seen); assert.equal(r.changed, false);
});
