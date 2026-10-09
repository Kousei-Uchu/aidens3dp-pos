// Location: src/lib/shopify/catalogue.ts
// Catalogue import: bulk operations for the full pull (variants, collections, customers),
// small paged queries for discounts, and an updated_at delta for stock.
import { gql, throwUserErrors, ShopifyUserError } from './client';
import { toCents } from '../money';
import { sleep } from '../ids';
import type { AutoDiscount, Collection, Customer, ManualPreset, Target, Variant } from '../types';

export async function fetchShop() {
  const d = await gql(`{ shop { name currencyCode myshopifyDomain } locations(first: 20) { nodes { id name isActive } } }`);
  return { name: d.shop.name as string, currency: d.shop.currencyCode as string, locations: (d.locations.nodes as any[]).filter(l => l.isActive).map(l => ({ id: l.id as string, name: l.name as string })) };
}

// ── bulk operations ──────────────────────────────────────────────────────────
async function runBulk(inner: string, onProgress?: (s: string) => void): Promise<any[]> {
  const start = async (): Promise<void> => {
    for (let i = 0; i < 60; i++) {
      const d = await gql(`mutation($q:String!){ bulkOperationRunQuery(query:$q){ bulkOperation{ id status } userErrors{ field message } } }`, { q: inner });
      const errs = d.bulkOperationRunQuery.userErrors as any[];
      if (!errs?.length) return;
      if (/already in progress|already running/i.test(errs[0].message)) { onProgress?.('Waiting for another bulk job…'); await sleep(3000); continue; }
      throwUserErrors(errs, 'Bulk import');
    }
    throw new ShopifyUserError('Bulk import is busy — try again in a minute.');
  };
  await start();
  for (let i = 0; i < 400; i++) {
    await sleep(i < 5 ? 1200 : 2500);
    const d = await gql(`{ currentBulkOperation(type: QUERY) { id status errorCode objectCount url } }`);
    const op = d.currentBulkOperation;
    if (!op) continue;
    onProgress?.(`${op.status.toLowerCase()} · ${op.objectCount ?? 0} records`);
    if (op.status === 'COMPLETED') {
      if (!op.url) return [];
      const text = await (await fetch(op.url)).text();
      return text.split('\n').filter(Boolean).map(l => JSON.parse(l));
    }
    if (op.status === 'FAILED' || op.status === 'CANCELED' || op.status === 'EXPIRED') throw new ShopifyUserError(`Bulk import ${op.status.toLowerCase()} (${op.errorCode ?? 'no code'})`);
  }
  throw new ShopifyUserError('Bulk import timed out.');
}

const img = (u?: string | null) => (u ? `${u}${u.includes('?') ? '&' : '?'}width=400` : undefined);

export async function fetchVariants(locationId: string, onProgress?: (s: string) => void): Promise<Variant[]> {
  const rows = await runBulk(`{ productVariants { edges { node {
    id title sku barcode price compareAtPrice updatedAt image { url }
    inventoryItem { id tracked unitCost { amount } inventoryLevel(locationId: "${locationId}") { quantities(names: ["available"]) { name quantity } } }
    product { id title status tags featuredMedia { preview { image { url } } } }
  } } } }`, onProgress);
  return rows.map((n): Variant => {
    const q = n.inventoryItem?.inventoryLevel?.quantities?.find((x: any) => x.name === 'available');
    const tracked = !!n.inventoryItem?.tracked;
    return {
      id: n.id, productId: n.product.id, productTitle: n.product.title,
      variantTitle: n.title === 'Default Title' ? '' : n.title,
      sku: n.sku || undefined, barcode: n.barcode || undefined,
      priceCents: toCents(n.price), compareAtCents: n.compareAtPrice ? toCents(n.compareAtPrice) : undefined,
      costCents: n.inventoryItem?.unitCost ? toCents(n.inventoryItem.unitCost.amount) : undefined,
      inventoryItemId: n.inventoryItem?.id, tracked, stock: tracked ? (q?.quantity ?? 0) : null,
      image: img(n.image?.url ?? n.product.featuredMedia?.preview?.image?.url), tags: n.product.tags ?? [],
      active: n.product.status === 'ACTIVE', status: (['ACTIVE', 'DRAFT', 'ARCHIVED'] as const).find(x => x === n.product.status), updatedAt: n.updatedAt,
    };
  });
}

export async function fetchCollections(onProgress?: (s: string) => void): Promise<Collection[]> {
  const rows = await runBulk(`{ collections { edges { node { id title image { url } products { edges { node { id } } } } } } }`, onProgress);
  const map = new Map<string, Collection>();
  for (const r of rows) {
    if (!r.__parentId) map.set(r.id, { id: r.id, title: r.title, image: img(r.image?.url), productIds: [] });
  }
  for (const r of rows) if (r.__parentId) map.get(r.__parentId)?.productIds.push(r.id);
  return [...map.values()];
}

export async function fetchCustomers(onProgress?: (s: string) => void): Promise<Customer[]> {
  const rows = await runBulk(`{ customers { edges { node { id displayName email phone numberOfOrders amountSpent { amount } note } } } }`, onProgress);
  return rows.map((r): Customer => ({
    id: r.id, name: r.displayName || r.email || r.phone || 'Customer', email: r.email || undefined, phone: r.phone || undefined,
    orders: Number(r.numberOfOrders ?? 0), spentCents: r.amountSpent ? toCents(r.amountSpent.amount) : 0, note: r.note || undefined,
  }));
}

// ── stock delta (multi-register) ─────────────────────────────────────────────
export async function fetchStockDelta(sinceISO: string, locationId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  let after: string | null = null;
  for (let page = 0; page < 20; page++) {
    const d: any = await gql(
      `query($q:String,$loc:ID!,$after:String){ inventoryItems(first: 100, after:$after, query:$q) { pageInfo { hasNextPage endCursor }
        nodes { id inventoryLevel(locationId:$loc) { quantities(names:["available"]) { name quantity } } } } }`,
      { q: `updated_at:>'${sinceISO}'`, loc: locationId, after });
    for (const n of d.inventoryItems.nodes) {
      const q = n.inventoryLevel?.quantities?.find((x: any) => x.name === 'available');
      if (q) out[n.id] = q.quantity;
    }
    if (!d.inventoryItems.pageInfo.hasNextPage) break;
    after = d.inventoryItems.pageInfo.endCursor;
  }
  return out;
}

// ── discounts ────────────────────────────────────────────────────────────────
const ITEMS = `items { __typename ... on AllDiscountItems { allItems }
  ... on DiscountProducts { products(first: 40) { nodes { id } pageInfo { hasNextPage } } productVariants(first: 40) { nodes { id } pageInfo { hasNextPage } } }
  ... on DiscountCollections { collections(first: 20) { nodes { id } pageInfo { hasNextPage } } } }`;
const VALUE = `value { __typename ... on DiscountPercentage { percentage } ... on DiscountAmount { amount { amount } appliesOnEachItem } }`;

function mapItems(items: any): { target: Target; truncated: boolean } {
  if (!items) return { target: {}, truncated: false };
  if (items.__typename === 'AllDiscountItems') return { target: { all: true }, truncated: false };
  if (items.__typename === 'DiscountProducts') {
    return {
      target: { productIds: items.products.nodes.map((n: any) => n.id), variantIds: items.productVariants.nodes.map((n: any) => n.id) },
      truncated: !!(items.products.pageInfo.hasNextPage || items.productVariants.pageInfo.hasNextPage),
    };
  }
  if (items.__typename === 'DiscountCollections') return { target: { collectionIds: items.collections.nodes.map((n: any) => n.id) }, truncated: !!items.collections.pageInfo.hasNextPage };
  return { target: {}, truncated: false };
}

export async function fetchAutoDiscounts(): Promise<AutoDiscount[]> {
  const out: AutoDiscount[] = [];
  let after: string | null = null;
  for (let page = 0; page < 40; page++) {
    const d: any = await gql(`query($after:String){ automaticDiscountNodes(first: 3, after:$after) { pageInfo { hasNextPage endCursor } nodes { id automaticDiscount { __typename
      ... on DiscountAutomaticBasic { title status startsAt endsAt
        minimumRequirement { __typename ... on DiscountMinimumSubtotal { greaterThanOrEqualToSubtotal { amount } } ... on DiscountMinimumQuantity { greaterThanOrEqualToQuantity } }
        customerGets { ${VALUE} ${ITEMS} } }
      ... on DiscountAutomaticBxgy { title status startsAt endsAt usesPerOrderLimit
        customerBuys { value { __typename ... on DiscountQuantity { quantity } ... on DiscountPurchaseAmount { amount } } ${ITEMS} }
        customerGets { value { __typename ... on DiscountOnQuantity { quantity { quantity } effect { __typename ... on DiscountPercentage { percentage } ... on DiscountAmount { amount { amount } } } } } ${ITEMS} } }
    } } } }`, { after });
    for (const n of d.automaticDiscountNodes.nodes) {
      const a = n.automaticDiscount;
      if (!a || a.status !== 'ACTIVE') continue;
      if (a.__typename === 'DiscountAutomaticBasic') {
        const { target, truncated } = mapItems(a.customerGets.items);
        const v = a.customerGets.value;
        const mr = a.minimumRequirement;
        out.push({
          id: n.id, title: a.title, kind: 'basic', startsAt: a.startsAt, endsAt: a.endsAt, target, truncated,
          pct: v.__typename === 'DiscountPercentage' ? v.percentage * 100 : undefined,
          amtCents: v.__typename === 'DiscountAmount' ? toCents(v.amount.amount) : undefined,
          eachItem: v.__typename === 'DiscountAmount' ? !!v.appliesOnEachItem : undefined,
          minSubtotalCents: mr?.__typename === 'DiscountMinimumSubtotal' ? toCents(mr.greaterThanOrEqualToSubtotal.amount) : undefined,
          minQty: mr?.__typename === 'DiscountMinimumQuantity' ? Number(mr.greaterThanOrEqualToQuantity) : undefined,
        });
      } else if (a.__typename === 'DiscountAutomaticBxgy') {
        const b = mapItems(a.customerBuys.items), g = mapItems(a.customerGets.items);
        const bv = a.customerBuys.value, gv = a.customerGets.value;
        if (gv.__typename !== 'DiscountOnQuantity') continue;
        out.push({
          id: n.id, title: a.title, kind: 'bxgy', startsAt: a.startsAt, endsAt: a.endsAt, truncated: b.truncated || g.truncated,
          usesPerOrderLimit: a.usesPerOrderLimit ? Number(a.usesPerOrderLimit) : undefined,
          buys: { target: b.target, qty: bv.__typename === 'DiscountQuantity' ? Number(bv.quantity) : undefined, amountCents: bv.__typename === 'DiscountPurchaseAmount' ? toCents(bv.amount) : undefined },
          gets: {
            target: g.target, qty: Number(gv.quantity.quantity),
            pct: gv.effect.__typename === 'DiscountPercentage' ? gv.effect.percentage * 100 : undefined,
            amtCents: gv.effect.__typename === 'DiscountAmount' ? toCents(gv.effect.amount.amount) : undefined,
          },
        });
      }
    }
    if (!d.automaticDiscountNodes.pageInfo.hasNextPage) break;
    after = d.automaticDiscountNodes.pageInfo.endCursor;
  }
  return out;
}

/** Shopify discount CODES become manual presets the cashier can tap. */
export async function fetchManualPresets(): Promise<ManualPreset[]> {
  const out: ManualPreset[] = [];
  let after: string | null = null;
  for (let page = 0; page < 20; page++) {
    const d: any = await gql(`query($after:String){ codeDiscountNodes(first: 20, after:$after, query: "status:active") { pageInfo { hasNextPage endCursor } nodes { id codeDiscount { __typename
      ... on DiscountCodeBasic { title status customerGets { ${VALUE} } } } } } }`, { after });
    for (const n of d.codeDiscountNodes.nodes) {
      const c = n.codeDiscount;
      if (c?.__typename !== 'DiscountCodeBasic' || c.status !== 'ACTIVE') continue;
      const v = c.customerGets.value;
      if (v.__typename === 'DiscountPercentage') out.push({ id: n.id, kind: 'pct', value: v.percentage * 100, label: c.title });
      else if (v.__typename === 'DiscountAmount') out.push({ id: n.id, kind: 'amt', value: toCents(v.amount.amount), label: c.title });
    }
    if (!d.codeDiscountNodes.pageInfo.hasNextPage) break;
    after = d.codeDiscountNodes.pageInfo.endCursor;
  }
  return out;
}
