// Location: src/lib/cloudkit/secretCloud.ts
// CloudKit sync, patch 6d (secrets, transport half): secret records written to and read from CloudKit. It joins the pure pieces
// (secretsShared.ts) to a small native interface, passed in, so the flow is tested with an in-memory fake and no iPad (tests/secretsync.test.ts).
// Nothing reaches this unless the CloudKit backend is the active one and the encrypted switch is on. Decisions: N1.
import { secretFromParts, secretNameFromRecord, secretToParts } from '../secretsShared';
import type { CardMode } from '../saleRecords';
import { pageAll, PAGE_SIZE } from './drawerCloud';

type Rec = Record<string, any>;
type Page = { rows: Rec[]; next: string | null };

export type SecretNative = {
  /** Create or change one secret record. `encrypted` holds the `secure_json` field, stored as a CloudKit encrypted value. */
  putSecret(handle: string, fields: Rec, encrypted: Rec): Promise<Rec>;
  /** Every secret record, with the encrypted content this device can read under `encrypted` (absent when it cannot read it). */
  listSecrets(limit: number, after?: string | null): Promise<Page>;
};

/** What the shop holds. `values` are the secrets this device could read. `unreadable` are records that exist but could not be read here:
 *  the caller must leave those alone, never treat them as missing and write over them. */
export type ShopSecrets = { values: Map<string, string>; unreadable: Set<string> };

export async function pullSecrets(n: SecretNative): Promise<ShopSecrets> {
  const values = new Map<string, string>(); const unreadable = new Set<string>();
  for (const r of await pageAll(after => n.listSecrets(PAGE_SIZE, after))) {
    const record = String(r.recordName ?? ''); const name = secretNameFromRecord(record); if (!name) continue;
    const s = secretFromParts(record, r.encrypted);
    if (s) values.set(s.name, s.value); else unreadable.add(name);
  }
  return { values, unreadable };
}

/** Send one secret. Returns false when it was not sent because the mode is `omit`, the name is bad or the value is empty or too large. */
export async function pushSecret(n: SecretNative, name: string, value: string, registerId: string, now: number, mode: CardMode): Promise<boolean> {
  const p = secretToParts(name, value, registerId, now, mode); if (!p) return false;
  await n.putSecret(p.handle, p.plain, p.encrypted); return true;
}
