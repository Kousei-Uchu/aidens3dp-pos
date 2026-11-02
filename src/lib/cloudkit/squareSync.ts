// Location: src/lib/cloudkit/squareSync.ts
// CloudKit sync, patch 6a (Square history shards, call site): one reconcile per poll that sends this register's months, takes the shop's,
// and carries a removal. Everything the app supplies is passed in, so the rules are tested without an iPad (tests/squaresync.test.ts).
// The app's one instance is made in sync.ts. Decisions: dev_docs/CLOUDKIT_SYNC_PLAN.md and dev_docs/CLOUDKIT_SYNC_DECISIONS.md (0209).
import { MAX_SHARD_BYTES, parseBase, planSquare, serializeBase, type LocalMonth, type ShardEntry, type ShardMeta, type SquareBase } from '../squareHistoryShared';
import { downloadCloudShard, readCloudSquare, uploadShard, writeCloudManifest, type SquareNative } from './squareCloud';

export type SquareSyncDeps = {
  /** True only when the CloudKit backend is the one in use. */
  active: () => boolean;
  /** True in practice mode, when nothing is ever sent or taken in. */
  training: () => boolean;
  who: () => { id: string; name: string };
  native: () => Promise<SquareNative>;
  /** The month files on this iPad, each hashed (the app caches the hash per file). */
  listLocal: () => Promise<LocalMonth[]>;
  /** Pack this register's month with the customer details taken out, into a temporary file, and say how it hashes. Null when the month cannot be read. */
  prepare: (month: string) => Promise<{ path: string; sid: string; bytes: number } | null>;
  /** Hash and size of a downloaded file, or null when it cannot be read. */
  inspect: (path: string) => Promise<{ sid: string; bytes: number } | null>;
  /** Put a downloaded month in place as this register's file for it. */
  install: (month: string, tempPath: string) => Promise<void>;
  removeLocal: (month: string) => Promise<void>;
  /** Called once after months were taken in or removed here: rewrite the stored manifest and rebuild the rollups. `sales` is the record count per month. */
  finish: (meta: ShardMeta, sales: Record<string, number>) => Promise<void>;
  /** The device-only base, as stored text. */
  base: () => string | undefined;
  setBase: (text: string) => void;
  now?: () => string;
};

export type SquareResult = { pushed: string[]; pulled: string[]; removedHere: string[]; removedShop: string[]; failed: string[] };
const empty = (): SquareResult => ({ pushed: [], pulled: [], removedHere: [], removedShop: [], failed: [] });
const ATTEMPTS = 3;

export function createSquareSync(d: SquareSyncDeps) {
  const now = d.now ?? (() => new Date().toISOString());
  let running = false;

  /** One pass. Returns null to say "someone else wrote the manifest first, read it again". */
  async function pass(n: SquareNative, w: { id: string; name: string }, out: SquareResult): Promise<SquareResult | null | 'stop'> {
    const remote = await readCloudSquare(n);
    if (remote.kind === 'unreadable') return 'stop'; // reading it as empty would look like every month had been removed
    const entries = remote.kind === 'manifest' ? remote.entries : {};
    const meta: ShardMeta = remote.kind === 'manifest' ? remote.meta : { locations: [] };
    const local = await d.listLocal(); const lm = new Map(local.map(m => [m.month, m] as const));
    const base: SquareBase = parseBase(d.base());
    const plan = planSquare(local, entries, base);
    if (!plan.length) return out;

    const next: Record<string, ShardEntry> = { ...entries }; let manifestChanged = false;
    const baseNow: SquareBase = { ...base }; const baseAfterManifest: SquareBase = {}; const dropAfterManifest: string[] = [];
    let localChanged = false; const pushed: string[] = []; const removedShop: string[] = [];

    for (const { month, action } of plan) {
      try {
        if (action === 'forget') { delete baseNow[month]; continue; }
        if (action === 'push') {
          const mine = lm.get(month)!; if (mine.bytes > MAX_SHARD_BYTES) continue; // never sent, and the shop's is not allowed to replace it unseen either
          const prep = await d.prepare(month); if (!prep || prep.bytes > MAX_SHARD_BYTES) { out.failed.push(month); continue; }
          const was = entries[month];
          if (!was || was.sid !== prep.sid) {
            const e: ShardEntry = { month, sid: prep.sid, bytes: prep.bytes, sales: mine.sales };
            await uploadShard(n, w.id, w.name, e, prep.path, now()); next[month] = e; manifestChanged = true;
          }
          baseAfterManifest[month] = { l: mine.hash, s: prep.sid }; pushed.push(month); continue;
        }
        if (action === 'removeRemote') { delete next[month]; manifestChanged = true; dropAfterManifest.push(month); removedShop.push(month); continue; }
        if (action === 'pull') {
          const e = entries[month]; if (e.bytes > MAX_SHARD_BYTES) continue;
          const tmp = await downloadCloudShard(n, e); if (!tmp) { out.failed.push(month); continue; }
          // checked before it replaces anything, so a damaged or swapped file leaves this register's month as it was
          const got = await d.inspect(tmp); if (!got || got.sid !== e.sid || got.bytes > MAX_SHARD_BYTES) { out.failed.push(month); continue; }
          await d.install(month, tmp); baseNow[month] = { l: got.sid, s: e.sid }; out.pulled.push(month); localChanged = true; continue;
        }
        if (action === 'removeLocal') { await d.removeLocal(month); delete baseNow[month]; out.removedHere.push(month); localChanged = true; }
      } catch { out.failed.push(month); }
    }

    if (manifestChanged) {
      const tag = remote.kind === 'manifest' ? remote.tag || null : null;
      const ok = await writeCloudManifest(n, next, meta, w.id, w.name, tag, now());
      if (!ok) { d.setBase(serializeBase(baseNow)); if (localChanged) await d.finish(meta, salesOf(local, entries)); return null; }
      for (const m of dropAfterManifest) delete baseNow[m];
    }
    Object.assign(baseNow, baseAfterManifest); out.pushed.push(...pushed); out.removedShop.push(...removedShop);
    d.setBase(serializeBase(baseNow));
    if (localChanged) await d.finish(meta, salesOf(local, entries));
    return out;
  }

  return {
    /**
     * Compare this register's months with the shop's and act on each (see `decideMonth`). Returns what was done, or null when nothing was
     * attempted (not active, practice mode, no register id, already running) or it failed. Never throws: the next poll tries again.
     * The base moves only for a month that was really agreed, and the manifest is written only if it has not changed since it was read.
     */
    async run(): Promise<SquareResult | null> {
      if (!d.active() || d.training() || running) return null;
      const w = d.who(); if (!w.id) return null;
      running = true;
      try {
        const n = await d.native(); const out = empty();
        for (let i = 0; i < ATTEMPTS; i++) {
          const r = await pass(n, w, out);
          if (r === 'stop') return null;
          if (r) return r;
        }
        return null;
      } catch { return null; } finally { running = false; }
    },
  };
}
export type SquareSync = ReturnType<typeof createSquareSync>;

function salesOf(local: LocalMonth[], remote: Record<string, ShardEntry>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of Object.values(remote)) out[e.month] = e.sales;
  for (const m of local) if (m.sales) out[m.month] = m.sales;
  return out;
}
