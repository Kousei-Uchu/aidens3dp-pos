// Location: src/screens/Inventory.tsx
import React, { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Btn, Chip, Empty, Field, Keypad, Money, Row, Segmented, Sheet, Thumb, Txt, alertMsg } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useApp } from '../state/store';
import { useCatalogue } from '../state/selectors';
import { adjustStock, setStock, type AdjustReason } from '../lib/shopify/inventory';
import { isNetworkError } from '../lib/shopify/client';
import { importFromShopify } from '../lib/sync';
import { activeFilterCount, buildRows, defaultInvPrefs, filterVariants, groupVariants, sortVariants, statusOf, type InvPrefs, type InvRow, type InvSort, type StatusFilter, type StockFilter } from '../lib/inventoryView';
import type { Variant } from '../lib/types';

const STOCK_LABEL: [StockFilter, string][] = [['all', 'All'], ['low', 'Low'], ['zero', 'Out (0)'], ['neg', 'Negative'], ['tracked', 'Tracked'], ['untracked', 'Not tracked']];
const STATUS_LABEL: [StatusFilter, string][] = [['active', 'Active'], ['draft', 'Draft'], ['archived', 'Archived'], ['all', 'All']];
const SORT_LABEL: [InvSort, string][] = [['name', 'Name A–Z'], ['stock-asc', 'Stock: low first'], ['stock-desc', 'Stock: high first'], ['price-asc', 'Price: low first'], ['price-desc', 'Price: high first'], ['updated', 'Recently updated']];

/** Inventory: receive stock, adjust, stock counts. Negative stock is shown red (allowed by design). Lists EVERY variant (no row cap). */
export default function Inventory() {
  const { c } = useTheme(); const cat = useCatalogue(); const loc = useApp(s => s.settings.locationId); const stored = useApp(s => s.settings.inventory); const patchSettings = useApp(s => s.patchSettings); const catalogueAt = useApp(s => s.data.catalogueAt);
  const prefs: InvPrefs = { ...defaultInvPrefs(), ...stored }; const setPrefs = (p: Partial<InvPrefs>) => patchSettings({ inventory: { ...prefs, ...p } });
  const [q, setQ] = useState(''); const [filters, setFilters] = useState(false); const [open, setOpen] = useState<Set<string>>(new Set());
  const [v, setV] = useState<Variant | null>(null); const [mode, setMode] = useState<'receive' | 'adjust' | 'count'>('receive'); const [digits, setDigits] = useState(''); const [neg, setNeg] = useState(false); const [reason, setReason] = useState<AdjustReason>('correction'); const [busy, setBusy] = useState(false);

  const collection = useMemo(() => cat.collections.find(x => x.id === prefs.collectionId) ?? null, [cat.collections, prefs.collectionId]);
  const filtered = useMemo(() => filterVariants(cat.all, prefs, q, collection ? new Set(collection.productIds) : null), [cat.all, prefs.stock, prefs.status, prefs.lowAt, prefs.collectionId, q, collection]);
  const rows: InvRow[] = useMemo(() => prefs.grouped
    ? buildRows(groupVariants(filtered, prefs.sort), open, !!q.trim())
    : sortVariants(filtered, prefs.sort).map(x => ({ kind: 'variant' as const, key: `v:${x.id}`, v: x, nested: false })), [filtered, prefs.grouped, prefs.sort, open, q]);
  const productCount = useMemo(() => new Set(filtered.map(x => x.productId)).size, [filtered]);
  const nFilters = activeFilterCount(prefs);
  const toggle = (id: string) => setOpen(s => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const pick = (x: Variant) => { setV(x); setMode('receive'); setDigits(''); setNeg(false); };
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

  const stockText = (x: Variant) => <Txt weight="700" size={17} color={(x.stock ?? 0) < 0 ? c.bad : undefined}>{x.stock === null ? '—' : x.stock}</Txt>;
  const renderRow = ({ item: r }: { item: InvRow }) => {
    if (r.kind === 'group') {
      const g = r.group;
      return <Row image={g.image ?? null} title={g.title} sub={`${g.variants.length} variations · ${g.minPrice === g.maxPrice ? '' : 'from '}${(g.minPrice / 100).toFixed(2)}`} onPress={() => toggle(g.productId)}
        right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ alignItems: 'flex-end' }}>{g.stock === null ? <Txt weight="700" size={17}>—</Txt> : <Txt weight="700" size={17} color={g.stock < 0 ? c.bad : undefined}>{g.stock}</Txt>}<Txt size={11} sub>total</Txt></View><Ionicons name={r.expanded ? 'chevron-up' : 'chevron-down'} size={18} color={c.sub} /></View>} />;
    }
    const x = r.v; const draft = statusOf(x) !== 'ACTIVE';
    const row = <Row image={r.nested ? undefined : x.image ?? null} title={r.nested ? (x.variantTitle || 'Default') : x.productTitle} sub={[r.nested ? undefined : x.variantTitle, x.sku, draft ? statusOf(x).toLowerCase() : undefined].filter(Boolean).join(' · ') || undefined} onPress={() => pick(x)}
      right={<View style={{ alignItems: 'flex-end' }}>{stockText(x)}<Money cents={x.priceCents} size={12} color={c.sub} /></View>} />;
    return r.nested ? <View style={{ marginLeft: 28, borderLeftWidth: 2, borderLeftColor: c.line }}>{row}</View> : row;
  };
  const group = (title: string, children: React.ReactNode) => <View style={{ marginBottom: 16 }}><Txt size={13} sub weight="600" style={{ marginBottom: 8, textTransform: 'uppercase' }}>{title}</Txt><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View></View>;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingTop: 54, padding: 12, backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.line, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, marginLeft: 4 }}><Txt size={24} weight="700">Inventory</Txt><Txt size={12} sub>{rows.length ? `${filtered.length} variants · ${productCount} products` : 'Nothing matches'}</Txt></View>
          <Chip label={nFilters ? `Filters · ${nFilters}` : 'Filters'} icon="options-outline" active={nFilters > 0} onPress={() => setFilters(true)} />
        </View>
        <Field kind="search" placeholder="Search name, SKU or barcode" value={q} onChangeText={setQ} style={{ marginBottom: 0 }} />
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {STOCK_LABEL.slice(0, 4).map(([k, l]) => <Chip key={k} label={l} active={prefs.stock === k} onPress={() => setPrefs({ stock: k })} />)}
          {collection ? <Chip label={collection.title} icon="close-circle" active onPress={() => setPrefs({ collectionId: null })} /> : null}
          <Chip label={prefs.grouped ? 'Nested' : 'Flat'} icon={prefs.grouped ? 'layers' : 'list'} onPress={() => setPrefs({ grouped: !prefs.grouped })} />
        </View>
      </View>
      <FlatList data={rows} keyExtractor={r => r.key} renderItem={renderRow} initialNumToRender={20} maxToRenderPerBatch={20} windowSize={9} keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Empty title="No items" sub={cat.all.length ? 'Nothing matches the current search and filters.' : 'Import from Shopify in More ▸ Settings ▸ Shopify.'} />} />

      <Sheet visible={!!v} onClose={() => setV(null)} title={v?.productTitle ?? ''}>
        {v ? <View style={{ alignItems: 'center', marginBottom: 8 }}><Thumb uri={v.image} size={96} radius={14} /></View> : null}
        <Txt sub style={{ marginBottom: 8 }}>{v?.variantTitle ? v.variantTitle + ' · ' : ''}Current stock: {v?.stock ?? 'not tracked'}</Txt>
        <Segmented value={mode} onChange={m => { setMode(m); setDigits(''); setNeg(false); }} options={[{ v: 'receive', label: 'Receive' }, { v: 'adjust', label: 'Adjust' }, { v: 'count', label: 'Count' }]} />
        <Txt size={40} weight="700" style={{ textAlign: 'center', marginVertical: 10 }} color={n < 0 ? c.bad : undefined}>{mode === 'adjust' ? (neg ? '−' : '+') : mode === 'receive' ? '+' : ''}{digits || 0}</Txt>
        {mode === 'adjust' ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}><Chip label={neg ? 'Remove' : 'Add'} icon="swap-vertical" onPress={() => setNeg(x => !x)} />{(['correction', 'damaged', 'shrinkage', 'other'] as AdjustReason[]).map(r => <Chip key={r} label={r} active={reason === r} onPress={() => setReason(r)} />)}</View> : null}
        <Keypad value={digits} onChange={d => setDigits(d.slice(0, 5))} decimal={false} />
        <Btn title={mode === 'count' ? `Set stock to ${digits || 0}` : 'Apply'} onPress={() => void apply()} busy={busy} disabled={!digits} style={{ marginTop: 10 }} />
      </Sheet>
      <Sheet visible={filters} onClose={() => setFilters(false)} title="Filters & sort" full>
        {group('Category', <><Chip label="All categories" active={!prefs.collectionId} onPress={() => setPrefs({ collectionId: null })} />{cat.collections.map(col => <Chip key={col.id} label={col.title} active={prefs.collectionId === col.id} onPress={() => setPrefs({ collectionId: col.id })} />)}</>)}
        {group('Stock level', STOCK_LABEL.map(([k, l]) => <Chip key={k} label={l} active={prefs.stock === k} onPress={() => setPrefs({ stock: k })} />))}
        {prefs.stock === 'low' ? <View style={{ marginBottom: 16 }}><Txt size={13} sub weight="600" style={{ marginBottom: 8 }}>“Low” means {prefs.lowAt} or fewer</Txt><View style={{ flexDirection: 'row', gap: 8 }}>{[1, 2, 3, 5, 10].map(k => <Chip key={k} label={String(k)} active={prefs.lowAt === k} onPress={() => setPrefs({ lowAt: k })} />)}</View></View> : null}
        {group('Product status', STATUS_LABEL.map(([k, l]) => <Chip key={k} label={l} active={prefs.status === k} onPress={() => setPrefs({ status: k })} />))}
        {group('Sort by', SORT_LABEL.map(([k, l]) => <Chip key={k} label={l} active={prefs.sort === k} onPress={() => setPrefs({ sort: k })} />))}
        <Txt size={13} sub weight="600" style={{ marginBottom: 8, textTransform: 'uppercase' }}>Show variations</Txt>
        <Segmented value={prefs.grouped ? 'nested' : 'flat'} onChange={m => setPrefs({ grouped: m === 'nested' })} options={[{ v: 'flat', label: 'Each on its own' }, { v: 'nested', label: 'Nested under item' }]} />
        <Btn title="Reset filters" kind="secondary" style={{ marginTop: 16 }} onPress={() => setPrefs({ ...defaultInvPrefs(), sort: prefs.sort, grouped: prefs.grouped })} />
        <Txt size={12} sub style={{ marginTop: 12 }}>{cat.all.length} variants in this device's catalogue{catalogueAt ? ` · imported ${new Date(catalogueAt).toLocaleString()}` : ''}. If that number is lower than Shopify's, tap “Refresh stock from Shopify”.</Txt>
      </Sheet>

      <View style={{ padding: 8 }}><Btn title="Refresh stock from Shopify" kind="ghost" small onPress={async () => { try { await importFromShopify(() => {}); } catch (e: any) { alertMsg('Refresh failed', e.message); } }} /></View>
    </View>
  );
}
