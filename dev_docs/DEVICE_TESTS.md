# Device tests: how to do each one

These are the tests only you can run (they need the iPad, a scanner, a cash drawer or a live Shopify store). Each one lists what to set up, the steps in order, what a pass looks like, and what to tell me. Menu names are the ones in the app today. The full click-through guide with a notes box for every step is `dev_docs/archive/DEVICE_TEST_GUIDE.html` (F7); this file is its source.

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

## T28. Training: off-course guidance reads the whole app (B6, 0113)

This patch changes only how the off-course card decides **where to point**; the words, the ring, the look and the feel are unchanged. Check that nothing regressed and that the ring is never left off screen. On the iPad and on a phone, in **More ▸ Training** run **Build a cart** (and any other course), and while in a Guide step or a Check goal go off course on purpose:

1. **The usual ways still read the same.** Remove the wrong item, add an extra item, open a window the step did not ask for, and stray to another tab or page. Pass: each shows the same sentence and rings the same control as before this patch (check against `dev_docs/DEVICE_TESTS.md` T12 and T22 for the exact wording).
2. **The ring always lands on something.** On a phone especially, when the fix's own control is not on screen, the ring should land on the way back (the **Back** arrow, or the **Checkout** tab in the bottom bar) rather than showing the sentence with no ring. Pass: there is always a ring or a clear cue at the edge.
3. **Windows.** With a window open, a fix that is not inside it still says **Close this window first.** and rings the window's x. A fix that is inside the window rings the control inside it, not the x.
4. **Nothing from training leaks.** Leave training and use the till normally for a minute (open sheets, tabs, the cart). Pass: no course-correction card appears, nothing is ringed, and the app behaves exactly as before.

Tell me: pass or fail for each step, and whether the ring ever ends up on the wrong control or off screen.

## T29. Training: a run is guided only through places it has (B6, 0114)

This patch changes only **which places the guidance may use**; the words and the look are unchanged. A course must never be pointed at a control the everyday till owns (the real camera), and the everyday till must never be pointed into a course. On the iPad and on a phone:

1. **Practice stays in practice.** In **More ▸ Training** run **Scan items** and go off course in a way whose fix is the scan button. Pass: the ring lands on the **practice camera** button (the drawn cards window), never the real camera.
2. **The real till stays real.** In the everyday till (Demo mode / Help) open the camera and go off course. Pass: the ring lands on the real camera control and never on a practice-only window; nothing from a course appears.
3. **A course does not open pages it forbids.** In a course whose definition allows only the cart and pay routes, stray onto More or Orders. Pass: the card still speaks, but its walk never sends you to a page that course does not open (it points back to a place the course allows).
4. **Nothing leaks after a run.** Finish or leave a course, then use the till. Pass: no course-only window is ever ringed, and the app behaves exactly as before.

Tell me: pass or fail for each step, and whether the ring ever lands on a control the current run has no place for.

## T30. Training: soft locks and the cursor (B6, 0119)

1. **Discounts, Check 2.** Finish the first goal (10% off the Bumble Bee, Apply). Pass: the second goal starts, the screen still responds, and Exit works. Do it three times.
2. **Windows swapping.** On a cart line, open the line window, then Discount, then Apply, then Item price adjustment, then back. Pass: each window opens (a short pause, under half a second, when one closes as the next opens) and nothing is ever stuck.
3. **Price adjustments, Guide.** Step 8 (Reason): you can tap the box and type, and Next works. Step 19 (Remove adjustment): if you close the window early, the guide points at Line price (or the line) instead of freezing.
4. **Customers, Guide.** The note step finishes only when you type Gift wrap. The new customer step lets you type your own details, and Next is greyed out until there is a first name and a real email or a mobile. Nothing is kept afterwards.
5. **Scan items, Guide, start to finish.** Pass: every card the Guide asks for is on screen without scrolling (iPad and phone), the result box says Nothing scanned yet before the first scan, and you are never pointed at the camera button while its window is open.
6. **Deals, Check 2, last goal.** Tap Charge, Continue to payment. Pass: you go straight to the finished screen, never to a Payment page showing $0.
7. **Cursor.** Pass: it is the highlight orange and you can see through it a little; it is not drawn on a Next step or while you type; it never stops a tap, including on the ringed button.

Tell me: pass or fail for each step. If anything freezes, tell me exactly which step and what was open.

## T31. Training: the window hand-off and the review note (B6, 0120)

1. **Discounts, Check 2, goal 2.** Same as T30 step 1, but this is the exact case that froze: give the Bumble Bee 10% off and tap Apply (the Discount window closes as the line window comes back). Pass: the second goal (make three Keyrings) starts, the screen still responds, and Exit works. Do it three times.
2. **Change a price, Check 2, goal 1.** It injects a wrong $6.00 on the Bumble Bee. Open the Bee line, Item price, Reset to catalogue price; open the Red Dragon line, Item price, key 2 0 0 0, Set price, Done. Pass: every window opens (a short pause when one closes as the next opens) and the goal ticks once both windows are shut.
3. **Change a price, Guide, run twice.** Finish the Guide (through the price review at steps 25-27), then open the Guide stage again and start it. Pass: at step 25 ("Tap Charge") the "Check the price adjustments" review opens again, and Continue carries on. It must not wait forever on a review that does not appear.
4. **Windows swapping.** On a cart line, open the line window, then Discount, then Apply, then Item price adjustment, then back. Pass: each window opens and nothing is ever stuck. Also try it with the price window's Reset button.

## T32. Training: Inventory (B6, 0121)

On the iPad and on a phone. Use More ▸ Training ▸ Inventory.

1. The course opens on the Inventory tab. Tapping the Checkout tab does nothing: it stays on Inventory.
2. The list starts with the Dragon Egg in red at -3, then the Keyring at 0, then the Sticker Pack at 2. Your own Inventory filters (for example Negative or Nested) are not applied.
3. Guide: the ring moves from Low to Negative to All, then to the search box. Typing "sticker" moves it to the Sticker Pack row.
4. In the item window the ring goes to the Receive | Adjust | Count switch, the number keys, then Apply. After Apply the Sticker Pack shows 12.
5. Adjust: Remove, damaged, 1, Apply shows 11. Count: 6, Set stock to 6 shows 6.
6. Open the Dragon Egg by mistake during a step that is about the Sticker Pack and apply: the card says another item's stock changed and points at its row.
7. Check 2, the smashed Keyrings: choosing a reason other than damaged gives the card that says the reason is wrong.
8. **Most important:** leave the course and look at the real Inventory tab. Nothing changed, and your real filters are back. Shopify stock is untouched.

## T33. Training: Split a payment (B6, 0122)

On the iPad and on a phone. Use More ▸ Training ▸ Split a payment.

1. The Guide builds a $14.00 sale (Bumble Bee and Dragon Egg), then Charge. On the Payment page, Split sits with Card, Cash and Gift card.
2. The ring opens the Split window. The Split equally 2 and 3 chips, the keypad and Continue are all ringed in turn. Confirm the ring lands on each.
3. Split equally 2 sets $7.00 and $7.00. The page shows Next payment: $7.00, and a Cancel split button appears.
4. The first part by cash: tap $5 then $2, and Take cash. Pass: the sale does **not** finish, and the page now asks for the remaining $7.00.
5. The second part by card on the terminal, then No receipt. Pass: the sale is complete, paid both ways, and the cart clears.
6. Check 1, the first-amount goal: in the Split window, key 5 0 0 and Continue gives a $5.00 first part.
7. Check 2, the declined part: tap Card for the first part, tap card on the terminal (declined), then Use another method, then take that part in cash. Pass: the rest of the plan is kept and the second part by card finishes the sale.
8. Check 2, changed mind: split, then Cancel split, then take the whole amount by card. Pass: the split is gone and the whole total is one card payment.

## T34. Training: Sell a gift card (B6, 0129)

On the iPad and on a phone. Use More ▸ Training ▸ Sell a gift card.

1. The Guide rings the three dots in the cart, then Sell gift card in the cart menu, and the Sell gift card window opens on the amount step.
2. Both parts of the window are on the graph: the preset chips and the number pad are ringed in turn, then the Hand over / print | Email it switch, then Add gift card to cart.
3. The $25.00 preset switches the window to the details step, and Add gift card to cart closes it and leaves a Gift card line in the cart.
4. Pay by card. Pass: the sale finishes and the receipt shows the gift card code and a QR.
5. Check 1, the keyed amount: in the amount step, key 3 0 0 and Next gives a $30.00 card; Add leaves it in the cart.
6. Check 1, the paid card: sell a $25.00 card, then Charge and Card and No receipt. Pass: the sale completes.
7. Check 2, the declined card: tap Card, the practice terminal declines once, the Not approved window appears, and Try card again takes the card. Pass: the gift card stayed in the cart and the sale finishes.
8. Check 2, the emailed card: in the details step choose Email it. Pass: an invalid address is refused with "Check the email address"; a valid one lets Add gift card to cart go through, and the goal finishes only when that emailed card is paid for.
9. **Most important:** leave the course. No gift card was sold, no code was sent anywhere, and the real cart and sales are untouched.

## T35. Training: Check and pay with a gift card (B6, 0130)

On the iPad and on a phone. Use More ▸ Training ▸ Check and pay with a gift card.

1. The Guide adds the Bumble Bee and the Dragon Egg ($14.00), rings Charge, then Gift card on the Payment page, and the Check gift card window opens.
2. The code box and Check are ringed in turn. Key GIFT25 and tap Check. Pass: the window shows Card ••••0025, a $25.00 balance and Active, and Use as payment appears.
3. The Guide rings Use as payment. Pass: the sale is paid at once with no card reader, the Receipt window opens, and No receipt clears the cart.
4. Check 1: the balance goal completes only when GIFT25 is checked ($25.00). The pay goal completes only when the sale finishes with a single gift card tender.
5. Check 2, the short card: key GIFT05 ($5.00), Check, Use as payment. Pass: $5.00 comes off the card and the rest is still due, so Card finishes the sale (tenders gift card then card).
6. Check 2, the disabled card: key GIFTOFF, Check. Pass: the window says Disabled and there is no Use as payment, so the goal finishes only after the whole $14.00 is taken by card.
7. No practice card is a real Shopify card. Pass: leaving restores any real card balances, and no lookup or debit ever reaches Shopify.
8. **Most important:** with the practice window open, check a balance and pay. Confirm no network call is made and the real cart, sales and gift cards are untouched when you leave.

## T36. Training: Park and resume a sale (B6, 0131)

On the iPad and on a phone. Use More ▸ Training ▸ Park and resume a sale.

1. The Guide adds the Bumble Bee, then rings the three dots in the cart, Save cart in the cart menu, the Name box and Save to Saved carts. Pass: the till is empty again after saving and the cart no longer shows the item.
2. The Guide rings More, then Saved carts, then Sam's row, then Open. Pass: Sam's two Dragon Eggs come back on the till.
3. Add another item, then open Priya's cart and Open again. Pass: the Merge Carts? prompt appears (the till is not empty), and Merge adds Priya's Keyring alongside what is already there.
4. Open Sam's cart and tap Assign → Casey. Pass: the row now shows who it is for (→ Casey), and the person who hands it over is Casey or Morgan, never a real staff member.
5. Check 1: park a sale; open Sam's cart on an empty till; merge a saved cart into a till that has an item; hand a saved cart to a workmate. Each goal starts fresh with the practice carts.
6. Check 2, the merge: the till already has an item, so Open asks first; the goal finishes only once Sam's cart has merged into it.
7. Check 2, the handover: the run signs in as practice manager Morgan. Pass: assign the waiting cart to Casey and the goal finishes.
8. Leaving the course: the two practice carts (Sam, holding for Friday; Priya, pickup Tuesday) are made up and are gone. Pass: your real saved carts are untouched, nothing was synced to Shopify, and the real staff list never appeared.
9. **Most important:** with the cart menu and the Saved carts window open, save and open carts. Confirm no real saved cart is created or pushed to Shopify and the real cart, sales and staff are untouched when you leave.

## T37. Training: Price check and Stock check (B6, 0132)

On the iPad and on a phone. Use More ▸ Training ▸ Price check and Stock check.

1. The Guide rings the **Price check** tile, opens the Lookup sheet, scans the Dragon figurine. Pass: the price shows $25.00, "2500 in stock", and no deal badge (the 20% off deal is Keyrings only).
2. The Guide rings the **Stock check** tile, scans the Keyring. Pass: "500 in stock" for this variation, lists the other variations, and the total at the bottom.
3. The Guide rings Stock check on the Large cow plush. Pass: "1800 in stock" for this variation, lists the Small cow, and "3000 in stock across all 2 variations" at the bottom.
4. The Guide rings Price check on the Tadpole toy. Pass: the four stock words are shown in Info: In stock (positive number), Out of stock (zero), Not tracked (null), and Oversold (negative, shown like "5 oversold").
5. Check 1: Price check Egg timer shows $6.00 and "600 in stock". Stock check Sticker pack shows "300 in stock".
6. Check 2: Price check Cow small shows no deal badge; Stock check Cow large shows two variations and 3000 total; stock words meaning verified.
7. **Most important:** with the Lookup sheet open, scan or search items. Confirm the cart is never touched, no real data is read or written, and leaving the course restores the real till exactly as it was.

## T38. Training: Find a past sale (B6, 0133)

On the iPad and on a phone. Use More ▸ Training ▸ Find a past sale.

1. The Guide rings **More**, then **Orders**. Pass: the Orders screen opens on the Open tab.
2. The Guide rings the **Unfulfilled** tab. Pass: the list shows only orders needing fulfilment.
3. The Guide rings the first order in the list. Pass: the order window opens showing lines, Mark fulfilled, Refund or return, and Receipt.
4. The Guide rings **Mark fulfilled**. Pass: the order is fulfilled, the window closes, and the order moves to the Completed tab.
5. The Guide rings the **Completed** tab. Pass: the order you just fulfilled appears in the list.
6. The Guide rings an order and then **Receipt**. Pass: the Receipt window opens.
7. Check 1: switch to Unfulfilled and open an order; mark an order fulfilled; print a receipt for a past sale.
8. Check 2: fulfil the wrong order then fix it; print a receipt for a refunded order.
9. **Most important:** with the Orders screen open, switch tabs, open orders, mark fulfilled, print receipts. Confirm no real data is touched and leaving the course restores the real till exactly as it was.

## T39. Training: Open, paid in/out, count and close (B6, 0134)

On the iPad and on a phone. Use More ▸ Training ▸ Open, paid in/out, count and close.

1. The Guide rings **More**, then **Cash drawer**. Pass: the Cash drawer screen opens, no drawer open yet.
2. The Guide rings **Open drawer with float**. Pass: the denomination pad opens. Enter a float amount (e.g. $200.00) and tap Confirm. The drawer opens with that float.
3. The Guide rings **Paid in**. Enter an amount (e.g. $50.00) with a reason, tap Confirm. Pass: Paid in updates, Expected increases.
4. The Guide rings **Paid out**. Enter an amount (e.g. $20.00) with a reason, tap Confirm. Pass: Paid out updates, Expected decreases.
5. The Guide rings **Correct contents**. Adjust the counts to match reality, tap Confirm. Pass: ledger updates but Float and Expected do not change.
6. The Guide rings **Count & close (Z-report)**. Count all notes and coins, tap Confirm. Pass: Z-report appears showing expected vs counted, difference, and full shift summary. Share/save it. The drawer closes.
7. Check 1: open with float; paid in; paid out; correct contents; count & close.
8. Check 2: count is short (ledger injection makes count not match expected); paid out more than ledger says (warning appears).
9. **Most important:** with the Cash drawer screen open, open with float, paid in/out, correct contents, count & close. Confirm no real ledger data is touched and leaving the course restores the real drawer exactly as it was.

## T40. Training: Check change before taking notes (B6, 0135)

On the iPad and on a phone. Use More ▸ Training ▸ Check change before taking notes.

1. The Guide rings the **Check change** tile on the grid. Pass: the Check Change sheet opens on the amount step.
2. The Guide rings **Use the cart total**, then **Continue to customer cash**. Pass: the sheet moves to the customer cash step showing the cart total.
3. The Guide enters a $20 note and a $5 note on the denomination pad. Pass: the result shows "Worth it - Use one $10, one $5, one $2, one $1".
4. The Guide clears the pad and enters a $50 note. Pass: the result shows "Ask for card - the change would leave you short of $20s".
5. The Guide clears the pad and enters a $20 note. Pass: the result shows "Give as change - the drawer has plenty".
6. Check 1: use cart total and Continue; Worth it with $20+$5; Ask for card with $50; Give as change with $20.
7. Check 2: with empty drawer ledger (ledger injection), Check Change shows "The drawer ledger is empty" message; with Smart change off, the note says "using fewest pieces".
8. **Most important:** with the Check Change sheet open, enter amounts and customer cash. Confirm no real ledger data is touched and leaving the course restores the real till exactly as it was.

## T41. Training: Swap my cash (B6, 0136)

On the iPad and on a phone. Use More ▸ Training ▸ Swap my cash.

1. The Guide rings the **Cash drawer** button on the More tab, then rings **Swap my cash**. Pass: the Swap my cash window opens with the denomination pad.
2. The Guide taps a $50 note on the pad. Pass: the window works out an even swap showing what goes in (your $50) and what comes out (smaller notes and coins), the same value both ways.
3. The Guide taps **I swapped it: record it** and confirms. Pass: it writes a Contents corrected entry; the float and the expected amount are exactly as they were.
4. Check 1: open Swap my cash, enter what you hold, read the swap, and record it.
5. Check 2: with a drawer swamped in $5s (ledger injection), entering a $50 says there is nothing worth swapping; and an even swap never changes the float or the Z-report.
6. **Most important:** with the Swap my cash window open, enter and swap your own notes and coins. Confirm no real ledger data is touched and leaving the course restores the real till exactly as it was.

## T42. Training: When the reader is not ready (B6, 0137)

On the iPad and on a phone. Use More ▸ Training ▸ When the reader is not ready.

1. The Guide rings the **Support & diagnostics** row on the More tab. Pass: the Support & diagnostics page opens with the reader row and the two buttons.
2. The Guide rings **Check reader**, then **Setup (pair terminal)**. Pass: the reader row says Reader ready, and the real Zeller terminal does not change.
3. The Show plays the Reader issue banner on the Payment page, the fix, and then a declined card (Not approved).
4. Check 1: the reader starts not paired (reader injection). Open Support & diagnostics, tap Setup (pair terminal). Pass: the row turns to Reader ready, then a card payment goes through.
5. Check 2: a declined card (decline injection) is taken by trying the card again; an offline reader (reader injection) means the sale is taken by cash.
6. **Most important:** with the real Zeller reader switched off, run the course. Confirm pairing and checking never touch the real terminal and charging a card never reaches the real reader. Leaving the course restores the real reader state exactly as it was.

## T43. Training: When the internet is down (B6, 0138)

On the iPad and on a phone. Turn the device off wi-fi (airplane mode) first. Use More ▸ Training ▸ When the internet is down.

1. The status bar at the top of the till says **Offline**. The course starts offline on its own, so this should hold even if the device has a connection.
2. The Guide takes a cash sale: add the Bumble Bee and the Dragon Egg, Charge, Cash, a $20 note, Next, Gave this, No receipt. Pass: the sale completes as usual.
3. The Guide opens **Notifications**. Pass: the finished sale is listed as queued, and it did not try to reach Shopify.
4. The Guide opens More ▸ **Support & diagnostics** and taps **Sync now**. Pass: the button responds and nothing is uploaded.
5. Check 1: take a cash sale offline and find it waiting in the outbox.
6. Check 2: with the reader offline (No internet), the card is refused, so the sale is taken by cash; and a stuck sale is retried from Notifications.
7. **Most important:** with the device offline, run the whole course. Confirm nothing is ever uploaded, the real outbox is untouched, and leaving the course restores the real till exactly as it was.

## T44. Training: Customers on file (B6, 0139)

On the iPad and on a phone. Use More ▸ Training ▸ Customers on file.

1. The Guide rings the **Customers** row on the More tab, then the **New customer** button, then **Start sale** and **Edit** inside a customer's window. Pass: the Customers page opens and a customer's window shows both buttons.
2. The Guide opens Sam Rivera's row, taps **Edit**, adds a mobile number, taps **Save**, then **Start sale**. Pass: Sam's mobile is kept and the till lands on Checkout with Sam attached to the sale.
3. The Show plays the Customers page, the search box narrowing the list, a row opening, Start sale landing on Checkout, and the New customer form being filled in and saved.
4. Check 1: create a customer, then start a sale from the customer you just made. Pass: the new row appears at the top of the list and Start sale puts them on the sale.
5. Check 2: Sam Rivera's mobile is missing, so add it (Edit then Save); and with Priya's items already on the till (cart injection), open Priya's row and tap Start sale so she is put on the sale that is already there.
6. **Most important:** while signed in to the real shop, make a practice customer and edit one. Confirm nothing is sent to Shopify, the real customer list is exactly as it was, and leaving the course restores the real till exactly as it was.

## T45. Training: Items and creating one (B6, 0140)

On the iPad and on a phone. Use More ▸ Training ▸ Items and creating one.

1. The Guide rings the **Items** row on the More tab, then the **Create item** button on the Items page, the price box and **Save to Shopify** on the Edit item page, and the **Create item** button on the Create item page. Pass: the Items page opens, a row opens the Edit item page, and the Create item page opens.
2. The Guide opens Bumble Bee's row, types a new price, taps **Save to Shopify**, then creates a tracked product. Pass: the list shows Bumble Bee at the new price and the new product at the top with a starting stock.
3. The Show plays the Items page, the search box narrowing the list, a row opening, the price changing and saving, and the Create item form being filled in.
4. Check 1: change the Highland Cow Small's SKU, then add a new tracked product. Pass: the row keeps the new SKU and the new product joins the list.
5. Check 2: the practice catalogue is seeded with a barcode that will not scan, so fix the Clearance Print's barcode and save it, then add a new tracked product.
6. **Most important:** while signed in to the real shop, change a practice item and create one. Confirm nothing is sent to Shopify, the real catalogue is exactly as it was, and leaving the course restores the real till exactly as it was.

## T46. Top bar, grid clean-up and screensaver (0141)

On the iPad (rebuild the native project first so the new `app.json` keys apply: `npm run ios:reset`, then `npm run ios`) and on a phone.

1. Checkout ▸ Quick Menu: there is no Qty row, no Reader/Sync pills under the tabs and no logo or shop name above the search bar. Tapping the same item twice gives a cart line of 2; **+** on the line also works.
2. The top bar shows the time, the logo and shop name, the register name, **Reader ready**, **Synced** and the battery. On a phone **Reader ready** is hidden until the reader has a problem.
3. Turn Wi-Fi off. The sync chip turns amber (Offline). Tap it: Notifications opens. Turn Wi-Fi on and it goes back to Synced.
4. Settings ▸ Screensaver & display ▸ **Preview full screen** (or wait for the idle time). The top bar stays across the top of the saver, in the saver's colours, and the logo is not covered. Tapping anywhere, the bar included, wakes it.
5. **Most important:** let the screensaver come on and go off five or six times (also once while signed out, once with a window such as a sheet open). Pass: the iOS bar never appears and the top bar never moves down or doubles. Tell me if it still happens, and whether it was when the saver opened, when it closed, or at some other time.

## T47. Cart warnings (0142)

On the iPad and on a phone. Use More ▸ Settings ▸ Cart warnings.

1. Add a warning: header *Customer Warning*, message *Joints are fragile, do not bend or apply pressure as it will snap.*, **Shows when the cart has** a **Product**, and pick a mini dragon from the search list. Save. It appears in the list with the product's name.
2. Add a second one for a **Category** (a collection), with its own header and message, and turn on **Cashier must tick it**. Add a third with **Show on every sale** on (the target list disappears).
3. Put a mini dragon in the cart and tap **Charge**. Pass: a popup opens before anything else. Its title is the header you set, the message is the big text in the middle (not in a box), the mini dragon is listed under **For:**, there are dots at the bottom, and **Next** and **Back** move between pages with a quick slide. The always-on warning is in there too. There is no *Warning 1 of …* line and no X.
4. Go to the last page. Pass: **Next** has become **Continue to payment**. On the ticked-required warning it is off and a note says how many to tick. Tick it on its own page and Continue switches on. Pass: ticking only the page you are on is not enough if two need it.
5. Tap **Continue to payment**. Pass: the Payment screen opens (or the price adjustment review, if the sale has one). Go back and tap Charge again: only the always-on warning comes up.
6. Edit the mini dragon warning's message, go back to the cart and Charge. Pass: that warning comes back with the new text.
7. Turn a warning **Off** and Charge: it does not appear. Delete one: it asks first.
8. In Settings ▸ Staff, switch a cashier to **Minimal**, sign in as them, and Charge. Pass: the same window appears before payment.
9. With a second register, wait about 25 seconds. Pass: the warnings are on it too.
10. **Most important:** More ▸ Training, start any course with a warning set to always show. Pass: the practice till never shows the real warning, and Charge goes straight on.
11. (0145) On a phone and on the iPad in landscape, give one warning a very long message. Pass: the message scrolls inside the popup while the dots and buttons stay on screen, and the dots and buttons do not move when you go between a short page and a long one. Turn on Reduce Motion: pages change with no slide. Tap **Back to cart**: the popup closes and the cart is as it was. With only one warning in the cart there are no dots and no Back or Next.

## T48. Scanner setup barcodes and speed test (0147)

Set up: the POS-mate scanner paired as a keyboard. Turn the iPad's screen brightness up. Sign in as a manager or owner for steps 6 to 9, and as a cashier for step 10.

1. Open More ▸ Help ▸ Checkout. Pass: a large **Scanner setup barcodes** button is at the very top. Open Help ▸ Scanning items and Help ▸ Hardware: a smaller version of the same button is at the top of each.
2. Tap the button. Pass: the page lists Pairing, Vibration, Volume, Sleep, Scanning mode and Data entry speed, each code drawn as a barcode with its name, what it does and **(default)** on the factory setting.
3. Tap **Vibration off**. Pass: the whole screen goes white and shows only that barcode, its name and one line saying what it does. Scan it with the scanner. Pass: the scanner confirms it took the setting. Tap anywhere: you are back on the list. Scan **Vibration on** to put it back.
4. Try one more code from each group you care about (volume, sleep, scan mode). Note any code the scanner ignores, with the code's name.
5. Open Settings ▸ Hardware. Tap **Show the speed test barcode**, scan it. Pass: the app shows the time per character, which speed it matches and the barcode for the next slower speed. Scan **Medium speed**, then the speed test again. Pass: the time per character goes up and the matching speed changes.
6. Signed in as a manager or owner, open Settings ▸ Hardware ▸ **Admin ▸ Calibrate**. Pass: it is there. Pick **Fast**, scan **Fast speed**, then scan the speed test barcode 3 times. Pass: **Save** stays off until the third scan, then switches on with the measured range.
7. Save, then do the same for Medium, Slow and Super slow. Tell me the four ranges you got. Pass: they do not overlap and run from fastest to slowest.
8. Run the speed test at each speed. Pass: each is named as the speed it was set to.
9. With a second register, wait about 25 seconds. Pass: Hardware ▸ Calibrate there shows the same calibration date. Tap **Reset to the manual's ranges** and confirm: both registers go back to the manual's ranges.
10. Signed in as a cashier, open Settings ▸ Hardware. Pass: the speed test is there but **Admin ▸ Calibrate** is not.

## T49. AI assistant settings (0148)

On the iPad. This needs the new native build, because the local network permission text changed in `app.json`. There is no chat screen yet, so this only tests the Settings page. You need a model server: Ollama on a PC on the same Wi-Fi is the easiest.

1. More ▸ Settings. Pass: there is an **AI assistant** row that says *Not set up*. Sign in as a cashier (when staff sign-in is on). Pass: the row is not there. With an owner on the team, sign in as a manager. Pass: the row is not there either. Sign in as the owner and open it.
2. Type your PC's address, for example `192.168.1.20:11434/v1`, and a model name your Ollama has. Pass: the page says **This address counts as: Local**. Change the address to `https://api.example.com/v1`. Pass: it says **Remote**. Change it to `http://localhost@evil.com/v1` and tap **Test connection**. Pass: it refuses the address and says to remove the user name and password.
3. Put the real address back and tap **Test connection**. Pass: iPadOS asks to allow local network access (tap Allow), then three lines show **Passed**: the server answers, the model replies, the model can call a tool.
4. Turn the PC's Ollama off (or use the wrong port) and test again. Pass: **Failed** on the first line, the other two say *Not checked*, and the message says the server could not be reached.
5. Type a model name that does not exist. Pass: the second line fails, says the server does not have that model, and lists the names it does have.
6. If you have a model that cannot use tools, test with it. Pass: the third line fails and says so.
7. Tap **Save**, leave Settings and come back. Pass: the address and options are still there, and the row shows the model name.
8. Enter an API key (any text), tap **Save**, and reopen the page. Pass: the key box is empty with a hint like *Saved, ends 1234* (or just *Saved* for a short key), never the whole key. Tap **Remove saved key**, then **Save**. Pass: the hint goes.
9. Set **Timeout** to 5 and point the address at a PC that is switched on but has a firewall that drops the connection. Pass: after about 5 seconds the message says the model did not answer in time. Set the timeout back to 120.
10. Type absurd numbers in the options (temperature 99, timeout 1, tool call limit 0), Save, and reopen. Pass: they have been brought into range (2, 5, 1).
11. **Most important:** Settings ▸ Backup & transfer. Export an encrypted backup with a passphrase, then Restore it on a second iPad (or after removing the key and the address here). Pass: the address, model, options and the API key come back. On a register that is sharing settings with another, change the address on one and wait about 25 seconds. Pass: the other register's address does not change.
12. More ▸ Training, start any course, then open Settings ▸ AI assistant. Pass: Save and Test connection say they are switched off in practice mode.

## T50. Auto, Local or Remote for the AI assistant address (0149)

On the iPad, signed in as the owner (or a manager when the team has no owner). No new native build needed.

1. More ▸ Settings ▸ AI assistant. Pass: under the address there is a three way choice, **Auto**, **Local**, **Remote**, and **Auto** is selected on a fresh setup.
2. Type `192.168.1.20:11434/v1`. Pass: the page says **This address counts as: Local**. Choose **Remote**. Pass: it says **Remote (set by you)**. Choose **Auto** again. Pass: it goes back to **Local** with no *(set by you)*.
3. Type `https://api.example.com/v1`. Pass: **Remote**. Choose **Local**. Pass: it says **Local (set by you)**. Choose **Auto**. Pass: back to **Remote**.
4. Choose **Remote** with the PC's address, tap **Save**, leave Settings and come back. Pass: **Remote** is still selected.
5. **Most important:** Backup & transfer. Export a backup with **Remote** chosen and restore it. Pass: **Remote** comes back. On a register that is sharing settings with another, change the choice on one and wait about 25 seconds. Pass: the other register's choice does not change.
6. If this iPad had **Treat this address as local** switched on before this update, open the page. Pass: **Local** is selected. If it was off, **Auto** is selected.

## T51. Share Square history between registers (0150)

Needs two iPads on the same Wi-Fi, and the new native build on both (the TCP server is a new native module: `npm install`, then `npm run ios:reset`). The first iPad must already have Square history imported.

1. On the iPad with no history, open Settings ▸ Square history. Pass: **Share with another register** is not shown (nothing to share yet).
2. On the iPad that has history, open Settings ▸ Square history. Pass: **Share with another register** is there. Tap **Show QR for another register**. Pass: iPadOS may ask to allow local network access (tap Allow), then a QR code appears with the line *Waiting for another register to scan this code…* and the address written under it.
3. On the other iPad, open Settings ▸ Square history ▸ **Scan QR from PC** and scan the code. Pass: the scanner accepts it, the import shows *Downloading 1 of N…* and ends with the same number of sales and refunds as the first iPad. On the first iPad the line changes to *Sending…* and then *Sent to 1 register.*
4. On the second iPad open Reports and Transactions (Square history chip). Pass: the totals match the first iPad's, apart from item matching (each iPad matches to its own Shopify catalogue).
5. Back on the first iPad, scan the same code with a third register if you have one. Pass: the line says *Sent to 2 registers.*
6. Tap **Stop sharing**. Pass: the QR goes away. Scan the old code again on the second iPad. Pass: it fails with *Could not reach the PC* (the message still says PC).
7. Start sharing again and leave it for 10 minutes without scanning. Pass: it stops by itself and says so. Start again and press the Home button, then return. Pass: it has stopped and says the app left the screen.
8. Turn Wi-Fi off on the first iPad and tap **Show QR for another register**. Pass: a message says it is not connected to Wi-Fi.
9. Start sharing, then on the second iPad type the address into **…or type the address the script printed**. Pass: it imports the same way.
10. Start sharing, then change one digit of the key in the address on the second iPad and import. Pass: it fails and reports a 404.
11. More ▸ Training, start any course, then try **Show QR for another register**. Pass: it says sharing is switched off in practice mode.
12. Start sharing and leave the iPad alone for the length of your screensaver delay. Pass: the screen stays awake and the QR stays up (sharing keeps the screen awake).

## T52. Ask the assistant: the chat screen (0151)

On the iPad, with a model server set up as in T49 (Ollama on a PC on the same Wi-Fi is the easiest). Sign in as the owner (or a manager when the team has no owner). This chat has no tools, so it knows nothing about the shop.

1. Open **Help**. Pass: a sparkles button sits at the top, beside Contents. Sign in as a cashier (or as a manager when there is an owner). Pass: the button is not there. Lock the till. Pass: Help from the sign in screen has no sparkles button either.
2. As the owner, tap it and ask *How do I give a customer a receipt?* Pass: after a moment a short reply appears. Tap **More detail**. Pass: a fuller reply follows.
3. Ask *Hi*, then ask a long question that needs steps. Pass: the first answer is a line or two and the second is longer.
4. Ask *What is the price of the Mini Gemstone Dragon?* Pass: it says it cannot look up the shop's products yet and does not make up a price.
5. Type `my email is jo@example.com and my card is 4111 1111 1111 1111` and send. Pass: your message shows the tags [email address] and [card number], a line under it says what was hidden, and the reply does not repeat either.
6. Pass for dashes: none of the replies contain a long dash (em or en dash). Ask for *a list of opening hours from 9 to 5* to try to provoke one.
7. Ask a question in another language, for example *Comment fait-on un remboursement ?* Pass: it replies in that language.
8. Leave the chat and come back. Pass: the messages are still there. Sign in as a different staff member who may open the chat (or turn staff sign in off and on). Pass: their chat is empty, and yours is back when you return. Tap the bin and confirm. Pass: only the signed in person's history clears.
9. Turn the PC's Ollama off and ask something. Pass: a bar says it cannot reach the model, with **Retry** and **Open model settings**. Turn Ollama on and tap **Retry**. Pass: the answer arrives and the bar goes. Set a wrong model name in settings and ask. Pass: the bar says the model was not found. Set the timeout to 5 and ask a long question on a slow model. Pass: after 5 seconds the bar says the model took too long, and *Still working* showed while it waited.
10. **Most important:** More ▸ Training, start any course, then open Help and the chat. Pass: the chat says the assistant is switched off in practice mode, and Send does nothing. Nothing reaches your server (check its log).
11. Settings ▸ Backup & transfer: export a backup, restore it on a second iPad. Pass: the chat history does NOT come across.
12. Open the chat before the model is set up (clear the address and model). Pass: a box says it is not set up, with **Open model settings** for the owner. Tap it. Pass: the AI assistant settings page opens, and Back returns to the chat.

## T53. Assistant conversation log, recording (0152)

On the iPad, with the model set up as in T49 and the chat as in T52. Sign in as the owner. There is no viewer yet, so most of this is checked by what the chat does and by what is NOT visible.

1. Open the chat and ask *How do I give a customer a receipt?* Pass: the answer arrives as before, and the small print under the box now says conversations are also logged for the manager.
2. Open the Files app, then On My iPad, then the till app's folder. Pass: there is no assistant-log folder there (the log is kept where Files cannot see it).
3. Ask five or six more questions, including one with a pasted email address and card number (`jo@example.com`, `4111 1111 1111 1111`), and one after turning the PC's Ollama off. Pass: nothing looks different in the chat. The failed one shows the usual red bar.
4. Tap the bin in the chat and confirm. Pass: your history clears and the log is unaffected (it cannot be checked until the viewer in 0153; for now just confirm nothing breaks).
5. Sign in as a different staff member who may open the chat, ask a question. Pass: it works.
6. Fill the iPad's storage nearly full (or ask the developer for a build with a tiny log cap) and ask a question. Pass: you still get the answer, and a red line under the chat says *This conversation could not be added to the log. Tell a manager.*
7. **Most important:** More ▸ Training, start any course, then open the chat. Pass: it says the assistant is switched off in practice mode. Nothing is logged and nothing reaches your server.
8. Settings ▸ Backup & transfer: export a backup, restore it on a second iPad. Pass: nothing about the log comes across.

## T54. Assistant conversation log, viewer (0156)

On the iPad, with the model set up as in T49 and some conversations in the log (T53). Sign in as the owner or a manager.

1. Settings ▸ AI assistant: tap **View conversation log**. Pass: the viewer opens, showing a list of conversations with staff member, time and the question.
2. Use the filters: pick **Errors**, **Practice** or **Remote**. Pass: the list narrows to matching conversations. Type a staff member's name. Pass: only their conversations show.
3. Tap a conversation. Pass: it expands to show the question, the reply, what was sent to the model, and what was masked.
4. Tap **Export log**. Pass: a file is saved through the iPad's Files (check in Files app, On My iPad, in the till app's folder).
5. Tap **Clear log**, type `CLEAR` and confirm. Pass: the log is emptied and the list shows no conversations.
6. Change the **Conversation log cap** to a small value (for example 1 MB), save, then ask more questions. Pass: the oldest entries are removed when the cap is passed, and a note in the viewer says entries were purged.
7. **Most important:** sign in as a cashier (not a manager or owner). Pass: the **View conversation log** button is not shown in Settings ▸ AI assistant, and the viewer cannot be opened.

## T55. Assistant docs tools (0157)

On the iPad, with the model set up in Settings ▸ AI assistant (the model must support tool calling: Test connection shows "Tool calling: ok").

1. Help ▸ sparkles ▸ ask *How do I take a cash payment?* Pass: it answers with steps from the Taking cash help page and names the page. It takes a little longer than before.
2. Ask *How do I refund a card payment?* Pass: the answer matches Help ▸ Refunds, not general knowledge.
3. Ask something the help does not cover, for example *What is the weather tomorrow?* Pass: it says it could not find anything on that, and does not make something up.
4. Sign in as a **cashier** and ask *How do I set up the AI assistant?* and *How do I add a staff member?* Pass: both get "I couldn't find anything on that" and neither names Settings or Staff pages. Sign in as a manager and ask the same: both are answered.
5. As the owner, open More ▸ Settings ▸ AI assistant ▸ Conversation log and open the conversation from step 2. Pass: **Tools used** lists each search and read, with what the model was given.
6. **Most important:** the cashier's questions in step 4 show in the log with the tool results, and those results never contain a Settings or Staff page.
7. Turn the model off (wrong address) and ask anything. Pass: the red bar shows as before.


## T56. Assistant screen tool (0158)

On the iPad, with the model set up as in T55.

1. Ask *Where do I count the cash drawer at the end of the day?* Pass: it names the Cash drawer page and the Close drawer window, and gives taps that start from the Checkout tab (More, Cash drawer, Close drawer). The taps match what you do on the iPad.
2. Ask *How do I refund a sale?* Pass: it points to Orders and the Return window with the taps (More, Orders, the order, Refund or return), and explains the steps from the Refunds help page.
3. Ask *Where is the split payment screen?* Pass: it says Charge, then Split.
4. Ask *Where is the teleporter screen?* Pass: it says it could not find anything on that, and does not invent a screen.
5. Sign in as a **cashier** and ask *Where do I add a staff member?* and *Where are the Shopify settings?* Pass: both get "I couldn't find anything on that" and neither names Settings or Staff. Sign in as a manager and ask the same: both are answered, with More, Staff and More, Settings.
6. **Most important:** as the owner, open the conversation log for the cashier's questions in step 5 and open **Tools used**. Pass: the search_screens results contain no Settings, Staff, Switch staff or Staff pass screen.
7. Turn the model off (wrong address) and ask anything. Pass: the red bar shows as before.


## T57. Assistant link tool (0159)

On the iPad, with the model set up as in T55.

1. Ask *Where are the reports?* Pass: the reply says where Reports is, and an **Open Reports** button is under it. Tap it. Pass: the Reports page opens, and Back returns to the chat.
2. Ask *How do I take a cash payment?* Pass: the reply names the Taking cash help page, with a button for it under the reply. Tap it. Pass: Help opens on that page.
3. Ask *Where is the refund window?* Pass: the reply gives the taps (More, Orders, the order, Refund or return). Pass: there is no button for the window itself, though there may be one for Orders.
4. Ask *Take me to Inventory.* Pass: an **Open Inventory** button appears. Tap it. Pass: the Inventory tab opens.
5. Close the app and open the chat again. Pass: the buttons are still under the earlier replies and still work.
6. Sign in as a **cashier** and ask *Take me to Settings* and *Open the staff page.* Pass: both get "I couldn't find anything on that", and no button appears for Settings or Staff.
7. **Most important:** sign in as the owner, ask *Where are the Shopify settings?* (a button for Settings appears), then sign in as a cashier. Pass: the cashier cannot see the owner's history, and the owner's history has no Settings button once the role loses access (for example after changing that person to a cashier and signing in as them).
8. As the owner, open the conversation log and open the step 1 conversation, then **Tools used**. Pass: the show_link call is listed with the note the model was given.
9. Turn the model off (wrong address) and ask anything. Pass: the red bar shows as before.

## T58. Assistant offline search (0160)

On the iPad, with the model set up as in T55. Sign in as the owner (or a manager when the team has no owner).

1. Turn the model off (switch off Ollama on the PC, or set a wrong address) and ask *Where do I count the cash drawer?* Pass: a red bar says it cannot reach the model, and under your question a box headed **Model offline, showing search results.** lists screens (with what each is for and taps starting from Checkout) and help pages.
2. Tap a help page in the box. Pass: Help opens on that page, and Back returns to the chat with the list still there. Tap an **Open** button on a screen in the list (for example Cash drawer). Pass: that page opens. A screen that is a window (for example Close drawer) has no button, only its taps.
3. Ask *teleporter*. Pass: the red bar shows and the box says it could not find anything on that.
4. Turn the model back on and ask a new question. Pass: the model answers, the red bar goes, and the earlier list is still in the chat.
5. Turn the model off, ask something, turn it back on and tap **Retry** on the red bar. Pass: the model's answer replaces that list, and your question appears once, not twice.
6. With the model off, ask a question. Pass: there is no **More detail** button under the list. Turn the model on and ask a question. Pass: after its answer **More detail** is there. Turn the model off and tap it. Pass: the red bar shows and no list is added.
7. Clear the address and model in Settings ▸ AI assistant, then open the chat and ask *How do I give a customer a receipt?* Pass: the red bar says it is not set up, Send works, and the list appears.
8. Type `refund for jo@example.com` with the model off. Pass: your message shows [email address], and the list is about refunds.
9. Sign in as a **cashier** (with a manager or owner on the team) and ask *Where do I add a staff member?* and *Where are the Shopify settings?* Pass: both get the could not find anything message and nothing names Settings or Staff. Sign in as a manager and ask the same: both are listed, with More, Staff and More, Settings.
10. Signed in as a manager, with the model off, ask *Where do I add a staff member?* Pass: Staff is listed. Sign in as a cashier and open the chat. Pass: it is empty (each person has their own chat), and asking the same question lists no Staff or Settings.
11. Settings ▸ AI assistant ▸ View conversation log. Pass: each offline search is a line headed with a search icon and *Offline search*. Opening it shows why the model was not used, and the screens and help pages it found. Nothing in it was sent to a model.
12. Ask the same question again with the model on. Pass: the model's reply does not mention the earlier offline question or list.
13. **Most important:** More ▸ Training, start any course, then open the chat and type a question. Pass: it says the assistant is switched off in practice mode, no list appears, and nothing is logged.

## T59. Assistant data gate settings (0161)

On the iPad, with the model set up as in T55. Sign in as the owner (or a manager when the team has no owner). The assistant cannot look up shop data yet, so this checks the settings and that nothing else changed.

1. More ▸ Settings ▸ AI assistant. Pass: a section **What the assistant may see** lists seven rows (Customer details, Email addresses, Gift card balances, Gift card codes, Order totals and items, Cost prices and profit, Stock, sales, products and deals), each set to **Auto**, and two fixed rows (Payment details, Keys and passwords) that say *Never sent. This cannot be changed.*
2. With an address like `http://192.168.1.20:11434/v1`, check **Right now** on each row. Pass: Customer details, Email addresses and Gift card balances say *Sent*, Gift card codes says *Last four characters only*, the other three say *Sent*.
3. Under *This address counts as*, tap **Remote** (or use an address like `https://api.example.com/v1`). Pass: Customer details, Email addresses, Gift card balances and Gift card codes now say *Not sent*. The other three still say *Sent*.
4. On Remote, set Customer details to **Always allow**. Pass: its line says *Sent* and a bold warning says it sends the details to a server outside your own network. Set Gift card codes to **Always allow**. Pass: it says *Last four characters only*, never *Sent*.
5. Set Stock, sales, products and deals to **Never allow**. Pass: it says *Not sent*, on both Local and Remote.
6. Tap **Save**, leave the page and come back. Pass: every choice is as you left it. Tap **Test connection**. Pass: it works as before.
7. More ▸ Backup & transfer: make a backup and restore it on the same iPad, or on another one. Pass: the choices come back as you set them. Pass: they are not changed on another register that is syncing with this one.
8. Edit the backup file by hand to put `"payment":"allow"` inside the `gate` part, then restore it. Pass: the Payment details row is still fixed as never sent.
9. Open the chat and ask *How do I take a cash payment?* Pass: it answers from the help pages as before, with the same buttons.
10. Type `refund for jo@example.com, card 4111 1111 1111 1111` and send. Pass: your message shows [email address] and [card number], whatever the choices above are.
11. Open the conversation log and open that conversation. Pass: it looks as before, and no *Withheld by the data rules* line appears, because nothing was withheld.
12. **Most important:** sign in as a cashier. Pass: the cashier cannot open AI assistant settings and so cannot change any of these choices.

## T60. Assistant guide tool (0162)

On the iPad, with the model set up as in T55. This is the first time the pointer is drawn on a real screen, so look closely at where the ring lands.

1. Sign in as a **cashier** and ask *Show me how to get to Reports.* Pass: the reply has a **Guide me to Reports** button. Tap it. Pass: the till goes to the Checkout tab and a ring appears on the **More** tab with a small card saying *Tap More.* and *Step 1 of 2*. The rest of the screen is not dimmed and every other button still works.
2. Tap More. Pass: the ring moves to the **Reports** row and the card says *Tap Reports.* and *Step 2 of 2*. Tap Reports. Pass: the card says *You are there: Reports.* and goes away by itself after a few seconds (or tap **OK**).
3. Start the guide again, tap More, then tap another row (Orders) instead. Pass: the ring does not stay on a button that is gone, and the card says it cannot see the next button and offers Stop. Tap the Checkout tab and then More. Pass: the ring points at Reports again.
4. Start it again, tap More, then ask the chat for a different guide (*Guide me to Gift cards*) and tap that button. Pass: the first guide is replaced, not shown twice.
5. Start a guide and tap **Stop**. Pass: the ring and card go. Start one and put the iPad down for ten minutes. Pass: it ends by itself.
6. Ask *Where is the Transactions tab?* and tap the guide button. Pass: the ring is on the Transactions tab at the bottom (it had no ring before this patch), and the card says *You are there* once you tap it.
7. Ask *Show me the Keypad.* and tap the guide button. Pass: the ring is on the Keypad tab in Checkout. Tap it. Pass: the card says you are there.
8. Ask *Guide me to Help.* and *Guide me to Gift cards.* Pass: both rings land on their rows of the More page. Then, as a **manager**, ask for Settings and Staff. Pass: both rings land on their rows.
9. Ask *Guide me to the refund window* (or any window, such as Close drawer). Pass: there is no guide button, only the taps in words. Ask for the **Checkout** tab. Pass: no guide button, since every guide starts there.
10. As a **cashier**, ask *Guide me to Settings* and *Guide me to Staff.* Pass: both get *I couldn't find anything on that* and no button appears, the same as for *Guide me to the teleporter.*
11. **Most important:** as the owner, start a guide, then sign in as someone else without stopping it. Pass: the guide is gone for the new person.
12. As a manager, open the conversation log, open the conversation from step 8, then **Tools used**. Pass: the show_guide call is listed with the note the model was given.
13. Open the chat after a guide button was shown, close the app and open the chat again. Pass: the guide button is still under the reply and still starts a guide.
14. Turn the **More** page down to Essential or Minimal in the display settings, then ask to be guided to Items. Pass: if the Items row is hidden, the card says it cannot see the next button instead of ringing the wrong thing. (This is a known rough edge: the guide does not know which rows a display mode hides.)

## T61. Assistant shop data tools (0163)

On the iPad, with the model set up as in T55. Do steps 1 to 9 first with the address set to **Local**, then repeat steps 3, 5 and 6 with it set to **Remote**. Make a few sales on this till first (one with a customer, one with a gift card sold and one paid with a gift card, one refund) so there is something to find.

1. Ask *How much did we sell today?* Pass: the net sales, discounts, refunds, orders and takings match **More ▸ Reports ▸ 1D** for this till (the Reports page can be higher when other tills are selling), and the amounts are in dollars.
2. Ask *How many Tadlings did we sell this week?* (use an item you sold). Pass: the count matches what you sold, minus refunds, and it says the figure is before discounts.
3. Ask *Find order 1042* (use a real order number from this till). Pass: it lists the order with its items and total. On **Local** it names the customer. On **Remote** it says it cannot show customer details and never gives a name.
4. Ask *Show me the details of that order.* Pass: items, prices, deals and any price adjustment appear. It never shows card numbers, and it does not say how the order was paid (it says payment details are hidden).
5. Ask *Find the customer* and a name you saved. Pass: on **Local** it finds them with their email and phone and order count. On **Remote** it says it cannot show customer details. Ask for a name that does not exist. Pass: the reply looks the same as for a name that does.
6. Ask *Which gift cards did we sell this week?* Pass: it lists them. On **Local** a code shows as the last four characters only. On **Remote** no code and no recipient name or email appears. Ask *What is left on gift card ending 1234?* Pass: it says it cannot look up a balance and points at the Gift cards screen.
7. Ask *What deals are on right now?* Pass: it matches **Settings ▸ Discounts & bundles**, and a deal whose end date has passed, or that is switched off, is listed as not running.
8. Ask *What did we make in profit this month?* Then in **AI assistant settings** set **Cost prices and profit** to **Never allow** and ask again. Pass: the second time it says it cannot show costs and profit, and still gives net sales.
9. As a **cashier**, ask the question from step 1. Pass: it answers, as the Reports page is open to cashiers.
10. If you imported Square history, ask *How much did we sell in March 2025?* (use a month you imported). Pass: it gives the imported totals.
11. Put a phone number such as 0412 345 678 in a price adjustment reason on a sale, then on **Remote** ask for that order's detail. Pass: the reason shows [phone number].
12. As a manager, open the conversation log and open the conversation from step 3, then **Tools used**. Pass: the find_orders call is listed, the result holds only dollar text, and on **Remote** the withheld counts show customer and payment details.
13. **Most important:** turn on practice mode and try to send. Pass: sending is still blocked, and nothing about the shop is described as practice data.
14. With a till that has a long history (a thousand or more sales), ask for a sales report and an order search. Pass: each answers without the screen freezing for longer than the model's own thinking time.

## T62. Assistant product and stock tools, and the offline product list (0164)

On the iPad, with the model set up as in T55. Pick a product with variations (for example one with a Red and a Blue), a plain item, and one that is not tracked, and note what **Inventory** shows for each. Do steps 1 to 8 first with the address set to **Local**, then repeat step 3 with it set to **Remote**.

1. Ask *How much is the (product with variations)?* Pass: it gives the price, or the price range, and offers the variations. The prices match the **Items** page.
2. Ask *How many (product) (colour) do we have?* Pass: the number matches what **Inventory** shows for that variation, in the same words: *In stock*, *Out of stock*, *oversold* or *Not tracked*. For a product with several variations it names the one you asked for and does not add up the others.
3. Ask *What is the SKU and barcode of (product), and what did it cost us?* Pass: SKU and barcode match the item page. On **Local** and **Remote** the cost shows, because cost is allowed on both by default. Then set **Cost prices and profit** to **Never allow** in the AI assistant settings and ask again. Pass: it gives the SKU and barcode and says it cannot show costs.
4. Ask *What is low on stock?* Pass: the list matches **Inventory ▸ Filters & sort ▸ Low** (2 or fewer, with out of stock included), lowest first, and the counts it quotes are right. Ask *What is oversold?* and *What is out of stock?* Pass: each matches the Inventory filter of that name.
5. Ask *How much stock do we have in (a category)?* Pass: it matches the Inventory list filtered to that category. Ask about a category that does not exist. Pass: it says no category matched and names the real ones.
6. Ask about a product you have set to **Draft** or **Archived**. Pass: it says it cannot find it. Then ask *Include draft products: do we have (that product)?* Pass: it is found and marked as draft.
7. Scan nothing, but type a barcode from an item into the chat. Pass: it finds that item.
8. Ask *Do we have a deal on (a product in a live deal)?* Pass: it says which deal could apply and that it may need more than one item (it can use **list_deals** for the rest).
9. **Offline list:** switch the iPad to Airplane mode (or turn the model off) and ask *how many (product) do we have*. Pass: the red bar shows, and under *Model offline, showing search results* there is a **PRODUCTS** list with the price, the stock and a line for each variation. Ask *what is low on stock*. Pass: a low-stock list appears and matches step 4.
10. In Airplane mode ask a question that has nothing to do with products (*how do I refund a card*). Pass: the list shows screens and help pages only, with no products.
11. As a manager, open the conversation log and open the offline search from step 9. Pass: it lists the products found. Open a conversation from step 2, then **Tools used**. Pass: the find_products call is listed and holds only text such as $12.00 and *5 in stock*.
12. **Most important:** turn on practice mode. Pass: sending is still blocked, and no product list appears for anything typed. Leave practice mode and ask step 2 again. Pass: it describes your real stock, not the practice catalogue.
13. With a large catalogue (a thousand or more variations), ask *what is low on stock* and a product search. Pass: each answers without the screen freezing for longer than the model's own thinking time.

## T63. Assistant chat window and Markdown replies (0165)

On the iPad, with the model set up as in T55. Do steps 1 to 8 on the Assistant screen, in light mode first, then repeat step 4 in dark mode.

1. Open **Help ▸ sparkles** with an empty history. Pass: a badge, the title, a short line saying what it can look up, and four starter questions. None of the words say it cannot see products, stock or sales. Tap *What is low on stock?*. Pass: it is sent as your question and answered.
2. Ask *Give me the steps to refund a card payment as a numbered list, with the important words in bold.* Pass: a real numbered list with 1., 2., 3. in the accent colour, and the bold words are bold. No `**` or `#` marks show.
3. Ask *Show the stock of three products as a table.* Pass: a table with a shaded header row. With four or more columns it scrolls sideways inside the bubble and the bubble does not grow past the screen.
4. Ask *Write one heading, a short paragraph and a bullet list about opening the till.* Pass: the heading is larger and bold, the bullets are tidy, and the bubble has a squared corner on the badge side. Your own messages are on the right in the accent colour.
5. Ask *Show me a code example of the word hello in a box.* Pass: a grey box with fixed width letters that scrolls sideways when long.
6. Press and hold on a reply. Pass: you can select words and copy them. Paste them into the question box to check.
7. Try to make it write a link: *Reply with a link to https://example.com in the words Click here.* Pass: the words show but are not underlined or tappable, and nothing opens.
8. While it is thinking, look at the chat. Pass: a bubble with a small spinner and *Thinking...* (and after five seconds, how many seconds so far). The Send arrow shows a spinner and cannot be tapped twice. With an empty box the arrow is faded and does nothing.
9. Turn the display mode text size up. Pass: reply text grows with it and nothing is cut off.
10. Turn the model off and ask something. Pass: the red bar and the offline list look as they did before, with the same buttons, and the list has the same layout as ever.
11. **Most important:** turn on practice mode. Pass: sending is still blocked, the starter questions are hidden, and the box and arrow cannot be used.

## T64. Assistant date and time tool (0166)

On the iPad, with the model set up as in T55. Note the date and time shown on the iPad's own clock first.

1. Ask *What is today's date and what time is it?* Pass: the date and weekday match the iPad, and the time is within a minute of it.
2. Ask *How much did we sell yesterday?* Pass: it works out yesterday's date and the figure matches **Reports** for that day. It does not ask you what day it is.
3. Ask *How much did we sell this week?* and *last month?* Pass: both match **Reports** (this till only), with weeks starting on Monday. On a Sunday, this week still starts on the Monday six days before.
4. As a manager, open the conversation log and open the conversation from step 2, then **Tools used**. Pass: a `current_time` call is listed before the sales call, and its result holds only dates, the weekday and the time.
5. Change the iPad to a different time zone (Settings ▸ General ▸ Date & Time) and ask step 1 again. Pass: it follows the iPad's clock.
6. **Most important:** turn on practice mode. Pass: sending is still blocked. Nothing about the date changes anything.

## T65. Assistant screen and register context tool (0167)

On the iPad, with the model set up as in T55. You need one cashier set to **Minimal** display mode (More ▸ Staff ▸ their name ▸ Display mode) and one set to **Standard**.

1. Sign in as the Standard person. Open **More ▸ Help**, tap the sparkles button and ask *Which screen was I on before this chat, and what is it for?* Pass: it says the More tab, the menu of the other pages, and does not name a page you did not visit.
2. Ask *Which tabs can I see?* Pass: it lists all five (Checkout, Inventory, Transactions, Notifications, More) and says Standard.
3. Sign out and sign in as the Minimal person, open the chat the same way and ask *Which tabs can I see?* Pass: Checkout, Transactions and More only, and it says Minimal.
4. As the Minimal person ask *How do I check stock levels?* Pass: it does not tell you to tap the Inventory tab, because that tab is not on this person's tab bar. A small model may still slip here; note which model if it does.
5. Ask *Which register is this?* Pass: the name matches this register's name on the **Reports** page.
6. Optional, if you can get a Help button from a message on a page (for example an error shown while taking a payment), tap it, open the assistant from there and ask *What page was I on?* Pass: it names that page and the More tab is not given as the answer.
7. As a manager, open the conversation log, open the conversation from step 2, then **Tools used**. Pass: a `screen_context` call is listed, and its result holds only the role, display mode, tabs, guided checkout, practice mode, register name, selected tab and a screen name, kind and summary. No ids, no staff name.
8. **Most important:** turn on practice mode. Pass: sending is still blocked, and nothing about where you are changes anything.

## T66. Cash drawer shared between registers (0168)

You need two iPads on the same shop, both past **Import from Shopify**, with the model setup in T55 not needed. Register A and register B.

1. On A, open **More ▸ Cash drawer** and open the drawer with a float of $200. Pass: the drawer opens on A.
2. On B, open **More ▸ Cash drawer**. Pass: within about 25 seconds (or immediately after **More ▸ Diagnostics ▸ Sync now**) it shows the same open drawer, the same $200 float and the same history, without opening it again.
3. On B, tap **Paid in**, put in $50 with a reason. Pass: B moves to $250 expected. On A, within ~25 seconds the $50 and the reason appear in the history and the paid-in total matches.
4. On A, take a **cash sale** of, say, $12.50. Pass: on B the ledger shows the cash received and change given, and the expected amount includes A's sale (expected cash counts every register). Do the same on B and check A.
5. On B, **Count & close** to $0 (or the counted amount). Pass: A follows to closed within ~25 seconds.
6. Go into **airplane mode** on A (no connection). Open the drawer on A and take a cash sale. Pass: A still works with no connection. Turn the connection back on, wait for the poll (or **Sync now**). Pass: A's entries merge into B and nothing B did is lost; B's entries are on A.
7. **Most important:** turn on practice mode on both. Open and use the drawer. Pass: nothing is sent, and the drawers do not change each other. When you leave practice mode, the real drawer is exactly as you left it.

## T67. Assistant settings reader and status tool (0169)

On the iPad, with the model set up as in T55. Do steps 1 to 4 as an owner, then step 5 as a cashier (turn staff sign-in on and make a cashier first if there is none).

1. Ask *How is the till doing?* Pass: it names the sync state, when it last synced, how many sales are waiting to upload and whether the card reader is ready, and the figures match **More ▸ Support & diagnostics**.
2. Turn the iPad's Wi-Fi off, ring up a cash sale, then ask *Is anything waiting to upload?* Pass: it says one sale is waiting, and it is not offline-only wording. Turn Wi-Fi on, tap **Sync now**, ask again. Pass: the answer has changed to match.
3. Ask *Is cash rounding on?* and *Which roles can't change prices?* Pass: both answers match **More ▸ Settings** and **Staff**. Ask *What is the web address of the receipt page?* and *What is Priya's PIN?* Pass: it gives no address, no PIN, and no staff name, and says it can only tell you whether the page is set up.
4. As a manager when the team has an owner, ask *What model is the assistant using?* Pass: it says it couldn't find anything on that (a manager cannot open the AI assistant settings then). As the owner, ask the same. Pass: it gives the model name and whether the address is local or remote, not the address.
5. As a cashier, ask *Is cash rounding on?* Pass: *I couldn't find anything on that*, never *you are not allowed*. Ask *How is the till doing?* Pass: it answers (cashiers can use Support & diagnostics).
6. As a manager, open the conversation log, open the conversation from step 3, then **Tools used**. Pass: a `read_settings` call is listed with its result, and the result holds no address, key, PIN or staff name. Open the cashier's conversation from step 5. Pass: no `read_settings` call is listed.
7. In **Settings ▸ AI assistant**, set *Stock, sales, products and deals* to **Never allow** and ask step 1 again. Pass: it says it cannot show that, and does not guess. Set it back to **Auto**.
8. **Most important:** turn on practice mode. Pass: sending is still blocked, and nothing about the till's settings or status changes anything.

## T68. Demo mode (F8)

Set up: the latest build, on a normal till (whatever you have open is fine). Before step 1, note your real cart, drawer state and sale count so you can compare at step 8.

1. Open **More ▸ Demo mode** (the top row). Pass: the Demo mode home opens, a bar across the top reads **DEMO MODE · nothing here is real**, and the home lists features grouped by area (Selling, Taking payment, Customers and carts, Products and stock, Money and reporting, Setup and help).
2. Check that nothing is real. Open **Transactions**. Pass: five made-up sales and a refund, not your own sales. Open **More ▸ Orders**, **Customers** and **Items**, and (as owner) **Reports**. Pass: made-up data throughout. Note your real cart, drawer state and sale count now.
3. Check who you are. The More header reads **Alex Demo** (owner) and the top row now says **Leave demo mode**. Open **More ▸ Staff**. Pass: Alex Demo (Owner) and Jordan Demo (Manager) only, with no real names.
4. Watch a feature. On the Demo mode home, tap **Watch** on any feature (for example Build a cart). Pass: the Training Show plays, Back / Replay / Next work, and leaving the Show returns to the home.
5. Try a feature live. Tap **Try it** (or **Open**) on a feature. Pass: it opens on the demo data, and a change you make (add an item to the cart) sticks until you leave.
6. The virtual card terminal. Ring up an amount and pay by card. Pass: the practice Zeller terminal appears on the iPad itself, and finishing it completes the sale without charging any card. Your real card reader must not wake or charge.
7. The virtual scanner, drawer and receipt. Scan a practice barcode. Pass: the practice barcode sheet appears, not the camera. Open **More ▸ Cash drawer** and open the drawer or take a cash sale. Pass: the demo figures move and your real drawer is not opened. Take a receipt. Pass: it is the practice receipt and nothing is sent (any QR page says it is not published).
8. **Most important:** leaving puts everything back. Leave with **Leave** on the top bar (or **More ▸ Leave demo mode**). Pass: the bar disappears and your real till returns exactly as at step 2: same cart, same drawer, same sales, with no demo sale added. Force-quit and reopen the app. Pass: no demo data appears; it is your normal till.

Tell me: whether the Demo mode home is easy to find and read, anything that looked too much like your real data, and whether any virtual part (card, scanner, drawer, receipt) still touched the real thing instead.

## T69. Assistant cash drawer, calculator and cart tools (0172)

On the iPad, with the model set up as in T55. Open the drawer with a float first (More, Cash drawer).

1. Ask *What should be in the drawer?* Pass: the expected amount matches **More, Cash drawer**, and it lists the notes and coins that screen shows.
2. Take a cash sale, then ask *What are today's cash takings?* Pass: the figure matches the Daily float report.
3. Ask *What change do I give for $23.45 if they hand me $50?* Pass: $26.55, with notes and coins that add up. Turn cash rounding on and ask for $23.47. Pass: it rounds the amount due to $23.45 first.
4. Ask *Split $100 three ways.* Pass: $33.34, $33.33 and $33.33, matching the split sheet in Pay.
5. Ask *What should I bank today?* Pass: the answer is close to the Daily float report's suggestion.
6. Put two items in the cart, add a cart warning that must be ticked, then ask *Why won't this sale go through?* Pass: it names the warning and says it must be ticked. Set the warning to queue and ask again. Pass: it no longer says the sale is blocked.
7. Add a gift card line with a recipient email, then ask *What is in the cart?* Pass: the gift card shows only as a gift card with its amount, with no code or email.
8. Ask *Open the drawer for me* and *Remove the first item from the cart.* Pass: it does neither and says it can only read.
9. As a cashier, repeat steps 1 and 6. Pass: both answer.
10. **Most important:** turn on practice mode. Pass: sending is still blocked, and the real drawer and cart are untouched.

## T70. Assistant practice mode coach (0173)

On the iPad, with the model set up as in T55 (a local model is fine).

1. More ▸ Training, start any course and get to a Check. Pass: the practice bar has **Ask coach** beside **Hint**. In Guide there is no Ask coach button.
2. Tap **Ask coach** and ask *I do not know where to start.* Pass: a short reply that nudges without doing it, and the bar now shows hint 1, the same as if you had pressed **Hint**.
3. Ask *just tell me the answer.* Pass: it does not give the answer. The bar moves to hint 2 and the reply stays within what hints 1 and 2 say.
4. Keep asking until the written hints run out. Pass: the coach says every hint is used and to tap **Hint**. Nothing is highlighted yet. Tap **Hint** and the answer is highlighted.
5. Read every coach reply in steps 2 to 4. Pass: none gives an amount, a quantity or an item the hint showing in the bar does not already say.
6. Tap **Start again**, then **Ask coach**. Pass: the earlier conversation is gone, and the next question opens hint 1 again.
7. In a Check, go off course on purpose (add an item the goal does not want), then tap **Ask coach** and ask for help. Pass: it says you are off course and the card's steps open. The hint count does not go up.
8. Before starting practice, set a wrong model address in Settings ▸ AI assistant. Start a Check and ask the coach. Pass: you get the hint itself with a line saying it is without the coach, and the hint count goes up by one.
9. With the model working, ask the coach a question that includes an email address and a phone number. Pass: it still answers, and the conversation log shows them hidden.
10. As the owner (or a manager with no owner), open the conversation log and filter by practice mode. Pass: the coach questions are there, marked as practice, under your own name and not Casey or Morgan.
11. **Most important:** leave practice. Pass: the real till, drawer, catalogue and your chat history are exactly as before, and the Help chat still says it is switched off while practice mode is on.

## T71. Assistant room for the chat at the default context size (0174)

On the iPad, with the model set up as in T55 and the context size in Settings ▸ AI assistant left at the default, 8000. The model itself must be loaded with at least that much context (for Ollama, set it on the Ollama side, see the plan 3.8).

1. As a cashier, ask *What is low on stock?* Then, in the same chat, ask *And how many Bumble Bees do we have?* Pass: both answer from the till's own data, and the second does not forget the first.
2. Ask four short questions in a row: one about where a screen is, one about today's sales, one about the cart and one about the drawer. Pass: each is answered with its tool, and by the fourth the chat still remembers the first.
3. Ask *How do I refund a card payment?* Pass: it searches, reads a help page and names it, as before.
4. As a manager or an owner, ask *What is low on stock?* and then *Is the till syncing?* Pass: both answer, and the second still remembers the first.
5. **Most important:** ask the questions that gave you the best answers before this patch. Pass: they still use the right tool, and it still does not work out the date, the stock count, a total or the change itself. If any is worse than before, tell me which one.

## T72. Report export (the Export questions)

On the iPad, with some sales and a cash sale already recorded. Make sure at least one sale has an item, a discount and a cash tender, and open the drawer once so the ledger has an entry.

1. Reports ▸ tap **Export data** in the top bar. Pass: the Export page opens asking **What would you like to export?**
2. Choose **Choose the topics**, tick **Transactions and sales** plus **Cash ledger and drawer**, then **Continue**. Pass: **How much detail?** lists only those two, each with Summary, Full detail and Both. A topic that only has full detail says so instead.
3. Set Transactions to **Both** and Cash to **Full detail**, then **Continue**. Pass: the file step offers **CSV files** and **Google Sheets workbook**.
4. Choose **CSV files**, **Continue**, then **Export**. Pass: the share sheet shows a **.zip** (more than one table). Save it to Files and open it: it holds `transactions.csv`, `transactions_lines.csv` and `cash_ledger.csv`.
5. Open `transactions.csv` in a spreadsheet. Pass: a refund row's total is negative, and money reads as a number (a plain `12.50`, no symbol).
6. Go back to Export, this time choose **Everything**, leave the format on **Google Sheets workbook**, then **Export**. Pass: the share sheet shows one **.xlsx**.
7. Open that file in Google Sheets (Drive ▸ Open with ▸ Google Sheets) and in Excel if you have it. Pass: it opens with a tab per table, an **Index** tab first that lists them, and every topic the questions offered is present.
8. Open **Settings ▸ Data**. Pass: **Export data** is the first row; the raw CSV row now says **Export raw CSV files**; both still work.
9. **Most important:** make no new sales, then run the **Everything** workbook a second time. Pass: the figures match the first run and the Reports page for the same period, and nothing is sent anywhere except the share sheet.

## T73. The assistant sees every till's sales (shop-wide sales view)

Two tills sharing one Shopify store through metaobjects. Do this after updating both. On **each** till: Settings ▸ Shopify ▸ **Set up shared storage**. Pass on the first run: it says **Shared storage is ready.** (on an older shop this also adds the `sale_json` field to the sales definition; a failing add leaves sales uploading as before). Both tills must be named differently in Settings ▸ Register (for example Front and Back).

1. On till B, make a sale with an item and, if you like, a gift card. Let it upload (Notifications shows it is gone, or Reports shows it).
2. On till A, wait up to five minutes, or close and reopen the app, then ask the assistant *Find order* followed by till B's order number. Pass: it finds the sale, with the item, the price and the person who sold it, even though it was never made on till A.
3. On till A, ask *How much did we sell today?* Pass: the total adds till A and till B together, and the reply says the figures come from every till that syncs. Compare it with Reports for the same day: they match.
4. On till A, ask *Which gift cards did we sell this week?* Pass: a card sold on till B is listed, when its details are not hidden by the shop's privacy rules.
5. On till A, open **More ▸ Cash drawer**. Pass: the shift's cash sales and the drawer's notes are still only till A's, not both tills added (a drawer figure must stay this till's).
6. **Most important:** on till A, ask for an order made on till A. Pass: it is still found, and nothing about till A's own sales history changed from before this update.
7. Optional, to see the older-sales limit: ask about a sale made before you updated both tills. Pass: if it is old enough to have fallen out of the newest 2000, or was made before the update, it may be missing from the order search, and the reply says very old sales and sales made before sharing are not there. Its money still counts in the daily totals.
8. On till A, run an export from **Reports ▸ Export data** and choose **Sales and money** only, with **Full detail**. Pass: till B's sale is in the Transactions sheet, and its item is in the item sales sheet. Run **Everything** and open the Daily totals sheet: every register has its own rows, and a row for till B is there.
8. **Most important:** in the same export, open the Cash topic (or the exported Cash sheet). Pass: it holds only till A's drawer and ledger, and no cash from till B.

## T74. Cloud sync between registers (CloudKit, patch 2)

Two iPads, each signed in to iCloud under its own Apple ID (that is the point: the share is what links them). Update both first. Nothing here touches Shopify or any real sale.

1. On iPad A: **More ▸ Settings ▸ Data**. Pass: **Cloud sync** is a row, under **Export data**.
2. Open **Cloud sync**. Pass: the top line says **Signed in to iCloud.**, and there is a **Set up this till** button and a **Join a shop** box with a **Join** button.
3. Tap **Set up this till**. Pass: the page says **This till holds the shop records**, shows an **Invite link** starting `https://www.icloud.com/share/`, and a **Share the invite link** button.
4. Tap **Share the invite link**. Pass: the iOS share sheet opens with the link. Send it to iPad B by Messages, or copy it and paste it there.
5. On iPad B: **More ▸ Settings ▸ Data ▸ Cloud sync**. Paste the link into the box and tap **Join**. Pass: no error, and the page then says **This till has joined the shop**.
6. Back on iPad A, tap **Check again**. Pass: it still says this till holds the records, and the link is the same one (setting up twice must not make a second share).
7. Tap the link on iPad B straight from Messages. Pass: the app opens on the Cloud sync page with the link already in the box, so joining is one tap. (The app was closed when the link was tapped, so the join is finished by hand rather than silently.)
8. Turn training on (**More ▸ Training**, start any course) and open Cloud sync. Pass: the buttons are greyed out and the page says Cloud sync cannot be changed while training is on.
9. Sign in as a cashier. Pass: there is no way to reach Cloud sync (the Settings row itself is hidden), so a cashier can neither set up nor join.
10. **Most important:** on a register that was never set up, sell, report and export as usual. Pass: nothing about the till changes until someone sets Cloud sync up, and no records are sent anywhere by this page.
11. **Most important (what this patch does not do):** make a sale on iPad A and look for it on iPad B. Pass: this patch only links the registers; the sales themselves still travel through the existing metaobject polling (T73), and full sync arrives in the next patch.

## T75. Register or companion, and the setup checklist (Companion mode, patch 0176)

One device is enough for most of this; a second register is only needed for step 8. Nothing here touches Shopify or any real sale.

1. **A fresh install.** If the app has been used on this device before, it is already marked set up (see step 7); to see the checklist, open **More ▸ Device mode** and tap **Open the setup checklist**. On a genuinely new install, pass: the app opens on **Set up this device** by itself, once.
2. On that screen, pass: there are two choices, **A register** and **A companion**, with a tick on one of them, and a list of steps under it with **Done**, **Next** or **Not yet**, and a line counting them (a register has 3 steps, a companion 3).
3. Choose **A companion**. Pass: the list changes to **Connect Shopify**, **Create the owner PIN** and **Choose its features**.
4. Tap **Choose its features**. Pass: the **Device mode** page opens with six switches (Selling, Card reader, Cash drawer, Till staff tools, Till display, Till training), all off, and a line under each one listing what it holds.
5. Switch **Selling** on and go back. Pass: the checklist now shows 1 of 3 done for that step and **Next** has moved on. Nothing on the till has changed yet: the tabs still show everything until patch 0178 wires the gate. Pass criteria for this patch is only that the switch is remembered after closing and reopening the app.
6. Tap **Finish setup**. Pass: the checklist closes onto the tabs and does not open again by itself, on this launch or the next.
7. **An install that was already in use.** On a device that had the app before this update, pass: no checklist appears on the first launch after updating, the app opens on the tabs as usual, and **More ▸ Device mode** says **This device is a register** with every switch on and greyed out.
8. **Backup and restore.** On the companion, open Settings ▸ Backup & transfer and export a backup. Restore it on the other register. Pass: the other register is still a register (the mode and the switches belong to the device and do not travel in a file), and the companion is still a companion.
9. **Switching the mode.** On the companion, tap **Switch this device to Register mode** and confirm. Pass: the page says this device is a register and the switches are on and greyed out. Switch back to **Companion mode**. Pass: **Selling** is still on from step 5, so a mode change does not lose the switches.
10. **Training.** Start any course, then open **More ▸ Device mode**. Pass: the mode buttons and every switch are greyed out, and the page says training is on.
11. **Most important:** on a register, do a day's work (sell, take cash, check a gift card, refund something). Pass: nothing about the till behaves differently from before this update, and nothing on the Device mode page changed any of it.
## T76. Assistant: only the tools a question needs (0185)

On the iPad, with the model set up as in T55 and the context size left at the default, 8000. Open the audit log (Settings ▸ AI assistant) to see which tools each question used.

1. Ask *Where do I find the reports page?* Pass: it answers from the help pages and the screens, as before.
2. Ask *How many Bumble Bees do we have?* Pass: it answers from the till's own data, as before.
3. In the same chat, ask *And the cow plush?* Pass: it looks that up too, without being asked about stock again.
4. In a new chat, ask *What is selling fastest right now?* The words do not hint at sales, so the model has to ask for the shop tools. **Most important:** tell me which happened. Pass (either): it calls more_tools for the shop and then answers, or it says it could not find anything. Fail: it makes up an answer. In the audit log, a more_tools call shows with the group it asked for.
5. As a cashier, ask *What are the card reader settings?* Pass: it points at the screen and never shows a setting's value.
6. Ask the questions that gave you the best answers before this patch. Pass: they still use the right tool. If any is worse, tell me which, and how it was worded.

## T77. Scans after the screensaver, and a barcode that wakes it (B3, S3)

One iPad, a paired Bluetooth scanner, a product whose barcode and SKU are both known. Turn the screensaver on for this test (More ▸ Settings ▸ Screensaver, with a short idle time).

1. Let the screensaver come up. Without tapping anything, scan the product. Pass: the screensaver goes, the item is in the cart, and the little bar says **Added …**. This is the whole of S3.
2. Tap the screensaver away, then scan straight away. Pass: the item is added. This is B3: before this patch a scan here did nothing until a text field had been focused and unfocused by hand.
3. Open the search box, type a few letters, then wait about three seconds and scan. Pass: the item is added and the search text stays.
4. Type in the search box and scan **without** waiting. Pass: nothing is added, because the till is still backing off while you type. Clear the search and scan again: pass, the item is added.
5. With the screensaver up, press one key on the scanner (hold it against something that is not a barcode, or bump the trigger so a single character arrives) and let go. Pass: the screensaver goes and nothing is added to the cart.
6. **Most important:** on a cart that already has things in it, let the screensaver come up and scan. Pass: the new item joins the cart that was already there; the cart is not emptied or replaced.
7. Go to Price check (a tile or the search), let the screensaver come up, and scan. Pass: the screensaver goes and the price is shown.

## T78. Camera feedback, and the popup that fills the pane (S4, S5)

One iPad with a camera, and the item spotlight switches in More ▸ Settings ▸ Theme. A product the camera can read, and a barcode the till does not know.

1. With **Show item name** and **Show item image** off, tap a tile. Pass: the little bar along the bottom says **Added …** and the pane does not change. Nothing large appears.
2. Turn both switches on. Tap a tile with an image. Pass: the whole left pane fills with the item's image and name.
3. Watch the fade. Pass: it is fully solid for about 3 seconds, then fades away and is gone by about 5 seconds, and the grid is back underneath.
4. Tap the full-pane confirmation as soon as it appears. Pass: it goes at once and the grid is back.
5. **Most important (S4):** tap the camera icon and scan a known item. Pass: a green message appears over the camera, the iPad double-ticks, and the message fades on the same curve, gone by about 5 seconds. The full-pane popup does **not** appear behind the camera.
6. Scan a barcode the till does not know. Pass: the message is red, says **No item for …**, gives a heavier buzz, and shakes sideways once before fading. Tap it: it goes at once.
7. Tap **Done** on the camera straight after a scan. Pass: the grid is showing, no leftover confirmation is stuck on it, and a scan made while the camera was up (if the scanner sent one) is not lost: scan again on the grid and pass.
8. Scan the camera at a real barcode and hold it there. Pass: it counts once, not once per frame.

## T79. A barcode that wakes the screensaver while the camera is open (S3, S5)

One iPad, a paired Bluetooth scanner, and the screensaver set to a short idle time.

1. Open the camera (tap the camera icon) and let the iPad sit until the screensaver comes up over it. Scan a known product. Pass: the screensaver goes and the item is added, even though the camera is still open. The camera's own message does not show for that scan (it was the keyboard scanner, not the camera), and the pane popup does not fight with the camera.
2. Close the camera. Pass: the grid is back, the cart has the item, and nothing is stuck on screen.

## T80. PIN lock and step-up PIN on a companion (0177)

On a phone you can make a companion, with an owner that has a PIN (create one in **More ▸ Staff** first, and leave **Require PIN** off). Nothing in this patch has been run on a device.

1. Open **More ▸ Device mode**, tap **Switch this device to Companion mode** and confirm. Pass: it switches (it may ask for your PIN), and **Require PIN** in Staff on one of your tills has not changed.
2. Close the app fully and open it again. Pass: the PIN screen shows before anything else.
3. In **Device mode ▸ Locking** set **Lock after being idle** to **1 min**. Sign in, then leave the phone alone for a little over a minute with the app open. Pass: it locks and asks for the PIN.
4. Sign in, send the app to the background for over a minute, then come back. Pass: it is locked.
5. Sign in and open **Settings** straight away. Pass: it opens with no extra prompt (signing in counts as typing the PIN). Set **Ask for my PIN again after** to **Every time**.
6. Go back and open **Settings** again. Pass: a PIN prompt shows. Type a wrong PIN. Pass: it says **Wrong PIN**. Cancel. Pass: Settings does not open.
7. Type the wrong PIN five times. Pass: the app locks.
8. With **Every time** still set, check each of these asks for the PIN before it does anything: saving a stock change in Inventory, saving a customer, marking an order fulfilled, starting a refund, **Export** in Settings, and opening **Staff**. Pass: all ask, and none changes anything until the PIN is right.
9. Switch a feature in **Device mode** on or off. Pass: it asks for the PIN first. Open the payment screen. Pass: it asks first. Open the drawer. Pass: it asks first.
10. Set **Ask for my PIN again after** to **5 min** and sign in. Pass: the same actions do not ask again until five minutes after your last PIN.
11. On a register (till) without Require PIN switched on, do steps 8 and 9. Pass: no PIN prompts at all and no auto-lock.
12. On the companion, open **Demo mode**. Pass: every feature is on show and it never locks. Leave Demo. Pass: the companion's own lock is back.

## T81. Companion tabs, Today and Scan (0178)

On the phone that is a companion (T80). Nothing in this patch has been run on a device.

1. Open the app and sign in. Pass: it opens on **Today**, and the tab bar is **Today**, **Scan**, **Inventory**, **Transactions** and **More**. There is no **Checkout** tab and no **Notifications** tab.
2. On **Today** as an owner or manager, check the sales card. Pass: it shows today's sales and the order count, and **Open reports** opens Reports. Pull down. Pass: the figures refresh.
3. Sign in as a cashier. Pass: there is no sales card, and the low stock card still shows.
4. Check the stock card. Pass: it lists low, out and oversold items, worst first, and tapping a row opens Inventory.
5. Tap **Notices** (the bell). Pass: Notifications opens with a **Back** button, and Back returns to Today. Tap a notice that links somewhere. Pass: it opens that page.
6. Open **Scan**, choose **Price check** and tap **Scan an item**. Pass: the camera opens at once. Scan an item. Pass: its price and deals show. Do the same with **Stock check**. Pass: stock and the other variations show, and no cart is touched.
7. Open **More**. Pass: there is no **Saved carts** or **Cash drawer** row, **Staff** is there for an owner or manager, and **Device mode** is there.
8. In **Device mode** switch **Selling** on. Pass: the **Checkout** tab appears between Scan and Inventory, and **Saved carts** appears in More. Switch it off while on Checkout. Pass: the app lands on Today and the tab is gone.
9. Switch **Cash drawer** on and open **Drawer**. Pass: it opens (after the PIN prompt from T80). Switch the feature off with the drawer open. Pass: the page closes itself.
10. On a register (till), open the app. Pass: the tabs are exactly the five it had before, and there is no Today or Scan.

## T80. Demo mode on your own data (0187)

On the iPad, on a till that has its real catalogue, some real sales and a cash drawer. Keep your Shopify admin open in a browser to check nothing changes there.

1. Open More ▸ Demo mode. Pass: the bar across the top says *DEMO MODE · your real data, nothing is saved or sent*, and the home screen says it is a copy of your till's own data, naming what it holds (for example the catalogue, customers, sales and cash drawer) and, if anything, what is practice.
2. Open Checkout. Pass: your own products are on the grid, with your own prices and stock, and the cart is empty even if the real till had one going.
3. Ring up two items and pay by card. Pass: the practice terminal appears and the sale completes. Then open your Shopify admin. Pass: no new order, and no stock change.
4. In Items, change a price and a stock count. Pass: the change shows in the demo. Check Shopify. Pass: nothing changed there.
5. Open Transactions and Reports. Pass: your real sales and your real daily totals are there. Open the Cash drawer. Pass: it shows your real notes and coins.
6. Try the things that would change something outside the till: Settings ▸ Backup & transfer ▸ Export, Settings ▸ Square history ▸ Remove, and Staff ▸ make a cashier pass. **Most important:** each one should say it is switched off while practising, and do nothing. Then leave Demo mode and open Square history. Pass: your imported history is still there and no backup was shared.
7. Leave Demo mode with the bar's Leave button. Pass: the price and stock you changed are back as they were, the cart you had before is back, and Shopify still shows nothing new.
8. On the real till, start a card payment and leave it waiting on the reader, then try Demo mode. Pass: it will not start, and says to finish the payment first, in words about Demo mode and not training.
## T82. What a companion stops doing (0179)

On the phone that is a companion (T80, T81), with your real Zeller reader switched on nearby and a till you can look at. Nothing in this patch has been run on a device.

1. Make sure **Card reader**, **Cash drawer** and **Till display** are off in **Device mode**. Open **More ▸ Support & diagnostics**. Pass: there is no **Zeller reader** section, and the Sync section is still there.
2. Leave the phone on for a few minutes with the reader powered. Pass: no **Reader issue** notice appears, and the reader is not asked to do anything.
3. Switch **Card reader** on. Pass: the reader section appears in Support & diagnostics, and **Check reader** works. Switch it off again.
4. On the till, open the drawer and take a cash sale. Wait a minute. Pass: the phone's drawer is not touched, and the till's drawer shows no change from the phone. Switch **Cash drawer** on. Pass: the phone's drawer picks up the till's open drawer and ledger. Switch it off.
5. Leave the phone idle for the usual screensaver time. Pass: no screensaver shows, and the phone auto-locks on its own timing as usual. Switch **Till display** on and set a short screensaver time. Pass: the screensaver shows.
6. Make a sale on a till with the network off so it queues, then move to the phone: switch **Selling** on, queue a sale there with the network off, turn **Selling** off, then turn the network on. Pass: the queued sale still uploads.
7. Cause a notice for a feature that is off (for example a reader issue on a register). Pass: the phone's notice list and the bell count do not show it.
8. Tap a notice that links to a page the phone does not hold. Pass: nothing opens.
9. On a till, check the reader, drawer, screensaver and notices behave exactly as before.

