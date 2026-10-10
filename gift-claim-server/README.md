# Gift card claim page (optional, UNTESTED against your store)

Lets a customer add their own name and email to a gift card you sold **without** an email at the till.
At the receipt step the POS shows **Claim QR**. The customer scans it with a phone camera, types a name and email, and Shopify emails them the card. It works once per card.

The POS works without this. Typing the recipient's email at the till still works exactly as before.

## Setup
1. **Make a separate Shopify app** for this Worker (Dev Dashboard, like the pass server). Scopes: `read_gift_cards`, `write_gift_cards`, `read_customers`, `write_customers`. Do not reuse the POS app's login.
2. Deploy:
```
cd gift-claim-server && npm install
npx wrangler kv namespace create CLAIMS     # paste the id into wrangler.toml
openssl rand -hex 32                         # this is CLAIM_SECRET
for s in CLAIM_SECRET SHOPIFY_DOMAIN SHOPIFY_CLIENT_ID SHOPIFY_CLIENT_SECRET SHOP_NAME; do npx wrangler secret put $s; done
npx wrangler deploy
```
`SHOPIFY_DOMAIN` is the `your-store.myshopify.com` address.
3. In the app: **Settings ▸ Gift cards ▸ Gift card claim page**: the Worker URL and the same `CLAIM_SECRET`.

## How it stays safe
- A link is `/c/<CODE>.<SIGNATURE>`; the signature is an HMAC of the code with `CLAIM_SECRET`, made by the POS. Edited, guessed or forged links get "not valid".
- It only works for cards the POS created (the code's checksum must match the card's note), that are enabled, and that have no recipient yet.
- One claim per card: it is locked before anything is sent, and unlocked again only if Shopify fails.
- Light per-IP rate limit (KV, approximate). Pages are `noindex`, never cached, and send no referrer.
- The page shows only the last 4 characters of the card, never the balance or full code.
- Limits: anyone who has the printed/shown QR can claim the card, the same as holding a paper card. KV is not atomic, so two phones submitting in the same instant could in theory both pass the check; Shopify still holds one recipient per card.

## Not verified
Whether Shopify sends the card email when a recipient is *added to an existing card* is not in its docs. The Worker sends the notification itself after setting the recipient. If your test card arrives **twice**, tell Claude and that call will be removed.