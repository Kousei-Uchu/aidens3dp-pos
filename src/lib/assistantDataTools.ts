// Location: src/lib/assistantDataTools.ts
// The assistant's shop data tools (patch 0163, patch 7 in the plan): sales_report, find_orders, list_deals, find_customers and
// gift_card_activity. Each one reads the snapshot in `ctx.data` and nothing else, so none of them can change anything. Each declares
// a field map that sorts every field it can return into a data category, and the data gate applies the endpoint rules to the result
// before the model sees it (assistantGate.ts). A tool also leaves out, at the source, anything the gate would remove, so a search
// never matches on a field the model may not read and an empty row never tells the model something exists.
//
// This file only imports types from assistantTools.ts (which imports the list from here), so there is no circular import at run time.
import { CATEGORY_INFO, FAIL_CLOSED_POLICY, type Category, type FieldMap } from './assistantGate';
import { findCustomers, findOrders, giftCardActivity, listDeals, PERIODS, salesReport } from './assistantData';
import type { AssistantTool, ToolContext } from './assistantTools';

const can = (ctx: Pick<ToolContext, 'policy'>, c: Category): boolean => (ctx.policy ?? FAIL_CLOSED_POLICY)[c] !== 'deny';
/** The same wording the gate uses, for when a tool leaves something out itself. */
const hiddenNote = (...cats: Category[]): string => `Hidden by the shop's privacy rules: ${cats.map(c => CATEGORY_INFO[c].phrase).join(', ')}. Say you cannot show that. Do not guess it.`;
const NO_DATA = { error: 'No shop data is available here.' };

// ---------- field maps ----------
const NAME_SOLD_SALES: FieldMap = { name: 'shop', sold: 'shop', sales: 'shop' };
export const SALES_REPORT_MAP: FieldMap = {
  from: 'shop', to: 'shop', orders: 'shop', refunds: 'shop', gross_sales: 'shop', discounts: 'shop', refunded: 'shop', net_sales: 'shop', average_sale: 'shop',
  gift_cards_sold: 'shop', tips: 'shop', total_collected: 'shop', card_fees: 'shop',
  cost_of_goods: 'cost', gross_profit: 'cost',
  takings: { method: 'shop', amount: 'shop' },
  top_items: NAME_SOLD_SALES, top_categories: NAME_SOLD_SALES,
  adjustments: { reason: 'shop', count: 'shop', amount: 'shop' },
  days: { date: 'shop', orders: 'shop', net: 'shop' },
  // staff names, and what each sold, are personal details
  staff: { name: 'personal', sales: 'personal', net: 'personal' },
  matches: NAME_SOLD_SALES, total_sold: 'shop', total_sales: 'shop',
};
export const ORDERS_MAP: FieldMap = {
  found: 'order',
  orders: {
    order: 'order', date: 'order', type: 'order', total: 'order', discount: 'order', more_items: 'order', refund_of: 'order', tip: 'order', note: 'order', reason: 'order',
    items: { name: 'order', qty: 'order', paid: 'order', discount: 'order', cost: 'cost', gift_card_code: 'gift_code' },
    customer: { name: 'personal', email: 'email', phone: 'personal' },
    staff: 'personal',
    // how an order was paid is a tender detail, which is never sent
    paid_with: 'payment',
    deals: { label: 'order', amount: 'order' },
    adjustments: { kind: 'order', title: 'order', amount: 'order', reason: 'order' },
  },
};
export const DEALS_MAP: FieldMap = {
  found: 'shop',
  deals: { name: 'shop', kind: 'shop', live: 'shop', how: 'shop', applies_to: 'shop', starts: 'shop', ends: 'shop', limit: 'shop' },
};
export const CUSTOMERS_MAP: FieldMap = {
  found: 'personal',
  customers: { name: 'personal', email: 'email', phone: 'personal', orders: 'personal', spent: 'personal', note: 'personal' },
};
export const GIFT_MAP: FieldMap = {
  found: 'order', total_sold: 'order', total_redeemed: 'order', from: 'order', to: 'order',
  activity: { at: 'order', event: 'order', amount: 'order', order: 'order', code: 'gift_code', recipient: { name: 'personal', email: 'email' } },
};

// ---------- tools ----------
const DATE_HELP = 'Dates are written like 2026-10-18.';
const salesReportTool: AssistantTool = {
  gate: SALES_REPORT_MAP,
  def: { type: 'function', function: {
    name: 'sales_report',
    description: 'Sales totals already added up for a period: orders, net sales, discounts, refunds, takings by payment method, top items and categories, cost and profit. Also answers how many of an item were sold, with item. Always use this instead of adding up orders yourself. Give a period, or from and to dates. Today if neither is given.',
    parameters: { type: 'object', properties: {
      period: { type: 'string', enum: [...PERIODS], description: 'A named period. Weeks start on Monday.' },
      from: { type: 'string', description: `First day. ${DATE_HELP}` },
      to: { type: 'string', description: 'Last day. Leave out for a single day.' },
      item: { type: 'string', description: 'An item name, or a word from it, to count sold instead of the full report.' },
    }, additionalProperties: false },
  } },
  run: (args, ctx) => (ctx.data ? salesReport(ctx.data, args, can(ctx, 'personal')) : NO_DATA),
};

const findOrdersTool: AssistantTool = {
  gate: ORDERS_MAP,
  def: { type: 'function', function: {
    name: 'find_orders',
    description: 'Find sales and refunds saved on this till, newest first. query is an order number such as 1042, or words from an item name or a customer name. Can limit by dates and by type. Set detail to true to also get the items, prices, deals, price adjustments and notes of up to 3 orders.',
    parameters: { type: 'object', properties: {
      query: { type: 'string', description: 'An order number, or words from an item or customer name.' },
      from: { type: 'string', description: `First day. ${DATE_HELP}` },
      to: { type: 'string', description: 'Last day. Leave out for a single day.' },
      period: { type: 'string', enum: [...PERIODS], description: 'A named period, used when from and to are not given.' },
      type: { type: 'string', enum: ['sale', 'refund'], description: 'Only sales, or only refunds.' },
      detail: { type: 'boolean', description: 'True to include items, deals, adjustments and notes.' },
    }, additionalProperties: false },
  } },
  run: (args, ctx) => (ctx.data ? findOrders(ctx.data, args, { personal: can(ctx, 'personal'), email: can(ctx, 'email') }) : NO_DATA),
};

const listDealsTool: AssistantTool = {
  gate: DEALS_MAP,
  def: { type: 'function', function: {
    name: 'list_deals',
    description: 'List the deals the till applies: bundle deals, automatic discounts and the manual discounts staff can choose. Says what each does, what it applies to, and whether it is running now. Use it for questions about what deals or discounts exist.',
    parameters: { type: 'object', properties: {
      query: { type: 'string', description: 'Words from a deal name or an item it applies to.' },
      only_live: { type: 'boolean', description: 'True to list only deals running now.' },
    }, additionalProperties: false },
  } },
  run: (args, ctx) => (ctx.data ? listDeals(ctx.data, args) : NO_DATA),
};

const findCustomersTool: AssistantTool = {
  gate: CUSTOMERS_MAP,
  def: { type: 'function', function: {
    name: 'find_customers',
    description: 'Find saved customers by name, email address or phone number. Returns their contact details, order count and what they have spent where the shop\'s privacy rules allow it.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'A name, an email address or a phone number.' } }, required: ['query'], additionalProperties: false },
  } },
  run: (args, ctx) => {
    if (!ctx.data) return NO_DATA;
    // Customers are never searched when neither their details nor their email may be sent: a match would say who is a customer.
    if (!can(ctx, 'personal') && !can(ctx, 'email')) return { customers: [], privacy_note: hiddenNote('personal') };
    return findCustomers(ctx.data, args, { personal: can(ctx, 'personal'), email: can(ctx, 'email') });
  },
};

const giftCardTool: AssistantTool = {
  gate: GIFT_MAP,
  def: { type: 'function', function: {
    name: 'gift_card_activity',
    description: 'Gift cards sold and gift card payments in the sales saved on this till. Can filter by the card code (at least the last 4 characters), by sold or redeemed, and by dates. It does not know a card\'s remaining balance: that is only on the Gift cards screen.',
    parameters: { type: 'object', properties: {
      code: { type: 'string', description: 'The gift card code, or at least its last 4 characters.' },
      kind: { type: 'string', enum: ['sold', 'redeemed'], description: 'Only cards sold, or only payments with a card.' },
      from: { type: 'string', description: `First day. ${DATE_HELP}` },
      to: { type: 'string', description: 'Last day. Leave out for a single day.' },
      period: { type: 'string', enum: [...PERIODS], description: 'A named period, used when from and to are not given.' },
    }, additionalProperties: false },
  } },
  run: (args, ctx) => (ctx.data ? giftCardActivity(ctx.data, args, { code: can(ctx, 'gift_code'), personal: can(ctx, 'personal'), email: can(ctx, 'email') }) : NO_DATA),
};

/** The data tools, in the order they are offered. */
export const DATA_TOOLS: AssistantTool[] = [salesReportTool, findOrdersTool, listDealsTool, findCustomersTool, giftCardTool];
