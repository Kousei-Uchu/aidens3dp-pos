// Location: src/lib/backupIO.ts
// Reads this device's settings + logins into a BackupV1, and applies one on another device.
import * as FS from 'expo-file-system/legacy';
import { useApp } from '../state/store';
import { getPassSecret, getReceiptSecret, getToken, loadCreds, saveCreds, setPassSecret, setReceiptSecret } from './shopify/client';
import { parseGrid } from './grid';
import { buildBackup, mergeSettings, type BackupV1 } from './backupFile';

export async function collectBackup(): Promise<BackupV1> {
  const c = await loadCreds();
  const [passSecret, receiptSecret] = await Promise.all([getPassSecret(), getReceiptSecret()]);
  const st = useApp.getState();
  const b = buildBackup({
    settings: st.settings as unknown as Record<string, unknown>, grid: st.grid, gridVersion: st.gridVersion,
    credentials: { shopifyDomain: c?.domain ?? '', shopifyClientId: c?.clientId ?? '', shopifyClientSecret: c?.clientSecret ?? '', passSecret, receiptSecret },
  });
  const logoData = await readLogoData(st.settings.screensaver.logoFile);
  if (logoData) b.settings.screensaver = { ...(b.settings.screensaver as object), logoData };
  return b;
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const MAX_LOGO_BYTES = 700_000;
/** An uploaded logo lives only on this device, so small ones travel inside the backup as a data link. */
async function readLogoData(file: string): Promise<string> {
  if (!file) return '';
  try {
    const info = await FS.getInfoAsync(file);
    if (!info.exists || (info.size ?? 0) > MAX_LOGO_BYTES) return '';
    const mime = MIME[file.split('.').pop()?.toLowerCase() ?? ''] ?? 'image/png';
    return `data:${mime};base64,${await FS.readAsStringAsync(file, { encoding: FS.EncodingType.Base64 })}`;
  } catch { return ''; }
}
async function writeLogoData(data: string): Promise<string> {
  const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(data);
  if (!m || m[2].length > MAX_LOGO_BYTES * 1.4) return '';
  try {
    const dir = `${FS.documentDirectory}branding/`; await FS.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    const to = `${dir}logo-${Date.now()}.${EXT[m[1]]}`; await FS.writeAsStringAsync(to, m[2], { encoding: FS.EncodingType.Base64 }); return to;
  } catch { return ''; }
}

/** Applies a validated backup. This device keeps its own register id/name. Returns a message for the user. */
export async function applyBackup(b: BackupV1): Promise<string> {
  const st = useApp.getState();
  const incoming: Record<string, any> = { ...b.settings };
  let logoFile = '';
  if (incoming.screensaver && typeof incoming.screensaver === 'object') {
    const { logoData, ...rest } = incoming.screensaver as Record<string, any>;
    if (typeof logoData === 'string') logoFile = await writeLogoData(logoData);
    incoming.screensaver = rest;
  }
  const merged: any = mergeSettings(st.settings as any, incoming);
  if (logoFile) merged.screensaver = { ...merged.screensaver, logoFile };
  st.patchSettings(merged);
  let gridNote = '';
  if (b.grid) { try { const r = parseGrid(b.grid.grid); st.setGrid(r.grid, b.grid.version); } catch { gridNote = ' The saved grid layout could not be read, so this device kept its own.'; } }
  const c = b.credentials;
  const hasShopify = !!(c.shopifyDomain && c.shopifyClientId && c.shopifyClientSecret);
  if (hasShopify) await saveCreds({ domain: c.shopifyDomain, clientId: c.shopifyClientId, clientSecret: c.shopifyClientSecret });
  if (c.passSecret) await setPassSecret(c.passSecret);
  if (c.receiptSecret) await setReceiptSecret(c.receiptSecret);
  if (!hasShopify) return `Settings restored. The backup had no Shopify login, so set that up under Settings ▸ Shopify.${gridNote}`;
  try { await getToken(true); return `Restored. The Shopify login works. Next, open Settings ▸ Shopify and tap Import from Shopify to load the catalogue.${gridNote}`; }
  catch (e: any) { return `Settings restored, but the Shopify login did not work: ${e.message}${gridNote}`; }
}
