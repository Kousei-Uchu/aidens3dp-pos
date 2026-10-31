// Location: tests/drawerloan.test.ts
// 0188: a loan to the drawer is remembered when paid in and taken down when paid back out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { addLoan, loanOwed, repayLoan } from '../src/lib/drawerLoan';
import type { Shift } from '../src/state/store';

const shift = (o: Partial<Shift> = {}): Shift => ({ open: true, floatCents: 10000, paidInCents: 0, paidOutCents: 0, ...o });

test('no loan until one is put in', () => { assert.equal(loanOwed(shift()), 0); });
test('a loan adds up across several deposits', () => {
  const s = addLoan(addLoan(shift(), 5000), 2000);
  assert.equal(loanOwed(s), 7000);
});
test('paying part of it back leaves the rest owed', () => { assert.equal(loanOwed(repayLoan(addLoan(shift(), 5000), 2000)), 3000); });
test('paying back all of it drops the field', () => {
  const s = repayLoan(addLoan(shift(), 5000), 5000);
  assert.equal(loanOwed(s), 0); assert.equal('loanCents' in s, false);
});
test('taking out more than was loaned never goes below zero', () => { assert.equal(loanOwed(repayLoan(addLoan(shift(), 1000), 9000)), 0); });
test('other shift fields are untouched', () => {
  const s = addLoan(shift({ paidInCents: 5000, staff: 'Sam' }), 5000);
  assert.equal(s.paidInCents, 5000); assert.equal(s.staff, 'Sam'); assert.equal(s.floatCents, 10000);
});
test('junk amounts count as nothing', () => { assert.equal(loanOwed(addLoan(shift(), NaN)), 0); assert.equal(loanOwed(addLoan(shift(), -500)), 0); });
