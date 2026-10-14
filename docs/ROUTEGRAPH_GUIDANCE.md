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

### What the graph adds over the old logic

The old `fixCandidates` is already good at the local fix, and it stays the leading answer, word for word. The graph shows through only when that answer is not reachable:

- The walk back from any page, tab or view the person has wandered to, planned by `planRoute` and expressed with each edge's own words and gesture, instead of the handful of hand written `via`/`window`/`chain` cases. When the fix's screen is not the person's node, the graph adds the steps (for example `page_orders -> tab_more -> tab_checkout`) behind the plain answer; the driver measures each in turn and points at Back, or the Checkout tab, only if the fix's own control is not on screen.
- Every control and every runtime list (grid tiles, variations, cart lines and their sub controls, customer rows, refund picks, and the rest) is on the graph, with its gesture, so guidance can name things that only exist at runtime.
- Roles are recorded on the admin screens, so guidance can explain a missing control.

The graph also mirrors the old window rule (close a window first when a fix sits under one). The old answer already covers it, so this only matters when the graph is asked on its own, which is why `routeNavSteps` is tested directly.

### Still to do

- Use `cloneTree`/`registerScreens` with a `sheet_line` template so each item window is its own node and a walk can name the exact window, instead of every line window's controls hanging off the one `sheet_line` screen.
- Let the dock show the `repeat` a walk asks for (tap the minus button N times) once wording is agreed.
- Move the control-to-screen table's last rough edges onto screen metadata once the graph is the only source.
