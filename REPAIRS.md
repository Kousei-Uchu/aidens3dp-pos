# REPAIRS

Work list for the repairs and side notes asked for on 20 October 2026. One line per item, ticked as it lands.
Grouped commits are allowed where a change is tiny; every commit still names the items it covers.

## Patches waiting to be applied

- [x] **P1. Apply `patches/0185-assistant-narrow-tools.patch`.** Done (`bc90712`). The assistant now sends only the tool
  definitions a question needs, with `more_tools` to load the rest. Differs from the 0185 draft that was deleted from
  `patches/pending_merge/` earlier the same day: that one was a Companion-mode draft, this one is the assistant narrow-tools
  patch. It applies cleanly and is now in `patches/APPLIED.txt`.
- [x] **P2. Apply `patches/0186-changelog-and-discussions.patch`.** Done (`8d62580`). Adds `CHANGELOG.md`, points
  `CONTRIBUTING.md` at it, corrects `README.md` (68 help pages, Discussions off, changelog listed) and closes the F5 note
  except the licence. Applied with a 3-way merge because the `docs/PROGRESS.md` hunk's context assumed an older row order
  (the 0183 and 0184 rows sit above it now); the additions themselves were unaffected.

## Bugs to fix

- [x] **B1. Assistant guides to "All products" and stops.** Done. `show_guide` now takes an optional `item` (a few key words
  from the item's name) as well as `screen`. `src/lib/assistantGridGuide.ts` (pure, tested) works out where the item sits in
  the Quick Menu grid by the same rule the grid itself fills categories with (`viewTiles`/`ownProductIds`), and builds the walk:
  the Quick Menu tab, the page chip when the grid has more than one page, each category on the way, then the item's own tile.
  Tapping that last tile ends the guide. An item with no walkable place in the grid (nothing on the till matches, it only shows
  inside a display group, because a group tile carries no spot, or the grid or catalogue was not given) falls back to the All
  products guide, the same as the owner asked for. A saved button's id is `grid.item:<key>` and is resolved again from the grid
  and catalogue every time it is drawn, so a button made before the layout changed still points at the right tile or falls back
  to All products. The note the model reads never names the item (the name is shop data and `show_guide` is gated `content`), so
  only the button the person sees carries it. Tool definitions grew, so the budget test fetches its room from the trimmed
  `show_guide` description. Tests in `tests/assistantguide.test.ts` (24).
- [x] **B2. Stock check ordering.** Done. The stock check's sibling list is now most stock first, least stock last, with
  untracked variations last (they have no level) and catalogue order kept for a tie so rows do not jump between scans.
  `byStockLevel` in `src/lib/lookup.ts` does the sort, the scanned variation stays the header row, and the label reads
  "Other variations (n), most stock first". Tests in `tests/lookup.test.ts`. Also fixed a `tsc` error left by the CloudKit
  patch 4 scaffold (`CLOUDKIT_MISSING` was re-exported from `modules/cloudkit-sync/index.ts` but not imported).
- [ ] **B3. HID scanner field loses focus after the screensaver.** When the screensaver appears and is dismissed, the HID
  scanner field is unfocused, so scans do nothing until a text field is manually focused and unfocused. Other screens or
  events may do the same; the screensaver is the one spotted. Likely in `src/ui/Screensaver.tsx` and the checkout scan box
  (patch 0155 put one scan box in checkout). Fixing this overlaps with side note S3 (a real barcode should dismiss the
  screensaver and refocus checkout), so the two are done together.
- [x] **B4. Routegraph coverage.** Done. The graph is hand written (`src/app.navgraph`), so the check is which App.tsx
  routes have no screen. Two did: `demoHome` and `demoShow`, the Demo mode pages, so `search_screens`, guides and the
  assistant could never reach Demo mode. Both are now screens in the graph (78 screens, 188 edges, was 76 and 184), with
  edges from the More tab (`more.demo`), to the demo show (`demo.watch`) and back (`page.back`). The Demo mode row in
  `src/screens/More.tsx` gained its spot, the Watch button in `src/screens/DemoHome.tsx` became a `Btn` so it carries one,
  and both spots are mapped in `src/lib/appControls.ts`. `tests/appnavgraph.test.ts` passes (32). The graph is regenerated
  by `npm run graph:build`; anything reached by a variable route rather than a `case` in App.tsx is the kind that goes
  missing, so that is where to look next time. This was the real answer to the question: yes, non-hardcoded screens could be
  missed, and two were.

## Side notes

- [x] **S0. This plan as its own `REPAIRS.md`.** Done: this file, with items ticked as they land.
- [ ] **S1. Put the patch queue into its own MD doc.** The numbered queue given earlier (CloudKit 4 to 8, then Companion
  0177 to 0182) goes into a doc so it is not only in the chat. Likely a new `docs/QUEUE.md` or a section in
  `docs/PROGRESS.md`; decide the home when the doc-prune work (S2) is done, so the two do not disagree.
- [ ] **S2. Prune and merge stale docs, and rename `docs/` to `dev_docs/`.** Read every file in `docs/`, remove or merge
  what is stale or duplicated, then rename the folder and fix every reference (`README.md`, `CONTRIBUTING.md`,
  `CHANGELOG.md`, `scripts/`, help build, any doc that links another doc). Do this with care around `docs/PROGRESS.md`,
  `docs/TO_DO.md`, `docs/GUESSES.md`, `docs/DEVICE_TESTS.md`, the plan docs and `docs/CLOUDKIT_SYNC_PLAN.md`. Note that
  the just-applied 0186 links `docs/PROGRESS.md` from `CHANGELOG.md`, so the rename has to catch that too.
- [ ] **S3. A barcode scan dismisses the screensaver.** Scanning a barcode should dismiss the screensaver, and when it is a
  real barcode with no other reason not to (a scanner hardware test is running, and so on) it should refocus checkout
  automatically. Done with B3.
- [ ] **S4. Camera scanner feedback.** Scanning with the camera should flash up the scanned item's details when the
  existing setting is on, and should always give audio feedback for whether the scan was valid or not.
- [ ] **S5. Scan popup fills the checkout left pane, with a fade slope.** The existing scan popup should take up the whole
  inner left pane of checkout (as the split grid/keyboard/All products child view does), stay fully opaque for 3 seconds,
  then fade with a rising slope so it is fully gone by 5 seconds, and be dismissed at once when tapped or clicked. The new
  camera-scanner popup does **not** take the full pane: it stays a toast, but it uses the same fade and tap-to-dismiss
  behaviour. Overlaps S4.

## Order and grouping

Grouped so there are not dozens of commits:

1. This doc (S0) as its own commit. **Done.**
2. The two patches, one commit each. **Done.**
3. B2 (stock sort) is self-contained: its own commit.
4. B4 (routegraph coverage) is a check first: commit only if there is a real gap to fix.
5. B1 (assistant guide) is self-contained: its own commit.
6. B3 and S3 together (scanner focus and screensaver): one commit, because they are the same code path.
7. S4 and S5 together (camera feedback and the scan popup): one commit, same feature.
8. S1 and S2 together at the end, because both touch where docs live and must agree.

## Notes for whoever picks this up

- The repo style check forbids em and en dashes and a list of AI words; where a dash would go, use a comma or a colon.
- `docs/DEVICE_TESTS.md` gains a test for anything a person would notice on a device, and `help/help.json` is rebuilt with
  `npm run help:build` after help pages change.
- CloudKit patch 4 is still only a scaffold (`abf8147`): the native side is unverified and nothing calls the CloudKit
  backend yet. That work is not in this list; it is on the queue for S1.
