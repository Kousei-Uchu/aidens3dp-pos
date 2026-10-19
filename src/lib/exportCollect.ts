// Location: src/lib/exportCollect.ts
// The file half of the report export: it gathers the snapshot the pure builder needs (the store, the imported Square
// rollups and the raw history files) and writes the finished tables to a file to share.
//
// Nothing here decides what a report holds; exportSheets.ts does that. This file only reads the app and writes bytes.
import { strToU8, zipSync } from 'fflate';
import * as FS from 'expo-file-system/legacy';
import { useApp } from '../state/store';
import { emptyTotals, merge } from './rollup';
import { parseBundleConfig } from './bundles';
import { bytesToB64, loadSquareRollups } from './squareHistoryIO';
import { allSales } from './salesHistory';
import { csv } from './csvStore';
import { buildIndexSheet, sheetToCsv, type ExportInput, type RawHistoryFile, type Sheet } from './exportSheets';
import { buildXlsx, uniqueSheetName } from './xlsx';

export type ExportFormat = 'csv' | 'xlsx';
export type ExportFile = { path: string; name: string; mime: string; uti: string };

/** Read the raw history files this device keeps. Missing or unreadable files are simply left out. */
async function readRawFiles(): Promise<RawHistoryFile[]> {
  const out: RawHistoryFile[] = [];
  try {
    for (const p of await csv.paths()) out.push({ name: p.split('/').pop() ?? p, text: await FS.readAsStringAsync(p) });
  } catch { /* the history files are optional */ }
  return out;
}

/** Everything the tables are built from, as it stands now. Square history is folded into the local rollups. */
export async function collectExportInput(): Promise<ExportInput> {
  const s = useApp.getState();
  // The sales and day totals other tills shared (pos.shared, filled by pullSalesHistory), so an export covers the whole shop.
  // This till's own copy wins a clash. Cash stays this till's: it reads the shift and ledger below, not sales.
  const shared = s.pos.shared ?? { sales: [], rollups: {} };
  const rollups: ExportInput['rollups'] = { ...shared.rollups, ...s.pos.rollups };
  try {
    for (const r of await loadSquareRollups()) {
      const key = `${r.registerId}|${r.date}`;
      rollups[key] = rollups[key] ? merge(rollups[key], r.totals) : { ...emptyTotals(), ...r.totals };
    }
  } catch { /* Square history is optional */ }
  const bundles = (() => { try { return s.settings.bundlesJson ? parseBundleConfig(s.settings.bundlesJson).cfg?.discounts ?? [] : []; } catch { return []; } })();
  return {
    now: new Date().toISOString(),
    shopName: s.settings.shopName || s.settings.locationName || '',
    registerName: s.settings.registerName,
    registerId: s.settings.registerId,
    sales: allSales(s.pos.sales, shared.sales),
    variants: s.data.variants,
    collections: s.data.collections,
    customers: s.data.customers,
    autos: s.data.autos,
    presets: s.data.presets,
    bundles,
    outbox: s.pos.outbox,
    attempts: s.pos.attempts,
    notices: s.pos.notices,
    rollups,
    shift: s.pos.shift,
    ledger: s.pos.ledger,
    saved: s.pos.saved,
    cartWarnings: s.settings.cartWarnings ?? [],
    warningList: s.settings.warningList ?? [],
    rawFiles: await readRawFiles(),
  };
}

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

/** Write the tables to one file: a single CSV, a zip of CSVs, or one multi-sheet workbook. */
export async function writeExport(sheets: Sheet[], format: ExportFormat, meta: { when: string; shop: string; register: string }): Promise<ExportFile> {
  await FS.makeDirectoryAsync(FS.cacheDirectory ?? '', { intermediates: true }).catch(() => {});
  if (format === 'xlsx') {
    const book = buildXlsx([buildIndexSheet(sheets, meta), ...sheets]);
    const name = `pos-export-${stamp()}.xlsx`;
    const path = `${FS.cacheDirectory}${name}`;
    await FS.writeAsStringAsync(path, bytesToB64(book), { encoding: FS.EncodingType.Base64 });
    return { path, name, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', uti: 'org.openxmlformats.spreadsheetml.sheet' };
  }
  const used = new Set<string>();
  if (sheets.length === 1) {
    const name = `${uniqueSheetName(sheets[0].name, used)}.csv`;
    const path = `${FS.cacheDirectory}${name}`;
    await FS.writeAsStringAsync(path, sheetToCsv(sheets[0]));
    return { path, name, mime: 'text/csv', uti: 'public.comma-separated-values-text' };
  }
  const files: Record<string, Uint8Array> = {};
  for (const s of sheets) files[`${uniqueSheetName(s.name, used)}.csv`] = strToU8(sheetToCsv(s));
  const name = `pos-export-${stamp()}.zip`;
  const path = `${FS.cacheDirectory}${name}`;
  await FS.writeAsStringAsync(path, bytesToB64(zipSync(files, { level: 6 })), { encoding: FS.EncodingType.Base64 });
  return { path, name, mime: 'application/zip', uti: 'public.zip-archive' };
}
