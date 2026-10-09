// Tiny JSON key/value store over AsyncStorage (falls back to memory so tests/node never crash).
let AS: any = null;
try { AS = require('@react-native-async-storage/async-storage').default; } catch { AS = null; }
const mem = new Map<string, string>();
export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  try { const s = AS ? await AS.getItem(key) : mem.get(key) ?? null; return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; }
}
export async function kvSet(key: string, value: unknown): Promise<void> {
  const s = JSON.stringify(value);
  try { if (AS) await AS.setItem(key, s); else mem.set(key, s); } catch { /* storage full – next write retries */ }
}
export async function kvDel(key: string): Promise<void> { try { if (AS) await AS.removeItem(key); else mem.delete(key); } catch {} }
