import React from 'react';
import { FlatList, View } from 'react-native';
import { Btn, Empty, Row, Txt, Money } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useNav } from '../ui/nav';
import { useApp } from '../state/store';
import { retryBlocked } from '../lib/sync';

const ICON: Record<string, any> = { sync: 'cloud-offline-outline', queue: 'time-outline', stock: 'alert-circle-outline', reader: 'card-outline', refund: 'return-down-back-outline', pass: 'wallet-outline', info: 'information-circle-outline' };
export default function Notifications() {
  const { c } = useTheme(); const nav = useNav(); const list = useApp(s => s.pos.notices); const outbox = useApp(s => s.pos.outbox); const patchPos = useApp(s => s.patchPos);
  const stuck = outbox.filter(o => o.blocked);
  // live low/negative stock summary, derived – not stored
  const variants = useApp(s => s.data.variants); const neg = Object.values(variants).filter(v => (v.stock ?? 0) < 0).length; const low = Object.values(variants).filter(v => v.stock !== null && v.stock >= 0 && v.stock <= 2 && v.active).length;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingTop: 54, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.line, flexDirection: 'row', alignItems: 'center' }}>
        <Txt size={24} weight="700" style={{ flex: 1 }}>Notifications</Txt><Btn small kind="ghost" title="Clear all" onPress={() => patchPos({ notices: [] })} /></View>
      <FlatList data={list} keyExtractor={n => n.id} ListEmptyComponent={<Empty icon="notifications-outline" title="All clear" sub="Sync failures, queued sales, stock and reader issues show up here." />}
        ListHeaderComponent={<View>
          {stuck.map(o => <Row key={o.id} icon="warning-outline" danger title={`Sale ${o.sale.orderName ?? o.id.slice(0, 8)} needs attention`} sub={o.error} right={<Btn small title="Retry" onPress={() => retryBlocked(o.id)} />} />)}
          {outbox.length - stuck.length > 0 ? <Row icon="time-outline" title={`${outbox.length - stuck.length} sale(s) queued`} sub="Uploads when the connection is back." right={<Money cents={outbox.reduce((s, o) => s + o.sale.netCents, 0)} />} /> : null}
          {low > 0 ? <Row icon="alert-circle-outline" title={`${low} item(s) low on stock (2 or fewer)`} onPress={() => nav.setTab('inventory')} /> : null}
          {neg > 0 ? <Row icon="alert-circle-outline" title={`${neg} item(s) with negative stock`} onPress={() => nav.setTab('inventory')} /> : null}</View>}
        renderItem={({ item: n }) => <Row icon={ICON[n.kind] ?? 'information-circle-outline'} title={n.title} sub={[n.body, new Date(n.ts).toLocaleString()].filter(Boolean).join('\n')}
          onPress={() => { patchPos({ notices: list.map(x => (x.id === n.id ? { ...x, read: true } : x)) }); if (n.route) nav.go(n.route); }} right={n.read ? undefined : <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.bad }} />} />} />
    </View>
  );
}
