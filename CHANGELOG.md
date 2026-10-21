# Changelog

What has changed in the app, grouped the way [Keep a Changelog](https://keepachangelog.com) does it.

There are no tagged releases yet. The app version is 1.0.0 (`package.json` and `app.json`), so everything below is unreleased. Work began on 2026-10-10. This file is the short version. The full history, one entry per patch with the reasoning and what was decided, is in [`dev_docs/PROGRESS.md`](dev_docs/PROGRESS.md). Patch numbers are in brackets.

## [Unreleased]

### Added

- **AI assistant** (Help ▸ sparkles button, and More ▸ Settings ▸ AI assistant). It talks to a model you run yourself, reads the help pages and the till's own data, and never changes anything. The connection settings (0148, 0149), the chat screen (0151), the conversation log and its viewer (0152, 0156), the help, screen, link and guide tools (0157 to 0159, 0162), an offline mode (0160), the privacy gate every result passes through (0161), the product, stock and sales tools (0163, 0164), the date and screen tools (0166, 0167), the settings and status tools (0169), the cash drawer, change calculator and cart tools (0172), and the coach that helps in training Checks (0173). It only sends the tools a question is likely to need (0185). It reads sales from every register in the shop, not only the one in your hand.
- **Training mode.** Show, Info, Guide and Check for 28 task courses, from signing in to refunds, with a virtual Zeller terminal (0065 to 0140, 0183). Going off course is caught and says which course teaches the fix.
- **In-app help**, 68 pages with a searchable Help screen, depth picker, related pages and a pop-out contents menu (0028 to 0034, 0092).
- **Report export wizard.** Pick the topics and how much detail, then save CSV files or one spreadsheet with a sheet for each. Sales cover every register, and cash stays that register's own.
- **Cash drawer.** Tap the notes and coins to enter them, a ledger of what is in the drawer, Check change, Smart change that learns from your drawer history, a daily float report, and Swap my cash (0018 to 0023, 0091). The drawer is one shared drawer for the shop, and its state syncs between registers (0168).
- **Price adjustments.** Set what a line, one item or the whole order costs, with a reason, a review step before payment, and switches that stop a role from using them (0048 to 0053).
- **Display modes.** Standard, Simple, Minimal and Custom for each staff member, including a guided checkout that asks one question per screen (0025 to 0027).
- **Gift cards.** A claim page on its own Worker, with a claim QR on the receipt (0012).
- **Deals.** A bundle builder (0009), an Auto button that picks recommended pairs for a deal (0146), and several Shopify automatic discounts that now combine in one order (0006).
- **Square history import** by QR from a PC script (0008), and copying that history from one register to another (0150).
- **Grid.** Categories nested to any depth, a settings sheet for each tile, the variation picker as a page of the grid, and Lock POS, Price check and Stock check tiles (0016, 0017). Cart warnings (0142, 0145), unlisted products (0143) and scanner setup barcodes with a speed test (0144, 0147).
- **Inventory screen** with no row cap, draft and archived products, filters and sorting (0003).
- **Cloud sync between registers** with CloudKit, and **Companion mode** for a device that cuts the Register features until you ask for them. Both are in progress (`dev_docs/CLOUDKIT_SYNC_PLAN.md`, `dev_docs/COMPANION_PLAN.md`).

### Changed

- Demo mode runs on a copy of your own catalogue, customers, sales, reports and cash drawer, with practice data only where your till has none. Anything that leaves the iPad or changes a file on it is switched off in the demo: exporting or restoring a backup, changing the imported Square history, and making a cashier pass (0187).
- The app no longer draws its own sheet over the Zeller terminal's popup. A slim "waiting on terminal" strip shows instead (0013).
- Cart rows look like an invoice, with one row for each discount, and swipe to delete (0014).
- Text boxes stay visible above the keyboard, and every field has a suitable keyboard type (0002).
- The app no longer sends its own gift card email, because Shopify already sends one (0011).
- The scanner reads on Return unless timing is needed (0154). Checkout owns the one scan box, and every scan is tried as an item, then a cashier pass, a gift card QR and a saved discount (0155).

### Fixed

- The iOS folder reset script, and the scanner taking over the keyboard (0001).
- Device test fixes: the variation picker closing on tap, a split payment suggesting a split again, and the daily float report judging a float badly (0085 to 0090).
- The Price check and Stock check course taught "-5 oversold", but the sheet shows "5 oversold" (0183).
