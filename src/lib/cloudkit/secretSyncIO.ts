// Location: src/lib/cloudkit/secretSyncIO.ts
// CloudKit sync, patch 6d (secrets, the Keychain side): how each secret is read from and kept on this iPad, and where the fingerprints of what
// was last agreed with the shop are remembered. It touches the Keychain, so sync.ts loads it only when a run happens and the node tests never
// import it. The rules are in secretsShared.ts and secretSync.ts. Practice mode never gets here (secretSync stops first, and every setter below
// also refuses in practice mode).
import * as SecureStore from 'expo-secure-store';
import { getAssistantKey, setAssistantKey } from '../assistantKey';
import { rememberBadge, recallBadge } from '../badgeStore';
import { getClaimSecret, getPassSecret, getReceiptSecret, loadCreds, saveCreds, setClaimSecret, setPassSecret, setReceiptSecret } from '../shopify/client';
import { badgeSecretName, packShopify, unpackShopify } from '../secretsShared';
import { isTraining } from '../trainingGuard';

const BASE_KEY = 'pos.secretsBase';
const BADGE = 'badge.';

/** The names this iPad could hold: one pass code per cashier. (The fixed names are added by the caller.) */
export const secretNamesFor = (staffIds: string[]): string[] => staffIds.filter(Boolean).map(badgeSecretName);

export async function readSecret(name: string): Promise<string | null> {
  if (name === 'shopify') { const c = await loadCreds(); return c ? packShopify(c) : null; }
  if (name === 'pass') return (await getPassSecret()) || null;
  if (name === 'claim') return (await getClaimSecret()) || null;
  if (name === 'receipt') return (await getReceiptSecret()) || null;
  if (name === 'assistant') return (await getAssistantKey()) || null;
  if (name.startsWith(BADGE)) return (await recallBadge(name.slice(BADGE.length))) || null;
  return null;
}

/** Keep the shop's value here. False for a name this iPad has no place for, or a value that is not usable (nothing is changed then). */
export async function writeSecret(name: string, value: string): Promise<boolean> {
  if (isTraining()) return false; // practice mode never changes the real secrets
  if (name === 'shopify') { const c = unpackShopify(value); if (!c) return false; await saveCreds(c); return true; }
  if (name === 'pass') { await setPassSecret(value); return true; }
  if (name === 'claim') { await setClaimSecret(value); return true; }
  if (name === 'receipt') { await setReceiptSecret(value); return true; }
  if (name === 'assistant') { await setAssistantKey(value); return true; }
  if (name.startsWith(BADGE) && name.length > BADGE.length) { await rememberBadge(name.slice(BADGE.length), value); return true; }
  return false;
}

/** Fingerprints only, in the Keychain: a short hash of each agreed secret, never the secret. */
export async function loadSecretBase(): Promise<Record<string, string>> {
  try {
    const raw = await SecureStore.getItemAsync(BASE_KEY); const j = raw ? JSON.parse(raw) : {};
    return j && typeof j === 'object' ? Object.fromEntries(Object.entries(j).filter(([, v]) => typeof v === 'string')) as Record<string, string> : {};
  } catch { return {}; }
}
export async function saveSecretBase(base: Record<string, string>): Promise<void> {
  if (isTraining()) return;
  try { await SecureStore.setItemAsync(BASE_KEY, JSON.stringify(base)); } catch { /* the Keychain can refuse on a locked device; the next run tries again */ }
}
