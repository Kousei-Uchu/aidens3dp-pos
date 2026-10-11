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
/** What the driver reads of the real app state. */
export function snapOf(s: { tab: string; route: string; cart: { lines: { qty: number }[]; customer?: unknown; tenders?: unknown[] }; sales: number; paying: boolean }): TrainSnap {
  return { tab: s.tab, route: s.route, lines: s.cart.lines.length, qty: s.cart.lines.reduce((n, l) => n + l.qty, 0), sales: s.sales, hasCustomer: !!s.cart.customer, tenders: s.cart.tenders?.length ?? 0, paying: s.paying };
}
