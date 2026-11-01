// Location: tests/shopdrawer.test.ts
// 0203: the audit of code and words that still assumed "this till's drawer" (decisions item 6). The drawer is one shared drawer for the
// shop, so what judges it must look at every register's cash, and nothing may tell a shop its registers each have their own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { horizonFrom } from '../src/lib/changeScore';
import { allSales } from '../src/lib/salesHistory';

const NOW = new Date('2026-11-02T12:00:00Z').getTime();
const cashSale = (uuid: string, n: number) => ({ uuid, type: 'sale', ts: `2026-11-01T0${n % 10}:00:00Z`, tenders: [{ kind: 'cash' }] }) as any;
const batch = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => cashSale(`${prefix}${i}`, i));

test('a quiet register plans for the shop\'s day, not its own: the horizon grows once the other registers\' sales are counted', () => {
  const mine = batch('a', 8); const theirs = batch('b', 16);
  const alone = horizonFrom(mine, NOW); const shop = horizonFrom(allSales(mine, theirs), NOW);
  assert.equal(alone, 4); assert.equal(shop, 12); assert.ok(shop > alone);
});
test('a sale held both here and in the shared list is counted once', () => {
  const mine = batch('a', 8);
  assert.equal(allSales(mine, mine).length, 8);
});
test('the smart-change profile and the assistant\'s drawer snapshot are both fed the whole shop\'s sales', () => {
  const p = readFileSync('src/state/cashProfile.ts', 'utf8');
  assert.match(p, /allSales\(mine, others \?\? \[\]\)/); assert.match(p, /s\.pos\.shared\?\.sales/);
  assert.match(readFileSync('src/lib/assistantCashIO.ts', 'utf8'), /sales: allSales\(s\.pos\.sales, s\.pos\.shared\?\.sales \?\? \[\]\)/);
});
test('expected cash is read from the shared ledger, not from this register\'s sales', () => {
  assert.match(readFileSync('src/screens/Drawer.tsx', 'utf8'), /cashSince\(shift\.openedAt, undefined, sales\)/);
});
test('no help page says the drawer is per iPad or per register', () => {
  const bad = [/No drawer open on this register/, /own drawer ledger/i, /does not combine cash/i, /lives on each iPad separately/i, /each one needs its own drawer/i, /not added together/i, /cashSince\(shift\.openedAt, registerId/];
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith('.md') ? [`${d}/${e.name}`] : []);
  for (const f of walk('help')) { const t = readFileSync(f, 'utf8'); for (const re of bad) assert.doesNotMatch(t, re, `${f}: ${re}`); }
});
test('the practice drawer screen says what the real one does', () => {
  assert.doesNotMatch(readFileSync('src/training/modules/drawer-day.ts', 'utf8'), /No drawer open on this register/);
});
