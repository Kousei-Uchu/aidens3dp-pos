// Location: src/lib/eventsCsvParse.ts
// CloudKit sync, patch 4 (call sites): read `events.csv` back into events.
// The id of an event is worked out from its CSV row (eventRecords.ts), so reading a row back has to give the same event, and so
// the same id, as the one that was written. A message can hold a comma, a quote or a line break, which `q` in csvFormat writes
// inside quotes, so this reads quoted fields properly rather than splitting on lines. Pure: no file, no store.
import { EVENT_KINDS, type EventInput } from './eventRecords';
import { toCents } from './money';
import type { EventKind } from './csvFormat';

/** Split CSV text into rows of fields. Handles quoted fields, doubled quotes inside them, and line breaks inside quotes. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false; let touched = false;
  const endField = () => { row.push(field); field = ''; };
  const endRow = () => { endField(); rows.push(row); row = []; touched = false; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
    } else if (c === '"') { quoted = true; touched = true; }
    else if (c === ',') { endField(); touched = true; }
    else if (c === '\n') endRow();
    else if (c === '\r') { /* the row ends at the \n that follows */ }
    else { field += c; touched = true; }
  }
  if (touched || field) endRow();
  return rows;
}

const opt = (s: string | undefined): string | undefined => (s === undefined || s === '' ? undefined : s);

/** The events in an `events.csv`. The header row is skipped, and a row with no time or a kind this app does not know is left out. */
export function parseEventsCsv(text: string): EventInput[] {
  const out: EventInput[] = [];
  for (const r of csvRows(text)) {
    const [ts, kind, saleUuid, reference, amount, code, message, staff, detail] = r;
    if (!ts || ts === 'timestamp_iso' || !EVENT_KINDS.includes(kind as EventKind)) continue;
    const e: EventInput = { ts, kind: kind as EventKind };
    if (opt(saleUuid) !== undefined) e.saleUuid = saleUuid; if (opt(reference) !== undefined) e.reference = reference;
    if (opt(amount) !== undefined) e.amountCents = toCents(amount);
    if (opt(code) !== undefined) e.code = code; if (opt(message) !== undefined) e.message = message;
    if (opt(staff) !== undefined) e.staff = staff; if (opt(detail) !== undefined) e.detail = detail;
    out.push(e);
  }
  return out;
}
