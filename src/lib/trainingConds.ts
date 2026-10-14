// Location: src/lib/trainingConds.ts
// Decides whether a Guide step or a Check goal is finished. Pure.
import type { TrainSnap, Until } from './trainingModule';

/** What happened since the step began: spots tapped, and spots currently on screen. */
export type Events = { pressed: ReadonlySet<string>; visible: ReadonlySet<string> };
export const noEvents = (): Events => ({ pressed: new Set(), visible: new Set() });
export function isMet(u: Until, snap: TrainSnap, ev: Events): boolean {
  switch (u.kind) {
    case 'next': return false;
    case 'press': return ev.pressed.has(u.id);
    case 'visible': return ev.visible.has(u.id);
    case 'state': try { return !!u.test(snap); } catch { return false; }
  }
}
/** What the driver reads of the real app state. The optional fields are what a plain test leaves out. */
type CartLike = { id?: string; variantId?: string; title?: string; kind?: 'item' | 'custom' | 'gift_card'; qty: number; discount?: unknown; adjust?: unknown; overrideCents?: number; overrideAll?: boolean; unitCents?: number; note?: string };
export function snapOf(s: { tab: string; route: string; sheets?: number; staffId?: string; locked?: boolean; openLine?: string; payOpen?: TrainSnap['payOpen']; lastSaleKinds?: string[]; refund?: TrainSnap['refund']; customerQuery?: string; noteDraft?: string; priceDraft?: string; cash?: TrainSnap['cash']; lastSaleCash?: TrainSnap['lastSaleCash']; typed?: TrainSnap['typed']; where?: TrainSnap['where']; cart: { lines: CartLike[]; customer?: { id?: string } | unknown; tenders?: unknown[]; discount?: unknown; orderAdjust?: unknown; note?: string }; sales: number; paying: boolean }): TrainSnap {
  return {
    tab: s.tab, route: s.route, sheets: s.sheets ?? 0, lines: s.cart.lines.length, qty: s.cart.lines.reduce((n, l) => n + l.qty, 0), sales: s.sales,
    hasCustomer: !!s.cart.customer, customerId: (s.cart.customer as { id?: string } | undefined)?.id, customerQuery: s.customerQuery, noteDraft: s.noteDraft, priceDraft: s.priceDraft, orderAdjustCents: (s.cart.orderAdjust as { finalCents?: number } | undefined)?.finalCents, cash: s.cash, lastSaleCash: s.lastSaleCash, tenders: s.cart.tenders?.length ?? 0, paying: s.paying, staffId: s.staffId, locked: !!s.locked, typed: s.typed, where: s.where, openLine: s.openLine, payOpen: s.payOpen, lastSaleKinds: s.lastSaleKinds, refund: s.refund,
    cart: s.cart.lines.map(l => ({ variantId: l.variantId, title: l.title ?? '', kind: l.kind ?? 'item', qty: l.qty, discounted: !!l.discount, adjusted: !!l.adjust || l.overrideCents !== undefined, unitCents: l.unitCents, lineId: l.id, itemPriced: l.overrideCents !== undefined, overrideCents: l.overrideCents, overrideAll: !!l.overrideAll, adjustCents: (l.adjust as { finalCents?: number } | undefined)?.finalCents, lineAdjusted: !!l.adjust, noted: !!(l.note && l.note.trim()) })),
    cartDiscount: !!s.cart.discount, orderAdjusted: !!s.cart.orderAdjust, hasNote: !!(s.cart.note && s.cart.note.trim()),
  };
}
