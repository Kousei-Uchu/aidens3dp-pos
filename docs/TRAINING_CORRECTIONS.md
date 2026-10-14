# Training corrections (from device testing)

Source: your device test notes after 0111 and 0112. Grouped so each group can be one patch. Soft locks come first because they stop a person finishing a module at all.

Legend: **[LOCK]** soft lock or cannot progress · **[BUG]** wrong behaviour · **[DESIGN]** the course teaches the wrong thing or too little · **[NEW]** a new feature, not a fix.

## Status

- **0119 (done, awaiting device test T30):** 1.1 to 1.7 and all of section 2 (soft locks, typing steps, the cursor), plus the scan window's order and result box and the note validation in Customers. 1.2 was found by reading the code and not reproduced; the best explanation is the iOS two-windows problem (see 0097), fixed for every window.
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
- **Discounts, Show:** skips the Whole Cart element.

## 4. Per module

### Take cash and give change
- **[DESIGN]** Poorly made overall. Review and rework it: Guide, Check 1 and Check 2 against the current Cash window.

### Customers and notes
- Guide step 8 (typing the note) does not check what was typed. It should finish only on a real note, and say so if it is empty.
- Guide step 13: let the person type their own details into the form (a name, email and so on), and make clear nothing is saved. Remove the block on the fields. The step should not accept empty fields because the person could not type; once typing works, keep the validation.

### Discounts
- Guide step 5 does not check that both numbers were typed. Finish only when both are keyed.
- Guide does not course correct properly. Re-test every step with a wrong tap and a closed window.
- Check 1, last goal: "never mind" is not something a customer would say. Replace it with a realistic reason to remove a discount (for example the item was rung up at the wrong discount, or a voucher was not valid).
- Check 2 shows the real grid of tiles. It should show the practice grid.
- Check 2 step 2 soft lock (see 1.2).

### Change a price
- Reason box typing (1.4) and Guide step 19 (1.3).

### Refunds and exchanges
- **[DESIGN]** Check 2 does not really go wrong. It says "this is what is going to happen but by a different route" instead of a normal refund that then fails. It should be a normal refund and then the card refund declines, and the person decides what to do. A test of memory and logic, not menus.
- The way to handle it must have been shown at least once earlier in the module (Show or Guide), so the person is not dropped in. Then Check 2 asks them to do it unprompted.
- This applies to a lot of the other modules too. Review every Check 2 against that rule: a normal task, a realistic customer-side failure, a fix that was already taught.

### How deals show up
- The hint says to add a Small Highland Cow, but doing that changes nothing, because the Large cow is still there and must be removed too. Better: have the person change the variation from the line's details window instead (swap Large for Small on the same line). Add a spot for that control.
- Last Check 2 goal ends on a $0 Payment page (see 1.7).

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
