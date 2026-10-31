# CloudKit sync: decisions and open items

Aiden’s 3D Printing POS · 31 October 2026 · written against `main` at commit 9f855c2 (patch 0181)

Rechecked on 31 October 2026 against `main` at 50af9e2 (patch 0188). Nothing here changed except the shared drawer shift (item 6) and the events list (item 12), which now carry the loan to the drawer added by 0188.

## What this is

This records every decision made on 31 October 2026 about what syncs through iCloud (CloudKit) and what stays on each device. It also lists what is still undecided, with a recommendation for each open point. Items keep the numbers from the review (1 to 27) so they can be cross-referred. It builds on `dev_docs/CLOUDKIT_SYNC_PLAN.md`, which it corrects in several places (see “Changes to make to the plan and help pages” near the end).

Tags used: **Sync** (goes to iCloud and is shared between registers), **Local** (stays on the device), **Open** (not settled yet).

## At a glance

- **Sync, decided:** 1, 2, 3, 5, 6, 9, 13, 14, 15, 17, 18, 19, 20, 21, 23.
- **Local, decided:** 4, 7, 8, 16, 22, 24, 25, 26.
- **Settled in this round:** 10 (notices), 12 (CSV history), 27 (grid version).
- **Open:** only the encryption test (O4), which is deferred.
- **Understanding confirmed:** 11 (the other-tills cache).

## A. Items where the plan contradicted itself or the code

**1. Staff list, including PIN and badge hashes. Sync fully.** Each staff entry holds a name, a role, a PIN hash and salt, and a badge hash and salt. All of it now syncs, so a PIN set on one iPad works on every iPad. The plan’s line that PIN hashes never reach iCloud is therefore wrong and has to be rewritten. Decided (Q8): accepted, because the share link is private. All owner logins can reprint a cashier pass from any iPad, so the pass codes sync too, encrypted (note N1).

**2. Staff display settings. Sync.** Each person’s display mode (Standard, Simple, Minimal, Custom) and personal theme, accent and tile size travel with their staff entry, so they follow the person to any iPad. The iPad’s own theme, accent and tile size (item 22) stay local. I have not checked which of the two wins on screen today; the sync should not change that rule.

**3. Receipt profile. Sync.** The business details printed on receipts, including the receipt server URL. The receipt server secret syncs too, encrypted (Q9, note N1). The logo is item 14.

**4. Inventory screen preferences. Local.** Filters, sort and grouping are a viewing habit, not shop data.

**5. Fees, cash rounding and Require PIN. Sync.** These already sync through Shopify today and move to CloudKit with the other shared settings. The plan’s section 5 table left them out and needs them added.

**6. Cash drawer. Sync fully, one single shared drawer.** The drawer is the shift (open or closed, float, paid in, paid out, and the loan still owed back, `loanCents`, added by 0188) and the ledger (current note and coin counts plus up to 1000 history entries). It belongs to the shop, not to any till. Notes:

- Expected cash and the float report already read from the shared ledger, so most of the code agrees. Anywhere that still assumes “this till’s drawer” needs an audit (a comment in the store still says a drawer figure must stay this till’s).
- The Cloud sync help page says drawer cash is never merged. That is wrong and must be fixed.
- Suggested CloudKit shape: the shift as one record, and each ledger entry as its own append-only record named by its id, with the counts worked out from the entries. This matches how the app already merges entry lists, and avoids one record holding 1000 entries (Q12).
- Cash taken on a phone with the drawer feature off is still allowed and flagged for the next count (an earlier companion-mode decision).

**7. Sync bookkeeping fields (`drawerVersion`, `drawerPending`, `drawerShiftPending`, `warningListVersion`, `warningListPending`). Local, decided.** You were unsure, so here is what they are. Each one is a note a single iPad keeps about itself, not shop data:

- `drawerVersion` and `warningListVersion` mean “the newest version of the shared record that I have seen”.
- `drawerPending` and `warningListPending` mean “I have a change that has not been uploaded yet”.
- `drawerShiftPending` means that unsent change included opening, closing, paid in or paid out, so an older update must not overwrite it.

If these synced, every iPad would see the others’ values. One iPad could then wrongly believe it was up to date, or believe someone else’s unsent change was its own, and skip a real upload. They describe where this iPad is in the sync, so they only make sense per device. CloudKit also keeps its own per-device sync position (a server change token) that is never shared, and once the CloudKit backend is live it replaces most of these counters. Decided (Q1): **Local**.

## B. Things the plan never mentioned

**8. Outbox (queued sales waiting for Shopify). Local.** It is a per-device work queue. If two iPads shared one queue they could both create the Shopify order for the same sale. The finished sale record itself syncs. Decided (Q11): if an iPad dies with sales still queued, another register can find sales that have no Shopify order and create it.

**9. Payment attempts. Sync, labelled with the register name.** Each attempt (started, approved, declined, cancelled, unknown) syncs with the name of the register that made it, so a manager can see unresolved payments shop-wide. Decided (Q10): any register can resolve an unresolved payment, and the first resolution wins.

**10. Notices. Local, but sync the ones that make sense.** The app has eight kinds: sync, queue, stock, reader, refund, pass, info and cash. Approved (Q2):

- Sync **cash** (a drawer count is needed and the drawer is now shared) and **refund** (a failed refund needs a manager wherever they are).
- Keep **sync, queue, reader, stock, pass and info** local, because each describes one iPad or is derived from Shopify on each iPad.
- Reading or dismissing a notice is per iPad, so it does not clear it on the other iPads (Q2).

**11. The other-tills history cache (`pos.shared`). Understanding confirmed.** Yes, you understood it correctly. Today each till pulls other tills’ sales and daily totals from Shopify into this cache. Once CloudKit carries sales (plan patch 4), it becomes a local cache fed from CloudKit, and the Shopify pull is retired. The cache itself is not synced.

**12. Local CSV history files. Decided: keep a local copy and also have a shared copy.** The three files (`sales.csv`, `sale_lines.csv`, `events.csv`) stay on each iPad exactly as they are, never auto-cleared, as the safety copy. The shared copy, as agreed:

- Do not sync the CSV files as files. The app appends by reading the whole file and rewriting it, so two iPads editing copies would conflict.
- Sales and sale lines are already covered by the synced sale records (items 17 and 18), so they need nothing new.
- `events.csv` is the gap. It holds declined and unknown payments, voids, overrides, errors, paid in and out, shift opens and closes, no-sales, cancelled and failed refunds, and staff switches. Only paid in and out reach the shared ledger today (a loan to the drawer and taking it back are paid in and out with a loan label, 0188). Sync events as their own append-only records (one per event, named by id, labelled with the register), and let the app build a combined CSV from them on demand.

Confirmed (Q3).

**13. Assistant audit log. Sync, labelled with the register.** Every assistant exchange, from every register, visible to managers in one place. Decided (Q4): the whole log syncs, encrypted, including anything a local model was sent, such as customer names. That is an exception to the plan’s rule that no customer name, email or phone reaches CloudKit (note N2).

**14. Branding logo. Sync.** Stored as an iCloud asset alongside the receipt profile, so a new register prints the logo without a backup restore.

**15. Training progress. Sync per staff member, and owners and managers can reset progress.** Progress follows the person across iPads. Training and demo data itself is still never synced; only the progress marks are. Decided (Q5): owners can reset anyone’s progress, and managers can reset progress for roles below manager. All modules can be reset (O1).

**16. The `cloudkit.backend` flag. Local.** It is the rollback switch. If it synced, one wrong flip would move every till at once.

**17. Tender and card details. Sync all, encrypt where necessary.** Every field on a tender syncs. Card tenders also carry a masked card number, last four digits, approval code, retrieval reference, receipt link, response code and transaction references. This reverses the plan’s earlier “plain fields now, encryption later” decision: encryption is now in scope from the first sales patch. Decided (Q6): encrypt the card fields (masked number, last four, approval code, retrieval reference, receipt link, response code, transaction references) using CloudKit’s encrypted fields, and keep kind, amount, tendered and change in plain fields. In plain terms: encrypted fields can only be read by the registers in your share and cannot be searched, so amounts stay plain to let reports add them up. I have not confirmed that encrypted fields read correctly for a participant in a shared zone on a different Apple ID, so that needs a two-device test early (O4).

**18. Staff name, notes, reasons and price adjustments on sales. Sync.** These are what make reports and audits useful. One small residue: a free-text note could contain a customer’s name, which the plan promises never reaches CloudKit. You have accepted that sales sync, so treat this as a known, minor exception unless you want notes scrubbed.

## C. Settings covered only by “everything else is per-device”

**19. Shop name. Sync.**

**20. Pass server URL and gift claim URL. Sync.** The addresses sync. The secrets that go with them also sync, encrypted (Q9, note N1).

**21. Auto-receipt. Sync, decided.** This setting has two values, “ask” and “none”. After a sale, “ask” prompts the cashier about a receipt and “none” skips it. It decides what a till does at the end of every sale. Decided (Q7): **Sync**, so every till ends a sale the same way.

**22. Accent, glass surfaces, item spotlight, theme setup version. Local.** Look and feel of the device.

**23. Smart change and consolidate. Sync fully.** These choose how cash change is made up. They are now shop-wide, matching the shared drawer. The code comment that calls smart change “per device like the drawer ledger” is out of date and should be fixed.

**24. Catalogue cache (variants, collections, customers). Local.** Derived from Shopify, and it exists so items and customers can be used offline.

**25. Automatic discounts and discount presets. Local.** Confirmed in the code: both are fetched from Shopify (the presets are Shopify discount codes), so they are derived.

**26. Catalogue and stock timestamps. Local.** They mark when this iPad last refreshed.

**27. Grid version counter. Agreed, with a plainer explanation.** The grid layout itself syncs. Today a small counter says “is the shared layout newer than mine?”. CloudKit tracks that itself through each record’s change tag, so the counter is no longer needed. It is kept only during migration, to compare the old Shopify layout with a local one, and it is not synced as data.

## Answers to the open questions (31 October 2026)

All fourteen questions are answered. The numbers are the same as before.

- **Q1 (item 7).** Local.
- **Q2 (item 10).** Approved: only the cash and refund notices sync. Reading or dismissing one is per iPad.
- **Q3 (item 12).** Confirmed. The shared copy is the synced sale records plus synced event records, with the CSV export built from them. The local CSV files stay unchanged.
- **Q4 (item 13).** Encrypt and sync the whole audit log. Note N2 covers the customer-data exception this creates.
- **Q5 (item 15).** Owners can reset anyone’s progress. Managers can reset progress for roles below manager only. Which modules: still open (O1).
- **Q6 (item 17).** Approved. In plain terms: each piece of data in an iCloud record is stored either normally or encrypted. Encrypted pieces can only be read by the registers in your share and cannot be searched. Card details are encrypted. Amounts stay normal so reports can still add them up.
- **Q7 (item 21).** Sync.
- **Q8 (item 1).** Accepted, because the share link is private. All owner logins can reprint a pass, so pass codes must be available on every iPad (note N1).
- **Q9.** The Keychain secrets sync, encrypted: the Shopify login (domain, client ID, client secret), the pass, claim and receipt secrets, and the AI key (note N1).
- **Q10 (item 9).** The first resolution wins. Any register can resolve an unresolved payment, not only the one with the reader.
- **Q11 (item 8).** Yes. A register can find sales with no Shopify order and create the order.
- **Q12 (item 6).** Approved. In plain terms: today the drawer history is stored as one bundle, so two iPads writing at the same moment can overwrite each other. With one record per cash movement, each iPad only adds lines and nothing collides, and the drawer total is worked out by adding the entries up. The shift (open or closed, float, paid in and out) is a single small record, because there is only ever one.
- **Q13.** Agreed. Every register uploads its own local-only data (events, payment attempts, audit log, training progress) once after joining.
- **Q14.** Agreed. Also wanted: a CloudKit export (note N3).

## New points from these answers

**N1. Secrets and pass codes now sync, which reverses the plan.** The plan listed the Shopify login, the pass, claim and receipt secrets, the AI key and cashier pass codes as never in iCloud. They now sync, encrypted. One caveat: encryption keeps the data from anyone outside the share, but every register in the share can read it, and the share link is read-write. Anyone holding the link can therefore reach the Shopify client secret. You have accepted that the link is private. Treat it like the shop’s keys, share it only with your own devices, and turn the share off in iCloud if a device is lost. The Shopify access token itself expires and is fetched by each register, so it stays local.

**N2. The customer-data rule has one exception.** The plan promised that no customer name, email or phone is written to CloudKit. The audit log is the exception, because it records what the model was sent and a local model can be sent customer details. It syncs encrypted. The in-app “what is in iCloud” note, the Cloud sync help page and your privacy policy wording should say this plainly.

**N3. CloudKit export (new feature).** An owner-only action that writes everything stored in CloudKit to files in the Files app. It is a backup that does not depend on the owner’s Apple ID staying healthy. It belongs in plan patch 8 or a patch of its own. Decided in O5: one zip of JSON files containing everything.

## Answers to the last five questions (31 October 2026)

- **O1.** All training modules can be reset. Owners can reset anyone’s progress, and managers can reset progress for lower roles.
- **O2.** Yes. The assistant’s connection settings (address, model name, options) sync along with the AI key, so a new register works straight away.
- **O3.** CloudKit keeps every drawer ledger entry. The app loads the latest 1000.
- **O4.** Deferred. There is no second Apple ID or device to test with right now. My suggestion, not yet agreed: build the encrypted fields behind a switch, and run the cross-Apple-ID test before turning on the encrypted secrets and pass codes (patch 6d).
- **O5.** The export is one zip of JSON files containing everything stored in CloudKit. Because it includes the secrets, the zip is as sensitive as the Shopify login itself. Keep it owner-only.

## Still open

Only the encryption test (O4), which waits for a second device.

## Additional notes

- **Record names for new types** (all deterministic, to avoid duplicates): `drawer-shift`, `ledger-<entry id>`, `attempt-<sale uuid>-<reference>`, `event-<id>`, `staff-<staff id>`, `training-<staff id>-<module>`, and audit files named by register and day, e.g. `audit-<register id>-<date>`. Each register writes only its own audit and event files, so they cannot conflict.
- **Payment data in sale records:** only masked card numbers are kept, never a full card number.
- **The privacy note in the app** (“what is and is not in iCloud”) must be rewritten. It now has to say that staff PIN hashes, encrypted card details, payment attempts, events, the audit log (including any customer names a local model was sent), training progress, and the encrypted logins, secrets and pass codes are stored in iCloud.
- **The shop’s privacy policy** stays yours to update. These changes add payment and staff data to what is stored.
- **Never synced:** the Shopify access token (each register fetches its own), the open cart, the device’s own settings (items 4, 16, 22 and the per-device settings), the catalogue cache, training and demo data.

## Changes to make to the plan and help pages

1. Section 5 table: add the drawer, fees, cash rounding, Require PIN, staff (with hashes), staff display settings, payment attempts, events, notices (cash and refund only), audit log, training progress, logo, shop name, the two server URLs, and smart change and consolidate. Resolve the inventory prefs and receipt profile contradiction (inventory prefs Local, receipt profile Sync).
2. Section 7 “never in iCloud”: remove staff PIN hashes. Also remove the cashier pass codes, the Shopify login, the pass, claim and receipt secrets and the AI key, which now sync encrypted.
3. Section 7 “what is and is not in iCloud” and the in-app note: update as above.
4. Replace the “encryptedValues later” decision with the card-field encryption decision.
5. `help/settings/cloud-sync.md`: fix “cash stays on the register it was counted on” and “each register keeps its own settings”.
6. Store comments for `smartChange` and the sales and drawer split need updating.

## Suggested patch placement (proposal, not agreed)

- **Patch 4 (sales and rollups):** sale records with encrypted card fields, payment attempts, events, and first the two-Apple-ID encryption test.
- **Patch 5 (saved carts):** unchanged.
- **Patch 6 (settings, layout, Square history):** add staff and staff display settings, the shop and receipt settings, the logo, and the shared notices.
- **New patch 6b:** the shared drawer (shift and ledger entries).
- **New patch 6c:** audit log (encrypted) and training progress.
- **Patch 7 (migration):** extend to cover each register’s own local-only data (Q13).
- **Patch 8:** unchanged.

* **New patch 6d:** the encrypted logins, secrets and cashier pass codes, built only after the encryption test (O4) passes.
* **New patch 6e:** the owner-only CloudKit export (N3), or folded into patch 8.
