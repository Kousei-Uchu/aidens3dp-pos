// Location: gift-claim-server/src/index.ts
// Gift card "claim" page. The POS shows a QR for  https://<worker>/c/<CODE>.<SIG>  when a gift card is sold without a recipient email.
// The buyer (or whoever they hand it to) scans it, enters a name + email, and Shopify emails the card. One claim per card.
//   GET  /c/<token>   form (or "already claimed" / "not found")
//   POST /c/<token>   sets the card's recipient and sends the notification
// Uses its OWN Shopify app (scopes: read_gift_cards, write_gift_cards, read_customers, write_customers), not the POS app's login.
import { codeChecksum, formPage, messagePage, validateClaim, verifyClaimToken } from './claim';

export interface Env { CLAIMS: KVNamespace; CLAIM_SECRET: string; SHOPIFY_DOMAIN: string; SHOPIFY_CLIENT_ID: string; SHOPIFY_CLIENT_SECRET: string; SHOP_NAME: string }
const API = '2026-07';
const html = (body: string, status = 200) => new Response(body, { status, headers: {
  'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" } });

async function shopifyToken(env: Env): Promise<string> {
  const cached = await env.CLAIMS.get('shopify-token'); if (cached) return cached;
  const r = await fetch(`https://${env.SHOPIFY_DOMAIN}/admin/oauth/access_token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET }) });
  const j = (await r.json()) as any; if (!j.access_token) throw new Error('Shopify token request failed');
  await env.CLAIMS.put('shopify-token', j.access_token, { expirationTtl: Math.max(60, (j.expires_in ?? 3600) - 300) });
  return j.access_token;
}
async function gql(env: Env, query: string, variables: Record<string, unknown>) {
  const token = await shopifyToken(env);
  const r = await fetch(`https://${env.SHOPIFY_DOMAIN}/admin/api/${API}/graphql.json`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-access-token': token }, body: JSON.stringify({ query, variables }) });
  const j = (await r.json()) as any; if (j.errors?.length) throw new Error(j.errors.map((e: any) => e.message).join('; '));
  return j.data;
}

type Card = { id: string; last4: string; enabled: boolean; hasRecipient: boolean };
/** Finds the card for a code. Shopify only searches by last characters, so the POS note checksum picks the right one. */
async function findCard(env: Env, code: string): Promise<Card | null> {
  const d = await gql(env, `query($q:String){ giftCards(first: 10, query: $q) { nodes { id lastCharacters enabled note recipientAttributes { recipient { id } } } } }`, { q: `last_characters:${code.slice(-4).toLowerCase()}` });
  const chk = await codeChecksum(code);
  const n = (d.giftCards.nodes as any[]).find(x => (x.note ?? '').includes(`chk:${chk}`));
  return n ? { id: n.id, last4: n.lastCharacters, enabled: !!n.enabled, hasRecipient: !!n.recipientAttributes?.recipient?.id } : null;
}
async function customerId(env: Env, email: string, name: string): Promise<string> {
  const d = await gql(env, `query($q:String){ customers(first: 5, query: $q) { nodes { id email } } }`, { q: `email:${email}` });
  const hit = (d.customers.nodes as any[]).find(c => c.email?.toLowerCase() === email); if (hit) return hit.id;
  const [firstName, ...rest] = name.split(' ');
  const c = await gql(env, `mutation($i:CustomerInput!){ customerCreate(input:$i){ customer { id } userErrors { message } } }`, { i: { email, firstName, lastName: rest.join(' ') || undefined } });
  const id = c.customerCreate.customer?.id; if (!id) throw new Error(c.customerCreate.userErrors?.[0]?.message ?? 'Could not save the email address');
  return id;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url); const shop = env.SHOP_NAME || 'our shop';
    const m = url.pathname.match(/^\/c\/([^/]+)$/);
    if (url.pathname === '/') return html(messagePage(shop, 'Gift cards', 'Scan the QR code on your gift card to claim it.'));
    if (!m) return html(messagePage(shop, 'Not found', ''), 404);
    const code = await verifyClaimToken(env.CLAIM_SECRET, m[1]);
    if (!code) return html(messagePage(shop, 'This link is not valid', 'Please check the QR code, or ask the shop.'), 404);

    // light per-IP rate limit (KV, approximate): 20 requests per 10 minutes
    const ip = req.headers.get('cf-connecting-ip') ?? 'x'; const rk = `rl:${ip}:${Math.floor(Date.now() / 600_000)}`;
    const used = Number((await env.CLAIMS.get(rk)) ?? 0); if (used >= 20) return html(messagePage(shop, 'Too many tries', 'Please wait a few minutes and try again.'), 429);
    await env.CLAIMS.put(rk, String(used + 1), { expirationTtl: 700 });

    let lock = '';
    try {
      const card = await findCard(env, code);
      if (!card || !card.enabled) return html(messagePage(shop, 'Gift card not found', 'Please ask the shop for help.'), 404);
      if (card.hasRecipient || (await env.CLAIMS.get(`claimed:${card.id}`))) return html(messagePage(shop, 'Already claimed', 'This gift card has already been sent to someone. If that was not you, please contact the shop.'));
      if (req.method === 'GET') return html(formPage(shop, card.last4));
      if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
      const text = await req.text(); if (text.length > 4000) return new Response('too large', { status: 413 });
      const form = new URLSearchParams(text); const v = validateClaim({ name: form.get('name'), email: form.get('email'), message: form.get('message') });
      if (!v.ok) return html(formPage(shop, card.last4, { name: form.get('name') ?? '', email: form.get('email') ?? '', message: form.get('message') ?? '' }, v.error), 422);
      lock = `claimed:${card.id}`; await env.CLAIMS.put(lock, new Date().toISOString()); // set first, so a double tap cannot send two
      const cid = await customerId(env, v.value.email, v.value.name);
      const u = await gql(env, `mutation($id:ID!,$i:GiftCardUpdateInput!){ giftCardUpdate(id:$id, input:$i){ giftCard { id } userErrors { message } } }`,
        { id: card.id, i: { recipientAttributes: { id: cid, preferredName: v.value.name.slice(0, 100), ...(v.value.message ? { message: v.value.message } : {}) } } });
      if (u.giftCardUpdate.userErrors?.length) throw new Error(u.giftCardUpdate.userErrors[0].message);
      const s = await gql(env, `mutation($id:ID!){ giftCardSendNotificationToRecipient(id:$id){ userErrors { message } } }`, { id: card.id });
      if (s.giftCardSendNotificationToRecipient.userErrors?.length) throw new Error(s.giftCardSendNotificationToRecipient.userErrors[0].message);
      return html(messagePage(shop, 'On its way', `We have emailed your gift card to ${v.value.email}. It can take a minute to arrive.`));
    } catch (e) {
      if (lock) await env.CLAIMS.delete(lock).catch(() => {}); // the claim did not complete, so let them try again
      return html(messagePage(shop, 'Something went wrong', 'Please try again in a minute, or ask the shop for help.'), 500);
    }
  },
};
