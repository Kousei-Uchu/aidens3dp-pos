# Training module plan

The full list of training modules planned for the POS app, ordered from most critical (cannot use the till without it) to least (owner-only, set once and forgotten). The aim is a module for every feature, built one at a time, each as its own numbered patch.

Writer's guide for building a module: `src/training/README.md`. How training works for staff: `help/staff/training.md`.

## State of play

- **Built:** `welcome` (earlier patches), `sign-in` (0093), `cart` (0094), `find-items` (0098), `pay-card` (0099), `receipts` (0105), `customer` (0106), `discounts` (0107) `pay-cash` (0108) and `refund` (0109, the first of tier 3, built out of order at your request) `price-adjust` (0110), `bundles-deals` (0111), `scanning` (0112), `inventory` (0121), `split-pay` (0122), `gift-sell` (0129), `gift-pay` (0130), `saved-carts` (0131) and `stock-lookup` (0132).
- **Next:** `orders`/the remaining tier-3 courses (see the list below).
- **Reserved ids:** `src/lib/trainingRemedies.ts` points stray mistakes at `cart`, `discounts`, `price-adjust`, `customer` and `pay-card`, so those must use exactly those ids. `cart` now exists, so its "taught in" links work.
- **Guidance engine (0113):** the off-course card now plans its way back on an app-wide navigation graph (`docs/ROUTEGRAPH_GUIDANCE.md`, `src/app.navgraph`). It does not change a course's words; a module still just declares `allow`, `at`, `watch` and its fixes. **Scoped runs (0114):** a `modules` tag on screens/edges keeps a walk inside the run it is for, so a course is never sent through a place the everyday till owns (the real camera) and vice versa, and a course never reaches a page its own `routes` disallow. **Per-instance scopes (0115):** the same tag can be put on a runtime instance (a product, a row, a user) when it is registered, so a course never names an instance another run owns even when they share a screen.
- **Per-module checklist:** add the file, register it in `src/training/index.ts`, add any new spot ids to `src/lib/trainingSpots.ts`, and fill in `PLANNED_TITLES`. Each Check 2 failure needs `taughtBy`, and Check 2 never covers admin problems. A course that needs known staff sets `practiceStaff` (see 0093).

Format below: **id**, what it covers, the Guide steps, and the Check 2 failure for customer-facing modules. "(done, 00NN)" marks a built module.

## Tier 1: you cannot use the till without these

1. **`welcome`** (done). How training works.
2. **`sign-in`: Sign in, lock and switch staff** (done, 0093). PIN or cashier pass, and the Lock POS tile.
   - Guide: enter PIN, scan a pass, check who is signed in, switch staff, lock.
   - Check 2: a cancelled pass, so the PIN is the way in; and a switch while a sale is in the cart.
3. **`cart`: Build a cart** (done, 0094). Tiles, quantity, swipe to remove, the total.
   - Guide: tap a tile, tap it again, swipe-remove.
   - Check 2: the customer swaps one item for another, so you remove one and add one.
4. **`find-items`: Find the right item** (done, 0098). Quick Menu pages, categories, All products, keypad and custom amount, search, and the variation picker.
   - Guide: change page, drill into a category, search, pick a variation, enter a custom amount.
   - Check 2: the customer swaps a Small Highland Cow for the Large, a search that shows two matches (the dragon, not the egg), and two items that sit together on the Extras page.
5. **`pay-card`: Take a card payment** (done, 0099). The Charge screen and the Zeller terminal, including the customer side using the virtual terminal in manual mode.
   - Guide: Charge, Card, customer taps, approved, receipt prompt.
   - Check 2: a declined card (51), then retry or switch method. Also reader not ready, and a result that comes back unknown ("Checking...", never re-charge).
   - As built: Guide takes one sale by card with the person playing the customer at the terminal (`card: 'manual'`). Check 1 adds a sale over $100 that needs a PIN. Check 2 declines once (51) and then twice (54), so the person retries. **Not in Check 2:** reader not ready and an unknown result. There is no injection for either, so the Show teaches them and a later patch can add the injections.
6. **`pay-cash`: Take cash and give change** (done, 0108). Tap the notes and coins handed over (the denomination pad), change from the drawer, 5c rounding.
   - Guide: Charge, Cash, tap denominations, undo or subtract an entry, change shown, done.
   - Check 2: no change available in the drawer (ledger injection), so split or ask for card. Also a customer who hands over too little.
   - As built: Guide takes a $14.00 sale: taps $10 (Short by $4.00), $5 (Change $1.00), Undo, $10 again ($20.00, change $6.00), Next, Gave this, No receipt. Check 1: exact cash; $20 for $14. Check 2: a customer short by $4.00 who finds more (taking it as a part payment restarts the goal), 5c rounding ($7.44 becomes $7.45 in cash, set up with a 7% cart discount), and a drawer with only big notes (the window offers $10.00 cash plus the rest another way). Practice uses the practice drawer (`train-` ledger), never the real one.
7. **`receipts`: Finish a sale and send the receipt** (done, 0105). Email, text, QR, share or no receipt, plus the "not published yet" case.
   - As built: the card is taken automatically (`card: 'auto'`), then Guide steps through Email link, Text link, Share, Show QR code (which says Not published yet) and No receipt. In practice the Receipt window is given a made-up receipt server so it offers the QR code, and Email, Text and Share never open another app: they say what would have opened. Check 1 and Check 2 chain on the one open window (email, text, none; QR then text, share, none), so a goal can be finished by a button press. Gift card receipts (claim QR, Wallet) are not covered.

## Tier 2: everyday variations on a sale

8. **`customer`: Customers and notes** (done, 0106). Attach, find or create a customer, line notes, and remove the customer.
   - As built: Guide adds a sale, searches for priya, picks her, types a note on a line and taps Done, takes her off with the x, then creates a new customer. Check 2: the wrong customer is on the sale (Sam, should be Priya), and a new customer who is not on the list. In practice Create customer is made on this iPad only and Search Shopify is hidden.
9. **`discounts`: Discounts** (done, 0107). Line and cart discounts, code presets, a custom % or $, automatic deals, and what is excluded (`no-discount`).
   - Guide: apply to a line, apply to the cart, remove it.
   - Check 2: a customer asks for a discount you should not give, or a deal does not apply because the minimum quantity is not met.
   - As built: Guide discounts the Red Dragon on its line (keys 1, 0, Apply), then the cart with the Practice 10% preset, then removes it. Check 1 repeats that. Check 2: a no-discount item (Clearance Print, Discount row says Not discountable), an automatic deal that needs three Keyrings, and a cart discount that was put on by mistake. Practice data gained the print, a second preset and the Keyring deal. The cart injection can now start with `discountPct`. The Show covers custom $ amounts only in passing; a code preset is the same as a preset chip here.
10. **`price-adjust`: Change a price** (done, 0110). Item, line and whole-order adjustments, reasons, and the review flag.
   - As built: Guide changes the Bumble Bee's item price ($6.00, All in cart, optional reason) and resets it, sets the Red Dragon's line price ($20.00) and removes it, sets a whole order price ($30.00), then Charge shows the review and Continue to payment. Check 1: item, line and order prices. Check 2: a price on the wrong item, a price that must cover every Sticker Pack including later ones, and a flagged price at the review (a second Bumble Bee added after the line price was set). Practice allows every role to adjust, so permission limits are explained, not practised.
11. **`bundles-deals`: How deals show up** (done, 0111). Bundles and compound discounts, using the Highland cow and Tadling example. This is read-and-spot, not setup.
   - As built: read-and-spot, with nothing to set up. Guide builds eight Tadlings, then rings the `5 Tadlings` and `3 Tadlings` rows and the totals, adds a Small cow, and rings the Bundle deals box. Check 1: three Tadlings, five, a Small cow. Check 2: a fifth Tadling for the bigger deal, swap a Large cow for a Small one (not a recommended pair), and continue past the Check these bundles window. Practice data gained a Tadling (on the Home grid), the deals from the help's worked example (titled `2 Highland cows`, `3 Tadlings`, `5 Tadlings`, so the rows read clearly) and a practice bundle (`PRACTICE_BUNDLES`: cow with Tadling, $3 off, Small cow recommended). Note the help's worked example calls the rows `5x Tadlings`: the till shows the deal's own title, so the practice titles carry the count.
12. **`scanning`: Scan items** (done, 0112). Bluetooth scanner and camera, the Done pop-up, and what a scan does on each screen.
    - Check 2: a barcode that matches nothing, and a cashier pass or gift card scanned by mistake.
    - As built: a camera cannot scan practice items, so in practice the camera window is replaced by a practice camera window (`src/ui/PracticeScan.tsx`) of drawn barcode cards (`src/lib/trainingScan.ts`): Bumble Bee, Red Dragon, Sticker Pack, a torn label (a Keyring) and a gift card, each with a Scan this button. It behaves like the real window: stays open, green or red message, Done. Guide (15 steps) opens the camera, scans two items, scans the torn label (red, nothing added), adds the Keyring by tile, scans the gift card (red, take it at Charge) and closes with Done. Check 1: the Red Dragon by camera, a Bumble Bee and a Sticker Pack then Done, a second Bumble Bee then Done. Check 2: a torn Keyring label (no card scans the Keyring, so it has to be added by hand) and a gift card that must be taken to Charge, Gift card. **Not practised:** the Bluetooth scanner (it has no window, so it is taught in Info, Show and one Guide step) and a cashier pass scanned by mistake (on Checkout that signs the person in, and practice never changes who is signed in on the real till), so the pass is taught in Info and Show only.
13. **`split-pay`: Split and part payments.** Equal split, by amount, and cash plus card.
    - As built (0122): Guide makes a $14.00 sale (Bumble Bee + Dragon Egg), opens the Split window, taps Split equally 2, takes the first $7.00 in cash ($5 + $2, exact) and the second $7.00 by card on the terminal, then No receipt. Check 1 repeats that, then keys a first amount ($5.00) and lets the rest follow. Check 2: the card is declined on the first part so that part is taken in cash instead, and a customer changes their mind so Cancel split puts the whole amount back on one card payment. The Split window had no graph screen, so `sheet_split` was added and the graph rebuilt.
14. **`gift-sell`: Sell a gift card.** Prompted at checkout, handover or email, code and QR after payment.
    - As built (0129): sold from the cart menu (the practice grid has no gift tile), opened on the amount step. Guide makes one $25.00 hand-over card and pays for it by card, so the receipt carries the code and QR. Check 1 keys a $30.00 amount and adds it, then sells a $25.00 card and takes the payment. Check 2: the card is declined once and Try card again takes it, then a $50.00 card is emailed (`lastGift` tells the emailed card from a hand-over one). The Sell gift card windows were already on the graph; the bogus `tab_checkout -> sheet_gift_sell` edge (the real action is `add_gift_card`, not `grid.action:gift`) was replaced by `sheet_cart_menu -> sheet_gift_sell`. Gift card receipts (claim QR, Wallet) stay with `gift-pay`.
15. **`gift-pay`: Check and pay with a gift card.** Balance check, redeem as tender, and the card being charged straight away.
    - As built (0130): practice cards are a new in-memory store (`src/lib/trainingGifts.ts`): `TRAINPRACTICE1` and `GIFT25` ($25.00), `GIFT05` ($5.00) and `GIFTOFF` (disabled). Shopify's `lookupGiftCard`/`debitGiftCard`/`giftCardHistory` go to it while `isTraining()`, so a code is never looked up or charged for real. The course lives on Checkout and the Payment page. Guide (14 steps): add two items ($14.00), Charge, Gift card, type GIFT25, Check, Use as payment, No receipt. Check 1: check a balance, then pay a $14.00 sale from the card (one tender, `gift_card`). Check 2: a card holding $5.00 takes part of the sale and the rest goes on card (tenders `gift_card` + `card`), then a disabled card (`GIFTOFF`) is checked and the whole sale is taken by card. The Check gift card window now names itself on the app graph (`sheet_gift_check`, already reachable from `page_pay` via `pay.gift`) and publishes the typed code and the last card looked up (`giftCode`, `giftCheck`), so a Check can tell which card was checked and whether it could pay.
16. **`saved-carts`: Park and resume a sale.** Save, open, merge ("Merge Carts?"), and assign to a staff member.
    - As built (0131): the course lives on Checkout and the More tab (`tabs: ['checkout', 'more']`, routes `cart` and `saved`). Guide (22 steps): add an item, ⋯ ▸ Save cart, name it, Save to Saved carts (the till clears), More ▸ Saved carts, open Sam's cart on the empty till, add another item, open Priya's cart and Merge, then Assign → Casey. Check 1: park a sale; open Sam's cart on an empty till; merge a saved cart into a till that already has an item; hand a saved cart to a workmate. Check 2: merge with the till not empty (taught by the Show's `merge` step), and, signed in as practice manager Morgan, assign the waiting cart to Casey (taught by the Show's `assign` step). Training reads the practice saved carts (`savedCarts`), the typed name (`savedNameDraft`) and the cart the till was opened from (`cartSavedFrom`); the sandbox seeds two made-up carts (Sam, holding for Friday; Priya, pickup Tuesday) that are never synced (`pushSaved` stops at `hasCreds()` under training). The Merge Carts? prompt is the till's own native confirm, so it is taught in Show rather than ringed. The course uses `practiceStaff`, so the handover offers Casey and Morgan, never the real staff list. The Saved carts selection window folds into `page_saved` on the app graph and the Save cart window is `sheet_save_cart`; new spots `cart.menu.save`, `saved.name`, `saved.save`, `saved.open`, `more.saved`, `saved.row:<id>` and `saved.assign:<staffId>`. The plan line says "assign to a customer"; the real feature assigns to a staff member, so the course teaches that (recorded in `docs/GUESSES.md`).
17. **`stock-lookup`: Price check and Stock check.** Scan or search, deals shown, other variations' stock, and what the stock words mean (oversold, not tracked).
    - As built (0132): the course lives on Checkout (`tabs: ['checkout']`). Guide opens both Price check and Stock check from the grid, scans items, reads prices, deals, stock lines, other variations and totals. Check 1: Price check Egg timer ($6.00, 600 in stock), Stock check Sticker pack (300 in stock). Check 2: Price check Cow small shows no deal (20% off is Keyrings only), Stock check Cow large shows two variations and 3000 total, and the four stock words (In stock, Out of stock, Not tracked, Oversold) taught in Info. Practice uses the training variants' known stock (BEE 800, EGG 600, KEY 500, STICKER 300, DRAGON 2500, TAD 400, COW_S 1200, COW_L 1800). The Lookup sheet has spots `lookup.search`, `lookup.scan`, `lookup.clear` and publishes `lookupMode` and `lookupResult` for Checks.

## Tier 3: regular but not every sale

18. **`refund`: Refunds and exchanges** (done, 0109). Pick items or an amount, reason, refund method, restock, and charge or refund the difference.
    - Check 2: the original card refund fails, so switch method.
    - As built: practice orders in `src/lib/trainingOrders.ts` (#T1001 card, #T1002 cash, #T1003 card). Guide goes More ▸ Orders ▸ order ▸ Refund or return and covers items, Amount, reason, Refund to (Original, Cash, Gift card), Restock, a replacement item (shown, never paid), a card refund and a cash refund with the Give cash window. Check 2 makes the card refund fail with code 33 every time so Cash is the way out, then a damaged item (Restock off) and a single Keyring. A real swap is not taken in practice because it ends on the Payment page.
19. **`orders`: Find a past sale.** Orders vs Transactions, search, reprint or new receipt, and mark fulfilled.
20. **`drawer-day`: Open, paid in/out, count and close.** Float, the Z-report, and count vs expected.
21. **`check-change`: Check change before taking notes.** Enter what the customer has, and read "worth it" vs "ask for card".
22. **`swap-cash`: Swap your own cash with the drawer.** Enter what you hold and see what the swap would do.
23. **`reader-trouble`: Reader not ready or pairing.** Tell reader trouble from a decline, and re-pair.
24. **`offline`: Offline, queued sales and sync.** What still works, the outbox, and retrying without duplicating a sale.
25. **`customers-list`: Manage the customer list.** Create, edit, start a sale from a customer.

## Tier 4: manager and occasional

26. **`inventory`: Inventory.** Search, filter, group variations, receive, adjust and count, and negative stock.
   - As built (0121): tab `inventory` only, its own starting stock (Dragon Egg -3, Keyring 0, Sticker Pack 2). Guide covers the Low, Negative and All chips, search, Receive, Adjust (Remove, damaged), Count and Nested view; the Filters window (category, status, sort) is described in Info but not practised. Apply changes practice counts only.
27. **`items`: Items and creating one.** Edit price and identifiers, and create a tracked product.
28. **`adjust-review`: Review price adjustments.** The manager approval queue.
29. **`reports`: Reports.** Periods, registers, comparisons, payment and category totals, gift card totals, and sharing.
30. **`float-report`: Daily float report.** Takings, recommended banking and float, and recording a bank run.
31. **`stock-mismatch`: When stock differs from Shopify.** Refresh, check tracking, and local vs Shopify counts.
32. **`edit-grid`: Edit the Quick Menu.** Pages, tiles (items, categories, groups, actions, discounts), reorder, and push to other registers.
33. **`display-modes`: Standard, Simple, Minimal and Custom.** Per-staff mode, theme and tile size.
34. **`guided-checkout`: Guided checkout.** The question-and-answer sale flow.

## Tier 5: owner only, set once and forgotten

35. **`staff-admin`: Add staff, roles and PINs.** Cashier vs Manager vs Owner, and requiring sign-in.
36. **`cashier-passes`: Issue cashier passes.** Create, print, share, and add to Wallet.
37. **`bundle-builder`: Create a bundle deal.** The GUI builder, plus the JSON route.
38. **`shopify-connect`: Connect Shopify.** Domain, credentials, test, location, and import.
39. **`zeller-setup`: Set up the Zeller reader.** Diagnostics setup and the $1 test with refund.
40. **`payment-settings`: Payment settings.** Cash rounding, Smart change, and card fee rates.
41. **`receipt-settings`: Receipt page and business details.** ABN, return policy, and GST invoices.
42. **`hardware`: Pair a Bluetooth scanner.** HID suffix and the scanner test.
43. **`screensaver`: Screensaver and keep-awake.**
44. **`theme-tiles`: Theme, accent and tile size.**
45. **`square-import`: Import Square history.** Export on a PC, then import onto each register.
46. **`backup`: Backup, restore and local CSV data.** Export and import, and deleting local history.
47. **`gift-claim`: Gift card claim page.** The Worker, plus the Wallet passes (currently switched off by the `GIFT_CARD_PASSES` flag).
48. **`tender-machine`: Cash tender machine.** Currently "under construction", so this is a placeholder.
49. **`diagnostics`: Support and diagnostics.** Notifications and reading sync errors.
50. **`help-system`: Using Help.** Basic, Deep and Advanced, and the Help button in each screen.

## Notes on the order

- **Sign-in at 2:** the cashier cannot reach anything else without it, though if you never use PINs on a given register you could move it down.
- **Tiers 1 and 2** cover every fix the remedies table already points at, so building them in order means "taught in..." links start working early.
- **Tier 1 is the sale loop:** signed in, build, find, pay (card or cash) and receipt. Everything after it is a variation or an exception.
