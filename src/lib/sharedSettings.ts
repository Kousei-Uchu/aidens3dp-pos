// Location: src/lib/sharedSettings.ts
// CloudKit patch 6a (0205): which settings are shared between registers, how a shared settings record is read safely,
// and how two registers' edits are merged. Pure code, no store and no network, so the node tests pin every rule.
//
// Two key sets exist because the shop is moving from Shopify to CloudKit (decisions items 1 to 3, 5, 19 to 21, 23 and O2):
//   - `metaobject` is the original seven keys and nothing else. The Shopify path behaves exactly as it did before.
//   - `cloudkit` is those seven plus the shop name, the receipt details, the two server addresses, auto-receipt, smart change,
//     consolidate and the assistant's connection settings.
// Not in either set, on purpose: secrets and cashier pass codes (patch 6d, after the encryption test), the logo (its own patch),
// notices, and everything per device (decisions items 4, 16, 22, 24 to 26).
import { normaliseAssistant, type AssistantSettings } from './assistantConfig';
import { defaultReceiptProfile, type ReceiptProfile } from './receiptDoc';
import { DEFAULT_FEES } from './fees';
import type { StaffMember } from './types';
import type { Settings } from '../state/store';

export type SharedKind = 'metaobject' | 'cloudkit';
export type SharedPayload = Record<string, unknown>;

export const SHOPIFY_KEYS = ['staff', 'bundlesJson', 'fees', 'cashRounding', 'requirePin', 'adjustPerms', 'cartWarnings'] as const;
export const CLOUD_EXTRA_KEYS = ['shopName', 'receipt', 'passServerUrl', 'giftClaimUrl', 'autoReceipt', 'smartChange', 'consolidate', 'assistant'] as const;
export const CLOUD_KEYS = [...SHOPIFY_KEYS, ...CLOUD_EXTRA_KEYS] as const;
export const sharedKeys = (kind: SharedKind): readonly string[] => (kind === 'cloudkit' ? CLOUD_KEYS : SHOPIFY_KEYS);

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const ROLES = ['cashier', 'manager', 'owner'];

/** Stable text for a value: object keys sorted, so two equal settings always compare equal whatever order they were built in. */
export function canon(x: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (isObj(v)) { const o: Record<string, unknown> = {}; for (const k of Object.keys(v).sort()) if (v[k] !== undefined) o[k] = walk(v[k]); return o; }
    return v;
  };
  return JSON.stringify(walk(x));
}
export const samePayload = (a: SharedPayload, b: SharedPayload): boolean => canon(a) === canon(b);

/** The assistant's connection settings as shared. The audit log cap is this iPad's disk, and the data gate stays local (see GUESSES, 0205). */
function assistantShared(a: AssistantSettings): Omit<AssistantSettings, 'logCapMB' | 'gate'> {
  const { logCapMB: _cap, gate: _gate, ...rest } = a; return rest;
}

/** What this register would send, for the key set of the active backend. */
export function pickShared(s: Settings, kind: SharedKind): SharedPayload {
  const out: SharedPayload = {};
  for (const k of sharedKeys(kind)) {
    const v = (s as Record<string, unknown>)[k];
    if (k === 'cartWarnings') out[k] = v ?? [];
    else if (k === 'assistant') out[k] = assistantShared(normaliseAssistant(v));
    else if (v !== undefined) out[k] = v;
  }
  return out;
}

const str = (x: unknown): x is string => typeof x === 'string';
const bool = (x: unknown): x is boolean => typeof x === 'boolean';
const validStaff = (m: unknown): m is StaffMember => isObj(m) && str(m.id) && m.id !== '' && str(m.name) && str(m.role) && ROLES.includes(m.role) && str(m.salt) && str(m.pinHash);

function readReceipt(x: unknown): ReceiptProfile | undefined {
  if (!isObj(x)) return undefined;
  const d = defaultReceiptProfile(); const out: Record<string, unknown> = { ...d };
  for (const k of Object.keys(d) as (keyof ReceiptProfile)[]) { const v = x[k]; if (typeof v === typeof d[k]) out[k] = v; }
  return out as ReceiptProfile;
}
function readFees(x: unknown) {
  if (!isObj(x)) return undefined;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1 ? v : d);
  return { ...DEFAULT_FEES, ...x, cardPresentRate: num(x.cardPresentRate, DEFAULT_FEES.cardPresentRate), keyedRate: num(x.keyedRate, DEFAULT_FEES.keyedRate), refundReturnsFee: bool(x.refundReturnsFee) ? x.refundReturnsFee : DEFAULT_FEES.refundReturnsFee };
}

/**
 * Reads a shared settings record's JSON. Only keys of this backend's set are taken, and each is type checked, so a bad or hostile
 * record can neither add a key nor put the wrong kind of value in one. A key that is missing or invalid is left out, never
 * defaulted, so a register on an older build (which never wrote the newer keys) does not reset them. Null when it is not an object.
 */
export function parseShared(json: string | undefined | null, kind: SharedKind): SharedPayload | null {
  let raw: unknown; try { raw = JSON.parse(json ?? ''); } catch { return null; }
  if (!isObj(raw)) return null;
  const out: SharedPayload = {}; const allowed = sharedKeys(kind);
  for (const k of allowed) {
    if (!(k in raw)) continue; const v = raw[k];
    switch (k) {
      case 'staff': if (Array.isArray(v)) out[k] = v.filter(validStaff); break;
      case 'bundlesJson': case 'shopName': case 'passServerUrl': case 'giftClaimUrl': if (str(v)) out[k] = v; break;
      case 'cashRounding': case 'requirePin': case 'smartChange': case 'consolidate': if (bool(v)) out[k] = v; break;
      case 'autoReceipt': if (v === 'ask' || v === 'none') out[k] = v; break;
      case 'fees': { const f = readFees(v); if (f) out[k] = f; break; }
      case 'adjustPerms': if (isObj(v)) out[k] = v; break;
      case 'cartWarnings': if (Array.isArray(v)) out[k] = v; break;
      case 'receipt': { const r = readReceipt(v); if (r) out[k] = r; break; }
      case 'assistant': if (isObj(v)) out[k] = assistantShared(normaliseAssistant(v)); break;
    }
  }
  return out;
}

/** The settings patch for a payload read from the shop. The assistant keeps this iPad's own log cap and data gate. */
export function applyShared(p: SharedPayload, current: Settings): Partial<Settings> {
  const out: Record<string, unknown> = { ...p };
  if (isObj(p.assistant)) out.assistant = { ...normaliseAssistant(p.assistant), logCapMB: current.assistant.logCapMB, gate: current.assistant.gate };
  return out as Partial<Settings>;
}

/** The base kept from the last time this register and the shop agreed, as saved text. Null when there is none or it cannot be read. */
export function readBase(text: string | undefined | null): SharedPayload | null {
  if (!text) return null; try { const x = JSON.parse(text); return isObj(x) ? x : null; } catch { return null; }
}

/**
 * Whether a shared setting was edited here since this register last agreed with the shop. Only CloudKit asks: its extra keys have
 * many edit points (a field per keystroke), so a watcher sends them instead of every screen remembering to. After a push or a pull
 * the base is exactly what this register holds, so the answer is false and two registers can never send each other's changes back.
 */
export const needsSending = (s: Settings, kind: SharedKind): boolean => kind === 'cloudkit' && canon(pickShared(s, kind)) !== canon(readBase(s.sharedBase) ?? {});

/**
 * Staff, merged person by person (by id) against `base`, the list both sides last agreed on.
 *  - A person only one side changed takes that side's version; changed on both, this register's (the one sending) wins.
 *  - A person removed on either side stays removed: removing someone is a safety act (it ends their PIN), so a late edit never brings them back.
 *  - A person added on either side is kept.
 *  - With no base, nothing can be told to be a removal, so the two lists are joined and the shop's version of a person wins.
 */
export function mergeStaff(base: StaffMember[] | null, local: StaffMember[], remote: StaffMember[]): StaffMember[] {
  const byId = (a: StaffMember[]) => new Map(a.map(m => [m.id, m]));
  const b = base ? byId(base) : null; const l = byId(local); const r = byId(remote);
  const out: StaffMember[] = []; const seen = new Set<string>();
  const take = (id: string) => {
    if (seen.has(id)) return; seen.add(id);
    const lm = l.get(id); const rm = r.get(id); const bm = b?.get(id);
    if (lm && rm) { out.push(bm && canon(lm) !== canon(bm) ? lm : bm && canon(rm) !== canon(bm) ? rm : (b ? lm : rm)); return; }
    if (b && bm) return; // one side removed a person both once had: stays removed
    out.push((lm ?? rm)!);
  };
  for (const m of remote) take(m.id); for (const m of local) take(m.id);
  return out;
}

/**
 * Merges this register's settings with the shop's, key by key, against `base` (what both last agreed on).
 *  - A key only the shop changed takes the shop's value; a key this register changed keeps this register's (also when both changed).
 *  - A key only one side has is kept.
 *  - Staff is merged person by person (mergeStaff). Everything else is one value, so the later writer wins the whole key.
 *  - With no base nothing can be told apart, so the shop's value wins (the first push after a register joins must not undo what others set).
 */
export function mergeShared(base: SharedPayload | null, local: SharedPayload, remote: SharedPayload): SharedPayload {
  const out: SharedPayload = {};
  for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const inL = k in local; const inR = k in remote;
    if (!inR) { out[k] = local[k]; continue; }
    if (!inL) { out[k] = remote[k]; continue; }
    if (k === 'staff') { out[k] = mergeStaff(Array.isArray(base?.staff) ? (base!.staff as StaffMember[]) : null, local[k] as StaffMember[], remote[k] as StaffMember[]); continue; }
    out[k] = base && k in base && canon(local[k]) !== canon(base[k]) ? local[k] : remote[k];
  }
  return out;
}
