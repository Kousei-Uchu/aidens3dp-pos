import React from 'react';
import { ScrollView, View } from 'react-native';
import { HelpButton, Row, Section, Txt, alertMsg, type IconName } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useNav } from '../ui/nav';
import { useUi } from '../ui/uiProfile';
import { useApp, currentStaff } from '../state/store';
import { useDemo } from '../state/demoSession';
import { SPOT } from '../lib/trainingSpots';
import { actingRole } from '../lib/adjustPerms';
import { MORE_EXPLAIN, visibleMoreRows, type MoreRowId } from '../lib/uiMode';

const ROWS: Record<MoreRowId, { icon: IconName; title: string; route?: string }> = {
  orders: { icon: 'receipt-outline', title: 'Orders', route: 'orders' }, items: { icon: 'cube-outline', title: 'Items', route: 'items' },
  customers: { icon: 'people-outline', title: 'Customers', route: 'customers' }, saved: { icon: 'bookmarks-outline', title: 'Saved carts', route: 'saved' },
  giftcards: { icon: 'gift-outline', title: 'Gift cards', route: 'giftcards' }, reports: { icon: 'stats-chart-outline', title: 'Reports', route: 'reports' },
  drawer: { icon: 'cash-outline', title: 'Cash drawer', route: 'drawer' }, staff: { icon: 'id-card-outline', title: 'Staff', route: 'staff' },
  settings: { icon: 'settings-outline', title: 'Settings', route: 'settings' }, diagnostics: { icon: 'medkit-outline', title: 'Support & diagnostics', route: 'diagnostics' }, help: { icon: 'help-circle-outline', title: 'Help', route: 'help' }, training: { icon: 'school-outline', title: 'Training', route: 'training' },
  lock: { icon: 'lock-closed-outline', title: 'Lock register' },
};
/** The spot each row carries, so training and the assistant's guide can point at it. The lock row has none. */
const MORE_SPOT: Partial<Record<MoreRowId, string>> = {
  orders: SPOT.moreOrders, items: SPOT.moreItems, customers: SPOT.moreCustomers, saved: SPOT.moreSaved, giftcards: SPOT.moreGiftcards, reports: SPOT.moreReports,
  drawer: SPOT.moreDrawer, staff: SPOT.moreStaff, settings: SPOT.moreSettings, diagnostics: SPOT.moreDiagnostics, help: SPOT.moreHelp, training: SPOT.moreTraining,
};
/** What the row says underneath when explanations are off. */
const PLAIN_SUB: Partial<Record<MoreRowId, string>> = { diagnostics: 'Zeller reader, sync' };

export default function More() {
  const { c } = useTheme(); const nav = useNav(); const ui = useUi(); const s = useApp(st => st.settings); const staff = currentStaff(); const unread = useApp(st => st.pos.notices.filter(n => !n.read).length);
  const lockOn = s.requirePin && s.staff.length > 0;
  const role = actingRole(s.requirePin, s.staff, staff?.id);
  const groups = visibleMoreRows(ui, role, lockOn);
  const demo = useDemo(st => st.active);
  const openDemo = async () => {
    const msg = await useDemo.getState().enter();
    if (msg) { alertMsg('Demo cannot start yet', msg); return; }
    nav.push('demoHome');
  };
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 8, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.line }}>
        <View style={{ flex: 1 }}><Txt size={24} weight="700">More</Txt>{staff ? <Txt sub>{staff.name} · {staff.role}</Txt> : null}</View>
        <HelpButton id="concepts/roles" label="Role and access help" />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Demo mode (F8) is always here, whatever display mode is on: it is how someone shows the till to a new person. */}
        <Section>
          {demo
            ? <Row icon="flask-outline" title="Leave demo mode" sub="Back to your own till, exactly as you left it." last onPress={() => { useDemo.getState().leave(); nav.reset(); }} />
            : <Row icon="flask-outline" title="Demo mode" sub={ui.explain ? 'Try every feature on made-up data. Nothing real is touched.' : 'Made-up data'} last onPress={() => { void openDemo(); }} />}
        </Section>
        {groups.map((g, gi) => (
          <Section key={gi}>
            {g.map((id, i) => {
              const r = ROWS[id];
              return <Row key={id} icon={r.icon} title={r.title} sub={ui.explain ? MORE_EXPLAIN[id] : PLAIN_SUB[id]} badge={id === 'diagnostics' && unread ? String(unread) : undefined} spot={MORE_SPOT[id]} last={i === g.length - 1}
                onPress={() => (r.route ? nav.push(r.route) : useApp.getState().set({ unlocked: false, staffId: undefined }))} />;
            })}
          </Section>
        ))}
      </ScrollView>
    </View>
  );
}
