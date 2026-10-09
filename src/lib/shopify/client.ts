// Location: src/lib/shopify/client.ts
// Direct Shopify Admin GraphQL client (no backend).
// Auth: Dev Dashboard app → client-credentials grant, token valid 24 h, refreshed automatically.
// Client secret + token live in the iOS Keychain (expo-secure-store).
import * as SecureStore from 'expo-secure-store';
import { sleep } from '../ids';

export const API_VERSION = '2026-07'; // pin one version, bump quarterly (research doc §4.2)

export type ShopifyCreds = { domain: string; clientId: string; clientSecret: string };
export class ShopifyNetworkError extends Error { constructor(m: string) { super(m); this.name = 'ShopifyNetworkError'; } }
export class ShopifyUserError extends Error {
  details?: any;
  constructor(m: string, details?: any) { super(m); this.name = 'ShopifyUserError'; this.details = details; }
}
export type UserError = { field?: string[] | null; message: string; code?: string };

const K = { domain: 'shopify.domain', id: 'shopify.clientId', secret: 'shopify.clientSecret', token: 'shopify.token', exp: 'shopify.tokenExp', scope: 'shopify.scope' };
let creds: ShopifyCreds | null = null;
let token: { value: string; exp: number; scope: string } | null = null;
let inflight: Promise<string> | null = null;

export function normaliseDomain(s: string): string {
  let d = s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!d) return '';
  if (!d.includes('.')) d += '.myshopify.com';
  return d;
}

export async function loadCreds(): Promise<ShopifyCreds | null> {
  try {
    const [domain, clientId, clientSecret] = await Promise.all([K.domain, K.id, K.secret].map(k => SecureStore.getItemAsync(k)));
    if (domain && clientId && clientSecret) creds = { domain, clientId, clientSecret };
    const [tv, te, ts] = await Promise.all([K.token, K.exp, K.scope].map(k => SecureStore.getItemAsync(k)));
    if (tv && te) token = { value: tv, exp: Number(te), scope: ts ?? '' };
  } catch { /* keychain unavailable */ }
  return creds;
}
export async function saveCreds(c: ShopifyCreds) {
  creds = { domain: normaliseDomain(c.domain), clientId: c.clientId.trim(), clientSecret: c.clientSecret.trim() };
  token = null;
  await Promise.all([
    SecureStore.setItemAsync(K.domain, creds.domain), SecureStore.setItemAsync(K.id, creds.clientId), SecureStore.setItemAsync(K.secret, creds.clientSecret),
    SecureStore.deleteItemAsync(K.token), SecureStore.deleteItemAsync(K.exp),
  ]);
}
export async function clearCreds() {
  creds = null; token = null;
  await Promise.all(Object.values(K).map(k => SecureStore.deleteItemAsync(k)));
}
export const hasCreds = () => !!creds;
export const shopDomain = () => creds?.domain ?? '';
export const tokenScopes = () => (token?.scope ? token.scope.split(',') : []);

export async function getToken(force = false): Promise<string> {
  if (!creds) throw new ShopifyUserError('Shopify is not set up — open More ▸ Settings ▸ Shopify.');
  if (!force && token && token.exp - Date.now() > 5 * 60_000) return token.value;
  if (inflight) return inflight;
  const c = creds;
  inflight = (async () => {
    let res: Response;
    try {
      res = await fetch(`https://${c.domain}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: `grant_type=client_credentials&client_id=${encodeURIComponent(c.clientId)}&client_secret=${encodeURIComponent(c.clientSecret)}`,
      });
    } catch (e: any) { throw new ShopifyNetworkError(`Can't reach Shopify: ${e?.message ?? e}`); }
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      if (res.status >= 500) throw new ShopifyNetworkError(`Shopify auth ${res.status}`);
      throw new ShopifyUserError(`Shopify rejected the client ID/secret (${res.status}). ${t.slice(0, 160)}`);
    }
    const j = await res.json();
    token = { value: j.access_token, exp: Date.now() + (j.expires_in ?? 86399) * 1000, scope: j.scope ?? '' };
    await Promise.all([
      SecureStore.setItemAsync(K.token, token.value), SecureStore.setItemAsync(K.exp, String(token.exp)), SecureStore.setItemAsync(K.scope, token.scope),
    ]).catch(() => {});
    return token.value;
  })().finally(() => { inflight = null; });
  return inflight;
}

// cost-aware throttle: obey extensions.cost.throttleStatus (research doc §4.10)
let notBefore = 0;

export async function gql<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
  if (!creds) throw new ShopifyUserError('Shopify is not set up — open More ▸ Settings ▸ Shopify.');
  let authRetried = false;
  for (let attempt = 0; ; attempt++) {
    const wait = notBefore - Date.now();
    if (wait > 0) await sleep(Math.min(wait, 20_000));
    const tok = await getToken();
    let res: Response;
    try {
      res = await fetch(`https://${creds.domain}/admin/api/${API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': tok },
        body: JSON.stringify({ query, variables }),
      });
    } catch (e: any) {
      if (attempt < 2) { await sleep(800 * (attempt + 1)); continue; }
      throw new ShopifyNetworkError(`Can't reach Shopify: ${e?.message ?? e}`);
    }
    if (res.status === 401 && !authRetried) { authRetried = true; await getToken(true); continue; }
    if (res.status === 429 || res.status >= 500) {
      if (attempt < 3) { await sleep(1000 * 2 ** attempt); continue; }
      throw new ShopifyNetworkError(`Shopify ${res.status}`);
    }
    let json: any;
    try { json = await res.json(); } catch { throw new ShopifyNetworkError(`Shopify returned a non-JSON reply (${res.status})`); }
    const ts = json?.extensions?.cost?.throttleStatus;
    if (ts && ts.currentlyAvailable < 300) notBefore = Date.now() + ((300 - ts.currentlyAvailable) / (ts.restoreRate || 100)) * 1000;
    if (json.errors?.length) {
      const throttled = json.errors.some((e: any) => e.extensions?.code === 'THROTTLED');
      if (throttled && attempt < 5) { notBefore = Date.now() + 1500 * (attempt + 1); continue; }
      throw new ShopifyUserError(json.errors.map((e: any) => e.message).join('; '), json.errors);
    }
    return json.data as T;
  }
}

export function throwUserErrors(errs: UserError[] | undefined | null, what: string) {
  if (errs && errs.length) throw new ShopifyUserError(`${what}: ${errs.map(e => e.message).join('; ')}`, errs);
}
export const isNetworkError = (e: unknown) => e instanceof ShopifyNetworkError;

// Wallet pass server shared secret (signs pass links). Keychain only.
export const getPassSecret = async () => { try { return (await SecureStore.getItemAsync('pos.passSecret')) ?? ''; } catch { return ''; } };
export const setPassSecret = async (v: string) => { try { if (v) await SecureStore.setItemAsync('pos.passSecret', v.trim()); else await SecureStore.deleteItemAsync('pos.passSecret'); } catch {} };

// Receipt server shared secret (authorises receipt uploads). Keychain only.
export const getReceiptSecret = async () => { try { return (await SecureStore.getItemAsync('pos.receiptSecret')) ?? ''; } catch { return ''; } };
export const setReceiptSecret = async (v: string) => { try { if (v) await SecureStore.setItemAsync('pos.receiptSecret', v.trim()); else await SecureStore.deleteItemAsync('pos.receiptSecret'); } catch {} };
