# Patch queue

The work that is planned but not yet built, in the order it should be done. One line per item, with the first step so a
fresh session can start without reading the whole plan. Brought up to date on 2026-11-14, through patch 0242. What is
built is in `PROGRESS.md`; the open items outside this queue are in `TO_DO.md`.

## Stream A: CloudKit sync is built

Patches 4 to 8b, the leftovers and the first-run fixes (0231 to 0241) are all in. Nothing from the old list of CloudKit 4
to 8 is waiting to be built. What remains is in `TO_DO.md` section 3b and is not new code unless noted:

### Retire the 25 second poll

The poll stays as the fallback for change pushes (0225). Remove it only after T111 shows pushes arrive reliably on the
owner's two iPads. First step: read T111's result, then make the tick in `App.tsx` run only when pushes are not listening.

### Run the poll's steps in parallel (only if iCloud is slow again)

`pollSharedWork` in `src/lib/sync.ts` runs about twenty steps one after another. Read the Last full sync line in
Support & diagnostics first (0239). Then group the steps that write different parts of the state and run each group with
`Promise.all`. Check what each step writes before grouping; the source-reading tests (`attemptpull`, `noticesync`,
`logosync`) pin their order.

## Stream B: Companion mode

Patches 0175 to 0182 are in (plan, setup checklist, PIN lock, the gate, the card reader and drawer switches, quick sale,
Help and Training gating, and stock actions from Scan; see `PROGRESS.md`). Only the device tests are left (C23).

## Rules that hold for the whole queue

- **Customers live in Shopify.** CloudKit must never carry customer names, emails or phones. A CloudKit sale keeps only
  the Shopify customer id as an opaque reference. `cloudkitBackend.ts` already strips the PII; keep that. Encryption is a
  non-issue because the fields worth encrypting are not there.
- **The seam is the contract.** `src/lib/syncBackend.ts` speaks the shop's type names (`cart`, `layout`, `sale`, `rollup`,
  `settings`). A missing backend throws "Shared storage is not connected on this till." Writes are blocked in training;
  reads stay open.
- **One concern per patch**, with its device test in `DEVICE_TESTS.md` and its line in `PROGRESS.md`.
