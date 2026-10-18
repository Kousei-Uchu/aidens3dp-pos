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

// Storefront styling (E1): same Instrument Sans, logo, plum and peach colours and pill buttons as the Docs site
// (docs-server/src/index.ts is the source of truth for these values) and the main Shopify storefront.
const LOGO = 'https://www.aidens3dp.com/cdn/shop/files/Untitled_design_1.png?height=108&v=1745546152';
const FONTS = `@font-face{font-family:"Instrument Sans";font-style:normal;font-weight:400;font-display:swap;src:url("https://www.aidens3dp.com/cdn/fonts/instrument_sans/instrumentsans_n4.db86542ae5e1596dbdb28c279ae6c2086c4c5bfa.woff2") format("woff2")}
@font-face{font-family:"Instrument Sans";font-style:normal;font-weight:700;font-display:swap;src:url("https://www.aidens3dp.com/cdn/fonts/instrument_sans/instrumentsans_n7.e4ad9032e203f9a0977786c356573ced65a7419a.woff2") format("woff2")}`;

const page = (shop: string, body: string) => `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#13111c"><title>${esc(shop)} gift card</title><style>
${FONTS}
:root{font:16px/1.55 "Instrument Sans",sans-serif;color:#efd8c9;background:#13111c;font-synthesis:none;--bg:#13111c;--surface:#1b1924;--surface-raised:#211e29;--fg:#efd8c9;--muted:rgba(239,216,201,.68);--line:rgba(246,237,221,.16);--accent:#fae9dc;--accent-text:#13111c;--highlight:#fb873f;--soft:rgba(246,237,221,.08)}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg)}
header{display:flex;align-items:center;gap:11px;padding:16px 20px;border-bottom:1px solid var(--line)}
.brand-mark{display:block;width:34px;height:34px;object-fit:contain}header strong{font-size:17px;font-weight:500}
main{max-width:440px;margin:0 auto;padding:26px 18px 46px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:24px 22px}
h1{font-size:24px;line-height:1.25;font-weight:400;margin:0 0 8px;letter-spacing:-.02em}
p{color:var(--muted);margin:6px 0 18px;line-height:1.6}
label{display:block;font-weight:700;font-size:13px;margin:16px 0 6px}
input,textarea{width:100%;font:inherit;padding:12px 13px;border:1px solid var(--line);border-radius:12px;background:var(--soft);color:var(--fg);outline:none}
input::placeholder,textarea::placeholder{color:var(--muted)}
input:focus,textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(250,233,220,.18)}
button{margin-top:22px;width:100%;font:inherit;font-weight:600;padding:13px 20px;border:0;border-radius:100px;background:var(--accent);color:var(--accent-text);cursor:pointer;transition:filter .15s ease}
button:hover{filter:brightness(.92)}
.err{background:rgba(251,135,63,.14);color:#f7a76c;border:1px solid rgba(251,135,63,.4);padding:11px 13px;border-radius:12px;margin:0 0 4px}
</style></head><body><header><img class="brand-mark" src="${LOGO}" alt="Aiden’s 3D Printing"><strong>${esc(shop)}</strong></header><main><div class="card">${body}</div></main></body></html>`;

export const messagePage = (shop: string, title: string, text: string) => page(shop, `<h1>${esc(title)}</h1><p>${esc(text)}</p>`);
export const formPage = (shop: string, last4: string, v: Partial<ClaimFields> = {}, error = '') => page(shop, `<h1>You have a gift card from ${esc(shop)}</h1>
<p>Card ending <b>${esc(last4)}</b>. Tell us where to send it and we will email it to you.</p>
<form method="post">${error ? `<div class="err">${esc(error)}</div>` : ''}
<label for="n">Your name</label><input id="n" name="name" autocomplete="name" maxlength="100" required value="${esc(v.name ?? '')}">
<label for="e">Your email</label><input id="e" name="email" type="email" autocomplete="email" inputmode="email" maxlength="254" required value="${esc(v.email ?? '')}">
<label for="m">Message (optional)</label><textarea id="m" name="message" rows="2" maxlength="200">${esc(v.message ?? '')}</textarea>
<button type="submit">Send me my gift card</button></form>`);
