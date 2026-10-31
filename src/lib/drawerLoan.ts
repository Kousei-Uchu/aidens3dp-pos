// Location: src/lib/drawerLoan.ts
// A loan to the drawer: cash you put in that is yours to take back out at the end (0188).
// A loan is an ordinary "paid in", so the expected cash still adds up; this only remembers how much of the paid-in is owed
// back to you, and takes it down when you pay it out again. Integer cents, pure, unit-tested in tests/drawerloan.test.ts.
import type { Shift } from '../state/store';

const whole = (cents: number): number => (Number.isFinite(cents) ? Math.max(0, Math.round(cents)) : 0);

/** How much of what was paid in is still owed back to you. */
export const loanOwed = (s: Pick<Shift, 'loanCents'>): number => whole(s.loanCents ?? 0);

/** The shift after `cents` more was put in as a loan. The caller adds the same amount to `paidInCents`. */
export const addLoan = (s: Shift, cents: number): Shift => ({ ...s, loanCents: loanOwed(s) + whole(cents) });

/** The shift after `cents` of the loan was taken back out. Never goes below zero; at zero the field is dropped. */
export const repayLoan = (s: Shift, cents: number): Shift => {
  const left = Math.max(0, loanOwed(s) - whole(cents));
  const { loanCents: _gone, ...rest } = s; void _gone;
  return left ? { ...rest, loanCents: left } : rest;
};
