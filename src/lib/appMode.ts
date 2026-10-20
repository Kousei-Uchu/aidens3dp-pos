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

/** Tabs a Companion always keeps: browsing the catalogue, the till's records, notices and More. */
const ALWAYS_TABS: TabId[] = ['inventory', 'transactions', 'notifications', 'more'];
const TAB_FEATURE: Partial<Record<TabId, FeatureId>> = { checkout: 'selling' };

/** Whether the device shows a tab. The display mode still narrows this further; it never widens it. */
export function tabAllowed(mode: unknown, features: unknown, tab: TabId): boolean {
  if (ALWAYS_TABS.includes(tab)) return true;
  const need = TAB_FEATURE[tab];
  return !need || featureOn(mode, features, need);
}

/** Pages a Companion always keeps open: help, settings for managers (its own role check), diagnostics, history. */
const ROUTE_FEATURE: Partial<Record<string, FeatureId>> = {
  cart: 'selling', pay: 'selling', saved: 'selling',
  drawer: 'cashDrawer',
  staff: 'staffTools',
  terminalPlay: 'cardReader',
  training: 'tillTraining', trainingRun: 'tillTraining',
};

/** Whether a device may open a page. Pages not listed are always allowed (Help, Settings, Orders, Items, Cloud sync, Export). */
export function routeAllowed(mode: unknown, features: unknown, route: string): boolean {
  const need = ROUTE_FEATURE[route];
  return !need || featureOn(mode, features, need);
}

const ROW_FEATURE: Partial<Record<MoreRowId, FeatureId>> = { drawer: 'cashDrawer', staff: 'staffTools', training: 'tillTraining' };

/** Whether a device shows a More row. The row is still subject to the display mode and the person's role. */
export function rowAllowed(mode: unknown, features: unknown, row: MoreRowId): boolean {
  const need = ROW_FEATURE[row];
  return !need || featureOn(mode, features, need);
}

/** The mode the device is in, and the switches it has, in the shape the screens and Settings want. */
export type DeviceModeState = { mode: DeviceMode; features: RegisterFeatures };
export const readDeviceMode = (settings: { appMode?: unknown; registerFeatures?: unknown }): DeviceModeState => ({ mode: readMode(settings.appMode), features: readFeatures(settings.registerFeatures) });
