// Location: tests/auditsync.test.ts
// CloudKit patch 6c, audit log: the record shape (encrypted content, plain labels only), the size guard, what is and is not sent, and the call
// sites (live upload, catch-up, the manager's read of other registers) on an in-memory fake of the native module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { LogEvent } from '../src/lib/assistantLog';
import { AUDIT_FIELD, AUDIT_MAX_BYTES, AUDIT_PLAIN_KEYS, auditFromParts, auditHandle, auditToParts, auditToUpload, fitEvent, utf8Length } from '../src/lib/auditShared';
import { createAuditSync, type AuditSyncDeps } from '../src/lib/cloudkit/auditSync';
import type { AuditNative } from '../src/lib/cloudkit/auditCloud';
import { fireAuditHook, setAuditHook } from '../src/lib/auditHook';

const staff = { id: 'u1', name: 'Casey', role: 'cashier' as const };
const ev = (n: number, o: Partial<LogEvent> = {}): LogEvent => ({ v: 1, id: `e${n}`, at: Date.UTC(2026, 10, 2, n), kind: 'ask', staff, practice: false, user: { id: `q${n}`, text: `Is Maria Lopez in stock ${n}?` }, reply: { id: `r${n}`, text: 'Yes.' }, ...o });

test('the whole event goes in the one encrypted field, and only labels are plain', () => {
  const p = auditToParts('reg-a', 'Front', ev(1), 'encrypted')!;
  assert.equal(p.handle, 'reg-a-e1');
  assert.deepEqual(Object.keys(p.plain).sort(), [...AUDIT_PLAIN_KEYS].sort());
  assert.deepEqual(Object.keys(p.encrypted), [AUDIT_FIELD]);
  for (const v of Object.values(p.plain)) assert.ok(!String(v).includes('Maria'), 'no content in a plain field');
  assert.ok(p.encrypted[AUDIT_FIELD].toString().includes('Maria Lopez'));
});

test('omit mode, purge lines and unusable ids write nothing at all', () => {
  assert.equal(auditToParts('reg-a', 'Front', ev(1), 'omit'), null);
  assert.equal(auditToParts('reg-a', 'Front', ev(1)), null, 'omit is the default');
  assert.equal(auditToParts('reg-a', 'Front', { ...ev(1), kind: 'purge' }, 'encrypted'), null);
  assert.equal(auditToParts('reg-a', 'Front', ev(1, { id: '../x' }), 'encrypted'), null);
  assert.equal(auditToParts('bad/id', 'Front', ev(1), 'encrypted'), null);
  assert.throws(() => auditHandle('a/b', 'e1'));
});

test('a record round trips, an unreadable field keeps the label, a damaged record is dropped', () => {
  const p = auditToParts('reg-a', 'Front', ev(1), 'encrypted')!;
  const r = auditFromParts('audit-reg-a-e1', p.plain, p.encrypted)!;
  assert.deepEqual(r.event, ev(1)); assert.equal(r.registerName, 'Front'); assert.equal(r.cut, undefined);
  const blind = auditFromParts('audit-reg-a-e1', p.plain, undefined)!; assert.equal(blind.event, null); assert.equal(blind.kind, 'ask');
  assert.equal(auditFromParts('audit-reg-a-e1', p.plain, { [AUDIT_FIELD]: '{not json' })!.event, null);
  assert.equal(auditFromParts('audit-reg-a-e1', p.plain, { [AUDIT_FIELD]: JSON.stringify({ v: 2, event: ev(1) }) })!.event, null);
  assert.equal(auditFromParts('event-x', p.plain), null); assert.equal(auditFromParts('audit-reg-a-e1', { at: 'x' }), null); assert.equal(auditFromParts('audit-', p.plain), null);
});

test('an event too big for a record is shrunk in steps, and says so', () => {
  const big = 'é'.repeat(200_000);
  const withTools = ev(1, { tools: [{ name: 'find', args: '{}', ok: true, result: big, ms: 5 }, { name: 'find', args: '{}', ok: true, result: big, ms: 5 }] });
  const a = fitEvent(withTools); assert.equal(a.cut, 'tools'); assert.equal(a.event.tools!.length, 2); assert.match(a.event.tools![0].result, /cut for iCloud/);
  const huge = ev(2, { user: { id: 'q', text: big.repeat(2) }, sent: { sys: 's', hash: 'h', parts: [{ id: 'p1', role: 'user', text: big.repeat(2) }, { id: 'q', role: 'user' }] } });
  const b = fitEvent(huge); assert.equal(b.cut, 'more'); assert.equal(b.event.sent!.parts[0].text, undefined); assert.ok(b.event.user!.text.length < 3000);
  assert.ok(utf8Length(JSON.stringify(b.event)) < AUDIT_MAX_BYTES);
  assert.equal(fitEvent(ev(3)).cut, undefined);
  const p = auditToParts('reg-a', 'Front', withTools, 'encrypted')!; assert.equal(auditFromParts('audit-reg-a-e1', p.plain, p.encrypted)!.cut, 'tools');
});

test('utf8Length counts bytes, including surrogate pairs', () => { assert.equal(utf8Length('a'), 1); assert.equal(utf8Length('é'), 2); assert.equal(utf8Length('€'), 3); assert.equal(utf8Length('😀'), 4); });

test('catch-up picks only what the shop lacks, oldest first, never purge lines', () => {
  const local = [ev(3), ev(1), { ...ev(2), kind: 'purge' as const }, ev(4, { kind: 'offline' }), ev(5, { id: 'bad id' })];
  assert.deepEqual(auditToUpload('reg-a', local, new Set(['reg-a-e4'])).map(e => e.id), ['e1', 'e3']);
  assert.deepEqual(auditToUpload('reg-a', local, new Set(['reg-b-e1'])).map(e => e.id), ['e1', 'e3', 'e4'], 'another register\'s record does not count');
  assert.deepEqual(auditToUpload('bad/id', local, new Set()), []);
});

type Rec = Record<string, any>;
function world(over: Partial<AuditSyncDeps> = {}, local: LogEvent[] = []) {
  const rows: Rec[] = []; const calls = { puts: 0, index: 0, full: 0 }; let fail = 0;
  const native: AuditNative = {
    async putAudit(h, f, e) { if (fail > 0) { fail--; throw new Error('offline'); } assert.ok(!(AUDIT_FIELD in f), 'never plain'); calls.puts++; const name = `audit-${h}`; const i = rows.findIndex(r => r.recordName === name); const r = { ...f, recordName: name, encrypted: e }; if (i >= 0) rows[i] = r; else rows.push(r); return r; },
    async listAuditIndex(limit, after) { calls.index++; const from = after ? Number(after) : 0; const page = rows.slice(from, from + limit).map(({ encrypted, ...rest }) => rest); return { rows: page, next: from + limit < rows.length ? String(from + limit) : null }; },
    async listAudit(limit, after) { calls.full++; const sorted = [...rows].sort((a, b) => b.at - a.at); const from = after ? Number(after) : 0; return { rows: sorted.slice(from, from + limit), next: from + limit < sorted.length ? String(from + limit) : null }; },
  };
  const state = { local, mode: 'encrypted' as 'encrypted' | 'omit' };
  const deps: AuditSyncDeps = { active: () => true, training: () => false, who: () => ({ id: 'reg-a', name: 'Front' }), native: async () => native, mode: () => state.mode, readLocal: async () => state.local, ...over };
  return { sync: createAuditSync(deps), rows, calls, state, failNext: (k: number) => { fail = k; } };
}

test('nothing is sent when CloudKit is not active, the register has no id, or the mode is omit', async () => {
  for (const over of [{ active: () => false }, { who: () => ({ id: '', name: '' }) }]) {
    const w = world(over, [ev(1)]); assert.equal(await w.sync.catchUp(), null); await w.sync.upload(ev(2)); assert.equal(w.rows.length, 0); assert.equal(await w.sync.others(), null);
  }
  const w = world({}, [ev(1)]); w.state.mode = 'omit';
  assert.equal(await w.sync.catchUp(), null); await w.sync.upload(ev(2)); assert.equal(w.rows.length, 0); assert.equal(w.calls.index, 0, 'does not even list');
  assert.equal(w.sync.isBehind(), true);
  w.state.mode = 'encrypted'; assert.equal(await w.sync.catchUp(), 1); assert.equal(w.rows.length, 1, 'after the switch the local log goes up');
});

test('the first catch-up sends the register\'s own log once, and live uploads follow', async () => {
  const w = world({}, [ev(1), ev(2)]);
  await w.sync.upload(ev(3)); assert.equal(w.rows.length, 0, 'a catch-up is due, so the live one waits for it');
  w.state.local = [ev(1), ev(2), ev(3)];
  assert.equal(await w.sync.catchUp(), 3); assert.equal(w.rows.length, 3);
  assert.equal(await w.sync.catchUp(), null, 'already caught up');
  await w.sync.upload(ev(4)); assert.equal(w.rows.length, 4); assert.equal(w.calls.index, 1, 'live uploads do not list');
  await w.sync.upload(ev(4)); assert.equal(w.rows.length, 4, 'the same event lands on the same record');
});

test('a failed live upload is caught up later, and a failed catch-up is retried', async () => {
  const w = world({}, [ev(1)]); await w.sync.catchUp(); w.failNext(1);
  await w.sync.upload(ev(2)); assert.equal(w.sync.isBehind(), true); assert.equal(w.rows.length, 1);
  w.state.local = [ev(1), ev(2)]; assert.equal(await w.sync.catchUp(), 1); assert.equal(w.rows.length, 2);
  const x = world({}, [ev(1)]); x.failNext(1); assert.equal(await x.sync.catchUp(), null); assert.equal(x.sync.isBehind(), true); assert.equal(await x.sync.catchUp(), 1);
});

test('a practice run sends nothing, and what was logged then goes at the next catch-up', async () => {
  let practice = true; const w = world({ training: () => practice }, [ev(1)]);
  assert.equal(await w.sync.catchUp(), null); await w.sync.upload(ev(2)); assert.equal(w.rows.length, 0); assert.equal(await w.sync.others(), null);
  practice = false; w.state.local = [ev(1, { practice: true }), ev(2, { practice: true })];
  assert.equal(await w.sync.catchUp(), 2); assert.equal(JSON.parse(w.rows[0].encrypted[AUDIT_FIELD]).event.practice, true);
});

test('the manager sees the other registers\' events, newest first, but not this register\'s own, and a blind record is kept as a label', async () => {
  const w = world({}, [ev(1)]); await w.sync.catchUp();
  const b = auditToParts('reg-b', 'Back', ev(9, { id: 'b9' }), 'encrypted')!; w.rows.push({ ...b.plain, recordName: 'audit-reg-b-b9', encrypted: b.encrypted });
  const c = auditToParts('reg-b', 'Back', ev(7, { id: 'b7' }), 'encrypted')!; w.rows.push({ ...c.plain, recordName: 'audit-reg-b-b7' });
  w.rows.push({ recordName: 'audit-reg-b-junk', at: 'x' });
  const got = (await w.sync.others())!;
  assert.deepEqual(got.map(g => g.handle), ['reg-b-b9', 'reg-b-b7']); assert.equal(got[0].event?.id, 'b9'); assert.equal(got[1].event, null); assert.equal(got[1].registerName, 'Back');
  assert.equal((await w.sync.others(1))!.length, 1, 'a limit is respected');
});

test('reading the other registers throws when CloudKit cannot be read, so the viewer can say so', async () => {
  const w = world({ native: async () => ({ putAudit: async () => ({}), listAuditIndex: async () => ({ rows: [], next: null }), listAudit: async () => { throw new Error('offline'); } }) });
  await assert.rejects(() => w.sync.others());
});

test('the hook hands an event to the sync and never throws', () => {
  const seen: string[] = []; setAuditHook(e => { seen.push(e.id); }); fireAuditHook(ev(1)); assert.deepEqual(seen, ['e1']);
  setAuditHook(() => { throw new Error('boom'); }); assert.doesNotThrow(() => fireAuditHook(ev(2))); setAuditHook(null); assert.doesNotThrow(() => fireAuditHook(ev(3)));
});

test('wiring, pinned from the source: both sinks fire the hook, the poll catches up, Swift lists Audit as encrypted and never plain', () => {
  const io = readFileSync('src/lib/assistantLogIO.ts', 'utf8');
  assert.equal((io.match(/fireAuditHook\(e\)/g) ?? []).length, 2);
  assert.ok(/logSink[^\n]*isTraining\(\)\) return; await assistantLog\.append\(e, prompt\); fireAuditHook/.test(io), 'practice mode still skips the practice-only sink');
  const sync = readFileSync('src/lib/sync.ts', 'utf8');
  assert.ok(sync.includes('setAuditHook(e =>') && sync.includes('await auditSync.catchUp()'));
  const swift = readFileSync('modules/cloudkit-sync/ios/CloudKitSyncModule.swift', 'utf8');
  assert.ok(swift.includes('"Audit": ["secure_json"]'));
  assert.ok(/AsyncFunction\("putAudit"\)[\s\S]*?encrypted: encrypted/.test(swift));
  assert.ok(/listAuditIndex[\s\S]*?desiredKeys: \["registerId", "registerName", "at", "day", "kind"\]/.test(swift));
  assert.ok(readFileSync('modules/cloudkit-sync/index.ts', 'utf8').includes('export async function putAudit'));
});
