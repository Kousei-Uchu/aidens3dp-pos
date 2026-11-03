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

## CloudKit iCloud note (0202)

These fill gaps in `dev_docs/CLOUDKIT_SYNC_DECISIONS.md`. Each is a guess, change any you disagree with.

1. **The note is on the Cloud sync page, shown to everyone who can open it, before and after joining.** Guess: a person should read what is stored before they set up or join. The alternative is showing it only after joining, or a confirm step before **Set up this till** and **Join**.
2. **It describes the design, not what is built today.** Several parts (saved carts, shop settings, staff, the audit log) are not yet sent. The intro says nothing is sent before sync is switched on, and the secrets block says "later". Guess: better to say all of it now than to edit the note every patch.
3. **Wording is in `src/lib/icloudNote.ts`, pinned by a test.** The test checks the points the decisions require, not exact sentences, so you can reword freely.
4. **The privacy policy is not touched.** The help page says it is yours to update.

## Drawer audit (0203)

1. **The "typical day" is the whole shop's.** The smart-change profile and the assistant's float judgement now size their horizon from this register's sales plus the sales the other registers shared. Guess: the ledger holds every register's cash, so a day measured on one register's sales was too short. The alternative is leaving it per register.
2. **Smart change and consolidate are still described as per iPad.** Decisions item 23 makes them shop-wide, but nothing syncs them until patch 6a. The Settings text and the help say "this register only" today, which is true. They need changing when 6a lands, not before.
3. **`cashSince` keeps its `registerId` branch.** Nothing calls it with an id any more, but removing it changes an exported function the tests may use. Say if you want it removed.
4. **The "stale comment in the store" is already fixed.** The decisions mention one; the store comments already say the drawer is shared.

## Saved carts (0204)

These fill gaps in the plan ("saved carts with conflict merging") and `dev_docs/CLOUDKIT_SYNC_DECISIONS.md` ("Patch 5: unchanged"). Each is a guess, change any you disagree with.

1. **A delete wins over an edit, both ways.** A cart deleted on one register is removed from the other even if it had an unsent change, and a delete made here is sent over someone else's edit. Guess: a deleted cart is usually a sold or abandoned one, and bringing it back was a bug in the old code. The alternative is last-writer-wins.
2. **Three parts, not three-way by field.** The merge judges the name and note together, the assignment, and the contents (items, discount, customer) as three parts. Two registers editing different items in the same cart count as one part changed on both sides, so the later edit wins and the other's items are lost. A per-item merge would keep both but is much more code.
3. **"Later" is the time of the last edit on that register's clock.** Two iPads with clocks minutes apart could pick the wrong winner. A tie goes to the shared copy.
4. **A save first reads the cart back.** One extra read per changed cart. This narrows the overwrite window to a moment but does not close it, because there is no atomic compare-and-set. Closing it needs a change tag check in the Swift, which I did not touch.
5. **The soft lock (`locked_by`, `locked_at`) is not built.** The plan mentions it and nothing in the code writes it. Say if you want it.
6. **Deleted carts stay in the store as records and the pull reads up to 1000.** Nothing removes them (CloudKit `remove` is not implemented, and the Shopify path never calls it). Past 1000 records the oldest are not read. A tidy-up that drops deleted carts older than a month would fix it.
7. **Both backends get the same change.** Saved carts go through the shared-state seam, so the Shopify path changes too. I judged that safer than a second code path.

## Shared settings (0205)

These fill gaps in the plan (patch 6a) and `dev_docs/CLOUDKIT_SYNC_DECISIONS.md` (items 2, 3, 19 to 21, 23, O2). Each is a guess, change any you disagree with.

1. **The assistant's log cap and data gate stay on each iPad.** O2 says the connection settings sync ("address, model name, options"). The log cap is that iPad's disk, and the gate decides what data a model may be sent, so I did not let one iPad loosen it for all. Syncing the gate is a one-word change in `assistantShared`.
2. **With no base, the shop's value wins.** `sharedBase` is empty on a register's first CloudKit push, so nothing can be told apart; the shop's value wins per key and staff lists are joined. A single unsent local edit made in that moment could be lost.
3. **A removed staff member stays removed.** Removing someone ends their PIN, so a late edit elsewhere never brings them back. Same rule as carts (0204).
4. **Only staff merges inside a key.** Fees, receipt details, cart warnings and the assistant connection are one value each, so if two registers edit different fields of one of them, the later writer takes the whole key.
5. **Auto-receipt is shared but has no screen.** Nothing in the app edits it today, so sharing it changes nothing yet.
6. **Edits are sent 1.5 s after typing stops**, by a watcher, instead of each screen calling the push. Receipt fields save on every keystroke, and a watcher also covers screens added later.
7. **Shopify reads now go through the whitelist.** The seven keys behave as before, but a record with extra or wrongly typed keys is no longer spread into the settings.
8. **Shop name is shared but not pushed at connect time.** Connecting Shopify sets it on that register; the watcher then sends it like any other edit once CloudKit is active.

## Shared notices (0206)

These fill gaps in the plan (patch 6a) and `dev_docs/CLOUDKIT_SYNC_DECISIONS.md` (item 10, Q2). Each is a guess, change any you disagree with.

1. **Seven days.** A notice older than a week is neither sent nor shown. Q2 does not say how far back a register that has just joined should look, and a cash or refund notice a week old has almost certainly been dealt with. It is one constant, `NOTICE_MAX_AGE_MS`.
2. **Only unread notices are sent late.** The once-per-launch catch-up skips a notice already read here, because reading it means someone handled it here. A notice sent live is sent whether or not it is read later.
3. **A cleared notice stays cleared.** Nothing is ever deleted from CloudKit, so a device-only `noticesSeen` list (capped at 500 names) remembers what this register has taken in. Without it, Clear all would be undone at the next poll.
4. **At most 50 arrive at once.** A register that comes back after a long time takes in the newest 50 and marks the rest as taken in, so they do not turn up later.
5. **A repeat is skipped.** An incoming notice with the same kind, title and body as one still unread on this register is not added, the same rule `notify` already uses. Cash notices include the sale's short id, so two different sales never match.
6. **A device that does not hold the feature skips the kind.** A companion without the drawer takes in no cash notices, the same as `notify` does for its own. The notice is still marked taken in, so it does not appear if the feature is switched on later.
7. **Notices carry no extra detail.** A shared notice is its kind, title, body, route and time, plus the register's id and name. The title and body can contain a sale's short id or an order name, never a card or customer detail. They are not encrypted.
8. **The whole list is read each poll.** Notices are read like payment attempts: every record, every poll. Cash and refund notices are rare, so this stays small, but it grows with history. A later patch could read only recent ones.

## Shared logo (0207)

These fill gaps in the plan (patch 6a) and `dev_docs/CLOUDKIT_SYNC_DECISIONS.md` (item 14). Each is a guess, change any you disagree with.

1. **"The logo" is the image uploaded under Settings ▸ Screensaver & display.** It is the only logo image the app stores on a device (`screensaver.logoFile`). The shop's website logo link (`BUSINESS_LOGO_URL`, also the default link) is a constant in the app, and the receipt screen shows that constant, so nothing in the printed receipt changes. Item 14 says a new register should "print the logo"; if you want the receipt to use the shared image, that is a separate small patch to `Receipt.tsx` and `receiptDoc`.
2. **The https logo link stays per device.** It is a link, not an image, and the screensaver settings as a whole stay per device (the screensaver's own colours and timings are not shared). Only the uploaded image is.
3. **A register that has just joined takes the shop's image over its own.** With no `logoBase` there is nothing to tell who changed, so the shop's wins, the same rule as shared settings (0205). The exception: if the shop's logo was removed and this register has one, this register's is sent rather than deleted on a guess.
4. **Both changed: this register wins** (the one running the poll), the same as shared settings. The other register then follows on its next poll.
5. **A removal is shared.** Removing the uploaded image on one register removes it on the others (the file is deleted there, and the screensaver falls back to the link). The alternative was to keep a removal local.
6. **700 KB limit, the same as backups.** A larger file is never sent, and while a register holds one the shop's image is not taken over it unseen. Settings does not stop you uploading a larger one today; it only stays on that iPad.
7. **Checked by content, not by name.** A downloaded image is installed only if its hash matches the record's. A mismatch, an unreadable file or a missing asset changes nothing and is tried again next poll.
8. **One record, history not kept.** `logo-current` is overwritten each time. Nothing keeps earlier logos.
9. **The poll reads one small record each time and downloads the image only when it changed.** The hash of this register's file is worked out once per file, not per poll.

## Shared layout (0208)

These fill gaps in the plan (patch 6a) and `dev_docs/CLOUDKIT_SYNC_DECISIONS.md` (item 27). Each is a guess, change any you disagree with.

1. **Merged by page, not by tile.** Tiles have no ids, so two registers editing different tiles of the same page cannot be told apart from two editing the same tile. The page is one value and the later sender keeps the whole page. A per-tile merge would need ids on tiles.
2. **A removed page stays removed** even if the other register edited it meanwhile, the same rule as saved carts (0204) and staff (0205). The alternative was to keep an edited page.
3. **Order: the sender's if it moved pages, otherwise the shop's.** A page that is new on one side goes after the others.
4. **No counter on CloudKit.** The shared layout is told apart from this register's by comparing text with `gridBase`, not by `gridVersion`. The version field is still written (one more than the larger of the two) so a register on Shopify storage would still read it.
5. **A layout edited offline is sent at the next poll.** Before, an edit made while offline was only sent if another edit followed. The poll now sends whenever this register's grid differs from `gridBase` and the shop's has not changed.
6. **No base joins instead of replacing.** A register that has just joined keeps its own pages the shop lacks and takes the shop's version of pages both have.
7. **A layout the shop holds that cannot be read is overwritten** by this register's, which repairs it. The alternative was to leave it alone.
8. **An edit made while a send is running is kept**, and sent at the next poll.

## Shared Square history (0209)

These fill gaps in the plan (patch 6a, "Square history structure and size") and `dev_docs/CLOUDKIT_SYNC_DECISIONS.md`. Each is a guess, change any you disagree with.

1. **Customer name, email and phone are removed from the copy in iCloud.** The history files hold them (the importer keeps Square's customer on each sale) and the plan says none reach CloudKit, so shipping the files as they are would have broken that rule. The Square customer id stays. The alternatives were to send the files whole, or to encrypt them. The cost of removing is that a register that took the history from iCloud has no names to search by, and it needs a second id per month (below). If you want the names on every register, say so and the answer is an encrypted asset, which waits on the encryption test (O4).
2. **Ticket names and line notes are not scrubbed.** A cashier can type a name there. It is the same known minor exception as a note on a sale (decisions item 18).
3. **Each month has two ids.** `hash` is the register's own file and `sid` the copy in iCloud, because they are different bytes. `squareBase` holds the pair both last agreed on, so a pulled month is not mistaken for a change and sent back.
4. **A shard is named by month and shared id and never rewritten.** The manifest points at exact versions, so a reader can never pair a manifest with a half-updated file. The cost is that an old version stays in iCloud as an unused record. Nothing deletes them yet.
5. **The manifest is a compare-and-set.** It is written only if it is still at the change tag that was read, and the pass is repeated (up to three times) if another register wrote first. A real compare is cheap here because there is one small manifest. Saved carts still have no such compare.
6. **Both registers changed the same month: the one with more sales wins, a tie keeps this register's.** The same rule on both sides, so they settle on one. A register that only knows a month's file name counts it as 0 sales.
7. **Removing the history removes it everywhere.** It is a deliberate action, the confirmation now says so when iCloud sync is on, and the manifest and a base that both sides agreed on guard against a stray deletion: a month is never deleted on a register that changed it since, and never deleted when there was no agreed base. The alternative was to keep a removal local, which would let the shop's copy come straight back.
8. **An unreadable manifest is left alone.** Reading it as empty would look like every month had been removed. It needs fixing by hand or by a later patch.
9. **Month files over 8 MB are neither sent nor taken in.** A busy month is a few hundred KB packed, so this only guards against a damaged file.
10. **The stored manifest is rewritten after a month is taken in or removed**, from the files now on the iPad, then the rollups are rebuilt exactly as an import does. Its total sales and refunds are approximate until the next import, and nothing reads them (the meta is rebuilt from the files).

## Shared training progress (0210)

These fill gaps in the plan (patch 6c) and `dev_docs/CLOUDKIT_SYNC_DECISIONS.md` (item 15, O1). Each is a guess, change any you disagree with.

1. **Progress is joined, not replaced.** Stages from either register are kept, the earliest finish stands, and the larger run count supplies hints and time. The alternative was last writer wins, which loses work done on two iPads.
2. **A reset is a count that wins whole.** Each full reset adds one to a per-module `epoch`, and the higher count beats any older work. The alternative, a reset time, would depend on each iPad's clock.
3. **A reset also takes the tick away.** The old `resetModule` keeps the tick until the person finishes again, so the new reset is separate (`resetModuleFully`), and the old one is unchanged.
4. **Managers reset cashiers only, not other managers or themselves.** Owners reset anyone, themselves included. Read from O1: "managers can reset progress for lower roles".
5. **The reset lives on More ▸ Training**, below the courses, for anyone who may reset someone. It lists people by name, with one reset per course and a reset-all.
6. **Nothing is sent during a practice run.** Marks made then are kept on the iPad and sent at the next poll after the run.
7. **A person's id is checked before it becomes a record name.** An id with a slash or other odd character is never sent. The shared record used when no staff are set up (`_shared`) does sync.
8. **A removed staff member's progress is not tidied**, in iCloud or on the iPads.

## Shared audit log (0211)

These fill gaps in the plan (patch 6c) and `dev_docs/CLOUDKIT_SYNC_DECISIONS.md` (item 13, Q4, N2). Each is a guess, change any you disagree with.

1. **One record per event, not one per register per day.** The notes suggested `audit-<register id>-<date>`, but a busy day of tool results can pass CloudKit's 1 MB record limit and a day file would be rewritten on every message. Records are `audit-<register id>-<event id>`, each written once.
2. **The whole event is encrypted, and four labels are plain**: register id and name, day and time, and kind (ask, error, offline). The staff member's name is inside the encrypted part. The labels let the shop count and order records without reading them.
3. **Nothing is written until the encrypted switch is on, and it is the same switch as the sales' card details** (`setSaleCardMode`). The content can hold customer names, so it must never be written plain, and writing only labels would be useless. The alternative was a second switch. One flip after T85 turns both on.
4. **Purge lines stay local.** They describe this iPad's own folder. Coach lines logged in a practice run are sent, marked practice, after the run ends.
5. **The shop's copy is never trimmed, and clearing or purging a local log does not touch it.** The cap on the viewer's page is about this iPad's storage. There is no screen to delete the shared copy yet; the owner-only export (6e) and a later clean-up patch can cover it.
6. **A very large event is shrunk to fit.** Tool results go first, then the text of earlier messages the model was sent, then the question and reply are clipped. The name, arguments and success of each tool call are kept, and the line says what was cut.
7. **The viewer reads the other registers on demand, not at every poll.** **All registers** fetches the newest 500 from iCloud when the manager opens it or applies a filter. Older ones are not reachable from the viewer yet. This keeps a poll from downloading and decrypting the whole log.
8. **A catch-up lists labels only** (the Swift asks CloudKit for just the plain fields), so it never downloads the log itself. It runs once per launch, like events.
9. **A conversation this iPad cannot decrypt is counted, not listed.** The viewer says how many could not be read.
10. **The manager's viewer is the only place the shared copy is read.** The assistant itself does not read other registers' conversations.

## Migration lease (0212)

These fill gaps in the plan (patch 7, section 6 steps 2 to 5). Each is a guess, change any you disagree with.

1. **Six phases, not the plan's six.** The order is settings, drawer, layout, carts, sales, rollups. The drawer is its own phase because Shopify keeps it as one `drawer` settings blob (shift and ledger together) that has to be turned into a `drawer-shift` record and one record per ledger entry. Square history is not a phase: it is not in Shopify, and each register already shares its own months at every poll (0209).
2. **A holder is gone after two minutes of no writes, and a holder writes about every 20 seconds.** That lets a holder miss two heartbeats in a row without losing the lease. Both numbers are constants at the top of `migrationLease.ts`.
3. **"No writes" is judged by the watcher's own clock, not by a time stored in the record.** Every write changes CloudKit's change tag, so a watcher only asks how long the tag it sees has stayed the same. The plan said the record would hold a lease expiry time; that would have trusted two iPads' clocks to agree. The cost is that an iPad that has just launched waits a full two minutes before it can take over, even if the holder died long ago.
4. **A failed run is picked up at once, with no wait.** The holder wrote `failed` itself, so it is known to have stopped. The reason is kept in the record until the next run starts.
5. **An iPad that restarts resumes its own lease at once**, without waiting two minutes, because it knows its previous run is over. This assumes one app process per iPad.
6. **A record written by a newer build is never touched**, even by the owner. The iPad waits and says it needs the latest version. A damaged record (this build's own layout, with nonsense in it) is taken over like a quiet holder, after the same two minutes.
7. **A participant never writes the lease.** Only an iPad on the owner's Apple ID may run the import (plan step 1), so a participant only reads and waits, and switches over when it sees `done`.
8. **`done` needs a `verified` flag and the last phase.** `completeMigration` throws otherwise, so a bug in the runner cannot make every register switch to an empty CloudKit zone.
9. **A write that comes back without a change tag counts as not held.** Without the tag the next checked write could not be made, so carrying on would risk two holders.
10. **The old unconditional `putMigration` is gone.** Nothing used it, and it would have let an iPad overwrite the lease.

## Migration import runner (0213)

These fill gaps in the plan (patch 7, section 6 steps 3 and 6). Each is a guess, change any you disagree with.

1. **A page is 100 rows, and each page is one lease write.** That write is the progress record and the heartbeat, so a run that is working never goes two minutes without one (a page of 100 puts is far shorter). The plan's "about 100" is the number used. The constant is `IMPORT_PAGE`.
2. **The cursor holds the count.** A takeover carries on counting from the stored number rather than from zero, so the phase's final count is right even when two iPads did the work. A cursor that cannot be read means the start of the phase, which is safe because every copy is idempotent.
3. **Rows are keyed by their own field, not by Shopify's handle.** Shopify lowercases and rewrites a handle (a rollup key `A|2026-11-01` becomes `a-2026-11-01`), but the app looks records up by the original key. The handle is only the last resort.
4. **A row with no usable key is skipped and not counted.** One damaged row should not stop the shop moving. The count check has to leave the same rows out of Shopify's side.
5. **Higher version wins for settings and layout, Shopify wins a tie.** This is plan section 6 step 6, using the row's `version` field (the plan said `sharedVersion`, which no row has). A CloudKit row that is kept still counts as imported.
6. **Saved carts, sales and rollups are plain upserts with no version check.** That is only safe because other registers do not write to CloudKit until the import is done (plan step 5). **Update (0221):** the queueing was never built and patch 8 (0220) did not add it. It looks unnecessary, because a till writes CloudKit only after it sees the import `done`, but this is read from the code, not run. T102 and T109 should confirm it.
7. **The drawer's counts become a starting checkpoint, written after the entries.** Shopify keeps the counts and only the latest 1000 entries, so replaying the entries alone would lose the older cash. The checkpoint is stamped with the newest entry's CloudKit creation time and is never replaced by a repeat of the phase.
8. **Ledger entries go in oldest first.** A stop part way then leaves the older history in place and a repeat writes only the rest.
9. **A drawer row with entries but no readable shift writes a closed drawer.** The alternative was dropping the entries.
10. **The runner stops after rollups and does not call `completeMigration`.** Only the count check may do that, so a bug here cannot switch every register to a half-filled zone.
11. **Any error other than losing the lease is written as `failed`**, including a lost network. The next owner iPad (or this one after a relaunch) takes over at once with no two-minute wait, and carries on from the stored phase and cursor.
12. **The Swift is untouched.** The runner uses only calls that already exist (`putLedgerEntry`, the checkpoint and shift writes, the seam's list, get and put).

## Migration count check (0214)

These fill gaps in the plan (patch 7, section 6 step 4). Each is a guess, change any you disagree with.

1. **"Counts match" means every key Shopify has is present in CloudKit**, not that the two totals are equal. Another owner iPad may legitimately have written an extra record (a setting, for instance), and that should not stop the shop switching over.
2. **Rows the runner skips are left out of the Shopify side too**, by using the runner's own rules, so one damaged row never blocks `done`.
3. **The drawer check has three parts**: every ledger entry, the shift (when Shopify had one) and the shop's cash counts reading back equal. The counts are the one that would catch a bad starting checkpoint.
4. **A shortfall rewinds to the earliest short phase and marks the run failed.** The next owner iPad takes over at once and repeats from that phase, including the later ones. It is not retried automatically by the same call, so a persistent mismatch shows as a repeating failed run with the reason in the record instead of an endless loop.
5. **A read error during the check is also recorded as failed**, with "Count check could not run" and the reason, and never as done.
6. **The check reads CloudKit by listing**, so a very large shop pays a few hundred reads once. It runs once, at the end of the import.
7. **Nothing is deleted.** A record CloudKit has and Shopify does not is left alone.

## Migration wiring (0215)

These fill gaps in the plan (patch 7, section 6 steps 1 and 5). Each is a guess, change any you disagree with.

1. **Nothing starts the import by itself.** The owner presses a button (the next piece). Starting it automatically at launch would run a one-off import on the shop's data before anyone had agreed.
2. **The owner is decided by the iCloud role**, the same `getState().role` the Cloud sync page shows, not by the app's staff roles. An owner-role staff member on a participant iPad cannot start it.
3. **Shopify is always read through the metaobject backend and CloudKit always written through the CloudKit backend**, whichever backend `setBackend` points the app at. Before patch 8 that is always the metaobject one.
4. **A second press while running is refused**, not queued, and the guard is taken before the first wait.
5. **Stop does not write anything.** The lease is left to lapse (two minutes), so another owner iPad waits that long. A stopped run on the same iPad resumes at once.
6. **Practice mode refuses to start and stops a running import.**
7. **A read failure is a sentence, not an error**, so a screen can always show something.

## Migration screen (0216)

These fill gaps in the plan (patch 7, the setup screen). Each is a guess, change any you disagree with.

1. **It is a section on the existing Cloud sync page**, not a new screen, so there is nothing new to navigate to.
2. **It is shown to every till in the shop**, owner or participant, so a participant can see why the shop is not on iCloud yet. Only the owner gets a button.
3. **The page reads the lease every five seconds while open** (a few cheap reads) and not at all when closed or when the till is not in a shop.
4. **No help text, tour spot or app-control entry** is added for the button. The help page for Cloud sync and the registry of controls (`appControls.ts`) are left as they are, because they have their own tests and wording rules; add them if you want the assistant and tour to know the button.
5. **Stopping needs no confirmation**, because it loses nothing and pressing the button carries on.
6. **The words say Shopify keeps its copy and nothing is deleted**, which is true of this patch. Revisit them in patch 8 when the switch is added.
7. **The section stays visible after the import is done**, with the sentence "Sync is set up.", so the owner can see it finished.

## Resolving another register's payment (0217)

Each is a guess, change any you disagree with.

1. **Only a payment with no result yet (`unknown`) can be resolved from another register.** A `started` one may still be a charge running on its own reader, which is why 0200 never lets a resolution from elsewhere clear one. A register that stopped part way therefore keeps showing "stopped part way" until that register resolves it itself; say if you would rather allow resolving old `started` ones.
2. **The charged or not-charged choice is only in the event, not in the record.** The resolution record has `resolvedBy` and a time and nothing else, so the owning register is told to check the terminal rather than being told the answer. Adding a field would change the record format.
3. **Nothing is added to the other register's sale.** A resolution from elsewhere only clears the block (0200). The owning register decides what to do with its own sale.
4. **Any signed-in person can do it**, the same as resolving on the Pay screen (Q10). The Diagnostics page is where it lives.
5. **The other register's name is in the event message** ("payment from Front till"), so the shop's events show it was not resolved on the register that took the payment.

## Another register creates a missing Shopify order (0218)

Each is a guess, change any you disagree with.

1. **The sale is written to CloudKit before the order, with CloudKit on only.** Without it nothing is left to find, because Shopify's shared sale row is written after the order. A sale shows in the shop-wide views without an order number until its order exists.
2. **A register waits 15 minutes before touching another register's sale**, and never touches one that is in its own queue. That gives the register that took the sale time to finish its own queue first.
3. **The claim is a write-once resolution record, `order-<sale>-<n>`.** It uses the resolution record's existing field names so no schema change is needed. The first claim wins. A claim over 30 minutes old with the order still missing means the claimer stopped, and the next number is tried, up to four.
4. **Three sales per run, one run every ten minutes, newest 500 sales read.** A sale further back than the newest 500 is not found. The CloudKit list order is not controlled from the app, so on a shop with a very long history this should be revisited.
5. **The same steps the queue uses are run**: order, receipt page, gift cards, the CloudKit record and the totals. All are safe to repeat (the order is searched by the sale's tag first, gift cards by code, the totals by an applied list), so the original iPad can come back and finish its own queue without doubling anything.
6. **A sale with a gift card sold or spent is not finished from here.** The card code is only in iCloud as an encrypted field, which is off until O4 passes, so another register could make the order but not the card. A notice tells a person once per launch to open the register that took it.
7. **Card references, the receipt link and the customer's name are not in the CloudKit sale** (decisions item 17 and the customer rule), so an order made from here has the customer's Shopify id but no name, and card payments without their references. Say if you want this limited further.
8. **No new event kind.** The recovering register raises a sync notice, not a CSV event.

## Owner-only CloudKit export (0219)

Each is a guess, change any you disagree with.

1. **It reads CloudKit directly**, not through the seam, so it works whichever backend the app is using, and before patch 8 it exports whatever the migration has copied.
2. **Every record type has its own file, as returned.** Records are not reshaped, so a later restore tool can read them. Encrypted fields are in the clear where this iPad could read them, and the README says to treat the zip like the Shopify login (O5).
3. **One failed list stops the whole export**, with the list's name. A partial backup that looks complete is worse than none.
4. **The Square history shard files are not included**, only their records and the manifest. They are derived from Square exports and can be imported again. The logo picture is included.
5. **Shopify's own data is not part of it.** It is a backup of what is in iCloud.
6. **The secrets (6d) will be added by adding them to the list in `exportAll.ts`**, when they exist.
7. **The zip is made in memory.** For a shop with very many thousands of sales this is large but still fine on an iPad. Revisit if it ever runs out of memory.
8. **Owner only, with a confirm that says how private it is.** The button is off during a practice run.

## The switch (0220)

Each is a guess, change any you disagree with.

1. **Cut over in one go, no dual-write.** The plan said to prefer this with only a few iPads. Dual-write would double every write and every failure mode, and its only gain is a smoother rollback, which the untouched Shopify records already give. Change it if you disagree.
2. **A till moves when it sees the import `done`, on the poll (about 25 seconds), not at the next launch.** Waiting for a relaunch would leave tills writing Shopify for hours. Nothing is restarted.
3. **The gap is closed by each till sending its own sales since the import began.** Tills still on Shopify after the import finished write sales to Shopify only, so each one, when it moves, sends its own sales from ten minutes before the import began that CloudKit lacks, through the queue's own entry and totals steps (safe to repeat). It is done once per till, and retried at each poll if it failed.
4. **Settings, layout and carts in the gap are not sent specially.** They are overwritten or merged by the next poll and the versions already on them. The drawer is marked as having something to send, so its first poll on CloudKit uploads any entries written in the gap.
5. **A switched till never falls back to Shopify by itself**, even with iCloud signed out. Only the rollback, set on purpose, sends it back.
6. **The rollback is local to each iPad (item 16).** The page tells the person to do every till. A till on Shopify storage while the others are on iCloud sees an old copy.
7. **After a rollback the till does not move again until "Use iCloud again" is pressed**, even though the import is still done.
8. **Only a till in the shop's share moves.** One that never joined stays on Shopify.
9. **The poll is not retired.** CloudKit's push needs a subscription and a silent-push entitlement in Swift. Until that exists the 25 second poll reads CloudKit, as it read Shopify.

## Shared secrets and pass codes (0224)

Each is a guess, change any you disagree with.

1. **What is shared:** the Shopify login (domain, client id and client secret as one secret), the pass, claim and receipt secrets, the assistant key, and each cashier's pass code. Nothing else in the Keychain.
2. **One record per secret, named `secret-<name>`**, with the value in one encrypted `secure_json` field and three plain labels: `name`, `registerId` and `at`. The Shopify login is one record so its three parts can never be mismatched.
3. **Same switch as card details.** Nothing is sent or read until `setSaleCardMode('encrypted')`, which waits for T85.
4. **The join uses a remembered fingerprint per secret** (a 24 character hash, kept in the Keychain as `pos.secretsBase`, never the secret). One side changed: that side wins. Both changed, or they never agreed: **the shop's value wins** and the run reports a conflict. I chose this over "newest wins" because it does not depend on any iPad's clock. It can lose an edit, and no screen tells the person yet.
5. **A removal is never sent.** Signing out of Shopify on one till does not sign out the others. A register that removed a secret keeps it removed until the shop's value changes.
6. **Nothing deletes a secret record.** A removed cashier's encrypted pass code stays in the shop's zone, and in the copies already taken. This is a gap you may want closed with a tombstone later.
7. **A shop record this device cannot read is skipped,** never treated as missing and written over.
8. **Pass codes sync so any iPad can print or send a pass again.** Before, only the iPad that issued it could. StaffPass still checks the code against the staff hash before showing it.
9. **The secrets are in the 6e export** (O5), as the export plan said. The zip is as sensitive as the Shopify login.
10. **Taking a Shopify login goes through `saveCreds`,** which normalises the domain and drops the cached token. The next run may send the normalised form once before it settles.

## Change pushes (0225)

Each is a guess, change any you disagree with.

1. **The 25 second tick stays.** The pushes make reads faster and do not replace the tick, because iOS can delay or drop silent pushes and never wakes a force-quit app. Slow or remove the tick only after T111.
2. **Both databases are always subscribed,** with fixed ids (`aidens3dp-private-changes`, `aidens3dp-shared-changes`). A joined till hears the owner's changes through the shared database, and an owner hears its own through the private one. Subscribing both avoids asking which role this iPad has.
3. **Silent only.** The subscription carries `shouldSendContentAvailable` and no alert, sound or badge, so nothing asks the person for permission and nothing appears on screen.
4. **Subscribe from the existing tick,** once a till is on CloudKit, rather than at launch. It costs nothing once listening, and a till that moves later starts listening without a restart. The first read after a move is therefore by the tick.
5. **A push reads only the shop's shared records** (`pollShared`), not the outbox or saved carts.
6. **At least 2 seconds between push reads.** A burst becomes one read now and one later, reads never overlap, and a push that arrives during a read earns exactly one more.
7. **Expo's `appDelegateSubscribers`** receives the push, so nothing is written into the generated AppDelegate for it.
8. **`aps-environment` is `development` in the plugin,** and an existing value is kept. A distribution archive is expected to carry `production`; check on the first TestFlight build.
