// Location: src/lib/shopify/metaobjectBackend.ts
// The Shopify metaobject side of the shared-state seam (CloudKit sync plan, patch 3). It is the one backend that exists
// today, and it wraps exactly the calls sync.ts used to make by hand, so swapping the seam in changes no behaviour.
//
// The CloudKit backend (patch 4) implements the same interface with record types instead of metaobject types. Nothing above
// this file should import metaobjects directly any more, so a cut-over is one line and a rollback is that line back.
import * as meta from './metaobjects';
import { SHARED_TYPES, type BackendListOptions, type BackendPage, type BackendRow, type SharedBackend, type SharedType } from '../syncBackend';

/** The shop's name for a shared type, mapped onto the metaobject type that stores it. */
const META_TYPE: Record<SharedType, string> = {
  cart: meta.TYPES.cart,
  layout: meta.TYPES.layout,
  sale: meta.TYPES.sale,
  rollup: meta.TYPES.rollup,
  settings: meta.TYPES.settings,
};

/** The MetaRow the metaobject helpers return, as the backend's own row. They are the same shape, so this is a copy. */
const asRow = (r: meta.MetaRow): BackendRow => ({ id: r.id, handle: r.handle, updatedAt: r.updatedAt, f: r.f });

/** The metaobject backend: today's transport, behind the seam patch 4 will sit beside. */
export const metaobjectBackend: SharedBackend = {
  kind: 'metaobject',

  async ensure(): Promise<void> {
    // The definition write is the same one Settings ▸ Set up shared storage calls, so a first run and that button do the same thing.
    await meta.ensureDefinitions();
  },

  async get(type: SharedType, handle: string): Promise<BackendRow | null> {
    const row = await meta.getByHandle(META_TYPE[type], handle);
    return row ? asRow(row) : null;
  },

  async put(type: SharedType, handle: string, fields: Record<string, string | number | undefined | null>): Promise<BackendRow> {
    return asRow(await meta.upsert(META_TYPE[type], handle, fields));
  },

  async list(type: SharedType, options: BackendListOptions = {}): Promise<BackendPage> {
    const { rows, next } = await meta.list(META_TYPE[type], { first: options.first, after: options.after });
    return { rows: rows.map(asRow), next };
  },

  async remove(id: string): Promise<void> {
    await meta.remove(id);
  },

  // A sale's `sale_json` field is added to the definition on demand; until it exists the row still uploads without it.
  async detailReady(type: SharedType): Promise<boolean> {
    return type === 'sale' ? meta.ensureSaleDetailField() : true;
  },
};

/** Every shared type has a metaobject behind it. Exported so a test can prove the map is complete. */
export const metaTypeFor = (type: SharedType): string => META_TYPE[type];

/** The types this backend covers, in the order the plan lists them. */
export const metaBackendTypes = (): SharedType[] => [...SHARED_TYPES];
