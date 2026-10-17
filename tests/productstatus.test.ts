// Location: tests/productstatus.test.ts
// Shopify product status: Active and Unlisted are sold and shown; Draft and Archived are not.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isSellableStatus, parseProductStatus } from '../src/lib/productStatus';
import { defaultInvPrefs, filterVariants, statusOf } from '../src/lib/inventoryView';
import type { Variant } from '../src/lib/types';

const V = (id: string, status: Variant['status']): Variant => ({ id, productId: `p-${id}`, productTitle: id, variantTitle: '', priceCents: 1000, tracked: true, stock: 5, tags: [], active: isSellableStatus(status), status });

test('Active and Unlisted are sellable; Draft, Archived and anything unknown are not', () => {
  assert.equal(isSellableStatus(parseProductStatus('ACTIVE')), true);
  assert.equal(isSellableStatus(parseProductStatus('UNLISTED')), true);
  assert.equal(isSellableStatus(parseProductStatus('DRAFT')), false);
  assert.equal(isSellableStatus(parseProductStatus('ARCHIVED')), false);
  assert.equal(parseProductStatus('SOMETHING_NEW'), undefined);
  assert.equal(isSellableStatus(undefined), false);
});

test('Inventory: the default Active view includes Unlisted, Draft and Archived stay behind their own filters', () => {
  const data = [V('a', 'ACTIVE'), V('u', 'UNLISTED'), V('d', 'DRAFT'), V('r', 'ARCHIVED')];
  const names = (status: any) => filterVariants(data, { ...defaultInvPrefs(), status }, '', null).map(v => v.id);
  assert.deepEqual(names('active'), ['a', 'u']);
  assert.deepEqual(names('draft'), ['d']);
  assert.deepEqual(names('archived'), ['r']);
  assert.deepEqual(names('all'), ['a', 'u', 'd', 'r']);
  assert.equal(statusOf(data[1]), 'UNLISTED');
});
