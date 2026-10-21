// Location: tests/demoguard.test.ts
// Patch 0187: Demo mode now runs on a copy of the till's REAL data, so its ids are real ids. A write that slipped past the guard would no
// longer fail harmlessly against a made-up id, it would land. This is the audit that keeps the guard whole: every place in the app that
// can send something out or change a file on the iPad must either check the guard or be listed here with the reason it is safe.
//
// The rule being kept (src/lib/trainingGuard.ts): anything that stays in memory is fine, because leaving puts the real state back; anything
// that leaves the iPad, or changes a file that is already there, is switched off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { setDemoGuard, isTraining, TrainingBlockedError } from '../src/lib/trainingGuard';
import { requestStaffPass } from '../src/lib/passUrl';

const read = (f: string) => readFileSync(f, 'utf8');
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name).split(path.sep).join('/')] : []);
const GUARD = /isTraining\(|kvWriteAllowed\(|TrainingBlockedError|isDemo\(/;
const EFFECTS: Record<string, RegExp> = {
  'a network request': /\bfetch\(/,
  'a file write or delete': /\bFS\.(writeAsStringAsync|deleteAsync|moveAsync|copyAsync|makeDirectoryAsync)\b/,
  'a Keychain write': /\bSecureStore\.(setItemAsync|deleteItemAsync)\b/,
  'a storage write': /\bAsyncStorage\.(setItem|removeItem|multiSet|clear)\b/,
};

/** Files that send or write something and do not check the guard themselves, each with what was checked about it. */
const EXEMPT: Record<string, string> = {
  'src/lib/exportCollect.ts': 'the Export wizard writes one new file in the cache folder for the person to share. Nothing that already exists is changed, and it holds only data the till already shows.',
  'src/lib/shopify/catalogue.ts': 'downloads the result of a bulk query from the URL gql() handed back. gql() stops on the guard, so there is never a URL to fetch.',
  'src/screens/Settings.tsx': 'Backup & transfer writes one new file in the cache folder to share. The export itself (collectBackup) and the restore (applyBackup) are guarded in backupIO.ts.',
  'src/screens/StaffPass.tsx': 'writes one new file in the cache folder to share. The request to the pass server (requestStaffPass) is guarded, and the pass server address is blank in Demo mode.',
};

test('every file that can send something out or change a file on the iPad checks the guard, or is listed with the reason it is safe', () => {
  const unguarded: string[] = []; const seenExempt = new Set<string>(); const staleGuarded: string[] = [];
  for (const f of walk('src')) {
    const src = read(f); const hits = Object.entries(EFFECTS).filter(([, re]) => re.test(src)).map(([k]) => k);
    if (!hits.length) continue;
    if (f in EXEMPT) { seenExempt.add(f); if (GUARD.test(src)) staleGuarded.push(f); continue; }
    if (!GUARD.test(src)) unguarded.push(`${f} (${hits.join(', ')})`);
  }
  assert.deepEqual(unguarded, [], 'These do something that cannot be rolled back and never ask whether Demo mode or training is on. Make them check the guard, or add them to EXEMPT with what you checked:\n  ' + unguarded.join('\n  '));
  assert.deepEqual(Object.keys(EXEMPT).filter(f => !seenExempt.has(f)), [], 'An exemption names a file that no longer sends or writes anything. Remove it.');
  assert.deepEqual(staleGuarded, [], 'These now check the guard themselves, so the exemption is not needed. Remove it.');
});

test('the Square history files are the real ones on the iPad, so all four functions that change them stop first', () => {
  const src = read('src/lib/squareHistoryIO.ts');
  for (const fn of ['installFromUrl', 'installFromPicked', 'rebuild']) {
    assert.match(src, new RegExp(`export async function ${fn}\\([^)]*\\)[^{]*\\{\\s*guardWrite\\(\\);`), `${fn} starts with guardWrite()`);
  }
  assert.match(src, /export async function removeSquareHistory\(\) \{ guardWrite\(\);/, 'removeSquareHistory starts with guardWrite()');
  assert.match(src, /const guardWrite = \(\): void => \{ if \(isTraining\(\)\) throw new TrainingBlockedError\(/);
  // Reading the history is how Reports and Transactions show it, and stays open.
  for (const fn of ['loadSquareRollups', 'loadSquareSales']) {
    const body = src.slice(src.indexOf(`export async function ${fn}`)); assert.doesNotMatch(body.slice(0, body.indexOf('\n}\n')), /guardWrite/, `${fn} is a read`);
  }
});

test('a backup carries the real logins out of the Keychain, so exporting and restoring one stop first', () => {
  const src = read('src/lib/backupIO.ts');
  assert.match(src, /export async function collectBackup\(\)[^{]*\{[^]*?if \(isTraining\(\)\) throw new TrainingBlockedError\('exporting a backup'\)/);
  assert.match(src, /export async function applyBackup\([^)]*\)[^{]*\{\s*if \(isTraining\(\)\) throw new TrainingBlockedError\('restoring a backup'\)/);
  assert.match(src, /async function writeLogoData\([^)]*\)[^{]*\{\s*if \(isTraining\(\)\) return ''/);
});

test('CloudKit is only reached through the sync seam, whose writes check the guard, and the Cloud sync buttons are off', () => {
  const importers = walk('src').filter(f => /from '(\.\.\/)+modules\/cloudkit-sync'/.test(read(f))).sort();
  assert.deepEqual(importers, ['src/lib/cloudkit/cloudkitBackend.ts', 'src/screens/CloudSync.tsx'], 'a new file that imports the native module must be added here after it is checked');
  const seam = read('src/lib/syncBackend.ts');
  assert.match(seam, /if \(!backendWritable\(\)\) throw new BackendBlockedError\(`Writing \$\{type\}`\);\s*return requireBackend\(\)\.put\(/);
  assert.match(seam, /if \(!backendWritable\(\)\) throw new BackendBlockedError\('Deleting a record'\)/);
  assert.match(seam, /export const backendWritable = \(\): boolean => !isTraining\(\)/);
  const callers = walk('src').filter(f => !/^src\/lib\/(cloudkit|shopify\/metaobjectBackend)/.test(f) && f !== 'src/lib/syncBackend.ts' && /\.put\(/.test(read(f)));
  assert.deepEqual(callers, [], 'only the seam may call a backend\'s put()');
  const screen = read('src/screens/CloudSync.tsx');
  for (const spot of ['cloudSyncSetup', 'cloudSyncShare', 'cloudSyncJoin']) assert.match(screen, new RegExp(`spot=\\{SPOT\\.${spot}\\}[^>]*practice`), `the ${spot} button is off while practising`);
});

test('the pass server request is stopped by the guard, before anything is sent', async () => {
  const real = globalThis.fetch; let sent = 0;
  globalThis.fetch = (async () => { sent++; return { ok: false, status: 500, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) } as any; }) as any;
  try {
    setDemoGuard(true); assert.equal(isTraining(), true);
    await assert.rejects(requestStaffPass('https://pass.example', 'secret', { name: 'A', role: 'owner', code: 'x', format: 'qr', shop: 'S' } as any), (e: unknown) => e instanceof TrainingBlockedError);
    assert.equal(sent, 0, 'nothing was sent');
    setDemoGuard(false); assert.equal(isTraining(), false);
    await assert.rejects(requestStaffPass('https://pass.example', 'secret', { name: 'A', role: 'owner', code: 'x', format: 'qr', shop: 'S' } as any), (e: unknown) => !(e instanceof TrainingBlockedError));
    assert.equal(sent, 1, 'and with the guard off the request is made, so it was the guard that stopped it');
  } finally { setDemoGuard(false); globalThis.fetch = real; }
});
