# Build checklist & progress log

Master list for everything in `DEV_NOTES.md`. Updated inside every patch, so each patch shows what changed and what's left.
Legend: `[x]` done in code · `[~]` partly done / needs your device to confirm · `[ ]` not started · `[?]` needs your answer.
**Nothing here has been run on a device by me** — I can only run the pure-logic tests (`npm test`) in my sandbox. Every UI item is "code-complete, untested on hardware" until you say it works.

## Patch log (apply in order: `git apply patches/000N-*.patch`)
| # | Date | What | Items |
|---|------|------|-------|
| 0001 | 2026-10-10 | iOS folder reset script + stop the scanner stealing the keyboard | A1, A2 |
| 0002 | 2026-10-10 | Keyboard avoidance (field always visible) + consistent keyboard types on all 67 fields | A3, A4 |
| 0003 | 2026-10-10 | Inventory: no row cap, draft/archived products, category/stock/status filters, sort, nest variants | A5 |

---

## A. Round 3 list (the 15 issues) — NOT yet addressed before this session

### A1. `npm run ios` hangs / device timeout / two `.xcodeproj` files
- [x] A1.1 `scripts/reset-ios.sh` (`npm run ios:reset`): deletes `ios/` + this app's DerivedData, `expo prebuild --platform ios --clean`, verifies exactly one `.xcodeproj`, lists devices.
- [x] A1.2 `npm run ios:devices` (`xcrun xctrace list devices`) so you can see what Xcode sees.
- [x] A1.3 Script prints the device-timeout checklist (unlock/trust, Developer Mode, Devices window, cable, explicit device name, keep the project out of iCloud-synced folders).
- [x] A1.4 **You:** run `npm run ios:reset` then `npm run ios`. Likely cause of two projects: a prebuild from before the app name/slug changed left the old one behind; `--clean` fixes that. I can't test the device timeout from here.

### A2. Keyboard disappears on some text boxes
- [x] A2.1 Root cause found: `HidScanner` (Bluetooth scanner capture input, `Scanner.tsx`) re-focused itself every 1.5 s whenever it wasn't focused. Any real field outside the sheets Checkout tracks (the "All products" filter, cart-pane sheets) lost focus → keyboard dropped.
- [x] A2.2 `src/lib/focusGuard.ts` (pure, tested): counts focused `<Field>`s + a 2.5 s grace after blur.
- [x] A2.3 `Field` reports focus/blur to the guard (and releases it if unmounted while focused).
- [x] A2.4 `HidScanner` only grabs focus when not typing and `Keyboard.isVisible()` is false; removed its `autoFocus` (replaced by a guarded focus on mount).
- [x] A2.5 Tests: `tests/focusguard.test.ts`.
- [ ] A2.6 **You:** open "All products" filter and a cart sheet with the scanner enabled; keyboard should stay up. Trade-off: a Bluetooth scan within ~2.5 s of finishing typing in a field is ignored until the grace ends.

### A3. View doesn't move for the keyboard (field hidden behind it)
- [x] A3.1 `src/lib/keyboardMath.ts` (pure, tested): keyboard overlap, "how far to scroll to reveal a field", sheet max height.
- [x] A3.2 `src/ui/keyboard.tsx`: `useKeyboardOverlap()` (uses the keyboard's top edge, so split/floating iPad keyboards are handled) and `RevealScroll`, which scrolls the focused field above the keyboard (on focus, and again when the keyboard finishes moving).
- [x] A3.3 `Page` now scrolls with `RevealScroll` (adds bottom padding = keyboard height so the last field can always be reached).
- [x] A3.4 `Sheet` no longer uses `KeyboardAvoidingView`: it sits above the keyboard, caps its height to the space left, and uses `RevealScroll` inside.
- [~] A3.5 Screens with their own non-scrolling layout (Checkout filter, Inventory/Transactions search) have the field at the top, so nothing to reveal. Confirm on device, particularly iPad with the floating keyboard and landscape.

### A4. Inconsistent keyboard types
- [x] A4.1 `src/lib/fieldKinds.ts`: `kind` presets — `text name email phone url integer decimal money pin secret code search date json` (tested).
- [x] A4.2 `Field` takes `kind="…"`; explicit props still override it.
- [x] A4.3 All 67 `<Field>`s audited and given a kind. Redundant props removed.
- [x] A4.4 iOS number/decimal/phone pads have no Return key, so those fields get a **Done** bar above the keyboard.
- Choices you may want to change: **Barcode** = number pad (EAN/UPC; alphanumeric Code128 barcodes can't be typed — say if you have any). **ABN** = number pad (no spaces). **Reports dates** = numbers-and-punctuation. **Gift card code** stays all-caps. Names/titles = capitalise words, no autocorrect.
- [ ] A4.5 **You:** try one of each kind (customer email/phone, item price, PIN, search) and tell me any that feel wrong.

### A5. Inventory screen: all products/variants, category filter, nesting, sort/filter
- [x] A5.1 Why it didn't show everything: (a) the list was hard-capped with `.slice(0, 300)` (Inventory and Items), and (b) it only ever included ACTIVE products, so draft/archived ones never appeared. Both removed; Inventory now uses `cat.all`.
- [x] A5.2 `Variant.status` (ACTIVE/DRAFT/ARCHIVED) is now saved on import; older saved catalogues fall back to the `active` flag until the next import.
- [x] A5.3 `src/lib/inventoryView.ts` (pure, 9 tests incl. a 5,000-variant run): search (every word must match name/variant/SKU/barcode), stock filters (All, Low, Out, Negative, Tracked, Not tracked), status, category, sort (name, stock ↑↓, price ↑↓, recently updated; untracked always last), grouping, row flattening.
- [x] A5.4 UI: **Filters** button (with badge) opens a sheet with Category (every collection), Stock level (+ configurable "low" threshold 1/2/3/5/10), Product status, Sort, and **Flat / Nested under item**. Quick chips for Low/Out/Negative and a Flat↔Nested toggle sit under the search box. Choices are remembered per device (`settings.inventory`, included in backups).
- [x] A5.5 Nested view: multi-variant products show an expandable header (variation count, total stock, lowest price); single-variant products stay plain rows; searching auto-expands matches.
- [x] A5.6 Header shows "N variants · M products"; the Filters sheet shows how many variants this device holds and when it was last imported, so you can compare with Shopify.
- [~] A5.7 **You:** if the count is still lower than Shopify's after "Refresh stock from Shopify", tell me both numbers. The bulk query (`fetchVariants`) is the next suspect and I can't test it without your store.
- Note: Low = 0 up to the threshold (negatives have their own filter). The old "Low" chip also included negatives.
- Also fixed: the Items list had the same 300 cap. The Refund product search still shows the top 40 matches on purpose (it's a search box).

### A6. Per-order emails for POS orders
- [ ] A6.1 Stop Shopify notifying you for POS orders (cause is almost certainly Shopify admin notification settings for "New order"; the `pos` tag can't filter it). Plan: set `sendReceipt:false`/`sendFulfillmentReceipt:false` on `orderCreate`, and give you the Shopify Flow / notification steps.

### A7. Import previous sales from Square
- [ ] A7.1 Square "Transactions/Items detail" CSV importer (CSV first: no API keys needed).
- [ ] A7.2 Optional Square Orders API importer (token in Keychain), idempotent by Square order id.
- [ ] A7.3 Imported sales appear in Reports/Transactions, marked "Square", never touching Shopify stock.

### A8. GUI bundle builder
- [ ] A8.1 Bundle list + create/edit form (pick items, quantity, deal price or $/% off, dates, on/off) writing the same JSON the engine already reads.
- [ ] A8.2 Keep the JSON editor as an "Advanced" view.

### A9. Gift card details at checkout, not when added
- [ ] A9.1 Adding a gift card to the cart just records amount.
- [ ] A9.2 At charge time: prompt for recipient name/email/message/print-or-QR once, for all gift cards in the cart.

### A10. Gift card web page / QR / recipient form
- [ ] A10.1 QR to the card's Shopify gift-card page where available.
- [ ] A10.2 Fallback Cloudflare Worker "claim your gift card" page (recipient name + email).

### A11. Zeller terminal shouldn't show our own sheet
- [ ] A11.1 Remove our payment sheet for terminal calls; show only a slim in-app "waiting on terminal" state while Zeller's UI is up.
- [ ] A11.2 Answer to "can Zeller's popup live inside a custom sheet?" (needs a look at the SDK's WebView API in `zellerBridge.tsx`).

### A12. Compound per-unit discounts
- [ ] A12.1 Allocation engine: each unit gets at most one deal; best total saving per group; multiple deals per order (cows ×2, Tadlings ×8 example).
- [ ] A12.2 Unit tests, including 6 tadlings = one 5-deal not two 3-deals.

### A13. Swipe actions (cart lines, saved carts; not customers)
- [ ] A13.1 Swipe-to-delete row component; apply to cart lines, saved carts, held/other quick-delete lists.

### A14. Collections: image in grid/lists, variant picker as in-grid sub-menu
- [ ] A14.1 Collection image on tiles + lists.
- [ ] A14.2 Variant picker as a grid sub-page instead of a popup.

### A15. New grid buttons: Lock POS, Price check, Stock check
- [ ] A15.1 Lock POS tile.
- [ ] A15.2 Price check (scan → price, no cart change).
- [ ] A15.3 Stock check (scan variant → stock of its siblings; scan item → its own stock).

---

## B. Round 2 list ("fun little bitsies")
Status as found in the zip you sent (I only inspected files; not run).
- [ ] B1 Cash: denomination tap entry, drawer ledger, change finder, ML-weighted change, daily float report, Check Change, insufficient-change handling, undo/subtract. **I found no denomination/ledger code in this zip (`Drawer.tsx` is still the keypad version).** Confirm whether that part was meant to be included; I'll build it as its own run of patches.
  - [ ] B1a ledger + denomination entry · [ ] B1b `findCombinations` (your function, integer cents) · [ ] B1c scoring + toggle · [ ] B1d Check Change · [ ] B1e cash screen prompts + split suggestion · [ ] B1f daily float report · [ ] B1g tender-machine adapter: empty stub, off by default (as you asked)
- [~] B2 Cashier passes (`StaffPass.tsx`, `StaffLogin.tsx`, `passCard.ts`, `badge.ts`) — present in zip; Wallet pass needs your certificate.
- [~] B3 Screensaver + keep-awake (`Screensaver.tsx`, `screensaver.ts`, `idle.ts`) — present in zip.
- [ ] B4 Bundle GUI (same as A8)
- [ ] B5 Simple / Minimal / Custom staff modes
- [ ] B6 Training mode (Info → Show → Guide → Check → Gratify)
- [ ] B7 In-app docs (Markdown, Basic/Deep/Advanced) + docs Worker
- [ ] B8 Extra ideas

## Notes
- Baseline tests: 25/30 pass in my sandbox. The 5 failing files need `@noble/hashes`, which isn't installed here (no network) — they should pass after your `npm install`.
- Type-checking: I can't run `tsc` here (no `node_modules`). Please run `npm run typecheck` after applying each patch and tell me about any error; I'll fix it in the next patch.
