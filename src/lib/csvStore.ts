// Location: src/lib/csvStore.ts
// Local CSV history (spec: every sale/refund/event is appended, NEVER auto-cleared).
// Files live in the app's Documents folder, which is exposed in Files.app via UIFileSharingEnabled.
import { isTraining } from './trainingGuard';
import * as FS from 'expo-file-system/legacy';
import { EVENTS_HEADER, LINES_HEADER, SALES_HEADER, eventRow, linesRows, line, salesRow, type EventKind } from './csvFormat';
import type { SaleRecord } from './types';
import type { EventInput } from './eventRecords';

const dir = () => `${FS.documentDirectory ?? ''}pos-data/`;
const FILES = { sales: ['sales.csv', SALES_HEADER], lines: ['sale_lines.csv', LINES_HEADER], events: ['events.csv', EVENTS_HEADER] } as const;
type Which = keyof typeof FILES;

let chain: Promise<unknown> = Promise.resolve(); // serialise appends so rows never interleave
const serial = <T,>(fn: () => Promise<T>): Promise<T> => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };

async function append(which: Which, text: string) {
  if (isTraining()) return; // training sales never reach the history files
  const [name, header] = FILES[which];
  const path = dir() + name;
  await FS.makeDirectoryAsync(dir(), { intermediates: true }).catch(() => {});
  const info = await FS.getInfoAsync(path);
  const prev = info.exists ? await FS.readAsStringAsync(path) : line([...header]);
  await FS.writeAsStringAsync(path, prev + text);
}

/**
 * Something to tell about each event once it is in the CSV (sync.ts sets it, to upload the event to CloudKit). csvStore stays free
 * of the sync code, and of the native module, so it can be left as it is when CloudKit is not in use.
 */
let eventSink: ((e: EventInput) => void) | null = null;
export const setEventSink = (fn: ((e: EventInput) => void) | null): void => { eventSink = fn; };

export const csv = {
  async sale(r: SaleRecord, status = 'complete') {
    await serial(async () => { await append('sales', salesRow(r, status)); await append('lines', linesRows(r)); });
  },
  async event(e: Parameters<typeof eventRow>[0]) {
    // The time is set here, once, because the CloudKit id of the event is made from the same row as the CSV line.
    const full: EventInput = { ...e, ts: e.ts ?? new Date().toISOString() };
    await serial(() => append('events', eventRow(full)));
    if (!isTraining()) eventSink?.(full);
  },
  /** The text of events.csv, or an empty string when there is none yet. Read-only. */
  async readEvents(): Promise<string> {
    const path = dir() + FILES.events[0];
    return (await FS.getInfoAsync(path)).exists ? FS.readAsStringAsync(path) : '';
  },
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
