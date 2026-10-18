import { test, describe } from 'node:test';
import assert from 'node:assert';
import { buildWarningListEntries, mergeWarningList, MAX_LIST_ENTRIES } from '../src/lib/warningList';
import type { Cart, CartWarning, Variant } from '../src/lib/types';

const cat = {
  variants: {
    v1: { id: 'v1', productId: 'p1', productTitle: 'Widget', variantTitle: 'Blue', sku: 'W-B', priceCents: 200, stock: null, tracked: false, active: true, tags: [] },
  } as Record<string, Variant>,
  collectionsOfProduct: { p1: [] },
};

function makeCart(): Cart {
  return {
    id: 'c1',
    lines: [{ id: 'l1', kind: 'item', variantId: 'v1', title: 'Widget · Blue', variantTitle: 'Blue', qty: 1, unitCents: 200 }],
  };
}

describe('warning list', () => {
  test('queues mode=list entries', () => {
    const cart = makeCart();
    const warnings: CartWarning[] = [{
      id: 'w1', enabled: true, title: 'Restock', body: '{{ item.name }} sold - restock display', scope: 'variant', targetId: 'v1', alwaysShow: false, requireAcknowledgement: false, mode: 'queue',
    }];
    const entries = buildWarningListEntries(cart, warnings, cat, { cartTotalCents: 200, now: new Date('2020-01-01T10:00:00Z') });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].message, 'Widget · Blue sold - restock display');
    assert.deepEqual(entries[0].items, ['Widget · Blue']);
  });
  test('does not queue mode=charge', () => {
    const cart = makeCart();
    const warnings: CartWarning[] = [{
      id: 'w1', enabled: true, title: 'Restock', body: 'restock', scope: 'variant', targetId: 'v1', alwaysShow: false, requireAcknowledgement: false, mode: 'charge',
    }];
    const entries = buildWarningListEntries(cart, warnings, cat);
    assert.equal(entries.length, 0);
  });
  test('merges by id and caps', () => {
    const local = Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, ts: `2020-01-01T10:0${i}:00Z`, warningId: 'w', title: 't', message: 'm', items: [] }));
    const remote = [{ id: 'b0', ts: '2020-01-01T11:00:00Z', warningId: 'w', title: 't', message: 'm', items: [] }];
    const merged = mergeWarningList(local, remote);
    assert.ok(merged.length >= 11);
    assert.equal(merged[0].id, 'b0'); // newest first
    const huge = Array.from({ length: MAX_LIST_ENTRIES + 20 }, (_, i) => ({ id: `x${i}`, ts: `2020-01-02T00:00:${String(i).padStart(2,'0')}Z`, warningId: 'w', title: 't', message: 'm', items: [] }));
    const capped = mergeWarningList(huge, []);
    assert.equal(capped.length, MAX_LIST_ENTRIES);
  });
});