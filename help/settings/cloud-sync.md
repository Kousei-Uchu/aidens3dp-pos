---
id: settings/cloud-sync
title: Cloud sync between registers
parent: settings
summary: Set one register up to hold the shop's shared records, then join the others with its invite link.
tags: [cloud, icloud, cloudkit, share, registers, sync, invite link, multiple ipads, join, join a shop]
related: [settings/backup, orders/export, settings/shopify]
updated: 2026-11-02
roles: [manager, owner]
---
Open **More ▸ Settings ▸ Data ▸ Cloud sync** to link a second register to the records this one holds. One register sets the shop up and shows a link; every other register joins with that link. Both iPads need to be signed in to iCloud, and only managers and owners see this page.

## Basic

### Set up the register that holds the shop
- Open **Settings**, tap **Data**, then **Cloud sync**.
- Tap **Set up this till**. The page says this register holds the shop records and shows an **Invite link**.
- Tap **Share the invite link** to send it by Messages, email or AirDrop, or to copy it.

### Join from another register
- On the other iPad, open **Settings ▸ Data ▸ Cloud sync**.
- Paste the link into the box and tap **Join**. The page then says the register has joined.
- If the link is tapped on the iPad itself, the app opens with the link already in the box: just tap **Join**.

### What you need
- Both iPads signed in to iCloud. The top of the Cloud sync page says whether this one is.
- One register set up first. Joining needs its link: there is no list of shops to pick from.
- A manager or owner signed in, on both iPads.

## Deep

### One register holds the records
The register that sets the shop up is the owner. The shared records live in that Apple ID's iCloud storage, and that account's storage allowance pays for them, not each iPad's. A share can carry up to 100 registers.

Two things follow from that:
- If that Apple ID is lost, or the share is turned off, the shared copy goes with it. Shopify, and the CSV files each iPad keeps, are not affected.
- Ownership cannot be handed to another register later.

### What travels
- Sales, refunds, gift cards and the other shop records travel, so every register can report on all of them.
- The cash drawer is one drawer for the whole shop: its shift (open or closed, float, paid in and out, any loan) and its notes and coins ledger are merged between registers, so a cash sale on one iPad counts everywhere.
- The shared settings are the same on every register: staff (with each person's display settings), bundles, fees, cash rounding, Require PIN, adjust permissions, cart warnings, and, once sync is on, the shop name, the receipt details and the receipt, pass and claim server addresses, auto-receipt, Smart change, Consolidate identical items, and the AI assistant's address, model name and options. How each iPad looks (theme, accent, tile size, screensaver), its register name, and the assistant's log size and data rules stay on that iPad, and [[settings/backup]] is still how you copy a whole setup across.
- If two registers change settings while apart, they are joined when they meet. A setting changed on one is kept, a setting changed on both takes the later one, and people added to Staff on two registers are both kept. Someone removed from Staff on either stays removed.

### One file of every register's events
Once sync is switched on, the Cloud sync page has an **Export all events** button. It makes one CSV of the declined payments, voids, overrides, paid in and out, shift opens and closes, no-sales, cancelled and failed refunds and staff switches from every register, oldest first, with a **register** column at the end. It is built from iCloud each time you tap it. Each iPad's own `events.csv` is not changed. Practice mode cannot make it.

### Cash and refund notices on every register
Once sync is switched on, two kinds of notice reach every register: **cash** (cash taken outside the drawer, to add to the next count) and **refund** (a refund Shopify did not record, which needs a manager). A notice raised on one iPad shows up unread on the others a few seconds later, with **From** and the register's name above it. The other kinds (sync, queue, stock, reader, pass and info) describe one iPad, so they stay on it.

Reading or clearing a notice only affects the iPad you do it on. It is never sent, so it does not clear the notice on the other iPads, and a notice you cleared does not come back. A notice older than a week is not sent or shown, so a register that has just joined does not open on a pile of old ones. Practice mode never sends or takes in any.

### What is and is not kept in iCloud
The Cloud sync page lists this in full under **What is kept in iCloud**. In short:
- **Kept, and readable by every till in the share:** shop settings, staff (with PIN and badge hashes, not PINs), sales (card details encrypted, amounts plain), payment attempts, events, the one shared cash drawer, the grid layout, saved carts, Square history, cash and refund notices, training progress and the assistant's log (encrypted). The Shopify login, the pass, gift claim and receipt secrets, the assistant's key and cashier pass codes join them only after the encryption test has passed.
- **Never kept:** the Shopify access token, the cart being rung up, each iPad's own look and settings, the queue of sales waiting for Shopify, the catalogue cache and Training or Demo data.
- **Customer names:** sales hold only the Shopify customer id. The assistant's log can still contain names a local model was sent, and a sale's note can contain one.
- **The invite link is a key.** Anyone who holds it can read and write the shop records.

Your shop's own privacy policy and App Store privacy details are yours to update.

## Advanced

### How a register is linked
```mermaid
flowchart TD
  A[Settings, Data, Cloud sync] --> B{Role}
  B -->|First register| C[Set up this till: open the zone and make the invite link]
  C --> D[Share the link]
  B -->|Another register| E[Paste the link and Join]
  D --> E
  E --> F[Both registers read and write the shop records]
```

| Job | Where |
|---|---|
| The page itself, and the all-events export | `src/screens/CloudSync.tsx` |
| The wording of the iCloud note | `src/lib/icloudNote.ts` |
| The bridge and the no-native fallback | `modules/cloudkit-sync/index.ts` and `modules/cloudkit-sync/status.ts` |
| The CloudKit calls (zone, share, join) | `modules/cloudkit-sync/ios/CloudKitSyncModule.swift` |
| The iCloud container and the share link handler | `plugins/withCloudKit.js` |
| The plan and the patch list | `dev_docs/CLOUDKIT_SYNC_PLAN.md` |

### If it will not join
- **"This till is not signed in to iCloud."** Sign in to iCloud in the iPad's own Settings app on this iPad, then tap **Check again**.
- **The link opens nothing.** The app was built without its iCloud entitlement, or the link belongs to a different iCloud container. Rebuild with `npm run ios:reset`.
- **A link from another shop will not join.** A link only opens the shop it was made for. Ask the other shop's owner for its link, or set this register up as its own shop.
- **CloudKit has two environments.** A build from Xcode uses the development environment; TestFlight and the App Store use production. A share made in one is not visible in the other, so link registers that were built the same way.

### The parts that are easy to miss
- The zone is called Store on both sides. The register that set up holds it in its private database; a register that joined sees it in its shared database. That is how each register knows which side it is on.
- The invite link lets anyone who has it read and write the shop records, so treat it like a password. Turning the share off in iCloud stops it.
- iOS gives the app the share link through the AppDelegate method added by `plugins/withCloudKit.js`, because Expo does not forward that call itself. The link is also kept, so a link tapped while the app was closed can be finished from the page.
