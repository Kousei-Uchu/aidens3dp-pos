// Location: src/lib/cloudkit/orderRecoverySync.ts
// CloudKit sync, item 8 (Q11): the job that finds sales another register left without a Shopify order and creates the order. Everything
// the app supplies is passed in, so the rules are tested without an iPad (tests/orderrecovery.test.ts). The app's one instance is made in
// sync.ts and `run` is called from the poll. The rules are in ../orderRecovery.ts.
import type { SaleRecord } from '../types';
import type { EventNative } from './eventCloud';
import { MAX_CLAIMS, MAX_PER_RUN, RECOVERY_EVERY_MS, claimBlocks, claimFields, claimHandle, recoveredNotice, strandedSales, unrecoverableReason, type Who } from '../orderRecovery';

export type OrderRecoveryDeps = {
  active: () => boolean;
  training: () => boolean;
  /** True when this register has Shopify credentials: without them it cannot create an order. */
  canCreateOrders: () => boolean;
  who: () => Who;
  native: () => Promise<EventNative>;
  /** The newest sales in CloudKit, every register's, as whole sales. Rows that cannot be read are left out. */
  readSales: () => Promise<SaleRecord[]>;
  /** The ids of the sales in this register's own queue. */
  outboxIds: () => ReadonlySet<string>;
  /** Run the sale through the same steps the queue uses (order, gift cards, the CloudKit record, the totals). Throws on failure. The order name is returned. */
  finish: (s: SaleRecord) => Promise<string | undefined>;
  notify: (n: { title: string; body: string }) => void;
  now: () => number;
};

export function createOrderRecovery(d: OrderRecoveryDeps) {
  let last = 0; let running = false; const told = new Set<string>(); // sales a person was already told about on this launch

  /**
   * Claim a sale. True when this register holds the claim and may create the order. A write-once record hands back whoever wrote it first:
   * this register's own claim means go ahead, someone else's fresh claim means leave it to them, and someone else's stale claim means the
   * claimer stopped, so the next claim number is tried.
   */
  async function claim(n: EventNative, uuid: string, me: Who): Promise<boolean> {
    for (let k = 1; k <= MAX_CLAIMS; k++) {
      const won = await n.putResolution(claimHandle(uuid, k), claimFields(me, uuid, d.now()));
      if (won.registerId === me.id) return true;
      if (claimBlocks(won, me, d.now())) return false;
    }
    return false;
  }

  return {
    /**
     * Look for stranded sales and create their orders. At most every ten minutes, three at a time. Returns the number of orders created, or
     * null when nothing was attempted (not due, not active, practice mode, no credentials) or CloudKit could not be read. Never throws.
     */
    async run(force = false): Promise<number | null> {
      const me = d.who();
      if (running || !d.active() || d.training() || !d.canCreateOrders() || !me.id) return null;
      if (!force && d.now() - last < RECOVERY_EVERY_MS) return null;
      running = true; last = d.now();
      try {
        const n = await d.native();
        const all = strandedSales(await d.readSales(), { outboxIds: d.outboxIds(), nowMs: d.now() });
        const stuck = all.filter(s => unrecoverableReason(s) !== null && !told.has(s.uuid));
        if (stuck.length) {
          for (const s of stuck) told.add(s.uuid);
          d.notify({ title: 'Sales with no Shopify order', body: `${stuck.length} sale${stuck.length > 1 ? 's' : ''} from another register ${stuck.length > 1 ? 'have' : 'has'} no Shopify order and cannot be finished from here (${unrecoverableReason(stuck[0])}). Open the register that took ${stuck.length > 1 ? 'them' : 'it'} and let its queue finish.` });
        }
        const stranded = all.filter(s => unrecoverableReason(s) === null).slice(0, MAX_PER_RUN);
        let made = 0;
        for (const s of stranded) {
          if (!(await claim(n, s.uuid, me))) continue;
          try { const name = await d.finish(s); made += 1; d.notify(recoveredNotice(s, name ?? 'a new order')); } catch { /* the claim goes stale and the sale is tried again later */ }
        }
        return made;
      } catch { return null; } finally { running = false; }
    },
  };
}
export type OrderRecovery = ReturnType<typeof createOrderRecovery>;
