// Location: src/lib/cloudkit/exportAllIO.ts
// CloudKit sync, patch 6e (N3, O5): writes the owner's export zip to the iPad and hands it to the share sheet. The reading and the zip are
// in exportAll.ts (tested in Node). This half only touches the file system and the share sheet, so it is the one part with no unit test.
import * as FS from 'expo-file-system/legacy';
import { collectExport, exportFolderName, zipExport, type ExportMeta, type ExportNative } from './exportAll';
import { b64ToBytes, bytesToB64 } from '../squareHistoryIO';
import { TrainingBlockedError, isTraining } from '../trainingGuard';

export type ExportFile = { path: string; name: string; counts: Record<string, number> };

/** Read everything from CloudKit and write one zip into the cache folder. The caller shares it. Throws if anything could not be read. */
export async function writeCloudKitExport(n: ExportNative & { downloadLogo?: () => Promise<string | null> }, meta: ExportMeta, progress?: (what: string) => void): Promise<ExportFile> {
  if (isTraining()) throw new TrainingBlockedError('backing up iCloud'); // a practice run never writes a file from the shop's real iCloud data
  const r = await collectExport(n, meta, {
    progress,
    readLogo: async () => { const p = await n.downloadLogo?.(); return p ? b64ToBytes(await FS.readAsStringAsync(p, { encoding: FS.EncodingType.Base64 })) : null; },
  });
  const name = `${exportFolderName(meta.exportedAt)}.zip`;
  await FS.makeDirectoryAsync(FS.cacheDirectory ?? '', { intermediates: true }).catch(() => {});
  const path = `${FS.cacheDirectory}${name}`;
  await FS.writeAsStringAsync(path, bytesToB64(zipExport(r, exportFolderName(meta.exportedAt))), { encoding: FS.EncodingType.Base64 });
  return { path, name, counts: r.counts };
}
