// Location: gift-claim-server/src/claim.ts
// Pure helpers for the claim page (WebCrypto only, so they run in Workers and in node tests).
// A claim link is  https://<worker>/c/<CODE>.<SIG>  where SIG = first 32 hex of HMAC-SHA256(CLAIM_SECRET, `claim:${CODE}`).
// The POS signs it with the same secret, so only links the shop issued work, and guessing a link means guessing a 16-character code.
const enc = new TextEncoder();
const toHex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');

async function hmacHex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a), y = enc.encode(b); let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}
export const normaliseCode = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
export const claimSig = async (secret: string, rawCode: string) => (await hmacHex(secret, `claim:${normaliseCode(rawCode)}`)).slice(0, 32);

/** Splits `<CODE>.<SIG>` and checks the signature. Returns the normalised code, or null for anything not issued by the shop. */
export async function verifyClaimToken(secret: string, token: string): Promise<string | null> {
  const m = /^([A-Za-z0-9]{8,20})\.([0-9a-f]{32})$/.exec(token);
  if (!secret || !m) return null;
  const code = normaliseCode(m[1]);
  return safeEqual(await claimSig(secret, code), m[2]) ? code : null;
}
/** The note the POS puts on every card it creates: `pos|sale:…|chk:<first 10 hex of SHA-256(code)>`. Matches src/lib/shopify/giftcards.ts. */
export async function codeChecksum(code: string) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(normaliseCode(code)))).slice(0, 10);
}

export type ClaimFields = { name: string; email: string; message: string };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Returns the cleaned fields, or an error message to show the visitor. */
export function validateClaim(f: { name?: unknown; email?: unknown; message?: unknown }): { ok: true; value: ClaimFields } | { ok: false; error: string } {
  const name = String(f.name ?? '').trim().replace(/\s+/g, ' '); const email = String(f.email ?? '').trim().toLowerCase(); const message = String(f.message ?? '').trim();
  if (!name || name.length > 100) return { ok: false, error: 'Please enter your name (up to 100 characters).' };
  if (email.length > 254 || !EMAIL.test(email)) return { ok: false, error: 'That email address does not look right.' };
  if (message.length > 200) return { ok: false, error: 'Please keep the message to 200 characters.' };
  return { ok: true, value: { name, email, message } };
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const page = (shop: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(shop)} gift card</title><style>
body{font:16px/1.45 -apple-system,system-ui,sans-serif;margin:0;background:#f5f5f5;color:#111}main{max-width:420px;margin:0 auto;padding:28px 18px}
h1{font-size:22px;margin:0 0 6px}p{color:#444;margin:6px 0 16px}label{display:block;font-weight:600;margin:14px 0 4px}
input,textarea{width:100%;box-sizing:border-box;font:inherit;padding:12px;border:1px solid #bbb;border-radius:10px;background:#fff}
button{margin-top:20px;width:100%;font:inherit;font-weight:700;padding:14px;border:0;border-radius:12px;background:#111;color:#fff}
.err{background:#fee2e2;color:#991b1b;padding:10px 12px;border-radius:10px;margin-top:14px}.card{background:#fff;border-radius:16px;padding:20px}
</style></head><body><main><div class="card">${body}</div></main></body></html>`;

export const messagePage = (shop: string, title: string, text: string) => page(shop, `<h1>${esc(title)}</h1><p>${esc(text)}</p>`);
export const formPage = (shop: string, last4: string, v: Partial<ClaimFields> = {}, error = '') => page(shop, `<h1>You have a gift card from ${esc(shop)}</h1>
<p>Card ending <b>${esc(last4)}</b>. Tell us where to send it and we will email it to you.</p>
<form method="post">${error ? `<div class="err">${esc(error)}</div>` : ''}
<label for="n">Your name</label><input id="n" name="name" autocomplete="name" maxlength="100" required value="${esc(v.name ?? '')}">
<label for="e">Your email</label><input id="e" name="email" type="email" autocomplete="email" inputmode="email" maxlength="254" required value="${esc(v.email ?? '')}">
<label for="m">Message (optional)</label><textarea id="m" name="message" rows="2" maxlength="200">${esc(v.message ?? '')}</textarea>
<button type="submit">Send me my gift card</button></form>`);
