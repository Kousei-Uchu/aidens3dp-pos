// Location: src/lib/backupFile.ts
// Settings + login backup for moving a register to another device.
// Two file kinds: plain JSON (readable, contains secrets) and an encrypted envelope (scrypt key + XChaCha20-Poly1305).
// Pure logic only (no React Native imports) so it runs in the node tests.
import { scryptAsync } from '@noble/hashes/scrypt';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';

export const BACKUP_APP = 'shopify-zeller-pos';
export const BACKUP_VERSION = 1;
export const MIN_PASSPHRASE = 8;
/** Settings that identify this particular device and must never be copied to another one. */
export const DEVICE_KEYS = ['registerId', 'registerName', 'sharedVersion'] as const;

export type BackupCredentials = { shopifyDomain: string; shopifyClientId: string; shopifyClientSecret: string; passSecret: string; receiptSecret: string };
export type BackupV1 = {
  app: typeof BACKUP_APP; v: number; createdAt: string;
  settings: Record<string, unknown>; grid?: { grid: unknown; version: number };
  credentials: BackupCredentials;
};

export function buildBackup(i: { settings: Record<string, unknown>; grid?: unknown; gridVersion?: number; credentials: BackupCredentials; now?: Date }): BackupV1 {
  const settings: Record<string, unknown> = { ...i.settings };
  for (const k of DEVICE_KEYS) delete settings[k];
  dropLogoPath(settings);
  return {
    app: BACKUP_APP, v: BACKUP_VERSION, createdAt: (i.now ?? new Date()).toISOString(), settings,
    ...(i.grid ? { grid: { grid: i.grid, version: i.gridVersion ?? 0 } } : {}), credentials: { ...i.credentials },
  };
}

/** The screensaver logo path only means something on the device that saved it, so it never travels in a backup (the image itself can, as logoData). */
function dropLogoPath(settings: Record<string, any>) {
  if (settings.screensaver && typeof settings.screensaver === 'object') { const { logoFile: _drop, ...rest } = settings.screensaver; settings.screensaver = rest; }
}
const str = (x: unknown) => (typeof x === 'string' ? x : '');
/** Throws a readable error unless `x` is a backup this app version understands. */
export function validateBackup(x: unknown): BackupV1 {
  const b = x as any;
  if (!b || typeof b !== 'object' || b.app !== BACKUP_APP) throw new Error('This is not a backup from this app.');
  if (typeof b.v !== 'number' || b.v < 1) throw new Error('Unreadable backup version.');
  if (b.v > BACKUP_VERSION) throw new Error('This backup was made by a newer version of the app. Update the app first.');
  if (!b.settings || typeof b.settings !== 'object' || Array.isArray(b.settings)) throw new Error('The backup has no settings.');
  const c = b.credentials ?? {};
  const settings = { ...b.settings }; for (const k of DEVICE_KEYS) delete settings[k]; // never trust a file to overwrite this device's identity
  dropLogoPath(settings);
  return {
    app: BACKUP_APP, v: b.v, createdAt: str(b.createdAt), settings,
    ...(b.grid && typeof b.grid === 'object' && b.grid.grid ? { grid: { grid: b.grid.grid, version: Number(b.grid.version) || 0 } } : {}),
    credentials: { shopifyDomain: str(c.shopifyDomain), shopifyClientId: str(c.shopifyClientId), shopifyClientSecret: str(c.shopifyClientSecret), passSecret: str(c.passSecret), receiptSecret: str(c.receiptSecret) },
  };
}

/** Restored settings laid over this device's current ones; nested groups merge so new fields keep their defaults. */
export function mergeSettings<S extends Record<string, any>>(current: S, restored: Record<string, any>): S {
  const out: Record<string, any> = { ...current, ...restored };
  for (const k of ['fees', 'receipt', 'screensaver', 'inventory']) if (current[k] && typeof current[k] === 'object') out[k] = { ...current[k], ...(restored[k] ?? {}) };
  for (const k of DEVICE_KEYS) if (k in current) out[k] = current[k];
  return out as S;
}

export const backupFileName = (encrypted: boolean, now = new Date()) => `pos-backup-${now.toISOString().slice(0, 10)}.${encrypted ? 'posbackup' : 'json'}`;

// ---------- encrypted envelope ----------
type Envelope = { format: 'pos-backup'; v: 1; kdf: 'scrypt'; N: number; r: number; p: number; cipher: 'xchacha20-poly1305'; salt: string; nonce: string; ct: string };
const KDF = { N: 2 ** 15, r: 8, p: 1 };
const N_MIN = 2 ** 10, N_MAX = 2 ** 18; // a hostile file must not be able to demand unbounded memory

let Crypto: any;
try { Crypto = require('expo-crypto'); } catch { /* node / tests */ }
function rand(n: number): Uint8Array {
  try { const b = Crypto.getRandomBytes(n); if (b?.length === n) return b; } catch { /* fall through */ }
  const g = (globalThis as any).crypto;
  if (g?.getRandomValues) return g.getRandomValues(new Uint8Array(n));
  throw new Error('No secure random source available on this device.');
}
// Hermes may not ship TextDecoder on every React Native version, so fall back to a manual UTF-8 decode.
function bytesToString(b: Uint8Array): string {
  const TD = (globalThis as any).TextDecoder;
  if (TD) return new TD().decode(b);
  let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return decodeURIComponent(escape(s));
}
const pw = (p: string) => utf8ToBytes(p.normalize('NFKC'));
const aad = (e: Omit<Envelope, 'nonce' | 'ct'>) => utf8ToBytes(`${e.format}|${e.v}|${e.kdf}|${e.N}|${e.r}|${e.p}|${e.cipher}|${e.salt}`);
const deriveKey = (pass: string, salt: Uint8Array, N: number, r: number, p: number) => scryptAsync(pw(pass), salt, { N, r, p, dkLen: 32, asyncTick: 10 });

export async function encryptBackup(plaintext: string, passphrase: string): Promise<string> {
  if (passphrase.length < MIN_PASSPHRASE) throw new Error(`Use a passphrase of at least ${MIN_PASSPHRASE} characters.`);
  const salt = rand(16), nonce = rand(24);
  const head = { format: 'pos-backup' as const, v: 1 as const, kdf: 'scrypt' as const, ...KDF, cipher: 'xchacha20-poly1305' as const, salt: bytesToHex(salt) };
  const key = await deriveKey(passphrase, salt, KDF.N, KDF.r, KDF.p);
  const ct = xchacha20poly1305(key, nonce, aad(head)).encrypt(utf8ToBytes(plaintext));
  const env: Envelope = { ...head, nonce: bytesToHex(nonce), ct: bytesToHex(ct) };
  return JSON.stringify(env);
}

export type BackupKind = 'encrypted' | 'plain';
/** Looks at file text and says which kind it is; throws if it's neither. */
export function detectBackup(text: string): BackupKind {
  let j: any; try { j = JSON.parse(text); } catch { throw new Error('That file is not a backup (it is not valid JSON).'); }
  if (j?.format === 'pos-backup') return 'encrypted';
  if (j?.app === BACKUP_APP) return 'plain';
  throw new Error('That file is not a backup from this app.');
}

export async function decryptBackup(text: string, passphrase: string): Promise<string> {
  let e: any; try { e = JSON.parse(text); } catch { throw new Error('The backup file is damaged.'); }
  const hex = (s: unknown, n?: number) => typeof s === 'string' && /^[0-9a-f]*$/i.test(s) && s.length % 2 === 0 && (n === undefined || s.length === n * 2);
  if (e?.format !== 'pos-backup' || e.v !== 1 || e.kdf !== 'scrypt' || e.cipher !== 'xchacha20-poly1305' || !hex(e.salt) || !hex(e.nonce, 24) || !hex(e.ct)) throw new Error('The backup file is damaged or from an unsupported version.');
  const { N, r, p } = e;
  if (![N, r, p].every(Number.isInteger) || N < N_MIN || N > N_MAX || (N & (N - 1)) !== 0 || r < 1 || r > 16 || p < 1 || p > 4) throw new Error('The backup file has unsupported encryption settings.');
  try {
    const key = await deriveKey(passphrase, hexToBytes(e.salt), N, r, p);
    const pt = xchacha20poly1305(key, hexToBytes(e.nonce), aad(e)).decrypt(hexToBytes(e.ct));
    return bytesToString(pt);
  } catch { throw new Error('Wrong passphrase, or the file has been changed.'); }
}
