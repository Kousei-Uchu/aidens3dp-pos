// Location: src/lib/trainingConds.ts
// Decides whether a Guide step or a Check goal is finished. Pure.
import type { SavedSnap, TrainSnap, Until } from './trainingModule';

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
/** The practice saved carts, as plain snapshots training can read. A saved cart with no variant of its own (a custom amount) keeps its line out of `variants`. */
export const savedCartsOf = (list: readonly { id: string; name: string; cart: { lines: readonly { variantId?: string; qty: number }[] }; assignedTo?: string; status: 'open' | 'void'; employee?: string }[]): SavedSnap[] =>
  list.map(s => ({ id: s.id, name: s.name, variants: s.cart.lines.map(l => l.variantId).filter((x): x is string => !!x), qty: s.cart.lines.reduce((n, l) => n + l.qty, 0), assignedTo: s.assignedTo, status: s.status, employee: s.employee }));
export function snapOf(s: { tab: string; route: string; sheets?: number; staffId?: string; locked?: boolean; openLine?: string; sheet?: string; swap?: TrainSnap['swap']; reader?: TrainSnap['reader']; outbox?: TrainSnap['outbox']; stock?: TrainSnap['stock']; inv?: TrainSnap['inv']; payOpen?: TrainSnap['payOpen']; lastSaleKinds?: string[]; refund?: TrainSnap['refund']; lastGift?: TrainSnap['lastGift']; giftCode?: string; giftCheck?: TrainSnap['giftCheck']; lookupMode?: TrainSnap['lookupMode']; lookupResult?: TrainSnap['lookupResult']; saved?: TrainSnap['savedCarts']; savedNameDraft?: string; customerQuery?: string; noteDraft?: string; customerDraft?: TrainSnap['customerDraft']; priceDraft?: string; discountDraft?: string; cash?: TrainSnap['cash']; lastSaleCash?: TrainSnap['lastSaleCash']; typed?: TrainSnap['typed']; where?: TrainSnap['where']; cart: { lines: CartLike[]; customer?: { id?: string } | unknown; tenders?: unknown[]; discount?: unknown; orderAdjust?: unknown; note?: string; savedFrom?: string }; sales: number; paying: boolean }): TrainSnap {
  return {
    tab: s.tab, route: s.route, sheets: s.sheets ?? 0, lines: s.cart.lines.length, qty: s.cart.lines.reduce((n, l) => n + l.qty, 0), sales: s.sales,
    hasCustomer: !!s.cart.customer, customerId: (s.cart.customer as { id?: string } | undefined)?.id, customerQuery: s.customerQuery, noteDraft: s.noteDraft, customerDraft: s.customerDraft, priceDraft: s.priceDraft, discountDraft: s.discountDraft, orderAdjustCents: (s.cart.orderAdjust as { finalCents?: number } | undefined)?.finalCents, cash: s.cash, lastSaleCash: s.lastSaleCash, tenders: s.cart.tenders?.length ?? 0, paying: s.paying, staffId: s.staffId, locked: !!s.locked, typed: s.typed, where: s.where, openLine: s.openLine, stock: s.stock, inv: s.inv, sheet: s.sheet, payOpen: s.payOpen, lastSaleKinds: s.lastSaleKinds, refund: s.refund, lastGift: s.lastGift,
    cart: s.cart.lines.map(l => ({ variantId: l.variantId, title: l.title ?? '', kind: l.kind ?? 'item', qty: l.qty, discounted: !!l.discount, adjusted: !!l.adjust || l.overrideCents !== undefined, unitCents: l.unitCents, lineId: l.id, itemPriced: l.overrideCents !== undefined, overrideCents: l.overrideCents, overrideAll: !!l.overrideAll, adjustCents: (l.adjust as { finalCents?: number } | undefined)?.finalCents, lineAdjusted: !!l.adjust, noted: !!(l.note && l.note.trim()) })),
    cartDiscount: !!s.cart.discount, orderAdjusted: !!s.cart.orderAdjust, hasNote: !!(s.cart.note && s.cart.note.trim()), giftCode: s.giftCode, giftCheck: s.giftCheck,
    lookupMode: s.lookupMode, lookupResult: s.lookupResult, swap: s.swap, reader: s.reader, outbox: s.outbox,
    savedCarts: s.saved, savedNameDraft: s.savedNameDraft, cartSavedFrom: s.cart.savedFrom,
  };
}
