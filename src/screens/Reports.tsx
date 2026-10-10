import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Share, View } from 'react-native';
import { Btn, Card, Chip, Field, IconBtn, Money, Page, Row, Segmented, Sheet, Txt, alertMsg } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useNav } from '../ui/nav';
import { useApp } from '../state/store';
import * as meta from '../lib/shopify/metaobjects';
import { hasCreds } from '../lib/shopify/client';
import { outstandingBalance } from '../lib/shopify/giftcards';
import { applyRecord, derived, emptyTotals, lastYearRange, parseDay, pctChange, periodRange, previousRange, rollupKey, sumRange, type Period, type Range, type RollupRow, type Totals } from '../lib/rollup';
import { fmt } from '../lib/money';
import { loadSquareRollups } from '../lib/squareHistoryIO';

const PERIODS: Period[] = ['1D', '1W', '1M', '3M', '1Y'];
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseDay(s).getTime());

export function useRollups() {
  const [remote, setRemote] = useState<RollupRow[]>([]); const [busy, setBusy] = useState(false); const outbox = useApp(s => s.pos.outbox); const local = useApp(s => s.pos.rollups); const [square, setSquare] = useState<RollupRow[]>([]);
  useEffect(() => { void loadSquareRollups().then(setSquare); }, []);
  const load = useCallback(async () => {
    if (!hasCreds()) return; setBusy(true);
    try { const rows: RollupRow[] = []; let after: string | null = null;
      for (let i = 0; i < 8; i++) { const r = await meta.list(meta.TYPES.rollup, { first: 100, after }); for (const x of r.rows) { try { rows.push({ registerId: x.f.register_id, date: x.f.date, totals: { ...emptyTotals(), ...JSON.parse(x.f.totals_json) } }); } catch {} } if (!r.next) break; after = r.next; }
      setRemote(rows); } catch (e: any) { if (!/network|connection/i.test(e.message)) alertMsg('Could not load reports', e.message); }
    setBusy(false);
  }, []);
  useEffect(() => { void load(); }, []);
  const rows = useMemo(() => {
    const m = new Map<string, RollupRow>(remote.map(r => [`${r.registerId}|${r.date}`, r]));
    for (const r of square) m.set(`${r.registerId}|${r.date}`, r);
    for (const [k, t] of Object.entries(local)) if (!m.has(k)) { const [registerId, date] = k.split('|'); m.set(k, { registerId, date, totals: t }); }
    for (const o of outbox.filter(x => !x.done.rollup)) { const k = rollupKey(o.sale.registerId, o.sale.ts); const cur = m.get(k); const [registerId, date] = k.split('|'); m.set(k, { registerId, date, totals: applyRecord(cur?.totals ?? emptyTotals(), o.sale) }); }
    return [...m.values()];
  }, [remote, local, outbox, square]);
  return { rows, busy, load };
}

const Trend = ({ now, before }: { now: number; before?: number }) => { const { c } = useTheme(); if (before === undefined) return null; const p = pctChange(now, before); return <Txt size={12} color={p === null ? c.sub : p >= 0 ? c.good : c.bad}>{p === null ? 'new' : `${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(0)}%`}</Txt>; };

export default function Reports() {
  const { c } = useTheme(); const nav = useNav(); const { rows, busy, load } = useRollups(); const myId = useApp(s => s.settings.registerId); const myName = useApp(s => s.settings.registerName);
  const [tab, setTab] = useState<'sales' | 'gift'>('sales'); const [period, setPeriod] = useState<Period | 'custom'>('1W'); const [cmp, setCmp] = useState<'none' | 'prev' | 'year'>('prev'); const [dev, setDev] = useState<string | undefined>();
  const [custom, setCustom] = useState({ from: '', to: '' }); const [filter, setFilter] = useState(false); const [gift, setGift] = useState<{ cards: number; cents: number } | null>(null);
  const range: Range = period === 'custom' && isDay(custom.from) && isDay(custom.to) ? custom : periodRange(period === 'custom' ? '1W' : period);
  const now = useMemo(() => sumRange(rows, range, dev), [rows, range.from, range.to, dev]); const d = derived(now);
  const cr = cmp === 'prev' ? previousRange(range) : cmp === 'year' ? lastYearRange(range) : null; const was = cr ? derived(sumRange(rows, cr, dev)) : null;
  const devices = [...new Set(rows.map(r => r.registerId))];
  useEffect(() => { if (tab === 'gift' && hasCreds()) outstandingBalance().then(setGift).catch(() => {}); }, [tab]);
  const cats = Object.entries(now.byCategory).sort((a, b) => b[1].grossCents - a[1].grossCents).slice(0, 12);

  const exportText = () => { const L = [`Sales ${range.from} → ${range.to}${dev ? ' · ' + dev : ''}`, '', `Gross sales,${(d.grossSales / 100).toFixed(2)}`, `Discounts,${(d.discounts / 100).toFixed(2)}`, `Refunds,${(d.refunds / 100).toFixed(2)}`, `Net sales,${(d.netSales / 100).toFixed(2)}`, `Card fees (est.),${(d.fees / 100).toFixed(2)}`, `COGS,${(d.cogs / 100).toFixed(2)}`, `Gross profit,${(d.grossProfit / 100).toFixed(2)}`, `Orders,${now.orders}`, '', 'Category,Count,Gross', ...Object.entries(now.byCategory).map(([k, v]) => `"${k.replace(/"/g, '""')}",${v.count},${(v.grossCents / 100).toFixed(2)}`)]; void Share.share({ message: L.join('\n'), title: 'Sales report' }); };
  const Stat = ({ label, cents, bold, before, sub }: { label: string; cents: number; bold?: boolean; before?: number; sub?: string }) => <Row title={label} sub={sub} last={false} right={<View style={{ alignItems: 'flex-end' }}><Money cents={cents} weight={bold ? '700' : '500'} size={bold ? 18 : 15} /><Trend now={cents} before={before} /></View>} />;

  return (
    <Page title="Reports" onBack={nav.pop} right={<IconBtn icon="share-outline" label="Share report" onPress={exportText} />} >
      <View style={{ padding: 16 }}><Segmented value={tab} onChange={setTab} options={[{ v: 'sales', label: 'Sales' }, { v: 'gift', label: 'Gift cards' }]} /></View>
      {tab === 'sales' ? <>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {PERIODS.map(p => <Chip key={p} label={p} active={period === p} onPress={() => setPeriod(p)} />)}<Chip label="Custom" active={period === 'custom'} onPress={() => setPeriod('custom')} /><Chip label="Customise" icon="options-outline" onPress={() => setFilter(true)} /></ScrollView>
        {period === 'custom' ? <View style={{ flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 0 }}><View style={{ flex: 1 }}><Field kind="date" label="From (YYYY-MM-DD)" value={custom.from} onChangeText={t => setCustom(s => ({ ...s, from: t }))} /></View><View style={{ flex: 1 }}><Field kind="date" label="To" value={custom.to} onChangeText={t => setCustom(s => ({ ...s, to: t }))} /></View></View> : null}
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}><Segmented value={cmp} onChange={setCmp} options={[{ v: 'none', label: 'No compare' }, { v: 'prev', label: 'Prev period' }, { v: 'year', label: 'Last year' }]} /></View>
        <View style={{ marginTop: 14 }}><Card style={{ marginHorizontal: 16 }}>
          <Stat label="Gross sales" cents={d.grossSales} before={was?.grossSales} /><Stat label="Discounts" cents={-d.discounts} before={was ? -was.discounts : undefined} /><Stat label="Refunds" cents={-d.refunds} before={was ? -was.refunds : undefined} />
          <Stat label="Net sales" cents={d.netSales} bold before={was?.netSales} sub={`${now.orders} order${now.orders === 1 ? '' : 's'} · avg ${fmt(d.avgSale)}`} />
          <Stat label="Total collected" cents={d.totalCollected} before={was?.totalCollected} sub="Net + gift card sales − other refunds" />
          <Stat label="Card fees (est. 1.4%)" cents={-d.fees} before={was ? -was.fees : undefined} sub="Estimated; not taken off Net sales" /><Stat label="Net after fees" cents={d.netAfterFees} before={was?.netAfterFees} />
        </Card></View>
        <Txt size={13} sub weight="600" style={{ margin: 20, marginBottom: 6, textTransform: 'uppercase' }}>Cost of goods</Txt>
        <Card style={{ marginHorizontal: 16 }}><Stat label="COGS" cents={d.cogs} before={was?.cogs} sub="Shown separately — never subtracted from Net sales" /><Stat label="Gross profit" cents={d.grossProfit} bold before={was?.grossProfit} sub="Net sales − COGS" /></Card>
        <Txt size={13} sub weight="600" style={{ margin: 20, marginBottom: 6, textTransform: 'uppercase' }}>Payment types</Txt>
        <Card style={{ marginHorizontal: 16 }}>{Object.entries(now.tenders).length ? Object.entries(now.tenders).map(([k, v]) => <Row key={k} title={k === 'card' ? 'Card' : k === 'cash' ? 'Cash' : k === 'gift_card' ? 'Gift card' : 'Exchange credit'} right={<Money cents={v} />} />) : <Row title="No sales in this period" last />}</Card>
        <Txt size={13} sub weight="600" style={{ margin: 20, marginBottom: 6, textTransform: 'uppercase' }}>Top categories</Txt>
        <Card style={{ marginHorizontal: 16 }}>{cats.length ? cats.map(([k, v], i) => <Row key={k} last={i === cats.length - 1} title={k} sub={`${v.count} sold`} right={<Money cents={v.grossCents} />} />) : <Row title="Nothing yet" last />}</Card>
        <View style={{ padding: 16 }}><Btn title="Cash drawer" kind="secondary" icon="cash-outline" onPress={() => nav.push('drawer')} /><Btn title={busy ? 'Refreshing…' : 'Refresh'} kind="ghost" onPress={() => void load()} /></View>
      </> : (
        <View style={{ marginTop: 4 }}><Card style={{ marginHorizontal: 16 }}>
          <Row title="Sold in period" sub="Gift cards sold" right={<Money cents={now.giftCardSalesCents} />} /><Row title="Redeemed in period" sub="Gift card tenders" right={<Money cents={now.tenders.gift_card ?? 0} />} />
          <Row title="Outstanding (all active cards)" sub={gift ? `${gift.cards} cards` : 'Loading…'} right={<Money cents={gift?.cents ?? 0} weight="700" />} last /></Card>
          <View style={{ padding: 16 }}><Btn title="Gift cards" kind="secondary" onPress={() => nav.push('giftcards')} /></View></View>)}
      <Sheet visible={filter} onClose={() => setFilter(false)} title="Customise">
        <Txt size={13} sub weight="600" style={{ marginBottom: 6 }}>Device</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Chip label="All devices" active={!dev} onPress={() => setDev(undefined)} />{devices.map(id => <Chip key={id} label={id === myId ? `${myName} (this)` : id === 'square' ? 'Square (old)' : id} active={dev === id} onPress={() => setDev(id)} />)}</View>
        <Btn title="Done" onPress={() => setFilter(false)} style={{ marginTop: 16 }} />
      </Sheet>
      <RefreshControl refreshing={false} />
    </Page>
  );
}
void (null as unknown as Totals);
