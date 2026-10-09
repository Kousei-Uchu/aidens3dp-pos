// Item creation/edit (More ▸ Items ▸ Create item). New items are tracked and stocked at the register's location.
import { gql, throwUserErrors } from './client';
import { toDecimal } from '../money';
import { uid } from '../ids';

export type ItemInput = { title: string; priceCents: number; sku?: string; barcode?: string; costCents?: number; stock?: number; collectionId?: string };

export async function createItem(i: ItemInput, locationId: string): Promise<{ productId: string; variantId: string; inventoryItemId: string }> {
  const c = await gql(`mutation($p: ProductCreateInput!){ productCreate(product: $p) { product { id variants(first: 1) { nodes { id inventoryItem { id } } } } userErrors { field message } } }`,
    { p: { title: i.title, status: 'ACTIVE' } });
  throwUserErrors(c.productCreate.userErrors, 'Creating the item');
  const product = c.productCreate.product, v = product.variants.nodes[0];
  const u = await gql(`mutation($pid: ID!, $v: [ProductVariantsBulkInput!]!){ productVariantsBulkUpdate(productId: $pid, variants: $v) { userErrors { field message } } }`,
    { pid: product.id, v: [{ id: v.id, price: toDecimal(i.priceCents), barcode: i.barcode || undefined, inventoryItem: { sku: i.sku || undefined, cost: i.costCents !== undefined ? toDecimal(i.costCents) : undefined, tracked: true } }] });
  throwUserErrors(u.productVariantsBulkUpdate.userErrors, 'Setting the price');
  const key = uid();
  const a = await gql(`mutation($id:ID!,$loc:ID!){ inventoryActivate(inventoryItemId:$id, locationId:$loc) @idempotent(key: "${key}") { inventoryLevel { id } userErrors { field message } } }`, { id: v.inventoryItem.id, loc: locationId });
  throwUserErrors(a.inventoryActivate.userErrors, 'Stocking the item');
  if (i.collectionId) {
    await gql(`mutation($id:ID!,$p:[ID!]!){ collectionAddProductsV2(id:$id, productIds:$p){ userErrors { field message } } }`, { id: i.collectionId, p: [product.id] }).catch(() => {});
  }
  return { productId: product.id, variantId: v.id, inventoryItemId: v.inventoryItem.id };
}

export async function updateVariant(productId: string, variantId: string, i: { priceCents?: number; sku?: string; barcode?: string; costCents?: number }) {
  const v: any = { id: variantId };
  if (i.priceCents !== undefined) v.price = toDecimal(i.priceCents);
  if (i.barcode !== undefined) v.barcode = i.barcode;
  const inv: any = {};
  if (i.sku !== undefined) inv.sku = i.sku;
  if (i.costCents !== undefined) inv.cost = toDecimal(i.costCents);
  if (Object.keys(inv).length) v.inventoryItem = inv;
  const u = await gql(`mutation($pid: ID!, $v: [ProductVariantsBulkInput!]!){ productVariantsBulkUpdate(productId: $pid, variants: $v) { userErrors { field message } } }`, { pid: productId, v: [v] });
  throwUserErrors(u.productVariantsBulkUpdate.userErrors, 'Updating the item');
}
