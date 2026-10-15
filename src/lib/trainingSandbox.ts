// Location: src/lib/trainingSandbox.ts
// Practice data for the Guide and Check stages, and the swap in and out. Pure: no store imports except types.
// Every id starts with "train-" so practice data can never be mistaken for the real thing.
import type { App, Settings } from '../state/store';
import type { Variant, Collection, Customer, ManualPreset, Cart, AutoDiscount } from './types';
import type { Grid, Tile } from './grid';
import { addVariant, emptyCart, setItemPrice, setLineAdjust } from './cartOps';
import { emptyLedger, type CashLedger } from './cashLedger';
import { defaultInvPrefs } from './inventoryView';
import { hashPinSync } from './pin';
import { hashBadge } from './badge';
import { PRACTICE_PASS_CODE } from './trainingPass';
import type { StaffMember } from './types';
import type { Injection } from './trainingModule';

export const TRAIN_PREFIX = 'train-';
export const isTrainId = (id: string | undefined): boolean => !!id && id.includes(TRAIN_PREFIX);

const v = (id: string, productId: string, product: string, variant: string, cents: number, stock: number, sku: string): Variant => ({
  id: `${TRAIN_PREFIX}v-${id}`, productId: `${TRAIN_PREFIX}p-${productId}`, productTitle: product, variantTitle: variant, sku, priceCents: cents, tracked: true, stock, tags: [], active: true, status: 'ACTIVE', inventoryItemId: `${TRAIN_PREFIX}inv-${id}`,
});
export const FIXTURE_VARIANTS: Variant[] = [
  v('cow-s', 'cow', 'Highland Cow', 'Small', 1200, 20, 'TR-COW-S'), v('cow-l', 'cow', 'Highland Cow', 'Large', 1800, 12, 'TR-COW-L'),
  v('bee', 'bee', 'Bumble Bee', '', 800, 30, 'TR-BEE'), v('dragon', 'dragon', 'Red Dragon', '', 2500, 8, 'TR-DRG'),
  v('egg', 'egg', 'Dragon Egg', '', 600, 25, 'TR-EGG'), v('key', 'key', 'Keyring', '', 500, 40, 'TR-KEY'),
  v('sticker', 'sticker', 'Sticker Pack', '', 300, 50, 'TR-STK'),
  { ...v('print', 'print', 'Clearance Print', '', 1500, 6, 'TR-PRT'), tags: ['no-discount'] }, // can never be discounted
  v('tad', 'tad', 'Tadling', '', 400, 60, 'TR-TAD'),
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
export const FIXTURE_PRESETS: ManualPreset[] = [{ id: `${TRAIN_PREFIX}pre-10`, kind: 'pct', value: 10, label: 'Practice 10% off' }, { id: `${TRAIN_PREFIX}pre-5`, kind: 'amt', value: 500, label: 'Practice $5 off' }];
/** An automatic deal for the Discounts course: 20% off Keyrings, but only from three in the cart. */
export const FIXTURE_AUTOS: AutoDiscount[] = [
  { id: `${TRAIN_PREFIX}auto-keys`, title: 'Practice: 3 Keyrings, 20% off', kind: 'basic', pct: 20, target: { variantIds: [`${TRAIN_PREFIX}v-key`] }, minQty: 3 },
  // The "How deals show up" course (the worked example in the help): 2 cows $2 off, 3 Tadlings $5 off, 5 Tadlings $10 off. Eight Tadlings take the 5 deal and then the 3 deal.
  { id: `${TRAIN_PREFIX}auto-cows`, title: '2 Highland cows', kind: 'basic', amtCents: 200, target: { productIds: [`${TRAIN_PREFIX}p-cow`] }, minQty: 2 },
  { id: `${TRAIN_PREFIX}auto-tad3`, title: '3 Tadlings', kind: 'basic', amtCents: 500, target: { variantIds: [`${TRAIN_PREFIX}v-tad`] }, minQty: 3 },
  { id: `${TRAIN_PREFIX}auto-tad5`, title: '5 Tadlings', kind: 'basic', amtCents: 1000, target: { variantIds: [`${TRAIN_PREFIX}v-tad`] }, minQty: 5 },
];
/** A bundle for the same course: one Highland cow with one Tadling takes $3 off. Small cow with a Tadling is the recommended pair. */
export const PRACTICE_BUNDLES = JSON.stringify({ version: 1, items: { cows: [`${TRAIN_PREFIX}p-cow`], tads: [`${TRAIN_PREFIX}v-tad`] }, discounts: [{ id: `${TRAIN_PREFIX}bun-pair`, label: 'Cow and Tadling pair', sets: ['cows', 'tads'], price_delta_cents: -300, recommended: [[`${TRAIN_PREFIX}v-cow-s`, `${TRAIN_PREFIX}v-tad`]] }] });
const HOME_TILES: Tile[] = [
  { type: 'item', productId: `${TRAIN_PREFIX}p-cow` }, { type: 'item', variantId: `${TRAIN_PREFIX}v-bee` }, { type: 'item', variantId: `${TRAIN_PREFIX}v-dragon` },
  { type: 'item', variantId: `${TRAIN_PREFIX}v-egg` }, { type: 'item', variantId: `${TRAIN_PREFIX}v-key` }, { type: 'item', variantId: `${TRAIN_PREFIX}v-tad` },
  { type: 'action', action: 'custom_amount' }, { type: 'action', action: 'clear_cart' },
  { type: 'action', action: 'switch_staff' }, { type: 'action', action: 'lock_pos' },
  { type: 'category', collectionId: `${TRAIN_PREFIX}c-animals` }, { type: 'category', collectionId: `${TRAIN_PREFIX}c-dragons` },
];
/** A second page, so changing page can be practised. */
const EXTRA_TILES: Tile[] = [{ type: 'item', variantId: `${TRAIN_PREFIX}v-sticker` }, { type: 'item', variantId: `${TRAIN_PREFIX}v-key` }];
export const PRACTICE_PAGE_HOME = `${TRAIN_PREFIX}page-home`; export const PRACTICE_PAGE_EXTRAS = `${TRAIN_PREFIX}page-extras`;
export const fixtureGrid = (): Grid => ({ version: 1, pages: [{ id: PRACTICE_PAGE_HOME, name: 'Home', tiles: HOME_TILES }, { id: PRACTICE_PAGE_EXTRAS, name: 'Extras', tiles: EXTRA_TILES }] });
/** A normal drawer with plenty of change. Check 2 can replace it with an injection. */
export const FIXTURE_DRAWER: Record<string, number> = { '5000': 2, '2000': 5, '1000': 5, '500': 6, '200': 10, '100': 10, '50': 10, '20': 10, '10': 10, '5': 10 };
export const fixtureLedger = (): CashLedger => ({ ...emptyLedger(), counts: { ...FIXTURE_DRAWER } });

/** The two practice staff for courses with `practiceStaff`. Known PINs (1234 and 2468) and, for Morgan, the practice cashier pass. Never saved: they live only in the sandbox. */
export const PRACTICE_CASEY = `${TRAIN_PREFIX}staff-casey`; export const PRACTICE_MORGAN = `${TRAIN_PREFIX}staff-morgan`;
export const PRACTICE_PINS = { casey: '1234', morgan: '2468' } as const;
export function practiceStaff(): StaffMember[] {
  const casey = { id: PRACTICE_CASEY, name: 'Casey', role: 'cashier' as const, salt: 'train-casey' };
  const morgan = { id: PRACTICE_MORGAN, name: 'Morgan', role: 'manager' as const, salt: 'train-morgan', badgeSalt: 'train-badge' };
  return [
    { ...casey, pinHash: hashPinSync(casey.salt, PRACTICE_PINS.casey) },
    { ...morgan, pinHash: hashPinSync(morgan.salt, PRACTICE_PINS.morgan), badgeHash: hashBadge(morgan.badgeSalt, PRACTICE_PASS_CODE) },
  ];
}
/** Settings for the sandbox: the real staff list and display mode stay (so roles and text size apply); everything that points outside the till is blanked. */
/** A made-up receipt server address. It makes the Receipt window offer its QR code, Email link and Text link as on a real till. Nothing is ever sent to it: uploads are switched off in training, so the QR page says "Not published yet". */
export const PRACTICE_RECEIPT_URL = 'https://receipts.practice.invalid';
export function sandboxSettings(real: Settings): Settings {
  return { ...real, receipt: { ...real.receipt, serverUrl: PRACTICE_RECEIPT_URL }, passServerUrl: '', giftClaimUrl: '', locationId: `${TRAIN_PREFIX}loc`, locationName: 'Practice location', inventory: defaultInvPrefs(), bundlesJson: PRACTICE_BUNDLES, adjustPerms: {}, smartChange: false, cashRounding: true };
}
export type Swap = Pick<App, 'settings' | 'data' | 'grid' | 'gridVersion' | 'pos' | 'sync' | 'zeller' | 'staffId' | 'unlocked'>;
/** The real state to put back afterwards. */
export const takeSnapshot = (s: App): Swap => ({ settings: s.settings, data: s.data, grid: s.grid, gridVersion: s.gridVersion, pos: s.pos, sync: s.sync, zeller: s.zeller, staffId: s.staffId, unlocked: s.unlocked });
/** The practice state. The signed in person stays signed in. */
export function buildSandbox(real: Swap, opts: { practiceStaff?: boolean; stock?: Record<string, number | null> } = {}): Swap {
  const variants: Record<string, Variant> = Object.fromEntries(FIXTURE_VARIANTS.map(x => [x.id, opts.stock && x.id in opts.stock ? { ...x, stock: opts.stock[x.id] } : x]));
  return {
    settings: opts.practiceStaff ? { ...sandboxSettings(real.settings), staff: practiceStaff(), requirePin: true } : sandboxSettings(real.settings),
    data: { variants, collections: FIXTURE_COLLECTIONS, customers: FIXTURE_CUSTOMERS, autos: FIXTURE_AUTOS, presets: FIXTURE_PRESETS },
    grid: fixtureGrid(), gridVersion: 0,
    pos: { saved: [], outbox: [], sales: [], attempts: [], notices: [], rollups: {}, shift: { open: true, openedAt: new Date().toISOString(), floatCents: 10000, paidInCents: 0, paidOutCents: 0 }, cart: emptyCart(), ledger: fixtureLedger() },
    sync: { state: 'idle' }, zeller: { ready: true }, staffId: opts.practiceStaff ? PRACTICE_CASEY : real.staffId, unlocked: true,
  };
}
/** What each injection does to the practice state: a cart injection replaces the cart, a ledger injection replaces the drawer. Card declines are not state: the session hands them to the fake terminal. Nothing else changes. */
export function applyInjections(sw: Swap, inj: readonly Injection[] | undefined): Swap {
  let stock: Record<string, number | null> | undefined; let cart: Cart | undefined; let ledger: CashLedger | undefined; let who: 'casey' | 'morgan' | 'locked' | undefined;
  for (const i of inj ?? []) {
    if (i.kind === 'staff') who = i.who;
    if (i.kind === 'stock') stock = { ...stock, ...i.counts };
    if (i.kind === 'cart') { cart = cart ?? emptyCart(); if (i.discountPct) cart = { ...cart, discount: { kind: 'pct', value: i.discountPct, label: `${i.discountPct}% off` } }; for (const it of i.items) { const v = sw.data.variants[it.variantId]; if (v) { cart = addVariant(cart, v, it.qty, true); const ln = cart.lines.find(l => l.variantId === v.id); if (ln && it.priceCents !== undefined) cart = setItemPrice(cart, ln.id, it.priceCents, { scope: 'qty', qty: ln.qty }); if (ln && it.adjust) cart = setLineAdjust(cart, ln.id, { finalCents: it.adjust.finalCents, seenQty: it.adjust.seenQty, seenGrossCents: v.priceCents * it.adjust.seenQty, seenDiscountCents: 0 }); } } const cu = i.customer ? FIXTURE_CUSTOMERS.find(c => c.id === i.customer) : undefined; if (cu) cart = { ...cart, customer: { id: cu.id, name: cu.name, email: cu.email, phone: cu.phone } }; }
    else if (i.kind === 'ledger') ledger = { ...emptyLedger(), counts: { ...i.counts } };
  }
  if (stock) { const st = stock; sw = { ...sw, data: { ...sw.data, variants: Object.fromEntries(Object.entries(sw.data.variants).map(([id, v]) => [id, id in st ? { ...v, stock: st[id] } : v])) } }; }
  let out: Swap = cart || ledger ? { ...sw, pos: { ...sw.pos, ...(cart ? { cart } : {}), ...(ledger ? { ledger } : {}) } } : sw;
  // A staff injection only applies to practice staff, so a course without them can never lock the real till by mistake.
  if (who === 'locked' && out.settings.staff.length) out = { ...out, staffId: undefined, unlocked: false };
  else if (who && who !== 'locked' && out.settings.staff.some(m => m.id === (who === 'casey' ? PRACTICE_CASEY : PRACTICE_MORGAN))) out = { ...out, staffId: who === 'casey' ? PRACTICE_CASEY : PRACTICE_MORGAN, unlocked: true };
  return out;
}
/** A card attempt counts as "still waiting on the reader" for this long after it starts (the same window the screensaver and staff lock use). */
export const WAITING_WINDOW_MS = 5 * 60_000;
type BlockAttempt = { status: string; ts: string; saleUuid?: string };
/**
 * Why training cannot start right now, or null. A card payment that is genuinely in flight, or a part-paid sale, must be finished first.
 * An attempt left at "started" by a closed app, or an old "unknown" for a sale that is no longer in the cart, is history and does not block:
 * nothing can be finished for it from here, so blocking on it would lock training for good.
 */
export function trainingBlocker(s: { pos: { cart: Cart; attempts: BlockAttempt[] } }, nowMs = Date.now()): string | null {
  const live = s.pos.attempts.some(a => a.status === 'started' && nowMs - Date.parse(a.ts) < WAITING_WINDOW_MS);
  if (live) return 'A card payment is still waiting on the reader. Finish or cancel it first (or wait a few minutes), then start training.';
  const sale = s.pos.cart.saleUuid;
  if (sale && s.pos.attempts.some(a => a.status === 'unknown' && a.saleUuid === sale)) return 'A card payment on the sale in the cart has no result yet. Open Payment and settle it first, then start training.';
  if ((s.pos.cart.tenders?.length ?? 0) > 0) return 'There is a part-paid sale in the cart. Finish or cancel it first, then start training.';
  return null;
}
export const declinesOf = (inj: readonly Injection[] | undefined): number => (inj ?? []).reduce((n, i) => n + (i.kind === 'decline' ? i.times : 0), 0);

/** The response code the practice terminal declines with: the first decline injection's code, or 51 (insufficient funds). */
export const declineCodeOf = (inj: readonly Injection[] | undefined): string => (inj ?? []).reduce<string | undefined>((c, i) => c ?? (i.kind === 'decline' ? i.code : undefined), undefined) ?? '51';
