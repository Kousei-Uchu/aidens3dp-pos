// Location: src/lib/assistantData.ts
// The shop data the assistant's data tools read (patch 0163, plan 3.2 tools 3, 4, 7 and 14, patch 7 in 3.10).
// Pure functions over a plain snapshot of what is saved on this iPad: no network, no store, no React Native imports, so they run in
// the node tests. The snapshot is built in assistantDataIO.ts. What this till knows (plan question 12): its recent sales and
// refunds, the sales and daily totals other tills shared through Shopify, the daily totals saved here (including imported Square
// history), the customers, the deals and the gift cards seen in sales.
//
// Nothing here decides what may be sent to the model. Every field these functions return is sorted into a category by the field
// maps in assistantDataTools.ts, and the data gate (assistantGate.ts) applies the endpoint rules to it. Money is returned as text
// like "$12.50" so a small model never has to read cents.
import { fmt } from './money';
import { reasonLabel } from './adjustReason';
import { applyRecord, derived, dayKey, emptyTotals, merge, parseDay, adjustmentSummary, rollupKey, staffSummary, type Range, type RollupRow, type Totals } from './rollup';
import type { AutoDiscount, BundleConfig, BundleDeal, Collection, Customer, ManualPreset, SaleRecord, Variant } from './types';

/** What the data tools can read. Built fresh for each question, so it is never older than the question. */
export type AssistantData = {
  /** The time the question was asked, in milliseconds. */
  now: number;
  /** Recent sales and refunds, newest first: this till's (the latest 2000 it keeps) and the others' shared ones. */
  sales: SaleRecord[];
  /** Daily totals: this till, the totals other tills shared, and imported Square history. */
  rollups: RollupRow[];
  customers: Customer[];
  autos: AutoDiscount[];
  presets: ManualPreset[];
  bundles: BundleConfig | null;
  /** Only used to turn a deal's product and variant ids into names. */
  variants: Record<string, Variant>;
  collections: Collection[];
};

/**
 * The daily totals, the way the Reports screen merges them but without the live fetch from Shopify: imported Square history, the
 * totals shared by other tills (in `local`), this till's saved totals, and sales still waiting in the outbox. Square wins a clash
 * with a till total; this till's own total wins over a shared copy of the same key.
 */
export function localRollupRows(local: Record<string, Totals>, outbox: { done: { rollup?: boolean }; sale: SaleRecord }[], square: RollupRow[]): RollupRow[] {
  const m = new Map<string, RollupRow>(square.map(r => [`${r.registerId}|${r.date}`, r] as const));
  for (const [k, t] of Object.entries(local)) if (!m.has(k)) { const [registerId, date] = k.split('|'); m.set(k, { registerId, date, totals: t }); }
  for (const o of outbox.filter(x => !x.done.rollup)) {
    const k = rollupKey(o.sale.registerId, o.sale.ts); const cur = m.get(k); const [registerId, date] = k.split('|');
    m.set(k, { registerId, date, totals: applyRecord(cur?.totals ?? emptyTotals(), o.sale) });
  }
  return [...m.values()];
}

export const SALES_SCOPE_NOTE = 'These figures come from every till that shares into this shop, plus any imported Square history. A till only shares the sales it makes after the sharing is set up.';
export const MAX_ROWS = 10;
export const MAX_DETAIL = 3;
export const MAX_DAYS = 31;

// ---------- words and dates ----------
const stem = (w: string): string => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
/** The words of a search, lower case, without a trailing s, so \"tadlings\" finds \"Tadling\". */
export function words(text: unknown): string[] {
  const out: string[] = [];
  for (const w of String(text ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) { const t = stem(w); if (!out.includes(t)) out.push(t); }
  return out.slice(0, 8);
}
/** Every search word has to be in the text. */
export const hasAll = (haystack: string, terms: string[]): boolean => { const h = haystack.toLowerCase(); return terms.every(t => h.includes(t)); };

/** A real calendar day written YYYY-MM-DD, or null. */
export function cleanDay(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return null;
  const s = v.trim(); const d = parseDay(s);
  return !isNaN(d.getTime()) && dayKey(d) === s ? s : null;
}
const addDays = (d: Date, n: number): Date => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export const PERIODS = ['today', 'yesterday', 'last_7_days', 'last_30_days', 'this_week', 'last_week', 'this_month', 'last_month', 'this_year'] as const;
export type PeriodName = typeof PERIODS[number];
/** The dates a named period covers, counted from `now`. Weeks start on Monday. */
export function rangeFor(period: PeriodName, now: number): Range {
  const t = new Date(now); const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const sinceMonday = (today.getDay() + 6) % 7;
  switch (period) {
    case 'today': return { from: dayKey(today), to: dayKey(today) };
    case 'yesterday': { const y = addDays(today, -1); return { from: dayKey(y), to: dayKey(y) }; }
    case 'last_7_days': return { from: dayKey(addDays(today, -6)), to: dayKey(today) };
    case 'last_30_days': return { from: dayKey(addDays(today, -29)), to: dayKey(today) };
    case 'this_week': return { from: dayKey(addDays(today, -sinceMonday)), to: dayKey(today) };
    case 'last_week': { const mon = addDays(today, -sinceMonday - 7); return { from: dayKey(mon), to: dayKey(addDays(mon, 6)) }; }
    case 'this_month': return { from: dayKey(new Date(today.getFullYear(), today.getMonth(), 1)), to: dayKey(today) };
    case 'last_month': return { from: dayKey(new Date(today.getFullYear(), today.getMonth() - 1, 1)), to: dayKey(new Date(today.getFullYear(), today.getMonth(), 0)) };
    case 'this_year': return { from: dayKey(new Date(today.getFullYear(), 0, 1)), to: dayKey(today) };
  }
}
/**
 * The dates a question asks about. A from and to pair wins over a named period; one of the pair alone means that single day.
 * With nothing given, `fallback` is used (or nothing, for a search that may span all time).
 */
export function resolveRange(args: Record<string, unknown>, now: number, fallback?: PeriodName): { range: Range | null } | { error: string } {
  const hasFrom = args.from !== undefined && args.from !== null && args.from !== ''; const hasTo = args.to !== undefined && args.to !== null && args.to !== '';
  if (hasFrom || hasTo) {
    const from = cleanDay(hasFrom ? args.from : args.to), to = cleanDay(hasTo ? args.to : args.from);
    if (!from || !to) return { error: 'Dates must be real days written like 2026-10-18.' };
    if (from > to) return { error: 'The from date is after the to date.' };
    return { range: { from, to } };
  }
  if (args.period !== undefined && args.period !== null && args.period !== '') {
    if (!(PERIODS as readonly unknown[]).includes(args.period)) return { error: `Unknown period. Use one of: ${PERIODS.join(', ')}.` };
    return { range: rangeFor(args.period as PeriodName, now) };
  }
  return { range: fallback ? rangeFor(fallback, now) : null };
}
const inRange = (day: string, r: Range | null): boolean => !r || (day >= r.from && day <= r.to);
const when = (ts: string): string => { const d = new Date(ts); return isNaN(d.getTime()) ? ts.slice(0, 16) : `${dayKey(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const dayOf = (ts: string): string => { const d = new Date(ts); return isNaN(d.getTime()) ? ts.slice(0, 10) : dayKey(d); };
const TENDER: Record<string, string> = { card: 'Card', cash: 'Cash', gift_card: 'Gift card', exchange_credit: 'Exchange credit' };

// ---------- sales report ----------
export type ReportArgs = { period?: unknown; from?: unknown; to?: unknown; item?: unknown };
/**
 * Totals for a period, already added up, from the daily totals this till keeps (its own, the shared ones and imported Square
 * history). With `item`, the units and sales of the items whose name has those words in it. `includeStaff` is whether staff names
 * and their sales may be listed at all.
 */
export function salesReport(data: AssistantData, args: ReportArgs, includeStaff: boolean): Record<string, unknown> {
  const r = resolveRange(args as Record<string, unknown>, data.now, 'today'); if ('error' in r) return r;
  const range = r.range as Range;
  const rows = data.rollups.filter(x => x.date >= range.from && x.date <= range.to);
  const tot = rows.reduce((a, x) => merge(a, x.totals), emptyTotals());
  const notes: string[] = [SALES_SCOPE_NOTE]; if (!rows.length) notes.push('No sales were saved for these dates.');

  const item = typeof args.item === 'string' ? args.item.trim() : '';
  if (item) {
    const terms = words(item); if (!terms.length) return { error: 'Give the item name, or a word from it.' };
    const hits = Object.entries(tot.byItem).filter(([name]) => hasAll(name, terms)).sort((a, b) => b[1].count - a[1].count || b[1].grossCents - a[1].grossCents);
    notes.push('Sales are before discounts. Refunds are taken off.');
    if (!hits.length) notes.push('No item with that name sold in these dates.');
    if (hits.length > MAX_ROWS) notes.push(`Showing the top ${MAX_ROWS} of ${hits.length} matching items.`);
    return {
      from: range.from, to: range.to,
      matches: hits.slice(0, MAX_ROWS).map(([name, b]) => ({ name, sold: b.count, sales: fmt(b.grossCents) })),
      total_sold: hits.reduce((s, [, b]) => s + b.count, 0), total_sales: fmt(hits.reduce((s, [, b]) => s + b.grossCents, 0)),
      note: notes.join(' '),
    };
  }

  const d = derived(tot);
  const out: Record<string, unknown> = {
    from: range.from, to: range.to, orders: tot.orders, refunds: tot.refunds,
    gross_sales: fmt(d.grossSales), discounts: fmt(d.discounts), refunded: fmt(d.refunds), net_sales: fmt(d.netSales), average_sale: fmt(d.avgSale),
    gift_cards_sold: fmt(tot.giftCardSalesCents), tips: fmt(tot.tipsCents), total_collected: fmt(d.totalCollected), card_fees: fmt(d.fees),
    cost_of_goods: fmt(d.cogs), gross_profit: fmt(d.grossProfit),
    takings: Object.entries(tot.tenders).map(([k, v]) => ({ method: TENDER[k] ?? k, amount: fmt(v) })),
    top_items: Object.entries(tot.byItem).sort((a, b) => b[1].count - a[1].count || b[1].grossCents - a[1].grossCents).slice(0, 5).map(([name, b]) => ({ name, sold: b.count, sales: fmt(b.grossCents) })),
    top_categories: Object.entries(tot.byCategory).sort((a, b) => b[1].grossCents - a[1].grossCents).slice(0, 5).map(([name, b]) => ({ name, sold: b.count, sales: fmt(b.grossCents) })),
  };
  const adj = adjustmentSummary(tot);
  if (adj.count) out.adjustments = adj.rows.slice(0, 5).map(a => ({ reason: reasonLabel(a.key), count: a.count, amount: fmt(a.cents) }));
  if (includeStaff) { const s = staffSummary(tot); if (s.length) out.staff = s.slice(0, 8).map(x => ({ name: x.name, sales: x.count, net: fmt(x.cents) })); }
  const span = Math.round((parseDay(range.to).getTime() - parseDay(range.from).getTime()) / 86400000) + 1;
  if (span <= MAX_DAYS) {
    const by = new Map<string, ReturnType<typeof emptyTotals>>();
    for (const x of rows) by.set(x.date, merge(by.get(x.date) ?? emptyTotals(), x.totals));
    out.days = [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).filter(([, t]) => t.orders || t.refunds).map(([date, t]) => ({ date, orders: t.orders, net: fmt(derived(t).netSales) }));
  } else notes.push(`Daily figures are left out for ranges over ${MAX_DAYS} days.`);
  notes.push('Gross sales and top items are before discounts. Net sales are after discounts and refunds. Cost of goods is shown separately and is not taken off net sales.');
  out.note = notes.join(' ');
  return out;
}

// ---------- orders ----------
/** How an order is named to the model and by the cashier: its Shopify name when it has one, such as #1042, otherwise the start of its id. */
export const orderRef = (s: SaleRecord): string => (s.orderName && s.orderName.trim()) || s.uuid.slice(0, 8);
const refKey = (ref: string): string => ref.toLowerCase().replace(/^#/, '');

export type OrderArgs = { query?: unknown; period?: unknown; from?: unknown; to?: unknown; type?: unknown; detail?: unknown };
export type OrderAccess = {
  /** Customer names, phone numbers and staff names may be sent, so they may be searched and listed. */
  personal: boolean;
  /** Customer emails may be sent. */
  email: boolean;
};
/** One line of an order. */
function lineOut(l: SaleRecord['lines'][number], detail: boolean): Record<string, unknown> {
  const name = l.variantTitle ? `${l.title} - ${l.variantTitle}` : l.title;
  if (!detail) return { name, qty: l.qty };
  return {
    name, qty: l.qty, paid: fmt(l.netCents), ...(l.discountCents ? { discount: fmt(l.discountCents) } : {}), cost: fmt(l.costCents),
    ...(l.kind === 'gift_card' && l.giftCardCode ? { gift_card_code: l.giftCardCode } : {}),
  };
}
/**
 * Finds sales and refunds from every till that syncs, newest first. The words in `query` have to be in the order name, an item name
 * or, where customer details may be sent, the customer. A customer is never searched when their details are hidden, because a match
 * would tell the model who bought something.
 */
export function findOrders(data: AssistantData, args: OrderArgs, access: OrderAccess): Record<string, unknown> {
  const r = resolveRange(args as Record<string, unknown>, data.now); if ('error' in r) return r;
  const type = args.type === 'sale' || args.type === 'refund' ? args.type : null;
  const terms = words(args.query);
  const detail = args.detail === true;
  const hits = data.sales.filter(s => {
    if (type && s.type !== type) return false;
    if (!inRange(dayOf(s.ts), r.range)) return false;
    if (!terms.length) return true;
    const hay = [refKey(orderRef(s)), ...s.lines.map(l => `${l.title} ${l.variantTitle ?? ''}`), ...(access.personal ? [s.customer?.name ?? ''] : []), ...(access.email ? [s.customer?.email ?? ''] : [])].join(' ');
    return hasAll(hay, terms);
  }).sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  const limit = detail ? MAX_DETAIL : MAX_ROWS;
  const notes: string[] = ['These are the sales and refunds from every till that syncs, the newest 2000 this till keeps and the newest 2000 the others shared. Very old sales, and sales made before sharing was on, are not here.'];
  if (hits.length > limit) notes.push(`Showing the newest ${limit} of ${hits.length}. Narrow it with dates or more words.`);
  if (!hits.length) notes.push('No order matched.');
  const byUuid = new Map(data.sales.map(s => [s.uuid, s] as const));
  return {
    found: hits.length,
    orders: hits.slice(0, limit).map(s => {
      const o: Record<string, unknown> = {
        order: orderRef(s), date: when(s.ts), type: s.type, total: fmt(s.totalCents),
        ...(s.discountCents ? { discount: fmt(s.discountCents) } : {}),
        items: s.lines.slice(0, detail ? 30 : 4).map(l => lineOut(l, detail)),
        ...(s.lines.length > (detail ? 30 : 4) ? { more_items: s.lines.length - (detail ? 30 : 4) } : {}),
      };
      if (s.customer?.name) o.customer = { name: s.customer.name, ...(detail && s.customer.email ? { email: s.customer.email } : {}), ...(detail && s.customer.phone ? { phone: s.customer.phone } : {}) };
      if (s.staff) o.staff = s.staff;
      if (s.type === 'refund' && s.refundOf) { const orig = byUuid.get(s.refundOf); if (orig) o.refund_of = orderRef(orig); }
      if (detail) {
        o.paid_with = [...new Set(s.tenders.map(t => TENDER[t.kind] ?? t.kind))];
        if (s.tipCents) o.tip = fmt(s.tipCents);
        if (s.deals.length) o.deals = s.deals.slice(0, 8).map(x => ({ label: x.label, amount: fmt(x.cents) }));
        if (s.adjustments?.length) o.adjustments = s.adjustments.slice(0, 8).map(a => ({ kind: a.kind, title: a.title, amount: fmt(a.cents), ...(a.reason ? { reason: a.reason } : {}) }));
        if (s.note) o.note = s.note;
        if (s.reason) o.reason = s.reason;
      }
      return o;
    }),
    note: notes.join(' '),
  };
}

// ---------- deals ----------
export type DealArgs = { query?: unknown; only_live?: unknown };
const money = (c: number): string => fmt(c);
const pct = (n: number): string => `${Math.round(n * 100) / 100}%`;
const liveWindow = (from: string | null | undefined, to: string | null | undefined, now: number): boolean => !(from && Date.parse(from) > now) && !(to && Date.parse(to) < now);
const dayText = (iso: string | null | undefined): string | undefined => { if (!iso) return undefined; const d = new Date(iso); return isNaN(d.getTime()) ? undefined : dayKey(d); };

/** A product or variant id turned into a name people use. An id the catalogue does not know is left out. */
function nameFor(id: string, data: AssistantData): string | null {
  const v = data.variants[id]; if (v) return v.variantTitle ? `${v.productTitle} - ${v.variantTitle}` : v.productTitle;
  const p = Object.values(data.variants).find(x => x.productId === id); return p ? p.productTitle : null;
}
function namesFor(ids: string[], data: AssistantData): string {
  const names = [...new Set(ids.map(i => nameFor(i, data)).filter((x): x is string => !!x))];
  if (!names.length) return ids.length ? `${ids.length} item${ids.length === 1 ? '' : 's'}` : 'nothing yet';
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ');
}
function targetText(t: AutoDiscount['target'], data: AssistantData): string {
  if (!t || t.all) return 'everything';
  const parts: string[] = [];
  if (t.collectionIds?.length) parts.push(t.collectionIds.map(id => data.collections.find(c => c.id === id)?.title).filter(Boolean).join(', ') || 'some collections');
  const ids = [...(t.productIds ?? []), ...(t.variantIds ?? [])]; if (ids.length) parts.push(namesFor(ids, data));
  return parts.join(' and ') || 'everything';
}
function bundleHow(d: BundleDeal): string {
  const mode = d.mode ?? 'delta';
  if (mode === 'fixed_price') return `the matched items together cost ${money(d.price_delta_cents)}`;
  if (mode === 'percent') return `${pct(d.percent ?? 0)} off the matched items`;
  return d.price_delta_cents < 0 ? `${money(-d.price_delta_cents)} off` : 'no change in price';
}
function autoHow(d: AutoDiscount, data: AssistantData): string {
  const amount = d.pct ? `${pct(d.pct)} off` : d.amtCents ? `${money(d.amtCents)} off${d.eachItem ? ' each item' : ''}` : 'a discount';
  if (d.kind === 'bxgy') {
    const buy = `buy ${d.buys?.qty ? `${d.buys.qty} of ${targetText(d.buys.target, data)}` : d.buys?.amountCents ? `${money(d.buys.amountCents)} of ${targetText(d.buys?.target, data)}` : targetText(d.buys?.target, data)}`;
    const get = d.gets ? `get ${d.gets.qty} of ${targetText(d.gets.target, data)} ${d.gets.pct ? (d.gets.pct >= 100 ? 'free' : `${pct(d.gets.pct)} off`) : d.gets.amtCents ? `${money(d.gets.amtCents)} off` : ''}`.trim() : 'get a reward';
    return `${buy}, ${get}`;
  }
  const rules = [d.minQty ? `at least ${d.minQty} items` : '', d.minSubtotalCents ? `a subtotal of at least ${money(d.minSubtotalCents)}` : ''].filter(Boolean);
  return `${amount}${rules.length ? `, needs ${rules.join(' and ')}` : ''}`;
}
/** Deals the till applies, and the manual discounts staff can choose, with whether each is running now. */
export function listDeals(data: AssistantData, args: DealArgs): Record<string, unknown> {
  const terms = words(args.query); const onlyLive = args.only_live === true;
  type Row = { name: string; kind: string; live: boolean; how: string; applies_to?: string; starts?: string; ends?: string; limit?: string };
  const rows: Row[] = [];
  for (const d of data.bundles?.discounts ?? []) {
    const items = data.bundles?.items ?? {};
    rows.push({
      name: d.label || d.id, kind: 'bundle deal', live: !!liveWindow(d.starts_at, d.ends_at, data.now) && d.enabled !== false, how: bundleHow(d),
      applies_to: `one item from each of: ${d.sets.map(s => `${s} (${namesFor(items[s] ?? [], data)})`).join('; ')}`,
      ...(dayText(d.starts_at) ? { starts: dayText(d.starts_at) } : {}), ...(dayText(d.ends_at) ? { ends: dayText(d.ends_at) } : {}),
      ...(d.max_per_cart ? { limit: `${d.max_per_cart} per sale` } : {}),
    });
  }
  for (const a of data.autos) {
    rows.push({
      name: a.title, kind: 'automatic discount', live: liveWindow(a.startsAt, a.endsAt, data.now), how: autoHow(a, data),
      ...(a.kind === 'basic' ? { applies_to: targetText(a.target, data) } : {}),
      ...(dayText(a.startsAt) ? { starts: dayText(a.startsAt) } : {}), ...(dayText(a.endsAt) ? { ends: dayText(a.endsAt) } : {}),
      ...(a.usesPerOrderLimit ? { limit: `${a.usesPerOrderLimit} per sale` } : {}),
    });
  }
  for (const p of data.presets) rows.push({ name: p.label, kind: 'manual discount', live: true, how: p.kind === 'pct' ? `${pct(p.value)} off, chosen by staff` : `${money(p.value)} off, chosen by staff` });
  const hits = rows.filter(r => (!onlyLive || r.live) && (!terms.length || hasAll(`${r.name} ${r.kind} ${r.applies_to ?? ''}`, terms)));
  hits.sort((a, b) => Number(b.live) - Number(a.live) || a.name.localeCompare(b.name));
  const notes: string[] = [];
  if (hits.length > 12) notes.push(`Showing 12 of ${hits.length}. Add words to narrow it.`);
  if (!hits.length) notes.push(rows.length ? 'No deal matched.' : 'No deals are set up on this till.');
  notes.push('Only one discount applies to each item. When deals compete, the till picks the combination that takes the most off.');
  return { found: hits.length, deals: hits.slice(0, 12), note: notes.join(' ') };
}

// ---------- customers ----------
export type CustomerArgs = { query?: unknown };
export type CustomerAccess = { personal: boolean; email: boolean };
const digits = (s: string): string => s.replace(/\D/g, '');
/**
 * Finds saved customers by name, email or phone. Only what may be sent is searched, so a match never tells the model that someone
 * is a customer by a detail it may not read. The rows come back whole and the data gate takes out whatever may not be sent.
 */
export function findCustomers(data: AssistantData, args: CustomerArgs, access: CustomerAccess): Record<string, unknown> {
  const raw = typeof args.query === 'string' ? args.query.trim() : '';
  if (!raw) return { error: 'Give a name, an email address or a phone number to look for.' };
  const terms = words(raw); const num = digits(raw);
  const hits = data.customers.filter(c => {
    const byName = access.personal && terms.length > 0 && hasAll(c.name ?? '', terms);
    const byPhone = access.personal && num.length >= 4 && digits(c.phone ?? '').includes(num);
    const byEmail = access.email && raw.includes('@') ? (c.email ?? '').toLowerCase().includes(raw.toLowerCase()) : access.email && terms.length > 0 && hasAll(c.email ?? '', terms);
    return byName || byPhone || byEmail;
  }).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  const notes: string[] = ['Customers saved on this till. Their order counts and spending are as of the last sync.'];
  if (hits.length > MAX_ROWS) notes.push(`Showing ${MAX_ROWS} of ${hits.length}. Add more of the name to narrow it.`);
  if (!hits.length) notes.push('No customer matched.');
  return {
    found: hits.length,
    customers: hits.slice(0, MAX_ROWS).map(c => ({
      name: c.name, ...(c.email ? { email: c.email } : {}), ...(c.phone ? { phone: c.phone } : {}),
      ...(typeof c.orders === 'number' ? { orders: c.orders } : {}), ...(typeof c.spentCents === 'number' ? { spent: fmt(c.spentCents) } : {}), ...(c.note ? { note: c.note } : {}),
    })),
    note: notes.join(' '),
  };
}

// ---------- gift cards ----------
export type GiftArgs = { code?: unknown; kind?: unknown; period?: unknown; from?: unknown; to?: unknown };
const normCode = (raw: string): string => raw.replace(/^shopify-giftcard-v\d+-/i, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
export type GiftAccess = { code: boolean; personal: boolean; email: boolean };
/**
 * Gift cards sold and gift card payments across every till that syncs. A card's balance is not here: it is kept by Shopify and the
 * assistant does not look at Shopify live, so the balance is read on the Gift cards screen.
 */
export function giftCardActivity(data: AssistantData, args: GiftArgs, access: GiftAccess): Record<string, unknown> {
  const r = resolveRange(args as Record<string, unknown>, data.now); if ('error' in r) return r;
  const kind = args.kind === 'sold' || args.kind === 'redeemed' ? args.kind : null;
  const wanted = typeof args.code === 'string' && args.code.trim() ? normCode(args.code) : '';
  if (wanted && !access.code) return { error: 'Searching by gift card code is switched off by the shop\'s privacy rules.' };
  if (wanted && wanted.length < 4) return { error: 'Give at least the last 4 characters of the code.' };
  type Ev = { at: string; ts: number; event: 'sold' | 'redeemed'; amount: string; order: string; code?: string; recipient?: { name?: string; email?: string } };
  const events: Ev[] = [];
  let sold = 0, redeemed = 0;
  for (const s of data.sales) {
    if (s.type !== 'sale' || !inRange(dayOf(s.ts), r.range)) continue;
    if (kind !== 'redeemed') for (const l of s.lines) {
      if (l.kind !== 'gift_card') continue;
      if (wanted && !normCode(l.giftCardCode ?? '').endsWith(wanted)) continue;
      sold += l.netCents;
      events.push({ at: when(s.ts), ts: Date.parse(s.ts), event: 'sold', amount: fmt(l.netCents), order: orderRef(s), ...(l.giftCardCode ? { code: l.giftCardCode } : {}),
        ...(l.giftRecipient && (access.personal || access.email) ? { recipient: { ...(l.giftRecipient.name ? { name: l.giftRecipient.name } : {}), ...(l.giftRecipient.email ? { email: l.giftRecipient.email } : {}) } } : {}) });
    }
    if (kind !== 'sold') for (const t of s.tenders) {
      if (t.kind !== 'gift_card') continue;
      if (wanted && !normCode(t.giftCardCode ?? '').endsWith(wanted)) continue;
      redeemed += t.amountCents;
      events.push({ at: when(s.ts), ts: Date.parse(s.ts), event: 'redeemed', amount: fmt(t.amountCents), order: orderRef(s), ...(t.giftCardCode ? { code: t.giftCardCode } : {}) });
    }
  }
  events.sort((a, b) => b.ts - a.ts);
  const notes: string[] = ['From the sales of every till that syncs, the newest 2000 each. A card\'s remaining balance is not shown here: it is held by Shopify. Use the Gift cards screen to check a balance.'];
  if (events.length > MAX_ROWS) notes.push(`Showing the newest ${MAX_ROWS} of ${events.length}.`);
  if (!events.length) notes.push('No gift card activity matched.');
  return {
    found: events.length, total_sold: fmt(sold), total_redeemed: fmt(redeemed),
    activity: events.slice(0, MAX_ROWS).map(({ ts: _ts, ...e }) => e),
    ...(r.range ? { from: r.range.from, to: r.range.to } : {}),
    note: notes.join(' '),
  };
}
