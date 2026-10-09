// Location: tests/inventory.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { activeFilterCount, buildRows, defaultInvPrefs, filterVariants, groupVariants, matchesQuery, sortVariants, statusOf } from '../src/lib/inventoryView';
import type { Variant } from '../src/lib/types';

let n = 0;
const V = (o: Partial<Variant> & { productId: string; productTitle: string }): Variant => ({ id: `v${++n}`, variantTitle: '', priceCents: 1000, tracked: o.stock !== null && o.stock !== undefined, stock: 5, tags: [], active: true, ...o });
const cow = (t: string, stock: number | null, price = 1500) => V({ productId: 'p-cow', productTitle: 'Highland cow', variantTitle: t, stock, priceCents: price });
const data: Variant[] = [
  cow('Small', 3), cow('Large', 0, 2500), cow('Giant', -2, 4000),
  V({ productId: 'p-tad', productTitle: 'Tadling', stock: 12, sku: 'TAD-1', barcode: '9300000000017' }),
  V({ productId: 'p-key', productTitle: 'Keyring', stock: null, priceCents: 500 }),
  V({ productId: 'p-old', productTitle: 'Retired dragon', stock: 1, active: false, status: 'ARCHIVED' }),
  V({ productId: 'p-dr', productTitle: 'Draft thing', stock: 7, active: false }),
];
const P = (o: Partial<ReturnType<typeof defaultInvPrefs>> = {}) => ({ ...defaultInvPrefs(), ...o });

test('no cap: 5,000 variants all come through the filter and sort', () => {
  const big = Array.from({ length: 5000 }, (_, i) => V({ productId: `p${i % 900}`, productTitle: `Item ${i % 900}`, variantTitle: `v${i}`, stock: i % 7 }));
  assert.equal(filterVariants(big, P(), '', null).length, 5000);
  assert.equal(sortVariants(big, 'name').length, 5000);
});
test('status: default shows active only; draft/archived/all available; older data without status falls back to active flag', () => {
  assert.equal(filterVariants(data, P(), '', null).length, 5);
  assert.deepEqual(filterVariants(data, P({ status: 'archived' }), '', null).map(v => v.productTitle), ['Retired dragon']);
  assert.deepEqual(filterVariants(data, P({ status: 'draft' }), '', null).map(v => v.productTitle), ['Draft thing']);
  assert.equal(filterVariants(data, P({ status: 'all' }), '', null).length, 7);
  assert.equal(statusOf(data[6]), 'DRAFT');
});
test('stock filters', () => {
  const t = (stock: any) => filterVariants(data, P({ stock, status: 'all' }), '', null).map(v => v.variantTitle || v.productTitle);
  assert.deepEqual(t('neg'), ['Giant']); assert.deepEqual(t('zero'), ['Large']);
  assert.deepEqual(t('low'), ['Large', 'Retired dragon']); // 0..2 only (Small has 3), negatives are their own filter
  assert.deepEqual(t('untracked'), ['Keyring']);
});
test('category filter uses the product set', () => assert.deepEqual(filterVariants(data, P(), '', new Set(['p-tad'])).map(v => v.productTitle), ['Tadling']));
test('search: every word must match name, variant, SKU or barcode', () => {
  assert.ok(matchesQuery(data[0], 'cow small')); assert.ok(!matchesQuery(data[0], 'cow large'));
  assert.ok(matchesQuery(data[3], 'tad-1')); assert.ok(matchesQuery(data[3], '9300000000017')); assert.ok(matchesQuery(data[0], ''));
});
test('sorts: name is natural, stock puts untracked last both ways, price, updated', () => {
  const names = (s: any) => sortVariants(filterVariants(data, P({ status: 'active' }), '', null), s).map(v => v.variantTitle || v.productTitle);
  assert.deepEqual(names('stock-asc'), ['Giant', 'Large', 'Small', 'Tadling', 'Keyring']);
  assert.deepEqual(names('stock-desc'), ['Tadling', 'Small', 'Large', 'Giant', 'Keyring']);
  assert.deepEqual(names('price-asc'), ['Keyring', 'Tadling', 'Small', 'Large', 'Giant']);
  const nat = sortVariants([V({ productId: 'a', productTitle: 'Box 10' }), V({ productId: 'b', productTitle: 'Box 2' })], 'name').map(v => v.productTitle);
  assert.deepEqual(nat, ['Box 2', 'Box 10']);
  const u = sortVariants([V({ productId: 'a', productTitle: 'A', updatedAt: '2026-01-01' }), V({ productId: 'b', productTitle: 'B', updatedAt: '2026-06-01' })], 'updated').map(v => v.productTitle);
  assert.deepEqual(u, ['B', 'A']);
});
test('grouping: variants nest under their product, totals add up, untracked ignored in totals', () => {
  const g = groupVariants(filterVariants(data, P(), '', null), 'name');
  const cowG = g.find(x => x.productId === 'p-cow')!;
  assert.equal(cowG.variants.length, 3); assert.equal(cowG.stock, 1); assert.equal(cowG.minPrice, 1500); assert.equal(cowG.maxPrice, 4000);
  assert.equal(g.find(x => x.productId === 'p-key')!.stock, null);
  assert.deepEqual(groupVariants(filterVariants(data, P(), '', null), 'stock-asc').map(x => x.title), ['Highland cow', 'Tadling', 'Keyring']);
});
test('rows: collapsed shows header only, expanded shows nested variants, single-variant products are plain rows, searching expands all', () => {
  const g = groupVariants(filterVariants(data, P(), '', null), 'name');
  const closed = buildRows(g, new Set(), false); const kinds = (r: ReturnType<typeof buildRows>) => r.map(x => x.kind + (x.kind === 'variant' && x.nested ? '*' : ''));
  assert.deepEqual(kinds(closed), ['group', 'variant', 'variant']);
  assert.deepEqual(kinds(buildRows(g, new Set(['p-cow']), false)), ['group', 'variant*', 'variant*', 'variant*', 'variant', 'variant']);
  assert.equal(buildRows(g, new Set(), true).length, 6);
  assert.equal(new Set(buildRows(g, new Set(), true).map(r => r.key)).size, 6);
});
test('filter badge counts only non-default filters', () => {
  assert.equal(activeFilterCount(P()), 0); assert.equal(activeFilterCount(P({ stock: 'neg', collectionId: 'c1' })), 2); assert.equal(activeFilterCount(P({ status: 'all' })), 1);
});
