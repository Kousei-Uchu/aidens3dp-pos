# NEXT SESSION: read this, then delete it

**Delete this file as soon as you have read it and noted what matters. It is a scaffold for one handoff, not a document to
keep.** Nothing here should be committed. If you want to keep any of it, move the part you want into `REPAIRS.md` (which is
committed) and delete this file.

---

## 1. Where we are

Repo: `/Users/aidenm/Desktop/shopify-zeller-pos-clean`, branch `main`, remote
`https://github.com/Kousei-Uchu/aidens3dp-pos.git`. Working tree is clean except two untracked files that are the **owner's**
and must not be touched or committed: `patches/0185-assistant-narrow-tools.patch` and
`patches/0186-changelog-and-discussions.patch`. They are already applied and listed in `patches/APPLIED.txt`; the files are
just still lying on disk. Leave them.

Last commit: `227ea28 Routegraph: add the Demo mode screens the graph was missing`. Everything is pushed. You start from a
clean tree.

Run the app build with `npm run ios` (or whatever the repo uses; check `package.json` scripts). Two companion docs matter:
`REPAIRS.md` (the live work list for the repair items, committed, tick as you go) and the plan docs named below.

## 2. Standing preferences (do not relearn these the hard way)

- Do the work and commit/push it; do not return a plan instead of the work. One concern per commit, imperative subject, body
  paragraphs wrapped.
- Style check forbids em and en dashes and the AI words `leverage`, `seamless`, `unlock`, `landscape`. Run it with explicit
  paths: `npm run style:check -- <files>` (a bare run fails on a pre-existing backlog).
- Keep changes consistent with the repo's own patterns and naming.
- After help page edits, regenerate with `npm run help:build`. After `src/app.navgraph` edits, regenerate with
  `npm run graph:build`. Both must stay current or checks fail.
- Long checks can hit an I/O-starved machine; retry with a big timeout (typecheck has taken 600 s) before blaming code.
- Never `git add -A`; add explicit paths, because the owner's untracked files must stay out of commits.

## 3. Where we are going

Two work streams are open. Read the source-of-truth docs before touching either.

### Stream A: finish the queue (see `docs/CLOUDKIT_SYNC_PLAN.md` section 9 and `docs/COMPANION_PLAN.md`)

The numbered queue the owner was given earlier, which still needs to be written into its own doc (`REPAIRS.md` item S1):

1. **CloudKit 4 (finish).** Only a scaffold exists (`abf8147`): native Sale/Rollup put/get/list in
   `modules/cloudkit-sync/ios/CloudKitSyncModule.swift`, bridge methods in `modules/cloudkit-sync/index.ts`, and
   `src/lib/cloudkit/cloudkitBackend.ts` behind the seam. **Not build-verified, nothing calls it, and Swift `listRecords`
   ignores the `after` cursor.** Make it real, honour the cursor, add a test for the customer-stripping, and verify the native
   build in a throwaway prebuild copy (see section 4).
2. **CloudKit 5** saved carts with conflict merging.
3. **CloudKit 6** settings, layout and Square history shards.
4. **CloudKit 7** migration lease, checkpoints and verification.
5. **CloudKit 8** retire polling and add the rollback flag. This is where the owner decides dual-write vs cut-over.
6. **Companion 0177** app-wide PIN lock and step-up PIN.
7. **Companion 0178** wire the gate into tabs/routes/More/deep links, add Today and Scan tabs, phone layout.
8. **Companion 0179** hardware and sync gating.
9. **Companion 0180** quick sale, expand to full POS, send to register.
10. **Companion 0181** Help, Training and assistant gating, docs.
11. **Companion 0182** stock actions from Scan.

Owner's stated order: finish CloudKit 4 to 8 while the Swift side is fresh, then Companion 0177 to 0182.

### Stream B: the repair items (all in `REPAIRS.md`; four still open)

The owner listed these on 20 October. Done so far: applying patches 0185/0186, the stock-check sort (B2) and the routegraph
gap (B4). Still open:

- **B1. Assistant guides to "All products" and stops.** It should walk the grid view to the item first, and only fall back to
  **All products** when the item is not in the grid. Start at `src/lib/assistantGuide.ts` and `src/lib/assistantTools.ts`
  (`show_guide`, `resolveLink`, the `walk`/`target` a guide carries), then the grid walk in `src/app.navgraph`.
- **B3 + S3. HID scanner loses focus after the screensaver.** When the screensaver appears and is dismissed, the HID scanner
  field is unfocused, so scans do nothing until a text field is manually focused and unfocused. Other events may do it too;
  the screensaver is the one spotted. Fix together with S3: a real barcode scan should dismiss the screensaver and
  auto-refocus checkout when nothing else says not to (scanner hardware test and so on). Likely files:
  `src/ui/Screensaver.tsx` and the checkout scan box (patch 0155 put one scan box in checkout).
- **S4 + S5. Camera scan feedback and the scan popup.** Camera scans should flash the item's details when the existing
  setting is on, and always give audio feedback on whether the scan was valid. The existing scan popup should fill the whole
  inner left pane of checkout (like the split grid/keyboard/All products child view), stay fully opaque for 3 s, then fade on
  a rising slope so it is gone by 5 s, and dismiss at once on tap. The **camera** popup stays a toast, but uses the same fade
  and tap-to-dismiss. Do S4 and S5 as one commit.
- **S1 + S2. Docs.** Put the queue (Stream A) into its own MD doc, and prune/merge stale docs in `docs/`, then rename
  `docs/` to `dev_docs/` and fix every reference (`README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `scripts/`, the help
  build, and any doc that links another doc, including the `docs/PROGRESS.md` link from `CHANGELOG.md`). Do S1 and S2
  together, last, so they agree. Do not touch `docs/PROGRESS.md`, `docs/TO_DO.md`, `docs/GUESSES.md`, `docs/DEVICE_TESTS.md`
  or the plan docs beyond fixing links.

Group tiny changes; a handful of commits is fine, not dozens.

## 4. Gotchas that will cost you an hour if you forget them

- Native validation: `ios/` and `android/` at the repo root are gitignored, so the native module is only ever built in a
  **throwaway prebuild copy**. `rsync --exclude 'ios'` also drops `modules/cloudkit-sync/ios`, so copy that folder
  explicitly or the module goes missing. The old throwaway copy was at
  `/private/var/folders/t7/4z633t952sq6c_ys48xb99r40000gn/T/opencode/ck2`.
- `N`-suffixed duplicate files (`help/**/<name> 2.md`, `tests/* 2.ts`) are gitignored and break checks; if they reappear,
  stash them out of the way (they were previously parked at `.../opencode/helpdup`).
- CloudKit end-to-end needs two physical devices and two Apple IDs, and simulator push is unreliable. Steps are in
  `docs/DEVICE_TESTS.md` (T74). You cannot fully verify CloudKit here.
- The seam (`src/lib/syncBackend.ts`) is the contract every later CloudKit patch reads. Its interface speaks the shop's type
  names (`cart`, `layout`, `sale`, `rollup`, `settings`). A missing backend throws synchronously "Shared storage is not
  connected on this till." Writes are blocked in training; reads stay open.
- Customer data policy, now settled and recorded in `docs/CLOUDKIT_SYNC_PLAN.md`: **customers live in Shopify, and CloudKit
  must not carry customer names, emails or phones.** A CloudKit sale keeps only the Shopify customer id as an opaque
  reference. `cloudkitBackend.ts` already strips the PII; keep that. Encryption is a non-issue because the fields worth
  encrypting are not there.
- The graph is hand written (`src/app.navgraph`), so screens reached by a variable route rather than a `case` in `App.tsx`
  are the ones that go missing (that is exactly what B4 found). Every spot in `src/lib/trainingSpots.ts` needs a home in
  `src/lib/appControls.ts` or `tests/appnavgraph.test.ts` fails.

## 5. Before you close the session

- `npx tsc --noEmit` clean, `npm test` green (the full suite is large; give it a big timeout), `npm run graph:check` and
  `npm run help:check` current.
- `REPAIRS.md` ticked up to date with what you did.
- Tree clean, everything pushed, and the owner's two untracked patch files still present and uncommitted.
- Delete this file (`NEXT_SESSION.md`).
