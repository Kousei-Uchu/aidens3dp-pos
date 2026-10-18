---
id: concepts/glossary
title: POS glossary
parent: concepts
summary: Plain-English meanings for register, Shopify, scanner, staff and payment terms used throughout this help.
tags: [glossary, SKU, GID, variant, outbox, tender, cashier pass, inventory, sync]
related: [concepts, concepts/data-and-sync, concepts/roles, concepts/money]
updated: 2026-10-11
---
Use this page when a POS or Shopify term is unfamiliar. Button names appear in **bold**; code identifiers are shown in `monospace`.

## Basic

### Products and stock
- **Variant:** one sellable choice of a Shopify product, such as a particular size or colour.
- **SKU:** the merchant's stock-keeping code for a variant. In Checkout, a scanner can find a variant by its SKU or barcode.
- **Barcode:** the scannable product code stored on a variant. Barcode lookup normalises leading zeroes to match common UPC/EAN formats.
- **Shopify ID / GID:** Shopify's internal identifier for a record. It is not the product code staff should scan at Checkout.
- **Tracked / not tracked:** Shopify either keeps a quantity for this variant or does not. In Inventory, a dash means not tracked; zero is a tracked variant with no available stock.
- **Available:** the Shopify stock quantity the POS imports for the selected location.

### Sales, staff and sync
- **Tender:** how the customer pays: cash, card or gift card.
- **Outbox:** the local queue of completed sales and upload steps waiting to reach Shopify.
- **Cashier pass:** a scannable credential that signs in a staff member; it is different from a product barcode.
- **Role:** Cashier, Manager or Owner access assigned to a staff record.
- **Unknown payment:** the POS cannot yet confirm whether a card payment completed. Check Zeller before charging again.

## Deep

### Similar words that mean different things
- A **SKU** is a merchant-defined product code; a Shopify **GID** identifies a record inside Shopify. Scanners should use the variant's barcode or SKU, not its GID.
- A stock count of **0** is not the same as **not tracked**. One is a tracked quantity; the other has no inventory quantity.
- A **queued** sale is saved locally and waiting to upload. A **blocked** sale needs a person to fix the cause before retrying.
- A card **decline** is a known result. An **unknown** result is not a decline and is not safe to retry until checked.

### Guided checkout and price adjustments
- **Guided checkout:** a step-by-step checkout that asks about items, discount, review and payment, with customer details as an optional extra step.
- **Line price:** a chosen price for the whole line and its quantity.
- **Item price:** a chosen unit price for a selected quantity of one item.
- **Whole order price:** a chosen total distributed over eligible cart lines.
- **Adjustment review:** the check before payment that asks staff to keep, change or remove a flagged price adjustment.

## Advanced

### Where key terms are implemented
| Term | Where |
|---|---|
| Barcode and SKU match | `findByBarcode`, `normaliseBarcode` in `src/lib/cartOps.ts` |
| Shopify variant data and available quantity | `Variant` in `src/lib/types.ts`, `fetchVariants` in `src/lib/shopify/catalogue.ts` |
| Local upload queue and per-step state | `OutboxItem` in `src/state/store.ts`, `processOutbox` in `src/lib/sync.ts` |
| Tender and unresolved card attempt | `Tender`, `Attempt` in `src/state/store.ts` |
| Staff roles | `Role` in `src/lib/types.ts` |
| Guided flow steps | `STEPS` in `src/lib/guidedFlow.ts` |
| Price adjustment types | `AdjustKind` in `src/lib/adjustReview.ts` |

For the data lifecycle, see [[concepts/data-and-sync]]. For money calculations, see [[concepts/money]].
