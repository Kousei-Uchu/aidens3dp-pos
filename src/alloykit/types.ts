// Location: src/alloykit/types.ts
// 0250: the Alloy format (see dev_docs/ALLOYS.md and ALLOYS_PLAN.md). Types only: nothing here runs.
// An Alloy is the code specific to one service. It lists the Elements it can do; each Element has the fixed API below, written in the
// app's own types. The app calls Elements through the router and never imports an Alloy. These shapes are final for the format
// (`contract: 1`) once the first Alloys (P4) are written against them; until then P4 may still adjust them.
import type { AutoDiscount, Collection, Customer, ManualPreset, SaleRecord, Variant } from '../lib/types';
import type { SharedBackend } from '../lib/syncBackend';
import type { TerminalLike } from '../lib/zeller';

export const ALLOY_CONTRACT = 1;

export type ElementId =
  | 'catalogue' | 'stock' | 'discounts' | 'customers' | 'orders' | 'giftCards' | 'sharedState' | 'cardTerminal' | 'tapToPay';

// ── What the app hands to every Alloy function ─────────────────────────────────────────────
export type Http = {
  json<T = unknown>(url: string, init?: { method?: string; headers?: Record<string, string>; body?: unknown; query?: Record<string, string | undefined> }): Promise<T>;
};
/** Typed local collections. Pure Tillium keeps its data here; the Shared state Alloy syncs it between registers. */
export type LocalStore = {
  get<T>(collection: string, id: string): Promise<T | null>;
  put<T>(collection: string, id: string, value: T): Promise<void>;
  remove(collection: string, id: string): Promise<void>;
  list<T>(collection: string): Promise<T[]>;
};
export type Ctx = {
  http: Http;
  secret(key: string): string;
  setting(key: string): string;
  store: LocalStore;
  idempotencyKey(): string;
  log(message: string): void;
};

export type PageReq = { after?: string | null; limit?: number };
export type Page<T> = { rows: T[]; next: string | null };

// ── The Elements' APIs. An optional function is a feature: the picker reads what an Alloy can do from which functions exist. ──
export type ItemInput = { title: string; priceCents: number; sku?: string; barcode?: string; costCents?: number; stock?: number; tags?: string[] };
export type ItemPatch = { priceCents?: number; sku?: string; barcode?: string; costCents?: number };
export type AdjustReason = 'correction' | 'received' | 'cycle_count_available' | 'damaged' | 'shrinkage' | 'restock' | 'other';
export type StockLevel = { itemId: string; quantity: number };

export type CatalogueApi = {
  listItems(ctx: Ctx, page: PageReq): Promise<Page<Variant>>;
  listCollections(ctx: Ctx, page: PageReq): Promise<Page<Collection>>;
  createItem?(ctx: Ctx, input: ItemInput): Promise<Variant>;
  updateItem?(ctx: Ctx, variantId: string, patch: ItemPatch): Promise<Variant>;
};
export type StockApi = {
  /** Levels changed since the cursor (null = everything). The app keeps the cursor and the refresh timing. */
  changesSince(ctx: Ctx, cursor: string | null): Promise<{ levels: StockLevel[]; cursor: string }>;
  adjust(ctx: Ctx, a: { itemId: string; delta: number; reason: AdjustReason; key: string }): Promise<void>;
  set?(ctx: Ctx, a: { itemId: string; quantity: number; reason: AdjustReason; key: string }): Promise<void>;
};
export type DiscountsApi = {
  listAutomatic(ctx: Ctx): Promise<AutoDiscount[]>;
  listPresets(ctx: Ctx): Promise<ManualPreset[]>;
};
export type CustomerInput = { name: string; email?: string; phone?: string; note?: string };
export type CustomersApi = {
  search(ctx: Ctx, query: string): Promise<Customer[]>;
  create?(ctx: Ctx, c: CustomerInput): Promise<Customer>;
  update?(ctx: Ctx, id: string, c: CustomerInput): Promise<Customer>;
};
/** What an Alloy returns for a sale it has recorded. The app stores it in `sale.refs[alloyId]`. */
export type OrderRef = { id: string; name?: string; url?: string; extra?: Record<string, string> };
export type OrderSummary = { ref: OrderRef; ts: string; totalCents: number; customerName?: string; fulfilled?: boolean };
export type RefundItem = { lineId: string; qty: number };
export type OrdersApi = {
  record(ctx: Ctx, sale: SaleRecord, o: { key: string }): Promise<OrderRef>;
  find?(ctx: Ctx, saleUuid: string): Promise<OrderRef | null>;
  list?(ctx: Ctx, page: PageReq & { query?: string }): Promise<Page<OrderSummary>>;
  fulfil?(ctx: Ctx, ref: OrderRef): Promise<void>;
  refund?(ctx: Ctx, ref: OrderRef, items: RefundItem[], o: { amountCents: number; note: string; key: string }): Promise<void>;
};
export type GiftCard = { id: string; last4: string; balanceCents: number; initialCents: number; enabled: boolean; expiresOn?: string };
export type GiftCardTxn = { at: string; cents: number; kind: 'credit' | 'debit'; note?: string };
export type GiftCardsApi = {
  lookup(ctx: Ctx, code: string): Promise<GiftCard | null>;
  create(ctx: Ctx, a: { valueCents: number; code: string; saleUuid: string; customerId?: string }): Promise<GiftCard>;
  debit(ctx: Ctx, id: string, cents: number, note: string): Promise<void>;
  credit(ctx: Ctx, id: string, cents: number, note: string): Promise<void>;
  history?(ctx: Ctx, id: string): Promise<GiftCardTxn[]>;
};
/** Shared state is the app's existing `SharedBackend` (records by type and handle), so today's two backends already fit it. */
export type SharedStateApi = { backend(ctx: Ctx): SharedBackend };
/** Card payments. The terminal object is the app's existing `TerminalLike`, so training and virtual terminals fit it too. */
export type CardTerminalApi = { terminal(ctx: Ctx): TerminalLike };
export type TapToPayApi = { terminal(ctx: Ctx): TerminalLike };

export type ElementApi = {
  catalogue: CatalogueApi; stock: StockApi; discounts: DiscountsApi; customers: CustomersApi; orders: OrdersApi;
  giftCards: GiftCardsApi; sharedState: SharedStateApi; cardTerminal: CardTerminalApi; tapToPay: TapToPayApi;
};

// ── The Alloy ─────────────────────────────────────────────────────────────────────────────
export type SettingField = {
  key: string; label: string; placeholder?: string; help?: string;
  /** Kept in the Keychain, never in settings or backups' plain fields. */
  secret?: boolean;
  /** Offered as a list the Alloy fills in after `connect` (for example Shopify locations). */
  pickFrom?: string;
};
export type ConnectReport = {
  ok: boolean;
  /** Plain words when not ok: what to fix. */
  problem?: string;
  /** Per Element, the permissions the credentials lack (so the picker can say which Element will not work and why). */
  missing?: Partial<Record<ElementId, string[]>>;
  /** Lists for `pickFrom` fields. */
  lists?: Record<string, { id: string; name: string }[]>;
};
export type ElementImpl<E extends ElementId> = {
  api: ElementApi[E];
  /** Permissions or scopes this Element needs from the service, for the picker and the connect check. */
  needs?: string[];
  /** Plain-words limits, one line each, shown on the picker and in the Smelter's report. */
  limits?: string[];
};
export type Alloy = {
  /** Lowercase, unique, never changes: it is saved in settings and on every sale. */
  id: string;
  name: string;
  blurb: string;
  contract: typeof ALLOY_CONTRACT;
  settings: SettingField[];
  connect(ctx: Ctx): Promise<ConnectReport>;
  elements: { [E in ElementId]?: ElementImpl<E> };
  /** Only for a native SDK that must be mounted (Zeller's reader). */
  host?: () => unknown;
};

// ── The app's choice of Alloy per Element ───────────────────────────────────────────────────
export type Selection = Partial<Record<ElementId, string>>;
export const OFF = 'off';
