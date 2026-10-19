// Location: src/lib/assistantStatus.ts
// The assistant's last two read-only tools (patch 0169, plan 3.2 tools 12 and 15): `read_settings` and `app_status`.
//
//   read_settings  what the till is set up to do: cash rounding, receipts, who may change prices, display and so on. It is only for
//                  people who can open Settings (a manager or an owner). For anyone else it is left out of the request entirely.
//   app_status     whether the till is in a fit state: app version, sync, sales waiting to upload, the card reader, the catalogue
//                  and the recent problems, scrubbed. Support & diagnostics is open to every role, so the tool is too.
//
// Nothing here reads the app. `assistantStatusIO.ts` reads the store once, when the question is asked, and builds the two views below
// with `buildSettingsView` and `buildStatusView`. The tools only return those views. A secret never enters them: the builders do not
// copy any web address, token, PIN, badge, staff name, contact detail or logo address, only whether one is set. So even a tool that
// was wrong could not leak one, and the data gate (assistantGate.ts) still sorts every field a tool returns. Pure, so it runs in the
// node tests.
import type { Settings, OutboxItem, SyncState, ZellerStatus } from '../state/store';
import type { Notice } from './types';
import { ADJUST_KINDS, KIND_NAME, RESTRICTABLE_ROLES, ROLE_PLURAL, readAdjustPerms } from './adjustPerms';
import { classifyEndpoint, isConfigured, type GateToggleCategory } from './assistantConfig';
import { dayKey } from './rollup';
import { clockText } from './assistantTime';
import type { AssistantTool } from './assistantTools';

// ---------- small helpers ----------
const SAFE_CHARS = 160;
/** An error or a notice as text the model may read: no web addresses, one line, short. The data gate then scrubs emails, numbers and keys. */
export function safeLine(text: unknown, max = SAFE_CHARS): string {
  const t = String(text ?? '').replace(/https?:\/\/\S+/gi, '[address]').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
/** "2026-10-18 3:05 pm", in the till's own time, or `null` for a time that is missing or cannot be read. */
export function whenText(iso: string | number | undefined | null): string | null {
  if (iso === undefined || iso === null || iso === '') return null;
  const d = new Date(iso); if (isNaN(d.getTime())) return null;
  return `${dayKey(d)} ${clockText(d)}`;
}
const minutesSince = (iso: string | undefined, now: number): number | null => { if (!iso) return null; const t = new Date(iso).getTime(); return isNaN(t) ? null : Math.max(0, Math.round((now - t) / 60_000)); };
const pct = (rate: number): string => `${(Number(rate) * 100).toFixed(1)}%`;
const yes = (v: unknown): boolean => !!(typeof v === 'string' ? v.trim() : v);

// ---------- the settings view ----------
/** The parts of Settings the reader looks at. The real `Settings` fits this, and a test can build one by hand. */
export type SettingsIn = Pick<Settings, 'shopName' | 'locationName' | 'registerName' | 'cashRounding' | 'smartChange' | 'consolidate' | 'fees' | 'theme' | 'tileSize' | 'glassSurfaces' | 'itemSpotlight' | 'staff' | 'requirePin' | 'passServerUrl' | 'giftClaimUrl' | 'autoReceipt' | 'receipt' | 'bundlesJson' | 'screensaver' | 'helpDepth' | 'adjustPerms' | 'cartWarnings' | 'scannerCal' | 'assistant'>;
/** What only the store knows, taken by the IO file. */
export type SettingsExtra = { shopifyConnected: boolean; shopifyStore?: string; bundleDeals: number; automaticDiscounts: number; /** May this person see the AI assistant settings (an owner, or a manager when the team has no owner)? */ canSeeAssistant: boolean };

export type SettingsView = Record<string, unknown>;

const TOGGLE_WORD = { auto: 'Auto', allow: 'Always allow', never: 'Never allow' } as const;
const PRIVACY_KEY: Record<GateToggleCategory, string> = { personal: 'customer_details', email: 'email_addresses', gift_balance: 'gift_card_balances', gift_code: 'gift_card_codes', order: 'order_details', cost: 'costs_and_profit', shop: 'shop_data' };

/** Builds what `read_settings` may say. Every value is a plain word, number or yes or no. Nothing that is a secret, an address or a name is copied. */
export function buildSettingsView(s: SettingsIn, x: SettingsExtra): SettingsView {
  const staff = s.staff ?? [];
  const count = (r: string) => staff.filter(m => m.role === r).length;
  const perms = readAdjustPerms(s.adjustPerms);
  const limits: string[] = [];
  for (const role of RESTRICTABLE_ROLES) for (const k of ADJUST_KINDS) if (perms[role]?.[k] === false) limits.push(`${ROLE_PLURAL[role]} cannot set ${KIND_NAME[k]}`);
  const warn = s.cartWarnings ?? [];
  const spot = s.itemSpotlight ?? { name: false, image: false };
  const saver = s.screensaver;
  const view: SettingsView = {
    register: { name: safeLine(s.registerName, 60), shop_name: safeLine(s.shopName, 60), ...(s.locationName ? { location: safeLine(s.locationName, 60) } : {}) },
    shopify: { connected: x.shopifyConnected, ...(x.shopifyConnected && x.shopifyStore ? { store: safeLine(x.shopifyStore, 80) } : {}) },
    checkout: { cash_rounding: !!s.cashRounding, smart_change: !!s.smartChange, consolidate_identical_items: !!s.consolidate, auto_receipt: s.autoReceipt === 'none' ? 'never sent by itself' : 'asks at each sale' },
    card_fees: { card_present: pct(s.fees?.cardPresentRate), keyed: pct(s.fees?.keyedRate), refund_returns_fee: !!s.fees?.refundReturnsFee },
    receipts: { page_set_up: yes(s.receipt?.serverUrl), business_name_set: yes(s.receipt?.name), abn_set: yes(s.receipt?.abn), gst_registered: !!s.receipt?.gstRegistered, return_policy_set: yes(s.receipt?.returnPolicy) },
    links: { gift_card_claim_page_set: yes(s.giftClaimUrl), pass_server_set: yes(s.passServerUrl) },
    staff: { pin_required: !!s.requirePin, owners: count('owner'), managers: count('manager'), cashiers: count('cashier') },
    price_adjustment_limits: limits.length ? limits : ['None: every role may set price adjustments'],
    cart_warnings: { total: warn.length, switched_on: warn.filter(w => w.enabled).length },
    discounts: { bundle_deals: x.bundleDeals, automatic_discounts: x.automaticDiscounts },
    display: { theme: s.theme, tile_size: typeof s.tileSize === 'number' ? `${s.tileSize} points` : s.tileSize, glass_surfaces: !!s.glassSurfaces, item_spotlight_name: !!spot.name, item_spotlight_image: !!spot.image, help_depth: s.helpDepth },
    screensaver: { on: !!saver?.enabled, after_minutes: saver?.idleMinutes, when_signed_out: !!saver?.showWhenLoggedOut, keeps_screen_awake: !!saver?.keepAwake, drifting_logo: !!saver?.drift, clock: !!saver?.showClock },
    scanner_calibrated: !!s.scannerCal,
  };
  if (x.canSeeAssistant) {
    const a = s.assistant; const privacy: Record<string, string> = {};
    for (const k of Object.keys(PRIVACY_KEY) as GateToggleCategory[]) privacy[PRIVACY_KEY[k]] = TOGGLE_WORD[a.gate?.[k] ?? 'auto'];
    view.assistant = {
      set_up: isConfigured(a), model: safeLine(a.model, 80) || 'none',
      endpoint: a.baseUrl.trim() ? classifyEndpoint(a.baseUrl, a.endpointMode) : 'none', endpoint_setting: a.endpointMode,
      context_size: a.contextSize, tool_call_limit: a.toolCallLimit, timeout_seconds: a.timeoutSec, log_cap_mb: a.logCapMB, privacy,
    };
  }
  return view;
}

/** The groups the model can ask for. `all` is every group. The assistant group is only ever in `all`, and only when this person may see it. */
export const SETTINGS_SECTIONS = ['register', 'checkout', 'receipts', 'staff', 'display'] as const;
const SECTION_KEYS: Record<typeof SETTINGS_SECTIONS[number], string[]> = {
  register: ['register', 'shopify'],
  checkout: ['checkout', 'card_fees', 'cart_warnings', 'discounts'],
  receipts: ['receipts', 'links'],
  staff: ['staff', 'price_adjustment_limits'],
  display: ['display', 'screensaver', 'scanner_calibrated'],
};
/** What `read_settings` returns for a section. An unknown section is an error the model can read. */
export function settingsReply(view: SettingsView, section: unknown): Record<string, unknown> {
  const name = typeof section === 'string' ? section.trim().toLowerCase() : '';
  const note = 'These are this register\'s settings as they were when the question was asked. You can only read them. Say where to change one with search_screens, never change it.';
  if (!name || name === 'all') return { ...view, note };
  const keys = (SECTION_KEYS as Record<string, string[] | undefined>)[name];
  if (!keys) return { error: `There is no settings group called "${safeLine(name, 40)}". Use one of: ${SETTINGS_SECTIONS.join(', ')}, or leave it out for everything.` };
  const out: Record<string, unknown> = {}; for (const k of keys) if (k in view) out[k] = view[k];
  return { ...out, note };
}

// ---------- the status view ----------
export type StatusIn = {
  now: number; version: string; build: string; registerName: string;
  sync: SyncState; zeller: ZellerStatus; outbox: readonly Pick<OutboxItem, 'queuedAt' | 'tries' | 'error' | 'blocked'>[]; notices: readonly Pick<Notice, 'ts' | 'kind' | 'title' | 'read'>[];
  shopifyConnected: boolean; receiptPageSet: boolean; catalogueAt?: string; stockSince?: string; variationCount: number;
};
export type StatusView = Record<string, unknown>;

/** Notice kinds that say something about how the till is doing. Refunds and passes name customers and staff, so they are left out. */
const STATUS_KINDS: readonly string[] = ['sync', 'queue', 'stock', 'reader', 'info'];
const MAX_ERRORS = 3; const MAX_NOTICES = 5;

export function buildStatusView(i: StatusIn): StatusView {
  const waiting = i.outbox.length; const blocked = i.outbox.filter(o => o.blocked).length;
  const oldest = i.outbox.map(o => o.queuedAt).filter(Boolean).sort()[0];
  const errors: string[] = [];
  for (const o of i.outbox) { const e = safeLine(o.error); if (e && !errors.includes(e) && errors.length < MAX_ERRORS) errors.push(e); }
  const unread = i.notices.filter(n => !n.read && STATUS_KINDS.includes(n.kind)).length;
  const recent = i.notices.filter(n => STATUS_KINDS.includes(n.kind)).slice().sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, MAX_NOTICES)
    .map(n => ({ when: whenText(n.ts) ?? 'unknown', kind: n.kind, title: safeLine(n.title, 100), read: !!n.read }));
  const ago = minutesSince(i.sync.at, i.now);
  const view: StatusView = {
    app: { version: safeLine(i.version, 20) || 'unknown', build: safeLine(i.build, 20) || 'unknown', register: safeLine(i.registerName, 60) },
    sync: { state: i.sync.state, last_sync: whenText(i.sync.at) ?? 'not yet', ...(ago !== null ? { minutes_since_last_sync: ago } : {}), ...(i.sync.error ? { message: safeLine(i.sync.error) } : {}) },
    queue: { sales_waiting_to_upload: waiting, needing_a_person: blocked, ...(oldest ? { oldest_waiting_since: whenText(oldest) ?? 'unknown' } : {}), recent_errors: errors },
    card_reader: { ready: !!i.zeller.ready, ...(i.zeller.message ? { message: safeLine(i.zeller.message) } : {}) },
    shopify_connected: i.shopifyConnected,
    receipt_page_set_up: i.receiptPageSet,
    catalogue: { variations: i.variationCount, last_imported: whenText(i.catalogueAt) ?? 'never', ...(i.stockSince ? { stock_counted_since: whenText(i.stockSince) ?? 'unknown' } : {}) },
    notifications: { unread, recent },
    note: 'This is how the till was doing when the question was asked. Card payments and receipts are not listed here. There is no printer connection in this app.',
  };
  return view;
}

/** The two views, taken together when the question is asked. `settings` is null for a role that may not read settings. */
export type TillState = { settings: SettingsView | null; status: StatusView };

// ---------- the tools ----------
/** What a tool says when it is not there for this role: exactly what runToolCall says for a name it does not know. */
const NO_TOOL = (name: string) => ({ error: `There is no tool called "${name}".` });
const NO_STATE = 'The till\'s state could not be read just now.';
const SETTINGS_ROLES: readonly string[] = ['manager', 'owner'];

const flat = (...keys: string[]) => Object.fromEntries(keys.map(k => [k, 'shop'] as const));

export const appStatusTool: AssistantTool = {
  gate: {
    app: flat('version', 'build', 'register'),
    sync: flat('state', 'last_sync', 'minutes_since_last_sync', 'message'),
    queue: { ...flat('sales_waiting_to_upload', 'needing_a_person', 'oldest_waiting_since'), recent_errors: 'shop' },
    card_reader: flat('ready', 'message'),
    shopify_connected: 'shop', receipt_page_set_up: 'shop',
    catalogue: flat('variations', 'last_imported', 'stock_counted_since'),
    notifications: { unread: 'shop', recent: flat('when', 'kind', 'title', 'read') },
  },
  def: { type: 'function', function: {
    name: 'app_status',
    description: 'How the till is doing now: the app version, sync state and when it last ran, sales waiting to upload, whether the card reader is ready, when the catalogue was last imported and the recent problems. Use it when something is not working or not updating, or to check the till is up to date.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  } },
  run: (_args, ctx) => ctx.till?.status ?? { error: NO_STATE },
};

export const readSettingsTool: AssistantTool = {
  roles: SETTINGS_ROLES,
  gate: {
    register: flat('name', 'shop_name', 'location'), shopify: flat('connected', 'store'),
    checkout: flat('cash_rounding', 'smart_change', 'consolidate_identical_items', 'auto_receipt'),
    card_fees: flat('card_present', 'keyed', 'refund_returns_fee'),
    receipts: flat('page_set_up', 'business_name_set', 'abn_set', 'gst_registered', 'return_policy_set'),
    links: flat('gift_card_claim_page_set', 'pass_server_set'),
    staff: flat('pin_required', 'owners', 'managers', 'cashiers'),
    price_adjustment_limits: 'shop',
    cart_warnings: flat('total', 'switched_on'), discounts: flat('bundle_deals', 'automatic_discounts'),
    display: flat('theme', 'tile_size', 'glass_surfaces', 'item_spotlight_name', 'item_spotlight_image', 'help_depth'),
    screensaver: flat('on', 'after_minutes', 'when_signed_out', 'keeps_screen_awake', 'drifting_logo', 'clock'),
    scanner_calibrated: 'shop',
    assistant: { ...flat('set_up', 'model', 'endpoint', 'endpoint_setting', 'context_size', 'tool_call_limit', 'timeout_seconds', 'log_cap_mb'), privacy: flat(...Object.values(PRIVACY_KEY)) },
  },
  def: { type: 'function', function: {
    name: 'read_settings',
    description: 'The till\'s current settings, read only: cash rounding, receipts, who must use a PIN, which roles may not change prices, the display and the screensaver. Web addresses, keys, PINs and staff names are never included, only whether one is set. Ask for one group, or leave it out for all.',
    parameters: { type: 'object', properties: { section: { type: 'string', enum: [...SETTINGS_SECTIONS], description: 'One group of settings. Leave it out for all of them.' } }, additionalProperties: false },
  } },
  run: (args, ctx) => {
    // The same answer as a tool that is not there, for a role that may not open Settings. The request leaves the tool out for them too.
    if (!SETTINGS_ROLES.includes(ctx.role)) return NO_TOOL('read_settings');
    const view = ctx.till?.settings; if (!view) return { error: NO_STATE };
    return settingsReply(view, args.section);
  },
};
