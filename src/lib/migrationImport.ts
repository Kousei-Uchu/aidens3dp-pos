// Location: src/lib/migrationImport.ts
// CloudKit sync, patch 7 (import runner, rules half): what the one-off import copies from Shopify into CloudKit, and how a row is
// turned into a CloudKit handle. Pure: no storage, no clock, no native module, so every rule is tested in Node
// (tests/migrationimport.test.ts). The runner that uses it is cloudkit/migrationRun.ts; the lease is migrationLease.ts.
// Decisions: dev_docs/CLOUDKIT_SYNC_PLAN.md section 6 (steps 3 and 6), dev_docs/GUESSES.md under 0213.
import type { MigrationPhase } from './migrationLease';
import type { SharedType } from './syncBackend';

/** A Shopify row as the seam hands it back. */
export type SourceRow = { id: string; handle: string; updatedAt: string; f: Record<string, string> };

/** The seam type each paged phase reads. The settings and drawer phases both read `settings`; the drawer phase reads one row of it. */
export const PHASE_TYPE: Partial<Record<MigrationPhase, SharedType>> = {
  settings: 'settings', layout: 'layout', carts: 'cart', sales: 'sale', rollups: 'rollup',
};

/** Rows are written in pages of this many. CloudKit's cap is 400 per operation, so there is plenty of room. */
export const IMPORT_PAGE = 100;
/** The settings row that holds the shift and ledger as one blob. It is the drawer phase's, not the settings phase's. */
export const DRAWER_ROW = 'drawer';

/**
 * Where to carry on. `a` is the Shopify page cursor (paged phases) and `i` is how far through a list held in memory (the drawer's
 * entries). `n` is how many records the phase has imported so far, so a takeover carries the count on instead of starting it again.
 */
export type Cursor = { a: string | null; i: number; n: number };
export const START_CURSOR: Cursor = { a: null, i: 0, n: 0 };

export const encodeCursor = (c: Cursor): string => JSON.stringify({ a: c.a, i: c.i, n: c.n });

/** An empty or unreadable cursor means the start of the phase, which is always safe because every write is idempotent. */
export function decodeCursor(raw: string): Cursor {
  if (!raw) return { ...START_CURSOR };
  try {
    const o = JSON.parse(raw);
    const a = typeof o?.a === 'string' ? o.a : null;
    const i = Number.isInteger(o?.i) && o.i >= 0 ? o.i : 0;
    const n = Number.isInteger(o?.n) && o.n >= 0 ? o.n : 0;
    return { a, i, n };
  } catch { return { ...START_CURSOR }; }
}

/**
 * The key a row is written under in CloudKit, or null when the row cannot be imported (it has no usable key). The key comes from the
 * row's own fields where there is one, because Shopify lowercases and rewrites a handle (`handleOf`), so the handle is not always the key
 * the app looks the record up by. A rollup's key is `register|date`, which Shopify turns into `register-date`.
 */
export function handleFor(phase: MigrationPhase, row: SourceRow): string | null {
  const f = row.f ?? {};
  const pick = (...vals: Array<string | undefined>): string | null => { for (const v of vals) if (typeof v === 'string' && v.trim()) return v.trim(); return null; };
  switch (phase) {
    case 'settings': return pick(f.settings_key, row.handle);
    case 'layout': return pick(f.layout_key, row.handle);
    case 'carts': return pick(f.cart_uuid, row.handle);
    case 'sales': return pick(f.sale_uuid, saleUuidInJson(f.sale_json), row.handle);
    case 'rollups': return pick(f.rollup_key, row.handle);
    default: return null;
  }
}

function saleUuidInJson(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try { const o = JSON.parse(raw); return typeof o?.uuid === 'string' ? o.uuid : undefined; } catch { return undefined; }
}

/** Whether a row in a paged phase is imported. The settings phase leaves the drawer row to the drawer phase. */
export function importable(phase: MigrationPhase, row: SourceRow): boolean {
  const h = handleFor(phase, row);
  if (!h) return false;
  if (phase === 'settings' && h === DRAWER_ROW) return false;
  return true;
}

/** A row's own version counter, 0 when it has none. */
export const versionOf = (f: Record<string, string> | undefined): number => { const n = Number(f?.version); return Number.isFinite(n) && n > 0 ? n : 0; };

/**
 * Settings and layout may already exist in CloudKit (an earlier run got that far, or an owner iPad wrote one before the import).
 * Section 6 step 6: where both exist the higher version wins, and Shopify's is canonical on a tie. So an existing CloudKit row is only
 * kept when its version is strictly higher.
 */
export function shouldWriteVersioned(sourceF: Record<string, string>, existingF: Record<string, string> | null | undefined): boolean {
  if (!existingF) return true;
  return versionOf(existingF) <= versionOf(sourceF);
}

/** The drawer blob, read safely. Null when there is no row or it cannot be read. */
export function readDrawerBlob(row: SourceRow | null | undefined): { shift: unknown; ledger: unknown; version: number } | null {
  if (!row?.f?.settings_json) return null;
  try {
    const j = JSON.parse(row.f.settings_json);
    if (!j || typeof j !== 'object') return null;
    return { shift: j.shift, ledger: j.ledger, version: versionOf(row.f) };
  } catch { return null; }
}

/** The shift as the app's Shift, or null when the blob has none or it is not a shift. */
export function readShiftValue(raw: unknown): { open: boolean; floatCents: number; paidInCents: number; paidOutCents: number; [k: string]: unknown } | null {
  const s = raw as any;
  if (!s || typeof s !== 'object' || typeof s.open !== 'boolean') return null;
  const c = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  return { ...s, open: s.open, floatCents: c(s.floatCents), paidInCents: c(s.paidInCents), paidOutCents: c(s.paidOutCents) };
}
