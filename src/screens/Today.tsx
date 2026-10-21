// Location: src/screens/Today.tsx
// The companion's home tab: a glance at the shop. Today's sales and orders (managers and owners only, the same rule as Reports),
// items that are low or out of stock, and anything stuck in the upload queue. Every card opens the full screen behind it.
// Nothing here writes anything, so it needs no PIN.
import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { Btn, Card, Money, Row, Txt } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useNav } from '../ui/nav';
import { useApp } from '../state/store';
import { useRollups } from './Reports';
import { actingRole } from '../lib/adjustPerms';
import { lockRequired, visibleNotices } from '../lib/appMode';
import { derived, periodRange, sumRange } from '../lib/rollup';
import { stockText, stockToneOf } from '../lib/lookup';
import { todayCards } from '../lib/todayCards';

export default function Today() {
  const { c } = useTheme(); const nav = useNav();
  const settings = useApp(s => s.settings); const staffId = useApp(s => s.staffId);
  const variants = useApp(s => s.data.variants); const outbox = useApp(s => s.pos.outbox); const notices = useApp(s => s.pos.notices); const devMode = useApp(s => s.settings.appMode); const devFeatures = useApp(s => s.settings.registerFeatures);
  const { rows, busy, load } = useRollups();
  const [now] = useState(() => new Date());
  const role = actingRole(lockRequired(settings), settings.staff, staffId);
  const cards = useMemo(() => todayCards({ variants: Object.values(variants), outbox, unread: visibleNotices(notices, devMode, devFeatures).filter(n => !n.read).length, role }), [variants, outbox, notices, devMode, devFeatures, role]);
  const totals = useMemo(() => derived(sumRange(rows, periodRange('1D', now))), [rows, now]);
  const orders = useMemo(() => sumRange(rows, periodRange('1D', now)).orders, [rows, now]);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.line, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Txt size={24} weight="700">Today</Txt>
          <Txt size={13} sub>{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</Txt>
        </View>
        <Btn small kind="ghost" title={cards.unread ? `Notices ${cards.unread}` : 'Notices'} icon="notifications-outline" onPress={() => nav.push('notices')} />
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={() => { void load(); }} />} contentContainerStyle={{ padding: 16, gap: 14 }}>
        {cards.money ? (
          <Card style={{ padding: 16 }}>
            <Txt size={13} sub weight="600">Sales today</Txt>
            <Money cents={totals.netSales} size={36} weight="700" />
            <Txt sub>{`${orders} order${orders === 1 ? '' : 's'}${orders ? `, average $${(totals.avgSale / 100).toFixed(2)}` : ''}`}</Txt>
            <Btn kind="ghost" small title="Open reports" onPress={() => nav.push('reports')} style={{ alignSelf: 'flex-start', marginTop: 6 }} />
          </Card>
        ) : null}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <View style={{ padding: 16, paddingBottom: 8 }}>
            <Txt size={13} sub weight="600">Stock</Txt>
            <Txt size={20} weight="700">{cards.lowCount ? `${cards.lowCount} item${cards.lowCount === 1 ? '' : 's'} low, out or oversold` : 'Nothing low on stock'}</Txt>
          </View>
          {cards.low.map((v, i) => <Row key={v.id} last={i === cards.low.length - 1} title={v.productTitle + (v.variantTitle ? ` · ${v.variantTitle}` : '')} right={<Txt size={13} weight="600" color={stockToneOf(v.stock) === 'neg' || stockToneOf(v.stock) === 'out' ? c.bad : c.sub}>{stockText(v.stock)}</Txt>} onPress={() => nav.setTab('inventory')} />)}
        </Card>
        {cards.stuck || cards.queued ? (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {cards.stuck ? <Row icon="warning-outline" danger title={`${cards.stuck} sale${cards.stuck === 1 ? '' : 's'} need attention`} sub="They did not reach Shopify." onPress={() => nav.push('notices')} /> : null}
            {cards.queued ? <Row icon="time-outline" last title={`${cards.queued} sale${cards.queued === 1 ? '' : 's'} queued`} sub="They upload when the connection is back." onPress={() => nav.push('notices')} /> : null}
          </Card>
        ) : null}
        {!cards.money ? <Txt size={13} sub style={{ textAlign: 'center' }}>Sales figures are for managers and owners.</Txt> : null}
      </ScrollView>
    </View>
  );
}
