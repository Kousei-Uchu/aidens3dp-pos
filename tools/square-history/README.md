# Square history export (one-off)

Copies old Square **sales, refunds and report data** to the POS app. Read-only on Square. It never touches Shopify, stock, or items.

## 1. Get a Square token (once)
Square Developer Dashboard ▸ your application ▸ **Credentials** ▸ *Production* **Access token**. A personal access token already has the read permissions needed (orders, catalogue/items, customers, locations).
Copy `.env.example` to `.env` and paste the token in. `.env` is git-ignored and stays on this PC.

## 2. Run it
```sh
cd tools/square-history
npm install
npx tsx export.ts            # everything
npx tsx export.ts --from 2023-01-01 --to 2025-06-30   # optional date range
```
It prints progress, writes compressed monthly files to `out/`, then shows a **QR code** and keeps a tiny server up on your Wi-Fi. The link contains a random key, works only while the script runs, and serves only the files in `out/`.

## 3. Import on each device
POS app ▸ **Settings ▸ Square history ▸ Scan QR from PC**. (Or type the printed address, or copy `out/` to the iPad via AirDrop/Files and use **Pick files**.) Do this once per device, then press Ctrl+C on the PC.

## What gets imported
- Every completed sale and refund, as read-only history (Reports under "Square (old)"; Transactions via the *Square history* chip).
- Item lines are matched to Shopify **by SKU** (Square variation → SKU → Shopify variant, falling back to barcode/UPC), which gives proper item names, Shopify cost for profit reports, and Shopify collections for category reports. Anything unmatched stays a custom line titled `Item - Variation - Notes`, grouped by its Square category.
- Square's actual card fees, tips, cash tendered/change, gift card sales, discount names, and customer names.
- Not imported: stock, items, prices, customers as records. Customer names are only attached to the sales they belong to.
