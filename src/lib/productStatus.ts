// Location: src/lib/productStatus.ts
// Shopify product status -> what the till does with it. Active and Unlisted products are sellable and shown; Draft and
// Archived products are kept only for Inventory (behind its status filter). Pure, so it is testable.
export type ProductStatus = 'ACTIVE' | 'UNLISTED' | 'DRAFT' | 'ARCHIVED';
const KNOWN: readonly ProductStatus[] = ['ACTIVE', 'UNLISTED', 'DRAFT', 'ARCHIVED'];

/** Shopify's status text as one of ours, or undefined for anything unrecognised. */
export const parseProductStatus = (raw: unknown): ProductStatus | undefined => KNOWN.find(x => x === raw);

/** Sellable and listed in the till: Active, and Unlisted (hidden from the online store's lists but still for sale). */
export const isSellableStatus = (s: ProductStatus | undefined): boolean => s === 'ACTIVE' || s === 'UNLISTED';
