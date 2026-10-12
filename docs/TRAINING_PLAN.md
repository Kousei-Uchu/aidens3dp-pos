# Training module plan

The full list of training modules planned for the POS app, ordered from most critical (cannot use the till without it) to least (owner-only, set once and forgotten). The aim is a module for every feature, built one at a time, each as its own numbered patch.

Writer's guide for building a module: `src/training/README.md`. How training works for staff: `help/staff/training.md`.

## State of play

- **Built:** `welcome` (earlier patches), `sign-in` (0093), `cart` (0094) and `find-items` (0098).
- **Next:** `pay-card`, then `pay-cash`, `receipts`.
- **Reserved ids:** `src/lib/trainingRemedies.ts` points stray mistakes at `cart`, `discounts`, `price-adjust`, `customer` and `pay-card`, so those must use exactly those ids. `cart` now exists, so its "taught in" links work.
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
5. **`pay-card`: Take a card payment.** The Charge screen and the Zeller terminal, including the customer side using the virtual terminal in manual mode.
   - Guide: Charge, Card, customer taps, approved, receipt prompt.
   - Check 2: a declined card (51), then retry or switch method. Also reader not ready, and a result that comes back unknown ("Checking...", never re-charge).
6. **`pay-cash`: Take cash and give change.** Tap the notes and coins handed over (the denomination pad), change from the drawer, 5c rounding.
   - Guide: Charge, Cash, tap denominations, undo or subtract an entry, change shown, done.
   - Check 2: no change available in the drawer (ledger injection), so split or ask for card. Also a customer who hands over too little.
7. **`receipts`: Finish a sale and send the receipt.** Email, text, QR, share or no receipt, plus the "not published yet" case.

## Tier 2: everyday variations on a sale

8. **`customer`: Customers and notes.** Attach, find or create a customer, line notes, and remove the customer.
9. **`discounts`: Discounts.** Line and cart discounts, code presets, a custom % or $, automatic deals, and what is excluded (`no-discount`).
   - Guide: apply to a line, apply to the cart, remove it.
   - Check 2: a customer asks for a discount you should not give, or a deal does not apply because the minimum quantity is not met.
10. **`price-adjust`: Change a price.** Item, line and whole-order adjustments, reasons, and the review flag.
11. **`bundles-deals`: How deals show up.** Bundles and compound discounts, using the Highland cow and Tadling example. This is read-and-spot, not setup.
12. **`scanning`: Scan items.** Bluetooth scanner and camera, the Done pop-up, and what a scan does on each screen.
    - Check 2: a barcode that matches nothing, and a cashier pass or gift card scanned by mistake.
13. **`split-pay`: Split and part payments.** Equal split, by amount, and cash plus card.
14. **`gift-sell`: Sell a gift card.** Prompted at checkout, handover or email, code and QR after payment.
15. **`gift-pay`: Check and pay with a gift card.** Balance check, redeem as tender, and the card being charged straight away.
16. **`saved-carts`: Park and resume a sale.** Save, open, merge ("Merge Carts?"), and assign to a customer.
17. **`stock-lookup`: Price check and Stock check.** Scan or search, deals shown, other variations' stock, and what the stock words mean (oversold, not tracked).

## Tier 3: regular but not every sale

18. **`refund`: Refunds and exchanges.** Pick items or an amount, reason, refund method, restock, and charge or refund the difference.
    - Check 2: the original card refund fails, so switch method.
19. **`orders`: Find a past sale.** Orders vs Transactions, search, reprint or new receipt, and mark fulfilled.
20. **`drawer-day`: Open, paid in/out, count and close.** Float, the Z-report, and count vs expected.
21. **`check-change`: Check change before taking notes.** Enter what the customer has, and read "worth it" vs "ask for card".
22. **`swap-cash`: Swap your own cash with the drawer.** Enter what you hold and see what the swap would do.
23. **`reader-trouble`: Reader not ready or pairing.** Tell reader trouble from a decline, and re-pair.
24. **`offline`: Offline, queued sales and sync.** What still works, the outbox, and retrying without duplicating a sale.
25. **`customers-list`: Manage the customer list.** Create, edit, start a sale from a customer.

## Tier 4: manager and occasional

26. **`inventory`: Inventory.** Search, filter, group variations, receive, adjust and count, and negative stock.
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
