# Companion mode: plan, decisions and progress

All twelve questions from the first draft are answered and the plan below matches the answers. It is written against `aidens3dp-pos` `main` at `7dadbfd` (last patch 0174). Patch 0175 (this one) only saves the plan and its tracker. Nothing else is built yet.

This file is the single source for Companion mode. Each patch ticks its own items in the tracker below, and `dev_docs/PROGRESS.md` carries the one-line patch log and the questions waiting on you.

## Your answers and my take

| # | Your answer | My take |
| --- | --- | --- |
| 1 | Per device, agreed | Locked in. The mode is never shared between registers and is kept on backup restore. |
| 2 | Grouping unsure, fine for now | Kept as proposed. Groups live in one list in code, so moving an item later is a one-line change. |
| 3 | Everything: the default selling screen is a quick sale that expands into the full POS | Good fit. The quick sale and the full POS share one cart, so expanding never loses anything. I read "everything" as every payment method too, but card and cash still depend on their own groups. See open question 1. |
| 4 | Yes to sending a cart to the register | Lightest possible selling feature, and it works with Selling off. It reuses saved carts, which already sync through Shopify. |
| 5 | Anyone may turn register features on, but must be logged in | Fine, with one catch: cashiers never see Settings today, so the switches get their own screen in More that every signed-in person can open. |
| 6 | A sign-in PIN before anything that matters (Shopify, items, payments, sales and so on) | Becomes a "step-up" PIN check on a fixed list of actions (see Sign-in and the PIN). |
| 7 | A setup screen for Register vs Companion, extensible for a future public POS | Built as a small step registry, so a new profile later adds steps and does not edit the shell. I won't design the public app now. |
| 8 | Today is the home tab, login based. Lock the whole app behind the PIN either way | This reverses my earlier idea of skipping the lock on a phone. The whole app locks, and Today follows role rules. |
| 9 | Stock actions, towards the end | Moved to the last patch (0182). |
| 10 | Short series | Eight small patches, 0175 to 0182. Each one is useful on its own. |
| 11 | Hide register courses and pages | Hidden outright, not greyed out. Demo mode stays. |
| 12 | iPad too, phone first | Phone layout is designed first. The iPad reuses it with the wider layout it already has. |

## The core idea

A device is either in **Register** mode (today's app, and the default for every existing install) or **Companion** mode (new). In Companion, register-only features are off until someone turns them on from one screen. The device mode decides what exists on this device. A person's display mode (Standard, Simple, Minimal, Custom) can then narrow it further. Neither can widen the other, the same rule `dev_docs/MODES.md` already applies to roles.

## What counts as a register feature

Each group is one switch.

| Group | What is in it | Companion default |
| --- | --- | --- |
| Selling | Quick sale, full POS (grid, cart, split payments, guided checkout, scanner to cart), cart warnings, price adjustments, custom amounts, gift card selling, bundle checks | Off |
| Card reader | Zeller provider, reader pairing, reader tools in Support and diagnostics, reader notices, terminal practice | Off |
| Cash drawer | Drawer screen, ledger, swap cash, float report, Check Change, smart change, tender machine slot | Off |
| Till staff tools | Lock register, staff pass scanning, switch staff, cashier passes | Off |
| Till display | Screensaver, keep awake, item spotlight, grid editor | Off |
| Till training | Register courses in Training | Off |

Always on in Companion: Help, Demo mode, Notifications, the AI assistant, Settings for owners and managers, and sync and Shopify diagnostics. The PIN lock is not a group (see below).

## Sign-in and the PIN

The whole app locks behind a PIN in Companion, using the lock screen that already exists, and it stays locked after the phone is idle or backgrounded. Browsing after sign-in is free. Anything that changes something that matters asks for the PIN again when the last PIN entry is too old.

Proposed list of actions that need the step-up PIN:

- Taking any payment or finishing a sale, including refunds.
- Anything written to Shopify: creating or editing items, stock changes, discounts and bundles, gift card creation.
- Cash drawer changes.
- Staff, Settings and assistant settings changes.
- Turning register features on or off, or changing the app mode.
- Backup export and import.

Defaults to start with, both changeable: auto-lock after 2 minutes idle, and step-up PIN needed if the last PIN entry was more than 5 minutes ago. See open question 2. Because a lock needs a PIN to come back from, the setup flow creates the first owner PIN before anything else. Face ID is a possible later extra, but it needs a new native package, so it is not in this series.

## Setup flow

A first-run screen asks **Register** or **Companion**, then runs the steps for that choice: connect Shopify, create the owner PIN, and either name this register or pick the register features to start with. Steps live in a registry (`id`, which profiles it applies to, whether it is done, its screen). A later public-use profile adds steps there without touching the shell. Existing installs are marked as set up in Register mode on upgrade, so nobody sees the screen or loses anything. The mode can be changed later from the same place, behind the step-up PIN.

## Selling on the phone

With Selling on, the sell tab opens a **quick sale**: an amount keypad, item search and scan, and one Pay button. An **Expand** button turns the same screen into the full POS as it is today (grid, cart, split payments). The cart is one shared cart, so it carries across, and the person's display mode still applies (Minimal's guided checkout wins if it is on). Payment methods follow their own groups: card needs Card reader, cash needs Cash drawer. See open question 1.

## Send to register

With Selling off, the phone can still build a cart (search or scan, quantities, a note) and **send it to the register** as a saved cart assigned to a register or a person. Saved carts already sync through Shopify, so this needs no new server. The register opens it from Saved carts as it does now.

## What the companion keeps and adds

- **Kept, with a phone layout:** Inventory, Orders and Transactions, Reports and the Square history, Items, Customers, the Bundles builder, gift card balance checks, Notifications, Price check and Stock check.
- **Today (new home tab).** Sales and order count today, low-stock items and anything stuck in the outbox, each tappable into its full screen. Money figures follow the current role rules, so a cashier sees the non-money cards only.
- **Scan (new tab).** One big scan button (camera or Bluetooth scanner) that shows price, deals, stock and the other variations. No cart is touched.
- **Stock actions (last).** Receive, count and adjust from a Scan result, using the existing adjustment screens, reasons and permissions.

## UI changes

- Default tabs: Today, Scan, Inventory, Orders, More. With Selling on, a Sell tab joins them and Orders moves into More.
- Wording on screens that stay drops "register" and "till" phrasing in Companion. Standard wording is untouched.
- Single column, search first on lists, pull to refresh, large tap targets. The iPad uses its wider layout.
- A **Companion features** screen in More, open to every signed-in person, with the six switches and a button to switch the device to Register mode.

## How it fits the architecture

1. **`src/lib/appMode.ts`** (pure, tested): the profile type (open to new values), the feature group list, `resolveFeatures`, `tabAllowed`, `routeAllowed`, `rowAllowed`. Unknown stored values fall back to Register.
2. **Settings, per device:** `appMode` and `registerFeatures`. Left out of the shared settings push, kept on backup import like the register name, defaulted to Register on upgrade.
3. **`src/lib/setupFlow.ts`** and a setup screen, plus the Companion features screen.
4. **`src/lib/stepUp.ts`** (pure, tested): which actions need the PIN, and whether the last PIN entry is recent enough. Each listed action calls it before it runs.
5. **Display modes:** `resolveUi()` takes the device features and only intersects. The sole-manager rule stays, and Settings always keeps a way to the features screen.
6. **Shell:** `App.tsx` builds the tabs from the gate. The home tab, the hidden-tab fallback and `nav.go()` deep links use it, and `Routes` sends a hidden route to the home tab.
7. **Hardware and background work:** the Zeller provider stays mounted (it must never unmount mid-payment) but idles with Card reader off, with no reader checks or notices. Outbox, drawer sync, saved-cart push, screensaver and keep awake follow their groups.
8. **Help, Training and the assistant:** pages and modules get a `needs` tag, hidden ones are removed and unsearchable, and the nav graph and assistant answer as they do for a missing role, with no hint the screen exists.
9. **Docs and checks:** `dev_docs/COMPANION.md`, a Help page, `MODES.md`, `dev_docs/PROGRESS.md` and `DEVICE_TESTS.md` updated. Checks run in the sandbox: `npm test`, typecheck, the help and nav graph checks and the style check (Australian English, no dashes). Nothing runs on a device from my side.

## Risks to watch

- **Zeller on a phone is unverified.** The code does not say whether the reader SDK works on an iPhone. Open question 3.
- **Cash with the drawer off.** A phone that takes cash must not write the shared drawer record from stale data. See open question 1.
- **Lock-out.** A PIN lock plus step-up on every change could trap someone. The setup flow creates the first PIN, and the sole-manager rule stays.
- **Friction.** Too many PIN prompts makes people hate it, so the step-up window is a setting.
- **Hidden links.** Notices for hidden groups are never raised, and old ones fall back to Today.
- **Older app versions** ignore the mode and show everything, so the mode is never trusted from another register.

## Patch series

| Patch | What | Status |
| --- | --- | --- |
| 0175 | This plan as `dev_docs/COMPANION_PLAN.md`, tracker, `PROGRESS.md` entry | Done |
| 0176 | Device mode gate, per-device settings, setup flow, Companion features screen | Done, needs your device (T75) |
| 0177 | App-wide PIN lock and step-up PIN | Built, needs a device test (T80) |
| 0178 | Tabs, pages and More rows from the gate, Today and Scan tabs | Built, needs a device test (T81) |
| 0179 | Hardware and sync gating | Built, needs a device test (T82) |
| 0180 | Quick sale, expand to full POS, send to register, payment methods by group | Built, needs a device test (T83) |
| 0181 | Help, Training and assistant gating, docs | Built, needs a device test (T84) |
| 0182 | Stock actions from Scan | Planned |

## Progress tracker

Legend: `[x]` done in code, `[~]` done but needs your device, `[ ]` not started, `[?]` needs your answer.

- [x] P1 All twelve questions answered
- [x] P2 Plan updated to match the answers
- [x] P3 Plan saved as `dev_docs/COMPANION_PLAN.md` with this tracker (0175)
- [~] C1 `appMode.ts` with tests (0176)
- [~] C2 Per-device settings: not shared, kept on restore, Register by default (0176)
- [~] C3 Setup flow registry, Register and Companion setup, existing installs marked set up (0176)
- [~] C4 Companion features screen for every signed-in person (0176)
- [~] C5 App-wide PIN lock, first PIN made in setup, auto-lock (0177, needs a device test)
- [~] C6 `stepUp.ts` with tests, wired to the listed actions (0177, needs a device test)
- [~] C7 Tabs, home tab, route guard and deep links from the gate (0178, needs a device test)
- [~] C8 Today tab (0178, needs a device test)
- [~] C9 Scan tab (0178, needs a device test)
- [~] C10 More menu rows follow the gate (0178). Companion wording on the screens that stay is not done yet.
- [ ] C11 Phone-first layout pass for the existing screens, iPad wider layout (not done yet; the new Today, Scan and quick sale screens are already single column)
- [~] C12 Zeller bridge idle without Card reader, no reader notices (0179, needs a device test)
- [~] C13 Outbox, drawer sync, saved-cart push, screensaver and keep awake follow groups (0179, needs a device test). The outbox and saved-cart push also run while something is left to send, so nothing is stranded.
- [~] C14 Notices for hidden groups not raised, old ones hidden (0179, needs a device test). A notice that links to a hidden page does not open it.
- [~] C15 Quick sale screen (0180, needs a device test)
- [~] C16 Expand quick sale into the full POS on the same cart (0180, needs a device test)
- [~] C17 Payment methods follow their groups: Card needs the reader; cash with Cash drawer off is allowed, not posted to a ledger, and flagged for the next drawer count (0180, needs a device test)
- [~] C18 Send a cart to the register as a saved cart, with Selling off or on (0180, needs a device test)
- [~] C19 `needs` tag on Help pages, a device rule for Training courses, hidden ones unsearchable (0181, needs a device test)
- [~] C20 Nav graph (Today and Scan, 0180) and assistant gating (0181, needs a device test)
- [x] C21 Help page, `MODES.md` and `DEVICE_TESTS.md` steps (kept up to date in each patch; the separate `COMPANION.md` is not needed because the Device mode help page and this plan cover it)
- [ ] C22 Receive, count and adjust from a Scan result (0182)
- [ ] C23 Device tests on iPhone and iPad, by you (end)

## What I found in the code

- **Tabs are fixed.** `App.tsx` hard-codes five tabs. `uiMode.ts` can hide three, but Checkout and More are always present, so that rule moves into the new gate.
- **Checkout is home.** The nav starts there and hidden tabs fall back to it.
- **The lock screen assumes a till.** With staff set up and nobody signed in, `isLockScreen` shows the PIN pad. Companion reuses it app-wide.
- **The Zeller provider sits at the root** and must never unmount mid-payment (a comment in `zellerBridge.tsx` says so). I will confirm what `Bridge` does on mount before touching it.
- **Background work is till-shaped.** A 25 second tick runs the outbox, shared poll and saved-cart push, and the drawer is a shared record (patch 0168).
- **Settings mix per-device and shared keys.** Screensaver, assistant and inventory prefs are per device. Staff, adjustment limits and cart warnings are shared.
- **Backup restore keeps the register's name and ID.** The mode is treated the same way.
- **Training, Help and the assistant know about screens.** All three need to learn that a screen can be absent.
- **A phone layout already exists** (the cart is a page on a phone), so this is new screens and fewer of them, not a new layout system.

## Open questions

None at the moment.

## Settled questions

- **Staff stays reachable on a companion.** The `staff` page and More row are no longer tied to Till staff tools, so a companion can always make or reset a PIN (still managers and owners only, by the existing role rule). Done in 0178.
- **Cash on the phone.** If the phone takes cash while the Cash drawer group is off, it is allowed and flagged for the next drawer count (not blocked). Built in 0180.
- **Card on the phone.** Your Zeller reader works from an iPhone, so phone card payments are in scope. It cannot be tested from the sandbox, so it stays a device test for you.
- **PIN timing.** 2 minutes idle for auto-lock, 5 minutes for the step-up window, and the PIN-gated list as written.
- **Patch numbers.** `dev` was merged into `main`, where 0173 and 0174 are the assistant patches, so this series starts at 0175.
