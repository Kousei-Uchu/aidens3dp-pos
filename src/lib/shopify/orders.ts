// Location: src/lib/shopify/orders.ts
// Orders (Path B, research doc §4.5): priced locally, then created with orderCreate so the Zeller tender is recorded
// natively (gateway "Zeller", authorizationCode, receiptJson). Discounts are baked into line prices (orderCreate has no
// line discounts) and itemised in line properties + custom attributes. No tax is collected.
import { gql, throwUserErrors, type UserError } from './client';
import { CURRENCY, toDecimal } from '../money';
import { uid } from '../ids';
import { GATEWAY, buildOrderInput, saleTag, mapOrder, type OrderCtx, type PosOrder } from './orderModel';
import type { SaleRecord, Tender } from '../types';

export * from './orderModel';

export async function findOrderBySale(uuid: string): Promise<{ id: string; name: string } | null> {
  const d = await gql(`query($q:String){ orders(first: 1, query: $q) { nodes { id name } } }`, { q: `tag:${saleTag(uuid)}` });
  return d.orders.nodes[0] ?? null;
}

/** Idempotent: looks the sale up by its tag first, so a retry after a lost reply never double-books. */
export async function createOrderForSale(sale: SaleRecord, ctx: OrderCtx): Promise<{ id: string; name: string }> {
  const existing = await findOrderBySale(sale.uuid);
  if (existing) return existing;
  const run = async (input: ReturnType<typeof buildOrderInput>) => {
    const d = await gql(`mutation($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) { orderCreate(order: $order, options: $options) { order { id name } userErrors { field message } } }`, input);
    return d.orderCreate as { order: { id: string; name: string } | null; userErrors: UserError[] };
  };
  let input = buildOrderInput(sale, ctx);
  let res = await run(input);
  if (!res.order && input.order.fulfillment && res.userErrors.some(e => /fulfil/i.test(e.message) || e.field?.some(f => /fulfil/i.test(f)))) {
    const { fulfillment, ...rest } = input.order; void fulfillment;
    input = { ...input, order: rest }; // field unsupported on this API version → retry without it
    res = await run(input);
  }
  throwUserErrors(res.userErrors, 'Creating the Shopify order');
  if (!res.order) throw new Error('Shopify returned no order');
  return res.order;
}

const ORDER_FIELDS = `id name createdAt displayFinancialStatus displayFulfillmentStatus note tags
  totalPriceSet { shopMoney { amount } } totalRefundedSet { shopMoney { amount } }
  customer { id displayName email phone } customAttributes { key value }
  lineItems(first: 25) { nodes { id title variantTitle quantity refundableQuantity variant { id }
    originalUnitPriceSet { shopMoney { amount } } discountedUnitPriceSet { shopMoney { amount } } customAttributes { key value } } }
  transactions(first: 6) { id kind status gateway amountSet { shopMoney { amount } } }`;

export async function listOrders(opts: { query?: string; after?: string | null; first?: number } = {}): Promise<{ orders: PosOrder[]; next: string | null }> {
  const d = await gql(`query($q:String,$after:String,$first:Int!){ orders(first:$first, after:$after, query:$q, sortKey: CREATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor } nodes { ${ORDER_FIELDS} } } }`, { q: opts.query || null, after: opts.after ?? null, first: opts.first ?? 10 });
  return { orders: d.orders.nodes.map(mapOrder), next: d.orders.pageInfo.hasNextPage ? d.orders.pageInfo.endCursor : null };
}
export async function getOrder(id: string): Promise<PosOrder> {
  const d = await gql(`query($id:ID!){ order(id:$id){ ${ORDER_FIELDS} } }`, { id });
  return mapOrder(d.order);
}

export async function fulfillOrder(orderId: string) {
  const d = await gql(`query($id:ID!){ order(id:$id){ fulfillmentOrders(first: 10) { nodes { id status } } } }`, { id: orderId });
  const open = d.order.fulfillmentOrders.nodes.filter((n: any) => ['OPEN', 'IN_PROGRESS'].includes(n.status));
  if (!open.length) return;
  const r = await gql(`mutation($f: FulfillmentInput!){ fulfillmentCreate(fulfillment:$f){ fulfillment { id status } userErrors { field message } } }`,
    { f: { notifyCustomer: false, lineItemsByFulfillmentOrder: open.map((n: any) => ({ fulfillmentOrderId: n.id })) } });
  throwUserErrors(r.fulfillmentCreate.userErrors, 'Fulfilling the order');
}

// ── refunds (card part is refunded via Zeller BEFORE this runs) ──────────────
export type RefundItem = { lineItemId: string; quantity: number; restock: boolean };
export async function refundOrderInShopify(o: PosOrder, items: RefundItem[], amounts: Partial<Record<Tender['kind'], number>>, note: string, locationId: string | undefined, key = uid()) {
  const parent = (g: string) => (o.transactions.find(t => t.kind === 'SALE' && t.status === 'SUCCESS' && t.gateway === g) ?? o.transactions.find(t => t.kind === 'SALE'))?.id;
  const txs = (Object.entries(amounts) as [Tender['kind'], number][])
    .filter(([k, c]) => c > 0 && k !== 'exchange_credit')
    .map(([k, c]) => ({ orderId: o.id, parentId: parent(GATEWAY[k]), kind: 'REFUND', gateway: GATEWAY[k], amount: toDecimal(c) }));
  const input = {
    orderId: o.id, notify: false, note, currency: CURRENCY,
    refundLineItems: items.map(i => ({ lineItemId: i.lineItemId, quantity: i.quantity, restockType: i.restock && locationId ? 'RETURN' : 'NO_RESTOCK', ...(i.restock && locationId ? { locationId } : {}) })),
    ...(txs.length ? { transactions: txs } : {}),
  };
  const d = await gql(`mutation($i: RefundInput!){ refundCreate(input: $i) @idempotent(key: "${key}") { refund { id } userErrors { field message } } }`, { i: input });
  throwUserErrors(d.refundCreate.userErrors, 'Recording the refund in Shopify');
  return d.refundCreate.refund?.id as string | undefined;
}
