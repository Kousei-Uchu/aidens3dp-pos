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
| 0004 | 2026-10-10 | Compound-discount proof + fewest-lots tie-break, POS email fix guide, checklist for the grid nesting addition | A6, A12, C1-C6 (listed) |

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
- [x] A2.6 **You:** open "All products" filter and a cart sheet with the scanner enabled; keyboard should stay up. Trade-off: a Bluetooth scan within ~2.5 s of finishing typing in a field is ignored until the grace ends. **User Note:** Not too happy with this solution, is there another? can we have it talk to the bluetooth scanner directly? It's a HID Bluetooth Scanner, so it ends up hiding my kayboard. I would like to prevent this from happening, so if there is a way to directly communicate with the HID Scanner and prevent the device from detecting it as a keyboard, that would be of great help.

### A3. View doesn't move for the keyboard (field hidden behind it)
- [x] A3.1 `src/lib/keyboardMath.ts` (pure, tested): keyboard overlap, "how far to scroll to reveal a field", sheet max height.
- [x] A3.2 `src/ui/keyboard.tsx`: `useKeyboardOverlap()` (uses the keyboard's top edge, so split/floating iPad keyboards are handled) and `RevealScroll`, which scrolls the focused field above the keyboard (on focus, and again when the keyboard finishes moving).
- [x] A3.3 `Page` now scrolls with `RevealScroll` (adds bottom padding = keyboard height so the last field can always be reached).
- [x] A3.4 `Sheet` no longer uses `KeyboardAvoidingView`: it sits above the keyboard, caps its height to the space left, and uses `RevealScroll` inside.
- [x] A3.5 Screens with their own non-scrolling layout (Checkout filter, Inventory/Transactions search) have the field at the top, so nothing to reveal. Confirm on device, particularly iPad with the floating keyboard and landscape.

### A4. Inconsistent keyboard types
- [x] A4.1 `src/lib/fieldKinds.ts`: `kind` presets — `text name email phone url integer decimal money pin secret code search date json` (tested).
- [x] A4.2 `Field` takes `kind="…"`; explicit props still override it.
- [x] A4.3 All 67 `<Field>`s audited and given a kind. Redundant props removed.
- [x] A4.4 iOS number/decimal/phone pads have no Return key, so those fields get a **Done** bar above the keyboard.
- Choices you may want to change: **Barcode** = number pad (EAN/UPC; alphanumeric Code128 barcodes can't be typed — say if you have any). **ABN** = number pad (no spaces). **Reports dates** = numbers-and-punctuation. **Gift card code** stays all-caps. Names/titles = capitalise words, no autocorrect.
- [x] A4.5 **You:** try one of each kind (customer email/phone, item price, PIN, search) and tell me any that feel wrong.

### A5. Inventory screen: all products/variants, category filter, nesting, sort/filter
- [x] A5.1 Why it didn't show everything: (a) the list was hard-capped with `.slice(0, 300)` (Inventory and Items), and (b) it only ever included ACTIVE products, so draft/archived ones never appeared. Both removed; Inventory now uses `cat.all`.
- [x] A5.2 `Variant.status` (ACTIVE/DRAFT/ARCHIVED) is now saved on import; older saved catalogues fall back to the `active` flag until the next import.
- [x] A5.3 `src/lib/inventoryView.ts` (pure, 9 tests incl. a 5,000-variant run): search (every word must match name/variant/SKU/barcode), stock filters (All, Low, Out, Negative, Tracked, Not tracked), status, category, sort (name, stock ↑↓, price ↑↓, recently updated; untracked always last), grouping, row flattening.
- [x] A5.4 UI: **Filters** button (with badge) opens a sheet with Category (every collection), Stock level (+ configurable "low" threshold 1/2/3/5/10), Product status, Sort, and **Flat / Nested under item**. Quick chips for Low/Out/Negative and a Flat↔Nested toggle sit under the search box. Choices are remembered per device (`settings.inventory`, included in backups).
- [x] A5.5 Nested view: multi-variant products show an expandable header (variation count, total stock, lowest price); single-variant products stay plain rows; searching auto-expands matches.
- [x] A5.6 Header shows "N variants · M products"; the Filters sheet shows how many variants this device holds and when it was last imported, so you can compare with Shopify.
- [x] A5.7 **You:** if the count is still lower than Shopify's after "Refresh stock from Shopify", tell me both numbers. The bulk query (`fetchVariants`) is the next suspect and I can't test it without your store.
- Note: Low = 0 up to the threshold (negatives have their own filter). The old "Low" chip also included negatives.
- Also fixed: the Items list had the same 300 cap. The Refund product search still shows the top 40 matches on purpose (it's a search box).

### A6. Per-order emails for POS orders
- [x] A6.1 Checked the code: customer emails are already off (`sendReceipt:false`, `sendFulfillmentReceipt:false`, fulfilment `notifyCustomer:false`, refunds `notify:false`). Nothing else in the app sends mail.
- [x] A6.2 Root cause: the email is Shopify's staff "New order" notification, which apps cannot switch off. `docs/POS_ORDER_EMAILS.md` has the fix (mark POS orders with `[POS]` in the staff subject using the `pos` tag, then a Gmail filter).
- [x] A6.3 **You:** follow `docs/POS_ORDER_EMAILS.md`, ring up a test sale, and tell me if the `[POS]` marker shows up. If not I will switch the marker to a custom attribute.

### A7. Import previous sales from Square
- [ ] A7.1 Square "Transactions/Items detail" CSV importer (CSV first: no API keys needed).
- [ ] A7.2 Optional Square Orders API importer (token in Keychain), idempotent by Square order id.
- [ ] A7.3 Imported sales appear in Reports/Transactions, marked "Square", never touching Shopify stock.

### A8. GUI bundle builder
- [ ] A8.1 Bundle list + create/edit form (pick items, quantity, deal price or $/% off, dates, on/off) writing the same JSON the engine already reads.
- [ ] A8.2 Keep the JSON editor as an "Advanced" view.
- [ ] A8.3 Include support for choosing specifc variant pairings within bundles containing at least one product with multiple variants. This is not the same as specifying a variant as a set item. This shouldn't be mandatory pairings, however at checkout, prompt the cashier, informing them that a bundle deal was applied, but no matching pair was found, and display the qualifying items in the order that are being considered for this bundle. The cashier can select to go back and modify the cart, or continue to payment.
- [ ] A8.4 As an elaboration on A8.3: In the cart and on reciepts, bundle items of matching pairs should be favoured to be grouped and have the discount applied, over non-matching.

### A9. Gift card details at checkout, not when added (IGNORE POINTS 1 AND 2, CHANGED MY MIND)
- [~] A9.1 Adding a gift card to the cart just records amount.
- [~] A9.2 At charge time: prompt for recipient name/email/message/print-or-QR once, for all gift cards in the cart.
- [ ] A9.3 The recipient gets two emails with their gift card. Is it possible to only send the gift card email once transaction is complete? Or better still, dont even create the gift card in shopify at all until the transaction has succeeded, so abandoned sales dont leave stray gift cards and customers with a free gift card code.
- [ ] A9.4 The QR codes present on Gift Cards contain a prefix. When code uses or interacts with the entered Gift Card Code, strip the prefix `shopify-giftcard-v1-{the code we want to actually use}` if present, and also support that `v1` segment being `v[0-9 with however many digits are present before the -]`. In theory, you could just use the regex match filter `(?:.*-)?(.*)`.

### A10. Gift card web page / QR / recipient form
- [ ] A10.1 QR to the card's Shopify gift-card page where available.
- [ ] A10.2 Fallback Cloudflare Worker "claim your gift card" page (recipient name + email).
- [ ] A10.3 Still support the old method of entering email and things like you do currently.

### A11. Zeller terminal shouldn't show our own sheet
- [ ] A11.1 Remove our payment sheet for terminal calls; show only a slim in-app "waiting on terminal" state while Zeller's UI is up.
- [ ] A11.2 Answer to "can Zeller's popup live inside a custom sheet?" (needs a look at the SDK's WebView API in `zellerBridge.tsx`). Provide a method for me to package and send the Zeller SDK source from my local machine, as it is gated access (ensure keys are removed from code automatically before packaging).

### A12. Compound per-unit discounts
- [x] A12.1 Found the existing bundle matcher (`matchBundles` in `src/lib/bundles.ts`) already does this: each unit joins at most one deal, several deals apply in one order, and the assignment with the biggest total saving wins. No rewrite needed.
- [x] A12.2 `tests/compound.test.ts` (9 tests): your cows x2 + Tadlings x8 example ($2 + $10 + $5), 6 Tadlings = one 5-deal, 7, 9 and 10 Tadlings, units spread over two cart lines, manual discount blocked on dealt lines.
- [x] A12.3 Added an explicit tie-break: on an equal saving, fewer deal applications win (bigger lots), so the 6-Tadling case can never flip to two 3-deals.
- [ ] A12.4 **You:** build your real cow/Tadling deals as three bundle entries that repeat the set (`"sets": ["tad","tad","tad"]`). The upcoming bundle builder (A8) will make this a form. **User Note:** I did not mean those as bundles. While I do want bundles to stack and compound, the discussion is about the Shopify imported discounts. With those dicounts, the current behaviour is: 6 tadlings gives the correct 5x discount, however 8 tadlings only gives the 5x instead of both a 5x and a 3x. It stacks the same discount type on itself several times, thats a-ok, but it seems it refuses to combine any two or more types of automatic Shopify discounts onto one order. The same issue is present for if i add 5x tadlings and 2x cows, where i should get both the 5x tadling deal and the 2x cow deal. Instead, i get just the tadling deal. Also a side note, in the cart viewer could we treat discounts and price adjusts like an invoice list? For example have the following (entered into a code block, but relates to this section). By that i mean like a modification of the current item row format, not a redesign.
- [ ] A12.5 Price Adjustments should have multiple types to select from: Line (Adjusts that entire line's price. Calculates after discounts and bundles, exactly how much that line's final price should be, and applies a Line Price Adjustment. If another item, of the same type that this adjustment is applied to, is added to the cart, or if that line's discounts change, prompt the cashier, asking them to review that adjustment, and choose to either preserve, adjust, or remove that Line Price Adjust in particular. Ensure it's easy to tell which line needs reviewing, and why it was flagged for review (what item(s) added and/or discount(s) changed), even in a large order), Item (Two sub-options for this one; Fixed Quantity, or All in Cart. This one works exactly the same as it does now, except you can just choose if you want to adjust the per-item price for a specific number, or for every instance of that item in the entire order. Prompt the cashier at checkout to double check the price adjustment is right.), and Whole Order (This one is applied to the cart via the thee dot meatballs menu, rather than to an item. It sets the total price for the entire cart. Any display of this adjustment in the cart or on receipts should be like a whole order discount. The same prompt logic as Line should be applied here.). If you believe any are missing, go ahead and propose them, or just add them if you really think theyre needed. You can change bits of this too if you would like, just notify me, or ask about really large changes. There are a lot of gaps here, and the display of these and multi-line handling can get a tad difficult, so you have freedom to think through how this would all be displayed, how it would be managed, possible issues or situations out of the ordinary, and how to interact with these. Just make sure its straight forward and easy to understand for non-technically-minded people as well please. :3
- [ ] A12.6 Just another smaller note, double check the logic for multi buy shopify discounts, and how theyre displayed. Especially in relation to adjusted prices, and other reasons why a discount would spread across two cart/order lines. Use your CPU brain on this one.
- [ ] A12.7 Display our custom bundles as one line, but make it clear that it's a bundle of two items, and what two items/variations those are. Include an indicator for if the bundle is a reccomended pair (defined in A8) or not.

Say I added 13 Tadlings to the cart, and then did a `Line` type price adjustment on that line. That item's line should show rougly this:
```
Tadling - Small       ~~$52.00~~
13 x $4                 $40.00
5x Tadlings (x2)  -$8.00
3x Tadlings   -$2.00
Line Price Adjustment  -$2.00
```

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

## C. Grid: nested categories, breadcrumb path, per-tile settings (from the "ADDITION AFTER PATCHES 1-3" section)
Batched with A14 and A15 into one grid patch (planned next after A7 to A11).
- [ ] C1 Per-tile settings sheet in the grid editor (colour, label, and for categories/groups: choose sub-categories).
- [ ] C2 Nested categories: a category or display group tile can contain sub-categories, to any depth.
- [ ] C3 Display groups can impersonate collections (a group acts like a collection tile).
- [ ] C4 An item in both a sub-category and its parent shows only in the deepest sub-category, never in the parents.
- [ ] C5 Grid navigation keeps a path stack: Back goes up one level, not straight to depth 0.
- [ ] C6 Path header like `Dragons > Extreme Dragons > Rose`, each level tappable to jump there.

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
