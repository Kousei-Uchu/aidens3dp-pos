// Location: tests/attemptpull.test.ts
// CloudKit patch 4, pull side: payment attempts read back from CloudKit. The pure rules (which local attempts take another
// register's resolution, what the notice and the rows say), then the pull itself on an in-memory fake of the native module, then
// source pins that the poll, the store and the Diagnostics screen are wired to it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyRemoteResolutions, resolvedElsewhereNotice, unresolvedRows } from '../src/lib/attemptShared';
import { createAttemptSync, type AttemptSyncDeps } from '../src/lib/cloudkit/attemptSync';
import type { EventNative } from '../src/lib/cloudkit/eventCloud';
import type { SharedAttempt } from '../src/lib/eventRecords';
import type { Attempt } from '../src/state/store';

const att = (o: Partial<Attempt> = {}): Attempt => ({ ref: 'ref-1', saleUuid: 's1', amountCents: 2500, ts: '2026-10-31T03:00:00.000Z', status: 'unknown', ...o });
const shared = (o: Partial<SharedAttempt> = {}): SharedAttempt => ({ ...att(), registerId: 'a', registerName: 'Front', ...o });

// ── the rules ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

test('a payment waiting here that another register resolved is marked resolved, and keeps its note', () => {
  const local = [att({ note: 'reader dropped' })];
  const { list, resolved } = applyRemoteResolutions(local, [shared({ status: 'resolved', resolvedBy: 'Sam' })]);
  assert.equal(list[0].status, 'resolved'); assert.equal(list[0].resolvedBy, 'Sam'); assert.equal(list[0].note, 'reader dropped');
  assert.equal(resolved.length, 1); assert.equal(local[0].status, 'unknown', 'the input is not changed');
});
test('only an unknown attempt is changed: a started one may still be charging, the rest are settled', () => {
  const cloud = [shared({ status: 'resolved', resolvedBy: 'Sam' })];
  for (const status of ['started', 'approved', 'declined', 'cancelled', 'resolved'] as const) {
    const local = [att({ status, resolvedBy: status === 'resolved' ? 'Me' : undefined })];
    const r = applyRemoteResolutions(local, cloud);
    assert.equal(r.list, local, `${status} is left alone`); assert.equal(r.resolved.length, 0);
  }
});
test('nothing changes when no resolution matches, and the same list comes back so a caller can tell by identity', () => {
  const local = [att()];
  assert.equal(applyRemoteResolutions(local, []).list, local);
  assert.equal(applyRemoteResolutions(local, [shared({ status: 'unknown' })]).list, local, 'an unresolved copy is not a resolution');
  assert.equal(applyRemoteResolutions(local, [shared({ ref: 'other', status: 'resolved', resolvedBy: 'Sam' })]).list, local);
  assert.equal(applyRemoteResolutions(local, [shared({ saleUuid: 's2', status: 'resolved', resolvedBy: 'Sam' })]).list, local, 'the sale must match too');
});
test('the notice names who resolved it and the amount', () => {
  const n = resolvedElsewhereNotice(att({ status: 'resolved', resolvedBy: 'Sam', amountCents: 2500 }));
  assert.match(n.body, /Sam/); assert.match(n.body, /25\.00/); assert.match(n.body, /terminal or Zeller dashboard/);
});
test('the Diagnostics rows show only payments that still need someone, newest first, with the register name', () => {
  const rows = unresolvedRows([
    shared({ ref: 'r1', ts: '2026-10-31T01:00:00.000Z', status: 'unknown' }),
    shared({ ref: 'r2', ts: '2026-10-31T02:00:00.000Z', status: 'started', registerName: 'Back' }),
    shared({ ref: 'r3', status: 'approved' }), shared({ ref: 'r4', status: 'resolved', resolvedBy: 'Sam' }),
    shared({ ref: 'r5', ts: '2026-10-31T00:00:00.000Z', status: 'unknown', registerName: '' }),
  ], 8, Date.parse('2026-10-31T02:01:00.000Z'));
  assert.deepEqual(rows.map(r => r.key), ['s1|r2', 's1|r1', 's1|r5']);
  assert.match(rows[0].title, /in progress/); assert.match(rows[1].title, /no result yet/);
  assert.match(rows[0].sub, /^Back/); assert.match(rows[2].sub, /^Unnamed register/);
});
test('a started attempt older than five minutes is shown as stopped part way, not in progress for ever', () => {
  const at = (ms: number) => unresolvedRows([shared({ status: 'started', ts: '2026-10-31T02:00:00.000Z' })], 8, Date.parse('2026-10-31T02:00:00.000Z') + ms)[0].title;
  assert.match(at(4 * 60_000), /in progress/); assert.match(at(6 * 60_000), /stopped part way/);
  assert.match(at(6 * 60_000), /25\.00/, 'it is still listed, since a manager needs to see it');
});
test('the rows are capped', () => {
  const many = Array.from({ length: 20 }, (_, i) => shared({ ref: `r${i}`, ts: `2026-10-31T00:${String(i).padStart(2, '0')}:00.000Z` }));
  assert.equal(unresolvedRows(many).length, 8); assert.equal(unresolvedRows(many, 3).length, 3);
});

// ── the pull ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

type Rec = Record<string, any>;
function zone() { // one shared CloudKit zone that two registers can pull from
  const attempts = new Map<string, Rec>(), resolutions = new Map<string, Rec>(); let fail = false;
  const page = (rows: Rec[], after: string | null | undefined, limit: number) => { const from = after ? Number(after) : 0; return { rows: rows.slice(from, from + limit), next: from + limit < rows.length ? String(from + limit) : null }; };
  const n = {
    async putAttempt(h: string, f: Rec) { const r = { ...f, recordName: `attempt-${h}` }; attempts.set(h, r); return r; },
    async getAttempt(h: string) { return attempts.get(h) ?? null; },
    async listAttempts(limit: number, after?: string | null) { if (fail) throw new Error('offline'); return page([...attempts.values()], after, limit); },
    async putResolution(h: string, f: Rec) { const had = resolutions.get(h); if (had) return had; const r = { ...f, recordName: `resolve-${h}` }; resolutions.set(h, r); return r; },
    async getResolution(h: string) { return resolutions.get(h) ?? null; },
    async listResolutions(limit: number, after?: string | null) { return page([...resolutions.values()], after, limit); },
  } as unknown as EventNative;
  return { n, setFail: (v: boolean) => { fail = v; } };
}
function reg(z: ReturnType<typeof zone>, id: string, over: Partial<AttemptSyncDeps> = {}) {
  const state = { local: [] as Attempt[], shared: [] as SharedAttempt[], notices: [] as Attempt[], localSets: 0 };
  const sync = createAttemptSync({
    active: () => true, training: () => false, who: () => ({ id, name: `Reg ${id}` }), native: async () => z.n,
    local: () => state.local, setShared: l => { state.shared = l; }, setLocal: l => { state.local = l; state.localSets++; }, notifyResolved: a => { state.notices.push(a); }, ...over,
  });
  return { sync, state };
}

test('a pull keeps every register\'s attempts in the shop-wide list', async () => {
  const z = zone(); const a = reg(z, 'a'), b = reg(z, 'b');
  a.state.local = [att({ ref: 'ra' })]; b.state.local = [att({ ref: 'rb', saleUuid: 's2' })];
  await a.sync.catchUp(); await b.sync.catchUp();
  assert.equal(await a.sync.pull(), 2);
  assert.deepEqual(a.state.shared.map(x => x.registerName).sort(), ['Reg a', 'Reg b']);
});
test('another register resolving a payment that waits here: it is marked resolved here, once, with one notice', async () => {
  const z = zone(); const a = reg(z, 'a'), b = reg(z, 'b');
  a.state.local = [att()]; await a.sync.catchUp(); await b.sync.catchUp();
  await b.sync.push(att({ status: 'resolved', resolvedBy: 'Alex' })); // B resolves A's payment (B pushes it under its own name; the first writer's label stays)
  assert.equal(await a.sync.pull(), 1);
  assert.equal(a.state.local[0].status, 'resolved'); assert.equal(a.state.local[0].resolvedBy, 'Alex');
  assert.equal(a.state.notices.length, 1); assert.equal(a.state.notices[0].resolvedBy, 'Alex');
  await a.sync.pull(); // already resolved here, so a second pull says nothing more
  assert.equal(a.state.notices.length, 1); assert.equal(a.state.localSets, 1);
});
test('a payment this register resolved itself does not raise a notice', async () => {
  const z = zone(); const a = reg(z, 'a');
  a.state.local = [att({ status: 'resolved', resolvedBy: 'Sam' })]; await a.sync.catchUp(); await a.sync.pull();
  assert.equal(a.state.notices.length, 0); assert.equal(a.state.localSets, 0);
});
test('nothing is read when CloudKit is not active or in practice mode, and the list is left as it was', async () => {
  for (const over of [{ active: () => false }, { training: () => true }]) {
    const z = zone(); const a = reg(z, 'a', over); a.state.shared = [shared()];
    assert.equal(await a.sync.pull(), null); assert.equal(a.state.shared.length, 1);
  }
});
test('a failed read returns null, never throws, changes nothing, and works again next time', async () => {
  const z = zone(); const a = reg(z, 'a'); a.state.local = [att()]; await a.sync.catchUp(); await a.sync.pull();
  z.setFail(true); a.state.shared = [shared({ ref: 'kept' })];
  assert.equal(await a.sync.pull(), null); assert.equal(a.state.shared[0].ref, 'kept');
  z.setFail(false); assert.equal(await a.sync.pull(), 1);
});
test('a change made while CloudKit is answering is not overwritten', async () => {
  const z = zone(); const a = reg(z, 'a'); a.state.local = [att()]; await a.sync.catchUp();
  await z.n.putResolution('s1-ref-1', { ref: 'ref-1', saleUuid: 's1', resolvedBy: 'Alex', registerId: 'b', registerName: 'Reg b' });
  const slow = reg(z, 'a', { native: async () => { await Promise.resolve(); return z.n; }, local: () => a.state.local, setLocal: l => { a.state.local = l; } });
  const p = slow.sync.pull(); a.state.local = [att({ note: 'added meanwhile' })]; await p;
  assert.equal(a.state.local[0].note, 'added meanwhile', 'the list is read after CloudKit answers, so the later note survives');
  assert.equal(a.state.local[0].status, 'resolved');
});

// ── the wiring ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(p, 'utf8');
test('the poll pulls attempts after the catch-up and only outside practice mode', () => {
  const sync = read('src/lib/sync.ts'); const poll = sync.slice(sync.indexOf('export async function pollShared'), sync.indexOf('// ── the shop-wide sales view'));
  assert.ok(poll.indexOf('attemptSync.catchUp()') >= 0 && poll.indexOf('attemptSync.catchUp()') < poll.indexOf('attemptSync.pull()'));
  assert.ok(poll.indexOf('!isTraining()') < poll.indexOf('attemptSync.pull()') && poll.indexOf('attemptSync.pull()') < poll.indexOf('// stock'));
});
test('the shop-wide list lives in memory only and a resolved-elsewhere notice stays local', () => {
  const store = read('src/state/store.ts');
  assert.match(store, /sharedAttempts: SharedAttempt\[\]/); assert.match(store, /sharedAttempts: \[\]/);
  assert.equal((store.match(/persist\('[a-z]+'/g) ?? []).every(m => !m.includes('sharedAttempts')), true);
  assert.doesNotMatch(store.slice(store.indexOf('type Pos = {'), store.indexOf('export type App = {')), /sharedAttempts/, 'not part of the saved pos');
  const sync = read('src/lib/sync.ts'); assert.match(sync, /notifyResolved: a => \{[^}]*notify\(\{ kind: 'info'/);
});
test('Diagnostics shows the all-registers section only once CloudKit has sent attempts', () => {
  const d = read('src/screens/Diagnostics.tsx');
  assert.match(d, /sharedAttempts\.length \? <Section title="Card payments waiting \(all registers\)"/); assert.match(d, /unresolvedRows\(sharedAttempts, 8, Date\.now\(\), registerId\)/);
});
