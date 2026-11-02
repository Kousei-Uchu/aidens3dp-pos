// Location: src/lib/squareHistorySyncIO.ts
// CloudKit sync, patch 6a (Square history shards): the file work on this iPad for the shared months. Lists and hashes the month files,
// packs the copy that goes to iCloud (customer details removed), checks a downloaded month, and puts it in place the way the importer does
// (a file in `square-history/`). Kept apart from the pure rules so those run in the node tests; this part needs the iPad's file system.
// It reads the stored files through squareHistoryIO.ts and changes them only here, and only when sync takes a month in or removes one.
import * as FS from 'expo-file-system/legacy';
import type { HistSale } from './squareConvert';
import { bytesToB64, readStoredFile, rebuild, removeSquareHistory, squareHistoryDir, storedManifest } from './squareHistoryIO';
import { unpackJson } from './squareHistory';
import { isTraining } from './trainingGuard';
import { MAX_SHARD_BYTES, monthFileName, monthOfFile, packStable, shardHash, stripCustomers, type LocalMonth, type ShardMeta } from './squareHistoryShared';
import type { SquareSyncDeps } from './cloudkit/squareSync';

// The hash is worked out once per file, not on every poll: the cache is keyed by the name, the size and the time it was changed.
const cache = new Map<string, { size: number; mtime: number; hash: string }>();

async function hashPath(path: string): Promise<string> {
  return shardHash(await FS.readAsStringAsync(path, { encoding: FS.EncodingType.Base64 }));
}

export const listLocalMonths: SquareSyncDeps['listLocal'] = async (): Promise<LocalMonth[]> => {
  const dir = squareHistoryDir();
  if (!(await FS.getInfoAsync(dir)).exists) return [];
  const man = await storedManifest(); const sales = new Map((man?.files ?? []).map(f => [f.month, f.sales] as const));
  const out: LocalMonth[] = [];
  for (const name of (await FS.readDirectoryAsync(dir)).sort()) {
    const month = monthOfFile(name); if (!month) continue;
    const info = await FS.getInfoAsync(dir + name); if (!info.exists || (info.size ?? 0) <= 0) continue;
    const size = info.size ?? 0; const mtime = Number((info as { modificationTime?: number }).modificationTime ?? 0);
    if (size > MAX_SHARD_BYTES) { out.push({ month, hash: '', bytes: size, sales: sales.get(month) ?? 0 }); continue; }
    const hit = cache.get(name); let hash: string;
    if (hit && hit.size === size && hit.mtime === mtime) hash = hit.hash;
    else { hash = await hashPath(dir + name); cache.set(name, { size, mtime, hash }); }
    out.push({ month, hash, bytes: size, sales: sales.get(month) ?? 0 });
  }
  return out;
};

/** Reads this register's month, takes the customer details out, packs it the same way every time and writes it to a temporary file. */
export const prepareShard: SquareSyncDeps['prepare'] = async month => {
  try {
    const sales = unpackJson<HistSale[]>(await readStoredFile(monthFileName(month)));
    const path = `${FS.cacheDirectory}square-shard-${month}.json.gz`;
    await FS.writeAsStringAsync(path, bytesToB64(packStable(stripCustomers(sales))), { encoding: FS.EncodingType.Base64 });
    // hashed from the file as written, by the same read the other registers use to check what they download, so the two always agree
    const info = await FS.getInfoAsync(path); if (!info.exists) return null;
    return { path, sid: await hashPath(path), bytes: info.size ?? 0 };
  } catch { return null; }
};

export const inspectDownloadedShard: SquareSyncDeps['inspect'] = async path => {
  try { const info = await FS.getInfoAsync(path); if (!info.exists || (info.size ?? 0) <= 0) return null; return { sid: await hashPath(path), bytes: info.size ?? 0 }; } catch { return null; }
};

export const installShard: SquareSyncDeps['install'] = async (month, tempPath) => {
  if (isTraining()) return; // the files are the real ones on this iPad
  const dir = squareHistoryDir(); await FS.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const to = dir + monthFileName(month);
  await FS.deleteAsync(to, { idempotent: true }); await FS.copyAsync({ from: tempPath, to });
  cache.delete(monthFileName(month)); await FS.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
};

export const removeLocalMonth: SquareSyncDeps['removeLocal'] = async month => {
  if (isTraining()) return;
  cache.delete(monthFileName(month)); await FS.deleteAsync(squareHistoryDir() + monthFileName(month), { idempotent: true });
};

/**
 * After months were taken in or removed: write the stored manifest to match the files now on this iPad, then relink and rebuild the rollups
 * exactly as an import does. With no months left the whole history is removed, the same as Delete imported Square history.
 */
export const finishSquareChange: SquareSyncDeps['finish'] = async (meta: ShardMeta, sales: Record<string, number>) => {
  if (isTraining()) return;
  const dir = squareHistoryDir();
  const names = (await FS.getInfoAsync(dir)).exists ? (await FS.readDirectoryAsync(dir)).filter(n => monthOfFile(n)).sort() : [];
  if (!names.length) { await removeSquareHistory(); return; }
  const files: { name: string; bytes: number; sales: number; month: string }[] = [];
  for (const name of names) { const month = monthOfFile(name)!; const info = await FS.getInfoAsync(dir + name); files.push({ name, bytes: info.exists ? info.size ?? 0 : 0, sales: sales[month] ?? 0, month }); }
  const total = files.reduce((a, f) => a + f.sales, 0);
  const manifest = { v: 1, createdAt: meta.createdAt ?? new Date().toISOString(), from: meta.from, to: meta.to, sales: total, refunds: 0, locations: meta.locations, files };
  await FS.writeAsStringAsync(dir + 'manifest.json', JSON.stringify(manifest));
  await rebuild(() => {});
};
