// Location: src/screens/StockActionPanel.tsx
// 0182: Receive, adjust or count the item just scanned, without leaving the Scan result. Same calls, reasons and PIN rule as the
// Inventory screen, so the Shopify side cannot tell the difference. Shown only where the screen turns it on (the companion's Scan tab).
import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { Btn, Chip, Keypad, Segmented, Txt, alertMsg } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useApp } from '../state/store';
import { adjustStock, setStock } from '../lib/shopify/inventory';
import { isNetworkError } from '../lib/shopify/client';
import { requireStepUp } from '../lib/stepUpGate';
import { isTraining } from '../lib/trainingGuard';
import { uid } from '../lib/ids';
import { ADJUST_REASONS, attemptKey, planSignature, planStockAction, planSummary, type StockMode } from '../lib/stockAction';
import type { AdjustReason } from '../lib/shopify/inventory';
import type { Variant } from '../lib/types';

export function StockActionPanel({ v, onDone }: { v: Variant; onDone: () => void }) {
  const { c } = useTheme(); const loc = useApp(s => s.settings.locationId);
  const [mode, setMode] = useState<StockMode>('receive'); const [digits, setDigits] = useState(''); const [remove, setRemove] = useState(false);
  const [reason, setReason] = useState<AdjustReason>('correction'); const [busy, setBusy] = useState(false);
  const last = useRef<{ sig: string; key: string } | null>(null);
  const plan = planStockAction({ mode, digits, remove, reason, current: v.stock });

  const apply = async () => {
    if (!plan) return;
    if (!v.inventoryItemId || !loc) return alertMsg('Not linked', 'This item has no inventory item or no location is set.');
    if (!(await requireStepUp('shopify'))) return;
    setBusy(true);
    const att = attemptKey(planSignature(v.id, plan), last.current, uid); last.current = att;
    try {
      if (isTraining()) { /* practice: this device only, nothing goes to Shopify */ }
      else if (plan.kind === 'count') await setStock(v.inventoryItemId, loc, plan.quantity, plan.reason, att.key);
      else await adjustStock(v.inventoryItemId, loc, plan.delta, plan.reason, att.key);
      useApp.getState().patchData({ variants: { ...useApp.getState().data.variants, [v.id]: { ...v, stock: plan.next } } });
      last.current = null; setDigits(''); setRemove(false); onDone();
    } catch (e: any) { alertMsg(isNetworkError(e) ? 'No connection' : 'Stock update failed', e.message); }
    setBusy(false);
  };

  return (
    <View style={{ marginTop: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.card }}>
      <Segmented value={mode} onChange={m => { setMode(m); setDigits(''); setRemove(false); }} options={[{ v: 'receive', label: 'Receive' }, { v: 'adjust', label: 'Adjust' }, { v: 'count', label: 'Count' }]} />
      <Txt size={40} weight="700" style={{ textAlign: 'center', marginVertical: 8 }} color={plan && plan.kind === 'adjust' && plan.delta < 0 ? c.bad : undefined}>{mode === 'adjust' ? (remove ? '−' : '+') : mode === 'receive' ? '+' : ''}{digits || 0}</Txt>
      {mode === 'adjust' ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <Chip label={remove ? 'Remove' : 'Add'} icon="swap-vertical" onPress={() => setRemove(x => !x)} />
        {ADJUST_REASONS.map(r => <Chip key={r} label={r} active={reason === r} onPress={() => setReason(r)} />)}</View> : null}
      <Keypad value={digits} onChange={d => setDigits(d.slice(0, 5))} decimal={false} />
      {plan ? <Txt size={13} sub style={{ textAlign: 'center', marginTop: 8 }}>{planSummary(plan, v.stock)}</Txt> : null}
      <Btn title={mode === 'count' ? `Set stock to ${digits || 0}` : 'Apply'} onPress={() => void apply()} busy={busy} disabled={!plan} style={{ marginTop: 10 }} />
    </View>
  );
}
