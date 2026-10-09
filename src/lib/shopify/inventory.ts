// Inventory writes. API 2026-04+ makes @idempotent(key:) MANDATORY on these mutations (verified in Shopify changelog).
import { gql, throwUserErrors } from './client';
import { uid } from '../ids';

export type AdjustReason = 'correction' | 'received' | 'cycle_count_available' | 'damaged' | 'shrinkage' | 'restock' | 'other';

export async function adjustStock(inventoryItemId: string, locationId: string, delta: number, reason: AdjustReason = 'correction', key = uid()) {
  const d = await gql(
    `mutation($i: InventoryAdjustQuantitiesInput!) { inventoryAdjustQuantities(input: $i) @idempotent(key: "${key}") {
      inventoryAdjustmentGroup { id } userErrors { field message } } }`,
    { i: { reason, name: 'available', referenceDocumentUri: `gid://pos/Adjustment/${key}`, changes: [{ delta, inventoryItemId, locationId }] } });
  throwUserErrors(d.inventoryAdjustQuantities.userErrors, 'Stock adjustment');
}

export async function setStock(inventoryItemId: string, locationId: string, quantity: number, reason: AdjustReason = 'cycle_count_available', key = uid()) {
  const d = await gql(
    `mutation($i: InventorySetQuantitiesInput!) { inventorySetQuantities(input: $i) @idempotent(key: "${key}") {
      inventoryAdjustmentGroup { id } userErrors { field message } } }`,
    { i: { reason, name: 'available', ignoreCompareQuantity: true, referenceDocumentUri: `gid://pos/Count/${key}`, quantities: [{ inventoryItemId, locationId, quantity }] } });
  throwUserErrors(d.inventorySetQuantities.userErrors, 'Stock count');
}

/** Turn on tracking at the location (new items). */
export async function activateTracking(inventoryItemId: string) {
  const d = await gql(`mutation($id: ID!) { inventoryItemUpdate(id: $id, input: { tracked: true }) { userErrors { field message } } }`, { id: inventoryItemId });
  throwUserErrors(d.inventoryItemUpdate.userErrors, 'Enable tracking');
}
