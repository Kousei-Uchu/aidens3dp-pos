// Location: src/lib/cloudkit/cloudkitBackend.ts
// CloudKit sync plan, patch 4b: a CloudKit backend for the shared-state seam.
// Sales and rollups are implemented first, using the seam's own row shapes. The
// backend strips customer PII from sale records and keeps only the Shopify customer
// id as an opaque reference, because customers live in Shopify (customer data is not synced to CloudKit).
// The metaobject backend stays live beside this one; cut-over is deferred to patch 8.
import type { BackendListOptions, BackendPage, BackendRow, SharedBackend, SharedType } from '../syncBackend';
import * as ck from '../../../modules/cloudkit-sync';

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
    if (k === 'id' || k === 'recordName' || k === 'updatedAt') continue;
    rowF[k] = String(v);
  }
  return { id: recordName, handle: recordName, updatedAt, f: rowF };
}

function sanitizeSaleFields(fields: Record<string, string | number | undefined | null>): Record<string, string | number | undefined | null> {
  const out: Record<string, string | number | undefined | null> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    if (k === 'customer' || k === 'customer_json') continue;
    if (k === 'sale_json' && typeof v === 'string') {
      try {
        const obj = JSON.parse(v);
        if (obj && typeof obj === 'object' && 'customer' in obj) delete obj.customer;
        if (obj && typeof obj === 'object' && 'customer_json' in obj) delete obj.customer_json;
        out.sale_json = JSON.stringify(obj);
      } catch {
        out.sale_json = v;
      }
      continue;
    }
    out[k] = v;
  }
  return out;
}

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

  async get(type: SharedType, handle: string): Promise<BackendRow | null> {
    ensureNative();
    if (type === 'sale') {
      const h = handle.startsWith('sale-') ? handle.slice(5) : handle;
      const rec = await ck.getSale(h);
      if (!rec) return null;
      return asRow(`sale-${h}`, rec);
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
    return null;
  },

  async put(type: SharedType, handle: string, fields: Record<string, string | number | undefined | null>): Promise<BackendRow> {
    ensureNative();
    if (type === 'sale') {
      const h = handle.startsWith('sale-') ? handle.slice(5) : handle;
      const clean = sanitizeSaleFields(fields);
      const rec = await ck.putSale(h, clean as any);
      return asRow(`sale-${h}`, rec);
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
    throw new Error(`CloudKit backend does not support type ${type} yet`);
  },

  async list(type: SharedType, options: BackendListOptions = {}): Promise<BackendPage> {
    ensureNative();
    if (type === 'sale') {
      const res = await ck.listSales(options.first ?? 100, options.after ?? null);
      const rows = (res.rows ?? []).map(r => asRow(r.recordName ?? '', r));
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
