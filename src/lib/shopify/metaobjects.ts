// Shared state between registers lives in Shopify metaobjects (research doc §5): saved carts, layout, sales log,
// daily rollups, shared settings. Webhooks need a server, so registers POLL these.
import { gql, throwUserErrors, ShopifyUserError } from './client';

export const TYPES = { cart: 'pos_saved_cart', layout: 'pos_layout', sale: 'pos_sale', rollup: 'pos_daily_rollup', settings: 'pos_settings' } as const;
type F = [key: string, name: string, type: string];
const S = 'single_line_text_field', M = 'multi_line_text_field', J = 'json', I = 'number_integer', T = 'date_time';

const DEFS: { type: string; name: string; display?: string; fields: F[] }[] = [
  { type: TYPES.cart, name: 'POS saved cart', display: 'name', fields: [['cart_uuid', 'Cart UUID', S], ['name', 'Name', S], ['note', 'Note', M], ['customer_json', 'Customer', J],
    ['employee', 'Employee', S], ['register_id', 'Register', S], ['status', 'Status', S], ['lines_json', 'Lines', J], ['discount_json', 'Cart discount', J],
    ['created_at', 'Created', T], ['updated_at', 'Updated', T], ['version', 'Version', I], ['locked_by', 'Locked by', S], ['locked_at', 'Locked at', T]] },
  { type: TYPES.layout, name: 'POS layout', display: 'layout_key', fields: [['layout_key', 'Key', S], ['layout_json', 'Layout', J], ['version', 'Version', I], ['updated_by', 'Updated by', S], ['updated_at', 'Updated', T]] },
  { type: TYPES.sale, name: 'POS sale', display: 'sale_uuid', fields: [['sale_uuid', 'Sale UUID', S], ['order_gid', 'Order', S], ['register_id', 'Register', S], ['employee', 'Employee', S],
    ['ts', 'Time', T], ['entry_type', 'Type', S], ['items_cents', 'Items', I], ['discounts_cents', 'Discounts', I], ['total_cents', 'Total', I], ['cogs_cents', 'COGS', I],
    ['fees_cents', 'Fees', I], ['rounding_cents', 'Rounding', I], ['refund_of', 'Refund of', S], ['status', 'Status', S], ['tenders_json', 'Tenders', J], ['lines_json', 'Lines', J],
    ['customer_gid', 'Customer', S], ['receipt_link', 'Receipt link', S]] },
  { type: TYPES.rollup, name: 'POS daily rollup', display: 'rollup_key', fields: [['rollup_key', 'Key', S], ['register_id', 'Register', S], ['date', 'Date', S], ['totals_json', 'Totals', J]] },
  { type: TYPES.settings, name: 'POS settings', display: 'settings_key', fields: [['settings_key', 'Key', S], ['settings_json', 'Settings', J], ['version', 'Version', I]] },
];

export async function ensureDefinitions(): Promise<void> {
  for (const d of DEFS) {
    const res = await gql(`mutation($d: MetaobjectDefinitionCreateInput!){ metaobjectDefinitionCreate(definition: $d) { metaobjectDefinition { id } userErrors { field message code } } }`,
      { d: { type: d.type, name: d.name, displayNameKey: d.display, fieldDefinitions: d.fields.map(([key, name, type]) => ({ key, name, type })) } });
    const errs = (res.metaobjectDefinitionCreate.userErrors as any[]) ?? [];
    const real = errs.filter(e => !/taken|already/i.test(`${e.code} ${e.message}`));
    if (real.length) throw new ShopifyUserError(`Metaobject setup (${d.type}): ${real[0].message}`, real);
  }
}

export type MetaRow = { id: string; handle: string; updatedAt: string; f: Record<string, string> };
const toRow = (n: any): MetaRow => ({ id: n.id, handle: n.handle, updatedAt: n.updatedAt, f: Object.fromEntries((n.fields as any[]).map(x => [x.key, x.value ?? ''])) });

export const handleOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 100);

export async function upsert(type: string, handle: string, fields: Record<string, string | number | undefined | null>): Promise<MetaRow> {
  const d = await gql(`mutation($h: MetaobjectHandleInput!, $m: MetaobjectUpsertInput!){ metaobjectUpsert(handle: $h, metaobject: $m) { metaobject { id handle updatedAt fields { key value } } userErrors { field message code } } }`,
    { h: { type, handle: handleOf(handle) }, m: { fields: Object.entries(fields).filter(([, v]) => v !== undefined && v !== null).map(([key, v]) => ({ key, value: String(v) })) } });
  throwUserErrors(d.metaobjectUpsert.userErrors, `Saving ${type}`);
  return toRow(d.metaobjectUpsert.metaobject);
}

export async function getByHandle(type: string, handle: string): Promise<MetaRow | null> {
  const d = await gql(`query($h: MetaobjectHandleInput!){ metaobjectByHandle(handle: $h) { id handle updatedAt fields { key value } } }`, { h: { type, handle: handleOf(handle) } });
  return d.metaobjectByHandle ? toRow(d.metaobjectByHandle) : null;
}

export async function list(type: string, o: { first?: number; after?: string | null; reverse?: boolean } = {}): Promise<{ rows: MetaRow[]; next: string | null }> {
  const d = await gql(`query($t:String!,$n:Int!,$a:String,$r:Boolean){ metaobjects(type:$t, first:$n, after:$a, sortKey:"updated_at", reverse:$r) {
    pageInfo { hasNextPage endCursor } nodes { id handle updatedAt fields { key value } } } }`, { t: type, n: o.first ?? 50, a: o.after ?? null, r: o.reverse ?? true });
  return { rows: d.metaobjects.nodes.map(toRow), next: d.metaobjects.pageInfo.hasNextPage ? d.metaobjects.pageInfo.endCursor : null };
}

export async function remove(id: string) {
  const d = await gql(`mutation($id:ID!){ metaobjectDelete(id:$id){ deletedId userErrors { field message } } }`, { id });
  throwUserErrors(d.metaobjectDelete.userErrors, 'Deleting');
}
