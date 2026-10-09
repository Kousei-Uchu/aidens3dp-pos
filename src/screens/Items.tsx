// Location: src/screens/Items.tsx
import React, { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { Btn, Chip, Empty, Field, IconBtn, Money, Page, Row, Thumb, Txt, alertMsg } from '../ui/kit';
import { useNav } from '../ui/nav';
import { useApp } from '../state/store';
import { useCatalogue } from '../state/selectors';
import { createItem, updateVariant } from '../lib/shopify/products';
import { importFromShopify } from '../lib/sync';
import { digitsToCents, fmt, toCents } from '../lib/money';
import type { Variant } from '../lib/types';

export function ItemsList() {
  const nav = useNav(); const cat = useCatalogue(); const [q, setQ] = useState('');
  const list = useMemo(() => { const t = q.trim().toLowerCase(); return cat.list.filter(v => !t || `${v.productTitle} ${v.variantTitle} ${v.sku ?? ''} ${v.barcode ?? ''}`.toLowerCase().includes(t)).slice(0, 300); }, [q, cat.list]);
  return (
    <Page title="Items" onBack={nav.pop} scroll={false} right={<IconBtn icon="add" label="Create item" onPress={() => nav.push('createItem')} />}>
      <View style={{ padding: 12 }}><Field placeholder="Search items" value={q} onChangeText={setQ} autoCapitalize="none" style={{ marginBottom: 0 }} /></View>
      <FlatList data={list} keyExtractor={v => v.id} ListEmptyComponent={<Empty title="No items" sub="Import from Shopify, or create one." />} renderItem={({ item: v }) => <Row image={v.image ?? null} title={v.productTitle} sub={[v.variantTitle, v.sku, v.barcode].filter(Boolean).join(' · ') || undefined} right={<Money cents={v.priceCents} weight="600" />} onPress={() => nav.push('editItem', { id: v.id })} />} />
    </Page>
  );
}

const money = (s: string) => (s.trim() === '' ? undefined : toCents(s.replace(/[^0-9.]/g, '')));
/** Create item: title, price, SKU, barcode, cost, starting stock, optional category. Needs internet. */
export function CreateItem() {
  const nav = useNav(); const cat = useCatalogue(); const loc = useApp(s => s.settings.locationId);
  const [f, setF] = useState({ title: '', price: '', sku: '', barcode: '', cost: '', stock: '' }); const [col, setCol] = useState<string | undefined>(); const [busy, setBusy] = useState(false);
  const save = async () => {
    const price = money(f.price); if (!f.title.trim() || price === undefined) return alertMsg('Name and price are required');
    if (!loc) return alertMsg('Pick a location first', 'Settings ▸ Shopify');
    setBusy(true);
    try { await createItem({ title: f.title.trim(), priceCents: price, sku: f.sku.trim() || undefined, barcode: f.barcode.trim() || undefined, costCents: money(f.cost), stock: f.stock ? Number(f.stock) : undefined, collectionId: col }, loc); await importFromShopify(() => {}); nav.pop(); }
    catch (e: any) { alertMsg('Could not create item', e.message); }
    setBusy(false);
  };
  return (
    <Page title="Create item" onBack={nav.pop}>
      <View style={{ padding: 16 }}>
        <Field label="Name" value={f.title} onChangeText={t => setF({ ...f, title: t })} /><Field label="Price" value={f.price} onChangeText={t => setF({ ...f, price: t })} keyboardType="decimal-pad" placeholder="0.00" />
        <Field label="SKU" value={f.sku} onChangeText={t => setF({ ...f, sku: t })} autoCapitalize="none" /><Field label="Barcode" value={f.barcode} onChangeText={t => setF({ ...f, barcode: t })} keyboardType="number-pad" />
        <Field label="Cost (for profit reports)" value={f.cost} onChangeText={t => setF({ ...f, cost: t })} keyboardType="decimal-pad" placeholder="0.00" /><Field label="Starting stock" value={f.stock} onChangeText={t => setF({ ...f, stock: t })} keyboardType="number-pad" />
        {cat.collections.length ? <><Txt size={13} sub weight="600" style={{ marginBottom: 6 }}>Category</Txt><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>{cat.collections.slice(0, 30).map(c => <Chip key={c.id} label={c.title} active={col === c.id} onPress={() => setCol(col === c.id ? undefined : c.id)} />)}</View></> : null}
        <Btn title="Create item" busy={busy} onPress={() => void save()} />
      </View>
    </Page>
  );
}

export function EditItem({ id }: { id: string }) {
  const nav = useNav(); const v = useApp(s => s.data.variants[id]); const [f, setF] = useState({ price: v ? (v.priceCents / 100).toFixed(2) : '', sku: v?.sku ?? '', barcode: v?.barcode ?? '', cost: v?.costCents !== undefined ? (v.costCents / 100).toFixed(2) : '' }); const [busy, setBusy] = useState(false);
  if (!v) return <Page title="Item" onBack={nav.pop}><Empty title="Item not found" /></Page>;
  const save = async () => {
    setBusy(true);
    try { const p = money(f.price); await updateVariant(v.productId, v.id, { priceCents: p, sku: f.sku.trim() || undefined, barcode: f.barcode.trim() || undefined, costCents: money(f.cost) });
      const next: Variant = { ...v, priceCents: p ?? v.priceCents, sku: f.sku.trim() || undefined, barcode: f.barcode.trim() || undefined, costCents: money(f.cost) ?? v.costCents }; useApp.getState().patchData({ variants: { ...useApp.getState().data.variants, [v.id]: next } }); nav.pop(); }
    catch (e: any) { alertMsg('Could not save', e.message); }
    setBusy(false);
  };
  return (
    <Page title={v.productTitle} onBack={nav.pop}><View style={{ padding: 16 }}>
      {v.image ? <View style={{ alignItems: 'center', marginBottom: 12 }}><Thumb uri={v.image} size={160} radius={16} /></View> : null}
      <Txt sub style={{ marginBottom: 10 }}>{v.variantTitle ? v.variantTitle + ' · ' : ''}Stock {v.stock ?? 'not tracked'} · current {fmt(v.priceCents)}</Txt>
      <Field label="Price" value={f.price} onChangeText={t => setF({ ...f, price: t })} keyboardType="decimal-pad" /><Field label="SKU" value={f.sku} onChangeText={t => setF({ ...f, sku: t })} autoCapitalize="none" />
      <Field label="Barcode" value={f.barcode} onChangeText={t => setF({ ...f, barcode: t })} keyboardType="number-pad" /><Field label="Cost" value={f.cost} onChangeText={t => setF({ ...f, cost: t })} keyboardType="decimal-pad" />
      <Btn title="Save to Shopify" busy={busy} onPress={() => void save()} /></View></Page>
  );
}
void digitsToCents;
