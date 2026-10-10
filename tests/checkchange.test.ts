// Location: tests/checkchange.test.ts
// 0021: Check Change: can the drawer make change for what the customer holds?
import test from 'node:test';
import assert from 'node:assert/strict';
import { adviceFor, checkChange, tightness } from '../src/lib/checkChange';
import { totalOf } from '../src/lib/cashLedger';
import { planChange } from '../src/lib/cashSale';

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

test('short: they do not hold enough', () => {
  const r = checkChange({ '500': 5 }, { '2000': 1 }, 3700); assert.equal(r.verdict, 'short'); if (r.verdict === 'short') assert.equal(r.shortBy, 1700);
});
test('exact: part of what they hold covers the bill without change; they keep the rest', () => {
  const r = checkChange({}, { '2000': 2, '1000': 1, '500': 1, '200': 1 }, 4500); assert.equal(r.verdict, 'exact');
  if (r.verdict === 'exact') { assert.equal(totalOf(r.take), 4500); assert.equal(totalOf(r.handBack), 1200); }
});
test('change: smallest handover whose change the drawer can make', () => {
  const r = checkChange({ '1000': 2, '500': 2, '100': 3 }, { '5000': 1, '2000': 2 }, 3700); // $50 + 2 × $20 for $37; the drawer has $1 coins
  assert.equal(r.verdict, 'change');
  if (r.verdict === 'change') { assert.deepEqual(r.take, { '2000': 2 }); assert.equal(totalOf(r.change), 300); }
  assert.equal(checkChange({ '1000': 2, '500': 2 }, { '5000': 1, '2000': 2 }, 3700).verdict, 'card'); // no coins for the $3
});
test('card: nothing they hold lets us make change', () => {
  const r = checkChange({ '500': 1 }, { '5000': 1 }, 3700); assert.equal(r.verdict, 'card');
  const r2 = checkChange({ '2000': 1 }, { '5000': 1 }, 3700); assert.equal(r2.verdict, 'card'); if (r2.verdict === 'card') assert.deepEqual(r2.part, { cashCents: 3000, restCents: 700 });
});
test('every answer is physically possible: totals add up and the change exists in drawer plus handover', () => {
  let seed = 5; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const dens = [5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5];
  for (let i = 0; i < 80; i++) {
    const drawer: Record<string, number> = {}; const offered: Record<string, number> = {};
    for (const d of dens) { if (rnd() < 0.6) drawer[String(d)] = Math.floor(rnd() * 4); if (rnd() < 0.3) offered[String(d)] = 1 + Math.floor(rnd() * 2); }
    const due = 5 * (1 + Math.floor(rnd() * 120)); const r = checkChange(drawer, offered, due);
    if (r.verdict === 'short') { assert.ok(totalOf(offered) < due); continue; }
    if (r.verdict === 'card') { assert.ok(totalOf(offered) >= due); continue; }
    assert.ok(totalOf(r.take) >= due); for (const [v, n] of Object.entries(r.take)) assert.ok(n <= (offered[v] ?? 0));
    assert.equal(totalOf(r.take) + totalOf(r.handBack), totalOf(offered));
    if (r.verdict === 'exact') assert.equal(totalOf(r.take), due);
    else { assert.equal(totalOf(r.take) - totalOf(r.change), due); const pool: Record<string, number> = { ...drawer }; for (const [v, n] of Object.entries(r.take)) pool[v] = (pool[v] ?? 0) + n; for (const [v, n] of Object.entries(r.change)) assert.ok(n <= (pool[v] ?? 0)); assert.notEqual(planChange(pool, totalOf(r.change)).kind, 'impossible'); }
  }
});
test('tightness: last of a denomination, or draining the drawer', () => {
  assert.deepEqual(tightness({ '500': 1, '2000': 4 }, { '5000': 1 }, { '500': 1 }), ['uses up the last $5']);
  assert.ok(tightness({ '1000': 2 }, { '5000': 1 }, { '2000': 1, '1000': 2 }).some(x => x.includes('more than half')));
  assert.deepEqual(tightness({ '500': 3, '2000': 5 }, { '5000': 1 }, { '500': 1 }), []);
});
test('advice wording for each verdict', () => {
  assert.equal(adviceFor(checkChange({ '500': 1 }, { '5000': 1 }, 3700), fmt).tone, 'bad');
  assert.equal(adviceFor(checkChange({}, { '2000': 1 }, 2000), fmt).title, 'Cash works: no change needed');
  assert.equal(adviceFor(checkChange({ '500': 1, '2000': 4 }, { '5000': 1 }, 4500), fmt).tone, 'warn');
  assert.equal(adviceFor(checkChange({ '500': 4 }, { '2000': 1 }, 1000), fmt).title, 'Cash works: $10.00 change');
});
