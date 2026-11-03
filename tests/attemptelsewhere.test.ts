// Location: tests/attemptelsewhere.test.ts
// CloudKit patch 4 leftover (decisions item 9, Q10): resolving a card payment that another register holds, from a different register.
// The first resolution wins, the attempt keeps the register that wrote it, a payment that may still be charging is never touched, and the
// register that owns the payment hears about it through the pull that already exists (0200).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttemptSync } from '../src/lib/cloudkit/attemptSync';
import type { EventNative } from '../src/lib/cloudkit/eventCloud';
import { canResolveElsewhere, resolvedElsewhereAttempt, resolvedElsewhereEvent, unresolvedRows } from '../src/lib/attemptShared';
import type { SharedAttempt } from '../src/lib/eventRecords';
import type { Attempt } from '../src/state/store';

type Rec = Record<string, any>;
function shop() {
  const attempts = new Map<string, Rec>(), resolutions = new Map<string, Rec>(); const calls = { attemptWrites: 0, resolutionWrites: 0 }; let offline = false;
  const guard = () => { if (offline) throw new Error('offline'); };
  const page = (m: Map<string, Rec>, after?: string | null) => ({ rows: [...m.values()], next: null as string | null, after });
  const n = {
    async putAttempt(h: string, f: Rec) { guard(); calls.attemptWrites++; const r = { ...f, recordName: `attempt-${h}` }; attempts.set(h, r); return r; },
    async getAttempt(h: string) { guard(); return attempts.get(h) ?? null; },
    async putResolution(h: string, f: Rec) { guard(); const had = resolutions.get(h); if (had) return had; calls.resolutionWrites++; const r = { ...f, recordName: `resolve-${h}` }; resolutions.set(h, r); return r; },
    async getResolution(h: string) { guard(); return resolutions.get(h) ?? null; },
    async listAttempts(_l: number, after?: string | null) { guard(); return page(attempts, after); },
    async listResolutions(_l: number, after?: string | null) { guard(); return page(resolutions, after); },
  } as unknown as EventNative;
  return { n, attempts, resolutions, calls, setOffline: (v: boolean) => { offline = v; } };
}
type Shop = ReturnType<typeof shop>;
function register(z: Shop, id: string, local: Attempt[] = [], over: Record<string, unknown> = {}) {
  const seen = { shared: [] as SharedAttempt[], local, notices: [] as Attempt[] };
  const s = createAttemptSync({
    active: () => true, training: () => false, who: () => ({ id, name: `Reg ${id}` }), native: async () => z.n, local: () => seen.local,
    setShared: l => { seen.shared = l; }, setLocal: l => { seen.local = l; }, notifyResolved: a => { seen.notices.push(a); }, ...over,
  } as any);
  return { s, seen };
}
const att = (o: Partial<Attempt> = {}): Attempt => ({ ref: 'ref-1', saleUuid: 's1', amountCents: 2500, ts: '2026-10-31T03:00:00.000Z', status: 'unknown', ...o });
async function stuck(z: Shop, status: Attempt['status'] = 'unknown') { // register A holds a payment with no result
  const a = register(z, 'a', [att({ status })]); await a.s.catchUp(); return a;
}

test('only a payment with no result that another register holds can be resolved from here', () => {
  const sh = (o: Partial<SharedAttempt>): SharedAttempt => ({ ...att(), registerId: 'a', registerName: 'Reg a', ...o } as SharedAttempt);
  assert.equal(canResolveElsewhere(sh({}), 'b'), true);
  assert.equal(canResolveElsewhere(sh({}), 'a'), false, 'its own payment is resolved on its Pay screen');
  assert.equal(canResolveElsewhere(sh({ status: 'started' }), 'b'), false, 'a started payment may still be charging');
  assert.equal(canResolveElsewhere(sh({ status: 'resolved' } as any), 'b'), false);
  assert.equal(canResolveElsewhere(sh({}), ''), false, 'a register with no id cannot');
});

test('resolving writes the resolution once, keeps the register that wrote the attempt, and returns who resolved it', async () => {
  const z = shop(); await stuck(z); const b = register(z, 'b'); await b.s.pull();
  const target = b.seen.shared[0]; assert.equal(target.registerId, 'a');
  const won = await b.s.resolveElsewhere(target, 'Sam');
  assert.equal(won?.status, 'resolved'); assert.equal(won?.resolvedBy, 'Sam'); assert.equal(won?.registerId, 'a'); assert.equal(won?.registerName, 'Reg a');
  assert.equal(z.calls.resolutionWrites, 1); assert.equal(z.attempts.get('s1-ref-1')!.registerId, 'a');
  assert.equal(b.seen.shared[0].status, 'resolved', 'the list on the resolving register updates straight away');
});

test('the register that holds the payment hears about it on its next pull, and nothing is charged or added to its sale', async () => {
  const z = shop(); const a = await stuck(z); const b = register(z, 'b'); await b.s.pull();
  await b.s.resolveElsewhere(b.seen.shared[0], 'Sam');
  await a.s.pull();
  assert.equal(a.seen.local[0].status, 'resolved'); assert.equal(a.seen.local[0].resolvedBy, 'Sam'); assert.equal(a.seen.notices.length, 1);
});

test('the first resolution wins: a second register is told who won and writes nothing more', async () => {
  const z = shop(); await stuck(z); const b = register(z, 'b'); const c = register(z, 'c'); await b.s.pull(); await c.s.pull();
  const first = await b.s.resolveElsewhere(b.seen.shared[0], 'Sam'); const second = await c.s.resolveElsewhere(c.seen.shared[0], 'Alex');
  assert.equal(first?.resolvedBy, 'Sam'); assert.equal(second?.resolvedBy, 'Sam'); assert.equal(z.calls.resolutionWrites, 1);
});

test('a started payment, the register\'s own payment, practice mode, an inactive backend and an unregistered till are all refused with no write', async () => {
  const z = shop(); await stuck(z, 'started'); const b = register(z, 'b'); await b.s.pull();
  assert.equal(await b.s.resolveElsewhere(b.seen.shared[0], 'Sam'), null);
  const z2 = shop(); const a = await stuck(z2); await a.s.pull();
  assert.equal(await a.s.resolveElsewhere(a.seen.shared[0], 'Sam'), null);
  const z3 = shop(); await stuck(z3);
  for (const over of [{ training: () => true }, { active: () => false }, { who: () => ({ id: '', name: '' }) }]) {
    const r = register(z3, 'b', [], over); const list = (await register(z3, 'b').s.pull(), z3.attempts.get('s1-ref-1')!);
    assert.equal(await r.s.resolveElsewhere({ ...att(), registerId: 'a', registerName: 'Reg a', ref: list.ref, saleUuid: list.saleUuid } as SharedAttempt, 'Sam'), null);
  }
  assert.equal(z.calls.resolutionWrites + z2.calls.resolutionWrites + z3.calls.resolutionWrites, 0);
});

test('an unreachable CloudKit returns null without throwing, and a retry works', async () => {
  const z = shop(); await stuck(z); const b = register(z, 'b'); await b.s.pull();
  z.setOffline(true); assert.equal(await b.s.resolveElsewhere(b.seen.shared[0], 'Sam'), null); assert.equal(z.calls.resolutionWrites, 0);
  z.setOffline(false); assert.equal((await b.s.resolveElsewhere(b.seen.shared[0], 'Sam'))?.resolvedBy, 'Sam');
});

test('the attempt pushed to resolve keeps the amount, time and note, and the event names the other register', () => {
  const s = { ...att({ note: 'n' }), registerId: 'a', registerName: 'Front till' } as SharedAttempt;
  assert.deepEqual(resolvedElsewhereAttempt(s, 'Sam'), { ref: 'ref-1', saleUuid: 's1', amountCents: 2500, ts: s.ts, status: 'resolved', resolvedBy: 'Sam', note: 'n' });
  assert.deepEqual(resolvedElsewhereEvent(s, true, 'Sam'), { kind: 'unknown_resolved', saleUuid: 's1', reference: 'ref-1', amountCents: 2500, staff: 'Sam', message: 'resolved: charged (payment from Front till)' });
  assert.match(resolvedElsewhereEvent({ ...s, registerName: '' }, false, 'Sam').message, /not charged \(payment from another register\)/);
});

test('the waiting rows say which can be resolved here only when the register is known', () => {
  const list = [{ ...att(), registerId: 'a', registerName: 'A' }, { ...att({ ref: 'r2', status: 'started', ts: '2026-10-31T02:00:00.000Z' }), registerId: 'a', registerName: 'A' }, { ...att({ ref: 'r3', ts: '2026-10-31T01:00:00.000Z' }), registerId: 'b', registerName: 'B' }] as SharedAttempt[];
  assert.deepEqual(unresolvedRows(list, 8, Date.now(), 'b').map(r => r.resolvable), [true, false, false]);
  assert.equal(unresolvedRows(list)[0].resolvable, undefined);
});

test('Diagnostics offers Charged and Not charged only on rows that can be resolved, confirms first, and logs the event', async () => {
  const { readFileSync } = await import('node:fs'); const d = readFileSync('src/screens/Diagnostics.tsx', 'utf8');
  assert.match(d, /r\.resolvable && r\.attempt \?/); assert.match(d, /title="Charged"/); assert.match(d, /title="Not charged"/);
  const fn = d.slice(d.indexOf('const resolveElsewhere'), d.indexOf('const refund'));
  assert.ok(fn.indexOf('await confirm(') < fn.indexOf('attemptSync.resolveElsewhere'), 'asked before anything is sent');
  assert.match(fn, /csv\.event\(resolvedElsewhereEvent\(a, charged, who\)\)/); assert.match(fn, /resolved this payment first/);
});
