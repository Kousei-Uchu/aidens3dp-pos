// Location: src/lib/cloudkit/exportAll.ts
// CloudKit sync, patch 6e (N3, O5): the owner-only export of everything stored in CloudKit, as one zip of JSON files. It is a backup that
// does not depend on the owner's Apple ID staying healthy. This file is the pure half: it reads every list in the native module, and
// builds the files and the zip bytes. The half that writes the zip to the iPad and opens the share sheet is exportAllIO.ts.
// Everything the module supplies is passed in, so the rules are tested without an iPad (tests/exportall.test.ts).
// Decisions: dev_docs/CLOUDKIT_SYNC_DECISIONS.md N3, O5, dev_docs/GUESSES.md under 0219.
import { strToU8, zipSync } from 'fflate';

type Rec = Record<string, any>;
type Page = { rows: Rec[]; next: string | null };
type Lister = (limit: number, after: string | null) => Promise<Page>;

/** The part of the CloudKit module the export reads. Each name matches the module's own export, so the module can be passed in as it is. */
export type ExportNative = {
  listSales: Lister; listRollups: Lister; listCarts: Lister; listSettings: Lister; listLayout: Lister; listSquareHistory: Lister;
  listLedgerEntries: Lister; listEvents: Lister; listAttempts: Lister; listResolutions: Lister; listNotices: Lister; listTraining: Lister;
  listAuditIndex: Lister; listAudit: Lister; listSecrets: Lister;
  getDrawerShift(): Promise<Rec | null>; getDrawerCheckpoint(): Promise<Rec | null>; getMigration(): Promise<Rec | null>;
  getLogo(): Promise<Rec | null>; getSquareManifest(): Promise<Rec | null>;
};

/** Every list, and the name of its file in the zip. A record type added later is added here and nowhere else. */
export const COLLECTIONS: ReadonlyArray<{ file: string; list: keyof ExportNative; what: string }> = [
  { file: 'sales', list: 'listSales', what: 'finished sales and refunds' },
  { file: 'rollups', list: 'listRollups', what: 'daily totals per register' },
  { file: 'saved-carts', list: 'listCarts', what: 'saved carts' },
  { file: 'settings', list: 'listSettings', what: 'shared settings' },
  { file: 'layout', list: 'listLayout', what: 'button layout' },
  { file: 'square-history', list: 'listSquareHistory', what: 'Square history records (the shard files themselves are not included)' },
  { file: 'drawer-ledger-entries', list: 'listLedgerEntries', what: 'cash drawer movements' },
  { file: 'events', list: 'listEvents', what: 'events from every register' },
  { file: 'payment-attempts', list: 'listAttempts', what: 'card payment attempts' },
  { file: 'payment-resolutions', list: 'listResolutions', what: 'payment resolutions and missing-order claims' },
  { file: 'notices', list: 'listNotices', what: 'shared notices' },
  { file: 'training-progress', list: 'listTraining', what: 'training progress' },
  { file: 'audit-index', list: 'listAuditIndex', what: 'assistant log index' },
  { file: 'audit-events', list: 'listAudit', what: 'assistant log events (encrypted fields only if this iPad could read them)' },
  { file: 'secrets', list: 'listSecrets', what: 'shared secrets and pass codes (decrypted values included if this iPad could read them: as sensitive as the Shopify login)' },
];
/** Single records, one file each. A missing one is written as null so the zip always has the same files. */
export const SINGLES: ReadonlyArray<{ file: string; get: keyof ExportNative; what: string }> = [
  { file: 'drawer-shift', get: 'getDrawerShift', what: 'the cash drawer shift' },
  { file: 'drawer-checkpoint', get: 'getDrawerCheckpoint', what: 'the cash drawer starting counts' },
  { file: 'migration', get: 'getMigration', what: 'the Shopify import record' },
  { file: 'logo', get: 'getLogo', what: 'the shop logo record' },
  { file: 'square-manifest', get: 'getSquareManifest', what: 'the Square history manifest' },
];

export const PAGE = 100;
/** A guard against a list that never ends. 5000 pages of 100 is half a million records of one kind. */
export const MAX_PAGES = 5000;

export type ExportMeta = { exportedAt: string; registerId: string; registerName: string; appVersion?: string };
export type ExportResult = { files: Record<string, string>; extra: Record<string, Uint8Array>; counts: Record<string, number> };

/** Read one whole list. Throws, naming the list, if it fails or does not end: an export that quietly leaves something out is worse than none. */
export async function readAll(name: string, list: Lister): Promise<Rec[]> {
  const out: Rec[] = []; let after: string | null = null;
  try {
    for (let i = 0; i < MAX_PAGES; i++) {
      const page = await list(PAGE, after); out.push(...page.rows);
      if (!page.next) return out;
      after = page.next;
    }
  } catch (e) { throw new Error(`Could not read ${name}: ${String((e as Error)?.message ?? e)}`); }
  throw new Error(`Could not read ${name}: the list did not end.`);
}

const README = `This is a backup of everything the shop keeps in iCloud, made by the POS app on an owner's iPad.

Each file is JSON. The files with a list in them are the records of one kind, exactly as iCloud returned them. The single records
(drawer-shift, drawer-checkpoint, migration, logo, square-manifest) are one record each, or null if there is none.

Treat this file as carefully as the Shopify login itself. Encrypted fields are included in the clear where this iPad could read them,
and any card or gift card details, payment references and assistant log content in them are private to the shop. Do not email it or put
it anywhere other people can open it.

Customer names, emails and phone numbers are not in iCloud, so they are not here. The Shopify records are not touched by this export.
`;

/** Read everything and lay it out as files. `progress` is told which list is being read. */
export async function collectExport(n: ExportNative, meta: ExportMeta, o: { progress?: (what: string) => void; readLogo?: () => Promise<Uint8Array | null> } = {}): Promise<ExportResult> {
  const files: Record<string, string> = {}; const counts: Record<string, number> = {}; const extra: Record<string, Uint8Array> = {};
  for (const c of COLLECTIONS) {
    o.progress?.(c.what);
    const rows = await readAll(c.file, (limit, after) => (n[c.list] as Lister)(limit, after));
    files[`${c.file}.json`] = JSON.stringify(rows, null, 1); counts[c.file] = rows.length;
  }
  for (const s of SINGLES) {
    o.progress?.(s.what);
    let rec: Rec | null;
    try { rec = await (n[s.get] as () => Promise<Rec | null>)(); } catch (e) { throw new Error(`Could not read ${s.file}: ${String((e as Error)?.message ?? e)}`); }
    files[`${s.file}.json`] = JSON.stringify(rec ?? null, null, 1); counts[s.file] = rec ? 1 : 0;
  }
  if (o.readLogo) { const bytes = await o.readLogo().catch(() => null); if (bytes?.length) { extra['logo-image'] = bytes; counts['logo-image'] = 1; } }
  const manifest = {
    format: 'pos-cloudkit-export', version: 1, ...meta, counts,
    files: [...COLLECTIONS.map(c => ({ file: `${c.file}.json`, contents: c.what })), ...SINGLES.map(s => ({ file: `${s.file}.json`, contents: s.what })), ...(extra['logo-image'] ? [{ file: 'logo-image', contents: 'the shop logo picture' }] : [])],
  };
  files['manifest.json'] = JSON.stringify(manifest, null, 1);
  files['README.txt'] = README;
  return { files, extra, counts };
}

/** The zip, with the files in a folder named for the day so unzipping does not scatter them. */
export function zipExport(r: ExportResult, folder: string): Uint8Array {
  const z: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(r.files)) z[`${folder}/${k}`] = strToU8(v);
  for (const [k, v] of Object.entries(r.extra)) z[`${folder}/${k}`] = v;
  return zipSync(z, { level: 6 });
}

export const exportFolderName = (iso: string): string => `pos-icloud-backup-${iso.slice(0, 16).replace(/[-:T]/g, '')}`;

/** What the owner is told when the export is done. */
export function exportSummary(counts: Record<string, number>): string {
  const n = (k: string) => counts[k] ?? 0;
  return `${n('sales')} sales, ${n('rollups')} daily totals, ${n('saved-carts')} saved carts, ${n('drawer-ledger-entries')} cash drawer movements, ${n('events')} events and ${n('payment-attempts')} payment attempts`;
}
