// Location: src/lib/trainingScan.ts
// The practice barcodes. A camera cannot scan an item that does not exist, so during practice the camera window draws these cards instead
// and a button on each plays the part of holding that barcode in front of the camera. Pure.
// The item cards carry the practice item's SKU (the till matches a scan to a barcode, then to a SKU). The torn label is a code nothing matches.
// The gift card carries a real gift card QR prefix, so the till answers exactly as it does for a real card. There is no cashier pass card on purpose:
// on the Checkout screen a scanned pass signs that person in, and practice must never change who is signed in on the real till.
export type PracticeScan = { key: string; title: string; sub: string; code: string };

export const PRACTICE_SCANS: readonly PracticeScan[] = [
  { key: 'bee', title: 'Bumble Bee', sub: 'The barcode on the item', code: 'TR-BEE' },
  { key: 'dragon', title: 'Red Dragon', sub: 'The barcode on the item', code: 'TR-DRG' },
  { key: 'sticker', title: 'Sticker Pack', sub: 'The barcode on the item', code: 'TR-STK' },
  { key: 'torn', title: 'Torn label', sub: 'The label on a Keyring. It is torn, so the code is wrong.', code: '9300000009421' },
  { key: 'gift', title: 'Gift card', sub: 'A customer\u2019s gift card, shown as a QR code on the card', code: 'shopify-giftcard-v1-TRAINPRACTICE1' },
];
export const practiceScanOf = (key: string): PracticeScan | undefined => PRACTICE_SCANS.find(s => s.key === key);
