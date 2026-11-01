# Guessed answers

Where you have not told me the answer, I have guessed and written the guess here so you can correct it later.
Everything in this file is a guess from me, not a decision from you.

## How I read your last instructions

- **"Complete 2 (TRAINING_CORRECTIONS.md)"** means: finish the corrections in `dev_docs/TRAINING_CORRECTIONS.md`.
- **"ignore ALL MODULES"** was the earlier boundary: do not change any course content under `src/training/modules/*`.
  **Superseded:** you then said "do the training corrections first, then build away at modules", so the per-module
  corrections in `dev_docs/TRAINING_CORRECTIONS.md` section 4 are done on `dev` (0123 to 0128), and the remaining
  courses are being built. Section 5 of the corrections (app changes, not training) is done too.
- **"3.1 delete / 3.2 defer / 3.3 fix it / 3.4 this skill"** answers the loose ends I listed:
  3.1 the stray `patches/0119-training-soft-locks.patch` (deleted), 3.2 the `split-pay` course (deferred, then
  built as 0122), 3.3 the `unavailable` terminal dead end (fixed), 3.4 the writing style (that skill, adopted below).
- **"the rest you have to walk me through one by one"** was the earlier note about the per-module corrections; the
  later "do the training corrections first" supersedes it and they are done.

## Questions from `dev_docs/TRAINING_CORRECTIONS.md`, section 6

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
  `.local`) or remote, enforced in code. Details and the data rules are in `dev_docs/WRITING_ASSISTANT.md` and
  `dev_docs/AI_ASSISTANT_PLAN.md`.

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

## Shop-wide sales view for the assistant: what I decided (2026-10-19)

The owner noticed the assistant only knew this till's sales and asked for sales history to reach every till, with iCloud
(`dev_docs/CLOUDKIT_SYNC_PLAN.md`) as the eventual home. The owner chose to pull now and do CloudKit next, and to feed every data
tool, not just the totals. Decisions I made without asking:

- **Sales already went up, nothing came down.** The outbox writes a `pos_sale` metaobject row and a per-register, per-day
  `pos_rollup` row for every sale; the Reports page already reads the rollups live, but the assistant did not, so it only saw this
  till. The fix pulls those same rows and keeps them, so the assistant needs no live fetch per question.
- **The whole sale rides in a new `sale_json` field.** The old columns (compacted lines and tenders) do not carry the deals,
  adjustments, tips, notes or gift card details the tools show. The field is added on demand to an older shop's definition
  (`ensureSaleDetailField`), so a till that cannot add it still uploads its sale without the detail rather than blocking.
- **Detail is forward only.** A sale made before the field existed has no line detail and is left out of the order and gift card
  tools; its money still counts in the daily totals. The notes and the help page say so.
- **Kept apart from `pos.sales`.** The other tills' sales live in `pos.shared` (their sales and daily totals), because `pos.sales`
  is this till's live copy and what the cash tools read: a drawer figure must stay this till's.
- **Throttled and incremental.** The pull runs at most every five minutes from the 25 s poll, pages newest first, and stops at
  sales already held. The first pull after install pages up to 800 sales and 800 daily totals.
- **iCloud is still the plan.** This is the metaobject path until `dev_docs/CLOUDKIT_SYNC_PLAN.md` lands; that plan replaces this
  transport, not the shape of what the tools read.
- **The report export reads the same cache.** After the owner asked, the export was widened to the whole shop as well: it takes
  sales from `allSales` and day totals from `pos.shared.rollups` merged under this till's own, so Transactions, Item sales,
  Discounts, Gift cards, Inventory movements, Team member sales and Daily totals all cover every till. Cash did not change: the
  drawer and its ledger are still this device's, and the help page's old claim that other registers were already included is gone.
- **Where it lives.** `src/lib/salesHistory.ts` (pure decode and merge), the pull in `src/lib/sync.ts` (`pullSalesHistory`), the
  cache in `src/state/store.ts` (`pos.shared`), and the merge into the snapshot in `src/lib/assistantDataIO.ts`. Tests in
  `tests/saleshistory.test.ts`; device test T73.

## CloudKit, patch 1 config: what I decided (2026-10-19)

The owner answered the two gating questions: their **personal** Apple ID owns the zone (not a shop account, so the Shopify
metaobjects stay as the backup), and the app is **iOS only**. With those settled, the first patch's native config half is in
`plugins/withCloudKit.js`, wired into `app.json` as `./plugins/withCloudKit`. Decisions I made without asking:

- **A config plugin, not edits to `ios/`.** `ios/` is gitignored and rebuilt by `npm run ios:reset`, so anything written there
  is lost. The plugin is the source of truth, and remains the only place native settings live.
- **No new dependency.** The plugin uses `@expo/config-plugins`, which Expo already installs, rather than adding
  `expo-build-properties` for one deployment-target line.
- **Deployment target in two places.** iOS 17 is required for `CKSyncEngine`. Setting only `ios.deploymentTarget` in
  `Podfile.properties.json` fixes CocoaPods but leaves the Xcode project's `IPHONEOS_DEPLOYMENT_TARGET` below 17, so the plugin
  also rewrites the four build configurations through `withXcodeProject`.
- **No `aps-environment` yet.** CloudKit push needs it, but an app that carries it must also be signed with a push-enabled
  profile. It arrives with the push subscriptions, in a later patch, not here.
- **Verified by prebuild, not assumed.** A throwaway copy (with `node_modules` symlinked) ran `npx expo prebuild --platform ios
  --no-install`; the generated entitlements, `Info.plist` and project all came out right. The repo's own `ios/` was left alone.
- **The skeleton is only account status, on purpose.** Patch 1 exists to prove the native path (entitlement, CloudKit API,
  module wiring) end to end, not to ship sync. `CloudKitSyncModule.swift` answers the one question patch 2's screen needs first
  (is iCloud usable here?), and the engine itself lands in patch 2, so nothing dead is written now.
- **The JS bridge is split so the fallback is testable.** `status.ts` holds the types and the missing-module fallback with no
  `expo` import, and `index.ts` is the two-line layer that supplies the native module. Importing `expo` hangs under plain Node,
  so keeping it out of `status.ts` is what lets `tests/cloudkit.test.ts` run. `index.ts` is deliberately left out of `tsconfig`'s
  include: adding it pulled the whole `expo` type graph in and turned a 4 s typecheck into a 12-minute one.
- **Built, not assumed.** A throwaway copy ran `expo prebuild`, `pod install` and then `xcodebuild` on the `CloudKitSync` pod
  target, which compiles the Swift against ExpoModulesCore and the iOS SDK. The repo's own `ios/` was untouched.
- **Still the owner's.** The `iCloud.com.aidens3dp.pos` container must exist in their developer account with iCloud enabled on
  the App ID before a device build can sign.

## CloudKit, patch 2: the zone, the share and the Cloud sync page (2026-10-20)

Patch 1 proved the native path. Patch 2 opens the shop's zone and links the registers, so a person can set one till up and
join the others. Decisions I made without asking:

- **One zone, one name.** The shop's records live in a single CloudKit zone named Store, in the owner's private database; a
  register that joined sees the same zone name in its shared database. That is also how the page works out its role: the
  database it finds the zone under tells it whether it owns the shop or joined it.
- **A zone-wide share with read-write permission, so a link is enough.** `CKShare(recordZoneID:)` with
  `publicPermission = .readWrite`, per section 4.1 of the plan: anyone with the link can join, and there is no participant
  list to fill in by hand. The link is what the share sheet hands over.
- **A link, not a QR code.** The plan mentioned a QR code for the iPad to iPad path. The link does the same job through the
  share sheet, AirDrop or Messages, and a QR would mean a scanner screen and camera flow for no extra reach, so it waits until
  the owner asks for it.
- **The share link is caught twice, because one path cannot cover both cases.** iOS hands a tapped link to
  `application(_:userDidAcceptCloudKitShareWith:)`, which Expo does not forward, so `plugins/withCloudKit.js` writes that
  method into the generated `AppDelegate`. The method posts a note the module listens for (an app that is already running
  joins at once) and also keeps the link in `UserDefaults` (a cold launch, where the module did not exist yet, shows the link
  in the box for one tap).
- **The method goes inside the AppDelegate class.** The generated `AppDelegate.swift` holds a second class
  (`ReactNativeDelegate`) after `AppDelegate`, so the plugin finds the class body by matching braces. Writing before the
  file's last brace, which was the first version, put the method on `ReactNativeDelegate`: it compiled, and iOS would never
  have called it. The node tests pin this down now.
- **`@objc` is explicit.** The superclass does not declare the method, so nothing else would expose it to UIKit's selector
  lookup.
- **The page lives under Settings ▸ Data.** Cloud sync sits next to Export data, since both are about where a register's
  records go, and it is for managers and owners, matching the rest of Settings.
- **Patch 2 links the registers but sends no records.** The engine is patch 3. The page says so plainly ("records arrive once
  sync is switched on") rather than implying data is moving, and the device test says the same.
- **One owner, and setup is one-way.** The first register to set up owns the shop; the others join. A register that has joined
  is not offered the setup button, because two zones with the same name would be a confusing state to explain. Pressing setup
  twice returns the existing link rather than making a second share.
- **No training or demo.** Both actions are switched off in practice mode, so a course cannot link a real shop.
- **The screen imports the bridge directly.** The patch 1 note said importing `modules/cloudkit-sync/index.ts` turned `tsc`
  from 4 s into 12 minutes. Measuring again on this machine, twice, gives 4.4 s either way, so that observation does not hold
  here and one code path is kept instead of a second wrapper.
- **iOS 26 deprecates the delegate call.** The SDK marks `application(_:userDidAcceptCloudKitShareWith:)` deprecated in
  favour of the scene based `windowScene(_:userDidAcceptCloudKitShareWith:)` on iOS 26. This app is not scene based (the
  template builds a `UIWindow` directly), so the app delegate call is the one that fires. If a tapped link does not join on an
  iOS 26 iPad, that deprecation is the reason and the fix is a scene delegate. T74 step 7 covers it.
- **Verified without a device.** The AppDelegate text transform is checked by `tests/cloudkitplugin.test.ts`, and the native
  half by a real `expo prebuild` in a throwaway copy: the generated `AppDelegate.swift` gains the method inside `AppDelegate`,
  `expo-modules-autolinking` lists `cloudkit-sync`, and the entitlements and `Info.plist` keys are as patch 1 left them. Then
  `pod install` and an `xcodebuild` of the `CloudKitSync` pod target.
- **Still cannot be tested here.** Linking two registers needs two iPads and two Apple IDs. Steps are in
  `dev_docs/DEVICE_TESTS.md` T74.
- **A rule that hid the native sources.** `.gitignore` had a bare `ios` line, meant for the app's generated project, and it
  also caught `modules/cloudkit-sync/ios/`. Patch 1's commit therefore shipped the module without `CloudKitSyncModule.swift`
  or `CloudKitSync.podspec`, so a fresh clone would have had no native module at all. The line is anchored now (`/ios` and
  `/android`, the repo root only) and both files are tracked. No other folder in the repo is named `ios` or `android`
  outside node_modules, so the change catches nothing else.

## CloudKit, patch 3: the shared-state seam (2026-10-20)

Patch 2 linked the registers. Patch 3 is the plan's "backend interface wrapped around the current metaobjects code": the seam
both transports sit behind, so patch 4 can add CloudKit without `sync.ts` changing. Decisions I made without asking:

- **The interface is the five calls sync.ts already made.** `SharedBackend` is `ensure`, `get`, `put`, `list` and `remove`,
  with a row and a page shape taken straight from the metaobject helpers. Nothing cleverer: a bigger interface would have meant
  inventing behaviour CloudKit's record API does not have, and the whole point is that the metaobject backend is a thin wrap.
- **The shop's type names, not either store's.** The interface speaks in `cart`, `layout`, `sale`, `rollup` and `settings`,
  and each backend maps those onto its own thing (`pos_sale` today, a CloudKit record type later). A `SHARED_TYPES` list is
  exported so a test can prove both backends cover all five.
- **The seam blocks writes in training, not reads.** The plan asks that `kvWriteAllowed` also cover CloudKit writes. The rule
  lives in `putShared` and `removeShared` (the write path), while `getShared` and `listShared` stay open: a training course
  teaches on real history, so reading it must not be what a guard stops. `backendWritable()` is exported so a caller can ask.
- **A missing backend throws plainly.** Before one is installed the seam throws "Shared storage is not connected on this
  till." (synchronously, because it is a wiring mistake, not a network state) rather than an undefined-method crash or a silent
  no-op. `activeBackendKind()` answers `none` so a screen could say where records are kept.
- **The sale-detail field is a backend capability, not a special case in sync.ts.** The metaobject backend adds `sale_json`
  to an older shop's sales definition on demand and answers whether it worked. That moved behind an optional `detailReady`,
  so a CloudKit backend (which has no such schema step) simply does not implement it and the caller defaults to "ready".
  A caller that gets false still writes the sale without the detail, which is exactly the old behaviour.
- **`metaobjects.ts` is unchanged.** The seam wraps it rather than rewriting it, so the raw metaobject helpers still hold the
  GraphQL and the definition list, and the metaobject backend is a mapping over them. Reports and the Settings button were
  moved onto the seam too, so the only remaining `metaobjects` import is inside the backend.
- **The Settings button lost "(metaobjects)".** It is now **Set up shared storage**, because the storage behind it is the
  backend's business, not the person's. The help pages that named the button are updated, which regenerated `help/help.json`.
- **Patch 3 answers no CloudKit question and moves no record.** It is a seam, so it is fully testable in Node: the contract is
  pinned in `tests/syncbackend.test.ts` against a fake backend. The four owner unknowns still open in the plan's section 7 are
  each tagged in that plan with the patch that will first need them (4 and 8), because none of them is about this seam.

## Companion mode, patch 0176: the device mode and the setup checklist (2026-10-20)

The first patch of `dev_docs/COMPANION_PLAN.md`. It adds the gate, the two stored keys and the two screens; nothing is hidden yet.
Decisions I made without asking:

- **The More row is called "Device mode", not "Companion features".** A register has to reach this page too, and a row called
  "Companion features" on a register reads as something that is not for them. The screen keeps the plan's wording for the six
  switches (the **Companion features** section), so the two names both appear where each one is true. Patch 0178 does the
  wording pass and can rename it cheaply.
- **The row is in every display mode's list.** It is in More's second group and in the Essential level, so a person in Minimal
  display mode can still reach the page that says what the device is and switch it back. A companion that could not reach it
  would be a trap.
- **Everyone signed in can open it, as the plan says.** The mode can therefore be changed by a cashier until the step-up PIN
  arrives with patch 0177. The confirm dialog states what a change does, and the device test covers it.
- **A register keeps every feature whatever is stored.** `resolveFeatures` answers all six for a register, so a leftover
  companion switch can never quietly hollow out a till, and an unknown stored mode reads as a register. This is the same
  rule `uiMode.ts` already applies: a narrowing layer never widens, and a device never takes a mode from anywhere but its own
  settings.
- **Switching to companion keeps the switches as they are.** Going back and forth must not lose them, and the plan's default
  (everything off) is what a device that has never had them reads as.
- **The gate maps whole pages, not parts of them.** `routeAllowed` names the pages a group owns (cart, pay, saved, drawer,
  staff, terminalPlay, training, trainingRun) and nothing else is blocked: Help, Settings, Orders, Items, Customers, Reports,
  Export, Cloud sync, Diagnostics and the assistant stay open, which is what the plan says a companion keeps. The finer work
  (a reader tool inside Diagnostics, the drawer sheet inside a sale) belongs to patch 0179.
- **Today and Scan are not in the gate yet.** They do not exist until 0178, and adding names for screens that are not there
  would be dead code. `tabAllowed` covers the five tabs that exist.
- **An install that already had settings is marked set up**, as a register. The test is "settings exist but there is no
  `setupDone` key", which only an install from before this patch can be. A fresh install has no settings record at all, and
  it writes `setupDone` on its first launch, so a half-finished checklist is not mistaken for an upgraded install.
- **The checklist never blocks.** Every step is a row that opens the screen that does the job, and **Finish setup** works at
  any point. A shop can look around first. The register's "Name this register" step treats the default name as not done,
  because a name nobody chose is not a name, and the lock's step needs a PIN that is actually required on an owner, not just
  a PIN stored somewhere.
- **The step-up PIN is not in this patch.** The plan lists it with the lock (0177). Until then the mode change is guarded by
  a confirmation dialog only, and both help pages say so plainly rather than implying the PIN is already there.
- **Nothing is hidden yet.** The mode, the switches and the page are real and stored, but the tabs still show everything,
  because wiring the tabs, the route guard and the deep links to the gate is patch 0178. The device test says the same, so a
  reader is not left thinking a switch did nothing.

## The stashed 0185 patch: checked and dropped (2026-10-20)

A file, `patches/pending_merge/0185-companion-mode-gate-and-setup.patch`, was found untracked in the repo. It was checked before
anything was done with it, and it turned out to be the same feature as the shipped patch 0176, in an earlier draft: it was
written while the Companion series was still numbered 0185 to 0191, before the renumber to 0176 to 0182. It creates the same
`appMode.ts`, `setupFlow.ts`, `Setup.tsx` and their tests, and it stores the identical `appMode`, `registerFeatures` and
`setupDone` keys with the same migration (missing flag on stored settings means an upgraded install). It does not apply cleanly,
because the files it creates already exist and the rest does not match, and applying it would have undone three decisions 0176
made deliberately: setup as a non-blocking checklist rather than a full-screen block, deferring the App.tsx wiring to 0178, and
calling the More row **Device mode** rather than **Companion features**. The one piece that was genuinely missing from the tree
was a short **Device mode** section in `dev_docs/MODES.md`, which is now written by hand against the shipped behaviour and naming.
The folder was deleted, including the `.DS_Store` beside the patch, and nothing was applied. The lesson for next time: a patch
left in `patches/pending_merge/` is not picked up by `scripts/apply-patches.sh`, which only globs `patches/*.patch`, so it sits
inert until someone looks at it by hand.

## F5 leftovers: the changelog and GitHub Discussions (0186, 2026-10-20)

Two items were left open in F5, and one decision was made without asking you. Change either if you disagree.

**The changelog.** `CHANGELOG.md` is new, in the Keep a Changelog layout. There are no tags or releases and the version is 1.0.0, so it has one section, Unreleased, grouped into Added, Changed and Fixed. It was written from the headlines of the patch rows in `dev_docs/PROGRESS.md` and from the commit titles of the work done since (report export, shop-wide sales, CloudKit, Companion mode). Where a headline was cut short I read the full row before using it, and two lines were corrected that way. It is a summary, not a complete list: the progress log is the complete list. `CONTRIBUTING.md` now asks for a line in it for anything a shop user would notice.

**Discussions: off.** This is a guess. The README already says this is one person's shop app, public to be inspected, with no support channel. Discussions would add a second place for questions that nobody has agreed to answer, and the repo has no licence yet, so there is nothing for a community to build on. Issues stay open for bugs. The README now says Discussions are off. **This is a GitHub setting, not a file,** so nothing in the repo turns it off: new repositories have it off by default, and the check is Settings ▸ General ▸ Features. If you want it on later, tick it there and change the README line.

**Also fixed while there:** `CONTRIBUTING.md` still said four training-course test failures were known and pre-existing, which stopped being true with 0183. The README said 64 help pages, and there are 68.

**Still open, and yours:** the licence choice. No LICENSE file has been added and the README still says all rights reserved.

## Demo mode on the real data (0187, 2026-10-20)

You asked for Demo mode to use the real catalogue and real data where there is some, and to block only what has consequences or cannot be rolled back. The rule I applied is the guard's: anything that stays in memory is allowed, because leaving puts the real state back exactly; anything that leaves the iPad, or changes a file that is already on it, is switched off. These were my choices, and each is easy to change.

- **Real staff stay in the list, next to the made-up owner.** The demo is still signed in as the made-up owner with no PIN, so every feature shows and it cannot lock itself out. The real people appear on the Staff page and on the sales that name them. The alternative is hiding them, which is safer for a demo shown to a customer and less true to the till.
- **Shopify reads are still off.** I did not allow live lookups (Orders, customer search, a catalogue refresh). The demo shows what is already on the iPad, which is what "if present" read as to me. It would be possible to allow queries and block only mutations at the one place Shopify is called, but the sync loops and the Orders and Customers screens all switch to practice data when the guard is on, so it is a patch of its own. Say if you want it.
- **Practice data fills a gap only where an empty screen would show nothing worth seeing.** A till with a real catalogue and an empty upload queue gets no pretend queued sales, because that is the healthy case. A till with no drawer yet gets a practice drawer so the cash features can be shown.
- **The cart being rung up and card attempts are not copied.** They belong to a sale that is really happening. Demo mode now also refuses to start while a card payment is in flight or a sale is part paid, the same rule training has.
- **Everything pointing outside the iPad stays blank or practice** even though the rest is real: the receipt server, the pass server, the gift card claim address and the location id. This is on top of the guard, in case a path is ever missed.
- **Exports are allowed.** The Export wizard writes one new file in the cache folder for the person to share, with data the till already shows. Backup export and restore are not allowed, because the backup carries the real logins.
- **A copy, not a view.** The demo is a JSON copy of the data taken when it starts, so even code that edits an object in place cannot reach the real one. On a very large catalogue the copy takes a moment.

**What the audit found:** the Square history screen could delete or overwrite the real history files in Demo mode (this was already true of the old Demo mode), Backup & transfer could export the real logins, and the pass request could reach the pass server. All three are now stopped, and `tests/demoguard.test.ts` keeps the list: a new file that fetches or writes must check the guard or be added with a reason.

## CloudKit sale records (0194)

These fill gaps in `dev_docs/CLOUDKIT_SYNC_DECISIONS.md`. Each is a guess, change any you disagree with.

1. **Encrypted by default or not.** Decisions item 17 says encryption is in scope from the first sales patch, and O4 (build behind a switch, test across two Apple IDs first) is your suggestion and not agreed. Guess: the switch exists and defaults to `omit`, so until the test passes the card details are left out of CloudKit, never written plain. Turning on `encrypted` is one argument.
2. **Which card fields are plain.** Q6 lists what to encrypt. Guess: scheme, card media, local time, tip and surcharge amounts are not on that list and stay plain (amounts have to add up in reports, and the others identify nothing).
3. **Gift card codes and gift recipients.** The decisions do not mention them. A gift card code can be spent by anyone who reads it, and a recipient's email is someone else's detail. Guess: they go in the encrypted field with the card details, and never plain.
4. **The sale's own receipt link.** A link to a receipt page can show the whole sale. Guess: encrypted, like the card's receipt link.
5. **One encrypted field, not many.** Guess: one JSON field, `secure_json`, so the native side handles a single encrypted key per sale.
6. **A customer reads back with no name.** The sale keeps only the Shopify id. Guess: it returns as `{ id, name: '' }` and the till fills in the name from its own Shopify cache.
7. **Free-text notes and reasons stay plain** (decisions item 18), a known minor exception for a customer's name.

## CloudKit events and attempts (0196)

These fill gaps in `dev_docs/CLOUDKIT_SYNC_DECISIONS.md`. Each is a guess, change any you disagree with.

1. **Event ids.** The decisions say `event-<id>` and that events have an id, but local events have none (they are CSV rows). Guess: the id is the register id plus a hash of the CSV row, so it is the same however many times the event is uploaded.
2. **A resolution is its own record.** The decisions name only `attempt-<sale uuid>-<reference>` and say the first resolution wins. Guess: resolving writes a second, write-once record `resolve-<sale uuid>-<reference>`, because a write-once record is the one way two registers resolving at the same moment cannot both win.
3. **A resolved attempt's old status.** The app overwrites the status with `resolved`, so the earlier one is lost. Guess: the attempt record keeps `unknown` and the resolution says it was resolved.
4. **Events hold no card or customer detail, so they are not encrypted.** A free-text `message` or `detail` could in principle hold a name, the same minor exception as a sale note (item 18).

## CloudKit event call sites (0198)

These fill gaps in `dev_docs/CLOUDKIT_SYNC_DECISIONS.md`. Each is a guess, change any you disagree with.

1. **No stored marker of what has been uploaded.** Guess: each launch compares `events.csv` with CloudKit once (one listing, then a write for each missing event), and again after a failed upload. The alternative is a "last uploaded" marker in the settings, which is one more per-device counter to keep right. The cost of the guess is that the comparison grows with the history; at a few thousand events it is a few pages.
2. **Events made before the first catch-up wait for it.** Guess: after a launch, a live event is not sent on its own until the catch-up has run once, so the history goes up in order and the first pass lists CloudKit only once. The catch-up runs on the 25 second poll, so the wait is short.
3. **Events already in the CSV when CloudKit goes live are uploaded.** Guess: yes, by the same first catch-up, since the history is the register's own (Q13). A register that was on Shopify storage first therefore sends its whole `events.csv` the first time CloudKit is the active backend.
4. **A bad row is skipped, not uploaded.** A row with no time or a kind the app does not know is left out of the upload and left alone in the file.
5. **Paid in and paid out are now both an event record and a ledger entry.** The ledger entry is the money; the event is the audit line, as in `events.csv` today.

## CloudKit attempt call sites (0199)

These fill gaps in `dev_docs/CLOUDKIT_SYNC_DECISIONS.md`. Each is a guess, change any you disagree with.

1. **The catch-up sends every attempt the register holds.** Guess: once per launch, one read and one write for each (the app never prunes its attempts list). The alternative is a stored marker per attempt, which is one more per-device counter. Say so if the list gets long enough to matter.
2. **A register never changes its own attempts from CloudKit.** Guess: when another register resolved a payment first, this one keeps its own copy and shows a notice; it does not rewrite its attempt or undo a tender it added. Pulling the shop-wide list is a separate piece.
3. **The notice is `info`.** Guess: info, which stays local (decisions item 10), rather than `refund` or `cash`, which sync. It says who resolved it and to check the terminal or Zeller dashboard.
4. **Only who resolved it is recorded, not what they chose.** The decisions say the first resolution wins and do not say the outcome (charged or not charged) is stored. Guess: it is not, so the notice cannot say whether the other register agreed. Adding it is one more field on the resolution record.
5. **An automatic resolution counts as the register's.** When the reader check settles an unknown payment on its own, there is no person, so the resolution is labelled with the register's name.

## CloudKit attempt pull (0200)

These fill gaps in `dev_docs/CLOUDKIT_SYNC_DECISIONS.md`. Each is a guess, change any you disagree with.

1. **This changes guess 2 of 0199 in one case.** Guess: if another register resolved a payment that this register still shows as "no result yet", this register now marks its own copy resolved (with that register's name) and shows the notice. 0199 said it would only show a notice when both registers resolved at once, and that case is unchanged: a register that resolved the payment itself is never rewritten. The reason for the change is that this register's Pay screen refuses to charge the sale again while an attempt is `unknown`, so without it the sale stays blocked after someone has already settled it elsewhere.
2. **Only an `unknown` attempt takes another register's resolution.** A `started` attempt may be a charge still running on this register's reader, so a resolution from elsewhere does not clear it.
3. **Taking over a resolution does not add a card tender.** If the other register chose "customer WAS charged", this register's cart is not given a card payment, because only the register holding the sale can add a tender to it. The notice says to check the terminal or Zeller dashboard, which is the same advice as 0199. The decisions do not store whether the payment was charged (0199 guess 4), so the notice cannot say more.
4. **The shop-wide list is not saved.** Guess: it lives in memory and is refilled on the first poll after launch (about 25 seconds, or at once with Sync now). The alternative is a saved cache like `pos.shared`, which would show the last list offline but needs a migration and can show a payment as waiting after it was resolved. The list is only for looking at, so memory is enough.
5. **The Diagnostics list is read only.** The decisions say any register can resolve a payment (Q10), but a resolution has to say whether the customer was charged, and for another register's sale that choice only means something at the register holding the sale. Guess: show the list now and leave a resolve button for later, once it is decided what "charged" means from a register that has no cart for the sale.
6. **A `started` attempt older than 5 minutes is labelled "stopped part way".** It uses the same 5 minute window as `paymentActive` and stays in the list, so a manager can see a charge that never finished instead of it saying "in progress" for ever.
7. **The section is on Diagnostics, not a new screen, and only shows once CloudKit has sent attempts.** A register still on Shopify storage never sees an empty section.

## CloudKit events export (0201)

These fill gaps in `dev_docs/CLOUDKIT_SYNC_DECISIONS.md`. Each is a guess, change any you disagree with.

1. **The export is a button on the Cloud sync page.** The decisions say "build a combined CSV from them on demand" (item 12, Q3) and do not say where. Guess: Cloud sync, because it is about iCloud and is already for managers and owners. The alternative is the Export questions (Reports and Settings ▸ Data), which would make it a table beside the others.
2. **It is shown only when CloudKit is the backend in use.** Until patch 8 nothing sets that, so no till sees the button yet. It is not shown on a register still on Shopify storage, because there is nothing in iCloud to build it from.
3. **Exporting sends this register's own history first.** If the launch catch-up has not run yet, the export runs it, so the file is not missing events made on this iPad. If that catch-up fails, the export carries on with what CloudKit holds rather than refusing.
4. **A failed read says so.** The poll hides CloudKit errors; this one shows them, because a person asked for the file.
5. **One file, one CSV.** The `events.csv` columns plus a `register` column holding the register's name (two registers with the same name look alike; the id is not in the file). Say so if you want the id too.
6. **No pull for the app itself.** Nothing else reads the shared events (no screen shows other registers' events), so events are read only when the file is asked for, not on the poll.
