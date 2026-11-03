// Location: tests/orderrecovery.test.ts
// CloudKit item 8 (Q11): another register finds sales that were left without a Shopify order and creates it. The rules, the write-once
// claim that stops two registers doing it at once, and the job, on an in-memory fake of the native module; plus source pins that the
// outbox writes the sale to CloudKit early (CloudKit only) and that the poll runs the job.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLAIM_STALE_MS, MAX_CLAIMS, MAX_PER_RUN, RECOVERY_EVERY_MS, RECOVERY_MIN_AGE_MS, claimBlocks, claimFields, claimHandle, recoveredNotice, strandedSales, unrecoverableReason } from '../src/lib/orderRecovery';
import { createOrderRecovery, type OrderRecoveryDeps } from '../src/lib/cloudkit/orderRecoverySync';
import type { EventNative } from '../src/lib/cloudkit/eventCloud';
import type { SaleRecord } from '../src/lib/types';

const NOW = Date.parse('2026-11-02T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const sale = (id: string, o: Partial<SaleRecord> = {}): SaleRecord => ({ uuid: id, type: 'sale', ts: ago(60 * 60_000), registerId: 'dead', registerName: 'Front till', lines: [{ id: 'l1', kind: 'item', title: 'Thing', qty: 1, unitCents: 500, netCents: 500 } as any], itemsCents: 500, discountCents: 0, netCents: 500, tipCents: 0, totalCents: 500, cogsCents: 0, feesCents: 0, roundingCents: 0, tenders: [{ id: 't1', kind: 'cash', amountCents: 500, at: ago(0) } as any], deals: [], ...o } as SaleRecord);

function fakeNative() {
  const res = new Map<string, Record<string, any>>(); let writes = 0;
  const n = { async putResolution(h: string, f: Record<string, any>) { const had = res.get(h); if (had) return had; writes++; const r = { ...f, recordName: `resolve-${h}` }; res.set(h, r); return r; } } as unknown as EventNative;
  return { n, res, writes: () => writes };
}
function job(over: Partial<OrderRecoveryDeps> & { sales?: SaleRecord[]; id?: string; clock?: { t: number }; shop?: ReturnType<typeof fakeNative> } = {}) {
  const shop = over.shop ?? fakeNative(); const clock = over.clock ?? { t: NOW }; const made: string[] = []; const doneIds = new Set<string>(); const notices: Array<{ title: string; body: string }> = [];
  const j = createOrderRecovery({
    active: () => true, training: () => false, canCreateOrders: () => true, who: () => ({ id: over.id ?? 'me', name: `Reg ${over.id ?? 'me'}` }), native: async () => shop.n,
    readSales: async () => (over.sales ?? []).filter(s => !doneIds.has(s.uuid)), outboxIds: () => new Set(), finish: async s => { made.push(s.uuid); doneIds.add(s.uuid); return `#${made.length + 1000}`; }, // a finished sale has its order, so it is no longer stranded
    notify: n => notices.push(n), now: () => clock.t, ...over,
  } as OrderRecoveryDeps);
  return { j, shop, made, notices, clock };
}

test('a stranded sale is a sale with no order, old enough, not in this register\'s own queue; oldest first; refunds and finished sales never', () => {
  const list = [sale('a', { ts: ago(30 * 60_000) }), sale('b', { ts: ago(2 * 3600_000) }), sale('young', { ts: ago(RECOVERY_MIN_AGE_MS - 1000) }), sale('done', { orderGid: 'gid://1' }),
    sale('refund', { type: 'refund' }), sale('mine'), sale('bad', { ts: 'nope' })];
  assert.deepEqual(strandedSales(list, { outboxIds: new Set(['mine']), nowMs: NOW }).map(s => s.uuid), ['b', 'a']);
});

test('a gift card sold or spent without its code is left for a person; an ordinary sale and a card sale are not', () => {
  assert.match(unrecoverableReason(sale('g', { lines: [{ id: 'l', kind: 'gift_card', title: 'Gift card', qty: 1, unitCents: 2000, netCents: 2000 } as any] }))!, /sold a gift card/);
  assert.match(unrecoverableReason(sale('g2', { tenders: [{ id: 't', kind: 'gift_card', amountCents: 500, at: '' } as any] }))!, /paid with a gift card/);
  assert.equal(unrecoverableReason(sale('ok', { lines: [{ id: 'l', kind: 'gift_card', title: 'Gift card', qty: 1, unitCents: 2000, netCents: 2000, giftCardCode: 'ABC' } as any] })), null);
  assert.equal(unrecoverableReason(sale('x')), null);
});

test('the claim uses the resolution record\'s existing fields, so the schema needs nothing new', () => {
  const f = claimFields({ id: 'me', name: 'Till' }, 'u1', NOW);
  assert.deepEqual(Object.keys(f).sort(), ['ref', 'registerId', 'registerName', 'resolvedAt', 'resolvedBy', 'saleUuid']); assert.equal(claimHandle('u1', 2), 'order-u1-2');
  assert.equal(claimBlocks({ registerId: 'other', resolvedAt: ago(60_000) }, { id: 'me', name: '' }, NOW), true);
  assert.equal(claimBlocks({ registerId: 'other', resolvedAt: ago(CLAIM_STALE_MS + 1) }, { id: 'me', name: '' }, NOW), false);
  assert.equal(claimBlocks({ registerId: 'other', resolvedAt: 'garbage' }, { id: 'me', name: '' }, NOW), true, 'an unreadable time is treated as fresh');
  assert.equal(claimBlocks({ registerId: 'me', resolvedAt: ago(0) }, { id: 'me', name: '' }, NOW), false);
});

test('a stranded sale is claimed, finished, and announced', async () => {
  const t = job({ sales: [sale('s1')] }); assert.equal(await t.j.run(), 1);
  assert.deepEqual(t.made, ['s1']); assert.equal(t.shop.writes(), 1); assert.equal(t.notices.length, 1);
  assert.match(t.notices[0].body, /Front till's .* sale had no Shopify order, so this register created it \(#1001\)/);
});

test('two registers looking at once: only the one whose claim landed first creates the order', async () => {
  const shop = fakeNative(); const a = job({ shop, id: 'a', sales: [sale('s1')] }); const b = job({ shop, id: 'b', sales: [sale('s1')] });
  const [ra, rb] = await Promise.all([a.j.run(), b.j.run()]);
  assert.equal((ra ?? 0) + (rb ?? 0), 1); assert.equal(a.made.length + b.made.length, 1); assert.equal(shop.writes(), 1);
});

test('a fresh claim by another register is respected; a stale one is taken over with the next claim number', async () => {
  const shop = fakeNative(); const clock = { t: NOW };
  await job({ shop, id: 'a', sales: [sale('s1')], clock, finish: async () => { throw new Error('Shopify down'); } }).j.run(true); // a claims then fails
  const b = job({ shop, id: 'b', sales: [sale('s1')], clock }); assert.equal(await b.j.run(true), 0); assert.deepEqual(b.made, []);
  clock.t += CLAIM_STALE_MS + 1000;
  assert.equal(await b.j.run(true), 1); assert.deepEqual(b.made, ['s1']); assert.ok(shop.res.has('order-s1-2'));
});

test('its own earlier claim is honoured, so a register that failed can try again at once', async () => {
  const shop = fakeNative(); let fail = true;
  const a = job({ shop, id: 'a', sales: [sale('s1')], finish: async () => { if (fail) throw new Error('x'); return '#9'; } });
  assert.equal(await a.j.run(true), 0); fail = false; assert.equal(await a.j.run(true), 1);
});

test('after MAX_CLAIMS stale claims by others the sale is left alone', async () => {
  const shop = fakeNative(); const clock = { t: NOW };
  for (let k = 1; k <= MAX_CLAIMS; k++) shop.res.set(`order-s1-${k}`, { registerId: 'ghost', resolvedAt: ago(CLAIM_STALE_MS * 3) });
  const t = job({ shop, sales: [sale('s1')], clock }); assert.equal(await t.j.run(true), 0); assert.deepEqual(t.made, []);
});

test('at most three orders per run, oldest first', async () => {
  const sales = ['a', 'b', 'c', 'd', 'e'].map((id, i) => sale(id, { ts: ago((10 - i) * 3600_000) }));
  const t = job({ sales }); assert.equal(await t.j.run(), MAX_PER_RUN); assert.deepEqual(t.made, ['a', 'b', 'c']);
});

test('it runs at most every ten minutes unless forced, and never in practice mode, with CloudKit off, without Shopify credentials or before the register has an id', async () => {
  const clock = { t: NOW }; const t = job({ sales: [sale('s1')], clock }); await t.j.run(); assert.equal(await t.j.run(), null);
  clock.t += RECOVERY_EVERY_MS; assert.equal(await t.j.run(), 0, 'due again, nothing left to do');
  for (const over of [{ training: () => true }, { active: () => false }, { canCreateOrders: () => false }, { who: () => ({ id: '', name: '' }) }]) {
    const x = job({ sales: [sale('s1')], ...over }); assert.equal(await x.j.run(true), null); assert.equal(x.shop.writes(), 0); assert.deepEqual(x.made, []);
  }
});

test('a gift card sale is not finished from here; a person is told once', async () => {
  const gift = sale('g', { lines: [{ id: 'l', kind: 'gift_card', title: 'Gift card', qty: 1, unitCents: 2000, netCents: 2000 } as any] });
  const t = job({ sales: [gift, sale('ok')] }); assert.equal(await t.j.run(true), 1); assert.deepEqual(t.made, ['ok']);
  assert.ok(t.notices.some(n => n.title === 'Sales with no Shopify order' && /cannot be finished from here/.test(n.body)));
  const before = t.notices.length; await t.j.run(true); assert.equal(t.notices.length, before, 'not repeated');
});

test('a CloudKit read failure returns null without throwing, and a failed order leaves the claim for its own retry', async () => {
  const t = job({ readSales: async () => { throw new Error('offline'); } }); assert.equal(await t.j.run(true), null);
  const u = job({ sales: [sale('s1')], finish: async () => { throw new Error('Shopify says no'); } }); assert.equal(await u.j.run(true), 0); assert.equal(u.notices.length, 0);
});

test('the notice names the other register and the order', () => assert.match(recoveredNotice(sale('s'), '#1042').body, /#1042/));

test('the outbox writes the sale to CloudKit before the Shopify order, for CloudKit only, and the poll runs the job', () => {
  const s = readFileSync('src/lib/sync.ts', 'utf8'); const run = s.slice(s.indexOf('async function runItem'), s.indexOf('/** Pull what other registers'));
  assert.match(run, /!o\.done\.early && activeBackendKind\(\) === 'cloudkit' && !isTraining\(\) && sale\.type === 'sale'/);
  assert.ok(run.indexOf("mark('early')") < run.indexOf("await receiptStep('receipt')"), 'before the receipt and the order');
  assert.ok(run.indexOf("mark('early')") < run.indexOf('createOrderForSale'));
  assert.match(run, /putShared\('sale', cur\.uuid, saleEntryFields\(cur, detailed\)\)/, 'the final entry step uses the same fields and adds the order');
  assert.match(s, /await orderRecovery\.run\(\);/);
  assert.match(readFileSync('src/state/store.ts', 'utf8'), /done: \{ early\?: boolean;/);
});
