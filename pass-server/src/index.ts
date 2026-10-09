// Apple Wallet gift-card pass server. *** UNTESTED *** – it needs YOUR Apple certs, so it could not be run where this was written.
// Gift-card passes (/pass, /v1/…, /webhook) are DISABLED unless the var GIFT_CARD_PASSES = "on". Cashier passes (POST /staff-pass) are always on.
// Endpoints: GET /pass?code=…  → .pkpass | PassKit web service (/v1/…) | POST /webhook (Shopify giftcards/update → APNs push).
// Secrets (wrangler secret put …): SHOPIFY_DOMAIN SHOPIFY_CLIENT_ID SHOPIFY_CLIENT_SECRET PASS_TYPE_ID TEAM_ID SIGNER_CERT_PEM SIGNER_KEY_PEM WWDR_PEM
//   APNS_KEY_P8 APNS_KEY_ID AUTH_SECRET POS_SECRET SHOPIFY_WEBHOOK_SECRET SHOP_NAME
// Security: /pass needs an HMAC-signed, 5-minute link (POS_SECRET, same value as in the app); rate-limited per IP; Shopify webhook HMAC verified;
//   use a SEPARATE read-only Shopify app (read_gift_cards) for SHOPIFY_CLIENT_ID/SECRET.
import { zipSync, strToU8 } from 'fflate';
import * as pkijs from 'pkijs';
import * as asn1js from 'asn1js';
import { authToken as mkAuth, safeEqual, validateStaffPass, verifyPassRequest, verifyShopifyWebhook, verifyStaffPassRequest, type StaffPassFields } from './verify';

interface Env { REGS: KVNamespace; [k: string]: any }
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const sha = async (algo: string, data: Uint8Array | string) => hex(await crypto.subtle.digest(algo, typeof data === 'string' ? enc.encode(data) : data));
const norm = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
const pemToDer = (pem: string) => Uint8Array.from(atob(pem.replace(/-----[A-Z ]+-----|\s/g, '')), c => c.charCodeAt(0));

async function shopifyToken(env: Env): Promise<string> {
  const cached = await env.REGS.get('shopify-token'); if (cached) return cached;
  const r = await fetch(`https://${env.SHOPIFY_DOMAIN}/admin/oauth/access_token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET }) });
  const j = (await r.json()) as any; if (!j.access_token) throw new Error('Shopify token request failed');
  await env.REGS.put('shopify-token', j.access_token, { expirationTtl: Math.max(60, (j.expires_in ?? 3600) - 300) });
  return j.access_token;
}
async function balanceFor(env: Env, code: string): Promise<{ balance: string; initial: string; enabled: boolean } | null> {
  const token = await shopifyToken(env); const c = norm(code);
  const r = await fetch(`https://${env.SHOPIFY_DOMAIN}/admin/api/2026-07/graphql.json`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-access-token': token },
    body: JSON.stringify({ query: `query($q:String){ giftCards(first:10, query:$q){ nodes { balance{amount} initialValue{amount} enabled note } } }`, variables: { q: `last_characters:${c.slice(-4).toLowerCase()}` } }) });
  const nodes = (((await r.json()) as any).data?.giftCards?.nodes ?? []) as any[]; const chk = (await sha('SHA-256', c)).slice(0, 10);
  const n = nodes.find(x => (x.note ?? '').includes(`chk:${chk}`)); return n ? { balance: n.balance.amount, initial: n.initialValue.amount, enabled: n.enabled } : null;
}
const authToken = (env: Env, serial: string) => mkAuth(env.AUTH_SECRET, serial);

function passJson(env: Env, code: string, balance: string, origin: string, auth: string) {
  return { formatVersion: 1, passTypeIdentifier: env.PASS_TYPE_ID, teamIdentifier: env.TEAM_ID, serialNumber: norm(code), organizationName: env.SHOP_NAME || 'Gift card', description: 'Gift card',
    webServiceURL: `${origin}/v1`, authenticationToken: auth, backgroundColor: 'rgb(17,17,17)', foregroundColor: 'rgb(255,255,255)', labelColor: 'rgb(200,200,200)',
    barcodes: [{ format: 'PKBarcodeFormatQR', message: norm(code), messageEncoding: 'iso-8859-1' }],
    storeCard: { primaryFields: [{ key: 'balance', label: 'BALANCE', value: Number(balance), currencyCode: 'AUD', changeMessage: 'Your balance is now %@' }], secondaryFields: [{ key: 'code', label: 'CODE', value: `••••${norm(code).slice(-4)}` }] } };
}
const ONE_PX_PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));


async function sign(env: Env, manifest: string): Promise<Uint8Array> {
  const cert = pkijs.Certificate.fromBER(pemToDer(env.SIGNER_CERT_PEM));
  const wwdr = pkijs.Certificate.fromBER(pemToDer(env.WWDR_PEM));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(env.SIGNER_KEY_PEM),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const manifestBytes = enc.encode(manifest);
  const digest = await crypto.subtle.digest('SHA-256', manifestBytes);

  const signerInfo = new pkijs.SignerInfo({
    version: 1,
    sid: new pkijs.IssuerAndSerialNumber({
      issuer: cert.issuer,
      serialNumber: cert.serialNumber,
    }),
  });

  signerInfo.signedAttrs = new pkijs.SignedAndUnsignedAttributes({
    type: 0,
    attributes: [
      new pkijs.Attribute({
        type: '1.2.840.113549.1.9.3', // contentType
        values: [
          new asn1js.ObjectIdentifier({
            value: '1.2.840.113549.1.7.1', // data
          }),
        ],
      }),
      new pkijs.Attribute({
        type: '1.2.840.113549.1.9.5', // signingTime
        values: [
          new asn1js.UTCTime({ valueDate: new Date() }),
        ],
      }),
      new pkijs.Attribute({
        type: '1.2.840.113549.1.9.4', // messageDigest
        values: [
          new asn1js.OctetString({ valueHex: digest }),
        ],
      }),
    ],
  });

  const signed = new pkijs.SignedData({
    version: 1,
    encapContentInfo: new pkijs.EncapsulatedContentInfo({
      eContentType: '1.2.840.113549.1.7.1',
    }),
    signerInfos: [signerInfo],
    certificates: [cert, wwdr],
  });

  await signed.sign(key, 0, 'SHA-256', manifestBytes.buffer as ArrayBuffer);

  const ci = new pkijs.ContentInfo({
    contentType: '1.2.840.113549.1.7.2',
    content: signed.toSchema(true),
  });

  return new Uint8Array(ci.toSchema().toBER(false));
}

async function buildPass(env: Env, code: string, origin: string) {
  const bal = await balanceFor(env, code); if (!bal) return null;
  const files: Record<string, Uint8Array> = { 'pass.json': strToU8(JSON.stringify(passJson(env, code, bal.balance, origin, await authToken(env, norm(code))))), 'icon.png': ONE_PX_PNG, 'icon@2x.png': ONE_PX_PNG };
  const manifest: Record<string, string> = {}; for (const [k, v] of Object.entries(files)) manifest[k] = await sha('SHA-1', v);
  const m = JSON.stringify(manifest); files['manifest.json'] = strToU8(m); files['signature'] = await sign(env, m);
  return zipSync(files);
}

/** Cashier pass: static generic pass with a Shopify-hosted brand icon. */
async function buildStaffPass(env: Env, f: StaffPassFields) {
  const serial = `staff-${(await sha('SHA-256', f.code)).slice(0, 20)}`;

  const pass = {
    formatVersion: 1,
    passTypeIdentifier: env.PASS_TYPE_ID,
    teamIdentifier: env.TEAM_ID,
    serialNumber: `staff-${(await sha('SHA-256', f.code)).slice(0, 20)}`,
    organizationName: f.shop || env.SHOP_NAME || 'Register',
    description: 'Cashier pass',
    logoText: "AIDEN’S 3D PRINTING",
    backgroundColor: "rgb(28,15,57)",
    foregroundColor: "rgb(238,216,200)",
    labelColor: "rgb(238,216,200)",
    barcodes: [
      {
        format: f.format === 'code128' ? 'PKBarcodeFormatCode128' : 'PKBarcodeFormatQR',
        message: f.code,
        messageEncoding: 'iso-8859-1',
      },
    ],
    generic: {
      primaryFields: [
        { key: 'name', label: "CASHIER", value: f.name },
      ],
      secondaryFields: [
        { key: 'role', label: "ROLE", value: f.role.charAt(0).toUpperCase() + f.role.slice(1) },
      ],
      auxiliaryFields: [
        { key: 'use', label: "USE", value: "Scan at the register to sign in" },
      ],
    },
  };

  // Fetch PNG icon variants from Shopify's CDN.
  const iconUrl =
    'https://www.aidens3dp.com/cdn/shop/files/Untitled_design_1.png?v=1745546152';

  async function fetchIcon(width: number): Promise<Uint8Array> {
    const url = new URL(iconUrl);
    url.searchParams.set('width', String(width));
    url.searchParams.set('format', 'png');

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(
        `Wallet icon download failed: HTTP ${response.status}`
      );
    }

    const contentType = response.headers.get('content-type') ?? '';

    if (!contentType.toLowerCase().includes('image/png')) {
      throw new Error(
        `Expected PNG icon, received ${contentType}`
      );
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  const files: Record<string, Uint8Array> = {
    'pass.json': strToU8(JSON.stringify(pass)),
    'icon.png': await fetchIcon(38),
    'icon@2x.png': await fetchIcon(76),
    'icon@3x.png': await fetchIcon(114),
  };

  // Hash every pass asset, then sign the exact manifest contents.
  const manifest: Record<string, string> = {};

  for (const [name, bytes] of Object.entries(files)) {
    manifest[name] = await sha('SHA-1', bytes);
  }

  const manifestJson = JSON.stringify(manifest);
  files['manifest.json'] = strToU8(manifestJson);
  files['signature'] = await sign(env, manifestJson);

  return zipSync(files);
}

async function apnsJwt(env: Env) {
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(env.APNS_KEY_P8), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const head = b64({ alg: 'ES256', kid: env.APNS_KEY_ID }); const body = b64({ iss: env.TEAM_ID, iat: Math.floor(Date.now() / 1000) });
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`)));
  return `${head}.${body}.${btoa(String.fromCharCode(...sig)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;
}
async function push(env: Env, serial: string) {
  const list = await env.REGS.list({ prefix: `reg:${serial}:` }); const jwt = await apnsJwt(env);
  for (const k of list.keys) { const token = await env.REGS.get(k.name); if (token) await fetch(`https://api.push.apple.com/3/device/${token}`, { method: 'POST', headers: { authorization: `bearer ${jwt}`, 'apns-topic': env.PASS_TYPE_ID, 'apns-push-type': 'background' }, body: '{}' }); }
}

/** Fixed-window per-IP limiter in KV (eventually consistent – a speed bump, not a wall). */
async function limited(env: Env, req: Request, bucket: string, max: number): Promise<boolean> {
  const ip = req.headers.get('cf-connecting-ip') ?? 'unknown'; const win = Math.floor(Date.now() / 60000); const key = `rl:${bucket}:${ip}:${win}`;
  const n = Number((await env.REGS.get(key)) ?? 0) + 1; await env.REGS.put(key, String(n), { expirationTtl: 120 }); return n > max;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const u = new URL(req.url); const origin = u.origin; const p = u.pathname;
    // Gift-card pass routes are switched off unless GIFT_CARD_PASSES = "on" (wrangler.toml [vars]). Cashier passes (/staff-pass) never depend on it.
    if (env.GIFT_CARD_PASSES !== 'on' && (p === '/pass' || p === '/webhook' || p.startsWith('/v1/'))) return new Response('Not found', { status: 404 });
    if (p === '/pass') {
      if (await limited(env, req, 'pass', 12)) return new Response('Too many requests', { status: 429 });
      const code = norm(u.searchParams.get('code') ?? '');
      if (!(await verifyPassRequest(env.POS_SECRET, code, u.searchParams.get('ts') ?? '', u.searchParams.get('sig') ?? ''))) return new Response('Link expired or invalid', { status: 401 });
      const z = await buildPass(env, code, origin);
      return z ? new Response(z, { headers: { 'content-type': 'application/vnd.apple.pkpass', 'content-disposition': 'attachment; filename=giftcard.pkpass' } }) : new Response('Gift card not found', { status: 404 }); }
    if (p === '/staff-pass' && req.method === 'POST') {
      if (await limited(env, req, 'staff', 20)) return new Response('Too many requests', { status: 429 });
      let b: any; try { b = await req.json(); } catch { return new Response('Bad request', { status: 400 }); }
      const f: StaffPassFields = { name: String(b?.name ?? '').trim(), role: String(b?.role ?? ''), code: String(b?.code ?? ''), format: String(b?.format ?? ''), shop: String(b?.shop ?? '').trim() };
      if (!(await verifyStaffPassRequest(env.POS_SECRET, f, String(b?.ts ?? ''), String(b?.sig ?? '')))) return new Response('Request expired or invalid', { status: 401 });
      const bad = validateStaffPass(f); if (bad) return new Response(bad, { status: 400 });
      return new Response(await buildStaffPass(env, f), { headers: { 'content-type': 'application/vnd.apple.pkpass', 'content-disposition': 'attachment; filename=cashier.pkpass' } }); }
    // PassKit web service
    const reg = p.match(/^\/v1\/devices\/([^/]+)\/registrations\/([^/]+)\/([^/]+)$/);
    if (reg) { const [, device, , serial] = reg; if (await limited(env, req, 'reg', 60)) return new Response('', { status: 429 }); if (!safeEqual(req.headers.get('authorization') ?? '', `ApplePass ${await authToken(env, serial)}`)) return new Response('', { status: 401 });
      if (req.method === 'POST') { const { pushToken } = (await req.json()) as any; await env.REGS.put(`reg:${serial}:${device}`, pushToken); return new Response('', { status: 201 }); }
      if (req.method === 'DELETE') { await env.REGS.delete(`reg:${serial}:${device}`); return new Response('', { status: 200 }); } }
    const upd = p.match(/^\/v1\/devices\/([^/]+)\/registrations\/([^/]+)$/);
    if (upd && req.method === 'GET') { if (await limited(env, req, 'upd', 60)) return new Response('', { status: 429 }); const list = await env.REGS.list({ prefix: 'reg:' }); const serials = [...new Set(list.keys.filter(k => k.name.endsWith(`:${upd[1]}`)).map(k => k.name.split(':')[1]))]; return serials.length ? Response.json({ serialNumbers: serials, lastUpdated: String(Date.now()) }) : new Response('', { status: 204 }); }
    const get = p.match(/^\/v1\/passes\/([^/]+)\/([^/]+)$/);
    if (get && req.method === 'GET') { if (await limited(env, req, 'get', 60)) return new Response('', { status: 429 }); if (!safeEqual((req.headers.get('authorization') ?? ''), `ApplePass ${await authToken(env, norm(get[2]))}`)) return new Response('', { status: 401 }); const z = await buildPass(env, get[2], origin); return z ? new Response(z, { headers: { 'content-type': 'application/vnd.apple.pkpass' } }) : new Response('', { status: 404 }); }
    if (p === '/v1/log') return new Response('', { status: 200 });
    // Shopify webhook giftcards/update → push (HMAC verified above)
    if (p === '/webhook' && req.method === 'POST') { const raw = new Uint8Array(await req.arrayBuffer()); if (!(await verifyShopifyWebhook(env.SHOPIFY_WEBHOOK_SECRET, raw, req.headers.get('x-shopify-hmac-sha256')))) return new Response('', { status: 401 }); const body: any = JSON.parse(new TextDecoder().decode(raw)); const last = String(body.last_characters ?? ''); const keys = await env.REGS.list({ prefix: 'reg:' }); const serials = [...new Set(keys.keys.map(k => k.name.split(':')[1]))].filter(s => s.endsWith(last.toUpperCase())); for (const s of serials) await push(env, s); return new Response('ok'); }
    return new Response('POS pass server', { status: 200 });
  },
};
void asn1js;
