// Location: tests/changeimpact.test.ts
// 0088: the "is this change worth giving?" judge: it must warn only when the change itself makes the next sales harder, never about a
// shortage that was already there (device test T4.9: no $20s in the drawer, $4 of change, and it warned about $20s).
import test from 'node:test';
import assert from 'node:assert/strict';
import { WARN_DELTA, genericProfile, judgeChange, judgeChoices, makeChange, makeScript, play } from '../src/lib/changeImpact';
import { checkChange } from '../src/lib/checkChange';
import { emptyProfile, type CashProfile } from '../src/lib/changeScore';
import { totalOf, type Counts } from '../src/lib/cashLedger';

const profile = (o: Partial<CashProfile>): CashProfile => ({ ...emptyProfile(), ...o });
/** Change amounts like a stall that sells $16-ish items for $20 and $50 notes: $4 most often, $26 sometimes, $14 now and then. */
const stall = profile({ amounts: [{ cents: 400, p: 0.5 }, { cents: 2600, p: 0.3 }, { cents: 1400, p: 0.2 }], needPerSale: { '2000': 0.3, '500': 0.8, '200': 1, '100': 1 }, inPerSale: { '2000': 0.6, '5000': 0.4 }, horizon: 6, confidence: 1, source: 'history', samples: 40 });

test('makeChange: exact change, backtracking when the big notes do not fit, null when impossible, never more than the pool holds', () => {
  assert.deepEqual(makeChange({ '2000': 1, '500': 1 }, 2500), { '2000': 1, '500': 1 });
  assert.deepEqual(makeChange({ '1000': 1, '500': 2 }, 1000), { '1000': 1 }); // largest first
  assert.deepEqual(makeChange({ '1000': 0, '500': 2 }, 1000), { '500': 2 }); // no $10s: two $5s
  assert.deepEqual(makeChange({ '500': 3, '200': 2 }, 900), { '500': 1, '200': 2 }); // $5 + 2 × $2: the first guess ($5 + $2 + ...) has to back out of 2 × $5
  assert.equal(makeChange({ '500': 3 }, 600), null); assert.equal(makeChange({ '500': 1 }, 1000), null); assert.deepEqual(makeChange({ '500': 1 }, 0), {});
  for (let owed = 5; owed <= 3000; owed += 5) { const pool: Counts = { '2000': 1, '1000': 2, '500': 1, '200': 3, '100': 2, '50': 1, '20': 2, '10': 1, '5': 1 }; const r = makeChange(pool, owed); if (r) { assert.equal(totalOf(r), owed); for (const [v, n] of Object.entries(r)) assert.ok(n <= pool[v]); } }
});
test('the sales script is seeded: the same profile always gives the same script, and the same drawer the same answer', () => {
  assert.deepEqual(makeScript(stall), makeScript(stall)); const d = { '500': 3, '200': 4, '100': 6 };
  assert.deepEqual(play(d, makeScript(stall)), play(d, makeScript(stall))); assert.notDeepEqual(makeScript(stall, { seed: 1 }), makeScript(stall, { seed: 2 }));
});
test('play: a well-stocked drawer almost never fails, an empty one always does', () => {
  const rich = { '2000': 4, '1000': 6, '500': 10, '200': 12, '100': 20, '50': 10 }; assert.ok(play(rich, makeScript(stall)).rate < 0.05);
  const r = play({}, makeScript(stall)); assert.equal(r.rate, 1); assert.ok(r.total > 0);
});

test('T4.9: no $20s in the drawer and $4 of change must NOT warn about $20s (the shortage was already there)', () => {
  const noTwenties = { '500': 6, '200': 6, '100': 8, '50': 4 };
  for (const [offered, due] of [[{ '2000': 1 }, 1600], [{ '1000': 1 }, 600], [{ '5000': 1 }, 4600], [{ '500': 1 }, 100]] as [Counts, number][]) {
    const r = checkChange(noTwenties, offered, due, undefined, stall); assert.equal(r.verdict, 'change');
    if (r.verdict === 'change') assert.ok(!r.tight.join(' ').includes('$20'), `${JSON.stringify(offered)} for ${due}: ${r.tight.join(' ')}`);
  }
  for (const [offered, due] of [[{ '2000': 1 }, 1600], [{ '1000': 1 }, 600]] as [Counts, number][]) { const r = checkChange(noTwenties, offered, due, undefined, stall); if (r.verdict === 'change') assert.deepEqual(r.tight, []); }
  const j = judgeChange({ drawer: noTwenties, take: { '1000': 1 }, change: { '200': 2 }, profile: stall }); assert.deepEqual(j.tight, []); assert.ok(Math.abs(j.acceptRate - j.declineRate) < WARN_DELTA);
});
test('a healthy drawer never warns, whatever the change', () => {
  const healthy = { '2000': 4, '1000': 6, '500': 10, '200': 12, '100': 20, '50': 10, '20': 6, '10': 6, '5': 6 };
  for (const [take, change] of [[{ '2000': 1 }, { '200': 2 }], [{ '5000': 1 }, { '2000': 1, '500': 1, '100': 1 }], [{ '1000': 1 }, { '500': 1, '100': 1 }]] as [Counts, Counts][]) assert.deepEqual(judgeChange({ drawer: healthy, take, change, profile: stall }).tight, []);
  assert.deepEqual(judgeChange({ drawer: healthy, take: { '2000': 1 }, change: { '200': 2 } }).tight, []); // no profile either
});
test('it warns when the change uses up what the next sales need, names it, and says what card would leave', () => {
  const drawer = { '500': 1, '100': 10, '200': 5, '2000': 2 }; // a single $5 left; $20 for $9 means $11 back
  const j = judgeChange({ drawer, take: { '2000': 1 }, change: { '500': 1, '100': 6 }, profile: stall });
  assert.equal(j.tight.length, 1); assert.match(j.tight[0], /^uses up the last \$5, so about \d+% of your usual sales would then get no exact change \(\d+% if you ask for card\)$/); assert.ok(j.culprits.includes(500));
  assert.ok(j.acceptRate - j.declineRate >= WARN_DELTA);
});
test('it blames the note that matters, not the one that is plentiful', () => {
  const drawer = { '500': 1, '100': 30, '2000': 1 }; // plenty of $1 coins, a single $5
  const j = judgeChange({ drawer, take: { '1000': 1 }, change: { '500': 1, '100': 3 }, profile: profile({ amounts: [{ cents: 500, p: 0.6 }, { cents: 800, p: 0.4 }], inPerSale: { '1000': 1 }, horizon: 6, confidence: 1, source: 'history', samples: 20 }) });
  assert.equal(j.culprits[0], 500); assert.match(j.tight[0], /^uses up the last \$5/);
});
test('judgeChoices: of several ways to give the same change it uses the first unless a later one is clearly kinder', () => {
  const drawer = { '100': 4, '200': 6, '1000': 2 }; const take = { '2000': 1 }; // $20 for $9: $11 back
  const p = profile({ amounts: [{ cents: 500, p: 0.4 }, { cents: 900, p: 0.3 }, { cents: 1400, p: 0.3 }], horizon: 8, confidence: 1, source: 'history', samples: 20 });
  const burnsCoins = { '100': 3, '200': 4 }; const usesTen = { '100': 1, '1000': 1 };
  const bad = judgeChoices({ drawer, take, options: [burnsCoins], profile: p }); assert.equal(bad.index, 0); assert.equal(bad.tight.length, 1);
  const kind = judgeChoices({ drawer, take, options: [burnsCoins, usesTen], profile: p }); assert.equal(kind.index, 1); assert.deepEqual(kind.tight, []);
  assert.equal(judgeChoices({ drawer, take, options: [usesTen, burnsCoins], profile: p }).index, 0); // already the kind one first: no switch
  assert.equal(judgeChoices({ drawer: { '500': 6 }, take: {}, options: [{ '500': 1 }], profile: p }).index, 0);
});
test('with no profile the generic spread of change amounts is used, and the words say "typical"', () => {
  assert.equal(genericProfile().amounts.length, 59); assert.ok(Math.abs(genericProfile().amounts.reduce((s, a) => s + a.p, 0) - 1) < 1e-9);
  const j = judgeChange({ drawer: { '500': 1, '100': 10, '200': 5, '2000': 2 }, take: { '2000': 1 }, change: { '500': 1, '200': 2, '100': 2 } }); assert.equal(j.generic, true); assert.match(j.tight.join(' '), /typical sales/);
});
test('taking cash in can only help: handing over a note and getting no change back never warns', () => {
  for (const drawer of [{}, { '500': 1 }, { '2000': 3, '500': 4 }] as Counts[]) assert.deepEqual(judgeChange({ drawer, take: { '2000': 1 }, change: {}, profile: stall }).tight, []);
});
test('random drawers and changes: always a sensible answer, rates between 0 and 1, a warning only with a real gap', () => {
  let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const dens = [2000, 1000, 500, 200, 100, 50];
  for (let i = 0; i < 40; i++) {
    const drawer: Counts = {}; for (const d of dens) if (rnd() < 0.8) drawer[String(d)] = Math.floor(rnd() * 8);
    const take: Counts = { [String([2000, 5000][Math.floor(rnd() * 2)])]: 1 }; const pool: Counts = { ...drawer }; for (const [v, n] of Object.entries(take)) pool[v] = (pool[v] ?? 0) + n;
    const owed = 100 * (1 + Math.floor(rnd() * 15)); const change = makeChange(pool, owed); if (!change) continue;
    const j = judgeChange({ drawer, take, change, profile: i % 2 ? stall : null });
    assert.ok(j.acceptRate >= 0 && j.acceptRate <= 1 && j.declineRate >= 0 && j.declineRate <= 1);
    assert.equal(j.tight.length > 0, j.acceptRate - j.declineRate >= WARN_DELTA);
  }
});
