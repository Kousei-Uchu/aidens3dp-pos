// Location: src/lib/uiMode.ts
// Display modes for staff (B5): Standard, Simple, Minimal, Custom. Pure rules, no React.
// A mode can only NARROW or ENLARGE what a person sees. It never grants anything their role does not already allow.
import type { Role } from './types';

export type UiMode = 'standard' | 'simple' | 'minimal' | 'custom';
export type TextSize = 'normal' | 'large' | 'xlarge';
export type TabLevel = 'all' | 'core' | 'basic';
export type MoreLevel = 'all' | 'everyday' | 'essential';
export type TabId = 'checkout' | 'inventory' | 'transactions' | 'notifications' | 'more';
export type MoreRowId = 'orders' | 'items' | 'customers' | 'saved' | 'giftcards' | 'reports' | 'drawer' | 'staff' | 'settings' | 'deviceMode' | 'diagnostics' | 'help' | 'training' | 'lock';

/** The four dials a Custom mode exposes. */
export type CustomUi = {
  textSize: TextSize; explain: boolean; tabs: TabLevel; more: MoreLevel; guided: boolean;
  tabOverrides?: Partial<Record<TabId, boolean>>;
  moreOverrides?: Partial<Record<MoreRowId, boolean>>;
  guidedCustomer?: boolean;
};
/** Stored on the staff member (so it travels with the staff list to every register). */
export type StaffUi = { mode: UiMode; custom?: CustomUi };

export const MODES: UiMode[] = ['standard', 'simple', 'minimal', 'custom'];
export const TEXT_SCALE: Record<TextSize, number> = { normal: 1, large: 1.05, xlarge: 1.1 };
export const TAB_ORDER: TabId[] = ['checkout', 'inventory', 'transactions', 'notifications', 'more'];
export const TABS_BY_LEVEL: Record<TabLevel, TabId[]> = {
  all: ['checkout', 'inventory', 'transactions', 'notifications', 'more'],
  core: ['checkout', 'inventory', 'transactions', 'more'],
  basic: ['checkout', 'transactions', 'more'],
};
/** Rows in the More screen, in three groups (the screen draws a card per group). */
export const MORE_GROUPS: MoreRowId[][] = [
  ['orders', 'items', 'customers', 'saved', 'giftcards'],
  ['reports', 'drawer', 'staff', 'settings', 'deviceMode', 'diagnostics', 'help', 'training'],
  ['lock'],
];
const ESSENTIAL: MoreRowId[] = ['orders', 'saved', 'giftcards', 'drawer', 'diagnostics', 'help', 'training', 'deviceMode', 'lock'];
const EVERYDAY: MoreRowId[] = [...ESSENTIAL, 'items', 'customers'];
export const ROWS_BY_LEVEL: Record<MoreLevel, MoreRowId[] | 'all'> = { all: 'all', everyday: EVERYDAY, essential: ESSENTIAL };
const MANAGER_ROWS: MoreRowId[] = ['reports', 'staff', 'settings'];
const ADMIN_REQUIRED_ROWS: MoreRowId[] = ['staff', 'settings'];

export const DEFAULT_CUSTOM: CustomUi = { textSize: 'normal', explain: false, tabs: 'all', more: 'all', guided: false, guidedCustomer: false };
const PRESETS: Record<'standard' | 'simple' | 'minimal', CustomUi> = {
  standard: DEFAULT_CUSTOM,
  simple: { textSize: 'normal', explain: true, tabs: 'all', more: 'all', guided: false },
  minimal: { textSize: 'normal', explain: true, tabs: 'basic', more: 'essential', guided: true },
};

export type UiProfile = {
  mode: UiMode; textScale: number; explain: boolean; tabs: TabId[]; moreLevel: MoreLevel;
  moreOverrides?: Partial<Record<MoreRowId, boolean>>; alwaysShowAdmin?: boolean;
  /** Checkout is the one-question-at-a-time flow. */
  guided: boolean; guidedCustomer: boolean;
};

const isOne = <T extends string>(v: unknown, all: readonly T[]): v is T => typeof v === 'string' && (all as readonly string[]).includes(v);
/** Anything read from storage or from another register is treated as untrusted: unknown values fall back to the standard ones. */
export function readCustom(raw: unknown): CustomUi {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const readOverrides = <T extends string>(value: unknown, keys: readonly T[]): Partial<Record<T, boolean>> => {
    const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const result: Partial<Record<T, boolean>> = {};
    for (const key of keys) {
      const enabled = source[key];
      if (typeof enabled === 'boolean') result[key] = enabled;
    }
    return result;
  };
  return {
    textSize: isOne(r.textSize, ['normal', 'large', 'xlarge'] as const) ? r.textSize : DEFAULT_CUSTOM.textSize,
    explain: typeof r.explain === 'boolean' ? r.explain : DEFAULT_CUSTOM.explain,
    tabs: isOne(r.tabs, ['all', 'core', 'basic'] as const) ? r.tabs : DEFAULT_CUSTOM.tabs,
    more: isOne(r.more, ['all', 'everyday', 'essential'] as const) ? r.more : DEFAULT_CUSTOM.more,
    guided: typeof r.guided === 'boolean' ? r.guided : DEFAULT_CUSTOM.guided,
    tabOverrides: readOverrides(r.tabOverrides, TAB_ORDER),
    moreOverrides: readOverrides(r.moreOverrides, MORE_GROUPS.flat()),
    guidedCustomer: typeof r.guidedCustomer === 'boolean' ? r.guidedCustomer : false,
  };
}
export function readUi(raw: unknown): StaffUi {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const mode: UiMode = isOne(r.mode, MODES) ? r.mode : 'standard';
  return mode === 'custom' ? { mode, custom: readCustom(r.custom) } : { mode };
}

export type ResolveCtx = {
  /** True when this person is the only manager or owner. Mode then never hides Staff and Settings from them, so nobody can lock themselves out of changing it back. */
  soleAdmin?: boolean;
};

/** Turns a staff member's saved mode into what the app should show. No staff member (nobody signed in, or no staff set up) = Standard. */
export function resolveUi(ui: unknown, ctx: ResolveCtx = {}): UiProfile {
  const s = readUi(ui);
  const d = s.mode === 'custom' ? readCustom(s.custom) : PRESETS[s.mode];
  // Checkout and More are always there: Checkout is the job, More holds Lock register and the way back.
  const tabOverrides = s.mode === 'custom' ? d.tabOverrides : undefined;
  const tabs = TAB_ORDER.filter(id => id === 'checkout' || id === 'more' || (tabOverrides?.[id] ?? TABS_BY_LEVEL[d.tabs].includes(id)));
  let moreLevel = d.more;
  if (ctx.soleAdmin && moreLevel !== 'all') moreLevel = 'all';
  return { mode: s.mode, textScale: TEXT_SCALE[d.textSize], explain: d.explain, tabs, moreLevel, moreOverrides: s.mode === 'custom' ? d.moreOverrides : undefined, alwaysShowAdmin: ctx.soleAdmin, guided: d.guided, guidedCustomer: d.guidedCustomer ?? false };
}
export const STANDARD_PROFILE: UiProfile = resolveUi({ mode: 'standard' });

/** Which More rows to draw, per group, for this role. Mode narrows, role gates; the two never widen each other. */
export function visibleMoreRows(p: UiProfile, role: Role, lockAvailable: boolean): MoreRowId[][] {
  const allowedByLevel = ROWS_BY_LEVEL[p.moreLevel];
  const ok = (id: MoreRowId) => {
    if (MANAGER_ROWS.includes(id) && role === 'cashier') return false;
    if (id === 'lock' && !lockAvailable) return false;
    if (p.alwaysShowAdmin && ADMIN_REQUIRED_ROWS.includes(id)) return true;
    return p.moreOverrides?.[id] ?? (allowedByLevel === 'all' || allowedByLevel.includes(id));
  };
  return MORE_GROUPS.map(g => g.filter(ok)).filter(g => g.length > 0);
}

export const moreLevelIncludes = (level: MoreLevel, id: MoreRowId) => {
  const rows = ROWS_BY_LEVEL[level];
  return rows === 'all' || rows.includes(id);
};

/** Plain-language lines shown under the More rows when "explain" is on. */
export const MORE_EXPLAIN: Record<MoreRowId, string> = {
  orders: 'Look up a past sale, or give a refund.',
  items: 'Add products or change names and prices.',
  customers: 'Your customer list.',
  saved: 'Carts you put on hold to finish later.',
  giftcards: 'Check a gift card balance or sell one.',
  reports: 'How much you have sold, by day or month.',
  drawer: 'Open and close the cash drawer and see what is in it.',
  staff: 'Who can use the till, their PINs and passes.',
  settings: 'Payments, receipts and everything else.',
  deviceMode: 'What this device is: a register at the counter, or a companion beside it.',
  diagnostics: 'Check the card reader and fix problems.',
  help: 'How every part of the till works, in as much detail as you like.',
  training: 'Short courses that show you each job at the till, with practice data.',
  lock: 'Lock the till so nobody else can use it. Your cart stays as it is.',
};

export const MODE_LABEL: Record<UiMode, string> = { standard: 'Standard', simple: 'Simple', minimal: 'Minimal', custom: 'Custom' };
export const MODE_BLURB: Record<UiMode, string> = {
  standard: 'The full app as it is today.',
  simple: 'Everything is still there, with a plain-English line under each menu entry.',
  minimal: 'Only the everyday menus and a guided checkout that asks one question at a time (items, discount, check, pay). Adding a customer stays optional in More options.',
  custom: 'Choose text size, explanations, every tab and More entry, and the guided checkout steps.',
};
export const TEXT_LABEL: Record<TextSize, string> = { normal: 'Normal', large: 'Large', xlarge: 'Extra large' };
export const TAB_LABEL: Record<TabLevel, string> = { all: 'All five', core: 'No Notifications', basic: 'Checkout, Transactions, More' };
export const MORE_LABEL: Record<MoreLevel, string> = { all: 'Everything their role allows', everyday: 'Everyday only', essential: 'Essentials only' };

/** A new StaffUi after the person picks a mode. Switching to Custom starts from what they were using, so nothing jumps. */
export function withMode(cur: unknown, mode: UiMode): StaffUi {
  const now = readUi(cur);
  if (mode !== 'custom') return { mode };
  const start = now.mode === 'custom' ? readCustom(now.custom) : PRESETS[now.mode];
  return { mode, custom: { ...start } };
}
export function withCustom(cur: unknown, patch: Partial<CustomUi>): StaffUi {
  const now = readUi(cur);
  return { mode: 'custom', custom: { ...readCustom(now.mode === 'custom' ? now.custom : PRESETS[now.mode]), ...patch } };
}
/** Staff list helper: the one place that says whether someone is the only manager or owner. */
export function isSoleAdmin(staff: { id: string; role: Role }[], id: string | undefined): boolean {
  if (!id) return false;
  const admins = staff.filter(m => m.role !== 'cashier');
  return admins.length === 1 && admins[0].id === id;
}
/** The tab to show: a hidden tab (mode changed while signed in, or a notification link) falls back to Checkout. */
export const effectiveTab = (tab: TabId, p: UiProfile): TabId => (p.tabs.includes(tab) ? tab : 'checkout');
