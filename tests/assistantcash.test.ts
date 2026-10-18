// Location: tests/assistantcash.test.ts
// The assistant's cash and cart tools (patch 0172): what the drawer tool says, the change, split and float sums, what the cart tool says,
// that no name, gift card code, customer or payment detail can get into a result, that every field is in a field map, that all three
// are read only, and that nothing is offered or answered when the till could not be read (practice data).
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyGate, resolvePolicy } from '../src/lib/assistantGate';
import { ASSISTANT_TOOLS, makeToolSet, runToolCall, toolDefs, toolsFor } from '../src/lib/assistantTools';
import { buildSystemPrompt } from '../src/lib/assistantChat';
import { CASH_TOOLS, buildCartView, buildDrawerView, cashCalculatorTool, cashDrawerTool, changeInfo, countsView, currentCartTool, floatInfo, parseMoney, splitInfo, type CashState, type DrawerIn } from '../src/lib/assistantCash';
import { applyEntry, emptyLedger, newEntry } from '../src/lib/cashLedger';
import { priceCart } from '../src/lib/pricing';
import { addVariant, setLineAdjust, setQty } from '../src/lib/cartOps';
import { makeAdjust } from '../src/lib/lineAdjust';
import type { Cart, CartLine, CartWarning, Variant } from '../src/lib/types';
import { matchCartWarnings } from '../src/lib/cartWarnings';

const at = (h: number, m = 0) => new Date(2026, 9, 18, h, m);
const NOW = at(15).getTime();
const P = (n: number) => `gid://shopify/Product/${n}`;
const V = (n: number) => `gid://shopify/ProductVariant/${n}`;
const variant = (id: number, prod: number, cents: number, title = ''): Variant => ({ id: V(id), productId: P(prod), productTitle: `Print ${prod}`, variantTitle: title, priceCents: cents, tracked: true, stock: 9, tags: [], active: true });
const cow = variant(1, 1, 1500, 'Large'), tad = variant(2, 2, 400);
const variants = { [cow.id]: cow, [tad.id]: tad };
const price = (c: Cart) => priceCart(c, { variants, collectionsOfProduct: {}, autoDiscounts: [], bundles: null, now: NOW });

// ---- a drawer: opened at 8 with $110, then a $15 sale paid with a $20 note and $5 given back ----
const ledger = () => {
  let l = emptyLedger();
  l = applyEntry(l, newEntry('open', { '2000': 3, '1000': 4, '500': 2 }, { ts: at(8).toISOString(), staff: 'Maya Chen', note: 'call jane@example.com' }));
  l = applyEntry(l, newEntry('sale_in', { '2000': 1 }, { saleUuid: 's1', ts: at(9).toISOString(), staff: 'Maya Chen' }));
  l = applyEntry(l, newEntry('sale_change', { '500': -1 }, { saleUuid: 's1', ts: at(9, 1).toISOString(), staff: 'Maya Chen' }));
  return l;
};
const drawer = (over: Partial<DrawerIn> = {}, shift: Partial<DrawerIn['shift']> = {}): DrawerIn => ({
  shift: { open: true, openedAt: at(8).toISOString(), floatCents: 11000, paidInCents: 0, paidOutCents: 0, ...shift },
  ledger: ledger(), sales: [], prices: [500, 1250, 1999, 2500], ...over,
});

// ---- a cart ----
const base = (): Cart => addVariant(addVariant({ id: 'c', lines: [] }, tad, 5), cow, 1); // 5 x $4.00 + $15.00 = $35.00
const gift: CartLine = { id: 'gift', kind: 'gift_card', title: 'Gift card', qty: 1, unitCents: 5000, noDiscount: true, giftCardCode: 'GIFT-SECRET-123456', giftRecipient: { email: 'jane@example.com', name: 'Jane Citizen' } };
const warning = (over: Partial<CartWarning> = {}): CartWarning => ({ id: 'w1', enabled: true, title: 'Fragile print', body: 'Joints snap, do not bend.', scope: 'variant', targetId: cow.id, alwaysShow: false, requireAcknowledgement: true, ...over });
const cartIn = (cart: Cart, warnings: CartWarning[] = []) => ({ cart, priced: price(cart), warnings: matchCartWarnings(cart, warnings, { variants, collectionsOfProduct: {} }) });
const state = (over: Partial<CashState> = {}): CashState => ({ now: NOW, rounding: true, drawer: drawer(), cart: cartIn(base()), ...over });

const call = (name: string, args: unknown = {}) => ({ id: 'c1', type: 'function' as const, function: { name, arguments: JSON.stringify(args) } });
const run = (name: string, args: unknown, s: CashState | null = state(), policy = resolvePolicy('local'), role = 'cashier') =>
  runToolCall(call(name, args), { tools: ASSISTANT_TOOLS, ctx: { pages: [], role, maxChars: 6000, policy, ...(s ? { cash: s } : {}) } });
const out = (r: ReturnType<typeof run>): any => JSON.parse(r.message.content ?? '{}');
const NEVER = ['Maya', 'Chen', 'jane@example.com', 'Jane', 'Citizen', 'GIFT-SECRET', '123456', '4242', 'A1B2C3', 'visa'];

// ---- parsing money ----
test('money the model writes is read as dollars, and anything that is not a plain amount is refused', () => {
  assert.equal(parseMoney('12.50'), 1250); assert.equal(parseMoney('$1,200'), 120000); assert.equal(parseMoney(12.5), 1250); assert.equal(parseMoney(' 5 '), 500); assert.equal(parseMoney('0'), 0); assert.equal(parseMoney('7.5'), 750);
  for (const bad of ['12.345', '-1', 'abc', '', '1e3', '$', '12.', null, undefined, NaN, Infinity, -5, {}, [], true, '99999999']) assert.equal(parseMoney(bad as any), null, String(bad));
});

// ---- the drawer ----
test('the drawer view gives the shift, what it should hold and what the ledger holds', () => {
  const v: any = buildDrawerView(drawer(), NOW);
  assert.deepEqual(v.shift, { open: true, opened_at: '2026-10-18 8:00 am', float: '$110.00', cash_sales_since_open: '$15.00', paid_in: '$0.00', paid_out: '$0.00', expected_in_drawer: '$125.00' });
  assert.equal(v.ledger_holds.amount, '$125.00'); assert.equal(v.ledger_holds.pieces, 9);
  assert.deepEqual(v.ledger_holds.notes_and_coins, [{ denomination: '$20', count: 4 }, { denomination: '$10', count: 4 }, { denomination: '$5', count: 1 }]);
  assert.equal(v.ledger_compared_with_expected, 'The ledger matches the expected amount.'); assert.equal(v.cash_takings_today, '$15.00');
});
test('paid in and out move what the drawer should hold, and a gap to the ledger is said in words', () => {
  const v: any = buildDrawerView(drawer({}, { paidInCents: 2000, paidOutCents: 500 }), NOW);
  assert.equal(v.shift.expected_in_drawer, '$140.00'); assert.equal(v.ledger_compared_with_expected, 'The ledger holds $15.00 less than the expected amount. Counting the drawer will settle it.');
  const over: any = buildDrawerView(drawer({}, { floatCents: 10000 }), NOW); assert.match(over.ledger_compared_with_expected, /holds \$10\.00 more/);
});
test('a closed drawer says so, still lists what the ledger holds, and gives no expected amount', () => {
  const v: any = buildDrawerView(drawer({}, { open: false }), NOW);
  assert.deepEqual(v.shift, { open: false }); assert.equal(v.ledger_compared_with_expected, undefined); assert.equal(v.ledger_holds.amount, '$125.00');
  const none: any = buildDrawerView({ ...drawer(), ledger: emptyLedger() }, NOW); assert.equal(none.ledger_holds.amount, '$0.00'); assert.deepEqual(none.ledger_holds.notes_and_coins, []); assert.deepEqual(none.recent_movements, []);
});
test('the last five movements are listed newest first with plain labels, and no staff name or ledger note comes with them', () => {
  let l = ledger(); for (let i = 0; i < 6; i++) l = applyEntry(l, newEntry('paid_in', { '100': 1 }, { ts: at(10, i).toISOString(), staff: 'Maya Chen', note: 'float top up' }));
  const v: any = buildDrawerView(drawer({ ledger: l }), NOW);
  assert.equal(v.recent_movements.length, 5); assert.deepEqual(v.recent_movements[0], { when: '2026-10-18 10:05 am', what: 'Paid in', amount: '$1.00' });
  const all = JSON.stringify(v); for (const bad of ['Maya', 'Chen', 'float top up', 'jane@']) assert.ok(!all.includes(bad), bad);
});
test('notes and coins are listed largest first, and zero or negative counts are left out', () => {
  assert.deepEqual(countsView({ '5': 3, '2000': 1, '100': 0, '500': -2 }), { amount: '$20.15', pieces: 4, notes_and_coins: [{ denomination: '$20', count: 1 }, { denomination: '5c', count: 3 }] });
});

// ---- change ----
test('change: the amount owed back, and which notes and coins make it from the drawer', () => {
  const r: any = changeInfo({ due: 2345, given: 5000, rounding: true, drawer: { '2000': 4, '500': 1, '100': 10, '50': 8, '5': 10 } });
  assert.equal(r.change_to_give, '$26.55'); assert.equal(r.cash_due_after_rounding, undefined);
  assert.deepEqual(r.largest_notes_first.notes_and_coins, [{ denomination: '$20', count: 1 }, { denomination: '$5', count: 1 }, { denomination: '$1', count: 1 }, { denomination: '50c', count: 1 }, { denomination: '5c', count: 1 }]);
  assert.equal(r.from_this_drawer.possible, true); assert.equal(r.from_this_drawer.amount, '$26.55'); assert.equal(r.from_this_drawer.fewest_pieces, true);
});
test('change: with cash rounding on the amount due is rounded to 5c first, and with it off it is not', () => {
  const on: any = changeInfo({ due: 2347, given: 5000, rounding: true, drawer: {} }); assert.equal(on.cash_due_after_rounding, '$23.45'); assert.equal(on.change_to_give, '$26.55');
  const off: any = changeInfo({ due: 2347, given: 5000, rounding: false, drawer: {} }); assert.equal(off.cash_due_after_rounding, undefined); assert.equal(off.change_to_give, '$26.53');
  assert.equal(off.largest_notes_first, undefined); assert.match(off.note, /no 1c or 2c coin/);
});
test('change: not enough given, an exact amount, and a drawer that cannot make it', () => {
  assert.equal((changeInfo({ due: 5000, given: 2000, rounding: false, drawer: {} }) as any).short_by, '$30.00');
  const exact: any = changeInfo({ due: 2000, given: 2000, rounding: false, drawer: {} }); assert.match(exact.note, /Exact/); assert.equal(exact.largest_notes_first, undefined);
  const no: any = changeInfo({ due: 1500, given: 2000, rounding: false, drawer: { '2000': 1 } }); assert.equal(no.change_to_give, '$5.00'); assert.equal(no.from_this_drawer.possible, false); assert.match(no.from_this_drawer.note, /cannot make this exactly/);
  const empty: any = changeInfo({ due: 1500, given: 2000, rounding: false, drawer: {} }); assert.equal(empty.from_this_drawer.possible, false); assert.match(empty.from_this_drawer.note, /holds no cash/);
});

// ---- split ----
test('split: equal parts put the odd cents on the first payments, and rounding only touches the last when paid in cash', () => {
  const r: any = splitInfo({ total: 10000, parts: 3, rounding: true });
  assert.deepEqual(r.payments, [{ number: 1, amount: '$33.34' }, { number: 2, amount: '$33.33' }, { number: 3, amount: '$33.33' }]); assert.equal(r.last_payment_if_paid_in_cash, '$33.35'); assert.match(r.note, /first payments/);
  const off: any = splitInfo({ total: 10000, parts: 3, rounding: false }); assert.equal(off.last_payment_if_paid_in_cash, undefined);
  const even: any = splitInfo({ total: 10000, parts: 4, rounding: true }); assert.equal(even.last_payment_if_paid_in_cash, undefined); assert.equal(even.note, 'Each payment is the same.');
});
test('split: a first payment then the rest, and the ways it is refused', () => {
  const r: any = splitInfo({ total: 10000, first: 2000, rounding: false }); assert.deepEqual(r.payments, [{ number: 1, amount: '$20.00' }, { number: 2, amount: '$80.00' }]); assert.equal(r.note, undefined);
  for (const bad of [{ total: 10000, first: 10000 }, { total: 10000, first: 0 }, { total: 10000, first: 20000 }, { total: 0, parts: 2 }, { total: 10000 }, { total: 10000, parts: 1 }]) assert.ok((splitInfo({ ...bad, rounding: false }) as any).error, JSON.stringify(bad));
});

// ---- float ----
test('float: says what to bank and what to leave, from the drawer and the takings', () => {
  const r: any = floatInfo(drawer(), NOW);
  assert.equal(r.cash_takings, '$15.00'); assert.equal(r.drawer_holds, '$125.00'); assert.ok(r.take_out_to_bank.amount.startsWith('$')); assert.ok(r.leave_as_float.amount.startsWith('$')); assert.ok(r.suggested_float.startsWith('$'));
  assert.ok(Array.isArray(r.notes)); assert.ok(Array.isArray(r.leave_as_float.notes_and_coins));
  const big: any = floatInfo(drawer(), NOW, 5000); assert.equal(big.cash_takings, '$50.00');
});
test('float: an empty ledger has nothing to base it on, and takings above the drawer are capped and said so', () => {
  assert.match((floatInfo({ ...drawer(), ledger: emptyLedger() }, NOW) as any).error, /holds no cash/);
  const r: any = floatInfo(drawer(), NOW, 90000); assert.equal(r.cash_takings, '$125.00'); assert.match(r.notes.join(' '), /out of date/);
});

// ---- the cart ----
test('an empty cart says so and says Charge has nothing to take', () => {
  const v: any = buildCartView(cartIn({ id: 'e', lines: [] }), true); assert.equal(v.empty, true); assert.match(v.note, /empty/); assert.equal(v.lines, undefined);
});
test('the cart view gives each line, the discounts and the total, in the app\'s own prices', () => {
  const v: any = buildCartView(cartIn(base()), true);
  assert.equal(v.empty, false); assert.equal(v.items_before_discounts, '$35.00'); assert.equal(v.discounts, '$0.00'); assert.equal(v.total, '$35.00'); assert.equal(v.lines_needing_price_check, 0); assert.deepEqual(v.warnings, []); assert.equal(v.payment_started, false);
  assert.deepEqual(v.lines[0], { name: 'Print 2', quantity: 5, unit_price: '$4.00', line_total: '$20.00' });
  assert.deepEqual(v.lines[1], { name: 'Print 1', variant: 'Large', quantity: 1, unit_price: '$15.00', line_total: '$15.00' });
  assert.equal(v.cash_due_if_paid_in_cash, undefined, '$35.00 needs no rounding');
  const odd: any = buildCartView(cartIn(addVariant({ id: 'o', lines: [] }, variant(3, 3, 1999), 1)), true); assert.equal(odd.total, '$19.99'); assert.equal(odd.cash_due_if_paid_in_cash, '$20.00');
  assert.equal((buildCartView(cartIn(addVariant({ id: 'o', lines: [] }, variant(3, 3, 1999), 1)), false) as any).cash_due_if_paid_in_cash, undefined, 'only with cash rounding on');
});
test('a gift card line shows only that it is a gift card and its amount, never the code or who it goes to', () => {
  const c: Cart = { ...base(), lines: [...base().lines, gift] };
  const v: any = buildCartView(cartIn(c), true); const l = v.lines.find((x: any) => x.name === 'Gift card');
  assert.deepEqual(l, { name: 'Gift card', quantity: 1, unit_price: '$50.00', line_total: '$50.00' }); assert.equal(v.total, '$85.00');
  const all = JSON.stringify(v); for (const bad of ['GIFT-SECRET', '123456', 'jane@', 'Jane', 'Citizen']) assert.ok(!all.includes(bad), bad);
});
test('no customer, note, saved cart id or payment detail is copied, and a payment in progress shows what is left', () => {
  const c: Cart = { ...base(), customer: { id: 'c1', name: 'Jane Citizen', email: 'jane@example.com' } as any, name: 'Jane\'s order', note: 'Call jane@example.com', saleUuid: 'uuid-1', savedFrom: 'saved-9',
    tenders: [{ id: 't1', kind: 'card', amountCents: 1000, card: { last4: '4242', scheme: 'visa', approvalCode: 'A1B2C3' } } as any] };
  const v: any = buildCartView(cartIn(c), true); assert.equal(v.payment_started, true); assert.equal(v.still_to_pay, '$25.00'); assert.equal(v.cash_due_if_paid_in_cash, undefined);
  const all = JSON.stringify(v); for (const bad of [...NEVER, 'uuid-1', 'saved-9', 'order']) assert.ok(!all.includes(bad) || bad === 'order', bad);
});
test('a line price that needs a second look is flagged, and counted', () => {
  let c = base(); c = setLineAdjust(c, c.lines[0].id, makeAdjust(1500, price(c).lines[0])); c = setQty(c, c.lines[0].id, 8);
  const v: any = buildCartView(cartIn(c), true);
  assert.equal(v.lines_needing_price_check, 1); assert.equal(v.lines[0].needs_price_check, true); assert.equal(v.lines[0].price_adjusted, true); assert.ok(v.lines[0].price_check_reasons.length >= 1);
  assert.match(v.note, /price adjustments are listed for a check before payment/);
});
test('a warning set to show at Charge is listed, one that must be ticked is said so, and one set to queue is only counted', () => {
  const v: any = buildCartView(cartIn(base(), [warning(), warning({ id: 'w2', title: 'Queued one', mode: 'queue' }), warning({ id: 'w3', targetId: V(99) })]), true);
  assert.deepEqual(v.warnings, [{ title: 'Fragile print', must_tick_before_payment: true, triggered_by: ['Print 1'] }]); assert.equal(v.warnings_on_the_warning_list_instead, 1);
  assert.match(v.note, /a cart warning needs ticking before payment/);
  const soft: any = buildCartView(cartIn(base(), [warning({ requireAcknowledgement: false })]), true); assert.equal(soft.warnings[0].must_tick_before_payment, false); assert.doesNotMatch(soft.note, /needs ticking/);
  const none: any = buildCartView(cartIn(base()), true); assert.match(none.note, /Nothing else here stops Charge/); assert.equal(none.warnings_on_the_warning_list_instead, undefined);
  assert.ok(!JSON.stringify(v).includes('Joints snap'), 'the warning text is not copied, only its title');
});
test('a long cart is cut to 25 lines and says how many were left out', () => {
  let c: Cart = { id: 'big', lines: [] }; for (let i = 0; i < 30; i++) c = addVariant(c, variant(100 + i, 100 + i, 100 + i), 1);
  const v: any = buildCartView(cartIn(c), true); assert.equal(v.lines.length, 25); assert.equal(v.more_lines_not_shown, 5);
});

// ---- the tools ----
test('all three tools work for every role and give the numbers above', () => {
  for (const role of ['cashier', 'manager', 'owner']) {
    assert.equal(out(run('cash_drawer', {}, state(), resolvePolicy('local'), role)).shift.expected_in_drawer, '$125.00');
    assert.equal(out(run('current_cart', {}, state(), resolvePolicy('local'), role)).total, '$35.00');
    assert.equal(out(run('cash_calculator', { kind: 'change', amount_due: '23.45', amount_given: '50' }, state(), resolvePolicy('local'), role)).change_to_give, '$26.55');
  }
  for (const n of ['cash_drawer', 'cash_calculator', 'current_cart']) assert.ok(toolsFor('cashier').some(t => t.def.function.name === n), n);
});
test('the calculator takes the cash rounding setting from the till, and answers bad input with a plain message', () => {
  const on = out(run('cash_calculator', { kind: 'change', amount_due: '23.47', amount_given: '50.00' })); assert.equal(on.cash_due_after_rounding, '$23.45');
  const off = out(run('cash_calculator', { kind: 'change', amount_due: '23.47', amount_given: '50.00' }, state({ rounding: false }))); assert.equal(off.cash_due_after_rounding, undefined);
  for (const bad of [{}, { kind: 'nope' }, { kind: 'change' }, { kind: 'change', amount_due: 'x', amount_given: '5' }, { kind: 'split' }, { kind: 'split', total: '100', parts: 1 }, { kind: 'split', total: '100', parts: 21 }, { kind: 'split', total: '100', parts: 2.5 }, { kind: 'split', total: '100', first_payment: 'x' }, { kind: 'float', cash_takings: 'x' }]) {
    const r = run('cash_calculator', bad); assert.equal(r.record.ok, false, JSON.stringify(bad)); assert.ok(out(r).error.length > 10);
  }
  assert.equal(out(run('cash_calculator', { kind: 'split', total: '100.00', parts: 3 })).payments.length, 3);
  assert.equal(out(run('cash_calculator', { kind: 'split', total: '100.00', first_payment: '20' })).payments[1].amount, '$80.00');
  assert.equal(out(run('cash_calculator', { kind: 'float', cash_takings: '15' })).cash_takings, '$15.00');
});
test('with no snapshot (practice data) all three say they could not read the till, and give nothing else', () => {
  for (const [n, a] of [['cash_drawer', {}], ['current_cart', {}], ['cash_calculator', { kind: 'change', amount_due: '1', amount_given: '2' }], ['cash_calculator', { kind: 'split', total: '10', parts: 2 }], ['cash_calculator', { kind: 'float' }]] as const) {
    const r = run(n, a, null); assert.equal(r.record.ok, false); assert.match(out(r).error, /could not be read/); assert.deepEqual(Object.keys(out(r)), ['error']);
  }
});
test('every field any of the tools can return is in its field map, so the gate drops nothing and reports nothing unknown', () => {
  const cashier = state({ cart: cartIn({ ...base(), lines: [...base().lines, gift] }, [warning(), warning({ id: 'q', mode: 'queue' })]) });
  const results: [typeof cashDrawerTool, unknown][] = [
    [cashDrawerTool, buildDrawerView(cashier.drawer, NOW)], [cashDrawerTool, buildDrawerView({ ...cashier.drawer, ledger: emptyLedger() }, NOW)], [cashDrawerTool, buildDrawerView(drawer({}, { open: false }), NOW)],
    [currentCartTool, buildCartView(cashier.cart, true)], [currentCartTool, buildCartView(cartIn({ id: 'e', lines: [] }), true)], [currentCartTool, buildCartView(cartIn({ ...base(), tenders: [{ id: 't', kind: 'cash', amountCents: 500 } as any] }), true)],
    [cashCalculatorTool, changeInfo({ due: 2345, given: 5000, rounding: true, drawer: { '2000': 4, '500': 1, '100': 10, '50': 8, '5': 10 } })], [cashCalculatorTool, changeInfo({ due: 2347, given: 5000, rounding: false, drawer: {} })],
    [cashCalculatorTool, changeInfo({ due: 5000, given: 2000, rounding: false, drawer: {} })], [cashCalculatorTool, changeInfo({ due: 1500, given: 2000, rounding: false, drawer: { '2000': 1 } })],
    [cashCalculatorTool, splitInfo({ total: 10000, parts: 3, rounding: true })], [cashCalculatorTool, splitInfo({ total: 10000, first: 2000, rounding: false })], [cashCalculatorTool, floatInfo(drawer(), NOW)], [cashCalculatorTool, floatInfo(drawer(), NOW, 90000)],
  ];
  let withUnknown = 0;
  for (const policy of [resolvePolicy('local'), resolvePolicy('remote')]) for (const [tool, result] of results) { const g = applyGate(result, tool.gate, policy); assert.deepEqual(g.unknown, [], JSON.stringify(result).slice(0, 80)); withUnknown += g.unknown.length; }
  assert.equal(withUnknown, 0);
});
test('on a remote endpoint nothing is hidden from these tools, because none of it is customer, payment or key data', () => {
  const remote = resolvePolicy('remote');
  for (const [n, a] of [['cash_drawer', {}], ['current_cart', {}], ['cash_calculator', { kind: 'float' }]] as const) { const r = run(n, a, state(), remote); assert.equal(r.record.ok, true, n); assert.deepEqual(r.record.withheld ?? {}, {}, n); }
});
test('the privacy toggles reach the tools: drawer data is shop data, and cart lines are order data', () => {
  const noShop = resolvePolicy('local', { shop: 'never' });
  const d = out(run('cash_drawer', {}, state(), noShop)); assert.match(d.privacy_note, /shop data/); assert.equal(d.shift, undefined); assert.equal(d.ledger_holds?.amount, undefined); assert.equal(d.cash_takings_today, undefined); assert.equal(d.recent_movements?.length ?? 0, 0);
  const c = out(run('cash_calculator', { kind: 'split', total: '10', parts: 2 }, state(), noShop)); assert.match(c.privacy_note, /shop data/); assert.equal(c.payments?.length ?? 0, 0); assert.equal(c.total, undefined);
  const noOrder = resolvePolicy('local', { order: 'never' });
  const cart = out(run('current_cart', {}, state({ cart: cartIn(base(), [warning()]) }), noOrder)); assert.match(cart.privacy_note, /order details/); assert.equal(cart.lines?.length ?? 0, 0); assert.equal(cart.total, undefined);
  assert.equal(cart.warnings.length, 1, 'a cart warning is the shop\'s own text, shop data, so it stays when order details are hidden');
  assert.ok(run('current_cart', {}, state(), noOrder).record.withheld?.order! > 0);
});
test('no name, code, customer or payment detail can be in any result, whatever the cart and drawer hold', () => {
  const dirty: CashState = state({
    drawer: drawer(),
    cart: cartIn({ ...base(), lines: [...base().lines, gift], customer: { id: 'c1', name: 'Jane Citizen', email: 'jane@example.com' } as any, note: 'Call jane@example.com', tenders: [{ id: 't1', kind: 'card', amountCents: 500, card: { last4: '4242', scheme: 'visa', approvalCode: 'A1B2C3' } } as any] }),
  });
  for (const [n, a] of [['cash_drawer', {}], ['current_cart', {}], ['cash_calculator', { kind: 'float' }]] as const) {
    const all = run(n, a, dirty).message.content ?? ''; for (const bad of NEVER) assert.ok(!all.includes(bad), `${n} must not contain ${bad}`);
  }
});
test('all three are read only: a frozen snapshot is unchanged by every call, and nothing the tools are given can write', () => {
  const deepFreeze = (o: any): any => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
  const s = deepFreeze(state({ cart: cartIn({ ...base(), lines: [...base().lines, gift] }, [warning()]) })); const before = JSON.stringify(s);
  for (const [n, a] of [['cash_drawer', {}], ['current_cart', {}], ['cash_calculator', { kind: 'change', amount_due: '23.45', amount_given: '50' }], ['cash_calculator', { kind: 'split', total: '100', parts: 3 }], ['cash_calculator', { kind: 'float' }]] as const) assert.doesNotThrow(() => run(n, a, s), n);
  assert.equal(JSON.stringify(s), before);
  for (const tool of CASH_TOOLS) { assert.equal(tool.roles, undefined); assert.doesNotMatch(JSON.stringify(tool.def), /[\u2013\u2014]/); assert.ok(tool.def.function.description.length > 20); assert.equal((tool.def.function.parameters as any).type, 'object'); assert.equal((tool.def.function.parameters as any).additionalProperties, false); }
  assert.deepEqual(cashDrawerTool.def.function.parameters, { type: 'object', properties: {}, additionalProperties: false }); assert.deepEqual(currentCartTool.def.function.parameters, { type: 'object', properties: {}, additionalProperties: false });
  assert.deepEqual((cashCalculatorTool.def.function.parameters as any).required, ['kind']);
});
test('makeToolSet hands the snapshot to the tools, and leaving it out leaves the other tools as they were', () => {
  const set = makeToolSet({ pages: [], role: 'cashier', contextSize: 8000, cash: state() }); assert.ok(set.ctx.cash); assert.equal(makeToolSet({ pages: [], role: 'cashier', contextSize: 8000 }).ctx.cash, undefined);
  const order = ASSISTANT_TOOLS.map(t => t.def.function.name); assert.deepEqual(order.slice(order.indexOf('cash_drawer'), order.indexOf('cash_drawer') + 3), ['cash_drawer', 'cash_calculator', 'current_cart']);
  assert.ok(order.indexOf('read_settings') < order.indexOf('cash_drawer') && order.indexOf('current_cart') < order.indexOf('find_products'));
  assert.equal(new Set(order).size, order.length, 'no two tools share a name');
});

// ---- the prompt ----
test('the prompt names the three tools, says never to do cash sums, and still names no restricted thing', () => {
  const p = buildSystemPrompt('short', true);
  for (const n of ['cash_drawer', 'cash_calculator', 'current_cart']) assert.match(p, new RegExp(n));
  assert.match(p, /eighteen tools/); assert.match(p, /never do them yourself/); assert.match(p, /only source for why a sale will not go through/); assert.match(p, /Never open, count or edit them/);
  assert.doesNotMatch(p, /[\u2013\u2014]/); assert.doesNotMatch(p, /read_settings|\bmanager\b|\bowner\b|printer/i);
  assert.doesNotMatch(buildSystemPrompt('short', false), /cash_drawer|cash_calculator|current_cart/);
});
test('the three definitions stay small, because they share a small context with everything else', () => {
  const size = JSON.stringify(toolDefs(CASH_TOOLS)).length;
  assert.ok(size < 2600, `three definitions are ${size} characters`);
});
