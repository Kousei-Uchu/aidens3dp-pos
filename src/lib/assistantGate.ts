// Location: src/lib/assistantGate.ts
// The data gate (patch 0161, plan 3.1). Every tool result passes through here before it goes into a request to the model.
// It sorts each field into a category, decides from the endpoint (local or remote) and the Settings toggles whether that
// category may be sent, and removes or masks what may not. This is enforced in code, never in the prompt.
//
// How a tool takes part: it declares a field map (`gate` on the tool) that names every field it can return and says which
// category the field belongs to. A field the map does not name is dropped and counted as unknown, so a tool cannot leak a
// field nobody has sorted. The tests fail when a tool returns one. Tools that return only help text declare 'content', which
// still has keys, card numbers and anything key shaped masked.
//
// Pure logic, no React Native imports, so it runs in the node tests.
import { GATE_TOGGLE_CATEGORIES, type EndpointClass, type GateToggleCategory, type GateToggles } from './assistantConfig';
import { scrubText, type ScrubKeep } from './assistantScrub';

// ---------- categories and the rules table ----------
export type Category = GateToggleCategory | 'payment' | 'secret';
export const CATEGORIES: readonly Category[] = [...GATE_TOGGLE_CATEGORIES, 'payment', 'secret'];
/** Never sent to any endpoint, and with no toggle. */
export const FIXED_NEVER: readonly Category[] = ['payment', 'secret'];
/** What the gate does with a category. `last4` is for gift card codes: only the last four characters. */
export type Decision = 'allow' | 'last4' | 'deny';
export type GatePolicy = Record<Category, Decision>;

export const CATEGORY_INFO: Record<Category, { label: string; help: string; /** Used in "Hidden by the shop's privacy rules: ...". */ phrase: string }> = {
  personal: { label: 'Customer details', help: 'Customer names, phone numbers, addresses and any other personal details.', phrase: 'customer details' },
  email: { label: 'Email addresses', help: 'Email addresses of customers and staff.', phrase: 'email addresses' },
  gift_balance: { label: 'Gift card balances', help: 'What is left on a gift card.', phrase: 'gift card balances' },
  gift_code: { label: 'Gift card codes', help: 'Only the last four characters are ever sent, even when allowed.', phrase: 'gift card codes' },
  order: { label: 'Order totals and items', help: 'What was sold and for how much. Customer details on an order follow the customer rule above.', phrase: 'order details' },
  cost: { label: 'Cost prices and profit', help: 'What products cost the shop and what it made on them.', phrase: 'costs and profit' },
  shop: { label: 'Stock, sales, products and deals', help: 'Stock levels, sales history, product and variant data, deals, cash drawer status, date and time.', phrase: 'shop data' },
  payment: { label: 'Payment details', help: 'Card details, tender and terminal details.', phrase: 'payment details' },
  secret: { label: 'Keys and passwords', help: 'Anything that looks like a secret key, token or password.', phrase: 'keys and passwords' },
};

/** The table in the plan (3.1), as Auto means it. */
const AUTO: Record<EndpointClass, GatePolicy> = {
  local: { personal: 'allow', email: 'allow', gift_balance: 'allow', gift_code: 'last4', order: 'allow', cost: 'allow', shop: 'allow', payment: 'deny', secret: 'deny' },
  remote: { personal: 'deny', email: 'deny', gift_balance: 'deny', gift_code: 'deny', order: 'allow', cost: 'allow', shop: 'allow', payment: 'deny', secret: 'deny' },
};

/**
 * What may be sent for this endpoint, with the toggles applied. Payment and secrets are never sent, whatever the toggles say.
 * Allow means the most the category can ever be: for gift card codes that is the last four characters, not the whole code.
 */
export function resolvePolicy(scope: EndpointClass, toggles?: Partial<GateToggles>): GatePolicy {
  const out = { ...AUTO[scope === 'local' ? 'local' : 'remote'] };
  for (const c of GATE_TOGGLE_CATEGORIES) {
    const t = toggles?.[c];
    if (t === 'never') out[c] = 'deny';
    else if (t === 'allow') out[c] = c === 'gift_code' ? 'last4' : 'allow';
  }
  for (const c of FIXED_NEVER) out[c] = 'deny';
  return out;
}
/** Used when a tool is run with no policy given: the remote rules, which are the strictest. */
export const FAIL_CLOSED_POLICY: GatePolicy = resolvePolicy('remote');

// ---------- field maps ----------
/** A field is a category, or a map of the fields inside it (for an object, or for each object in a list). */
export type FieldRule = Category | FieldMap;
export interface FieldMap { [field: string]: FieldRule }
/** 'content' is for tools that return help text and screen names and no shop data. */
export type GateSpec = FieldMap | 'content';
/** Fields every result may carry, because the app's own code writes them. They are still scrubbed. */
const UNIVERSAL = new Set(['error', 'note', 'ok', 'cut', 'privacy_note']);
const MAX_DEPTH = 8;

export type GateOutcome = {
  value: unknown;
  /** Fields removed or masked, by category. `unknown` counts fields no map named. */
  withheld: Record<string, number>;
  /** Categories that have at least one value left in the result. */
  used: Category[];
  /** Paths of fields no map named (names only, never values). Empty is the only healthy answer. */
  unknown: string[];
};

const isPrimitive = (v: unknown): v is string | number | boolean | null => v === null || ['string', 'number', 'boolean'].includes(typeof v);
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The last four characters of a code, with the rest hidden. A code of four or fewer characters would be shown whole, so it is hidden whole. */
export function lastFour(code: string): string {
  const c = (code ?? '').trim();
  return c.length > 4 ? `****${c.slice(-4)}` : '[hidden]';
}

/** What the free text scrubber may leave alone under this policy: an email or a phone number only where its category may be sent. */
export const keepFor = (p: GatePolicy): ScrubKeep => ({ email: p.email === 'allow', phone: p.personal === 'allow' });

/** Applies a policy to one value: scrubs strings, passes numbers and booleans. */
function cleanValue(v: string | number | boolean | null, keep: ScrubKeep): string | number | boolean | null { return typeof v === 'string' ? scrubText(v, keep).text : v; }

/** Content tools: no shop data, so no categories. Keys, card numbers and anything key shaped are still masked in every string. */
function scrubContent(v: unknown, depth: number, withheld: Record<string, number>): unknown {
  if (typeof v === 'string') {
    const s = scrubText(v, { email: true, phone: true });
    if (s.masked.card) withheld.payment = (withheld.payment ?? 0) + s.masked.card;
    if (s.masked.key) withheld.secret = (withheld.secret ?? 0) + s.masked.key;
    return s.text;
  }
  if (isPrimitive(v)) return v;
  if (depth >= MAX_DEPTH) { withheld.unknown = (withheld.unknown ?? 0) + 1; return null; }
  if (Array.isArray(v)) return v.map(x => scrubContent(x, depth + 1, withheld));
  if (isObject(v)) { const o: Record<string, unknown> = {}; for (const [k, x] of Object.entries(v)) o[k] = scrubContent(x, depth + 1, withheld); return o; }
  withheld.unknown = (withheld.unknown ?? 0) + 1; return null;
}

/**
 * Runs a tool result through the gate. Nothing is thrown: whatever cannot be sorted is dropped and reported in `unknown`.
 * When something was hidden from an object result, a `privacy_note` names the categories (never the contents) so the model
 * says it cannot show them instead of guessing.
 */
export function applyGate(result: unknown, spec: GateSpec, policy: GatePolicy = FAIL_CLOSED_POLICY): GateOutcome {
  const withheld: Record<string, number> = {}; const used = new Set<Category>(); const unknown: string[] = [];
  const bump = (k: string) => { withheld[k] = (withheld[k] ?? 0) + 1; };
  const keep = keepFor(policy);

  if (spec === 'content') return { value: scrubContent(result, 0, withheld), withheld, used: [], unknown };

  const walkValue = (v: unknown, rule: FieldRule, path: string, depth: number): { keep: boolean; value?: unknown } => {
    if (typeof rule === 'string') {
      const d = policy[rule] ?? 'deny';
      if (d === 'deny') { bump(rule); return { keep: false }; }
      if (Array.isArray(v)) {
        if (!v.every(isPrimitive)) { unknown.push(path); bump('unknown'); return { keep: false }; }
        const items = v.map(x => (d === 'last4' ? (typeof x === 'string' ? lastFour(x) : '[hidden]') : cleanValue(x, keep)));
        if (items.length) used.add(rule); return { keep: true, value: items };
      }
      if (!isPrimitive(v)) { unknown.push(path); bump('unknown'); return { keep: false }; }
      if (v === null) return { keep: true, value: null };
      used.add(rule);
      if (d === 'last4') { bump(rule); return { keep: true, value: typeof v === 'string' ? lastFour(v) : '[hidden]' }; }
      return { keep: true, value: cleanValue(v, keep) };
    }
    // a nested map: an object, or a list of objects
    if (depth >= MAX_DEPTH) { unknown.push(path); bump('unknown'); return { keep: false }; }
    if (v === null) return { keep: true, value: null };
    if (Array.isArray(v)) {
      // A row whose fields were all hidden is left out whole, so the model is not shown a list of empty rows and told how many there were.
      const rows: unknown[] = [];
      v.forEach((x, i) => { const o = walkObject(x, rule, `${path}[${i}]`, depth + 1); if (isObject(x) && Object.keys(x).length && isObject(o) && !Object.keys(o).length) return; rows.push(o); });
      return { keep: true, value: rows };
    }
    // An object whose fields were all hidden is left out whole, so the model is not shown an empty "customer" and left to wonder.
    const obj = walkObject(v, rule, path, depth + 1);
    if (isObject(v) && Object.keys(v).length && isObject(obj) && !Object.keys(obj).length) return { keep: false };
    return { keep: true, value: obj };
  };
  const walkObject = (v: unknown, map: FieldMap, path: string, depth: number): unknown => {
    if (!isObject(v)) { unknown.push(path); bump('unknown'); return null; }
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      const at = path ? `${path}.${k}` : k;
      if (Object.prototype.hasOwnProperty.call(map, k)) { const r = walkValue(x, map[k], at, depth); if (r.keep) out[k] = r.value; continue; }
      if (depth === 0 && UNIVERSAL.has(k) && isPrimitive(x)) { out[k] = cleanValue(x, keep); continue; }
      unknown.push(at); bump('unknown');
    }
    return out;
  };

  const value = Array.isArray(result) ? result.map((x, i) => walkObject(x, spec, `[${i}]`, 0)) : walkObject(result, spec, '', 0);
  const hidden = (Object.keys(withheld) as string[]).filter(k => k !== 'unknown' && k in CATEGORY_INFO);
  if (hidden.length && isObject(value)) value.privacy_note = `Hidden by the shop's privacy rules: ${hidden.map(k => CATEGORY_INFO[k as Category].phrase).join(', ')}. Say you cannot show that. Do not guess it.`;
  return { value, withheld, used: [...used], unknown };
}

/** True when a past reply drew on a category the current policy no longer sends, so it must not be sent on as history. */
export const restricted = (used: readonly string[] | undefined, p: GatePolicy): boolean => (used ?? []).some(c => (p[c as Category] ?? 'deny') === 'deny');

/** Describes what the policy does, for the settings screen: "Sent", "Not sent" or "Last four characters only". */
export const decisionWord = (d: Decision): string => (d === 'allow' ? 'Sent' : d === 'last4' ? 'Last four characters only' : 'Not sent');
