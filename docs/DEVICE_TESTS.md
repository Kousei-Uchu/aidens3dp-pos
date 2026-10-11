# Device tests: how to do each one

These are the tests only you can run (they need the iPad, a scanner, a cash drawer or a live Shopify store). Each one lists what to set up, the steps in order, what a pass looks like, and what to tell me. Menu names are the ones in the app today. The full click-through guide with a notes box for every step is a Final Touches item (F7); this file is its source.

Report back in one line per test: **pass**, **fail** or **awkward**, plus anything you saw. A screenshot is welcome but never required.

## Before you start

- Update every register to the latest build. A register on an older build ignores display modes and has none of the newer screens.
- Run `npm run typecheck` once (you have, and it passes).
- Have ready: one product with 20 or more variations, a second product with 2 or 3 variations, a few ordinary items, a cheap test gift card, some real notes and coins in the drawer, a Bluetooth scanner, and two staff accounts with different roles (one Owner, one Cashier).
- Use a test sale for everything below and refund or void it afterwards, or run these on a quiet day.

---

## T1. Grid: new tiles, nested categories, path bar (A15.4, C7, N15)

Set up: Edit grid mode on the iPad.

1. Edit grid ▸ Add tile ▸ Actions. Add **Lock POS**, **Price check** and **Stock check**. (A new grid gets them automatically; a grid made earlier does not.) Pass: all three tiles appear.
2. Open a category tile's settings. Add a **sub-category** and a **display group**. Open each and add tiles inside. Go two or three levels deep. Pass: nesting works to any depth. Note whether the settings sheet is awkward with the keyboard up.
3. Put one item in both a parent category and one of its sub-categories. Leave edit mode and open the parent. Pass: the item shows only in the sub-category, not in the parent.
4. Look at the bar at the top while you are inside nested categories. Pass: it shows the full path (for example `Dragons > Extreme Dragons > Rose`); tapping an earlier name jumps straight there; the back arrow goes up one level at a time.
5. Tap the 20+ variation product from inside a category, then again from **All products**. Change the quantity **first**, then pick a variation. Pass: the variation picker opens inside the grid (not as a pop-up), the quantity you set is used, and it scrolls and searches comfortably with 20+ variations.

Tell me: anything awkward, especially the 20+ picker and the settings sheet with the keyboard up.

## T2. Price check, Stock check, Lock POS (A15.4, N15)

1. Tap **Price check**. Scan an item with the Bluetooth scanner, then with the camera, then type part of a name. Pass: the price shows and nothing is added to the cart. The keyboard must not cover the results.
2. Tap **Stock check**. Scan a variant of the 2 or 3 variation product. Pass: it lists the stock of the other variations of the same product. Scan a single item with no variations. Pass: it shows that item's own stock.
3. Tap **Lock POS**. Pass: the lock screen appears. Unlock with a PIN. Lock again and unlock by scanning a staff pass.
4. Sign out of every staff account if your setup allows it, then tap Lock POS. Tell me what happens.
5. Start a card payment so the waiting strip shows, then try to lock. Tell me what happens (it should refuse or warn, not lose the payment).

## T3. Cash drawer: open, paid in and out, correct, count and close (B1h, N16)

Go to **More ▸ Cash drawer**.

1. If it says no drawer is open, tap **Open drawer with float**. Pass: the sheet shows what the drawer held last time and the pad is already filled with those notes and coins. Adjust to what is really in the drawer and tap **Confirm**.
2. Try the tap pad: tap a note, tap **Add / Remove** to take one off, use **×5** and **×10**, **Undo** (it should say what it removed and the new total), and **Start over**. Tell me if the buttons are too small or the Add/Remove switch is confusing.
3. **Paid in**: type a reason, tap some notes, Confirm. **Paid out**: same. Pass: Expected in drawer changes accordingly.
4. Tap Confirm with nothing entered. Pass: it says **Nothing entered**. Try paid out of more of a note than the record holds. Pass: it warns with **More than the drawer should hold**.
5. **Correct contents**: change the pad to match the real drawer. Pass: Float, Expected and the Z-report do not change; only the note and coin record does.
6. Count and close the drawer. Read the Z-report text. Tell me if any wording is wrong or confusing.

## T4. A cash sale, end to end (B1i, N17)

1. Ring up a sale and choose cash. Tap the notes the customer hands over. Pass: the app requires note and coin counts for the cash received (you cannot just type a total).
2. Look at the change suggestion and compare it with what is really in the drawer. Confirm it. Pass: you give exactly that change.
3. Open the drawer screen's ledger. Pass: a **Cash received** and a **Change given** entry, with the new note and coin counts.
4. Part payment: pay some by cash and the rest by card. Pass: the sale completes and the ledger is right.
5. Give different notes for the change than suggested (enter what you really handed back). Pass: the ledger follows what you entered.
6. Make a sale where the drawer has no exact change (for example hand over a large note for a small bill when the drawer is nearly empty). Pass: a red box says change cannot be made and offers sensible options (a smaller note, split with card).
7. Cancel a **part-paid** cash sale. Pass: the app asks you to collect the exact change you gave earlier and return the same notes and coins you were originally handed. It must not offer an untracked shortcut or an optimised return.
8. Cash refund: refund an order to cash, once with the suggested notes and once with notes you enter. Pass: the ledger matches.
9. **Check change** (grid tile or cart ••• menu): with a real cart, try a few combinations of notes. Pass: it answers whether change is possible, and records nothing.

Tell me: whether tapping notes is too slow at a busy counter.

## T5. Smart change (B1j, N18)

1. Settings ▸ Payments ▸ **Smart change**: turn it on. (It applies to this iPad only.)
2. Ring up a few tracked cash sales over a few days if you can. With almost no sales it guesses from item prices.
3. On each cash sale read the suggestion and the reason line under it. Tap **Show another way** and check you get a different exact option.
4. Open **Check change** with a few note combinations. Look at the "may not be worth it" warning.

Tell me: whether a suggestion ever feels wrong (for example it keeps a note you never run out of), and whether the "may not be worth it" warning fires too often or too rarely.

## T6. Daily float report (B1k, N19)

At the end of a day with tracked cash sales: **More ▸ Cash drawer ▸ Daily float report**.

1. Check the takings match your Z-report.
2. Read the suggested take-out. Is it something you would really bank?
3. Check the float it leaves looks right for tomorrow.
4. Tap **Show another way**. Tap **I took this out: record it** and then check the ledger.

Tell me: whether the suggested float size (it stays between $50 and $300) is wrong for you.

## T7. Simple and Minimal display modes (B5d, N20)

Set a staff member's mode from their row in **More ▸ Staff**.

1. Set a staff member to **Simple**, sign in as them, and make a complete sale. Pass: everything is reachable, with plainer wording and easier views.
2. Set another to **Minimal** and make a complete sale. It should be a guided, step-by-step flow (Items, Discount, Check, Pay; Customer is under More options unless Custom turns the Customer step on).
3. In guided checkout go to **Discount** and press Back. Pass: the button names where it goes and takes you to **Items**. (You reported an ineffective Back arrow before; this is the check.)
4. Open **More options** in guided checkout.
5. Set a staff member to **Custom**. Switch some tabs and More entries off, close and reopen the app, and sign in again. Pass: the switches persisted, and roles still limit what that person can do. The only administrator still sees Staff and Settings.
6. Check the simpler grid density.

## T8. Help (N27)

On the iPad and on a phone: **More ▸ Help**.

1. Search for "scan" and "cart". Pass: sensible results.
2. Flip between **Basic**, **Deep** and **Advanced**. Close the app and reopen. Pass: it remembers the depth.
3. Tap a blue link, and a page in the lists, then Back. Pass: Back walks back through the pages you opened.
4. Open **Checkout: the main screen** at Advanced. Pass: the two flowcharts draw and scroll sideways, and you can read them.
5. Repeat in Simple and Minimal modes, and in the dark theme.
6. Try the visual step cards and topic cards added in 0058.

Tell me: anything that looks wrong, and whether the flowcharts are readable.

## T9. Price adjustments (A16, N22 to N26, N28)

Do these on separate test sales.

1. **Line price (N22)**: add 13 of a product that has a couple of deals. Open the line ▸ **Line price adjustment** and key in a final price. Pass: the cart shows a last row "Line price adjustment" and the line costs exactly what you keyed. Then change the quantity on that line. Pass: it is flagged with the reason (for example "2 more ... added") and the cart header says a line needs a price check. Try **Keep**, **Adjust** and **Remove**. Try a price at or above the current one (refused). Try it on a gift card (not available).
2. **Whole order price (N23)**: ring up a few items (once with a gift card). Open ••• ▸ **Whole order price** and set a total. Pass: the total is exactly that, the gift card is not reduced, and the receipt shows "Order price adjustment". Add another item. Pass: the order price is flagged and Keep and Remove work. Set a line price on that cart and an order total on a cart with line prices. Pass: each asks before replacing the other. Save the cart. Pass: it says the order price is not kept.
3. **Item price (N24)**: add 5 of a product. Open the line ▸ **Item price adjustment**, choose **Fixed quantity**, step to 2, set a price. Pass: the line splits into 3 at the normal price and 2 at yours. Then on another product choose **All in cart**, add one more of it. Pass: it joins the line at your price. Use **Reset**. Change the quantity on a fixed-quantity line. Pass: it is flagged with Keep, Adjust and Remove.
4. **Checkout review (N25)**: in normal checkout press **Charge**, and in guided checkout **Take payment**, with a line, item and whole-order price on different sales. Pass: "Check the price adjustments" lists them, flagged first. With one flagged, **Continue to payment** is unavailable until you Keep, Adjust or Remove it. **Adjust** takes you to the right editor and coming back shows the new numbers.
5. **Reasons (N26)**: set each kind with a reason (and one without), finish the sales. Pass: the review shows the reason, the transaction detail has a **Price adjustments** card, Reports has a **Price adjustments** card with a row per reason, and in Shopify admin the order has a `pos_adjustments` attribute.
6. **Role limits (N28)**: in **Staff ▸ Price adjustments by role**, switch off Line price for the Cashier role. Sign in as the cashier. Pass: setting a line price is blocked, but taking an existing adjustment off still works. Owners are never restricted. Check a second register picks the change up.

Tell me: whether the lists are too much to read at the till, any awkward wording, whether you want tap-to-pick reasons, and whether the reason should go on the receipt or the sales CSV.

## T10. Gift cards on your live Shopify store (B8)

This is the "live Shopify check". Patch 0056 added two behaviours that write to your real gift cards, and they have only been tested against fakes:

- cancelling a part-paid sale puts the value back on the gift card that was used; and
- refunding a gift-card payment lets you reload the **original** card or issue a **new** one.

They use Shopify's gift card credit and debit calls, which need the `write_gift_card_transactions` scope on your Dev Dashboard app. If any step below fails with an access or permission message, that scope is missing: add it to the app, then reinstall or approve it and try again.

Set up: sell yourself a $20 gift card through the POS (or issue one in Shopify admin ▸ Products ▸ Gift cards). Keep the code.

1. **Pay with it.** Ring up a $30 item. On Payment tap **Gift card**, scan or type the code, and pay $20 of it. Pass: the card is charged straight away. In Shopify admin the card now shows $0.00.
2. **Cancel the part-paid sale.** Cancel the sale. Pass: the app says the value went back. In Shopify admin the card is back to $20.00 and its history shows the credit.
3. **Retry protection.** Repeat steps 1 and 2 but turn Wi-Fi off just before you cancel. Pass: the app does not pretend it worked (it should say it could not restore yet or offer a retry). Turn Wi-Fi back on and retry. Pass: the card ends at $20.00, **not** $40.00, so a retry never credits twice.
4. **Refund to the original card.** Complete a sale paid with the gift card, then refund it from Orders with **Refund to ▸ Original**. Pass: the gift-card part goes back to the same card (check Shopify admin).
5. **Refund to a gift card.** Refund another such sale with **Refund to ▸ Gift card**. Pass: you must choose **Reload original gift card(s)** or **Issue a new gift card** before the button works. Try both. Pass: reload credits the original card; new creates a fresh card with the right amount and shows its code.
6. Check the Help page **Paying with a gift card**: it currently says cancelling does **not** restore value. That is out of date after 0056 and is on the Final Touches list (F6).

Tell me: pass or fail for each step, the exact error text for any failure, and the balances you saw in Shopify admin.
