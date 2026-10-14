# Routegraph guidance

Status: core landed. The graph, the engine, the wiring and the tests are in place. This file is the plan of attack and the running log; the "Still to do" list at the end holds the next steps.

## Why

Training already spots when a person goes off course (`src/lib/trainingCourse.ts`, `diagnose`) and points at the control that puts it right (`fixCandidates`). That logic is hand written per mistake. It knows a handful of ways back: the control itself, a window's own control, closing a window, opening the cart. It does not know the app as a whole. So it cannot reason about the long way back from some other tab, a sheet two deep, a runtime list, or a gesture.

`routegraph` (0.3.0) models the app as a directed graph of screens, actions and gestures, and finds the way from anywhere to anywhere. We use it as the engine that answers one question, over and over:

> You are here, the fix is that control, what is the exact next thing to tap (or swipe, or hold) to get there?

Wording, look and feel do not change. `diagnose` still decides what is wrong and the words to say. routegraph decides the path, and the fix's own words always come first.

## Ground rules

- The app's tree lives in `src/app.navgraph` (the readable, diffable source) with `src/app.navschema` beside it. These are the files the VS Code parser extension understands.
- A Metro/TS mirror is generated from them (`src/lib/appNavgraph.generated.ts`) because React Native has no filesystem. `npm run graph:build` regenerates it and `npm run graph:check` fails if it drifts.
- Everything the person can reach and do is on the graph: tabs, pages, every sheet, every overlay, every control, every gesture, and who a role may act as.
- Screens and transitions that come from the file live in `src/app.navgraph`. Controls and runtime lists (grid tiles, cart lines, customers, orders, refund picks, scan cards) are registered at runtime with `registerActions` / `registerScreens` / `registerEdges`, which is what those APIs are for: `node id = "do:" + spot id`, so the reverse lookup is trivial.
- The old `fixCandidates` stays as the wording source and the leading answer. routegraph only ever *appends* the walk to a fix whose own screen is not where the person is, and only for targets the plain answer does not already name. The driver points at the first candidate really on screen, so when the plain answer is reachable nothing at all changes.

## The shape of the app (what the graph must hold)

- Tabs: `checkout`, `inventory`, `transactions`, `notifications`, `more`.
- Pages (pushed routes): `pay`, `cart`, `saved`, `orders`, `items`, `createItem`, `editItem`, `customers`, `reports`, `giftcards`, `drawer`, `settings`, `staff`, `diagnostics`, `help`, `training`, `trainingRun`, `terminalPlay`.
- Overlays: Sign in / Lock (`PinLock`), screensaver, practice terminal, practice scan, practice pass, camera scanner.
- Sheets: search, customer (+ new customer), discount, line editor (+ item price / line price / item discount sub sheets), whole order price, review, cash receive / change / give / return, check change, receipt, return (refund) + replacement, bundles, cart menu, save cart, sell / check gift card, custom amount, drawer (open/close/float/swap), reports customise, inventory filters, lookup, tile settings, staff pass, switch staff, orders window, daily float.
- Controls: every id in `src/lib/trainingSpots.ts` (static) and every prefix it defines (grid tiles, cart lines, per line sub controls, discount presets, search results, customer rows, cash denominations, order rows, refund picks, scan cards).
- Gestures: tap, double, triple, hold, swipe left/right/up/down, scroll (see `src/lib/pointerGesture.ts`). Graph action types carry these (`TAP`, `LONG_PRESS`, `SWIPE`, `SCROLL`).
- Roles: cashier, manager, owner (`src/lib/adjustPerms.ts`). Recorded as screen metadata (`roles`) and checked with `roleCanReach`, so guidance can explain a control a role cannot reach without ever failing a path.
- Display modes narrow what exists (tabs, More rows). Recorded as screen metadata so guidance can name the reason a control is missing.
- Runs: the everyday till and each training module. Recorded as screen/edge metadata (`modules`), so guidance never walks a person through a place their run does not have (see "Runs and scopes" below).

## Where routegraph plugs in

`TrainingHost` polls app state into a `TrainSnap`, calls `diagnose`, then `fixCandidates`. The change:

```
snap -> stateNode(snap)                 // where the person is, as a graph node
spot -> spotNode(spot)                  // the fix, as a graph node
planRoute(tree, stateNode, [spotNode])  // the way there, with gestures
       -> FixCandidate[]                // same shape the dock/overlay already draw
```

`guidanceCandidates(deviation, snap, windowOpen)` returns the candidates the dock and overlay already draw, in this order:

1. `base = fixCandidates(deviation, windowOpen)` - the words and order the app has always used, unchanged.
2. `nav = routeNavSteps(deviation, snap, windowOpen)` - the graph's extra waypoints: a fix hidden under an open window ("Close this window first"), then the navigation-only walk from `stateNode(snap)` to the owning screen of the fix, planned by `planRoute`, with each step's words and gesture.
3. Return `[...base, ...nav]` with any nav target the base already names removed. The dock measures the first candidate that is really on screen, so nav shows through only when the plain answer is not reachable.

`routeNavSteps` is empty when the person is already where the fix lives, when the fix has no owning screen (a universal control, or an unknown spot), or when the route cannot be planned.

## Runs and scopes (practice vs the everyday till)

Guidance runs twice over the same app: inside a training module (on pretend data) and in the real till (Demo / Help). The two are not the same place. A course swaps in practice data, and some screens and controls exist in only one run: the everyday till shows the real scanner (`overlay_camera`), a course that teaches card scanning shows the practice scanner (`overlay_practice_camera`); the practice pass (`overlay_practice_pass`) exists only in the sign-in course. Pointing a person at a place their run has no screen for would send them nowhere.

So a plan is asked for a **scope**: which run it is for.

- `keys` - the module id(s) the run is for, plus the sentinel `real` for the everyday till. `scopeForModule(mod)` returns `{ keys: [mod.id], tabs: mod.tabs, routes: mod.routes }`; `scopeForReal()` returns `{ keys: ['real'] }`. `undefined` means unfiltered (the old behaviour, kept for tests).
- `tabs` and `routes` - runtime knowledge copied from the module: the tabs a course uses and the pushed routes it opens. A screen naming a tab or route outside these is out of scope, so a course never reaches a page its own definition disallows, even with no hand tag.

A screen or edge may carry a `modules` list (values are module ids and/or `real`). The rule (`metaInScope`):

- No `modules` tag -> in every scope (most of the app).
- A `modules` tag -> in scope only when the run's `keys` intersect it.
- A screen whose `tab` or `route` is outside the run's `tabs`/`routes` -> out of scope.

A **runtime instance** carries the same list. `registerRuntimeSpots` takes a spot id or `{ spot, modules }`, so a product tile, a customer row, a grid page or a practice user that belongs to one run is never named in another - even when two runs share the same screen (which they do for the item library, the grid and the users: the sandbox swaps the data inside the same screens, so it is the instance, not the screen, that differs). Screens and edges are tagged in `src/app.navgraph`; instances are tagged where they are registered. Most instances carry no tag and are in every run, which is right for the shared practice data.

`screenInScope(id, scope)` looks a screen up and applies both; `scopeFilter(scope)` is the routegraph `edgeFilter` handed to every walk. routegraph already applies an `edgeFilter` in both `findReachable` and the pathfinder, so **no library change was needed**; we reuse `PathOptions.edgeFilter`. An edge is dropped when its destination screen is out of scope or the edge's own `modules` tag is.

Only the places that really differ carry a tag. `overlay_camera` is `["real"]`; `overlay_practice_pass` is `["sign-in"]`; `overlay_practice_camera` is `["scanning"]` (with `tab_checkout -> overlay_practice_camera [scan.camera]` and the way back). Everything else is untagged and reachable in every run.

The engine threads the scope through `reachable`, `routeNavSteps`, `guidanceCandidates` and `planToSpot`. `TrainingHost` passes `scopeForModule(mod)` and calls `clearRuntimeSpots()` when a run ends, so a finished run's pretend controls do not linger on the graph and colour the next plan.

## Plan

1. Plan doc (this file). **Done.**
2. `src/app.navschema` - default schema plus edge/screen metadata. **Done.**
3. `src/app.navgraph` - the screens and transitions, hand written. **Done.**
4. `src/lib/appControls.ts` - every spot mapped to its owning screen and gesture. **Done.**
5. `src/lib/appGraph.ts` - build the tree, map state to node, map spot to screen, plan, turn a plan into candidates; register runtime controls; report role reach. **Done.**
6. `scripts/build-navgraph.ts` + generated mirror + `graph:build` / `graph:check` scripts. **Done.**
7. Wire `guidanceCandidates` into `TrainingHost`, and register the sale and the mounted controls each tick. **Done.**
8. Tests. **Done** (see the log).
9. Update this file. **Done.**
10. Runs and scopes: `modules` metadata on screens and edges, `GuideScope` in `appGraph` (`scopeForModule`/`scopeForReal`, `metaInScope`, `screenInScope`, `scopeFilter`), threaded through the walk and `TrainingHost`, plus `clearRuntimeSpots` when a run ends. **Done.**
11. Per-instance scopes: `registerRuntimeSpots` takes `{ spot, modules }`, so a runtime record (a product, a row, a user) can belong to a run even though it sits on a shared screen. **Done.**

## Log

- Plan written.
- `src/app.navschema` written: default schema plus screen and edge metadata (kind, label, tab, route, roles, summary; say, gesture, spot, roles).
- `src/app.navgraph` written and validated: 68 screens (5 tabs, 2 views, 18 pages, 39 sheets, 4 overlays) and 155 transitions, every tab reachable from every other, every page reachable from Checkout.
- `scripts/build-navgraph.ts` written; it validates the file and writes `src/lib/appNavgraph.generated.ts` (the bundleable mirror). `npm run graph:build` / `graph:check` added to package.json.
- `src/lib/appControls.ts` written: every static spot and every dynamic prefix mapped to the screen it lives on, plus the gesture a control takes. Tests keep it honest against `trainingSpots.ts`.
- `src/lib/appGraph.ts` written: builds the live tree, maps app state to a node, maps a spot to its screen, plans a walk, converts steps to the dock's candidate shape, registers runtime controls (with their gesture), and reports reach and role.
- `src/ui/Spot.tsx` now exposes `mountedSpotIds()` (the ids of every control on screen, including the equal parts of a segmented control). It stays free of any graph knowledge.
- `src/ui/TrainingHost.tsx` wired: the stray handler now calls `guidanceCandidates`, which returns the old `fixCandidates` result first (same words, same order) and the graph's walk behind it. Each tick it also puts the sale's cart lines on the graph (`syncRuntimeFromSnap`) and every control currently on screen (`registerRuntimeSpots(mountedSpotIds())`). Because `Row`, `Btn`, `Chip` and `IconBtn` all register through the spot layer, this covers orders, refunds, search results, customer rows, discount presets, cash denominations and the rest, with no change to any screen.
- `tests/appnavgraph.test.ts` written (18 tests): the embedded mirror matches the file, the graph validates, reachability, direct tab taps, every static spot and dynamic prefix has a home, gestures, state mapping, role gating, the plain fix always leads with its own words, the graph adds the window-close and the walk behind it, runtime controls join with their gesture, the sale on the till puts its cart lines on the graph, unknown spots are handled honestly, node ids are safe.
- Runs and scopes added. `src/app.navschema` gained a `modules` field on screens and edges. `src/app.navgraph` tagged the three places that differ (`overlay_camera` real, `overlay_practice_pass` sign-in, and a new `overlay_practice_camera` for scanning) - 69 screens, 157 transitions. `src/lib/appGraph.ts` gained `GuideScope`, `scopeForModule`, `scopeForReal`, `metaInScope`, `screenInScope` and `scopeFilter`, and threads a scope through `reachable`, `routeNavSteps`, `guidanceCandidates` and `planToSpot` (reusing routegraph's own `PathOptions.edgeFilter`; no library change). `src/lib/appControls.ts` corrected `scan.card:` to the practice camera. `src/ui/TrainingHost.tsx` passes `scopeForModule(mod)` and clears runtime controls when the run ends. The scope tests bring `tests/appnavgraph.test.ts` to 25.
- Per-instance scopes added. `registerRuntimeSpots` now takes a spot id or `{ spot, modules }`, and passes the tag as the action node's metadata, so an instance registered on a shared screen (a product tile, a customer row, a practice user) is filtered exactly like a tagged screen. routegraph carries the metadata on the action node and `scopeFilter` checks the destination's meta, so no library change. Two tests added (`tests/appnavgraph.test.ts`, 27): a tagged instance is refused in another run, an untagged instance is in every run.
- Per-line item windows added. The `sheet_line` screen is now a template: `src/app.navgraph` declares `VAR ITEM_KEY` and the opening edges fill it in (`cart.line:$ITEM_KEY$`), and `ensureLineWindow` (`src/lib/appGraph.ts`) registers one copy per open line, `sheet_line:<key>`, with `params: { ITEM_KEY: key }` (routegraph resolves the variable inside the action data, so the walk points at that exact cart line). `screenOfSpot` (`src/lib/appControls.ts`) maps the line-window prefixes to `lineWindowScreen(key)` and folds the three sub sheets into it; `registerRuntimeSpots` puts the window on the graph first. `stateNode` returns `sheet_line:<key>` while a line window is open, and `sheet_line -> tab_checkout` (new) closes it, so a fix inside it is not told to close it and one outside is walked out through it. The opening edges say "Open the item's window first.", and `edgeMeta` now reads live edges so a copied edge keeps its words. 69 screens, 158 transitions; two tests (`tests/appnavgraph.test.ts`, 29).
- A walk can carry a `repeat`. `FixCandidate` gained `repeat?: number`; the qty deviation puts its count on the window fix (`repeat: extra`), and a runtime control can too (`RuntimeSpot` gained `repeat`, which rides on the action node). routegraph resolves it onto the instruction action (`InstructionAction.repeat`), `candidateFromStep` reads it back, `DockView` gained `repeat`, and the dock shows a small `xN` chip. The words are unchanged (the qty fix already says "take two out"), so this is the visual count beside them. One test each in `tests/trainingcourse.test.ts` and `tests/appnavgraph.test.ts`.

### What the graph adds over the old logic

The old `fixCandidates` is already good at the local fix, and it stays the leading answer, word for word. The graph shows through only when that answer is not reachable:

- The walk back from any page, tab or view the person has wandered to, planned by `planRoute` and expressed with each edge's own words and gesture, instead of the handful of hand written `via`/`window`/`chain` cases. When the fix's screen is not the person's node, the graph adds the steps (for example `page_orders -> tab_more -> tab_checkout`) behind the plain answer; the driver measures each in turn and points at Back, or the Checkout tab, only if the fix's own control is not on screen.
- Every control and every runtime list (grid tiles, variations, cart lines and their sub controls, customer rows, refund picks, and the rest) is on the graph, with its gesture, so guidance can name things that only exist at runtime.
- Roles are recorded on the admin screens, so guidance can explain a missing control.
- Runs are recorded on the few screens that differ (`modules`), and on runtime instances when they differ, so a course is never pointed at a control the everyday till owns, and the everyday till is never pointed into a course. Where a course's own `tabs`/`routes` say a page is out of reach, no hand tag is needed. The item library, the grid and the users are swapped inside the same screens, so those are instances, not places: they are tagged at registration, not on the screen.

The graph also mirrors the old window rule (close a window first when a fix sits under one). The old answer already covers it, so this only matters when the graph is asked on its own, which is why `routeNavSteps` is tested directly.

### Still to do

- Move the control-to-screen table's last rough edges onto screen metadata once the graph is the only source. This needs a new capability first: the graph must know *which* window is open, not just that one is (like `openLine` does for a line). Today `stateNode` folds every sheet into the page under it, so a control that really lives on a sheet (`bundle.continue` on `sheet_bundles`, `receipt.none` on `sheet_receipt`, `refund.go` on `sheet_refund`, `customer.create` on `sheet_customer`, and the rest) is listed on the tab in `appControls.ts` on purpose. Moving them onto their sheet screens now would make the graph add a spurious "open the window" step while that window is already open; it is hidden behind the plain answer today, but it is wrong and would surface as soon as the graph leads.
- Tag more places as modules grow: today only the camera (practice vs real) and the practice pass differ as *places*, so only they carry `modules` on a screen. Any future module-only screen (a new practice sheet, a course-only page) should be tagged the same way rather than special-cased in code. An instance that differs (a product a course has, a user it runs as) is tagged when it is registered.
- Give a module its own practice data. Today every course runs the one shared sandbox (`buildSandbox` in `src/lib/trainingSandbox.ts`) and only `practiceStaff`, `flow`, `tabs`/`routes` and per-goal `inject`s differ; a course's item library, grid and users are the same as every other course's. If a course should have a world of its own (its own items, its own grid pages, its own fake users), add a module field for it and build it in `buildSandbox`, then tag the instances that only that course has (`{ spot, modules }`), which the engine already filters.
