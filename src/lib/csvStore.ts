// Location: src/lib/csvStore.ts
// Local CSV history (spec: every sale/refund/event is appended, NEVER auto-cleared).
// Files live in the app's Documents folder, which is exposed in Files.app via UIFileSharingEnabled.
import * as FS from 'expo-file-system/legacy';
import { EVENTS_HEADER, LINES_HEADER, SALES_HEADER, eventRow, linesRows, line, salesRow, type EventKind } from './csvFormat';
import type { SaleRecord } from './types';

const dir = () => `${FS.documentDirectory ?? ''}pos-data/`;
const FILES = { sales: ['sales.csv', SALES_HEADER], lines: ['sale_lines.csv', LINES_HEADER], events: ['events.csv', EVENTS_HEADER] } as const;
type Which = keyof typeof FILES;

let chain: Promise<unknown> = Promise.resolve(); // serialise appends so rows never interleave
const serial = <T,>(fn: () => Promise<T>): Promise<T> => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };

async function append(which: Which, text: string) {
  const [name, header] = FILES[which];
  const path = dir() + name;
  await FS.makeDirectoryAsync(dir(), { intermediates: true }).catch(() => {});
  const info = await FS.getInfoAsync(path);
  const prev = info.exists ? await FS.readAsStringAsync(path) : line([...header]);
  await FS.writeAsStringAsync(path, prev + text);
}

export const csv = {
  async sale(r: SaleRecord, status = 'complete') {
    await serial(async () => { await append('sales', salesRow(r, status)); await append('lines', linesRows(r)); });
  },
  async event(e: Parameters<typeof eventRow>[0]) { await serial(() => append('events', eventRow(e))); },
  async paths(): Promise<string[]> {
    const out: string[] = [];
    for (const k of Object.keys(FILES) as Which[]) {
      const p = dir() + FILES[k][0];
      if ((await FS.getInfoAsync(p)).exists) out.push(p);
    }
    return out;
  },
  /** Only called from Settings ▸ Data ▸ Delete local history, after confirmation. */
  async deleteAll() { await serial(async () => { await FS.deleteAsync(dir(), { idempotent: true }); }); },
};
export type { EventKind };
