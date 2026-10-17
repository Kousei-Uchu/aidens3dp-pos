// Location: src/lib/assistantConfig.ts
// Settings ▸ AI assistant: the shape of the settings, how an address is read, and whether it counts as local.
// Pure logic only (no React Native imports) so it runs in the node tests.
// The API key is NOT part of these settings. It lives in the Keychain (assistantKey.ts) and travels in backups as a login.

/** How the data rules read the address. Auto follows the address. Local and Remote force it either way. */
export type EndpointMode = 'auto' | 'local' | 'remote';
export const ENDPOINT_MODES: readonly EndpointMode[] = ['auto', 'local', 'remote'];

/** The kinds of shop data the data gate (assistantGate.ts) sorts everything into. Payment and secret have no toggle: they are never sent. */
export const GATE_TOGGLE_CATEGORIES = ['personal', 'email', 'gift_balance', 'gift_code', 'order', 'cost', 'shop'] as const;
export type GateToggleCategory = typeof GATE_TOGGLE_CATEGORIES[number];
/** Auto follows the table in the plan (3.1). Allow sends the category even where the table would not. Never keeps it out even where the table would send it. */
export type GateToggle = 'auto' | 'allow' | 'never';
export const GATE_TOGGLES: readonly GateToggle[] = ['auto', 'allow', 'never'];
export type GateToggles = Record<GateToggleCategory, GateToggle>;
export const defaultGateToggles = (): GateToggles => ({ personal: 'auto', email: 'auto', gift_balance: 'auto', gift_code: 'auto', order: 'auto', cost: 'auto', shop: 'auto' });
/** Anything stored or restored becomes a full set of toggles. Missing, unknown or odd values are Auto, the table in the plan. */
export function normaliseToggles(x: unknown): GateToggles {
  const d = defaultGateToggles(); const o = (x && typeof x === 'object' && !Array.isArray(x) ? x : {}) as Record<string, unknown>;
  for (const k of GATE_TOGGLE_CATEGORIES) { const v = o[k]; if (typeof v === 'string' && (GATE_TOGGLES as readonly string[]).includes(v)) d[k] = v as GateToggle; }
  return d;
}

export type AssistantSettings = {
  baseUrl: string;        // OpenAI-compatible base, for example http://192.168.1.20:11434/v1 (Ollama) or https://api.example.com/v1
  model: string;
  temperature: number;
  timeoutSec: number;     // how long one request may take
  contextSize: number;    // how much text the model can read at once, in tokens (the app cannot see this by itself)
  toolCallLimit: number;  // safety stop for a model stuck calling tools in a loop
  endpointMode: EndpointMode; // auto follows the address rules, local or remote forces the class (a tunnel on a 192.168 address can be forced remote)
  logCapMB: number;       // audit log cap in MB (default 200)
  gate: GateToggles;      // per category override of the data rules (patch 0161), Auto by default
};

export const DEFAULT_TIMEOUT_SEC = 120;
export const DEFAULT_CONTEXT_SIZE = 8000;
export const DEFAULT_TOOL_CALL_LIMIT = 15;
export const DEFAULT_LOG_CAP_MB = 200;

export const defaultAssistant = (): AssistantSettings => ({
  baseUrl: '', model: '', temperature: 0.2, timeoutSec: DEFAULT_TIMEOUT_SEC, contextSize: DEFAULT_CONTEXT_SIZE, toolCallLimit: DEFAULT_TOOL_CALL_LIMIT, endpointMode: 'auto', logCapMB: DEFAULT_LOG_CAP_MB, gate: defaultGateToggles(),
});

const clampInt = (x: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
};
const clampNum = (x: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

/** Reads the mode. Settings saved by patch 0148 had a yes or no switch, and yes becomes Local. Anything else is Auto. */
function readMode(o: Record<string, unknown>): EndpointMode {
  if (typeof o.endpointMode === 'string' && (ENDPOINT_MODES as readonly string[]).includes(o.endpointMode)) return o.endpointMode as EndpointMode;
  return o.treatAsLocal === true ? 'local' : 'auto';
}

/** Anything stored, typed or restored from a file becomes a valid settings object. Missing or bad values get the defaults. */
export function normaliseAssistant(x: unknown): AssistantSettings {
  const d = defaultAssistant(); const o = (x && typeof x === 'object' && !Array.isArray(x) ? x : {}) as Record<string, unknown>;
  return {
    baseUrl: typeof o.baseUrl === 'string' ? o.baseUrl.trim() : d.baseUrl,
    model: typeof o.model === 'string' ? o.model.trim() : d.model,
    temperature: clampNum(o.temperature, 0, 2, d.temperature),
    timeoutSec: clampInt(o.timeoutSec, 5, 600, d.timeoutSec),
    contextSize: clampInt(o.contextSize, 1000, 2_000_000, d.contextSize),
    toolCallLimit: clampInt(o.toolCallLimit, 1, 100, d.toolCallLimit),
    endpointMode: readMode(o),
    logCapMB: clampInt(o.logCapMB, 1, 10_000, d.logCapMB),
    gate: normaliseToggles(o.gate),
  };
}

// ---------- reading an address ----------
export type ParsedUrl = { ok: true; base: string; host: string; https: boolean } | { ok: false; error: string };

/** Splits `host[:port]` or `[ipv6][:port]`. Returns null when it does not look like a host. */
function splitHost(authority: string): { host: string } | null {
  let host = authority;
  if (host.startsWith('[')) { const end = host.indexOf(']'); if (end < 0) return null; const rest = host.slice(end + 1); if (rest && !/^:\d{1,5}$/.test(rest)) return null; host = host.slice(1, end); return /^[0-9a-f:.]+$/i.test(host) && host.includes(':') ? { host: host.toLowerCase() } : null; }
  const m = /^([^:]+)(?::(\d{1,5}))?$/.exec(host); if (!m) return null;
  host = m[1].toLowerCase().replace(/\.$/, '');
  return /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/.test(host) ? { host } : null;
}

/** Reads what the manager typed. No address scheme means http for a local looking host and https for anything else. A trailing slash is dropped. */
export function parseBaseUrl(raw: string): ParsedUrl {
  const text = (raw ?? '').trim();
  if (!text) return { ok: false, error: 'Enter the address of the model server.' };
  if (/\s/.test(text)) return { ok: false, error: 'The address has a space in it.' };
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  let rest = text, https = false;
  if (hasScheme) {
    const m = /^(https?):\/\/(.*)$/i.exec(text);
    if (!m) return { ok: false, error: 'The address must start with http:// or https://.' };
    https = m[1].toLowerCase() === 'https'; rest = m[2];
  } else {
    const first = splitHost(rest.split(/[/?#]/)[0]);
    https = !(first && classifyHost(first.host) === 'local');
  }
  const cut = rest.search(/[/?#]/); const authority = cut < 0 ? rest : rest.slice(0, cut); const tail = cut < 0 ? '' : rest.slice(cut);
  if (authority.includes('@')) return { ok: false, error: 'Remove the user name and password from the address. Put the key in the API key box.' };
  if (/[?#]/.test(tail)) return { ok: false, error: 'Remove everything after a ? or # from the address.' };
  const h = splitHost(authority); if (!h) return { ok: false, error: 'That does not look like a server address.' };
  const path = tail.replace(/\/+$/, '');
  return { ok: true, base: `${https ? 'https' : 'http'}://${authority.toLowerCase()}${path}`, host: h.host, https };
}

// ---------- local or remote ----------
export type EndpointClass = 'local' | 'remote';

const quad = (host: string): number[] | null => {
  const p = host.split('.'); if (p.length !== 4) return null;
  const n: number[] = [];
  for (const s of p) { if (!/^(0|[1-9]\d{0,2})$/.test(s)) return null; const v = Number(s); if (v > 255) return null; n.push(v); }
  return n;
};

/** Local means this device, the private ranges and .local names. Everything else, including a bare name or a malformed address, is remote. */
export function classifyHost(hostRaw: string): EndpointClass {
  const host = (hostRaw ?? '').toLowerCase().replace(/\.$/, '');
  if (!host) return 'remote';
  if (host === 'localhost' || host.endsWith('.localhost')) return 'local';
  if (host === '::1') return 'local';
  const q = quad(host);
  if (q) {
    const [a, b] = q;
    if (a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) return 'local';
    return 'remote';
  }
  if (host.endsWith('.local') && host.length > '.local'.length && !host.startsWith('.')) return 'local';
  return 'remote';
}

/** The class the data rules use. Auto follows the address, and an unreadable or empty address counts as remote, the safe side. Local and Remote override the address. */
export function classifyEndpoint(baseUrl: string, mode: EndpointMode): EndpointClass {
  if (mode === 'local') return 'local';
  if (mode === 'remote') return 'remote';
  const p = parseBaseUrl(baseUrl);
  return p.ok ? classifyHost(p.host) : 'remote';
}

export const isConfigured = (a: Pick<AssistantSettings, 'baseUrl' | 'model'>): boolean => parseBaseUrl(a.baseUrl).ok && a.model.trim() !== '';

/** What to show for a saved key without giving it back: nothing but the last four characters, and only when it is long enough that those say little. */
export function maskKey(key: string): string {
  const k = (key ?? '').trim(); if (!k) return '';
  return k.length >= 12 ? `Saved, ends ${k.slice(-4)}` : 'Saved';
}
