// Location: tests/migrationFakes.ts
// In-memory stand-ins shared by the migration import and count check tests (patch 7): Shopify, CloudKit, the drawer and the lease record.
// Not a test file itself (the runner only picks up *.test.ts).
import assert from 'node:assert/strict';
import { IMPORT_PAGE, type SourceRow } from '../src/lib/migrationImport';
import { createMigrationWatch, type MigrationNative } from '../src/lib/cloudkit/migrationCloud';
import type { ImportSource, RunDeps } from '../src/lib/cloudkit/migrationRun';
import type { VerifyTarget } from '../src/lib/cloudkit/migrationVerify';
import type { DrawerNative } from '../src/lib/cloudkit/drawerCloud';
import type { SharedType } from '../src/lib/syncBackend';

const PREFIX: Record<SharedType, string> = { sale: 'sale-', cart: 'cart-', rollup: 'rollup-', settings: 'settings-', layout: 'layout-' };
export type Rec = Record<string, any>;
export const row = (handle: string, f: Record<string, string>): SourceRow => ({ id: `gid-${handle}`, handle, updatedAt: '2026-11-02T00:00:00Z', f });

export function fakeLease() {
  let rec: Rec | null = null; let n = 0; const writes: string[] = [];
  const native: MigrationNative = {
    async getMigration() { return rec ? { ...rec } : null; },
    async putMigrationIfUnchanged(fields, expected) {
      if (rec) { if (!expected || rec.tag !== expected) return { changed: true }; } else if (expected) return { changed: true };
      rec = { ...(rec ?? {}), ...fields, tag: `t${++n}` }; writes.push(`${fields.status}/${fields.phase}`); return { changed: false, tag: rec.tag };
    },
  };
  return { native, peek: () => rec, steal: () => { rec = { ...rec!, tag: `t${++n}`, holder: 'thief' }; }, writes };
}

export function fakeDrawer() {
  let clock = 1_000_000; const entries: Rec[] = []; let shift: Rec | null = null; let cp: Rec | null = null; const calls = { entryWrites: 0 };
  const page = (rows: Rec[], after: string | null | undefined, limit: number) => { const from = after ? Number(after) : 0; return { rows: rows.slice(from, from + limit), next: from + limit < rows.length ? String(from + limit) : null }; };
  const n: DrawerNative = {
    async putDrawerShift(f) { shift = { ...f, recordName: 'drawer-shift' }; return shift; },
    async getDrawerShift() { return shift; },
    async putLedgerEntry(h, f) { const name = `ledger-${h}`; const had = entries.find(r => r.recordName === name); if (had) return had; calls.entryWrites++; clock += 1; const r = { ...f, recordName: name, createdAt: clock }; entries.push(r); return r; },
    async listLedgerEntries(limit, after) { return page([...entries].reverse(), after, limit); },
    async listLedgerSince(since, limit, after) { return page(entries.filter(r => r.createdAt > since), after, limit); },
    async putDrawerCheckpoint(f) { cp = { ...f, recordName: 'drawer-checkpoint' }; return cp; },
    async getDrawerCheckpoint() { return cp; },
  };
  return { n, calls, entries, cp: () => cp };
}

/** Shopify: lists by type, paged by `pageSize` with a numeric cursor. `failOnce` makes the next list of a type throw once. */
export function fakeSource(data: Partial<Record<SharedType, SourceRow[]>>, pageSize = IMPORT_PAGE) {
  const failOnce = new Set<SharedType>(); const listCalls: string[] = [];
  const src: ImportSource = {
    async list(type, o) {
      listCalls.push(`${type}@${o.after ?? 'start'}`);
      if (failOnce.delete(type)) throw new Error(`Shopify ${type} unreachable`);
      const rows = data[type] ?? []; const from = o.after ? Number(o.after) : 0;
      return { rows: rows.slice(from, from + pageSize), next: from + pageSize < rows.length ? String(from + pageSize) : null };
    },
    async get(type, handle) { return (data[type] ?? []).find(r => r.handle === handle || r.f.settings_key === handle) ?? null; },
  };
  return { src, failOnce, listCalls };
}

export function fakeTarget(seed: Partial<Record<SharedType, Record<string, SourceRow>>> = {}) {
  const store: Record<string, Record<string, SourceRow>> = { cart: {}, layout: {}, sale: {}, rollup: {}, settings: {} };
  for (const [t, rows] of Object.entries(seed)) store[t] = { ...rows };
  const puts: string[] = [];
  const tgt: VerifyTarget = {
    async put(type, handle, fields) { puts.push(`${type}:${handle}`); store[type][handle] = row(handle, fields); return null; },
    async get(type, handle) { return store[type][handle] ?? null; },
    async list(type, o) { const rows = Object.entries(store[type]).map(([k, r]) => ({ ...r, id: `${PREFIX[type]}${k}`, handle: `${PREFIX[type]}${k}` })); const from = o.after ? Number(o.after) : 0; return { rows: rows.slice(from, from + o.first), next: from + o.first < rows.length ? String(from + o.first) : null }; },
  };
  return { tgt, store, puts };
}

export const T0 = 1_800_000_000_000;
export function harness(data: Partial<Record<SharedType, SourceRow[]>>, o: { id?: string; owner?: boolean; pageSize?: number; seed?: Partial<Record<SharedType, Record<string, SourceRow>>>; lease?: ReturnType<typeof fakeLease>; clock?: { t: number } } = {}) {
  const lease = o.lease ?? fakeLease(); const clock = o.clock ?? { t: T0 };
  const source = fakeSource(data, o.pageSize); const target = fakeTarget(o.seed); const drawer = fakeDrawer();
  const watch = createMigrationWatch({ native: async () => lease.native, registerId: () => o.id ?? 'A', registerName: () => `Till ${o.id ?? 'A'}`, isOwner: () => o.owner ?? true, now: () => clock.t });
  const deps: RunDeps = { watch, native: lease.native, source: source.src, target: target.tgt, drawer: drawer.n, now: () => clock.t };
  return { deps, lease, source, target, drawer, clock };
}


export const sale = (i: number): SourceRow => row(`s${i}`, { sale_uuid: `u${i}`, register_id: 'A', total_cents: String(100 * i), sale_json: JSON.stringify({ uuid: `u${i}`, totalCents: 100 * i }) });
export const sales = (n: number) => Array.from({ length: n }, (_, i) => sale(i + 1));
export const drawerRow = (shift: Rec, ledger: Rec, version = 4): SourceRow => row('drawer', { settings_key: 'drawer', version: String(version), settings_json: JSON.stringify({ shift, ledger }) });
export const ent = (id: string, ts: string, kind = 'sale_in', delta: Rec = { '1000': 1 }) => ({ id, ts, kind, delta });
