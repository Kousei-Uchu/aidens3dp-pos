# F1 Review: Copilot patches 0035–0047, 0054–0058, 0063–0065

Reviewer: F1 subagent. Date: 2026-10-18. Everything below was checked against the **current code**, not just the patch diffs, because several later patches (0056, 0057, 0066+) legitimately changed things these patches touched.

## Summary

| Patch | Verdict | One-line result |
|---|---|---|
| 0035–0047 (help pages 22–58) | **OK** (2 small accuracy issues, see below) | All 36 pages read; links validated; code references and numbers spot-checked against source |
| 0054 Docs Worker | **OK** | Worker typechecks; local smoke test of every route passed; app-side remote-help fallback tested |
| 0055 pricing help | **OK** | Every symbol in the code table exists; `pos_adjustments` confirmed; pricing tests passed in the full run |
| 0056 (direct: starting stock, gift-card restore, settings retry) | **OK** with a docs gap | Code does what the description says; **two help pages were left stale** (see issues 1–2) |
| 0057 (direct: cash denominations, smart payouts) | **OK** | Denomination confirmation, smart payouts and exact-denomination cancellation all present; cash help updated |
| 0058 (direct: help presentation) | **OK** | Step cards (app + web), topic cards, one-step web guide and storefront-styled Docs site all confirmed |
| 0063 (direct: training foundations) | **OK** | Guard/session/restore all present and sound; 28 task modules have since built on top; device checks still outstanding |
| 0064 grid fits pane | **OK** | Intent preserved (extended sensibly by later custom-tile-size work); 4/4 tests pass |
| 0065 Show rebuild + training blocker fix | **OK** | `trainingDemo`/`DemoView` in place; 5-minute/unknown-sale blocker rules survive; 32/32 related tests pass |

**Issues found (all documentation; nothing in code needs undoing or rewriting):**

1. **`help/stock/items.md` is stale (should-fix).** Patch 0038 documented the then-real "Starting stock" discrepancy ("the current helper does not send that quantity to Shopify"). Patch 0056 fixed the code (`createItem` now calls `setStock` with the parsed quantity, and `Items.tsx` sends it), but the page still has a section titled "A known starting-stock issue" and closes with "the current helper does not send that quantity to Shopify." Direct contradiction with the code. The middle paragraph ("blank = no opening quantity, whole number applies it, zero is valid") matches `src/lib/startingStock.ts` exactly; only the heading and the final sentence need rewriting.
2. **`help/pay/gift-card.md` is stale (known as F6, confirmed still open).** It still says cancelling a part-paid sale does **not** put money back on the gift card ("deal with it by hand"). Since 0056, `Pay.tsx` calls `creditGiftCardOnce(cardId, …, 'POS cancel …')` on cancellation. The page now **contradicts** `help/gift/check-redeem.md`, which correctly describes the credit-back behaviour. Both cannot be right; fix `pay/gift-card.md`.
3. **Minor: `help/fix/reader.md`** says `checkReader`, `pairReader` live in `App.tsx`. They are in `src/zellerBridge.tsx` (the newer `help/pay/card.md` has it right).
4. **Minor: `help/staff/modes.md`** has `updated: 2026-11-10`, a future date (today is 2026-10-18). Looks like a typo for 2026-10-10 or 2026-09-10.
5. **Nit: `help/concepts/glossary.md`** defines guided checkout as asking about "items, customer, discount, review and payment". Since 0056, Customer is an optional extra step (`DEFAULT_STEPS` in `guidedFlow.ts` is items → discount → review → pay).
6. **Cosmetic: `docs-server/src/index.ts`** static HTML says `Search 58 guides`; the bundle now has 64 pages. Overwritten at runtime by `pages.length`, so it only shows if the JS fails.

**Test/typecheck state at review time** (captured before `node_modules` disappeared from the working tree, not removed by this review; a later foreground `npm test` cannot run until dependencies are reinstalled):

- `npm test`: **1245 pass, 4 fail**, exactly the expected state. The 4 failures are in `tests/trainingitems.test.ts` (1) and `tests/trainingstocklookup.test.ts` (3), i.e. later course work (0121+, `stockLookup` removed), **not** in any patch reviewed here.
- `npm run typecheck`: the expected **3 errors**, all in `tests/trainingstocklookup.test.ts`.
- `help:check` (via `npx tsx`): **help OK: 64 pages, help.json is current**; every `[[citation]]`, parent and structure rule validates.
- `docs-server` typecheck: **passes** (ran `tsc --noEmit` after installing `typescript@5.8` + `@cloudflare/workers-types@4` into the gitignored `docs-server/node_modules`).

---

## 0035–0047: In-app help pages (B7)

**Checked:** read all 36 pages in their current state (`help/cash/*`, `help/gift/*`, `help/orders/*`, `help/stock/*`, `help/staff/*`, `help/settings/*`, `help/fix/*`, `help/concepts/*`); ran `help:check` (all links/parents/headers valid); verified roughly 120 referenced code symbols across the "Where the code is" tables all exist (only misses: issue 3 above); verified the numeric claims in `cash/float-report.md` (`DAY_TRIALS` 30, `DOLLAR_COST` 0.04, `GOOD_ENOUGH` 3%, `MIN_NET` 0.5, `MAX_TOPUP` $200) and `cash/smart-change.md` (`SCORE_WEIGHTS` 100/40/0.5, half-life 14 d, confidence 8, horizon 4–12, 60 amounts, 400 candidates, 3 alternatives) against `floatPlan.ts` / `changeScore.ts`: **all match**; verified default fee rates 1.4 %/1.7 % in `fees.ts`; ran `tests/helpcontext.test.ts` (2/2 pass).

**Quality:** writing is consistently plain-English, adult, and honest about limits ("It is a suggestion", "Known boundaries", "do not promise change the drawer cannot make"). The Basic/Deep/Advanced ladder works well and depths genuinely differ in audience. Mermaid charts match the described flows.

**Issues:** 1, 3, 4, 5 above. Also note some pages have drifted forward via later patches (`orders/refunds.md`, `staff/screensaver.md`, `sales/*`), which is fine and correctly dated.

Verdict: **OK**. Ship-quality pages; fix issues 1, 3, 4, 5 in a small docs pass.

## 0054: Docs Worker (B7c)

**Checked:** current `docs-server/src/index.ts` against the patch intent; `tsc --noEmit` with workers-types (**passes**); local smoke test calling the Worker's `fetch` directly:

- `GET /api/index` → 200 with `ETag "<version>"`; `If-None-Match` → **304**
- `GET /api/page/cash/float-report` → 200; unknown page → **404**; `OPTIONS` → **204** with CORS; `POST` → **405**
- `GET /` → 200 HTML containing Mermaid init, the one-step-at-a-time guide and the screen-figure renderer

App side: `src/lib/helpRemote.ts` sends the version as `If-None-Match`, treats 304 and same-version as "keep built-in", validates the bundle; `Help.tsx` only fetches when `EXPO_PUBLIC_DOCS_URL` is set and falls back to the built-in copy on failure (`tests/helpRemote.test.ts` 3/3 pass).

**Observations (not blockers):** issue 6 (static "58 guides" placeholder); the site pulls `marked`/`DOMPurify`/`mermaid` from jsDelivr at view time, so the site needs internet (fine for its purpose; CSP correctly limits script sources and sanitises Markdown HTML); JSON is served with `max-age=300` plus ETag, reasonable. Deployment remains blocked on the Cloudflare zone issue documented as 0062; correctly not executed.

Verdict: **OK**.

## 0055: Pricing help updates (A16)

**Checked:** current `help/sales/cart-and-prices.md` in full; every entry in its four code tables verified to exist (`priceCart`, `matchBundles`, `chooseAutoDiscounts`/`autoMove`/`isLot`/`activeNow`, `pctOf`/`allocate`, `invoiceRows`/`unitLine`, `setItemPrice`, `makeAdjust`/`reviewReasons`, `orderAdjustProblem`/`orderReviewReasons`, `adjustmentRows`/`needsAdjustReview`/`unresolvedRows`, `saleAdjustments`, `encodeAdjustments`, `applyRecord`, `splitLineForOrder`, `NO_DISCOUNT_TAG`); `pos_adjustments` confirmed written/read in `src/lib/shopify/orderModel.ts`; all ten named test files exist and passed in the full suite run. The stale "planned change" note the patch claims to remove is indeed gone; the page's `updated: 2026-10-18` reflects later touch-ups. The described pipeline order (bundle → auto → line → cart → line price → whole order) matches the mermaid and the code layout.

Verdict: **OK**.

## 0056: Starting stock, gift-card value restore, shared-settings uploads (direct)

**Checked:** 
- *Starting stock:* `parseStartingStock` (blank → undefined, digits only, zero valid) → `createItem` validates and calls `setStock(…, 'received')` after inventory activation, with a clear "item created but stock failed" error. Works as described, but see **issue 1**: the help page documenting the old bug was never updated.
- *Gift-card restore:* `creditGiftCardOnce` in `giftcards.ts` is retry-safe (checks the operation note in the card's transaction history, refuses amount mismatches); used by `Pay.tsx` on cancellation (`POS cancel {sale} tender {n}`) and by `refundFlow.ts` for reload-original vs new-card refunds. Matches the description, but **issue 2** (`pay/gift-card.md`) remains stale.
- *Shared-settings uploads:* `pushSharedSettings` sets `sharedSettingsPending`, retries from the foreground poll (`pollShared`, ~25 s), and `pullSettings` refuses to overwrite while pending; pending clears only when the pushed snapshot still matches. Exactly as `concepts/data-and-sync.md` describes.
- The same patch's mode/guided-checkout refinements hold: `DEFAULT_STEPS` excludes Customer (optional via `guidedFlow.ts`), Custom has per-tab/per-entry overrides (`uiMode.ts`), Simple/Minimal use normal text sizing.

Verdict: **OK** (code). Docs follow-up required for issues 1–2.

## 0057: Cash denominations, smart change, cancellation (direct)

**Checked:** `GiveCash` runs `planChangeSmart` for payouts and requires an explicit confirmed count (`onConfirm(given)`); the old untracked shortcuts are gone (`postCashSale` always records received + given denominations; cash refunds go through `postCashRefund`). `recordCancelledCashTender` collects prior change and returns the **exact** original denominations with a "Sale cancelled: exact cash returned; prior change collected" note; no optimiser, as specified. `help/pay/cash.md` was updated accordingly (cancellation paragraph, Gave-this table, `recordCancelledCashTender` in the code table). Cash tests passed in the full run.

Verdict: **OK**.

## 0058: Help presentation (direct)

**Checked:** 
- *In-app step cards:* `Markdown.tsx` renders ordered lists as bordered cards with numbered circular badges. 
- *Topic cards:* Help home renders "Browse by task" as 48 %-width cards (`Help.tsx`). 
- *Web one-step-at-a-time guide:* `docs-server/src/index.ts` has the `guide-toggle` / `step-guide` implementation with progress track, aria attributes and Previous/Next (present in the served HTML, confirmed by smoke test). 
- *Storefront styling:* the Docs site uses the observed Instrument Sans (loaded from aidens3dp.com CDN), plum background `#13111c`/peach text palette, pill buttons: matches the described direction. 
- *Custom domain:* prepared but not executed; the 0062 attempt and its Cloudflare-zone failure are documented in `docs-server/README.md` and PROGRESS, consistent with "do not execute".

The content model was genuinely not changed (same pages/headers/depths; presentation only). No issues found.

Verdict: **OK**.

## 0063: Training foundations (direct)

**Checked:** all foundation files present: `TrainingRun.tsx`, `Spot.tsx`, `TrainingHost/Overlay/Layer.tsx`, `trainingSession.ts`, `trainingGuard.ts`, `trainingProgress.ts`, `src/training/modules/welcome.ts` + README. The safety assumption is implemented as stated: `trainingGuard.ts` is a single flag every storage/network/reader seam consults; `kvWriteAllowed` permits **only** the training-progress key; the session swaps fixture state in memory and restores the real state on exit (and restores *before* dropping the guard); practice orders/gifts have their own capture/restore. Note `SceneView.tsx`/`trainingScene.ts` no longer exist (correctly removed by 0066; Info and Show now share the Demo engine), and `help/staff/training.md` was updated to match. Training tests: 276/280, the 4 failures being the known later-course issues. Device verification remains outstanding, as PROGRESS says.

Verdict: **OK**.

## 0064: Quick Menu grid fits its pane

**Checked:** `src/lib/gridLayout.ts` still implements the patch's rule (`tileColumnsForPane` compares grow/shrink ratios; width rounded down to 0.25 pt; `MIN_COLUMNS` 2); later work sensibly extended the preference type to numeric custom sizes via `resolveTileTarget` (clamped 80–220) without changing the rule. `Tiles.tsx` measures the pane with `onLayout` and falls back to a window-width guess, matching the help page. `tests/gridlayout.test.ts` passes **4/4**. `help/sales/grid.md`'s Tile-size paragraph and fault list match the behaviour.

Verdict: **OK**.

## 0065: Show as user-paced demo + training-blocker fix

**Checked:** `src/lib/trainingDemo.ts` (pure engine: `demoStateAfter`, `cameraFor` with 2.2 zoom cap and edge clamping, `planStep`, `noteFor`, `validateDemo`) and `src/ui/DemoView.tsx` exist and are wired through `TrainingRun`. The blocker fix survives in `trainingSandbox.ts`: `WAITING_WINDOW_MS = 5 * 60_000` for `started` attempts, `unknown` blocks only while its sale is the one in the cart, part-paid carts still block, and messages name the case. `tests/trainingdemo.test.ts` + `trainingsandbox` + `training` **32/32 pass**. `help/staff/training.md` describes the Show as rebuilt (Next/Back/Replay, never autoplays) and was later kept current by 0066.

Verdict: **OK**.

---

## Recommended follow-ups (docs only; not done, per review-only instruction)

1. Rewrite the "starting stock" bits of `help/stock/items.md` (heading + last sentence) to describe the implemented behaviour.
2. Fix `help/pay/gift-card.md` cancellation bullet (and the Deep-section "cancelled sale leaves the money gone" sentence) to match 0056's credit-back behaviour; closes F6.
3. `help/fix/reader.md`: point `checkReader`/`pairReader` at `src/zellerBridge.tsx`.
4. `help/staff/modes.md`: correct the `updated: 2026-11-10` future date.
5. Optional: glossary guided-checkout wording; docs-server "58 guides" placeholder.
6. Environment note: the repo's top-level `node_modules` and `package-lock.json` (deleted in the worktree) went missing mid-review (not caused by this review). `npm test`/`npm run typecheck` need `npm install` (and restoring `package-lock.json` from git) before they can run again.
