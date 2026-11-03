// Location: tests/secretsync.test.ts
// CloudKit patch 6d, secrets (call sites): what a run reads and sends, that nothing happens unless CloudKit is active, the encrypted switch
// is on and it is not a practice run, that an unreadable shop record is never written over, that one failure does not stop the rest, and that
// the remembered base only moves for what succeeded. An in-memory fake stands in for the native module and the Keychain.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SECRET_FIELD, fingerprint, secretToParts } from '../src/lib/secretsShared';
import { createSecretSync, type SecretSyncDeps } from '../src/lib/cloudkit/secretSync';
import type { SecretNative } from '../src/lib/cloudkit/secretCloud';

type Rec = Record<string, any>;
const fakeNative = (seed: Record<string, string | 'unreadable'> = {}) => {
  const rows = new Map<string, Rec>(); const puts: { handle: string; plain: Rec; encrypted: Rec }[] = [];
  let failPut: string | null = null;
  const install = (name: string, value: string | 'unreadable') => {
    if (value === 'unreadable') { rows.set(name, { recordName: `secret-${name}` }); return; }
    const p = secretToParts(name, value, 'other', 1, 'encrypted')!; rows.set(name, { recordName: `secret-${name}`, ...p.plain, encrypted: p.encrypted });
  };
  for (const [k, v] of Object.entries(seed)) install(k, v);
  const n: SecretNative = {
    async putSecret(handle, plain, encrypted) { if (failPut === handle) throw new Error('boom'); puts.push({ handle, plain, encrypted }); rows.set(handle, { recordName: `secret-${handle}`, ...plain, encrypted }); return {}; },
    async listSecrets() { return { rows: [...rows.values()], next: null }; },
  };
  return { n, rows, puts, failOn: (h: string | null) => { failPut = h; }, install };
};

const setup = (o: { local?: Record<string, string>; shop?: Record<string, string | 'unreadable'>; base?: Record<string, string>; mode?: 'omit' | 'encrypted'; active?: boolean; training?: boolean; names?: string[]; writeOk?: (n: string) => boolean } = {}) => {
  const keychain: Record<string, string> = { ...(o.local ?? {}) }; let base = { ...(o.base ?? {}) }; const saves: number[] = [];
  const fake = fakeNative(o.shop);
  const deps: SecretSyncDeps = {
    active: () => o.active ?? true, training: () => o.training ?? false, who: () => ({ id: 'reg-a' }), native: async () => fake.n, mode: () => o.mode ?? 'encrypted',
    localNames: () => o.names ?? [], read: async n => keychain[n] ?? null,
    write: async (n, v) => { if (o.writeOk && !o.writeOk(n)) return false; keychain[n] = v; return true; },
    loadBase: async () => ({ ...base }), saveBase: async b => { base = { ...b }; saves.push(1); }, now: () => 5000,
  };
  return { sync: createSecretSync(deps), keychain, fake, base: () => base, saves };
};

test('a secret only this register has is sent encrypted, and remembered as agreed', async () => {
  const s = setup({ local: { pass: 'P1' } });
  const r = await s.sync.run();
  assert.deepEqual(r, { sent: ['pass'], taken: [], conflicts: [], failed: [] });
  assert.equal(s.fake.puts.length, 1); assert.equal(s.fake.puts[0].handle, 'pass'); assert.deepEqual(Object.keys(s.fake.puts[0].encrypted), [SECRET_FIELD]);
  assert.ok(!JSON.stringify(s.fake.puts[0].plain).includes('P1')); assert.equal(s.base().pass, fingerprint('P1'));
});
test('a secret only the shop has is kept on this register', async () => {
  const s = setup({ shop: { claim: 'C9' } });
  const r = await s.sync.run(); assert.deepEqual(r?.taken, ['claim']); assert.equal(s.keychain.claim, 'C9'); assert.equal(s.fake.puts.length, 0); assert.equal(s.base().claim, fingerprint('C9'));
});
test('pass codes for each cashier are read from the names the register supplies', async () => {
  const s = setup({ local: { 'badge.u1': 'B1' }, names: ['badge.u1', 'badge.u2'], shop: { 'badge.u2': 'B2' } });
  const r = await s.sync.run(); assert.deepEqual(r?.sent, ['badge.u1']); assert.deepEqual(r?.taken, ['badge.u2']); assert.equal(s.keychain['badge.u2'], 'B2');
});
test('two registers on one secret change nothing the second time round', async () => {
  const s = setup({ local: { pass: 'P1' } }); await s.sync.run(); const again = await s.sync.run();
  assert.deepEqual(again, { sent: [], taken: [], conflicts: [], failed: [] }); assert.equal(s.fake.puts.length, 1);
});
test('a change here is sent and a change at the shop is taken, using what was agreed last time', async () => {
  const a = setup({ local: { pass: 'P2' }, shop: { pass: 'P1' }, base: { pass: fingerprint('P1') } }); assert.deepEqual((await a.sync.run())?.sent, ['pass']);
  const b = setup({ local: { pass: 'P1' }, shop: { pass: 'P2' }, base: { pass: fingerprint('P1') } }); const rb = await b.sync.run(); assert.deepEqual(rb?.taken, ['pass']); assert.equal(b.keychain.pass, 'P2'); assert.deepEqual(rb?.conflicts, []);
});
test('both changed: the shop wins, and the run says it was a conflict', async () => {
  const s = setup({ local: { pass: 'MINE' }, shop: { pass: 'THEIRS' }, base: { pass: fingerprint('OLD') } });
  const r = await s.sync.run(); assert.deepEqual(r?.conflicts, ['pass']); assert.equal(s.keychain.pass, 'THEIRS'); assert.equal(s.fake.puts.length, 0);
});
test('a secret removed on this register stays removed, and is not deleted at the shop', async () => {
  const s = setup({ shop: { shopify: 'LOGIN' }, base: { shopify: fingerprint('LOGIN') } });
  const r = await s.sync.run(); assert.deepEqual(r, { sent: [], taken: [], conflicts: [], failed: [] }); assert.equal(s.keychain.shopify, undefined); assert.ok(s.fake.rows.has('shopify'));
});
test('a shop record this device cannot read is left alone, never treated as missing', async () => {
  const s = setup({ local: { pass: 'P1' }, shop: { pass: 'unreadable' } });
  const r = await s.sync.run(); assert.deepEqual(r, { sent: [], taken: [], conflicts: [], failed: [] }); assert.equal(s.fake.puts.length, 0); assert.equal(s.keychain.pass, 'P1'); assert.equal(s.base().pass, undefined);
});
test('nothing is read or sent in omit mode, when CloudKit is not active, or in practice mode', async () => {
  for (const o of [{ mode: 'omit' as const }, { active: false }, { training: true }]) {
    const s = setup({ local: { pass: 'P1' }, shop: { claim: 'C' }, ...o }); assert.equal(await s.sync.run(), null); assert.equal(s.fake.puts.length, 0); assert.equal(s.keychain.claim, undefined); assert.equal(s.saves.length, 0);
  }
});
test('one failed send does not stop the others, and only what worked is remembered', async () => {
  const s = setup({ local: { pass: 'P1', claim: 'C1' } }); s.fake.failOn('pass');
  const r = await s.sync.run(); assert.deepEqual(r?.failed, ['pass']); assert.deepEqual(r?.sent, ['claim']); assert.equal(s.base().claim, fingerprint('C1')); assert.equal(s.base().pass, undefined);
  s.fake.failOn(null); assert.deepEqual((await s.sync.run())?.sent, ['pass']);
});
test('a name this register does not know how to keep is skipped without changing its base', async () => {
  const s = setup({ shop: { 'badge.zz': 'B' }, writeOk: n => n !== 'badge.zz' });
  const r = await s.sync.run(); assert.deepEqual(r?.taken, []); assert.equal(s.base()['badge.zz'], undefined);
});
test('no register id means nothing is sent', async () => {
  const s = setup({ local: { pass: 'P1' } }); const sync = createSecretSync({ ...({} as SecretSyncDeps), active: () => true, training: () => false, who: () => ({ id: '' }), native: async () => s.fake.n, mode: () => 'encrypted', localNames: () => [], read: async () => 'x', write: async () => true, loadBase: async () => ({}), saveBase: async () => {} });
  assert.equal(await sync.run(), null);
});
