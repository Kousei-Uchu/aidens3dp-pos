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
- **Model policy** (changed 17 October 2026, patch 0148): the chatbot's model is a Settings entry using the
  OpenAI-compatible API, so any provider works, Ollama included. There is no hard-wired model and no hosted
  fallback of ours. What the model may see depends on whether the address is local (private network, this device,
  `.local`) or remote, enforced in code. Details and the data rules are in `docs/WRITING_ASSISTANT.md` and
  `docs/AI_ASSISTANT_PLAN.md`.

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
- **Customers list training (0139, `customers-list`).** Guess: the course covers the Customers page (More ▸ Customers),
  not the cart's customer window (that is the older `customer` course), because "manage the customer list" is about the
  page. The page's own row window and New / Edit form are inline sheets, so following the saved-carts precedent their
  controls fold onto the page itself (`screenOfSpot` = `page_customers`) rather than becoming new graph sheets; the two
  buttons are window spots (`customers.start`, `customers.edit`, `customers.form`, `customers.save`) so a step that
  points at them must say windows are allowed, while the New customer button, the search box and the rows are page
  spots. New dynamic spot prefix `customers.row:<id>`, deliberately distinct from the cart's `customer.row:<id>`. The
  page is made practice-aware: it saves a customer locally with a `train-cu-new-<time>` id and never calls Shopify, and
  it publishes the form's contents through a new `customersDraft` probe, with the practice list read into the snapshot
  as `customers`. Check 1 creates a customer then starts a sale from them; Check 2 fixes Sam Rivera's missing mobile
  and, with a cart injection, starts a sale from Priya without losing her items. The edit lesson is pinned to Sam (a
  fixture with no mobile) so "has a mobile now" is unambiguous, where a freshly made customer could already have one.
- **Items training (0140, `items`).** Guess: the course covers the Items page (More ▸ Items) and the create and edit
  pages it opens, not Inventory or Stock lookup (those are their own courses). The plan says "Edit price and
  identifiers, and create a tracked product", so the Guide changes one price, and Check 1 changes one SKU and adds a
  tracked product. The two pages the Items screen pushes (`createItem`, `editItem`) are their own graph routes, so the
  course's `routes` are `items`, `createItem`, `editItem`, and the form and button spots fold onto `page_create_item`
  and `page_edit_item` rather than the list page. The page is made practice-aware: it creates a variant locally with a
  `train-v-new-<time>` id and edits the variant in place, never calling Shopify, and it publishes the form's contents
  through a new `itemDraft` probe (carrying the item's id in edit mode so the Guide can confirm which row is open),
  with the practice catalogue read into the snapshot as `items`. Check 2's fault is a seeded bad barcode, which needed a
  new `items` injection: the existing comment on `Injection` says "customer side only, never admin problems", but
  fixing the practice catalogue is the whole point of this course, so the `items` injection seeds a wrong price, SKU,
  barcode or stock on a `train-v-` variant only and never touches the real catalogue. The fault is a barcode rather than
  a price because a goal must not start already finished: the fixture's price is the correct one, so a "put it back"
  price goal would be met before the fault was seeded.

## F5: no licence file added (2026-10-18)

F5 says "a licence decision" and I did not want to pick a licence for you, so: no `LICENSE` file was added.
Without one, the default applies and all rights are reserved, which is also what the README now says.
If you want it open source, add an MIT file (`MIT License`, copyright you) or tell me and I'll do it.
CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, README, an issue template and a PR template were all added.

## F3 cleanup (2025-10-18)
- Checked for Finder-duplicate pattern "* [0-9].*" and name variants " 2.", " 3.", " 4." - none found in tracked/untracked non-node_modules files (TO_DO mentioned potential docs copies; they are not present).
- Verified patches/APPLIED.txt (138 entries) matches existing .patch files; all listed patches exist on disk.
- Flagged (did not delete) patch files NOT in patches/APPLIED.txt (11 files): 0167-assistant-screen-context.patch, 0168-cash-drawer-sync-finish.patch, 0169-assistant-settings-status-tools.patch, TEMP-allow-http.patch, assistant-network-check.patch, assistant-raw-socket-fallback.patch, assistant-real-network-error.patch, drawer-pull-merge.patch, qr-ask-for-ip.patch, qr-wifi-fix.patch, shopify-receipt-fix.patch. These include protected assistant-* and qr-ask-for-ip per rules (left untouched). Others left alone as flagged.
- Removed stray files: all .DS_Store files (not tracked), .expo/xcodebuild*.log build logs, and tools/square-history/out/ (exported data), tools/square-history/node_modules/, tools/square-history/.env (gitignored but present).
- Checked for dead src/*.ts/*.tsx with no imports: only src/types/zeller.d.ts is unreferenced by name but is a type declaration file (ambient); kept it.
- Orphaned scripts/tools: all scripts referenced (package.json/help/build scripts) or are repo utilities; kept.
- No zip files or large artifacts found to remove. No tracked build artifacts.
- Tests: 1248 pass, 4 known fails (unchanged baseline). help:build/help:check green; graph:check green (72 screens, 173 edges). Everything remains uncommitted.

## F8 Demo mode: what I decided (2026-10-18)

The F8 line says "locks into a full demo with virtual terminals ... and a home screen showing every feature in the Training Show style. Built on the Training fixture state." The Training engine (B6) already had every isolation seam the demo needs: `isTraining()` guards storage, Shopify, the card reader, the scanner, the drawer and receipts, and `buildSandbox`/`takeSnapshot` swap the till onto practice fixtures and put it back. So Demo mode reuses all of it rather than adding new seams. Decisions I made without asking:

- **One guard, two ways in.** `isTraining()` keeps its name and now means "the till is on practice data", true for a course run or Demo mode. Every existing seam already asked it, so the card terminal, scanner, drawer and receipts are the practice ones in Demo mode for free. A new `isDemo()` is only for Demo-only UI (the home screen and the top bar). A separate `setDemoGuard` means a course never turns Demo mode off and leaving a course never ends a demo. Tests that assert `isTraining()` still hold.
- **Signed in as a made-up owner, not the real person.** Training keeps the real signed-in person; a demo must show Settings, Staff and Reports, which need the owner role, and must not put a real name on screen. So Demo mode is signed in as "Alex Demo" (owner, no PIN) with a second made-up manager, "Jordan Demo". `requirePin` is off in the demo, so the demo can never lock itself out (a lock screen replaces the whole shell, including the bar that leaves the demo).
- **The catalogue plays the Show demos.** "Every feature in the Training Show style" is the 28 training modules' Show animations, so the home screen lists one entry per module that plays `mod.show` with the same player, plus five features that have no course (Reports, Notifications, Settings, Help, the virtual terminal playground) which are simply opened live. `src/lib/demoCatalog.ts` groups them by area.
- **A few made-up sales and notices.** `buildSandbox` leaves sales, rollups and notices empty, so Transactions, Reports and Notifications would open blank in a demo. `src/lib/demoFixtures.ts` seeds five sales and a refund across the last few days, their rollups, and three notices. All ids start with `train-`.
- **Reached from More, not from Training.** Demo mode is a row at the top of More (always shown, whatever display mode is on), plus a bar across the top of the whole app while it is on. Starting a course while the demo is on leaves the demo first. Demo mode will not start while a course is on practice data (`isPractising()`).
- **Where it lives.** `src/state/demoSession.ts` (the swap and the guard), `src/lib/demoCatalog.ts`, `src/lib/demoFixtures.ts`, `src/screens/DemoHome.tsx`, `src/screens/DemoShow.tsx`, `src/ui/DemoPlayer.tsx`, `src/ui/DemoBanner.tsx`. `TrainingHost` draws the practice card terminal during the demo as well. Tests in `tests/demo.test.ts`.

## Report export: what I decided (2026-10-19)

The request was an export wizard (a tree of questions) that picks what to write as CSV, with a summary and a full-detail version of each topic, plus "a full export as a Google Spreadsheet with multiple sheets". Decisions I made without asking:

- **"Google Spreadsheet" is a real `.xlsx` workbook, not the Google Sheets API.** The till has no Google account or OAuth, and adding one would mean new credentials and a second server. A multi-sheet `.xlsx` opens natively in Google Sheets (Drive ▸ Open with ▸ Google Sheets) and in Excel, keeps one tab per topic and depth, and needs no new dependency: it is the OOXML package zipped with `fflate`, which the app already uses for compressed history. If you would rather it upload straight to your Google Drive, that is a separate, larger piece of work (an OAuth client and a Drive scope) and I have not done it.
- **Everything is local and read-only.** The export reads the store and the history files this device writes and hands the file to the iOS share sheet. Nothing is uploaded by the app. "Sync" in the app is unaffected.
- **A topic is a pair of questions, not a fixed file.** Fifteen topics are grouped into Sales and money, Cash, Stock and catalogue, People, and Till and system. Each offers Summary, Full detail, or Both, except a few (warnings, notices, outbox and card attempts, raw history) that only have the full version. "Everything" means every topic at both depths.
- **Multiple CSVs become a zip.** One topic in CSV shares a single `.csv`; more than one shares a `.zip` of `.csv` files. This is the only way iOS shares several files in one action.
- **Money is a plain number.** Amounts are written as `12.50` with no symbol (and `-` for refunds), so a spreadsheet reads a column of them as numbers. Identifiers that look like numbers but are not (SKUs like `007`) are kept as text.
- **Two ways in, no new More row.** The wizard opens from the Reports top bar and from Settings ▸ Data (the old raw-file row is kept and relabelled "Export raw CSV files"). A More row would have meant editing every display mode's row set, which is not worth it for a settings screen.
- **No date filter on the wizard.** It exports everything the till holds; the period is chosen in the spreadsheet. Daily totals still merge the saved rollups, so imported Square history and other registers are included. A date range in the wizard is a possible follow-up.
- **Where it lives.** `src/screens/Export.tsx` (the questions and the share), `src/lib/exportSheets.ts` (the pure tables), `src/lib/exportCollect.ts` (read the store, write the file), `src/lib/xlsx.ts` (the workbook writer). Tests in `tests/export.test.ts`; help page `help/orders/export.md`.
