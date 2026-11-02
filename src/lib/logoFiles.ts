// Location: src/lib/logoFiles.ts
// CloudKit sync, patch 6a (the logo): the file work on this iPad for the shared logo. Reads and hashes the uploaded logo, checks a
// downloaded one, and puts it in place the way Settings ▸ Screensaver & display does (a file in `branding/`, named in `screensaver.logoFile`).
// Kept apart from the pure rules so those run in the node tests; this part needs the iPad's file system.
import * as FS from 'expo-file-system/legacy';
import { useApp } from '../state/store';
import { isTraining } from './trainingGuard';
import { LOGO_EXT, MAX_LOGO_BYTES, isLogoType, logoHash, logoTypeOfPath, type LogoType } from './logoShared';
import type { LocalLogo, LogoSyncDeps } from './cloudkit/logoSync';

// The hash is worked out once per file, not on every poll: the cache is keyed by the path and the size, and a new upload has a new path.
let cache: { path: string; size: number; hash: string; type: LogoType } | null = null;

async function hashFile(path: string): Promise<{ hash: string; type: LogoType; bytes: number } | null> {
  const type = logoTypeOfPath(path); if (!type) return null;
  const info = await FS.getInfoAsync(path); if (!info.exists || (info.size ?? 0) <= 0) return null;
  const bytes = info.size ?? 0; if (bytes > MAX_LOGO_BYTES) return { hash: '', type, bytes };
  if (cache && cache.path === path && cache.size === bytes) return { hash: cache.hash, type, bytes };
  const hash = logoHash(await FS.readAsStringAsync(path, { encoding: FS.EncodingType.Base64 }));
  cache = { path, size: bytes, hash, type }; return { hash, type, bytes };
}

export const readLocalLogo: LogoSyncDeps['readLocal'] = async (): Promise<LocalLogo> => {
  const path = useApp.getState().settings.screensaver.logoFile; if (!path) return null;
  const h = await hashFile(path); if (!h) return null; // a file that has gone missing counts as no logo, so the shop's replaces it
  return h.bytes > MAX_LOGO_BYTES ? { tooBig: true } : { path, hash: h.hash, type: h.type, bytes: h.bytes };
};

export const inspectDownloadedLogo: LogoSyncDeps['inspect'] = async path => {
  const h = await hashFile(path); return h && isLogoType(h.type) && h.hash ? h : null;
};

export const installDownloadedLogo: LogoSyncDeps['install'] = async (tempPath, type) => {
  if (isTraining()) return; // a new file in Documents that nothing would clean up afterwards
  const dir = `${FS.documentDirectory}branding/`; await FS.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const to = `${dir}logo-${Date.now()}.${LOGO_EXT[type]}`;
  await FS.copyAsync({ from: tempPath, to });
  const old = useApp.getState().settings.screensaver.logoFile;
  const ss = useApp.getState().settings.screensaver;
  useApp.getState().patchSettings({ screensaver: { ...ss, logoFile: to } });
  if (old && old !== to) await FS.deleteAsync(old, { idempotent: true }).catch(() => {});
  await FS.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
};

export const clearLocalLogo: LogoSyncDeps['clear'] = async () => {
  if (isTraining()) return;
  const ss = useApp.getState().settings.screensaver; const old = ss.logoFile;
  useApp.getState().patchSettings({ screensaver: { ...ss, logoFile: '' } });
  if (old) await FS.deleteAsync(old, { idempotent: true }).catch(() => {});
};
