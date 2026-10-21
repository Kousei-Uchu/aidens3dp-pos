// Location: src/lib/demoCatalog.ts
// The Demo mode (F8) home screen's catalogue: every feature, in the areas the app is used in.
// A feature that has a Training Show plays that animation (same style); one that does not is simply opened live in the
// demo till, which runs on a copy of the till's data, so nothing is real either way. Pure data, so the home screen and its tests agree on what is there.
import { MODULES, getModule } from '../training';
import type { Demo } from './trainingModule';

export type DemoArea = 'Selling' | 'Taking payment' | 'Customers and carts' | 'Products and stock' | 'Money and reporting' | 'Setup and help';
/** In the order the home screen draws them. */
export const DEMO_AREAS: readonly DemoArea[] = ['Selling', 'Taking payment', 'Customers and carts', 'Products and stock', 'Money and reporting', 'Setup and help'];

export type DemoEntry = {
  id: string;                 // unique; for a module entry it is the module id
  area: DemoArea;
  title: string;
  summary: string;
  icon: string;               // an Ionicons name; kept a string so this file stays pure
  /** The training module whose Show is played, when this feature has one. */
  module?: string;
  /** Where "try it" goes: a bottom tab, a pushed route, or both. */
  tab?: string;
  route?: string;
};

/** Which area each training module's feature belongs to. Every module must appear once. */
const AREA: Record<string, DemoArea> = {
  'welcome': 'Setup and help', 'sign-in': 'Setup and help', 'offline': 'Setup and help',
  'cart': 'Selling', 'find-items': 'Selling', 'discounts': 'Selling', 'price-adjust': 'Selling', 'bundles-deals': 'Selling', 'adjust-review': 'Selling',
  'pay-card': 'Taking payment', 'pay-cash': 'Taking payment', 'split-pay': 'Taking payment', 'gift-sell': 'Taking payment', 'gift-pay': 'Taking payment', 'receipts': 'Taking payment', 'reader-trouble': 'Taking payment',
  'saved-carts': 'Customers and carts', 'customer': 'Customers and carts', 'customers-list': 'Customers and carts',
  'scanning': 'Products and stock', 'inventory': 'Products and stock', 'stock-lookup': 'Products and stock', 'items': 'Products and stock',
  'refund': 'Money and reporting', 'orders': 'Money and reporting', 'drawer-day': 'Money and reporting', 'check-change': 'Money and reporting', 'swap-cash': 'Money and reporting',
};
/** The icon each feature carries on the home screen. */
const ICON: Record<string, string> = {
  'welcome': 'sparkles-outline', 'sign-in': 'lock-closed-outline', 'offline': 'cloud-offline-outline',
  'cart': 'cart-outline', 'find-items': 'search-outline', 'discounts': 'pricetag-outline', 'price-adjust': 'create-outline', 'bundles-deals': 'layers-outline', 'adjust-review': 'options-outline',
  'pay-card': 'card-outline', 'pay-cash': 'cash-outline', 'split-pay': 'git-branch-outline', 'gift-sell': 'gift-outline', 'gift-pay': 'gift-outline', 'receipts': 'receipt-outline', 'reader-trouble': 'hardware-chip-outline',
  'saved-carts': 'bookmark-outline', 'customer': 'person-add-outline', 'customers-list': 'people-outline',
  'scanning': 'barcode-outline', 'inventory': 'cube-outline', 'stock-lookup': 'search-circle-outline', 'items': 'pricetags-outline',
  'refund': 'return-down-back-outline', 'orders': 'list-outline', 'drawer-day': 'wallet-outline', 'check-change': 'calculator-outline', 'swap-cash': 'swap-horizontal-outline',
};

/** Features that have no training Show: they are opened live in the locked demo till. */
const EXTRAS: readonly DemoEntry[] = [
  { id: 'reports', area: 'Money and reporting', title: 'Reports', summary: 'Sales by day or month, with takings, discounts, refunds, card fees, profit and your team.', icon: 'bar-chart-outline', route: 'reports' },
  { id: 'notifications', area: 'Setup and help', title: 'Notifications', summary: 'What the till has to say: uploads, low stock, a reader that needs attention.', icon: 'notifications-outline', tab: 'notifications' },
  { id: 'settings', area: 'Setup and help', title: 'Settings', summary: 'Payments, receipts, the display, discounts and bundles, cart warnings and more.', icon: 'settings-outline', route: 'settings' },
  { id: 'help', area: 'Setup and help', title: 'Help', summary: 'How every part of the till works, in as much detail as you like.', icon: 'help-circle-outline', route: 'help' },
  { id: 'terminal', area: 'Taking payment', title: 'Virtual terminal', summary: 'Play the card terminal on its own: ask for a payment and see every screen it can show.', icon: 'card-outline', route: 'terminalPlay' },
];

/** One entry per feature, in area then catalogue order. Training modules first, then the extras. */
export const DEMO_ENTRIES: readonly DemoEntry[] = [
  ...MODULES.map(m => ({ id: m.id, area: AREA[m.id] ?? 'Setup and help', title: m.title, summary: m.summary, icon: ICON[m.id] ?? 'ellipse-outline', module: m.id, tab: m.tabs[0], route: m.routes[0] })),
  ...EXTRAS,
];
const BY_ID = new Map(DEMO_ENTRIES.map(e => [e.id, e]));
export const getDemoEntry = (id: string): DemoEntry | undefined => BY_ID.get(id);
/** The Show animation for a feature, when it has one. */
export const demoOf = (e: DemoEntry | undefined): Demo | undefined => (e?.module ? getModule(e.module)?.show : undefined);
/** The catalogue grouped into the areas the home screen draws, empty areas left out. */
export function entriesByArea(): { area: DemoArea; entries: DemoEntry[] }[] {
  return DEMO_AREAS.map(area => ({ area, entries: DEMO_ENTRIES.filter(e => e.area === area) })).filter(g => g.entries.length > 0);
}
