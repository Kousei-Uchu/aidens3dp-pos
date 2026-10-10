// Location: src/screens/Lookup.tsx
// The grid's Price check and Stock check tiles. Scan (Bluetooth scanner or camera) or search; the cart is never touched.
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Btn, Card, Empty, Field, Money, Row, Sheet, Thumb, Txt } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useApp } from '../state/store';
import { useCatalogue } from '../state/selectors';
import { bundleConfig } from '../lib/sync';
import { priceCheck, resolveScan, scanProblem, searchVariants, stockCheck, stockText, stockToneOf } from '../lib/lookup';
import { CameraScanner, HidScanner } from './Scanner';
import type { Variant } from '../lib/types';

export type LookupMode = 'price' | 'stock';
const TONE_COLOR = { none: undefined, ok: '#16A34A', low: '#B45309', out: '#B45309', neg: '#B91C1C' } as const;

export function LookupSheet({ mode, visible, onClose }: { mode: LookupMode; visible: boolean; onClose: () => void }) {
  const { c } = useTheme(); const cat = useCatalogue(); const autos = useApp(s => s.data.autos); const bundlesJson = useApp(s => s.settings.bundlesJson);
  const [found, setFound] = useState<Variant | null>(null); const [msg, setMsg] = useState(''); const [q, setQ] = useState(''); const [cam, setCam] = useState(false);
  useEffect(() => { if (!visible) { setFound(null); setMsg(''); setQ(''); setCam(false); } }, [visible]);
  useEffect(() => { setFound(null); setMsg(''); setQ(''); }, [mode]);

  // scans and picks both go through here; the latest one replaces the result so a stack of items can be checked quickly
  const lookup = (code: string): string | null => {
    const r = resolveScan(code, cat.all); const problem = scanProblem(r, code);
    if (r.kind !== 'variant') { setMsg(problem ?? ''); return null; }
    setFound(r.variant); setMsg(''); setQ(''); return r.variant.productTitle;
  };
  const results = useMemo(() => searchVariants(cat.list, q), [cat.list, q]);
  const title = mode === 'price' ? 'Price check' : 'Stock check';

  return (
    <Sheet visible={visible} onClose={onClose} title={title} full>
      <HidScanner enabled={visible && !cam} onScan={code => void lookup(code)} />
      <CameraScanner visible={cam} onClose={() => setCam(false)} title={`${title}: scan an item`} onScan={code => { const t = lookup(code); if (t) setCam(false); return t ? `Showing ${t}` : null; }} />

      {found ? (mode === 'price' ? <PriceResult v={found} autos={autos} collectionIds={cat.collectionsOfProduct[found.productId] ?? []} bundlesJson={bundlesJson} />
        : <StockResult v={found} siblings={cat.byProduct[found.productId] ?? []} />) : (
        <View style={{ alignItems: 'center', paddingVertical: 14, gap: 6 }}>
          <Ionicons name={mode === 'price' ? 'pricetag-outline' : 'layers-outline'} size={36} color={c.sub} />
          <Txt weight="600">Scan an item</Txt>
          <Txt size={13} sub style={{ textAlign: 'center' }}>{mode === 'price' ? 'Shows the price and any deals. Nothing is added to the cart.' : 'Shows how many are in stock, and the other variations of the same product.'}</Txt>
        </View>)}

      {msg ? <View style={{ backgroundColor: c.bad + '22', borderRadius: 12, padding: 12, marginBottom: 12 }}><Txt color={c.bad} weight="600" style={{ textAlign: 'center' }}>{msg}</Txt></View> : null}

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
        <Btn title="Scan with camera" kind="secondary" small icon="barcode-outline" onPress={() => setCam(true)} style={{ flex: 1 }} />
        {found ? <Btn title="Clear" kind="secondary" small onPress={() => { setFound(null); setMsg(''); }} style={{ flex: 1 }} /> : null}
      </View>
      <Field kind="search" placeholder="Or search by name, SKU or barcode" value={q} onChangeText={t => { setQ(t); setMsg(''); }} style={{ marginTop: 8 }} />
      {q.trim() ? (results.length ? results.map((v, i) => <Row key={v.id} image={v.image ?? null} last={i === results.length - 1} title={v.productTitle + (v.variantTitle ? ` · ${v.variantTitle}` : '')}
        sub={mode === 'stock' && (cat.byProduct[v.productId]?.length ?? 1) > 1 ? `${cat.byProduct[v.productId].length} variations` : [v.sku, v.barcode].filter(Boolean).join(' · ') || undefined}
        right={mode === 'price' ? <Money cents={v.priceCents} weight="600" /> : <Txt size={13} color={TONE_COLOR[stockToneOf(v.stock)]} weight="600">{stockText(v.stock)}</Txt>}
        onPress={() => { setFound(v); setMsg(''); setQ(''); }} />) : <Empty title="No matches" />) : null}
    </Sheet>
  );
}

function PriceResult({ v, autos, collectionIds, bundlesJson }: { v: Variant; autos: ReturnType<typeof useApp.getState>['data']['autos']; collectionIds: string[]; bundlesJson: string }) {
  const { c } = useTheme();
  // bundlesJson is only here so the result refreshes when the deals are edited
  const info = useMemo(() => priceCheck(v, { autos, bundles: bundleConfig(), collectionIds }), [v, autos, collectionIds, bundlesJson]);
  return (
    <View style={{ marginBottom: 12 }}>
      <Card style={{ padding: 16, flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <Thumb uri={v.image} size={72} radius={14} />
        <View style={{ flex: 1 }}>
          <Txt size={16} weight="700" numberOfLines={2}>{v.productTitle}</Txt>
          {v.variantTitle ? <Txt sub>{v.variantTitle}</Txt> : null}
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
            <Money cents={info.priceCents} size={34} weight="700" />
            {info.wasCents ? <Txt sub size={16} style={{ textDecorationLine: 'line-through' }}>{`$${(info.wasCents / 100).toFixed(2)}`}</Txt> : null}
          </View>
          {[v.sku, v.barcode].filter(Boolean).length ? <Txt size={12} sub numberOfLines={1}>{[v.sku, v.barcode].filter(Boolean).join(' · ')}</Txt> : null}
        </View>
      </Card>
      <Txt size={13} color={TONE_COLOR[stockToneOf(v.stock)] ?? c.sub} weight="600" style={{ marginTop: 8, marginLeft: 4 }}>{stockText(v.stock)}</Txt>
      {info.excluded ? <Txt size={13} sub style={{ marginTop: 8, marginLeft: 4 }}>Excluded from discounts.</Txt> : null}
      {info.deals.length ? <View style={{ marginTop: 10 }}>
        <Txt size={13} sub weight="600" style={{ marginBottom: 2, marginLeft: 4 }}>Deals this item can be part of</Txt>
        {info.deals.slice(0, 8).map((d, i, a) => <Row key={`${d.kind}${i}`} icon={d.kind === 'bundle' ? 'gift-outline' : 'pricetag-outline'} title={d.label} sub={d.kind === 'bundle' ? 'Bundle deal' : 'Automatic discount'} last={i === a.length - 1} />)}
        <Txt size={12} sub style={{ marginLeft: 4, marginTop: 4 }}>Minimum quantities and combinations still apply. The cart shows the final price.</Txt>
      </View> : null}
    </View>
  );
}

function StockResult({ v, siblings }: { v: Variant; siblings: Variant[] }) {
  const { c } = useTheme(); const r = useMemo(() => stockCheck(v, siblings), [v, siblings]);
  const me = r.rows[0]; const others = r.rows.slice(1);
  return (
    <View style={{ marginBottom: 12 }}>
      <Card style={{ padding: 16, flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <Thumb uri={v.image} size={72} radius={14} />
        <View style={{ flex: 1 }}>
          <Txt size={16} weight="700" numberOfLines={2}>{r.title}</Txt>
          {v.variantTitle ? <Txt sub>{v.variantTitle}</Txt> : null}
          <Txt size={22} weight="700" color={TONE_COLOR[stockToneOf(me.stock)]} style={{ marginTop: 2 }}>{stockText(me.stock)}</Txt>
        </View>
      </Card>
      {r.single ? <Txt size={13} sub style={{ marginTop: 8, marginLeft: 4 }}>This product has no other variations.</Txt> : <View style={{ marginTop: 12 }}>
        <Txt size={13} sub weight="600" style={{ marginBottom: 2, marginLeft: 4 }}>Other variations ({others.length})</Txt>
        {others.map((o, i) => <Row key={o.variant.id} image={o.variant.image ?? null} last={i === others.length - 1} title={o.variant.variantTitle || 'Default'}
          sub={`$${(o.variant.priceCents / 100).toFixed(2)}`} right={<Txt weight="700" color={TONE_COLOR[stockToneOf(o.stock)] ?? c.sub}>{stockText(o.stock)}</Txt>} />)}
        {r.totalTracked !== null ? <Txt size={13} sub style={{ marginTop: 6, marginLeft: 4 }}>{`${r.totalTracked} in stock across all ${r.rows.length} variations${r.untracked ? ` (${r.untracked} not tracked)` : ''}.`}</Txt> : null}
      </View>}
    </View>
  );
}
