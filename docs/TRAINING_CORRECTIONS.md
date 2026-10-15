# Training corrections (from device testing)

Source: your device test notes after 0111 and 0112. Grouped so each group can be one patch. Soft locks come first because they stop a person finishing a module at all.

Legend: **[LOCK]** soft lock or cannot progress · **[BUG]** wrong behaviour · **[DESIGN]** the course teaches the wrong thing or too little · **[NEW]** a new feature, not a fix.

## Status

- **0119 (device-tested, follow-ups in 0120):** 1.1 to 1.7 and all of section 2 (soft locks, typing steps, the cursor), plus the scan window's order and result box and the note validation in Customers. 1.2 was found by reading the code and not reproduced; the best explanation is the iOS two-windows problem (see 0097), fixed for every window. The device test found the window hand-off still failed when a **sub-window** closed (see 0120): 1.2 and the Change a price Check 2 goal 1 still froze, and a replayed Guide step 25 had no review to show.
- **0120 (awaiting device test T31):** the two follow-ups from the 0119 device test. A window now says it is closing during the render, so the line window that opens as its Discount or price window closes really waits (fixes 1.2 and Change a price Check 2 goal 1). And a practice run clears the cart pane's "I have seen this price review" note, so a replayed Guide still opens the review at step 25.
- **Still to do:** section 3 (Show animation), section 4 (per module), section 5 (app changes).

## 1. Soft locks and dead ends (fix first)

| # | Module | Problem |
|---|--------|---------|
| 1.1 | Customers and notes | **[LOCK]** Guide step 13 blocks the text fields, but the step tells you to fill them in. The rest of the module is then unreachable because the form rejects empty fields. |
| 1.2 | Discounts | **[LOCK]** Check 2 step 2 locks the whole screen: nothing can be pressed, not even Exit. Only closing and reopening the app recovers. Check 2 beyond it could not be reached. |
| 1.3 | Price adjustments | **[LOCK]** Guide step 19 points at Remove, but the sheet has already closed, so the target is gone. |
| 1.4 | Price adjustments | **[BUG]** Guide step 8: the Reason box cannot be typed in. |
| 1.5 | Scan items | **[LOCK]** Guide step 7 asks for a card that sits off the bottom of the practice camera window. It cannot be scrolled to or tapped. Skip was the only way on. |
| 1.6 | Scan items | **[LOCK]** Guide step 6 then asks you to tap the camera button while you are still inside the practice window. You have to tap a tiny gap to close it and reopen it. This repeats until step 11 (Done). |
| 1.7 | How deals show up | **[BUG]** The last Check 2 goal ends on a Payment page showing $0. You must press Back to reach the finished screen with the tick and confetti. |

Suggested approach: audit every Guide step and goal for "target is gone because a window closed", and make the Exit button and the dock always reachable even while a window is dimmed (1.2 is probably the same cause as the 0097 freeze).

## 2. Cursor and highlight (applies to every module and stage)

- Hide the cursor in any step that is not actively using it. It often gets in the way.
- The cursor must never block touch (`pointerEvents: none`).
- Make it slightly transparent so what is underneath shows.
- Use the same orange as the highlight (`#FB873F`), because the current colour has too little contrast on the dark theme.
- The cursor should guide to the individual buttons, not only the group. Reported in Discounts Guide step 5 (the keys).

## 3. Show and Info animation quality

- **Scan items, Show:** the scan section is only buttons reading "Scan this: ...". Replace it with a camera simulation: a camera frame, and a box with a white sticker carrying a barcode (or at least a QR system icon) sliding into view, then the green or red result. Keep the real practice window for the Guide.
- **Scan items, Show:** the Cashier Pass and Gift Card QR tiles are skipped (the step reveals them but the camera does not visit them).
- **Scan items, Show:** the bottom text box animates very poorly in the last two steps.
- **Discounts, Show:** skips the Whole Cart element. **Done (0123):** the cart badge and the dropping prices now show the whole-cart discount landing.

## 4. Per module

### Take cash and give change
- **[DESIGN] Reworked (0125):** the Guide now teaches all three readings against the current Cash window: Short (`$10` on a `$14.00` sale), Undo as a genuine wrong tap ("this customer is paying with a second $10, not the $5"), then Change, Next and Gave this. A second $5.00 sale teaches Exact and the Take cash button, which Check 1 relies on. Wording now matches the window (Short by, Change to give, Exact).

### Customers and notes
- Guide step 8 (typing the note): **done in 0119.** The step now finishes only on a real note (`gift wrap`), with `typing: true` so the fields accept touch.
- Guide step 13: **done in 0119.** The person types their own details, the text says nothing is kept, and `ready` keeps Next greyed out until a name and an email or mobile are in, so empty fields are not accepted.

### Discounts
- **Done (0123):** Guide step 5 now finishes only when both digits are keyed (the Discount window publishes what is keyed; the step waits for `10`). Wrong taps and closed windows now walk back: `recoverFrom` was added to the line Discount row, the keypad, Apply and the cart-menu steps.
- **Done (0123):** Check 1, last goal: "never mind" replaced with a realistic reason (the customer is not entitled to that discount).
- **Done (0123):** Check 2 deal goal no longer expects a window: adding a Keyring happens on the practice grid (`at` was `sheets: true`, now `sheets: false`), so the grid the person taps is the practice one.
- Check 2 step 2 soft lock (see 1.2): done in 0119/0120.
- **Done (0123, section 3):** the Show now lands the whole-cart discount: a cart badge appears and the prices and total drop, then come back on Remove.

### Change a price
- Reason box typing (1.4) and Guide step 19 (1.3): both done in 0119/0120.

### Refunds and exchanges
- **[DESIGN] Reworked (0126):** Check 2's first goal is now a normal refund ("refund it the way he paid"). The card refund is declined by the practice terminal, nothing is recorded, and the person decides what to do. It finishes on a Cash refund or a Gift card refund, so the person can choose either way out rather than being told to use Cash. The task now says where it was taught (`card-fails`, a Show step that demonstrates the decline and the way out).
- The failure and its way out are shown in the Show (`card-fails`, `cash`) and mentioned in the Guide (`g-method-cash`) before Check 2 asks for it unprompted.
- The general rule (a normal task, a realistic customer-side failure, a fix already taught) is reviewed across every Check 2 below.

### How deals show up
- **Done (0124):** the swap is now done on the line itself. The Show opens the cow's line and taps the other size under Variation (a new `line.variant:<line>:<variant>` spot), and Check 2's hint points at that same control instead of add-Small-remove-Large.
- Last Check 2 goal ends on a $0 Payment page (see 1.7): done in 0119 (the goal ends when Payment opens).

### Scan items
- Guide step 13 only highlights the top item. Minor. Ring the line that matters.
- Adding too many of an item prompts a fix, but the first fix step (close the window) makes the toast disappear. Keep the correction visible, or re-point at the next step once the window closes.
- Plus 1.5, 1.6 and the Show items in section 3. The Guide loop (clicking in and out until step 11) needs the steps rewritten so the window stays open across the scanning steps.

## 5. App changes (not training)

- **[NEW] Scanning gift card and discount codes in the cart and on the payment page.**
  - With a HID scanner, always accept them on both the cart view and the payment page.
  - Add a button in the three-dots (meatballs) cart menu that opens the camera or text entry.
  - A scanned gift card shows a preview of how much it takes off. This should also make split gift card payments easier.
- **[BUG, app] More ▸ Orders should be Shopify orders only.** The Transactions menu is for POS sales. Check what each list shows today and separate them.
- **[NEW] System status bar.** Hide the iOS status bar (clock, battery, Wi-Fi) and draw the app's own. It currently blocks some buttons and looks out of place.
- **[NEW] Log the cashier on every sale.** Save the signed-in staff member on each sale, and show it in Reports and on the transaction.
- **[NEW] Card last four digits.** Check whether the Zeller SDK returns the last four digits of the card for a transaction. If it does, store and show it.
- **[NEW] Show every data point we can attach to a sale on that sale's entry** (cashier, register, card last four, tender breakdown, cash given and change, adjustments and reasons, customer, receipt method, fees, times, and so on). Start with an inventory of what a sale record already holds and what is missing.

## 6. Questions for you

1. Customers, step 13: is it fine that the person types their own real details into the practice form, given nothing is saved or sent?
2. Status bar: hide it everywhere, or only while training or the guided flows?
3. Order of work: soft locks (section 1) first, then the cursor changes (section 2) for all modules at once, then the per-module rework. Does that suit you?

## 7. Proposed patches

1. Soft locks and dead ends (1.1 to 1.7) and the cursor (section 2).
2. Cash course rework.
3. Customers and Discounts corrections.
4. Change a price, Deals and Scan items corrections, plus the Scan Show camera simulation.
5. Refund and Check 2 review across all modules.
6. App changes (section 5), each as its own patch.
