# Tillium: Alloys and Elements

Planned 2026-11-17 from your request to make the app independent of any one service, ahead of the public rebrand and the App
Store. The rules for writing an Alloy are in `dev_docs/ALLOYS.md`. Nothing here is built yet. The work happens on its own
branch, `tillium-dev` (section 9), and every step has to leave the app behaving exactly as it does today.

## 1. The names

| Name | What it is |
| --- | --- |
| Tillium | The brand, and the mobile app (Register and Companion modes together) |
| Tillium Spark | The web app (future) |
| Tillium Workbench | The desktop app (future) |
| Tillium Catalyst | The integration platform |
| **Alloy** | One service integration: Shopify, Zeller, iCloud, Pure Tillium and later Square and others |
| **Pure Tillium** | The app does the job itself with no outside service. It is an Alloy in the same format (`alloys/tillium.ts`), so nothing in the app treats it specially |
| **Element** | A job an Alloy can do: Catalogue, Stock, Connected terminal and so on |
| **Smelter** | The migration tool that moves a shop's data from one Alloy to another (section 7) |

The names are used in the app's words, Help and docs. Code keeps plain identifiers (`Variant`, `alloys/`), so it stays
searchable. Optional extras you may adopt: Tillium Anvil (the mobile app's full name), Rivet (Companion mode), Assay (Scan),
Forge (Training), Vault (Backup & transfer), Gilt (gift cards), Foundry (the Cloudflare services). Before publishing, check
that "Tillium" is free as an App Store name, domain and trademark.

## 2. What the app touches today (surveyed 2026-11-17)

- `src/lib/shopify/` has 11 files and about 50 exported functions. Only about 25 files in the rest of the app call them, and
  most of those are `sync.ts`, `Settings.tsx` and a handful of screens.
- Zeller is `src/lib/zeller.ts` (charge and refund logic behind a `TerminalLike` interface that the training and virtual
  terminals already implement) and `src/zellerBridge.tsx` (the native SDK).
- Two seams already exist and are reused: `src/lib/syncBackend.ts` (`SharedBackend`, with a Shopify metaobject and a
  CloudKit implementation) and the CloudKit move (`migrationLease`, `migrationImport`, `backendChoice`).
- The Cloudflare services (`receipt-server`, `pass-server`, `gift-claim-server`, `docs-server`) are Tillium's own and stay as
  they are for now (section 8).

| Module | Functions and who calls them |
| --- | --- |
| `catalogue.ts` | `fetchVariants`, `fetchCollections`, `fetchCustomers`, `fetchStockDelta`, `fetchAutoDiscounts`, `fetchManualPresets` (all from `sync.ts`); `fetchShop` (Settings) |
| `products.ts` | `createItem`, `updateVariant` (Items screen) |
| `inventory.ts` | `adjustStock`, `setStock` (Inventory, the Scan stock panel); `adjustStock` also from `sync.ts` |
| `orders.ts` / `orderModel.ts` | `createOrderForSale` (`sync.ts`), `listOrders` (Orders, Transactions), `fulfillOrder` (Orders), `refundOrderInShopify` (`refundFlow.ts`); `orderModel` also feeds the training orders |
| `customers.ts` | `searchRemote`, `createCustomer`, `updateCustomer` (Customers screen, `sheets.tsx`) |
| `giftcards.ts` / `giftCardOnce.ts` | `lookupGiftCard`, `createGiftCard`, `debitGiftCardOnce`, `creditGiftCardOnce`, `giftCardHistory`, `allGiftCardTransactions`, `outstandingBalance` |
| `metaobjects.ts` / `metaobjectBackend.ts` | the shared-state store (through `lazyBackend.ts` only) |
| `client.ts` | the Shopify login and `gql`, **plus** four things that are not Shopify: the pass, claim and receipt secrets. Those move to the app. `hasCreds` is called from 7 screens and files |
| `zeller.ts`, `zellerBridge.tsx` | `startCharge`, `startRefund`, `reconcile` (Pay, Refund, `refundFlow.ts`, `saleBuilder.ts`), reader setup (Settings, Diagnostics) |

Data that carries a provider's mark and needs care (section 6): the Shopify order id and gift card ids on sale records,
the `pos_adjustments` order attribute, the `saleTag`, `shopifyDomain` in settings and backups, and the rule that customers
live in Shopify.

## 3. The model

The app calls **Elements**. An **Alloy** lists the Elements it can do and holds only the code specific to its own service.
Each Element has a fixed contract written in the app's own types (`Variant`, `Collection`, `Customer`, `SaleRecord`), which
is also the neutral format migration moves data through. The full format, with mock code, is in `dev_docs/ALLOYS.md`.

```
src/
  alloys/        Alloy-specific code only, plus index.ts (the registry)
    shopify/  zeller/  icloud/        Option B: a folder with an alloy.ts entry
    tillium.ts                        Option A: one file
  alloykit/      shared toolbox Alloys MAY import: types, errors, http, pagination, credentials, once-only, id map, fakes, conformance
  alloyhost/     the app's side; Alloys may NOT import it: router, selection, practice guard, Smelter, host mounting
```

**The app does the shared work, an Alloy does only the service-specific work.** Page loops, merging into the local store,
delta cursors and refresh timing, the outbox, retries, offline handling, once-only decisions, practice-mode blocking,
credential storage, the setup form, the picker, status screens, the Smelter and the test fakes all live in `alloykit` and
`alloyhost`. An Alloy supplies calls to its service, the mapping to and from the canonical types, and what it supports.

### The Elements

| Element | Covers | Required? | Shopify | Zeller | iCloud | Pure Tillium |
| --- | --- | --- | --- | --- | --- | --- |
| Catalogue | products, variants, prices, images, collections | yes | yes | no | later | yes |
| Stock | counts, receive, adjust, count, tracking | no | yes | no | later | yes |
| Discounts | automatic discounts and manual presets | no | yes | no | later | yes |
| Customers | search, create, update | no | yes | no | optional, see 10 | yes (a local list) |
| Orders | record a sale, list, fulfil, refund | yes | yes | no | later | yes (the app's own sale ledger) |
| Gift cards | sell, check, charge, refund, history | no | yes | no | later | yes |
| Shared state | carts, layout, sales, totals, settings across registers | yes | yes (metaobjects) | no | yes | one device only |
| Connected terminal | card payments, refunds, reader pairing | no (cash always works) | no | yes | no | no |
| Tap to Pay on iPhone | card payments on the phone itself | no | no | not today | no | no |

"Required" means setup will not finish while it is unset. Pure Tillium can do every required Element, so the warning in your
John example ("no alloy selected for some Elements") is always about an *unchosen* Element, never an impossible one.
Optional Elements can be left **Off** and the app hides what depends on them. "Later" means a feature the Alloy could add;
the first public build ships iCloud for Shared state only.

## 4. Non-destructive: how each step stays safe

A **strangler** move: build the new structure beside the old one, move things across one at a time, keep the old paths
working until nothing uses them.

1. **Behaviour pinned first.** Characterisation tests record what today's code does (what each function sends and returns
   against a fake Shopify and a fake terminal). They pass on the old code, so they must pass on the new.
2. **Moves are `git mv`, not rewrites.** History follows the files. Old paths keep a one-line re-export, so every existing
   import and test still resolves. Shims are removed only at the end, in their own patch.
3. **The default selection is the old behaviour.** An install with no saved choice reads as Shopify for the shop Elements
   (when it has a login), Zeller for the terminal and iCloud or Shopify for Shared state as it uses today. A test asserts a
   fresh install and an existing one resolve identically.
4. **One Element per patch**, each with the full test suite, `tsc` and its own device test. One bad step reverts alone.
5. **Data changes are additive.** Sale records, CloudKit record types, backups and settings keep every existing field.
6. **Practice and demo mode keep working.** They go through the same router with the practice guard in front.
7. **The branch merges to main only when your device tests pass.**

## 5. Pure Tillium

An Alloy in the normal format that keeps its data through the app's local store (`ctx.store`), a typed collection store the
app provides. The store sits on **AsyncStorage**, the persistence the app already uses (`@react-native-async-storage`; secrets
stay in the Keychain through `expo-secure-store`). React Native has no built-in "PersistentStore", and AsyncStorage is the
standard one, so Pure Tillium needs nothing new. If a shop outgrows it (tens of thousands of items), the store can move to
`expo-sqlite` behind the same interface without touching the Alloy.

Whichever Alloy is selected for **Shared state** syncs that store between registers: none means one device, iCloud means
shared. Pure Tillium is then:

- Catalogue and Stock: items and counts in the store. Sales decrement counts; Receive, Adjust and Count already exist as screens.
- Orders: the sale ledger the app already keeps, without sending anything to an outside order system.
- Discounts: the rules engine already runs the maths; only the list moves into the app.
- Gift cards: a ledger of cards and transactions, with the same once-only rules used for Shopify. The gift-claim page needs
  the card to be readable by the claim service.
- Customers: a local list. The default keeps it on this device; whether it also syncs depends on the Shared state Alloy
  (section 10).

## 6. Data that carries an Alloy's mark

- **Sale records** keep their Shopify fields and gain `refs: { [alloyId]: {...} }` beside them. Readers check `refs` first
  and fall back to the old fields, so old sales read correctly forever. CloudKit gets the new field through
  `npm run cloudkit:schema`, an additive change.
- **Refunds follow the sale.** Each sale remembers which Alloy took it. When the shop moves on, the user chooses per old
  Alloy (section 7): **refuse** old refunds with a clear message and a note to refund by hand, or **keep it connected for
  refunds only**. The refund screen routes by `sale.refs` and explains which applies.
- **Credentials** move to one per-Alloy credential store keyed by Alloy id. The old Shopify keys are read as a fallback and
  still written for one release, so a rollback to the old build keeps working.
- **Settings** gain `alloySelection`, shared between registers on iCloud like the stock warning.

## 7. Changing Alloy: the Smelter

What John sees when he moves from Shopify to Squarespace, per Element he changes:

1. **Check (a dry run).** A report per Element: what moves cleanly, partly, or not at all (the new Alloy has no equivalent),
   and which bound items (stock settings, bundles, grid buttons) would be left pointing at nothing. Nothing is changed.
2. **Choice.** **Back up and continue** (a Vault backup plus a plain export of the old data, then switch; bound items with
   no match are cleared in the app only), **Move my data** (best effort), or **Cancel**. For each old Alloy he also picks
   how old refunds are handled (section 6).
3. **Move.** Per Element in dependency order (Catalogue, Stock, Discounts, Customers, Gift cards, Orders history): read from
   the old Alloy with its `list` functions, write to the new one with its `create` functions, then **read back and count**,
   as the CloudKit move does. Every old-to-new id mapping is saved, so grid buttons and bundles are re-pointed, not lost.
   **No per-Alloy migration code is needed**: the contracts speak canonical types, so a new Alloy gets migration once it
   implements an Element.
4. **Report.** Anything that did not move cleanly is listed with what can be done: keep it in Pure Tillium instead (Shopify
   metaobjects with no equivalent can live in the app's store), export it as a file, or re-create it by hand.
5. **Switch or revert.** The new selection takes effect only when every required Element passes its count check. **Revert**
   puts the old selection back and removes only what the Smelter created, from a journal of exactly that. **Nothing is ever
   deleted from the old Alloy.**

It reuses the CloudKit move's rules: sales waiting in the outbox go to the **old** Alloy first and the switch waits for the
queue to empty, other registers are told a change is under way and stop writing, the move resumes where it stopped, and
practice mode cannot start one. Honest limits: a move is only as good as both Alloys' APIs, and each Alloy states its
limits so the report can say so before anyone commits.

## 8. What stays outside the Alloys for now

- **The Cloudflare services** (receipts, passes, gift claims, docs). They are Tillium's own. **Later:** a public template
  has each user deploy their own (a setup script and a "Foundry" setup screen); an Element for "where receipts are hosted"
  can come after that. Left alone for now.
- **Hardware** (scanner, cash drawer, printer) are devices, not services.
- **The assistant** (its own plan).
- **Square history import.** A one-way importer today; it becomes an import on a future Square Alloy.

## 9. Branch and patches

- Branch **`tillium-dev`**, made from main **before** any of this work, and cloned beside the main folder
  (`dev_docs/TILLIUM_BRANCH.md` has the commands). This plan and every patch after it (0248 onwards, until the merge) are
  applied on the branch only. Put them in the branch's `patches/` folder and run `bash ./scripts/apply-patches.sh`, as on main,
  then `git push`. The apply-patches workflow only runs for pushes to `main`, so nothing is applied for you on the branch, and
  main never sees them. When the branch is merged the patches and the ledger arrive together, so the workflow has nothing to apply.
- Fixes needed on main meanwhile go to main and are merged into the branch regularly (`git merge main`).
- **Identity.** The branch's app is a separate app: bundle ID `page.aspens.tillium`, its own CloudKit container, its own
  Keychain and data. It installs beside the current app, so the live shop is never touched (patch 0249).
- Merge to main only after the device tests for each finished Element, and after the rebrand if you want them together.

### Phases

| Phase | What | Risk |
| --- | --- | --- |
| P0 | This plan, the names, the branch, the new identity (0248, 0249) | none |
| P1 | The `alloykit` types, `alloys/index.ts`, selection rules, and the **boundary test** that enforces `ALLOYS.md`. Nothing calls it yet | none |
| P2 | Characterisation tests for every function in the section 2 table, against fakes | none |
| P3 | `git mv` the Shopify and Zeller code into `src/alloys/`, with shims at the old paths. Secrets helpers out of `client.ts` | low |
| P4 | Element contracts, the Shopify, Zeller and iCloud Alloys as `alloy.ts` adapters over the moved code, the router with the legacy default | low |
| P5 | Move callers to the router, one Element per patch: Catalogue, Stock, Discounts, Customers, Orders, Gift cards, Shared state, Terminal | medium: each has a device test |
| P6 | The setup picker and Settings screen: Alloy cards, tick boxes, the unchosen-Elements warning, per-Alloy credentials | medium |
| P7 | Pure Tillium for Catalogue, Stock, Orders, Discounts, Customers, then Gift cards | the largest build |
| P8 | The Smelter: dry run report, Back up and continue, Move my data, revert journal | the hardest: needs two real Alloys |
| P9 | Remove the shims; the rebrand (names, icon, strings, Help) | low |
| P10 | A fourth Alloy to prove the format; I would pick Square | each Alloy is a project |

I can build and unit test P1 to P5, the logic of P6, and most of P7 here. Anything against a live service (P8, P10, and the
device check for each P5 step) needs your accounts and devices.

PostgreSQL and SQLite are storage, not shops. An iPad app cannot open a Postgres connection itself, so Postgres means a small
REST gateway (the **Custom** Alloy) and SQLite would be a local-only Shared state. Both are Shared state Alloys, not Catalogue Alloys.

## 10. Decisions (answered 2026-11-17)

1. **iCloud is an Alloy**, for Shared state, and optionally for Customers.
2. **Customers is an optional Element.** With Pure Tillium it keeps a local list; Shopify, Square, iCloud, SQL and others
   can take it instead.
3. **First public Alloys:** Shopify, Zeller, iCloud, with Pure Tillium alongside. Square comes after the format is proven.
4. **Old refunds:** the user chooses per old Alloy, at migration time (section 6).
5. **iCloud holding customers** reverses today's rule that CloudKit never carries customer names, emails or phones. It is
   allowed only as an explicit choice with a clear warning, and the App Store privacy labels must cover it. A code-side
   switch can **disallow it completely**: `ALLOY_POLICY.icloudCustomers` in `alloykit/policy.ts`, `'allowed'` (the default) or
   `'disabled'`. When it is `'disabled'` the iCloud Alloy's Customers Element is removed at registration, the picker does not
   offer it, and the router refuses it, so a build for a shop that must never put customer details in iCloud cannot be
   switched on by mistake. The existing PII stripping stays the default behaviour for iCloud sales either way.
6. **Native UI:** an Alloy may supply one optional `host` component for a native SDK (Zeller's reader). Otherwise an Alloy
   ships no screens: setup, status and the picker are drawn from its `settings`, `limits` and `needs`.
7. **Folder names:** `src/alloys/` (Alloys only), `src/alloykit/` (shared toolbox Alloys may import), `src/alloyhost/`
   (the app's side). The entry file of a folder Alloy is `alloy.ts`.
