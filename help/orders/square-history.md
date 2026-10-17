---
id: orders/square-history
title: Square history
parent: orders
summary: Export old Square sales on a PC, import them onto each register (from the PC or from another register), and understand how they appear in Reports and Transactions.
tags: [Square, history, import, export, QR, PC, share, copy, another register, Wi-Fi, SKU, barcode, reports, transactions, read only]
related: [orders, orders/reports]
updated: 2026-10-17
---
Square history is a one-time, read-only import of old Square sales and refunds. It never changes Shopify items, stock or customers.

## Basic

### Export from Square
On a PC, follow `tools/square-history/README.md`: create a Square developer app, put its production access token in the local `.env`, then run the export script. Choose a date range with `--from` and `--to`, or omit them to export the available history. Keep the script running while the iPad imports.

### Import to each iPad
On the iPad, open **Settings ▸ Square history** and either:
1. Tap **Scan QR from PC** while the PC and iPad are on the same Wi-Fi.
2. Type the address printed by the script and tap **Import from address**.
3. Copy the files from the PC's `out` folder to the iPad and tap **Pick files**.

The import shows how many sales and refunds were loaded and how many item lines matched a Shopify variant. After import, the PC script can be stopped. Repeat the import on each register that needs this history.

### Copy history from one register to another
Once one register has the history, the others do not need the PC. On the register that has it, open **Settings ▸ Square history** and tap **Show QR for another register**. On the other register, open **Settings ▸ Square history**, tap **Scan QR from PC** and scan that code. Both registers must be on the same Wi-Fi.

The code is a single small address, not the data itself, so it scans easily. The sharing register shows how many registers it has sent to. Keep its page open until the other register says it is done, then tap **Stop sharing**. Sharing also stops by itself after 10 minutes, or if the app leaves the screen. The other register links the history to its own Shopify catalogue, so each register's matches and report numbers are built on that register.

### Find the imported records
Imported sales appear in Reports as **Square (old)** and in Transactions when the **Square history** chip is selected. They are historical and read-only: they cannot be refunded from this POS.

If you refresh the Shopify catalogue, tap **Re-match to Shopify catalogue** in Settings ▸ Square history. Use **Delete imported Square history** to remove it from this iPad.

## Deep

### What is imported and matched
Completed sales and refunds are included. Square variations link to Shopify variants by SKU first, then UPC/barcode. A match gets Shopify's item name, cost and category for reports. An unmatched line stays a custom Square line, with Square's category. The import also carries over Square's tender details, discounts, tips, fees and customer names on their sales; it does not create Shopify customer records.

### Where the files live
History is stored compressed in monthly files under the app's `Documents/square-history/` folder. Reports use a small daily rollup file; Transactions reads the detailed monthly files. Re-match rebuilds the links and report rollups from those local files without contacting Square.

### Connection and import problems
- **Timed out / could not reach the PC:** use the same Wi-Fi, leave the export script running, check the local-network permission in iOS Settings, or transfer the output files and use **Pick files**.
- **No matching SKU:** refresh Shopify catalogue, then re-match. A missing match does not lose the sale; it remains a custom line.
- **Wrong or incomplete date range:** rerun the PC export with the desired dates and import the resulting files.
- **Share with another register does not start:** the register must already have imported history, and must be on Wi-Fi. If a file is reported missing, import again first.
- **The other register cannot reach the sharing register:** both must be on the same Wi-Fi (not a guest network that separates devices), the sharing page must still be open, and Local Network must be allowed for the app in iOS Settings on both.
- The PC script serves only the export folder while it runs. Stop it when import is done. A sharing register does the same job: it serves only the imported files behind a random key, and only while its Square history page is open.

## Advanced

### Import path
```mermaid
flowchart TD
  A[PC reads Square history] --> B[Write compressed monthly exports]
  B --> C[Serve manifest by QR or copy files]
  C --> D[Install files on this iPad]
  D --> E[Link SKU then barcode to Shopify catalogue]
  E --> F[Build report rollups and transaction records]
  F --> G[Read only history]
```

| Job | Where |
|---|---|
| PC export | `tools/square-history/export.ts` |
| PC setup and use | `tools/square-history/README.md` |
| Share to another register (server, QR address, file serving) | `startShare` in `src/lib/squareShareIO.ts` |
| Share rules (address, key, routing, progress) | `answerRequest`, `shareUrl`, `shareStatus` in `src/lib/squareShare.ts` |
| Import screen | `SquareHistorySettings` in `src/screens/SquareHistory.tsx` |
| Download, file copy and storage | `installFromUrl`, `installFromPicked`, `rebuild` in `src/lib/squareHistoryIO.ts` |
| SKU/barcode matching and rollups | `linkSale`, `addToRollups` in `src/lib/squareHistory.ts` |
| Transactions and reports display | `src/screens/Transactions.tsx`, `src/screens/Reports.tsx` |

When a register shares, it takes the place of the PC script: `startShare` opens a small read-only web server on the Wi-Fi, picks a random key, and returns an address of the same shape the PC script prints, so the receiving register's scanner and `installFromUrl` need no changes. Only `manifest.json` and the files the manifest lists can be fetched, and a wrong key or file name is a plain 404.

The manifest is checked before file names are used. Each month is compressed separately so detailed history can be loaded without expanding the entire export at once.
