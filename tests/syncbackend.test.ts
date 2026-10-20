// Location: tests/syncbackend.test.ts
// CloudKit sync plan, patch 3: the shared-state seam. These tests pin the contract every backend must keep, using a fake
// backend so nothing touches the network: the selector, the missing-backend sentence, the training block on writes, and the
// one detail capability a backend may or may not offer. The metaobject backend itself is wired in App.tsx and exercised on a
// device; here the shape above it is what matters.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeBackend,
  activeBackendKind,
  backendWritable,
  detailReadyShared,
  ensureShared,
  getShared,
  listShared,
  putShared,
  removeShared,
  setBackend,
  BackendBlockedError,
  SHARED_TYPES,
  type BackendRow,
  type SharedBackend,
  type SharedType,
} from '../src/lib/syncBackend';
import { setTrainingGuard } from '../src/lib/trainingGuard';

const row = (id: string, f: Record<string, string> = {}): BackendRow => ({ id, handle: id, updatedAt: '2026-10-20T00:00:00Z', f });

/** A backend that records what it was asked, so the seam can be checked without Shopify or CloudKit. */
function fakeBackend(over: Partial<SharedBackend> = {}): { backend: SharedBackend; calls: string[]; rows: Map<string, BackendRow> } {
  const calls: string[] = [];
  const rows = new Map<string, BackendRow>();
  const backend: SharedBackend = {
    kind: 'cloudkit',
    ensure: async () => { calls.push('ensure'); },
    get: async (t, h) => { calls.push(`get:${t}:${h}`); return rows.get(`${t}:${h}`) ?? null; },
    put: async (t, h, f) => { calls.push(`put:${t}:${h}`); const r = row(h, Object.fromEntries(Object.entries(f).map(([k, v]) => [k, String(v)]))); rows.set(`${t}:${h}`, r); return r; },
    list: async (t, o) => { calls.push(`list:${t}:${o?.first ?? ''}:${o?.after ?? ''}`); return { rows: [...rows.entries()].filter(([k]) => k.startsWith(`${t}:`)).map(([, v]) => v), next: null }; },
    remove: async id => { calls.push(`remove:${id}`); },
    ...over,
  };
  return { backend, calls, rows };
}

test('a backend installs and reports its kind', () => {
  const { backend } = fakeBackend();
  setBackend(backend);
  assert.equal(activeBackend(), backend);
  assert.equal(activeBackendKind(), 'cloudkit');
  setBackend(null);
  assert.equal(activeBackendKind(), 'none');
});

test('every call needs a backend, and says so plainly when there is none', async () => {
  setBackend(null);
  // A missing backend is a programming mistake, so it throws at once rather than returning a rejected promise.
  assert.throws(() => ensureShared(), /not connected/);
  assert.throws(() => getShared('sale', 'x'), /not connected/);
  assert.throws(() => listShared('cart'), /not connected/);
  assert.throws(() => putShared('cart', 'x', {}), /not connected/);
  assert.throws(() => removeShared('x'), /not connected/);
});

test('reads and writes go through whichever backend is installed', async () => {
  const { backend, calls, rows } = fakeBackend();
  rows.set('layout:main', row('main', { version: '3' }));
  setBackend(backend);

  assert.deepEqual(await getShared('layout', 'main'), row('main', { version: '3' }));
  const written = await putShared('settings', 'drawer', { version: 4, shift: 'open' });
  assert.equal(written.f.version, '4');
  assert.equal(written.f.shift, 'open');
  const page = await listShared('layout', { first: 50, after: 'c1' });
  assert.equal(page.rows.length, 1);
  assert.equal(page.next, null);
  await removeShared('abc');

  assert.deepEqual(calls, ['get:layout:main', 'put:settings:drawer', 'list:layout:50:c1', 'remove:abc']);
  setBackend(null);
});

test('writes are refused in training mode, reads are not', async () => {
  const { backend, calls } = fakeBackend();
  setBackend(backend);
  setTrainingGuard(true);
  try {
    assert.equal(backendWritable(), false);
    assert.throws(() => putShared('sale', 's1', { total_cents: 1 }), BackendBlockedError);
    assert.throws(() => removeShared('s1'), BackendBlockedError);
    // a course may still read real history to teach on it
    await getShared('sale', 's1');
    await listShared('sale');
    assert.deepEqual(calls, ['get:sale:s1', 'list:sale::']);
  } finally {
    setTrainingGuard(false);
    setBackend(null);
  }
});

test('a backend with no detail concern always answers ready', async () => {
  const { backend } = fakeBackend(); // the fake carries no detailReady
  setBackend(backend);
  for (const t of SHARED_TYPES) assert.equal(await detailReadyShared(t), true);
  setBackend(null);
});

test('a backend that knows its detail state is asked instead of assumed', async () => {
  const asked: SharedType[] = [];
  const { backend } = fakeBackend({ detailReady: async t => { asked.push(t); return t !== 'sale'; } });
  setBackend(backend);
  assert.equal(await detailReadyShared('sale'), false);
  assert.equal(await detailReadyShared('cart'), true);
  assert.deepEqual(asked, ['sale', 'cart']);
  setBackend(null);
});
