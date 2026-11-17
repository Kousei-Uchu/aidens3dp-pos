# To do (excluding training and the assistant)

Every open item I could find across the repo's lists, with training and the in-app AI assistant left out (those are
tracked in `dev_docs/TRAINING_PLAN.md`, `dev_docs/TRAINING_MODULE_CHECKLIST.md`, `dev_docs/archive/TRAINING_MODULE_BUGS.md`,
`dev_docs/TRAINING_CORRECTIONS.md` and `dev_docs/AI_ASSISTANT_PLAN.md`).

Last brought up to date on 2026-11-17, through patch 0250. The main source was `dev_docs/PROGRESS.md`. Nothing else in the repo (code TODOs or the other docs) holds open items of
its own that are not already listed here.

Two kinds of item:

- **Waiting on you.** These need the iPad, a scanner, a cash drawer, a live Shopify store, or a decision from you. I
  cannot move them on my own.
- **Buildable.** These are code, docs or repo work I can do now.

## 1. Waiting on you (device tests)

These are the tests only the owner can run. Each has exact steps in `dev_docs/DEVICE_TESTS.md`.

| Id | What to test |
| --- | --- |
| A15.4 / C7 | Variant picker, grid editing (sub-categories, display groups, the path bar), Price check and Stock check tiles. Also the keyboard with the search field. |
| B1h | Cash drawer: open (carried-over contents), paid in and out, correct contents, count and close, read the Z-report. |
| B1k | Daily float report: takings match your Z-report, the suggested take-out looks right, ledger after recording. |
| N15 | The device test in A15.4. |
| N16 | The drawer test in B1h. |
| N17 | The cash sale test in B1i. |
| N18 | The Smart change test in B1j. |
| N19 | The float report test in B1k. |
| N20 | Display mode (Simple and Minimal), deferred until your test device is available. Update every register first, because older versions ignore the mode. |
| N22 | Price adjustments: line price, the flag, Keep / Adjust / Remove, report wording. |
| N23 | Price adjustments: whole order price, the footer, per-line rows, the receipt, spreading. |
| N24 | Price adjustments: item price, Fixed quantity split, All in cart, Reset. |
| N25 | Price adjustments: the checkout review list in normal and guided checkout. |
| N26 | Price adjustments: reasons, the transaction card, the Reports card, the Shopify `pos_adjustments` attribute. |
| N27 | The Help screen itself: search, depth flip, links, back walk, flowcharts, Simple and Minimal modes, dark theme. |
| T10 / B8 | Gift cards on your live Shopify store: pay, cancel, refund to the original card or a new one, and the new Wi-Fi-off charge test (0240). |
| T115 | Stock actions from Scan (0243): Receive, Adjust and Count from a Scan result, the PIN, the retry with no connection. |
| T116 | Shared Shopify location and the half-hourly catalogue and stock refresh (0244), on two iPads. |
| T117 | Stock running out warning at Charge (0245): off by default, then on, with and without the tick. |
| T118 | Set up a new device by QR (0246): a fresh device, an expired or reused code, and a companion. |
| T114 | First run on iCloud (0234 to 0241): Back up everything, the sync chip, the Transactions tab on two iPads, the Last full sync line, cash drawer and exports across iPads. The backup, the chip, the cash drawer and the exports passed on 2026-11-14 by your report; the Transactions tab and the Last full sync line are untested. |
| T102 to T113 | The CloudKit real-shop tests (import, count check, the switch, secrets, change pushes, a joined till, the loan flow). The import has been run for real in Development, but I do not have a record of which of these you ran. Tell me and I will tick them. |
| N32 | **Resolved.** F4 (2026-10-18) used the `avoid-ai-writing` skill at `.opencode/skills/avoid-ai-writing/` for the AI-sounding/Australian-English sweep, so the style-skill question is answered. No action needed. |

## 2. Buildable now

No owner input needed.

| Id | What it is | Notes |
| --- | --- | --- |
| F1 | Review Copilot's work. Patches 0054 to 0058 and 0063 to 0065 are marked "review pending". Read each, run its tests, note anything to fix, undo or rewrite. | **Done (2026-10-18).** Full review in `dev_docs/archive/REVIEW-F1.md`: every patch OK, nothing to undo. Six doc follow-ups found and all fixed (stale starting-stock section, stale gift-card cancellation text, wrong code path in reader help, a future-dated page, glossary wording, a stale placeholder). |
| F2 | Sweep the whole app for inconsistencies and missed parts: screens that lead nowhere, settings that do nothing, two ways to do one thing, dead ends after an error. | **Done (2026-10-18).** Findings in `dev_docs/archive/F2-SWEEP.md`; fixes in commit `99f5ef1`. |
| F3 | Clean up the repo files and the historical commits: stray files, old patches and zips, dead code, commit messages and history. | **Done (2026-10-18).** No Finder-style duplicate files exist anywhere in the repo. Left the 11 unlisted patches in place (see section 4). |
| F4 | Remove AI indicators (em and en dashes, AI phrasings) from the whole repo, docs and Help text; use Australian English throughout. | **Done (2026-10-18).** Help and src were already clean; swept dev_docs/ from 68 em dashes to 2 (both kept: your own dictated asides in the bug list). Fixed US spellings (optimise etc.) in help and docs. Used the `avoid-ai-writing` skill. |
| F5 | The GitHub public face: README, CONTRIBUTING, SECURITY, a code of conduct, issue and PR templates, a changelog, Discussions on or off, and a licence decision. | **Done except the licence (2026-10-20).** README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, a bug-report issue template and a PR template added (2026-10-18); `CHANGELOG.md` added and Discussions decided as off (0186, see GUESSES.md). **Open: your licence choice** (no LICENSE file added; README says all rights reserved for now). Discussions is a GitHub setting, so check Settings ▸ General ▸ Features that it is off. |
| F6 | Fix docs gaps and wrong bits. Known one: the Help page `pay/gift-card` still says cancelling a part-paid sale does not put the money back on the gift card, but patch 0056 changed that. | **Done (2026-10-18)** as part of the F1 follow-ups: gift-card page rewritten to describe the credit-back behaviour, plus the other five fixes the review found. |
| F7 | A full step-by-step test guide as one HTML file, a notes box under each step, exporting the findings at the end (same style as `dev_docs/archive/next-steps.html`). `dev_docs/DEVICE_TESTS.md` is the source. | **Done (2026-10-18).** `dev_docs/archive/DEVICE_TEST_GUIDE.html`: 512 steps across 71 sections (T1 to T71), notes per step, pass/fail, auto-save, Export (JSON/Markdown), printable. |
| F8 | Demo mode: the app locks into a full demo with virtual terminals (card, drawer, scanner, receipts) so nothing real is touched, with a home screen showing every feature in the Training Show style. Built on the Training fixture state. | **Done (2026-10-18).** More > Demo mode. One guard locks the till onto the Training fixtures (card terminal, scanner, drawer, receipts and every sync seam are the practice ones), signed in as a made-up owner so every feature is on show. `src/screens/DemoHome.tsx` lists every feature by area; each one plays its Training Show or opens live. A bar across the top says so and leaves in one tap. Nothing is written or sent; leaving restores the real till exactly. Details and guesses in `dev_docs/GUESSES.md`. **Changed 2026-10-20 (0187):** it now runs on a copy of the till's own catalogue, customers, sales and drawer, with practice data only where there is none, and the guard was audited and closed (see PROGRESS). |
| F9 | A new public template repo from the app, with everything personal stripped (store, domains, keys, branding, staff, passes, certificates, history), published as open source. | **Waiting on you.** Needs your answers to seven decisions: which branding to strip, what to do with the assets, the secrets/config placeholder rules, whether to keep or discard the git history, exactly what counts as me-specific, whether the three Workers ship as is or are left out, and the licence choice. Once answered, I can prepare the public repo. |
| D5 | Fill in the tender machine adapter (built in 0024 as one empty function plus a locked-Off setting). | Waits on your hardware. |
| D7 | Extra ideas, saved for last after E1. | Not started, and now unblocked (E1 was done in 0170). It is a placeholder: no ideas are written down anywhere in the repo yet. |

## 3. Half done, one step left

| Id | What is left |
| --- | --- |
| B7e | The Help experience: you wanted a more visual, interactive one. **Done as far as I can without a device (0241).** Pictures drawn from the real screens' labels (the `screen` block, `src/lib/helpFigures.ts`) now cover 15 of 68 pages, the flowcharts cover 63, and the numbered-step cards, step-through mode and topic cards from 0058 are in. Not done: real screenshots (they need your iPad or Demo mode captures; the drawn pictures stand in), and pictures for the other 53 pages. | Say which pages you want next. The Daily float report is the hardest to draw. |
| B8 | Live Shopify verification of the gift-card changes from 0056. **Code reviewed against Shopify's docs (0240) and one real gap fixed:** a charge whose reply was lost could be taken twice on retry; it cannot now. The live run itself is yours, because it spends real gift-card value on your store: steps in `dev_docs/DEVICE_TESTS.md` T10 (now eight steps, with a Wi-Fi-off charge test). Permission already granted (`write_gift_card_transactions`). | Run T10 and report pass/fail with balances and any error text. |


## 3b. CloudKit (iCloud sync): what is left

Built and running in Development since 2026-11-11 (patches 0231 to 0241, see `dev_docs/CLOUDKIT_SYNC_PLAN.md` section 10).

| Item | Status |
| --- | --- |
| Stay on the Development environment | **Your choice (2026-11-14): leave it for now.** Builds installed from Xcode use Development; TestFlight and App Store builds use Production, which is empty and would need the schema deployed and the shop moved again. Development has no durability promise, so **Back up everything** is the safety net: use it regularly. |
| Retire the 25 second poll | Not done (0220 left it). Waits on T111 showing that change pushes arrive reliably. |
| "Setting up sync" state on other devices during the move | Not built as the plan describes (checked in 0221). |
| Poll speed | iCloud was slow on 2026-11-11 and sped up on its own by 2026-11-14. 0239 stops polls piling up and adds a Last full sync line. If it slows again, read that line; the next lever is running the poll's steps in parallel. |
| Schema upkeep | `npm run cloudkit:schema` (0236, 0237) fixes indexes and adds any missing record type. Run it after adding a record type; a test fails if the app uses a type the list does not hold. Its check mode ran on your Mac on 2026-11-11 and found 16 fixes. |
| Zone changes feed | Considered and declined (2026-11-11): it cannot read one record type at a time, so it does not suit the polls. |
| Rows from other registers on Transactions | Built (0238). It lists the 800 newest sales from other registers; Return or exchange needs the sale in the Shopify list first. |

## 3c. Companion mode and the newest patches

Everything here is built and unit tested. What is left on each is your device test.

| Id | Built in | What is left |
| --- | --- | --- |
| C23 | 0175 to 0182 | The companion device tests (setup checklist, PIN lock, the feature switches, quick sale, Help and Training gating). |
| 0182 | 0243 | Stock actions from Scan. Device test T115. |
| 0244 | 0244 | Shared Shopify location and the half-hourly catalogue and stock refresh. Device test T116. |
| 0245 | 0245 | Stock running out warning at Charge, off by default. Device test T117. |
| 0246 | 0246 | Set up a new device by QR, no iCloud. Device test T118. Square history and the reader pairing are not part of it. |

## 3d. Tillium: Alloys and Elements

Planned in 0248 (`dev_docs/ALLOYS_PLAN.md`, rules in `dev_docs/ALLOYS.md`), on the `tillium-dev` branch, not built yet. Your
decisions are recorded in section 10 of the plan. P1 is built (0250: the `alloykit` types, the registry, the selection rules and
the boundary test, with nothing calling them). Next is P2: characterisation tests that pin what the Shopify and Zeller code does
now. Later: users deploy their own Cloudflare workers (section 8 of the plan).

## 4. Flagged in the repo but not on a list

- **Duplicate docs (stale, closed).** F3 checked the whole repo for Finder-style copies (`AI_ASSISTANT_PLAN 2.md`, and the same pattern for `PROGRESS` and `DEVICE_TESTS`): none exist. Nothing to delete.
- **Patch files and `patches/APPLIED.txt`.** F3 found 11 on disk but unlisted (0167, 0168, 0169 and eight unnumbered ones); all 11 are listed now. `0175-companion-mode-plan.patch` is listed too (checked 2026-11-16: every file in `patches/` is in the ledger, so `scripts/apply-patches.sh` has nothing left over). Decide before F9 whether `patches/` belongs in the public repo at all.

## 5. Training Modules

Training courses and their status are tracked in `dev_docs/TRAINING_MODULE_CHECKLIST.md`, `dev_docs/TRAINING_PLAN.md`, `dev_docs/archive/TRAINING_MODULE_BUGS.md` and `dev_docs/TRAINING_CORRECTIONS.md`. No open items outside training were moved here.

## 6. AI Assistant

The in-app AI assistant plan is tracked separately in `dev_docs/AI_ASSISTANT_PLAN.md`. Assistant-related patches and work are not listed here by design.

## Notes

- This file only tracks items outside training and the assistant. Keep it in step with `dev_docs/PROGRESS.md` when items
  are done.
- Australian English, no em or en dashes, dollar amounts like `$12.50`.
