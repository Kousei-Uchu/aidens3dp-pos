// Location: src/lib/giftCode.ts
// A9.5: gift card QR codes carry a prefix like `shopify-giftcard-v1-CODE`. Anything that types, pastes or scans a code goes through here,
// so the prefix is stripped in one place. Pure (no native imports) so it can be unit tested.

/** Anchored to the known prefix on purpose: a looser "everything before the last hyphen" would cut any code that contains a hyphen. */
const PREFIX = /^shopify-giftcard-v\d+-/i;

/** Remove the QR prefix if (and only if) it is there. Whitespace around the value is ignored. */
export const stripGiftPrefix = (raw: string): string => raw.trim().replace(PREFIX, '');

/** The form Shopify stores: no prefix, letters and digits only, upper case. */
export const normaliseCode = (raw: string): string => stripGiftPrefix(raw).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

/** What a gift card QR should contain. Version 1 until the format changes. */
export const giftQrPayload = (code: string, version = 1): string => `shopify-giftcard-v${version}-${normaliseCode(code)}`;

/** True when a scanned value is a gift card QR (so the item scanner can say so instead of "no item found"). */
export const isGiftQr = (raw: string): boolean => PREFIX.test(raw.trim());
