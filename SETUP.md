<!-- Location: SETUP.md -->
# Setup — Shopify × Zeller POS (iPhone + iPad)

**Status, honestly:** the logic layer (pricing, bundles, cash rounding, split tenders, returns, reports, CSV, Shopify order building) is unit-tested (`npm test`) and the whole project passes strict `tsc`. **Nothing has been run on a device or against your Shopify store or Zeller terminal yet.** Expect a first-run debugging session; the riskiest guesses are listed at the bottom.

## 1. One-time prerequisites (on a Mac)
- Xcode 16.1+ and your Apple Developer account signed in (Xcode ▸ Settings ▸ Accounts), Node 20.19.4+ (or 22 LTS). The project is on Expo SDK 54 / React Native 0.81, inside Zeller's supported React Native range (0.76–0.81). Upgrading an older checkout: `sh scripts/upgrade-sdk54.sh`.
- Unzip, then in the project folder: `npm install`
- Copy the **Zeller Payments SDK tarballs** you were given into `vendor/` and run `npm run zeller` (it's not on npm).
- Edit `app.json` → `ios.bundleIdentifier` (e.g. `com.yourname.shopifypos`).

## 2. Shopify (Dev Dashboard app, client-credentials)
Create an app in the Dev Dashboard, install it on your store, and give it these Admin API scopes:
`read_products write_products read_inventory write_inventory read_locations read_orders write_orders read_customers write_customers read_discounts read_gift_cards write_gift_cards write_gift_card_transactions read_fulfillments write_fulfillments read_metaobjects write_metaobjects read_metaobject_definitions write_metaobject_definitions`
(`write_gift_card_transactions` is the least certain – see Risks.) You only need the **store domain, Client ID and Client secret**; they're stored in the iOS Keychain.

## 3. Build, sign, install once (no dev server)
```
npx expo prebuild --platform ios
open ios/*.xcworkspace        # Xcode: pick your Team under Signing & Capabilities
# plug in the iPhone/iPad, choose it as the destination, set scheme to Release, press Run
```
or `npm run ios` (Release build straight to a connected device). A paid developer account gives a 1-year profile; a free one expires in 7 days.

## 4. First-time app setup
1. **More ▸ Settings ▸ Shopify**: enter domain/ID/secret → *Save & test*, pick the location, tap *Set up shared storage*, then *Import from Shopify* (products, variants, stock, collections, customers, discounts).
2. **More ▸ Support ▸ Zeller ▸ Setup** to pair the terminal, then **Test purchase $1.00** (and refund it).
3. **Settings ▸ Grid import/export**: paste or pick your `grid.json` (Square's own export format isn't known – convert to `{"version":1,"pages":[…]}`), or build tiles with the pencil ▸ Edit grid.
4. Optional: **Settings ▸ Discounts & bundles** (bundle JSON), **Staff** PINs, **Gift cards** pass-server URL + secret (`pass-server/README.md`, includes the security model).

**Device security:** the Shopify client secret (write access to your store) lives in each iPad's Keychain. Use a long passcode, enable Find My + remote wipe, and rotate the secret in the Dev Dashboard if a device goes missing.

## 5. Receipts for tax (optional but recommended)
Zeller's receipt has the card details but no items; Shopify's order has the items but no card details. `receipt-server/` publishes one merged page per sale (QR code / text / email link, with PDF and image download). Follow `receipt-server/README.md`, then fill in **Settings ▸ Receipts**. Run `npm install` after unzipping updates (adds `qrcode-generator`).

## Where things live
Every sale/refund/declined attempt → local CSV (`sales.csv`, `sale_lines.csv`, `events.csv`; visible in Files ▸ app, export from Settings ▸ Data; never auto-cleared). Orders → Shopify orders (tag `pos`). Saved carts, grid layout, sales log, daily rollups and shared settings → Shopify metaobjects (`pos_*`), polled every ~25 s by each register.

## Risks / things I could not verify (check on your dev store first)
- `orderCreate` options (`inventoryBehaviour: DECREMENT_IGNORING_POLICY`, optional `fulfillment` – falls back without it).
- `refundCreate` line-item field names (`restockType`/`locationId`).
- Gift-card `giftCardDebit`/`giftCardCredit` input names and the scope above.
- Whether `productVariants`/`inventoryItems`/`metaobjects` accept the `updated_at` filter/sort used for polling.
- Shopify "Open orders" query strings in the Orders screen.
- Zeller: behaviour only as documented in the example READMEs (WebView SDK, errors returned not thrown, one call at a time).
- After a reinstall you must re-pair the terminal and re-enter Shopify credentials.
- AsyncStorage + zustand are used for local state (not SQLite); stock may go negative by design; cash rounding is recorded in the sale/CSV/order attributes rather than as an order line.
