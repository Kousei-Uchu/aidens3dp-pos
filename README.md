# Shopify × Zeller POS

A point-of-sale app for iPhone and iPad that sells your Shopify catalogue through a Zeller card terminal. Built for a real shop: one physical cash drawer, split tenders, gift cards, refunds, staff PINs, a training mode, and receipts that are actually valid for tax.

- **Shopify** holds the catalogue, stock, orders, customers, discounts and gift cards.
- **Zeller** takes the card payments (their terminal does the tapping; the app just drives it).
- **Expo / React Native 0.81** (SDK 54), Swift via `react-native`, no dev server needed on device.
- **Cloudflare Workers** for the docs site, gift-card claim pages, Apple Wallet passes, and receipt pages.

## Status

The logic layer (pricing, bundles, cash rounding, split tenders, returns, reports, CSV, Shopify order building) is unit-tested (`npm test`, 1200+ tests) and the project passes strict `tsc`. The in-app help (64 pages) is written and maintained alongside the code. Device and store behaviour is being verified on real hardware; `docs/DEVICE_TESTS.md` is the checklist.

This is one person's shop app, not a product. It is public so the code can be inspected, forked and learned from. There is no support channel.

## Getting started

Read [SETUP.md](SETUP.md). Short version:

1. `npm install` (the Zeller SDK is a closed-source optional dependency; copy the tarballs you were given into `vendor/` and run `npm run zeller` if you have them).
2. Create a Shopify Dev Dashboard app with the scopes listed in SETUP.md; enter the domain, client ID and secret in the app's Settings ▸ Shopify.
3. `npx expo prebuild --platform ios`, open the Xcode workspace, pick your team, run to a plugged-in device. Or `npm run ios`.

## Where things live

| Path | What it is |
|---|---|
| `src/` | The app. Screens, pricing, Shopify client, Zeller bridge, training mode, in-app assistant. |
| `help/` | In-app help pages (Markdown with citations and hand-written screen figures). Built into `help/help.json`. |
| `docs-server/` | Cloudflare Worker that serves the help as a searchable website. |
| `gift-claim-server/` | Cloudflare Worker for gift-card claim pages (recipient name, QR). |
| `receipt-server/` | Cloudflare Worker that merges Zeller's card details with Shopify's items into one tax invoice per sale. |
| `pass-server/` | Cloudflare Worker that issues Apple Wallet gift-card passes. |
| `tests/` | The test suite. `npm test`. |
| `docs/` | Dev docs: progress log, patch history, device test checklist, guesses we made without asking. |
| `patches/` | Numbered patch files for every change, with `APPLIED.txt` as the ledger. |

## How sales are stored

Every sale, refund, declined attempt and cash movement goes to local CSVs on the device (`sales.csv`, `sale_lines.csv`, `events.csv`) that are never auto-cleared and can be exported from Settings ▸ Data. Orders go to Shopify tagged `pos`. Saved carts, grid layout, sales log, daily rollups and shared settings live in Shopify metaobjects (`pos_*`), polled by each register every ~25 seconds.

## Licence

See [LICENCE](LICENCE) if one exists in this repo; otherwise no licence has been granted and all rights are reserved by the author. Public source is not the same as open source.
