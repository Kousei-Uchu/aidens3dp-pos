---
id: settings
title: Settings
parent: start
summary: Find Shopify, payment, hardware, data, receipt, backup, display and other register settings.
tags: [settings, Shopify, payments, fees, rounding, hardware, scanner, receipts, backup, theme]
related: [settings/shopify, settings/payments, settings/hardware, settings/scanner-codes, settings/receipts, settings/backup, settings/theme, settings/cloud-sync, start/setup, device-mode, staff/screensaver, staff, sales/bundles, sales/cart-warnings, settings/assistant]
updated: 2026-10-11
roles: [manager, owner]
---
Open **More ▸ Settings** to configure Shopify, payments, discounts, hardware and this register. Tap a section to open it; use the back button to return to the Settings list.

## Basic

### Find a setting
- **Shopify** connects the register to your shop; see [[settings/shopify]].
- **Payments** contains cash rounding, Smart change and card fee estimates; see [[settings/payments]].
- **Discounts & bundles** manages the bundle deals used in Checkout.
- **Cart warnings** sets the prompts shown at Charge for chosen items or categories. See [[sales/cart-warnings]].
- **Hardware** opens the scanner test; see [[settings/hardware]].
- **Data** exports chosen records as CSV files or a spreadsheet, shares the raw CSV files, links a second register to this one's records, or deletes local history. See [[settings/cloud-sync]].
- **Square history** imports old Square sales for Reports.
- **Grid import / export** moves the Checkout tile layout.
- **AI assistant** (owners, or managers when there is no owner) sets the model the Help assistant will use. See [[settings/assistant]].
- **Gift cards** has the claim-page and cashier-pass server settings.
- **Receipts** configures receipt and tax-invoice details; see [[settings/receipts]].
- **Backup & transfer** moves settings and logins to another device; **Data** exports or deletes local CSV history. See [[settings/backup]].
- **Screensaver & display** controls this iPad's idle screen and Keep iPad awake; see [[staff/screensaver]].
- **Theme** changes the app's appearance; see [[settings/theme]]. **About** shows app information.

**Device mode** is in More, not in Settings: it says whether this device is a register or a companion, and holds the six register feature switches. See [[device-mode]].

The Settings list also has Checkout options for consolidating identical items and the tax display. Managers and Owners can access Settings when staff sign-in is required; cashiers cannot.

## Deep

### Settings are not all shared the same way
Some choices apply only to this register, such as Smart change and Screensaver & display. Shared settings, such as staff and bundle deals, sync with the other registers. The screen or setting guide explains when a choice is local.

The Payments section shows fee rates used for estimates. Zeller does not report actual card fees to the POS, and the automatic cash tender machine is still under construction; cash is entered and given by hand.

## Advanced

### Settings sections
| Section | Component or route |
|---|---|
| Settings list and section navigation | `src/screens/Settings.tsx` |
| Shopify connection and catalogue import | `ShopifySettings` in `src/screens/Settings.tsx` |
| Payments, fees and cash rounding | Payments section in `src/screens/Settings.tsx` |
| Bundle deals | `BundlesEditor` in `src/screens/BundleBuilder.tsx` |
| Hardware scanner test | `HardwareTest` in `src/screens/ScannerSpeed.tsx` |
| Screensaver and display | `DisplaySettings` in `src/screens/Settings.tsx` |
| Settings model and defaults | `src/state/store.ts` |

Each section is a panel within the Settings screen. Its values may be stored locally, shared with the other registers, or held in the iPad's secure storage depending on the setting.
