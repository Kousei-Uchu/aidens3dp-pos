// Location: src/lib/trainingOrders.ts
// Practice orders for the refund course (B6): a few made-up past sales kept in memory, so Orders and Refund work in practice without Shopify.
// Every id starts with "train-". Nothing here is saved or sent: leaving training (or starting a part again) puts the orders back as they were.
import type { PosOrder } from './shopify/orderModel';
import type { Tender } from './types';
import { TRAIN_PREFIX } from './trainingSandbox';

export type OrdersTab = 'open' | 'unfulfilled' | 'completed';

const P = TRAIN_PREFIX;
const WHEN = '2026-10-12T02:10:00.000Z';
const card = (id: string, cents: number): Tender => ({ id: `${P}t-${id}`, kind: 'card', amountCents: cents, at: WHEN, card: { externalReference: `${P}ref-${id}`, panMasked: 'XXXXXXXXXXXX0000', scheme: 'Visa' } });
const cash = (id: string, cents: number): Tender => ({ id: `${P}t-${id}`, kind: 'cash', amountCents: cents, at: WHEN });
const sale = (id: string, gateway: 'Zeller' | 'Cash', cents: number) => ({ id: `${P}tx-${id}`, kind: 'SALE', status: 'SUCCESS', gateway, amountCents: cents });

/** Three orders: Sam's, paid by card (a Highland Cow and two Dragon Eggs); Priya's, paid in cash (a Bumble Bee and two Keyrings); and a card order with a Red Dragon and a Sticker Pack. */
export function fixtureOrders(): PosOrder[] {
  return [
    { id: `${P}o-1001`, name: '#T1001', createdAt: WHEN, financial: 'PAID', fulfillment: 'UNFULFILLED', totalCents: 2400, refundedCents: 0, tags: ['pos'], customer: { id: `${P}cu-1`, name: 'Sam Rivera', email: 'sam@example.com' }, attrs: {}, roundingCents: 0,
      lines: [
        { id: `${P}ol-1001-a`, title: 'Highland Cow', variantTitle: 'Small', qty: 1, refundableQty: 1, unitCents: 1200, originalUnitCents: 1200, variantId: `${P}v-cow-s`, costCents: 400 },
        { id: `${P}ol-1001-b`, title: 'Dragon Egg', qty: 2, refundableQty: 2, unitCents: 600, originalUnitCents: 600, variantId: `${P}v-egg`, costCents: 200 },
      ], tenders: [card('1001', 2400)], transactions: [sale('1001', 'Zeller', 2400)] },
    { id: `${P}o-1002`, name: '#T1002', createdAt: WHEN, financial: 'PAID', fulfillment: 'FULFILLED', totalCents: 1800, refundedCents: 0, tags: ['pos'], customer: { id: `${P}cu-2`, name: 'Priya Patel', phone: '0400 000 111' }, attrs: {}, roundingCents: 0,
      lines: [
        { id: `${P}ol-1002-a`, title: 'Bumble Bee', qty: 1, refundableQty: 1, unitCents: 800, originalUnitCents: 800, variantId: `${P}v-bee`, costCents: 250 },
        { id: `${P}ol-1002-b`, title: 'Keyring', qty: 2, refundableQty: 2, unitCents: 500, originalUnitCents: 500, variantId: `${P}v-key`, costCents: 150 },
      ], tenders: [cash('1002', 1800)], transactions: [sale('1002', 'Cash', 1800)] },
    { id: `${P}o-1003`, name: '#T1003', createdAt: WHEN, financial: 'PAID', fulfillment: 'FULFILLED', totalCents: 2800, refundedCents: 0, tags: ['pos'], attrs: {}, roundingCents: 0,
      lines: [
        { id: `${P}ol-1003-a`, title: 'Red Dragon', qty: 1, refundableQty: 1, unitCents: 2500, originalUnitCents: 2500, variantId: `${P}v-dragon`, costCents: 900 },
        { id: `${P}ol-1003-b`, title: 'Sticker Pack', qty: 1, refundableQty: 1, unitCents: 300, originalUnitCents: 300, variantId: `${P}v-sticker`, costCents: 60 },
      ], tenders: [card('1003', 2800)], transactions: [sale('1003', 'Zeller', 2800)] },
  ];
}
export const PRACTICE_ORDER_CARD = `${P}o-1001`; export const PRACTICE_ORDER_CASH = `${P}o-1002`; export const PRACTICE_ORDER_CARD2 = `${P}o-1003`;
export const PRACTICE_ORDER_NAMES: Record<string, string> = { [PRACTICE_ORDER_CARD]: '#T1001', [PRACTICE_ORDER_CASH]: '#T1002', [PRACTICE_ORDER_CARD2]: '#T1003' };

/** What the last practice refund did, for the course to check. `n` counts the refunds made so far. */
export type PracticeRefund = { n: number; cents: number; restock: boolean; kinds: string[]; items: number; orderId: string };
type Held = { orders: PosOrder[]; last: PracticeRefund | undefined };
let orders: PosOrder[] = fixtureOrders(); let last: PracticeRefund | undefined; let count = 0;
const copy = (o: PosOrder[]): PosOrder[] => o.map(x => ({ ...x, lines: x.lines.map(l => ({ ...l })), transactions: x.transactions.map(t => ({ ...t })), tenders: x.tenders.map(t => ({ ...t })) }));

/** Puts every practice order back as new, and forgets the refunds. */
export function resetPracticeOrders(): void { orders = fixtureOrders(); last = undefined; count = 0; }
export const getLastPracticeRefund = (): PracticeRefund | undefined => last;
/** A copy of the practice orders and refund history, to be put back with `restorePracticeOrders` (used to start a Check goal again). */
export const capturePracticeOrders = (): Held => ({ orders: copy(orders), last: last ? { ...last, kinds: [...last.kinds] } : undefined });
export function restorePracticeOrders(h: Held): void { orders = copy(h.orders); last = h.last ? { ...h.last, kinds: [...h.last.kinds] } : undefined; count = last?.n ?? 0; }

/** The orders an Orders tab shows: Open is everything, Unfulfilled and Completed split on fulfilment. Newest first (they share a date, so the list keeps its order). */
export function listPracticeOrders(tab: OrdersTab): PosOrder[] {
  const fulfilled = (o: PosOrder) => /^fulfilled$/i.test(o.fulfillment);
  return copy(orders).filter(o => tab === 'open' || (tab === 'completed' ? fulfilled(o) : !fulfilled(o)));
}
export const getPracticeOrder = (id: string): PosOrder | undefined => copy(orders).find(o => o.id === id);
export function markPracticeFulfilled(id: string): void { orders = orders.map(o => (o.id === id ? { ...o, fulfillment: 'FULFILLED' } : o)); }

/** Records a refund on a practice order: what is left to refund goes down, the money is recorded against the gateway it went back to, and the course can see what happened. Does nothing for an order that is not a practice order. */
export function applyPracticeRefund(orderId: string, lines: { lineId: string; qty: number }[], done: Partial<Record<Tender['kind'], number>>, restock: boolean): void {
  const gateway = { card: 'Zeller', cash: 'Cash', gift_card: 'Gift card', exchange_credit: 'Exchange' } as const;
  let cents = 0; let items = 0;
  orders = orders.map(o => {
    if (o.id !== orderId) return o;
    const txs = (Object.entries(done) as [Tender['kind'], number][]).filter(([, c]) => c > 0).map(([k, c]) => { cents += c; return { id: `${TRAIN_PREFIX}tx-r${count + 1}-${k}`, kind: 'REFUND', status: 'SUCCESS', gateway: gateway[k], amountCents: c }; });
    for (const l of lines) items += l.qty;
    return { ...o, refundedCents: o.refundedCents + cents, financial: o.refundedCents + cents >= o.totalCents ? 'REFUNDED' : 'PARTIALLY_REFUNDED', transactions: [...o.transactions, ...txs], lines: o.lines.map(l => { const r = lines.find(x => x.lineId === l.id); return r ? { ...l, refundableQty: Math.max(0, l.refundableQty - r.qty) } : l; }) };
  });
  count += 1; last = { n: count, cents, restock, kinds: (Object.keys(done) as Tender['kind'][]).filter(k => (done[k] ?? 0) > 0), items, orderId };
}
