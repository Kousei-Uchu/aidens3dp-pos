// Location: src/lib/setupTransfer.ts
// 0246: set up a new register or companion from one that is already set up, by QR, without iCloud.
// The set up device shows a QR code and serves its ordinary encrypted backup (the same file as Settings ▸ Backup, see
// backupFile.ts) for a few minutes on the shop Wi-Fi, once. The QR holds the address, a random path and a one-time code, and the
// code is the backup's passphrase, so the Wi-Fi only ever carries ciphertext and the code never leaves the screen.
// Pure: no sockets, no storage, no React (see setupTransferIO.ts), so every rule here is tested in Node.
import { usableLanIp } from './squareShare';

export const SETUP_FILE = 'setup.posbackup';
/** The code and the address stop working after this long, or after the first successful transfer. */
export const SETUP_TTL_MS = 5 * 60 * 1000;
const PREFIX = 'POSSETUP1';
/** No 0, O, 1 or I, so a code read aloud or typed is hard to get wrong. 32 symbols, so 5 bits each. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 16; // 80 bits

/** The one-time code. The caller supplies the random bytes so the tests do not depend on a random source. */
export function newSetupCode(random: Uint8Array): string {
  if (random.length < CODE_LENGTH) throw new Error(`Need ${CODE_LENGTH} random bytes for the setup code.`);
  let s = ''; for (let i = 0; i < CODE_LENGTH; i++) s += ALPHABET[random[i] & 31]; return s;
}
export const isSetupCode = (s: string): boolean => s.length === CODE_LENGTH && [...s].every(ch => ALPHABET.includes(ch));

/** Home and office Wi-Fi addresses only. A code scanned from anywhere else is never followed to a public address. */
export function privateLanIp(ip: string): boolean {
  if (!usableLanIp(ip)) return false;
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export type SetupTarget = { ip: string; port: number; key: string; code: string; url: string };

export function setupQr(ip: string, port: number, key: string, code: string): string {
  if (!privateLanIp(ip)) throw new Error('This device is not on a home or shop Wi-Fi network, so it cannot share its setup.');
  if (!/^[a-f0-9]{16}$/.test(key) || !isSetupCode(code) || !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Could not build a valid setup code.');
  return [PREFIX, ip, port, key, code].join('|');
}

/** Null unless the text is a setup QR this app made, with a Wi-Fi address on a private network. */
export function parseSetupQr(text: string): SetupTarget | null {
  const p = text.trim().split('|'); if (p.length !== 5 || p[0] !== PREFIX) return null;
  const [, ip, portText, key, code] = p; const port = Number(portText);
  if (!privateLanIp(ip) || !/^\d{4,5}$/.test(portText) || port < 1024 || port > 65535 || !/^[a-f0-9]{16}$/.test(key) || !isSetupCode(code)) return null;
  return { ip, port, key, code, url: `http://${ip}:${port}/${key}/${SETUP_FILE}` };
}
export const looksLikeSetupQr = (text: string): boolean => text.trim().startsWith(`${PREFIX}|`);

export type SetupEnd = 'done' | 'manual' | 'ttl' | 'background' | 'error';
export const SETUP_END_TEXT: Record<SetupEnd, string> = {
  done: 'Sent. Setup sharing has stopped and the code no longer works.',
  manual: 'Sharing stopped.',
  ttl: 'Sharing stopped after 5 minutes. Start it again for another device.',
  background: 'Sharing stopped because the app was left. Start it again for another device.',
  error: 'Sharing stopped because of a problem.',
};
export const setupStatusLine = (served: boolean): string => (served ? 'Sent. Finishing on the other device…' : 'Waiting for the new device to scan this code…');

/** What the new device does with what came back, in plain words. */
export function describeFetchFailure(status: number | null, message: string): string {
  if (status === 404) return 'That code has already been used or has expired. Show a fresh one on the set up device.';
  if (status !== null) return `The other device answered ${status}. Show a fresh code and try again.`;
  return `Could not reach the other device (${message}). Both devices need to be on the same Wi-Fi, with Local Network allowed for this app in iOS Settings.`;
}
