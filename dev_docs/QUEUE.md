# Patch queue

The work that is planned but not yet built, in the order it should be done. One line per patch, with the first step for
each so a fresh session can start without reading the whole plan. The long form lives in the plan it names.

Source of the list: the owner's answered questions of 20 October 2026, written down here so it is not only in the chat
(REPAIRS.md item S1). The plans themselves are `CLOUDKIT_SYNC_PLAN.md` (section 9) and `COMPANION_PLAN.md`, and
`PROGRESS.md` carries the patch-by-patch log once each one lands.

## Stream A: CloudKit sync, patches 4 to 8

Finish CloudKit first, while the Swift side is fresh. Two physical devices and two Apple IDs are needed for the end to
end run; the steps are T74 in `DEVICE_TESTS.md`, and the customer policy below holds for every one of them.

### CloudKit 4. Finish the scaffold

Only a scaffold exists (`abf8147`): native Sale/Rollup put/get/list in
`modules/cloudkit-sync/ios/CloudKitSyncModule.swift`, bridge methods in `modules/cloudkit-sync/index.ts`, and
`src/lib/cloudkit/cloudkitBackend.ts` behind the seam (`src/lib/syncBackend.ts`).

- Make it real: nothing calls the backend yet.
- Honour the `after` cursor in Swift `listRecords`, which is ignored today.
- Add a test for the customer stripping (see the policy note below).
- Verify the native build in a throwaway prebuild copy, because `ios/` at the repo root is gitignored. `rsync` with
  `--exclude 'ios'` also drops `modules/cloudkit-sync/ios`, so copy that folder in by hand or the module goes missing.

### CloudKit 5. Saved carts with conflict merging

Saved carts travel through the same seam, with a merge rule for the same cart changed on two registers.

### CloudKit 6. Settings, layout and Square history shards

Shared settings, the grid layout and Square history move onto the seam. Shards so one slow group cannot hold up the rest.

### CloudKit 7. Migration lease, checkpoints and verification

A lease so two registers do not migrate at once, a checkpoint per group, and a verification pass that reports what moved.

### CloudKit 8. Retire polling, add the rollback flag

Stop the metaobject polling once the seam is proven, and add a flag that puts a register back on polling without a new
build. This is where the owner decides dual-write against a clean cut-over.

## Stream B: Companion mode, patches 0177 to 0182

Then Companion mode, against `COMPANION_PLAN.md`. Patch 0175 saved the plan and 0176 added the setup checklist that
records whether a device is a register or a companion and which features it holds. The gate exists but nothing reads it.

### Companion 0177. App-wide PIN lock and step-up PIN

The device PIN, asked at open and again before anything sensitive (see the plan for which actions step up).

### Companion 0178. Wire the gate into tabs, routes, More and deep links

The recorded features actually hide what a companion does not hold: tabs, routes, the More rows and deep links. Add the
Today and Scan tabs and the phone layout here.

### Companion 0179. Hardware and sync gating

Card reader, cash drawer and the sync pages follow the same feature switches.

### Companion 0180. Quick sale, expand to full POS, send to a register

The companion's selling path, and how it hands a sale to a register.

### Companion 0181. Help, Training and assistant gating

The last three feature switches, and the docs that go with them.

### Companion 0182. Stock actions from Scan

Count, receive and adjust stock from the Scan tab.

## Rules that hold for the whole queue

- **Customers live in Shopify.** CloudKit must never carry customer names, emails or phones. A CloudKit sale keeps only
  the Shopify customer id as an opaque reference. `cloudkitBackend.ts` already strips the PII; keep that. Encryption is a
  non-issue because the fields worth encrypting are not there.
- **The seam is the contract.** `src/lib/syncBackend.ts` speaks the shop's type names (`cart`, `layout`, `sale`, `rollup`,
  `settings`). A missing backend throws "Shared storage is not connected on this till." Writes are blocked in training;
  reads stay open.
- **One concern per patch**, with its device test in `DEVICE_TESTS.md` and its line in `PROGRESS.md`.
