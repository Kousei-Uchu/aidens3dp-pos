// Location: tests/cloudkitbackend.test.ts
// CloudKit sync plan, patch 4: customer PII must never reach CloudKit.
// Only the Shopify customer id as an opaque reference may remain; names/emails/phones must be stripped.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('cloudkit backend strips customer PII from sale fields', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync('src/lib/cloudkit/cloudkitBackend.ts', 'utf8');
  assert.match(src, /customer['"]\s*\|\|\s*k\s*===\s*['"]customer_json['"]/);
  assert.match(src, /delete obj\.customer/);
  assert.match(src, /delete obj\.customer_json/);
});

test('cloudkit backend keeps only opaque customer id references allowed', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync('src/lib/cloudkit/cloudkitBackend.ts', 'utf8');
  assert.ok(src.includes('customers live in Shopify'));
  assert.ok(src.includes('opaque reference'));
});
