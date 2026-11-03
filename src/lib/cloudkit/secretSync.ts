// Location: src/lib/cloudkit/secretSync.ts
// CloudKit sync, patch 6d (secrets, call sites): once per poll, the shop's secrets are joined with this register's and the differences are
// carried across. Everything the app supplies is passed in, so the rules are tested without an iPad (tests/secretsync.test.ts). The app's one
// instance is made in sync.ts. Nothing is read or sent unless CloudKit is active, the encrypted switch is on and this is not a practice run.
// The rule for one secret is `mergeSecret` (secretsShared.ts). Decisions: N1.
import { mergeSecret, FIXED_SECRETS } from '../secretsShared';
import type { CardMode } from '../saleRecords';
import { pullSecrets, pushSecret, type SecretNative } from './secretCloud';

export type SecretSyncDeps = {
  active: () => boolean;
  /** True in practice mode. Nothing is read, sent or changed then. */
  training: () => boolean;
  who: () => { id: string };
  native: () => Promise<SecretNative>;
  /** `encrypted` only once encrypted fields have been shown to work across Apple IDs (T85). Until then nothing is sent or read. */
  mode: () => CardMode | Promise<CardMode>;
  /** The secrets this register could hold: the fixed ones and one pass code per cashier. */
  localNames: () => Promise<string[]> | string[];
  /** This register's value, or null when it has none. */
  read: (name: string) => Promise<string | null>;
  /** Keep the shop's value on this register. Returns false for a name this register does not know how to keep (nothing is changed). */
  write: (name: string, value: string) => Promise<boolean>;
  /** What this register last agreed with the shop, as fingerprints, kept in the Keychain. */
  loadBase: () => Promise<Record<string, string>>;
  saveBase: (base: Record<string, string>) => Promise<void>;
  now?: () => number;
};

export type SecretRunResult = { sent: string[]; taken: string[]; /** Both sides had changed (or never agreed): the shop's copy was taken. */ conflicts: string[]; failed: string[] };

export function createSecretSync(d: SecretSyncDeps) {
  async function run(): Promise<SecretRunResult | null> {
    if (!d.active() || d.training()) return null;
    const w = d.who(); if (!w.id) return null;
    try {
      if ((await d.mode()) !== 'encrypted') return null;
      const n = await d.native(); const shop = await pullSecrets(n); const mode: CardMode = 'encrypted';
      const base = await d.loadBase(); const next: Record<string, string> = { ...base };
      const out: SecretRunResult = { sent: [], taken: [], conflicts: [], failed: [] };
      const names = new Set<string>([...FIXED_SECRETS, ...(await d.localNames()), ...shop.values.keys()]);
      for (const name of names) {
        if (shop.unreadable.has(name)) continue; // exists but cannot be read here: never write over what cannot be seen
        try {
          const local = (await d.read(name)) || null; const cloud = shop.values.get(name) ?? null;
          const a = mergeSecret(local, cloud, base[name] ?? null);
          if (a.kind === 'send' && local) { if (!(await pushSecret(n, name, local, w.id, (d.now ?? Date.now)(), mode))) { out.failed.push(name); continue; } out.sent.push(name); }
          else if (a.kind === 'take' && cloud) { if (!(await d.write(name, cloud))) continue; out.taken.push(name); if (a.conflict) out.conflicts.push(name); }
          if (a.base) next[name] = a.base; else delete next[name];
        } catch { out.failed.push(name); }
      }
      await d.saveBase(next);
      return out;
    } catch { return null; }
  }
  return { run };
}
export type SecretSync = ReturnType<typeof createSecretSync>;
