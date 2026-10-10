// Location: src/lib/types.ts
// Shared domain types. All money fields are integer cents.

export type Variant = {
  id: string; // gid://shopify/ProductVariant/…
  productId: string;
  productTitle: string;
  variantTitle: string; // '' when the product has a single default variant
  sku?: string;
  barcode?: string;
  priceCents: number;
  compareAtCents?: number;
  costCents?: number; // InventoryItem.unitCost – COGS snapshot source
  inventoryItemId?: string;
  tracked: boolean;
  stock: number | null; // null = not tracked. May be negative (allowed by design).
  image?: string;
  tags: string[];
  active: boolean; // product status ACTIVE
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'; // full product status (older saved catalogues only have `active`)
  updatedAt?: string;
};
export type Collection = { id: string; title: string; image?: string; productIds: string[] };
export type Customer = {
  id: string; name: string; email?: string; phone?: string; orders?: number; spentCents?: number; note?: string;
};
export type CustomerRef = { id: string; name: string; email?: string; phone?: string };

// ── Discounts ────────────────────────────────────────────────────────────────
export type Target = { all?: boolean; productIds?: string[]; variantIds?: string[]; collectionIds?: string[] };
export type AutoDiscount = {
  id: string;
  title: string;
  kind: 'basic' | 'bxgy';
  startsAt?: string;
  endsAt?: string;
  // basic
  pct?: number; // 0-100
  amtCents?: number;
  eachItem?: boolean; // amount applies to each item vs the eligible total
  target?: Target;
  minSubtotalCents?: number;
  minQty?: number;
  // bxgy
  buys?: { target: Target; qty?: number; amountCents?: number };
  gets?: { target: Target; qty: number; pct?: number; amtCents?: number };
  usesPerOrderLimit?: number;
  truncated?: boolean; // target lists were longer than we fetched
};
/** A Shopify discount-code or POS-defined preset the cashier can apply manually. */
export type ManualDiscount = { kind: 'pct' | 'amt'; value: number; label: string }; // pct = percent (12.5), amt = cents
export type ManualPreset = ManualDiscount & { id: string };

// ── Bundles (in-app config; research doc §4.7a) ──────────────────────────────
export type BundleDeal = {
  id: string;
  label: string;
  sets: string[]; // one unit from each listed set (may repeat a set)
  price_delta_cents: number; // negative = discount (delta mode) | final price (fixed_price mode)
  apply_to?: string | null; // set id: delta comes off the unit(s) matched from THAT set
  mode?: 'delta' | 'fixed_price';
  max_per_cart?: number | null;
  stackable?: boolean;
  enabled?: boolean;
  priority?: number;
};
export type BundleConfig = { version: 1; items: Record<string, string[]>; discounts: BundleDeal[] };

// ── Cart ─────────────────────────────────────────────────────────────────────
/** Who a sold gift card should be emailed to (Shopify sends the card + Apple Wallet button). */
export type GiftRecipient = { email: string; name?: string; message?: string };
export type CartLine = {
  id: string;
  kind: 'item' | 'custom' | 'gift_card';
  variantId?: string;
  title: string;
  variantTitle?: string;
  qty: number;
  unitCents: number; // catalogue price when added
  overrideCents?: number; // "price adjustment" for this sale
  note?: string;
  discount?: ManualDiscount; // manual line discount
  giftCardCode?: string; // for gift_card lines
  giftRecipient?: GiftRecipient; // gift_card lines: email delivery via Shopify
  noDiscount?: boolean; // item tagged no-discount / custom
};
export type Cart = {
  id: string;
  lines: CartLine[];
  discount?: ManualDiscount; // cart-level manual discount
  customer?: CustomerRef;
  name?: string;
  note?: string;
  /** Set once a payment starts: approved part-payments persist on the sale (no 5-minute void). */
  saleUuid?: string;
  tenders?: Tender[];
  /** Saved cart this cart was opened from – voided once the sale completes. */
  savedFrom?: string;
};

export type AppliedDiscount = {
  type: 'auto' | 'bundle' | 'manual' | 'cart';
  label: string;
  cents: number;
  id?: string;
  times?: number; // how many times this discount applied on the line (e.g. a 5x deal used twice)
};
export type PricedLine = {
  line: CartLine;
  baseUnitCents: number; // override or catalogue price
  grossCents: number; // baseUnit * qty  ("Items" in reports)
  discounts: AppliedDiscount[];
  discountCents: number;
  netCents: number;
  bundleUnits: number;
};
export type PricedCart = {
  lines: PricedLine[];
  itemsCents: number; // Σ gross
  discountCents: number; // Σ all discounts
  netCents: number; // items − discounts  (= "Net sales" before tax/tips)
  deals: AppliedDiscount[]; // roll-up by label for the cart footer
};

// ── Payments / sales ─────────────────────────────────────────────────────────
export type TenderKind = 'card' | 'cash' | 'gift_card' | 'exchange_credit';
export type CardInfo = {
  transactionUuid?: string; externalReference?: string; approvalCode?: string; scheme?: string; panMasked?: string;
  cardMedia?: string; rrn?: string; receiptLink?: string; responseCode?: string; timestampLocal?: string;
  tipAmount?: number; surchargeAmount?: number;
};
export type Tender = {
  id: string;
  kind: TenderKind;
  amountCents: number; // applied to the bill
  tenderedCents?: number; // cash handed over
  changeCents?: number;
  roundingCents?: number; // cash 5c rounding (cashDue − amount), may be negative
  card?: CardInfo;
  giftCardId?: string;
  giftCardCode?: string;
  feeCents?: number;
  feeRate?: number;
  at: string;
};
export type SaleLine = {
  variantId?: string; title: string; variantTitle?: string; qty: number; baseUnitCents: number; grossCents: number;
  discountCents: number; netCents: number; costCents: number; // cogs snapshot per line (cost*qty)
  discountLabels: string[]; note?: string; kind: CartLine['kind']; giftCardCode?: string; giftRecipient?: GiftRecipient; collectionTitles?: string[];
};
export type SaleRecord = {
  uuid: string;
  type: 'sale' | 'refund';
  refundOf?: string; // sale uuid
  ts: string;
  registerId: string;
  registerName: string;
  staff?: string;
  customer?: CustomerRef;
  lines: SaleLine[];
  itemsCents: number;
  discountCents: number;
  netCents: number; // total billed (no tax in this shop)
  tipCents: number;
  totalCents: number;
  cogsCents: number;
  feesCents: number;
  roundingCents: number;
  tenders: Tender[];
  deals: AppliedDiscount[];
  note?: string;
  reason?: string;
  orderGid?: string;
  orderName?: string;
  receiptLink?: string;
};

export type Notice = {
  id: string; ts: string; kind: 'sync' | 'queue' | 'stock' | 'reader' | 'refund' | 'pass' | 'info';
  title: string; body?: string; route?: string; read?: boolean;
};

export type Role = 'cashier' | 'manager' | 'owner';
export type StaffMember = { id: string; name: string; role: Role; salt: string; pinHash: string; badgeSalt?: string; badgeHash?: string; badgeAt?: string };
