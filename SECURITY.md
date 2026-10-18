# Security policy

## What this repo is

A point-of-sale app for one shop. It is public for inspection, not distributed as a product. There is no supported-version matrix and no bug bounty.

## Reporting a vulnerability

Open a GitHub issue with the word SECURITY in the title, or if it is genuinely sensitive, contact the author through their GitHub profile. Expect a human response time measured in weeks.

## Threat model, honestly

The serious assets are:

- **The Shopify client secret.** It has write access to the store and lives in each iPad's Keychain. Rotate it in the Dev Dashboard if a device goes missing. It is never written to the CSVs or logs.
- **The pass-server and receipt-server secrets.** These Workers hold shared secrets that let a device publish gift-card passes and receipt pages. They are environment variables on Cloudflare, never in the repo or the app binary.
- **Staff PINs.** Stored hashed. A PIN locks the register, not the iPad; use a device passcode and Find My as the real layer.

Known limitations worth stating plainly:

- The Shopify client credentials are entered by the shop owner into the app and stored in the device Keychain. A jailbroken device with the keychain dumped has store write access. That is the standard risk of any client-credentials POS integration.
- The receipt and claim Workers validate requests with shared secrets, not per-user auth. Anyone who has a receipt URL can view that receipt. The URLs are unguessable and printed as QR codes on paper.
- Local CSVs contain the full sales history in plain text on the device, by design (they are the tax record). Device encryption and a passcode are the protection.
