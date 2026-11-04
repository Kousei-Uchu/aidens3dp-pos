# CloudKit sync: decisions, status and roadmap

Aiden’s 3D Printing POS · updated 4 November 2026 · checked against `main` at commit 6f9a763 (patch 0226), then updated for patch 0227. Parts 1 and 2 were re-audited against the code and the GUESSES, PROGRESS and DEVICE_TESTS docs in patch 0221; patches 0222 to 0225 were folded in by patch 0226; patch 0227 (joined tills) is folded in by itself

This replaces the 31 October decisions doc. Nothing from that doc has been dropped: every decision, question, answer and note is in Part 3, with the original numbering (items 1 to 27, Q1 to Q14, N1 to N3, O1 to O5), so existing cross-references still work. Parts 1 and 2 are new. They say where the work is up to and where it is going.

Tags used throughout: **Sync** (goes to iCloud and is shared between registers), **Local** (stays on the device), **Open** (not settled yet).

## Part 1. Where we are

### In one paragraph

Patches 1 to 3 (entitlements and the native module, the zone and share, and the backend seam) were done before the decisions. Since the 31 October doc was written (patch 0181), patches 0188 to 0227 have landed. They finish most of patch 4 (sales, events and payment attempts), patch 5 (saved carts), patch 6b (the shared drawer), patch 6a (the wider shared settings, the cash and refund notices, the logo, the grid layout and the Square history months) and patch 6c (training progress and the audit log), they add the in-app iCloud note and the drawer audit, and they finish patch 7 (the migration lease 0212, the import runner 0213, the count check 0214, the wiring 0215 and the screen section 0216), the two leftovers (resolving another register's payment 0217, creating a missing Shopify order 0218), the owner-only export (6e, 0219) and the switch (patch 8, 0220). After a docs audit (0221, 0222) and the loan in the float report (0223), they add the encrypted secrets and cashier pass codes (6d, 0224, switched off) and the change pushes (8b, 0225, which do not retire the poll), and 0227 makes a joined till use the owner's zone in the shared database instead of an empty zone of its own (gate 4, below). **The code is complete but not live in practice.** Every register still runs on Shopify metaobjects until an owner iPad presses **Set up sync** and the import finishes and passes its count check. Only then does each till in the shop's share move itself to CloudKit on its next poll (about 25 seconds). Nothing starts the import automatically. Three changes already affect the Shopify path today: saved-cart merging (0204), the safe settings reader (0205) and the loan lines in the float report and the assistant's cash view (0223).

### Four things gate turning CloudKit on

1. **The Swift has never been compiled or run.** Every patch since 0192 says so. It needs a Mac build in Xcode, and nothing has touched a real CloudKit zone.
2. **The two-Apple-ID encryption test (O4, device test T85).** Waits for a second Apple ID and iPad. Until it passes, sale card details are not written at all (the `omit` switch, below), and the encrypted secrets and pass codes (patch 6d, built in 0224) and the assistant audit log (0211) are not sent or read either, because they use the same switch.
3. **The real-shop run of T102 to T109.** Patch 8 (0220) is built: the rollback flag, the move and the gap send exist, and a till moves to CloudKit by itself once it sees the import `done`. What is missing is proof on a real shop. The only brake today is that the import does not start until an owner presses **Set up sync**, so do not press it until T102 to T105 have passed. The change pushes (8b, 0225) are written but the 25 second poll stays as the fallback, so they are not a gate on moving; T111 only decides whether the tick can later be slowed or retired.
4. **Joined tills used the wrong zone (found by reading the Swift in 0225; fixed in code in 0227, not compiled, not yet seen on a device).** Before 0227 every record call in `CloudKitSyncModule.swift` went through `database()`, which always returned the private database, and built its zone ID as `CKRecordZone(zoneName: "Store")`, which is owned by the current Apple ID. A joined iPad would therefore have read and written its own empty private zone, and only the owner iPad would have worked. In CloudKit a joined till finds the owner's zone in the shared database under the owner's own zone ID. **As built (0227):** `resolveStore()` looks for `Store` in the private database (this iPad is the owner) and then in the shared database (it is a participant, and it keeps the zone ID CloudKit listed). `database()` and `storeZoneID` read that answer, and every function that reads or writes a record resolves it first. Only creating the zone, the share link and the owner check still name the zone under the current Apple ID. It is looked up again after a join, after setting up as owner, when the Apple ID changes and each time the Cloud sync page reads the state. **Still to do:** compile it on the Mac and run T112 (a joined till writes to the owner's zone and reads it back) right after T74. Do not move a second till until T112 passes.

### The card-field switch

`setSaleCardMode('encrypted' | 'omit')` (0194, 0195) defaults to **omit**. In that state the card details of a sale are left out of CloudKit entirely and are never written as plain fields. Turning on `encrypted` is one argument, and it should only be turned on after T85 passes. This is the build-behind-a-switch approach suggested under O4. It is still your suggestion-from-me rather than something you have explicitly agreed, so it is listed in Part 2 under things to confirm.

## Part 2. What has been built, and where we are going

### 2.1 Patch ledger, 0188 to 0227

All of these were requested by you, in order. Patch 0226 (the docs catch-up) is a docs and help patch and is not in the table. “Pure code” means no native code and no behaviour change.

| Patch | Date | What it did | Status |
|---|---|---|---|
| 0188 | 31 Oct | **Loans to the drawer.** Paid in has a loan switch, the shift remembers `loanCents` owed back, Take loan back, a confirm on closing with a loan owed, Z-report line. | Live today (not CloudKit-dependent). The daily float report and the assistant’s cash view mention the loan since 0223. |
| 0189 | 31 Oct | The 31 October decisions written into the repo: `dev_docs/CLOUDKIT_SYNC_DECISIONS.md`, plan section 5 rewritten, help page and two store comments corrected. | Docs and comments only. |
| 0190 | 31 Oct | **6b first half.** The drawer as records (`src/lib/drawerRecords.ts`): shift as `drawer-shift`, each ledger entry as `ledger-<id>`, counts replayed from entries oldest first. | Pure code. |
| 0191 | 31 Oct | **Drawer checkpoint** (`src/lib/drawerCheckpoint.ts`): `drawer-checkpoint` holds counts at a point and the server stamp of the newest entry it covers, so counts stay right past 1000 entries. | Pure code. Working assumption, not yet confirmed by you. |
| 0192 | 31 Oct | **6b second half.** The drawer transport (`drawerCloud.ts`) and the Swift functions for the shift, ledger entries and checkpoint; `upsertRecord`, `putRecordOnce`. `sync.ts` branches to it only when the CloudKit backend is active. | Swift uncompiled. |
| 0193 | 31 Oct | **Every record write updates in place** (`upsertRecord`). Fixes a bug that would have made a second write of the same sale, rollup, cart, settings, layout, Square history or migration record fail. | Swift uncompiled. Fields a later write leaves out stay as they were. |
| 0194 | 31 Oct | **4, first half.** A sale as a CloudKit record (`saleRecords.ts`): plain fields, one encrypted `secure_json`, customer never written (only the Shopify id), `CardMode` switch defaulting to `omit`. | Pure code. |
| 0195 | 31 Oct | **4, second half.** `putSale` with encrypted values in the Swift; the backend reads encrypted keys back by name and still shows the sale when this device cannot read them. Two Swift guards keep encrypted keys out of plain fields. Device test T85 written out. | Swift uncompiled. Card mode is `omit`. |
| 0196 | 31 Oct | **4, third piece.** Events and payment attempts as records (`eventRecords.ts`): `event-<id>` (register id plus a hash of the CSV row), `attempt-<sale>-<ref>` (status only moves forward), `resolve-<sale>-<ref>` (write-once, so the first resolution wins by construction). Combined CSV builder. | Pure code. |
| 0197 | 31 Oct | Events and attempts through the native module (`eventCloud.ts`, `putEvent`, `putResolution`, `putAttempt` and the readers). Device test T86. | Swift uncompiled. |
| 0198 | 31 Oct | **Event call sites.** Every `events.csv` row is also written to CloudKit once, with one timestamp shared by the row and the id. A once-per-launch catch-up uploads whatever CloudKit lacks, which is the one-off upload after joining (Q13). T87. | Inactive until patch 8. |
| 0199 | 31 Oct | **Attempt call sites** in `Pay.tsx`. The app changes its own copy first, then tells CloudKit. A catch-up sends every attempt the register holds. If another register resolved the same payment first, an info notice names who. T88. | Inactive until patch 8. |
| 0200 | 31 Oct | **Attempt pull.** Every register reads all registers’ attempts into an in-memory `sharedAttempts`; an `unknown` attempt another register resolved is marked resolved here with a local info notice. Diagnostics gained “Card payments waiting (all registers)”, read only. T89. | Inactive until patch 8. |
| 0201 | 31 Oct | **Events read back and the combined CSV.** Cloud sync page has an **Export all events** button (managers and owners, off in practice mode, shown only when CloudKit is active). T90. | With this, patch 4’s code is complete. |
| 0202 | 2 Nov | **The in-app iCloud note** on the Cloud sync page (`icloudNote.ts`): nine kept blocks, a never-kept list, two warnings. Help page updated. T91. | No behaviour change, nothing is sent. |
| 0203 | 2 Nov | **Drawer audit** (item 6). Found one real gap: smart change and the assistant’s drawer snapshot sized the “typical day” from this register’s sales only. They now use every register’s. Stale “each iPad has its own drawer” wording fixed across the Cash help pages. T92. | Live today. |
| 0204 | 2 Nov | **Patch 5, saved carts with conflict merging** (`savedMerge.ts`): a delete beats an edit, three-part merge (name and note, assignment, contents) against a shared base, one bad record no longer aborts the pull, the pull reads every page. T93. | **Live today on Shopify too**, because carts already ran through the seam. |
| 0205 | 2 Nov | **6a, first piece.** The wider shared settings (`sharedSettings.ts`): shop name, receipt details, the two server addresses, auto-receipt, smart change, consolidate and the assistant connection, read safely and merged per key, with staff merged person by person. A 1.5 s watcher sends edits. T94. | On Shopify the record is still the original seven keys, now read through a whitelist. The new keys are CloudKit only. |
| 0206 | 2 Nov | **6a, second piece: the cash and refund notices** (`noticeShared.ts`, `cloudkit/noticeCloud.ts`, `cloudkit/noticeSync.ts`). Each is a write-once `notice-<register>-<id>` record, sent when raised and caught up once per launch, and taken in by the other registers unread, labelled **From** the register that raised it. Reading or clearing stays per iPad (a device-only `noticesSeen` list stops a cleared one returning). A week's age limit, 50 at a time. T95. | Swift uncompiled. Inactive until patch 8. |
| 0207 | 2 Nov | **6a, third piece: the logo** (`logoShared.ts`, `cloudkit/logoCloud.ts`, `cloudkit/logoSync.ts`, `logoFiles.ts`). The uploaded logo image (Settings ▸ Screensaver & display) is one `logo-current` record with the image as a CloudKit asset and plain fields (hash, type, size, who, when). Each poll compares this register's logo with the shop's against a device-only `logoBase`: a change made here is sent, a change made elsewhere is taken, a removal goes both ways, and a downloaded image is checked against its hash before it replaces anything. The https link stays per device. T96. | Swift uncompiled. Inactive until patch 8. |
| 0208 | 2 Nov | **6a, fourth piece: the grid layout** (`gridMerge.ts`, `reconcileLayout` in `sync.ts`). On CloudKit two registers' layout edits are joined page by page against a device-only `gridBase` instead of the last writer replacing the whole grid, and the version counter is no longer used to tell what is newer (item 27). A layout edited offline is sent at the next poll. No native code changed (layout already went through `putLayout` and `getLayout`). T97. | Inactive until patch 8. On Shopify the counter is unchanged. |
| 0209 | 2 Nov | **6a, fifth and last piece: the Square history months** (`squareHistoryShared.ts`, `cloudkit/squareCloud.ts`, `cloudkit/squareSync.ts`, `squareHistorySyncIO.ts`). The imported history is shared one month at a time: each month file is one `squareshard-<month>-<id>` record with the packed file as a CloudKit asset, and one `square-manifest` record lists them. Each register compares every month with the shop's against a device-only `squareBase` (the file hash here and the shared id both last agreed on), so a month is sent, taken, or removed on both sides, and a month is only deleted on a register that had not changed it since. The manifest is replaced only if it is still at the change tag that was read, so two registers writing at once cannot drop each other's months. **The copy in iCloud has every customer's name, email and phone removed**, because the history files hold them and the plan says none reach CloudKit. Swift: four new functions, uncompiled. T98. | Inactive until patch 8. |
| 0210 | 2 Nov | **6c, first half: training progress** (`trainingShared.ts`, `cloudkit/trainingSync.ts`, merge rules in `trainingProgress.ts`). One `training-<staff id>-<module id>` record per person per module, read and joined with this register's once per poll, and only the records that differ are written back. Work from two registers is kept (stages from either, earliest finish). A reset counts up an `epoch`, and the higher count wins whole, so a reset beats older work on another register. Owners reset anyone and managers reset cashiers (O1), from a new section on **More ▸ Training**. Nothing is sent during a practice run. Swift: two new functions, uncompiled. T99. | Inactive until patch 8. |
| 0211 | 2 Nov | **6c, second half: the audit log** (`auditShared.ts`, `cloudkit/auditCloud.ts`, `cloudkit/auditSync.ts`, `auditHook.ts`). Each assistant log event is one `audit-<register id>-<event id>` record, written once by the register that made it. The whole event is in one encrypted `secure_json` field; only the register, day, time and kind are plain. **Nothing is sent until the encrypted switch is on**: it follows `setSaleCardMode`, so one flip after T85 turns on sales' card details and the audit log together. Each launch sends the register's own log once (Q13); the log's append hands each new event over live. A manager can choose **All registers** in the conversation log viewer to read the others' events. The local log stays the safety copy and is unchanged. Swift: three new functions and an `Audit` entry in the encrypted-key list, uncompiled. T100. | Inactive until patch 8, and sends nothing until the switch is on. |
| 0212 | 2 Nov | **Patch 7, first piece: the migration lease** (`migrationLease.ts`, `cloudkit/migrationCloud.ts`). One `migration-v1` record says which owner iPad is running the one-off import, which of six phases (settings, drawer, layout, carts, sales, rollups) it is in, a cursor inside the phase, and the counts imported so far. Every write is checked against CloudKit's change tag, so two owner iPads that both try to start cannot both win, and an iPad that has been replaced finds out on its next write and stops. A holder that has not written for two minutes is replaced and the new holder carries on from the stored phase and cursor. Quiet is judged on the watcher's own clock (how long a tag has stayed the newest one it can see), so a wrong clock on any iPad cannot make a live holder look dead. Only the owner can run it, a participant only waits and sees `done`. `done` can only be written from the last phase and with a `verified` flag. The old unconditional `putMigration` was removed. Swift: `putMigrationIfUnchanged` and a `getMigration` that returns the change tag, uncompiled. T101. | Inactive until patch 8. Nothing calls it yet: the import runner is the next piece. |
| 0213 | 2 Nov | **Patch 7, second piece: the import runner** (`migrationImport.ts`, `cloudkit/migrationRun.ts`). Under the lease, `runMigration` copies Shopify into CloudKit one phase at a time, in the lease's order: settings, drawer, layout, saved carts, sales, rollups. Shopify lists are read 100 rows at a time and each page is followed by a lease write that carries the page cursor and the running count, so it is also the heartbeat and a takeover carries on from the next page with the right count. Every copy is an upsert or a write-once record, so repeating the tail of a phase does nothing twice. Rows are keyed by their own field (`sale_uuid`, `cart_uuid`, `rollup_key`, `settings_key`), not by Shopify's rewritten handle, and a row with no usable key is skipped and not counted. Settings and layout already in CloudKit keep their version if it is strictly higher (plan section 6, step 6). **The drawer** is turned from Shopify's one blob into a write-once record per ledger entry (oldest first, in chunks), a starting checkpoint holding the shop's counts (because Shopify's counts are not always the replay of its latest 1000 entries), and `drawer-shift`. A runner that has been replaced stops at its next lease write and writes nothing more, and never marks the new holder's run failed; any other error is written as `failed` so the next owner iPad carries on at once. The runner stops after the last phase **without** marking the import done: the count check and `completeMigration` are the next piece, so nothing can switch over on the strength of this alone. Pure code, no native changes. | Inactive until patch 8. Nothing calls it yet: the count check and the "Setting up sync" screen are next. |
| 0214 | 2 Nov | **Patch 7, third piece: the count check** (`cloudkit/migrationVerify.ts`). `verifyImport` compares Shopify with CloudKit phase by phase, reading only: every key the runner should have written (the runner's own rules, so unkeyable rows are left out of both sides) must be present in CloudKit, extra CloudKit records are not a fault, and the drawer must have every ledger entry, the shift when Shopify had one, and the shop's counts reading back equal. `completeImport` marks the run `done` only when every phase passes. A shortfall rewinds the run to the earliest short phase, records `Count check failed: sales 229 of 230.` as the reason and marks it failed, so the next owner iPad repeats only from there. A lease lost during the check, or a read error, never marks anything done; a long check writes heartbeats so it keeps the lease. `runImport` is the whole import: run the phases, then check and complete. Pure code, no native changes. | Inactive until patch 8. Nothing calls it yet: the wiring to the real backends and the "Setting up sync" screen are next. |
| 0215 | 2 Nov | **Patch 7, fourth piece: the wiring** (`cloudkit/migrationControl.ts`, one instance `migrationControl` in `sync.ts`). One object with `view()` (the plain sentence, running, phase and count, can-start, done, the last outcome), `start()`, `stop()` and `subscribe()`. `start()` is refused with a reason and no write unless this iPad is the owner, is not in a practice run, and is not already running (the guard is taken before any wait, so a double press cannot start two). It makes sure both backends' storage exists, then runs `runImport` with Shopify always read through the metaobject backend and CloudKit written through the CloudKit backend, whichever the app is using. A failure to start becomes a sentence, not an exception. `stop()` ends a run at its next page and leaves the lease to lapse. Both backends and the native module load on demand. Pure code except the one instance; nothing calls `start()` yet. | Inactive until patch 8. T102 and T103 can now be run from a debug console with `migrationControl.start()`. The "Setting up sync" screen is next. |
| 0216 | 2 Nov | **Patch 7, last piece: the "Move the shop to iCloud" section** on the Cloud sync page (`migrationPanel.ts`, `screens/CloudSync.tsx`). Shown to any till in the shop (owner or participant). It reads the lease when the page opens and every five seconds, and redraws as the import reports progress. The owner sees what the setup does and one button, Set up sync (Carry on setting up sync after a stop, a failure or a short count), plus Stop while it runs; a participant sees only the state. The practice-mode and owner-only rules are the controller's and the words are all in the pure `migrationPanel`, tested in Node. Nothing starts the import except that button. **Patch 7 is now complete in code.** | Safe to ship: the app still reads and writes Shopify, and the import only copies. Switching to CloudKit is patch 8. |
| 0217 | 2 Nov | **Item 9 leftover: resolving another register's payment from a different register** (`attemptShared.ts`, `cloudkit/attemptSync.ts`, `screens/Diagnostics.tsx`). On the Diagnostics page, each row of "Card payments waiting (all registers)" that has no result yet and belongs to another register gets **Charged** and **Not charged** buttons. Each asks first, then `attemptSync.resolveElsewhere` writes only the write-once resolution (the attempt keeps the register that wrote it), so the first resolution wins and a second register is told who won. The owning register hears about it through the pull that already exists (0200), with its local notice. The resolving register logs an `unknown_resolved` event naming the other register. A `started` payment is never offered, because it may still be charging, and nothing is added to the other register's sale. | Inactive until patch 8, like the rest of patch 4. T106. |
| 0218 | 2 Nov | **Item 8 leftover: another register creates a missing Shopify order** (`orderRecovery.ts`, `cloudkit/orderRecoverySync.ts`, `sync.ts`). With CloudKit on, the outbox now writes the sale to CloudKit first (a new `early` step, before the receipt and the order, for sales only and never in practice mode), so a sale from an iPad that died is findable. Every ten minutes, a register with Shopify credentials reads the newest 500 sales, picks those with no order, older than 15 minutes and not in its own queue, claims each with a write-once record (`order-<sale>-<n>` in the resolution records, using fields that already exist), and runs the sale through the same outbox steps (order, gift cards, receipt, CloudKit record, totals). Three sales per run at most. The first claim wins; a claim over half an hour old is treated as abandoned and the next number is tried. A sale that sold or was paid with a gift card is not finished from here (its code is only in iCloud when encryption is on) and a notice says so once. | Inactive until patch 8. T107. |
| 0219 | 2 Nov | **Patch 6e: the owner-only CloudKit export** (`cloudkit/exportAll.ts`, `cloudkit/exportAllIO.ts`, `screens/CloudSync.tsx`) (N3, O5). On the Cloud sync page an owner sees **Back up everything**, which asks first, then reads every list the CloudKit module has (sales, rollups, saved carts, settings, layout, Square history records, cash drawer movements, events, payment attempts and resolutions, notices, training progress, the assistant log) and the single records (drawer shift and checkpoint, the import record, the logo record, the Square manifest), and writes one zip of JSON in a dated folder, with a manifest of counts, a README about how private it is, and the logo picture when it can be read. It is then handed to the share sheet. Any list that cannot be read stops the whole export and names itself, so a backup never quietly leaves something out. Not offered to participants, off in a practice run. **Also in this patch, corrections to my earlier patches** (see PROGRESS): 0216's panel read a step name from a failure that has none and the Cloud sync page used the store without importing it; and the migration's and the missing-order job's direct handles on the two backends now live in `cloudkit/lazyBackend.ts` where the write checks the same practice-mode guard as the seam (the audit in `demoguard.test.ts` caught the first version). | Works before patch 8: it reads CloudKit directly. T108. |
| 0220 | 2 Nov | **Patch 8: the switch** (`backendChoice.ts`, `cloudkit/backendSwitch.ts`, `cloudkit/backendFlagIO.ts`, `App.tsx`, `sync.ts`, `screens/CloudSync.tsx`). **Decided: cut over in one go, no dual-write.** The `cloudkit.backend` flag stays local to each iPad (item 16): `force_meta` is the rollback, `cloudkit` means this till has moved and stays there, unset means Shopify. At start-up `App.tsx` installs the backend the flag says. On every poll, before anything else, a till on Shopify that is in the shop's share and sees the import `done` writes the flag, installs CloudKit, marks its drawer as having something to send, sends its own sales finished since the import began that CloudKit does not have (the gap, through the queue's own idempotent entry and totals steps, once, remembered in `cloudkit.caughtUp`), and says so. A failed gap send leaves the till on CloudKit with the catch-up undone and the next poll tries again. A till never falls back to Shopify by itself, even if iCloud is unavailable, because it would then write where the others no longer read. The Cloud sync page shows where this till keeps shared data, with **Go back to Shopify storage** (confirms, local, tells the person to do every till) and **Use iCloud again**. Practice mode never switches and cannot change the flag. **Not done: retiring the 25 second poll.** CloudKit push needs a Swift subscription and a silent-push entitlement that I cannot build or test here, so the poll now reads CloudKit and stays (see 8b). | This is the patch that moves tills. Do it only after T102 to T105 pass on a real shop. T109. |
| 0221 | 3 Nov | **This doc re-audited against `main` at 0220.** Fixed what the per-patch edits had left stale: the summary and gating list no longer say nothing selects the CloudKit backend, item 9 and item 11 match the code, patch 7 is complete in code, T106 to T109 are listed, the `Audit` and `Migration` dashboard steps are added, and assumptions for 0210 to 0220 are written. **One claim corrected rather than carried:** the write queue for other registers during the import was never built (see the known gaps). | Docs only. |
| 0222 | 3 Nov | **Plan, GUESSES and help corrections.** `CLOUDKIT_SYNC_PLAN.md` section 6 (the lease has no stored expiry since 0212, the step 5 write queue was never built, the settings field is `version` not `sharedVersion`), GUESSES 0213 item 6, and `help/settings/index.md`, which still called Smart change register-only. `help/help.json` rebuilt. | Docs and help only. |
| 0223 | 3 Nov | **Loans in the float report and the assistant's cash view.** `recommendFloat` takes an optional `loanOwed`, the Daily float report passes it and adds a note when a loan is owed, and the assistant's `cash_drawer` and `cash_calculator` results gain `loan_owed_back`. **Not done on purpose:** the suggested float is not reduced for the loan, because the ledger cannot tell which notes are the loan. | Live today (not CloudKit-dependent). 5 new tests. |
| 0224 | 3 Nov | **6d: encrypted secrets and cashier pass codes** (`secretsShared.ts`, `cloudkit/secretCloud.ts`, `secretSync.ts`, `secretSyncIO.ts`). One `Secret` record per secret (`shopify` as one packed login, `pass`, `claim`, `receipt`, `assistant`, `badge.<staff id>`), value in one encrypted `secure_json`, three plain labels. Joined per secret by `mergeSecret` (one side changed, that side wins; both changed, the shop wins and the run reports it; a removal is never sent). Part of the 6e export. Swift: `putSecret`, `listSecrets`. **Never run on a device, Swift not compiled, and nothing is sent or read until `setSaleCardMode('encrypted')`.** T110. | Switched off. |
| 0225 | 3 Nov | **8b: change pushes** (`startSubscriptions`, `CloudKitPushSubscriber.swift`, `cloudkit/pushPoll.ts`, `aps-environment` in the plugin). A silent subscription on the private and the shared database; a push becomes one coalesced `pollShared`. **Never run on a device, Swift not compiled. The 25 second poll is NOT retired.** Needs Push Notifications on the App ID or the build does not sign. Reading the Swift for this patch is how gate 4 was found. T111. | Inactive until a till is on CloudKit. |
| 0227 | 4 Nov | **Gate 4: joined tills use the owner's zone** (`CloudKitSyncModule.swift`). `resolveStore()` finds `Store` in the private database (owner) or in the shared database (participant, keeping the zone ID CloudKit listed); `database()` and `storeZoneID` follow it; every record function resolves first; the owner-only create, share link and role check keep the owner's own zone name; the answer is forgotten after a join, a set-up and an Apple ID change, and re-read each time the Cloud sync page asks. No JavaScript changed. **Never run on a device, Swift not compiled.** New source-reading tests in `tests/cloudkitswift.test.ts`, device test T112. | Needed before any second till can move. |

### 2.2 Build status of each decision

“Built” means the code exists and is tested; none of it is live on CloudKit until patch 8.

| Item | Decision | Build status |
|---|---|---|
| 1 | Staff with PIN and badge hashes sync | Built (0205), merged person by person. A removed person stays removed. |
| 2 | Staff display settings sync | Built. They already travelled with the staff entry, so nothing more was needed. |
| 3 | Receipt profile and receipt server URL sync | Built (0205). The receipt secret syncs as an encrypted secret since 0224, behind the encrypted switch. |
| 4 | Inventory prefs local | Nothing to build. |
| 5 | Fees, cash rounding, Require PIN sync | Already in the original seven shared keys. |
| 6 | One shared drawer | Built (0190 to 0192), audited (0203). Swift uncompiled. |
| 7 | Bookkeeping fields local | Nothing to build. `sharedBase` was added as a new device-only key in `DEVICE_KEYS` (0205). |
| 8 | Outbox local; another register can create a missing Shopify order (Q11) | Outbox unchanged. **Built (0218):** the sale goes to CloudKit early, and another register can find sales with no Shopify order and create it after a write-once claim. |
| 9 | Payment attempts sync with the register name; first resolution wins | Built (0196 to 0200). **Resolving another register’s payment from a different register: built (0217)** on the Diagnostics page, for an `unknown` attempt only, never a `started` one. |
| 10 | Cash and refund notices sync | Built (0206). Reading or dismissing stays per iPad. Swift uncompiled. |
| 11 | `pos.shared` becomes a CloudKit-fed cache | No separate build. `pullSalesHistory` in `sync.ts` reads through the backend seam, so once a till has moved (0220) the same throttled pull is fed from CloudKit and `pos.shared` stays a local cache. Not yet seen running on CloudKit. |
| 12 | Events sync, combined CSV on demand, local CSVs unchanged | Built (0196 to 0201). |
| 13 | Assistant audit log syncs, encrypted | Built (0211): one record per event, content in one encrypted field, sent only once the switch is on. A manager reads every register's events under **All registers** in the viewer. Swift uncompiled. |
| 14 | Logo syncs as an iCloud asset | Built (0207): the uploaded image, as a CKAsset on one record. The receipt and the screens that show the business logo still use the fixed shop link (see GUESSES, 0207). Swift uncompiled. |
| 15 | Training progress syncs; owners and managers can reset | Built (0210): joined per person per module, reset by `epoch`, reset screen on More ▸ Training. Swift uncompiled. |
| 16 | `cloudkit.backend` flag local | **Built (0220).** `force_meta` is the rollback, `cloudkit` means this till has moved, unset means Shopify. The poll sets it when the import is done; the Cloud sync page has the way back. |
| 17 | Card fields encrypted, amounts plain | Built behind the `omit` switch (0194, 0195). Cross-Apple-ID test (O4, T85) not run. |
| 18 | Staff name, notes, reasons and price adjustments on sales sync | Built (0194). Free-text notes stay plain, the known minor exception. |
| 19 | Shop name | Built (0205). |
| 20 | Pass and gift claim URLs | Built (0205). The pass and claim secrets sync as encrypted secrets since 0224, behind the encrypted switch. |
| 21 | Auto-receipt | Shared (0205), but **no screen edits it today**, so sharing it changes nothing yet. |
| 22, 24, 25, 26 | Local | Nothing to build. |
| 23 | Smart change and consolidate | Shared (0205). `help/settings/payments.md` already says smart change is this register only until Cloud sync is switched on, then every register. **Re-checked in 0226:** the Settings screen text, `help/settings/payments.md` (the "how to" line), `help/settings/index.md` (fixed in 0222), `help/settings/cloud-sync.md` and the shop-wide line in `help/cash/smart-change.md` already say it correctly. Three places still said otherwise and were fixed in 0226: the "Turning it on" line in `help/cash/smart-change.md` ("this iPad only"), the "What each choice affects" line in `help/settings/payments.md` ("a per-register preference") and the heading "Each iPad has its own" above a paragraph in `help/cash/index.md` that says there is one drawer. Consolidate has no scope wording on the Settings toggle or in `help/sales/index.md`; that is not wrong, only silent. |
| 27 | Grid version counter | Built (0208) for CloudKit: joined by page against `gridBase`, no counter. The Shopify path still uses it. |
| N1 | Secrets and pass codes sync, encrypted | **Built in code (0224, 6d), gated on O4 and not run on a device.** Nothing is sent or read until `setSaleCardMode('encrypted')` is on. One `Secret` record per secret (`shopify` as one packed login, `pass`, `claim`, `receipt`, `assistant`, and `badge.<staff id>`). The join per secret is `mergeSecret`: one side changed, that side wins; both changed or never agreed, the shop wins and the run reports a conflict; a removal on one register is never sent and stands until the shop's value changes. |
| N2 | Audit log is the customer-data exception | Written into the in-app note (0202). |
| N3, O5 | Owner-only CloudKit export, one zip of JSON | **Built (0219).** This is different from the events CSV export in 0201. |
| Q13 | Each register uploads its own local-only data once after joining | Done for events (0198) and attempts (0199) by their catch-ups. Training progress is joined at every poll (0210), so it needs no separate upload. The audit log's catch-up (0211) is the one-off upload and waits for the encrypted switch. So every kind of local-only data already has its one-off upload. The migration lease (0212), the import runner (0213) the count check (0214), the wiring (0215) and the screen section (0216) are built. |
| O2 | Assistant connection settings sync | Built (0205). The log cap and data gate stay per iPad, and the API key syncs as an encrypted secret since 0224, behind the encrypted switch. |
| O3 | CloudKit keeps every ledger entry; app loads the latest 1000 | Built with the checkpoint (0191, 0192). |

### 2.3 Where we are going

The patch plan from the 31 October doc, updated with what has landed. Patches are small, one concern each, and the order below is the working order.

| Patch | Scope | Status |
|---|---|---|
| 1 to 3 | Entitlements and Swift module, zone and share and account screen, backend seam | Done before 31 October. |
| 4 | Sales and rollups with encrypted card fields, payment attempts, events | **Code complete** (0194 to 0201). Gated on the Swift build, T85 and the `encrypted` switch. |
| 5 | Saved carts with conflict merging | **Done** (0204). Soft lock and atomic compare-and-set not built. |
| 6a | Settings, staff, shop and receipt settings, logo, shared notices, layout, Square history shards | **Done** (0205 settings, 0206 notices, 0207 logo, 0208 layout, 0209 Square history months). Swift uncompiled. |
| 6b | The shared drawer | **Done** (0190 to 0192, 0203). |
| 6c | Audit log (encrypted) and training progress | **Done** (0210 training progress, 0211 audit log). Swift uncompiled. |
| 6d | Encrypted logins, secrets and cashier pass codes | **Built in code (0224), switched off.** Needs the Swift built on a Mac, T85 (two Apple IDs) and T110 before `setSaleCardMode('encrypted')` is turned on. Also in the 6e export (`secrets` file). |
| 6e | Owner-only CloudKit export (one zip of JSON), or fold into 8 | **Built (0219).** Gated on nothing; T108. |
| 7 | Migration lease, checkpoints and verification, plus each register’s one-off upload of local-only data (Q13) | **Complete in code.** The lease (0212), the import runner with its phases and checkpoints (0213) the count check that marks the import done (0214), the controller wired into `sync.ts` (0215) and the screen section (0216) are built. The one-off uploads of local-only data are already done by the catch-ups (events, attempts, audit log) and the poll (training). Still to do: run T102 to T105 on a real shop. |
| 8 | Retire polling, add the rollback flag, decide dual-write or cut over | **Built in code (0220), except retiring polling.** Cut over in one go; the flag, the move and the rollback are done. T109. |
| 8b | Push-driven change callbacks (CloudKit subscriptions) so the 25 s poll can be retired | **Built in code (0225), never run on a device, Swift not compiled. The poll is NOT retired.** A silent database subscription on both the private and the shared database (`startSubscriptions`), a `CloudKitPushSubscriber` that turns the push into the `onRemoteChange` event, `pushPoll.ts` that turns pushes into one coalesced `pollShared`, and `aps-environment` in the plugin. The 25 second tick in `App.tsx` stays as the fallback because iOS may delay or drop silent pushes. Retire or slow the tick only after T111 shows pushes arriving reliably. Needs Push Notifications enabled on the App ID, or the build does not sign. |
| 8c | Joined tills use the owner's zone (gate 4) | **Built in code (0227), Swift not compiled, never run on a device.** Gated on the Mac build and T112. |

**Next up:** build on the Mac, join a second iPad (T74) and run T112 first, because a joined till cannot be trusted until it passes; then T102 to T109 on a real shop, in order, before any till moves. 6d is built (0224) and its secrets are in the 6e export; it stays off until the encryption test (T85) and T110 pass. 8b is built (0225) and speeds up reads with change pushes but keeps the 25 second tick; slow or remove the tick only after T111. The two smaller leftovers are built: resolving another register's payment (item 9, 0217) and creating another register's missing Shopify order (item 8, 0218).

### 2.4 Open items and things to confirm

**Still open from the decisions:** only **O4**, the cross-Apple-ID encryption test, which waits for a second device.

**Working assumptions I made that you have not explicitly confirmed.** Each is written up in `dev_docs/GUESSES.md` under the patch number. Say if you disagree with any:

- The card-field switch defaults to `omit` (0194).
- The drawer checkpoint record and its use of CloudKit’s creation stamp (0191).
- Gift card codes, gift recipients and the sale’s own receipt link go in the encrypted field with the card details (0194).
- Events and attempts are not encrypted, and a resolution is its own write-once record (0196).
- Events catch up once per launch by comparing `events.csv` with CloudKit, rather than keeping an “uploaded up to here” marker (0198).
- Another register’s resolution only takes over an `unknown` attempt, never a `started` one, and it does not add a card tender (0200).
- The events export is a button on the Cloud sync page, with a register name column and not the id (0201).
- The iCloud note is shown to everyone who can open the page, before and after joining, and describes the design rather than what is sent today (0202).
- The smart-change “typical day” now uses the whole shop’s sales (0203).
- The grid layout is joined by page, not by tile: two registers editing the same page, the later sender keeps the whole page. A page removed on either side stays removed (0208).
- The Square history in iCloud has customer name, email and phone removed, so a register that took it from iCloud shows those sales without a customer name. Removing the history on one register removes it everywhere, and a month the shop and this register both changed keeps the one with more sales (0209).
- The shared logo is the uploaded screensaver image only. A register that has just joined takes the shop's logo over its own, and keeps its own if the shop removed theirs (0207).
- Shared notices: a notice older than seven days is not sent or shown, at most 50 arrive in one read, and a notice a register has taken in is never shown again even if it was only cleared (0206).
- A delete wins over an edit for saved carts, and the merge is by three parts, not by field (0204).
- The assistant’s log cap and data gate stay per iPad. With no merge base the shop’s value wins (0205).
- Training: stages from either register are kept, a reset is a per-module `epoch` count that wins whole, and managers reset cashiers only (0210).
- Audit log: one record per event (not one per register per day), the whole event encrypted with four plain labels, nothing sent until the same switch as card details is on, and the manager's viewer reads the newest 500 on demand (0211).
- Migration: six phases with the drawer as its own, a holder is gone after two minutes judged on the watcher's own clock, a page is 100 rows, higher version wins for settings and layout, and the runner never marks the import done, only the count check does (0212 to 0214).
- Migration start: nothing starts the import by itself. Only an owner-role iPad presses the button, and the section is visible to every till (0215, 0216).
- Resolving from another register applies to `unknown` attempts only, and the charged or not-charged choice is kept in the event, not the record (0217).
- Missing-order recovery: a 15 minute wait, three sales per run, newest 500 read, gift card sales left for a person, and an order made from here has no customer name or card references (0218).
- The export reads CloudKit directly, stops whole on any failed list, leaves out the Square shard files, and is built in memory (0219).
- The switch: cut over in one go with no dual-write, a till moves on the poll rather than at relaunch, each till sends its own gap sales once, a moved till never falls back by itself, and after a rollback it stays on Shopify until **Use iCloud again** is pressed (0220).
- Shared secrets (0224): the Shopify login is one secret; every secret is one `Secret` record with the value in one encrypted field; nothing is sent or read until the same switch as card details; the join uses a remembered fingerprint, and when both sides changed **the shop's value wins** (not newest wins) and the run reports a conflict; a removal is never sent; nothing deletes a secret record; pass codes sync so any iPad can print a pass again (GUESSES, Shared secrets and pass codes (0224)).
- Change pushes (0225): the 25 second tick stays; both databases are always subscribed with fixed ids; the subscription is silent only; subscribing happens from the tick once a till is on CloudKit; a push reads only the shop's shared records; at least 2 seconds between push reads; `aps-environment` is `development` in the plugin (GUESSES, Change pushes (0225)).
- Joined tills (0227): the role is worked out by looking in the private database first and then the shared one, so an iPad that is both an owner and a participant counts as the owner; the answer is kept in memory only, never stored; a lookup that fails (offline, no account) throws instead of guessing, so a joined till never writes into a zone of its own; and a till that is neither owner nor participant keeps using the private database as before (GUESSES, Joined tills (0227)).
- Loans in reports (0223): the suggested float is not reduced for a loan owed back, the assistant gets a `loan_owed_back` field and not a longer tool description, and the float note tells the person to take the loan back first (GUESSES, Loans in the float report and the assistant (0223)). Patches 0221 and 0222 are docs only and add no assumption beyond the corrected claim already recorded in GUESSES 0213 item 6.

**Known gaps and risks:**

- Missing-order recovery (0218) reads only the newest 500 sales, makes three orders per run, and leaves gift card sales for a person. An order it makes has the customer's id but not their name and no card references, because those are not in the CloudKit sale. Two registers cannot both create an order (the write-once claim), but a claim whose register dies after creating the order and before writing the record is retried after half an hour and finds the order by its tag, so nothing doubles.

- Swift has never been compiled or run. Expect a build error or two on the first Mac build.
- Two registers changing the same attempt in the same instant could still write an older status (the status check and the write are two calls). The resolution cannot be raced this way. A server-side compare would close it.
- Saved cart saves read back and merge first, which narrows the overwrite window but does not close it, because there is no atomic compare-and-set. The soft lock is not built, and deleted carts are never tidied (the pull reads up to 1000 records).
- Two registers editing different items in one saved cart count as one part changed on both sides, so the later edit wins. Two registers editing different fields of fees, receipt details, cart warnings or the assistant connection also lose to the later writer, because each is one value.
- “Later” in the cart merge uses each iPad’s own clock.
- Event catch-up cost grows with the history, which is a few pages at a few thousand events.
- Loans (0223): the Daily float report and the assistant’s drawer and float answers now name a loan still owed back, but the suggested float still includes the loan cash, because the ledger counts notes and coins and not whose they are. The note tells the person to take the loan back first and the report then updates.
- Square history: a ticket name or line note a cashier typed is not scrubbed (the same minor exception as a note on a sale), and the history months that were replaced stay in iCloud as unused shard records, because nothing deletes them yet (0209).
- Square history: a register that imported a month through the PC and a register that took it from iCloud hold different bytes for it (the second has no customer details), so a re-import on the second sends its own copy and the shop's wins by sales count (0209).

- Import runner (0213): a Shopify row with no usable key, or with a field the CloudKit backend cannot write, is skipped or fails the run; a skipped row is not counted, and the count check (0214) applies the same rule to Shopify's side. A kept CloudKit settings or layout row with a higher version still counts as imported.
- Import runner (0213): saved carts, sales and rollups are copied with a plain upsert and no version check, which is safe only because other registers queue their writes until the import is done (plan section 6, step 5). That queueing was never built, and patch 8 (0220) did not add it. My reading of the code is that it is not needed: a till writes to CloudKit only after `backendSwitch.check()` sees the import `done`, and the owner iPad running the import is itself still on Shopify until then. Confirm this in T102 and T109 before relying on it.
- Training progress: two registers writing the same person's module in the same instant could lose one mark until the next poll, which joins them again. A reset cannot be lost this way, because the higher reset count always wins (0210).
- The switch (0220): the 25 second poll stays (8b). The rollback is per iPad, so a till rolled back while the others stay on iCloud reads an old copy until every till is done. A till that has moved never falls back by itself, even with iCloud signed out. Settings, layout and carts written in the gap between the import finishing and a till moving are not sent specially: the next poll merges them by version. A till that never joined the share stays on Shopify.
- Change pushes (0225): never run on a device, and the Swift has not been compiled. It subscribes both databases from the tick once a till is on CloudKit, so the first read after a move is by the tick, not a push. A push reads only the shop's shared records (`pollShared`), not the outbox. Silent pushes can be delayed or dropped by iOS, especially in low power mode or after a force quit (iOS does not wake a force-quit app for a silent push), so the 25 second tick is the real guarantee. The `aps-environment` entitlement is `development` in the plugin and is expected to become `production` in a distribution archive: check that on the first TestFlight build. If Expo also forwards the call to another subscriber (for example a notifications library), both complete the handler; this has not been tried.
- Joined tills (0227): never run on a device, and the Swift has not been compiled. Written from how CloudKit names a shared zone (the owner's name sits inside the zone ID), not from watching one. An iPad that pressed **Set up this till** and later joined someone else's share is treated as the owner of its own empty zone, so do not set up on the iPad that is meant to join. Each read of the Cloud sync page's state asks CloudKit for both lists of zones again.
- Secrets (0224): never run on a device, and the Swift has not been compiled. Nothing deletes a secret record, so a cashier who is removed keeps an encrypted `badge.<id>` record in the shop's zone, and every register that already took it keeps its copy until that register removes it. A removal on one register is not sent. When both sides changed, the shop's value replaces this register's and the run reports it, but no screen tells the person yet. Taking a new Shopify login saves it through `saveCreds`, which normalises the domain and drops the cached token, so the next run may send the normalised form once before it settles. A secret that this device cannot read (for example the other Apple ID in T85) is skipped, never overwritten. The export zip now contains these secrets (O5): keep it owner-only.
- Missing-order recovery (0218) and the audit log (0211) both depend on the CloudKit sale and the encrypted switch for their full effect: an order made from another register has no customer name or card references, and gift card sales are left for a person.
**CloudKit dashboard steps needed before it works on a real zone:**

- The `Logo` type is fetched by its record name only, so it needs no index. Its `asset` field must be an Asset and `bytes` and `removed` Int(64).
- The `LedgerEntry` type needs its `creationDate` and `modificationDate` sortable and queryable.
- The `Event`, `Attempt`, `Resolution`, `Notice`, `Training` and `Audit` types need `modificationDate` sortable and queryable (the Swift lists them newest first). The `Audit` type holds one encrypted `secure_json` field and needs no index on it.
- The `Secret` type (0224) needs `modificationDate` sortable and queryable like the others. It holds one encrypted `secure_json` field and three plain labels (`name`, `registerId`, `at`), none of them indexed.
- The `Migration` type is fetched by its record name (`migration-v1`) and needs no index.
- A Sale’s `secure_json` is an encrypted field and needs no index.
- The `SquareManifest` and `SquareShard` types (0209) are read by record name, so they need no index. The development environment creates them on first write; they must be deployed to Production like the others.
- The schema must be deployed to the Production environment, which is separate and empty. The migration would run again there.

**Device tests** that now exist and have not been run on a device: T85 (encryption across two Apple IDs), T86 to T91 (events, attempts, the events export, the note), T92 (shared drawer), T93 (saved carts), T94 (shared settings) T95 (shared notices) T96 (shared logo), T97 (shared layout) and T98 (shared Square history) T99 (shared training progress), T100 (shared audit log) and T101 (the migration lease). T102 (the import runner, 0213), T103 (the count check, 0214), T104 (the controller, 0215), T105 (the screen, 0216), T106 (resolving another register's payment, 0217), T107 (missing-order recovery, 0218), T108 (the owner export, 0219) T109 (the switch, 0220) T110 (shared secrets, 0224, run after T85) and T111 (change pushes, 0225) and T112 (a joined till uses the owner's zone, 0227) are written. Run T102 to T105 first, because they exercise the import; T109 needs a real shop where they passed, with iPads A (owner), B (in the share) and C (not in the share).

**Yours to do, not code:** the shop’s privacy policy and the App Store privacy details (these changes add payment and staff data to what is stored), and the CloudKit container and App ID setup from patch 1.

## Part 3. Decisions (carried over in full from 31 October)

The rest of this document is the 31 October decisions doc. It has been edited only where patch 0188 (the loan) and patch 0191 (the checkpoint) changed a line, and where the “suggested patch placement” has been replaced by the real plan in Part 2.3. The original proposal is kept in place at the end.

## What this is

This records every decision made on 31 October 2026 about what syncs through iCloud (CloudKit) and what stays on each device. It also lists what is still undecided, with a recommendation for each open point. Items keep the numbers from the review (1 to 27) so they can be cross-referred. It builds on `dev_docs/CLOUDKIT_SYNC_PLAN.md`, which it corrects in several places (see “Changes to make to the plan and help pages” near the end).

Tags used: **Sync** (goes to iCloud and is shared between registers), **Local** (stays on the device), **Open** (not settled yet).

## At a glance

- **Sync, decided:** 1, 2, 3, 5, 6, 9, 13, 14, 15, 17, 18, 19, 20, 21, 23.
- **Local, decided:** 4, 7, 8, 16, 22, 24, 25, 26.
- **Settled in this round:** 10 (notices), 12 (CSV history), 27 (grid version).
- **Open:** only the encryption test (O4), which is deferred.
- **Understanding confirmed:** 11 (the other-tills cache).

## A. Items where the plan contradicted itself or the code

**1. Staff list, including PIN and badge hashes. Sync fully.** Each staff entry holds a name, a role, a PIN hash and salt, and a badge hash and salt. All of it now syncs, so a PIN set on one iPad works on every iPad. The plan’s line that PIN hashes never reach iCloud is therefore wrong and has to be rewritten. Decided (Q8): accepted, because the share link is private. All owner logins can reprint a cashier pass from any iPad, so the pass codes sync too, encrypted (note N1).

**2. Staff display settings. Sync.** Each person’s display mode (Standard, Simple, Minimal, Custom) and personal theme, accent and tile size travel with their staff entry, so they follow the person to any iPad. The iPad’s own theme, accent and tile size (item 22) stay local. I have not checked which of the two wins on screen today; the sync should not change that rule.

**3. Receipt profile. Sync.** The business details printed on receipts, including the receipt server URL. The receipt server secret syncs too, encrypted (Q9, note N1). The logo is item 14.

**4. Inventory screen preferences. Local.** Filters, sort and grouping are a viewing habit, not shop data.

**5. Fees, cash rounding and Require PIN. Sync.** These already sync through Shopify today and move to CloudKit with the other shared settings. The plan’s section 5 table left them out and needs them added.

**6. Cash drawer. Sync fully, one single shared drawer.** The drawer is the shift (open or closed, float, paid in, paid out, and the loan still owed back, `loanCents`, added by 0188) and the ledger (current note and coin counts plus up to 1000 history entries). It belongs to the shop, not to any till. Notes:

- Expected cash and the float report already read from the shared ledger, so most of the code agrees. Anywhere that still assumes “this till’s drawer” needs an audit (a comment in the store still says a drawer figure must stay this till’s).
- The Cloud sync help page says drawer cash is never merged. That is wrong and must be fixed.
- Suggested CloudKit shape: the shift as one record, and each ledger entry as its own append-only record named by its id, with the counts worked out from the entries. This matches how the app already merges entry lists, and avoids one record holding 1000 entries (Q12).
- Cash taken on a phone with the drawer feature off is still allowed and flagged for the next count (an earlier companion-mode decision).

**7. Sync bookkeeping fields (`drawerVersion`, `drawerPending`, `drawerShiftPending`, `warningListVersion`, `warningListPending`). Local, decided.** You were unsure, so here is what they are. Each one is a note a single iPad keeps about itself, not shop data:

- `drawerVersion` and `warningListVersion` mean “the newest version of the shared record that I have seen”.
- `drawerPending` and `warningListPending` mean “I have a change that has not been uploaded yet”.
- `drawerShiftPending` means that unsent change included opening, closing, paid in or paid out, so an older update must not overwrite it.

If these synced, every iPad would see the others’ values. One iPad could then wrongly believe it was up to date, or believe someone else’s unsent change was its own, and skip a real upload. They describe where this iPad is in the sync, so they only make sense per device. CloudKit also keeps its own per-device sync position (a server change token) that is never shared, and once the CloudKit backend is live it replaces most of these counters. Decided (Q1): **Local**.

## B. Things the plan never mentioned

**8. Outbox (queued sales waiting for Shopify). Local.** It is a per-device work queue. If two iPads shared one queue they could both create the Shopify order for the same sale. The finished sale record itself syncs. Decided (Q11): if an iPad dies with sales still queued, another register can find sales that have no Shopify order and create it.

**9. Payment attempts. Sync, labelled with the register name.** Each attempt (started, approved, declined, cancelled, unknown) syncs with the name of the register that made it, so a manager can see unresolved payments shop-wide. Decided (Q10): any register can resolve an unresolved payment, and the first resolution wins.

**10. Notices. Local, but sync the ones that make sense.** The app has eight kinds: sync, queue, stock, reader, refund, pass, info and cash. Approved (Q2):

- Sync **cash** (a drawer count is needed and the drawer is now shared) and **refund** (a failed refund needs a manager wherever they are).
- Keep **sync, queue, reader, stock, pass and info** local, because each describes one iPad or is derived from Shopify on each iPad.
- Reading or dismissing a notice is per iPad, so it does not clear it on the other iPads (Q2).

**11. The other-tills history cache (`pos.shared`). Understanding confirmed.** Yes, you understood it correctly. Today each till pulls other tills’ sales and daily totals from Shopify into this cache. Once CloudKit carries sales (plan patch 4), it becomes a local cache fed from CloudKit, and the Shopify pull is retired. The cache itself is not synced.

**12. Local CSV history files. Decided: keep a local copy and also have a shared copy.** The three files (`sales.csv`, `sale_lines.csv`, `events.csv`) stay on each iPad exactly as they are, never auto-cleared, as the safety copy. The shared copy, as agreed:

- Do not sync the CSV files as files. The app appends by reading the whole file and rewriting it, so two iPads editing copies would conflict.
- Sales and sale lines are already covered by the synced sale records (items 17 and 18), so they need nothing new.
- `events.csv` is the gap. It holds declined and unknown payments, voids, overrides, errors, paid in and out, shift opens and closes, no-sales, cancelled and failed refunds, and staff switches. Only paid in and out reach the shared ledger today (a loan to the drawer and taking it back are paid in and out with a loan label, 0188). Sync events as their own append-only records (one per event, named by id, labelled with the register), and let the app build a combined CSV from them on demand.

Confirmed (Q3).

**13. Assistant audit log. Sync, labelled with the register.** Every assistant exchange, from every register, visible to managers in one place. Decided (Q4): the whole log syncs, encrypted, including anything a local model was sent, such as customer names. That is an exception to the plan’s rule that no customer name, email or phone reaches CloudKit (note N2).

**14. Branding logo. Sync.** Stored as an iCloud asset alongside the receipt profile, so a new register prints the logo without a backup restore.

**15. Training progress. Sync per staff member, and owners and managers can reset progress.** Progress follows the person across iPads. Training and demo data itself is still never synced; only the progress marks are. Decided (Q5): owners can reset anyone’s progress, and managers can reset progress for roles below manager. All modules can be reset (O1).

**16. The `cloudkit.backend` flag. Local.** It is the rollback switch. If it synced, one wrong flip would move every till at once.

**17. Tender and card details. Sync all, encrypt where necessary.** Every field on a tender syncs. Card tenders also carry a masked card number, last four digits, approval code, retrieval reference, receipt link, response code and transaction references. This reverses the plan’s earlier “plain fields now, encryption later” decision: encryption is now in scope from the first sales patch. Decided (Q6): encrypt the card fields (masked number, last four, approval code, retrieval reference, receipt link, response code, transaction references) using CloudKit’s encrypted fields, and keep kind, amount, tendered and change in plain fields. In plain terms: encrypted fields can only be read by the registers in your share and cannot be searched, so amounts stay plain to let reports add them up. I have not confirmed that encrypted fields read correctly for a participant in a shared zone on a different Apple ID, so that needs a two-device test early (O4).

**18. Staff name, notes, reasons and price adjustments on sales. Sync.** These are what make reports and audits useful. One small residue: a free-text note could contain a customer’s name, which the plan promises never reaches CloudKit. You have accepted that sales sync, so treat this as a known, minor exception unless you want notes scrubbed.

## C. Settings covered only by “everything else is per-device”

**19. Shop name. Sync.**

**20. Pass server URL and gift claim URL. Sync.** The addresses sync. The secrets that go with them also sync, encrypted (Q9, note N1).

**21. Auto-receipt. Sync, decided.** This setting has two values, “ask” and “none”. After a sale, “ask” prompts the cashier about a receipt and “none” skips it. It decides what a till does at the end of every sale. Decided (Q7): **Sync**, so every till ends a sale the same way.

**22. Accent, glass surfaces, item spotlight, theme setup version. Local.** Look and feel of the device.

**23. Smart change and consolidate. Sync fully.** These choose how cash change is made up. They are now shop-wide, matching the shared drawer. The code comment that calls smart change “per device like the drawer ledger” is out of date and should be fixed.

**24. Catalogue cache (variants, collections, customers). Local.** Derived from Shopify, and it exists so items and customers can be used offline.

**25. Automatic discounts and discount presets. Local.** Confirmed in the code: both are fetched from Shopify (the presets are Shopify discount codes), so they are derived.

**26. Catalogue and stock timestamps. Local.** They mark when this iPad last refreshed.

**27. Grid version counter. Agreed, with a plainer explanation.** The grid layout itself syncs. Today a small counter says “is the shared layout newer than mine?”. CloudKit tracks that itself through each record’s change tag, so the counter is no longer needed. It is kept only during migration, to compare the old Shopify layout with a local one, and it is not synced as data.

## Answers to the open questions (31 October 2026)

All fourteen questions are answered. The numbers are the same as before.

- **Q1 (item 7).** Local.
- **Q2 (item 10).** Approved: only the cash and refund notices sync. Reading or dismissing one is per iPad.
- **Q3 (item 12).** Confirmed. The shared copy is the synced sale records plus synced event records, with the CSV export built from them. The local CSV files stay unchanged.
- **Q4 (item 13).** Encrypt and sync the whole audit log. Note N2 covers the customer-data exception this creates.
- **Q5 (item 15).** Owners can reset anyone’s progress. Managers can reset progress for roles below manager only. Which modules: still open (O1).
- **Q6 (item 17).** Approved. In plain terms: each piece of data in an iCloud record is stored either normally or encrypted. Encrypted pieces can only be read by the registers in your share and cannot be searched. Card details are encrypted. Amounts stay normal so reports can still add them up.
- **Q7 (item 21).** Sync.
- **Q8 (item 1).** Accepted, because the share link is private. All owner logins can reprint a pass, so pass codes must be available on every iPad (note N1).
- **Q9.** The Keychain secrets sync, encrypted: the Shopify login (domain, client ID, client secret), the pass, claim and receipt secrets, and the AI key (note N1).
- **Q10 (item 9).** The first resolution wins. Any register can resolve an unresolved payment, not only the one with the reader.
- **Q11 (item 8).** Yes. A register can find sales with no Shopify order and create the order.
- **Q12 (item 6).** Approved. In plain terms: today the drawer history is stored as one bundle, so two iPads writing at the same moment can overwrite each other. With one record per cash movement, each iPad only adds lines and nothing collides, and the drawer total is worked out by adding the entries up. The shift (open or closed, float, paid in and out) is a single small record, because there is only ever one.
- **Q13.** Agreed. Every register uploads its own local-only data (events, payment attempts, audit log, training progress) once after joining.
- **Q14.** Agreed. Also wanted: a CloudKit export (note N3).

## New points from these answers

**N1. Secrets and pass codes now sync, which reverses the plan.** The plan listed the Shopify login, the pass, claim and receipt secrets, the AI key and cashier pass codes as never in iCloud. They now sync, encrypted. One caveat: encryption keeps the data from anyone outside the share, but every register in the share can read it, and the share link is read-write. Anyone holding the link can therefore reach the Shopify client secret. You have accepted that the link is private. Treat it like the shop’s keys, share it only with your own devices, and turn the share off in iCloud if a device is lost. The Shopify access token itself expires and is fetched by each register, so it stays local.

**N2. The customer-data rule has one exception.** The plan promised that no customer name, email or phone is written to CloudKit. The audit log is the exception, because it records what the model was sent and a local model can be sent customer details. It syncs encrypted. The in-app “what is in iCloud” note, the Cloud sync help page and your privacy policy wording should say this plainly.

**N3. CloudKit export (new feature).** An owner-only action that writes everything stored in CloudKit to files in the Files app. It is a backup that does not depend on the owner’s Apple ID staying healthy. It belongs in plan patch 8 or a patch of its own. Decided in O5: one zip of JSON files containing everything.

## Answers to the last five questions (31 October 2026)

- **O1.** All training modules can be reset. Owners can reset anyone’s progress, and managers can reset progress for lower roles.
- **O2.** Yes. The assistant’s connection settings (address, model name, options) sync along with the AI key, so a new register works straight away.
- **O3.** CloudKit keeps every drawer ledger entry. The app loads the latest 1000.
  - Working assumption from patch 0191, to be confirmed: a `drawer-checkpoint` record holds the counts at a point in time and the server stamp of the newest entry it covers, written when a shift opens or closes. A register replays only entries stamped after it, so the counts do not depend on the 1000 loaded. The stamp is CloudKit’s creation time, not the entry’s `ts`, so an entry an offline register uploads late is still counted.
- **O4.** Deferred. There is no second Apple ID or device to test with right now. My suggestion, not yet agreed: build the encrypted fields behind a switch, and run the cross-Apple-ID test before turning on the encrypted secrets and pass codes (patch 6d).
- **O5.** The export is one zip of JSON files containing everything stored in CloudKit. Because it includes the secrets, the zip is as sensitive as the Shopify login itself. Keep it owner-only.

## Still open

Only the encryption test (O4), which waits for a second device.

## Additional notes

- **Record names for new types** (all deterministic, to avoid duplicates): `drawer-shift`, `ledger-<entry id>`, `attempt-<sale uuid>-<reference>`, `event-<id>`, `staff-<staff id>`, `training-<staff id>-<module>`, and audit files named by register and day, e.g. `audit-<register id>-<date>`. Each register writes only its own audit and event files, so they cannot conflict.
- **Payment data in sale records:** only masked card numbers are kept, never a full card number.
- **The privacy note in the app** (“what is and is not in iCloud”) must be rewritten. It now has to say that staff PIN hashes, encrypted card details, payment attempts, events, the audit log (including any customer names a local model was sent), training progress, and the encrypted logins, secrets and pass codes are stored in iCloud.
- **The shop’s privacy policy** stays yours to update. These changes add payment and staff data to what is stored.
- **Never synced:** the Shopify access token (each register fetches its own), the open cart, the device’s own settings (items 4, 16, 22 and the per-device settings), the catalogue cache, training and demo data.

## Changes to make to the plan and help pages

1. Section 5 table: add the drawer, fees, cash rounding, Require PIN, staff (with hashes), staff display settings, payment attempts, events, notices (cash and refund only), audit log, training progress, logo, shop name, the two server URLs, and smart change and consolidate. Resolve the inventory prefs and receipt profile contradiction (inventory prefs Local, receipt profile Sync).
2. Section 7 “never in iCloud”: remove staff PIN hashes. Also remove the cashier pass codes, the Shopify login, the pass, claim and receipt secrets and the AI key, which now sync encrypted.
3. Section 7 “what is and is not in iCloud” and the in-app note: update as above.
4. Replace the “encryptedValues later” decision with the card-field encryption decision.
5. `help/settings/cloud-sync.md`: fix “cash stays on the register it was counted on” and “each register keeps its own settings”.
6. Store comments for `smartChange` and the sales and drawer split need updating.

## Suggested patch placement (the 31 October proposal, kept for the record)

Superseded by the patch plan and status in Part 2.3, which is what is being followed. The proposal as written on 31 October:

- **Patch 4 (sales and rollups):** sale records with encrypted card fields, payment attempts, events, and first the two-Apple-ID encryption test.
- **Patch 5 (saved carts):** unchanged.
- **Patch 6 (settings, layout, Square history):** add staff and staff display settings, the shop and receipt settings, the logo, and the shared notices.
- **New patch 6b:** the shared drawer (shift and ledger entries).
- **New patch 6c:** audit log (encrypted) and training progress.
- **Patch 7 (migration):** extend to cover each register’s own local-only data (Q13).
- **Patch 8:** unchanged.

- **New patch 6d:** the encrypted logins, secrets and cashier pass codes, built only after the encryption test (O4) passes.
- **New patch 6e:** the owner-only CloudKit export (N3), or folded into patch 8.
