// Location: src/lib/badgeStore.ts
// The iPad that issues a cashier pass keeps its code in the Keychain so the pass can be printed or sent again without cancelling it.
// Other iPads only ever hold the hash (in the staff list), so they can check a pass but not recreate one.
import * as SecureStore from 'expo-secure-store';

const key = (staffId: string) => `pos.badge.${staffId.replace(/[^a-zA-Z0-9._-]/g, '')}`;
export const rememberBadge = async (staffId: string, code: string) => { try { await SecureStore.setItemAsync(key(staffId), code); } catch { /* keychain unavailable */ } };
export const recallBadge = async (staffId: string): Promise<string> => { try { return (await SecureStore.getItemAsync(key(staffId))) ?? ''; } catch { return ''; } };
export const forgetBadge = async (staffId: string) => { try { await SecureStore.deleteItemAsync(key(staffId)); } catch { /* ignore */ } };
