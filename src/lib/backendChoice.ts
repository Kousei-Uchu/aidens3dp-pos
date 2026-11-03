// Location: src/lib/backendChoice.ts
// CloudKit sync, patch 8 (the switch, rules half): which backend a till uses, and which sales one still has to send after it switches.
// Pure, so every rule is tested in Node (tests/backendchoice.test.ts). The job that applies them is cloudkit/backendSwitch.ts.
// Decisions: dev_docs/CLOUDKIT_SYNC_DECISIONS.md item 16 (the flag is local), plan section 6 steps 4 and 7, dev_docs/GUESSES.md under 0220.
import type { SaleRecord } from './types';

/** The stored flag. `force_meta` is the rollback (and was already honoured at start-up); `cloudkit` means this till has switched. Anything else is unset. */
export type BackendFlag = 'force_meta' | 'cloudkit' | null;
export const BACKEND_FLAG_KEY = 'cloudkit.backend';
export const readFlag = (raw: unknown): BackendFlag => (raw === 'force_meta' || raw === 'cloudkit' ? raw : null);

/**
 * The backend to install at start-up. A till that has switched stays on CloudKit even if iCloud is unavailable right now: falling back to
 * Shopify silently would make it write somewhere the other tills no longer read. Only the rollback flag, set on purpose, sends it back.
 */
export const startupKind = (flag: BackendFlag): 'metaobject' | 'cloudkit' => (flag === 'cloudkit' ? 'cloudkit' : 'metaobject');

export type SwitchInput = {
  flag: BackendFlag;
  /** The kind in use now. */
  active: 'metaobject' | 'cloudkit' | 'none';
  /** This till's place in the shop's iCloud share. Only a till in the share can use the shop's CloudKit zone. */
  role: 'owner' | 'participant' | 'none';
  /** What the migration record says: `done` only when the count check passed. */
  migration: 'done' | 'not_done' | 'unknown';
  practice: boolean;
};
export type SwitchDecision = { act: 'switch' } | { act: 'stay'; why: 'practice' | 'rolled_back' | 'already' | 'not_in_shop' | 'not_done' | 'unknown' };

/** Whether a till on Shopify storage should move to CloudKit now (plan section 6 step 4: only once the import is `done`). */
export function decideSwitch(i: SwitchInput): SwitchDecision {
  if (i.practice) return { act: 'stay', why: 'practice' };
  if (i.flag === 'force_meta') return { act: 'stay', why: 'rolled_back' };
  if (i.active === 'cloudkit' || i.flag === 'cloudkit') return { act: 'stay', why: 'already' };
  if (i.role === 'none') return { act: 'stay', why: 'not_in_shop' };
  if (i.migration === 'unknown') return { act: 'stay', why: 'unknown' };
  if (i.migration !== 'done') return { act: 'stay', why: 'not_done' };
  return { act: 'switch' };
}

/** A margin before the import started, so a sale finished while the import was reading is not missed. */
export const CATCHUP_MARGIN_MS = 10 * 60_000;

/**
 * This till's own sales that may have gone to Shopify only: finished at or after the import started, by this register. Sales before that
 * were copied by the import, and the other registers' sales are theirs to send. Oldest first. Only sales that already have a Shopify
 * order are sent (a sale still in the queue is sent by the queue, to whichever backend is active when it runs).
 */
export function salesToCatchUp(sales: SaleRecord[], o: { registerId: string; importStartedAt: number; outboxIds: ReadonlySet<string> }): SaleRecord[] {
  const from = o.importStartedAt - CATCHUP_MARGIN_MS;
  return sales
    .filter(s => s.registerId === o.registerId && !o.outboxIds.has(s.uuid) && Number.isFinite(Date.parse(s.ts)) && Date.parse(s.ts) >= from)
    .sort((a, b) => a.ts.localeCompare(b.ts));
}

/** The outbox steps a caught-up sale still needs: only the CloudKit record and the totals. The order, receipt, gift cards and stock were done when it was first sent. */
export const CATCHUP_DONE = { early: true, order: true, receipt: true, receiptFinal: true, giftCards: true, stock: true } as const;

/** What a screen says about where this till keeps shared data. */
export function backendLine(kind: 'metaobject' | 'cloudkit' | 'none', flag: BackendFlag): string {
  if (kind === 'cloudkit') return 'This till keeps the shop\'s shared data in iCloud.';
  if (flag === 'force_meta') return 'This till is set to keep the shop\'s shared data in Shopify (switched back on purpose).';
  if (kind === 'metaobject') return 'This till keeps the shop\'s shared data in Shopify.';
  return 'Shared storage is not connected on this till.';
}
