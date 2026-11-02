// Location: tests/logosync.test.ts
// CloudKit patch 6a, the logo: the transport and the call site on an in-memory fake of the native module and the file system,
// plus source pins for the wiring that cannot be run without an iPad (the poll, the Swift, the module's exports, the device-only key).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLogoSync, type LocalLogo, type LogoSyncDeps } from '../src/lib/cloudkit/logoSync';
import type { LogoNative } from '../src/lib/cloudkit/logoCloud';
import { logoHash, logoTypeOfPath, MAX_LOGO_BYTES, type LogoType } from '../src/lib/logoShared';
import { DEVICE_KEYS } from '../src/lib/backupFile';

type Rec = Record<string, any>;
const NOW = '2026-11-02T10:00:00.000Z';

/** The shop's one logo record, with the asset as the text of the file. */
function cloud() {
  const state: { rec: Rec | null; asset: string | null } = { rec: null, asset: null };
  const calls = { puts: 0, gets: 0, downloads: 0 }; let fail = false; let tmp = 0;
  const native: LogoNative = {
    async putLogo(f, path) { if (fail) throw new Error('offline'); calls.puts++; state.rec = { ...f }; state.asset = path ? files.get(path) ?? null : null; return state.rec; },
    async getLogo() { if (fail) throw new Error('offline'); calls.gets++; return state.rec ? { ...state.rec } : null; },
    async downloadLogo() { if (fail) throw new Error('offline'); calls.downloads++; if (state.asset === null) return null; const p = `/tmp/dl-${tmp++}.${state.rec?.mime === 'image/jpeg' ? 'jpg' : 'png'}`; files.set(p, state.asset); return p; },
  };
  return { native, state, calls, setFail: (b: boolean) => { fail = b; } };
}
// One shared "disk" is fine: each register's own files get distinct names.
const files = new Map<string, string>();

function register(c: ReturnType<typeof cloud>, id: string, name: string, over: Partial<LogoSyncDeps> = {}) {
  const me = { path: '', base: null as string | null, n: 0 };
  const set = (content: string | null) => { if (me.path) files.delete(me.path); me.path = content === null ? '' : `/docs/${id}/logo-${me.n++}.png`; if (content !== null) files.set(me.path, content); };
  const deps: LogoSyncDeps = {
    active: () => true, training: () => false, who: () => ({ id, name }), native: async () => c.native,
    readLocal: async (): Promise<LocalLogo> => { if (!me.path) return null; const t = files.get(me.path)!; if (t.length > MAX_LOGO_BYTES) return { tooBig: true }; return { path: me.path, hash: logoHash(t), type: 'image/png', bytes: t.length }; },
    inspect: async p => { const t = files.get(p); const type = logoTypeOfPath(p); return t === undefined || !type ? null : { hash: logoHash(t), type: type as LogoType, bytes: t.length }; },
    install: async (p) => { const t = files.get(p)!; set(t); },
    clear: async () => set(null),
    base: () => me.base, setBase: h => { me.base = h; }, now: () => NOW, ...over,
  };
  return { sync: createLogoSync(deps), me, set, content: () => (me.path ? files.get(me.path) : null) };
}

test('nothing happens when CloudKit is not active, in practice mode, or before the register has an id', async () => {
  for (const over of [{ active: () => false }, { training: () => true }, { who: () => ({ id: '', name: '' }) }]) {
    const c = cloud(); const a = register(c, 'reg-a', 'Front', over); a.set('PNGDATA');
    assert.equal(await a.sync.run(), null); assert.equal(c.calls.gets, 0); assert.equal(c.calls.puts, 0);
  }
});

test('a logo uploaded on one register reaches the other, and neither sends it again', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); const b = register(c, 'reg-b', 'Back');
  a.set('PNGDATA'); assert.equal(await a.sync.run(), 'pushed'); assert.equal(c.state.rec?.registerName, 'Front'); assert.equal(c.state.asset, 'PNGDATA');
  assert.equal(await b.sync.run(), 'pulled'); assert.equal(b.content(), 'PNGDATA');
  const puts = c.calls.puts; const downloads = c.calls.downloads;
  assert.equal(await a.sync.run(), 'none'); assert.equal(await b.sync.run(), 'none');
  assert.equal(c.calls.puts, puts, 'no second write'); assert.equal(c.calls.downloads, downloads, 'the image is not downloaded when nothing changed');
});

test('replacing the logo on one register replaces it on the other', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); const b = register(c, 'reg-b', 'Back');
  a.set('ONE'); await a.sync.run(); await b.sync.run();
  a.set('TWO'); assert.equal(await a.sync.run(), 'pushed'); assert.equal(await b.sync.run(), 'pulled'); assert.equal(b.content(), 'TWO');
});

test('removing the logo on one register removes it on the other, and the shop keeps a removed record, not an image', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); const b = register(c, 'reg-b', 'Back');
  a.set('ONE'); await a.sync.run(); await b.sync.run();
  a.set(null); assert.equal(await a.sync.run(), 'pushed'); assert.equal(c.state.rec?.removed, 1); assert.equal(c.state.asset, null);
  assert.equal(await b.sync.run(), 'cleared'); assert.equal(b.content(), null);
  assert.equal(await b.sync.run(), 'none'); assert.equal(await a.sync.run(), 'none');
});

test('a register that has just joined takes the shop\'s logo, and one with no logo sends nothing when the shop has none', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); const b = register(c, 'reg-b', 'Back');
  assert.equal(await b.sync.run(), 'none'); assert.equal(c.calls.puts, 0);
  a.set('SHOP'); await a.sync.run(); b.set('OLDER'); assert.equal(await b.sync.run(), 'pulled'); assert.equal(b.content(), 'SHOP');
});

test('both registers changing the logo at once: the one that runs second after the shop changed keeps its own, and the other follows', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); const b = register(c, 'reg-b', 'Back');
  a.set('ONE'); await a.sync.run(); await b.sync.run();
  a.set('FROM-A'); b.set('FROM-B'); await a.sync.run();
  assert.equal(await b.sync.run(), 'pushed'); assert.equal(c.state.asset, 'FROM-B');
  assert.equal(await a.sync.run(), 'pulled'); assert.equal(a.content(), 'FROM-B');
});

test('an offline register changes nothing and tries again, and its base does not move on a failure', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); a.set('ONE'); c.setFail(true);
  assert.equal(await a.sync.run(), null); assert.equal(a.me.base, null); assert.equal(c.state.rec, null);
  c.setFail(false); assert.equal(await a.sync.run(), 'pushed'); assert.equal(a.me.base, logoHash('ONE'));
});

test('a downloaded image whose content does not match what the shop recorded is not installed', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); const b = register(c, 'reg-b', 'Back');
  a.set('GOOD'); await a.sync.run(); c.state.asset = 'SWAPPED'; b.set('MINE');
  assert.equal(await b.sync.run(), null); assert.equal(b.content(), 'MINE'); assert.equal(b.me.base, null);
});

test('a download that finds no image changes nothing', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); const b = register(c, 'reg-b', 'Back');
  a.set('GOOD'); await a.sync.run(); c.state.asset = null; b.set('MINE');
  assert.equal(await b.sync.run(), null); assert.equal(b.content(), 'MINE');
});

test('an image over the size limit is never sent, and the shop\'s does not replace it unseen', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); const b = register(c, 'reg-b', 'Back');
  b.set('SHOP'); await b.sync.run();
  a.set('X'.repeat(MAX_LOGO_BYTES + 1)); assert.equal(await a.sync.run(), 'none'); assert.equal(c.state.asset, 'SHOP'); assert.equal(a.content()?.length, MAX_LOGO_BYTES + 1);
});

test('a run that overlaps another is skipped, not doubled', async () => {
  const c = cloud(); const a = register(c, 'reg-a', 'Front'); a.set('ONE');
  const [r1, r2] = await Promise.all([a.sync.run(), a.sync.run()]);
  assert.deepEqual([r1, r2].sort(), ['pushed', null].sort()); assert.equal(c.calls.puts, 1);
});

// ── source pins: the wiring that needs an iPad to run ───────────────────────────────────────────────────────────────────────
const read = (p: string): string => readFileSync(p, 'utf8');

test('the poll runs the logo reconcile after the notices, only outside practice mode', () => {
  const s = read('src/lib/sync.ts'); const poll = s.slice(s.indexOf('export async function pollShared'));
  const train = poll.indexOf('if (!isTraining()) {'); const logo = poll.indexOf('await logoSync.run()'); const notices = poll.indexOf('await noticeSync.pull()');
  assert.ok(train >= 0 && notices > train && logo > notices, 'inside the practice-mode guard, after the notices');
  assert.match(s, /createLogoSync\(\{[\s\S]*active: \(\) => activeBackendKind\(\) === 'cloudkit'[\s\S]*training: isTraining/);
});

test('the file work is loaded on demand so sync.ts still imports in the node tests', () => {
  const s = read('src/lib/sync.ts'); assert.ok(!/^import .*logoFiles/m.test(s)); assert.match(s, /await import\('\.\/logoFiles'\)/);
});

test('what the logo is agreed on is a device-only setting, never restored from a backup or shared', () => {
  assert.ok((DEVICE_KEYS as readonly string[]).includes('logoBase'));
  assert.match(read('src/state/store.ts'), /logoBase\?: string/);
  assert.ok(!/logoBase/.test(read('src/lib/sharedSettings.ts')));
});

test('installing a downloaded logo is blocked in practice mode and removes the old file', () => {
  const f = read('src/lib/logoFiles.ts');
  assert.match(f, /installDownloadedLogo[\s\S]*if \(isTraining\(\)\) return/); assert.match(f, /deleteAsync\(old/);
  assert.match(f, /screensaver: \{ \.\.\.ss, logoFile: to \}/);
});

test('the native module exposes putLogo, getLogo and downloadLogo with the names the transport expects, and the poll never downloads', () => {
  const swift = read('modules/cloudkit-sync/ios/CloudKitSyncModule.swift');
  for (const name of ['putLogo', 'getLogo', 'downloadLogo']) assert.match(swift, new RegExp(`AsyncFunction\\("${name}"\\)`));
  assert.match(swift, /recordName: "logo-current"/); assert.match(swift, /CKAsset\(fileURL:/); assert.match(swift, /record\["asset"\] = nil/);
  const getFields = swift.slice(swift.indexOf('private func getLogoFields'), swift.indexOf('private func downloadLogoFile'));
  assert.match(getFields, /desiredKeys: plain/); assert.ok(!/"asset"/.test(getFields), 'reading the fields does not ask for the image');
  const idx = read('modules/cloudkit-sync/index.ts'); for (const name of ['putLogo', 'getLogo', 'downloadLogo']) assert.match(idx, new RegExp(`export async function ${name}\\(`));
  const st = read('modules/cloudkit-sync/status.ts'); for (const name of ['putLogo', 'getLogo', 'downloadLogo']) assert.match(st, new RegExp(`${name}\\?\\(`));
});

test('the temporary file the Swift hands back is named by the stored type, so the app can tell the image type', () => {
  const swift = read('modules/cloudkit-sync/ios/CloudKitSyncModule.swift'); const dl = swift.slice(swift.indexOf('private func downloadLogoFile'));
  assert.match(dl, /"image\/png": "png"/); assert.match(dl, /appendingPathComponent\("shared-logo-/);
});
