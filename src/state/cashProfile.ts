// Location: src/state/cashProfile.ts
// 0022: the smart-change profile for this register, rebuilt only when the ledger, the sales list or the item library change.
// Returns null when Settings ▸ Payments ▸ Smart change is off, so every caller falls back to the plain rules.
import { useMemo } from 'react';
import { useApp } from './store';
import { buildProfile, type CashProfile } from '../lib/changeScore';

/** `always`: build the profile even when Smart change is off (the daily float report is a report, so it does not need the toggle). */
export function useCashProfile(always = false): CashProfile | null {
  const on = useApp(s => s.settings.smartChange) || always; const entries = useApp(s => s.pos.ledger.entries); const sales = useApp(s => s.pos.sales); const variants = useApp(s => s.data.variants);
  return useMemo(() => (on ? buildProfile({ entries, sales, prices: Object.values(variants).map(v => v.priceCents) }) : null), [on, entries, sales, variants]);
}
