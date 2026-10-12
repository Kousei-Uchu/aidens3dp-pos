// Location: tests/helptree.test.ts
// 0092: the nested contents menu in Help (device test T8).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, ROOT_ID, trail, type Page } from '../src/lib/helpDocs';
import { openFor, toggled, treeRows } from '../src/lib/helpTree';
import { builtinHelp } from '../src/lib/helpBuiltin';

const page = (id: string, title: string, parent?: string): Page => ({ id, title, parent, summary: '', tags: [], related: [], lead: '', sections: { basic: '', deep: '', advanced: '' }, file: id + '.md' });
const idx = buildIndex([page(ROOT_ID, 'Start'), page('cash', 'Cash', ROOT_ID), page('cash/float', 'Float report', 'cash'), page('cash/swap', 'Swap', 'cash'), page('pay', 'Payments', ROOT_ID), page('pay/card', 'Card', 'pay'), page('pay/card/declined', 'Declined', 'pay/card')]);

test('closed sections hide their pages; the top page is always the first row at depth 0 and its sections follow at depth 1', () => {
  const rows = treeRows(idx, new Set([ROOT_ID]), ROOT_ID);
  assert.deepEqual(rows.map(r => [r.id, r.depth]), [[ROOT_ID, 0], ['cash', 1], ['pay', 1]]); assert.equal(rows[0].title, 'Help home'); assert.ok(rows[0].current);
  assert.deepEqual(rows.map(r => r.hasKids), [true, true, true]); assert.ok(rows.slice(1).every(r => !r.open));
});

test('opening a section shows its pages nested one level in, in title order', () => {
  const rows = treeRows(idx, new Set([ROOT_ID, 'cash']), ROOT_ID);
  assert.deepEqual(rows.map(r => r.id), [ROOT_ID, 'cash', 'cash/float', 'cash/swap', 'pay']); assert.equal(rows[2].depth, 2); assert.equal(rows[1].open, true);
});

test('openFor reveals the current page: every section above it is open, and a page with children opens its own', () => {
  const o = openFor(idx, 'pay/card/declined'); assert.deepEqual([...o].sort(), [ROOT_ID, 'pay', 'pay/card'].sort());
  const rows = treeRows(idx, o, 'pay/card/declined'); assert.ok(rows.find(r => r.id === 'pay/card/declined')?.current); assert.equal(rows.filter(r => r.current).length, 1);
  assert.ok(openFor(idx, 'cash').has('cash'), 'a section opened by its own page shows its pages'); assert.ok(!openFor(idx, 'cash/swap').has('cash/swap'));
});

test('toggled opens and closes without changing the set it was given', () => {
  const a = new Set([ROOT_ID]); const b = toggled(a, 'cash'); assert.ok(b.has('cash')); assert.ok(!a.has('cash')); assert.ok(!toggled(b, 'cash').has('cash'));
});

test('a loop in the tree or a missing top page cannot hang or repeat rows', () => {
  const loop = buildIndex([page(ROOT_ID, 'Start'), page('a', 'A', 'b'), page('b', 'B', 'a')]);
  const rows = treeRows(loop, new Set(['a', 'b', ROOT_ID]), ROOT_ID); assert.equal(new Set(rows.map(r => r.id)).size, rows.length);
  const noRoot = buildIndex([page('x', 'X'), page('x/y', 'Y', 'x')]); assert.deepEqual(treeRows(noRoot, new Set(['x']), 'x').map(r => r.id), ['x', 'x/y']);
});

test('the real help set: every page appears exactly once when everything is open, and the menu starts with Help home', () => {
  const { index } = builtinHelp(); const all = new Set(Object.keys(index.byId)); const rows = treeRows(index, all, ROOT_ID);
  assert.equal(rows[0].id, ROOT_ID); assert.equal(new Set(rows.map(r => r.id)).size, rows.length);
  const reachable = Object.keys(index.byId).filter(id => trail(index, id)[0]?.id === ROOT_ID); assert.equal(rows.length, reachable.length);
});
