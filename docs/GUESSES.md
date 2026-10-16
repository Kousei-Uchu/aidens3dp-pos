# Guessed answers

Where you have not told me the answer, I have guessed and written the guess here so you can correct it later.
Everything in this file is a guess from me, not a decision from you.

## How I read your last instructions

- **"Complete 2 (TRAINING_CORRECTIONS.md)"** means: finish the corrections in `docs/TRAINING_CORRECTIONS.md`.
- **"ignore ALL MODULES"** was the earlier boundary: do not change any course content under `src/training/modules/*`.
  **Superseded:** you then said "do the training corrections first, then build away at modules", so the per-module
  corrections in `docs/TRAINING_CORRECTIONS.md` section 4 are done on `dev` (0123 to 0128), and the remaining
  courses are being built. Section 5 of the corrections (app changes, not training) is done too.
- **"3.1 delete / 3.2 defer / 3.3 fix it / 3.4 this skill"** answers the loose ends I listed:
  3.1 the stray `patches/0119-training-soft-locks.patch` (deleted), 3.2 the `split-pay` course (deferred, then
  built as 0122), 3.3 the `unavailable` terminal dead end (fixed), 3.4 the writing style (that skill, adopted below).
- **"the rest you have to walk me through one by one"** was the earlier note about the per-module corrections; the
  later "do the training corrections first" supersedes it and they are done.

## Questions from `docs/TRAINING_CORRECTIONS.md`, section 6

1. **Customers step 13 (typing real details into the practice form).** Guess: **fine.** Nothing typed is saved
   or sent, the practice data only lives in memory, and the form says so. Leaving it as real details makes the
   step feel real. No change.
2. **Status bar: hide everywhere, or only while training or the guided flows?** Guess: **hide it everywhere**
   and draw the app's own, because it blocks buttons in the normal till too, not only training.
3. **Order of work (soft locks, then the cursor, then per-module).** Guess: **yes.** The soft locks come first
   because they stop a person finishing at all, which is what you already chose and what 0119 to 0120 did.

## The writing assistant (style skill and model)

- The style skill is adopted from `conorbronsdon/avoid-ai-writing` (MIT). Its rules apply to any prose I write
  in this repo: docs, Help text and commit messages. Australian English, no em or en dashes in editable prose,
  and none of the AI phrasings it lists.
- **Model policy**, if any writing-assistant runs in this project: use a model that is **free forever** and has
  a **validated zero-retention policy**. An **on-device or local-network model is preferred**. If a hosted model
  is used, it must be served through **OpenRouter** and meet both conditions. Guess: prefer a local model
  (for example Ollama on the same Mac) and fall back to a free OpenRouter model only when no local model is
  available. The exact model id is recorded in `docs/WRITING_ASSISTANT.md`.

## Other guesses

- **Gift card balance check (0130, `gift-pay`).** Guess: a balance is checked in the **Check gift card window**,
  opened from the Payment page's Gift card button (and, outside the course, from More ▸ Gift cards). The course
  stays on Checkout and the Payment page, so it teaches the balance check where the card is also redeemed. The
  More ▸ Gift cards route is left out on purpose to keep the course on a single path.
- **Practice gift card codes (0130).** Guess: `GIFT25` ($25.00, active), `GIFT05` ($5.00, active) and `GIFTOFF`
  (disabled). `TRAINPRACTICE1`, the card the scanning course scans, stays and holds the same $25.00, so the two
  courses agree on one card. `GIFT25` is a short stand-in for typing by hand on a device.
- **Assign a saved cart: to a customer or a staff member? (0131, `saved-carts`).** The plan line says "assign to a
  customer", but the real Saved carts window assigns a cart to a **staff member** (`saved.assign:<staffId>`, the
  `Assign → <name>` buttons come from the staff list), and there is no customer field on a saved cart. Guess: the
  course teaches the **staff member** handover, since that is what the till does. The course runs with
  `practiceStaff`, so the people offered are the practice pair (Casey, Morgan), never the real staff list.
- **The Merge Carts? prompt (0131, `saved-carts`).** Guess: it is the till's own native confirm, so the course
  teaches it in Show (with a drawn prompt) and the Check goals watch the **merged cart** rather than the prompt
  itself, because a native confirm cannot be ringed or detected the way an in-app window can. The guide step that
  saves a cart allows `remove` because saving clears the till.
- **More ▸ Orders should be Shopify orders only.** Guess: yes. Transactions already means "POS sales"; Orders
  should show only orders pulled from Shopify, and a POS sale must never appear there.
- **Card last four.** Guess: store it when the Zeller result carries it, and show it on the sale. If the SDK
  does not return it, leave the field absent rather than inventing digits.
- **Existing `em` and `en` dashes in the app's own strings** (for example the practice terminal's copy) are
  changed only where they are not a module's content, per "ignore ALL MODULES".
- **Swap my cash training (0136, `swap-cash`).** Guess: the Swap my cash window gets its own spots
  (`swap.pad`, `swap.record`, `swap.close`) and publishes what you hold and whether a swap was found
  (`SwapSnap` in `src/lib/trainingProbe.ts`). The Guide and Checks watch that probe, because the swap is worked
  out asynchronously and a plain "was the button tapped" test cannot tell whether the result helped. Recording
  goes through the till's own native confirm, so the course ends at the record tap rather than trying to ring a
  native prompt. Check 2 uses a practice drawer swamped in $5s (a ledger injection) so that entering a $50
  genuinely finds nothing worth swapping.
- **Reader trouble training (0137, `reader-trouble`).** Guess: the practice reader is a state on the app (`zeller`),
  set by a new `reader` injection and read into the snapshot as `reader`, so the course can show it not ready and
  watch it become ready. `checkReader` and `pairReader` are made practice-aware (they read and set the practice
  reader and never touch the real SDK handle), because `pairReader` previously called the real terminal even during
  practice. New spots `more.diagnostics`, `diagnostics.setup` and `diagnostics.check`. Check 1 pairs a not-paired
  reader then takes a card payment; Check 2 contrasts a declined card (take the payment) with an offline reader (take
  the sale by cash), since an offline reader cannot be "fixed" in practice and cash is the honest fallback.
- **Offline training (0138, `offline`).** Guess: the whole course starts offline via a new `startSync` module field
  (`buildSandbox(real, { sync })`), so the status bar, the queue and the lessons are true for the whole run rather
  than a per-goal injection. A practice outbox (a `train-` fixture sale that is blocked on a person) lets the course
  show the outbox and how Retry works, seeded by a new `outbox` injection and read into the snapshot as `outbox`.
  Because `processOutbox` already returns early when there are no credentials, a practice sale is never uploaded and
  Retry only clears the blocked flag. The card-offline lesson reuses the `reader` injection ("No internet"). New
  spots: `tab.notifications`, `diagnostics.sync`, and the per-sale `outbox.retry:<id>` (a dynamic spot so the guide
  points at the right stuck sale if there is ever more than one).
