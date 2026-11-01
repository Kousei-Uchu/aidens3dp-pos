// Location: src/state/cashProfile.ts
// 0022: the smart-change profile, rebuilt only when the ledger, the sales list or the item library change. The drawer is one shared drawer
// for the shop, so its ledger holds every register's cash. The sales list that sizes the horizon is therefore the whole shop's (0203): this
// register's own sales plus those the other registers shared, or a quiet register would plan for a day shorter than the drawer sees.
// Returns null when Settings ▸ Payments ▸ Smart change is off, so every caller falls back to the plain rules.
import { useMemo } from 'react';
import { useApp } from './store';
import { buildProfile, type CashProfile } from '../lib/changeScore';
import { allSales } from '../lib/salesHistory';

/** `always`: build the profile even when Smart change is off (the daily float report is a report, so it does not need the toggle). */
export function useCashProfile(always = false): CashProfile | null {
  const on = useApp(s => s.settings.smartChange) || always; const entries = useApp(s => s.pos.ledger.entries); const mine = useApp(s => s.pos.sales); const others = useApp(s => s.pos.shared?.sales); const variants = useApp(s => s.data.variants);
  return useMemo(() => (on ? buildProfile({ entries, sales: allSales(mine, others ?? []), prices: Object.values(variants).map(v => v.priceCents) }) : null), [on, entries, mine, others, variants]);
}
