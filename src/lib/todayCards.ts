// Location: src/lib/todayCards.ts
// What the companion's Today tab shows, worked out from plain data so it can be tested. Pure, no React.
import type { Variant } from './types';
import { stockToneOf } from './lookup';

export type TodayInput = { variants: Pick<Variant, 'id' | 'productTitle' | 'variantTitle' | 'stock'>[]; outbox: { blocked?: boolean }[]; unread: number; role: string; /** Unread notices of kind 'cash': cash taken outside a drawer. */ cashFlags?: number };
export type TodayCards = { money: boolean; low: TodayInput['variants']; lowCount: number; stuck: number; queued: number; unread: number; cashFlags: number };
export const LOW_SHOWN = 5;

/** Money figures follow the Reports rule: a cashier never sees them. Low stock is the same three tones the stock dot uses (low, out, oversold), worst first. */
export function todayCards(i: TodayInput): TodayCards {
  const low = i.variants.filter(v => ['low', 'out', 'neg'].includes(stockToneOf(v.stock))).sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0) || a.productTitle.localeCompare(b.productTitle));
  const stuck = i.outbox.filter(o => o.blocked).length;
  return { money: i.role !== 'cashier', low: low.slice(0, LOW_SHOWN), lowCount: low.length, stuck, queued: i.outbox.length - stuck, unread: i.unread, cashFlags: i.cashFlags ?? 0 };
}
