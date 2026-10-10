import React from 'react';
import { ScrollView, View } from 'react-native';
import { Row, Section, Txt, type IconName } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useNav } from '../ui/nav';
import { useUi } from '../ui/uiProfile';
import { useApp, currentStaff } from '../state/store';
import { MORE_EXPLAIN, visibleMoreRows, type MoreRowId } from '../lib/uiMode';

const ROWS: Record<MoreRowId, { icon: IconName; title: string; route?: string }> = {
  orders: { icon: 'receipt-outline', title: 'Orders', route: 'orders' }, items: { icon: 'cube-outline', title: 'Items', route: 'items' },
  customers: { icon: 'people-outline', title: 'Customers', route: 'customers' }, saved: { icon: 'bookmarks-outline', title: 'Saved carts', route: 'saved' },
  giftcards: { icon: 'gift-outline', title: 'Gift cards', route: 'giftcards' }, reports: { icon: 'stats-chart-outline', title: 'Reports', route: 'reports' },
  drawer: { icon: 'cash-outline', title: 'Cash drawer', route: 'drawer' }, staff: { icon: 'id-card-outline', title: 'Staff', route: 'staff' },
  settings: { icon: 'settings-outline', title: 'Settings', route: 'settings' }, diagnostics: { icon: 'medkit-outline', title: 'Support & diagnostics', route: 'diagnostics' }, help: { icon: 'help-circle-outline', title: 'Help', route: 'help' },
  lock: { icon: 'lock-closed-outline', title: 'Lock register' },
};
/** What the row says underneath when explanations are off. */
const PLAIN_SUB: Partial<Record<MoreRowId, string>> = { diagnostics: 'Zeller reader, sync' };

export default function More() {
  const { c } = useTheme(); const nav = useNav(); const ui = useUi(); const s = useApp(st => st.settings); const staff = currentStaff(); const unread = useApp(st => st.pos.notices.filter(n => !n.read).length);
  const lockOn = s.requirePin && s.staff.length > 0;
  const role = lockOn ? staff?.role ?? 'cashier' : 'owner';
  const groups = visibleMoreRows(ui, role, lockOn);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingTop: 54, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.line }}><Txt size={24} weight="700">More</Txt>{staff ? <Txt sub>{staff.name} · {staff.role}</Txt> : null}</View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {groups.map((g, gi) => (
          <Section key={gi}>
            {g.map((id, i) => {
              const r = ROWS[id];
              return <Row key={id} icon={r.icon} title={r.title} sub={ui.explain ? MORE_EXPLAIN[id] : PLAIN_SUB[id]} badge={id === 'diagnostics' && unread ? String(unread) : undefined} last={i === g.length - 1}
                onPress={() => (r.route ? nav.push(r.route) : useApp.getState().set({ unlocked: false, staffId: undefined }))} />;
            })}
          </Section>
        ))}
      </ScrollView>
    </View>
  );
}
