import test from 'node:test';
import assert from 'node:assert/strict';
import { toCents, toDecimal, fmt, roundCash, allocate } from '../src/lib/money';
import { priceCart, splitLineForOrder, type PricingContext } from '../src/lib/pricing';
import { parseBundleConfig, validateBundleConfig } from '../src/lib/bundles';
import { normalise, startCharge, startRefund, type TerminalLike, type ZellerTxn } from '../src/lib/zeller';
import { lookupResponse } from '../src/lib/responseCodes';
import { feeFor, DEFAULT_FEES } from '../src/lib/fees';
import type { Cart, CartLine, Variant, AutoDiscount } from '../src/lib/types';

// ── helpers ──────────────────────────────────────────────────────────────────
const P = (n: number) => `gid://shopify/Product/${n}`;
const V = (n: number) => `gid://shopify/ProductVariant/${n}`;
const variant = (id: number, prod: number, cents: number, tags: string[] = []): Variant => ({
  id: V(id), productId: P(prod), productTitle: `P${prod}`, variantTitle: '', priceCents: cents, tracked: true, stock: 5, tags, active: true,
});
const line = (v: Variant, qty = 1, extra: Partial<CartLine> = {}): CartLine => ({
  id: `l-${v.id}`, kind: 'item', variantId: v.id, title: v.productTitle, qty, unitCents: v.priceCents, ...extra,
});
const mkCtx = (vs: Variant[], extra: Partial<PricingContext> = {}): PricingContext => ({
  variants: Object.fromEntries(vs.map(v => [v.id, v])), collectionsOfProduct: {}, autoDiscounts: [], bundles: null, ...extra,
});
const cart = (lines: CartLine[], extra: Partial<Cart> = {}): Cart => ({ id: 'c1', lines, ...extra });

// The user's two real deals (research doc §4.7a)
const USER_BUNDLES = parseBundleConfig(JSON.stringify({
  version: 1,
  items: { set_1: [P(9448121598192)], set_2: [P(9448121696496)], set_3: [P(9448122810608)], set_4: [P(9448122908912)] },
  discounts: [
    { id: 'bundle_1', label: 'Bundle 1', sets: ['set_1', 'set_2'], apply_to: 'set_1', price_delta_cents: -300, enabled: true, priority: 0 },
    { id: 'bundle_2', label: 'Bundle 2', sets: ['set_3', 'set_4'], apply_to: 'set_3', price_delta_cents: -100, enabled: true, priority: 0 },
  ],
})).cfg!;
const a1 = variant(1, 9448121598192, 1200), b1 = variant(2, 9448121696496, 800);
const c1 = variant(3, 9448122810608, 500), d1 = variant(4, 9448122908912, 400);

// ── money ────────────────────────────────────────────────────────────────────
test('money parse/format', () => {
  assert.equal(toCents('12.50'), 1250); assert.equal(toCents('0.1'), 10); assert.equal(toCents('19.99'), 1999);
  assert.equal(toCents(null), 0); assert.equal(toCents('-3.2'), -320);
  assert.equal(toDecimal(1250), '12.50'); assert.equal(toDecimal(5), '0.05'); assert.equal(toDecimal(-120), '-1.20');
  assert.equal(fmt(123456), '$1,234.56'); assert.equal(fmt(-100), '-$1.00');
});
test('5c cash rounding follows the spec table', () => {
  const exp: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 5, 4: 5, 5: 5, 6: 5, 7: 5, 8: 10, 9: 10 };
  for (const base of [0, 100, 995]) for (const d of Object.keys(exp).map(Number)) assert.equal(roundCash(base + d), base + exp[d], `${base + d}`);
});
test('allocate is exact and gives remainder to the heaviest', () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.equal(allocate(333, [700, 300, 5]).reduce((a, b) => a + b, 0), 333);
  assert.deepEqual(allocate(0, [1, 2]), [0, 0]);
});

// ── bundles ──────────────────────────────────────────────────────────────────
test('bundle 1 needs BOTH sets; $3 comes off the set-1 item', () => {
  const ctx = mkCtx([a1, b1, c1, d1], { bundles: USER_BUNDLES });
  assert.equal(priceCart(cart([line(a1)]), ctx).discountCents, 0);
  assert.equal(priceCart(cart([line(b1)]), ctx).discountCents, 0);
  const p = priceCart(cart([line(a1), line(b1)]), ctx);
  assert.equal(p.discountCents, 300);
  assert.equal(p.lines[0].discountCents, 300); // on the set_1 line
  assert.equal(p.lines[1].discountCents, 0);
  assert.equal(p.netCents, 1200 + 800 - 300);
  assert.equal(p.deals[0].label, 'Bundle 1');
});
test('multiples: 2×A + 1×B = one bundle; 2×A + 2×B = two; both deals together', () => {
  const ctx = mkCtx([a1, b1, c1, d1], { bundles: USER_BUNDLES });
  assert.equal(priceCart(cart([line(a1, 2), line(b1, 1)]), ctx).discountCents, 300);
  assert.equal(priceCart(cart([line(a1, 2), line(b1, 2)]), ctx).discountCents, 600);
  assert.equal(priceCart(cart([line(a1), line(b1), line(c1), line(d1)]), ctx).discountCents, 400);
});
test('bundle discount is capped at the discounted unit price', () => {
  const cheap = variant(9, 9448122810608, 50);
  const ctx = mkCtx([cheap, d1], { bundles: USER_BUNDLES });
  assert.equal(priceCart(cart([line(cheap), line(d1)]), ctx).discountCents, 50);
});
test('competing deals: maximise total discount', () => {
  const cfg = parseBundleConfig(JSON.stringify({
    items: { s1: [P(1)], s2: [P(2)], s3: [P(3)] },
    discounts: [
      { id: 'x', label: 'X', sets: ['s1', 's2'], price_delta_cents: -300 },
      { id: 'y', label: 'Y', sets: ['s1', 's3'], price_delta_cents: -500 },
    ],
  })).cfg!;
  const v1 = variant(11, 1, 1000), v2 = variant(12, 2, 1000), v3 = variant(13, 3, 1000);
  const ctx = mkCtx([v1, v2, v3], { bundles: cfg });
  const p = priceCart(cart([line(v1), line(v2), line(v3)]), ctx);
  assert.equal(p.discountCents, 500);
  const p2 = priceCart(cart([line(v1, 2), line(v2), line(v3)]), ctx);
  assert.equal(p2.discountCents, 800); // both deals, each uses a different s1 unit
});
test('repeated set = "any two", fixed_price mode, max_per_cart', () => {
  const cfg = parseBundleConfig(JSON.stringify({
    items: { s1: [P(1)] },
    discounts: [{ id: 'two', label: '2 for $15', sets: ['s1', 's1'], mode: 'fixed_price', price_delta_cents: 1500, max_per_cart: 1 }],
  })).cfg!;
  const v1 = variant(11, 1, 1000);
  const ctx = mkCtx([v1], { bundles: cfg });
  assert.equal(priceCart(cart([line(v1, 2)]), ctx).discountCents, 500);
  assert.equal(priceCart(cart([line(v1, 5)]), ctx).discountCents, 500); // capped at one
  assert.equal(priceCart(cart([line(v1, 1)]), ctx).discountCents, 0);
});
test('price override feeds the bundle; manual line discount is blocked on bundled lines', () => {
  const ctx = mkCtx([a1, b1], { bundles: USER_BUNDLES });
  const l = line(a1, 1, { overrideCents: 1000, discount: { kind: 'pct', value: 50, label: '50% off' } });
  const p = priceCart(cart([l, line(b1)]), ctx);
  assert.equal(p.lines[0].grossCents, 1000);
  assert.equal(p.lines[0].discountCents, 300); // bundle only
});
test('bundle config validation', () => {
  const warnings = validateBundleConfig(USER_BUNDLES, new Set([P(9448121598192)]));
  assert.ok(warnings.some(w => w.includes('not in the synced catalogue')));
  assert.ok(parseBundleConfig('{oops').error);
  assert.ok(parseBundleConfig(JSON.stringify({ items: {}, discounts: [{ id: 'a', sets: [] }] })).error);
});

// ── automatic + manual discounts ─────────────────────────────────────────────
const tenPctCollection: AutoDiscount = { id: 'd1', title: '10% off Dragons', kind: 'basic', pct: 10, target: { collectionIds: ['col-dragons'] } };
test('automatic collection discount + min spend', () => {
  const v1 = variant(21, 1, 2000), v2 = variant(22, 2, 1000);
  const ctx = mkCtx([v1, v2], { collectionsOfProduct: { [P(1)]: ['col-dragons'] }, autoDiscounts: [tenPctCollection] });
  const p = priceCart(cart([line(v1), line(v2)]), ctx);
  assert.equal(p.discountCents, 200);
  assert.equal(p.lines[0].discounts[0].label, '10% off Dragons');
  const minD: AutoDiscount = { id: 'd2', title: '$5 off $35+', kind: 'basic', amtCents: 500, target: { all: true }, minSubtotalCents: 3500 };
  const ctx2 = mkCtx([v1, v2], { autoDiscounts: [minD] });
  assert.equal(priceCart(cart([line(v1), line(v2)]), ctx2).discountCents, 0);
  assert.equal(priceCart(cart([line(v1, 2), line(v2)]), ctx2).discountCents, 500);
});
test('best single automatic discount wins', () => {
  const v1 = variant(21, 1, 2000);
  const big: AutoDiscount = { id: 'big', title: '25% off', kind: 'basic', pct: 25, target: { all: true } };
  const small: AutoDiscount = { id: 'small', title: '5% off', kind: 'basic', pct: 5, target: { all: true } };
  const p = priceCart(cart([line(v1)]), mkCtx([v1], { autoDiscounts: [small, big] }));
  assert.equal(p.discountCents, 500); assert.equal(p.deals.length, 1); assert.equal(p.deals[0].label, '25% off');
});
test('buy 2 get 1 free discounts the cheapest unit', () => {
  const v1 = variant(31, 1, 1000), v2 = variant(32, 1, 600);
  const b2g1: AutoDiscount = {
    id: 'b2g1', title: 'Buy 2 get 1', kind: 'bxgy', buys: { target: { productIds: [P(1)] }, qty: 2 },
    gets: { target: { productIds: [P(1)] }, qty: 1, pct: 100 }, usesPerOrderLimit: 1,
  };
  const ctx = mkCtx([v1, v2], { autoDiscounts: [b2g1] });
  assert.equal(priceCart(cart([line(v1, 2), line(v2, 1)]), ctx).discountCents, 600);
  assert.equal(priceCart(cart([line(v1, 2)]), ctx).discountCents, 0);
});
test('excluded items: tagged, gift cards', () => {
  const t = variant(41, 1, 1000, ['no-discount']);
  const giftLine: CartLine = { id: 'g', kind: 'gift_card', title: 'Gift card', qty: 1, unitCents: 5000 };
  const ctx = mkCtx([t], { autoDiscounts: [{ id: 'a', title: '50%', kind: 'basic', pct: 50, target: { all: true } }] });
  const p = priceCart(cart([line(t), giftLine], { discount: { kind: 'pct', value: 10, label: '10%' } }), ctx);
  assert.equal(p.discountCents, 0);
});
test('manual line + cart discounts stack and always sum exactly', () => {
  const v1 = variant(51, 1, 999), v2 = variant(52, 2, 333);
  const ctx = mkCtx([v1, v2]);
  const p = priceCart(cart([line(v1, 3, { discount: { kind: 'pct', value: 10, label: '10% line' } }), line(v2, 2)], { discount: { kind: 'amt', value: 501, label: '$5.01 off' } }), ctx);
  const lineSum = p.lines.reduce((a, l) => a + l.discountCents, 0);
  assert.equal(lineSum, p.discountCents);
  assert.equal(p.lines[0].discounts.find(d => d.type === 'manual')!.cents, Math.round(2997 * 0.1));
});
test('discount never exceeds value', () => {
  const v1 = variant(61, 1, 300);
  const p = priceCart(cart([line(v1)], { discount: { kind: 'amt', value: 10000, label: 'big' } }), mkCtx([v1]));
  assert.equal(p.netCents, 0);
});
test('order line split keeps the exact total', () => {
  for (const [net, q] of [[1000, 3], [999, 7], [0, 2], [1, 3], [5000, 1]] as const) {
    const parts = splitLineForOrder(net, q);
    assert.equal(parts.reduce((a, p) => a + p.qty * p.unitCents, 0), net);
    assert.equal(parts.reduce((a, p) => a + p.qty, 0), q);
  }
});

// ── fees ─────────────────────────────────────────────────────────────────────
test('fees: 1.4% card present, 1.7% keyed, rounded', () => {
  assert.deepEqual(feeFor(10000, 'NFC', DEFAULT_FEES), { rate: 0.014, cents: 140 });
  assert.deepEqual(feeFor(10000, 'MANUAL', DEFAULT_FEES), { rate: 0.017, cents: 170 });
  assert.equal(feeFor(1234, 'ICC', DEFAULT_FEES).cents, 17); // 17.276 → 17
});

// ── response codes / zeller wrapper ──────────────────────────────────────────
test('response codes', () => {
  assert.equal(lookupResponse('51').category, 'DECLINED_TRY_OTHER_CARD');
  assert.ok(/insufficient/i.test(lookupResponse('1009').message));
  assert.equal(lookupResponse('QA').unknownOutcome, true);
  assert.equal(lookupResponse('ZZ', 'Weird thing').message, 'Weird thing');
});
const err = (type: string, message = type) => Object.assign(new Error(message), { type });
const okTxn = (ref: string, amount = 500): ZellerTxn => ({ $type: 'Approved', status: 'APPROVED', type: 'PURCHASE', amount, externalReference: ref, approvalCode: 'A1', transactionUuid: 'u1' });
test('normalise: approved, decline (51), errors', () => {
  const seen = { any: false, processing: false };
  assert.equal(normalise(okTxn('r'), seen).kind, 'APPROVED');
  const d = normalise({ $type: 'Declined', status: 'DECLINED', amount: 500, responseCode: '51' }, seen);
  assert.equal(d.kind, 'DECLINED'); assert.ok(d.kind === 'DECLINED' && /insufficient/i.test(d.text));
  assert.equal(normalise(err('Setup Required'), seen).kind, 'NOT_READY');
  assert.equal(normalise(err('Network Failure'), seen).kind, 'NOT_READY');
  assert.equal(normalise(err('Network Failure'), { any: true, processing: true }).kind, 'UNKNOWN');
  assert.equal(normalise(err('Operation Interrupted'), seen).kind, 'UNKNOWN');
  assert.equal(normalise(err('Transaction Response Timeout'), seen).kind, 'UNKNOWN');
  assert.equal(normalise(err('Card Declined'), seen).kind, 'DECLINED');
  assert.equal(normalise(err('Operation Busy'), seen).kind, 'NOT_READY');
  assert.equal(normalise({ status: 'FAILED', amount: 1, responseCode: 'QH' } as ZellerTxn, seen).kind, 'UNKNOWN');
});

function fakeTerminal(opts: { purchase: () => any; events?: string[]; lookup?: () => any }): TerminalLike {
  const op = (value: () => any) => {
    let cb: ((e: { type: string }) => void) | undefined;
    const p: any = (async () => { await Promise.resolve(); opts.events?.forEach(e => cb?.({ type: e })); return value(); })();
    p.onEvent = (f: any) => { cb = f; };
    p.cancel = () => {};
    return p;
  };
  return {
    initialise: () => op(() => true), setup: () => op(() => true), configure: () => op(() => true),
    purchase: () => op(opts.purchase), refund: () => op(opts.purchase), getTransactions: () => op(opts.lookup ?? (() => [])),
  } as unknown as TerminalLike;
}
test('startCharge: persists attempt first, approves', async () => {
  const order: string[] = [];
  const t = fakeTerminal({ purchase: () => okTxn('S-1') });
  const { promise } = startCharge(t, { amountCents: 500, reference: 'S-1' }, { onStarted: () => { order.push('started'); } });
  const r = await promise; order.push(r.kind);
  assert.deepEqual(order, ['started', 'APPROVED']);
});
test('startCharge: "Cancelled" after PROCESSING but payment went through → APPROVED via reconcile', async () => {
  const t = fakeTerminal({ purchase: () => err('Cancelled'), events: ['AWAITING_PAYMENT_METHOD', 'PROCESSING'], lookup: () => [okTxn('S-2')] });
  const r = await startCharge(t, { amountCents: 500, reference: 'S-2' }).promise;
  assert.equal(r.kind, 'APPROVED');
});
test('startCharge: timeout then lookup finds nothing → still UNKNOWN is NOT retried blindly', async () => {
  const t = fakeTerminal({ purchase: () => err('Transaction Response Timeout'), events: ['PROCESSING'], lookup: () => err('Network Failure') });
  const r = await startCharge(t, { amountCents: 500, reference: 'S-3' }).promise;
  assert.equal(r.kind, 'UNKNOWN');
});
test('startCharge: decline keeps the cart (DECLINED), cancel before anything → CANCELLED', async () => {
  const d = await startCharge(fakeTerminal({ purchase: () => ({ $type: 'Declined', status: 'DECLINED', amount: 500, responseCode: '51' }), events: ['AWAITING_PAYMENT_METHOD'] }), { amountCents: 500, reference: 'S-4' }).promise;
  assert.equal(d.kind, 'DECLINED');
  const c = await startCharge(fakeTerminal({ purchase: () => err('Cancelled'), events: [] }), { amountCents: 500, reference: 'S-5' }).promise;
  assert.equal(c.kind, 'CANCELLED');
});
test('startRefund outcomes', async () => {
  const ok = await startRefund(fakeTerminal({ purchase: () => ({ ...okTxn('R-1'), type: 'REFUND' }) }), { purchaseRef: 'S-1', amountCents: 500, reference: 'R-1' }).promise;
  assert.equal(ok.kind, 'APPROVED');
  const nf = await startRefund(fakeTerminal({ purchase: () => err('Transaction Not Found') }), { purchaseRef: 'X', amountCents: 500, reference: 'R-2' }).promise;
  assert.equal(nf.kind, 'FAILED');
});
