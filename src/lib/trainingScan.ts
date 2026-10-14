// Location: src/lib/trainingScan.ts
// The practice barcodes, in the order the Guide uses them (so the ones it asks for are on screen without scrolling). A camera cannot scan an item that does not exist, so during practice the camera window draws these cards instead
// and a button on each plays the part of holding that barcode in front of the camera. Pure.
// The item cards carry the practice item's SKU (the till matches a scan to a barcode, then to a SKU). The torn label is a code nothing matches.
// The gift card carries a real gift card QR prefix, so the till answers exactly as it does for a real card. There is no cashier pass card on purpose:
// on the Checkout screen a scanned pass signs that person in, and practice must never change who is signed in on the real till.
export type PracticeScan = { key: string; title: string; sub: string; code: string };

export const PRACTICE_SCANS: readonly PracticeScan[] = [
  { key: 'bee', title: 'Bumble Bee', sub: 'Item barcode', code: 'TR-BEE' },
  { key: 'dragon', title: 'Red Dragon', sub: 'Item barcode', code: 'TR-DRG' },
  { key: 'torn', title: 'Torn label', sub: 'A Keyring. The code is damaged.', code: '9300000009421' },
  { key: 'gift', title: 'Gift card', sub: 'A customer\u2019s gift card QR code', code: 'shopify-giftcard-v1-TRAINPRACTICE1' },
  { key: 'sticker', title: 'Sticker Pack', sub: 'Item barcode', code: 'TR-STK' },
];
export const practiceScanOf = (key: string): PracticeScan | undefined => PRACTICE_SCANS.find(s => s.key === key);
