# To do (excluding training and the assistant)

Every open item I could find across the repo's lists, with training and the in-app AI assistant left out (those are
tracked in `docs/TRAINING_PLAN.md`, `docs/TRAINING_MODULE_CHECKLIST.md`, `docs/TRAINING_MODULE_BUGS.md`,
`docs/TRAINING_CORRECTIONS.md` and `docs/AI_ASSISTANT_PLAN.md`).

The main source was `docs/PROGRESS.md`. Nothing else in the repo (code TODOs or the other docs) holds open items of
its own that are not already listed here.

Two kinds of item:

- **Waiting on you.** These need the iPad, a scanner, a cash drawer, a live Shopify store, or a decision from you. I
  cannot move them on my own.
- **Buildable.** These are code, docs or repo work I can do now.

## 1. Waiting on you (device tests)

These are the tests only the owner can run. Each has exact steps in `docs/DEVICE_TESTS.md`.

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
| N32 | **Blocking F4.** Send a style skill (or written guide) for removing AI-sounding writing and for Australian English. One may already exist in `.opencode/skills/avoid-ai-writing/`; confirm it is the one to use. |

## 2. Buildable now

No owner input needed.

| Id | What it is | Notes |
| --- | --- | --- |
| F1 | Review Copilot's work. Patches 0054 to 0058 and 0063 to 0065 are marked "review pending". Read each, run its tests, note anything to fix, undo or rewrite. | **Done (2026-10-18).** Full review in `docs/REVIEW-F1.md`: every patch OK, nothing to undo. Six doc follow-ups found and all fixed (stale starting-stock section, stale gift-card cancellation text, wrong code path in reader help, a future-dated page, glossary wording, a stale placeholder). |
| F2 | Sweep the whole app for inconsistencies and missed parts: screens that lead nowhere, settings that do nothing, two ways to do one thing, dead ends after an error. | Could start today. |
| F3 | Clean up the repo files and the historical commits: stray files, old patches and zips, dead code, commit messages and history. | See the duplicate files note below. |
| F4 | Remove AI indicators (em and en dashes, AI phrasings) from the whole repo, docs and Help text; use Australian English throughout. | **Done (2026-10-18).** Help and src were already clean; swept docs/ from 68 em dashes to 2 (both kept: your own dictated asides in the bug list). Fixed US spellings (optimise etc.) in help and docs. Used the `avoid-ai-writing` skill. |
| F5 | The GitHub public face: README, CONTRIBUTING, SECURITY, a code of conduct, issue and PR templates, a changelog, Discussions on or off, and a licence decision. | **Mostly done (2026-10-18).** README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, a bug-report issue template and a PR template added. **Open: your licence choice** (no LICENSE file added; README says all rights reserved for now, see GUESSES.md) and whether to turn Discussions on. |
| F6 | Fix docs gaps and wrong bits. Known one: the Help page `pay/gift-card` still says cancelling a part-paid sale does not put the money back on the gift card, but patch 0056 changed that. | **Done (2026-10-18)** as part of the F1 follow-ups: gift-card page rewritten to describe the credit-back behaviour, plus the other five fixes the review found. |
| F7 | A full step-by-step test guide as one HTML file, a notes box under each step, exporting the findings at the end (same style as `docs/next-steps.html`). `docs/DEVICE_TESTS.md` is the source. | Could start today. |
| F8 | Demo mode: the app locks into a full demo with virtual terminals (card, drawer, scanner, receipts) so nothing real is touched, with a home screen showing every feature in the Training Show style. Built on the Training fixture state. | Big feature; wants a design pass first. |
| F9 | A new public template repo from the app, with everything personal stripped (store, domains, keys, branding, staff, passes, certificates, history), published as open source. | After F3 to F6. |
| D5 | Fill in the tender machine adapter (built in 0024 as one empty function plus a locked-Off setting). | Waits on your hardware. |
| D7 | Extra ideas, saved for last after E1. | Not started. |

## 3. Half done, one step left

| Id | What is left |
| --- | --- |
| B7e | The Help experience: you want a more visual, interactive one. Screenshots are a proposal, not built. You do not have to take them; two ways are in `docs/PROGRESS.md` (draw them from the mock screens, or capture them in Demo mode once F8 exists). Needs your yes. |
| B8 | Live Shopify verification of the gift-card changes from 0056 (putting value back when a part-paid sale is cancelled, reload or replace on a refund). Steps in `docs/DEVICE_TESTS.md` T10. Needs the `write_gift_card_transactions` scope on your Dev Dashboard app. |

## 4. Flagged in the repo but not on a list

- **Duplicate docs.** These look like copies and are likely F3 cleanup: `docs/AI_ASSISTANT_PLAN 2.md`, `AI_ASSISTANT_PLAN 3.md`, `AI_ASSISTANT_PLAN 4.md`, and the same pattern for `PROGRESS` and `DEVICE_TESTS`. Confirm before deleting.

## Notes

- This file only tracks items outside training and the assistant. Keep it in step with `docs/PROGRESS.md` when items
  are done.
- Australian English, no em or en dashes, dollar amounts like `$12.50`.
