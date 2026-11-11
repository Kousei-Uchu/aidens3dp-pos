// Location: src/lib/cloudkit/cloudkitBackend.ts
// CloudKit sync plan, patch 4b: a CloudKit backend for the shared-state seam.
// Sales and rollups are implemented first, using the seam's own row shapes. The
// backend strips customer PII from sale records and keeps only the Shopify customer
// id as an opaque reference, because customers live in Shopify (customer data is not synced to CloudKit).
// The metaobject backend stays live beside this one; cut-over is deferred to patch 8.
// A sale's card details, gift codes and receipt link go in one encrypted field and are never written plain (saleRecords.ts);
// whether they are written at all is the card mode below, `omit` until the two-Apple-ID test (decisions O4) has passed.
import type { BackendListOptions, BackendPage, BackendRow, SharedBackend, SharedType } from '../syncBackend';
import * as ck from '../../../modules/cloudkit-sync';
import { saleRecordName, saleRowFields, saleWriteFromFields, type CardMode } from '../saleRecords';

const CLOUDKIT_MISSING = 'CloudKit native module is not available.';

function ensureNative() {
  if (!ck.cloudKitAvailable) throw new Error(CLOUDKIT_MISSING);
  if (!ck.isSupported()) throw new Error('CloudKit is not supported on this build.');
}

function asRow(recordName: string, f: Record<string, any>): BackendRow {
  const updatedAt = f.updatedAt ? new Date(f.updatedAt * 1000).toISOString() : new Date().toISOString();
  const rowF: Record<string, string> = {};
  for (const [k, v] of Object.entries(f)) {
    if (v === null || v === undefined) continue;
    if (k === 'id' || k === 'recordName' || k === 'updatedAt' || k === 'encrypted') continue;
    rowF[k] = String(v);
  }
  return { id: recordName, handle: recordName, updatedAt, f: rowF };
}

/** A sale row for the seam: plain fields as strings, and the whole sale rebuilt with whatever encrypted parts could be read. */
function asSaleRow(recordName: string, f: Record<string, any>): BackendRow {
  const row = asRow(recordName, f);
  return { ...row, f: saleRowFields(f) };
}

let cardMode: CardMode = 'omit';
/** `encrypted` writes a sale's private parts as a CloudKit encrypted field; `omit` (the default) leaves them out. They are never written plain. */
export const setSaleCardMode = (mode: CardMode): void => { cardMode = mode; };
export const saleCardMode = (): CardMode => cardMode;

function handleFromName(recordType: SharedType, handle: string): string {
  if (recordType === 'sale') return handle.replace(/^sale-/, '');
  if (recordType === 'rollup') return handle.replace(/^rollup-/, '');
  return handle;
}

export const cloudkitBackend: SharedBackend = {
  kind: 'cloudkit',

  async ensure(): Promise<void> {
    ensureNative();
  },

  /** A CloudKit record has no field definition to add, so the whole sale can always be written. */
  async detailReady(): Promise<boolean> {
    return true;
  },

  async get(type: SharedType, handle: string): Promise<BackendRow | null> {
    ensureNative();
    if (type === 'sale') {
      const h = handle.startsWith('sale-') ? handle.slice(5) : handle;
      const rec = await ck.getSale(h);
      if (!rec) return null;
      return asSaleRow(saleRecordName(h), rec);
    }
    if (type === 'rollup') {
      const h = handle.startsWith('rollup-') ? handle.slice(7) : handle;
      const rec = await ck.getRollup(h);
      if (!rec) return null;
      return asRow(`rollup-${h}`, rec);
    }
    if (type === 'cart') {
      const h = handle.startsWith('cart-') ? handle.slice(5) : handle;
      const rec = await (ck.getCart ? ck.getCart(h) : Promise.resolve(null));
      if (!rec) return null;
      return asRow(`cart-${h}`, rec);
    }
    if (type === 'settings') {
      const h = handle.startsWith('settings-') ? handle.slice(9) : handle;
      const rec = await (ck.getSettings ? ck.getSettings(h) : Promise.resolve(null));
      if (!rec) return null;
      return asRow(`settings-${h}`, rec);
    }
    if (type === 'layout') {
      const h = handle.startsWith('layout-') ? handle.slice(7) : handle;
      const rec = await (ck.getLayout ? ck.getLayout(h) : Promise.resolve(null));
      if (!rec) return null;
      return asRow(`layout-${h}`, rec);
    }
    if (type === 'squareHistory' as any) {
      const h = String(handle);
      const rec = await (ck.getSquareHistory ? ck.getSquareHistory(h) : Promise.resolve(null));
      if (!rec) return null;
      return asRow(h, rec);
    }
    return null;
  },

  async put(type: SharedType, handle: string, fields: Record<string, string | number | undefined | null>): Promise<BackendRow> {
    ensureNative();
    // The Cart, Layout and Settings record types define `version` as a STRING in the CloudKit schema, and CloudKit refuses a number for it
    // ("invalid attempt to set value type NUMBER_INT64 for field 'version'"). Every reader already does Number(f.version), so text is safe.
    if ((type === 'cart' || type === 'layout' || type === 'settings') && typeof fields.version === 'number') fields = { ...fields, version: String(fields.version) };
    if (type === 'sale') {
      const h = handle.startsWith('sale-') ? handle.slice(5) : handle;
      const { plain, encrypted } = saleWriteFromFields(fields, cardMode);
      const rec = await ck.putSale(h, plain, encrypted);
      return asSaleRow(saleRecordName(h), rec);
    }
    if (type === 'rollup') {
      const h = handle.startsWith('rollup-') ? handle.slice(7) : handle;
      const rec = await ck.putRollup(h, fields as any);
      return asRow(`rollup-${h}`, rec);
    }
    if (type === 'cart') {
      const h = handle.startsWith('cart-') ? handle.slice(5) : handle;
      const rec = await (ck.putCart ? ck.putCart(h, fields as any) : Promise.reject(new Error(CLOUDKIT_MISSING)));
      return asRow(`cart-${h}`, rec);
    }
    if (type === 'settings') {
      const h = handle.startsWith('settings-') ? handle.slice(9) : handle;
      const rec = await (ck.putSettings ? ck.putSettings(h, fields as any) : Promise.reject(new Error(CLOUDKIT_MISSING)));
      return asRow(`settings-${h}`, rec);
    }
    if (type === 'layout') {
      const h = handle.startsWith('layout-') ? handle.slice(7) : handle;
      const rec = await (ck.putLayout ? ck.putLayout(h, fields as any) : Promise.reject(new Error(CLOUDKIT_MISSING)));
      return asRow(`layout-${h}`, rec);
    }
    if ((type as any) === 'squareHistory') {
      const h = String(handle);
      const rec = await (ck.putSquareHistory ? ck.putSquareHistory(h, fields as any) : Promise.reject(new Error(CLOUDKIT_MISSING)));
      return asRow(h, rec);
    }
    throw new Error(`CloudKit backend does not support type ${type} yet`);
  },

  async list(type: SharedType, options: BackendListOptions = {}): Promise<BackendPage> {
    ensureNative();
    if (type === 'sale') {
      const res = await ck.listSales(options.first ?? 100, options.after ?? null);
      const rows = (res.rows ?? []).map(r => asSaleRow(r.recordName ?? '', r));
      return { rows, next: res.next ?? null };
    }
    if (type === 'rollup') {
      const res = await ck.listRollups(options.first ?? 100, options.after ?? null);
      const rows = (res.rows ?? []).map(r => asRow(r.recordName ?? '', r));
      return { rows, next: res.next ?? null };
    }
    if (type === 'cart') {
      if (ck.listCarts) {
        const res = await ck.listCarts(options.first ?? 100, options.after ?? null);
        const rows = (res.rows ?? []).map(r => asRow(r.recordName ?? '', r));
        return { rows, next: res.next ?? null };
      }
      return { rows: [], next: null };
    }
    if (type === 'settings') {
      if (ck.listSettings) {
        const res = await ck.listSettings(options.first ?? 100, options.after ?? null);
        const rows = (res.rows ?? []).map(r => asRow(r.recordName ?? '', r));
        return { rows, next: res.next ?? null };
      }
      return { rows: [], next: null };
    }
    if (type === 'layout') {
      if (ck.listLayout) {
        const res = await ck.listLayout(options.first ?? 100, options.after ?? null);
        const rows = (res.rows ?? []).map(r => asRow(r.recordName ?? '', r));
        return { rows, next: res.next ?? null };
      }
      return { rows: [], next: null };
    }
    return { rows: [], next: null };
  },

  async remove(id: string): Promise<void> {
    // CloudKit records are soft-deleted or versioned; not implemented for this patch.
    return;
  },
};
