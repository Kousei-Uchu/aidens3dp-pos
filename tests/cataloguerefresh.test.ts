// Location: tests/cataloguerefresh.test.ts
// 0244: when the catalogue and stock are read again on their own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGUE_REFRESH_MS, refreshDue } from '../src/lib/catalogueRefresh';

const now = Date.parse('2026-11-15T12:00:00Z'); const ago = (ms: number) => new Date(now - ms).toISOString(); const L = 'gid://shopify/Location/1';

test('due after half an hour, not before', () => {
  assert.equal(refreshDue(ago(CATALOGUE_REFRESH_MS - 1000), L, L, now, 0), false);
  assert.equal(refreshDue(ago(CATALOGUE_REFRESH_MS), L, L, now, 0), true);
});
test('a different location is due straight away, an older import with no location too', () => {
  assert.equal(refreshDue(ago(1000), 'gid://shopify/Location/2', L, now, 0), true);
  assert.equal(refreshDue(ago(1000), undefined, L, now, 0), true);
});
test('never while sales are queued, with no location, or before the first import', () => {
  assert.equal(refreshDue(ago(CATALOGUE_REFRESH_MS * 3), L, L, now, 1), false);
  assert.equal(refreshDue(ago(CATALOGUE_REFRESH_MS * 3), L, undefined, now, 0), false);
  assert.equal(refreshDue(undefined, undefined, L, now, 0), false);
});
test('an unreadable import time counts as due', () => { assert.equal(refreshDue('nonsense', L, L, now, 0), true); });
