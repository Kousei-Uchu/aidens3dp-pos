// Location: src/lib/exportSheets.ts
// The report export: it turns the sales, totals and setup the till holds, including what the other tills have shared, into plain
// tables (a name, a header row and rows of text), which the
// Export screen writes as CSV files or as one multi-sheet workbook that Google Sheets or Excel opens.
//
// Pure: no React, no store, no file access, so the node tests can build every table from a fixed snapshot. The snapshot
// (the store, the raw history files) is gathered by exportCollect.ts; nothing here reads the app.
//
// Every topic has a summary version and, where it makes sense, a full detail version (see EXPORT_TOPICS). Money is
// written as a plain decimal string like "12.50" with no symbol, so a spreadsheet reads it as a number.
import { toDecimal } from './money';
import { reasonLabel } from './adjustReason';
import { LEDGER_LABEL, denomLabel, summariseCounts, totalOf, type CashLedger } from './cashLedger';
import { derived, type Totals } from './rollup';
import type { Attempt, OutboxItem, SavedCart, Shift } from '../state/store';
import type { AutoDiscount, BundleDeal, CartWarnings, Collection, Customer, ManualPreset, Notice, SaleRecord, Variant, WarningList } from './types';

/** One table: what the CSV file holds, and what one worksheet holds in the workbook. */
export type Sheet = { name: string; header: string[]; rows: string[][] };
export type ExportDepth = 'summary' | 'full';

export type ExportGroupId = 'sales' | 'cash' | 'stock' | 'people' | 'system';
export type ExportTopicId =
  | 'transactions' | 'items' | 'discounts' | 'giftcards'
  | 'cash'
  | 'inventory' | 'catalogue'
  | 'customers' | 'staff'
  | 'rollups' | 'saved' | 'warnings' | 'notices' | 'sync' | 'raw';

export type ExportTopic = {
  id: ExportTopicId;
  group: ExportGroupId;
  label: string;
  blurb: string;
  /** What the summary version holds, said in a few words. */
  summaryNote: string;
  /** What the full version holds. */
  fullNote: string;
  /** Which depths this topic has. A topic with one depth shows no choice. */
  depths: ExportDepth[];
};

export const EXPORT_GROUPS: { id: ExportGroupId; label: string }[] = [
  { id: 'sales', label: 'Sales and money' },
  { id: 'cash', label: 'Cash' },
  { id: 'stock', label: 'Stock and catalogue' },
  { id: 'people', label: 'People' },
  { id: 'system', label: 'Till and system' },
];

export const EXPORT_TOPICS: ExportTopic[] = [
  { id: 'transactions', group: 'sales', label: 'Transactions and sales', blurb: 'Every sale and refund, with how it was paid.', depths: ['summary', 'full'],
    summaryNote: 'One row per sale or refund.', fullNote: 'One row per line sold.' },
  { id: 'items', group: 'sales', label: 'Item and category sales', blurb: 'What sold, by item and by category.', depths: ['summary', 'full'],
    summaryNote: 'Totals per item.', fullNote: 'One row per line, with its category and SKU.' },
  { id: 'discounts', group: 'sales', label: 'Discounts and price adjustments', blurb: 'What was discounted, and by how much.', depths: ['summary', 'full'],
    summaryNote: 'Totals per discount.', fullNote: 'Every discount and price adjustment on every sale.' },
  { id: 'giftcards', group: 'sales', label: 'Gift cards', blurb: 'Gift cards sold and redeemed on every till that syncs.', depths: ['summary', 'full'],
    summaryNote: 'Totals per day.', fullNote: 'One row per gift card sold or redeemed.' },
  { id: 'cash', group: 'cash', label: 'Cash ledger and drawer', blurb: 'The shift, the float, what the drawer holds and every movement.', depths: ['summary', 'full'],
    summaryNote: 'The shift, what the drawer holds and its contents.', fullNote: 'Every ledger entry, newest first.' },
  { id: 'inventory', group: 'stock', label: 'Inventory changes', blurb: 'Stock on hand, and the units that moved through sales and refunds.', depths: ['summary', 'full'],
    summaryNote: 'Current stock and units moved per item.', fullNote: 'One row per stock movement.' },
  { id: 'catalogue', group: 'stock', label: 'Catalogue', blurb: 'Every product and variant the till knows, with prices and stock.', depths: ['summary', 'full'],
    summaryNote: 'Counts and totals only.', fullNote: 'One row per variant.' },
  { id: 'customers', group: 'people', label: 'Customers', blurb: 'The customer list and what they have spent.', depths: ['summary', 'full'],
    summaryNote: 'Counts and totals.', fullNote: 'One row per customer.' },
  { id: 'staff', group: 'people', label: 'Sales by team member', blurb: 'Who sold what.', depths: ['summary', 'full'],
    summaryNote: 'Totals per person.', fullNote: 'One row per team member per day.' },
  { id: 'rollups', group: 'system', label: 'Daily totals', blurb: 'The day totals of every till that syncs, including imported Square history.', depths: ['summary', 'full'],
    summaryNote: 'One row per day, all registers added up.', fullNote: 'One row per register per day.' },
  { id: 'saved', group: 'system', label: 'Saved carts', blurb: 'Sales parked to finish later.', depths: ['summary', 'full'],
    summaryNote: 'How many are open or void, and their value.', fullNote: 'One row per saved cart.' },
  { id: 'warnings', group: 'system', label: 'Cart warnings and the warning list', blurb: 'The prompts set up, and the lines they queued.', depths: ['full'],
    summaryNote: '', fullNote: 'One row per warning setting, and per line on the warning list.' },
  { id: 'notices', group: 'system', label: 'Notifications', blurb: 'The notices shown on the Notifications tab.', depths: ['full'],
    summaryNote: '', fullNote: 'One row per notice.' },
  { id: 'sync', group: 'system', label: 'Outbox and card attempts', blurb: 'Sales waiting to upload, and every card attempt on this device.', depths: ['full'],
    summaryNote: '', fullNote: 'One row per queued sale and per card attempt.' },
  { id: 'raw', group: 'system', label: 'Raw history files', blurb: 'The CSV files this device writes itself, exactly as saved.', depths: ['full'],
    summaryNote: '', fullNote: 'One sheet per file: sales, sale lines and events.' },
];

export const topicById = (id: ExportTopicId): ExportTopic => EXPORT_TOPICS.find(t => t.id === id)!;

/** What to build: a topic and the depth to build it at. */
export type ExportSelection = { topic: ExportTopicId; depth: ExportDepth }[];

/** A raw history file, read from disk by exportCollect.ts. */
export type RawHistoryFile = { name: string; text: string };

/** Everything the tables are built from. Plain data: the store slices and the read-only history files. */
export type ExportInput = {
  now: string;
  shopName: string;
  registerName: string;
  registerId: string;
  sales: SaleRecord[];
  variants: Record<string, Variant>;
  collections: Collection[];
  customers: Customer[];
  autos: AutoDiscount[];
  presets: ManualPreset[];
  bundles: BundleDeal[];
  outbox: OutboxItem[];
  attempts: Attempt[];
  notices: Notice[];
  rollups: Record<string, Totals>;
  shift: Shift;
  ledger: CashLedger;
  saved: SavedCart[];
  cartWarnings: CartWarnings;
  warningList: WarningList;
  rawFiles: RawHistoryFile[];
};

// ── small helpers ────────────────────────────────────────────────────────────
const money = (c: number) => toDecimal(Math.round(c || 0));
const num = (v: number) => String(v ?? 0);
const bool = (v: boolean) => (v ? 'yes' : 'no');
const dayOf = (ts: string) => (ts || '').slice(0, 10);
const saleSign = (r: SaleRecord) => (r.type === 'refund' ? -1 : 1);
const tenderText = (r: SaleRecord) => r.tenders.map(t => `${t.kind}:${money(t.amountCents)}`).join(' + ');
const collectionsOfProduct = (collections: Collection[]): Map<string, string[]> => {
  const m = new Map<string, string[]>();
  for (const c of collections) for (const pid of c.productIds) { const list = m.get(pid) ?? []; if (!list.includes(c.title)) list.push(c.title); m.set(pid, list); }
  return m;
};

// ── transactions ─────────────────────────────────────────────────────────────
function transactions(input: ExportInput, depth: ExportDepth): Sheet {
  if (depth === 'summary') {
    const rows = input.sales.map(r => [r.uuid, r.ts, r.type, r.registerName || r.registerId, r.staff ?? '', r.customer?.name ?? '',
      num(r.lines.reduce((s, l) => s + l.qty, 0)), money(r.itemsCents), money(r.discountCents), money(r.netCents),
      money(r.tipCents), money(saleSign(r) * r.totalCents), money(r.cogsCents), money(r.feesCents), money(r.roundingCents),
      tenderText(r), r.orderName ?? '', r.note ?? '']);
    return { name: 'transactions', header: ['uuid', 'timestamp', 'type', 'register', 'staff', 'customer', 'items', 'gross', 'discount', 'net', 'tip', 'total', 'cogs', 'fees', 'rounding', 'tenders', 'order', 'note'], rows };
  }
  const rows: string[][] = [];
  input.sales.forEach(r => r.lines.forEach((l, i) => rows.push([r.uuid, r.ts, r.type, num(i + 1), l.kind, l.title, l.variantTitle ?? '', l.variantId ?? '',
    num(l.qty), money(l.baseUnitCents), money(l.grossCents), money(l.discountCents), money(l.netCents), money(l.costCents),
    l.discountLabels.join('; '), l.note ?? '', (l.collectionTitles ?? []).join('; '), r.orderName ?? ''])));
  return { name: 'transactions_lines', header: ['sale_uuid', 'timestamp', 'type', 'line', 'kind', 'title', 'variant', 'variant_id', 'qty', 'unit', 'gross', 'discount', 'net', 'cogs', 'discounts', 'note', 'categories', 'order'], rows };
}

// ── item and category sales ──────────────────────────────────────────────────
type ItemAgg = { title: string; variant: string; sku: string; categories: Set<string>; qty: number; gross: number; discount: number; net: number; cogs: number; order: number };
function aggregateItems(input: ExportInput): ItemAgg[] {
  const cols = collectionsOfProduct(input.collections);
  const byVariant = new Map<string, ItemAgg>();
  let order = 0;
  for (const r of input.sales) for (const l of r.lines) {
    if (l.kind === 'gift_card') continue;
    const key = l.variantId || `custom:${l.title}`;
    const v = l.variantId ? input.variants[l.variantId] : undefined;
    let a = byVariant.get(key);
    if (!a) { a = { title: l.title, variant: l.variantTitle ?? '', sku: v?.sku ?? '', categories: new Set(), qty: 0, gross: 0, discount: 0, net: 0, cogs: 0, order: order++ }; byVariant.set(key, a); }
    const sign = saleSign(r);
    a.qty += sign * l.qty; a.gross += sign * l.grossCents; a.discount += sign * l.discountCents; a.net += sign * l.netCents; a.cogs += sign * l.costCents;
    for (const c of l.collectionTitles ?? []) a.categories.add(c);
    if (v) for (const c of cols.get(v.productId) ?? []) a.categories.add(c);
  }
  return [...byVariant.values()].sort((a, b) => b.net - a.net || a.order - b.order);
}
function items(input: ExportInput, depth: ExportDepth): Sheet {
  if (depth === 'summary') {
    const rows = aggregateItems(input).map(a => [a.title, a.variant, a.sku, [...a.categories].join('; '), num(a.qty), money(a.gross), money(a.discount), money(a.net), money(a.cogs)]);
    return { name: 'item_sales', header: ['item', 'variant', 'sku', 'categories', 'qty', 'gross', 'discount', 'net', 'cogs'], rows };
  }
  const rows: string[][] = [];
  for (const r of input.sales) r.lines.forEach((l, i) => { if (l.kind === 'gift_card') return;
    rows.push([r.uuid, r.ts, r.type, num(i + 1), l.title, l.variantTitle ?? '', l.variantId ?? '', (l.collectionTitles ?? []).join('; '),
      money(l.baseUnitCents), num(l.qty), money(l.grossCents), money(l.discountCents), money(l.netCents), money(l.costCents), l.discountLabels.join('; '), l.note ?? '']); });
  return { name: 'item_sales_lines', header: ['sale_uuid', 'timestamp', 'type', 'line', 'item', 'variant', 'variant_id', 'categories', 'unit', 'qty', 'gross', 'discount', 'net', 'cogs', 'discounts', 'note'], rows };
}

// ── discounts and price adjustments ──────────────────────────────────────────
function discounts(input: ExportInput, depth: ExportDepth): Sheet {
  if (depth === 'summary') {
    const byLabel = new Map<string, { type: string; times: number; cents: number; order: number }>();
    let order = 0;
    for (const r of input.sales) for (const d of r.deals) {
      const key = `${d.type}|${d.label}`;
      let a = byLabel.get(key);
      if (!a) { a = { type: d.type, times: 0, cents: 0, order: order++ }; byLabel.set(key, a); }
      a.times += d.times ?? 1; a.cents += d.cents;
    }
    const rows = [...byLabel.entries()].sort((a, b) => Math.abs(b[1].cents) - Math.abs(a[1].cents) || a[1].order - b[1].order)
      .map(([key, a]) => [key.split('|')[1], a.type, num(a.times), money(a.cents)]);
    return { name: 'discounts', header: ['label', 'type', 'times', 'amount'], rows };
  }
  const rows: string[][] = [];
  for (const r of input.sales) for (const d of r.deals) rows.push([r.uuid, r.ts, r.type, 'discount', d.type, d.label, num(d.times ?? 1), money(saleSign(r) * d.cents), d.id ?? '']);
  for (const r of input.sales) for (const l of r.lines) for (const label of l.discountLabels) rows.push([r.uuid, r.ts, r.type, 'line discount', 'line', label, '1', '', l.title]);
  for (const r of input.sales) for (const a of r.adjustments ?? []) rows.push([r.uuid, r.ts, r.type, 'adjustment', a.kind, reasonLabel(a.reason ?? ''), '1', money(a.cents), a.title || a.detail]);
  rows.sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
  return { name: 'discounts_lines', header: ['sale_uuid', 'timestamp', 'type', 'source', 'kind', 'label', 'times', 'amount', 'detail'], rows };
}

// ── gift cards ───────────────────────────────────────────────────────────────
function giftCards(input: ExportInput, depth: ExportDepth): Sheet {
  if (depth === 'summary') {
    const m = new Map<string, { sold: number; soldCents: number; redeemed: number; redeemedCents: number }>();
    for (const r of input.sales) {
      const day = dayOf(r.ts);
      const a = m.get(day) ?? { sold: 0, soldCents: 0, redeemed: 0, redeemedCents: 0 };
      const sign = saleSign(r);
      for (const l of r.lines) if (l.kind === 'gift_card') { a.sold += sign; a.soldCents += sign * l.netCents; }
      for (const t of r.tenders) if (t.kind === 'gift_card') { a.redeemed += sign; a.redeemedCents += sign * t.amountCents; }
      m.set(day, a);
    }
    const rows = [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, a]) => [day, num(a.sold), money(a.soldCents), num(a.redeemed), money(a.redeemedCents)]);
    return { name: 'gift_cards', header: ['date', 'cards_sold', 'value_sold', 'cards_redeemed', 'value_redeemed'], rows };
  }
  const rows: string[][] = [];
  for (const r of input.sales) {
    for (const l of r.lines) if (l.kind === 'gift_card') rows.push([r.ts, 'sold', r.uuid, l.giftCardCode ?? '', l.giftRecipient?.email ?? '', money(saleSign(r) * l.netCents)]);
    for (const t of r.tenders) if (t.kind === 'gift_card') rows.push([r.ts, 'redeemed', r.uuid, '', '', money(saleSign(r) * t.amountCents)]);
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  return { name: 'gift_cards_lines', header: ['timestamp', 'what', 'sale_uuid', 'code', 'recipient', 'amount'], rows };
}

// ── cash ─────────────────────────────────────────────────────────────────────
function cash(input: ExportInput, depth: ExportDepth): Sheet {
  if (depth === 'summary') {
    const s = input.shift;
    const rows: string[][] = [
      ['drawer_open', bool(!!s.open), ''],
      ['opened_at', '', s.openedAt ?? ''],
      ['float', '', money(s.floatCents)],
      ['paid_in', '', money(s.paidInCents)],
      ['paid_out', '', money(s.paidOutCents)],
      ['expected_in_drawer', '', money(totalOf(input.ledger.counts))],
      ['ledger_entries', num(input.ledger.entries.length), ''],
    ];
    for (const [v, n] of Object.entries(input.ledger.counts).sort((a, b) => Number(b[0]) - Number(a[0]))) rows.push([`${denomLabel(Number(v))} in drawer`, num(n), money(Number(v) * n)]);
    const byKind = new Map<string, { count: number; cents: number }>();
    for (const e of input.ledger.entries) { const a = byKind.get(e.kind) ?? { count: 0, cents: 0 }; a.count += 1; a.cents += totalOf(e.delta); byKind.set(e.kind, a); }
    for (const [kind, a] of [...byKind.entries()].sort((x, y) => x[0].localeCompare(y[0]))) rows.push([LEDGER_LABEL[kind as keyof typeof LEDGER_LABEL] ?? kind, num(a.count), money(a.cents)]);
    return { name: 'cash_drawer', header: ['item', 'count', 'amount'], rows };
  }
  const rows = input.ledger.entries.map(e => [e.ts, e.kind, money(totalOf(e.delta)), summariseCounts(e.delta), e.staff ?? '', e.note ?? '', e.saleUuid ?? '']);
  return { name: 'cash_ledger', header: ['timestamp', 'kind', 'amount', 'contents', 'staff', 'note', 'sale_uuid'], rows };
}

// ── inventory changes ────────────────────────────────────────────────────────
type InvAgg = { title: string; variant: string; sku: string; sold: number; returned: number };
function inventory(input: ExportInput, depth: ExportDepth): Sheet {
  const agg = new Map<string, InvAgg>();
  const movements: string[][] = [];
  for (const r of input.sales) for (const l of r.lines) {
    if (l.kind === 'gift_card' || !l.variantId) continue;
    const v = input.variants[l.variantId];
    let a = agg.get(l.variantId);
    if (!a) { a = { title: l.title, variant: l.variantTitle ?? '', sku: v?.sku ?? '', sold: 0, returned: 0 }; agg.set(l.variantId, a); }
    if (r.type === 'refund') a.returned += l.qty; else a.sold += l.qty;
    movements.push([r.ts, r.type, r.uuid, l.title, l.variantTitle ?? '', v?.sku ?? '', num(r.type === 'refund' ? l.qty : -l.qty)]);
  }
  if (depth === 'summary') {
    const rows = [...agg.entries()].map(([id, a]) => { const v = input.variants[id]; return [a.title, a.variant, a.sku, bool(!!v?.tracked), v && v.stock !== null ? num(v.stock) : '', num(a.sold), num(a.returned), num(a.returned - a.sold)]; })
      .sort((a, b) => Number(b[4] || 0) - Number(a[4] || 0) || a[0].localeCompare(b[0]));
    return { name: 'inventory', header: ['item', 'variant', 'sku', 'tracked', 'stock_now', 'units_sold', 'units_returned', 'net_change'], rows };
  }
  movements.sort((a, b) => a[0].localeCompare(b[0]));
  return { name: 'inventory_changes', header: ['timestamp', 'type', 'sale_uuid', 'item', 'variant', 'sku', 'qty_change'], rows: movements };
}

// ── catalogue ────────────────────────────────────────────────────────────────
function catalogue(input: ExportInput, depth: ExportDepth): Sheet {
  const all = Object.values(input.variants);
  if (depth === 'summary') {
    const rows = [
      ['variants', num(all.length), ''], ['products', num(new Set(all.map(v => v.productId)).size), ''], ['collections', num(input.collections.length), ''],
      ['sellable', num(all.filter(v => v.active).length), ''], ['draft_or_archived', num(all.filter(v => !v.active).length), ''],
      ['tracked', num(all.filter(v => v.tracked).length), ''], ['untracked', num(all.filter(v => !v.tracked).length), ''],
      ['out_of_stock', num(all.filter(v => v.tracked && (v.stock ?? 0) === 0).length), ''],
      ['negative_stock', num(all.filter(v => (v.stock ?? 0) < 0).length), ''],
      ['retail_value_on_hand', '', money(all.reduce((s, v) => s + v.priceCents * Math.max(0, v.stock ?? 0), 0))],
    ];
    return { name: 'catalogue_summary', header: ['item', 'count', 'amount'], rows };
  }
  const cols = collectionsOfProduct(input.collections);
  const rows = Object.values(input.variants).map(v => [v.id, v.productId, v.productTitle, v.variantTitle ?? '', v.sku ?? '', v.barcode ?? '', money(v.priceCents),
    v.compareAtCents === undefined ? '' : money(v.compareAtCents), v.costCents === undefined ? '' : money(v.costCents), bool(v.tracked),
    v.stock === null ? '' : num(v.stock), v.status ?? (v.active ? 'ACTIVE' : 'ARCHIVED'), v.tags.join('; '), (cols.get(v.productId) ?? []).join('; '), v.updatedAt ?? '']);
  return { name: 'catalogue', header: ['variant_id', 'product_id', 'product', 'variant', 'sku', 'barcode', 'price', 'compare_at', 'cost', 'tracked', 'stock', 'status', 'tags', 'collections', 'updated_at'], rows };
}

// ── customers ────────────────────────────────────────────────────────────────
function customers(input: ExportInput, depth: ExportDepth): Sheet {
  const c = input.customers;
  if (depth === 'summary') {
    const rows = [['customers', num(c.length), ''], ['with_email', num(c.filter(x => !!x.email).length), ''], ['with_phone', num(c.filter(x => !!x.phone).length), ''],
      ['orders', num(c.reduce((s, x) => s + (x.orders ?? 0), 0)), ''], ['spent', '', money(c.reduce((s, x) => s + (x.spentCents ?? 0), 0))]];
    return { name: 'customers_summary', header: ['item', 'count', 'amount'], rows };
  }
  const rows = [...c].sort((a, b) => (b.spentCents ?? 0) - (a.spentCents ?? 0)).map(x => [x.id, x.name, x.email ?? '', x.phone ?? '', num(x.orders ?? 0), money(x.spentCents ?? 0), x.note ?? '']);
  return { name: 'customers', header: ['id', 'name', 'email', 'phone', 'orders', 'spent', 'note'], rows };
}

// ── sales by team member ─────────────────────────────────────────────────────
function staff(input: ExportInput, depth: ExportDepth): Sheet {
  if (depth === 'summary') {
    const m = new Map<string, { sales: number; refunds: number; gross: number; net: number }>();
    for (const r of input.sales) { const k = r.staff?.trim() || 'Unattributed'; const a = m.get(k) ?? { sales: 0, refunds: 0, gross: 0, net: 0 };
      if (r.type === 'sale') { a.sales += 1; a.gross += r.itemsCents; a.net += r.netCents; } else { a.refunds += 1; a.net -= r.netCents; } m.set(k, a); }
    const rows = [...m.entries()].sort((a, b) => b[1].net - a[1].net).map(([name, a]) => [name, num(a.sales), num(a.refunds), money(a.gross), money(a.net)]);
    return { name: 'staff_sales', header: ['team_member', 'sales', 'refunds', 'gross', 'net'], rows };
  }
  const m = new Map<string, { sales: number; net: number }>();
  for (const r of input.sales) { const k = `${dayOf(r.ts)}|${r.staff?.trim() || 'Unattributed'}`; const a = m.get(k) ?? { sales: 0, net: 0 };
    if (r.type === 'sale') { a.sales += 1; a.net += r.netCents; } else a.net -= r.netCents; m.set(k, a); }
  const rows = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, a]) => [k.split('|')[0], k.split('|')[1], num(a.sales), money(a.net)]);
  return { name: 'staff_sales_daily', header: ['date', 'team_member', 'sales', 'net'], rows };
}

// ── daily totals ─────────────────────────────────────────────────────────────
const rollupRows = (input: ExportInput): { registerId: string; date: string; totals: Totals }[] => {
  const out: { registerId: string; date: string; totals: Totals }[] = [];
  for (const [key, totals] of Object.entries(input.rollups)) { const i = key.indexOf('|'); out.push({ registerId: i < 0 ? key : key.slice(0, i), date: i < 0 ? '' : key.slice(i + 1), totals }); }
  return out;
};
const totalsLine = (date: string, registerId: string, t: Totals): string[] => {
  const d = derived(t);
  return [date, registerId, num(t.orders), num(t.refunds), money(d.grossSales), money(d.discounts), money(d.refunds), money(d.netSales), money(t.tipsCents), money(d.totalCollected), money(t.feesCents), money(t.cogsCents)];
};
const TOTALS_HEADER = ['date', 'register', 'sales', 'refunds', 'gross', 'discounts', 'returns', 'net', 'tips', 'collected', 'fees', 'cogs'];
function rollups(input: ExportInput, depth: ExportDepth): Sheet {
  const rows = rollupRows(input);
  if (depth === 'summary') {
    const byDay = new Map<string, Totals>();
    for (const r of rows) { const prev = byDay.get(r.date); byDay.set(r.date, prev ? addTotals(prev, r.totals) : r.totals); }
    const out = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, t]) => totalsLine(date, '', t).filter((_, i) => i !== 1));
    return { name: 'daily_totals', header: TOTALS_HEADER.filter((_, i) => i !== 1), rows: out };
  }
  const out = rows.sort((a, b) => a.date.localeCompare(b.date) || a.registerId.localeCompare(b.registerId)).map(r => totalsLine(r.date, r.registerId, r.totals));
  return { name: 'daily_totals_by_register', header: TOTALS_HEADER, rows: out };
}
/** Add two Totals without pulling in the rollup merge: only the fields the export prints. */
function addTotals(a: Totals, b: Totals): Totals {
  const pick = (x: Totals, y: Totals): Totals => ({
    orders: x.orders + y.orders, refunds: x.refunds + y.refunds, itemsCents: x.itemsCents + y.itemsCents, discountsCents: x.discountsCents + y.discountsCents,
    returnsCents: x.returnsCents + y.returnsCents, giftCardSalesCents: x.giftCardSalesCents + y.giftCardSalesCents, otherRefundsCents: x.otherRefundsCents + y.otherRefundsCents,
    tipsCents: x.tipsCents + y.tipsCents, feesCents: x.feesCents + y.feesCents, cogsCents: x.cogsCents + y.cogsCents, roundingCents: x.roundingCents + y.roundingCents,
    tenders: {}, refundTenders: {}, byCategory: {}, byItem: {}, applied: [], byAdjustReason: {}, byStaff: {},
  });
  return pick(a, b);
}

// ── saved carts ──────────────────────────────────────────────────────────────
const cartValue = (s: SavedCart): number => (s.cart.lines ?? []).reduce((sum, l) => sum + l.qty * (l.overrideCents ?? l.unitCents), 0);
function saved(input: ExportInput, depth: ExportDepth): Sheet {
  if (depth === 'summary') {
    const open = input.saved.filter(c => c.status === 'open');
    const voided = input.saved.filter(c => c.status === 'void');
    const sum = (list: SavedCart[]) => list.reduce((s, c) => s + cartValue(c), 0);
    const rows = [['open', num(open.length), money(sum(open))], ['void', num(voided.length), money(sum(voided))], ['total', num(input.saved.length), money(sum(input.saved))]];
    return { name: 'saved_carts_summary', header: ['item', 'count', 'amount'], rows };
  }
  const rows = input.saved.map(c => [c.id, c.name, c.status, c.employee ?? '', c.ts, c.assignedTo ?? '', c.cart.customer?.name ?? '',
    num((c.cart.lines ?? []).reduce((s, l) => s + l.qty, 0)), money(cartValue(c)), c.note ?? '']);
  return { name: 'saved_carts', header: ['id', 'name', 'status', 'employee', 'saved_at', 'assigned_to', 'customer', 'items', 'value_before_discounts', 'note'], rows };
}

// ── cart warnings and the warning list ───────────────────────────────────────
function warnings(input: ExportInput, _depth: ExportDepth): Sheet {
  const rows: string[][] = [];
  for (const w of input.warningList) rows.push(['list', w.ts, w.title, w.message, w.items.join('; '), w.staff ?? '', w.register ?? '', w.warningId]);
  for (const w of input.cartWarnings) rows.push(['setting', '', w.title, w.body, `${w.scope}${w.targetId ? ` (${w.targetId})` : ''}`, bool(w.enabled), `${w.mode ?? 'charge'}${w.requireAcknowledgement ? ', acknowledgement' : ''}${w.alwaysShow ? ', always shows' : ''}${w.order !== undefined ? `, order ${w.order}` : ''}`, w.id]);
  return { name: 'cart_warnings', header: ['source', 'timestamp', 'title', 'message', 'scope_or_items', 'staff', 'register_or_state', 'id'], rows };
}

// ── notices ──────────────────────────────────────────────────────────────────
function notices(input: ExportInput): Sheet {
  const rows = input.notices.map(n => [n.ts, n.kind, n.title, n.body ?? '', n.route ?? '', bool(!!n.read)]);
  return { name: 'notifications', header: ['timestamp', 'kind', 'title', 'body', 'route', 'read'], rows };
}

// ── outbox and card attempts ─────────────────────────────────────────────────
function sync(input: ExportInput): Sheet {
  const rows: string[][] = [];
  for (const o of input.outbox) { const done = Object.entries(o.done).filter(([, v]) => v).map(([k]) => k).join('; ');
    rows.push(['outbox', o.id, o.queuedAt, o.sale.uuid, money(o.sale.totalCents), num(o.tries), bool(!!o.blocked), o.error ?? '', done]); }
  for (const a of input.attempts) rows.push(['attempt', a.ref, a.ts, a.saleUuid, money(a.amountCents), '', '', a.note ?? '', `${a.status}${a.resolvedBy ? ` (${a.resolvedBy})` : ''}`]);
  return { name: 'outbox_and_attempts', header: ['source', 'id', 'timestamp', 'sale_uuid', 'amount', 'tries', 'blocked', 'error_or_note', 'detail'], rows };
}

// ── raw history files ────────────────────────────────────────────────────────
function rawSheets(input: ExportInput): Sheet[] {
  return input.rawFiles.map(f => {
    const lines = f.text.replace(/\r\n?/g, '\n').split('\n').filter(l => l.length > 0);
    const header = splitCsv(lines.shift() ?? '');
    return { name: f.name.replace(/\.csv$/i, ''), header, rows: lines.map(splitCsv) };
  });
}
/** A tiny CSV row reader that understands quotes, so a raw row keeps its shape. */
function splitCsv(line: string): string[] {
  const out: string[] = []; let cur = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false; } else cur += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// ── the switchboard ──────────────────────────────────────────────────────────
/** Build every table the selection asks for, in order. A topic without the asked depth is skipped. */
export function buildSheets(input: ExportInput, selection: ExportSelection): Sheet[] {
  const out: Sheet[] = [];
  for (const s of selection) {
    const topic = EXPORT_TOPICS.find(t => t.id === s.topic);
    if (!topic || !topic.depths.includes(s.depth)) continue;
    if (s.topic === 'raw') out.push(...rawSheets(input));
    else out.push(buildOne(input, s.topic, s.depth));
  }
  return out;
}
function buildOne(input: ExportInput, topic: Exclude<ExportTopicId, 'raw'>, depth: ExportDepth): Sheet {
  switch (topic) {
    case 'transactions': return transactions(input, depth);
    case 'items': return items(input, depth);
    case 'discounts': return discounts(input, depth);
    case 'giftcards': return giftCards(input, depth);
    case 'cash': return cash(input, depth);
    case 'inventory': return inventory(input, depth);
    case 'catalogue': return catalogue(input, depth);
    case 'customers': return customers(input, depth);
    case 'staff': return staff(input, depth);
    case 'rollups': return rollups(input, depth);
    case 'saved': return saved(input, depth);
    case 'warnings': return warnings(input, depth);
    case 'notices': return notices(input);
    case 'sync': return sync(input);
  }
}

// ── CSV and the workbook index ───────────────────────────────────────────────
/** A whole sheet as CSV text: a header row, then every row. Fields are quoted only when they must be. */
export function sheetToCsv(sheet: Sheet): string {
  const field = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [sheet.header, ...sheet.rows].map(r => r.map(field).join(',')).join('\n') + '\n';
}
/** A first sheet that says what is in the workbook, and when it was made. */
export function buildIndexSheet(sheets: Sheet[], meta: { when: string; shop: string; register: string }): Sheet {
  const rows = [
    ['Made', meta.when],
    ['Shop', meta.shop],
    ['Register', meta.register],
    ['Sheets', num(sheets.length)],
    ['', ''],
    ['sheet', 'columns', 'rows'],
    ...sheets.map(s => [s.name, num(s.header.length), num(s.rows.length)]),
  ];
  return { name: 'Index', header: ['Report export', 'Value'], rows };
}
