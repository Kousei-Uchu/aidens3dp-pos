// Location: tests/gridnav.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGrid, type Tile } from '../src/lib/grid';
import { addTileAt, breadcrumbs, childTiles, descendantCollectionIds, editListAt, isContainer, listAt, moveTileAt, ownProductIds, removeTileAt, resolvePath, updateTileAt, viewTiles, withChildren } from '../src/lib/gridNav';

const cat = (collectionId: string, subs?: Tile[], label?: string): Tile => ({ type: 'category', collectionId, ...(subs ? { subs } : {}), ...(label ? { label } : {}) });
const grp = (name: string, tiles: Tile[] = [], collectionId?: string): Tile => ({ type: 'group', name, tiles, ...(collectionId ? { collectionId } : {}) });
const item = (productId: string): Tile => ({ type: 'item', productId });

// Dragons > Extreme Dragons > Rose, plus a plain group and a plain item on the page
const rose = cat('rose');
const extreme = cat('extreme', [rose]);
const dragons = cat('dragons', [extreme]);
const plushies = grp('Plushies', [item('p1')]);
const root: Tile[] = [dragons, plushies, item('p9')];

const collections = [
  { id: 'dragons', productIds: ['d1', 'd2', 'e1', 'r1', 'both'] },
  { id: 'extreme', productIds: ['e1', 'r1', 'e2'] },
  { id: 'rose', productIds: ['r1', 'r2'] },
  { id: 'plush', productIds: ['p1', 'p2'] },
];

test('resolvePath walks containers and stops at the first missing step', () => {
  const r = resolvePath(root, [0, 0, 0]);
  assert.deepEqual(r.nodes.map(n => (n as any).collectionId), ['dragons', 'extreme', 'rose']); assert.deepEqual(r.valid, [0, 0, 0]);
  assert.deepEqual(resolvePath(root, []).nodes, []);
  assert.deepEqual(resolvePath(root, [0, 5, 0]).valid, [0]);      // no tile 5 inside Dragons
  assert.deepEqual(resolvePath(root, [2]).valid, []);              // an item is not a container
  assert.deepEqual(resolvePath(root, [9]).valid, []);
});

test('listAt gives the page list or the children of the last container', () => {
  assert.equal(listAt(root, []), root);
  assert.deepEqual(listAt(root, [0]), [extreme]);
  assert.deepEqual(listAt(root, [1]), [item('p1')]);
  assert.deepEqual(listAt(root, [0, 7]), [extreme]); // a broken step falls back to the deepest valid level
});

test('editing nested lists is immutable and only changes the target', () => {
  const added = addTileAt(root, [0, 0], cat('rose2'));
  assert.equal(listAt(added, [0, 0]).length, 2);
  assert.equal(listAt(root, [0, 0]).length, 1); // original untouched
  assert.equal(added[1], root[1]); assert.equal(added[2], root[2]); // untouched siblings keep identity
  const removed = removeTileAt(added, [0, 0], 0);
  assert.deepEqual(listAt(removed, [0, 0]).map(t => (t as any).collectionId), ['rose2']);
  const relabel = updateTileAt(root, [0, 0], 0, t => ({ ...t, label: 'Roses' } as Tile));
  assert.equal((listAt(relabel, [0, 0])[0] as any).label, 'Roses');
  const moved = moveTileAt(addTileAt(root, [1], item('p2')), [1], 0, 1);
  assert.deepEqual(listAt(moved, [1]).map(t => (t as any).productId), ['p2', 'p1']);
  assert.equal(moveTileAt(root, [1], 0, 5), root.length ? moveTileAt(root, [1], 0, 5) : root); // out of range changes nothing
  assert.deepEqual(editListAt(root, [0, 9], l => [...l, item('x')]), root);                       // a path that does not resolve changes nothing
  assert.equal(editListAt(root, [2], l => [...l, item('x')]), root);                               // cannot edit inside an item
  const top = addTileAt(root, [], cat('new')); assert.equal(top.length, 4);
});

test('an item in a sub-category and its parents only shows in the deepest one', () => {
  assert.deepEqual([...descendantCollectionIds(dragons as any)].sort(), ['extreme', 'rose']);
  assert.deepEqual(ownProductIds(dragons as any, collections), ['d1', 'd2', 'both']);       // e1, r1 live deeper
  assert.deepEqual(ownProductIds(extreme as any, collections), ['e1', 'e2']);                // r1 is in Rose, e1 stays here (it is only in Extreme and Dragons)
  assert.deepEqual(ownProductIds(rose as any, collections), ['r1', 'r2']);                   // the deepest keeps everything
  assert.deepEqual(ownProductIds(cat('missing') as any, collections), []);
  assert.deepEqual(ownProductIds(grp('Plain') as any, collections), []);                     // a plain group has no collection of its own
});

test('a group can impersonate a collection and hold sub-categories', () => {
  const g = grp('Dragons group', [cat('rose')], 'dragons');
  assert.deepEqual(ownProductIds(g as any, collections), ['d1', 'd2', 'e1', 'both']);        // r1 is in the sub-category Rose
  const v = viewTiles(g as any, collections, () => true);
  assert.deepEqual(v.map(t => t.type === 'item' ? (t as any).productId : `cat:${(t as any).collectionId}`), ['cat:rose', 'd1', 'd2', 'e1', 'both']);
});

test('viewTiles: own tiles first, collection items after, no repeats, unsellable products skipped', () => {
  const dragonsWithPin = cat('dragons', [extreme, item('d1')]);
  const v = viewTiles(dragonsWithPin as any, collections, p => p !== 'd2');
  assert.deepEqual(v.map(t => t.type === 'item' ? (t as any).productId : 'sub'), ['sub', 'd1', 'both']); // d1 pinned (not repeated), d2 hidden
});

test('breadcrumbs: one entry per level and each jumps to its own depth', () => {
  const { nodes, valid } = resolvePath(root, [0, 0, 0]);
  const crumbs = breadcrumbs('Home', nodes, valid, n => (n.type === 'category' ? n.label ?? n.collectionId : n.name));
  assert.deepEqual(crumbs.map(c => c.label), ['Home', 'dragons', 'extreme', 'rose']);
  assert.deepEqual(crumbs.map(c => c.path), [[], [0], [0, 0], [0, 0, 0]]);
  assert.deepEqual(crumbs[0].path, []); // Home is depth 0
});

test('helpers: container checks and child swap', () => {
  assert.ok(isContainer(dragons) && isContainer(plushies) && !isContainer(item('x')) && !isContainer(undefined));
  assert.deepEqual(childTiles(item('x')), []);
  assert.deepEqual(childTiles(withChildren(plushies as any, [])), []);
  assert.deepEqual((withChildren(cat('a') as any, [item('z')]) as any).subs, [item('z')]);
});

test('grid.json: nested categories and collection groups survive a parse, and bad children are dropped', () => {
  const json = { version: 1, pages: [{ id: 'p', name: 'Home', tiles: [dragons, grp('G', [], 'dragons')] }] };
  const { grid, dropped } = parseGrid(JSON.stringify(json));
  assert.equal(dropped, 0);
  assert.deepEqual(grid.pages[0].tiles, [dragons, grp('G', [], 'dragons')]);
  const bad = parseGrid({ version: 1, pages: [{ id: 'p', name: 'Home', tiles: [{ type: 'category', collectionId: 'x', subs: [{ type: 'nope' }] }, { type: 'group', name: 'G', tiles: [], collectionId: 5 }] }] });
  assert.equal(bad.dropped, 2); // a category with an unreadable child, and a group with a bad collection id, are each dropped whole
  assert.deepEqual(parseGrid({ version: 1, pages: [{ id: 'p', name: 'Old', tiles: [{ type: 'category', collectionId: 'old' }] }] }).grid.pages[0].tiles, [{ type: 'category', collectionId: 'old' }]); // old layouts load unchanged
});
