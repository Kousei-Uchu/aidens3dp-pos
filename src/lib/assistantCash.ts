// Location: src/lib/assistantCash.ts
// The assistant's cash and cart tools (patch 0172, plan 3.2 tools 8, 11 and 13): `cash_drawer`, `cash_calculator` and `current_cart`.
//
//   cash_drawer      what the drawer should hold, what the ledger says it holds, and the last few movements. Status only.
//   cash_calculator  change to give, a split payment, and a float suggestion, using the app's own rules. Numbers only, because a
//                    small model does arithmetic badly. Nothing it works out is ever written anywhere.
//   current_cart     what is in the cart on the till when the question was asked, its totals and the warnings that stand in the
//                    way of Charge, so it can answer "why won't this sale go through".
//
// Nothing here reads the app. `assistantCashIO.ts` reads the store once, when the question is asked, and hands over a `CashState`
// of plain values. The tools only read that snapshot and return numbers and words, so none of them can write: the drawer ledger, the
// shift and the cart are never given to anything that could change them (the tests freeze the snapshot and check nothing moves).
// No staff name, ledger note, gift card code, recipient, customer, tender or card detail is ever copied into a result.
// Pure, so it runs in the node tests. All amounts inside are integer cents; results give money as the app writes it, like $12.50.
import type { Cart, PricedCart } from './types';
import { DENOMS, LEDGER_LABEL, cleanCounts, entryTotal, totalOf, type CashLedger, type Counts } from './cashLedger';
import { greedyChange, piecesOf, planChange } from './cashSale';
import { ledgerCashSince } from './drawerSync';
import { equalPlan, firstPlan } from './splitPlan';
import { recommendFloat } from './floatReport';
import { buildProfile } from './changeScore';
import { fmt, roundCash, toCents } from './money';
import { flaggedLines } from './lineAdjust';
import { orderReviewReasons } from './orderAdjust';
import { triggerNames, warningTitle, type MatchedCartWarning } from './cartWarnings';
import { safeLine, whenText } from './assistantStatus';
import type { AssistantTool } from './assistantTools';

// ---------- what the tools are given ----------
/** What the drawer tools read. The real shift and ledger fit these, and a test can build them by hand. */
export type DrawerIn = {
  shift: { open: boolean; openedAt?: string; floatCents: number; paidInCents: number; paidOutCents: number };
  ledger: CashLedger;
  /** Sales and refunds on this till, for how long a "typical day" is when the float is judged. */
  sales: readonly { ts: string; type: string; tenders?: readonly { kind: string }[] }[];
  /** Every item price in the catalogue, in cents, for the same reason. */
  prices: readonly number[];
};
/** The cart as the till saw it, already priced, with the warnings that apply to it. */
export type CartIn = { cart: Cart; priced: PricedCart; warnings: readonly MatchedCartWarning[] };
/** The snapshot taken when the question is asked. `cart` is the cart on the till, which may be empty. */
export type CashState = { now: number; /** Settings: cash rounding to the nearest 5c. */ rounding: boolean; drawer: DrawerIn; cart: CartIn };

const NO_STATE = { error: 'The till\'s cash drawer and cart could not be read just now.' };
const MAX_CENTS = 100_000_000; // $1,000,000, far above any sale and well inside a safe integer

// ---------- small helpers ----------
/** A money amount the model wrote ("12.50", 12.5 or "$1,200") as cents, or null when it is not a plain amount of zero or more. */
export function parseMoney(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 && v <= MAX_CENTS / 100 ? toCents(v) : null;
  if (typeof v !== 'string') return null;
  const s = v.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const c = toCents(s);
  return c <= MAX_CENTS ? c : null;
}
const startOfDay = (now: number): string => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const pct = (x: number | null): string | null => (x === null ? null : `${Math.round(x * 100)}%`);
const positive = (c: Counts): Counts => cleanCounts(Object.fromEntries(Object.entries(c).filter(([, n]) => n > 0)));

/** Notes and coins as a short list the model can read, largest first, with the total. Kept small: it shares a small context with everything else. */
export function countsView(c: Counts): { amount: string; pieces: number; notes_and_coins: { denomination: string; count: number }[] } {
  const p = positive(c);
  return { amount: fmt(totalOf(p)), pieces: piecesOf(p), notes_and_coins: DENOMS.filter(d => (p[String(d.cents)] ?? 0) > 0).map(d => ({ denomination: d.label, count: p[String(d.cents)] })) };
}

// ---------- cash_drawer ----------
const MAX_MOVES = 5;
/** What the drawer status tool may say. Every value is a plain word, number or amount. No staff name and no ledger note is copied. */
export function buildDrawerView(d: DrawerIn, now: number): Record<string, unknown> {
  const sh = d.shift; const held = positive(d.ledger.counts); const heldTotal = totalOf(held);
  const view: Record<string, unknown> = {};
  if (sh.open) {
    const cash = sh.openedAt ? ledgerCashSince(d.ledger, sh.openedAt) : 0;
    const expected = sh.floatCents + cash + sh.paidInCents - sh.paidOutCents;
    view.shift = { open: true, ...(sh.openedAt ? { opened_at: whenText(sh.openedAt) ?? 'unknown' } : {}), float: fmt(sh.floatCents), cash_sales_since_open: fmt(cash), paid_in: fmt(sh.paidInCents), paid_out: fmt(sh.paidOutCents), expected_in_drawer: fmt(expected) };
    const gap = heldTotal - expected;
    view.ledger_compared_with_expected = gap === 0 ? 'The ledger matches the expected amount.' : `The ledger holds ${fmt(Math.abs(gap))} ${gap > 0 ? 'more' : 'less'} than the expected amount. Counting the drawer will settle it.`;
  } else view.shift = { open: false };
  view.ledger_holds = countsView(held);
  view.cash_takings_today = fmt(ledgerCashSince(d.ledger, startOfDay(now)));
  view.recent_movements = d.ledger.entries.slice(0, MAX_MOVES).map(e => ({ when: whenText(e.ts) ?? 'unknown', what: LEDGER_LABEL[e.kind] ?? 'Other', amount: fmt(entryTotal(e)) }));
  view.note = 'This is the shared drawer as it was when the question was asked. The ledger only knows the notes and coins that were entered, so a physical count can differ. You can only read it. Never open, count or change the drawer.';
  return view;
}

const flat = (...keys: string[]) => Object.fromEntries(keys.map(k => [k, 'shop'] as const));
const COUNTS_GATE = { amount: 'shop', pieces: 'shop', notes_and_coins: flat('denomination', 'count') } as const;

export const cashDrawerTool: AssistantTool = {
  gate: {
    shift: flat('open', 'opened_at', 'float', 'cash_sales_since_open', 'paid_in', 'paid_out', 'expected_in_drawer'),
    ledger_compared_with_expected: 'shop', ledger_holds: COUNTS_GATE, cash_takings_today: 'shop', recent_movements: flat('when', 'what', 'amount'),
  },
  def: { type: 'function', function: {
    name: 'cash_drawer',
    description: 'The cash drawer, read only: open or not, the float, what it should hold, the notes and coins the ledger says are in it, today\'s cash takings and the last few movements.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  } },
  run: (_args, ctx) => (ctx.cash ? buildDrawerView(ctx.cash.drawer, ctx.cash.now) : NO_STATE),
};

// ---------- cash_calculator ----------
const CALC_KINDS = ['change', 'split', 'float'] as const;
const BAD = (what: string) => ({ error: what });
/** Plenty of every note and coin, for the change a till with a full drawer could give. */
const UNLIMITED: Counts = Object.fromEntries(DENOMS.map(d => [String(d.cents), 1000]));

/** The change for a cash payment: what is owed back, and which notes and coins make it. */
export function changeInfo(a: { due: number; given: number; rounding: boolean; drawer: Counts }): Record<string, unknown> {
  const cashDue = a.rounding ? roundCash(a.due) : a.due;
  const out: Record<string, unknown> = { amount_due: fmt(a.due), ...(a.rounding && cashDue !== a.due ? { cash_due_after_rounding: fmt(cashDue) } : {}), amount_given: fmt(a.given) };
  if (a.given < cashDue) return { ...out, short_by: fmt(cashDue - a.given), note: 'The customer has not given enough to cover this.' };
  const change = a.given - cashDue;
  out.change_to_give = fmt(change);
  if (change === 0) return { ...out, note: 'Exact amount, so there is no change.' };
  const plain = greedyChange(UNLIMITED, change);
  if (plain) out.largest_notes_first = countsView(plain);
  else out.note = 'There is no 1c or 2c coin, so this amount cannot be given back exactly in cash. With cash rounding on, the amount due is rounded to the nearest 5c.';
  const held = positive(a.drawer);
  if (totalOf(held) > 0 && plain) {
    const plan = planChange(held, change);
    out.from_this_drawer = plan.kind === 'exact' ? { possible: true, ...countsView(plan.counts), fewest_pieces: true } : { possible: false, note: 'The drawer, as the ledger knows it, cannot make this exactly. Notes the customer hands over can also go back as change, which this does not count.' };
  } else if (plain) out.from_this_drawer = { possible: false, note: 'The ledger holds no cash, so it cannot say which notes and coins the drawer can give.' };
  return out;
}

/** A split payment: the payments in order. Rounding only touches the last payment, and only when it is paid in cash. */
export function splitInfo(a: { total: number; parts?: number; first?: number; rounding: boolean }): Record<string, unknown> {
  if (a.total <= 0) return BAD('The total must be more than $0.00.');
  let plan: number[]; let how: string;
  if (a.first !== undefined) { plan = firstPlan(a.total, a.first); how = `first payment of ${fmt(a.first)}, then the rest`; if (!plan.length) return BAD(`The first payment must be more than $0.00 and less than the total of ${fmt(a.total)}.`); }
  else if (a.parts !== undefined) { plan = equalPlan(a.total, a.parts); how = `${a.parts} equal payments`; if (!plan.length) return BAD('Split into 2 to 20 payments.'); }
  else return BAD('Give either parts (how many equal payments) or first_payment (an amount for the first payment).');
  const last = plan[plan.length - 1]; const lastCash = roundCash(last);
  return {
    total: fmt(a.total), split: how, payments: plan.map((c, i) => ({ number: i + 1, amount: fmt(c) })),
    ...(a.rounding && lastCash !== last ? { last_payment_if_paid_in_cash: fmt(lastCash) } : {}),
    ...(a.parts !== undefined ? { note: plan.some(c => c !== plan[0]) ? 'Cents that do not divide evenly go to the first payments.' : 'Each payment is the same.' } : {}),
  };
}

/** What to bank and what to leave as the float, worked out the same way as More, Cash drawer, Daily float report. */
export function floatInfo(d: DrawerIn, now: number, takingsOverride?: number): Record<string, unknown> {
  const held = positive(d.ledger.counts);
  if (totalOf(held) === 0) return { error: 'The ledger holds no cash, so there is nothing to base a float on. The drawer needs opening or counting first.' };
  const takings = takingsOverride ?? ledgerCashSince(d.ledger, startOfDay(now));
  const profile = buildProfile({ entries: d.ledger.entries as CashLedger['entries'], sales: d.sales as { ts: string; type: string; tenders?: { kind: string }[] }[], prices: d.prices as number[], now });
  const rep = recommendFloat({ drawer: held, takings, profile, budgetMs: 1500 });
  return {
    cash_takings: fmt(rep.takings), drawer_holds: fmt(rep.drawerTotal),
    take_out_to_bank: countsView(rep.best.takeOut), leave_as_float: countsView(rep.best.keep),
    ...(totalOf(rep.topUp) > 0 ? { top_up_from_bank: countsView(rep.topUp) } : {}), suggested_float: fmt(rep.suggestedFloat),
    ...(totalOf(rep.bankable) > 0 ? { big_notes_better_banked: countsView(rep.bankable) } : {}),
    ...(rep.failNow !== null ? { sales_without_exact_change: { drawer_now: pct(rep.failNow), after_banking: pct(rep.failKeep), after_top_up: pct(rep.failTopUp) } } : {}),
    notes: rep.notes.map(n => safeLine(n, 200)),
    ...(rep.truncated ? { search_cut_short: true } : {}),
  };
}

export const cashCalculatorTool: AssistantTool = {
  gate: {
    amount_due: 'shop', cash_due_after_rounding: 'shop', amount_given: 'shop', short_by: 'shop', change_to_give: 'shop', largest_notes_first: COUNTS_GATE,
    from_this_drawer: { possible: 'shop', fewest_pieces: 'shop', note: 'shop', ...COUNTS_GATE },
    total: 'shop', split: 'shop', payments: flat('number', 'amount'), last_payment_if_paid_in_cash: 'shop',
    cash_takings: 'shop', drawer_holds: 'shop', take_out_to_bank: COUNTS_GATE, leave_as_float: COUNTS_GATE, top_up_from_bank: COUNTS_GATE, suggested_float: 'shop',
    big_notes_better_banked: COUNTS_GATE, sales_without_exact_change: flat('drawer_now', 'after_banking', 'after_top_up'), notes: 'shop', search_cut_short: 'shop',
  },
  def: { type: 'function', function: {
    name: 'cash_calculator',
    description: 'Cash sums using the till\'s own rules. kind "change" needs amount_due and amount_given in dollars. "split" needs total and either parts or first_payment. "float" suggests what to bank and what to leave, from today\'s cash takings or a cash_takings amount.',
    parameters: { type: 'object', properties: {
      kind: { type: 'string', enum: [...CALC_KINDS] }, amount_due: { type: 'string' }, amount_given: { type: 'string' }, total: { type: 'string' },
      parts: { type: 'integer' }, first_payment: { type: 'string' }, cash_takings: { type: 'string' },
    }, required: ['kind'], additionalProperties: false },
  } },
  run: (args, ctx) => {
    const s = ctx.cash; if (!s) return NO_STATE;
    const kind = typeof args.kind === 'string' ? args.kind : '';
    if (kind === 'change') {
      const due = parseMoney(args.amount_due); const given = parseMoney(args.amount_given);
      if (due === null || given === null) return BAD('Give amount_due and amount_given as dollar amounts, for example "23.45".');
      return changeInfo({ due, given, rounding: s.rounding, drawer: s.drawer.ledger.counts });
    }
    if (kind === 'split') {
      const total = parseMoney(args.total); if (total === null) return BAD('Give total as a dollar amount, for example "100.00".');
      const parts = args.parts === undefined ? undefined : Number(args.parts); const first = args.first_payment === undefined ? undefined : parseMoney(args.first_payment);
      if (parts !== undefined && (!Number.isInteger(parts) || parts < 2 || parts > 20)) return BAD('Split into 2 to 20 payments.');
      if (first === null) return BAD('Give first_payment as a dollar amount, for example "20.00".');
      return splitInfo({ total, ...(parts !== undefined ? { parts } : {}), ...(first !== undefined ? { first } : {}), rounding: s.rounding });
    }
    if (kind === 'float') {
      const t = args.cash_takings === undefined ? undefined : parseMoney(args.cash_takings);
      if (t === null) return BAD('Give cash_takings as a dollar amount, for example "450.00".');
      return floatInfo(s.drawer, s.now, t);
    }
    return BAD(`Say which sum to do: ${CALC_KINDS.join(', ')}.`);
  },
};

// ---------- current_cart ----------
const MAX_LINES = 25; const MAX_WARNINGS = 5;
/** What the cart tool may say. Gift card codes and recipients, customers, notes and payment details are never copied: only what was sold, for how much, and what stands in the way of Charge. */
export function buildCartView(c: CartIn, rounding: boolean): Record<string, unknown> {
  const { cart, priced } = c;
  if (!cart.lines.length) return { empty: true, note: 'The cart on the till is empty, so Charge has nothing to take. Add an item first.' };
  const flags = new Map(flaggedLines(priced).map(f => [f.lineId, f.reasons] as const));
  const lines = priced.lines.slice(0, MAX_LINES).map(pl => {
    const l = pl.line; const names = Array.from(new Set(pl.discounts.map(d => safeLine(d.label, 60))));
    return {
      name: l.kind === 'gift_card' ? 'Gift card' : safeLine(l.title, 80), ...(l.variantTitle && l.kind === 'item' ? { variant: safeLine(l.variantTitle, 60) } : {}),
      quantity: l.qty, unit_price: fmt(pl.baseUnitCents), line_total: fmt(pl.netCents),
      ...(pl.discountCents > 0 ? { discount: fmt(pl.discountCents), discount_names: names } : {}),
      ...(l.kind === 'custom' ? { custom_amount: true } : {}), ...(pl.adjustment ? { price_adjusted: true } : {}),
      ...(flags.has(l.id) ? { needs_price_check: true, price_check_reasons: flags.get(l.id)!.slice(0, 2).map(r => safeLine(r, 120)) } : {}),
    };
  });
  const paid = (cart.tenders ?? []).reduce((s, t) => s + t.amountCents, 0);
  // Only a warning set to show at Charge pops up before payment. One set to "queue" goes on the warning list instead and never stands in the way.
  const atCharge = c.warnings.filter(m => (m.warning.mode ?? 'charge') !== 'queue'); const queued = c.warnings.length - atCharge.length;
  const matched = atCharge.slice(0, MAX_WARNINGS).map(m => ({ title: safeLine(warningTitle(m.warning), 80), must_tick_before_payment: !!m.warning.requireAcknowledgement, triggered_by: triggerNames(m).slice(0, 5).map(n => safeLine(n, 80)) }));
  const orderChecks = orderReviewReasons(cart, priced).slice(0, 2).map(r => safeLine(r, 120));
  const view: Record<string, unknown> = {
    empty: false, lines, ...(priced.lines.length > MAX_LINES ? { more_lines_not_shown: priced.lines.length - MAX_LINES } : {}),
    items_before_discounts: fmt(priced.itemsCents), discounts: fmt(priced.discountCents), total: fmt(priced.netCents),
    ...(priced.adjustment ? { whole_order_price_set: fmt(priced.adjustment.finalCents) } : {}),
    ...(priced.deals.length ? { discounts_applied: priced.deals.slice(0, 6).map(d => ({ name: safeLine(d.label, 60), saved: fmt(d.cents) })) } : {}),
    lines_needing_price_check: flags.size, ...(orderChecks.length ? { order_price_check: orderChecks } : {}),
    warnings: matched, ...(queued > 0 ? { warnings_on_the_warning_list_instead: queued } : {}),
    payment_started: paid > 0 || !!cart.tenders?.length,
    ...(paid > 0 ? { still_to_pay: fmt(Math.max(0, priced.netCents - paid)) } : {}),
    ...(rounding && priced.netCents > 0 && !paid && roundCash(priced.netCents) !== priced.netCents ? { cash_due_if_paid_in_cash: fmt(roundCash(priced.netCents)) } : {}),
  };
  const stops: string[] = [];
  if (flags.size || orderChecks.length) stops.push('price adjustments are listed for a check before payment');
  if (matched.some(m => m.must_tick_before_payment)) stops.push('a cart warning needs ticking before payment');
  view.note = `This is the cart as it was when the question was asked. It only reads the cart and never edits it.${stops.length ? ` Before payment starts: ${stops.join(', and ')}.` : ''} Nothing else here stops Charge.`;
  return view;
}

export const currentCartTool: AssistantTool = {
  gate: {
    empty: 'order', more_lines_not_shown: 'order', items_before_discounts: 'order', discounts: 'order', total: 'order', whole_order_price_set: 'order',
    lines: { name: 'order', variant: 'order', quantity: 'order', unit_price: 'order', line_total: 'order', discount: 'order', discount_names: 'order', custom_amount: 'order', price_adjusted: 'order', needs_price_check: 'order', price_check_reasons: 'order' },
    discounts_applied: { name: 'order', saved: 'order' }, lines_needing_price_check: 'order', order_price_check: 'order',
    warnings: { title: 'shop', must_tick_before_payment: 'shop', triggered_by: 'shop' }, warnings_on_the_warning_list_instead: 'shop',
    payment_started: 'order', still_to_pay: 'order', cash_due_if_paid_in_cash: 'order',
  },
  def: { type: 'function', function: {
    name: 'current_cart',
    description: 'The cart on the till now, read only: lines, discounts, total, price checks and the warnings that stand in the way of payment. Use it for "why won\'t this sale go through".',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  } },
  run: (_args, ctx) => (ctx.cash ? buildCartView(ctx.cash.cart, ctx.cash.rounding) : NO_STATE),
};

/** The three tools, in the order they are offered. */
export const CASH_TOOLS: AssistantTool[] = [cashDrawerTool, cashCalculatorTool, currentCartTool];
