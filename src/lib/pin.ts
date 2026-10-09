// Staff PINs: salted SHA-256 (stored in the shared settings metaobject, never the PIN itself).
// A 4-6 digit PIN is brute-forceable by anyone with Shopify admin access – this is a till lock, not security.
// Uses @noble/hashes (pure JS) so it works in the React Native bundle (no Node 'crypto') and in the tsx tests.
import { sha256 as nobleSha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
async function sha256(s: string): Promise<string> {
  return bytesToHex(nobleSha256(utf8ToBytes(s)));
}
export const newSalt = () => Math.random().toString(36).slice(2, 12);
export const hashPin = (salt: string, pin: string) => sha256(`${salt}:${pin}`);
export const verifyPin = async (salt: string, pin: string, hash: string) => (await hashPin(salt, pin)) === hash;
