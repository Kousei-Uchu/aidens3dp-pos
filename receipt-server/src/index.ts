// Location: receipt-server/src/index.ts
// POS receipt server: the POS PUTs a receipt snapshot (Shopify order lines + Zeller card details) and customers open /r/<id>.
// GET  /r/<id>        → printable receipt page (PDF / image download built in)
// PUT  /api/r/<id>    → store/overwrite a snapshot (Authorization: Bearer RECEIPT_SECRET)
import { ID_RE, parseReceipt } from './validate';
import { messagePage, renderReceipt } from './render';

export interface Env { RECEIPTS: KVNamespace; RECEIPT_SECRET: string }

const enc = new TextEncoder();
async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const u = new Uint8Array(x), v = new Uint8Array(y); let r = 0; for (let i = 0; i < u.length; i++) r |= u[i] ^ v[i]; return r === 0;
}
const html = (body: string, status = 200, nonce?: string) => new Response(body, { status, headers: {
  'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'private, max-age=60', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff',
  'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; script-src ${nonce ? `'nonce-${nonce}'` : "'none'"}; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url); const p = url.pathname;
    if (req.method === 'GET' && p === '/') return html(messagePage('Receipts', 'Open the link from your receipt QR code or message.'));
    const g = p.match(/^\/r\/([a-f0-9]{20})$/);
    if (req.method === 'GET' && g) {
      const raw = await env.RECEIPTS.get(`r:${g[1]}`);
      if (!raw) return html(messagePage('Receipt not found', 'If you just paid, it can take a minute to appear. Refresh in a moment.'), 404);
      const doc = parseReceipt(JSON.parse(raw), g[1]);
      if (!doc) return html(messagePage('Receipt unavailable', 'This receipt could not be displayed.'), 500);
      const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12))));
      return html(renderReceipt(doc, nonce), 200, nonce);
    }
    const w = p.match(/^\/api\/r\/([^/]+)$/);
    if (req.method === 'PUT' && w) {
      const auth = req.headers.get('authorization') ?? '';
      if (!env.RECEIPT_SECRET || !(await safeEqual(auth, `Bearer ${env.RECEIPT_SECRET}`))) return new Response('unauthorized', { status: 401 });
      if (!ID_RE.test(w[1])) return new Response('bad id', { status: 400 });
      const text = await req.text(); if (text.length > 64_000) return new Response('too large', { status: 413 });
      let body: unknown; try { body = JSON.parse(text); } catch { return new Response('bad json', { status: 400 }); }
      const doc = parseReceipt(body, w[1]); if (!doc) return new Response('invalid receipt', { status: 422 });
      await env.RECEIPTS.put(`r:${doc.id}`, JSON.stringify(doc)); // no expiry: these are tax records
      return new Response('ok');
    }
    return html(messagePage('Not found', ''), 404);
  },
};
