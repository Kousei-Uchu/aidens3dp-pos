// Location: tests/cashsale.test.ts
// 0019: taking cash with the denomination pad: status, change plan from the ledger, ledger postings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cashDue, cashStatus, greedyChange, piecesOf, planChange, postCashSale, reverseCashTender } from '../src/lib/cashSale';
import { emptyLedger, applyEntry, newEntry, totalOf } from '../src/lib/cashLedger';
import { cashTender } from '../src/lib/saleBuilder';
import { findCombinations } from '../src/lib/changeFinder';
import type { Tender } from '../src/lib/types';

test('cashDue rounds only the final payment, and only when rounding is on', () => {
  assert.equal(cashDue(1233, 1233, true), 1235); assert.equal(cashDue(1233, 1233, false), 1233); assert.equal(cashDue(1233, 2000, true), 1233);
});
test('cashStatus: empty, short, exact, change', () => {
  assert.deepEqual(cashStatus(1235, 0), { state: 'empty' }); assert.deepEqual(cashStatus(1235, 1000), { state: 'short', shortBy: 235 });
  assert.deepEqual(cashStatus(1235, 1235), { state: 'exact' }); assert.deepEqual(cashStatus(1235, 2000), { state: 'change', change: 765 }); assert.deepEqual(cashStatus(0, 0), { state: 'exact' });
});
test('planChange: fewest pieces among exact combinations', () => {
  const p = planChange({ '1000': 1, '500': 1, '200': 2, '100': 3 }, 700);
  assert.equal(p.kind, 'exact'); if (p.kind === 'exact') assert.deepEqual(p.counts, { '500': 1, '200': 1 });
});
test('planChange: the notes the customer just handed over can go back as change', () => {
  const drawer = { '1000': 1, '500': 1 }; const received = { '2000': 1 };
  const p = planChange({ '1000': 1, '500': 1, '2000': 1 }, 1500); assert.equal(p.kind, 'exact'); if (p.kind === 'exact') assert.deepEqual(p.counts, { '1000': 1, '500': 1 });
  void drawer; void received;
  assert.equal(planChange({ '2000': 1, '500': 1 }, 1500).kind, 'impossible');
});
test('planChange: none owed, impossible, only counts what exists', () => {
  assert.equal(planChange({ '500': 3 }, 0).kind, 'none');
  assert.equal(planChange({ '2000': 3 }, 500).kind, 'impossible');
  assert.equal(planChange({ '500': 2, '100': 1 }, 1200).kind, 'impossible'); assert.equal(planChange({ '500': 2, '100': 1 }, 1100).kind, 'exact');
  assert.equal(planChange({ '500': -2, '100': 5 }, 500).kind, 'exact'); // a negative count is ignored, 5 × $1 found
});
test('planChange matches the plain change finder: it is exact exactly when findCombinations has an exact answer', () => {
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const dens = [2000, 1000, 500, 200, 100, 50, 20, 10, 5];
  for (let i = 0; i < 80; i++) {
    const pool: Record<string, number> = {}; for (const d of dens) if (rnd() < 0.7) pool[String(d)] = Math.floor(rnd() * 4);
    const owed = 5 * Math.floor(rnd() * 400);
    const exactExists = owed > 0 && findCombinations(pool, owed, 0).some(r => r.exact);
    const plan = planChange(pool, owed);
    if (owed === 0) { assert.equal(plan.kind, 'none'); continue; }
    assert.equal(plan.kind === 'exact', exactExists, `pool ${JSON.stringify(pool)} owed ${owed}`);
    if (plan.kind === 'exact') { assert.equal(totalOf(plan.counts), owed); for (const [v, n] of Object.entries(plan.counts)) assert.ok(n <= (pool[v] ?? 0)); }
  }
});
test('planChange: a node cap falls back to greedy and says so', () => {
  const pool = { '2000': 5, '1000': 5, '500': 5, '200': 5, '100': 5, '50': 5, '20': 5, '10': 5, '5': 5 };
  const p = planChange(pool, 4735, 50); assert.equal(p.kind, 'exact'); if (p.kind === 'exact') { assert.equal(p.truncated, true); assert.equal(totalOf(p.counts), 4735); }
  assert.deepEqual(greedyChange({ '1000': 1, '500': 1 }, 700), null);
});
test('postCashSale: received goes in, change comes out; untracked sides are skipped', () => {
  const l0 = applyEntry(emptyLedger(), newEntry('open', { '500': 2, '100': 3 }));
  const l1 = postCashSale(l0, { saleUuid: 'S1', received: { '2000': 1 }, given: { '500': 1, '100': 3 }, staff: 'Sam' });
  assert.deepEqual(l1.counts, { '2000': 1, '500': 1 }); assert.deepEqual(l1.entries.slice(0, 2).map(e => e.kind), ['sale_change', 'sale_in']); assert.equal(l1.entries[0].saleUuid, 'S1');
  assert.equal(postCashSale(l0, { saleUuid: 'S2' }), l0); assert.equal(postCashSale(l0, { saleUuid: 'S2', received: {}, given: null }).entries.length, l0.entries.length);
  assert.deepEqual(postCashSale(l0, { saleUuid: 'S3', received: { '1000': 1 } }).counts, { '1000': 1, '500': 2, '100': 3 });
});
test('reverseCashTender: cancelling hands the cash back; tenders without tracking change nothing', () => {
  const l0 = applyEntry(emptyLedger(), newEntry('open', { '500': 2, '100': 3 }));
  const sold = postCashSale(l0, { saleUuid: 'S1', received: { '2000': 1 }, given: { '500': 1, '100': 3 } });
  const t: Tender = { id: 't', kind: 'cash', amountCents: 1000, at: '', cashIn: { '2000': 1 }, cashOut: { '500': 1, '100': 3 } };
  assert.deepEqual(reverseCashTender(sold, t, { saleUuid: 'S1' }).counts, l0.counts);
  assert.equal(reverseCashTender(sold, { id: 'u', kind: 'cash', amountCents: 5, at: '' }), sold); assert.equal(reverseCashTender(sold, { ...t, kind: 'card' }), sold);
});
test('a tendered amount from the pad still goes through cashTender: change, settling, part payments', () => {
  const full = cashTender(1235, 2000, true); assert.equal(full.settles, true); assert.equal(full.tender.changeCents, 765);
  const part = cashTender(1235, 1000, true); assert.equal(part.settles, false); assert.equal(part.tender.amountCents, 1000);
  assert.equal(piecesOf({ '500': 2, '5': 3 }), 5);
});

// ── 0020 ──
import { countsToDraft, handBackOptions, ledgerEmpty, partCashOption, postCashRefund } from '../src/lib/cashSale';
import { draftCounts } from '../src/lib/cashLedger';

test('handBackOptions: asks for less when the change cannot be made, hands the rest back', () => {
  const drawer = { '100': 2 }; const received = { '5000': 1, '2000': 1 }; // $70 handed over for $37; drawer has only 2 × $1
  assert.equal(planChange({ ...drawer, ...received }, 3300).kind, 'impossible');
  const h = handBackOptions(drawer, received, 3700); assert.equal(h, null); // $50 alone gives $13 change: not possible with 2 × $1 + $20, and $20 alone is short
  const d2 = { '1000': 1, '200': 1, '100': 1 }; const h2 = handBackOptions(d2, received, 3700);
  assert.ok(h2); assert.deepEqual(h2!.take, { '5000': 1 }); assert.deepEqual(h2!.handBack, { '2000': 1 }); assert.equal(totalOf(h2!.change), 1300);
});
test('handBackOptions: prefers the smallest amount that works, and never the whole handover', () => {
  const h = handBackOptions({ '500': 1 }, { '2000': 2 }, 1500); // customer gave 2 × $20 for $15: take one $20, give $5
  assert.deepEqual(h?.take, { '2000': 1 }); assert.deepEqual(h?.change, { '500': 1 }); assert.deepEqual(h?.handBack, { '2000': 1 });
  assert.equal(handBackOptions({}, { '2000': 1 }, 1500), null); // only one note: nothing smaller to take
});
test('partCashOption: the largest cash part below the bill whose change works', () => {
  const p = partCashOption({ '2000': 1 }, { '5000': 1 }, 3700); // $50 in; drawer has a $20 → take $30 (change $20), rest $7 on card
  assert.deepEqual(p, { cashCents: 3000, restCents: 700 });
  assert.equal(partCashOption({}, { '5000': 1 }, 3700), null);
});
test('countsToDraft round-trips through the pad; ledgerEmpty; refunds leave the drawer', () => {
  const c = { '2000': 2, '5': 3 }; assert.deepEqual(draftCounts(countsToDraft(c)), c);
  assert.equal(ledgerEmpty({}), true); assert.equal(ledgerEmpty({ '500': 1 }), false);
  const l0 = applyEntry(emptyLedger(), newEntry('open', { '2000': 2, '500': 1 }));
  const l1 = postCashRefund(l0, { saleUuid: 'R', given: { '2000': 1, '500': 1 }, staff: 'Sam' });
  assert.deepEqual(l1.counts, { '2000': 1 }); assert.equal(l1.entries[0].kind, 'refund_out'); assert.equal(postCashRefund(l0, { given: null }), l0);
});
test('part cash through cashTender: taking X of a larger bill gives change on X, not on the bill', () => {
  const r = cashTender(3000, 5000, false); assert.equal(r.settles, true); assert.equal(r.tender.amountCents, 3000); assert.equal(r.tender.changeCents, 2000);
});
test('partCashOption agrees with the change finder (random drawers)', () => {
  let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const dens = [5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5];
  for (let i = 0; i < 60; i++) {
    const drawer: Record<string, number> = {}; for (const d of dens) if (rnd() < 0.6) drawer[String(d)] = Math.floor(rnd() * 4);
    const received: Record<string, number> = { [String(dens[Math.floor(rnd() * 4)])]: 1 }; const have = totalOf(received); const due = 5 * (1 + Math.floor(rnd() * (have / 5)));
    if (have <= due) continue;
    const p = partCashOption(drawer, received, due); const pool = { ...drawer, ...Object.fromEntries(Object.entries(received).map(([k, v]) => [k, (drawer[k] ?? 0) + v])) };
    let brute: number | null = null; for (let x = Math.floor((due - 5) / 5) * 5; x >= 5; x -= 5) if (planChange(pool, have - x, 200000).kind !== 'impossible') { brute = x; break; }
    assert.equal(p?.cashCents ?? null, brute, `drawer ${JSON.stringify(drawer)} rec ${JSON.stringify(received)} due ${due}`);
  }
});
