// Location: src/lib/secretsShared.ts
// CloudKit sync, patch 6d (pure half): the shop's secrets as encrypted CloudKit records, and the rule for joining this register's copy with
// the shop's. One record per secret, named `secret-<name>`. The secret itself travels in ONE encrypted field, `secure_json`; the only plain
// labels are the name, the register that wrote it and when, so the shop can list records without reading them.
// Nothing is ever written plain, and in `omit` mode (the default, until the two-Apple-ID test T85 passes) nothing is written at all.
// What syncs: the Shopify login, the pass, claim and receipt secrets, the assistant key, and each cashier's pass code (badge).
// No React, no files, no native module: tested on its own (tests/secretsshared.test.ts). Decisions: dev_docs/CLOUDKIT_SYNC_DECISIONS.md N1.
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import type { CardMode } from './saleRecords';

type Fields = Record<string, string | number>;

/** The one encrypted field a secret record carries. The native module lists it as encrypted for the `Secret` type. */
export const SECRET_FIELD = 'secure_json';
/** The plain fields. Labels only. */
export const SECRET_PLAIN_KEYS = ['name', 'registerId', 'at'] as const;
/** A secret is far smaller than this. The cap only stops a bad value reaching CloudKit's 1 MB record limit. */
export const SECRET_MAX_BYTES = 20_000;

/** The fixed names, plus `badge.<staff id>` for each cashier's pass code. */
export const FIXED_SECRETS = ['shopify', 'pass', 'claim', 'receipt', 'assistant'] as const;
const NAME_RE = /^[A-Za-z0-9_.-]{1,80}$/;
export const isSecretName = (x: unknown): x is string => typeof x === 'string' && NAME_RE.test(x);
export const badgeSecretName = (staffId: string): string => `badge.${staffId.replace(/[^a-zA-Z0-9._-]/g, '')}`;

export const secretRecordName = (name: string): string => { if (!isSecretName(name)) throw new Error('Bad secret name.'); return `secret-${name}`; };
export const secretNameFromRecord = (record: string): string | null => { const n = record.startsWith('secret-') ? record.slice(7) : ''; return isSecretName(n) ? n : null; };

/** How a secret is compared and remembered. A short hash, so the remembered copy never holds the secret itself. */
export const fingerprint = (value: string): string => bytesToHex(sha256(utf8ToBytes(`secret:${value}`))).slice(0, 24);

const bytes = (s: string): number => utf8ToBytes(s).length;

export type SecretParts = { handle: string; plain: Fields; encrypted: Fields };
/** The record for one secret, or null when it must not be sent: `omit` mode, a bad name, an empty value or one that is too large. */
export function secretToParts(name: string, value: string, registerId: string, now: number, mode: CardMode): SecretParts | null {
  if (mode !== 'encrypted' || !isSecretName(name) || !value) return null;
  const json = JSON.stringify({ v: 1, value });
  if (bytes(json) > SECRET_MAX_BYTES) return null;
  return { handle: name, plain: { name, registerId: String(registerId ?? ''), at: now }, encrypted: { [SECRET_FIELD]: json } };
}

/** A secret read back from a record, or null when the record is not one this device can read (no encrypted content, wrong shape). */
export function secretFromParts(record: string, encrypted: unknown): { name: string; value: string } | null {
  const name = secretNameFromRecord(record); if (!name || !encrypted || typeof encrypted !== 'object') return null;
  const raw = (encrypted as Record<string, unknown>)[SECRET_FIELD]; if (typeof raw !== 'string' || bytes(raw) > SECRET_MAX_BYTES + 100) return null;
  try { const j = JSON.parse(raw); return j && j.v === 1 && typeof j.value === 'string' && j.value ? { name, value: j.value } : null; } catch { return null; }
}

// ---------- the Shopify login travels as one secret ----------
export type ShopifyLogin = { domain: string; clientId: string; clientSecret: string };
export const packShopify = (c: ShopifyLogin): string => JSON.stringify({ domain: c.domain, clientId: c.clientId, clientSecret: c.clientSecret });
/** The login, or null unless all three parts are there. */
export function unpackShopify(s: string): ShopifyLogin | null {
  try { const j = JSON.parse(s); return j && [j.domain, j.clientId, j.clientSecret].every(x => typeof x === 'string' && x) ? { domain: j.domain, clientId: j.clientId, clientSecret: j.clientSecret } : null; } catch { return null; }
}

// ---------- joining this register's copy with the shop's ----------
/** What to do about one secret. `conflict` is true when both sides changed (or never agreed) and the shop's copy was taken. */
export type SecretAction = { kind: 'none' | 'send' | 'take'; conflict?: boolean; /** The fingerprint to remember as "agreed" afterwards (null: none). */ base: string | null };

/**
 * `local` and `cloud` are the values (null when absent), `base` is the fingerprint this register last agreed with the shop (null: never).
 * - Same on both sides: nothing to do, and that value is the new base.
 * - Only one side has it: send or take it. One exception: this register removed it (it had agreed a value, the shop's copy is still that
 *   value, and the local one is gone), so the removal stands. A removal is never sent, so signing out of Shopify on one till cannot sign
 *   out every till.
 * - Both have it and differ: the side that did not change follows the one that did. If both changed, or they never agreed, the shop's
 *   copy wins and `conflict` says so.
 */
export function mergeSecret(local: string | null, cloud: string | null, base: string | null): SecretAction {
  const L = local ? fingerprint(local) : null; const C = cloud ? fingerprint(cloud) : null;
  if (L === C) return { kind: 'none', base: L };
  if (!C) return { kind: 'send', base: L };
  if (!L) return base !== null && base === C ? { kind: 'none', base } : { kind: 'take', base: C };
  if (base === L) return { kind: 'take', base: C };
  if (base === C) return { kind: 'send', base: L };
  return { kind: 'take', conflict: true, base: C };
}
