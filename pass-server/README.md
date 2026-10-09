# Apple Wallet pass server (optional, UNTESTED)

> **Current setup: cashier passes only.** Gift-card passes are switched off (Worker var `GIFT_CARD_PASSES = "off"`, app flag `GIFT_CARD_PASSES = false` in `src/lib/features.ts`). The Worker answers 404 to `/pass`, `/v1/…` and `/webhook`, and the app never shows "Add gift card to Apple Wallet".
>
> **Staff-only setup** (no Shopify, APNs or AUTH_SECRET needed):
> ```
> cd pass-server && npm install
> npx wrangler kv namespace create REGS     # paste the id into wrangler.toml (used for rate limiting)
> for s in PASS_TYPE_ID TEAM_ID SIGNER_CERT_PEM SIGNER_KEY_PEM WWDR_PEM POS_SECRET SHOP_NAME; do npx wrangler secret put $s; done
> npx wrangler deploy
> ```
> **Re-enable gift-card passes later:** set `GIFT_CARD_PASSES = "on"` in `wrangler.toml`, add the remaining secrets (`SHOPIFY_DOMAIN SHOPIFY_CLIENT_ID SHOPIFY_CLIENT_SECRET SHOPIFY_WEBHOOK_SECRET APNS_KEY_P8 APNS_KEY_ID AUTH_SECRET`), `npx wrangler deploy`, set `GIFT_CARD_PASSES = true` in `src/lib/features.ts` and rebuild the app.

The sections below describe the full (gift card) setup.

The POS works without this. It only adds "Add to Apple Wallet" after you sell a gift card, with a balance that updates by itself.
It runs on Cloudflare Workers (free tier) and needs three things from your Apple Developer account:

1. **Pass Type ID** + its signing certificate (export cert and private key as PEM → `SIGNER_CERT_PEM`, `SIGNER_KEY_PEM`; key must be PKCS#8).
2. **Apple WWDR intermediate certificate** (PEM → `WWDR_PEM`).
3. **APNs auth key (.p8)** → `APNS_KEY_P8`, plus its key id → `APNS_KEY_ID`.

```
cd pass-server && npm install
npx wrangler kv namespace create REGS     # paste the id into wrangler.toml
for s in SHOPIFY_DOMAIN SHOPIFY_CLIENT_ID SHOPIFY_CLIENT_SECRET SHOPIFY_WEBHOOK_SECRET PASS_TYPE_ID TEAM_ID SIGNER_CERT_PEM SIGNER_KEY_PEM WWDR_PEM APNS_KEY_P8 APNS_KEY_ID AUTH_SECRET POS_SECRET SHOP_NAME; do npx wrangler secret put $s; done
npx wrangler deploy
```
Generate `AUTH_SECRET` and `POS_SECRET` with `openssl rand -hex 32` (different values). Then in the app: **Settings ▸ Gift cards** → the Worker URL and the **same `POS_SECRET`** (stored in the iOS Keychain). For live balance pushes add a Shopify webhook `giftcards/update` → `https://<worker>/webhook`; `SHOPIFY_WEBHOOK_SECRET` is that app's client secret.

## Security model
- **Use a separate Shopify app** for this Worker with only `read_gift_cards` — not the POS app's credentials (those can write orders, products, etc.).
- `/pass` only accepts links the app signed (HMAC-SHA256 with `POS_SECRET`, valid 5 minutes), so a leaked or guessed URL is useless; it also checks the gift card's checksum, so only real cards get passes. Rate-limited per IP (KV, best-effort).
- Webhook calls must carry a valid Shopify HMAC. Wallet update endpoints need the per-pass `authenticationToken`.
- The signing key and APNs key live only as Worker secrets. `POS_SECRET` lives in each iPad's Keychain: a compromised iPad can request passes for cards it knows the code of — it cannot sign anything or see other cards.
- A pass contains the gift card code (it's the QR). Whoever holds the pass holds the card's value, same as a paper card.
- Limits: no App Attest (can't prove the caller is your genuine app), KV rate-limiting is approximate, and the whole thing is untested without your certs.

Honest status: this was written without your certificates, so the signing and APNs code has never been run. Expect to debug it. Passes need real icon/logo PNGs for a polished look (a 1px placeholder is bundled).


## Cashier passes (POST /staff-pass)
The app can also issue cashier passes (Staff ▸ pick a person ▸ Cashier pass). The pass is a barcode that signs that person in at the register.
Printing and PDF work without any server. "Send to Apple Wallet" asks this Worker to sign a pass, using the same Pass Type ID, certificates and `POS_SECRET` as the gift cards, so there is nothing new to configure. Redeploy once (`npx wrangler deploy`) to add the route.
- The app sends the cashier's name, role, barcode and style in a POST body, signed with `POS_SECRET` and valid for 5 minutes. The code never appears in a URL.
- The pass is static: it has no web service, so it never changes. Replacing a pass in the app gives a new code, and the old pass stops working at the register even if it is still in someone's Wallet.
- The register only stores a salted hash of the code. Only the iPad that issued a pass can print or send it again.
- Like the gift card pass, this has not been run against real certificates. Passes need real icon and logo PNGs for a polished look.
