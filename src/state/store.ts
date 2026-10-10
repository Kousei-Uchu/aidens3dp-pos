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
import { defaultReceiptProfile, type ReceiptProfile } from '../lib/receiptDoc';
import { defaultScreensaver, type ScreensaverSettings } from '../lib/screensaver';
import type { Depth } from '../lib/helpDocs';
import { defaultInvPrefs, type InvPrefs } from '../lib/inventoryView';
import { emptyLedger, readLedger, type CashLedger } from '../lib/cashLedger';

export type Settings = {
  shopName: string; locationId?: string; locationName?: string;
  registerId: string; registerName: string;
  cashRounding: boolean; smartChange: boolean; consolidate: boolean; fees: FeeSettings; // smartChange: weighted change choice (B1c), per device like the drawer ledger
  theme: 'light' | 'dark' | 'system'; accent: string; tileSize: 'S' | 'M' | 'L';
  staff: StaffMember[]; requirePin: boolean; passServerUrl: string; giftClaimUrl: string; autoReceipt: 'ask' | 'none';
  receipt: ReceiptProfile; // Settings ▸ Receipts (business details printed on receipts + receipt server URL)
  bundlesJson: string; // BundleConfig JSON text (edited in Settings ▸ Discounts & bundles)
  screensaver: ScreensaverSettings; // Settings ▸ Screensaver & display (per device, not shared between registers)
  inventory: InvPrefs; // Inventory screen filters / sort / grouping (per device)
  helpDepth: Depth; // Help screen: how much detail to show (Basic, Deep or Advanced), remembered
  sharedVersion: number;
};
export const defaultSettings = (): Settings => ({
  shopName: '', registerId: uid().slice(0, 8), registerName: 'Register 1', cashRounding: true, smartChange: false, consolidate: true, fees: DEFAULT_FEES,
  theme: 'light', accent: '#111111', tileSize: 'M', staff: [], requirePin: false, passServerUrl: '', giftClaimUrl: '', autoReceipt: 'ask', receipt: defaultReceiptProfile(), bundlesJson: '', screensaver: defaultScreensaver(), inventory: defaultInvPrefs(), helpDepth: 'basic', sharedVersion: 0,
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
type Pos = { saved: SavedCart[]; outbox: OutboxItem[]; sales: SaleRecord[]; attempts: Attempt[]; notices: Notice[]; rollups: Record<string, Totals>; shift: Shift; cart: Cart; ledger: CashLedger };

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
const emptyPos = (): Pos => ({ saved: [], outbox: [], sales: [], attempts: [], notices: [], rollups: {}, shift: { open: false, floatCents: 0, paidInCents: 0, paidOutCents: 0 }, cart: emptyCart(), ledger: emptyLedger() });

const timers: Record<string, any> = {};
const persist = (key: string, get: () => unknown) => { clearTimeout(timers[key]); timers[key] = setTimeout(() => kvSet(key, get()), 400); };

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
    set({
      settings: { ...defaultSettings(), ...(settings ?? {}), receipt: { ...defaultReceiptProfile(), ...(settings?.receipt ?? {}) }, screensaver: { ...defaultScreensaver(), ...(settings?.screensaver ?? {}) }, inventory: { ...defaultInvPrefs(), ...(settings?.inventory ?? {}) } }, data: { ...emptyData(), ...(data ?? {}) },
      grid: g?.grid ?? defaultGrid(), gridVersion: g?.version ?? 0, pos: { ...emptyPos(), ...(pos ?? {}), ledger: readLedger(pos?.ledger) }, ready: true,
    });
    if (!settings) persist('settings', () => get().settings); // keep the generated registerId
  },
}));

export const currentStaff = () => { const s = useApp.getState(); return s.settings.staff.find(x => x.id === s.staffId); };
