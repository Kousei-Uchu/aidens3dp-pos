// Location: tests/squaresync.test.ts
// CloudKit patch 6a, Square history shards: the transport and the call site on an in-memory fake of the native module and the file system,
// plus source pins for the wiring that cannot be run without an iPad (the poll, the Swift, the module's exports, the device-only key).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSquareSync, type SquareSyncDeps } from '../src/lib/cloudkit/squareSync';
import type { SquareNative } from '../src/lib/cloudkit/squareCloud';
import { parseBase, shardHash, stripCustomers, type LocalMonth } from '../src/lib/squareHistoryShared';
import type { HistSale } from '../src/lib/squareConvert';
import { DEVICE_KEYS } from '../src/lib/backupFile';

type Rec = Record<string, any>;
const NOW = '2026-11-02T10:00:00.000Z';
const read = (p: string) => readFileSync(p, 'utf8');

const sales = (month: string, n: number, withCustomer = true): string => JSON.stringify(Array.from({ length: n }, (_, i) => ({ uuid: `${month}-${i}`, type: 'sale', ts: `${month}-04T01:00:00.000Z`, customer: withCustomer ? { id: `square:C${i}`, name: `Person ${i}`, email: `p${i}@example.com`, phone: '0400 000 000' } : undefined, lines: [], tenders: [] })));
// One shared "disk" of temporary files is fine: each register's own month files live in its own map.
const tmp = new Map<string, string>();

function cloud() {
  const st = { manifest: null as { fields: Rec; tag: number } | null, shards: new Map<string, { fields: Rec; content: string }>() };
  const calls = { shardPuts: 0, manifestPuts: 0, downloads: 0, gets: 0 }; let fail = false; let nextTag = 1; let beforeNextManifestPut: (() => void) | null = null; let tmpN = 0;
  const native: SquareNative = {
    async putSquareShard(handle, f, path) { if (fail) throw new Error('offline'); calls.shardPuts++; if (!st.shards.has(handle)) st.shards.set(handle, { fields: { ...f }, content: tmp.get(path)! }); return f; },
    async getSquareManifest() { if (fail) throw new Error('offline'); calls.gets++; return st.manifest ? { ...st.manifest.fields, tag: String(st.manifest.tag) } : null; },
    async putSquareManifest(f, expected) {
      if (fail) throw new Error('offline'); if (beforeNextManifestPut) { const fn = beforeNextManifestPut; beforeNextManifestPut = null; fn(); }
      const cur = st.manifest; if (cur ? String(cur.tag) !== expected : !!expected) return { changed: true };
      calls.manifestPuts++; st.manifest = { fields: { ...f }, tag: nextTag++ }; return { changed: false, tag: String(st.manifest.tag) };
    },
    async downloadSquareShard(handle) { if (fail) throw new Error('offline'); calls.downloads++; const s = st.shards.get(handle); if (!s) return null; const p = `/tmp/dl-${tmpN++}.json.gz`; tmp.set(p, s.content); return p; },
  };
  return { st, native, calls, setFail: (b: boolean) => { fail = b; }, onNextManifestPut: (fn: () => void) => { beforeNextManifestPut = fn; } };
}

function register(c: ReturnType<typeof cloud>, id: string, name: string, over: Partial<SquareSyncDeps> = {}) {
  const me = { disk: new Map<string, string>(), base: undefined as string | undefined, finished: 0, lastSales: {} as Record<string, number>, n: 0 };
  const deps: SquareSyncDeps = {
    active: () => true, training: () => false, who: () => ({ id, name }), native: async () => c.native,
    listLocal: async (): Promise<LocalMonth[]> => [...me.disk.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, t]) => ({ month, hash: shardHash(t), bytes: t.length, sales: (JSON.parse(t) as unknown[]).length })),
    prepare: async month => { const t = me.disk.get(month); if (t === undefined) return null; const out = JSON.stringify(stripCustomers(JSON.parse(t) as HistSale[])); const p = `/tmp/up-${id}-${me.n++}.json.gz`; tmp.set(p, out); return { path: p, sid: shardHash(out), bytes: out.length }; },
    inspect: async p => { const t = tmp.get(p); return t === undefined ? null : { sid: shardHash(t), bytes: t.length }; },
    install: async (month, p) => { me.disk.set(month, tmp.get(p)!); },
    removeLocal: async month => { me.disk.delete(month); },
    finish: async (_m, s) => { me.finished++; me.lastSales = s; },
    base: () => me.base, setBase: t => { me.base = t; }, now: () => NOW, ...over,
  };
  return { sync: createSquareSync(deps), me };
}
const settle = async (...rs: ReturnType<typeof register>[]) => { for (let i = 0; i < 4; i++) for (const r of rs) await r.sync.run(); };

test('nothing happens when CloudKit is not active, in practice mode, or before the register has an id', async () => {
  for (const over of [{ active: () => false }, { training: () => true }, { who: () => ({ id: '', name: '' }) }]) {
    const c = cloud(); const a = register(c, 'reg-a', 'Front', over); a.me.disk.set('2025-03', sales('2025-03', 2));
    assert.equal(await a.sync.run(), null); assert.equal(c.calls.gets, 0); assert.equal(c.calls.shardPuts, 0);
  }
});

test('a month imported on one register reaches the other, and neither sends it again', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); const b = register(c, 'reg-b', 'Back');
  a.me.disk.set('2025-03', sales('2025-03', 3)); a.me.disk.set('2025-04', sales('2025-04', 2));
  const r = await a.sync.run(); assert.deepEqual(r?.pushed, ['2025-03', '2025-04']);
  assert.equal(c.calls.shardPuts, 2); assert.equal(c.calls.manifestPuts, 1);
  const rb = await b.sync.run(); assert.deepEqual(rb?.pulled, ['2025-03', '2025-04']); assert.equal(b.me.finished, 1);
  assert.deepEqual(b.me.lastSales, { '2025-03': 3, '2025-04': 2 });
  const puts = { s: c.calls.shardPuts, m: c.calls.manifestPuts, d: c.calls.downloads };
  await settle(a, b);
  assert.deepEqual({ s: c.calls.shardPuts, m: c.calls.manifestPuts, d: c.calls.downloads }, puts);
  assert.equal(a.me.finished, 0);
});

test('no customer name, email or phone ever reaches the shop, and the sender keeps its own full copy', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); const full = sales('2025-03', 2); a.me.disk.set('2025-03', full);
  await a.sync.run();
  const stored = JSON.stringify([...c.st.shards.values()]) + JSON.stringify(c.st.manifest);
  assert.ok(!/Person \d|@example\.com|0400/.test(stored));
  assert.equal(a.me.disk.get('2025-03'), full);
  assert.ok(/Person 0/.test(full));
});

test('the receiving register gets the shop\'s copy, and it counts as agreed, so it is not sent back', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); const b = register(c, 'reg-b', 'Back');
  a.me.disk.set('2025-03', sales('2025-03', 2)); await a.sync.run(); await b.sync.run();
  assert.ok(!/Person/.test(b.me.disk.get('2025-03')!));
  const before = c.calls.manifestPuts; await b.sync.run(); await a.sync.run(); assert.equal(c.calls.manifestPuts, before);
  assert.deepEqual(parseBase(b.me.base)['2025-03'].l, parseBase(b.me.base)['2025-03'].s);
});

test('a re-import on one register replaces the month on the other', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); const b = register(c, 'reg-b', 'Back');
  a.me.disk.set('2025-03', sales('2025-03', 2)); await settle(a, b);
  a.me.disk.set('2025-03', sales('2025-03', 5)); await settle(a, b);
  assert.equal((JSON.parse(b.me.disk.get('2025-03')!) as unknown[]).length, 5);
});

test('two registers that hold the same import settle without any download or second upload', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); const b = register(c, 'reg-b', 'Back');
  a.me.disk.set('2025-03', sales('2025-03', 4)); b.me.disk.set('2025-03', sales('2025-03', 4));
  await a.sync.run(); const puts = c.calls.shardPuts; await b.sync.run();
  assert.equal(c.calls.shardPuts, puts); assert.equal(c.calls.downloads, 0); assert.equal(b.me.finished, 0);
  assert.ok(b.me.disk.get('2025-03')!.includes('Person 0'), 'b keeps its own full copy');
});

test('a register that joins with different months keeps its own and gains the shop\'s', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); const b = register(c, 'reg-b', 'Back');
  a.me.disk.set('2025-03', sales('2025-03', 2)); b.me.disk.set('2025-05', sales('2025-05', 2));
  await settle(a, b);
  for (const r of [a, b]) assert.deepEqual([...r.me.disk.keys()].sort(), ['2025-03', '2025-05']);
  assert.deepEqual(Object.keys(JSON.parse(c.st.manifest!.fields.files).reduce((o: Rec, e: Rec) => ({ ...o, [e.m]: 1 }), {})).sort(), ['2025-03', '2025-05']);
});

test('both registers changed the same month: the one with more sales wins on both', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); const b = register(c, 'reg-b', 'Back');
  a.me.disk.set('2025-03', sales('2025-03', 2)); await settle(a, b);
  a.me.disk.set('2025-03', sales('2025-03', 4)); b.me.disk.set('2025-03', sales('2025-03', 9));
  await settle(a, b);
  for (const r of [a, b]) assert.equal((JSON.parse(r.me.disk.get('2025-03')!) as unknown[]).length, 9);
});

test('deleting the history on one register removes it from the shop and the other register', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); const b = register(c, 'reg-b', 'Back');
  a.me.disk.set('2025-03', sales('2025-03', 2)); a.me.disk.set('2025-04', sales('2025-04', 2)); await settle(a, b);
  a.me.disk.clear(); const r = await a.sync.run(); assert.deepEqual(r?.removedShop, ['2025-03', '2025-04']);
  const rb = await b.sync.run(); assert.deepEqual(rb?.removedHere, ['2025-03', '2025-04']); assert.equal(b.me.disk.size, 0); assert.ok(b.me.finished >= 2);
  assert.deepEqual(parseBase(b.me.base), {});
});

test('a month the shop removed is not deleted here if this register changed it since', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); const b = register(c, 'reg-b', 'Back');
  a.me.disk.set('2025-03', sales('2025-03', 2)); await settle(a, b);
  a.me.disk.clear(); await a.sync.run();
  b.me.disk.set('2025-03', sales('2025-03', 6)); await settle(a, b);
  assert.equal((JSON.parse(a.me.disk.get('2025-03')!) as unknown[]).length, 6);
});

test('a register is never made to delete a month on a guess: with an empty shop it sends, and with a full shop it takes', async () => {
  const c = cloud(); const b = register(c, 'reg-b', 'Back'); b.me.disk.set('2025-03', sales('2025-03', 2));
  await b.sync.run(); assert.ok(c.st.manifest); assert.equal(b.me.disk.size, 1);
  const y = register(c, 'reg-y', 'Y'); await y.sync.run(); assert.equal(y.me.disk.size, 1);
});

test('when another register writes the manifest first, nothing is overwritten and the pass is repeated', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); const b = register(c, 'reg-b', 'Back');
  a.me.disk.set('2025-03', sales('2025-03', 2)); b.me.disk.set('2025-05', sales('2025-05', 2));
  await a.sync.run(); await b.sync.run(); // both now know both months
  a.me.disk.set('2025-06', sales('2025-06', 1)); b.me.disk.set('2025-07', sales('2025-07', 1));
  let interrupted = false;
  c.onNextManifestPut(() => { if (interrupted) return; interrupted = true; // b writes in the middle of a's write
    const man = JSON.parse(c.st.manifest!.fields.files) as Rec[]; man.push({ m: '2025-07', s: shardHash(JSON.stringify(stripCustomers(JSON.parse(b.me.disk.get('2025-07')!)))), b: 10, n: 1 });
    const body = JSON.stringify(stripCustomers(JSON.parse(b.me.disk.get('2025-07')!))); c.st.shards.set(`2025-07-${shardHash(body)}`, { fields: {}, content: body });
    c.st.manifest = { fields: { ...c.st.manifest!.fields, files: JSON.stringify(man) }, tag: 999 }; });
  await a.sync.run(); assert.ok(interrupted, 'the other register wrote in the middle of this one'); await settle(a, b);
  const listed = (JSON.parse(c.st.manifest!.fields.files) as Rec[]).map(e => e.m).sort();
  assert.deepEqual(listed, ['2025-03', '2025-05', '2025-06', '2025-07']);
  for (const r of [a, b]) assert.deepEqual([...r.me.disk.keys()].sort(), listed);
});

test('a manifest that cannot be read is left alone: no month is removed or sent', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); a.me.disk.set('2025-03', sales('2025-03', 2)); await a.sync.run();
  c.st.manifest!.fields.files = 'garbage'; const before = { m: c.calls.manifestPuts, s: c.calls.shardPuts };
  assert.equal(await a.sync.run(), null); assert.equal(a.me.disk.size, 1); assert.deepEqual({ m: c.calls.manifestPuts, s: c.calls.shardPuts }, before);
});

test('a download that does not match its shared id is thrown away and the month is left as it was', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); const b = register(c, 'reg-b', 'Back');
  a.me.disk.set('2025-03', sales('2025-03', 2)); await a.sync.run();
  const [h] = [...c.st.shards.keys()]; c.st.shards.get(h)!.content = '[]';
  const r = await b.sync.run(); assert.deepEqual(r?.failed, ['2025-03']); assert.equal(b.me.disk.size, 0); assert.equal(b.me.base, '{}');
  assert.equal(parseBase(b.me.base)['2025-03'], undefined);
});

test('a failure is not thrown and changes nothing, and the next poll finishes the job', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); a.me.disk.set('2025-03', sales('2025-03', 2));
  c.setFail(true); assert.equal(await a.sync.run(), null); assert.equal(a.me.base, undefined);
  c.setFail(false); assert.deepEqual((await a.sync.run())?.pushed, ['2025-03']);
});

test('a month that cannot be packed is skipped and reported, and the others still go', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front', { prepare: async m => (m === '2025-03' ? null : { path: (tmp.set('/tmp/ok', '[]'), '/tmp/ok'), sid: 'okid', bytes: 2 }) });
  a.me.disk.set('2025-03', sales('2025-03', 1)); a.me.disk.set('2025-04', sales('2025-04', 1));
  const r = await a.sync.run(); assert.deepEqual(r?.failed, ['2025-03']); assert.deepEqual(r?.pushed, ['2025-04']);
});

test('the wiring: the poll runs it, the key is device only, the module exports it, and the Swift only writes a shard once', () => {
  const sync = read('src/lib/sync.ts');
  assert.match(sync, /createSquareSync\(\{/); assert.match(sync, /await squareSync\.run\(\)/);
  assert.match(sync, /activeBackendKind\(\) === 'cloudkit'/);
  assert.ok((DEVICE_KEYS as readonly string[]).includes('squareBase')); assert.match(read('src/state/store.ts'), /squareBase\?: string/);
  assert.ok(!/squareBase/.test(read('src/lib/sharedSettings.ts')));
  const idx = read('modules/cloudkit-sync/index.ts'); const status = read('modules/cloudkit-sync/status.ts');
  for (const f of ['putSquareShard', 'getSquareManifest', 'putSquareManifest', 'downloadSquareShard']) { assert.match(idx, new RegExp(`export async function ${f}\\(`)); assert.match(status, new RegExp(`${f}\\?\\(`)); }
  const swift = read('modules/cloudkit-sync/ios/CloudKitSyncModule.swift');
  for (const f of ['putSquareShard', 'getSquareManifest', 'putSquareManifest', 'downloadSquareShard']) assert.match(swift, new RegExp(`AsyncFunction\\("${f}"\\)`));
  const body = (name: string): string => { const i = swift.indexOf(`private func ${name}(`); assert.ok(i >= 0, name); const n = swift.indexOf('\n  private func ', i + 10); return swift.slice(i, n < 0 ? undefined : n); };
  assert.match(body('putSquareShardOnce'), /serverRecordChanged/); assert.match(body('putSquareShardOnce'), /\.record\(for: id\)/);
  const m = body('putSquareManifest'); assert.match(m, /recordChangeTag == expected/); assert.match(m, /"changed": true/); assert.match(m, /serverRecordChanged/);
  assert.match(body('validShardHandle'), /\[0-9\]\{4\}-\[0-9\]\{2\}-/);
});
test('the source never sends a customer\'s details: the copy is made by stripCustomers and only the transport writes a shard', () => {
  const io = read('src/lib/squareHistorySyncIO.ts');
  assert.match(io, /packStable\(stripCustomers\(/);
  assert.ok(!/uploadShard|putSquareShard/.test(io));
  assert.match(read('src/lib/cloudkit/squareSync.ts'), /await d\.prepare\(month\)[\s\S]*uploadShard\(n, w\.id, w\.name, e, prep\.path/);
});
