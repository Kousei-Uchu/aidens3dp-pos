// Location: tests/trainingsandbox.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { useApp, flushPersist } from '../src/state/store';
import { kvGet, kvSet, kvDel, kvUseMemory } from '../src/lib/kv';
import { TRAINING_PROGRESS_KEY, isTraining, kvWriteAllowed, setTrainingGuard } from '../src/lib/trainingGuard';
import { PRACTICE_BUNDLES, PRACTICE_RECEIPT_URL, FIXTURE_VARIANTS, FIXTURE_CUSTOMERS, FIXTURE_COLLECTIONS, applyInjections, buildSandbox, declinesOf, fixtureGrid, isTrainId, takeSnapshot, trainingBlocker } from '../src/lib/trainingSandbox';
import { makeTrainingTerminal, resetTrainingTerminal, setDeclines, timing, trainingTerminal } from '../src/lib/trainingTerminal';
import { startCharge } from '../src/lib/zeller';
import { totalOf } from '../src/lib/cashLedger';

kvUseMemory();
test('the guard blocks every storage write except training progress', async () => {
  assert.equal(isTraining(), false); await kvSet('t.real', { a: 1 }); assert.deepEqual(await kvGet('t.real', null), { a: 1 });
  setTrainingGuard(true);
  try {
    assert.equal(kvWriteAllowed('settings'), false); assert.equal(kvWriteAllowed(TRAINING_PROGRESS_KEY), true);
    await kvSet('t.real', { a: 2 }); await kvDel('t.real'); assert.deepEqual(await kvGet('t.real', null), { a: 1 }, 'neither a write nor a delete got through');
    await kvSet(TRAINING_PROGRESS_KEY, { ok: true }); assert.deepEqual(await kvGet(TRAINING_PROGRESS_KEY, null), { ok: true });
  } finally { setTrainingGuard(false); }
  await kvDel('t.real'); await kvDel(TRAINING_PROGRESS_KEY);
});

test('state saves that were waiting are written before the swap, and none are scheduled during training', async () => {
  await kvDel('settings'); useApp.getState().patchSettings({ shopName: 'Real Shop' }); await flushPersist();
  assert.equal(((await kvGet<any>('settings', null)) ?? {}).shopName, 'Real Shop');
  setTrainingGuard(true);
  try { useApp.getState().patchSettings({ shopName: 'Practice' }); await new Promise(r => setTimeout(r, 500)); await flushPersist(); } finally { setTrainingGuard(false); }
  assert.equal(((await kvGet<any>('settings', null)) ?? {}).shopName, 'Real Shop', 'practice changes never reach storage');
  useApp.getState().patchSettings({ shopName: '' }); await flushPersist(); await kvDel('settings');
});

test('the sandbox is practice data only, keeps the signed-in person, blanks outside links, and restores exactly', () => {
  const s = useApp.getState();
  useApp.setState({ staffId: 's1', settings: { ...s.settings, staff: [{ id: 's1', name: 'Jo', role: 'cashier', salt: '', pinHash: '' }], requirePin: true, receipt: { ...s.settings.receipt, serverUrl: 'https://r.example' }, passServerUrl: 'https://p.example', giftClaimUrl: 'https://g.example', bundlesJson: '{"x":1}', adjustPerms: { cashier: { line: false } } as any }, unlocked: true });
  const real = takeSnapshot(useApp.getState()); const sb = buildSandbox(real);
  assert.equal(sb.staffId, 's1'); assert.equal(sb.settings.staff[0].name, 'Jo'); assert.equal(sb.unlocked, true);
  assert.equal(sb.settings.receipt.serverUrl, PRACTICE_RECEIPT_URL); assert.equal(sb.settings.passServerUrl, ''); assert.equal(sb.settings.giftClaimUrl, ''); assert.equal(sb.settings.bundlesJson, PRACTICE_BUNDLES); assert.deepEqual(sb.settings.adjustPerms, {});
  assert.equal(real.settings.receipt.serverUrl, 'https://r.example', 'the real settings object is untouched');
  for (const v of Object.values(sb.data.variants)) { assert.ok(isTrainId(v.id) && isTrainId(v.productId), v.id); }
  for (const c of [...sb.data.collections, ...sb.data.customers, ...sb.data.presets]) assert.ok(isTrainId(c.id), c.id);
  assert.equal(sb.pos.outbox.length, 0); assert.equal(sb.pos.sales.length, 0); assert.equal(sb.pos.shift.open, true); assert.ok(totalOf(sb.pos.ledger.counts) > 20000);
  assert.equal(sb.zeller.ready, true); assert.equal(sb.sync.state, 'idle');
  useApp.setState(sb); assert.equal(Object.keys(useApp.getState().data.variants).length, FIXTURE_VARIANTS.length);
  useApp.setState(real); assert.equal(useApp.getState().settings.receipt.serverUrl, 'https://r.example'); assert.equal(useApp.getState().pos, real.pos);
  useApp.setState({ staffId: undefined, settings: { ...s.settings } });
});
test('every grid tile of the fixture points at something that exists', () => {
  const ids = new Set(FIXTURE_VARIANTS.map(v => v.id)); const prods = new Set(FIXTURE_VARIANTS.map(v => v.productId));
  for (const t of fixtureGrid().pages[0].tiles) if (t.type === 'item') assert.ok((t.variantId && ids.has(t.variantId)) || (t.productId && prods.has(t.productId)));
  for (const c of FIXTURE_COLLECTIONS) for (const p of c.productIds) assert.ok(prods.has(p)); assert.ok(FIXTURE_CUSTOMERS.length >= 3);
  assert.equal(isTrainId('gid://shopify/Product/1'), false);
});
test('injections seed the cart and the drawer, and count card declines', () => {
  const sb = buildSandbox(takeSnapshot(useApp.getState()));
  const seeded = applyInjections(sb, [{ kind: 'cart', items: [{ variantId: 'train-v-bee', qty: 2 }, { variantId: 'train-v-dragon', qty: 1 }] }, { kind: 'ledger', counts: { '2000': 3 } }, { kind: 'decline', times: 2 }, { kind: 'ghost' } as any]);
  assert.equal(seeded.pos.cart.lines.length, 2); assert.equal(seeded.pos.cart.lines[0].qty, 2); assert.deepEqual(seeded.pos.ledger.counts, { '2000': 3 }); assert.equal(declinesOf([{ kind: 'decline', times: 2 }, { kind: 'decline', times: 1 }]), 3);
  assert.equal(applyInjections(seeded, undefined), seeded, 'no injection changes nothing'); assert.equal(applyInjections(seeded, [{ kind: 'decline', times: 1 }]), seeded);
  assert.ok(totalOf(sb.pos.ledger.counts) > 20000, 'the base sandbox has a normal drawer');
  assert.equal(applyInjections(sb, [{ kind: 'cart', items: [{ variantId: 'real-variant', qty: 1 }] }]).pos.cart.lines.length, 0, 'unknown variants are ignored');
});

test('the pretend terminal approves and declines through the real startCharge, and lists approved payments only', async () => {
  resetTrainingTerminal(); const fast = makeTrainingTerminal({ next: () => 'approve', stepMs: 5 });
  const events: string[] = []; const ok = await startCharge(fast, { amountCents: 1250, reference: 'sale-1' }, { onEvent: e => events.push(e.type) }).promise;
  assert.equal(ok.kind, 'APPROVED'); assert.deepEqual(events, ['AWAITING_PAYMENT_METHOD', 'PROCESSING']); assert.equal(fast.approved.length, 1);
  const outcomes: ('approve' | 'decline')[] = ['decline', 'approve']; const t2 = makeTrainingTerminal({ next: () => outcomes.shift() ?? 'approve', stepMs: 5 });
  const bad = await startCharge(t2, { amountCents: 500, reference: 'sale-2' }).promise; assert.equal(bad.kind, 'DECLINED'); if (bad.kind === 'DECLINED') { assert.equal(bad.code, '51'); assert.match(bad.text, /Insufficient funds/); }
  assert.equal(t2.approved.length, 0, 'a declined card is not in the terminal history'); assert.equal((await startCharge(t2, { amountCents: 500, reference: 'sale-2' }).promise).kind, 'APPROVED');
  const slow = makeTrainingTerminal({ next: () => 'approve', stepMs: 50 }); const c = startCharge(slow, { amountCents: 100, reference: 'sale-3' }); setTimeout(() => c.cancel(), 10); assert.equal((await c.promise).kind, 'CANCELLED');
});
test('the shared training terminal declines the number of times a goal asks for, then approves', async () => {
  resetTrainingTerminal(); timing.stepMs = 3; setDeclines(2);
  try {
    const kinds: string[] = []; for (const ref of ['a', 'b', 'c']) kinds.push((await startCharge(trainingTerminal, { amountCents: 100, reference: ref }).promise).kind);
    assert.deepEqual(kinds, ['DECLINED', 'DECLINED', 'APPROVED']); assert.equal(trainingTerminal.approved.length, 1);
    setDeclines(9); resetTrainingTerminal(); assert.equal((await startCharge(trainingTerminal, { amountCents: 100, reference: 'd' }).promise).kind, 'APPROVED', 'resetting clears queued declines');
  } finally { timing.stepMs = 600; resetTrainingTerminal(); }
});

test('training will not start over a real card payment or a part-paid sale', () => {
  const now = Date.parse('2026-10-12T10:00:00Z'); const at = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();
  type A = { status: string; ts: string; saleUuid?: string };
  const base = { pos: { cart: { id: 'c', lines: [] } as any, attempts: [] as A[] } };
  assert.equal(trainingBlocker(base, now), null);
  // a payment started a moment ago is genuinely waiting on the reader
  assert.match(trainingBlocker({ pos: { ...base.pos, attempts: [{ status: 'approved', ts: at(1) }, { status: 'started', ts: at(1) }] } }, now) ?? '', /waiting on the reader/);
  // an attempt left at "started" long ago (app closed mid payment) is history and must not lock training for good
  assert.equal(trainingBlocker({ pos: { ...base.pos, attempts: [{ status: 'started', ts: at(30) }, { status: 'started', ts: at(60 * 24 * 9) }] } }, now), null);
  // an unresolved "unknown" only blocks while its sale is still the one in the cart
  assert.equal(trainingBlocker({ pos: { ...base.pos, attempts: [{ status: 'unknown', ts: at(90), saleUuid: 'old-sale' }] } }, now), null);
  assert.equal(trainingBlocker({ pos: { cart: { id: 'c', lines: [], saleUuid: 'old-sale' } as any, attempts: [{ status: 'unknown', ts: at(90), saleUuid: 'other' }] } }, now), null);
  assert.match(trainingBlocker({ pos: { cart: { id: 'c', lines: [], saleUuid: 'sale-1' } as any, attempts: [{ status: 'unknown', ts: at(90), saleUuid: 'sale-1' }] } }, now) ?? '', /no result yet/);
  assert.match(trainingBlocker({ pos: { ...base.pos, cart: { id: 'c', lines: [], tenders: [{} as any] } as any } }, now) ?? '', /part-paid/);
  assert.equal(trainingBlocker({ pos: { ...base.pos, attempts: [{ status: 'declined', ts: at(1) }, { status: 'resolved', ts: at(1) }, { status: 'cancelled', ts: at(1) }] } }, now), null);
});
