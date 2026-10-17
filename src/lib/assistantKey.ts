// Location: src/lib/assistantKey.ts
// The model API key. Keychain only (expo-secure-store): never in settings, never in the shared settings, never in chat history or the log.
// It does travel in the Backup & transfer file with the other logins, so a restored iPad can reach the same model.
import * as SecureStore from 'expo-secure-store';
import { isTraining } from './trainingGuard';

const KEY = 'pos.assistantKey';
export const getAssistantKey = async (): Promise<string> => { try { return (await SecureStore.getItemAsync(KEY)) ?? ''; } catch { return ''; } };
/** Empty text removes the key. Practice mode never writes it. */
export const setAssistantKey = async (v: string): Promise<void> => {
  if (isTraining()) return;
  try { const t = v.trim(); if (t) await SecureStore.setItemAsync(KEY, t); else await SecureStore.deleteItemAsync(KEY); } catch { /* the Keychain can refuse on a locked device; the next save tries again */ }
};
