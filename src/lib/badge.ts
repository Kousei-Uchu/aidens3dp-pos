// Location: src/lib/badge.ts
// Cashier pass codes. A pass is a barcode holding a random 60-bit code; only a salted hash of it is stored on the staff member,
// so the staff list (which syncs to Shopify) never contains a code that could be used to sign in.
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

let Crypto: any;
try { Crypto = require('expo-crypto'); } catch { /* node / tests */ }
function rand(n: number): Uint8Array {
  try { const b = Crypto.getRandomBytes(n); if (b?.length === n) return b; } catch { /* fall through */ }
  const g = (globalThis as any).crypto;
  if (g?.getRandomValues) return g.getRandomValues(new Uint8Array(n));
  throw new Error('No secure random source available on this device.');
}

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O or U to misread
export const BADGE_RE = /^P[0-9A-HJKMNP-TV-Z]{12}$/;
export const BADGE_LENGTH = 13;

/** 'P' plus 12 random base32 characters (60 bits). Short enough for a readable Code 128 on a phone screen. */
export function newBadgeCode(): string { return 'P' + [...rand(12)].map(b => ALPHABET[b & 31]).join(''); }
export const newBadgeSalt = (): string => bytesToHex(rand(8));

/** Scanners sometimes add spaces or change case; nothing else is touched. */
export const cleanScan = (raw: string): string => raw.trim().toUpperCase().replace(/[\s-]/g, '');
export const isBadgeCode = (raw: string): boolean => BADGE_RE.test(cleanScan(raw));
export const hashBadge = (salt: string, code: string): string => bytesToHex(sha256(utf8ToBytes(`badge:${salt}:${cleanScan(code)}`)));

const same = (a: string, b: string) => { let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; };
export type BadgeHolder = { id: string; badgeSalt?: string; badgeHash?: string };
/** Which staff member (if any) owns this scanned code. */
export function findByBadge<T extends BadgeHolder>(staff: T[], raw: string): T | null {
  const code = cleanScan(raw); if (!BADGE_RE.test(code)) return null;
  for (const m of staff) if (m.badgeSalt && m.badgeHash && same(hashBadge(m.badgeSalt, code), m.badgeHash)) return m;
  return null;
}
export const hasBadge = (m: BadgeHolder): boolean => !!(m.badgeSalt && m.badgeHash);
