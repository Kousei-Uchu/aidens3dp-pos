// Location: src/state/store.ts
// One zustand store; slices persist to AsyncStorage (debounced). No backend: Shopify is the shared state.
import { create } from 'zustand';
import { kvGet, kvSet } from '../lib/kv';
import { uid } from '../lib/ids';
import { DEFAULT_FEES, type FeeSettings } from '../lib/fees';
import { defaultGrid, type Grid } from '../lib/grid';
import { emptyCart } from '../lib/cartOps';
import type { AutoDiscount, BundleConfig, Cart, Collection, Customer, ManualPreset, Notice, SaleRecord, StaffMember, Variant } from '../lib/types';
import type { Totals } from '../lib/rollup';
import { emptySharedHistory, type SharedHistory } from '../lib/salesHistory';
import { defaultReceiptProfile, type ReceiptProfile } from '../lib/receiptDoc';
import { defaultScreensaver, type ScreensaverSettings } from '../lib/screensaver';
import { defaultAssistant, normaliseAssistant, type AssistantSettings } from '../lib/assistantConfig';
import type { Depth } from '../lib/helpDocs';
import { defaultInvPrefs, type InvPrefs } from '../lib/inventoryView';
import { emptyLedger, readLedger, type CashLedger } from '../lib/cashLedger';
import type { AdjustPerms } from '../lib/adjustPerms';
import type { CartWarnings, WarningList } from '../lib/types';
import type { ScannerCalibration } from '../lib/scanSpeed';
import { isTraining } from '../lib/trainingGuard';

export type Settings = {
  shopName: string; locationId?: string; locationName?: string;
  registerId: string; registerName: string;
  cashRounding: boolean; smartChange: boolean; consolidate: boolean; fees: FeeSettings; // smartChange: weighted change choice (B1c), per device like the drawer ledger
  theme: 'brand' | 'light' | 'dark' | 'system'; accent: string; tileSize: 'S' | 'M' | 'L' | number;
  themeSetupVersion: number;
  glassSurfaces: boolean;
  itemSpotlight: { name: boolean; image: boolean };
  staff: StaffMember[]; requirePin: boolean; passServerUrl: string; giftClaimUrl: string; autoReceipt: 'ask' | 'none';
  receipt: ReceiptProfile; // Settings ▸ Receipts (business details printed on receipts + receipt server URL)
  bundlesJson: string; // BundleConfig JSON text (edited in Settings ▸ Discounts & bundles)
  screensaver: ScreensaverSettings; // Settings ▸ Screensaver & display (per device, not shared between registers)
  inventory: InvPrefs; // Inventory screen filters / sort / grouping (per device)
  helpDepth: Depth; // Help screen: how much detail to show (Basic, Deep or Advanced), remembered
  adjustPerms: AdjustPerms; // A16.9: which roles may NOT set which price adjustments (only explicit false is stored; shared to every register)
  sharedVersion: number; sharedSettingsPending: boolean; // retry a shared settings push missed by a disconnected register
  scannerCal?: ScannerCalibration; scannerCalVersion?: number; scannerCalPending?: boolean; // Settings ▸ Hardware ▸ Calibrate: what each scanner speed measures as (shared to every register through a metaobject)
  // 0168: the cash drawer is shared between registers (one physical drawer for the shop). The drawer itself is pos.shift and pos.ledger;
  // these are its sync bookkeeping: `drawerVersion` is the shared record's version we last saw, `drawerPending` an unsent change,
  // `drawerShiftPending` says that change included the shift (open/paid in/out/close), so a push must not be beaten by an older one.
  drawerVersion?: number; drawerPending?: boolean; drawerShiftPending?: boolean;
  cartWarnings?: CartWarnings; // Settings ▸ Cart warnings: prompts on Charge for chosen items or categories (shared to every register)
  // The warning list (a warning set to "Add to the list"): shared between registers, so the list carries the same lines
  // everywhere. `warningListVersion` is the shared record's version we last saw; `warningListPending` an unsent change.
  warningList?: WarningList; warningListVersion?: number; warningListPending?: boolean;
  assistant: AssistantSettings; // Settings ▸ AI assistant: model address and options. Per register: never in pushSharedSettings. The API key is in the Keychain.
};
export const defaultSettings = (): Settings => ({
  shopName: '', registerId: uid().slice(0, 8), registerName: 'Register 1', cashRounding: true, smartChange: false, consolidate: true, fees: DEFAULT_FEES,
  theme: 'brand', themeSetupVersion: 1, accent: '#111111', tileSize: 124, glassSurfaces: false, itemSpotlight: { name: false, image: false }, staff: [], requirePin: false, passServerUrl: '', giftClaimUrl: '', autoReceipt: 'ask', receipt: defaultReceiptProfile(), bundlesJson: '', screensaver: defaultScreensaver(), inventory: defaultInvPrefs(), helpDepth: 'basic', adjustPerms: {}, sharedVersion: 0, sharedSettingsPending: false, cartWarnings: [], assistant: defaultAssistant()
});

export type SavedCart = { id: string; name: string; note?: string; cart: Cart; ts: string; employee?: string; status: 'open' | 'void'; assignedTo?: string; dirty?: boolean; remoteId?: string; version?: number };
export type OutboxItem = {
  id: string; sale: SaleRecord; queuedAt: string;
  done: { receipt?: boolean; receiptFinal?: boolean; order?: boolean; giftCards?: boolean; entry?: boolean; rollup?: boolean; stock?: boolean };
  giftDone?: string[]; // A9: codes of gift card lines already created (and emailed, if they have a recipient)
  tries: number; error?: string; blocked?: boolean; // blocked = Shopify user error, needs a human
};
export type Attempt = { ref: string; saleUuid: string; amountCents: number; ts: string; status: 'started' | 'approved' | 'declined' | 'cancelled' | 'unknown' | 'resolved'; note?: string; resolvedBy?: string };
export type SyncState = { state: 'idle' | 'syncing' | 'error' | 'offline'; at?: string; error?: string };
export type ZellerStatus = { ready: boolean; message?: string };
export type Shift = { open: boolean; openedAt?: string; floatCents: number; paidInCents: number; paidOutCents: number; staff?: string };

type Data = {
  variants: Record<string, Variant>; collections: Collection[]; customers: Customer[]; autos: AutoDiscount[]; presets: ManualPreset[];
  catalogueAt?: string; stockSince?: string;
};
type Pos = { saved: SavedCart[]; outbox: OutboxItem[]; sales: SaleRecord[]; attempts: Attempt[]; notices: Notice[]; rollups: Record<string, Totals>; shift: Shift; cart: Cart; ledger: CashLedger;
  /** Other tills' recent sales and daily totals, pulled from Shopify (see pullSalesHistory). Kept apart from `sales`, which is this
   *  till's own live copy and what the cash tools read: a drawer figure must stay this till's. */
  shared: SharedHistory };

export type App = {
  ready: boolean; settings: Settings; data: Data; grid: Grid; gridVersion: number; pos: Pos;
  sync: SyncState; zeller: ZellerStatus; staffId?: string; unlocked: boolean; toast?: string; saverPreview?: boolean;
  set: (p: Partial<App>) => void;
  patchSettings: (p: Partial<Settings>) => void;
  patchData: (p: Partial<Data>) => void;
  patchPos: (p: Partial<Pos>) => void;
  setCart: (f: Cart | ((c: Cart) => Cart)) => void;
  setGrid: (g: Grid, version?: number) => void;
  notify: (n: Omit<Notice, 'id' | 'ts'>) => void;
  hydrate: () => Promise<void>;
};

const emptyData = (): Data => ({ variants: {}, collections: [], customers: [], autos: [], presets: [] });
const emptyPos = (): Pos => ({ saved: [], outbox: [], sales: [], attempts: [], notices: [], rollups: {}, shift: { open: false, floatCents: 0, paidInCents: 0, paidOutCents: 0 }, cart: emptyCart(), ledger: emptyLedger(), shared: emptySharedHistory() });

const timers: Record<string, any> = {};
const pending: Record<string, () => unknown> = {};
const persist = (key: string, get: () => unknown) => {
  if (isTraining()) return; // practice/demo data is never saved
  clearTimeout(timers[key]); pending[key] = get;
  timers[key] = setTimeout(() => { delete pending[key]; void kvSet(key, get()); }, 400);
};
/** Writes every save that is still waiting for its 400 ms timer. Training calls this before it swaps in practice data. */
export async function flushPersist(): Promise<void> {
  for (const key of Object.keys(pending)) { clearTimeout(timers[key]); const get = pending[key]; delete pending[key]; await kvSet(key, get()); }
}

export const useApp = create<App>((set, get) => ({
  ready: false, settings: defaultSettings(), data: emptyData(), grid: defaultGrid(), gridVersion: 0, pos: emptyPos(),
  sync: { state: 'idle' }, zeller: { ready: false, message: 'Reader not set up' }, unlocked: true,
  set: p => set(p),
  patchSettings: p => { set(s => ({ settings: { ...s.settings, ...p } })); persist('settings', () => get().settings); },
  patchData: p => { set(s => ({ data: { ...s.data, ...p } })); persist('data', () => get().data); },
  patchPos: p => { set(s => ({ pos: { ...s.pos, ...p } })); persist('pos', () => get().pos); },
  setCart: f => { set(s => ({ pos: { ...s.pos, cart: typeof f === 'function' ? f(s.pos.cart) : f } })); persist('pos', () => get().pos); },
  setGrid: (g, version) => { set(s => ({ grid: g, gridVersion: version ?? s.gridVersion })); persist('grid', () => ({ grid: get().grid, version: get().gridVersion })); },
  notify: n => {
    const pos = get().pos;
    // collapse repeats of the same unread notice
    if (pos.notices.some(x => !x.read && x.kind === n.kind && x.title === n.title && x.body === n.body)) return;
    get().patchPos({ notices: [{ ...n, id: uid(), ts: new Date().toISOString() }, ...pos.notices].slice(0, 200) });
  },
  hydrate: async () => {
    const [settings, data, g, pos] = await Promise.all([
      kvGet<Settings | null>('settings', null), kvGet<Data | null>('data', null), kvGet<{ grid: Grid; version: number } | null>('grid', null), kvGet<Pos | null>('pos', null),
    ]);
    const migrateTheme = !!settings && settings.themeSetupVersion !== 1;
    set({
      settings: { ...defaultSettings(), ...(settings ?? {}), ...(migrateTheme ? { theme: 'brand' as const } : {}), themeSetupVersion: 1, itemSpotlight: { ...defaultSettings().itemSpotlight, ...(settings?.itemSpotlight ?? {}) }, receipt: { ...defaultReceiptProfile(), ...(settings?.receipt ?? {}) }, screensaver: { ...defaultScreensaver(), ...(settings?.screensaver ?? {}) }, inventory: { ...defaultInvPrefs(), ...(settings?.inventory ?? {}) }, assistant: normaliseAssistant(settings?.assistant) }, data: { ...emptyData(), ...(data ?? {}) },
      grid: g?.grid ?? defaultGrid(), gridVersion: g?.version ?? 0, pos: { ...emptyPos(), ...(pos ?? {}), ledger: readLedger(pos?.ledger), shared: { ...emptySharedHistory(), ...(pos?.shared ?? {}) } }, ready: true,
    });
    if (!settings || migrateTheme) persist('settings', () => get().settings); // keep the generated registerId and persist the one-time branded-theme migration
  },
}));

export const currentStaff = () => { const s = useApp.getState(); return s.settings.staff.find(x => x.id === s.staffId); };
