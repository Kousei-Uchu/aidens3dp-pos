# Spec traceability (research doc v0.5 + User Guide draft)
Legend: ✅ built · 🧪 built + unit-tested logic · ⚠️ partial/simplified · ⛔ not built. **No row has been verified on a device.**

## Layout & status
- ✅ iPad grid left / cart right; iPhone grid + bottom cart bar ("N items · $X" + Charge) → full-screen cart; size class (width ≥ 700) decides, not model — `Checkout.tsx`, `CartPane.tsx`, `theme.useLayout`
- ✅ Tab bar Checkout / Inventory / Transactions / Notifications / More — `App.tsx`
- ✅ Status strip: reader + sync (iPad always, iPhone only on issue) — `StatusStrip`

## Setup
- ✅ Settings ▸ Shopify (domain + Client ID/secret in Keychain), Import from Shopify — `Settings.tsx`, `sync.importFromShopify`
- ✅ Diagnostics ▸ Zeller: Setup + $1 test (+ refund) — `Diagnostics.tsx`
- ⚠️ Square grid import by paste/file: accepts our `grid.json` only (Square export format unknown)

## Selling
- ✅ Keypad / Quick Menu / All products tabs; category drill-down; variation picker; quantity bar
- ✅ Search with refine chips Items / Customers / Discounts / Saved carts
- 🧪 Camera scan with "Done" pop-up; Bluetooth HID scanner; EAN/UPC leading-zero matching (`cartOps.findByBarcode`)
- ✅ Line editor (qty, variation, discount, price adjustment, note); consolidate-identical setting
- ✅ Cart ⋯ menu: Clear, Save, Create customer, Custom amount, Cart discount, Sell gift card, Check gift card
- 🧪 Automatic discounts + bundles, struck-through price and deal name; `no-discount` tag; manual discounts incl. Shopify code presets and custom %/$ keypad
- ✅ Customer attach
- 🧪 Charge: Card / Cash / Gift card / Split Amount (enter first payment or split equally); partial approved tenders persist on the sale (no void timer)
- 🧪 Card: live `onEvent` status; declines & 51/1009 messages keep cart; unknown result → "Checking…" via `getTransactions({reference})`, never re-charge until resolved, manual resolve logs who
- 🧪 Cash: chips + custom, 5c rounding, change shown
- ✅ Receipt prompt Email / Text / No receipt (+ Share); card sales include Zeller `receiptLink`; no surcharge text

## Grid editing
- ✅ Pencil ▸ Edit grid: pages (add/rename/reorder/delete), tiles for Items, Categories, Display groups, Actions (all 8), Discounts; ⊖ remove; reorder arrows; auto-save + push to other registers — `Tiles.tsx`, `grid.ts` 🧪
- ⚠️ Reordering uses arrow buttons, not drag-and-drop

## Saved carts
- ✅ Save (name + notes), Open / Delete / Assign, "Merge Carts?" prompt, shared via metaobjects, local-first so works offline
- ⚠️ "Void" = Delete (same action)

## Transactions & returns
- ✅ Grouped by day, detail pane (iPad) / page (iPhone), New receipt, search receipt #/customer/note/item (local filter + Shopify search)
- 🧪 Return or exchange: items or Amount, replacement items (carried into Pay with exchange credit), button "Refund $X" / "Even exchange" / "Charge $X"; refund to original card via Zeller / cash / gift card; 5 reasons; optional restock; card refund = what was paid

## Gift cards
- ✅ Sell/load, check balance (scan or type), redeem as tender, report tab (sold/redeemed/outstanding), history
- ⚠️ Apple Wallet pass server (`pass-server/`) written and hardened (signed 5-min links, webhook HMAC, rate limits; link-signing logic 🧪) but the pass signing/APNs parts are UNTESTED — need your certs

## Reports
- 🧪 Sales: 1D/1W/1M/3M/1Y, compare previous period / last year, top categories, custom range, device filter, share (text); gross, discounts, refunds, net, card fees (1.4%), COGS separate (never subtracted from Net)
- ⚠️ Cash drawer: float, paid in/out, count vs expected, Z-report (simplified, per register)

## Data
- ✅ Local CSV append (sales, sale_lines, events incl. declines), Export CSV, Delete local history (double confirmation); Info.plist `UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace`
- ✅ Sales stored in Shopify as orders + `pos_sale` metaobjects + daily rollups

## Offline / troubleshooting
- ✅ Cash + saved carts offline; sales queue in outbox and upload later (idempotent steps); card needs internet; negative stock allowed

## Other
- ✅ Orders (Open | Unfulfilled | Completed, Mark fulfilled, refund, receipt) · Items list + Create item + edit · Inventory (receive/adjust/count, negative in red) · Customers (list/detail/create/edit/Start sale) · Notifications (sync, queued, low/negative stock, reader; tap to open; Clear all)
- ⚠️ Staff: hashed PINs, roles, lock screen; role gating only hides Reports/Staff/Settings from cashiers
- ⚠️ Multi-register sync is polling (~25 s)
- ⚠️ Inventory counts are per item (no multi-item count sessions)
