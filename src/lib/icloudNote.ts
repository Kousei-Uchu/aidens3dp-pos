// Location: src/lib/icloudNote.ts
// The in-app note on the Cloud sync page: what is and is not stored in iCloud once sync is switched on. It is data, not screen
// code, so the wording is pinned by tests/icloudnote.test.ts and cannot drift from dev_docs/CLOUDKIT_SYNC_DECISIONS.md without a
// test failing. The shop's own privacy policy and the App Store privacy details stay the owner's to update (decisions, "Additional notes").
export type NoteBlock = { title: string; text: string };

export const ICLOUD_NOTE_INTRO = 'When Cloud sync is switched on, these things are kept in the iCloud storage of the Apple ID that set the shop up, and every till that has joined can read them. Nothing is sent before sync is switched on.';

/** Written to iCloud and shared between the tills. */
export const IN_ICLOUD: NoteBlock[] = [
  { title: 'Shop settings', text: 'Bundles, fees, cash rounding, Require PIN, adjust permissions, cart warnings, auto-receipt, smart change and consolidate, the shop name, the receipt details with the receipt, pass and gift claim server addresses, the logo, the scanner calibration and the warning list.' },
  { title: 'Staff', text: 'Each person\'s name and role, their PIN and badge hashes (not the PINs themselves), and their own display settings.' },
  { title: 'Sales', text: 'Every sale with its lines, tenders, staff name, notes, reasons and price changes, and the daily totals. Card details (the masked number, last four digits, approval code and references) are encrypted. Amounts are not, so reports can add them up. A sale refers to its Shopify customer by id only.' },
  { title: 'Payments and events', text: 'Card payment attempts, and who resolved each one, and the events log (declined and unknown payments, voids, overrides, paid in and out, shift opens and closes, no-sales, failed refunds, staff switches), each labelled with the till that made it.' },
  { title: 'Cash drawer', text: 'One drawer for the whole shop: its shift, any loan owed back, and every note and coin movement.' },
  { title: 'Layout and carts', text: 'The item grid layout, saved carts and the Square history files.' },
  { title: 'Notices and training', text: 'Cash and refund notices, and each person\'s training progress (never the practice data).' },
  { title: 'The assistant\'s log', text: 'Every exchange with the assistant, from every till, encrypted.' },
  { title: 'Logins and secrets (later)', text: 'Only after the encryption test has passed: the Shopify login, the pass, gift claim and receipt secrets, the assistant\'s key and the cashier pass codes, all encrypted.' },
];

/** Never written to iCloud. */
export const NOT_IN_ICLOUD: string[] = [
  'The Shopify access token (each till fetches its own).',
  'The cart being rung up.',
  'This iPad\'s own settings: its name, device mode, theme, accent, tile size, glass surfaces, item spotlight and inventory screen filters.',
  'The queue of sales waiting for Shopify, and the sync counters each iPad keeps about itself.',
  'The catalogue and customer cache, and the discounts fetched from Shopify.',
  'Training and Demo data.',
];

/** Said plainly because they are exceptions to what a shop might expect. */
export const ICLOUD_WARNINGS: NoteBlock[] = [
  { title: 'Customer names can be in two places', text: 'Sales never copy a customer\'s name, email or phone. But the assistant\'s log records what the assistant was sent, and a local model can be sent customer details, so the encrypted log can contain them. A free-text note on a sale can also contain a name.' },
  { title: 'The invite link is a key', text: 'Encrypted means people outside the share cannot read it. Every till in the share can, and the link lets anyone who holds it read and write the shop records. Share it only with your own iPads, and turn the share off in iCloud if an iPad is lost.' },
];
