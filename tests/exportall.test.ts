// Location: tests/exportall.test.ts
// CloudKit patch 6e (N3, O5): the owner-only export of everything in CloudKit as one zip of JSON. The reading, the files, the manifest and
// the zip, on an in-memory fake of the native module; plus source pins that only an owner is offered it and it asks first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { COLLECTIONS, MAX_PAGES, PAGE, SINGLES, collectExport, exportFolderName, exportSummary, readAll, zipExport, type ExportNative } from '../src/lib/cloudkit/exportAll';

type Rec = Record<string, any>;
function fakeNative(data: Record<string, Rec[]> = {}, singles: Record<string, Rec | null> = {}, o: { fail?: string; endless?: string } = {}) {
  const pager = (key: string) => async (limit: number, after: string | null) => {
    if (o.fail === key) throw new Error('CloudKit said no');
    const rows = data[key] ?? []; const from = after ? Number(after) : 0;
    if (o.endless === key) return { rows: [{ n: from }], next: String(from + 1) };
    return { rows: rows.slice(from, from + limit), next: from + limit < rows.length ? String(from + limit) : null };
  };
  const n: Rec = {};
  for (const c of COLLECTIONS) n[c.list] = pager(c.list);
  for (const s of SINGLES) n[s.get] = async () => { if (o.fail === s.get) throw new Error('CloudKit said no'); return singles[s.get] ?? null; };
  return n as unknown as ExportNative;
}
const meta = { exportedAt: '2026-11-02T09:05:00.000Z', registerId: 'r1', registerName: 'Front till' };
const many = (n: number, prefix = 'sale') => Array.from({ length: n }, (_, i) => ({ recordName: `${prefix}-${i}`, v: i }));

test('every record type the app keeps in CloudKit has a file, and nothing is listed twice', () => {
  const files = [...COLLECTIONS.map(c => c.file), ...SINGLES.map(s => s.file)];
  assert.equal(new Set(files).size, files.length);
  for (const f of ['sales', 'rollups', 'saved-carts', 'settings', 'layout', 'drawer-ledger-entries', 'drawer-shift', 'drawer-checkpoint', 'events', 'payment-attempts', 'payment-resolutions', 'notices', 'training-progress', 'audit-events', 'migration', 'logo', 'square-manifest']) assert.ok(files.includes(f), f);
});

test('a list longer than a page is read to the end, in order', async () => {
  const all = await readAll('sales', async (limit, after) => { const rows = many(PAGE * 2 + 7); const from = after ? Number(after) : 0; return { rows: rows.slice(from, from + limit), next: from + limit < rows.length ? String(from + limit) : null }; });
  assert.equal(all.length, PAGE * 2 + 7); assert.equal(all[0].recordName, 'sale-0'); assert.equal(all.at(-1)!.recordName, `sale-${PAGE * 2 + 6}`);
});

test('a list that fails names itself and stops the whole export; so does a list that never ends', async () => {
  await assert.rejects(collectExport(fakeNative({}, {}, { fail: 'listEvents' }), meta), /Could not read events: CloudKit said no/);
  await assert.rejects(collectExport(fakeNative({}, {}, { fail: 'getDrawerShift' }), meta), /Could not read drawer-shift: CloudKit said no/);
  await assert.rejects(readAll('sales', async (_l, a) => ({ rows: [], next: String(Number(a ?? 0) + 1) })), /did not end/);
  assert.ok(MAX_PAGES >= 1000);
});

test('the files hold the records exactly as returned, with a manifest of counts and a README', async () => {
  const r = await collectExport(fakeNative({ listSales: many(250), listEvents: many(3, 'event') }, { getDrawerShift: { recordName: 'drawer-shift', open: 1 } }), meta);
  assert.equal(JSON.parse(r.files['sales.json']).length, 250); assert.equal(JSON.parse(r.files['events.json'])[2].recordName, 'event-2');
  assert.deepEqual(JSON.parse(r.files['drawer-shift.json']), { recordName: 'drawer-shift', open: 1 }); assert.equal(r.files['drawer-checkpoint.json'], 'null');
  const m = JSON.parse(r.files['manifest.json']);
  assert.equal(m.format, 'pos-cloudkit-export'); assert.equal(m.version, 1); assert.equal(m.registerName, 'Front till'); assert.equal(m.counts.sales, 250); assert.equal(m.counts['drawer-shift'], 1); assert.equal(m.counts['drawer-checkpoint'], 0);
  assert.equal(m.files.length, COLLECTIONS.length + SINGLES.length);
  assert.match(r.files['README.txt'], /as carefully as the Shopify login/); assert.match(r.files['README.txt'], /Customer names, emails and phone numbers are not in iCloud/);
});

test('the logo picture is added when it can be read, and left out quietly when it cannot', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  assert.deepEqual((await collectExport(fakeNative(), meta, { readLogo: async () => bytes })).extra['logo-image'], bytes);
  assert.deepEqual((await collectExport(fakeNative(), meta, { readLogo: async () => { throw new Error('no file'); } })).extra, {});
  assert.deepEqual((await collectExport(fakeNative(), meta, { readLogo: async () => null })).extra, {});
});

test('the zip has one folder named for the day, unzips to the same files, and an empty shop still makes a valid backup', async () => {
  const r = await collectExport(fakeNative({ listSales: many(5) }), meta, { readLogo: async () => new Uint8Array([9]) });
  const folder = exportFolderName(meta.exportedAt); assert.equal(folder, 'pos-icloud-backup-202611020905');
  const z = unzipSync(zipExport(r, folder));
  assert.ok(Object.keys(z).every(k => k.startsWith(`${folder}/`))); assert.equal(JSON.parse(strFromU8(z[`${folder}/sales.json`])).length, 5);
  assert.deepEqual([...z[`${folder}/logo-image`]], [9]); assert.ok(z[`${folder}/manifest.json`] && z[`${folder}/README.txt`]);
  const empty = unzipSync(zipExport(await collectExport(fakeNative(), meta), folder)); assert.equal(strFromU8(empty[`${folder}/sales.json`]), '[]');
});

test('progress names each list as it is read', async () => {
  const seen: string[] = []; await collectExport(fakeNative(), meta, { progress: w => seen.push(w) });
  assert.equal(seen.length, COLLECTIONS.length + SINGLES.length); assert.equal(seen[0], 'finished sales and refunds');
});

test('the summary says what was backed up in plain words', () => assert.equal(exportSummary({ sales: 12, rollups: 3, 'saved-carts': 1, 'drawer-ledger-entries': 40, events: 7, 'payment-attempts': 2 }), '12 sales, 3 daily totals, 1 saved carts, 40 cash drawer movements, 7 events and 2 payment attempts'));

test('the screen offers it to an owner only, asks first, shares a zip, and the practice run cannot', () => {
  const s = readFileSync('src/screens/CloudSync.tsx', 'utf8');
  assert.match(s, /\{role === 'owner' \? \(\s*<>\s*<Txt weight="600"[^>]*>Back up everything in iCloud/);
  const fn = s.slice(s.indexOf('const exportEverything'), s.indexOf('return (\n    <Page'));
  assert.ok(fn.indexOf('await confirm(') < fn.indexOf('writeCloudKitExport'), 'asked before anything is read');
  assert.match(fn, /mimeType: 'application\/zip'/); assert.match(s, /title="Back up everything"[^/]*disabled=\{practice\}/);
});
