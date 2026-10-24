// Location: src/lib/appMode.ts
// Device mode (Companion plan, patch 0176): a device is a Register or a Companion, and a Companion can have some
// register features switched off. Pure rules, no React, so the tests can pin the gate without a device.
//
// This is a second narrowing layer, next to the display modes in uiMode.ts, and it follows the same rule: neither
// layer can widen the other. A Companion hides a group of features; a person's display mode can narrow what is left,
// never bring a hidden group back. Roles still decide what a person may do: a Companion never grants anything.
import type { MoreRowId, TabId } from './uiMode';

export type DeviceMode = 'register' | 'companion';
export const DEVICE_MODES: DeviceMode[] = ['register', 'companion'];

/** One switch on the Companion features screen. The six groups match dev_docs/COMPANION_PLAN.md. */
export type FeatureId = 'selling' | 'cardReader' | 'cashDrawer' | 'staffTools' | 'tillDisplay' | 'tillTraining';
export const FEATURE_IDS: FeatureId[] = ['selling', 'cardReader', 'cashDrawer', 'staffTools', 'tillDisplay', 'tillTraining'];

/** Which groups this device has on. Only read in Companion mode: a Register has all six, whatever is stored. */
export type RegisterFeatures = Record<FeatureId, boolean>;

export type FeatureGroup = { id: FeatureId; title: string; summary: string; items: string[] };

/** The six groups, in the order the Companion features screen shows them. */
export const FEATURE_GROUPS: FeatureGroup[] = [
  { id: 'selling', title: 'Selling', summary: 'The checkout, cart and payments.', items: ['Quick sale and the full till', 'Cart, split payments and guided checkout', 'Scanner to cart, cart warnings, price adjustments and custom amounts', 'Selling gift cards and bundle checks'] },
  { id: 'cardReader', title: 'Card reader', summary: 'The Zeller reader and terminal practice.', items: ['Zeller as the card provider', 'Pairing a reader', 'Reader tools in Support & diagnostics', 'Reader notices and terminal practice'] },
  { id: 'cashDrawer', title: 'Cash drawer', summary: 'The drawer, its ledger and the change tools.', items: ['The Cash drawer page and its ledger', 'Swap cash and the float report', 'Check Change and smart change', 'The tender machine slot'] },
  { id: 'staffTools', title: 'Till staff tools', summary: 'The things a person does at the till for themselves.', items: ['Lock register', 'Staff pass scanning and switching staff', 'Cashier passes'] },
  { id: 'tillDisplay', title: 'Till display', summary: 'How the till screen behaves all day.', items: ['Screensaver and keep awake', 'Item spotlight', 'The grid editor'] },
  { id: 'tillTraining', title: 'Till training', summary: 'The register courses.', items: ['Register courses in Training'] },
];

/** A Companion starts with every group off (dev_docs/COMPANION_PLAN.md), then whoever sets it up turns on what it needs. */
export const DEFAULT_FEATURES: RegisterFeatures = { selling: false, cardReader: false, cashDrawer: false, staffTools: false, tillDisplay: false, tillTraining: false };
export const ALL_FEATURES: RegisterFeatures = { selling: true, cardReader: true, cashDrawer: true, staffTools: true, tillDisplay: true, tillTraining: true };

/** A stored mode, or Register for anything else. An older app version, a hand-edited setting or a broken value must never invent a mode. */
export function readMode(raw: unknown): DeviceMode {
  return raw === 'companion' ? 'companion' : 'register';
}

/** Stored switches, with anything missing or not a boolean falling back to off. */
export function readFeatures(raw: unknown): RegisterFeatures {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_FEATURES };
  for (const id of FEATURE_IDS) if (typeof r[id] === 'boolean') out[id] = r[id] as boolean;
  return out;
}

/** The groups this device actually has: a Register has all six, a Companion the switches it was given. */
export function resolveFeatures(mode: unknown, features: unknown): RegisterFeatures {
  return readMode(mode) === 'companion' ? readFeatures(features) : { ...ALL_FEATURES };
}

export const featureOn = (mode: unknown, features: unknown, id: FeatureId): boolean => resolveFeatures(mode, features)[id];

/** Tabs only a companion has: Today (a glance at the shop) and Scan (price and stock check). A register never shows them. */
export type CompanionTab = 'today' | 'scan';
export type AnyTab = TabId | CompanionTab;
export const COMPANION_TABS: CompanionTab[] = ['today', 'scan'];
export const isCompanionTab = (t: string): t is CompanionTab => (COMPANION_TABS as string[]).includes(t);

/** Tabs a Companion always keeps: browsing the catalogue, the till's records, notices and More. */
const ALWAYS_TABS: TabId[] = ['inventory', 'transactions', 'notifications', 'more'];
const TAB_FEATURE: Partial<Record<TabId, FeatureId>> = { checkout: 'selling' };

/** Whether the device shows a tab. The display mode still narrows this further; it never widens it. */
export function tabAllowed(mode: unknown, features: unknown, tab: AnyTab): boolean {
  if (isCompanionTab(tab)) return readMode(mode) === 'companion';
  if (ALWAYS_TABS.includes(tab)) return true;
  const need = TAB_FEATURE[tab];
  return !need || featureOn(mode, features, need);
}

/** The tab bar of a companion, left to right. Notifications is not a tab there: a bell on Today opens it, so the bar stays at five (six with Selling on). */
export const COMPANION_TAB_ORDER: AnyTab[] = ['today', 'scan', 'checkout', 'inventory', 'transactions', 'more'];
/** The tabs this device shows, in order, before the display mode narrows them. A register has the five it has always had. */
export function deviceTabs(mode: unknown, features: unknown, registerOrder: TabId[]): AnyTab[] {
  return readMode(mode) === 'companion' ? COMPANION_TAB_ORDER.filter(t => tabAllowed(mode, features, t)) : registerOrder.filter(t => !isCompanionTab(t)); // a register never shows Today or Scan
}
/**
 * Selling on a companion (0180). With Selling on, the Checkout tab opens a quick sale that expands into the full POS. With Selling
 * off there is no Checkout tab, but the phone can still build a cart and send it to a register. A register has neither: it always
 * has the full checkout.
 */
export type SalesPane = 'full' | 'quick';
export const salesPane = (mode: unknown, expanded: boolean): SalesPane => (readMode(mode) === 'companion' && !expanded ? 'quick' : 'full');
export const canHandOff = (mode: unknown, features: unknown): boolean => readMode(mode) === 'companion' && !featureOn(mode, features, 'selling');

/**
 * Which ways of paying Pay offers. Card needs the Card reader group. Cash and gift cards are always there. With the Cash drawer group
 * off, a cash sale is still allowed but is not posted to the drawer ledger: it is flagged so it can be added to the next drawer count.
 */
export type PayMethods = { card: boolean; cash: boolean; gift: boolean; cashInDrawer: boolean };
export const payMethods = (mode: unknown, features: unknown): PayMethods => ({ card: featureOn(mode, features, 'cardReader'), cash: true, gift: true, cashInDrawer: featureOn(mode, features, 'cashDrawer') });

/**
 * Which practice courses the Training hub lists (0181). A register lists them all. A companion lists a course when it holds the
 * **Till training** group, or when the course never needs anything the device does not hold: it does not start at the Checkout tab
 * and every page it visits is one the device has. The practice itself always runs with every feature on (the sandbox sees to that).
 */
export const moduleAvailable = (mode: unknown, features: unknown, m: { tabs: readonly string[]; routes: readonly string[] }): boolean =>
  readMode(mode) !== 'companion' || featureOn(mode, features, 'tillTraining') || (m.tabs.every(t => t !== 'checkout' && (!isKnownTab(t) || tabAllowed(mode, features, t as AnyTab))) && m.routes.every(r => routeAllowed(mode, features, r)));
const isKnownTab = (t: string): boolean => ['checkout', 'inventory', 'transactions', 'notifications', 'more', 'today', 'scan'].includes(t);

/** Where the app opens, and where a hidden tab sends you. */
export const homeTab = (mode: unknown): AnyTab => (readMode(mode) === 'companion' ? 'today' : 'checkout');

/** Pages a Companion always keeps open: help, settings and Staff for managers (their own role checks), diagnostics, history. Staff stays open because the lock needs an owner PIN, and a PIN can only be made or reset there. */
const ROUTE_FEATURE: Partial<Record<string, FeatureId>> = {
  cart: 'selling', pay: 'selling', saved: 'selling',
  drawer: 'cashDrawer',
  terminalPlay: 'cardReader',
  training: 'tillTraining', trainingRun: 'tillTraining',
};

/** Whether a device may open a page. Pages not listed are always allowed (Help, Settings, Orders, Items, Cloud sync, Export). */
export function routeAllowed(mode: unknown, features: unknown, route: string): boolean {
  const need = ROUTE_FEATURE[route];
  return !need || featureOn(mode, features, need);
}

const ROW_FEATURE: Partial<Record<MoreRowId, FeatureId>> = { drawer: 'cashDrawer', training: 'tillTraining' };

/** Whether a device shows a More row. The row is still subject to the display mode and the person's role. */
export function rowAllowed(mode: unknown, features: unknown, row: MoreRowId): boolean {
  const need = ROW_FEATURE[row];
  return !need || featureOn(mode, features, need);
}

/**
 * Is the app locked behind a PIN? A Register follows the shared Require PIN setting. A Companion always locks (when anyone has a PIN),
 * and it never touches that shared setting, so setting up a phone cannot switch the lock on for the shop's tills.
 */
export const lockRequired = (s: { requirePin: boolean; appMode?: unknown }): boolean => s.requirePin || readMode(s.appMode) === 'companion';

/**
 * Background work and hardware by feature (0179). A companion does not run what it does not hold: the card reader stays idle, the
 * cash drawer is neither pushed nor pulled, and the screensaver and keep awake stay off. The two jobs that hold the device's own
 * data (the sale upload queue and saved carts) also run while there is something left to send, so switching Selling off never strands
 * a queued sale or a saved cart. Pure, so the tests can pin it.
 */
export type JobCounts = { queuedSales: number; savedCarts: number };
export type Jobs = { reader: boolean; outbox: boolean; savedCarts: boolean; drawer: boolean; display: boolean };
export function backgroundJobs(mode: unknown, features: unknown, counts: JobCounts): Jobs {
  const on = (id: FeatureId) => featureOn(mode, features, id);
  return { reader: on('cardReader'), outbox: on('selling') || counts.queuedSales > 0, savedCarts: on('selling') || counts.savedCarts > 0, drawer: on('cashDrawer'), display: on('tillDisplay') };
}

/** Which feature a notice kind belongs to. Kinds not listed (sync, queue, stock, refund, info) always show. */
const NOTICE_FEATURE: Partial<Record<string, FeatureId>> = { reader: 'cardReader', pass: 'staffTools' };
export const noticeAllowed = (mode: unknown, features: unknown, kind: string): boolean => { const need = NOTICE_FEATURE[kind]; return !need || featureOn(mode, features, need); };
/** Notices for a feature the device does not hold are neither raised nor shown, old ones included. */
export const visibleNotices = <T extends { kind: string }>(list: T[], mode: unknown, features: unknown): T[] => list.filter(n => noticeAllowed(mode, features, n.kind));

/** The mode the device is in, and the switches it has, in the shape the screens and Settings want. */
export type DeviceModeState = { mode: DeviceMode; features: RegisterFeatures };
export const readDeviceMode = (settings: { appMode?: unknown; registerFeatures?: unknown } = {}): DeviceModeState => ({ mode: readMode(settings.appMode), features: readFeatures(settings.registerFeatures) });
