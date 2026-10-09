import React from 'react';
import { ScrollView, View } from 'react-native';
import { Row, Section, Txt } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useNav } from '../ui/nav';
import { useApp, currentStaff } from '../state/store';

export default function More() {
  const { c } = useTheme(); const nav = useNav(); const s = useApp(st => st.settings); const staff = currentStaff(); const unread = useApp(st => st.pos.notices.filter(n => !n.read).length);
  const role = s.requirePin && s.staff.length ? staff?.role ?? 'cashier' : 'owner'; const mgr = role !== 'cashier';
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingTop: 54, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.line }}><Txt size={24} weight="700">More</Txt>{staff ? <Txt sub>{staff.name} · {staff.role}</Txt> : null}</View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Section>
          <Row icon="receipt-outline" title="Orders" onPress={() => nav.push('orders')} />
          <Row icon="cube-outline" title="Items" onPress={() => nav.push('items')} />
          <Row icon="people-outline" title="Customers" onPress={() => nav.push('customers')} />
          <Row icon="bookmarks-outline" title="Saved carts" onPress={() => nav.push('saved')} />
          <Row icon="gift-outline" title="Gift cards" last onPress={() => nav.push('giftcards')} /></Section>
        <Section>
          {mgr ? <Row icon="stats-chart-outline" title="Reports" onPress={() => nav.push('reports')} /> : null}
          <Row icon="cash-outline" title="Cash drawer" onPress={() => nav.push('drawer')} />
          {mgr ? <Row icon="id-card-outline" title="Staff" onPress={() => nav.push('staff')} /> : null}
          {mgr ? <Row icon="settings-outline" title="Settings" onPress={() => nav.push('settings')} /> : null}
          <Row icon="medkit-outline" title="Support & diagnostics" sub="Zeller reader, sync" badge={unread ? String(unread) : undefined} last onPress={() => nav.push('diagnostics')} /></Section>
        {s.requirePin && s.staff.length ? <Section><Row icon="lock-closed-outline" title="Lock register" last onPress={() => useApp.getState().set({ unlocked: false, staffId: undefined })} /></Section> : null}
      </ScrollView>
    </View>
  );
}
