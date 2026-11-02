// Location: tests/gridmerge.test.ts
// CloudKit patch 6a, layout: how two registers' edits to the shared grid are joined, and the source pins for the wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Grid, GridPage, Tile } from '../src/lib/grid';
import { adoptAfterSend, gridText, mergeGrid, planLayout, readGridBase } from '../src/lib/gridMerge';
import { DEVICE_KEYS } from '../src/lib/backupFile';

const act = (action: any): Tile => ({ type: 'action', action });
const page = (id: string, ...tiles: Tile[]): GridPage => ({ id, name: id.toUpperCase(), tiles });
const grid = (...pages: GridPage[]): Grid => ({ version: 1, pages });
const ids = (g: Grid) => g.pages.map(p => p.id);

test('a page only the shop changed is taken, and a page only this register changed is kept', () => {
  const base = grid(page('a', act('lock_pos')), page('b', act('clear_cart')));
  const local = grid(page('a', act('lock_pos'), act('customers')), page('b', act('clear_cart')));
  const remote = grid(page('a', act('lock_pos')), page('b', act('clear_cart'), act('discounts')));
  const m = mergeGrid(base, local, remote);
  assert.equal(m.pages[0].tiles.length, 2); assert.equal(m.pages[1].tiles.length, 2);
});

test('both changed the same page: this register, the one sending, wins that page', () => {
  const base = grid(page('a', act('lock_pos')));
  const local = grid(page('a', act('customers'))); const remote = grid(page('a', act('discounts')));
  assert.deepEqual(mergeGrid(base, local, remote).pages[0].tiles, [act('customers')]);
});

test('pages added on two registers both stay', () => {
  const base = grid(page('a')); const m = mergeGrid(base, grid(page('a'), page('x')), grid(page('a'), page('y')));
  assert.deepEqual(ids(m).sort(), ['a', 'x', 'y']);
});

test('a page removed on either side stays removed, even when the other side edited it', () => {
  const base = grid(page('a'), page('b', act('lock_pos')));
  assert.deepEqual(ids(mergeGrid(base, grid(page('a')), grid(page('a'), page('b', act('lock_pos'), act('customers'))))), ['a'], 'removed here, edited there');
  assert.deepEqual(ids(mergeGrid(base, grid(page('a'), page('b', act('customers'))), grid(page('a')))), ['a'], 'removed there, edited here');
});

test('the order: this register\'s if it moved pages, the shop\'s if it did not', () => {
  const base = grid(page('a'), page('b'), page('c'));
  assert.deepEqual(ids(mergeGrid(base, grid(page('c'), page('a'), page('b')), grid(page('a'), page('b'), page('c')))), ['c', 'a', 'b']);
  assert.deepEqual(ids(mergeGrid(base, grid(page('a'), page('b'), page('c')), grid(page('b'), page('a'), page('c')))), ['b', 'a', 'c']);
  assert.deepEqual(ids(mergeGrid(base, grid(page('a'), page('b'), page('c'), page('n')), grid(page('b'), page('a'), page('c')))), ['b', 'a', 'c', 'n'], 'a new page here goes after the shop\'s order');
});

test('with no base: the pages are joined, the shop\'s version of a page wins, and a page only here is kept', () => {
  const m = mergeGrid(null, grid(page('a', act('customers')), page('mine')), grid(page('a', act('discounts')), page('theirs')));
  assert.deepEqual(ids(m), ['a', 'theirs', 'mine']); assert.deepEqual(m.pages[0].tiles, [act('discounts')]);
});

test('a merge never leaves a grid with no page', () => {
  const base = grid(page('a')); const m = mergeGrid(base, grid(page('x')), grid(page('y'))); assert.ok(m.pages.length >= 1);
  const gone = mergeGrid(grid(page('a')), grid(page('b')), grid(page('c'))); assert.ok(gone.pages.length >= 1);
});

test('key order does not make two equal grids differ', () => {
  const a = grid({ id: 'a', name: 'A', tiles: [] }); const b = { pages: [{ tiles: [], name: 'A', id: 'a' }], version: 1 } as Grid;
  assert.equal(gridText(a), gridText(b));
});

test('a remembered base reads back, and a missing or broken one is null', () => {
  const g = grid(page('a', act('lock_pos'))); assert.deepEqual(readGridBase(gridText(g)), g);
  assert.equal(readGridBase(undefined), null); assert.equal(readGridBase('{nope'), null); assert.equal(readGridBase('{"version":2}'), null);
});

test('planLayout: identical grids need nothing; the shop having none sends this register\'s', () => {
  const g = grid(page('a')); assert.deepEqual(planLayout(gridText(g), g, g), { action: 'same' });
  assert.deepEqual(planLayout(undefined, g, null), { action: 'send', grid: g });
});

test('planLayout: only the shop changed takes it; only this register changed sends it; both changed merges', () => {
  const base = grid(page('a')); const bt = gridText(base); const edited = grid(page('a', act('customers')));
  assert.equal(planLayout(bt, base, edited).action, 'take');
  assert.equal(planLayout(bt, edited, base).action, 'send');
  const other = grid(page('a'), page('z')); const p = planLayout(bt, edited, other);
  assert.equal(p.action, 'merge'); assert.deepEqual(ids((p as any).grid).sort(), ['a', 'z']); assert.equal((p as any).grid.pages.find((x: GridPage) => x.id === 'a').tiles.length, 1);
});

test('planLayout with no base joins instead of overwriting, so a register with its own pages loses none', () => {
  const p = planLayout(undefined, grid(page('mine')), grid(page('theirs'))); assert.equal(p.action, 'merge'); assert.deepEqual(ids((p as any).grid).sort(), ['mine', 'theirs']);
});

test('adoptAfterSend: nothing edited during the send adopts what was sent; an edit made meanwhile is kept on top of it', () => {
  const snap = grid(page('a')); const sent = grid(page('a'), page('shop'));
  assert.deepEqual(adoptAfterSend(snap, snap, sent), sent);
  const during = grid(page('a', act('customers'))); const r = adoptAfterSend(snap, during, sent);
  assert.deepEqual(ids(r).sort(), ['a', 'shop']); assert.deepEqual(r.pages.find(p => p.id === 'a')!.tiles, [act('customers')]);
});

test('two registers editing in turn end on the same grid', () => {
  const start = grid(page('a')); let shop = start; const aBase = { t: gridText(start) }; const bBase = { t: gridText(start) };
  let A = grid(page('a'), page('fromA')); let B = grid(page('a'), page('fromB'));
  const step = (me: Grid, base: { t: string }) => { const p = planLayout(base.t, me, shop); if (p.action === 'same') { base.t = gridText(me); return me; } const g = (p as any).grid as Grid; if (p.action !== 'take') shop = g; base.t = gridText(g); return g; };
  A = step(A, aBase); B = step(B, bBase); A = step(A, aBase); B = step(B, bBase);
  assert.deepEqual(ids(A).sort(), ['a', 'fromA', 'fromB']); assert.equal(gridText(A), gridText(B)); assert.equal(gridText(shop), gridText(A));
});

// ── source pins ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const read = (p: string): string => readFileSync(p, 'utf8');
test('on CloudKit the push and the poll both go through the reconcile; Shopify keeps the version counter', () => {
  const s = read('src/lib/sync.ts');
  assert.match(s, /export async function pushLayout\(\) \{[\s\S]*?sharedKind\(\) === 'cloudkit'\) \{ await reconcileLayout\(\); return; \}[\s\S]*?gridVersion \+ 1/);
  assert.match(s, /async function pullLayout\(\) \{\s*if \(sharedKind\(\) === 'cloudkit'\) \{ await reconcileLayout\(\); return; \}[\s\S]*?v > st\(\)\.gridVersion/);
  assert.match(s, /async function reconcileLayout\(\) \{\s*if \(reconcilingLayout \|\| isTraining\(\)\) return/);
  assert.match(s, /adoptAfterSend\(snapshot, st\(\)\.grid, plan\.grid\)/);
});
test('the layout base is a device-only setting, never restored from a backup or shared', () => {
  assert.ok((DEVICE_KEYS as readonly string[]).includes('gridBase')); assert.match(read('src/state/store.ts'), /gridBase\?: string/);
  assert.ok(!/gridBase/.test(read('src/lib/sharedSettings.ts')));
});
