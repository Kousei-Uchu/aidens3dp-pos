// Location: src/lib/drawerBanking.ts
// 0228: which cash takings are still to be taken out of the drawer, and what happens to that when the drawer closes, opens or is banked.
// `Shift.collectSince` is the time from which cash sales have not been taken out yet. It is kept across closing and opening, so the
// float report the next day still sees the whole period (before this it asked for "today" once the drawer was closed, and showed $0).
// Pure, tested in tests/drawerbanking.test.ts. Integer cents, ISO times.
import type { Shift } from '../state/store';
import { loanOwed, repayLoan } from './drawerLoan';

const startOfDay = (now: number): string => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.toISOString(); };

/** From when the takings still to be taken out run: since the last banking or close, else since the drawer opened, else the start of today (old data). */
export const takingsSince = (s: Shift, now: number = Date.now()): string => s.collectSince ?? (s.open && s.openedAt ? s.openedAt : startOfDay(now));

/**
 * The shift after the drawer is counted and closed. The period's takings and any loan still owed stay marked as not yet taken out, so the
 * banking step that follows (or a later float report, if it is put off) still sees them.
 */
export const closedShift = (s: Shift): Shift => {
  const since = s.collectSince ?? s.openedAt; const loan = loanOwed(s);
  return { open: false, floatCents: 0, paidInCents: 0, paidOutCents: 0, ...(since ? { collectSince: since } : {}), ...(loan ? { loanCents: loan } : {}) };
};

/** A newly opened shift, carrying over takings and a loan the last one left behind (a put-off banking), so they are not lost by opening again. */
export const openedShift = (before: Shift, o: { openedAt: string; floatCents: number; staff?: string }): Shift => {
  const loan = loanOwed(before);
  return { open: true, openedAt: o.openedAt, floatCents: o.floatCents, paidInCents: 0, paidOutCents: 0, staff: o.staff, ...(before.collectSince ? { collectSince: before.collectSince } : {}), ...(loan ? { loanCents: loan } : {}) };
};

/**
 * The shift after `takenOut` cents were banked. `loanBack` of that was the loan (it comes off what is owed) and everything before `nowISO` counts as taken out.
 * An open shift also counts the take-out as paid out, as a paid out always has.
 */
export const bankedShift = (s: Shift, o: { takenOut: number; loanBack: number; nowISO: string }): Shift => {
  const repaid = repayLoan(s, o.loanBack);
  return { ...repaid, collectSince: o.nowISO, ...(s.open ? { paidOutCents: s.paidOutCents + o.takenOut } : {}) };
};
