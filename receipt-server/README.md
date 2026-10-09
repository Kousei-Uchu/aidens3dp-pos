<!-- Location: receipt-server/README.md -->
# Receipt server (Cloudflare Worker, free tier)

Hosts the customer receipt page: Shopify order lines **and** the Zeller card details on one document, with **Download PDF**, **Save as image** and **Print**. The customer gets it by scanning a QR code on the iPad (or from a text/email link). Because it is one document, it works as a single record for tax.

- The POS uploads a snapshot of each sale to `PUT /api/r/<id>` (authorised with `RECEIPT_SECRET`).
- Customers open `GET /r/<id>`. The id is 80 bits derived from the sale, so links can't be guessed. Pages are `noindex`.
- Snapshots never expire (they are tax records). Cloudflare's free tier is far above what a shop needs.
- The PDF and image are generated in the customer's browser: nothing is sent anywhere. The "Billed to" and ABN boxes are typed in by the customer before downloading and are not stored.

## Deploy
```
cd receipt-server && npm install
npx wrangler login
npx wrangler kv namespace create RECEIPTS      # paste the id into wrangler.toml
openssl rand -hex 32                           # make a secret, then:
npx wrangler secret put RECEIPT_SECRET
npx wrangler deploy                            # prints https://pos-receipts.<you>.workers.dev
```
Then in the app: **More ▸ Settings ▸ Receipts** → paste the URL and the same secret, fill in your business name and ABN, and tap **Send test receipt**.

Optional: add a custom domain in the Cloudflare dashboard (Workers ▸ pos-receipts ▸ Settings ▸ Domains) so the QR shows e.g. `receipts.yourshop.com`.

## GST / tax notes
- Turn on **Registered for GST** only if you are. Receipts are then titled **Tax invoice** and show "Total includes GST of $x" (1/11 of the total; gift-card lines excluded). Refunds are titled **Adjustment note (refund)**.
- Tax invoices of $1,000 or more must show the buyer's name or ABN: the page has boxes for the customer to add it before downloading.
- Not registered: documents are titled **Receipt** with no GST lines. Your ABN, date, items and total are still shown.
- This is not tax advice; check the wording with your accountant.

## Limits
- Text in the PDF uses standard Helvetica (Latin characters). Emoji or non-Latin product names show as `?` in the PDF only; the web page and image show them fine.
- A receipt is created when the sale completes. If the iPad is offline, the QR shows a "not published yet" note and the page goes live when it reconnects.
