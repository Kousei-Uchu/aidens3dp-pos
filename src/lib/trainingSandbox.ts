// Location: src/lib/trainingSandbox.ts
// Practice data for the Guide and Check stages, and the swap in and out. Pure: no store imports except types.
// Every id starts with "train-" so practice data can never be mistaken for the real thing.
import type { App, Settings } from '../state/store';
import type { Variant, Collection, Customer, ManualPreset, Cart } from './types';
import type { Grid, Tile } from './grid';
import { addVariant, emptyCart } from './cartOps';
import { emptyLedger, type CashLedger } from './cashLedger';
import type { Injection } from './trainingModule';

export const TRAIN_PREFIX = 'train-';
export const isTrainId = (id: string | undefined): boolean => !!id && id.includes(TRAIN_PREFIX);

const v = (id: string, productId: string, product: string, variant: string, cents: number, stock: number, sku: string): Variant => ({
  id: `${TRAIN_PREFIX}v-${id}`, productId: `${TRAIN_PREFIX}p-${productId}`, productTitle: product, variantTitle: variant, sku, priceCents: cents, tracked: true, stock, tags: [], active: true, status: 'ACTIVE',
});
export const FIXTURE_VARIANTS: Variant[] = [
  v('cow-s', 'cow', 'Highland Cow', 'Small', 1200, 20, 'TR-COW-S'), v('cow-l', 'cow', 'Highland Cow', 'Large', 1800, 12, 'TR-COW-L'),
  v('bee', 'bee', 'Bumble Bee', '', 800, 30, 'TR-BEE'), v('dragon', 'dragon', 'Red Dragon', '', 2500, 8, 'TR-DRG'),
  v('egg', 'egg', 'Dragon Egg', '', 600, 25, 'TR-EGG'), v('key', 'key', 'Keyring', '', 500, 40, 'TR-KEY'),
];
export const FIXTURE_COLLECTIONS: Collection[] = [
  { id: `${TRAIN_PREFIX}c-animals`, title: 'Animals', productIds: [`${TRAIN_PREFIX}p-cow`, `${TRAIN_PREFIX}p-bee`] },
  { id: `${TRAIN_PREFIX}c-dragons`, title: 'Dragons', productIds: [`${TRAIN_PREFIX}p-dragon`, `${TRAIN_PREFIX}p-egg`] },
];
export const FIXTURE_CUSTOMERS: Customer[] = [
  { id: `${TRAIN_PREFIX}cu-1`, name: 'Sam Rivera', email: 'sam@example.com', orders: 3, spentCents: 6400 },
  { id: `${TRAIN_PREFIX}cu-2`, name: 'Priya Patel', phone: '0400 000 111', orders: 1, spentCents: 1200 },
  { id: `${TRAIN_PREFIX}cu-3`, name: 'Alex Chen', email: 'alex@example.com', orders: 0, spentCents: 0 },
];
export const FIXTURE_PRESETS: ManualPreset[] = [{ id: `${TRAIN_PREFIX}pre-10`, kind: 'pct', value: 10, label: 'Practice 10% off' }];
const HOME_TILES: Tile[] = [
  { type: 'item', productId: `${TRAIN_PREFIX}p-cow` }, { type: 'item', variantId: `${TRAIN_PREFIX}v-bee` }, { type: 'item', variantId: `${TRAIN_PREFIX}v-dragon` },
  { type: 'item', variantId: `${TRAIN_PREFIX}v-egg` }, { type: 'item', variantId: `${TRAIN_PREFIX}v-key` },
  { type: 'action', action: 'custom_amount' }, { type: 'action', action: 'clear_cart' },
];
export const fixtureGrid = (): Grid => ({ version: 1, pages: [{ id: `${TRAIN_PREFIX}page-home`, name: 'Home', tiles: HOME_TILES }] });
/** A normal drawer with plenty of change. Check 2 can replace it with an injection. */
export const FIXTURE_DRAWER: Record<string, number> = { '5000': 2, '2000': 5, '1000': 5, '500': 6, '200': 10, '100': 10, '50': 10, '20': 10, '10': 10, '5': 10 };
export const fixtureLedger = (): CashLedger => ({ ...emptyLedger(), counts: { ...FIXTURE_DRAWER } });

/** Settings for the sandbox: the real staff list and display mode stay (so roles and text size apply); everything that points outside the till is blanked. */
export function sandboxSettings(real: Settings): Settings {
  return { ...real, receipt: { ...real.receipt, serverUrl: '' }, passServerUrl: '', giftClaimUrl: '', bundlesJson: '', adjustPerms: {}, smartChange: false, cashRounding: true };
}
export type Swap = Pick<App, 'settings' | 'data' | 'grid' | 'gridVersion' | 'pos' | 'sync' | 'zeller' | 'staffId' | 'unlocked'>;
/** The real state to put back afterwards. */
export const takeSnapshot = (s: App): Swap => ({ settings: s.settings, data: s.data, grid: s.grid, gridVersion: s.gridVersion, pos: s.pos, sync: s.sync, zeller: s.zeller, staffId: s.staffId, unlocked: s.unlocked });
/** The practice state. The signed in person stays signed in. */
export function buildSandbox(real: Swap): Swap {
  const variants: Record<string, Variant> = Object.fromEntries(FIXTURE_VARIANTS.map(x => [x.id, x]));
  return {
    settings: sandboxSettings(real.settings),
    data: { variants, collections: FIXTURE_COLLECTIONS, customers: FIXTURE_CUSTOMERS, autos: [], presets: FIXTURE_PRESETS },
    grid: fixtureGrid(), gridVersion: 0,
    pos: { saved: [], outbox: [], sales: [], attempts: [], notices: [], rollups: {}, shift: { open: true, openedAt: new Date().toISOString(), floatCents: 10000, paidInCents: 0, paidOutCents: 0 }, cart: emptyCart(), ledger: fixtureLedger() },
    sync: { state: 'idle' }, zeller: { ready: true }, staffId: real.staffId, unlocked: true,
  };
}
/** What each injection does to the practice state: a cart injection replaces the cart, a ledger injection replaces the drawer. Card declines are not state: the session hands them to the fake terminal. Nothing else changes. */
export function applyInjections(sw: Swap, inj: readonly Injection[] | undefined): Swap {
  let cart: Cart | undefined; let ledger: CashLedger | undefined;
  for (const i of inj ?? []) {
    if (i.kind === 'cart') { cart = cart ?? emptyCart(); for (const it of i.items) { const v = sw.data.variants[it.variantId]; if (v) cart = addVariant(cart, v, it.qty, true); } }
    else if (i.kind === 'ledger') ledger = { ...emptyLedger(), counts: { ...i.counts } };
  }
  return cart || ledger ? { ...sw, pos: { ...sw.pos, ...(cart ? { cart } : {}), ...(ledger ? { ledger } : {}) } } : sw;
}
/** Why training cannot start right now, or null. A real card payment or part-paid sale must be finished first. */
export function trainingBlocker(s: { pos: { cart: Cart; attempts: { status: string }[] } }): string | null {
  if (s.pos.attempts.some(a => a.status === 'started' || a.status === 'unknown')) return 'A card payment is still waiting on the reader. Finish or cancel it first, then start training.';
  if ((s.pos.cart.tenders?.length ?? 0) > 0) return 'There is a part-paid sale in the cart. Finish or cancel it first, then start training.';
  return null;
}
export const declinesOf = (inj: readonly Injection[] | undefined): number => (inj ?? []).reduce((n, i) => n + (i.kind === 'decline' ? i.times : 0), 0);
