// Location: pass-server/src/verify.ts
// Request authentication helpers (WebCrypto only, so they run in Workers and in node tests).
const enc = new TextEncoder();
const toHex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const toB64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));

async function hmac(secret: string, msg: string | Uint8Array) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, (typeof msg === 'string' ? enc.encode(msg) : msg) as BufferSource);
}
/** Constant-time string compare (length leak only). */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a), y = enc.encode(b); let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}
export const TTL_SEC = 300;

/** /pass?code&ts&sig  — sig = HMAC-SHA256(POS_SECRET, `${code}.${ts}`) hex, valid for 5 minutes (and not from the future). */
export async function verifyPassRequest(secret: string, code: string, ts: string, sig: string, nowMs = Date.now()): Promise<boolean> {
  if (!secret || !code || !/^\d{9,12}$/.test(ts) || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const age = Math.floor(nowMs / 1000) - Number(ts);
  if (age > TTL_SEC || age < -30) return false;
  return safeEqual(toHex(await hmac(secret, `${code}.${ts}`)), sig);
}
/** Shopify webhook: X-Shopify-Hmac-Sha256 = base64 HMAC-SHA256(rawBody, app client secret). */
export async function verifyShopifyWebhook(secret: string, rawBody: Uint8Array, header: string | null): Promise<boolean> {
  if (!secret || !header) return false;
  return safeEqual(toB64(await hmac(secret, rawBody)), header);
}
export const authToken = async (secret: string, serial: string) => toHex(await hmac(secret, `pass-auth:${serial}`)).slice(0, 40);

/** Cashier pass: the app POSTs {name, role, code, format, shop, ts, sig}; sig = HMAC-SHA256(POS_SECRET, message) over every field, valid for 5 minutes. */
export type StaffPassFields = { name: string; role: string; code: string; format: string; shop: string };
export const staffPassMessage = (f: StaffPassFields, ts: string | number) => ['staffpass', ts, f.name, f.role, f.code, f.format, f.shop].join('\n');
export async function verifyStaffPassRequest(secret: string, f: StaffPassFields, ts: string, sig: string, nowMs = Date.now()): Promise<boolean> {
  if (!secret || !/^\d{9,12}$/.test(ts) || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const age = Math.floor(nowMs / 1000) - Number(ts);
  if (age > TTL_SEC || age < -30) return false;
  return safeEqual(toHex(await hmac(secret, staffPassMessage(f, ts))), sig);
}
/** Returns an error message, or null when the fields are acceptable for a cashier pass. */
export function validateStaffPass(f: StaffPassFields): string | null {
  if (!f.name || f.name.length > 40) return 'Name must be 1 to 40 characters';
  if (!['cashier', 'manager', 'owner'].includes(f.role)) return 'Unknown role';
  if (!/^P[0-9A-HJKMNP-TV-Z]{12}$/.test(f.code)) return 'Bad pass code';
  if (!['qr', 'code128'].includes(f.format)) return 'Unknown barcode format';
  if (f.shop.length > 60) return 'Shop name too long';
  return null;
}
