# Build checklist & progress log

Master list for everything in `DEV_NOTES.md`. Updated inside every patch, so each patch shows what changed and what's left.
Legend: `[x]` done in code · `[~]` partly done / needs your device to confirm · `[ ]` not started · `[?]` needs your answer · `[-]` dropped.
**Nothing here has been run on a device by me** - I can only run the pure-logic tests (`npm test`) in my sandbox. Every UI item is "code-complete, untested on hardware" until you say it works.

## Patch log (apply in order: `git apply patches/000N-*.patch`)
| # | Date | What | Items |
|---|------|------|-------|
| 0001 | 2026-10-10 | iOS folder reset script + stop the scanner stealing the keyboard | A1, A2 |
| 0002 | 2026-10-10 | Keyboard avoidance (field always visible) + consistent keyboard types on all 67 fields | A3, A4 |
| 0003 | 2026-10-10 | Inventory: no row cap, draft/archived products, category/stock/status filters, sort, nest variants | A5 |
| 0004 | 2026-10-10 | Compound-discount proof + fewest-lots tie-break, POS email fix guide, checklist for the grid nesting addition | A6, A12, C1-C6 (listed) |
| 0005 | 2026-10-10 | Progress doc only: your notes organised, A12 corrected to Shopify discounts, new A16 (price adjustments) | docs |
| 0006 | 2026-10-10 | Several Shopify automatic discounts now combine in one order (5x + 3x Tadlings, Tadlings + cows) | A12.4-A12.6 |
| 0007 | 2026-10-10 | Progress doc only: your answers recorded, scanner finding, "Needed from You" and "Deferred" sections | docs |
| 0008 | 2026-10-10 | Square history import: PC script (Square SDK) → QR on your Wi-Fi → compressed read-only history in Reports + Transactions | A7 |
| 0009 | 2026-10-10 | Bundle builder GUI: deal list + editor, % off / set price / $ off, dates, recommended pairs, bundle rows in the cart, pre-payment check; fixes a missing "Square history" page title from 0008 | A8, B4 |
| 0010 | 2026-10-10 | Gift cards: QR prefix stripped everywhere a code is read, one email per card sent only after the card exists, safe retries; `npm run zeller:pack` script | A9.3-A9.5, A11.3 |
| 0011 | 2026-10-10 | Remove the app's own gift card email (Shopify already sends one on creation) | A9.3, A9.6 |
| 0012 | 2026-10-10 | Gift card claim page (own Worker) + Claim QR and gift card QR on the receipt step | A10 |
| 0013 | 2026-10-10 | Zeller: no more sheet of ours over the terminal popup (slim "waiting on terminal" strip instead); answer on where Zeller's popup lives | A11 |
| 0014 | 2026-10-10 | Invoice-style cart rows (one row per discount, repeats shown as (x2)) and swipe-to-delete on cart lines and saved carts | A12.8, A13 |
| 0015 | 2026-10-10 | Progress doc only: your manual ticks recorded, cash drawer answer (N7), new queue item E1 (worker styling and subdomains) | docs |
| 0016 | 2026-10-10 | Grid: nested categories to any depth, per-tile settings sheet, groups that act like collections, back one level + tappable path, collection pictures on tiles and lists | C1-C6, A14.1 |
| 0017 | 2026-10-10 | Grid: variation picker is now a sub-page of the grid (not a popup), plus new Lock POS, Price check and Stock check tiles | A14.2, A15 |
| 0018 | 2026-10-10 | Cash drawer: tap-the-notes-and-coins entry with undo, a ledger of what is in the drawer, drawer screens rebuilt on it, and your change finder (checked against your original) | B1a (drawer side), B1b |

---

## A. Round 3 list (the 15 issues) - NOT yet addressed before this session

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
- [x] A2.6 **You:** open "All products" filter and a cart sheet with the scanner enabled; keyboard should stay up. Trade-off: a Bluetooth scan within ~2.5 s of finishing typing in a field is ignored until the grace ends.
- [x] A2.7 Scanner model: POS-mate Wireless Barcode Scanner (PM-BCBT2D-W). Its manual (v1.1, "iOS / iPadOS Virtual Keyboard Control") says a **double click of the scanner button shows the on-screen keyboard, and another double click hides it**. This is on by default, and a setup barcode can disable or re-enable it. So the keyboard can be brought back without any app change. The scanner also has BLE and SPP modes, but the manual gives no protocol details, so talking to it directly is deferred (see Deferred). The focus guard from A2 stays. **You:** test the double click with the scanner paired and the scanner screen open. Confirmed by you (N4): it works, so no app change is needed.

### A3. View doesn't move for the keyboard (field hidden behind it)
- [x] A3.1 `src/lib/keyboardMath.ts` (pure, tested): keyboard overlap, "how far to scroll to reveal a field", sheet max height.
- [x] A3.2 `src/ui/keyboard.tsx`: `useKeyboardOverlap()` (uses the keyboard's top edge, so split/floating iPad keyboards are handled) and `RevealScroll`, which scrolls the focused field above the keyboard (on focus, and again when the keyboard finishes moving).
- [x] A3.3 `Page` now scrolls with `RevealScroll` (adds bottom padding = keyboard height so the last field can always be reached).
- [x] A3.4 `Sheet` no longer uses `KeyboardAvoidingView`: it sits above the keyboard, caps its height to the space left, and uses `RevealScroll` inside.
- [x] A3.5 Screens with their own non-scrolling layout (Checkout filter, Inventory/Transactions search) have the field at the top, so nothing to reveal. Confirm on device, particularly iPad with the floating keyboard and landscape.

### A4. Inconsistent keyboard types
- [x] A4.1 `src/lib/fieldKinds.ts`: `kind` presets - `text name email phone url integer decimal money pin secret code search date json` (tested).
- [x] A4.2 `Field` takes `kind="…"`; explicit props still override it.
- [x] A4.3 All 67 `<Field>`s audited and given a kind. Redundant props removed.
- [x] A4.4 iOS number/decimal/phone pads have no Return key, so those fields get a **Done** bar above the keyboard.
- Choices you may want to change: **Barcode** = number pad (EAN/UPC; alphanumeric Code128 barcodes can't be typed - say if you have any). **ABN** = number pad (no spaces). **Reports dates** = numbers-and-punctuation. **Gift card code** stays all-caps. Names/titles = capitalise words, no autocorrect.
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
Done through the Square API/SDK instead of CSV (your call), as a one-off PC script. Read-only: it never touches stock, items, customers or Shopify.
- [-] A7.1 CSV importer: dropped, the API gives exact fields so no CSV headers are guessed.
- [x] A7.2 `tools/square-history/export.ts` (official `square` SDK v46, typechecked against it): pulls completed orders (30-day windows, every location), the catalogue (SKU, item, variation, category), and customers (names only). Converts in `src/lib/squareConvert.ts` (pure, tested): sales, itemised refunds (counted once even though Square lists them on two orders), amount-only refunds, tips, cash tendered/change, Square's real card fees, discount names, gift card sales. Writes one gzip file per month + `manifest.json` to `tools/square-history/out/`.
- [x] A7.3 Delivery: the script prints a QR code for `http://<PC LAN IP>:8787/<random key>/manifest.json` and serves only `out/` while it runs. App: Settings ▸ Square history ▸ Scan QR from PC (or type the address, or Pick files copied across from the PC). Install once per device.
- [x] A7.4 Storage: stays gzip-compressed in `Documents/square-history/` (monthly files, read one month at a time) plus a small `rollups.json.gz` for Reports. Test: 400 sales pack to under 1/8 of their JSON size. Needs the new `fflate` dependency.
- [x] A7.5 Linking: Square variation → SKU → Shopify variant, read from the catalogue already on the device (no Shopify call), then barcode/UPC as a second try. A match gives the Shopify item name, Shopify cost (for profit) and Shopify collection (for category reports). No match → custom line titled `Item - Variation - Notes` (Square's default "Regular" is left out), grouped under its Square category. **Re-match** button redoes this after a catalogue refresh.
- [x] A7.6 Reports: imported days appear under register "Square (old)" and add to every report; nothing is written to Shopify metaobjects. Transactions: new **Square history** chip loads them (read-only, no return button).
- [x] A7.7 Run against your real Square account by you (N8 ticked: imported on the iPad and checked a day's Net sales against Square). I never had a token, so the converter itself is only tested on hand-made orders shaped like the SDK's types. If a later day ever disagrees with Square, tell me which day and the difference.
- Assumptions to check: Square "Other" tenders show as "Exchange credit" in the tender breakdown; GST is treated as included in prices (tax ignored, matching the app's `tax = 0`); Square service charges become a custom "Service charge" line; modifiers are folded into the line note; customers are not imported as records.
- Needs a native rebuild: `app.json` gained `NSAllowsLocalNetworking` + a Local Network message (so the app may talk to the PC over plain http on your LAN). Run `npm install` then `npm run ios:reset`. The Pick-files route works without the QR/Wi-Fi part.

### A8. GUI bundle builder
Settings ▸ Discounts & bundles. Saves the same JSON the engine already read (`settings.bundlesJson`), so existing JSON bundles keep working and show up in the list.
- [x] A8.1 `src/screens/BundleBuilder.tsx`: deal list (state badge Live / Scheduled / Ended / Off, quick on/off switch, summary line) and an editor. A deal is one or more **groups** ("N items from this list"). Pick products (every variation) or individual variations with search. Effect is **$ off**, **% off** or **set price**, optionally taken off only one group. Extras: most times per order, start and end date (`YYYY-MM-DD`, the end day is included in full), on/off. Engine additions: `mode: 'percent'` + `percent`, `starts_at` / `ends_at` (`src/lib/bundles.ts`).
- [x] A8.2 The JSON editor stays under "Advanced: edit as JSON" and also shows an unreadable saved config so you can fix or clear it.
- [x] A8.3 Recommended pairs: per deal, "Add a recommended pair" picks one variation per item of the deal (for example Red dragon + Red egg). Stored as `recommended` (lists of variant ids, order doesn't matter). Optional. Any variation still gets the deal. A deal with no pairs never shows a marker. Changing a deal's items or quantities offers to clear its pairs, since they'd be out of date.
- [x] A8.4 Before payment (Charge in the cart): if a bundle is applied with variations that aren't a recommended pair, a sheet lists the items in it and offers **Edit cart** or **Continue to payment**. It asks once per cart state: it returns only if the not-recommended bundles change.
- [x] A8.5 Matcher: biggest total saving first (the customer is never short-changed for a tidy pairing), then **more recommended pairs**, then fewer deal applications, then priority/config order. A mutation check confirmed the new test fails without the preference. Receipts are unchanged: they list the deal names and savings, but "recommended" markers are staff-facing so they're cart-only.
- [x] A8.6 Cart: a "Bundle deals" block under the lines with one card per bundle application, naming each item and variation, the saving, and "Recommended pair" / "Not a recommended pair". The underlying item lines stay as they are, because stock, refunds and Shopify order lines work per variant. So the bundle is shown as a single card, not merged into one line.
- [x] A8.7 Tried by you on a device (N9 ticked). Original steps: open Settings ▸ Discounts & bundles, rebuild one of your real deals in the GUI, and ring up a cart that triggers it. Check the item picker is quick enough with your full catalogue. It shows the first 80 matches and relies on search. Also try the "Not a recommended pair" prompt.
- Tests: `tests/bundleform.test.ts` (25 tests: percent, dates, recommended status and preference, form ↔ JSON round trip, hand-written JSON loading, prune/remove/toggle, form problems, checkout-check behaviour).
- Fixed while here: Settings had no page title for "Square history" (type error from 0008).

### A9. Gift cards: when they are created, and how codes are read
- [-] A9.1 Dropped (you changed your mind): adding a gift card to the cart only records the amount.
- [-] A9.2 Dropped (you changed your mind): prompt for recipient details once at charge time. Recipient details stay where they are today.
- [x] A9.3 The recipient gets exactly one gift card email, and only after the sale is recorded and the card exists. You confirmed Shopify already emails the recipient when a card is created with one (you got two when we also sent it), so 0010's explicit send was removed in 0011. `sendGiftCardEmail` stays for a manual resend only.
- [x] A9.4 Verified in the code, then tightened: a gift card is only created from the outbox, and a sale only enters the outbox once payment has completed (`recordSale`). Declined or abandoned sales never reach it. If creation fails after payment the item stays queued and retries (creation is idempotent by code). Finished cards are recorded on the queued sale (`giftDone`), so a retry skips them.
- [x] A9.5 `src/lib/giftCode.ts` (pure): `stripGiftPrefix` removes `^shopify-giftcard-v\d+-` (case-insensitive, any version, anchored, so a code containing hyphens is never cut), `normaliseCode` strips the prefix first, `giftQrPayload` builds the same string for printing, `isGiftQr` detects it. Used by lookup/check (typed, pasted or scanned), the Check gift card field, and gift card tenders at payment (the stored code is now the clean one). Scanning a gift card QR on the main item scanner now says to redeem it from Charge ▸ Gift card instead of "No item". Tests: `tests/giftcode.test.ts` (5).
- [x] A9.6 Answered by you (N10): two emails arrived, so the extra send is gone.

### A10. Gift card web page / QR / recipient form
- [-] A10.1 Not possible: Shopify's Admin API has no field for a gift card's customer web page. That link only exists inside Shopify's own email, so the app cannot print it as a QR. Replaced by A10.2 (our own page) and the card QR below.
- [x] A10.2 New Worker `gift-claim-server/` (own Shopify app, own secrets; README inside). After you sell a gift card with no email, the receipt step shows **Claim QR: customer adds their email**. The customer scans it, enters name, email and an optional message, and Shopify emails the card. Details: signed link `/c/<CODE>.<SIG>` (HMAC with `CLAIM_SECRET`, made by the POS), card found by last characters + the POS checksum note, only enabled cards with no recipient yet, one claim per card (locked first, unlocked if Shopify fails), per-IP rate limit, page shows only the last 4 characters. App side: `src/lib/giftClaim.ts`, Settings ▸ Gift cards ▸ Gift card claim page (URL + secret in the Keychain, included in backups). Tests: `tests/giftclaim.test.ts` (7), including that the app and the Worker agree on signatures.
- [x] A10.3 Manual recipient entry ("Email it" when adding the card) is unchanged and still the first choice. The receipt step also has **Gift card QR (for scanning at a register)**, which holds `shopify-giftcard-v1-CODE` (the A9.5 format) and works with the redeem and check scanners.
- [x] A10.4 Confirmed by you (N11 ticked): the Worker is set up and a test claim was done. Original steps: set the Worker up (README), sell a test card with no email, scan the Claim QR with your phone, and enter your email.

### A11. Zeller terminal shouldn't show our own sheet
- [x] A11.1 The card "waiting" sheet is gone. Root cause: our `Sheet` is a native `Modal`, and a native Modal always draws above everything in the app, including Zeller's popup, so it hid it. Now, while the terminal is working, Pay shows only a slim strip inside the page ("Waiting on terminal", the live status line, and Cancel) and locks the Card, Cash, Gift card and Split buttons so a second charge cannot start. Declined, unknown and reader-problem results still use our sheet, because Zeller's popup has finished by then. The rule lives in `src/lib/payUi.ts` with `tests/payui.test.ts` (4 tests). Confirmed on a real card payment by you (N12 ticked). Refund and Diagnostics never showed a sheet during a terminal call, so they are unchanged.
- [x] A11.2 Answer: **no, Zeller's popup cannot be placed inside a sheet of ours.** From the SDK source (`@zeller-public/payments-sdk-react-native` 0.2.5): `Zeller.Provider` (mounted at the app root in `zellerBridge.tsx`) draws the popup itself as a full-window absolute overlay with a blurred backdrop, holding a WebView. The window is up to 800 x 680, or full screen. It hides itself when idle. There is no prop to hand it a container, and the only look options are `fullscreen` and `theme` (both already accepted by `purchase`). So the way to avoid a double sheet is the one A11.1 uses: never draw a modal of ours while it is up.
- [x] A11.3 `scripts/package-zeller-sdk.sh` (`npm run zeller:pack`): bundles the Zeller SDK source from your machine into one zip you can send me. The SDK is gated, so the script strips credentials automatically first (registry tokens in `.npmrc`, API keys and secrets), scans the result for anything that still looks like a key, and refuses to produce the zip if it finds one. It prints the file list so you can review it.

### A12. Discounts that combine (Shopify automatic discounts)
Clarified: this is about the imported Shopify automatic discounts, not custom bundles. Bundles should also stack, which they already do.
- [x] A12.1 Custom bundles (`matchBundles` in `src/lib/bundles.ts`): each unit joins at most one deal, several deals apply in one order, the biggest total saving wins. Checked, no rewrite needed.
- [x] A12.2 `tests/compound.test.ts` (9 tests) covering that for bundles, including 6 Tadlings = one 5-deal.
- [x] A12.3 Tie-break for bundles: on an equal saving, fewer deal applications win.
- [x] A12.4 Root cause for Shopify discounts (fixed in 0006): step 2 of `priceCart` in `src/lib/pricing.ts` applies only the single best automatic discount. Today 8 Tadlings get the 5x deal but not the extra 3x, and 5 Tadlings + 2 cows get only the Tadling deal. A discount repeating on itself already works, so the fix is allowing several different automatic discounts in one order.
- [x] A12.5 New behaviour (`chooseAutoDiscounts` in `src/lib/pricing.ts`): each unit can receive only one automatic discount, several different discounts can apply to one order, and the combination with the biggest total saving wins. Examples that must pass: 8 Tadlings = 5x + 3x, 6 Tadlings = one 5x, 5 Tadlings + 2 cows = both deals. Confirmed with your real discounts (N5 ticked).
- [x] A12.6 `tests/autocombine.test.ts` (11 tests): the examples above, 10 and 13 Tadlings (repeats, with a `times` count on the line for the A12.8 display), 7 units where two small lots beat one big one, two variants of one product, percentage and buy X get Y deals, expired discounts.
- [-] A12.6a (dropped by you, see D1; no answer needed) Assumption that was open: a Shopify discount of the type "fixed amount off, minimum quantity N" now works as lots of N units that repeat (10 Tadlings = two 5x deals). Percentage deals and "each item" amounts keep their old meaning (every eligible unit, once). `lotDiscounts: false` in the pricing context restores Shopify's once-per-order amount. **You:** in Shopify, are your Tadling and cow deals "Amount off products" with a minimum quantity, or "Buy X get Y"? Both combine now, but I want to test your real setup.
- [-] A12.7 (you set this aside, see D2; reopen it if the multi-buy rows ever look wrong once A16 exists) Multi-buy logic reworked in 0006 as one application at a time (respects the per-order use limit across deals, never discounts a unit twice, caps each line at its remaining value). Still to review: display, and behaviour with price adjustments once A16 exists. Original note: review the multi-buy (buy X get Y) logic and how it displays. Cover price-adjusted lines, and any case where one discount spreads across two cart or order lines.
- [x] A12.8 (done in 0014, `src/lib/invoiceRows.ts`; the top row, struck-through price and final price were already how the cart showed it, so the change is the discount rows) Invoice-style cart rows: a small change to the current item row, not a redesign. The line shows the original price struck through with the final price beside it, then the unit maths, then one indented row per discount or adjustment. Example, 13 Tadlings with a Line price adjustment (I assumed `$40.00` is the final line total, since 52 - 8 - 2 - 2 = 40):
```
Tadling - Small            ~~$52.00~~  $40.00
13 x $4.00
  5x Tadlings (x2)                     -$8.00
  3x Tadlings                          -$2.00
  Line price adjustment                -$2.00
```
Each discount now sits on its own indented row with its own amount at the right edge, and a deal that applied twice shows `(x2)` after its name. The "Line price adjustment" row in the example arrives with A16. Tests are in `tests/swipe.test.ts`. Confirmed on a device by you (N13 ticked).

### A16. Price adjustments (Line, Item, Whole order)
Added from your A12 notes. Replaces today's single per-item price override.
- [ ] A16.1 **Line** adjustment: sets the final price of an entire line. It is worked out after bundles and discounts, stored as the difference, and shown as a "Line price adjustment" row under the line.
- [ ] A16.2 Review flag for Line adjustments: if another unit of the same item is added, or the discounts on that line change, flag the line and ask the cashier to Keep, Adjust or Remove the adjustment. A flagged line is highlighted with the reason (for example "2 more Tadling added" or "5x Tadlings discount changed"), and the cart header shows how many lines need review, so it stays clear in a large order.
- [ ] A16.3 **Item** adjustment: works as it does now, with a choice of "Fixed quantity" (a set number of units) or "All in cart" (every unit of that item in the order). The cashier is asked to double-check it at checkout.
- [ ] A16.4 **Whole order** adjustment: set from the ••• cart menu, sets the total for the entire cart. Cart and receipts show it like a whole-order discount. Same review prompt as A16.2 when lines or discounts change.
- [ ] A16.5 One checkout review screen listing every adjustment, flagged ones first, each with Keep, Adjust or Remove.
- [ ] A16.6 Edge cases I will handle: gift cards cannot be adjusted, an adjustment cannot take a line below $0, refunds use the price actually paid for the line, and adjusted lines still split correctly into Shopify order lines (`splitLineForOrder`).
- [ ] A16.7 Agreed by you: a Whole order adjustment and Line adjustments cannot both be active. Adding one asks to remove the other. Two overlapping adjustments make receipts hard to read and hard to refund.
- [ ] A16.8 Agreed by you: an optional reason for each adjustment, saved on the order and shown in Reports.
- [ ] A16.9 Agreed by you: adjustments can be limited by staff role. Every role is allowed by default, so nothing changes until you restrict one.

### A13. Swipe actions (cart lines, saved carts; not customers)
- [x] A13.1 `src/ui/SwipeRow.tsx`, built on React Native's own `Animated` and `PanResponder`, so there is **no new package and no native rebuild**. Swipe a row left: let go past halfway and a red button stays open (tap it to delete, tap the row to close it); drag most of the way across, or flick hard, and it deletes straight away. VoiceOver gets a "Delete" action, so swiping is never the only way. The sliding maths is pure and tested (`src/lib/swipe.ts`, `tests/swipe.test.ts`).
- [x] A13.2 Used on **cart lines** ("Remove", disabled while a part-paid sale is locked) and **saved carts** (these are the held carts). Saved carts ask "Delete saved cart?" first, the same as the Delete button, and slide back if you cancel. Customers are left alone, as you asked. The Notifications list has no per-row delete today, so it was not changed.
- [x] A13.3 Confirmed by you (ticked): swiping a cart line, flicking one and scrolling a long cart were tried on the iPad. Original check: tell me if a swipe ever fights the scrolling.

### A14. Collections: image in grid/lists, variant picker as in-grid sub-menu
- [x] A14.1 (done in 0016) Collection image on tiles + lists. Category tiles and groups that act like a collection show the collection's Shopify picture, and so do the category rows in Add tile and the sub-category picker. The Inventory and Items category filters are chip lists, so they stay text only.
- [x] A14.2 (done in 0017) Variant picker as a grid sub-page instead of a popup. Tapping a product with several variations replaces the grid with one tile per variation (photo, name, price, stock line). The path above reads `Home > Dragons > Highland cow`; the back arrow, or tapping any earlier name, returns to where you were. Picking a variation adds it and goes back. The quantity chips stay on screen, so ×3 still works. It also replaces the popup on the **All products** tab (`All products > Highland cow`). Out of stock and oversold variations stay tappable (stock may go negative by design). Changing tab, page, level or edit mode closes it. The Bluetooth scanner keeps working while it is open, because it is no longer a modal. Code: `VariantPicker` in `src/screens/Tiles.tsx`, rules in `src/lib/lookup.ts`.

### A15. New grid buttons: Lock POS, Price check, Stock check
- [x] A15.1 (done in 0017) **Lock POS** tile. Locks to the sign-in screen (PIN or cashier pass) and leaves the cart exactly as it is, a part-paid cart included. It works whenever staff exist, whether or not "Require PIN" is on (the lock screen now shows when staff exist and nobody is signed in). It refuses with a message when there are no staff (nothing could unlock it) or while a card payment waits on the reader (same rule as switching staff). The screensaver follows the same rule. Logged to the events CSV as a staff change. Code: `lockNow()` in `src/lib/staffAuth.ts`, rules in `src/lib/posLock.ts`.
- [x] A15.2 (done in 0017) **Price check** tile: scan (Bluetooth or camera) or search, shows the price big, the "was" price when compare-at is higher, SKU/barcode, stock, and the live Shopify automatic discounts and bundle deals the item can be part of. Nothing is added to the cart. A new scan replaces the result, so a stack of items can be checked quickly. Cashier passes and gift card QRs get their own message instead of "No item". Deals are a hint (minimum quantities still apply); the cart shows the final price. Code: `src/screens/Lookup.tsx`, `priceCheck`/`dealsFor` in `src/lib/lookup.ts`.
- [x] A15.3 (done in 0017) **Stock check** tile: scan or search a variation and see its stock first, then the stock of the other variations of the same product, with a total of the tracked ones. A product with a single variation (a plain item) shows only itself.
- [ ] A15.4 **You:** on the iPad, add the three tiles (Edit grid > Add tile > Actions; **new** layouts get them automatically, **existing** layouts do not). Then: tap a multi-variation product in a category and in All products, use the path and back arrow, change the quantity first; scan an item in Price check and Stock check (Bluetooth and camera); lock with the tile and unlock with a PIN and with a pass; try Lock POS with no staff and during a card payment. Tell me anything awkward, especially the picker with 20+ variations and the keyboard with the search field in the lookup sheets.
- Notes: a register still on an older app version drops the three new tile types from a synced layout (it counts them as unknown), so update every register before adding them. Lock POS drops you back to the Checkout screen state fresh after unlocking (the open category path is not remembered); the cart is untouched.

---

## C. Grid: nested categories, breadcrumb path, per-tile settings (from the "ADDITION AFTER PATCHES 1-3" section)
Done in 0016 together with A14.1, because they share the grid screens. A14.2 and A15 followed in 0017. How it works: `docs/GRID.md`.
- [x] C1 (done in 0016) Per-tile settings sheet in the grid editor (colour, label, and for categories/groups: choose sub-categories). Tap a tile while editing: label, colour, the collection a category or group shows, add or remove sub-categories and display groups, open it to edit its tiles, remove it (`src/screens/TileSettings.tsx`).
- [x] C2 (done in 0016) Nested categories: a category or display group tile can contain sub-categories, to any depth. Stored as `subs` on a category, so old layouts load unchanged.
- [x] C3 (done in 0016) Display groups can impersonate collections (a group acts like a collection tile). Pick a collection in the group's settings; it then shows that collection's items after its own tiles, minus anything in a sub-category inside it.
- [x] C4 (done in 0016) An item in both a sub-category and its parent shows only in the deepest sub-category, never in the parents (`ownProductIds` in `src/lib/gridNav.ts`). Items you pin yourself as tiles are never hidden by this rule.
- [x] C5 (done in 0016) Grid navigation keeps a path stack: Back goes up one level, not straight to depth 0. Changing page or tab returns to the top, and a layout change from another register steps back to the nearest level that still exists.
- [x] C6 (done in 0016) Path header like `Dragons > Extreme Dragons > Rose`, each level tappable to jump there. The first entry is the page name (Home), which jumps to depth 0.
- [ ] C7 **You:** (try this together with A15.4) on the iPad, edit the grid: open a category tile's settings, add a sub-category and a display group, open it to add tiles, then leave edit mode and check the path at the top, tapping an earlier name, and the back arrow. Check that an item in a parent and a sub-category shows only in the sub-category. Tell me if the settings sheet is awkward with the keyboard up.

---

## B. Round 2 list ("fun little bitsies")
Status as found in the zip you sent (I only inspected files; not run).
- [~] B1 Cash: denomination tap entry, drawer ledger, change finder, ML-weighted change, daily float report, Check Change, insufficient-change handling, undo/subtract. **Started in 0018 (ledger, denomination entry on the drawer screens, change finder). The Cash screen, scoring, Check Change and reports are still to come.** Confirmed by you (N7): all of it is meant to be part of the project, so it will be built as its own run of patches, with the tender machine reduced to the porting point in B1g.
  - [~] B1a ledger + denomination entry (done in 0018 for the drawer: open, paid in/out, correct contents, close count. The Cash screen at checkout, which adds sales to the ledger, is 0019) · [x] B1b `findCombinations` (done in 0018, `src/lib/changeFinder.ts`, see below) · [ ] B1c scoring + toggle · [ ] B1d Check Change · [ ] B1e cash screen prompts + split suggestion · [ ] B1f daily float report · [ ] B1g tender-machine adapter: one empty function (the porting point you will fill in later) and nothing else. Its Settings toggle is greyed out and locked to Off, with the reason "Under Construction". Everything else in B1 is done by hand: the cashier enters and confirms notes and coins, and the screen shows which notes and coins to take out
  - **0018 details.** Notes and coins are Australian ($100, $50, $20, $10, $5, $2, $1, 50c, 20c, 10c, 5c). `src/lib/cashLedger.ts` holds the pure rules; `src/ui/DenomPad.tsx` is the tap pad; `src/screens/Drawer.tsx` uses them. The ledger (`pos.ledger`, saved with the rest of the till data) is the counts now in the drawer plus a history (newest first, last 1,000) of who put in or took out what, and when.
    - **Tap pad:** tap a note or coin to add one; Add / Remove switch; ×1 ×5 ×10 per tap (for rolls of coins); **Undo** takes back the last tap and says what it removed ("Undid: Added $20 ($20.00) · total now $85.00"); Start over. Removing from zero does nothing and says so.
    - **Open drawer:** starts from what the ledger says is already in the drawer (carried over from the last close), so you only adjust it. The float is the total. **Paid in / Paid out:** tap the notes and coins; paid out warns if you take more than the ledger holds (it may not know about cash sales yet) and lets you carry on. **Count & close:** a blind count from zero; it tells you over/short against expected, writes the notes and coins into the Z-report, and what you counted becomes the new ledger. **Correct contents:** adjust the ledger by hand with an optional reason.
    - Counts never show below zero. The history entry keeps exactly what was entered.
    - **Change finder** (`findCombinations`, your function): same answers as yours. I added only (1) skipping branches that cannot reach the target and (2) an optional node cap (`findCombinationsLimited`) that says when it stopped early, so a very full drawer cannot freeze the iPad. Tested against a copy of your original on 200 random drawers (same results, same order). Note it returns combinations above and below the target within the tolerance, exactly as you wrote it; the Cash screen will only offer ones that give the customer at least what they are owed.
    - **Not yet connected:** cash sales do not touch the ledger until the Cash screen is rebuilt in 0019 (you enter the notes and coins the customer hands over, and the screen shows which to give back). Until then the ledger only knows about the drawer screens.
  - [ ] B1h **You:** on the iPad, open the drawer (check the carried-over contents), do a paid in and a paid out, correct the contents, then count and close. Tell me if the tap pad is awkward (button size, the Add/Remove switch, ×5/×10) or the Z-report text reads wrong.

- [x] B2 Cashier passes (`StaffPass.tsx`, `StaffLogin.tsx`, `passCard.ts`, `badge.ts`) - present in zip. Wallet pass: you ticked N6 and D6, which I read as the Apple Pass Type ID certificate being set up. Tell me if that tick meant something else.
- [x] B3 Screensaver + keep-awake (`Screensaver.tsx`, `screensaver.ts`, `idle.ts`) - present in zip.
- [x] B4 Bundle GUI (same as A8, done in 0009)
- [ ] B5 Simple / Minimal / Custom staff modes
- [ ] B6 Training mode (Info → Show → Guide → Check → Gratify)
- [ ] B7 In-app docs (Markdown, Basic/Deep/Advanced) + docs Worker
- [ ] B8 Extra ideas (saved for last, after E1 below)

---

## E. Late queue item (added by you)
Placed after every part it touches is built (the gift card claim page is done, the docs Worker is B7) and before B8, the extra ideas.
- [ ] E1 Style the Workers like your main Shopify site, and give each its own subdomain. Workers today: the gift card claim page (`gift-claim-server/`, A10.2), the receipt server, and the docs Worker from B7 once it exists. Plan: one shared stylesheet and header/footer (logo, colours, fonts, spacing) copied from your storefront, used by every Worker page, then one subdomain per Worker (for example `gift.` and `docs.` on your own domain) added as a custom domain in each Worker's `wrangler.toml`, with a short step-by-step in each Worker's README. Needs N14.

## Notes
- Tests: in my sandbox the Zeller SDK cannot be installed (private registry), so I install everything else and run the pure-logic tests. Latest run: all pass (212 after patch 0018). `npm test` on your machine runs the same files.
- Type-checking: since your Zeller zip I can run `tsc --noEmit` against the real Zeller SDK types too (v0.2.5), and it is clean after 0014. From patch 0009 on I can run `tsc --noEmit` by installing every dependency except the gated Zeller SDK. It is clean after 0010 (it found one real error in my first draft of 0010, fixed before sending). Please still run `npm run typecheck` on your machine, since your copy has the real SDK types.

---

## Needed from You
**Blocking** = I cannot finish that item without it. **Non-blocking** = I carry on with an assumption and adjust once you reply.
Ordered by priority, highest first.

### Priority 1
- [x] N1 Received: the Zeller SDK zip arrived and was enough to answer A11.2. Thank you.

### Priority 2
- [-] N2 No longer needed (A7 uses the Square API, not CSV).
- [x] N8 **Non-blocking (A7):** run `tools/square-history` (README there), import on the iPad, and check one day's Net sales against Square's report. Tell me the matched-lines count shown after import and anything that looks off.
- [ ] N3 **Non-blocking (every patch):** run `npm run typecheck` after applying each patch and tell me any errors. I can type-check everything except the Zeller SDK's own types here.
- [x] N9 **Non-blocking (A8):** try the bundle builder on a device (see A8.7) and tell me anything awkward: the item picker, the date fields, the recommended-pair flow, the pre-payment prompt.
- [x] N4 **Non-blocking (A2.7):** test the scanner double click (shows or hides the on-screen keyboard) with the scanner paired.
- [x] N5 **Non-blocking (A12):** ring up a cart that should trigger two of your real discounts at once (for example 8 Tadlings, or 5 Tadlings + 2 cows) and tell me if the totals look right.

- [x] N10 Answered: two emails arrived with 0010. Fixed in 0011 (the app no longer sends its own).

- [x] N11 **Non-blocking (A10.4):** set up `gift-claim-server` (its README) and test one claim. Skip it if you don't want the claim page; the app hides the Claim QR until the URL and secret are filled in.

- [x] N12 **Non-blocking (A11.1):** take a real card payment (even $1) and check that only Zeller's own popup shows, with no extra sheet of ours on top. Also press Cancel on the slim strip once and tell me what happens.

- [x] N13 **Non-blocking (A13, A12.8):** swipe and scroll test on a device (see A13.3), and look at a cart with two discounts on one line to check the new rows read well.

- [ ] N14 **Non-blocking (E1, not needed until the end of the queue):** the address of your main Shopify site (so I can match its logo, colours and fonts), the domain you want the subdomains on, and where its DNS is managed (for example Cloudflare). I will carry on without it and ask again when E1 comes up.

- [ ] N15 **Non-blocking (A14.2, A15):** the device test in A15.4.
- [ ] N16 **Non-blocking (B1):** the drawer device test in B1h.

### Priority 3
- [x] N6 **Non-blocking (B2):** the Apple Pass Type ID certificate for Wallet passes. Printed cashier passes work without it. 
- [x] N7 Answered: yes, all of B1 is meant to be built. The automatic drawer connector is only a minimal, almost empty porting point for you to fill in later, controlled by a greyed-out setting stuck on Off with the reason "Under Construction" (see B1g and D5).

---

## Deferred
Set aside by agreement. Ordered by priority, highest first.

### Medium
- [-] D1 (dropped by you) A12.6a: which Shopify discount type your Tadling and cow deals use ("Amount off products" with a minimum quantity, or "Buy X get Y"). Both combine now. Deferred by you, to be answered later.
- [-] D2 (dropped by you) A12.7: review the display of multi-buy discounts with price adjustments. Waiting on A12.8 and A16.

### Low
- [-] D3 (dropped by you) A2.7: talking to the scanner directly over BLE. Not needed while the double-click keyboard toggle works, and POS-mate publishes no protocol details (we would have to ask them).
- [x] D4 A7.2: Square Orders API importer: done in 0008 (CSV dropped).
- [ ] D5 B1g: the tender machine adapter is built as one empty function plus a greyed-out, locked-Off setting ("Under Construction"). Filling it in waits until you have built the hardware.
- [x] D6 B2: Wallet pass, until the certificate in N6 is set up. Done (ticked by you).
- [ ] D7 B8: extra ideas, saved for last (after E1).
