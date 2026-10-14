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

5. **Swap my cash** (0091): **More ▸ Cash drawer ▸ Swap my cash**. Tap a note you hold yourself (for example a $50). Pass: it shows what to put in and what to take out, with the same total each way, and says *Nothing worth swapping* when the drawer has nothing useful to give. After swapping for real, tap **I swapped it: record it**. Pass: the ledger has a **Contents corrected** entry and Expected is unchanged.

Tell me: whether the suggested float size (it stays between $50 and $300) is wrong for you, and whether the swaps make sense for your real drawer.

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
7. **Contents menu** (0092): tap the list icon at the top right of Help. Pass: a panel slides in from the left with the whole page tree, the page you are on is highlighted with its sections open, the arrows open and close sections, tapping a title opens that page and closes the menu, and tapping outside or the X closes it without changing page. Search, the trail and Back still work as before.

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

## T11. Training: Sign in, lock and switch staff (B6, 0093)

On the iPad and on a phone: **More ▸ Training ▸ Sign in, lock and switch staff**. No setup needed: practice has its own people, Casey (PIN 1234) and Morgan (PIN 2468, with a pass).

1. **Info and Show.** Step through both with Next. Pass: nothing moves by itself, the text fits, and the Show covers the staff tile, a pass scan, locking, a PIN and a pass that fails.
2. **Guide.** Follow the arrows. Pass: Switch staff opens, Scan pass opens a window with a drawn pass and a **Scan this pass** button, the ring points at that button, and after the scan the Casey tile says Morgan. **(0097) Right after the scan, step 5 shows with the windows gone, and Next, Skip and Exit all respond.** Also try the real till (outside training): Switch staff ▸ Scan pass with a real pass closes both windows and the screen stays usable. Lock POS then shows the Sign in screen with the bar still at the bottom, and keying 1 2 3 4 signs in as Casey.
3. **Check 1.** Three goals. Pass: each finishes the moment you do the thing, and the hints climb to a ringed answer.
4. **Check 2.** The first goal cancels Morgan's pass. Pass: scanning it says it is not recognised, and keying 2 4 6 8 gets you in. The second starts with items in the cart. Pass: switching to Morgan keeps them.
5. **Leave and finish.** Exit mid-course, then finish another run. Pass: the real till is signed in as you again, the cart is as you left it, and the green tick is under **your** name.

Tell me: pass or fail for each step, and a screenshot of the pass window if it looks off.

## T12. Training: Build a cart (B6, 0094)

On the iPad and on a phone: **More ▸ Training ▸ Build a cart**.

1. **Info and Show.** Step through both with Next. Pass: the Info builds up piece by piece, the Show adds the Bumble Bee, then a second, then the Dragon and the Egg, swipes the Egg line and taps Remove, and the total follows each change.
2. **Guide.** Follow the arrows. Pass: each tile ring finishes the step when you tap it, tapping the Bee again counts, and the Red Dragon step asks for a swipe left (on a phone it first points at the bar that opens the cart) and finishes when the line is gone.
3. **Check 1.** Pass: three of the same item does **not** finish it, three different items does.
4. **Check 2.** The cart starts with two Bumble Bees and a Red Dragon. Pass: it does not finish by itself. Removing the Dragon alone does not finish it, adding the Egg as well does. Removing the Bees too brings up a note telling you to put one back.

Tell me: pass or fail for each step, and anything on a phone that is hard to reach.

## T13. Virtual terminal screens (B6, 0096)

More ▸ Training ▸ Virtual terminal (and any course that takes a card payment). Pass or fail for each:

1. **Dark only.** Every screen is dark and there is no Dark screen switch on the page.
2. **Idle.** Your screensaver logo on your screensaver colour, with "zeller" small at the bottom. Change the colour in Settings ▸ Screensaver & display and check the terminal follows.
3. **Tap Now.** Blue panel on top with the contactless symbol and "Tap Now", the amount on the dark sheet under it, and a small Cancel link that cancels.
4. **Processing**, **Approved** and **Declined** look like your photos. Approved and Declined have no buttons. Declined shows the amount, "Insufficient funds (51)" in bold and the explanation under it.
5. **Every screen** (the gallery on the page): receipt, cancelled and not available look in step with the others, and the receipt QR still scans.

Tell me: pass or fail for each step, and a photo of anything that is off.

## T14. Training: Take a card payment (B6, 0099)

On the iPad and on a phone: **More ▸ Training ▸ Take a card payment**.

1. **Info and Show.** Step through both with Next. Pass: nothing moves by itself and the text fits. The Show taps Card, the terminal on the right changes (amount, processing, a PIN screen for $125, approved), the Receipt window opens, and then a declined card, Try card again and the unknown-result window appear.
2. **Guide.** Follow the arrows. Pass: Add the Bee, Charge, the amount is ringed, Card, then the terminal appears and you tap **Tap card** on it. The sale finishes by itself, the Receipt window opens, and No receipt closes it. **No step should call the sale or the payment a mistake.** On a phone, check the Charge step first points at the cart bar.
3. **Check 1.** Two goals. Pass: the first finishes only after the sale **and** the Receipt window is closed. The second cart is over $100, the terminal asks for a PIN, any four digits and OK work, and the hints climb to a ringed answer.
4. **Check 2.** The first goal declines your first card. Pass: the Not approved window shows Insufficient funds and code 51, Try card again works, and the sale finishes. The second declines two cards with code 54 (card expired), then approves the third.
5. **Strays.** In Check 2 try Use another method and then Card again. Pass: it is not flagged. Remove the item from the cart mid-payment. Pass: you are told the sale still needs it.

Tell me: pass or fail for each step, and whether the terminal is in the way of the Payment page on a phone.


## T15. Training: Find the right item fixes (B6, 0100)

On the iPad and on a phone: **More ▸ Training ▸ Find the right item**.

1. Do the Guide as far as the Keypad, add the $4.50, then leave and start the course again from the start. Checkout should be on Quick Menu, first page, nothing typed, and step 2 should ring the Extras chip.
2. In the Guide, open Animals, then tap the Keypad tab yourself. The ring should point at Quick Menu, then at the back arrow, and never tell you to go to a tab you are already on.
3. The tab steps should ring only the tab named (Keypad, All products, Quick Menu), not the whole switch, on the native control and the plain one.
4. On the Keypad step the ring should walk 4, then 5, then 0. Tap a wrong key and it should point at C. In Search, type something other than egg: the step should not finish and should say what to type.
5. In Check 1, add a custom amount of $5.00 instead of $4.50: it should not finish and should say so.

Tell me: pass or fail for each step, and whether the ring sits exactly on the tab or key.

## T16. Training: scroll, orange highlight, per-item windows (B6, 0101)

On the iPad and on a phone, in the light, dark and brand looks.

1. In any course, the ring, pointer and progress bar are orange (not peach or white), and readable on all three looks.
2. On a phone, in a course step that points at something below the visible area (a long Payment page or a tall cart), the screen should not dim, a Scroll down pill should show at the bottom, and scrolling should bring the ring in. Try again with the target cut off at the edge: it should be ringed and the pill still shows.
3. In a Check with two items in the cart, add an item you were not asked for, then open the line window of the other item. The card should tell you to close this window first and name the extra item. Open the right item's window and the card should point at Remove item inside it. Try the same with too many of an item and the minus button.

Tell me: pass or fail for each step, and whether the Scroll pill covers anything you need.

## T17. Training: corrections and card only (B6, 0102)

On the iPad and on a phone: **More ▸ Training**.

1. In a Check that does not use discounts, add a discount to an item. The card should point at the item, then Discount in its window, then the Remove button, one after the other. Try the same with an item price adjustment and a whole-line price adjustment. Open another item's window part way through: it should say to close it first.
2. In a Check that does not use a customer, add one. The ring should land on the small x by the customer name.
3. In **Take a card payment**, tap Cash, Gift card or Split on the Payment page. The card should say the customer is paying by card and point at Close, then at Card. Complete a cash sale anyway: the goal must not finish, and the card should offer Start this part again.
4. In Find the right item, go to the Keypad tab or into a category during the Extras page goal: the card should point you back one move at a time.

Tell me: pass or fail for each step, and anything the ring points at that is hidden or wrong.

## T18. Training: cart-level corrections and fallbacks (B6, 0103)

On the iPad and on a phone, in a Check that does not use discounts, prices or notes.

1. Apply a cart discount (cart menu, Apply cart discount). The ring should go to the three dots, then Apply cart discount, then the Remove button as you go. Do the same with Whole order price.
2. Put a note on an item. The ring should point at the item, then at the Note field in its window with "Clear the note, then tap Done".
3. In Build a cart, after the first item, tap the Keypad tab and then try the next add step: the ring should send you back to Quick Menu.
4. In Find the right item, open the sizes and look at the tab steps: the ring should point at the back arrow first.

Tell me: pass or fail for each step, and anything the ring points at that is hidden or wrong.

## T19. Training: the last fallbacks (B6, 0104)

On the iPad and on a phone.

1. **Sign in and lock and switch staff:** at Scan pass, close the sign in window: the ring should point at the tile that names who is signed in. At Scan this pass, close the pass window (then the sign in window too): it should point at Scan pass, then the tile. At the PIN step, sign in as Morgan instead: it should point at the tile and say Casey needs to sign in.
2. **Take a card payment:** at the customer's terminal step, cancel the payment from the Payment page: the ring should point at Card. Go back to the cart: it should point at Charge. At the Receipt step, close the Receipt window another way (swipe it away): the step should still finish.
3. **Find the right item:** at the search step, switch to another tab: the ring should point at the Checkout tab.

Tell me: pass or fail for each step, and anything the ring points at that is hidden or wrong.

## T20. Training: Finish a sale and send the receipt (B6, 0105)

On the iPad and on a phone: **More ▸ Training ▸ Finish a sale and send the receipt**.

1. **Info and Show.** Step through both with Next. Pass: nothing moves by itself, the text fits, the Show taps Email, Text and Share, switches to a QR code with the Not published yet note, goes Back, and ends on No receipt.
2. **Guide.** Pass: Bee, Charge, Card, then the practice terminal taps the card by itself and the Receipt window opens. Then each ring finishes its step: Email link, Text link, Share, Show QR code, Back, No receipt. **In practice none of these may open Mail, Messages or the share sheet**: an orange line under the buttons says what would have opened. The QR page must say Not published yet. Nothing in these steps may be called a mistake.
3. **Check 1.** Pass: the first goal finishes the moment you tap Email link, the second on Text link (the window stays open between goals), the third when the window closes.
4. **Check 2.** Pass: try Show QR code first and read the note, then Back and Text link. The next goal wants Share, then No receipt. Paying with Cash instead of Card should bring up a note or a restart, not break the course.
5. **After training.** Take a real sale. Pass: the Receipt window is as before (and Email link still opens Mail).

Tell me: pass or fail for each step, and especially whether any real app opened in practice.

## T21. Training: Customers and notes (B6, 0106)

On the iPad and on a phone: **More ▸ Training ▸ Customers and notes**.

1. **Info and Show.** Step through both with Next. Pass: the cards appear one at a time, and the Show goes list, search, pick, line note, take off, then creates a new customer.
2. **Guide.** Follow the arrows. Pass: tapping the customer row opens the Customer window (on a phone it first points at the bar that opens the cart), typing priya narrows the list and finishes the step, tapping Priya Patel attaches her, typing a note then Done saves it, the x takes her off, and Create customer ▸ form ▸ Create & attach makes a new one.
3. **Keyboard.** Pass: the keyboard opens and you can type in the search box, the note box and the form fields while their step is ringed, and Done is reachable.
4. **Check 1.** Pass: attaching Alex, noting the Bumble Bee line and taking Alex off each finish the moment you do them.
5. **Check 2.** Pass: Sam Rivera is already on the sale and picking Priya replaces him. The second goal starts with nobody attached, and a new customer finishes it.
6. **Leave.** Pass: after leaving, your real till is as you left it, and **Customers** (More) does not list the practice customer you created.

Tell me: pass or fail for each step, and a screenshot of anything that is hard to tap.

## T22. Training: Discounts (B6, 0107)

On the iPad and on a phone: **More ▸ Training ▸ Discounts**.

1. **Info and Show.** Step through both with Next. Pass: nothing moves by itself, the text fits, and the Show goes cart, line window, discount window, new price, cart menu, preset, Not discountable, the automatic deal, and Remove.
2. **Guide.** Pass: Red Dragon tile, its line, Discount, a key press, Apply discount (the line shows the new price), Done, the cart menu, Apply cart discount, the Practice 10% off button, then back through the same menu to Remove. On a phone the first line and menu steps point at the cart bar first. Nothing should be called a mistake when a discount goes on.
3. **Check 1.** Pass: the first goal needs the Dragon discounted and the Bee **not**. The second wants a cart discount. The third finishes when it is removed.
4. **Check 2.** Pass: open the Clearance Print and see Not discountable (the row cannot be tapped). Give the Bee 10% instead. Next, with two Keyrings, add one more. Last, a 15% cart discount is already on; remove it.
5. **After training.** Add a real item. Pass: the real presets and no practice deal or print appear.

Tell me: pass or fail for each step, and whether the Discount window keys and chips are easy to point at on a phone.

## T23. Training: Take cash and give change (B6, 0108)

On the iPad and on a phone: **More ▸ Training ▸ Take cash and give change**.

1. **Info and Show.** Step through both with Next. Pass: the Show goes Payment page, Cash window, $10 (Short), $5 (Change), Undo, $10 again, the change step, sale complete, then the rounding and no-change screens.
2. **Guide.** Follow the arrows. Pass: each ring sits on the right note (the $10, the $5, Undo, the $10 again), a wrong tap is explained and undone, Next opens the change step, and Gave this finishes the sale. No receipt closes the Receipt window.
3. **Check 1.** Pass: exact cash finishes only when the window says Exact and the sale is closed. $20 for $14 finishes with $6.00 change.
4. **Check 2.** Pass: (a) taking $10 as a part payment brings up the restart note, taking $15 in all finishes it; (b) the Cash window shows Due $7.45 for the $7.44 sale, and exactly $7.45 finishes it; (c) with only big notes in the drawer, $20 shows "Can't make $6.00 change" and Cash $10.00 + the rest another way works, with the card taken by the practice terminal.
5. **Leave.** Pass: after leaving, open **More ▸ Drawer**. The ledger is exactly as before, with none of the practice notes.

Tell me: pass or fail for each step, and a screenshot of the pad with the ring on it.

## T24. Training: Refunds and exchanges (B6, 0109)

On the iPad and on a phone: **More ▸ Training ▸ Refunds and exchanges**.

1. **Info and Show.** Step through both with Next. Pass: nothing moves by itself, the text fits, the Show opens an order, picks an item, switches to Amount and back, adds a swap (button reads Charge) and takes it off, shows the card refund failing, switches to Cash and gives the cash.
2. **Guide.** Pass: More, Orders and the three practice orders appear (#T1001 to #T1003, not your real orders). Each ring finishes its step. At the Refund button the **Confirm pop-up is a native alert**: check the step text still makes sense and that Confirm finishes the step. Cash order: the Give cash refund window appears and Gave this works.
3. **Check 1.** Pass: card refund of one Dragon Egg, cash refund of the Bumble Bee, gift card refund of the Red Dragon (the Done window shows a TRAIN code). A wrong refund brings up a note offering Start this part again.
4. **Check 2.** Pass: Refund to Original on the first goal says the card is expired and records nothing; switching to Cash finishes it. Next goals: Restock off, then one Keyring.
5. **Never real.** Pass: no card refund ever reaches the real reader, Shopify shows no new refunds, and the Notifications tab has nothing new.
6. **After training.** Open More ▸ Orders. Pass: your real orders are listed as before and a real refund still works.

Tell me: pass or fail for each step.

## T25. Training: Change a price (B6, 0110)

On the iPad and on a phone: **More ▸ Training ▸ Change a price**.

1. **Info and Show.** Step through both with Next. Pass: the cards appear one at a time, and the Show goes item price, line price, whole order price, the review, then a flagged price.
2. **Guide.** Follow the arrows. Pass: Item price shows a ring on All in cart, keying 6 0 0 shows $6.00, Set price changes the Bumble Bee, and Reset to catalogue price puts it back. The Red Dragon line price and its removal work the same way. The whole order price is reached from the cart menu (on a phone, open the cart first). Charge shows Check the price adjustments, and Continue to payment opens the Payment page.
3. **Keyboard.** Pass: you can tap the Reason box and type while its step is ringed, and Next lets you carry on.
4. **Check 1.** Pass: each of the three goals finishes only when the right price is set and the window is closed.
5. **Check 2.** Pass: (a) the $6.00 is already on the Bee, and only moving it to the Dragon finishes the goal; (b) three Sticker Packs finish only with All in cart; (c) Charge shows one flagged price with Keep, Adjust and Remove, and any of them lets you continue.
6. **Leave.** Pass: after leaving, your real cart and catalogue prices are exactly as you left them.

Tell me: pass or fail for each step, and a screenshot of the review sheet.

## T26. Training: How deals show up (B6, 0111)

On the iPad and on a phone: **More ▸ Training ▸ How deals show up**.

1. **Info and Show.** Step through both with Next. Pass: nothing moves by itself, the text fits. The Show goes eight Tadlings, the two deal rows, the bundle taking a Tadling (the 3 row goes), Recommended pair, Not a recommended pair with the window, and Continue.
2. **Guide.** Pass: tap the Tadling tile eight times. The rings then land on the Tadling line, the `5 Tadlings` row, the `3 Tadlings` row, the deals total above Charge, then the Highland Cow tile, Small, and the Bundle deals box (twice). On a phone the rings should point at the cart bar when the cart is not showing. The `3 Tadlings` row must disappear once the cow is in.
3. **Check 1.** Pass: exactly three Tadlings, then five, then a Small cow.
4. **Check 2.** Pass: four Tadlings to five; swap a Large cow for a Small one (the box says Not a recommended pair first); then tap Charge with the Large cow and a Tadling, see Check these bundles, and tap Continue to payment.
5. **After training.** The real grid has no Tadling tile and real deals apply as before.

Tell me: pass or fail for each step, and whether the rings on the discount rows are easy to see on a phone.

## T27. Training: Scan items (B6, 0112)

On the iPad and on a phone: **More ▸ Training ▸ Scan items**.

1. **Info and Show.** Step through both with Next. Pass: nothing moves by itself, the text fits, and the Show opens the camera, scans two items (green), a torn label and a gift card (red), taps Done and ends with the Keyring from the Bluetooth scanner.
2. **Guide.** Pass: the ring lands on the barcode button next to Search, and tapping it opens a **practice camera window** with five barcode cards (Bumble Bee, Red Dragon, Sticker Pack, Torn label, Gift card). It must not open the real camera or ask for camera permission. Scan the Bumble Bee and the Red Dragon (green message each), the torn label and the gift card (red message each, nothing added), tap Done, then tap the Keyring tile. The cart then has three items.
3. **Close it two ways.** Pass: in any step, the Done button and the Close (x) at the top of the window both leave the window, and a Guide step that needs the window reopened points you back at the barcode button.
4. **Check 1.** Pass: the Red Dragon only counts when scanned in the window (adding it from the grid does not finish the goal); then a Bumble Bee and a Sticker Pack and Done; then a second Bumble Bee and Done.
5. **Check 2.** Pass: with a Red Dragon in the cart, a Keyring can only be added by tile or search (no card scans it); with a Bumble Bee in the cart, the goal finishes when the Gift card window opens from Charge.
6. **Leave.** Pass: after leaving, the barcode button opens your real camera again, and your real cart is exactly as you left it.

Tell me: pass or fail for each step, and whether the five cards fit the window without awkward scrolling on a phone.
