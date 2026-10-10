// Location: tests/cashledger.test.ts
// 0018: the drawer ledger, tap entry with undo, and the change finder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DENOMS, addCounts, applyEntry, cleanCounts, describeTap, diffCounts, draftCounts, emptyLedger, entryTotal, newEntry, readLedger, shortfall, summariseCounts, tapDenom, totalOf, undoLast, MAX_ENTRIES, type Draft } from '../src/lib/cashLedger';
import { findCombinations, findCombinationsLimited, type ChangeResult } from '../src/lib/changeFinder';

// ── ledger arithmetic ──
test('denominations: Australian set, largest first, no 1c or 2c', () => {
  assert.deepEqual(DENOMS.map(d => d.cents), [10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5]);
  assert.equal(DENOMS.filter(d => d.kind === 'note').length, 5);
});
test('totalOf, addCounts, diffCounts, cleanCounts', () => {
  assert.equal(totalOf({ '2000': 2, '50': 3, '5': 1 }), 4155);
  assert.deepEqual(addCounts({ '2000': 1 }, { '2000': 2, '500': 1 }), { '2000': 3, '500': 1 });
  assert.deepEqual(addCounts({ '2000': 1 }, { '2000': -1 }), {}); // a zero count disappears
  assert.deepEqual(diffCounts({ '2000': 3, '500': 1 }, { '2000': 1, '100': 4 }), { '2000': 2, '500': 1, '100': -4 });
  assert.deepEqual(cleanCounts({ '2000': 0, '1000': 1.5, '0': 3, '500': 2 }), { '500': 2 });
});
test('summariseCounts reads largest first', () => {
  assert.equal(summariseCounts({ '500': 1, '2000': 2, '5': 3 }), '2 × $20, 1 × $5, 3 × 5c'); assert.equal(summariseCounts({}), 'nothing');
});
test('shortfall: only denominations where more is asked than held', () => {
  assert.deepEqual(shortfall({ '500': 2, '1000': 1 }, { '500': 3, '1000': 1, '2000': 1 }), [{ cents: 2000, have: 0, need: 1 }, { cents: 500, have: 2, need: 3 }]);
  assert.deepEqual(shortfall({ '500': 2 }, { '500': 2 }), []);
});

// ── tap entry and undo ──
test('tapping adds one at a time and counts what is on screen', () => {
  let d: Draft = []; d = tapDenom(d, {}, 2000, 1); d = tapDenom(d, {}, 2000, 1); d = tapDenom(d, {}, 5, 3);
  assert.deepEqual(draftCounts(d), { '2000': 2, '5': 3 }); assert.equal(totalOf(draftCounts(d)), 4015);
});
test('removing: only what is there; from zero it changes nothing; extra is clamped', () => {
  let d: Draft = []; assert.equal(tapDenom(d, {}, 500, -1), d, 'nothing to remove');
  d = tapDenom(d, {}, 500, 2); d = tapDenom(d, {}, 500, -5); assert.deepEqual(draftCounts(d), {}); // removed the 2 that existed
  assert.deepEqual(d.at(-1), { cents: 500, n: -2 });
});
test('with a base (open / correct contents): you can remove what was already there', () => {
  const base = { '2000': 3 }; let d: Draft = []; d = tapDenom(d, base, 2000, -1); d = tapDenom(d, base, 1000, 2);
  assert.deepEqual(draftCounts(d, base), { '2000': 2, '1000': 2 }); assert.deepEqual(diffCounts(draftCounts(d, base), base), { '2000': -1, '1000': 2 });
  assert.equal(tapDenom([], base, 1000, -1).length, 0, 'none of that in the base');
});
test('undo reverses the last tap and says what it was; undo on empty is a no-op', () => {
  let d: Draft = []; d = tapDenom(d, {}, 2000, 1); d = tapDenom(d, {}, 500, 4);
  const u = undoLast(d); assert.deepEqual(u.undone, { cents: 500, n: 4 }); assert.deepEqual(draftCounts(u.draft), { '2000': 1 });
  assert.equal(describeTap(u.undone!, true), 'Removed 4 × $5 ($20.00)');
  assert.equal(undoLast([]).undone, undefined);
  // undo a removal puts it back
  const base = { '2000': 1 }; let e: Draft = tapDenom([], base, 2000, -1); const r = undoLast(e); assert.deepEqual(draftCounts(r.draft, base), { '2000': 1 }); assert.equal(describeTap(r.undone!, true), 'Added $20 ($20.00)');
});
test('describeTap wording', () => {
  assert.equal(describeTap({ cents: 2000, n: 1 }), 'Added $20 ($20.00)'); assert.equal(describeTap({ cents: 50, n: -3 }), 'Removed 3 × 50c ($1.50)');
});

// ── ledger entries ──
test('applyEntry: moves counts, records history newest first, never goes below zero', () => {
  let l = emptyLedger();
  l = applyEntry(l, newEntry('open', { '2000': 2, '100': 5 }, { staff: 'Aiden' }));
  l = applyEntry(l, newEntry('paid_out', { '2000': -1, '500': -1 }, { note: 'milk' })); // the ledger never knew about a $5
  assert.deepEqual(l.counts, { '2000': 1, '100': 5 }); assert.equal(l.entries[0].kind, 'paid_out'); assert.equal(l.entries[1].staff, 'Aiden');
  assert.equal(entryTotal(l.entries[0]), -2500, 'the entry keeps what was entered');
});
test('history is capped, newest kept', () => {
  let l = emptyLedger(); for (let i = 0; i < MAX_ENTRIES + 20; i++) l = applyEntry(l, newEntry('adjust', { '5': 1 }, { note: String(i) }));
  assert.equal(l.entries.length, MAX_ENTRIES); assert.equal(l.entries[0].note, String(MAX_ENTRIES + 19)); assert.equal(l.counts['5'], MAX_ENTRIES + 20);
});
test('readLedger: bad or old saved data becomes an empty ledger; good data survives', () => {
  assert.deepEqual(readLedger(undefined), emptyLedger()); assert.deepEqual(readLedger({ counts: 3 }), emptyLedger());
  const l = applyEntry(emptyLedger(), newEntry('open', { '1000': 2 })); assert.deepEqual(readLedger(JSON.parse(JSON.stringify(l))), l);
  assert.equal(readLedger({ counts: {}, entries: [{ id: 'x', ts: 't', kind: 'bogus', delta: {} }] }).entries.length, 0);
});

// ── change finder: your function, checked against the original unpruned version ──
function reference(available: Record<string, number>, target: number, delta = 500): ChangeResult[] {
  const entries = Object.entries(available).map(([v, q]) => [Number(v), q] as const).filter(([v, q]) => v > 0 && Number.isFinite(v) && Number.isInteger(q) && q >= 0).sort(([a], [b]) => b - a);
  const results: ChangeResult[] = []; const used = new Array(entries.length).fill(0);
  const build = (total: number, exact: boolean): ChangeResult => { const values: ChangeResult['values'] = {}; entries.forEach(([v, q], i) => { values[String(v)] = { qty_used: used[i], qty_remaining: q - used[i] }; }); return { values, total, exact }; };
  const search = (i: number, total: number): void => {
    if (i === entries.length) { const d = Math.abs(total - target); if (d <= 1e-9) results.push(build(total, true)); else if (d <= delta + 1e-9) results.push(build(total, false)); return; }
    const [v, q] = entries[i];
    for (let qty = 0; qty <= q; qty++) { const nt = total + v * qty; if (nt > target + delta + 1e-9) break; used[i] = qty; search(i + 1, nt); }
    used[i] = 0;
  };
  search(0, 0); const ex = results.filter(r => r.exact); return ex.length ? ex : results;
}
const drawer = { '2000': 2, '1000': 3, '500': 4, '200': 5, '100': 5 };
test('finder: exact matches only when any exist (your $37.00 example)', () => {
  const r = findCombinations(drawer, 3700); assert.ok(r.length > 0 && r.every(x => x.exact && x.total === 3700));
  for (const c of r) for (const [v, q] of Object.entries(c.values)) assert.equal(q.qty_used + q.qty_remaining, (drawer as any)[v]);
});
test('finder: no exact match returns everything within ±delta, flagged exact:false, and the delta can be tightened', () => {
  const d = { '2000': 2, '1000': 1 }; // can make 0,10,20,30,40,50 dollars
  const r = findCombinations(d, 2500); assert.ok(r.length && r.every(x => !x.exact)); assert.deepEqual([...new Set(r.map(x => x.total))].sort((a, b) => a - b), [2000, 3000]);
  assert.deepEqual([...new Set(findCombinations(d, 2500, 100).map(x => x.total))], []);
  assert.deepEqual(findCombinations({}, 100, 0), []);
});
test('finder: invalid entries are ignored, zero-quantity denominations are fine', () => {
  const r = findCombinations({ '100': 3, '0': 5, '-50': 2, '200': 1.5, '500': 0 }, 300); assert.equal(r.length, 1); assert.equal(r[0].values['100'].qty_used, 3); assert.equal(r[0].values['500'].qty_used, 0);
});
test('finder: pruned search returns exactly what the original returns, in the same order (200 random drawers)', () => {
  let seed = 12345; const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const dens = [10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5];
  for (let t = 0; t < 200; t++) {
    const av: Record<string, number> = {}; for (const d of dens) if (rnd(3)) av[String(d)] = rnd(4);
    const target = rnd(60) * 5 + (rnd(2) ? 0 : 5); const delta = [0, 100, 500][rnd(3)];
    assert.deepEqual(findCombinations(av, target, delta), reference(av, target, delta), JSON.stringify({ av, target, delta }));
  }
});
test('finder: the node cap stops a huge drawer and says so', () => {
  const big = Object.fromEntries(DENOMS.map(d => [String(d.cents), 30]));
  const o = findCombinationsLimited(big, 7355, 500, { maxNodes: 5000 }); assert.equal(o.truncated, true);
  const small = findCombinationsLimited(drawer, 3700, 500, { maxNodes: 1_000_000 }); assert.equal(small.truncated, false); assert.deepEqual(small.results, findCombinations(drawer, 3700));
});
