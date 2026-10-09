// Signed, short-lived pass URLs. Safari opens the link (no custom headers), so the proof travels in the query string:
//   sig = HMAC-SHA256(secret, `${code}.${ts}`) hex;  the Worker rejects anything older than 5 minutes or with a bad signature.
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

export const PASS_URL_TTL_SEC = 300;
export const signPass = (secret: string, code: string, ts: number) => bytesToHex(hmac(sha256, utf8ToBytes(secret), utf8ToBytes(`${code}.${ts}`)));
export function signedPassUrl(base: string, secret: string, rawCode: string, now = Date.now()): string {
  const code = rawCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase(); const ts = Math.floor(now / 1000);
  return `${base.replace(/\/$/, '')}/pass?code=${encodeURIComponent(code)}&ts=${ts}&sig=${signPass(secret, code, ts)}`;
}

/** Cashier pass request: the app POSTs these fields (the badge code stays out of URLs and logs) with a 5-minute HMAC over all of them. */
export type StaffPassFields = { name: string; role: string; code: string; format: string; shop: string };
export const staffPassMessage = (f: StaffPassFields, ts: number) => ['staffpass', ts, f.name, f.role, f.code, f.format, f.shop].join('\n');
export const signStaffPass = (secret: string, f: StaffPassFields, ts: number) => bytesToHex(hmac(sha256, utf8ToBytes(secret), utf8ToBytes(staffPassMessage(f, ts))));
/** Asks the pass server for a signed .pkpass and returns its bytes. */
export async function requestStaffPass(base: string, secret: string, f: StaffPassFields, now = Date.now()): Promise<Uint8Array> {
  const ts = Math.floor(now / 1000);
  const res = await fetch(`${base.replace(/\/$/, '')}/staff-pass`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...f, ts, sig: signStaffPass(secret, f, ts) }) });
  if (!res.ok) throw new Error(res.status === 401 ? 'The pass server rejected the secret. Check it matches the Worker\'s POS_SECRET.' : `The pass server said ${res.status}: ${(await res.text().catch(() => '')).slice(0, 120)}`);
  return new Uint8Array(await res.arrayBuffer());
}
