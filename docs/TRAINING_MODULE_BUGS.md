# Training module bugs

A place to collect every training-module bug found by hand, so we can work through them later without losing them.

> **Note (read this first).** This list was written **before** the routegraph guidance PR (0113–0118) and has
> **not been re-tested since**. I have not sat down and re-run all of these by hand again, because the failures are
> the same every time and are basically guaranteed to still be there. The routegraph work changed how the "off
> course" card *plans its way back* and how a run is *scoped*; it did **not** touch a course's content, wording,
> spots or checks. So unless a bug below is specifically about the walk-back card or run scoping, assume it is
> still present.

---

## How to use this

- Grouped by course, then a **Cross-cutting** section for anything that isn't one course's fault. A few items are
  about the **main app** as well as training; they are marked `(app)`.
- **Sev**: `blocker` (course can't be finished / needs a force-quit) · `bad` (wrong guidance or behaviour) ·
  `cosmetic` (works, but rough) · `idea` (a feature request, not a defect) · `review` (needs a judgement call
  before it's a bug).
- Leave **Fixed?** blank until it is actually fixed on `main`. Link the patch/commit when you fix it.
- If a bug turns out not to be reproducible, move it to *Ruled out* at the bottom rather than deleting it.

---

## Cash sale

| # | Sev | Issue | Expected / fix idea | Fixed? |
|---|-----|-------|---------------------|--------|
| 1 | review | Poorly made overall. | Review the whole course and improve it. | |

## Customers and Notes

| # | Sev | Issue | Expected / fix idea | Fixed? |
|---|-----|-------|---------------------|--------|
| 1 | bad | Guide step 8: while typing the note, it does not validate what has been typed. | Validate the note input before letting the step advance. | |
| 2 | blocker | Guide step 13 blocks interaction with the text fields, which contradicts the instruction (*"ask them to fill out their own information, do not save it"*). | The fields must be usable at that step; keeping the person out of them is the opposite of the instruction. | |
| 3 | blocker | The rest of the module is inaccessible because it rejects empty fields — and I can't type into them because of #2. | Fix #2; the empty-field rejection then stops mattering. | |

## Discounts

| # | Sev | Issue | Expected / fix idea | Fixed? |
|---|-----|-------|---------------------|--------|
| 1 | bad | Show skips the Whole Cart element. | Include it so the flow matches the real screens. | |
| 2 | bad | The cursor does not guide to the individual buttons in guide step 5 *(same cursor problem as other modules — see Cross-cutting)*. | Ring/point at each button in turn. | |
| 3 | bad | Guide step 5 does not validate that you typed **both** numbers. | Require both before the step is considered done. | |
| 4 | bad | The guide does not properly course-correct. | Tighten so a wrong detour is brought back. | |
| 5 | cosmetic | Last step of Check 1: in what world would a customer say *"never mind"*? | Rewrite to something a real customer would actually say. | |
| 6 | bad | Check 2 shows the **real** grid of tiles. | Use the practice/mock grid, not the live one. | |
| 7 | blocker | Check 2 step 2 soft-locks: I can't press anything, not even exit. I have to force-quit and reopen the app. | Find the dead state and give it a way out. | 0119 + 0120 |
| 8 | blocker | Can't reach the rest of Check 2 because of the soft-lock. | Resolves with #7. | 0119 + 0120 |

## Price Adjustments

| # | Sev | Issue | Expected / fix idea | Fixed? |
|---|-----|-------|---------------------|--------|
| 1 | bad | Can't type in the reason box at guide step 8. | The reason box must accept input. | |
| 2 | blocker | Guide step 19: the remove button is no longer visible because the sheet has closed — soft-locked. | Re-open/keep the sheet open, or point the step at a button that is actually on screen. | 0119 + 0120 |

## Refunds and Exchanges

| # | Sev | Issue | Expected / fix idea | Fixed? |
|---|-----|-------|---------------------|--------|
| 1 | bad | Check 2 doesn't really go wrong (common across many modules). It just says *"this is what's gonna happen, but it's a different way"* instead of *"here's a normal refund and — oh — the card declined, now how do you fix it?"*. It should test **memory and logic**, not just memorising the menus. The failure should also have been **shown at least once before**, not dumped on the person cold. | Give Check 2 a real, previously-shown failure to recover from. | |
| 2 | bad | `(app)` **More ▸ Orders** should be for **Shopify orders**; the **transactions** menu is where **POS sales** live. They are currently mixed up. | Move POS sales to transactions; keep Orders for Shopify. Confirm wording too. | |

## How deals show up

| # | Sev | Issue | Expected / fix idea | Fixed? |
|---|-----|-------|---------------------|--------|
| 1 | bad | The hint says to add a small Highland cow, but when you do, nothing changes; it then needs a swipe to remove the large one. | Prefer changing the variant through the item's details menu instead of this add/swipe dance. | |
| 2 | bad | Last step of Check 2 says *continue to payment*, but the payment window opens with **$0**, and you have to press **Back** to see the completed (check + confetti) screen. | Go straight to the completed screen, or make the sum correct. | |

## Scan Items

| # | Sev | Issue | Expected / fix idea | Fixed? |
|---|-----|-------|---------------------|--------|
| 1 | idea | *(slightly beyond this module)* Make scanning **gift card** and **discount** codes work both on the payment page **and** in the cart view — always when using a HID scanner, plus a button in the **…** menu to open the camera/text entry. The gift card should show a preview of how much is taken off. It would also make split **gift card** payments much easier. | Add code scanning to both surfaces + menu entry + preview. | |
| 2 | bad | Show skips the **Cashier Pass** and **Gift Card QR** tiles, and the bottom text box in the last two steps animates very poorly. | Include the tiles; fix the text-box animation. | |
| 3 | bad | The Show scan-barcode section is poor — just buttons that say *"Scan this: xxx"*. | An animated camera simulation (a box with a printed barcode sticker moving into frame), or at minimum the QR system icon. | |
| 4 | blocker | Guide step 6: after I click the requested button it tells me to click the camera button **while I'm still in the fake camera menu**. I have to click a tiny gap to close the sheet, then reopen it, to progress. | Don't ask for the camera button while the camera sheet is open. | |
| 5 | blocker | Guide step 7 asks me to select something **off the bottom of the screen**. I can't scroll and I can't tap it. Skip is the only option. | Make the target reachable (scroll to it / move it on screen). | |
| 6 | bad | Stuck in a loop of clicking in and out of the scan-barcode sheet until step 11, where I can finally click Done. | Fix the open/close run so it progresses. | |
| 7 | cosmetic | Guide step 13 just highlights the top item — minor, but eh. | Point at the intended item. | |
| 8 | bad | Adding too many of an item prompts you to fix it, but after you follow the first correction step (closing the menu) the **toast disappears**. | Keep the prompt until the fix is actually done. | |

## Cross-cutting

| # | Sev | Issue | Expected / fix idea | Fixed? |
|---|-----|-------|---------------------|--------|
| 1 | `(app)` idea | The system status bar (clock, battery, Wi-Fi) blocks some buttons and looks out of place. | Hide the system status bar and draw our own. | |
| 2 | bad | Cursor: it is shown even when the current step isn't using it, and it gets in the way. | Hide the cursor when the step isn't actively pointing with it. | |
| 3 | bad | Cursor can block touch. | Make sure the cursor never blocks touches on what's under it. | |
| 4 | cosmetic | Cursor contrast is poor against dark mode. | Make it slightly transparent **and** the same orange as the highlight, so you can see what's under it. | |
| 5 | `(app)` idea | Sales don't record who rang them up. | Log the current cashier on every sale and expose it in reports and on transactions. If Zeller gives the **card's last 4 digits**, show that too — in fact show every data point we can attach to a sale on that sale's entry. | |

## Course-correction strictness *(observed on the latest version)*

| # | Sev | Issue | Expected / fix idea | Fixed? |
|---|-----|-------|---------------------|--------|
| 1 | review | How strictly "off course" is triggered varies a lot between modules: some let you stray too easily, others let you stray too far. | Review the thresholds. **Doesn't have to change** — if the variation is deliberate (some courses have more room for correction than others) that's fair; it just needs to look intentional, not accidental. | |

---

## Found while doing the routegraph work (2026-10-14)

These are **not** from the list above; they turned up while wiring guidance to the graph. Kept separate so they
don't get confused with the hand-spotted ones.

### 1. Terminal "Not available" screen cannot be moved on — practice terminal · `bad` (latent)

- The terminal's `unavailable` screen waits for a person (`DWELL_MS.unavailable = 0`), but there is **no control
  that advances it**: `TerminalFace` takes an `onDone` prop and `VirtualTerminal` passes one, but the face never
  renders a button that calls it. If the screen is ever shown, nothing can dismiss it.
- It is **unreachable today** — nothing dispatches `t: 'offline'`, so it only appears as a static preview in the
  playground / Show. That is why it wasn't caught.
- **To decide:** render a dismiss control for message screens (`onDone`) and keep it waiting, **or** give it a
  dwell again so it clears itself. Pick one; don't leave it ambiguous.

### 2. Two controls are "multi-home", so guidance is best-effort there — guidance · `cosmetic`

- `cash.gave` (the "Gave this" step of giving change) and `cart.menu.order` (the whole-order adjustment, reachable
  from more than one place) sit behind a plain answer rather than a fixed screen, so the graph can't always pin the
  exact window. A walk still works; it may just be less precise than for a single-home control.
- Related to the strictness review above.

### 3. Stale virtual-terminal test — `shared` · fixed

- `tests/virtualterminal.test.ts` had two assertions left over from the "update terminal copy / dark mode" pass:
  the `unavailable` dwell (above) and the `amount` screen's amount, which moved from `title` to `line`.
- Both corrected; the suite is green again. Logged only so the cause (a copy change outrunning its test) is on
  the record.

---

## Found on the 0119 device test (2026-10-14) — fixed in 0120

The first device run of 0119 (T30) showed the window hand-off still failed for **sibling** windows:
the sheet gate was noted from an effect, and an opening window's effect can run before a closing
sibling's, so a line window and its Discount/price window still changed in the same moment (the 0097
invisible window). That is the Discounts Check 2 goal 2 freeze and the Change a price Check 2 goal 1
stall. Separately, the cart pane keeps "I have seen this price review" and Checkout stays mounted
between a course's stages, so a replayed Guide's step 25 had no review to open. Both fixed in 0120
(the hide is noted during the render; a practice run now clears the review note). Device test T31.

---

## Ruled out

_Empty. Move non-reproducible bugs here instead of deleting them._
