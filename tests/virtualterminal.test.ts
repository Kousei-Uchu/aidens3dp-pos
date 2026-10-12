// Tests for the virtual Zeller Terminal 2: the screen model, the controller's timers, and the practice terminal driving it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { COPY, CONTACTLESS_LIMIT_CENTS, DWELL_MS, PIN_MAX, PIN_MIN, VT_SCREENS, autoAction, eventFor, needsPin, previewState, screenText, vtInitial, vtReduce, type VtAction, type VtState } from '../src/lib/virtualTerminal';
import { createVt } from '../src/lib/virtualTerminalSession';
import { makeTrainingTerminal } from '../src/lib/trainingTerminal';
import { startCharge, type ZellerEvent } from '../src/lib/zeller';

const fire = (f: { q: { f: () => void }[] }) => { const t = f.q.shift(); t?.f(); }; // a timer that has gone off is no longer pending
const run = (s: VtState, ...a: VtAction[]) => a.reduce(vtReduce, s);
const fake = () => { const q: { f: () => void; ms: number; id: number }[] = []; let id = 0; return { q, timers: { set: (f: () => void, ms: number) => { q.push({ f, ms, id: ++id }); return id; }, clear: (h: unknown) => { const i = q.findIndex(x => x.id === h); if (i >= 0) q.splice(i, 1); } } }; };

test('a request wakes the terminal on the amount screen and clears the last payment', () => {
  const s = run(vtInitial(), { t: 'request', amountCents: 4500 });
  assert.equal(s.screen, 'amount'); assert.equal(s.amountCents, 4500); assert.equal(s.pin, 0);
  const again = run(run(s, { t: 'present', media: 'TAP' }), { t: 'request', amountCents: 100 }); assert.equal(again.screen, 'amount'); assert.equal(again.media, undefined);
});
test('tap under the limit goes straight to processing; insert, or tap over the limit, asks for a PIN', () => {
  assert.equal(run(vtInitial(), { t: 'request', amountCents: 4500 }, { t: 'present', media: 'TAP' }).screen, 'processing');
  assert.equal(run(vtInitial(), { t: 'request', amountCents: 4500 }, { t: 'present', media: 'INSERT' }).screen, 'pin');
  assert.equal(run(vtInitial(), { t: 'request', amountCents: CONTACTLESS_LIMIT_CENTS + 1 }, { t: 'present', media: 'TAP' }).screen, 'pin');
  assert.equal(needsPin('TAP', CONTACTLESS_LIMIT_CENTS), false);
});
test('PIN keys: digits fill up to the maximum, delete takes one back, OK needs the minimum', () => {
  let s = run(vtInitial(), { t: 'request', amountCents: 100 }, { t: 'present', media: 'INSERT' });
  for (let i = 0; i < PIN_MIN - 1; i++) s = vtReduce(s, { t: 'key', key: '1' });
  assert.equal(vtReduce(s, { t: 'key', key: 'ok' }).screen, 'pin', 'too short');
  s = vtReduce(s, { t: 'key', key: '1' }); assert.equal(s.pin, PIN_MIN); assert.equal(vtReduce(s, { t: 'key', key: 'ok' }).screen, 'processing');
  for (let i = 0; i < 9; i++) s = vtReduce(s, { t: 'key', key: '7' }); assert.equal(s.pin, PIN_MAX);
  assert.equal(vtReduce(s, { t: 'key', key: 'del' }).pin, PIN_MAX - 1); assert.equal(vtReduce(vtInitial(), { t: 'key', key: '5' }).pin, 0, 'ignored off the PIN screen'); assert.equal(vtReduce(s, { t: 'key', key: 'x' }), s);
});
test('cancel works on the amount and PIN screens and nowhere else', () => {
  assert.equal(run(vtInitial(), { t: 'request', amountCents: 100 }, { t: 'cancel' }).screen, 'cancelled');
  assert.equal(run(vtInitial(), { t: 'request', amountCents: 100 }, { t: 'present', media: 'INSERT' }, { t: 'cancel' }).screen, 'cancelled');
  const proc = run(vtInitial(), { t: 'request', amountCents: 100 }, { t: 'present', media: 'TAP' }); assert.equal(vtReduce(proc, { t: 'cancel' }), proc, 'no cancel while processing');
});
test('approved by tap goes to the receipt screen then sleeps; by insert it asks for the card out first', () => {
  const tap = run(vtInitial(), { t: 'request', amountCents: 100 }, { t: 'present', media: 'TAP' }, { t: 'result', approved: true });
  assert.equal(tap.screen, 'approved'); const r = vtReduce(tap, { t: 'next' }); assert.equal(r.screen, 'receipt'); assert.equal(vtReduce(r, { t: 'next' }).screen, 'sleep');
  const ins = run(vtInitial(), { t: 'request', amountCents: 100 }, { t: 'present', media: 'INSERT' }, { t: 'key', key: '1' }, { t: 'key', key: '2' }, { t: 'key', key: '3' }, { t: 'key', key: '4' }, { t: 'key', key: 'ok' }, { t: 'result', approved: true }, { t: 'next' });
  assert.equal(ins.screen, 'removeCard'); assert.equal(vtReduce(ins, { t: 'removed' }).screen, 'receipt');
});
test('declined shows the reason, never offers a receipt, and ends asleep with the amount cleared', () => {
  const d = run(vtInitial(), { t: 'request', amountCents: 700 }, { t: 'present', media: 'TAP' }, { t: 'result', approved: false, text: 'Insufficient funds', code: '51' });
  assert.equal(d.screen, 'declined'); assert.match(screenText(d).line, /Insufficient funds/); const n = vtReduce(d, { t: 'next' }); assert.equal(n.screen, 'sleep'); assert.equal(n.amountCents, 0);
});
test('a result only counts while processing, and offline shows the unavailable screen', () => {
  const a = run(vtInitial(), { t: 'request', amountCents: 100 }); assert.equal(vtReduce(a, { t: 'result', approved: true }), a);
  const o = vtReduce(a, { t: 'offline' }); assert.equal(o.screen, 'unavailable'); assert.equal(vtReduce(o, { t: 'next' }).screen, 'sleep');
});
test('light and dark mode survive a reset and a new payment', () => {
  let s = vtReduce(vtInitial(), { t: 'dark', dark: true }); s = run(s, { t: 'request', amountCents: 100 }, { t: 'reset' }); assert.equal(s.dark, true); assert.equal(run(s, { t: 'request', amountCents: 5 }).dark, true);
});
test('every screen has copy, a preview, and screens that wait for a person have no automatic move', () => {
  for (const sc of VT_SCREENS) { assert.ok(COPY[sc], sc); assert.equal(previewState(sc).screen, sc); }
  for (const sc of ['sleep', 'amount', 'pin', 'processing'] as const) assert.equal(autoAction(previewState(sc)), null, sc);
  for (const sc of ['approved', 'declined', 'cancelled', 'receipt', 'unavailable', 'removeCard'] as const) { assert.ok(DWELL_MS[sc] > 0); assert.ok(autoAction(previewState(sc)), sc); }
  assert.deepEqual(autoAction(previewState('removeCard')), { t: 'removed' });
  assert.match(screenText(previewState('amount', false, 4500)).title, /\$45\.00/);
});
test('the events sent match the real terminal\'s names', () => {
  assert.equal(eventFor(previewState('amount'))?.type, 'AWAITING_PAYMENT_METHOD'); assert.equal(eventFor(previewState('pin'))?.type, 'AWAITING_PIN_ENTRY');
  assert.equal(eventFor(previewState('processing'))?.type, 'PROCESSING'); assert.equal(eventFor(previewState('sleep')), null);
});

test('the controller moves message screens on by itself, except that a manual terminal waits for the card to be taken out', () => {
  const f = fake(); const vt = createVt({ timers: f.timers });
  vt.dispatch({ t: 'request', amountCents: 100 }); vt.dispatch({ t: 'present', media: 'TAP' }); vt.dispatch({ t: 'result', approved: true });
  assert.equal(vt.get().screen, 'approved'); assert.equal(f.q.length, 1); assert.equal(f.q[0].ms, DWELL_MS.approved); fire(f); assert.equal(vt.get().screen, 'receipt');
  fire(f); assert.equal(vt.get().screen, 'sleep'); assert.equal(f.q.length, 0, 'nothing left running');
  const m = createVt({ manual: true, timers: f.timers }); m.dispatch({ t: 'request', amountCents: 100 }); m.dispatch({ t: 'present', media: 'INSERT' });
  for (const k of ['1', '2', '3', '4', 'ok']) m.dispatch({ t: 'key', key: k }); m.dispatch({ t: 'result', approved: true }); fire(f); assert.equal(m.get().screen, 'removeCard'); assert.equal(f.q.length, 0, 'waits for the person');
  m.dispatch({ t: 'removed' }); assert.equal(m.get().screen, 'receipt');
});
test('a new action cancels the timer that was waiting, and dispose stops everything', () => {
  const f = fake(); const vt = createVt({ timers: f.timers }); vt.dispatch({ t: 'request', amountCents: 100 }); vt.dispatch({ t: 'cancel' }); assert.equal(f.q.length, 1);
  vt.dispatch({ t: 'request', amountCents: 200 }); assert.equal(f.q.length, 0); vt.dispatch({ t: 'cancel' }); vt.dispose(); assert.equal(f.q.length, 0);
});
test('subscribers hear every change once, and not an action that changes nothing', () => {
  const vt = createVt({ timers: fake().timers }); const seen: string[] = []; const off = vt.subscribe(s => seen.push(s.screen));
  vt.dispatch({ t: 'key', key: '1' }); vt.dispatch({ t: 'request', amountCents: 100 }); vt.dispatch({ t: 'request', amountCents: 100 }); off(); vt.dispatch({ t: 'cancel' }); assert.deepEqual(seen, ['amount', 'amount']);
});

const events = (p: { onEvent?: (cb: (e: ZellerEvent) => void) => unknown }) => { const seen: string[] = []; p.onEvent?.(e => seen.push(e.type)); return seen; };
test('practice terminal, automatic: same events and result as before, and the picture follows', async () => {
  const vt = createVt({ timers: fake().timers }); const t = makeTrainingTerminal({ next: () => 'approve', stepMs: 5, vt }); const op = t.purchase({ amount: 4500, reference: 'a' }); const seen = events(op);
  const r: any = await op; assert.equal(r.status, 'APPROVED'); assert.equal(r.cardMedia, 'TAP'); assert.deepEqual(seen, ['AWAITING_PAYMENT_METHOD', 'PROCESSING', 'DISPLAYING_PAYMENT_MESSAGE']); assert.equal(vt.get().screen, 'approved');
});
test('practice terminal, automatic over the contactless limit: it keys a PIN by itself', async () => {
  const vt = createVt({ timers: fake().timers }); const t = makeTrainingTerminal({ next: () => 'approve', stepMs: 5, vt }); const op = t.purchase({ amount: 25000, reference: 'b' }); const seen = events(op);
  const r: any = await op; assert.equal(r.status, 'APPROVED'); assert.ok(seen.includes('AWAITING_PIN_ENTRY')); assert.ok(seen.indexOf('AWAITING_PIN_ENTRY') < seen.indexOf('PROCESSING'));
});
test('practice terminal, decline: the screen shows the reason and the till gets code 51 (or the code a course asks for)', async () => {
  const vt = createVt({ timers: fake().timers }); const t = makeTrainingTerminal({ next: () => 'decline', stepMs: 5, vt }); const r: any = await t.purchase({ amount: 100, reference: 'c' });
  assert.equal(r.responseCode, '51'); assert.equal(vt.get().screen, 'declined'); assert.equal(vt.get().failText, 'Insufficient funds');
  const vt2 = createVt({ timers: fake().timers }); const t2 = makeTrainingTerminal({ next: () => 'decline', stepMs: 5, vt: vt2, declineCode: () => 'QB' }); const r2: any = await t2.purchase({ amount: 100, reference: 'd' });
  assert.equal(r2.responseCode, 'QB'); assert.match(vt2.get().failText ?? '', /declined|locked/i);
});
test('practice terminal, manual: nothing happens until the person presents a card; insert asks for a PIN they key', async () => {
  const vt = createVt({ manual: true, timers: fake().timers }); const t = makeTrainingTerminal({ next: () => 'approve', stepMs: 5, vt }); const op = t.purchase({ amount: 1200, reference: 'e' }); let done = false; void op.then(() => { done = true; });
  await new Promise(r => setTimeout(r, 40)); assert.equal(done, false); assert.equal(vt.get().screen, 'amount');
  vt.dispatch({ t: 'present', media: 'INSERT' }); assert.equal(vt.get().screen, 'pin'); await new Promise(r => setTimeout(r, 40)); assert.equal(done, false, 'waits for the PIN');
  for (const k of ['4', '2', '4', '2', 'ok']) vt.dispatch({ t: 'key', key: k }); const r: any = await op; assert.equal(r.status, 'APPROVED'); assert.equal(r.cardMedia, 'INSERT');
});
test('practice terminal, manual: Cancel on the terminal cancels the sale, and so does cancelling from the till', async () => {
  const vt = createVt({ manual: true, timers: fake().timers }); const t = makeTrainingTerminal({ next: () => 'approve', stepMs: 5, vt }); const op = t.purchase({ amount: 100, reference: 'f' }); await new Promise(r => setTimeout(r, 20));
  vt.dispatch({ t: 'cancel' }); const r: any = await op; assert.equal(r.type, 'Cancelled'); assert.equal(vt.get().screen, 'cancelled');
  const vt2 = createVt({ manual: true, timers: fake().timers }); const t2 = makeTrainingTerminal({ next: () => 'approve', stepMs: 5, vt: vt2 }); const c = startCharge(t2, { amountCents: 100, reference: 'g' }); await new Promise(r => setTimeout(r, 20)); c.cancel();
  assert.equal((await c.promise).kind, 'CANCELLED'); assert.equal(vt2.get().screen, 'cancelled');
});
test('cancelling during processing puts the terminal back to sleep instead of leaving it spinning', async () => {
  const vt = createVt({ timers: fake().timers }); const t = makeTrainingTerminal({ next: () => 'approve', stepMs: 30, vt }); const c = startCharge(t, { amountCents: 100, reference: 'h' }); await new Promise(r => setTimeout(r, 45)); assert.equal(vt.get().screen, 'processing'); c.cancel(); await c.promise; assert.equal(vt.get().screen, 'sleep');
});
