// Location: src/screens/Inventory.tsx
import React, { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { Btn, Chip, Empty, Field, Keypad, Money, Row, Segmented, Sheet, Thumb, Txt, alertMsg } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useApp } from '../state/store';
import { useCatalogue } from '../state/selectors';
import { adjustStock, setStock, type AdjustReason } from '../lib/shopify/inventory';
import { isNetworkError } from '../lib/shopify/client';
import { importFromShopify } from '../lib/sync';
import type { Variant } from '../lib/types';

/** Inventory: receive stock, adjust, stock counts. Negative stock is shown red (allowed by design). */
export default function Inventory() {
  const { c } = useTheme(); const cat = useCatalogue(); const loc = useApp(s => s.settings.locationId); const [q, setQ] = useState(''); const [f, setF] = useState<'all' | 'low' | 'neg'>('all');
  const [v, setV] = useState<Variant | null>(null); const [mode, setMode] = useState<'receive' | 'adjust' | 'count'>('receive'); const [digits, setDigits] = useState(''); const [neg, setNeg] = useState(false); const [reason, setReason] = useState<AdjustReason>('correction'); const [busy, setBusy] = useState(false);
  const list = useMemo(() => { const t = q.trim().toLowerCase(); return cat.list.filter(x => (!t || `${x.productTitle} ${x.variantTitle} ${x.sku ?? ''} ${x.barcode ?? ''}`.toLowerCase().includes(t)) && (f === 'all' || (f === 'neg' ? (x.stock ?? 0) < 0 : x.stock !== null && x.stock <= 2))).sort((a, b) => (a.stock ?? 1e9) - (b.stock ?? 1e9)).slice(0, 300); }, [q, f, cat.list]);
  const n = (neg ? -1 : 1) * (Number(digits) || 0);
  const apply = async () => {
    if (!v?.inventoryItemId || !loc) return alertMsg('Not linked', 'This item has no inventory item or no location is set.');
    setBusy(true);
    try {
      if (mode === 'count') await setStock(v.inventoryItemId, loc, Number(digits) || 0);
      else await adjustStock(v.inventoryItemId, loc, mode === 'receive' ? Math.abs(n) : n, mode === 'receive' ? 'received' : reason);
      const next = mode === 'count' ? (Number(digits) || 0) : (v.stock ?? 0) + (mode === 'receive' ? Math.abs(n) : n);
      useApp.getState().patchData({ variants: { ...useApp.getState().data.variants, [v.id]: { ...v, stock: next } } }); setV(null); setDigits(''); setNeg(false);
    } catch (e: any) { alertMsg(isNetworkError(e) ? 'No connection' : 'Stock update failed', e.message); }
    setBusy(false);
  };
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingTop: 54, padding: 12, backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.line, gap: 8 }}>
        <Txt size={24} weight="700" style={{ marginLeft: 4 }}>Inventory</Txt>
        <Field placeholder="Search name, SKU or barcode" value={q} onChangeText={setQ} autoCapitalize="none" style={{ marginBottom: 0 }} />
        <View style={{ flexDirection: 'row', gap: 8 }}>{([['all', 'All'], ['low', 'Low'], ['neg', 'Negative']] as const).map(([k, l]) => <Chip key={k} label={l} active={f === k} onPress={() => setF(k)} />)}</View>
      </View>
      <FlatList data={list} keyExtractor={x => x.id} ListEmptyComponent={<Empty title="No items" sub="Import from Shopify in More ▸ Settings ▸ Shopify." />}
        renderItem={({ item: x }) => <Row image={x.image ?? null} title={x.productTitle} sub={[x.variantTitle, x.sku].filter(Boolean).join(' · ') || undefined} onPress={() => { setV(x); setMode('receive'); setDigits(''); setNeg(false); }}
          right={<View style={{ alignItems: 'flex-end' }}><Txt weight="700" size={17} color={(x.stock ?? 0) < 0 ? c.bad : undefined}>{x.stock === null ? '—' : x.stock}</Txt><Money cents={x.priceCents} size={12} color={c.sub} /></View>} />} />
      <Sheet visible={!!v} onClose={() => setV(null)} title={v?.productTitle ?? ''}>
        {v ? <View style={{ alignItems: 'center', marginBottom: 8 }}><Thumb uri={v.image} size={96} radius={14} /></View> : null}
        <Txt sub style={{ marginBottom: 8 }}>{v?.variantTitle ? v.variantTitle + ' · ' : ''}Current stock: {v?.stock ?? 'not tracked'}</Txt>
        <Segmented value={mode} onChange={m => { setMode(m); setDigits(''); setNeg(false); }} options={[{ v: 'receive', label: 'Receive' }, { v: 'adjust', label: 'Adjust' }, { v: 'count', label: 'Count' }]} />
        <Txt size={40} weight="700" style={{ textAlign: 'center', marginVertical: 10 }} color={n < 0 ? c.bad : undefined}>{mode === 'adjust' ? (neg ? '−' : '+') : mode === 'receive' ? '+' : ''}{digits || 0}</Txt>
        {mode === 'adjust' ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}><Chip label={neg ? 'Remove' : 'Add'} icon="swap-vertical" onPress={() => setNeg(x => !x)} />{(['correction', 'damaged', 'shrinkage', 'other'] as AdjustReason[]).map(r => <Chip key={r} label={r} active={reason === r} onPress={() => setReason(r)} />)}</View> : null}
        <Keypad value={digits} onChange={d => setDigits(d.slice(0, 5))} decimal={false} />
        <Btn title={mode === 'count' ? `Set stock to ${digits || 0}` : 'Apply'} onPress={() => void apply()} busy={busy} disabled={!digits} style={{ marginTop: 10 }} />
      </Sheet>
      <View style={{ padding: 8 }}><Btn title="Refresh stock from Shopify" kind="ghost" small onPress={async () => { try { await importFromShopify(() => {}); } catch (e: any) { alertMsg('Refresh failed', e.message); } }} /></View>
    </View>
  );
}
